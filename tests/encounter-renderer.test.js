import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/renderer.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { hitShape } from '../src/encounter-geometry.js';

// Capture the actual Canvas paths, not a second renderer implementation. The
// winding sampler lets tests probe filled danger zones and their safe holes.
function environment(run) {
  const previous={document:globalThis.document,window:globalThis.window};
  const canvas=()=>{
    const calls=[],fills=[],strokes=[],stack=[],gradient={addColorStop(){}};let path=[];
    const state={calls,fills,strokes,lineWidth:1,lineCap:'butt',lineJoin:'miter',fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,
      createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:value=>({width:String(value).length*6}),
      beginPath(){path=[];calls.push({method:'beginPath',args:[]});},
      fill(rule='nonzero'){fills.push({path:path.map(p=>({...p,args:[...p.args]})),rule,color:this.fillStyle});calls.push({method:'fill',args:[rule]});},
      stroke(){strokes.push({path:path.map(p=>({...p,args:[...p.args]})),color:this.strokeStyle,width:this.lineWidth});calls.push({method:'stroke',args:[]});},
      save(){stack.push({lineWidth:this.lineWidth,lineCap:this.lineCap,lineJoin:this.lineJoin,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,globalAlpha:this.globalAlpha});calls.push({method:'save',args:[]});},
      restore(){Object.assign(this,stack.pop()||{});calls.push({method:'restore',args:[]});},
    };
    const c=new Proxy(state,{get(target,key){if(key in target)return target[key];return(...args)=>{const command={method:key,args};calls.push(command);if(['moveTo','lineTo','arc','ellipse','closePath'].includes(key))path.push(command);};},set(target,key,value){target[key]=value;return true;}});
    return {getContext:()=>c,getBoundingClientRect:()=>({width:360,height:580,left:0,top:0}),context:c,width:0,height:0};
  };
  globalThis.document={createElement:canvas};globalThis.window={devicePixelRatio:1};
  try{return run(canvas);}finally{globalThis.document=previous.document;globalThis.window=previous.window;}
}
const worldFor=enemies=>({isDungeon:true,width:2400,height:1800,regions:[],rooms:[],paths:[],river:[],landmarks:[],structures:[],trees:[],rocks:[],nodes:[],plots:[],shrines:[],chests:[],enemies});
const gameFor=world=>({world,player:{id:'local',classId:'guardian',x:1000,y:1000,hp:100},camera:{x:1000,y:1000},time:10,settings:{reducedMotion:true,shake:false},questState:{},npcs:[],hazards:[],drops:[],effects:[],projectiles:[]});
function contours(commands) {
  const result=[];let current=[];
  const finish=()=>{if(current.length)result.push(current);current=[];};
  for(const {method,args} of commands){
    if(method==='moveTo'){finish();current.push(args);}
    if(method==='lineTo')current.push(args);
    if(method==='arc'){
      const [x,y,r,start,end,ccw=false]=args;let sweep=end-start;
      if(ccw){while(sweep>0)sweep-=Math.PI*2;sweep=Math.max(-Math.PI*2,sweep);}else{while(sweep<0)sweep+=Math.PI*2;sweep=Math.min(Math.PI*2,sweep);}
      const steps=Math.max(1,Math.ceil(Math.abs(sweep)*1024/(Math.PI*2)));for(let i=0;i<=steps;i++){const a=start+sweep*i/steps;current.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}
    }
    if(method==='closePath')finish();
  }
  finish();return result;
}
function inFill(fill,point){
  let crossings=0;
  for(const polygon of contours(fill.path))for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])crossings++;
  }
  return crossings%2===1;
}

