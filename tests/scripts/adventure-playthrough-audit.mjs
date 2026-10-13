// Automated native-Game replays; not a human playtest or campaign completion.
// node tests/scripts/adventure-playthrough-audit.mjs [output.json]
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { NPCS } from '../../src/catalog.js';
import { EXPEDITIONS } from '../../src/world-events.js';

const output=process.argv[2]||'/tmp/emberfall-adventure-audit.json';
const DT=.04;
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function create(seed,classId='guardian') {
  const game=new Game({storage:null,random:rng(seed)});game.selectClass(classId);game.start();
  game.audit={seed,classId,actions:{},damageTaken:0,moved:0,notices:[],checkpoints:[]};
  game.onNotice=(text,tone)=>{if(game.audit.notices.length<80)game.audit.notices.push({at:Number(game.time.toFixed(2)),text,tone});};
  const original=game.damagePlayer.bind(game);
  game.damagePlayer=(...args)=>{const loss=original(...args)||0;game.audit.damageTaken+=loss;return loss;};
  return game;
}
function action(game,name) {if(game.action(name)){game.audit.actions[name]=(game.audit.actions[name]||0)+1;return true;}return false;}
function aim(game,point) {game.aim={x:point.x,y:point.y};game.player.face=Math.atan2(point.y-game.player.y,point.x-game.player.x);}
function keys(game,dx,dy) {
  game.keys.clear();
  if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');
  if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');
}
function tick(game) {const before={x:game.player.x,y:game.player.y};game.update(DT);game.audit.moved+=distance(before,game.player);}
function checkpoint(game,label) {game.audit.checkpoints.push({label,at:Number(game.time.toFixed(2)),level:game.player.level,hp:Math.round(game.player.hp),mana:Math.round(game.player.mana),gold:game.player.gold});}
function pathTo(game,destination) {
  const step=32,key=(x,y)=>`${x},${y}`,cell=p=>({x:Math.round(p.x/step),y:Math.round(p.y/step)});
  const start=cell(game.player),goal=cell(destination),queue=[start],parents=new Map([[key(start.x,start.y),null]]);
  let found;
  for(let index=0;index<queue.length&&index<22000;index++) {
    const p=queue[index];if(Math.hypot(p.x-goal.x,p.y-goal.y)<1.6){found=p;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const n={x:p.x+dx,y:p.y+dy},id=key(n.x,n.y);
      if(parents.has(id)||n.x<1||n.y<1||n.x>Math.max(goal.x,start.x)+18||n.y>Math.max(goal.y,start.y)+18||game.collides(n.x*step,n.y*step,16))continue;
      if(dx&&dy&&(game.collides((p.x+dx)*step,p.y*step,16)||game.collides(p.x*step,(p.y+dy)*step,16)))continue;
      parents.set(id,p);queue.push(n);
    }
  }
  if(!found)return [];
  const result=[];for(let node=found;node;node=parents.get(key(node.x,node.y)))result.push({x:node.x*step,y:node.y*step});
  return result.reverse().slice(1).concat([{x:destination.x,y:destination.y}]);
}
function walk(game,destination,{stop=55,max=45,combat=true}={}) {
  const route=pathTo(game,destination);let index=0;
  for(let i=0;i<max/DT&&!game.dead&&distance(game.player,destination)>stop;i++) {
    while(index<route.length-1&&distance(game.player,route[index])<22)index++;
    const point=route[index]||destination;
    keys(game,point.x-game.player.x,point.y-game.player.y);
    const hostile=game.world.enemies.filter(e=>e.alive&&e.aggro&&!e.boss&&distance(game.player,e)<110).sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
    if(combat&&hostile){aim(game,hostile);action(game,'attack');if(distance(game.player,hostile)<80)action(game,'bolt');}
    tick(game);
  }
  game.keys.clear();return distance(game.player,destination)<=stop;
}
function fightTick(game,target,{center,style='reactive'}={}) {
  const p=game.player,s=game.stats(),ranged=game.player.classId==='ranger';
  aim(game,target);const d=distance(p,target),preferred=ranged?210:65;
  let dx=target.x-p.x,dy=target.y-p.y;
  const threat=game.world.enemies.filter(e=>e.alive&&e.phase==='windup'&&distance(e,p)<(e.telegraphRadius||70)+35).sort((a,b)=>distance(a,p)-distance(b,p))[0];
  if(style==='stationary')dx=dy=0;
  else if(threat) {dx=p.x-(threat.telegraphX??threat.x);dy=p.y-(threat.telegraphY??threat.y);if(Math.hypot(dx,dy)<5){dx=1;dy=1;}keys(game,dx,dy);action(game,'dash');}
  else if(d<preferred-28&&ranged){dx=-dx;dy=-dy;}
  else if(d<=preferred)dx=dy=0;
  if(center&&distance(p,center)>135){dx=center.x-p.x;dy=center.y-p.y;}
  keys(game,dx,dy);
  if(d<(ranged?500:95))action(game,'attack');
  if(d<300&&(ranged||p.shield<10))action(game,'bolt');
  if(d<155)action(game,'nova');
  if(p.hp<s.maxHp*.4)action(game,'potion');
  tick(game);
}
function fight(game,target,{max=70,...options}={}) {
  const start=game.time;
  while(target.alive&&!game.dead&&game.time-start<max)fightTick(game,target,options);
  game.keys.clear();return !target.alive;
}
function introTargetRegression() {
  const game=create(8264),mira=NPCS.find(n=>n.id==='mira');let dialogue;
  game.onDialogue=npc=>{dialogue=npc.id;};
  const reached=walk(game,mira,{stop:65}),nearby=game.nearby();action(game,'interact');
  const fountains=game.world.interactions.filter(o=>o.kind==='fountain');
  const source=fountains.find(o=>o.region==='daemmerhain'),reachedSource=walk(game,source,{stop:25}),sourceRejected=reachedSource&&!game.interactWorldObject(source.id);
  return {scenario:'intro-target-priority',passed:reached&&dialogue==='mira'&&sourceRejected&&fountains.every(o=>!o.used),dialogue,nearbyKind:nearby?.kind,waypoint:game.waypoint,sourceRejected,sourceConsumed:fountains.some(o=>o.used),simulatedSeconds:Number(game.time.toFixed(2)),...game.audit};
}
function beginner(seed) {
  const game=create(seed),mira=NPCS.find(n=>n.id==='mira');
  const nearMira=walk(game,mira,{stop:25});let dialogue;
  game.onDialogue=npc=>{dialogue=npc.id;};action(game,'interact');
  const accepted=dialogue==='mira'&&game.questAccept('q_hainwacht');checkpoint(game,'Mira accepted');
  const targets=game.world.enemies.filter(e=>e.type==='wolf').slice(0,4),battles=[];
  for(const wolf of targets) {
    if(game.questState.q_hainwacht?.status==='ready')break;
    const reached=walk(game,wolf,{stop:110}),start=game.time,hp=game.player.hp;
    const won=reached&&fight(game,wolf);
    battles.push({id:wolf.id,reached,won,seconds:Number((game.time-start).toFixed(2)),hpLost:Math.round(hp-game.player.hp)});
    for(const drop of [...game.drops])walk(game,drop,{stop:25,max:15});
  }
  checkpoint(game,'Four wolves attempted');
  let lootSource='wolf';
  if(!Object.keys(game.inventory).some(id=>game.generatedItems[id]&&game.canEquipItem(id))) {
    // An unlucky four-kill route may have no equipment drop. Open a real starter
    // chest using movement and interaction; do not inject an item for the audit.
    const chest=game.world.chests.filter(c=>!c.opened&&!c.locked&&game.regionAt(c.x,c.y).id==='daemmerhain').sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
    if(chest&&walk(game,chest,{stop:18,max:60})){action(game,'interact');lootSource='starter chest';}
  }
  const candidates=Object.keys(game.inventory).filter(id=>game.generatedItems[id]&&game.canEquipItem(id));
  const candidate=candidates.find(id=>{const p=game.previewEquipment(id);return p&&(p.delta.damage>0||p.delta.maxHp>0||p.delta.armor>0);})||candidates[0];
  const comparison=candidate?game.previewEquipment(candidate):null,equipped=candidate?game.equip(candidate):false;
  const returned=walk(game,mira,{stop:65,max:90}),turnedIn=returned&&game.questTurnIn('q_hainwacht');checkpoint(game,'Returned to Mira');
  return {scenario:'beginner',passed:nearMira&&accepted&&battles.every(b=>b.won)&&!!comparison&&equipped&&turnedIn,nearMira,dialogue,accepted,battles,lootSource,candidate,comparison:comparison?{slot:comparison.slot,delta:comparison.delta}:null,equipped,returned,turnedIn,status:game.questState.q_hainwacht,dead:game.dead,simulatedSeconds:Number(game.time.toFixed(2)),...game.audit};
}
function eventScenario(seed,id,{style='reactive',risk=false,classId='ranger'}={}) {
  const game=create(seed,classId),event=game.world.worldEvents.find(e=>e.id===id);
  // Declared setup fixtures: scenario-level character, teleport to adventure start,
  // ambient overworld foes removed for encounter isolation; event foes remain real.
  game.player.level=event.minLevel;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  game.player.x=event.x;game.player.y=event.y;game.world.enemies=[];
  const started=game.interactWorldEvent(`${id}:start`),phases=[],combat=[];let lastStage=-1,lastObjective='';
  const startedAt=game.time;
  while(event.state==='active'&&!game.dead&&game.time-startedAt<240) {
    if(lastStage!==event.stageIndex||lastObjective!==event.objective.label){lastStage=event.stageIndex;lastObjective=event.objective.label;phases.push({stage:event.stageIndex,type:event.stageType,label:lastObjective,at:Number(game.time.toFixed(2))});}
    const objects=game.world.eventObjects.filter(o=>o.eventId===id&&!o.hidden),definition=EXPEDITIONS.find(e=>e.id===id),stage=definition?.stages[event.stageIndex];
    let interact;
    if(event.stageType==='choice')interact=objects.find(o=>o.role==='choice'&&o.choice===(risk?'risk':'safe'));
    if(event.stageType==='ambush'||event.stageType==='boss_hunt')interact=objects.find(o=>o.role==='rune'&&!o.active);
    if(event.stageType==='ritual'&&stage?.rule==='sequence')interact=objects.find(o=>o.role==='rune'&&o.symbol===stage.symbols[event.objective.progress]&&!o.active);
    if(interact) {
      if(distance(game.player,interact)<75)game.interactWorldEvent(interact.id,interact.choice);
      else {keys(game,interact.x-game.player.x,interact.y-game.player.y);tick(game);continue;}
    }
    const target=game.world.enemies.filter(e=>e.alive&&(e.eventId===id||e.summonedBy)).sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
    if(target) {
      if(!combat.some(e=>e.id===target.id))combat.push({id:target.id,type:target.type,maxHp:target.maxHp,boss:target.boss});
      fightTick(game,target,{style,center:event.stageType==='defend'?event:null});
    } else {keys(game,event.x-game.player.x,event.y-game.player.y);tick(game);}
  }
  for(const record of combat){const actor=game.world.enemies.find(e=>e.id===record.id);record.attackCycles=actor?.cycle||0;record.finalHp=actor?.hp;}
  const allDead=game.world.enemies.filter(e=>e.eventId===id).every(e=>!e.alive),rewardBefore={gold:game.player.gold,xp:game.player.xp,dust:game.resources.dust};
  const rewardObject=game.world.eventObjects.find(o=>o.id===`${id}:reward`);
  const reachedReward=event.state==='success'&&walk(game,rewardObject,{stop:50,combat:false});
  const claimed=reachedReward&&game.interactWorldEvent(rewardObject.id),repeat=claimed&&game.claimWorldEvent(id);
  // A completion must exercise the boss mechanics; the old distance exploit
  // finished with zero attack cycles and must fail this replay regression.
  const bosses=combat.filter(actor=>actor.boss),mechanicsEngaged=event.mode!=='expedition'||bosses.length>0&&bosses.every(actor=>actor.attackCycles>=2);
  return {scenario:id,style,risk,fixtures:['minimum-level character','teleport to start','ambient overworld enemies removed'],passed:started&&allDead&&claimed&&!repeat&&mechanicsEngaged,started,state:event.state,stage:event.stageIndex,phases,combat,mechanicsEngaged,allDead,claimed,repeat,reward:{gold:game.player.gold-rewardBefore.gold,xp:game.player.xp-rewardBefore.xp,dust:game.resources.dust-rewardBefore.dust},dead:game.dead,simulatedSeconds:Number((game.time-startedAt).toFixed(2)),...game.audit};
}
const results=[introTargetRegression(),beginner(8264),beginner(9951),eventScenario(8264,'event-daemmerhain'),eventScenario(8264,'expedition-trauerweg'),eventScenario(9951,'expedition-trauerweg',{risk:true}),eventScenario(8264,'expedition-trauerweg',{classId:'guardian'})];
await fs.writeFile(output,JSON.stringify({kind:'native automated replay',humanPlaytest:false,instantKills:false,results},null,2));
console.log(JSON.stringify({output,results:results.map(({scenario,seed,passed,dead,simulatedSeconds,state,stage,battles,combat,actions,reward,candidate,returned,claimed})=>({scenario,seed,passed,dead,simulatedSeconds,state,stage,battles,combat,actions,reward,candidate,returned,claimed}))},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
