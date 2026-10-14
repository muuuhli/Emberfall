import { BESTIARY_ENEMIES, REGION_ENEMY_POOLS, createBestiaryEnemy } from './bestiary.js';
import { REGIONS } from './content.js';
import { EXPANSION_REGIONS } from './expansion.js';

// Wilderness time, rather than a wall clock, drives a bounded local encounter.
// The open world keeps its authored levels and safe approaches. No enemies are
// created in a settlement, dungeon or arena, or on top of a living player.
const TIERS=['standard','hard','relentless'];
const STAGES=['calm','warning','active'];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const bounded=(value,lo,hi)=>Number.isFinite(value)&&value>=lo&&value<=hi;
const labels={standard:'Aschenjagd',hard:'Finsteres Rudel',relentless:'Blutnacht'};
const regions=[...REGIONS,...EXPANSION_REGIONS];
const seedRandom=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export const ENCOUNTER_RULES=Object.freeze({firstIn:75,firstMid:40,firstLate:25,warning:8,lifetime:90,maxActors:10,maxLocal:12,minSpawnDistance:160});

export function createEncounterDirector(){return {version:1,elapsed:0,sequence:0,nextIn:75,stage:'calm',tier:'standard',remaining:0,region:null,anchor:null,plan:[]};}

function localThreatCount(game,anchor,living){
  const nearby=living.filter(g=>!g.dead&&distance(g.player,anchor)<1000);
  return game.world.enemies.filter(e=>e.alive&&(distance(e,anchor)<600||nearby.some(g=>distance(e,g.player)<600))).length;
}

/** Every new spawn in an active pursuit shares the same local capacity. */
export function encounterSpawnBlocked(game,point,living=[game]){
  const state=game.world.encounterDirector;
  if(state?.stage!=='active'||!state.anchor)return false;
  const nearby=living.filter(g=>!g.dead&&distance(g.player,state.anchor)<1000);
  if(distance(point,state.anchor)>=650&&!nearby.some(g=>distance(point,g.player)<600))return false;
  return localThreatCount(game,state.anchor,living)>=ENCOUNTER_RULES.maxLocal;
}

function actorId(state,index){return `director-${state.sequence}-${index}`;}
function actorFromPlan(state,point,index){
  const enemy=createBestiaryEnemy(point.type,actorId(state,index),point.x,point.y,{level:point.level,region:state.region});
  const hpFactor=point.elite?(state.tier==='relentless'?3.2:2.3):state.tier==='relentless'?1.45:state.tier==='hard'?1.12:1;
  const partySize=point.partySize||1,partyHpScale=1+(partySize-1)*.20;
  enemy.hp=enemy.maxHp=Math.round(Math.round(enemy.maxHp*hpFactor)*partyHpScale);
  enemy.damage=Math.round(enemy.damage*(point.elite?(state.tier==='relentless'?1.6:1.3):state.tier==='relentless'?1.25:1));
  enemy.xp=Math.max(1,Math.round(enemy.xp*.5));enemy.gold=Math.max(1,Math.round(enemy.gold*.5));
  return Object.assign(enemy,{directorId:`director-${state.sequence}`,packId:`director-${state.sequence}`,encounterTier:state.tier,
    elite:point.elite,partySize,partyHpScale,flankSide:index%2?1:-1,aggro:true,phase:'chase',attackTimer:.7+index*.13,respawnAt:Infinity});
}

