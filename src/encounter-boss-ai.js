import { ENCOUNTER_PROFILES } from './encounter-content.js';
import { hitShape } from './encounter-geometry.js';
import { applyEnemyTraits } from './enemy-ai.js';

const TAU=Math.PI*2;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const playerId=game=>String(game.player.id||'local');
const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};
const pointAt=(point,angle,length)=>({x:point.x+Math.cos(angle)*length,y:point.y+Math.sin(angle)*length});
const circle=(point,radius,extra={})=>({kind:'circle',x:point.x,y:point.y,radius,...extra});
const segment=(start,end,width,extra={})=>({kind:'segment',x1:start.x,y1:start.y,x2:end.x,y2:end.y,width,...extra});
const cone=(point,angle,length,halfAngle)=>({kind:'cone',x:point.x,y:point.y,angle,length,halfAngle});

function trail(enemy,player,time) {
  const samples=enemy.encounterTrail||=[];
  if(!samples.length||time-samples.at(-1).at>=.3)samples.push({x:player.x,y:player.y,at:time});
  while(samples.length>12||samples.length&&time-samples[0].at>3.5)samples.shift();
}
function previousPoints(enemy,player,count) {
  const samples=enemy.encounterTrail||[],latest=samples.at(-1)?.at??0;
  return Array.from({length:count},(_,index)=>{
    const wanted=latest-index*.8;
    const sample=samples.reduce((best,next)=>Math.abs(next.at-wanted)<Math.abs(best.at-wanted)?next:best,samples[0]||{...player,at:latest});
    return {x:sample.x,y:sample.y};
  });
}

function actionShapes(enemy,player,action,phase) {
  const start={x:enemy.x,y:enemy.y},angle=Math.atan2(player.y-enemy.y,player.x-enemy.x),range=distance(enemy,player);
  const mark=(count,radius)=>previousPoints(enemy,player,count).map(point=>circle(point,radius));
  if(action.kind==='cradle')return [{kind:'annulus',...start,innerRadius:70,outerRadius:165}];
  if(action.kind==='shards')return mark(phase===1?1:2,45);
  if(action.kind==='scythe'||action.kind==='counter') {
    const aim=action.kind==='counter'?(enemy.encounterScytheAngle??angle)+Math.PI:angle;
    if(action.kind==='scythe')enemy.encounterScytheAngle=aim;
    return [cone(start,aim,240,Math.PI*.32)];
  }
  if(action.kind==='furrows') {
    const normal=angle+Math.PI/2,length=Math.max(350,Math.min(650,range+70));
    return [-95,0,95].map(offset=>{const origin=pointAt(start,normal,offset);return segment(origin,pointAt(origin,angle,length),24);});
  }
  if(action.kind==='rush'||action.kind==='return') {
    if(action.kind==='rush')enemy.encounterRushOrigin={...start};
    const destination=action.kind==='return'?(enemy.encounterRushOrigin||pointAt(start,angle,240)):pointAt(start,angle,Math.min(280,range+30));
    return [segment(start,destination,35,{delivery:'charge'})];
  }
  if(action.kind==='surf')return [{kind:'annulus',...start,innerRadius:55,outerRadius:Math.max(300,Math.min(620,range+70)),moving:true}];
  if(action.kind==='memories')return mark(3,58);
  if(['pendulum','cross','third'].includes(action.kind)) {
    if(action.kind==='pendulum')enemy.encounterPendulumAngle=angle;
    const base=enemy.encounterPendulumAngle??angle,aim=base+(action.kind==='cross'?Math.PI/2:action.kind==='third'?Math.PI/4:0);
    return [segment(pointAt(start,aim,-340),pointAt(start,aim,340),30)];
  }
  if(action.kind==='light')return [{kind:'annulus',...start,innerRadius:90,outerRadius:Math.max(330,Math.min(620,range+75)),gapAngle:angle+Math.PI/2,gapWidth:phase===1?Math.PI/2:Math.PI/3}];
  if(action.kind==='mirrors')return Array.from({length:3},(_,index)=>{
    const aim=angle+index*TAU/3,origin=pointAt(start,aim,250),end=pointAt(start,aim,-310),flightAngle=aim+Math.PI,speed=220,maxDistance=distance(origin,end);
    return segment(origin,end,23,{delivery:'projectile',projectile:{originX:origin.x,originY:origin.y,angle:flightAngle,speed,life:maxDistance/speed,radius:6,maxDistance}});
  });
  if(action.kind==='scissors') {
    const base=angle+.35,halfAngle=phase===3?.48:.42,length=Math.max(350,Math.min(620,range+75));
    return [cone(start,base-.7,length,halfAngle),cone(start,base+.7,length,halfAngle)];
  }
  if(action.kind==='scars') {
    // A visible blue field is safe; leaving all three fields is equally valid.
    // At least one dangerous field covers the saved target position in every
    // phase, so staying at bow range never bypasses the boss's whole kit.
    const positions=[{x:player.x,y:player.y},pointAt(player,angle+Math.PI/2,170),pointAt(player,angle-Math.PI/2,170)];
    const safeIndex=phase===2?1:2;
    return positions.map((point,index)=>circle(point,90,index===safeIndex?{safe:true,color:'#8dbbb9'}:{}));
  }
  return [];
}

