import { BESTIARY_ENEMIES, REGION_ENEMY_POOLS, createBestiaryEnemy } from './bestiary.js';
import { encounterSpawnBlocked } from './encounter-director.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const projectilePatterns=new Set(['ranged','fan','burst','ring','summoner']);
const packFrames=new WeakMap();
const packRules={standard:{concurrent:2,spacing:.4,flank:75},hard:{concurrent:3,spacing:.27,flank:100},relentless:{concurrent:4,spacing:.18,flank:120}};
function directorPack(game,enemy,definition) {
  if(!enemy.directorId||enemy.packId!==enemy.directorId||!packRules[enemy.encounterTier]||(enemy.level||definition.level)<12||definition.boss||enemy.challengeId||enemy.eventId)return null;
  let frame=packFrames.get(game);
  if(!frame||frame.world!==game.world||frame.time!==game.time||frame.enemies!==game.world.enemies||frame.count!==game.world.enemies.length) {
    const history=frame?.world===game.world?frame.history:new Map(),groups=new Map();
    for(const member of game.world.enemies) {
      if(!member.alive||!member.directorId||member.packId!==member.directorId||member.boss||member.challengeId||member.eventId||(member.level||0)<12)continue;
      const key=`${member.packId}:${member.region||''}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(member);
    }
    for(const key of history.keys()) {
      const current=groups.get(key),previous=frame?.groups.get(key)||[];
      if(!current||!previous.some(member=>current.includes(member)))history.delete(key);
    }
    while(history.size>16)history.delete(history.keys().next().value);
    frame={world:game.world,time:game.time,enemies:game.world.enemies,count:game.world.enemies.length,groups,history};packFrames.set(game,frame);
  }
  const key=`${enemy.packId}:${enemy.region||''}`;
  if(!frame.history.has(key)) {
    if(frame.history.size>=16)frame.history.delete(frame.history.keys().next().value);
    frame.history.set(key,{lastAlert:-Infinity,lastAttack:-Infinity,alertCount:0});
  }
  return {members:(frame.groups.get(key)||[]).filter(e=>e.alive),history:frame.history.get(key),rules:packRules[enemy.encounterTier]};
}

function alertDirectorPack(game,enemy,pack) {
  if(!pack||game.time-pack.history.lastAlert<3)return;
  const sleeping=pack.members.filter(e=>e!==enemy&&!e.aggro&&distance(e,enemy)<=220).slice(0,Math.max(0,4-pack.history.alertCount));
  if(!sleeping.length)return;
  pack.history.lastAlert=game.time;
  pack.history.alertCount+=sleeping.length;
  for(const member of sleeping) {member.aggro=true;member.alertedBy=enemy.id;member.packAlertAt=game.time;}
  game.effect('ring',enemy.x,enemy.y,{color:'#d29c63',radius:45,life:.65});
}

function packCanAttack(game,enemy,pack) {
  if(!pack)return true;
  if(pack.members.filter(e=>e!==enemy&&e.phase==='windup').length>=pack.rules.concurrent||game.time-pack.history.lastAttack<pack.rules.spacing)return false;
  pack.history.lastAttack=game.time;return true;
}

function tacticalMove(game,enemy,definition,player,dt,pack,{recover=false}={}) {
  const combat=definition.combat,range=distance(enemy,player),preferred=combat.preferredRange||definition.range||45;
  const angle=Math.atan2(player.y-enemy.y,player.x-enemy.x),side=enemy.flankSide===-1?-1:1;
  const slow=enemy.slowUntil>game.time?enemy.slowFactor??.45:1;
  const managed=enemy.directorId&&enemy.packId===enemy.directorId&&packRules[enemy.encounterTier]&&!enemy.eventId&&!enemy.challengeId;
  const speed=(managed&&enemy.elite?Math.min(170,definition.speed*1.12):definition.speed)*slow;
  const ranged=projectilePatterns.has(combat.pattern)||combat.pattern==='hex';
  let dx=Math.cos(angle),dy=Math.sin(angle),pace=1;
  if(pack&&ranged) {
    enemy.tacticalRole='support';pace=recover?.55:.7;
    if(range<preferred*.72){dx=-Math.cos(angle);dy=-Math.sin(angle);}
    else if(range>preferred*1.25&&!recover){dx=Math.cos(angle);dy=Math.sin(angle);}
    else {dx=-Math.sin(angle)*side;dy=Math.cos(angle)*side;}
  } else if(pack&&!recover&&['melee','charge'].includes(combat.pattern)&&range>110) {
    enemy.tacticalRole='flanker';
    const approach=Math.atan2(player.y-(enemy.homeY??enemy.y),player.x-(enemy.homeX??enemy.x));
    const goal={x:player.x-Math.sin(approach)*pack.rules.flank*side,y:player.y+Math.cos(approach)*pack.rules.flank*side};
    const length=Math.max(1,distance(enemy,goal));dx=(goal.x-enemy.x)/length;dy=(goal.y-enemy.y)/length;
  } else {
    enemy.tacticalRole=pack?'frontline':undefined;
    if(recover||range<=Math.min(30,preferred*.7))return;
    if(ranged&&range<preferred*.5){dx=-dx;dy=-dy;pace=.5;}
  }
  game.move(enemy,dx*speed*pace*dt,dy*speed*pace*dt,definition.boss?22:10);
}

function championPressure(game,enemy,definition,living) {
  if(!definition.boss||(enemy.level||definition.level)<12)return;
  const stage=enemy.hp<=enemy.maxHp*.3?3:enemy.hp<=enemy.maxHp*.65?2:1;
  const previous=enemy.pressurePhase||1;
  if(stage>previous) {
    enemy.pressurePhase=stage;
    game.effect('ring',enemy.x,enemy.y,{color:stage===3?'#e56650':'#dda463',radius:stage===3?85:65,life:1});
    for(const ally of living)if(distance(ally.player,enemy)<650)ally.notice?.(`${definition.name}: ${stage===3?'Letzte Raserei · kürzere Erholung!':'Jagddruck · der nächste Gegenangriff kommt früher!'}`,'danger');
  }
}

function attackProfile(enemy,definition,range) {
  const combat={...definition.combat},preferred=combat.preferredRange||definition.range||45;
  if(definition.boss&&(enemy.level||definition.level)>=12)combat.recovery=Math.max(.6,(combat.recovery||1.1)*(enemy.pressurePhase===3?.66:enemy.pressurePhase===2?.82:1));
  let attackRange=preferred;
  // Preferred spacing is a movement decision. It must not cap a projectile
  // whose visible trajectory can reach a player standing farther away.
  if(projectilePatterns.has(combat.pattern)) {
    attackRange=combat.attackRange||Math.min(combat.projectileRange||650,definition.boss?440:Math.max(240,(definition.range||preferred)+140));
    if(definition.boss&&combat.pattern!=='ring')combat.projectileSpeed=clamp(Math.max(260,combat.projectileSpeed||185),260,320);
    // A projectile expires after at most four seconds. Both its warning and
    // attack decision use that actual reach, including deliberately slow rings.
    combat.projectileSpeed ||= 185;
    combat.projectileRange=Math.min(combat.projectileRange||650,combat.projectileSpeed*4);
    attackRange=Math.min(attackRange,combat.projectileRange);
  } else if(combat.pattern==='hex')attackRange=combat.attackRange||Math.max(preferred,definition.boss?420:220);
  else if(combat.pattern==='charge')attackRange=(combat.chargeDistance||180)+25;
  // Slow melee champions use a warned, collision-constrained lunge to close a
  // ranged opening. They keep their own melee rhythm once the player is close.
  if((definition.boss||enemy.elite&&enemy.encounterTier==='relentless')&&['melee','brute','cleave'].includes(combat.pattern)&&range>110) {
    const reach=definition.boss?300:260;
    combat.pattern='charge';combat.chargeDistance=Math.min(reach,range+30);attackRange=reach;
    combat.windup=Math.max(1.15,combat.windup||1.15);
  }
  return {combat,preferred,attackRange};
}

function lockedAim(enemy,player,combat,boss) {
  const current={x:player.x,y:player.y},vx=Number.isFinite(player.velocityX)?player.velocityX:0,vy=Number.isFinite(player.velocityY)?player.velocityY:0;
  const windup=combat.windup||.65,travel=projectilePatterns.has(combat.pattern)?distance(enemy,player)/(combat.projectileSpeed||185):0;
  const seconds=boss?Math.min(2,windup+travel):Math.min(.6,travel*.5);
  const maxLead=boss?(combat.pattern==='hex'?260:220):70;
  let dx=vx*seconds,dy=vy*seconds,length=Math.hypot(dx,dy);
  if(length>maxLead) {dx*=maxLead/length;dy*=maxLead/length;}
  if(!['melee','brute','cleave','charge'].includes(combat.pattern)) {current.x+=dx;current.y+=dy;}
  return {point:current,angle:Math.atan2(current.y-enemy.y,current.x-enemy.x)};
}

export function applyEnemyTraits(game,enemy,definition,target,appliedDamage) {
  if(!appliedDamage||!definition.traits)return;
  const traits=definition.traits,p=target.player;
  if(traits.includes('frost')){p.slowUntil=Math.max(p.slowUntil||0,game.time+1.4);p.slowFactor=.85;}
  if(traits.includes('draining'))enemy.hp=Math.min(enemy.maxHp,enemy.hp+appliedDamage*.25);
  const ailment=traits.includes('venom')?'venom':traits.includes('burning')?'burn':traits.includes('bleeding')?'bleed':null;
  if(ailment) {
    const effects=p.afflictions||=[];
    const present=effects.find(e=>e.kind===ailment),effect={kind:ailment,damage:Math.max(1,Math.round((enemy.damage||definition.damage)*.12)),
      expiresAt:game.time+3,nextTick:game.time+1,attackerLevel:enemy.level||definition.level};
    if(present){present.expiresAt=effect.expiresAt;present.damage=Math.max(present.damage,effect.damage);}
    else effects.push(effect);
  }
}

function damageTarget(game,enemy,definition,target,amount) {
  const applied=target.damagePlayer(amount,{attackerLevel:enemy.level||definition.level});
  applyEnemyTraits(game,enemy,definition,target,applied);
}

function hostileProjectile(game,enemy,definition,angle,damage,combat) {
  const speed=combat.projectileSpeed||185;
  game.projectiles.push({x:enemy.x,y:enemy.y,angle,type:'enemy',owner:'enemy',speed,damage,
    life:Math.min(4,(combat.projectileRange||650)/speed),attackerLevel:enemy.level||definition.level,attackerId:enemy.id,color:definition.color,radius:6});
}

function resolveAttack(game,enemy,definition,living,target) {
  const combat={...definition.combat,pattern:enemy.telegraphPattern||definition.combat.pattern,
    projectileSpeed:enemy.telegraphProjectileSpeed??definition.combat.projectileSpeed,
    projectileRange:enemy.telegraphProjectileRange??definition.combat.projectileRange,
    projectileCount:enemy.telegraphProjectileCount??definition.combat.projectileCount,
    spread:enemy.telegraphProjectileSpread??definition.combat.spread,
    chargeDistance:enemy.telegraphChargeDistance??definition.combat.chargeDistance};
  const pattern=combat.pattern,damage=enemy.telegraphDamage??enemy.damage??definition.damage;
  const center={x:enemy.telegraphX,y:enemy.telegraphY},angle=enemy.attackAngle??enemy.face;
  const hitArea=(radius,power=1)=>{
    game.effect('ring',center.x,center.y,{radius,color:definition.color,life:.4});
    for(const ally of living)if(distance(ally.player,center)<radius)damageTarget(game,enemy,definition,ally,damage*power);
  };
  if(['melee','brute','cleave'].includes(pattern))hitArea(enemy.telegraphRadius||62);
  else if(pattern==='charge') {
    const end={x:enemy.x+Math.cos(angle)*(combat.chargeDistance||180),y:enemy.y+Math.sin(angle)*(combat.chargeDistance||180)};
    const start={x:enemy.x,y:enemy.y};
    // Step along the actual collision-constrained path; walls stop the lunge.
    let hit=new Set();
    const steps=16;
    for(let step=0;step<steps;step++) {
      game.move(enemy,(end.x-start.x)/steps,(end.y-start.y)/steps,definition.boss?22:10);
      for(const ally of living)if(!hit.has(ally)&&distance(ally.player,enemy)<35) {hit.add(ally);damageTarget(game,enemy,definition,ally,damage);}
    }
    game.effect('burst',enemy.x,enemy.y,{radius:35,color:definition.color,life:.45});
  } else if(pattern==='hex') {
    hitArea(enemy.telegraphRadius||75,.9);
  } else if(pattern==='summoner') {
    const existing=game.world.enemies.filter(e=>e.alive&&e.summonedBy===enemy.id).length;
    const minionType=BESTIARY_ENEMIES[combat.summonType]?.combat.pattern!=='summoner'?combat.summonType:
      (REGION_ENEMY_POOLS[enemy.region||definition.regions?.[0]]||[]).find(type=>BESTIARY_ENEMIES[type].combat.pattern!=='summoner');
    const limit=Math.min(3,combat.summonLimit||2);
    for(let index=existing;minionType&&index<limit;index++) {
      const angle=index*Math.PI*2/limit,x=enemy.x+Math.cos(angle)*60,y=enemy.y+Math.sin(angle)*60;
      if(encounterSpawnBlocked(game,{x,y},living))break;
      if(game.collides(x,y,10))continue;
      const minion=createBestiaryEnemy(minionType,`minion-${enemy.id}-${++game.lootSerial}`,x,y,{level:enemy.level,region:enemy.region});
      minion.hp=minion.maxHp=Math.max(1,Math.round(minion.maxHp*.25));minion.damage=Math.max(1,Math.round(minion.damage*.3));
      Object.assign(minion,{summonedBy:enemy.id,summonExpiresAt:game.time+16,rewardless:true,xp:0,gold:0,aggro:true,attackTimer:1});
      game.world.enemies.push(minion);game.effect('ring',x,y,{radius:25,color:definition.color,life:.8});
    }
    hostileProjectile(game,enemy,definition,angle,damage*.65,combat);
  } else if(pattern==='burst') {
    const count=Math.max(1,Math.min(4,combat.projectileCount||2));
    hostileProjectile(game,enemy,definition,angle,damage/Math.sqrt(count),combat);
    enemy.burstQueue=Array.from({length:count-1},(_,i)=>({at:game.time+(i+1)*.18,angle,damage:damage/Math.sqrt(count),
      speed:combat.projectileSpeed||185,range:combat.projectileRange||650}));
  } else {
    const count=Math.max(1,Math.min(12,combat.projectileCount||1));
    for(let i=0;i<count;i++) {
      const offset=pattern==='ring'?i*Math.PI*2/count:count===1?0:(i/(count-1)-.5)*(combat.spread||.7);
      hostileProjectile(game,enemy,definition,(pattern==='ring'?enemy.telegraphAngle??enemy.cycle*.12:angle)+offset,
        damage/Math.sqrt(count),combat);
    }
  }
  if(enemy.telegraphExtraFan) {
    // Extra pressure was already announced at the start of this exact windup;
    // crossing half health during an attack never creates an unmarked volley.
    const fan=enemy.telegraphExtraFan;
    for(let i=0;i<fan.count;i++)hostileProjectile(game,enemy,definition,fan.angle+(i/(fan.count-1)-.5)*fan.spread,
      damage*.45,{...combat,projectileSpeed:fan.speed,projectileRange:fan.range});
  }
}

/** Complete ordinary/champion AI; dungeon encounter controllers stay independent. */
export function updateBestiaryEnemy(game,enemy,definition,dt,living) {
  const combat=definition.combat;
  if(!combat)return false;
  if(game.worldMode==='pvp'||game.world?.isPvp)return true;
  if(enemy.summonedBy&&(enemy.summonExpiresAt<=game.time||!game.world.enemies.some(e=>e.id===enemy.summonedBy&&e.alive))) {
    enemy.alive=false;enemy.hp=0;enemy.respawnAt=Infinity;return true;
  }
  const radius=definition.boss?22:10;
  if(!enemy.alive) {
    const home={x:enemy.homeX??enemy.x,y:enemy.homeY??enemy.y};
    if((!definition.boss||definition.baseType) && !enemy.challengeId && !enemy.rewardless && enemy.respawnAt<game.time && living.every(g=>distance(g.player,enemy)>500&&distance(g.player,home)>500) && !encounterSpawnBlocked(game,home,living)) {
      Object.assign(enemy,{alive:true,hp:enemy.maxHp,x:enemy.homeX,y:enemy.homeY,phase:'idle',aggro:false,attackTimer:0,pressurePhase:1,burstQueue:[],telegraphExtraFan:null});
    }
    return true;
  }
  if(!living.length)return true;
  const taunted=enemy.tauntUntil>game.time?living.find(g=>(g.player.id||'local')===enemy.targetId):null;
  const target=taunted||living.reduce((a,b)=>distance(a.player,enemy)<distance(b.player,enemy)?a:b);
  const player=target.player,range=distance(player,enemy),home={x:enemy.homeX??enemy.x,y:enemy.homeY??enemy.y};
  const pack=directorPack(game,enemy,definition);
  const managed=enemy.directorId&&enemy.packId===enemy.directorId&&packRules[enemy.encounterTier]&&!enemy.eventId&&!enemy.challengeId;
  enemy.attackTimer=Math.max(0,(enemy.attackTimer||0)-dt);
  const leash=managed?650:combat.leashRange||480,aggro=managed?420:combat.aggroRange||230;
  if(range>leash+180 || distance(enemy,home)>leash || target.inSettlement()) {
    enemy.aggro=false;enemy.phase='idle';enemy.attackTimer=0;
    enemy.burstQueue=[];
  } else if(range<aggro||enemy.hp<enemy.maxHp||taunted)enemy.aggro=true;
  if(!enemy.aggro) {
    const length=distance(enemy,home);
    if(length>6)game.move(enemy,(home.x-enemy.x)/length*definition.speed*.8*dt,(home.y-enemy.y)/length*definition.speed*.8*dt,radius);
    if(!managed&&length<10&&enemy.hp<enemy.maxHp)enemy.hp=Math.min(enemy.maxHp,enemy.hp+enemy.maxHp*.06*dt);
    return true;
  }
  alertDirectorPack(game,enemy,pack);
  championPressure(game,enemy,definition,living);
  const angle=Math.atan2(player.y-enemy.y,player.x-enemy.x);enemy.face=angle;
  for(const shot of enemy.burstQueue||[])if(shot.at<=game.time)hostileProjectile(game,enemy,definition,shot.angle,shot.damage,
    {...combat,projectileSpeed:shot.speed??combat.projectileSpeed,projectileRange:shot.range??combat.projectileRange});
  enemy.burstQueue=(enemy.burstQueue||[]).filter(shot=>shot.at>game.time);
  if(definition.traits?.includes('regenerating')&&enemy.phase==='recover')enemy.hp=Math.min(enemy.maxHp,enemy.hp+enemy.maxHp*.005*dt);
  if(enemy.phase==='windup') {
    if(enemy.attackTimer<=0) {
      enemy.cycle=(enemy.cycle||0)+1;
      resolveAttack(game,enemy,definition,living,target);
      enemy.phase='recover';enemy.attackTimer=enemy.telegraphRecovery??combat.recovery??1.1;
    }
    return true;
  }
  if(enemy.phase==='recover'&&enemy.attackTimer>0) {if(pack)tacticalMove(game,enemy,definition,player,dt,pack,{recover:true});return true;}
  const {combat:attackCombat,preferred,attackRange}=attackProfile(enemy,definition,range);
  if(range<attackRange && enemy.attackTimer<=0&&packCanAttack(game,enemy,pack)) {
    const windup=attackCombat.windup||.65,aim=lockedAim(enemy,player,attackCombat,definition.boss);
    const extraFan=definition.boss&&projectilePatterns.has(attackCombat.pattern)&&enemy.hp<enemy.maxHp*.5&&((enemy.cycle||0)+1)%3===0;
    Object.assign(enemy,{phase:'windup',attackTimer:windup,telegraphDuration:windup,attackAngle:aim.angle,
      telegraphRadius:attackCombat.telegraphRadius||(['hex','summoner'].includes(attackCombat.pattern)?75:attackCombat.pattern==='charge'?35:preferred>90?26:62),
      telegraphX:attackCombat.pattern==='hex'?aim.point.x:enemy.x,telegraphY:attackCombat.pattern==='hex'?aim.point.y:enemy.y,
      telegraphPattern:attackCombat.pattern,telegraphRange:projectilePatterns.has(attackCombat.pattern)?attackCombat.projectileRange:attackRange,
      telegraphAttackRange:attackRange,telegraphProjectileSpeed:attackCombat.projectileSpeed,telegraphProjectileRange:attackCombat.projectileRange,
      telegraphProjectileCount:clamp(attackCombat.projectileCount||1,1,attackCombat.pattern==='burst'?4:12),
      telegraphProjectileSpread:attackCombat.spread||.7,telegraphChargeDistance:attackCombat.chargeDistance,telegraphRecovery:attackCombat.recovery||1.1,
      telegraphDamage:enemy.damage??definition.damage,
      telegraphExtraFan:extraFan?{angle:aim.angle,count:3,spread:.8,range:440,speed:260}:null});
    if(['charge','ranged','fan','burst','ring'].includes(attackCombat.pattern))enemy.telegraphAngle=attackCombat.pattern==='ring'&&!definition.boss?((enemy.cycle||0)+1)*.12:aim.angle;
  } else {
    enemy.phase='chase';
    tacticalMove(game,enemy,definition,player,dt,pack);
  }
  return true;
}