function protectedPoint(game,point){
  return game.inSettlement(point.x,point.y)||game.collides(point.x,point.y,20)||
    (game.npcs||[]).some(n=>distance(n,point)<180)||
    (game.world.dungeonEntrances||[]).some(n=>distance(n,point)<160);
}
function eligible(game){
  if(game.dead||game.downed||game.player.downed||game.player.alive===false||!Number.isFinite(game.player.hp)||game.player.hp<=0||game.worldMode==='pvp'||game.dungeonInstance||game.player.level<4||game.inSettlement())return false;
  if(game.world.worldEvents?.some(event=>event.state==='active'&&distance(event,game.player)<800))return false;
  const region=game.regionAt();
  return !!REGION_ENEMY_POOLS[region.id]&&game.player.level>=region.level-4;
}
function clearPack(game,state,nextIn){
  const removed=new Set(game.world.enemies.filter(e=>e.directorId).map(e=>e.id));
  for(const enemy of game.world.enemies)if(removed.has(enemy.summonedBy))removed.add(enemy.id);
  game.world.enemies=game.world.enemies.filter(e=>!e.directorId&&!removed.has(e.summonedBy));
  game.projectiles=game.projectiles.filter(p=>!removed.has(p.attackerId));
  game.hazards=game.hazards.filter(h=>!h.directorId);
  Object.assign(state,{stage:'calm',remaining:0,nextIn,region:null,anchor:null,plan:[]});
}
function warn(game,state){
  const color=state.tier==='relentless'?'#db718b':state.tier==='hard'?'#c883b1':'#c79366';
  state.plan.forEach((point,index)=>game.hazards.push({id:`director-warning-${state.sequence}-${index}`,directorId:`director-${state.sequence}`,
    kind:'warning',x:point.x,y:point.y,radius:34,life:state.remaining,maxLife:8,windup:true,color}));
}

function planEncounter(game,state,target,party){
  const region=target.regionAt(),pool=REGION_ENEMY_POOLS[region.id];
  const sequence=state.sequence+1,phase=(sequence-1)%3;
  const tier=phase===2&&target.player.level>=20?'relentless':phase>0?'hard':'standard';
  const early=target.player.level<12,nearParty=[...new Map(party.filter(g=>eligible(g)&&g.regionAt().id===region.id&&distance(g.player,target.player)<700).map(g=>[g.player.id||g.player,g])).values()];
  const partySize=Math.max(1,Math.min(8,nearParty.length));
  const base=early?(phase===0?2:phase===1?3:4):tier==='standard'?3:tier==='hard'?5:7;
  const local=game.world.enemies.filter(e=>e.alive&&!e.directorId&&distance(e,target.player)<600).length;
  const count=Math.min(ENCOUNTER_RULES.maxActors,base+Math.min(3,nearParty.length-1),ENCOUNTER_RULES.maxLocal-local);
  if(count<2)return false;
  const rng=seedRandom((game.world.seed||826404)^Math.imul(sequence,2654435761)^Math.round(target.player.x+target.player.y));
  const roles=[['melee','charge','brute','cleave'],['ranged','fan','burst'],['hex','ring','summoner']];
  const maxLevel=region.maxLevel||Math.max(...pool.map(type=>BESTIARY_ENEMIES[type].level));
  const level=Math.min(maxLevel,Math.max(region.level,Math.min(target.player.level+1,region.level+3+(tier==='relentless'?2:0))));
  const anchor={x:target.player.x,y:target.player.y},angle=target.player.face+rng()*Math.PI*.5,plan=[];
  for(let index=0;index<count;index++){
    const chargers=tier==='relentless'&&index===0?pool.filter(type=>BESTIARY_ENEMIES[type].combat.pattern==='charge'):[];
    const candidates=chargers.length?chargers:pool.filter(type=>roles[index%3].includes(BESTIARY_ENEMIES[type].combat.pattern));
    const type=(candidates.length?candidates:pool)[Math.floor(rng()*(candidates.length||pool.length))];
    for(let attempt=0;attempt<8;attempt++){
      // A broad arc leaves a clear retreat direction instead of enclosing the
      // player in an unavoidable ring. Marker positions freeze during warning.
      const bearing=angle+(index/Math.max(1,count-1)-.5)*Math.PI*1.32+(attempt-3)*.07;
      const radius=350+rng()*110,point={type,level,x:anchor.x+Math.cos(bearing)*radius,y:anchor.y+Math.sin(bearing)*radius,elite:!early&&tier!=='standard'&&index<2,partySize};
      if(game.regionAt(point.x,point.y).id!==region.id||protectedPoint(game,point)||party.some(g=>distance(g.player,point)<240)||plan.some(p=>distance(p,point)<60))continue;
      plan.push(point);break;
    }
  }
  if(plan.length<2)return false;
  if(!early&&tier!=='standard')plan.forEach((point,index)=>{point.elite=index<2;});
  Object.assign(state,{sequence,stage:'warning',tier,remaining:8,nextIn:0,region:region.id,anchor,plan});
  warn(game,state);
  for(const ally of nearParty)ally.notice(`${labels[tier]} naht · ${plan.length} Gegner. Markierungen beachten oder zurückziehen.`, 'danger');
  game.change();return true;
}

