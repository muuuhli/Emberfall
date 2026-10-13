// Original procedural synthesis. No sample downloads, external music or worklets.
export const AUDIO_DEFAULTS=Object.freeze({masterVolume:.75,musicVolume:.45,effectsVolume:.8});
export const AUDIO_LIMITS=Object.freeze({voices:24,musicVoices:8,effectsVoices:12,ambienceVoices:4,buffers:4,bufferSamples:131072,timers:1});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const volume=(value,fallback)=>Number.isFinite(value)?clamp(value,0,1):fallback;
const WAVE_TYPES=new Set(['sine','triangle','sawtooth','square']);
const SEQUENCE=[0,2,4,1,3,2,5,1,0,4,3,1,5,2,1,4];
const MUSIC={
  hollow:{root:65.41,scale:[1,1.2,1.5,1.6,1.8,2],beat:1.2,cutoff:1500,air:'wind',pulse:0},
  frost:{root:73.42,scale:[1,1.067,1.333,1.414,1.6,2],beat:1.35,cutoff:2300,air:'water',pulse:0},
  marsh:{root:55,scale:[1,1.067,1.2,1.333,1.6,1.8],beat:1.3,cutoff:1050,air:'wind',pulse:0},
  fire:{root:61.74,scale:[1,1.2,1.333,1.414,1.5,1.8],beat:1.05,cutoff:1250,air:'ember',pulse:.01},
  frontier:{root:69.3,scale:[1,1.2,1.333,1.5,1.6,2],beat:1.15,cutoff:1500,air:'wind',pulse:0},
  coast:{root:58.27,scale:[1,1.125,1.2,1.5,1.6,1.8],beat:1.4,cutoff:1700,air:'water',pulse:0},
  thorns:{root:65.41,scale:[1,1.067,1.2,1.414,1.5,1.8],beat:1.1,cutoff:1050,air:'wind',pulse:.007},
  ruins:{root:51.91,scale:[1,1.067,1.333,1.414,1.5,2],beat:1.3,cutoff:1100,air:'white',pulse:.008},
  moon:{root:77.78,scale:[1,1.125,1.2,1.414,1.6,2],beat:1.45,cutoff:2500,air:'wind',pulse:0},
  sands:{root:55,scale:[1,1.067,1.333,1.5,1.6,1.889],beat:1.2,cutoff:1400,air:'wind',pulse:.006},
  dream:{root:69.3,scale:[1,1.067,1.2,1.414,1.6,1.889],beat:1.45,cutoff:1900,air:'water',pulse:0},
  war:{root:49,scale:[1,1.2,1.333,1.414,1.5,1.8],beat:.85,cutoff:1300,air:'ember',pulse:.015},
  stars:{root:82.41,scale:[1,1.125,1.333,1.414,1.6,2],beat:1.35,cutoff:2800,air:'water',pulse:0},
  rift:{root:46.25,scale:[1,1.067,1.2,1.414,1.5,1.889],beat:.95,cutoff:1200,air:'wind',pulse:.01},
  dungeon:{root:51.91,scale:[1,1.067,1.2,1.333,1.414,1.8],beat:1.1,cutoff:1000,air:'white',pulse:.008},
  boss:{root:49,scale:[1,1.067,1.2,1.414,1.5,1.8],beat:.6,cutoff:1700,air:'ember',pulse:.025},
  pvp:{root:65.41,scale:[1,1.2,1.333,1.414,1.5,1.8],beat:.52,cutoff:1800,air:'white',pulse:.019},
};
const REGION_MUSIC={daemmerhain:'hollow',frostgrat:'frost',aschenmoor:'marsh',glutoede:'fire',sonnensteppe:'frontier',jadeauen:'thorns',sturmkueste:'coast',dornwildnis:'thorns',obsidianpass:'ruins',mondbruch:'moon',permafrost:'frost',sandsenke:'sands',traumsenke:'dream',blutmark:'war',sternensund:'stars',nexusriss:'rift'};
const CLASS_SOUND={
  guardian:{attack:[96,'triangle',-38,'white',1400],spell:[132,'triangle',64,'white',1200]},
  paladin:{attack:[168,'triangle',-84,'white',2400],spell:[261.63,'sine',130.81,'white',2600]},
  ranger:{attack:[220,'triangle',220,'white',6500],spell:[493.88,'sine',-90,'wind',5200]},
  nightblade:{attack:[176,'sawtooth',-72,'white',7800],spell:[224,'triangle',-96,'wind',3200]},
  flamecaller:{attack:[162,'sawtooth',-85,'ember',1800],spell:[146.83,'sawtooth',340,'ember',1800]},
  frostweaver:{attack:[628,'sine',-96,'water',6500],spell:[784,'sine',392,'water',5600]},
  druid:{attack:[290,'triangle',-120,'wind',1300],spell:[329.63,'sine',-68,'wind',2200]},
  shadowbinder:{attack:[82,'sawtooth',-28,'wind',800],spell:[73.42,'triangle',196,'wind',1100]},
};
const COOLDOWNS={attack:.07,hit:.055,hurt:.14,dash:.12,spell:.12,nova:.3,heal:.12,gather:.08,craft:.18,loot:.15,rare_loot:.65,quest:.4,level:.8,boss_start:.6,boss_defeat:1,pvp_start:.8,pvp_hit:.1,pvp_victory:1,pvp_defeat:1};

