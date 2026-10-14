// Raid choreography binds deterministic authored warnings to the real Game
// simulation. Only the authority calls this adapter; all deadlines use combat
// seconds, so a stopped server cannot silently resolve a warning on restart.
import { BOSS_ENCOUNTERS, createBossEncounter, updateBossEncounter } from './boss-encounters.js';
import { hitShape } from './encounter-geometry.js';
import { DUNGEONS, DUNGEON_ENEMIES } from './dungeons.js';

const TYPES=['storm_king','night_devourer','world_heart'];
const clone=value=>JSON.parse(JSON.stringify(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const point=p=>record(p)&&finite(p.x)&&finite(p.y)&&p.x>=32&&p.x<=1768&&p.y>=32&&p.y<=1468;
const bounded=(value,min,max)=>finite(value)&&value>=min&&value<=max;
const id=value=>typeof value==='string'&&value.length>0&&value.length<=120;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(value,allowed)=>record(value)&&Object.keys(value).every(key=>allowed.includes(key));
const playerId=game=>String(game.player.id||'local');
const roundTime=value=>Math.round(value*1e6)/1e6;
const LEGACY_RAID_HP={storm_king:125000,night_devourer:245000,world_heart:850000};
export const RAID_BALANCE_VERSION=2;

export const RAID_PROFILES={
  storm_king:{name:'Azhur · König des leeren Himmels',abilities:[
    {id:'storm_cleaver',name:'Sturmschneide',counterplay:'Der Hüter lenkt den breiten Frontkegel von den Verbündeten weg. Seitlich ausweichen; Azhur friert seine Richtung beim Warnbeginn ein.'},
    {id:'storm_eye',name:'Auge des Sturms',counterplay:'Im kleinen ruhigen Auge direkt bei Azhur sammeln. Wer im Sturm bleibt, erleidet sechs weitere Sturmwunden.'},
  ],phases:['100–65 %: Frontkegel und Sturmauge wechseln sich ab.','65–30 %: Kürzere Erholung und stärkere Einschläge.','Unter 30 %: Der letzte Sturm fordert rechtzeitige Wege zum Auge.'],coordination:'Drei lebende Menschen brechen den Schild auf drei Quellsiegeln. Beim Sternfall mindestens zwei sammeln, vor der Nova auseinanderlaufen.'},
  night_devourer:{name:'Velthra · Der Nachtverschlinger',abilities:[
    {id:'devouring_gaze',name:'Verschlingender Blick',counterplay:'Den Frontkegel von der Gruppe weglenken. Getroffene werden kurz verlangsamt und erhalten sechs Sekunden lang 60 % weniger Heilung.'},
    {id:'hungry_souls',name:'Hungrige Seelen',counterplay:'Der Heiler legt seine Seelenmarke abseits ab. Danach die beiden stillstehenden Seelen vor ihrem Ablauf zerstören; ungelöste Seelen kündigen eine Explosion an.'},
  ],phases:['100–65 %: Zwei Seelen und eine zusätzliche Schadensmarke.','65–30 %: Zwei Schadensmarken; die Seelen werden widerstandsfähiger.','Unter 30 %: Drei Schadensmarken und stärkere Wunden.'],coordination:'Vier lebende Menschen sind nötig. Drei brechen den Schild, während der vierte Velthras Blick lenkt. Sternfall benötigt zwei; Novamarken dürfen sich nicht überlagern.'},
  world_heart:{name:'Eon · Der gefallene Weltenkern',abilities:[
    {id:'paired_spectrum',name:'Geteiltes Spektrum',counterplay:'Zwei gegenüberliegende Lücken im Spektrum sind sicher; auch der innere Kern bleibt frei. Die Lücken drehen sich zwischen den Warnungen.'},
    {id:'prismatic_anchors',name:'Prismatische Anker',counterplay:'Vier Anker entstehen an fest markierten Positionen. Die Gruppe verteilt Schaden auf alle vier, bevor ungelöste Anker ihre Explosion ankündigen.'},
  ],phases:['100–65 %: Wechsel aus geteiltem Spektrum und vier Ankern.','65–30 %: Schnellere Folge und stärkere Anker.','Unter 30 %: Mehr Schaden; freie Wege zum nächsten Spektrum bleiben entscheidend.'],coordination:'Acht lebende Menschen öffnen den Kampf; vier halten die Quellsiegel. Sternfall benötigt mindestens vier, Novamarken werden einzeln abgelegt.'},
};
for(const [type,profile] of Object.entries(RAID_PROFILES)) {
  profile.combatRevives=({storm_king:1,night_devourer:2,world_heart:3})[type];
  profile.pressure={name:({storm_king:'Himmelslast',night_devourer:'Nachtlast',world_heart:'Weltenlast'})[type],
    counterplay:'Team schützen und heilen: Ab 65 % Bossleben trifft die gesamte Gruppe alle zehn Sekunden ein angekündigter Druckimpuls für 35 % Maximalleben. Unter 30 % folgen 40 % alle acht Sekunden. Schilde schützen. Ausweichen kann diesen Impuls nicht verhindern.'};
}

export function raidReviveSummary(instance) {
  const limit=RAID_PROFILES[instance?.definition?.boss]?.combatRevives||0,used=instance?.raidRevivesUsed||0;
  return {active:!!(instance?.definition?.raid&&instance.bossEngaged&&!instance.bossDefeated),used,limit,remaining:Math.max(0,limit-used)};
}
export function spendRaidRevive(game) {
  const summary=raidReviveSummary(game.dungeonInstance);
  if(!summary.active)return true;
  if(!summary.remaining){game.notice('Keine Kampfbelebungen mehr. Eure Gruppe muss diesen Versuch überleben oder nach einem vollständigen Wipe neu beginnen.','danger');return false;}
  game.dungeonInstance.raidRevivesUsed=summary.used+1;return true;
}
export function raidReturnBlocked(game) {
  const instance=game.dungeonInstance;if(!raidReviveSummary(instance).active)return false;
  const bossId=`${instance.id}:boss`,boss=instance.world?.enemies?.find(enemy=>enemy.id===bossId)
    ||game.networkDungeonCheckpoint?.enemies?.find(enemy=>enemy.id===bossId);
  return boss?.alive!==false;
}

export function raidZoneShape(zone) {
  if(zone.shape==='circle')return {kind:'circle',x:zone.x,y:zone.y,radius:zone.radius};
  if(zone.shape==='sector')return {kind:'cone',x:zone.x,y:zone.y,length:zone.radius,angle:zone.angle,halfAngle:zone.arc/2};
  if(zone.shape==='donut')return {kind:'annulus',x:zone.x,y:zone.y,innerRadius:zone.innerRadius,outerRadius:zone.radius,
    ...(zone.gapArc?{gapAngle:zone.gapAngle,gapWidth:zone.gapArc,...(zone.secondGapAngle!==undefined?{gapAngles:[zone.gapAngle,zone.secondGapAngle]}:{})}:{})};
  throw new TypeError('Unbekannte Raidfläche.');
}

function warningHazards(pending,boss,time) {
  return pending.zones.map((zone,index)=>({id:`${pending.id}:warning-${index}`,kind:'warning',raidEncounter:true,ownerBossId:boss.id,
    mechanicId:pending.mechanicId,name:pending.name,shape:raidZoneShape(zone),x:zone.x,y:zone.y,radius:zone.radius,
    color:zone.color,life:Math.max(0,pending.resolveAt-time),windup:true,resolveAt:pending.resolveAt}));
}

function syncObjectives(game,state) {
  for(const objective of Object.values(state.objectives)) {
    const actor=game.world.enemies.find(enemy=>enemy.bossObjectiveId===objective.id);
    if(actor){objective.hp=actor.hp;objective.alive=actor.alive&&actor.hp>0;}
    else {objective.hp=0;objective.alive=false;}
  }
}

function objectiveActor(objective,boss,instance) {
  return {...objective,type:'echo_guard',name:boss.type==='world_heart'?'Prismatischer Anker':'Hungrige Seele',
    bossObjectiveId:objective.id,ownerBossId:boss.id,stationary:true,rewardless:true,dungeon:true,boss:false,
    level:instance.definition.level,tier:instance.tier,damage:0,xp:0,gold:0,homeX:objective.x,homeY:objective.y,
    phase:'objective',attackTimer:0,respawnAt:Infinity,aggro:false};
}

function damage(game,boss,ally,fraction,flat,armorPierce,source,ignoreInvulnerability=false) {
  return ally.damagePlayer((ally.stats().maxHp*fraction+flat)*(boss.enraged?3:1),{
    armorPierce,ignoreInvulnerability,attackerLevel:boss.level,attackerId:`${boss.id}:${source}`});
}

function applyImpact(game,boss,event,living) {
  const victims=new Set();
  for(const ally of living) {
    const zones=event.zones.filter(zone=>(!zone.targetIds||zone.targetIds.includes(playerId(ally)))&&hitShape(raidZoneShape(zone),ally.player));
    if(!zones.length)continue;
    // Multiple captured marks really overlap. One source grace entry belongs
    // to this cast, so combine them before applying the shared damage envelope.
    const fraction=zones.reduce((sum,zone)=>sum+zone.damageFraction,0),flat=zones.reduce((sum,zone)=>sum+(zone.flatDamage||0),0);
    const shieldBefore=ally.player.shield||0,applied=damage(game,boss,ally,fraction,flat,Math.max(...zones.map(z=>z.armorPierce||0)),event.id,zones.some(zone=>zone.ignoreInvulnerability))||0;
    if(!applied&&(ally.player.shield||0)>=shieldBefore)continue;
    victims.add(playerId(ally));
    for(const zone of zones) {
      if(zone.slow){const oldFactor=ally.player.slowUntil>ally.time?ally.player.slowFactor||1:1;ally.player.slowUntil=Math.max(ally.player.slowUntil||0,ally.time+zone.slow.duration);ally.player.slowFactor=Math.min(oldFactor,zone.slow.factor);ally.player.raidSlowUntil=ally.time+zone.slow.duration;}
      if(zone.healingReduction){const oldReduction=ally.player.healingReductionUntil>ally.time?ally.player.healingReduction||0:0;ally.player.healingReductionUntil=Math.max(ally.player.healingReductionUntil||0,ally.time+zone.healingReduction.duration);ally.player.healingReduction=Math.max(oldReduction,zone.healingReduction.factor);ally.player.raidHealingUntil=ally.time+zone.healingReduction.duration;}
      if(zone.push)game.move(ally.player,Math.cos(zone.push.angle)*zone.push.distance,Math.sin(zone.push.angle)*zone.push.distance);
    }
  }
  for(const zone of event.zones)game.effect('ring',zone.x,zone.y,{radius:Math.min(110,zone.radius),color:zone.color,life:.45});
  return victims;
}

function removeObjectives(game,ids) {
  const removed=new Set(ids);game.world.enemies=game.world.enemies.filter(enemy=>!removed.has(enemy.bossObjectiveId));
}

/** Returns true when this controller owns a unique warning/recovery frame.
 * Existing shared stack/spread swings continue between authored warnings.
 * Their live windup is never replaced, and the boss never moves under a cone.
 */
export function updateRaidEncounter(game,boss,dt,living) {
  const instance=game.dungeonInstance;
  if(!instance?.definition.raid||!TYPES.includes(boss.type))return false;
  const state=instance.raidEncounter||=createBossEncounter(boss.type,{tier:instance.tier,seed:instance.seed});
  state.pressureAt??=null;
  syncObjectives(game,state);
  const players=living.filter(ally=>!ally.dead&&ally.player.hp>0&&ally.player.x>1120).map(ally=>({id:playerId(ally),classId:ally.player.classId,x:ally.player.x,y:ally.player.y,hp:ally.player.hp,maxHp:ally.stats().maxHp,alive:true}));
  if(!instance.bossEngaged||!instance.gateOpened)return false;
  // The shield and human-count authority remain in updateDungeon/hitEnemy.
  // A wipe cancels all pending effects; returning to the arena starts a new
  // clean attempt rather than importing a stopped controller's stale marks.
  if(state.stopped&&boss.alive&&players.length>=instance.definition.partyRequired) {
    instance.raidEncounter=createBossEncounter(boss.type,{tier:instance.tier,seed:instance.seed});
    instance.bossTime=0;instance.vulnerabilityUntil=0;instance.shieldHold=0;
    boss.hp=boss.maxHp;boss.phase='idle';boss.attackTimer=0;boss.shielded=true;boss.shieldDamageMultiplier=0;
    return false;
  }
  const genericBusy=boss.phase==='windup'&&boss.telegraphMechanic!=='raid'||boss.phase==='recover'&&boss.attackTimer>dt;
  if(state.startedAt===null){state.startedAt=Math.max(0,Math.round((instance.bossTime-dt)*1e6)/1e6);state.nextCastAt=state.startedAt+4;}
  if(genericBusy&&!state.pending&&players.length&&boss.alive&&state.nextCastAt<=instance.bossTime+1e-7)state.nextCastAt=roundTime(instance.bossTime+dt);
  if(!genericBusy&&!state.pending&&state.nextCastAt<=instance.bossTime+1e-7)state.nextCastAt=roundTime(instance.bossTime);
  const healthPhase=boss.hp/boss.maxHp<=.3?2:boss.hp/boss.maxHp<=.65?1:0,pressureEvents=[];
  if(healthPhase>0&&state.pressureAt===null)state.pressureAt=roundTime(instance.bossTime+(healthPhase===2?8:10));
  if(healthPhase===2&&state.pressureAt!==null)state.pressureAt=Math.min(state.pressureAt,roundTime(instance.bossTime+8));
  if(boss.alive&&players.length&&healthPhase>0&&state.pressureAt<=instance.bossTime&&!state.pending&&!genericBusy) {
    const time=roundTime(instance.bossTime),resolveAt=roundTime(time+1.8),castId=`${boss.type}:cast-${++state.serial}`,name=RAID_PROFILES[boss.type].pressure.name;
    const zones=[{shape:'circle',x:boss.homeX,y:boss.homeY,radius:1050,damageFraction:healthPhase===2?.4:.35,flatDamage:0,armorPierce:1,
      ignoreInvulnerability:true,targetIds:players.map(player=>player.id),color:BOSS_ENCOUNTERS[boss.type].color}];
    state.pending={id:castId,mechanicId:'raid_pressure',name,zones,time,resolveAt,phase:healthPhase,adds:null,failureIds:[]};state.phase=healthPhase;
    state.pressureAt=roundTime(time+(healthPhase===2?8:10));state.nextCastAt=Math.max(state.nextCastAt,roundTime(resolveAt+1.2));
    pressureEvents.push({kind:'warning',id:castId,mechanicId:'raid_pressure',name,bossType:boss.type,time,resolveAt,lockMovementUntil:resolveAt,zones:clone(zones)});
  }
  const snapshot={id:boss.id,type:boss.type,x:boss.x,y:boss.y,hp:boss.hp,maxHp:boss.maxHp,alive:boss.alive,level:boss.level,targetId:boss.targetId||null};
  const events=[...pressureEvents,...updateBossEncounter(state,{boss:snapshot,players,time:instance.bossTime,dt,allowCasting:!genericBusy})];
  let owned=!!state.pending;
  for(const event of events) {
    if(event.kind==='warning') {
      game.hazards=game.hazards.filter(hazard=>!hazard.raidEncounter);
      game.hazards.push(...warningHazards(event,boss,instance.bossTime));
      boss.telegraphShapes=event.zones.map(zone=>({...raidZoneShape(zone),color:zone.color}));
      boss.phase='windup';boss.telegraphMechanic='raid';boss.telegraphDuration=event.resolveAt-event.time;
      boss.attackTimer=Math.max(0,event.resolveAt-instance.bossTime);boss.telegraphPattern='encounter';
      const aimed=event.zones.find(zone=>zone.shape==='sector');if(aimed)boss.face=aimed.angle;
      owned=true;
    } else if(event.kind==='impact') {
      const victims=applyImpact(game,boss,event,living);
      for(const dot of state.dots)if(dot.id.startsWith(`${event.id}:dot-`))dot.targetIds=dot.targetIds.filter(target=>victims.has(target));
      state.dots=state.dots.filter(dot=>dot.targetIds.length);
      game.hazards=game.hazards.filter(hazard=>!hazard.raidEncounter);
      boss.telegraphShapes=[];boss.phase='recover';boss.attackTimer=1.2;boss.telegraphMechanic=null;boss.cycle=(boss.cycle||0)+1;owned=true;
    } else if(event.kind==='tick') {
      for(const ally of living)if(event.targetIds.includes(playerId(ally)))damage(game,boss,ally,event.damageFraction,event.flatDamage,event.armorPierce,event.id);
    } else if(event.kind==='spawn-adds') {
      for(const add of event.adds)game.world.enemies.push(objectiveActor(add,boss,instance));
    } else if(event.kind==='despawn-adds')removeObjectives(game,event.ids);
    else if(event.kind==='cleanup') {
      removeObjectives(game,event.objectiveIds);game.hazards=game.hazards.filter(hazard=>!hazard.raidEncounter);
      boss.telegraphShapes=[];if(boss.telegraphMechanic==='raid'){boss.phase='idle';boss.attackTimer=0;boss.telegraphMechanic=null;}
      owned=true;
    }
  }
  if(state.pending){boss.attackTimer=Math.max(0,state.pending.resolveAt-instance.bossTime);boss.phase='windup';boss.telegraphMechanic='raid';}
  if(!state.pending&&!owned&&boss.telegraphMechanic==='raid'){boss.telegraphMechanic=null;boss.telegraphShapes=[];}
  return owned;
}

export function captureRaidEncounter(instance) {
  if(!instance?.definition.raid||!instance.raidEncounter)return undefined;
  const state=clone(instance.raidEncounter);
  for(const objective of Object.values(state.objectives)) {
    const actor=instance.world.enemies.find(enemy=>enemy.bossObjectiveId===objective.id);
    if(actor){objective.hp=actor.hp;objective.alive=actor.alive&&actor.hp>0;}
  }
  return state;
}

export function resetRaidAfterWipe(game,partyGames) {
  const instance=game.dungeonInstance;
  if(!instance?.definition.raid||!instance.bossEngaged||!partyGames.length||partyGames.some(ally=>!ally.dead&&ally.player.hp>0))return false;
  const boss=instance.world.enemies.find(enemy=>enemy.id===`${instance.id}:boss`);
  if(!boss?.alive)return false;
  instance.world.enemies=instance.world.enemies.filter(enemy=>!enemy.bossObjectiveId&&!enemy.affixEcho);
  game.hazards=[];game.projectiles=game.projectiles.filter(projectile=>projectile.owner!=='enemy');
  instance.raidEncounter=createBossEncounter(boss.type,{tier:instance.tier,seed:instance.seed});
  instance.bossTime=0;instance.bossEngaged=false;instance.shieldHold=0;instance.vulnerabilityUntil=0;instance.raidWipes=(instance.raidWipes||0)+1;instance.raidRevivesUsed=0;
  instance.affixState={nextRiftAt:18,nextEchoAt:26,rifts:[],wave:0,riftSerial:0};
  Object.assign(boss,{hp:boss.maxHp,x:boss.homeX,y:boss.homeY,phase:'idle',attackTimer:0,aggro:false,
    shielded:true,shieldDamageMultiplier:0,enraged:false,telegraphMechanic:null,telegraphShapes:[],spreadTargets:[]});
  for(const ally of partyGames){ally.player.raidSlowUntil=0;ally.player.raidHealingUntil=0;ally.player.healingReductionUntil=0;ally.player.healingReduction=0;ally.player.slowUntil=0;ally.change();ally.save(false);}
  return true;
}

export function captureRaidDebuffs(player,time) {
  const result={};
  if(player.raidSlowUntil>time&&player.slowUntil>time)result.slow={factor:.75,remaining:Math.min(2,player.raidSlowUntil-time)};
  if(player.raidHealingUntil>time&&player.healingReductionUntil>time)result.healingReduction={factor:.6,remaining:Math.min(6,player.raidHealingUntil-time)};
  return result;
}
export function validateRaidDebuffs(saved) {
  return saved===undefined||keys(saved,['slow','healingReduction'])&&Object.entries(saved).every(([kind,status])=>keys(status,['factor','remaining'])
    &&status.factor===(kind==='slow'?.75:.6)&&bounded(status.remaining,0,kind==='slow'?2:6));
}
export function restoreRaidDebuffs(player,saved,time) {
  if(saved?.slow?.remaining>0){player.slowFactor=Math.min(player.slowUntil>time?player.slowFactor||1:1,.75);player.slowUntil=Math.max(player.slowUntil||0,time+saved.slow.remaining);player.raidSlowUntil=time+saved.slow.remaining;}
  if(saved?.healingReduction?.remaining>0){player.healingReduction=.6;player.healingReductionUntil=time+saved.healingReduction.remaining;player.raidHealingUntil=player.healingReductionUntil;}
}

export function captureRaidGeneric(instance) {
  if(!instance?.definition.raid)return undefined;
  const boss=instance.world.enemies.find(enemy=>enemy.id===`${instance.id}:boss`);
  if(!boss?.alive||boss.phase!=='windup'||!['stack','spread'].includes(boss.telegraphMechanic))return null;
  return {kind:boss.telegraphMechanic,remaining:boss.attackTimer,duration:boss.telegraphDuration||1.7,
    center:{x:boss.telegraphX,y:boss.telegraphY},spreadTargets:boss.telegraphMechanic==='spread'?(boss.spreadTargets||[]).map(({x,y})=>({x,y})):[]};
}
export function validateRaidGeneric(saved,raidEncounter,{id:dungeonId}={}) {
  if(saved===undefined||saved===null)return true;
  return ['sturmzitadelle','nachtschlund','weltenkern'].includes(dungeonId)&&!raidEncounter?.pending
    &&keys(saved,['kind','remaining','duration','center','spreadTargets'])&&['stack','spread'].includes(saved.kind)
    &&saved.duration===1.7&&bounded(saved.remaining,0,saved.duration)&&keys(saved.center,['x','y'])&&point(saved.center)
    &&Array.isArray(saved.spreadTargets)&&saved.spreadTargets.length<=8
    &&(saved.kind==='stack'?saved.spreadTargets.length===0:saved.spreadTargets.length>0)
    &&saved.spreadTargets.every(target=>keys(target,['x','y'])&&point(target));
}
export function restoreRaidGeneric(game,instance,saved) {
  if(!saved)return;
  const boss=instance.world.enemies.find(enemy=>enemy.id===`${instance.id}:boss`);
  if(!boss?.alive)return;
  Object.assign(boss,{phase:'windup',attackTimer:saved.remaining,telegraphDuration:saved.duration,
    telegraphMechanic:saved.kind,telegraphX:saved.center.x,telegraphY:saved.center.y,
    telegraphRadius:saved.kind==='stack'?115:145,spreadTargets:clone(saved.spreadTargets)});
  if(saved.kind==='spread')game.hazards.push(...saved.spreadTargets.map(target=>({...target,kind:'warning',color:'#de887b',radius:75,life:saved.remaining,windup:true})));
}

export function validateRaidHealthSave(dungeon) {
  const definition=DUNGEONS.find(d=>d.id===dungeon?.id);if(!definition?.raid)return dungeon?.raidBalanceVersion===undefined;
  if(dungeon.raidBalanceVersion!==undefined&&![1,RAID_BALANCE_VERSION].includes(dungeon.raidBalanceVersion))return false;
  const current=dungeon.raidBalanceVersion===RAID_BALANCE_VERSION,maximum=Math.round((current?DUNGEON_ENEMIES[definition.boss].hp:LEGACY_RAID_HP[definition.boss])*(1+(dungeon.tier-1)*.38));
  const boss=dungeon.enemies.find(enemy=>enemy.id===`${dungeon.id}:boss`);
  if(!boss||!bounded(boss.hp,0,maximum)||boss.maxHp!==undefined&&boss.maxHp!==maximum||current&&boss.maxHp!==maximum||dungeon.raidEncounter!==undefined&&!current)return false;
  return true;
}
export function restoreRaidBossHealth(instance,enemy,saved,version) {
  if(!instance.definition.raid||enemy.id!==`${instance.id}:boss`)return saved.hp;
  const maximum=version===RAID_BALANCE_VERSION?enemy.maxHp:Math.round(LEGACY_RAID_HP[enemy.type]*(1+(instance.tier-1)*.38));
  return enemy.maxHp*Math.max(0,Math.min(1,saved.hp/maximum));
}

function expectedEffect(state,pending) {
  if(pending.mechanicId==='raid_pressure')return {damageFraction:pending.phase===2?.4:.35,flatDamage:0,armorPierce:1,ignoreInvulnerability:true,color:BOSS_ENCOUNTERS[state.type].color};
  if(pending.mechanicId==='neglected-objectives')return {damageFraction:.2,flatDamage:0,armorPierce:1,color:'#dfa18d'};
  const ability=BOSS_ENCOUNTERS[state.type].abilities.find(a=>a.id===pending.mechanicId);if(!ability)return null;
  const effect=clone(ability.effect),scale=(1+(state.tier-1)*.015)*(1+pending.phase*.08);
  effect.damageFraction=Math.min(.58,Math.round(effect.damageFraction*scale*1e6)/1e6);
  effect.flatDamage=Math.round((effect.flatDamage||0)*(1+(state.tier-1)*.035));effect.color=BOSS_ENCOUNTERS[state.type].color;
  return effect;
}
function validZone(zone,state,pending) {
  const expected=expectedEffect(state,pending);if(!expected||!point(zone))return false;
  const shapeKeys=['shape','x','y','radius','angle','arc','innerRadius','gapAngle','secondGapAngle','gapArc'];
  if(!keys(zone,[...shapeKeys,...Object.keys(expected),...(pending.mechanicId==='raid_pressure'?['targetIds']:[])])||!Object.entries(expected).every(([key,value])=>key==='push'?keys(zone.push,['distance','angle'])&&zone.push.distance===value.distance&&bounded(zone.push.angle,-Math.PI*2,Math.PI*2):same(zone[key],value)))return false;
  const mech=pending.mechanicId;
  if(mech==='raid_pressure')return zone.shape==='circle'&&zone.radius===1050&&zone.x===1470&&zone.y===780&&Array.isArray(zone.targetIds)&&zone.targetIds.length>0&&zone.targetIds.length<=8&&new Set(zone.targetIds).size===zone.targetIds.length&&zone.targetIds.every(id);
  if(mech==='storm_cleaver'||mech==='devouring_gaze')return zone.shape==='sector'&&zone.radius===(mech==='storm_cleaver'?340:370)&&zone.arc===Math.PI/3&&bounded(zone.angle,-Math.PI,Math.PI);
  if(mech==='storm_eye')return zone.shape==='donut'&&zone.innerRadius===85&&zone.radius===820;
  if(mech==='paired_spectrum') {
    const gap=(state.castIndex-1)*Math.PI/3+(state.seed%6)*Math.PI/3;
    return zone.shape==='donut'&&zone.innerRadius===100&&zone.radius===420&&zone.gapAngle===gap&&zone.secondGapAngle===gap+Math.PI&&zone.gapArc===Math.PI/4;
  }
  if(mech==='hungry_souls')return zone.shape==='circle'&&zone.radius===(pending.zones.indexOf(zone)===0?78:70);
  return zone.shape==='circle'&&zone.radius===(mech==='prismatic_anchors'?74:86);
}

/** Reject arbitrary damage/status/add metadata before Game.initialize mutates
 * the current adventure. Trusted definitions reconstruct every objective actor.
 */
export function validateRaidEncounterSave(saved,{id:dungeonId,tier,seed,bossTime=0,enemies=[]}={}) {
  bossTime=Math.round(bossTime*1e6)/1e6;
  if(saved===undefined)return !enemies.some(enemy=>enemy.bossObjectiveId!==undefined||TYPES.some(type=>typeof enemy.id==='string'&&enemy.id.startsWith(`${type}:objective-`)));
  const type=({sturmzitadelle:'storm_king',nachtschlund:'night_devourer',weltenkern:'world_heart'})[dungeonId];
  if(!type||!keys(saved,['type','tier','seed','serial','startedAt','nextCastAt','castIndex','phase','pending','objectives','dots','previousTargets','lastFrame','stopped','pressureAt'])||saved.type!==type||saved.tier!==tier||saved.seed!==(seed>>>0)
    ||!Number.isInteger(saved.serial)||saved.serial<0||saved.serial>1e6||!Number.isInteger(saved.castIndex)||saved.castIndex<0||saved.castIndex>1e6||!Number.isInteger(saved.phase)||saved.phase<0||saved.phase>2||typeof saved.stopped!=='boolean'
    ||!(saved.startedAt===null||bounded(saved.startedAt,0,bossTime))||!(saved.nextCastAt===null||bounded(saved.nextCastAt,0,bossTime+24))||!(saved.pressureAt===undefined||saved.pressureAt===null||bounded(saved.pressureAt,0,bossTime+10))||!record(saved.objectives)||Object.keys(saved.objectives).length>8||!Array.isArray(saved.dots)||saved.dots.length>32
    ||!record(saved.previousTargets)||Object.keys(saved.previousTargets).length>8||Object.entries(saved.previousTargets).some(([key,value])=>!id(key)||!keys(value,['x','y'])||!point(value)))return false;
  const objectivePattern=new RegExp(`^${type}:objective-[1-9][0-9]{0,6}-[0-7]$`),castPattern=new RegExp(`^${type}:cast-[1-9][0-9]{0,6}$`);
  const addAbility=BOSS_ENCOUNTERS[type].abilities.find(a=>a.adds);
  for(const [key,objective] of Object.entries(saved.objectives)) {
    if(!addAbility||!keys(objective,['id','x','y','hp','maxHp','alive','phase','expiresAt','exploding'])||key!==objective.id||!objectivePattern.test(key)||!point(objective)||typeof objective.alive!=='boolean'||typeof objective.exploding!=='boolean'||!Number.isInteger(objective.phase)||objective.phase<0||objective.phase>2
      ||!bounded(objective.hp,0,objective.maxHp)||!bounded(objective.expiresAt,0,bossTime+addAbility.adds.lifetime)||objective.maxHp!==Math.round(addAbility.adds.hp*(1+(tier-1)*.065)*(1+objective.phase*.18)))return false;
    const actor=enemies.find(enemy=>enemy.id===key||enemy.bossObjectiveId===key);
    if(actor&&(actor.type!=='echo_guard'||actor.level!==({storm_king:75,night_devourer:90,world_heart:100})[type]||actor.hp!==objective.hp||actor.alive!==objective.alive))return false;
  }
  const actors=enemies.filter(enemy=>enemy.bossObjectiveId!==undefined||typeof enemy.id==='string'&&enemy.id.startsWith(`${type}:objective-`));
  if(actors.length>8||new Set(actors.map(enemy=>enemy.id)).size!==actors.length||actors.some(enemy=>!saved.objectives[enemy.id]||enemy.bossObjectiveId!==enemy.id||enemy.ownerBossId!==`${dungeonId}:boss`||enemy.stationary!==true||enemy.rewardless!==true))return false;
  for(const dot of saved.dots)if(!keys(dot,['id','mechanicId','targetIds','fraction','interval','nextAt','endsAt'])||!id(dot.id)||!Array.isArray(dot.targetIds)||dot.targetIds.length>8||new Set(dot.targetIds).size!==dot.targetIds.length||dot.targetIds.some(target=>!id(target))
    ||!BOSS_ENCOUNTERS[type].abilities.some(ability=>ability.id===dot.mechanicId&&ability.effect.dot&&dot.fraction===ability.effect.dot.fraction&&dot.interval===ability.effect.dot.interval&&bounded(dot.endsAt,0,bossTime+ability.effect.dot.duration))||!bounded(dot.nextAt,0,dot.endsAt))return false;
  if(saved.pending!==null) {
    const pending=saved.pending,ability=BOSS_ENCOUNTERS[type].abilities.find(a=>a.id===pending?.mechanicId),failure=pending?.mechanicId==='neglected-objectives',pressure=pending?.mechanicId==='raid_pressure';
    const name=pressure?RAID_PROFILES[type].pressure.name:failure?(type==='night_devourer'?'Ausbruch der hungrigen Seelen':'Überladener Anker'):ability?.name;
    if(!keys(pending,['id','mechanicId','name','zones','resolveAt','time','phase','adds','failureIds'])||!castPattern.test(pending.id)||pending.id!==`${type}:cast-${saved.serial}`||(!ability&&!failure&&!pressure)||pending.name!==name||!bounded(pending.time,0,bossTime)
      ||!bounded(pending.resolveAt,bossTime,bossTime+2.5)||!Number.isInteger(pending.phase)||pending.phase<0||pending.phase>2||!Array.isArray(pending.zones)||!pending.zones.length||pending.zones.length>8||pending.zones.some(zone=>!validZone(zone,saved,pending))
      ||!same(pending.adds,failure||pressure?null:ability.adds||null)||!Array.isArray(pending.failureIds)||pending.failureIds.length>8||pending.failureIds.some(key=>!saved.objectives[key]?.exploding)||!failure&&pending.failureIds.length||pressure&&pending.phase===0)return false;
    const windup=pressure?1.8:failure?1.5:Math.max(1.2,ability.windup-pending.phase*.08);
    if(Math.abs(pending.resolveAt-pending.time-windup)>1e-6||new Set(pending.failureIds).size!==pending.failureIds.length)return false;
    const count=pressure?1:failure?pending.failureIds.length:ability.pattern==='hungry-souls'?Math.min(2+pending.phase,8):ability.pattern==='prismatic-anchors'?4:1;
    if(!failure&&ability?.pattern!=='hungry-souls'&&pending.zones.length!==count||failure&&pending.zones.length!==count)return false;
  }
  if(saved.lastFrame!==null) {
    const frame=saved.lastFrame;
    const definition=DUNGEONS.find(d=>d.id===dungeonId),maximum=Math.round(DUNGEON_ENEMIES[type].hp*(1+(tier-1)*.38));
    if(!keys(frame,['time','boss','players'])||!bounded(frame.time,0,bossTime)||!keys(frame.boss,['id','type','x','y','hp','maxHp','alive','level','targetId'])||!point(frame.boss)||frame.boss.id!==`${dungeonId}:boss`||frame.boss.type!==type||frame.boss.maxHp!==maximum||frame.boss.level!==definition.level||typeof frame.boss.alive!=='boolean'||frame.boss.targetId!==null&&!id(frame.boss.targetId)||!bounded(frame.boss.hp,0,maximum)
      ||!Array.isArray(frame.players)||frame.players.length>8||new Set(frame.players.map(player=>player.id)).size!==frame.players.length||frame.players.some(player=>!keys(player,['id','classId','x','y','hp','maxHp','alive'])||!point(player)||!id(player.id)||!['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder'].includes(player.classId)||player.alive!==true||!bounded(player.maxHp,1,16000)||!bounded(player.hp,0,player.maxHp)))return false;
  }
  return true;
}

export function restoreRaidEncounter(game,instance,saved) {
  if(!instance.definition.raid)return;
  instance.raidEncounter=saved?clone(saved):createBossEncounter(instance.definition.boss,{tier:instance.tier,seed:instance.seed});
  const state=instance.raidEncounter,boss=instance.world.enemies.find(enemy=>enemy.id===`${instance.id}:boss`);
  instance.world.enemies=instance.world.enemies.filter(enemy=>!enemy.bossObjectiveId);
  for(const objective of Object.values(state.objectives))if(objective.alive&&objective.hp>0)instance.world.enemies.push(objectiveActor(objective,boss,instance));
  game.hazards=game.hazards.filter(hazard=>!hazard.raidEncounter);
  if(state.pending&&boss.alive&&!state.stopped) {
    game.hazards.push(...warningHazards(state.pending,boss,instance.bossTime));
    boss.phase='windup';boss.telegraphMechanic='raid';boss.telegraphShapes=state.pending.zones.map(zone=>({...raidZoneShape(zone),color:zone.color}));
    boss.telegraphDuration=state.pending.resolveAt-state.pending.time;boss.attackTimer=Math.max(0,state.pending.resolveAt-instance.bossTime);boss.telegraphPattern='encounter';
  }
}
