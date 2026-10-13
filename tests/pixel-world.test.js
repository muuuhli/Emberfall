import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/catalog.js';
import {
  PIXEL_ENEMY_TYPES, PIXEL_WORLD_PALETTE, PIXEL_WORLD_STYLE,
  getPixelSprite, drawPixelTree, drawPixelRock, drawPixelEnemy,
  pixelEnemyHeight, pixelWorldCacheInfo, clearPixelWorldCache,
} from '../src/pixel-world.js';

const recordingContext = () => ({
  calls: [], fillStyle: '',
  fillRect(x,y,w,h) { this.calls.push({x,y,w,h,colour:this.fillStyle}); },
});
const digest = sprite => Buffer.from(sprite.pixels).toString('base64');

test('every shipped enemy type has original pixel art in both directions and all combat poses', () => {
  assert.deepEqual([...PIXEL_ENEMY_TYPES].sort(),Object.keys(ENEMY_TYPES).sort());
  const idleDigests=new Set();
  for(const type of PIXEL_ENEMY_TYPES) {
    for(const face of [0,Math.PI])for(const phase of ['idle','chase','windup','recover']) {
      const sprite=getPixelSprite('enemy',{type,face,phase},.2);
      assert.equal(sprite.clippedPixels,0,`${type}/${phase}/${face}: clipped silhouette`);
      assert.equal(sprite.pixels.length,sprite.width*sprite.height);
      assert.ok(sprite.runs.length>35,`${type}: no placeholder art`);
      assert.ok(sprite.width<=88&&sprite.height<=88);
      assert.ok(sprite.runs.every(r=>Number.isInteger(r.x)&&Number.isInteger(r.y)&&r.w>0&&r.h===1));
      assert.ok(sprite.pixels.every(p=>p>=0&&p<PIXEL_WORLD_PALETTE.length));
    }
    const idle=getPixelSprite('enemy',{type,phase:'idle'}),attack=getPixelSprite('enemy',{type,phase:'windup'});
    assert.notEqual(digest(idle),digest(attack),`${type}: anticipation must change the actual pixels`);
    assert.ok(pixelEnemyHeight(type)>35&&pixelEnemyHeight(type)<=164);
    assert.ok(!idleDigests.has(digest(idle)),`${type}: must not reuse another enemy's complete artwork`);
    idleDigests.add(digest(idle));
  }
});

test('shared palette stays small and every asset has bounded, deliberate colour clusters', () => {
  assert.equal(PIXEL_WORLD_PALETTE.length,39);
  assert.equal(PIXEL_WORLD_STYLE.pixelSize,2);
  for(const type of PIXEL_ENEMY_TYPES) {
    const sprite=getPixelSprite('enemy',{type});
    const colours=new Set(sprite.pixels);colours.delete(0);
    assert.ok(colours.size<=14,`${type}: ${colours.size} colours`);
    assert.ok(sprite.pixels.filter(p=>p!==0).length>=140);
  }
  for(const variant of ['oak','pine','dead','burnt']) {
    const sprite=getPixelSprite('tree',{variant});
    assert.equal(sprite.clippedPixels,0);assert.ok(sprite.runs.length>70);
  }
  for(const variant of ['stone','ice','ash'])assert.equal(getPixelSprite('rock',{variant}).clippedPixels,0);
});

test('draw functions need only fillRect, use even world coordinates and stable feet anchors', () => {
  for(const [draw,subject] of [
    [drawPixelEnemy,{type:'skadi',x:101.3,y:205.7,face:0,phase:'windup'}],
    [drawPixelTree,{variant:'oak',x:101.3,y:205.7,scale:.7}],
    [drawPixelRock,{variant:'ice',x:101.3,y:205.7,scale:1.35}],
  ]) {
    const c=recordingContext(),bounds=draw(c,subject,1);
    assert.equal(bounds.pivotX,102);assert.equal(bounds.pivotY,206);
    assert.ok(c.calls.length>35);
    for(const rect of c.calls) {
      for(const n of [rect.x,rect.y,rect.w,rect.h])assert.equal(n%2,0);
      assert.ok(PIXEL_WORLD_PALETTE.includes(rect.colour));
    }
    const c2=recordingContext();assert.deepEqual(draw(c2,subject,1),bounds);assert.deepEqual(c2.calls,c.calls);
  }
});

