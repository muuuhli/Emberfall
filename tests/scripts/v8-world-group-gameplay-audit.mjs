import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { MultiplayerHub } from '../../server/multiplayer.mjs';
import { REGIONS, SKILLS, ITEMS, ENEMY_TYPES } from '../../src/catalog.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';
import { hitShape } from '../../src/encounter-geometry.js';
import { createEncounterDirector, updateEncounterDirector } from '../../src/encounter-director.js';
import { TRIALS } from '../../src/trial-content.js';
import { updateWorldEvents, worldEventRewardPreview } from '../../src/world-events.js';

const DT=.04,output=process.argv[2]||'/tmp/emberfall-v8-world-groups-v7.json';
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rounded=x=>Number(x.toFixed(2));
function gear(game,level,serial) {
  for(const slot of EQUIPMENT_SLOTS) {
    const base=ITEM_BASES.filter(item=>equipmentSlot(item)===slot.id&&item.minLevel<=level&&(!item.classIds||item.classIds.includes('ranger')))
      .sort((a,b)=>b.minLevel-a.minLevel||(b.stats.damage||0)-(a.stats.damage||0)||a.id.localeCompare(b.id))[0];
    if(!base)continue;
    const item=generateLoot({level,baseId:base.id,classId:'ranger',rarity:'rare',rng:rng(8177+level),uid:`v8-group-${level}-${serial}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw new Error('Invalid legal gear');
  }
  game.player.skillPoints=2+(level-1)*2;
  for(let pass=0;pass<4;pass++)for(const talent of SKILLS.filter(t=>t.classId==='ranger'&&(t.minLevel||1)<=level))if((game.skills[talent.id]||0)<Math.min(3,talent.maxRank||3))game.learn(talent.id);
  for(const id of Object.keys(game.inventory))if(game.item(id)?.type==='consumable')delete game.inventory[id];
  const healing=Object.values(ITEMS).filter(item=>item.type==='consumable'&&(item.minLevel||1)<=level&&item.family==='health').sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  if(healing)game.addItem(healing.id,5);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
}
function party(level,count,{withGear=true}={}) {
  const hub=new MultiplayerHub({createGame:()=>new Game({storage:null,random:rng(7300+level)}),clock:()=>0,autoStart:false});
  const room={code:'NATIVEAUDIT',members:new Map(),time:0,lastActive:0};hub.rooms.set(room.code,room);
  const members=[];
  for(let i=0;i<count;i++){const member=hub._createMember(room,{classId:'ranger',playerName:`Audit${i}`});member.game.player.level=level;if(withGear)gear(member.game,level,i);else member.game.player.hp=member.game.stats().maxHp;members.push(member);}
  const game=members[0].game;
  for(const key of ['enemies','trees','rocks','structures','river','bridges','interactions'])game.world[key]=[];
  hub._syncRoom(room,game);
  return {hub,room,members,game,games:members.map(m=>m.game)};
}
function keys(game,dx,dy){game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');}
function control(member,event) {
  const game=member.game,p=game.player;if(game.dead)return;
  const foes=game.world.enemies.filter(e=>e.alive&&e.eventId===event.id).sort((a,b)=>distance(a,p)-distance(b,p));
  const target=foes[0];if(!target){keys(game,event.x-p.x,event.y-p.y);return;}
  const range=distance(p,target);member.aimAngle=Math.atan2(target.y-p.y,target.x-p.x);p.face=member.aimAngle;
  let dx=target.x-p.x,dy=target.y-p.y;if(range<180){dx=-dx;dy=-dy;}else if(range<=215)dx=dy=0;
  const shapes=foes.flatMap(e=>[...(e.phase==='windup'?e.telegraphShapes||[]:[]),...(e.activeShapes||[])]).filter(s=>!s.safe);
  if(shapes.some(s=>hitShape(s,p))){
    const candidates=[];
    for(const length of [90,160])for(let i=0;i<16;i++){const angle=i*Math.PI/8,point={x:p.x+Math.cos(angle)*length,y:p.y+Math.sin(angle)*length};candidates.push({...point,score:shapes.filter(s=>hitShape(s,point)).length*10000+Math.max(0,distance(point,event)-440)*100+Math.abs(distance(point,target)-210)+length});}
    candidates.sort((a,b)=>a.score-b.score);dx=candidates[0].x-p.x;dy=candidates[0].y-p.y;keys(game,dx,dy);game.action('dash');
  } else {
    const shot=game.projectiles.find(shot=>shot.owner==='enemy'&&distance(shot,p)<90);
    if(shot){dx=-Math.sin(shot.angle)*100;dy=Math.cos(shot.angle)*100;keys(game,dx,dy);game.action('dash');}else keys(game,dx,dy);
  }
  if(distance(p,event)>450){keys(game,event.x-p.x,event.y-p.y);}
  if(range<560)game.action('attack');if(range<300)game.action('bolt');if(range<170)game.action('nova');if(p.hp<game.stats().maxHp*.4)game.action('potion');
}
function fight(level,count,id) {
  const fixture=party(level,count),{hub,room,members,game,games}=fixture;
  const event=game.world.worldEvents.find(e=>e.id===id);
  game.world.worldEvents=[event];game.world.eventObjects=game.world.eventObjects.filter(o=>o.eventId===id);
  // Suppress unrelated wilderness starts by retaining a native calm clock that
  // has enough time for this isolated boss probe; the encounter itself is real.
  game.world.encounterDirector.nextIn=75;
  game.world.encounterDirector.elapsed=1;
  members.forEach((m,i)=>{const a=i*Math.PI*2/count;Object.assign(m.game.player,{x:event.x+Math.cos(a)*110,y:event.y+Math.sin(a)*110});});
  Object.assign(game.player,{x:event.x,y:event.y});
  let damage=0,damageDealt=0;
  for(const member of members){const hurt=member.game.damagePlayer.bind(member.game),hit=member.game.hitEnemy.bind(member.game);member.game.damagePlayer=(...args)=>{const result=hurt(...args)||0;damage+=result;return result;};member.game.hitEnemy=(...args)=>{const result=hit(...args)||0;damageDealt+=result;return result;};}
  if(!game.interactWorldEvent(`${id}:start`))throw new Error('Cannot start '+id);
  for(const rune of game.world.eventObjects.filter(o=>o.eventId===id&&o.role==='rune'&&!o.hidden)){Object.assign(game.player,{x:rune.x,y:rune.y});if(!game.interactWorldEvent(rune.id))throw new Error('Cannot bind track');}
  Object.assign(game.player,{x:event.x,y:event.y});
  let start=null,bossHp=0,cycles=0;
  while(event.state==='active'&&room.time<70&&games.some(g=>!g.dead)){
    for(const member of members)control(member,event);hub.tick(DT);
    const boss=game.world.enemies.find(e=>e.eventId===id&&e.boss);
    if(boss){if(start===null){start=room.time;bossHp=boss.maxHp;}cycles=boss.cycle||0;}
  }
  const result={id,level,count,won:event.state==='success',deaths:games.filter(g=>g.dead).length,eventState:event.state,bossHp,bossCycles:cycles,fightSeconds:rounded(room.time-(start??0)),damageTaken:rounded(damage),damageDealt:rounded(damageDealt),partyMaxHp:rounded(games.reduce((n,g)=>n+g.stats().maxHp,0)),participants:event.participants.length};hub.dispose();return result;
}
const fights=[];
for(const [level,id] of [[12,'event-irdan'],[52,'event-vey'],[100,'event-asterion']])for(const count of [1,2,4,8]){const result=fight(level,count,id);fights.push(result);console.log(JSON.stringify(result));}

// A real shared-world roster audits planning/spawn populations without turning
// this separate policy matrix into a claim about full combat balance.
const waves=[];
for(const [level,regionId] of [[1,'daemmerhain'],[4,'frostgrat'],[8,'aschenmoor'],[12,'sonnensteppe'],[20,'jadeauen'],[52,'mondbruch'],[76,'traumsenke'],[100,'nexusriss']]){
  const {hub,game,games}=party(level,8,{withGear:false}),region=REGIONS.find(r=>r.id===regionId);
  game.world.worldEvents=[];game.world.shrines=[];
  for(const g of games)Object.assign(g.player,{x:region.x+region.w*.55,y:region.y+region.h*.45});
  for(const count of [1,2,3,4,5,6,7,8])for(const phase of [0,1,2]){
    game.world.enemies=[];game.hazards=[];game.world.encounterDirector=createEncounterDirector();Object.assign(game.world.encounterDirector,{sequence:phase,nextIn:0});
    updateEncounterDirector(game,.04,games.slice(0,count));
    const state=game.world.encounterDirector,plan=state.plan.map(p=>({...p}));if(state.stage==='warning')updateEncounterDirector(game,8,games.slice(0,count));
    const actors=game.world.enemies.filter(e=>e.directorId);
    waves.push({level,regionId,count,phase,tier:state.tier,planned:plan.length,spawned:actors.length,totalHp:actors.reduce((n,e)=>n+e.maxHp,0),damage:actors.reduce((n,e)=>n+e.damage,0),minSpawn:actors.length?rounded(Math.min(...actors.flatMap(e=>games.slice(0,count).map(g=>distance(e,g.player))))):null});
  }
  hub.dispose();
}
const pressureSummary=waves.filter(r=>r.phase===2&&[1,8].includes(r.count));
const trials=[];
for(const definition of TRIALS){
  const {hub,game,games}=party(definition.level,8,{withGear:false});
  const canonical=JSON.parse(JSON.stringify(game.world.worldEvents.find(e=>e.id===definition.id)));
  const objects=JSON.parse(JSON.stringify(game.world.eventObjects.filter(o=>o.eventId===definition.id)));
  for(const count of [1,2,3,4,5,6,7,8]){
    const event=JSON.parse(JSON.stringify(canonical));game.world.worldEvents=[event];game.world.eventObjects=JSON.parse(JSON.stringify(objects));game.world.enemies=[];game.world.encounterDirector=createEncounterDirector();game.time=0;
    for(const g of games)Object.assign(g.player,{x:event.x,y:event.y});
    if(!game.interactWorldEvent(`${event.id}:start`))throw new Error('Cannot start trial');
    updateWorldEvents(game.world,.04,games.slice(0,count),.04);updateWorldEvents(game.world,6,games.slice(0,count),6.04);
    const actors=game.world.enemies.filter(e=>e.eventId===event.id&&e.alive);
    trials.push({id:event.id,level:definition.level,count,spawned:actors.length,totalHp:actors.reduce((n,e)=>n+e.maxHp,0),damage:actors.reduce((n,e)=>n+e.damage,0)});
  }
  hub.dispose();
}
const rewardPolicy=[];
const policyGame=new Game({storage:null});
for(const id of ['event-irdan','event-asterion','trial-last-scar'])for(const ordinal of [0,1,2,5]){
  const event={...policyGame.world.worldEvents.find(e=>e.id===id),state:'active',rewardedRuns:ordinal,bonus:1};
  rewardPolicy.push({id,ordinal,playerLevel:100,...worldEventRewardPreview(event,{level:100})});
}
await fs.writeFile(output,JSON.stringify({sourceLabel:process.argv[3]||'Integrated world group audit',fixtures:['Native MultiplayerHub shared-world tick, real alive nearby players and authored boss interactions','All Rangers; legal Rare slots, earned passive-point budget capped at rank 3, five legal healing items, no learned actives/upgrades/gems/companions','Ambient enemies and cover removed for isolated group timing; no forced hits/kills or enemy stat changes','Initial placement and rune travel are declared setup; combat uses native keys, actions, warnings and projectiles','Boss-only timing starts the isolated director clock at elapsed1/next75, so no separate pursuit overlaps a measured boss','Independent spawn-policy matrix uses real Game rosters and native director/trial scheduling, without a combat-win claim','Reward policy previews use explicitly selected historic repeat ordinals; they are not claims of extra full-health victories'],fights,waves,pressureSummary,trials,rewardPolicy},null,2));
console.log(JSON.stringify({output,pressureSummary,trials},null,2));
