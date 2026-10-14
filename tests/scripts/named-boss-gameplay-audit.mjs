// Native solo encounter probes. Equipment/starting positions are declared
// fixtures; boss spawns, HP, actions, damage, movement and rewards stay real.
// node tests/scripts/named-boss-gameplay-audit.mjs [output.json] [--quick]
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { NAMED_BOSS_HUNTS } from '../../src/encounter-content.js';
import { ENEMY_TYPES, SKILLS, ITEMS } from '../../src/catalog.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';
import { hitShape } from '../../src/encounter-geometry.js';

const DT=.04,output=process.argv[2]||'/tmp/emberfall-named-boss-gameplay.json';
const rng=initial=>()=>{initial=(Math.imul(initial,1664525)+1013904223)>>>0;return initial/4294967296;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function loadout(game,level,classId) {
  const gear=[],unavailableSlots=[];
  for(const slot of EQUIPMENT_SLOTS) {
    const base=ITEM_BASES.filter(item=>equipmentSlot(item)===slot.id&&item.minLevel<=level&&(!item.classIds||item.classIds.includes(classId)))
      .sort((a,b)=>b.minLevel-a.minLevel||(b.stats.damage||0)-(a.stats.damage||0)||(b.stats.maxHp||0)-(a.stats.maxHp||0)||a.id.localeCompare(b.id))[0];
    if(!base) {unavailableSlots.push(slot.id);continue;}
    const item=generateLoot({level,baseId:base.id,classId,rarity:'rare',rng:rng(8177+level),uid:`named-${classId}-${level}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw new Error(`Invalid fixture equipment ${base.id}`);
    gear.push({slot:slot.id,baseId:base.id,level:item.level,rarity:item.rarity});
  }
  game.player.skillPoints=2+(level-1)*2;
  for(let round=0;round<4;round++)for(const talent of SKILLS.filter(t=>t.classId===classId&&(t.minLevel||1)<=level))if((game.skills[talent.id]||0)<Math.min(3,talent.maxRank))game.learn(talent.id);
  const healing=Object.values(ITEMS).filter(item=>item.type==='consumable'&&(item.minLevel||1)<=level&&item.family==='health').sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  if(healing)game.addItem(healing.id,5);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  return {gear,unavailableSlots,talents:{...game.skills},healing:healing?.id,unspentPoints:game.player.skillPoints,stats:game.stats()};
}
function keys(game,dx,dy) {
  game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');
}
function act(game,name,actions){if(game.action(name))actions[name]=(actions[name]||0)+1;}
function controller(game,eventId,style,actions,memory) {
  const foes=game.world.enemies.filter(enemy=>enemy.alive&&enemy.eventId===eventId),target=foes.sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];if(!target)return;
  const player=game.player,stats=game.stats(),range=distance(player,target),ranged=game.classId==='ranger',preferred=ranged?210:55,event=game.world.worldEvents.find(event=>event.id===eventId);
  game.aim={x:target.x,y:target.y};player.face=Math.atan2(target.y-player.y,target.x-player.x);
  let dx=target.x-player.x,dy=target.y-player.y;
  if(range<(ranged?180:48)){dx=-dx;dy=-dy;}else if(range<=preferred)dx=dy=0;
  const shapes=foes.flatMap(enemy=>[...(enemy.phase==='windup'?enemy.telegraphShapes||[]:[]),...(enemy.activeShapes||[])]).filter(shape=>!shape.safe);
  const shots=game.projectiles.filter(projectile=>projectile.owner==='enemy'&&foes.some(enemy=>enemy.id===projectile.attackerId));
  if(style==='reactive') {
    if(shapes.some(shape=>hitShape(shape,player))) {
      const candidates=[];
      for(const length of [65,120,175,230])for(let index=0;index<16;index++) {
        const angle=index*Math.PI/8,point={x:player.x+Math.cos(angle)*length,y:player.y+Math.sin(angle)*length};
        const score=shapes.filter(shape=>hitShape(shape,point)).length*10000+(game.collides(point.x,point.y)?10000:0)+(game.inSettlement(point.x,point.y)?10000:0)
          +Math.max(0,distance(point,target)-600)*20+Math.max(0,distance(point,event)-450)*30+length+Math.abs(distance(point,target)-preferred)*.12;
        candidates.push({...point,score});
      }
      candidates.sort((a,b)=>a.score-b.score);memory.safetyGoal=candidates[0];dx=memory.safetyGoal.x-player.x;dy=memory.safetyGoal.y-player.y;
      keys(game,dx,dy);
      const imminent=foes.some(enemy=>enemy.phase==='windup'&&enemy.attackTimer<.38)||foes.some(enemy=>enemy.activeShapes?.length);
      if(imminent)act(game,'dash',actions);
    } else if(memory.safetyGoal&&(shots.length||foes.some(enemy=>enemy.activeShapes?.length))) {
      dx=memory.safetyGoal.x-player.x;dy=memory.safetyGoal.y-player.y;if(Math.hypot(dx,dy)<20)dx=dy=0;
    } else {
      memory.safetyGoal=null;
      const incoming=shots.find(projectile=>distance(projectile,player)<95);
      if(incoming) {dx=-Math.sin(incoming.angle)*100;dy=Math.cos(incoming.angle)*100;keys(game,dx,dy);act(game,'dash',actions);}
    }
  }
  keys(game,dx,dy);
  if(range<(ranged?560:95))act(game,'attack',actions);
  if(range<300&&(ranged||player.shield<stats.maxHp*.1))act(game,'bolt',actions);
  if(range<155)act(game,'nova',actions);
  if(style==='reactive'&&player.hp<stats.maxHp*.4)act(game,'potion',actions);
}

function probe(hunt,classId,style) {
  const game=new Game({storage:null,random:rng(8719+hunt.level)});game.selectClass(classId);game.start();game.player.level=hunt.level;
  const equipment=loadout(game,hunt.level,classId);game.world.enemies=[];game.world.encounterDirector.nextIn=1e6;
  const event=game.world.worldEvents.find(event=>event.id===hunt.id);if(!event)throw new Error(`Missing hunt ${hunt.id}`);
  game.player.x=event.x;game.player.y=event.y;
  if(!game.interactWorldEvent(`${hunt.id}:start`))throw new Error(`Cannot begin ${hunt.id}`);
  for(const rune of game.world.eventObjects.filter(object=>object.eventId===hunt.id&&object.role==='rune')) {
    game.player.x=rune.x;game.player.y=rune.y;if(!game.interactWorldEvent(rune.id))throw new Error(`Cannot bind ${rune.id}`);
  }
  while(!game.world.enemies.some(enemy=>enemy.eventId===hunt.id&&enemy.type===hunt.boss)&&game.time<5)game.update(DT);
  const boss=game.world.enemies.find(enemy=>enemy.eventId===hunt.id&&enemy.type===hunt.boss);if(!boss)throw new Error(`No real boss spawn ${hunt.id}`);
  const start=game.time,initialHp=game.player.hp,actions={},memory={},warnings=[],phases=new Set(),notices=[],failureEffects=[];let damage=0,maxShapes=0,maxArenaDistance=0,maxHomeDrift=0,windupResets=0;
  const damagePlayer=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{const applied=damagePlayer(...args)||0;damage+=applied;return applied;};game.onNotice=(message,tone)=>{notices.push({message,tone});};
  const handleEffects=game.handleWorldEventEffects.bind(game);game.handleWorldEventEffects=effects=>{failureEffects.push(...effects.filter(effect=>effect.eventId===hunt.id&&effect.kind==='failure'));return handleEffects(effects);};
  let previousAction;
  while(boss.alive&&!game.dead&&event.state==='active'&&game.time-start<120) {
    const wasWindup=boss.phase==='windup',oldCycle=boss.cycle||0;
    controller(game,hunt.id,style,actions,memory);game.update(DT);
    if(wasWindup&&boss.phase==='idle'&&(boss.cycle||0)===oldCycle)windupResets++;
    if(boss.phase==='windup'&&boss.encounterAction!==previousAction) {
      previousAction=boss.encounterAction;warnings.push({id:previousAction.id,phase:previousAction.phase,windup:boss.telegraphDuration,time:Number((game.time-start).toFixed(2)),shapeKinds:boss.telegraphShapes.map(shape=>shape.kind)});
    }
    if(boss.encounterPhase)phases.add(boss.encounterPhase);maxShapes=Math.max(maxShapes,(boss.telegraphShapes?.length||0)+(boss.activeShapes?.length||0));
    maxArenaDistance=Math.max(maxArenaDistance,distance(game.player,event));maxHomeDrift=Math.max(maxHomeDrift,distance(boss,{x:boss.homeX,y:boss.homeY}));
  }
  const fightTime=Number((game.time-start).toFixed(2));
  // Native projectiles resolve after the event interpreter in a frame. Let the
  // next real frame observe the final kill rather than forging completion.
  if(!boss.alive&&!game.dead)game.update(DT);
  const won=!boss.alive&&!game.dead&&event.state==='success';let claimed=false,duplicateClaim=false;
  if(won) {
    while(distance(game.player,event)>65&&game.time-start<135) {keys(game,event.x-game.player.x,event.y-game.player.y);game.update(DT);}game.keys.clear();
    claimed=game.claimWorldEvent(hunt.id);duplicateClaim=game.claimWorldEvent(hunt.id);
  }
  return {id:hunt.id,bossType:boss.type,region:boss.region,level:hunt.level,classId,style,equipment,
    fixture:{rareItems:equipment.gear.length,onlyLevelLegalBases:true,passivesMaxRank:3,noExtraActives:true,noRelicsGemsUpgradesOrCompanions:true,teleportToStartAndRunes:true,
      ambientEnemiesRemoved:true,authoredCoverRetained:true,directorDisabled:true,enemyStatsUnmodified:true},
    hp:boss.maxHp,damage:boss.damage,won,dead:game.dead,eventState:event.state,claimed,duplicateClaim,fightTime,cycles:boss.cycle||0,
    damageTaken:Math.round(damage),damagePercent:Number((damage/initialHp*100).toFixed(1)),initialPlayerHp:initialHp,finalPlayerHp:Math.round(game.player.hp),
    actions,warnings,phases:[...phases],maxShapes,notices,enemyLevel:boss.level,lootLevel:ENEMY_TYPES[boss.type].level,
    finalPlayerPosition:{x:playerRound(game.player.x),y:playerRound(game.player.y)},finalBossPosition:{x:playerRound(boss.x),y:playerRound(boss.y)},
    distanceFromEvent:playerRound(distance(game.player,event)),bossHomeDrift:playerRound(distance(boss,{x:boss.homeX,y:boss.homeY})),
    maxArenaDistance:playerRound(maxArenaDistance),maxHomeDrift:playerRound(maxHomeDrift),windupResets,failureEffects,eventAbsent:playerRound(event.absent),eventElapsed:playerRound(event.elapsed)};
}
const playerRound=value=>Number(value.toFixed(1));

const quick=process.argv.includes('--quick'),hunts=quick?NAMED_BOSS_HUNTS.filter(hunt=>[4,52,100].includes(hunt.level)):NAMED_BOSS_HUNTS;
const classes=quick?['ranger']:['ranger','guardian'],styles=['reactive','reckless'];
const results=[];for(const hunt of hunts)for(const classId of classes)for(const style of styles)results.push(probe(hunt,classId,style));
const checks=results.map(result=>({id:`${result.id}/${result.classId}/${result.style}`,correctLevel:result.enemyLevel===result.level&&result.lootLevel===result.level,
  warningsFull:result.warnings.every(warning=>warning.windup>=1.15),twoKinds:new Set(result.warnings.map(warning=>warning.id)).size>=2,
  mechanicsEngaged:result.cycles>=3,soloFinish:result.won,personalClaim:result.claimed===true&&result.duplicateClaim===false}));
await fs.writeFile(output,JSON.stringify({fixtureLimits:'Deterministic bots with generated legal Rare gear and max-rank-three passives; direct placement at start/runes, ambient isolation. Full authored arena cover retained. Native fight/actions, budgets, failure and rewards. These are reproducible regression probes, not human difficulty judgments.',results,checks},null,2));
console.log(JSON.stringify({output,results:results.map(({id,classId,style,won,dead,fightTime,cycles,damagePercent,actions,claimed})=>({id,classId,style,won,dead,fightTime,cycles,damagePercent,dodges:actions.dash||0,claimed})),checks},null,2));
if(checks.some(check=>!check.correctLevel||!check.warningsFull||!check.twoKinds)||checks.some((check,index)=>results[index].style==='reactive'&&(!check.mechanicsEngaged||!check.soloFinish||!check.personalClaim)))process.exitCode=1;
