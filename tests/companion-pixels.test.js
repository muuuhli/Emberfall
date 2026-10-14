import test from 'node:test';
import assert from 'node:assert/strict';
import { PIXEL_COMPANION_TYPES, PIXEL_WORLD_PALETTE, PIXEL_WORLD_STYLE, getPixelSprite, drawPixelCompanion, clearPixelWorldCache, pixelWorldCacheInfo } from '../src/pixel-world.js';

const TYPES=['whitehorn_fawn','hourglass_moth'];
const digest=sprite=>Buffer.from(sprite.pixels).toString('base64');
const context=()=>({calls:[],fillStyle:'',fillRect(x,y,w,h){this.calls.push({x,y,w,h,color:this.fillStyle});}});

test('the fawn and hourglass moth have eight original unclipped frames using the existing palette in both directions',()=>{
  assert.ok(TYPES.every(type=>PIXEL_COMPANION_TYPES.includes(type)));
  const previous=new Set(PIXEL_COMPANION_TYPES.filter(type=>!TYPES.includes(type)).flatMap(type=>[0,Math.PI].map(face=>digest(getPixelSprite('companion',{type,face},0)))));
  const identities=new Set();
  for(const type of TYPES)for(const face of [0,Math.PI]) {
    const frames=new Set();
    for(let companionFrame=0;companionFrame<8;companionFrame++) {
      const sprite=getPixelSprite('companion',{type,face,companionFrame});
      assert.equal(sprite.clippedPixels,0,`${type}/${face}/${companionFrame}`);assert.ok(sprite.runs.length>100);
      assert.ok(sprite.pixels.every(index=>index>=0&&index<PIXEL_WORLD_PALETTE.length));
      const colors=new Set(sprite.pixels);assert.ok(colors.size>=8&&colors.size<=16,'Authored clusters use a compact existing palette');
      const hash=digest(sprite);assert.ok(!previous.has(hash));assert.ok(!identities.has(hash),'Each native frame and facing has its own artwork');
      frames.add(hash);identities.add(hash);
    }
    assert.equal(frames.size,8,`${type}: eight real animation poses, not repeated keys`);
  }
  assert.equal(identities.size,32);
});

test('new frames are quantized at eight Hz with deterministic explicit inspection, idle and reduced-motion controls',()=>{
  for(const type of TYPES) {
    for(let frame=0;frame<8;frame++) {
      const subject={type,walking:true},expected=getPixelSprite('companion',{type,companionFrame:frame});
      assert.equal(getPixelSprite('companion',subject,(frame+.1)/8),expected);
      assert.equal(getPixelSprite('companion',subject,(frame+.9)/8),expected);
      assert.equal(getPixelSprite('companion',subject,1+(frame+.1)/8),expected);
    }
    const idle=getPixelSprite('companion',{type,companionFrame:0});
    for(const time of [0,.2,2,300]) {
      assert.equal(getPixelSprite('companion',{type,walking:false},time),idle);
      assert.equal(getPixelSprite('companion',{type,reducedMotion:true,companionFrame:6},time),idle);
    }
    assert.equal(getPixelSprite('companion',{type},NaN),idle);assert.equal(getPixelSprite('companion',{type},Infinity),idle);
    assert.equal(getPixelSprite('companion',{type,companionFrame:-2}),idle);
    assert.equal(getPixelSprite('companion',{type,companionFrame:900}),getPixelSprite('companion',{type,companionFrame:7}));
  }
});

test('new companions mirror the exact source grid and draw at stable integer contact points in every pose',()=>{
  for(const type of TYPES)for(let companionFrame=0;companionFrame<8;companionFrame++) {
    const right=getPixelSprite('companion',{type,companionFrame,face:0}),left=getPixelSprite('companion',{type,companionFrame,face:Math.PI});
    assert.equal(left.pivot[0],right.width-1-right.pivot[0]);assert.equal(left.pivot[1],right.pivot[1]);
    for(let y=0;y<right.height;y++)for(let x=0;x<right.width;x++)assert.equal(left.pixels[y*right.width+x],right.pixels[y*right.width+right.width-1-x]);
    for(const face of [0,Math.PI]) {
      const c=context(),bounds=drawPixelCompanion(c,{visualType:type,type:'unrelated-summon',companionFrame,face,x:101.3,y:205.7,hitUntil:10,damaged:true});
      assert.equal(bounds.pivotX,102);assert.equal(bounds.pivotY,206);assert.equal(bounds.w,right.width*2);assert.equal(bounds.h,right.height*2);
      assert.ok(c.calls.every(call=>Number.isInteger(call.x)&&Number.isInteger(call.y)&&call.w%2===0&&call.h%2===0));
      assert.ok(c.calls.every(call=>call.x>=bounds.x&&call.y>=bounds.y&&call.x+call.w<=bounds.x+bounds.w&&call.y+call.h<=bounds.y+bounds.h));
    }
  }
});

test('legacy companions keep their four-pose contract and new frames share the bounded world cache',()=>{
  clearPixelWorldCache();
  for(const type of PIXEL_COMPANION_TYPES.filter(type=>!TYPES.includes(type))) {
    const start=getPixelSprite('companion',{type,phase:'chase'},0),step=getPixelSprite('companion',{type,phase:'chase'},.16);
    assert.match(start.key,/:0:0$/);assert.match(step.key,/:1:0$/);
    assert.equal(getPixelSprite('companion',{type,phase:'chase',companionFrame:7},.16),step,'The new inspection field cannot change old artwork');
    assert.match(getPixelSprite('companion',{type,phase:'windup'},2).key,/:2:0$/);
    assert.match(getPixelSprite('companion',{type,phase:'recover'},2).key,/:3:0$/);
  }
  for(let index=0;index<1000;index++)for(const type of TYPES)getPixelSprite('companion',{type,face:index%2?0:Math.PI},index/91);
  const info=pixelWorldCacheInfo();assert.ok(info.sprites<=PIXEL_WORLD_STYLE.cacheLimit);assert.ok(info.canvases<=PIXEL_WORLD_STYLE.cacheLimit);
  assert.equal(PIXEL_WORLD_PALETTE.length,39);
});
