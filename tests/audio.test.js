import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, AUDIO_DEFAULTS, AUDIO_LIMITS } from '../src/audio.js';

class AudioParamFake {
  constructor(value=0){this.value=value;this.events=[];}
  setValueAtTime(value,time){assert.ok(Number.isFinite(value)&&Number.isFinite(time));this.value=value;this.events.push({kind:'set',value,time});}
  setTargetAtTime(value,time,tau){assert.ok(Number.isFinite(value)&&Number.isFinite(time)&&tau>0);this.value=value;this.events.push({kind:'target',value,time,tau});}
  exponentialRampToValueAtTime(value,time){assert.ok(value>0&&Number.isFinite(value)&&Number.isFinite(time));this.value=value;this.events.push({kind:'ramp',value,time});}
  cancelScheduledValues(time){assert.ok(Number.isFinite(time));this.events.push({kind:'cancel',time});}
}
class NodeFake {
  constructor(ctx,type){this.ctx=ctx;this.kind=type;this.connections=new Set();this.disconnections=0;ctx.nodes.push(this);}
  connect(node){assert.ok(node);this.connections.add(node);return node;}
  disconnect(){this.connections.clear();this.disconnections++;}
}
class SourceFake extends NodeFake {
  constructor(ctx,type){super(ctx,type);this.frequency=new AudioParamFake();this.startTime=null;this.stopTime=Infinity;this.onended=null;this.ended=false;ctx.sources.push(this);}
  start(time=0){assert.equal(this.startTime,null,'Sources start once.');assert.ok(Number.isFinite(time));if(this.kind==='bufferSource')assert.ok(this.buffer);this.startTime=time;}
  stop(time=this.ctx.currentTime){assert.ok(Number.isFinite(time));this.stopTime=time;}
}
class ContextFake {
  constructor({sampleRate=48000,panner=true}={}){this.currentTime=0;this.sampleRate=sampleRate;this.state='suspended';this.nodes=[];this.sources=[];this.buffers=[];this.resumes=0;this.suspends=0;this.closes=0;this.destination=new NodeFake(this,'destination');if(!panner)this.createStereoPanner=undefined;}
  createGain(){const node=new NodeFake(this,'gain');node.gain=new AudioParamFake(1);return node;}
  createBiquadFilter(){const node=new NodeFake(this,'filter');node.frequency=new AudioParamFake();return node;}
  createDynamicsCompressor(){const node=new NodeFake(this,'compressor');for(const key of ['threshold','knee','ratio','attack','release'])node[key]=new AudioParamFake();return node;}
  createDelay(maximum){assert.ok(maximum<=1);const node=new NodeFake(this,'delay');node.delayTime=new AudioParamFake();return node;}
  createStereoPanner(){const node=new NodeFake(this,'panner');node.pan=new AudioParamFake();return node;}
  createOscillator(){return new SourceFake(this,'oscillator');}
  createBufferSource(){return new SourceFake(this,'bufferSource');}
  createBuffer(channels,length,sampleRate){assert.equal(channels,1);assert.ok(length>0&&sampleRate>0);const data=new Float32Array(length),buffer={length,sampleRate,duration:length/sampleRate,getChannelData:channel=>{assert.equal(channel,0);return data;}};this.buffers.push(buffer);return buffer;}
  resume(){this.resumes++;this.state='running';return Promise.resolve();}
  suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
  close(){this.closes++;this.state='closed';return Promise.resolve();}
  advance(seconds){this.currentTime+=seconds;for(const source of this.sources)if(!source.ended&&source.stopTime<=this.currentTime){source.ended=true;source.onended?.();}}
}
class DocumentFake {
  constructor(){this.hidden=false;this.listeners=new Set();}
  addEventListener(name,fn){assert.equal(name,'visibilitychange');this.listeners.add(fn);}
  removeEventListener(name,fn){assert.equal(name,'visibilitychange');this.listeners.delete(fn);}
  visibility(hidden){this.hidden=hidden;for(const listener of this.listeners)listener();}
}
function fixture(options={}) {
  const game={started:true,paused:false,dead:false,player:{classId:'guardian',x:0,y:0},settings:{sound:true},world:{enemies:[]},regionAt:()=>({id:'daemmerhain'})};
  const ctx=new ContextFake(options),document=new DocumentFake(),timers=new Map();let next=0;
  const audio=new GameAudio(game,{contextFactory:()=>ctx,document,setInterval:(fn,period)=>{assert.equal(period,250);const id=++next;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),random:()=>.6});
  const tick=seconds=>{ctx.advance(seconds);for(const callback of [...timers.values()])callback();};return {game,ctx,document,timers,audio,tick};
}
const peak=voice=>voice.nodes.find(node=>node.kind==='gain').gain.events.find(event=>event.kind==='ramp').value;
const frequencies=ctx=>ctx.sources.filter(source=>source.kind==='oscillator').map(source=>source.frequency.events.find(event=>event.kind==='set').value);