test('an offscreen encounter boss still warns every visible shape and never adds a generic windup',()=>environment(canvas=>{
  const view=canvas(),type=Object.keys(ENEMY_TYPES).find(id=>ENEMY_TYPES[id].encounterProfile);assert.ok(type,'The curated catalog profiles are integrated');
  const shape={kind:'circle',x:1080,y:1000,radius:120},crossing={kind:'segment',x1:700,y1:1000,x2:1300,y2:1000,width:12},far={kind:'circle',x:2100,y:1000,radius:30};
  const enemy={type,alive:true,x:1700,y:1000,phase:'windup',attackTimer:.7,telegraphDuration:1.4,telegraphRadius:999,telegraphX:1700,telegraphY:1000,telegraphShapes:[shape,crossing,far],activeShapes:[]},world=worldFor([enemy]),renderer=new Renderer(view,world),game=gameFor(world);
  renderer.draw(game);assert.equal(renderer.visible(enemy.x,enemy.y,190),false,'The boss sprite is outside the portrait viewport');
  const arcs=renderer.worldCtx.calls.filter(call=>call.method==='arc');assert.ok(arcs.some(call=>call.args[0]===1080&&call.args[1]===1000&&call.args[2]===120));
  assert.ok(arcs.some(call=>call.args[0]===700&&call.args[2]===12)&&arcs.some(call=>call.args[0]===1300&&call.args[2]===12),'A capsule crossing the view is warned even when both endpoints are offscreen');
  assert.ok(!arcs.some(call=>call.args[0]===2100||call.args[2]===999),'Each shape uses its own bounds and the old generic radius is suppressed');
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'),'The offscreen warning does not stack action text over the touch area');
}));

test('annulus fill leaves both its inner sanctuary and its rotated angular gap safe',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([])),shape={kind:'annulus',x:1000,y:1000,innerRadius:60,outerRadius:170,gapAngle:.7,gapWidth:.8};
  renderer.encounterShape(view.context,shape,{progress:.6});assert.equal(view.context.fills.length,1);const fill=view.context.fills[0];assert.equal(fill.rule,'evenodd');
  const samples=[{x:1000,y:1000},{x:1020,y:1000},{x:1000+100*Math.cos(.7),y:1000+100*Math.sin(.7)},{x:900,y:1000},{x:1200,y:1000}];
  for(const angle of [1.1-1e-6,1.1+1e-6])samples.push({x:1000+100*Math.cos(angle),y:1000+100*Math.sin(angle)});
  for(const point of samples)assert.equal(inFill(fill,point),hitShape(shape,point),`Warned danger matches shared hit geometry at ${JSON.stringify(point)}`);
  const rim=view.context.strokes.at(-1).path.find(p=>p.method==='arc');assert.ok(Math.abs(rim.args[3]-1.1)<1e-10);assert.ok(rim.args[4]<=1.1+Math.PI*2-.8,'Countdown stays on the dangerous rim and never crosses the safe gap');
  const full={...shape,gapWidth:0};view.context.fills.length=0;renderer.encounterShape(view.context,full);assert.equal(inFill(view.context.fills[0],{x:1000,y:1000}),false);assert.equal(inFill(view.context.fills[0],{x:1100,y:1000}),true);
}));

test('cone and rounded segment paths preserve locked angles, endpoint radii and half widths',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([])),cone=Object.freeze({kind:'cone',x:1000,y:1000,angle:.4,length:200,halfAngle:.35});renderer.encounterShape(view.context,cone);
  const coneArc=view.context.fills[0].path.find(p=>p.method==='arc');assert.deepEqual(coneArc.args,[1000,1000,200,.4-.35,.4+.35]);
  for(const angle of [.4,.4-.4,.4+.4]){const p={x:1000+150*Math.cos(angle),y:1000+150*Math.sin(angle)};assert.equal(inFill(view.context.fills[0],p),hitShape(cone,p));}
  const capsule=Object.freeze({kind:'segment',x1:900,y1:1000,x2:1150,y2:1000,width:18});view.context.fills.length=0;renderer.encounterShape(view.context,capsule);const fill=view.context.fills[0],caps=fill.path.filter(p=>p.method==='arc');
  assert.deepEqual(caps.map(p=>p.args.slice(0,3)),[[1150,1000,18],[900,1000,18]]);
  for(const point of [{x:1000,y:1018-1e-6},{x:1000,y:1018+1e-6},{x:1168-1e-6,y:1000},{x:1168+1e-6,y:1000}])assert.equal(inFill(fill,point),hitShape(capsule,point));
}));