test('facing mirrors native pixels around an unchanged world pivot without canvas rotations', () => {
  for(const type of PIXEL_ENEMY_TYPES) {
    const right=getPixelSprite('enemy',{type,face:0}),left=getPixelSprite('enemy',{type,face:Math.PI});
    assert.equal(right.width,left.width);assert.equal(right.height,left.height);
    for(let y=0;y<right.height;y++)for(let x=0;x<right.width;x++) {
      assert.equal(right.pixels[y*right.width+x],left.pixels[y*left.width+left.width-1-x]);
    }
    const a=drawPixelEnemy(recordingContext(),{type,face:0,x:44,y:88});
    const b=drawPixelEnemy(recordingContext(),{type,face:Math.PI,x:44,y:88});
    assert.equal(a.pivotX,b.pivotX);assert.equal(a.pivotY,b.pivotY);
  }
});

test('walk frames are time-quantised and idle / windup never wobble with wall-clock time', () => {
  const actor={type:'wolf',phase:'chase'};
  assert.equal(getPixelSprite('enemy',actor,.01),getPixelSprite('enemy',actor,.12));
  assert.notEqual(digest(getPixelSprite('enemy',actor,.01)),digest(getPixelSprite('enemy',actor,.16)));
  for(const phase of ['idle','windup','recover'])assert.equal(getPixelSprite('enemy',{type:'storm_king',phase},0),getPixelSprite('enemy',{type:'storm_king',phase},400));
});

test('boss DPS objectives use distinct plant, soul and crystal sprites', () => {
  const sprites=['Dornenknospe','Hungrige Seele','Prismatischer Anker'].map(name=>getPixelSprite('enemy',{type:'echo_guard',stationary:true,bossObjectiveId:'objective',name}));
  assert.equal(new Set(sprites.map(digest)).size,3);
  for(const sprite of sprites)assert.equal(sprite.clippedPixels,0);
});

test('sprite and optional canvas caches remain bounded after all artwork and poses are visited', () => {
  clearPixelWorldCache();
  for(const type of PIXEL_ENEMY_TYPES)for(const phase of ['idle','chase','windup','recover'])for(const face of [0,Math.PI])getPixelSprite('enemy',{type,phase,face},.16);
  for(const variant of ['oak','pine','dead','burnt'])for(const scale of [.7,1,1.3])for(const x of [0,9])getPixelSprite('tree',{variant,scale,x});
  for(const variant of ['stone','ice','ash'])for(const scale of [.6,1,1.4])for(const x of [0,1])getPixelSprite('rock',{variant,scale,x});
  const info=pixelWorldCacheInfo();assert.equal(info.sprites,192);assert.ok(info.canvases<=info.sprites);
  clearPixelWorldCache();assert.equal(pixelWorldCacheInfo().sprites,0);
});

test('DOM cache is optional, respects native dimensions and never applies smoothing', () => {
  clearPixelWorldCache();
  const previous=globalThis.document,offscreen=[];
  globalThis.document={createElement(tag){assert.equal(tag,'canvas');const context=recordingContext();const canvas={getContext(){return context;},context};offscreen.push(canvas);return canvas;}};
  try {
    const c=recordingContext();c.drawImage=function(...args){this.images??=[];this.images.push(args);};
    const actor={type:'wolf',x:23,y:45};drawPixelEnemy(c,actor,0);drawPixelEnemy(c,actor,0);
    assert.equal(offscreen.length,1);assert.equal(offscreen[0].width,48);assert.equal(offscreen[0].height,28);
    assert.equal(offscreen[0].context.imageSmoothingEnabled,false);assert.equal(c.imageSmoothingEnabled,false);
    assert.equal(c.images.length,2);assert.equal(c.calls.length,0);
    assert.ok(c.images[0].slice(1).every(v=>Number.isInteger(v)&&v%2===0));
  } finally {globalThis.document=previous;clearPixelWorldCache();}
});

test('DOM textures are evicted with sprite data after mixed families exhaust the LRU', () => {
  clearPixelWorldCache();const previous=globalThis.document;
  globalThis.document={createElement(){return {getContext(){return recordingContext();}};}};
  try {
    const c=recordingContext();c.drawImage=()=>{};
    for(const variant of ['stone','ice','ash'])for(const scale of [.6,1,1.4])for(const x of [0,1])drawPixelRock(c,{variant,scale,x,y:0});
    for(const variant of ['oak','pine','dead','burnt'])for(const scale of [.7,1,1.3])for(const x of [0,9])drawPixelTree(c,{variant,scale,x,y:0});
    for(const type of PIXEL_ENEMY_TYPES)for(const phase of ['idle','chase','windup','recover'])for(const face of [0,Math.PI])drawPixelEnemy(c,{type,phase,face,x:0,y:0},.16);
    const info=pixelWorldCacheInfo();assert.equal(info.sprites,192);assert.equal(info.canvases,192);
  } finally {globalThis.document=previous;clearPixelWorldCache();}
});