function damageTarget(game,enemy,definition,ally,damage) {
  if(ally.dead||ally.player.hp<=0||ally.inSettlement?.())return;
  const applied=ally.damagePlayer(damage,{attackerLevel:enemy.level||definition.level});
  applyEnemyTraits(game,enemy,definition,ally,applied);
}
function damageLiving(game,enemy,definition,living,shapes,damage) {
  for(const ally of living)if(shapes.some(shape=>!shape.safe&&hitShape(shape,ally.player)))damageTarget(game,enemy,definition,ally,damage);
}

function movingWaves(game,enemy,definition,living,dt) {
  const active=[];
  for(const wave of enemy.encounterWaves||[]) {
    const before=wave.elapsed;wave.elapsed=Math.min(wave.duration,wave.elapsed+dt);
    const inner=wave.startRadius+wave.elapsed*wave.speed,outer=Math.min(wave.endRadius,inner+wave.width);
    const shape={kind:'annulus',x:wave.x,y:wave.y,innerRadius:Math.min(inner,wave.endRadius),outerRadius:outer,active:true,color:definition.color};
    const swept={...shape,innerRadius:wave.startRadius+before*wave.speed};
    for(const ally of living)if(!ally.inSettlement?.()&&!wave.hitIds.includes(playerId(ally))&&hitShape(swept,ally.player)) {
      wave.hitIds.push(playerId(ally));damageTarget(game,enemy,definition,ally,wave.damage);
    }
    if(wave.elapsed<wave.duration)active.push(shape);
  }
  enemy.encounterWaves=(enemy.encounterWaves||[]).filter(wave=>wave.elapsed<wave.duration);
  enemy.activeShapes=freeze(active);
}

function execute(game,enemy,definition,living) {
  const action=enemy.encounterAction,shapes=enemy.telegraphShapes||[],damage=action.damage;
  if(action.kind==='surf') {
    const shape=shapes[0],speed=140,width=28;
    enemy.encounterWaves=[{x:shape.x,y:shape.y,startRadius:shape.innerRadius,endRadius:shape.outerRadius,width,speed,
      elapsed:0,duration:(shape.outerRadius-shape.innerRadius)/speed,damage,hitIds:[]}];
    enemy.activeShapes=freeze([{kind:'annulus',x:shape.x,y:shape.y,innerRadius:shape.innerRadius,outerRadius:shape.innerRadius+width,active:true,color:definition.color}]);
  } else if(action.kind==='mirrors') {
    for(const shape of shapes) {
      const p=shape.projectile;
      game.projectiles.push({x:p.originX,y:p.originY,angle:p.angle,speed:p.speed,life:p.life,radius:p.radius,
        maxDistance:p.maxDistance,travelled:0,damage:damage/Math.sqrt(shapes.length),type:'enemy',owner:'enemy',
        attackerLevel:enemy.level||definition.level,attackerId:enemy.id,color:definition.color});
    }
  } else if(['rush','return'].includes(action.kind)) {
    const shape=shapes[0],start={x:enemy.x,y:enemy.y},steps=Math.max(1,Math.ceil(distance({x:shape.x1,y:shape.y1},{x:shape.x2,y:shape.y2})/12)),hit=new Set();
    for(let index=0;index<steps;index++) {
      game.move(enemy,(shape.x2-start.x)/steps,(shape.y2-start.y)/steps,22);
      for(const ally of living)if(!hit.has(ally)&&distance(enemy,ally.player)<shape.width){hit.add(ally);damageTarget(game,enemy,definition,ally,damage);}
    }
  } else damageLiving(game,enemy,definition,living,shapes,damage);
  game.effect('ring',enemy.x,enemy.y,{radius:45,color:definition.color,life:.45});
  enemy.cycle=(enemy.cycle||0)+1;
  enemy.phase='recover';enemy.attackTimer=action.recovery;enemy.telegraphShapes=freeze([]);
  if(enemy.encounterPhase===action.phase)enemy.encounterActionIndex=(action.sequenceIndex+1)%ENCOUNTER_PROFILES[definition.encounterProfile].sequences[action.phase-1].length;
}

