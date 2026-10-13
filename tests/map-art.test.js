import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMapFeatures} from '../src/map-art.js';
const context=()=>new Proxy({calls:[]},{get(t,k){return k in t?t[k]:(...args)=>t.calls.push({method:k,args});},set(t,k,v){t[k]=v;return true;}});

test('map marks preserve real landmark, bridge and structure coordinates under projection',()=>{
  const c=context(),world={regions:[{id:'known',x:0,y:0,w:1000,h:1000}],landmarks:[{type:'pond',x:120,y:240,r:40}],bridges:[{x:300,y:400,w:100,angle:0}],structures:[{type:'ruins',x:500,y:600,w:80,h:40}],worldEvents:[{x:700,y:800,state:'active'}]};
  drawMapFeatures(c,world,{mapX:x=>10+x*.1,mapY:y=>20+y*.1,scale:.1,full:true,discovered:['known']});
  assert.ok(c.calls.some(call=>call.method==='ellipse'&&call.args[0]===22&&call.args[1]===44&&call.args[2]===4));
  assert.ok(c.calls.some(call=>call.method==='moveTo'&&call.args[0]===35&&call.args[1]===60));
  assert.ok(c.calls.some(call=>call.method==='lineTo'&&call.args[0]===45&&call.args[1]===60));
  assert.ok(c.calls.some(call=>call.method==='fillRect'&&call.args[0]===60&&call.args[1]===80));
});

test('undiscovered regions do not reveal their landmarks or event locations',()=>{
  const c=context(),world={regions:[{id:'hidden',x:0,y:0,w:1000,h:1000}],river:[[100,100],[200,200]],landmarks:[{type:'graveyard',x:300,y:400,r:40}],bridges:[{x:200,y:200}],worldEvents:[{x:500,y:500,state:'active'}]};
  drawMapFeatures(c,world,{discovered:[]});assert.equal(c.calls.filter(call=>['fillRect','moveTo','ellipse'].includes(call.method)).length,0);
});

test('empty arena worlds and optional fields render without synthesizing map content',()=>{
  const c=context();drawMapFeatures(c,{isPvp:true},{full:true});drawMapFeatures(c,{river:[null,{x:NaN,y:0}],structures:[null],landmarks:[{}]});
  assert.equal(c.calls.filter(call=>['moveTo','fillRect','ellipse'].includes(call.method)).length,0);
});
