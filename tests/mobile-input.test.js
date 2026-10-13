import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileInput, bindMobileControls, nearestVisibleEnemy } from '../src/mobile-input.js';

test('radial joystick resolves all eight directions and ignores center drift', () => {
  const input = new MobileInput(); input.start(1, 'move', 100, 100, { x: 100, y: 100 });
  input.move(1, 105, 104); assert.equal(input.keys().size, 0);
  for (const [x, y, keys] of [[60,0,['d']],[60,60,['d','s']],[0,60,['s']],[-60,60,['a','s']],[-60,0,['a']],[-60,-60,['a','w']],[0,-60,['w']],[60,-60,['d','w']]]) {
    input.move(1, 100 + x, 100 + y); assert.deepEqual([...input.keys()].sort(), keys.sort());
    const position = input.movement(); assert.ok(Math.hypot(position.knobX, position.knobY) <= 48.001);
  }
});
test('three fingers can move, hold attack and dodge without stealing each other', () => {
  const input = new MobileInput(); input.start(10, 'move', 60, 0, { x:0,y:0 });
  input.start(11, 'attack'); input.start(12, 'dash');
  assert.deepEqual(input.drainActions(), ['attack','dash']); assert.ok(input.held('attack')); assert.ok(input.keys().has('d'));
  input.end(12); assert.ok(input.held('attack')); input.end(11); assert.equal(input.held('attack'), false); assert.ok(input.keys().has('d'));
  input.end(10); assert.equal(input.keys().size, 0); assert.deepEqual(input.drainActions(), []);
});
test('duplicate pointers and second joystick are ignored; releasing one attack finger keeps the other held', () => {
  const input = new MobileInput(); assert.ok(input.start(1, 'move')); assert.equal(input.start(2, 'move'), false);
  input.start(2, 'attack'); assert.equal(input.start(2, 'attack'), false); input.start(3, 'attack'); input.end(2);
  assert.ok(input.held('attack')); input.clear(); assert.equal(input.pointers.size, 0); assert.deepEqual(input.drainActions(), []);
});
test('opening overlays, cancellation and blur clear movement, held actions and queued presses', () => {
  const input = new MobileInput(); input.start(1,'move',60,0,{x:0,y:0}); input.start(2,'attack'); input.start(3,'bolt');
  input.setBlocked(true); assert.equal(input.keys().size,0); assert.equal(input.held('attack'),false); assert.deepEqual(input.drainActions(),[]);
  assert.equal(input.start(4,'dash'),false); input.setBlocked(false); assert.ok(input.start(4,'dash'));
  input.end(4); input.clear(); assert.equal(input.pointers.size,0); assert.deepEqual(input.drainActions(),[]);
});
test('touch targeting chooses the nearest visible living enemy and retargets after a kill', () => {
  const player={x:100,y:100}, bounds={x:50,y:50,w:100,h:100};
  const enemies=[{id:'outside',x:49,y:100,hp:100},{id:'dead',x:101,y:100,hp:0},{id:'disabled',x:102,y:100,hp:10,alive:false},{id:'near',x:110,y:105,hp:50},{id:'far',x:145,y:145,hp:60}];
  assert.equal(nearestVisibleEnemy(player,enemies,bounds).id,'near'); enemies[3].hp=0;
  assert.equal(nearestVisibleEnemy(player,enemies,bounds).id,'far'); enemies[4].alive=false; assert.equal(nearestVisibleEnemy(player,enemies,bounds),null);
});
test('DOM adapter captures independent touch and mouse pointers and cancels only their own action', () => {
  const previous={window:globalThis.window,document:globalThis.document};
  function surface(dataset={}) {
    const handlers=new Map(),pressed=new Set();
    return {dataset,style:{},captures:[],classList:{toggle(name,value){if(value)pressed.add(name);else pressed.delete(name);},contains:name=>pressed.has(name)},
      addEventListener(name,handler){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(handler);},removeEventListener(name,handler){handlers.get(name)?.delete(handler);},
      fire(name,event={}){for(const handler of handlers.get(name)||[])handler({pointerId:1,pointerType:'touch',button:0,clientX:56,clientY:56,preventDefault(){},...event});},
      setPointerCapture(id){this.captures.push(id);},getBoundingClientRect(){return {left:0,top:0,width:112,height:112};},listenerCount(){return [...handlers.values()].reduce((sum,set)=>sum+set.size,0);}};
  }
  const joystick=surface(),attack=surface({touchAction:'attack'}),dash=surface({touchAction:'dash'}),knob=surface();
  globalThis.window=surface();globalThis.document=surface();globalThis.document.hidden=false;
  let blocked=false,presses=0;const input=new MobileInput(),root={querySelector:selector=>selector==='[data-joystick]'?joystick:knob,querySelectorAll:()=>[attack,dash]};
  try {
    const adapter=bindMobileControls(root,input,{isBlocked:()=>blocked,onPress:()=>presses++});
    joystick.fire('pointerdown',{pointerId:10});joystick.fire('pointermove',{pointerId:10,clientX:110,clientY:110});
    attack.fire('pointerdown',{pointerId:11});dash.fire('pointerdown',{pointerId:12,pointerType:'mouse'});
    assert.deepEqual(joystick.captures,[10]);assert.deepEqual(attack.captures,[11]);assert.deepEqual(dash.captures,[12]);assert.equal(presses,3);
    dash.fire('pointercancel',{pointerId:12});assert.deepEqual(input.drainActions(),['attack']);assert.ok(input.held('attack'));assert.deepEqual([...input.keys()].sort(),['d','s']);
    attack.fire('lostpointercapture',{pointerId:11});assert.equal(input.held('attack'),false);assert.equal(attack.classList.contains('pressed'),false);
    globalThis.window.fire('blur');assert.equal(input.keys().size,0);assert.equal(knob.style.transform,'translate(0px, 0px)');
    blocked=true;attack.fire('pointerdown',{pointerId:13});assert.equal(presses,3);assert.equal(input.pointers.size,0);
    blocked=false;attack.fire('pointerdown',{pointerId:14});attack.fire('pointerup',{pointerId:14});attack.fire('lostpointercapture',{pointerId:14});assert.deepEqual(input.drainActions(),['attack'],'A completed tap survives the subsequent capture release');
    joystick.fire('pointerdown',{pointerId:15});globalThis.document.hidden=true;globalThis.document.fire('visibilitychange');assert.equal(input.pointers.size,0);
    adapter.destroy();assert.equal(joystick.listenerCount(),0);assert.equal(globalThis.window.listenerCount(),0);
  }finally{globalThis.window=previous.window;globalThis.document=previous.document;}
});
