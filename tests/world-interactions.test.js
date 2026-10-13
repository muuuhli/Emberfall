import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { INTERACTION_TYPES, addWorldInteractions, interactionAvailable } from '../src/interactions.js';
import { generateLoot } from '../src/loot.js';
import { basePlayerStats } from '../src/balance.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function fresh(level=25) {
  const game=new Game({storage:null,random:()=>.5});game.player.level=level;
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  game.world.enemies=[];game.start();return game;
}
const object=(game,kind,region='daemmerhain')=>game.world.interactions.find(o=>o.kind===kind&&o.region===region);
const approach=(game,target)=>Object.assign(game.player,{x:target.x,y:target.y});
const state=game=>{const save=clone(game.capture());delete save.savedAt;return save;};
const resources=game=>({gold:game.player.gold,xp:game.player.xp,resources:{...game.resources},inventory:{...game.inventory}});
function restore(game) {const restored=fresh(game.player.level);restored.applySave(clone(game.capture()));restored.start();return restored;}
function defeat(game,enemy) {assert.ok(game.hitEnemy(enemy,enemy.maxHp*10,0)>0);assert.equal(enemy.alive,false);}

test('twelve interaction kinds produce 192 deterministic, selectable objects reachable from the starting village',()=>{
  const game=new Game({storage:null,random:()=>.5}),other=new Game({storage:null,random:()=>.01});game.start();
  assert.equal(Object.keys(INTERACTION_TYPES).length,12);assert.equal(game.world.interactions.length,192);
  assert.deepEqual(game.world.interactions,other.world.interactions);
  const before=clone(game.world.interactions);addWorldInteractions(game.world);assert.deepEqual(game.world.interactions,before);
  for(const region of game.world.regions)assert.deepEqual(game.world.interactions.filter(o=>o.region===region.id).map(o=>o.kind).sort(),Object.keys(INTERACTION_TYPES).sort());

  // Cardinal paths require a clear midpoint; a diagonal corner cannot establish
  // reachability for the player's actual collision radius.
  const step=40,columns=Math.floor(game.world.width/step)+1,rows=Math.floor(game.world.height/step)+1,count=columns*rows;
  const passable=new Uint8Array(count),reached=new Uint8Array(count),queue=new Int32Array(count);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(!game.collides(x*step,y*step))passable[y*columns+x]=1;
  const start=Math.round(game.player.y/step)*columns+Math.round(game.player.x/step);assert.equal(passable[start],1);
  let tail=1;queue[0]=start;reached[start]=1;
  for(let head=0;head<tail;head++) {
    const index=queue[head],x=index%columns,y=Math.floor(index/columns);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,next=ny*columns+nx;
      if(nx<0||nx>=columns||ny<0||ny>=rows||!passable[next]||reached[next]||game.collides((x+dx*.5)*step,(y+dy*.5)*step))continue;
      reached[next]=1;queue[tail++]=next;
    }
  }
  assert.ok(tail>count*.6,'A connected frontier, rather than isolated object clearing.');
  for(const target of game.world.interactions) {
    // A sealed cache becomes selectable after its nearby lever is pulled.
    const locked=target.locked;target.locked=false;
    const cx=Math.round(target.x/step),cy=Math.round(target.y/step);let selectable=false;
    for(let y=Math.max(0,cy-2);y<=Math.min(rows-1,cy+2);y++)for(let x=Math.max(0,cx-2);x<=Math.min(columns-1,cx+2);x++) {
      if(!reached[y*columns+x]||Math.hypot(x*step-target.x,y*step-target.y)>=70)continue;
      game.player.x=x*step;game.player.y=y*step;
      const nearby=game.nearby();if(nearby?.kind==='worldObject'&&nearby.object.id===target.id)selectable=true;
    }
    target.locked=locked;assert.ok(selectable,`${target.id}: reachable and selected by the real interaction prompt`);
  }
});

