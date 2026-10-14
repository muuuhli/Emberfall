import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, drawCharacterSprite } from '../src/renderer.js';
import { createCharacterPresentation } from '../src/character-animation.js';
import { deriveCharacterAppearance, clearCharacterAppearanceCache } from '../src/character-appearance.js';
import { Game } from '../src/game.js';
import { makeWorld } from '../src/world.js';

const metadata={classes:['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder'],pivot:[16,40]},atlas={naturalWidth:1024,naturalHeight:384};
function environment(run){
  const before={document:globalThis.document,window:globalThis.window};
  const canvas=()=>{const calls=[],gradient={addColorStop(){}};const c=new Proxy({calls,globalAlpha:1,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:s=>({width:String(s).length*6})},{get(t,k){if(k in t)return t[k];return(...args)=>calls.push({method:k,args});},set(t,k,v){t[k]=v;return true;}});return{width:0,height:0,getContext:()=>c,getBoundingClientRect:()=>({width:360,height:580,left:0,top:0}),context:c};};
  globalThis.document={createElement:canvas};globalThis.window={devicePixelRatio:1};clearCharacterAppearanceCache();
  try{return run(canvas);}finally{clearCharacterAppearanceCache();globalThis.document=before.document;globalThis.window=before.window;}
}

test('shared draw preserves the original class raster, cardinal crop and fixed metadata foot pivot through every phase',()=>environment(canvas=>{
  const c=canvas().context,p={classId:'shadowbinder',face:0,presentation:createCharacterPresentation('cast',2,{windup:true})};
  for(const time of [2,p.presentation.impactAt+.001,p.presentation.impactUntil+.001,p.presentation.endAt+.001]){
    c.calls.length=0;const sample=drawCharacterSprite(c,p,{atlas,metadata,time}),body=c.calls.find(call=>call.method==='drawImage'&&call.args[0]===atlas);
    assert.ok(body);assert.deepEqual(body.args.slice(1),[(8+sample.pose)*32,7*48,32,48,-32,-80,64,96]);assert.ok(!c.calls.some(call=>call.method==='rotate'||call.method==='translate'),'Animation never shifts or spins the real avatar');assert.equal(c.imageSmoothingEnabled,false);
  }
}));

test('equipped bodies compose the same 32x48 raster for world and preview without an extra class weapon',()=>environment(canvas=>{
  const game=new Game({storage:null,random:()=>.5});game.start();const appearance=deriveCharacterAppearance(game);assert.ok(appearance.slots.weapon);
  const c=canvas().context,p={classId:game.classId,face:Math.PI/2,presentation:createCharacterPresentation('melee',1)};
  drawCharacterSprite(c,p,{atlas,metadata,appearance,time:1});const body=c.calls.find(call=>call.method==='drawImage');assert.equal(body.args[0].width,32);assert.equal(body.args[0].height,48);assert.deepEqual(body.args.slice(1),[-32,-80,64,96]);
  assert.ok(!c.calls.some(call=>call.method==='drawImage'&&call.args[0].width===64&&call.args[0].height===96),'The equipped weapon is not covered by the old generic class-weapon accent');
  c.calls.length=0;drawCharacterSprite(c,p,{atlas,metadata,appearance,time:1,scale:3});const preview=c.calls.find(call=>call.method==='drawImage');assert.deepEqual(preview.args.slice(1),[-48,-120,96,144]);
}));

test('drawn dash afterimages remain two faint dressed copies and reduced motion keeps one anchored body',()=>environment(canvas=>{
  const game=new Game({storage:null,random:()=>.5});game.start();const appearance=deriveCharacterAppearance(game),c=canvas().context,p={classId:game.classId,dashUntil:3.2,dashAngle:Math.PI};
  drawCharacterSprite(c,p,{atlas,metadata,appearance,time:3});const copies=c.calls.filter(call=>call.method==='drawImage'&&call.args[0].width===32&&call.args[0].height===48);assert.equal(copies.length,3);assert.deepEqual(copies.at(-1).args.slice(1),[-32,-80,64,96]);
  c.calls.length=0;drawCharacterSprite(c,p,{atlas,metadata,appearance,time:3,reducedMotion:true});assert.equal(c.calls.filter(call=>call.method==='drawImage'&&call.args[0].width===32&&call.args[0].height===48).length,1);
}));

test('authoritative channels crossing a portrait viewport render the exact half-width capsule even with both endpoints offscreen',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld());renderer.bounds={x:820,y:710,w:360,h:580};const e={kind:'mastery-channel',x:700,y:1000,angle:0,length:600,width:14,life:.22,maxLife:.22,color:'#b1b9d7'},game={settings:{reducedMotion:true},time:10};
  assert.equal(renderer.effectVisible(e),true);renderer.effect(view.context,e,game);const caps=view.context.calls.filter(call=>call.method==='arc');assert.deepEqual(caps.map(call=>call.args.slice(0,3)),[[1300,1000,14],[700,1000,14]]);
  assert.equal(renderer.effectVisible({...e,x:2000}),false);assert.ok(!view.context.calls.some(call=>call.method==='fillText'));
}));

test('step strikes show the reached endpoint and locked real cone while marks and wards keep bounded native cues',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game={settings:{reducedMotion:true},time:10},step={kind:'mastery-step',x:900,y:1000,startX:600,startY:1000,angle:.5,range:85,arc:1.4,color:'#bd95cf',life:.3,maxLife:.3};
  renderer.effect(view.context,step,game);assert.ok(view.context.calls.some(call=>call.method==='arc'&&call.args[0]===900&&call.args[1]===1000&&call.args[2]===85&&Math.abs(call.args[3]+.2)<1e-9&&Math.abs(call.args[4]-1.2)<1e-9));
  assert.ok(!view.context.calls.some(call=>['arc','moveTo','lineTo'].includes(call.method)&&call.args[0]===600),'No unreachable or old starting endpoint is advertised as the impact');
  for(const kind of ['mastery-mark','mastery-ward','mastery-proc']){view.context.calls.length=0;renderer.effect(view.context,{kind,x:900,y:1000,radius:kind==='mastery-ward'?42:24,color:'#b9cdbe',life:.5,maxLife:.5},game);assert.ok(view.context.calls.length<450,'Effects keep a fixed small command budget');assert.ok(!view.context.calls.some(call=>call.method==='fillText'));}
}));

test('slash strokes preserve the supplied attack arc and facing for narrow and wider-than-half-circle combos',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game={settings:{reducedMotion:true},time:10};
  for(const [arc,angle,half] of [[.6,-.8,.3],[4.6,-.45,2.3],[-1,-.4,.075],[99,.6,Math.PI],[undefined,.2,.95]]){
    view.context.calls.length=0;renderer.effect(view.context,{kind:'slash',x:900,y:1000,radius:85,arc,angle,life:.2,maxLife:.2},game);
    const strokes=view.context.calls.filter(call=>call.method==='arc');assert.equal(strokes.length,2);assert.deepEqual(strokes[0].args,[0,0,85,-half,half]);
    assert.deepEqual(view.context.calls.find(call=>call.method==='rotate').args,[angle]);
    const tip=strokes[1].args;assert.equal(tip[2],90);assert.ok(tip[3]>=-half&&tip[4]<=half,'The ornamental tip stays within the actual angular sweep');
    assert.ok(Math.abs(tip[3]+half*(.7/.95))<1e-12&&Math.abs(tip[4]-half*(.9/.95))<1e-12);
  }
}));
