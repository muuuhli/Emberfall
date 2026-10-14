/** Native geometry audit, not a combat or campaign-duration certification.
 * node tests/scripts/dungeon-route-audit.mjs [--source /absolute/checkout]
 * Uses Game.collides and Game.move, including the real 12-pixel player radius,
 * to prove contact reachability before and after the authored puzzle gate.
 * No product code, live server data or browser state is modified.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv=process.argv.slice(2),sourceIndex=argv.indexOf('--source');
const source=path.resolve(sourceIndex<0?path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'):argv[sourceIndex+1]);
const [{Game},{DUNGEONS,createDungeon,interactPuzzle,updateDungeon},{interactDungeonRoute,updateDungeonRoutes}]=await Promise.all([
  import(pathToFileURL(path.join(source,'src/game.js')).href),
  import(pathToFileURL(path.join(source,'src/dungeons.js')).href),
  import(pathToFileURL(path.join(source,'src/dungeon-routes.js')).href),
]);
const option=name=>{const i=argv.indexOf(name);return i<0?undefined:argv[i+1];};
const seedCount=Number(option('--seeds')||0),layoutVersion=Number(option('--layout-version')||1),tiers=(option('--tiers')||'1').split(',').map(Number);
const STEP=24,ORIGIN=48,RADIUS=12,seeds=seedCount?Array.from({length:seedCount},(_,i)=>i*7919):[0,17,826535];
const game=new Game({storage:null,random:()=>.5});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function flood(instance,startPosition=instance.spawn) {
  game.world=instance.world;
  const columns=Math.floor((game.world.width-ORIGIN*2)/STEP)+1,rows=Math.floor((game.world.height-ORIGIN*2)/STEP)+1;
  const index=(column,row)=>row*columns+column,point=i=>({x:ORIGIN+i%columns*STEP,y:ORIGIN+Math.floor(i/columns)*STEP});
  const walkable=new Uint8Array(columns*rows),parent=new Int32Array(columns*rows).fill(-2);
  for(let i=0;i<walkable.length;i++){const p=point(i);walkable[i]=!game.collides(p.x,p.y,RADIUS);}
  assert.equal(game.collides(startPosition.x,startPosition.y,RADIUS),false,`${instance.id}: native current-position clearance`);
  const column=Math.round((startPosition.x-ORIGIN)/STEP),row=Math.round((startPosition.y-ORIGIN)/STEP),candidates=[];
  for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)if(column+dc>=0&&column+dc<columns&&row+dr>=0&&row+dr<rows){const next=index(column+dc,row+dr);if(walkable[next])candidates.push(next);}
  candidates.sort((a,b)=>distance(point(a),startPosition)-distance(point(b),startPosition));
  const start=candidates.find(i=>{const body={...startPosition},p=point(i);game.move(body,p.x-body.x,p.y-body.y,RADIUS);return distance(body,p)<1e-6;});
  assert.notEqual(start,undefined,`${instance.id}: actual current position joins a reachable free raster point`);
  const queue=[start];parent[start]=-1;
  for(let head=0;head<queue.length;head++) {
    const current=queue[head],column=current%columns,row=Math.floor(current/columns),p=point(current);
    for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if(column+dc<0||column+dc>=columns||row+dr<0||row+dr>=rows)continue;
      const next=index(column+dc,row+dr);if(!walkable[next]||parent[next]!==-2)continue;
      const nextPoint=point(next),probe={...p};game.move(probe,nextPoint.x-p.x,nextPoint.y-p.y,RADIUS);
      if(distance(probe,nextPoint)>1e-6)continue;
      parent[next]=current;queue.push(next);
    }
  }
  const contact=(object,tolerance=85)=>queue.find(i=>distance(point(i),object)<=tolerance);
  const routeTo=(object,tolerance=85)=> {
    const destination=contact(object,tolerance);assert.notEqual(destination,undefined,`${instance.id}: reachable ${object.id}`);
    const steps=[];for(let i=destination;i>=0;i=parent[i])steps.push(i);
    return steps.reverse().map(point);
  };
  const walkTo=(object,tolerance=85)=> {
    const steps=routeTo(object,tolerance),walker={...startPosition};
    for(const p of steps){game.move(walker,p.x-walker.x,p.y-walker.y,RADIUS);assert.ok(distance(walker,p)<1e-6,`${instance.id}: actual movement reaches ${object.id}`);}
    assert.ok(distance(walker,object)<=tolerance);return Math.max(0,steps.length-1)*STEP;
  };
  return {point,parent,queue,contact,routeTo,walkTo,walkableCount:walkable.reduce((a,b)=>a+b,0)};
}
export function solve(instance) {
  const objects=puzzle=>instance.world.puzzleObjects.filter(o=>o.puzzle===puzzle.id);
  const interact=object=>interactPuzzle(instance,object.id,[{id:'geometry-probe',x:object.x-55,y:object.y,hp:100}]);
  for(const puzzle of instance.puzzles) {
    if(puzzle.type==='sequence')for(const symbol of puzzle.sequence)assert.equal(interact(objects(puzzle).find(o=>o.symbol===symbol)).success,true);
    if(puzzle.type==='light')for(const object of objects(puzzle).filter(o=>o.kind==='lens'))while(object.rotation!==object.targetRotation)assert.equal(interact(object).success,true);
    if(puzzle.type==='switches')for(const object of objects(puzzle).filter(o=>puzzle.pattern[o.index]))assert.equal(interact(object).success,true);
    if(puzzle.type==='crate'){const crate=objects(puzzle).find(o=>o.kind==='crate');for(let i=0;i<4;i++)assert.equal(interact(crate).success,true);}
    if(puzzle.type==='pressure'){
      const humans=objects(puzzle).filter(o=>o.kind==='plate').map((object,i)=>({...object,id:`geometry-human-${i}`,hp:100}));
      for(let i=0;i<55;i++)updateDungeon(instance,.04,humans);
    }
    assert.equal(puzzle.solved,true,`${instance.id}: native puzzle gate solves`);
  }
}

export function solveRouteForGeometry(instance,chamber) {
  // Geometry fixture: defeat or occupy a chamber before auditing its opening.
  // Combat damage/survival/time remain explicitly outside this proof.
  const mesh=flood(instance),human={id:'geometry-probe',hp:100,human:true};
  if(chamber.kind==='martial') {
    for(const id of chamber.enemyIds){const actor=instance.world.enemies.find(e=>e.id===id);mesh.walkTo(actor,20);actor.hp=0;actor.alive=false;}
    updateDungeonRoutes(instance,.04,[human]);
  } else if(chamber.kind==='relay') {
    for(const beacon of chamber.beacons) {
      mesh.walkTo(beacon,20);Object.assign(human,beacon);human.id='geometry-probe';
      assert.equal(interactDungeonRoute(instance,beacon.id,[human]).success,true);
      for(let i=0;i<51;i++)updateDungeonRoutes(instance,.04,[human]);
    }
  } else {
    const core=instance.world.puzzleObjects.find(o=>o.id===chamber.coreId);mesh.walkTo(core,20);Object.assign(human,core);human.id='geometry-probe';
    for(let i=0;i<51;i++)updateDungeonRoutes(instance,.04,[human]);
  }
  assert.ok(instance.routes.completed.includes(chamber.id),`Native route condition completes ${chamber.id}`);
}

const records=[];
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))for(const definition of DUNGEONS)for(const seed of seeds)for(const tier of tiers) {
  const instance=createDungeon(definition.id,{seed,tier,partySize:definition.partyRequired,layoutVersion}),initial=flood(instance);
  const boss=instance.world.enemies.find(e=>e.id===`${instance.id}:boss`);
  assert.equal(initial.contact(boss,20),undefined,`${instance.id}: closed gate prevents premature boss contact`);
  if(instance.routes) {
    for(const chamber of instance.routes.chambers.filter(c=>c.stage==='A'))for(const object of instance.world.puzzleObjects.filter(o=>o.routeChamberId===chamber.id))initial.walkTo(object,object.routeBeacon?20:85);
    for(const chamber of instance.routes.chambers.filter(c=>c.stage==='B'))assert.equal(initial.contact({x:chamber.centerX,y:chamber.y+320},20),undefined,'Second choices need one first-stage success');
    for(const stage of ['A','B']) {
      const alternatives=instance.routes.chambers.filter(c=>c.stage===stage);solveRouteForGeometry(instance,alternatives[(seeds.indexOf(seed)+tiers.indexOf(tier))%3]);
    }
  }
  const preMesh=instance.routes?flood(instance):initial;
  const preContacts=[instance.exit,...instance.world.shrines,...instance.world.nodes,...instance.world.chests.filter(c=>!c.requiresBoss),...instance.world.puzzleObjects.filter(o=>o.kind!=='boss_plate')];
  const paths=preContacts.map(object=>({id:object.id,distance:preMesh.walkTo(object,object.kind==='plate'?20:85)}));
  for(const enemy of instance.world.enemies.filter(e=>!e.boss))assert.equal(game.collides(enemy.x,enemy.y,10),false,`${instance.id}: guard spawns clear of native walls`);
  solve(instance);const opened=flood(instance);
  const bossDistance=opened.walkTo(boss,20);
  for(const object of [...instance.world.chests.filter(c=>c.requiresBoss),...instance.world.puzzleObjects.filter(o=>o.kind==='boss_plate')])opened.walkTo(object,object.kind==='boss_plate'?20:85);
  assert.equal(game.collides(boss.x,boss.y,22),false,`${instance.id}: boss-body clearance`);
  records.push({id:instance.id,seed,tier,layoutVersion:instance.layoutVersion??1,width:instance.world.width,height:instance.world.height,rooms:instance.world.rooms.length,reachableCells:opened.queue.length,closedGateReachableCells:initial.queue.length,preGateContacts:paths.length,bossDistance,maxPreGateDistance:Math.max(...paths.map(p=>p.distance)),guards:instance.world.enemies.filter(e=>!e.boss).length});
}
if(records.length)process.stdout.write(JSON.stringify({kind:'native-geometry-only',playerRadius:RADIUS,rasterStep:STEP,seeds,tiers,maps:records.length,records},null,2)+'\n');