test('projectile delivery outlines its future capsule path without an instantaneous area fill',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([])),shape={kind:'segment',x1:850,y1:1000,x2:1250,y2:1000,width:10,delivery:'projectile'};renderer.encounterShape(view.context,shape,{progress:.8});
  assert.ok(view.context.strokes.some(stroke=>stroke.path.filter(p=>p.method==='arc').length===2),'The exact future footprint includes round endpoints');
  assert.ok(view.context.strokes.some(stroke=>stroke.path.some(p=>p.method==='lineTo'&&p.args[0]===1250&&p.args[1]===1000)),'The path direction follows its frozen endpoints');
  assert.ok(view.context.fills.every(fill=>fill.path.every(p=>p.method!=='arc')),'Only the direction arrow is filled, not the whole future projectile corridor');
}));

test('an authored refuge circle uses its cool safe color and never inherits the danger countdown tint',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([])),safe=Object.freeze({kind:'circle',x:1000,y:1000,radius:70,safe:true,color:'#8dbbb9'});renderer.encounterShape(view.context,safe,{progress:.5,color:'#c099b2'});
  assert.equal(view.context.fills[0].color,'#8dbbb920');assert.ok(!view.context.strokes.some(s=>s.color==='#f4d5b0'));assert.equal(view.context.strokes.at(-1).color,'#b5e4de');assert.equal(inFill(view.context.fills[0],{x:1000,y:1000}),true,'The exact refuge is clearly marked, not moved or resized');
}));

test('active travelling rings use their current geometry independently of boss visibility',()=>environment(canvas=>{
  const view=canvas(),type=Object.keys(ENEMY_TYPES).find(id=>ENEMY_TYPES[id].encounterProfile),shape={kind:'annulus',x:1400,y:1000,innerRadius:250,outerRadius:450,gapAngle:0,gapWidth:.7,active:true};
  const e={type,alive:true,x:1700,y:1000,phase:'recover',activeShapes:[shape]},world=worldFor([e]),renderer=new Renderer(view,world),game=gameFor(world);renderer.draw(game);
  assert.ok(renderer.worldCtx.fills.some(fill=>fill.path.some(p=>p.method==='arc'&&p.args[0]===1400&&p.args[2]===450)&&fill.color.endsWith('55')),'The offscreen ring still covers the visible player and uses its active fill');
  assert.ok(renderer.worldCtx.calls.some(p=>p.method==='arc'&&p.args[2]===250),'The current inner sanctuary is preserved');
}));

test('reduced motion keeps frozen warning geometry and active danger stable at different clocks',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([]));renderer.bounds={x:800,y:700,w:400,h:600};const shape=Object.freeze({kind:'cone',x:1000,y:1000,length:150,angle:1.3,halfAngle:.6}),e={attackTimer:.7,telegraphDuration:1.4,telegraphShapes:Object.freeze([shape]),activeShapes:Object.freeze([{kind:'circle',x:1000,y:1000,radius:80,active:true}])},game=gameFor(renderer.world);
  renderer.encounterShapes(view.context,e,game);renderer.encounterShapes(view.context,e,game,true);const calls=structuredClone(view.context.calls);view.context.calls.length=0;game.time=500;renderer.elapsed=500;renderer.encounterShapes(view.context,e,game);renderer.encounterShapes(view.context,e,game,true);
  assert.deepEqual(view.context.calls,calls);assert.equal(e.telegraphShapes[0],shape,'Drawing never mutates or re-aims the attack snapshot');
}));
