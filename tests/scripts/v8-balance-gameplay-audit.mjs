// Reproducible native encounters, not a human difficulty verdict. Only starting
// progression/placement, ambient isolation and finite supplies are fixtures.
// node tests/scripts/v8-balance-gameplay-audit.mjs [output.json]
//   [--baseline-root /tmp/emberfall-v8-baseline] [--source-root path]
//   [--quick] [--baseline-only|--current-only]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const BASELINE_COMMIT='d6fc0b005d523d0f9c8f24c906a96e7ee765c3d4';
export const AUDIT_DT=.04;
const PROJECT=fileURLToPath(new URL('../..',import.meta.url));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),round=value=>Math.round(value*100)/100;
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const fingerprintFiles=['game.js','balance.js','classes.js','loot.js','abilities.js','mastery-abilities.js','talent-combat.js','ability-runtime.js','bestiary.js','enemy-ai.js','world-events.js','encounter-content.js','encounter-boss-ai.js','encounter-director.js','dungeons.js','encounter-geometry.js','boss-encounters.js','death-penalty.js'];
export async function sourceFingerprint(root) {
  const files={};
  for(const file of fingerprintFiles){
    try{files[file]=createHash('sha256').update(await fs.readFile(path.join(root,'src',file))).digest('hex');}
    catch(error){if(file==='death-penalty.js'&&error.code==='ENOENT')files[file]=null;else throw error;}
  }
  return {sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
export async function loadAuditSource(root=PROJECT) {
  root=path.resolve(root);const names=['game','classes','abilities','mastery-abilities','encounter-content','catalog','loot','equipment-system','encounter-geometry','balance','talent-combat'];
  const modules=await Promise.all(names.map(name=>import(pathToFileURL(path.join(root,'src',`${name}.js`)))));
  const source={root};modules.forEach((module,index)=>Object.assign(source,module));source.fingerprint=await sourceFingerprint(root);return source;
}

/** Every item and point is spent through the real inventory/learning methods.
 * No forged stat field, HP=1 opponent, relic, gem, upgrade or companion is used.
 */
export function buildAuditCharacter(source,game,level,classId,serial=0) {
  game.player.level=level;const cls=source.CLASSES.find(cls=>cls.id===classId),gear=[],missingSlots=[];
  for(const slot of source.EQUIPMENT_SLOTS){
    const base=source.ITEM_BASES.filter(item=>source.equipmentSlot(item)===slot.id&&item.minLevel<=level&&(!item.classIds||item.classIds.includes(classId)))
      .sort((a,b)=>b.minLevel-a.minLevel||(b.stats.damage||0)-(a.stats.damage||0)||(b.stats.maxHp||0)-(a.stats.maxHp||0)||a.id.localeCompare(b.id))[0];
    if(!base){missingSlots.push(slot.id);continue;}
    const item=source.generateLoot({level,baseId:base.id,classId,rarity:'rare',rng:seeded(8177+level),uid:`v8-native-${classId}-${level}-${serial}-${slot.id}`,source:'audit_fixture'});
    if(!game.addItem(item)||!game.equip(item.id))throw Error(`Illegal equipment ${base.id}`);
    gear.push({slot:slot.id,baseId:base.id,minLevel:base.minLevel,level:item.level,rarity:item.rarity});
  }
  const pointBudget=level*2;game.player.skillPoints=pointBudget;
  // Same ordering in both trees: learn class-available actions, then three
  // mechanical choices through their real prerequisite chains, then passives.
  for(const ability of source.ABILITIES.filter(a=>a.classId===classId&&a.level<=level))game.learnAbility(ability.id);
  const learnPath=(talent,rank)=>{
    if(!talent||(talent.minLevel||1)>level)return false;
    const needs=!talent.requires?[]:Array.isArray(talent.requires)?talent.requires:[talent.requires];
    for(const need of needs){const id=typeof need==='string'?need:need.id,count=typeof need==='string'?talent.requiresRank||1:need.rank||1;if(!learnPath(cls.talents.find(t=>t.id===id),count))return false;}
    while((game.skills[talent.id]||0)<rank)if(!game.learn(talent.id))return false;return true;
  };
  const exclusive=new Set();
  for(const talent of cls.talents.filter(t=>t.combatEffects&&(t.minLevel||1)<=level)){
    if(talent.exclusiveGroup&&exclusive.has(talent.exclusiveGroup))continue;
    if(learnPath(talent,talent.maxRank)&&talent.exclusiveGroup)exclusive.add(talent.exclusiveGroup);
  }
  for(let pass=0;pass<3;pass++)for(const talent of cls.talents.filter(t=>!t.combatEffects&&(t.minLevel||1)<=level))if((game.skills[talent.id]||0)<Math.min(3,talent.maxRank))game.learn(talent.id);
  const available=source.ABILITIES.filter(a=>a.classId===classId&&game.learnedAbilities[a.id]);
  const mastered=source.MASTERY_ABILITIES.filter(a=>a.classId===classId&&game.learnedAbilities[a.id]);
  const choices=(level===100&&mastered.length>=2?mastered:available).slice(0,2);game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,null);
  for(let index=0;index<choices.length;index++)if(!game.setAbilityLoadout(index,choices[index].id))throw Error('Rejected legal loadout');
  for(const id of Object.keys(game.inventory))if(game.item(id)?.type==='consumable')delete game.inventory[id];
  const potion=Object.values(source.ITEMS).filter(item=>item.type==='consumable'&&(item.minLevel||1)<=level&&item.family==='health').sort((a,b)=>b.stats.hpRestore-a.stats.hpRestore)[0];
  if(potion)game.addItem(potion.id,5);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  const pointCost=cls.talents.reduce((total,t)=>total+(game.skills[t.id]||0)*t.cost,0)+source.ABILITIES.filter(a=>a.classId===classId&&game.learnedAbilities[a.id]).reduce((total,a)=>total+a.talentCost,0);
  return {classId,level,gear,missingSlots,pointBudget,pointCost,unspent:game.player.skillPoints,loadout:choices.map(a=>a.id),talents:{...game.skills},stats:game.stats(),healing:potion?.id,suppliedPotions:potion?5:0};
}
function keys(game,dx,dy){game.keys.clear();if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');}
export function nativeWarningShapes(source,foes) {
  const shapes=[];
  for(const e of foes){
    if(source.ENEMY_TYPES[e.type]?.encounterProfile){shapes.push(...(e.phase==='windup'?e.telegraphShapes||[]:[]),...(e.activeShapes||[]));continue;}
    if(e.phase!=='windup')continue;const x=e.telegraphX??e.x,y=e.telegraphY??e.y,angle=e.telegraphAngle??e.attackAngle??e.face??0,pattern=e.telegraphPattern;
    if(['melee','brute','cleave','hex'].includes(pattern))shapes.push({kind:'circle',x,y,radius:e.telegraphRadius||65});
    else if(pattern==='charge')shapes.push({kind:'segment',x1:e.x,y1:e.y,x2:e.x+Math.cos(angle)*(e.telegraphChargeDistance||180),y2:e.y+Math.sin(angle)*(e.telegraphChargeDistance||180),width:35});
    else {
      const count=e.telegraphProjectileCount||1,length=e.telegraphProjectileRange||e.telegraphRange||450;
      for(let i=0;i<count;i++){const offset=pattern==='ring'?i*Math.PI*2/count:count===1?0:(i/(count-1)-.5)*(e.telegraphProjectileSpread??.7);shapes.push({kind:'segment',x1:e.x,y1:e.y,x2:e.x+Math.cos(angle+offset)*length,y2:e.y+Math.sin(angle+offset)*length,width:23});}
    }
  }
  return shapes.filter(shape=>!shape.safe);
}

/** Reactive reads only currently exposed warnings/projectiles. Reckless uses
 * the same offensive rotation and preferred range, ignores warnings and never
 * uses a dodge or potion. No controller predicts an unannounced random choice.
 */
export function auditController(source,game,event,style,memory,actions,{offense=true}={}) {
  if(game.dead)return;const p=game.player,cls=source.CLASSES.find(cls=>cls.id===p.classId),stats=game.stats();
  const foes=game.world.enemies.filter(e=>e.alive&&e.eventId===event.id).sort((a,b)=>distance(a,p)-distance(b,p)),target=foes[0];if(!target){game.keys.clear();return;}
  const range=distance(p,target),ranged=cls.abilities.attack.kind==='projectile',preferred=ranged?210:55;
  game.aim={x:target.x,y:target.y};p.face=Math.atan2(target.y-p.y,target.x-p.x);
  let dx=target.x-p.x,dy=target.y-p.y;if(range<(ranged?170:45)){dx=-dx;dy=-dy;}else if(range<=preferred)dx=dy=0;
  const act=name=>{if(game.action(name)){actions[name]=(actions[name]||0)+1;return true;}return false;};
  const shapes=nativeWarningShapes(source,foes),shots=game.projectiles.filter(shot=>shot.owner==='enemy'),danger=shapes.some(shape=>source.hitShape(shape,p));
  if(style==='reactive'){
    if(danger){
      const candidates=[];
      for(const length of [65,120,175,230])for(let i=0;i<16;i++){
        const angle=i*Math.PI/8,point={x:p.x+Math.cos(angle)*length,y:p.y+Math.sin(angle)*length};
        const blocked=[1/3,2/3,1].some(t=>game.collides(p.x+(point.x-p.x)*t,p.y+(point.y-p.y)*t,12));
        point.score=shapes.filter(shape=>source.hitShape(shape,point)).length*10000+(blocked?12000:0)+(game.inSettlement(point.x,point.y)?12000:0)+Math.max(0,distance(point,event)-440)*100+length+Math.abs(distance(point,target)-preferred)*.15;candidates.push(point);
      }
      memory.safetyGoal=candidates.sort((a,b)=>a.score-b.score)[0];dx=memory.safetyGoal.x-p.x;dy=memory.safetyGoal.y-p.y;
      keys(game,dx,dy);if(foes.some(e=>e.phase==='windup'&&e.attackTimer<.38||e.activeShapes?.length))act('dash');memory.channelUntil=0;
    }else if(memory.safetyGoal&&(shots.length||foes.some(e=>e.activeShapes?.length))){dx=memory.safetyGoal.x-p.x;dy=memory.safetyGoal.y-p.y;if(Math.hypot(dx,dy)<20)dx=dy=0;}
    else {
      memory.safetyGoal=null;const incoming=shots.find(shot=>distance(shot,p)<95);
      if(incoming){dx=-Math.sin(incoming.angle)*100;dy=Math.cos(incoming.angle)*100;keys(game,dx,dy);act('dash');memory.channelUntil=0;}
      else if(memory.channelUntil>game.time)dx=dy=0;
    }
    if(p.hp<stats.maxHp*.4)act('potion');
  }else if(memory.channelUntil>game.time)dx=dy=0;
  if(!(style==='reactive'&&danger)&&distance(p,event)>455){dx=event.x-p.x;dy=event.y-p.y;memory.channelUntil=0;}
  keys(game,dx,dy);if(!offense||memory.channelUntil>game.time&&!(style==='reactive'&&danger))return;
  for(const slot of [1,0]){
    const ability=source.ABILITIES.find(a=>a.id===game.abilityLoadout[slot]);if(!ability)continue;
    if(range>(ability.range||ability.radius||150)||ability.kind==='channel'&&(danger&&style==='reactive'||Math.hypot(dx,dy)>5))continue;
    if(game.useLearnedAbility(slot)){actions[ability.id]=(actions[ability.id]||0)+1;if(ability.kind==='channel'){memory.channelUntil=game.time+(ability.windup||0)+(ability.ticks-1)*ability.interval+.04;return;}}
  }
  if(range<cls.abilities.attack.range)act('attack');
  const bolt=cls.abilities.bolt;if((bolt.kind==='heal'?game.partyGames.some(g=>!g.dead&&g.player.hp<g.stats().maxHp*.75):range<(bolt.range||300)))act('bolt');
  const nova=cls.abilities.nova;if(range<(nova.range||nova.radius||155)||(nova.kind==='summon'&&range<360))act('nova');
}

export function createNativeFixture(source,{huntId='event-asterion',classIds=['ranger'],level,style='reactive'}={}) {
  const hunt=source.NAMED_BOSS_HUNTS.find(hunt=>hunt.id===huntId);if(!hunt)throw Error(`Unknown native hunt ${huntId}`);level??=hunt.level;
  const games=classIds.map((classId,index)=>{const game=new source.Game({storage:null,random:seeded(8117+level)});game.selectClass(classId);game.start();game.player.id=`native-${index}`;game.player.name=`Audit ${index+1}`;return game;});
  const gear=games.map((game,index)=>buildAuditCharacter(source,game,level,classIds[index],index)),leader=games[0],world=leader.world,event=world.worldEvents.find(event=>event.id===huntId);
  // Preserve trees, rocks, structures, river, bridges and authored arena cover.
  // Remove only unrelated ambient actors before the real event is started.
  world.enemies=[];world.encounterDirector.nextIn=1e6;
  for(const game of games){game.world=world;game.overworld=world;game.partyGames=games;game.npcs=world.npcs;}
  games.forEach((game,index)=>{const angle=index*Math.PI*2/games.length;game.player.x=event.x+Math.cos(angle)*110;game.player.y=event.y+Math.sin(angle)*110;});
  leader.player.x=event.x;leader.player.y=event.y;
  if(!leader.interactWorldEvent(`${huntId}:start`))throw Error(`Native start rejected ${huntId}`);
  for(const rune of world.eventObjects.filter(object=>object.eventId===huntId&&object.role==='rune'&&!object.hidden)){
    leader.player.x=rune.x;leader.player.y=rune.y;if(!leader.interactWorldEvent(rune.id))throw Error(`Native rune rejected ${rune.id}`);
  }
  leader.player.x=event.x;leader.player.y=event.y;
  // The same clock/authority contract as MultiplayerHub.tick(): a fallen
  // first member cannot freeze time or become the group's simulation leader.
  let elapsed=leader.time;
  const step=()=>{
    const authority=games.find(game=>!game.dead)||leader;
    for(const game of games){game.time=elapsed;game.update(AUDIT_DT,{simulateWorld:false});game.time=elapsed+AUDIT_DT;}
    elapsed+=AUDIT_DT;authority.updateWorld(AUDIT_DT,games);
  };
  return {source,leader,games,world,event,hunt,gear,style,step};
}

export function probeNativeEncounter(source,definition,{limit=150,offense=true}={}) {
  const f=createNativeFixture(source,definition),{games,event,hunt,leader,world,gear,style}=f;
  const actions=games.map(()=>({})),memory=games.map(()=>({})),damage=games.map(()=>0),absorbed=games.map(()=>0),deaths=[],warnings=[],resolutions=[];let boss,start=null,spawnHp,spawnDamage,spawnPartySize,spawnHpScale,lastAction,maxSummons=0,maxProjectiles=0,maxShapes=0,maxRange=0;
  games.forEach((game,index)=>{const original=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{const beforeHp=game.player.hp,beforeShield=game.player.shield||0,applied=original(...args)||0;damage[index]+=applied;absorbed[index]+=Math.max(0,beforeShield-(game.player.shield||0));if(game.dead&&!deaths.some(d=>d.index===index))deaths.push({index,time:round(leader.time),hpBeforeNativeLastHit:beforeHp,applied,gold:game.player.gold,summary:game.deathSummary?.()||null});return applied;};});
  let tick=0,oldCycle=0;
  while(event.state==='active'&&games.some(game=>!game.dead)&&leader.time-(start??0)<limit&&tick++<Math.ceil((limit+5)/AUDIT_DT)){
    if(boss)games.forEach((game,index)=>auditController(source,game,event,style,memory[index],actions[index],{offense}));f.step();
    boss??=world.enemies.find(enemy=>enemy.eventId===hunt.id&&enemy.type===hunt.boss);
    if(!boss)continue;
    if(start===null){start=leader.time;spawnHp=boss.maxHp;spawnDamage=boss.damage;spawnPartySize=boss.partySize??null;spawnHpScale=boss.partyHpScale??null;}
    if(boss.maxHp!==spawnHp)throw Error('Spawn HP budget changed during a native fight');
    if(boss.phase==='windup'&&boss.encounterAction!==lastAction){lastAction=boss.encounterAction;warnings.push({id:lastAction?.id,phase:lastAction?.phase,time:round(leader.time-start),duration:boss.telegraphDuration,shapes:structuredClone(boss.telegraphShapes||[]),frozen:Object.isFrozen(boss.telegraphShapes)});}
    if((boss.cycle||0)>oldCycle){oldCycle=boss.cycle;resolutions.push({cycle:oldCycle,time:round(leader.time-start)});}
    maxSummons=Math.max(maxSummons,leader.summons.length);maxProjectiles=Math.max(maxProjectiles,leader.projectiles.length);maxShapes=Math.max(maxShapes,(boss.telegraphShapes?.length||0)+(boss.activeShapes?.length||0));
    for(const game of games)maxRange=Math.max(maxRange,distance(game.player,event));
  }
  if(!boss)throw Error(`No actual boss spawn ${hunt.id}`);if(!boss.alive&&games.some(game=>!game.dead))f.step();
  const won=!boss.alive&&event.state==='success',seconds=round((leader.time-(start??0))),claimed=[];
  if(won)for(const game of games.filter(game=>!game.dead)){
    // Claim at the actual reached position only. No post-fight teleport or
    // heal is used to turn a native failure into a success.
    if(distance(game.player,event)<85){const first=game.claimWorldEvent(event.id);if(first&&game.claimWorldEvent(event.id))throw Error('Duplicate native reward');claimed.push({id:game.player.id,claimed:first});}
  }
  return {key:[hunt.id,gear[0].level,games.map(g=>g.classId).join('+'),style].join('/'),huntId:hunt.id,level:gear[0].level,classIds:games.map(game=>game.classId),style,partySize:games.length,gear,
    fixture:{pointBudgetPerMember:gear[0].pointBudget,legalGeneratedRare:true,ambientIsolation:true,authoredCoverRetained:true,directorSuppressed:true,noEnemyStatWrites:true,noCombatTeleports:true,healingItemsPerMember:5,seed:8117+gear[0].level,dt:AUDIT_DT},
    won,eventState:event.state,dead:games.every(game=>game.dead),deaths,seconds,bossHp:spawnHp,bossDamage:spawnDamage,spawnPartySize,spawnHpScale,bossRemainingHp:round(boss.hp),bossCycles:boss.cycle||0,
    damageTaken:damage.map(round),shieldAbsorbed:absorbed.map(round),damagePercent:round(damage.reduce((n,v)=>n+v,0)/gear.reduce((n,g)=>n+g.stats.maxHp,0)*100),finalHp:games.map(game=>round(game.player.hp)),actions,warnings,resolutions,claimed,maxSummons,maxProjectiles,maxShapes,maxRange:round(maxRange),offense};
}
export function auditCases(source,{quick=false}={}) {
  const cases=[];
  for(const cls of source.CLASSES.filter(cls=>!quick||['ranger','guardian'].includes(cls.id)))for(const style of ['reactive','reckless'])cases.push({huntId:'event-asterion',classIds:[cls.id],level:100,style});
  for(const [level,huntId]of [[4,'event-sivra'],[12,'event-irdan'],[52,'event-vey']])for(const classId of quick?['ranger']:['guardian','ranger'])for(const style of ['reactive','reckless'])cases.push({huntId,classIds:[classId],level,style});
  for(const [level,huntId]of quick?[[12,'event-irdan']]:[[12,'event-irdan'],[52,'event-vey'],[100,'event-asterion']])for(const classIds of [source.CLASSES.map(cls=>cls.id),Array(8).fill('ranger')])for(const style of ['reactive','reckless'])cases.push({huntId,classIds,level,style});
  return cases;
}
export async function runNativeMatrix(source,options={}) {
  const results=[];for(const definition of auditCases(source,options)){const result=probeNativeEncounter(source,definition,options);results.push(result);if(options.onResult)options.onResult(result);}
  const endFingerprint=await sourceFingerprint(source.root);
  return {sourceRoot:source.root,fingerprint:source.fingerprint,sourceChangedDuringRun:endFingerprint.sha256!==source.fingerprint.sha256,caps:{version:source.BALANCE_VERSION,combat:source.COMBAT_CAPS,sustain:source.COMBAT_SUSTAIN||null,gear:source.GEAR_STAT_CAPS,classPower:source.CLASS_POWER,talentBounds:source.TALENT_COMBAT_BOUNDS},results};
}
export function compareMatrices(baseline,current) {
  return current.results.map(after=>{const before=baseline?.results.find(row=>row.key===after.key);return {key:after.key,style:after.style,partySize:after.partySize,before:before?{seconds:before.seconds,bossHp:before.bossHp,cycles:before.bossCycles,won:before.won,damagePercent:before.damagePercent,deaths:before.deaths.length}:null,after:{seconds:after.seconds,bossHp:after.bossHp,cycles:after.bossCycles,won:after.won,damagePercent:after.damagePercent,deaths:after.deaths.length},hpRatio:before?round(after.bossHp/before.bossHp):null};});
}
export function matrixChecks(matrix) {
  return matrix.results.map(row=>({key:row.key,legal:row.gear.every(gear=>gear.pointCost+gear.unspent===gear.pointBudget&&gear.unspent>=0&&gear.gear.every(item=>item.minLevel<=gear.level)&&Object.values(gear.stats).every(Number.isFinite)),
    frozenWarnings:row.warnings.every(w=>w.frozen&&w.duration>=1.15&&w.shapes.length>0),bounded:row.maxSummons<=64&&row.maxProjectiles<=160&&row.maxShapes<=12,
    reactiveWin:row.style!=='reactive'||row.won,mechanicsEngaged:row.bossCycles>=1,carelessPressure:row.style!=='reckless'||row.damagePercent>0||row.shieldAbsorbed.some(value=>value>0)}));
}

async function main() {
  const args=process.argv.slice(2),option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
  const output=args[0]&&!args[0].startsWith('--')?args[0]:'/tmp/emberfall-v8-balance-gameplay.json',quick=args.includes('--quick');
  let baseline,current;const onResult=row=>console.log(JSON.stringify({key:row.key,won:row.won,seconds:row.seconds,cycles:row.bossCycles,damagePercent:row.damagePercent,deaths:row.deaths.length}));
  if(!args.includes('--current-only'))baseline=await runNativeMatrix(await loadAuditSource(option('--baseline-root','/tmp/emberfall-v8-baseline')),{quick,onResult});
  if(!args.includes('--baseline-only'))current=await runNativeMatrix(await loadAuditSource(option('--source-root',PROJECT)),{quick,onResult});
  const report={auditVersion:1,auditScriptSha256:createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),baselineCommit:BASELINE_COMMIT,humanPlaytest:false,strategy:'Same deterministic rotation/seed/legal earned progression and authored cover. Reactive reads exposed shapes/shots and can dodge/use finite potions; reckless keeps offensive range/rotation but ignores danger and skips dodge/potion. No HP=1, direct boss kill, enemy-stat override, combat teleport, relic, gem, upgrade or companion.',baseline,current,comparison:current?compareMatrices(baseline,current):[],checks:current?matrixChecks(current):[]};
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,baselineCases:baseline?.results.length,currentCases:current?.results.length,currentFailures:report.checks.filter(check=>!check.legal||!check.frozenWarnings||!check.bounded||!check.reactiveWin).map(check=>check.key),mechanicsMissed:report.checks.filter(check=>!check.mechanicsEngaged).map(check=>check.key),carelessNoPressure:report.checks.filter(check=>!check.carelessPressure).map(check=>check.key),sourceChanged:!!(baseline?.sourceChangedDuringRun||current?.sourceChangedDuringRun)}));
  if(baseline?.sourceChangedDuringRun||current?.sourceChangedDuringRun||report.checks.some(check=>!check.legal||!check.frozenWarnings||!check.bounded||!check.reactiveWin))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
