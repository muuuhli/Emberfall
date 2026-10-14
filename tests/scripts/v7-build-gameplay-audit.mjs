// Native boss fights with legal equipment and earned point budgets. Starting
// placement and ambient isolation are fixtures, never combat shortcuts.
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { CLASSES } from '../../src/classes.js';
import { ABILITIES } from '../../src/abilities.js';
import { MASTERY_ABILITIES } from '../../src/mastery-abilities.js';
import { NAMED_BOSS_HUNTS } from '../../src/encounter-content.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { ITEMS } from '../../src/catalog.js';
import { hitShape } from '../../src/encounter-geometry.js';

const output=process.argv[2]||'/tmp/emberfall-v7-build-gameplay.json',DT=.04;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function keys(game,dx,dy){game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');}
function build(game,cls,mode){
  const gear=[];
  for(const slot of EQUIPMENT_SLOTS){
    const base=ITEM_BASES.filter(item=>equipmentSlot(item)===slot.id&&item.minLevel<=100&&(!item.classIds||item.classIds.includes(cls.id)))
      .sort((a,b)=>b.minLevel-a.minLevel||a.id.localeCompare(b.id))[0];
    const item=generateLoot({level:100,baseId:base.id,classId:cls.id,rarity:'rare',rng:rng(12771),uid:`v7-${cls.id}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw new Error('Illegal gear fixture');
    gear.push({slot:slot.id,baseId:base.id,level:item.level,rarity:item.rarity});
  }
  game.player.skillPoints=200;
  for(const a of ABILITIES.filter(a=>a.classId===cls.id))if(!game.learnAbility(a.id))throw new Error(`Cannot learn ${a.id}`);
  const learnPath=(talent,rank)=>{
    const requirements=!talent.requires?[]:Array.isArray(talent.requires)?talent.requires:[talent.requires];
    for(const requirement of requirements){
      const id=typeof requirement==='string'?requirement:requirement.id,needed=typeof requirement==='string'?talent.requiresRank||1:requirement.rank||1;
      learnPath(cls.talents.find(t=>t.id===id),needed);
    }
    while((game.skills[talent.id]||0)<rank)if(!game.learn(talent.id))throw new Error(`Cannot legally invest in ${talent.id}`);
  };
  const exclusiveGroups=new Set();
  for(const talent of cls.talents.filter(t=>t.combatEffects)){
    if(talent.exclusiveGroup&&exclusiveGroups.has(talent.exclusiveGroup))continue;
    learnPath(talent,talent.maxRank);if(talent.exclusiveGroup)exclusiveGroups.add(talent.exclusiveGroup);
  }
  for(let round=0;round<3;round++)for(const t of cls.talents.filter(t=>!t.combatEffects))if((game.skills[t.id]||0)<Math.min(3,t.maxRank))game.learn(t.id);
  const choices=mode==='new'?MASTERY_ABILITIES.filter(a=>a.classId===cls.id).slice(0,2):ABILITIES.filter(a=>a.classId===cls.id).slice(0,2);
  game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,null);
  for(let slot=0;slot<2;slot++)if(!game.setAbilityLoadout(slot,choices[slot].id))throw new Error('Invalid ability fixture');
  const potion=Object.values(ITEMS).filter(item=>item.type==='consumable'&&item.family==='health').sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  for(const item of Object.values(ITEMS))if(item.type==='consumable'&&item.stats?.hpRestore>0)game.inventory[item.id]=0;
  if(potion)game.addItem(potion.id,5);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  const pointCost=cls.talents.reduce((sum,t)=>sum+(game.skills[t.id]||0)*t.cost,0)+ABILITIES.filter(a=>a.classId===cls.id&&game.learnedAbilities[a.id]).reduce((sum,a)=>sum+a.talentCost,0);
  const suppliedPotions=Object.values(ITEMS).filter(item=>item.type==='consumable'&&item.stats?.hpRestore>0).reduce((sum,item)=>sum+(game.inventory[item.id]||0),0);
  return {gear,pointBudget:200,pointCost,suppliedPotions,unspent:game.player.skillPoints,talents:{...game.skills},
    newTalents:cls.talents.filter(t=>t.combatEffects&&game.skills[t.id]>0).map(t=>t.id),loadout:choices.map(a=>a.id),stats:game.stats()};
}
function control(game,boss,event,cls,actions,memory){
  const p=game.player,range=distance(p,boss),ranged=cls.abilities.attack.kind==='projectile',preferred=ranged?210:55;
  game.aim={x:boss.x,y:boss.y};p.face=Math.atan2(boss.y-p.y,boss.x-p.x);
  const shapes=[...(boss.phase==='windup'?boss.telegraphShapes||[]:[]),...(boss.activeShapes||[])].filter(shape=>!shape.safe);
  let dx=boss.x-p.x,dy=boss.y-p.y;
  if(range<(ranged?170:48)){dx=-dx;dy=-dy;}else if(range<=preferred)dx=dy=0;
  const act=name=>{if(game.action(name)){actions[name]=(actions[name]||0)+1;return true;}return false;};
  const danger=shapes.some(shape=>hitShape(shape,p));
  if(danger){
    const candidates=[];
    for(const length of [65,120,175,230])for(let index=0;index<16;index++){
      const angle=index*Math.PI/8,point={x:p.x+Math.cos(angle)*length,y:p.y+Math.sin(angle)*length};
      point.score=shapes.filter(shape=>hitShape(shape,point)).length*10000+(game.collides(point.x,point.y)?10000:0)+(game.inSettlement(point.x,point.y)?10000:0)
        +Math.max(0,distance(point,event)-450)*30+length+Math.abs(distance(point,boss)-preferred)*.12;candidates.push(point);
    }
    const goal=candidates.sort((a,b)=>a.score-b.score)[0];dx=goal.x-p.x;dy=goal.y-p.y;
    keys(game,dx,dy);if(boss.attackTimer<.38||boss.activeShapes?.length)act('dash');memory.channelUntil=0;
  }else{
    const incoming=game.projectiles.find(shot=>shot.owner==='enemy'&&distance(shot,p)<95);
    if(incoming){dx=-Math.sin(incoming.angle)*100;dy=Math.cos(incoming.angle)*100;keys(game,dx,dy);act('dash');memory.channelUntil=0;}
    else if(memory.channelUntil>game.time)dx=dy=0;
  }
  if(!danger&&distance(p,event)>460){dx=event.x-p.x;dy=event.y-p.y;memory.channelUntil=0;}
  keys(game,dx,dy);
  if(memory.channelUntil>game.time&&!danger)return;
  if(p.hp<game.stats().maxHp*.4)act('potion');
  // Setup before the sustained cast, so ordinary attacks cannot immediately
  // interrupt it. Dodging a real warning still takes precedence next frame.
  for(const slot of [1,0]){
    const a=ABILITIES.find(a=>a.id===game.abilityLoadout[slot]);
    if(range>(a.range||a.radius||150)||a.kind==='channel'&&(danger||Math.hypot(dx,dy)>5))continue;
    if(game.useLearnedAbility(slot)){
      actions[a.id]=(actions[a.id]||0)+1;
      if(a.kind==='channel'){memory.channelUntil=game.time+a.windup+(a.ticks-1)*a.interval+.04;return;}
    }
  }
  if(range<cls.abilities.attack.range)act('attack');
  if(range<300)act('bolt');if(range<155)act('nova');
}
function probe(cls,mode){
  const hunt=NAMED_BOSS_HUNTS.find(hunt=>hunt.level===100),game=new Game({storage:null,random:rng(8117)});
  game.selectClass(cls.id);game.start();game.player.level=100;
  const equipment=build(game,cls,mode);game.world.enemies=[];game.world.encounterDirector.nextIn=1e6;
  const event=game.world.worldEvents.find(event=>event.id===hunt.id);game.player.x=event.x;game.player.y=event.y;
  if(!game.interactWorldEvent(`${event.id}:start`))throw new Error('Cannot start native boss hunt');
  for(const rune of game.world.eventObjects.filter(o=>o.eventId===event.id&&o.role==='rune')){
    game.player.x=rune.x;game.player.y=rune.y;if(!game.interactWorldEvent(rune.id))throw new Error('Cannot bind rune');
  }
  while(!game.world.enemies.some(e=>e.eventId===event.id&&e.type===hunt.boss)&&game.time<5)game.update(DT);
  const boss=game.world.enemies.find(e=>e.eventId===event.id&&e.type===hunt.boss);if(!boss)throw new Error('No native boss');
  const start=game.time,initialHp=game.player.hp,actions={},memory={},warningKinds=new Set();let lost=0;
  const damaged=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{const actual=damaged(...args)||0;lost+=actual;return actual;};
  while(!game.dead&&event.state==='active'&&game.time-start<180){
    const target=game.world.enemies.filter(e=>e.alive&&e.eventId===event.id).sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
    if(target)control(game,target,event,cls,actions,memory);else game.keys.clear();
    game.update(DT);if(boss.encounterAction)warningKinds.add(boss.encounterAction.id);
  }
  if(!boss.alive&&!game.dead)game.update(DT);
  const won=!boss.alive&&!game.dead&&event.state==='success';let claimed=false;
  if(won){while(distance(game.player,event)>65&&game.time-start<200){keys(game,event.x-game.player.x,event.y-game.player.y);game.update(DT);}game.keys.clear();claimed=game.claimWorldEvent(event.id);if(game.claimWorldEvent(event.id))throw new Error('Duplicate reward');}
  return {classId:cls.id,mode,equipment,won,claimed,dead:game.dead,eventState:event.state,eventAbsent:event.absent,distanceFromEvent:distance(game.player,event),seconds:Math.round((game.time-start)*100)/100,damageTaken:Math.round(lost),initialHp,cycles:boss.cycle,
    warningKinds:[...warningKinds],bossMaxHp:boss.maxHp,bossRemainingHp:boss.hp,actions};
}
const results=[];for(const cls of CLASSES)for(const mode of ['existing','new'])results.push(probe(cls,mode));
const checks=results.map(r=>({classId:r.classId,mode:r.mode,finite:Object.values(r.equipment.stats).every(Number.isFinite),legalPoints:r.equipment.unspent>=0&&r.equipment.pointCost+r.equipment.unspent===r.equipment.pointBudget&&r.equipment.newTalents.length===3&&r.equipment.suppliedPotions===5,
  warningVariety:r.warningKinds.length>=2,nativeReward:r.won&&r.claimed,newSkillsUsed:r.mode!=='new'||r.equipment.loadout.every(id=>r.actions[id]>0)}));
await fs.writeFile(output,JSON.stringify({humanPlaytest:false,fixture:'All eight classes, native Asterion fight and damage, legal level100 Rare gear, 200 earned level points, five supplied potions, original arena cover. Only start/rune placement and ambient/director isolation are fixtures. A loss describes this deterministic controller, not a human class verdict.',results,checks},null,2));
console.log(JSON.stringify({output,results:results.map(({classId,mode,won,seconds,damageTaken,cycles,actions})=>({classId,mode,won,seconds,damageTaken,cycles,actions})),checks},null,2));
if(checks.some(c=>!c.finite||!c.legalPoints||!c.warningVariety||!c.nativeReward||!c.newSkillsUsed))process.exitCode=1;