test('barrel, urn, captive, lore and fountain pay once and remain spent after a reload',()=>{
  const game=fresh();
  for(const kind of ['barrel','urn','captive','lore','fountain']) {
    const target=object(game,kind);approach(game,target);
    const before=resources(game),scale=1+Math.floor(target.level/12);
    if(kind==='fountain'){game.player.hp=1;game.player.mana=0;}
    assert.equal(game.interactWorldObject(target.id),true,kind);assert.equal(target.used,true);
    if(kind==='barrel') {assert.equal(game.resources.wood,before.resources.wood+2*scale);assert.equal(game.resources.ore,before.resources.ore+scale);assert.equal(game.player.gold,before.gold+5+target.level);}
    if(kind==='urn') {assert.equal(game.resources.dust,before.resources.dust+2*scale);assert.equal(game.resources.crystal,before.resources.crystal+scale);}
    if(kind==='captive') {assert.equal(game.player.gold,before.gold+25+target.level*2);assert.equal(game.player.xp,before.xp+50+target.level*15);assert.equal(game.ledger[`rescue:${target.region}`],1);}
    if(kind==='lore')assert.equal(game.player.xp,before.xp+20+target.level*5);
    if(kind==='fountain'){assert.equal(game.player.hp,game.stats().maxHp);assert.equal(game.player.mana,game.stats().mana);}
    const paid=resources(game);assert.equal(game.interactWorldObject(target.id),false);assert.deepEqual(resources(game),paid);
    assert.equal(game.ledger[`interact:${target.id}`],1);
  }
  const loaded=restore(game);
  for(const kind of ['barrel','urn','captive','lore','fountain']) {const target=object(loaded,kind);approach(loaded,target);assert.equal(target.used,true);assert.equal(loaded.interactWorldObject(target.id),false);}
});

test('a captive requires nearby enemies to be defeated, and remote, dead or paused interaction cannot spend an object',()=>{
  const game=fresh(),target=object(game,'captive');approach(game,target);
  const enemy={id:'captive-threat',x:target.x+100,y:target.y,alive:true};game.world.enemies.push(enemy);
  const before=resources(game);assert.equal(game.interactWorldObject(target.id),false);assert.equal(target.used,false);assert.deepEqual(resources(game),before);
  enemy.alive=false;game.player.x+=76;assert.equal(game.interactWorldObject(target.id),false);approach(game,target);
  game.dead=true;assert.equal(game.interactWorldObject(target.id),false);game.dead=false;
  game.paused=true;assert.equal(game.interactWorldObject(target.id),false);game.paused=false;
  assert.equal(game.interactWorldObject(target.id),true);
});

test('a nearby lever opens its sealed cache, and the cache pays one saved equipment reward',()=>{
  const game=fresh(),lever=object(game,'lever'),cache=object(game,'sealed_cache');assert.equal(lever.linkedId,cache.id);
  assert.ok(Math.hypot(lever.x-cache.x,lever.y-cache.y)<=85);approach(game,cache);
  const before=resources(game);assert.equal(game.interactWorldObject(cache.id),false);assert.deepEqual(resources(game),before);
  approach(game,lever);assert.equal(game.interactWorldObject(lever.id),true);assert.equal(cache.locked,false);
  const loaded=restore(game),opened=object(loaded,'sealed_cache');assert.equal(opened.locked,false);approach(loaded,opened);
  const bag=loaded.bagUsed();assert.equal(loaded.interactWorldObject(opened.id),true);assert.equal(loaded.bagUsed(),bag+1);assert.equal(opened.used,true);
  const paid=resources(loaded);assert.equal(loaded.interactWorldObject(opened.id),false);assert.deepEqual(resources(loaded),paid);
});

test('sarcophagus guards must both die; active and completed challenges survive reload and rewards pay once',()=>{
  let game=fresh(),target=object(game,'sarcophagus');approach(game,target);
  const before=resources(game);assert.equal(game.interactWorldObject(target.id),true);assert.equal(target.active,true);assert.equal(target.used,false);
  assert.equal(target.challengeIds.length,2);assert.deepEqual(resources(game),before);assert.equal(game.interactWorldObject(target.id),false);
  let guards=target.challengeIds.map(id=>game.world.enemies.find(e=>e.id===id));
  defeat(game,guards[0]);game.updateWorldInteractions();assert.equal(target.challengeCompleted,undefined);assert.equal(game.interactWorldObject(target.id),false);
  game=restore(game);target=object(game,'sarcophagus');approach(game,target);guards=target.challengeIds.map(id=>game.world.enemies.find(e=>e.id===id));
  assert.equal(guards.filter(e=>e.alive).length,1);assert.equal(target.active,true);
  defeat(game,guards.find(e=>e.alive));game.updateWorldInteractions();assert.equal(target.challengeCompleted,true);
  game=restore(game);target=object(game,'sarcophagus');approach(game,target);assert.equal(target.challengeCompleted,true);assert.equal(target.used,false);
  const bag=game.bagUsed();assert.equal(game.interactWorldObject(target.id),true);assert.equal(game.bagUsed(),bag+1);assert.equal(target.used,true);
  const paid=resources(game);assert.equal(game.interactWorldObject(target.id),false);assert.deepEqual(resources(game),paid);
  const completed=restore(game);assert.equal(object(completed,'sarcophagus').used,true);
});

