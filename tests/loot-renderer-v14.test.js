import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/renderer.js';
import { generateLoot } from '../src/loot.js';

function context() {
  const calls=[],stack=[];
  return {calls,globalAlpha:1,fillStyle:'',save(){stack.push(this.globalAlpha);calls.push(['save']);},restore(){this.globalAlpha=stack.pop();calls.push(['restore']);},
    fillRect(...args){calls.push(['rect',this.fillStyle,this.globalAlpha,...args]);},drawImage(...args){calls.push(['image',this.globalAlpha,...args]);}};
}
const sword=rarity=>generateLoot({level:25,baseId:'iron_longsword',classId:'guardian',rarity,rng:()=>.5,uid:'sprite-render-test'});
const game={time:10,player:{id:'mine',level:25,x:100,y:100},settings:{reducedMotion:true},item:()=>null};
function draw(item,overrides={}) {
  const c=context(),labels=[];
  const renderer={label(...args){labels.push(args.slice(1));}};
  Renderer.prototype.drop.call(renderer,c,{x:120,y:100,life:120,ownerId:'mine',item:item.id,loot:item,...overrides},game);
  return {c,labels};
}

test('floor equipment renders actual filled pixels and readable native item identity, without generic vector diamonds',()=>{
  const item=sword('rare'),{c,labels}=draw(item);
  assert.ok(c.calls.filter(call=>call[0]==='rect').length>12||c.calls.some(call=>call[0]==='image'));
  assert.ok(labels.some(label=>label[0]===item.name));assert.ok(labels.some(label=>/Selten · Stufe 25/.test(label[0])));
  assert.equal(c.globalAlpha,1);
});

test('rarity adds distinct pixel markers while ownership is explicitly marked and opacity remains isolated',()=>{
  const common=draw(sword('common')),rare=draw(sword('rare')),legend=draw(sword('legendary'));
  assert.ok(legend.c.calls.length>rare.c.calls.length);assert.ok(rare.c.calls.length>common.c.calls.length);
  const foreign=draw(sword('rare'),{ownerId:'other'});
  assert.ok(foreign.c.calls.some(call=>call[0]==='rect'&&call[2]<.5));
  assert.ok(foreign.labels.some(label=>label[0]==='Für Gefährten'));assert.equal(foreign.c.globalAlpha,1);
});

test('reduced motion yields identical landing geometry and expired loot renders nothing',()=>{
  const item=sword('rare'),a=draw(item,{pickupAfter:10.3}),b=draw(item,{pickupAfter:9.7});
  assert.deepEqual(a.c.calls,b.c.calls);
  const expired=draw(item,{life:0});assert.deepEqual(expired.c.calls,[]);assert.deepEqual(expired.labels,[]);
});

test('a pile of floor loot names only the closest personal object, then the next remaining object',()=>{
  const item=sword('rare'),near={x:110,y:100,life:120,ownerId:'other',item:item.id,loot:item},own={...near,x:150,ownerId:'mine'},far={...own,x:400};
  const pile={...game,drops:[near,own,far]},labels=[],renderer={label(...args){labels.push(args.slice(1));}};
  renderer.floorLootFocusGame=pile;renderer.floorLootFocus=Renderer.prototype.closestFloorLoot.call(renderer,pile);
  assert.equal(renderer.floorLootFocus,own);
  for(const drop of pile.drops)Renderer.prototype.drop.call(renderer,context(),drop,pile);
  assert.equal(labels.filter(label=>label[0]===item.name).length,1);
  own.life=0;assert.equal(Renderer.prototype.closestFloorLoot.call(renderer,pile),near);
});
