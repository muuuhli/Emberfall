// Native Game combat probes and progression-gate fixtures; no campaign completion.
// node tests/scripts/v5-gameplay-audit.mjs [output.json]
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { HUNTS, huntRewardLevel } from '../../src/endgame.js';
import { DUNGEONS } from '../../src/dungeons.js';
import { ENEMY_TYPES, SKILLS, ITEMS } from '../../src/catalog.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';

const output=process.argv[2]||'/tmp/emberfall-v5-gameplay-audit.json',DT=.04;
const rng=initial=>{let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const make=level=>{const g=new Game({storage:null,random:rng(7319+level)});g.selectClass('ranger');g.start();g.player.level=level;return g;};
function loadout(game,level) {
  const gear=[];
  for(const slot of EQUIPMENT_SLOTS) {
    const bases=ITEM_BASES.filter(b=>equipmentSlot(b)===slot.id&&b.minLevel<=level&&(!b.classIds||b.classIds.includes('ranger')))
      .sort((a,b)=>b.minLevel-a.minLevel||(b.stats.damage||0)-(a.stats.damage||0)||(b.stats.maxHp||0)-(a.stats.maxHp||0)||a.id.localeCompare(b.id));
    const base=bases[0];if(!base)throw new Error(`Missing fixture ${slot.id}`);
    const item=generateLoot({level,baseId:base.id,classId:'ranger',rarity:'rare',rng:rng(8177+level),uid:`v5-probe-${level}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw new Error(`Could not equip fixture ${base.id}`);
    gear.push({slot:slot.id,baseId:base.id,level:item.level,rarity:item.rarity});
  }
  game.player.skillPoints=2+(level-1)*2;
  const eligible=SKILLS.filter(t=>t.classId==='ranger'&&(t.minLevel||1)<=level);
  for(let round=0;round<4;round++)for(const talent of eligible)if((game.skills[talent.id]||0)<Math.min(3,talent.maxRank))game.learn(talent.id);
  const healing=Object.values(ITEMS).filter(i=>i.type==='consumable'&&(i.minLevel||1)<=level&&i.family==='health')
    .sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  if(healing)game.addItem(healing.id,5);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  return {gear,talents:{...game.skills},unspentPoints:game.player.skillPoints,healing:healing?.id,stats:game.stats()};
}
function keys(game,dx,dy) {
  game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');
  if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');
}
function action(game,name,log) {if(game.action(name))log[name]=(log[name]||0)+1;}
// Same basic aim, distance and windup response as the V4 adventure controller.
// It does not read every projectile trajectory or choose learned extra skills.
function fightTick(game,target,log) {
  const p=game.player,s=game.stats(),d=dist(p,target);game.aim={x:target.x,y:target.y};p.face=Math.atan2(target.y-p.y,target.x-p.x);
  let dx=target.x-p.x,dy=target.y-p.y;
  const threat=game.world.enemies.filter(e=>e.alive&&e.phase==='windup'&&dist(e,p)<(e.telegraphRadius||70)+35).sort((a,b)=>dist(a,p)-dist(b,p))[0];
  if(threat) {dx=p.x-(threat.telegraphX??threat.x);dy=p.y-(threat.telegraphY??threat.y);if(Math.hypot(dx,dy)<5){dx=dy=1;}keys(game,dx,dy);action(game,'dash',log);}
  else if(d<182) {dx=-dx;dy=-dy;}
  else if(d<=210)dx=dy=0;
  keys(game,dx,dy);
  if(d<500)action(game,'attack',log);if(d<300)action(game,'bolt',log);if(d<155)action(game,'nova',log);
  if(p.hp<s.maxHp*.4)action(game,'potion',log);game.update(DT);
}
function probe(level,id) {
  const game=make(level),equipment=loadout(game,level),def=HUNTS.find(h=>h.id===id),offered=game.startHunt(id);
  const originals=[...game.world.enemies];
  // Isolate existing authored actors. Their real region, level, HP, damage,
  // windup, abilities, loot and native kill accounting are never substituted.
  game.world.trees=[];game.world.rocks=[];game.world.structures=[];game.world.shrines=[];game.world.worldEvents=[];game.world.interactions=[];
  const fights=[];
  for(const objective of def.objectives.filter(o=>o.kind!=='dungeon')) {
    const type=objective.kind==='boss'?`${objective.target}_boss`:objective.target;
    const enemy=originals.filter(e=>e.type===type&&e.region===def.region).sort((a,b)=>a.level-b.level)[0];
    if(!enemy) {fights.push({type,error:'missing actual target'});continue;}
    game.world.enemies=[enemy];game.projectiles=[];game.hazards=[];game.effects=[];game.summons=[];
    game.player.x=enemy.x+210;game.player.y=enemy.y;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.player.invulnerable=0;
    game.dead=false;game.paused=false;for(const key of Object.keys(game.cooldowns))game.cooldowns[key]=0;
    const start=game.time,initialHp=game.player.hp,actions={},observedMinions=new Set();let damage=0,leashWindupResets=0;
    const damagePlayer=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{const applied=damagePlayer(...args)||0;damage+=applied;return applied;};
    while(enemy.alive&&!game.dead&&game.time-start<110) {
      const target=game.world.enemies.filter(e=>e.alive).sort((a,b)=>dist(a,game.player)-dist(b,game.player))[0];
      const phase=enemy.phase,cycle=enemy.cycle||0;fightTick(game,target,actions);
      for(const minion of game.world.enemies.filter(e=>e.summonedBy===enemy.id))observedMinions.add(minion.id);
      if(phase==='windup'&&enemy.phase==='idle'&&(enemy.cycle||0)===cycle&&dist(enemy,{x:enemy.homeX,y:enemy.homeY})>285)leashWindupResets++;
    }
    game.damagePlayer=damagePlayer;
    fights.push({type,sourceId:enemy.id,region:enemy.region,enemyLevel:enemy.level,hp:enemy.maxHp,damage:enemy.damage,
      won:!enemy.alive,dead:game.dead,time:Number((game.time-start).toFixed(2)),cycles:enemy.cycle||0,
      damageTaken:damage,initialPlayerHp:initialHp,finalPlayerHp:Math.round(game.player.hp),actions,leashWindupResets,
      homeDrift:Number(dist(enemy,{x:enemy.homeX,y:enemy.homeY}).toFixed(1)),livingMinionsObserved:observedMinions.size,
      minionsRemaining:game.world.enemies.filter(e=>e.summonedBy===enemy.id).length});
  }
  return {level,id,offered,fixture:{classId:'ranger',sevenRareItems:true,passivesMaxRank:3,noExtraActives:true,noRelics:true,
    noGemsOrUpgrades:true,noCompanion:true,teleportToTargets:true,ambientEnemiesAndCoverRemoved:true,
    fullHpManaAndCooldownsBetweenFights:true,fullHuntCompleted:false},equipment,fights,
    huntProgress:game.endgame.active.find(h=>h.id===id)?.counts,endLevel:game.player.level};
}
function gateProbe() {
  const game=make(12),early=HUNTS.find(h=>h.id==='hunt-wurzelgewoelbe');
  const accepted=game.startHunt(early.id);game.player.level=100;
  // Counter fixtures exercise the trusted progression API, not actual combats.
  for(const objective of early.objectives)game.event(objective.kind,objective.target,objective.count);
  const deferredClaim=game.claimHunt(early.id),lateEnroll=game.startHunt(early.id);
  const fixtureComplete=id=>{const h=HUNTS.find(h=>h.id===id);game.endgame.completed[id]=(game.endgame.completed[id]||0)+1;game.endgame.totalClaims++;game.endgame.tokens+=h.reward.tokens;};
  for(let i=0;i<3;i++)fixtureComplete(early.id);
  const lowRewardCap=huntRewardLevel(game),rarePurchased=game.redeemHuntReward('hunt-weapon'),lowItem=Object.values(game.generatedItems).find(i=>i.source==='hunt_reward');
  for(let i=0;i<12;i++)fixtureComplete(early.id);
  const lowEpicPurchased=game.redeemHuntReward('hunt-epic');
  fixtureComplete('hunt-nexus');const highRewardCap=huntRewardLevel(game),highPurchased=game.redeemHuntReward('hunt-epic');
  const levels=Object.values(game.generatedItems).filter(i=>i.source==='hunt_reward').map(i=>({level:i.level,rarity:i.rarity}));
  return {fixture:'Trusted objective counters and completed hunt records; no synthetic combat result is claimed',accepted,deferredClaim,lateEnroll,
    lowRewardCap,rarePurchased,lowItemLevel:lowItem?.level,lowEpicPurchased,highRewardCap,highPurchased,levels,
    lowHistoryBlocksL100:accepted&&deferredClaim&&!lateEnroll&&lowRewardCap<100&&lowItem?.level<100&&!lowEpicPurchased,
    bankedSealsBecomeHighLevelAfterRelevantCompletion:highRewardCap===100&&highPurchased};
}
function dungeonGates() {
  return HUNTS.filter(h=>h.objectives.some(o=>o.kind==='dungeon')).map(h=>{
    const objective=h.objectives.find(o=>o.kind==='dungeon'),dungeon=DUNGEONS.find(d=>d.id===objective.target),g=make(h.minLevel);
    g.player.x=dungeon.entrance.x;g.player.y=dungeon.entrance.y;
    const offered=g.startHunt(h.id),requestedTier=objective.minTier||1,firstAttempt=g.enterDungeon(dungeon.id,requestedTier);
    return {id:h.id,offered,minLevel:h.minLevel,dungeonMin:dungeon.minLevel,dungeonLevel:dungeon.level,party:h.partyRequired,
      requestedTier,firstAttempt,priorTier:0,reason:h.partyRequired>1?`Requires ${h.partyRequired} real players${requestedTier>1?' and a prior depth 1 completion':''}`:requestedTier>1?'Requires prior depth 1 completion':'Direct solo entry'};
  });
}

const reference=make(100);
const targets=HUNTS.map(h=>({id:h.id,region:h.region,minLevel:h.minLevel,maxLevel:h.maxLevel,party:h.partyRequired,
  objectives:h.objectives.map(o=>({kind:o.kind,target:o.target,required:o.count,minTier:o.minTier,
    actors:o.kind==='dungeon'?[]:reference.world.enemies.filter(e=>e.type===(o.kind==='boss'?`${o.target}_boss`:o.target)).map(e=>({region:e.region,level:e.level,hp:e.maxHp,damage:e.damage}))}))}));
const probes=[probe(52,'hunt-moon'),probe(84,'hunt-blood'),probe(100,'hunt-nexus')],progressionGate=gateProbe();
const audit={kind:'Native Game probes with declared fixtures',humanPlaytest:false,campaignCompleted:false,instantCombatKills:false,
  targets,dungeonGates:dungeonGates(),progressionGate,probes};
await fs.writeFile(output,JSON.stringify(audit,null,2));
console.log(JSON.stringify({output,progressionGate,probes:probes.map(({level,id,offered,fights,huntProgress,endLevel})=>({level,id,offered,fights,huntProgress,endLevel})),dungeonGates:audit.dungeonGates},null,2));
if(!progressionGate.lowHistoryBlocksL100||targets.some(h=>h.objectives.some(o=>o.kind!=='dungeon'&&(!o.actors.length||o.actors.some(e=>e.region!==h.region)))))process.exitCode=1;