test('a cursed chest calls one real boss, retains a pending reward with a full bag and cannot duplicate payment after reload',()=>{
  let game=fresh(),target=object(game,'cursed_chest');approach(game,target);
  assert.equal(game.interactWorldObject(target.id),true);assert.equal(target.challengeIds.length,1);
  let boss=game.world.enemies.find(e=>e.id===target.challengeIds[0]);assert.ok(boss.type.endsWith('_boss'));
  game.hitEnemy(boss,boss.maxHp*.15,0);const wounded=boss.hp;
  game=restore(game);target=object(game,'cursed_chest');approach(game,target);boss=game.world.enemies.find(e=>e.id===target.challengeIds[0]);
  assert.equal(target.active,true);assert.equal(boss.hp,wounded);assert.equal(boss.alive,true);
  assert.equal(game.world.enemies.filter(e=>e.challengeId===target.id).length,1);
  assert.equal(game.interactWorldObject(target.id),false);defeat(game,boss);game.updateWorldInteractions();assert.equal(target.challengeCompleted,true);
  for(let index=0;index<240;index++)assert.equal(game.addItem(generateLoot({level:25,classId:'guardian',rarity:'common',rng:()=>.5,uid:`interaction-full-bag-${index}`})),true);
  const full=state(game);assert.equal(game.interactWorldObject(target.id),false);assert.equal(target.used,false);assert.deepEqual(state(game),full);
  game=restore(game);target=object(game,'cursed_chest');approach(game,target);assert.equal(target.challengeCompleted,true);assert.equal(game.bagUsed(),240);
  const item=Object.keys(game.generatedItems)[0];assert.equal(game.salvage(item),true);assert.equal(game.bagUsed(),239);
  const gold=game.player.gold;assert.equal(game.interactWorldObject(target.id),true);assert.equal(game.bagUsed(),240);assert.equal(target.used,true);assert.ok(game.player.gold>gold);
  const paid=resources(game);assert.equal(game.interactWorldObject(target.id),false);assert.deepEqual(resources(game),paid);
  const loaded=restore(game);assert.equal(object(loaded,'cursed_chest').used,true);assert.equal(loaded.bagUsed(),240);
});

test('altar and obelisk charge their resources, refresh rather than stack boons, preserve expiry and restore canonical stats',()=>{
  const game=fresh(),altar=object(game,'altar'),obelisk=object(game,'obelisk');game.resources.crystal=20;game.time=10;
  approach(game,altar);const hp=game.player.hp,baseline=game.stats();assert.equal(game.interactWorldObject(altar.id),true);
  assert.equal(game.resources.crystal,17);assert.equal(game.player.hp,hp*.8);assert.equal(game.stats().damage,baseline.damage+Math.round(basePlayerStats(25).damage*.1));assert.equal(game.stats().lifeSteal,baseline.lifeSteal+.02);
  approach(game,obelisk);assert.equal(game.interactWorldObject(obelisk.id),true);assert.equal(game.resources.crystal,12);
  assert.equal(game.stats().spellDamage,baseline.spellDamage+Math.round(basePlayerStats(25).spellDamage*.1));assert.equal(game.stats().manaRegen,baseline.manaRegen+1.5);
  const enhanced=game.stats(),second=game.world.interactions.find(o=>o.kind==='altar'&&o.region!==altar.region);game.time=30;approach(game,second);assert.equal(game.interactWorldObject(second.id),true);
  assert.deepEqual(game.stats(),enhanced);assert.equal(game.buffs.length,2);assert.equal(game.buffs.find(b=>b.id==='blood_oath').expiresAt,120);
  const loaded=restore(game);assert.deepEqual(loaded.buffs,game.buffs);assert.deepEqual(loaded.stats(),enhanced);
  loaded.time=100;loaded.update(.02,{simulateWorld:false});assert.equal(loaded.buffs.length,1);assert.equal(loaded.stats().spellDamage,baseline.spellDamage);
  loaded.time=120;loaded.update(.02,{simulateWorld:false});assert.deepEqual(loaded.buffs,[]);assert.deepEqual(loaded.stats(),baseline);
});