/** Complete controller for the six authored profiles. Other enemies return false. */
export function updateEncounterBoss(game,enemy,definition,dt,living) {
  const profile=ENCOUNTER_PROFILES[definition?.encounterProfile];if(!profile)return false;
  if(game.worldMode==='pvp'||game.world?.isPvp)return true;
  if(!enemy.alive) {enemy.telegraphShapes=freeze([]);enemy.activeShapes=freeze([]);enemy.encounterWaves=[];return true;}
  const players=living.filter(ally=>!ally.dead&&ally.player.hp>0&&!ally.inSettlement?.());
  if(!players.length) {enemy.telegraphShapes=freeze([]);enemy.activeShapes=freeze([]);enemy.encounterWaves=[];enemy.phase='idle';enemy.attackTimer=0;return true;}
  const taunted=enemy.tauntUntil>game.time?players.find(ally=>playerId(ally)===(enemy.targetId||'local')):null;
  const target=taunted||players.reduce((a,b)=>distance(a.player,enemy)<distance(b.player,enemy)?a:b),player=target.player;
  const range=distance(enemy,player),home={x:enemy.homeX??enemy.x,y:enemy.homeY??enemy.y};
  if(target.inSettlement()||range>830||distance(enemy,home)>650) {
    enemy.aggro=false;enemy.phase='idle';enemy.attackTimer=0;enemy.telegraphShapes=freeze([]);enemy.activeShapes=freeze([]);enemy.encounterWaves=[];
    if(distance(enemy,home)>5) {const length=distance(enemy,home);game.move(enemy,(home.x-enemy.x)/length*definition.speed*.7*dt,(home.y-enemy.y)/length*definition.speed*.7*dt,22);}
    return true;
  }
  enemy.aggro=true;enemy.face=Math.atan2(player.y-enemy.y,player.x-enemy.x);trail(enemy,player,game.time);
  const phase=1+profile.thresholds.filter(threshold=>enemy.hp<=enemy.maxHp*threshold).length;
  if(phase>(enemy.encounterPhase||1)) {
    const sequence=profile.sequences[phase-1],current=sequence.indexOf(enemy.encounterAction?.id);
    enemy.encounterPhase=phase;enemy.encounterActionIndex=current<0?0:(current+1)%sequence.length;
    for(const ally of players)if(distance(ally.player,enemy)<700)ally.notice?.(`${definition.name} · Phase ${phase}: Die nächste Aktionsfolge verändert sich!`,'danger');
    game.effect('ring',enemy.x,enemy.y,{radius:70,color:definition.color,life:.9});
  }
  enemy.encounterPhase||=1;
  movingWaves(game,enemy,definition,players,dt);
  enemy.attackTimer=Math.max(0,(enemy.attackTimer||0)-dt);
  if(enemy.phase==='windup') {if(enemy.attackTimer<=0)execute(game,enemy,definition,players);return true;}
  if(enemy.attackTimer>0||enemy.encounterWaves?.length)return true;
  if(range>profile.engageRange) {
    const slow=enemy.slowUntil>game.time?enemy.slowFactor??.45:1;
    game.move(enemy,(player.x-enemy.x)/range*definition.speed*slow*dt,(player.y-enemy.y)/range*definition.speed*slow*dt,22);enemy.phase='chase';return true;
  }
  const sequence=profile.sequences[enemy.encounterPhase-1],sequenceIndex=(enemy.encounterActionIndex||0)%sequence.length,action=profile.actions[sequence[sequenceIndex]];
  enemy.encounterAction=freeze({...action,phase:enemy.encounterPhase,sequenceIndex,damage:(enemy.damage??definition.damage)*(action.damageRatio||1)});
  enemy.telegraphShapes=freeze(actionShapes(enemy,player,action,enemy.encounterPhase).map(shape=>({delivery:'impact',color:definition.color,...shape})));
  enemy.phase='windup';enemy.attackTimer=action.windup;enemy.telegraphDuration=action.windup;
  enemy.telegraphPattern='encounter';enemy.telegraphX=enemy.x;enemy.telegraphY=enemy.y;
  enemy.telegraphExtraFan=null;
  return true;
}