/** Called once by the shared-world authority. It never modifies PvP actors. */
export function updateEncounterDirector(game,dt,partyGames=[game]){
  if(game.dungeonInstance||game.worldMode==='pvp'||game.world.isDungeon||game.world.isPvp)return;
  const state=game.world.encounterDirector||=createEncounterDirector();
  const living=partyGames.filter(g=>!g.dead&&g.player.hp>0&&g.worldMode!=='pvp');
  const explorers=living.filter(eligible);
  if(state.stage!=='calm'&&(!explorers.some(g=>g.regionAt().id===state.region&&distance(g.player,state.anchor)<1000))){clearPack(game,state,60);return;}
  if(!explorers.length)return;
  if(state.sequence===0&&state.elapsed===0)state.nextIn=Math.min(state.nextIn,explorers.some(g=>g.player.level>=52)?25:explorers.some(g=>g.player.level>=20)?40:75);
  state.elapsed+=dt;
  if(state.stage==='calm'){
    state.nextIn=Math.max(0,state.nextIn-dt);
    if(state.nextIn<=0){const target=explorers[(state.sequence||0)%explorers.length];if(!planEncounter(game,state,target,living))state.nextIn=15;}
    return;
  }
  state.remaining=Math.max(0,state.remaining-dt);
  if(state.stage==='warning'){
    if(state.remaining>1e-8&&!game.hazards.some(h=>h.directorId))warn(game,state);
    if(state.remaining>1e-8)return;
    if(!explorers.some(g=>g.regionAt().id===state.region&&distance(g.player,state.anchor)<650)){clearPack(game,state,55);return;}
    const existing=localThreatCount(game,state.anchor,living);
    const capacity=Math.max(0,ENCOUNTER_RULES.maxLocal-existing);
    // A player may walk into a warning. That marker cannot materialize a foe
    // underneath them, even if they move there during the final warning tick.
    let spawned=0;
    state.plan.forEach((point,index)=>{
      if(spawned>=capacity)return;
      if(protectedPoint(game,point)||living.some(g=>distance(g.player,point)<ENCOUNTER_RULES.minSpawnDistance))return;
      game.world.enemies.push(actorFromPlan(state,point,index));spawned++;
    });
    game.hazards=game.hazards.filter(h=>!h.directorId);
    if(!spawned){clearPack(game,state,55);return;}
    state.stage='active';state.remaining=ENCOUNTER_RULES.lifetime;game.change();
  } else {
    const survivors=game.world.enemies.filter(e=>e.directorId&&e.alive);
    if(!survivors.length){
      for(const ally of explorers.filter(g=>distance(g.player,state.anchor)<1000))ally.notice(`${labels[state.tier]} überstanden · kurze Atempause.`, 'success');
      clearPack(game,state,state.tier==='relentless'?65:state.tier==='hard'?45:40);game.change();
    }else if(state.remaining<=1e-8){clearPack(game,state,60);game.change();}
  }
}

export function encounterSummary(game){
  const state=game.world.encounterDirector;
  if(!state||game.dungeonInstance||game.worldMode==='pvp'||game.inSettlement()||!state.anchor||distance(game.player,state.anchor)>1100)return {active:false,stage:'calm',tier:'standard',label:'',remaining:0,count:0};
  return {active:state.stage!=='calm',stage:state.stage,tier:state.tier,label:labels[state.tier],remaining:Math.ceil(state.remaining),
    count:state.stage==='warning'?state.plan.length:game.world.enemies.filter(e=>e.alive&&e.directorId).length};
}

