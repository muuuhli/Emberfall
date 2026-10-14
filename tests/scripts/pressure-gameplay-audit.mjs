// Native Game waves, real warning/spawn/combat paths; declared setup fixtures.
// node tests/scripts/pressure-gameplay-audit.mjs [output.json] [--quick] [--tier=relentless]
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { REGIONS, SKILLS, ITEMS } from '../../src/catalog.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';
import { BESTIARY_ENEMIES } from '../../src/bestiary.js';

const output=process.argv[2]||'/tmp/emberfall-pressure-gameplay.json',DT=.04;
const rng=initial=>{let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const phases=['standard','hard','relentless'];
const regions={20:'jadeauen',52:'mondbruch',100:'nexusriss'};
function loadout(game,level,classId) {
  const gear=[];
  for(const slot of EQUIPMENT_SLOTS) {
    const base=ITEM_BASES.filter(item=>equipmentSlot(item)===slot.id&&item.minLevel<=level&&(!item.classIds||item.classIds.includes(classId)))
      .sort((a,b)=>b.minLevel-a.minLevel||(b.stats.damage||0)-(a.stats.damage||0)||(b.stats.maxHp||0)-(a.stats.maxHp||0)||a.id.localeCompare(b.id))[0];
    if(!base)throw new Error(`Missing fixture for ${classId}/${level}/${slot.id}`);
    const item=generateLoot({level,baseId:base.id,classId,rarity:'rare',rng:rng(8177+level),uid:`pressure-${level}-${classId}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw new Error(`Invalid fixture equipment ${base.id}`);gear.push({slot:slot.id,baseId:base.id,rarity:item.rarity});
  }
  game.player.skillPoints=2+(level-1)*2;
  for(let round=0;round<4;round++)for(const talent of SKILLS.filter(t=>t.classId===classId&&(t.minLevel||1)<=level))if((game.skills[talent.id]||0)<Math.min(3,talent.maxRank))game.learn(talent.id);
  const healing=Object.values(ITEMS).filter(item=>item.type==='consumable'&&(item.minLevel||1)<=level&&item.family==='health').sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  if(healing)game.addItem(healing.id,5);game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  return {gear,talents:{...game.skills},unspentPoints:game.player.skillPoints,healing:healing?.id,stats:game.stats()};
}
function setup(level,classId) {
  const game=new Game({storage:null,random:rng(7319+level)});game.selectClass(classId);game.start();game.player.level=level;
  for(const key of ['enemies','trees','rocks','structures','river','bridges','worldEvents','interactions'])game.world[key]=[];
  const region=REGIONS.find(region=>region.id===regions[level]);game.player.x=region.x+region.w*.55;game.player.y=region.y+region.h*.45;
  const equipment=loadout(game,level,classId);game.effects=[];return {game,equipment};
}
function moveKeys(game,dx,dy) {game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');}
function controller(game,style,actions) {
  if(style==='passive')return;
  const foes=game.world.enemies.filter(enemy=>enemy.alive&&(enemy.directorId||enemy.summonedBy)).sort((a,b)=>distance(a,game.player)-distance(b,game.player));
  const target=foes[0];if(!target)return;
  const p=game.player,stats=game.stats(),range=distance(p,target),ranged=game.classId==='ranger';game.aim={x:target.x,y:target.y};p.face=Math.atan2(target.y-p.y,target.x-p.x);
  const action=name=>{if(game.action(name))actions[name]=(actions[name]||0)+1;};
  if(style==='reactive') {
    let dx=target.x-p.x,dy=target.y-p.y;
    const danger=foes.find(enemy=>enemy.phase==='windup'&&(enemy.telegraphPattern==='charge'&&distance(enemy,p)<(enemy.telegraphChargeDistance||180)+45||enemy.telegraphPattern==='hex'&&distance({x:enemy.telegraphX,y:enemy.telegraphY},p)<(enemy.telegraphRadius||65)+35||distance(enemy,p)<(enemy.telegraphRadius||65)+35));
    const hostile=game.projectiles.find(projectile=>projectile.owner==='enemy'&&distance(projectile,p)<95);
    if(danger) {
      if(danger.telegraphPattern==='charge'){dx=-Math.sin(danger.telegraphAngle??danger.face)*100;dy=Math.cos(danger.telegraphAngle??danger.face)*100;}
      else {dx=p.x-(danger.telegraphX??danger.x);dy=p.y-(danger.telegraphY??danger.y);if(Math.hypot(dx,dy)<5)dx=dy=100;}
      moveKeys(game,dx,dy);action('dash');
    } else if(hostile) {dx=-Math.sin(hostile.angle)*100;dy=Math.cos(hostile.angle)*100;moveKeys(game,dx,dy);action('dash');}
    else {
      if(ranged&&range<182){dx=-dx;dy=-dy;}
      else if(range<=(ranged?215:70))dx=dy=0;
      moveKeys(game,dx,dy);
    }
  } else game.keys.clear();
  if(range<(ranged?560:100))action('attack');
  if(range<300&&(ranged||p.shield<stats.maxHp*.1))action('bolt');
  if(range<170)action('nova');
  if(style==='reactive'&&p.hp<stats.maxHp*.4)action('potion');
}
function probe(level,classId,tier,style) {
  const {game,equipment}=setup(level,classId),state=game.world.encounterDirector;
  // Only the scheduler is accelerated. Planning, eight-second warning, spawn
  // geometry, real enemy budgets and actual damage remain unmodified.
  state.sequence=phases.indexOf(tier);state.nextIn=DT;game.update(DT);
  if(state.stage!=='warning')throw new Error(`Director could not plan ${level}/${classId}/${tier}`);
  const warning={seconds:state.remaining,plan:state.plan.map(p=>({...p}))};
  while(state.stage==='warning'&&!game.dead)game.update(DT);
  if(state.stage!=='active')throw new Error(`Director did not materialize ${level}/${classId}/${tier}`);
  const originals=game.world.enemies.filter(enemy=>enemy.directorId),initial=originals.map(enemy=>({id:enemy.id,type:enemy.type,pattern:BESTIARY_ENEMIES[enemy.type].combat.pattern,level:enemy.level,hp:enemy.maxHp,damage:enemy.damage,elite:enemy.elite}));
  const actions={},start=game.time,hp=game.player.hp,mana=game.player.mana,anchor={...state.anchor},notices=[];let damage=0,maxAlive=originals.length,maxProjectiles=0,maxWindups=0,escaped=false;
  const damagePlayer=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{const applied=damagePlayer(...args)||0;damage+=applied;return applied;};game.onNotice=(text,tone)=>{if(notices.length<12)notices.push({text,tone});};
  while(!game.dead&&state.stage==='active'&&game.time-start<85) {
    controller(game,style,actions);game.update(DT);
    maxAlive=Math.max(maxAlive,game.world.enemies.filter(e=>e.alive&&(e.directorId||e.summonedBy)).length);
    maxProjectiles=Math.max(maxProjectiles,game.projectiles.filter(p=>p.owner==='enemy').length);
    maxWindups=Math.max(maxWindups,game.world.enemies.filter(e=>e.alive&&e.phase==='windup').length);
    escaped ||= distance(game.player,anchor)>1000||game.inSettlement();
  }
  const killed=originals.filter(enemy=>!enemy.alive).length,won=killed===originals.length;
  return {level,classId,tier,style,warning,initial,equipment,dead:game.dead,won,killed,total:originals.length,escaped,
    time:Number((game.time-start).toFixed(2)),damageTaken:Math.round(damage),damagePct:Number((damage/hp*100).toFixed(1)),initialHp:hp,finalHp:Math.round(game.player.hp),finalMana:Math.round(game.player.mana),initialMana:mana,
    endLevel:game.player.level,cycles:originals.reduce((sum,enemy)=>sum+(enemy.cycle||0),0),maxAlive,maxProjectiles,maxWindups,actions,notices};
}
const quick=process.argv.includes('--quick'),profiles=quick?[[52,'ranger']]:[[20,'ranger'],[52,'ranger'],[100,'ranger'],[20,'guardian'],[52,'guardian'],[100,'guardian']];
const chosen=process.argv.find(argument=>argument.startsWith('--tier='))?.slice(7),tiers=chosen?[chosen]:phases;
if(tiers.some(tier=>!phases.includes(tier)))throw new Error('Unknown encounter tier.');
const results=[];
for(const [level,classId] of profiles)for(const tier of tiers)for(const style of ['passive','stationary','reactive'])results.push(probe(level,classId,tier,style));
const summary=results.map(({level,classId,tier,style,dead,won,killed,total,escaped,time,damagePct,maxAlive,cycles,actions,endLevel})=>({level,classId,tier,style,dead,won,killed,total,escaped,time,damagePct,maxAlive,cycles,actions,endLevel}));
const audit={kind:'Native real-Game mixed-wave probes',humanPlaytest:false,instantCombatKills:false,campaignCompleted:false,
  fixtures:['Declared level, class, seven rare items, talents at rank≤3 and five eligible healing consumables','Ambient enemies, cover and existing world events removed; regional geometry, shrines and levels remain','Scheduler sequence and nextIn select the desired real warning; full eight-second warning and spawn rules execute','Passive uses no actions; stationary fires normal skills without movement or potions; reactive aims, moves, dodges and uses at most five potions'],
  baseline:'/tmp/emberfall-pressure-baseline.json (prior v5 native single-target audit, freshly run before director integration)',results,summary};
await fs.writeFile(output,JSON.stringify(audit,null,2));console.log(JSON.stringify({output,summary},null,2));
if(results.some(result=>result.initial.some(enemy=>enemy.level>REGIONS.find(r=>r.id===regions[result.level]).maxLevel)||result.warning.seconds!==8))process.exitCode=1;