test('rituals reject insufficient crystals and low altar health without payment',()=>{
  const game=fresh(),altar=object(game,'altar'),obelisk=object(game,'obelisk');
  for(const target of [altar,obelisk]) {approach(game,target);game.resources.crystal=0;const before=state(game);assert.equal(game.interactWorldObject(target.id),false);assert.deepEqual(state(game),before);}
  game.resources.crystal=10;game.player.hp=game.stats().maxHp*.29;approach(game,altar);
  const before=state(game);assert.equal(game.interactWorldObject(altar.id),false);assert.deepEqual(state(game),before);
});

test('malformed boons, interaction states and challenge records reject an import atomically',()=>{
  const game=fresh();game.resources.crystal=10;const altar=object(game,'altar');approach(game,altar);game.interactWorldObject(altar.id);
  const original=state(game);
  for(const corrupt of [
    data=>{data.buffs=[{id:'forged',expiresAt:50}];},data=>{data.buffs[0].expiresAt=-1;},data=>{data.buffs.push({...data.buffs[0]});},data=>{data.buffs='invalid';},
    data=>{data.world.interactions[0].used='yes';},data=>{data.world.interactions[0].readyAt=-1;},data=>{data.world.interactions.push({...data.world.interactions[0]});},data=>{data.world.interactions={};},
    data=>{data.world.challenges=[{id:'bad',type:'missing',challengeId:'forged',level:1,hp:10,x:100,y:100}];},
  ]) {const bad=clone(original);corrupt(bad);assert.throws(()=>game.applySave(bad));assert.deepEqual(state(game),original);}
});

test('campfire requires wood, missing resources and peace, then charges once per saved sixty-second cooldown',()=>{
  const game=fresh(),fire=object(game,'campfire');approach(game,fire);game.time=10;
  game.player.hp=game.stats().maxHp*.1;game.player.mana=game.stats().mana*.1;
  const missing=state(game);assert.equal(game.interactWorldObject(fire.id),false);assert.deepEqual(state(game),missing);
  game.resources.wood=6;game.world.enemies=[{id:'campfire-threat',x:fire.x+100,y:fire.y,alive:true,aggro:true}];
  const combat=state(game);assert.equal(game.interactWorldObject(fire.id),false);assert.deepEqual(state(game),combat);
  game.world.enemies=[];game.player.lastDamageAt=game.time;assert.equal(game.interactWorldObject(fire.id),false);game.time+=5.01;
  const hp=game.player.hp,mana=game.player.mana;assert.equal(game.interactWorldObject(fire.id),true);
  assert.equal(game.resources.wood,4);assert.equal(game.player.hp,hp+game.stats().maxHp*.45);assert.equal(game.player.mana,mana+game.stats().mana*.45);
  assert.equal(fire.used,false);assert.equal(interactionAvailable(fire,game.time),false);
  const paid=resources(game);assert.equal(game.interactWorldObject(fire.id),false);assert.deepEqual(resources(game),paid);
  const loaded=restore(game),savedFire=object(loaded,'campfire');approach(loaded,savedFire);loaded.world.enemies=[];
  assert.equal(savedFire.readyAt,fire.readyAt);assert.equal(loaded.interactWorldObject(savedFire.id),false);
  loaded.time=savedFire.readyAt;loaded.player.hp=loaded.stats().maxHp;loaded.player.mana=loaded.stats().mana;
  assert.equal(loaded.interactWorldObject(savedFire.id),false);assert.equal(loaded.resources.wood,4);
  loaded.player.hp=1;assert.equal(loaded.interactWorldObject(savedFire.id),true);assert.equal(loaded.resources.wood,2);assert.equal(loaded.ledger[`interact:${savedFire.id}`],2);
});

test('reloading after a hit preserves the five-second campfire combat wait',()=>{
  const game=fresh(),fire=object(game,'campfire');approach(game,fire);game.time=20;game.resources.wood=4;game.player.mana=0;
  game.damagePlayer(5,{trueDamage:true});assert.equal(game.inCombat(),true);
  const loaded=restore(game),savedFire=object(loaded,'campfire');approach(loaded,savedFire);loaded.world.enemies=[];
  assert.equal(loaded.inCombat(),true);const wood=loaded.resources.wood;
  assert.equal(loaded.interactWorldObject(savedFire.id),false);assert.equal(loaded.resources.wood,wood);
  loaded.time=25.01;assert.equal(loaded.interactWorldObject(savedFire.id),true);assert.equal(loaded.resources.wood,wood-2);
});