export function captureEncounterDirector(world){
  const state=world.encounterDirector||createEncounterDirector();
  return {...state,anchor:state.anchor?{...state.anchor}:null,plan:state.plan.map(p=>({...p})),actors:world.enemies.filter(e=>e.directorId).map(e=>({id:e.id,hp:e.hp,alive:e.alive,x:e.x,y:e.y}))};
}
export function validateEncounterDirectorSave(saved){
  if(saved===undefined)return true;
  if(!saved||saved.version!==1||!bounded(saved.elapsed,0,1e7)||!Number.isSafeInteger(saved.sequence)||saved.sequence<0||saved.sequence>1e7||!bounded(saved.nextIn,0,75)||!STAGES.includes(saved.stage)||!TIERS.includes(saved.tier)||!bounded(saved.remaining,0,90)||!Array.isArray(saved.plan)||saved.plan.length>10||!Array.isArray(saved.actors)||saved.actors.length>10)return false;
  if(saved.stage==='calm')return saved.region===null&&saved.anchor===null&&saved.plan.length===0&&saved.actors.length===0&&saved.remaining===0;
  if(!REGION_ENEMY_POOLS[saved.region]||saved.sequence<1||!saved.anchor||!bounded(saved.anchor.x,30,19200)||!bounded(saved.anchor.y,30,14400)||saved.plan.length<2||saved.stage==='warning'&&(saved.remaining>8||saved.actors.length))return false;
  const region=regions.find(r=>r.id===saved.region),maxLevel=region.maxLevel||Math.max(...REGION_ENEMY_POOLS[saved.region].map(type=>BESTIARY_ENEMIES[type].level));
  if(saved.plan.some(p=>!p||!REGION_ENEMY_POOLS[saved.region].includes(p.type)||!Number.isInteger(p.level)||!bounded(p.level,region.level,maxLevel)||!bounded(p.x,Math.max(30,region.x),Math.min(19200-30,region.x+region.w))||!bounded(p.y,Math.max(30,region.y),Math.min(14400-30,region.y+region.h))||distance(p,saved.anchor)>465||typeof p.elite!=='boolean'||saved.tier==='standard'&&p.elite||p.partySize!==undefined&&(!Number.isInteger(p.partySize)||!bounded(p.partySize,1,8))))return false;
  const ids=new Set();
  return saved.actors.every(e=>{
    const index=saved.plan.findIndex((_,i)=>actorId(saved,i)===e?.id);
    if(index<0||ids.has(e.id)||!bounded(e.hp,0,actorFromPlan(saved,saved.plan[index],index).maxHp)||typeof e.alive!=='boolean'||e.alive!== (e.hp>0)||!bounded(e.x,30,19200)||!bounded(e.y,30,14400)||distance(e,saved.anchor)>1200)return false;
    ids.add(e.id);return true;
  });
}
export function restoreEncounterDirector(world,saved){
  // Raw server overlays never supply canonical combat budgets or resurrect
  // defeated patrols. Old journeys simply acquire the first wilderness timer.
  world.enemies=world.enemies.filter(e=>!e.directorId&&!(typeof e.summonedBy==='string'&&e.summonedBy.startsWith('director-')));
  if(!saved||!validateEncounterDirectorSave(saved)){world.encounterDirector=createEncounterDirector();return;}
  const {actors,...state}=saved;
  world.encounterDirector={...state,anchor:state.anchor?{...state.anchor}:null,plan:state.plan.map(p=>({...p}))};
  if(state.stage==='active')for(const actor of actors){
    const index=state.plan.findIndex((_,i)=>actorId(state,i)===actor.id),enemy=actorFromPlan(state,state.plan[index],index);
    Object.assign(enemy,{x:actor.x,y:actor.y,hp:actor.hp,alive:actor.alive,aggro:actor.alive});world.enemies.push(enemy);
  }
}

/** Regional respawns increase late-world activity without reviving near players. */
export function ordinaryRespawnDelay(enemy,definition){return (enemy.level||definition.level)>=12?32:55;}
