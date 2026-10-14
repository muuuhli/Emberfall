/** Complete native solo journey audit. The only pre-run fixtures are a legal
 * level, seven generated rare items and native talent/ability purchases.
 * After dungeon entry there are no HP/position/cooldown corrections. Movement
 * uses ordinary keys with native ticks <=0.04 seconds; fights and interactions use Game APIs.
 * This bot test is not human playtime or a 200-hour certification.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {flood} from './dungeon-route-audit.mjs';

const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
const source=path.resolve(value('--source')||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..')),load=name=>import(pathToFileURL(path.join(source,'src',name)).href);
const [{Game},{DUNGEONS},{CLASSES},{generateLoot,ITEM_BASES},{cumulativeXp},{EQUIPMENT_SLOT_IDS,equipmentSlot},{hitShape}]=await Promise.all([
  load('game.js'),load('dungeons.js'),load('classes.js'),load('loot.js'),load('progression.js'),load('equipment-system.js'),load('encounter-geometry.js'),
]);
const sourceHashes=Object.fromEntries(await Promise.all(['game.js','dungeons.js','dungeon-routes.js','balance.js','enemy-ai.js','classes.js','abilities.js','progression.js'].map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(source,'src',name))).digest('hex')])));
const definition=DUNGEONS.find(d=>d.id===(value('--dungeon')||'wurzelgewoelbe'));assert.ok(definition&&!definition.raid,'This audit runs a solo dungeon');
let randomSeed=171;const rng=()=>{randomSeed=(randomSeed|0)+0x6D2B79F5|0;let t=Math.imul(randomSeed^randomSeed>>>15,1|randomSeed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const game=new Game({storage:null,random:rng});assert.equal(game.selectClass('ranger'),true);game.gainXp(cumulativeXp(definition.level));
game.player.id='native-journey-auditor';game.player.name='Routenprüfer';
for(const id of ['ranger_volley','ranger_snare'])assert.equal(game.learnAbility(id),true);
game.setAbilityLoadout(0,'ranger_volley');game.setAbilityLoadout(1,'ranger_snare');
for(let i=0;i<100;i++){const talent=CLASSES.find(c=>c.id==='ranger').talents.find(t=>['damage','crit','maxHp','armor','manaRegen','mana'].includes(t.effect?.stat)&&game.learn(t.id));if(!talent)break;}
for(const slot of EQUIPMENT_SLOT_IDS){
  const bases=ITEM_BASES.filter(base=>equipmentSlot(base)===slot&&base.minLevel<=game.player.level&&(!base.classIds||base.classIds.includes('ranger')));
  const filtered=slot==='weapon'?bases.filter(b=>b.family==='ranger'):bases.filter(b=>b.category===(['ring','charm'].includes(slot)?'martial':'light'));
  const base=(filtered.length?filtered:bases).sort((a,b)=>b.minLevel-a.minLevel||a.id.localeCompare(b.id))[0];
  const item=generateLoot({level:game.player.level,tier:1,classId:'ranger',rarity:'rare',baseId:base.id,uid:`native-journey-${slot}`,rng});assert.equal(game.addItem(item),true);assert.equal(game.equip(item.id),true);
}
game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;Object.assign(game.player,definition.entrance);game.start();
const fixture={level:game.player.level,talentPointsRemaining:game.player.skillPoints,skills:{...game.skills},learned:{...game.learnedAbilities},equipment:{...game.equipment},stats:game.stats(),supplies:{...game.inventory}};
assert.equal(game.enterDungeon(definition.id,1),true);
const instance=game.dungeonInstance,metrics={ticks:0,hpDamage:0,potions:0,movement:0,attacks:0,counters:0,phases:new Set(),routeSeconds:{},warnings:0,shrineRests:0,damageBySource:{}};
const rewardBudgets=instance.world.enemies.map(e=>({id:e.id,level:e.level,xp:e.xp,gold:e.gold}));
const warningIds=new Set();let bossPullTime=null,bossDeathTime=null;
const damage=game.damagePlayer.bind(game);game.damagePlayer=(amount,options)=>{const applied=damage(amount,options)||0;metrics.hpDamage+=applied;if(applied>0){const source=options?.attackerId||'environment';metrics.damageBySource[source]=(metrics.damageBySource[source]||0)+applied;}return applied;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),enemyById=id=>instance.world.enemies.find(e=>e.id===id);
function clearShot(from,to){const steps=Math.ceil(distance(from,to)/10);for(let i=1;i<steps;i++)if(game.collides(from.x+(to.x-from.x)*i/steps,from.y+(to.y-from.y)*i/steps,3))return false;return true;}
function input(goal,target) {
  game.keys.clear();if(goal){const dx=goal.x-game.player.x,dy=goal.y-game.player.y;if(Math.abs(dx)>2)game.keys.add(dx>0?'d':'a');if(Math.abs(dy)>2)game.keys.add(dy>0?'s':'w');}
  if(target)game.aim={x:target.x,y:target.y};else game.aim=null;
}
function danger(p) {
  return instance.world.enemies.some(e=>e.alive&&e.phase==='windup'&&(e.telegraphShapes?.some(s=>!s.safe&&hitShape(s,p))||!e.telegraphShapes?.length&&distance(p,{x:e.telegraphX??e.x,y:e.telegraphY??e.y})<(e.telegraphRadius||0)+10));
}
function safePoint(preferred) {
  if(!danger(game.player))return preferred;
  const candidates=[];
  for(const radius of [90,140,200])for(let i=0;i<16;i++){
    const p={x:game.player.x+Math.cos(i*Math.PI/8)*radius,y:game.player.y+Math.sin(i*Math.PI/8)*radius};
    if(!game.collides(p.x,p.y,13)&&!danger(p))candidates.push({...p,score:distance(game.player,p)+distance(preferred,p)*.3});
  }
  return candidates.sort((a,b)=>a.score-b.score)[0]||preferred;
}
function step(goal,{fight=true,dodge=true}={}) {
  assert.ok(!game.dead,`The legal audit character must survive: ${JSON.stringify({time:game.time,position:game.player,potions:metrics.potions,routes:instance.routes.completed})}`);assert.ok(metrics.ticks<45000,`Controller has a 30-minute native deadline: ${JSON.stringify({player:game.player,alive:instance.world.enemies.filter(e=>e.alive&&distance(e,game.player)<600).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,phase:e.phase})),routes:instance.routes.completed})}`);
  const target=instance.world.enemies.filter(e=>e.alive&&distance(e,game.player)<420).sort((a,b)=>distance(a,game.player)-distance(b,game.player))[0];
  const desired=dodge&&goal?safePoint(goal):goal;input(desired,fight?target:null);
  // Ordinary digital input cannot land on a tight corner if a large fixed tick
  // overshoots both axes. Use a shorter native update and one axis there, as a
  // human releasing a key between rendered frames can do. No position write.
  let dt=.04;
  if(desired){const dx=desired.x-game.player.x,dy=desired.y-game.player.y,delta=Math.max(Math.abs(dx),Math.abs(dy));if(delta>2&&delta<16){game.keys.clear();game.keys.add(Math.abs(dx)>=Math.abs(dy)?dx>0?'d':'a':dy>0?'s':'w');dt=Math.min(.04,delta/game.stats().speed);}}
  if(fight&&target){for(const action of ['attack','bolt','nova'])if(game.action(action))metrics.attacks++;game.useLearnedAbility(0);if(distance(target,game.player)<265)game.useLearnedAbility(1);}
  if(game.player.hp<game.stats().maxHp*.5&&game.action('potion'))metrics.potions++;
  const before={x:game.player.x,y:game.player.y};game.update(dt);metrics.movement+=distance(before,game.player);metrics.ticks++;
  for(const e of instance.world.enemies.filter(e=>e.boss)){if(e.dungeonPhase||e.encounterPhase)metrics.phases.add(e.dungeonPhase||e.encounterPhase);if(instance.bossEngaged&&bossPullTime===null)bossPullTime=game.time;if(!e.alive&&bossDeathTime===null)bossDeathTime=game.time;}
  for(const hazard of game.hazards.filter(h=>h.routeHazard&&h.windup))if(!warningIds.has(hazard.id)){warningIds.add(hazard.id);metrics.warnings++;}
}
function go(object,tolerance=20,{fight=true,dodge=true}={}) {
  let attempts=0;
  while(distance(game.player,object)>tolerance){
    assert.ok(attempts++<300,'Native pathfinding must make progress');
    const points=flood(instance,game.player).routeTo(object,Math.max(18,tolerance-6));
    for(const point of points.slice(0,32)){
      let ticks=0;while(distance(game.player,point)>5&&distance(game.player,object)>tolerance&&ticks++<240)step(point,{fight,dodge});
      if(ticks>=240)break;
    }
    if(distance(game.player,object)<40&&!game.collides(object.x,object.y,12)){
      let ticks=0;while(distance(game.player,object)>tolerance&&ticks++<120)step(object,{fight,dodge});
    }
  }
  input(null,null);
}
function use(object,options={}) {
  go(object,22,options);const before=game.nearby();assert.equal(before?.object.id,object.id,'Native nearby selection picks the intended physical object');game.action('interact');if(before.kind==='shrine')metrics.shrineRests++;
}
const startingTime=game.time;
for(const stage of ['A','B'])for(const kind of ['martial','relay','tactical']) {
  const chamber=instance.routes.chambers.find(c=>c.stage===stage&&c.kind===kind),started=game.time;
  if(kind==='martial') {
    go({x:chamber.centerX,y:chamber.y+420},25);
    while(chamber.enemyIds.some(id=>enemyById(id).alive)){
      const target=chamber.enemyIds.map(enemyById).filter(e=>e.alive).sort((a,b)=>distance(game.player,a)-distance(game.player,b))[0];
      if(!clearShot(game.player,target)){
        const mesh=flood(instance,game.player),positions=[];
        for(const radius of [160,220])for(let i=0;i<16;i++){
          const point={x:target.x+Math.cos(i*Math.PI/8)*radius,y:target.y+Math.sin(i*Math.PI/8)*radius};
          const contact=mesh.contact(point,18),nativePoint=contact===undefined?null:mesh.point(contact);
          if(nativePoint&&!game.collides(nativePoint.x,nativePoint.y,13)&&clearShot(nativePoint,target))positions.push({...nativePoint,score:distance(game.player,nativePoint)});
        }
        assert.ok(positions.length,'Authored cover leaves a reachable firing angle');go(positions.sort((a,b)=>a.score-b.score)[0],18);continue;
      }
      const d=distance(game.player,target),goal=d>260?target:d<95?{x:game.player.x+(game.player.x-target.x)/Math.max(1,d)*80,y:game.player.y+(game.player.y-target.y)/Math.max(1,d)*80}:{x:game.player.x,y:game.player.y};
      if(game.collides(goal.x,goal.y,12))step(target);else step(goal);
    }
    step(null);assert.ok(instance.routes.completed.includes(chamber.id));
  } else if(kind==='relay') {
    let attempts=0;
    while(!instance.routes.completed.includes(chamber.id)){
      assert.ok(attempts++<5,'Relay remains solvable through native walking');
      for(const beacon of chamber.beacons){use(instance.world.puzzleObjects.find(o=>o.id===beacon.id),{fight:false,dodge:false});for(let i=0;i<51;i++)step(null,{fight:false,dodge:false});if(!instance.routes.relay&&!instance.routes.completed.includes(chamber.id))break;}
    }
  } else {
    // Cross through real hazards, with finite starting supplies and ordinary
    // HP loss. Safe positioning between strips is possible; this bot chooses
    // the fast risky crossing to test actual damage and survival.
    const core=instance.world.puzzleObjects.find(o=>o.id===chamber.coreId);go(core,20);for(let i=0;i<51;i++)step(null);assert.ok(instance.routes.completed.includes(chamber.id));
  }
  const chest=instance.world.chests.find(c=>c.routeChamberId===chamber.id);use(chest);assert.equal(chest.opened,true);
  metrics.routeSeconds[chamber.id]=Math.round((game.time-started)*100)/100;
  if(kind==='tactical'){const rest=instance.world.shrines.find(s=>s.id===`${instance.id}:route-rest`);use(rest);}
}
// Reach the original guard rooms and actually clear them before concentrating
// on memory interactions. The old shrine is used through its native UI action.
use(instance.world.shrines.find(s=>s.id===`${instance.id}:rest`));
for(const guard of instance.world.enemies.filter(e=>!e.boss&&!e.routeGuard)) {
  while(guard.alive) {
    const mesh=flood(instance,game.player),positions=[];
    for(const radius of [140,200,250])for(let i=0;i<16;i++){
      const point={x:guard.x+Math.cos(i*Math.PI/8)*radius,y:guard.y+Math.sin(i*Math.PI/8)*radius};
      const contact=mesh.contact(point,18),nativePoint=contact===undefined?null:mesh.point(contact);
      if(nativePoint&&!game.collides(nativePoint.x,nativePoint.y,13)&&clearShot(nativePoint,guard))positions.push({...nativePoint,score:distance(game.player,nativePoint)});
    }
    if(distance(game.player,guard)>290||!clearShot(game.player,guard)) {assert.ok(positions.length,'A real guard is reachable around the authored walls');go(positions.sort((a,b)=>a.score-b.score)[0],18);}
    else step(game.player);
  }
}
use(instance.world.shrines.find(s=>s.id===`${instance.id}:rest`));
// Every old memory is reached and solved through its normal interaction.
for(const puzzle of instance.puzzles) {
  const objects=instance.world.puzzleObjects.filter(o=>o.puzzle===puzzle.id);
  if(puzzle.type==='sequence')for(const symbol of puzzle.sequence)use(objects.find(o=>o.symbol===symbol));
  if(puzzle.type==='light')for(const object of objects.filter(o=>o.kind==='lens'))while(object.rotation!==object.targetRotation)use(object);
  if(puzzle.type==='switches')for(const object of objects.filter(o=>puzzle.pattern[o.index]))use(object);
  if(puzzle.type==='crate'){
    const crate=objects.find(o=>o.kind==='crate');for(let i=0;i<4;i++){go({x:crate.x-50,y:crate.y},8);game.action('interact');}
  }
  assert.equal(puzzle.solved,true,'Old puzzle completes through actual walking and Game interactions');
}
const boss=instance.world.enemies.find(e=>e.boss),bossStarted=game.time;go({x:boss.x-220,y:boss.y},30);
while(boss.alive){const d=distance(game.player,boss),angle=Math.atan2(game.player.y-boss.y,game.player.x-boss.x),preferred={x:boss.x+Math.cos(angle)*190,y:boss.y+Math.sin(angle)*190};step(game.collides(preferred.x,preferred.y,13)?game.player:preferred);}
step(null);assert.equal(instance.bossDefeated,true);const reward=instance.world.chests.find(c=>c.requiresBoss);use(reward);assert.equal(reward.opened,true);
const report={kind:'complete-native-solo-journey',source,sourceHashes,dungeon:instance.id,layoutVersion:instance.layoutVersion,fixture,rewardBudgets,seconds:Math.round((game.time-startingTime)*100)/100,bossSeconds:Math.round((bossDeathTime-bossPullTime)*100)/100,bossSegmentSeconds:Math.round((game.time-bossStarted)*100)/100,
  completedRoutes:instance.routes.completed,openedRouteCaches:instance.world.chests.filter(c=>c.routeChamberId&&c.opened).map(c=>c.id),oldPuzzles:instance.puzzles.map(p=>({type:p.type,solved:p.solved})),bossDefeated:instance.bossDefeated,
  metrics:{...metrics,phases:[...metrics.phases]},ending:{level:game.player.level,hp:game.player.hp,maxHp:game.stats().maxHp,mana:game.player.mana,inventory:game.inventory,resources:game.resources},limitations:['Legal rare starting gear is supplied before entry; procurement time is not measured.','Controller reacts precisely, with no browser/network latency.','Native geometric pathfinder reads the authoritative collision map.','This audit is not a human playtest or a 200-hour content verification.']};
if(value('--out'))await fs.writeFile(value('--out'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify(report,null,2)+'\n');