test('audio unlock builds independent buses, a soft compressor and a bounded damped echo exactly once',()=>{
  const {audio,ctx,timers}=fixture();assert.equal(audio.play('attack'),false);assert.equal(ctx.sources.length,0);assert.equal(audio.unlock(),true);
  const graph=audio.graph;assert.ok(graph.music.connections.has(graph.compressor));assert.ok(graph.effects.connections.has(graph.compressor));assert.ok(graph.compressor.connections.has(graph.master));assert.ok(graph.master.connections.has(ctx.destination));
  assert.equal(graph.master.gain.value,AUDIO_DEFAULTS.masterVolume);assert.equal(graph.music.gain.value,AUDIO_DEFAULTS.musicVolume);assert.equal(graph.effects.gain.value,AUDIO_DEFAULTS.effectsVolume);
  assert.ok(graph.compressor.knee.value>0&&graph.compressor.ratio.value>=4&&graph.compressor.threshold.value<0);assert.ok(graph.feedback.gain.value>0&&graph.feedback.gain.value<.3);assert.ok(graph.delay.delayTime.value<.6);
  const nodes=ctx.nodes.length;audio.unlock();audio.unlock();assert.equal(ctx.nodes.length,nodes);assert.equal(timers.size,1);audio.dispose();
});

test('default browser timers preserve their required Window receiver',()=>{
  const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;let scheduled=0,cleared=0;
  globalThis.setInterval=function(){assert.equal(this,globalThis);scheduled++;return 42;};
  globalThis.clearInterval=function(id){assert.equal(this,globalThis);assert.equal(id,42);cleared++;};
  try {
    const ctx=new ContextFake(),audio=new GameAudio({started:true,settings:{sound:true}},{contextFactory:()=>ctx,document:new DocumentFake()});
    assert.equal(audio.unlock(),true);assert.equal(scheduled,1);audio.dispose();assert.equal(cleared,1);
  } finally {globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
});

test('music and effect volumes mute independently and all settings clamp to finite zero-to-one values',()=>{
  const {audio,game}=fixture();audio.unlock();audio.setVolumes({masterVolume:.5,musicVolume:1,effectsVolume:0});audio.ambient();
  assert.ok(audio.getStats().musicVoices>0);assert.equal(audio.play('attack'),false);assert.equal(audio.getStats().effectsVoices,0);assert.equal(audio.getStats().ambienceVoices,0);
  audio.setVolumes({musicVolume:0,effectsVolume:.8});assert.equal(audio.getStats().musicVoices,0);assert.equal(audio.play('attack'),true);assert.ok(audio.getStats().effectsVoices>0);
  audio.setVolumes({masterVolume:2,musicVolume:-5,effectsVolume:NaN});assert.equal(game.settings.masterVolume,1);assert.equal(game.settings.musicVolume,0);assert.equal(game.settings.effectsVolume,AUDIO_DEFAULTS.effectsVolume);
  audio.setVolumes({masterVolume:0});assert.equal(audio.getStats().voices,0);assert.equal(audio.getStats().timers,0);assert.equal(audio.play('quest'),false);audio.dispose();
});

test('all original event strings remain compatible while eight classes synthesize distinct attacks and spells',()=>{
  const {audio,ctx,game}=fixture();audio.unlock();
  for(const event of ['attack','hit','hurt','dash','spell','nova','heal','gather','craft','loot','quest','level']){ctx.advance(2);assert.equal(audio.play(event),true,event);}
  assert.equal(audio.play('unsupported-event'),false);
  const attacks=new Set(),spells=new Set();
  for(const classId of ['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder']) {
    game.player.classId=classId;ctx.advance(2);const before=ctx.sources.length;audio.play('attack');attacks.add(frequencies({sources:ctx.sources.slice(before)}).join(','));
    ctx.advance(2);const spellStart=ctx.sources.length;audio.play('spell');spells.add(frequencies({sources:ctx.sources.slice(spellStart)}).join(','));
  }
  assert.equal(attacks.size,8);assert.equal(spells.size,8);audio.dispose();
});

test('distant sound sources pan, lose volume and become muffled without direct destination bypasses',()=>{
  const {audio,ctx}=fixture();audio.unlock();audio.tone(300,.2,'sine',.07,0,{x:0,y:0});const near=[...audio.voices].at(-1);
  audio.tone(300,.2,'sine',.07,0,{x:700,y:0});const far=[...audio.voices].at(-1);
  assert.ok(peak(far)<peak(near)*.4);assert.ok(far.nodes.find(node=>node.kind==='filter').frequency.value<near.nodes.find(node=>node.kind==='filter').frequency.value);
  assert.ok(far.nodes.find(node=>node.kind==='panner').pan.value>0);audio.tone(300,.2,'sine',.07,0,{x:-700,y:0});assert.ok([...audio.voices].at(-1).nodes.find(node=>node.kind==='panner').pan.value<0);
  for(const source of ctx.sources)assert.equal(source.connections.has(ctx.destination),false);audio.dispose();
});

test('region, dungeon, boss and PvP music use different layers and preserve explicit scene context',()=>{
  const {audio,ctx}=fixture();audio.unlock();const roots=[];
  for(const regionId of ['daemmerhain','frostgrat','glutoede','mondbruch']) {ctx.advance(6);audio.update({regionId});audio.ambient();roots.push([...audio.voices].find(v=>v.bus==='music').source.frequency.events.find(e=>e.kind==='set').value);}
  assert.equal(new Set(roots).size,4);
  ctx.advance(6);audio.update({regionId:'frostgrat',dungeonId:'frostkathedrale'});audio.ambient();assert.equal(audio.graph.airFilter.frequency.value,1000);const dungeonBeat=audio.nextMusicAt-ctx.currentTime;
  ctx.advance(6);audio.update({regionId:'frostgrat',dungeonId:'frostkathedrale',boss:true});audio.ambient();assert.equal(audio.getStats().scene.boss,true);assert.ok(audio.nextMusicAt-ctx.currentTime<dungeonBeat);assert.ok(audio.getStats().effectsVoices>0,'A boss entrance has an identifiable signal.');
  ctx.advance(6);audio.update({pvp:true});audio.ambient();assert.equal(audio.getStats().scene.pvp,true);assert.ok(audio.nextMusicAt-ctx.currentTime<.6);audio.dispose();
});

test('rare finds, bosses and PvP outcomes have separate scheduled signatures without JavaScript timeout queues',()=>{
  const {audio,ctx,timers}=fixture();audio.unlock();const signatures=new Set();
  for(const event of ['rare_loot','boss_start','boss_defeat','pvp_start','pvp_hit','pvp_victory','pvp_defeat']) {ctx.advance(3);const index=ctx.sources.length;assert.equal(audio.play(event),true);signatures.add(frequencies({sources:ctx.sources.slice(index)}).join(','));}
  assert.equal(signatures.size,7);ctx.advance(3);assert.equal(audio.play('loot',{rarity:'legendary'}),true);assert.ok([...audio.voices].some(v=>v.source.startTime>ctx.currentTime));assert.equal(timers.size,1);audio.dispose();
});

test('combat spam obeys voice, buffer and timer budgets, reuses noise and cleans ended nodes',()=>{
  const {audio,ctx,tick,timers}=fixture({sampleRate:192000});audio.unlock();
  for(let index=0;index<300;index++) {
    audio.tone(100+index,5,'triangle',.15,0,{bus:'music'});audio.noise(.8,.15,{color:['white','wind','water','ember'][index%4]});audio.play('attack');
    const stats=audio.getStats();assert.ok(stats.voices<=AUDIO_LIMITS.voices&&stats.musicVoices<=AUDIO_LIMITS.musicVoices&&stats.effectsVoices<=AUDIO_LIMITS.effectsVoices&&stats.ambienceVoices<=AUDIO_LIMITS.ambienceVoices);
  }
  assert.equal(ctx.buffers.length,4);assert.ok(audio.getStats().bufferSamples<=AUDIO_LIMITS.bufferSamples);assert.equal(timers.size,1);
  const sources=ctx.sources.length;for(let index=0;index<100;index++)assert.equal(audio.play('attack'),false);assert.equal(ctx.sources.length,sources,'Per-event cooldowns stop same-frame allocation storms.');
  audio.setVolumes({musicVolume:0,effectsVolume:0});tick(6);audio.syncSettings();assert.equal(audio.getStats().voices,0);assert.ok(ctx.sources.every(source=>source.disconnections>0));audio.dispose();
});

test('a hidden tab immediately stops active and future phrase voices and resumes only when allowed',async()=>{
  const {audio,ctx,document,timers}=fixture();audio.unlock();audio.play('level');const voices=[...audio.voices];assert.ok(voices.some(v=>v.source.startTime>ctx.currentTime));
  document.visibility(true);assert.equal(audio.getStats().voices,0);assert.equal(timers.size,0);assert.equal(ctx.state,'suspended');assert.equal(audio.graph.master.gain.value,0);
  const sources=ctx.sources.length;assert.equal(audio.play('spell'),false);assert.equal(audio.tone(300),false);audio.ambient();assert.equal(ctx.sources.length,sources);assert.ok(voices.every(v=>v.source.stopTime===ctx.currentTime&&v.nodes.every(n=>n.disconnections>0)));
  document.visibility(false);await Promise.resolve();await Promise.resolve();assert.equal(ctx.state,'running');assert.equal(timers.size,1);
  audio.pause();document.visibility(true);document.visibility(false);assert.equal(ctx.state,'suspended');assert.equal(timers.size,0);assert.equal(audio.resume(),true);audio.dispose();
});

test('disabled sound silences tails, pause is reversible and dispose reliably removes every resource',async()=>{
  const {audio,ctx,game,document,timers}=fixture();audio.unlock();audio.play('spell');audio.ambient();
  game.settings.sound=false;audio.syncSettings();assert.equal(audio.getStats().voices,0);assert.equal(audio.graph.master.gain.value,0);assert.equal(timers.size,0);assert.equal(audio.play('attack'),false);
  game.settings.sound=true;audio.syncSettings();await Promise.resolve();audio.pause();assert.equal(audio.play('quest'),false);audio.resume();audio.play('heal');
  const graphNodes=Object.values(audio.graph);audio.dispose();audio.dispose();await Promise.resolve();await Promise.resolve();
  assert.equal(ctx.closes,1);assert.equal(ctx.state,'closed');assert.equal(timers.size,0);assert.equal(document.listeners.size,0);assert.equal(audio.getStats().voices,0);assert.equal(audio.getStats().buffers,0);assert.ok(graphNodes.every(node=>node.connections.size===0));
  assert.equal(audio.unlock(),false);assert.equal(audio.resume(),false);assert.equal(audio.play('loot'),false);assert.equal(audio.update({boss:true}),false);
});

test('unsupported audio and older contexts without stereo panners fail safely or use a valid mono graph',()=>{
  const document=new DocumentFake(),audio=new GameAudio({settings:{sound:true}},{contextFactory:()=>null,document});assert.equal(audio.unlock(),false);assert.equal(audio.play('level'),false);audio.dispose();assert.equal(document.listeners.size,0);
  const failed=new ContextFake();failed.createDynamicsCompressor=()=>{throw new Error('unsupported');};const broken=new GameAudio({settings:{}},{contextFactory:()=>failed,document});assert.equal(broken.unlock(),false);assert.equal(failed.closes,1);broken.dispose();
  const fixtureMono=fixture({panner:false});assert.equal(fixtureMono.audio.unlock(),true);assert.equal(fixtureMono.audio.play('attack'),true);fixtureMono.audio.dispose();
});