export class GameAudio {
  constructor(game,{contextFactory,document:documentRef=globalThis.document,setInterval:intervalFn=globalThis.setInterval?.bind(globalThis),clearInterval:clearFn=globalThis.clearInterval?.bind(globalThis),random=Math.random}={}) {
    this.game=game;this.ctx=null;this.musicTimer=null;this.note=0;this.graph=null;
    this.contextFactory=contextFactory||(()=>{const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext||globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;return Constructor?new Constructor():null;});
    this.document=documentRef;this.intervalFn=intervalFn;this.clearFn=clearFn;this.random=random;
    this.voices=new Set();this.buffers=new Map();this.bufferSamples=0;this.lastEvents=new Map();
    this.scene={};this.sceneInput={};this.sceneKey='';this.nextMusicAt=0;this.disposed=false;this.unlocked=false;this.manualPaused=false;this.resumePending=false;
    this.onVisibility=()=>{if(this.document?.hidden)this._stopPlayback();else this.syncSettings();};
    this.document?.addEventListener?.('visibilitychange',this.onVisibility);
  }
  _settings() {const settings=this.game?.settings||{};return {sound:settings.sound!==false,...Object.fromEntries(Object.entries(AUDIO_DEFAULTS).map(([key,fallback])=>[key,volume(settings[key],fallback)]))};}
  _allowed() {const settings=this._settings();return !!this.ctx&&this.unlocked&&!this.disposed&&!this.manualPaused&&!this.document?.hidden&&settings.sound&&settings.masterVolume>0;}
  _musicAllowed() {const settings=this._settings();return this._allowed()&&this.game?.started&&!this.game?.paused&&!this.game?.dead&&(settings.musicVolume>0||settings.effectsVolume>0);}
  _param(param,value,time,soft=true) {if(!param)return;param.cancelScheduledValues?.(time);if(soft&&param.setTargetAtTime)param.setTargetAtTime(value,time,.025);else param.setValueAtTime(value,time);}
  _buildGraph() {
    const ctx=this.ctx,master=ctx.createGain(),music=ctx.createGain(),effects=ctx.createGain(),ambience=ctx.createGain(),airFilter=ctx.createBiquadFilter(),compressor=ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18,ctx.currentTime);compressor.knee.setValueAtTime(18,ctx.currentTime);compressor.ratio.setValueAtTime(8,ctx.currentTime);compressor.attack.setValueAtTime(.004,ctx.currentTime);compressor.release.setValueAtTime(.24,ctx.currentTime);
    airFilter.type='lowpass';airFilter.frequency.setValueAtTime(1200,ctx.currentTime);ambience.gain.setValueAtTime(.45,ctx.currentTime);
    music.connect(compressor);effects.connect(compressor);ambience.connect(airFilter);airFilter.connect(effects);compressor.connect(master);master.connect(ctx.destination);
    const room=ctx.createGain(),delay=ctx.createDelay(.6),damping=ctx.createBiquadFilter(),feedback=ctx.createGain();
    delay.delayTime.setValueAtTime(.23,ctx.currentTime);damping.type='lowpass';damping.frequency.setValueAtTime(950,ctx.currentTime);feedback.gain.setValueAtTime(.12,ctx.currentTime);
    room.connect(delay);delay.connect(damping);damping.connect(effects);damping.connect(feedback);feedback.connect(delay);
    this.graph={master,music,effects,ambience,airFilter,compressor,room,delay,damping,feedback};this._param(master.gain,0,ctx.currentTime,false);
  }
  unlock() {
    if(this.disposed)return false;
    if(!this.ctx) {try {this.ctx=this.contextFactory();if(!this.ctx)return false;this._buildGraph();}catch {const failed=this.ctx;this.ctx=null;this.graph=null;try {Promise.resolve(failed?.close?.()).catch(()=>{});}catch {}return false;}}
    this.unlocked=true;this.syncSettings();return true;
  }
  _resumeContext() {
    if(!this._allowed()||this.ctx.state!=='suspended'||this.resumePending)return;
    this.resumePending=true;
    try {Promise.resolve(this.ctx.resume()).then(()=>{this.resumePending=false;if(this._allowed()){if(this.ctx.state==='suspended')this._resumeContext();else this._startScheduler();}else this._stopPlayback();}).catch(()=>{this.resumePending=false;});}catch {this.resumePending=false;}
  }
  _startScheduler() {
    if(this.musicTimer!==null||!this._musicAllowed()||this.ctx.state!=='running')return;
    this.musicTimer=this.intervalFn(()=>this.ambient(),250);this.nextMusicAt=this.ctx.currentTime;
  }
  _stopScheduler() {if(this.musicTimer!==null){this.clearFn(this.musicTimer);this.musicTimer=null;}}
  syncSettings() {
    if(!this.ctx||this.disposed)return false;
    const settings=this._settings(),time=this.ctx.currentTime,allowed=this._allowed();
    this._param(this.graph.master.gain,allowed?settings.masterVolume:0,time,allowed);
    this._param(this.graph.music.gain,settings.musicVolume,time);this._param(this.graph.effects.gain,settings.effectsVolume,time);
    if(!allowed){this._stopPlayback();return false;}
    this._resumeContext();if(this._musicAllowed())this._startScheduler();else {this._stopScheduler();this._stopBus('music');this._stopBus('ambience');}
    if(settings.musicVolume===0)this._stopBus('music');if(settings.effectsVolume===0){this._stopBus('effects');this._stopBus('ambience');}
    this._prune();return true;
  }
  setVolumes(changes={}) {
    this.game.settings??={};for(const [key,fallback] of Object.entries(AUDIO_DEFAULTS))if(Object.hasOwn(changes,key))this.game.settings[key]=volume(changes[key],fallback);
    this.syncSettings();return this._settings();
  }
  pause() {this.manualPaused=true;this._stopPlayback();}
  resume() {if(this.disposed)return false;this.manualPaused=false;return this.syncSettings();}
  _stopPlayback() {
    this._stopScheduler();if(!this.ctx)return;
    this._param(this.graph?.master.gain,0,this.ctx.currentTime,false);for(const voice of [...this.voices])this._finish(voice,true);
    if(this.ctx.state==='running')try {Promise.resolve(this.ctx.suspend()).catch(()=>{});}catch {}
  }
  _finish(voice,stop=false) {
    if(!this.voices.delete(voice))return;voice.source.onended=null;if(stop)try {voice.source.stop();}catch {}
    for(const node of voice.nodes)try {node.disconnect();}catch {}
  }
  _stopBus(bus) {for(const voice of [...this.voices])if(voice.bus===bus)this._finish(voice,true);}
  _prune() {for(const voice of [...this.voices])if(voice.until<=this.ctx.currentTime)this._finish(voice,true);}
  _admit(bus,priority) {
    this._prune();const cap={music:AUDIO_LIMITS.musicVoices,effects:AUDIO_LIMITS.effectsVoices,ambience:AUDIO_LIMITS.ambienceVoices}[bus],same=[...this.voices].filter(v=>v.bus===bus);
    if(same.length<cap&&this.voices.size<AUDIO_LIMITS.voices)return true;
    const pool=same.length>=cap?same:[...this.voices],victim=pool.sort((a,b)=>a.priority-b.priority||a.until-b.until)[0];
    if(!victim||victim.priority>priority)return false;this._finish(victim,true);return true;
  }
  _spatial(options) {
    const player=this.game?.player||{},point=options.position||(Number.isFinite(options.x)&&Number.isFinite(options.y)?options:null);
    if(!point||!Number.isFinite(player.x)||!Number.isFinite(player.y))return {pan:clamp(options.pan||0,-1,1),attenuation:1,distance:0};
    const dx=point.x-player.x,dy=point.y-player.y,distance=Math.hypot(dx,dy);
    return {pan:clamp(dx/550,-.85,.85),attenuation:1/(1+distance/260),distance};
  }
  _voice(source,length,loudness,options={}) {
    if(!this._allowed())return false;
    const bus=['music','effects','ambience'].includes(options.bus)?options.bus:'effects',settings=this._settings();
    if((bus==='music'?settings.musicVolume:settings.effectsVolume)===0)return false;
    const priority=options.priority??(bus==='effects'?2:bus==='music'?1:0);if(!this._admit(bus,priority))return false;
    const ctx=this.ctx,t=ctx.currentTime+clamp(options.offset||0,0,1.5),spatial=this._spatial(options),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    filter.type='lowpass';filter.frequency.setValueAtTime(clamp((options.cutoff||6500)/(1+spatial.distance/550),180,10000),t);
    const nodes=[source,filter,gain];source.connect(filter);
    if(ctx.createStereoPanner){const panner=ctx.createStereoPanner();panner.pan.setValueAtTime(spatial.pan,t);filter.connect(panner);panner.connect(gain);nodes.push(panner);}else filter.connect(gain);
    gain.connect(this.graph[bus]);if(bus!=='music'&&(options.room??.05)>0){const send=ctx.createGain();send.gain.setValueAtTime(clamp(options.room??.05,0,.3),t);gain.connect(send);send.connect(this.graph.room);nodes.push(send);}
    const peak=Math.max(.0001,Math.min(.18,loudness)*spatial.attenuation),attack=clamp(options.attack??.008,.004,length*.5);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(peak,t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    const voice={source,nodes,bus,priority,until:t+length+.025};this.voices.add(voice);source.onended=()=>this._finish(voice);
    try {source.start(t);source.stop(voice.until);}catch {this._finish(voice,true);return false;}return true;
  }
  tone(freq,length=.12,type='sine',loudness=.07,slide=0,options={}) {
    if(!this._allowed()||!Number.isFinite(freq)||!Number.isFinite(length)||!Number.isFinite(loudness)||loudness<=0)return false;
    length=clamp(length,.025,6);const time=this.ctx.currentTime+clamp(options.offset||0,0,1.5),source=this.ctx.createOscillator();
    source.type=WAVE_TYPES.has(type)?type:'sine';source.frequency.setValueAtTime(clamp(freq,20,12000),time);
    if(Number.isFinite(slide)&&slide)source.frequency.exponentialRampToValueAtTime(clamp(freq+slide,20,12000),time+length);
    const accepted=this._voice(source,length,loudness,options);if(!accepted)source.disconnect();return accepted;
  }
  _noiseBuffer(color) {
    color=['white','wind','ember','water'].includes(color)?color:'white';if(this.buffers.has(color))return this.buffers.get(color);
    const sampleRate=Math.min(24000,this.ctx.sampleRate||24000),samples=Math.ceil(sampleRate*.85);
    if(this.buffers.size>=AUDIO_LIMITS.buffers||this.bufferSamples+samples>AUDIO_LIMITS.bufferSamples)return null;
    const buffer=this.ctx.createBuffer(1,samples,sampleRate),data=buffer.getChannelData(0);let smooth=0;
    for(let index=0;index<samples;index++){const random=this.random()*2-1;smooth=smooth*.965+random*.09;data[index]=color==='wind'?smooth:color==='water'?smooth*.6+random*.2:color==='ember'?random*(index%37===0?.9:.28):random;}
    this.buffers.set(color,buffer);this.bufferSamples+=samples;return buffer;
  }
  noise(length=.08,loudness=.07,options={}) {
    if(!this._allowed()||!Number.isFinite(length)||!Number.isFinite(loudness)||loudness<=0)return false;
    const buffer=this._noiseBuffer(options.color);if(!buffer)return false;const source=this.ctx.createBufferSource();source.buffer=buffer;
    const accepted=this._voice(source,clamp(length,.025,.8),loudness,options);if(!accepted)source.disconnect();return accepted;
  }
  _chime(notes,length,options={},type='sine') {let played=false;for(let index=0;index<notes.length;index++)played=this.tone(notes[index],length,type,.035,0,{...options,offset:index*.105,priority:3})||played;return played;}
  play(event,details={}) {
    if(event&&typeof event==='object'){details={...event,...details};event=event.event||event.type;}
    if(!Object.hasOwn(COOLDOWNS,event)||!this.syncSettings()||!this._allowed()||this._settings().effectsVolume===0)return false;
    if(event==='loot'&&['rare','epic','legendary','mythic'].includes(details.rarity))event='rare_loot';
    const now=this.ctx.currentTime,last=this.lastEvents.get(event);if(last!==undefined&&now-last<COOLDOWNS[event])return false;this.lastEvents.set(event,now);
    const profile=CLASS_SOUND[details.classId||this.game?.player?.classId]||CLASS_SOUND.guardian,options={...details,bus:'effects',priority:['boss_start','boss_defeat','rare_loot','pvp_victory'].includes(event)?3:2};
    switch(event) {
      case 'attack': {const [freq,type,slide,color,cutoff]=profile.attack;this.noise(.07,.038,{...options,color,cutoff});return this.tone(freq,.085,type,.025,slide,options);}
      case 'spell': {const [freq,type,slide,color,cutoff]=profile.spell;this.noise(.18,.024,{...options,color,cutoff,room:.1});this.tone(freq*1.5,.24,'sine',.02,slide*.3,{...options,offset:.04});return this.tone(freq,.28,type,.04,slide,options);}
      case 'hit': this.noise(.06,.05,{...options,cutoff:1800});return this.tone(95,.09,'triangle',.032,-40,options);
      case 'hurt': return this.tone(120,.19,'sawtooth',.025,-60,options);
      case 'dash': return this.noise(.16,.025,{...options,color:'wind',cutoff:2300});
      case 'nova': {const [freq,type]=profile.spell;this.noise(.3,.055,{...options,color:profile.spell[3],cutoff:1700});return this.tone(freq*.5,.5,type,.055,-freq*.3,options);}
      case 'heal': this.tone(392,.32,'sine',.035,196,{...options,room:.13});return this.tone(587.33,.32,'sine',.022,0,{...options,offset:.08});
      case 'gather': return this.tone(280,.075,'triangle',.027,80,options);
      case 'craft': this.noise(.035,.04,{...options,cutoff:3200});return this.tone(700,.15,'triangle',.035,-250,options);
      case 'loot': return this.tone(784,.24,'sine',.026,196,options);
      case 'rare_loot': return this._chime(details.rarity==='legendary'||details.rarity==='mythic'?[392,587.33,783.99,1174.66]:[392,466.16,698.46],.42,options);
      case 'quest': return this._chime([261.63,311.13,392],.3,options);
      case 'level': return this._chime([196,261.63,311.13,392],.55,options,'triangle');
      case 'boss_start': this.noise(.32,.035,{...options,color:'ember',cutoff:900,room:.18});return this._chime([65.41,69.3,98],.4,options,'triangle');
      case 'boss_defeat': return this._chime([98,146.83,196,293.66],.55,options,'triangle');
      case 'pvp_start': return this._chime([196,207.65,293.66],.22,options,'triangle');
      case 'pvp_hit': this.noise(.045,.04,{...options,cutoff:2300});return this.tone(246.94,.11,'triangle',.035,-90,options);
      case 'pvp_victory': return this._chime([293.66,392,493.88],.34,options);
      case 'pvp_defeat': return this._chime([196,155.56,98],.28,options,'triangle');
      default:return false;
    }
  }
  _scene(context={}) {
    const game=this.game,player=game?.player||{},dungeon=game?.dungeonInstance,regionId=context.regionId||game?.regionAt?.()?.id||'daemmerhain',dungeonId=Object.hasOwn(context,'dungeonId')?context.dungeonId:dungeon?.id??null;
    const boss=context.boss??(!!dungeon?.bossEngaged&&!dungeon?.bossDefeated||!!game?.world?.enemies?.some(e=>e.alive&&(e.boss||e.type?.endsWith('_boss')||['thorn_guardian','frost_sentinel','emberlord'].includes(e.type))&&Math.hypot(e.x-player.x,e.y-player.y)<420&&(e.aggro||e.phase==='windup')));
    return {regionId,dungeonId,boss,pvp:context.pvp??!!game?.pvpActive,weather:context.weather||game?.weather||'still'};
  }
  update(context={}) {
    if(this.disposed)return false;this.sceneInput=context;const scene=this._scene(context),key=[scene.regionId,scene.dungeonId,scene.boss,scene.pvp].join('|'),changed=key!==this.sceneKey,old=this.scene;
    this.scene=scene;this.sceneKey=key;
    if(changed){this.note=0;this.nextMusicAt=this.ctx?.currentTime||0;this._stopBus('music');this._stopBus('ambience');if(scene.boss&&!old.boss)this.play('boss_start');if(scene.pvp&&!old.pvp)this.play('pvp_start');}
    return this.syncSettings();
  }
  ambient() {
    if(!this.syncSettings()||!this._musicAllowed())return false;this.update(this.sceneInput);const now=this.ctx.currentTime;if(now+.025<this.nextMusicAt)return false;
    const scene=this.scene,mode=scene.pvp?'pvp':scene.boss?'boss':scene.dungeonId?'dungeon':REGION_MUSIC[scene.regionId]||'hollow',profile=MUSIC[mode];
    const dungeonOffset=scene.dungeonId?[...scene.dungeonId].reduce((sum,char)=>sum+char.charCodeAt(0),0)%4:0,root=profile.root*Math.pow(2,dungeonOffset/12),beat=this.note++;
    this.nextMusicAt=now+profile.beat;this._param(this.graph.airFilter.frequency,profile.cutoff,now);
    if(this._settings().musicVolume>0) {
      if(beat%4===0){this.tone(root*.5,Math.min(5,profile.beat*4),'sine',.016,0,{bus:'music',attack:.35,cutoff:750,pan:-.12});this.tone(root*1.414,Math.min(3.5,profile.beat*3),'sine',.003,0,{bus:'music',attack:.4,cutoff:1000,pan:.24});}
      const degree=SEQUENCE[(beat+dungeonOffset)%SEQUENCE.length]%profile.scale.length;
      this.tone(root*profile.scale[degree]*2,Math.min(2,profile.beat*1.4),'sine',.008,0,{bus:'music',attack:.1,cutoff:profile.cutoff,pan:beat%2?.32:-.32});
      if(profile.pulse)this.tone(root*.5,.15,'triangle',profile.pulse,-root*.22,{bus:'music',cutoff:450});
    }
    if(beat%4===0&&this._settings().effectsVolume>0)this.noise(.65,.015,{bus:'ambience',color:profile.air,cutoff:profile.cutoff,pan:this.random()*.9-.45,attack:.14,room:scene.dungeonId?.18:.08});
    return true;
  }
  getStats() {return {voices:this.voices.size,musicVoices:[...this.voices].filter(v=>v.bus==='music').length,effectsVoices:[...this.voices].filter(v=>v.bus==='effects').length,ambienceVoices:[...this.voices].filter(v=>v.bus==='ambience').length,buffers:this.buffers.size,bufferSamples:this.bufferSamples,timers:this.musicTimer!==null?1:0,disposed:this.disposed,scene:{...this.scene}};}
  dispose() {
    if(this.disposed)return;this.disposed=true;this._stopPlayback();this.document?.removeEventListener?.('visibilitychange',this.onVisibility);
    for(const node of Object.values(this.graph||{}))try {node.disconnect();}catch {}
    const context=this.ctx;this.ctx=null;this.graph=null;this.buffers.clear();this.bufferSamples=0;this.lastEvents.clear();
    if(context&&context.state!=='closed')try {Promise.resolve(context.close()).catch(()=>{});}catch {}
  }
}
