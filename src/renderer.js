import { ENEMY_TYPES, QUESTS } from './catalog.js';
import { CLASSES, getClass } from './classes.js';
import { getRelic } from './relics.js';
import { shapeBounds, annulusDangerArcs } from './encounter-geometry.js';
import { sampleCharacterAnimation } from './character-animation.js';
import { deriveCharacterAppearance, drawCharacterAppearance } from './character-appearance.js';
import { drawPixelTree, drawPixelRock, drawPixelEnemy, drawPixelCompanion, drawPixelProp, drawPixelClassAccent, drawPixelImpact, drawPixelProjectile, pixelEnemyHeight } from './pixel-world.js';
import { drawRaidObjective, RAID_OBJECTIVE_HEIGHT, RAID_WARNING_COLOR, RAID_SAFE_COLOR } from './raid-visuals.js';
import { dungeonRouteSummary, routeHazardShapes } from './dungeon-routes.js';
import { pveLevelGap } from './balance.js';
import { drawPixelItem } from './item-art.js';
import { RARITIES, equipmentRequiredLevel } from './loot.js';

export const TERRAIN_CHUNK_SIZE = 512;
export const TERRAIN_CACHE_LIMIT = 64;
export const TERRAIN_CACHE_BYTES = TERRAIN_CHUNK_SIZE ** 2 * 4 * TERRAIN_CACHE_LIMIT;

// Pixel sprites share one low-resolution world layer. Labels are rendered above
// it at full resolution so small text remains readable on every display.
const TAU = Math.PI * 2;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const noise = (n)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const poly = (c,points,color,stroke,width=1)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(color){c.fillStyle=color;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}};
const ellipse = (c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();};
const line = (c,points,color,width=1)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();};
const rect = (c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
const rounded = (c,x,y,w,h,r,color,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}};
const glow = (c,x,y,r,color)=>{const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ellipse(c,x,y,r,r,g);};
const text = (c,value,x,y,size=12,color='#e4dab8',align='center')=>{c.font=`${size}px "Inter",system-ui,sans-serif`;c.textAlign=align;c.textBaseline='middle';c.fillStyle=color;c.fillText(value,x,y);};
const ROUTE_SYMBOLS={mond:'Mond',blatt:'Blatt',glut:'Glut',frost:'Frost',stern:'Stern'};
const routeGlyphs={
  mond:['..####.','.###...','###....','###....','###....','.###...','..####.'],
  blatt:['....###','...####','..#####','.#####.','#####..','####...','###....'],
  glut:['...#...','..##...','..###..','.#####.','.#####.','#######','.#####.'],
  frost:['#..#..#','.#####.','..###..','#######','..###..','.#####.','#..#..#'],
  stern:['...#...','..###..','#######','.#####.','..###..','.##.##.','#.....#'],
  core:['...#...','..###..','.#####.','###.###','.#####.','..###..','...#...'],
  check:['.......','.....##','....##.','#..##..','####...','.##....','.......'],
  martial:['.....##','....##.','...##..','#.##...','.##....','##.#...','#......'],
  relay:['...#...','..###..','.##.##.','##.#.##','...#...','...#...','..###..'],
  tactical:['###.###','...#...','###.###','...#...','###.###','...#...','...#...'],
};
function routePixelGlyph(c,kind,x,y,color,pixel=2){const rows=routeGlyphs[kind]||routeGlyphs.core;for(let row=0;row<rows.length;row++)for(let col=0;col<rows[row].length;col++)if(rows[row][col]==='#')rect(c,x+(col-3)*pixel,y+(row-3)*pixel,pixel,pixel,color);}

/** A concise account of real route state. This never creates a waypoint or
 * advances a relay; names and the next rune come from the shared instance. */
export function dungeonRoutePresentation(game) {
  const instance=game?.dungeonInstance,summary=dungeonRouteSummary(instance);
  if(!summary||game.worldMode==='pvp'||game.world?.isPvp||instance.bossEngaged&&!instance.bossDefeated)return null;
  const chambers=instance.routes.chambers,relay=summary.relay;
  if(relay){
    const chamber=chambers.find(room=>room.id===relay.chamberId),beacon=chamber?.beacons[relay.step];if(!beacon)return null;
    const members=[game.player,...(game.party||[]),...(game.partyPlayers||[])].map(member=>member?.player||member);
    const carrier=members.find(member=>String(member?.id??'local')===relay.actorId),name=carrier?.name||'Glutträger';
    return {name:`Glutstaffel · ${Math.max(0,Math.ceil(relay.remaining-1e-6))} s`,detail:`${name} → ${ROUTE_SYMBOLS[beacon.symbol]||beacon.symbol} · ${relay.step+1}/3 · ${summary.sigils}/2 Siegel`,
      kind:'relay',sigils:summary.sigils,carrier:name,sequence:chamber.sequence.map(symbol=>ROUTE_SYMBOLS[symbol]||symbol),remaining:relay.remaining,step:relay.step,hold:relay.hold,target:{...beacon,label:`${ROUTE_SYMBOLS[beacon.symbol]||beacon.symbol} · nächstes Staffelzeichen`}};
  }
  if(instance.bossDefeated)return {name:'Dungeon gemeistert',detail:`${summary.sigils}/2 Siegel · Vorräte bergen und zurückkehren`,kind:'complete',sigils:summary.sigils};
  const room=chambers.find(chamber=>game.player.x>=chamber.x&&game.player.x<=chamber.x+chamber.w&&game.player.y>=chamber.y&&game.player.y<=chamber.y+chamber.h);
  if(room&&!instance.routes.completed.includes(room.id)){
    const detail=room.kind==='martial'?'Drei Wächter besiegen':room.kind==='tactical'?'Nördliches Zeichen zwei Sekunden halten':'Runenfolge lesen · mit E beginnen';
    return {name:room.title,detail:`${summary.sigils}/2 Siegel · ${detail}`,kind:room.kind,sigils:summary.sigils};
  }
  return {name:summary.stage==='boss'?'Zu den alten Erinnerungen':summary.stage==='A'?'Erste Wegwahl':'Zweite Wegwahl',detail:`${summary.sigils}/2 Wegsiegel · ${summary.stage==='boss'?'Rätsel öffnen das Bosstor':'Wachtkampf, Glutstaffel oder Wandelgang'}`,kind:'choice',sigils:summary.sigils};
}

const characterMetadata=()=>({tileWidth:32,tileHeight:48,pixelRatio:1,columns:32,rows:8,classes:CLASSES.map(cls=>cls.id),directions:['south','east','north','west'],poses:['idle','walk1','walk2','walk3','walk4','attack1','attack2','downed'],pivot:[16,40]});
const actionMarks=(c,sample,classId)=>{
  const color=sample.presentation?.color||getClass(classId).color,x=Math.round(Math.cos(sample.angle)*18/2)*2,y=-36+Math.round(Math.sin(sample.angle)*8/2)*2;
  const reach=sample.phase==='impact'?10:6;
  if(classId==='flamecaller')poly(c,[[x-4,y+3],[x-3,y-5],[x,y-9],[x+3,y-3],[x+4,y+3]],color);
  else if(classId==='druid'||classId==='ranger'){poly(c,[[x-reach,y],[x-4,y-5],[x-2,y],[x-5,y+3]],color);poly(c,[[x+reach,y],[x+4,y-5],[x+2,y],[x+5,y+3]],color);}
  else if(classId==='nightblade'||classId==='shadowbinder'){for(const side of [-1,1])poly(c,[[x+side*reach,y-4],[x+side*(reach+3),y],[x+side*reach,y+4],[x+side*(reach-3),y]],color);}
  else {rect(c,x-reach-2,y-2,4,4,color);rect(c,x+reach-2,y-2,4,4,color);if(classId==='paladin'||classId==='frostweaver'){rect(c,x-2,y-reach,4,4,color);rect(c,x-2,y+reach-4,4,4,color);}}
};
let sharedCharacterAssets;
/** The world and panel preview share one original raster and metadata request. */
export function loadCharacterSpriteAssets() {
  if(typeof Image==='undefined')return Promise.resolve({atlas:null,metadata:characterMetadata()});
  if(sharedCharacterAssets)return sharedCharacterAssets;
  const atlas=new Image();
  const imageReady=new Promise(resolve=>{atlas.onload=()=>resolve(true);atlas.onerror=()=>resolve(false);atlas.src=new URL('../assets/pixel-characters.png',import.meta.url).href;});
  const metadataReady=typeof fetch==='function'?fetch(new URL('../assets/pixel-characters.json',import.meta.url)).then(response=>response.ok?response.json():null).catch(()=>null):Promise.resolve(null);
  sharedCharacterAssets=Promise.all([imageReady,metadataReady]).then(([loaded,data])=>{
    const valid=data?.tileWidth===32&&data.tileHeight===48&&data.pixelRatio===1&&data.columns===32&&data.rows===8&&data.classes?.length===8&&new Set(data.classes).size===8&&data.classes.every(id=>CLASSES.some(cls=>cls.id===id))&&data.pivot?.join(',')==='16,40'&&data.directions?.join(',')==='south,east,north,west'&&data.poses?.length===8;
    return {atlas:loaded&&valid&&atlas.naturalWidth===1024&&atlas.naturalHeight===384?atlas:null,metadata:valid?data:characterMetadata()};
  });
  return sharedCharacterAssets;
}

/** Draw at the caller's fixed foot origin. No Game/Renderer instance or HUD
 * transform is needed, so panels preview exactly the same dressed character.
 */
export function drawCharacterSprite(c,p,{atlas,metadata=characterMetadata(),appearance,time=0,reducedMotion=false,scale=2}={}) {
  scale=[1,2,3,4].includes(scale)?scale:2;
  const sample=sampleCharacterAnimation(p,time,{reducedMotion}),classId=getClass(p.classId).id,row=metadata.classes.indexOf(classId),look=appearance||deriveCharacterAppearance({classId});
  c.save();c.imageSmoothingEnabled=false;rect(c,-8*scale,scale,16*scale,3*scale,'#142c2c80');rect(c,-5*scale,0,10*scale,5*scale,'#142c2c80');
  if(atlas&&row>=0&&atlas.naturalWidth===1024&&atlas.naturalHeight>=(row+1)*48){
    const alpha=c.globalAlpha;
    for(const ghost of sample.afterimages){c.globalAlpha=alpha*ghost.alpha;drawCharacterAppearance(c,look,{atlas,direction:sample.direction,pose:sample.pose,x:ghost.x*scale/2,y:ghost.y*scale/2,scale});}
    c.globalAlpha=alpha;drawCharacterAppearance(c,look,{atlas,direction:sample.direction,pose:sample.pose,x:0,y:0,scale});
  }else{
    const color=getClass(classId).color;rect(c,-6*scale,-19*scale,12*scale,17*scale,'#182d34');rect(c,-5*scale,-18*scale,10*scale,12*scale,color);rect(c,-5*scale,-6*scale,10*scale,2*scale,'#72573e');
    rect(c,-4*scale,-29*scale,8*scale,10*scale,'#e2b989');rect(c,-5*scale,-31*scale,10*scale,4*scale,'#5b4636');rect(c,-4*scale,-3*scale,3*scale,6*scale,'#25323a');rect(c,scale,-3*scale,3*scale,6*scale,'#25323a');
  }
  c.save();if(scale!==2)c.scale(scale/2,scale/2);
  if(sample.accent){
    const alpha=c.globalAlpha;c.globalAlpha=alpha*(sample.phase==='windup'?.45:sample.phase==='recovery'?.35:1);
    if(sample.accent==='dash'||!look.slots?.weapon)drawPixelClassAccent(c,{x:0,y:0,classId,face:sample.angle,accentPhase:sample.accent,accentFrame:reducedMotion?0:sample.accentFrame});
    else actionMarks(c,sample,classId);
    c.globalAlpha=alpha;
    if(sample.kind==='shield'||sample.kind==='heal'){
      const color=sample.presentation?.color||getClass(classId).color,size=sample.kind==='shield'?22:17;
      for(let i=0;i<4;i++){const angle=i*TAU/4;rect(c,Math.round(Math.cos(angle)*size/2)*2-2,-28+Math.round(Math.sin(angle)*size/2)*2-2,4,4,color);}
      if(sample.kind==='heal'){rect(c,-2,-34,4,12,color);rect(c,-6,-30,12,4,color);}
      else {poly(c,[[-9,-44],[0,-48],[9,-44],[7,-28],[0,-23],[-7,-28]],null,`${color}b0`,2);}
    }
  }
  if(sample.hit)drawPixelImpact(c,{x:0,y:-32,variant:'physical',impactFrame:sample.hitFrame});
  c.restore();c.restore();return sample;
}

export class Renderer {
  constructor(canvas,world) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.world=world;
    this.worldCanvas=document.createElement('canvas');this.worldCtx=this.worldCanvas.getContext('2d',{alpha:false});
    this.lightCanvas=document.createElement('canvas');this.lightCtx=this.lightCanvas.getContext('2d');
    this.camera={x:520,y:1250};this.viewport={width:1000,height:700,dpr:1};this.scale=1;
    this.elapsed=0;this.terrainChunks=new Map();this.legacyBackground=null;this.background=null;
    this.enemyPixelHeights=new Map();this.decorationChunks=new Map();
    this.terrainStats={hits:0,misses:0,evictions:0,bytes:0,maxBytes:TERRAIN_CACHE_BYTES};
    this.setWorld(world);this.loadCharacterAtlas();
    this.resize();
    if(typeof ResizeObserver!=='undefined') {this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement||canvas);}
  }
  resize() {
    const bounds=this.canvas.getBoundingClientRect();
    const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height),dpr=Math.min(window.devicePixelRatio||1,2);
    this.viewport={width,height,dpr};this.scale=1;
    this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    this.worldCanvas.width=Math.ceil(width/2);this.worldCanvas.height=Math.ceil(height/2);
    this.lightCanvas.width=this.worldCanvas.width;this.lightCanvas.height=this.worldCanvas.height;
    this.screenOrigin={x:Math.floor(this.worldCanvas.width/2)*2,y:Math.floor(this.worldCanvas.height/2)*2};
    this.ctx.imageSmoothingEnabled=false;this.worldCtx.imageSmoothingEnabled=false;
  }
  screenToWorld(clientX,clientY) {
    const r=this.canvas.getBoundingClientRect();
    return {x:(clientX-r.left-this.screenOrigin.x)/this.scale+this.camera.x,y:(clientY-r.top-this.screenOrigin.y)/this.scale+this.camera.y};
  }
  worldToScreen(x,y) {return {x:(x-this.camera.x)*this.scale+this.screenOrigin.x,y:(y-this.camera.y)*this.scale+this.screenOrigin.y};}
  visible(x,y,margin=100) {return x>this.bounds.x-margin&&x<this.bounds.x+this.bounds.w+margin&&y>this.bounds.y-margin&&y<this.bounds.y+this.bounds.h+margin;}
  intersects(box,margin=40) {return box.x+box.w>this.bounds.x-margin&&box.x<this.bounds.x+this.bounds.w+margin&&box.y+box.h>this.bounds.y-margin&&box.y<this.bounds.y+this.bounds.h+margin;}
  setWorld(world) {
    for(const chunk of this.terrainChunks.values()){chunk.width=0;chunk.height=0;}
    this.terrainChunks.clear();this.decorationChunks.clear();this.terrainStats.bytes=0;this.world=world;this.terrainWorldRef=world;
    if(!world.isDungeon&&!world.isPvp&&!this.legacyBackground)this.legacyBackground=this.createTerrain();
    this.background=world.isDungeon||world.isPvp?null:this.legacyBackground;
  }
  loadCharacterAtlas() {
    this.characterAtlas=null;this.npcAtlas=null;
    this.atlasMetadata={tileWidth:32,tileHeight:48,pixelRatio:1,columns:32,rows:8,classes:CLASSES.map(c=>c.id),directions:['south','east','north','west'],pivot:[16,40]};
    this.npcMetadata={...this.atlasMetadata,npcs:[],classes:undefined};
    if(typeof Image==='undefined')return;
    const requests=[loadCharacterSpriteAssets().then(assets=>{this.characterAtlas=assets.atlas;this.atlasMetadata=assets.metadata;})];
    for(const [file,imageKey,metaKey,list] of [['pixel-npcs','npcAtlas','npcMetadata','npcs']]){
      const atlas=new Image();
      let metadata=null,loaded=false;
      const publish=()=>{if(loaded&&metadata&&atlas.naturalWidth===1024&&atlas.naturalHeight===metadata.rows*48){this[metaKey]=metadata;this[imageKey]=atlas;}};
      requests.push(new Promise(resolve=>{atlas.onload=()=>{loaded=true;publish();resolve();};atlas.onerror=resolve;atlas.src=new URL(`../assets/${file}.png`,import.meta.url).href;}));
      if(typeof fetch==='function')requests.push(fetch(new URL(`../assets/${file}.json`,import.meta.url)).then(response=>response.ok?response.json():null).then(data=>{
        const ids=data?.[list];
        if(data?.tileWidth===32&&data.tileHeight===48&&data.pixelRatio===1&&data.columns===32&&Array.isArray(ids)&&ids.length>0&&ids.length<=64&&data.rows===ids.length&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&id.length>0)&&data.pivot?.length===2&&data.pivot[0]===16&&data.pivot[1]===40&&data.directions?.join(',')==='south,east,north,west'&&data.poses?.length===8&&(list!=='classes'||ids.length===8&&ids.every(id=>CLASSES.some(cls=>cls.id===id)))){metadata=data;publish();}
      }).catch(()=>{}));
    }
    this.atlasReady=Promise.allSettled(requests);
  }
  terrainChunk(column,row) {
    const key=`${column}:${row}`;
    if(this.terrainChunks.has(key)){
      const chunk=this.terrainChunks.get(key);this.terrainChunks.delete(key);this.terrainChunks.set(key,chunk);this.terrainStats.hits++;return chunk;
    }
    const canvas=document.createElement('canvas');canvas.width=TERRAIN_CHUNK_SIZE;canvas.height=TERRAIN_CHUNK_SIZE;
    this.paintTerrainChunk(canvas.getContext('2d'),column*TERRAIN_CHUNK_SIZE,row*TERRAIN_CHUNK_SIZE);
    if(this.terrainChunks.size>=TERRAIN_CACHE_LIMIT){const oldest=this.terrainChunks.keys().next().value,discard=this.terrainChunks.get(oldest);discard.width=0;discard.height=0;this.terrainChunks.delete(oldest);this.terrainStats.evictions++;}
    this.terrainChunks.set(key,canvas);this.terrainStats.misses++;this.terrainStats.bytes=this.terrainChunks.size*TERRAIN_CHUNK_SIZE**2*4;
    return canvas;
  }
  paintTerrainChunk(c,x0,y0) {
    const world=this.world,size=TERRAIN_CHUNK_SIZE,interior=world.isDungeon||world.isPvp;
    c.save();c.translate(-x0,-y0);rect(c,x0,y0,size,size,interior?'#191923':'#24302d');
    const inside=(x,y)=>x>=x0-120&&x<=x0+size+120&&y>=y0-120&&y<=y0+size+120;
    const regionAt=(x,y)=>(world.regions||[]).find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)||world.regions?.[0]||{id:'void',color:'#897688'};
    if(interior){
      if(world.isPvp){ellipse(c,world.width/2,world.height/2,world.width*.34,world.height*.35,'#79394615');line(c,[[world.width/2,40],[world.width/2,world.height-40]],'#baa3b317',2);}
      for(const room of world.rooms||[])rect(c,room.x,room.y,room.w,room.h,room.color||'#393b48');
      for(let y=Math.floor(y0/64)*64;y<y0+size;y+=64)for(let x=Math.floor(x0/64)*64;x<x0+size;x+=64){
        const n=noise(x*.3+y*.7);rounded(c,x+2,y+2,60,60,3,n>.5?'#78758014':'#14192530','#a19bb519');
        line(c,[[x+7,y+7],[x+57,y+7]],'#c8c0cb17',1);
        if(n>.77)line(c,[[x+9,y+10],[x+26,y+28],[x+18,y+36],[x+38,y+54]],'#111a2770',1.5);
        if(n<.08)text(c,'✧',x+32,y+32,18,'#a59bc333');
      }
      for(const room of world.rooms||[]){const x=room.x+room.w/2,y=room.y+room.h/2;if(!inside(x,y))continue;
        c.beginPath();c.arc(x,y,Math.min(room.w,room.h)*.3,0,TAU);c.strokeStyle='#c6b8df14';c.lineWidth=2;c.stroke();
        if(room.id==='boss')for(let i=0;i<8;i++){const a=i*TAU/8;poly(c,[[x+Math.cos(a)*132,y+Math.sin(a)*132],[x+Math.cos(a+.1)*102,y+Math.sin(a+.1)*102],[x+Math.cos(a-.1)*102,y+Math.sin(a-.1)*102]],'#c0a3d323');}
      }
    }else{
      for(const region of world.regions||[]){if(region.x+region.w<x0||region.x>x0+size||region.y+region.h<y0||region.y>y0+size)continue;rect(c,region.x,region.y,region.w,region.h,region.ground||'#2b3932');}
      const seed=x0*17+y0*43+(world.seed||0);
      for(let i=0;i<360;i++){
        const x=x0+noise(seed+i*17)*size,y=y0+noise(seed+i*31)*size,region=regionAt(x,y),n=noise(seed+i*47);
        const snow=region.id==='permafrost',sand=region.id==='sandsenke',ash=['obsidianpass','blutmark'].includes(region.id),cosmic=['mondbruch','sternensund','nexusriss'].includes(region.id);
        if(i<55)ellipse(c,x,y,22+n*65,10+n*25,snow?'#d1e3e51f':sand?'#debe7120':cosmic?'#cf9ddd12':ash?'#b0827020':'#9aac6920');
        else if(snow)line(c,[[x-3,y],[x+5,y-2]],n>.5?'#cedee155':'#374e692d',1.5);
        else if(cosmic){if(n>.86){text(c,'✦',x,y,5+n*7,`${region.color}65`);}else rect(c,x,y,2,1,'#d8c3e028');}
        else if(sand)line(c,[[x-6,y],[x+14,y-2],[x+23,y]],'#d4b17529',1);
        else if(ash&&n>.85)line(c,[[x-7,y-4],[x,y+5],[x+4,y+3],[x+13,y+11]],'#191f3159',1.5);
        else if(n>.45)line(c,[[x-2,y],[x,y-4-n*4],[x,y],[x+3,y-5]],region.id==='sonnensteppe'?'#c5b77850':region.id==='jadeauen'?'#86b87b55':'#88a67b38',1);
        else ellipse(c,x,y,1.4,1.2,n>.2?'#162f3b44':'#e9ce8b39');
      }
      for(const region of world.regions||[]){
        if(region.id==='sturmkueste'&&y0<region.y+230&&x0+size>region.x&&x0<region.x+region.w){
          rect(c,region.x,region.y,region.w,155,'#365c6899');
          for(let y=region.y+20;y<region.y+170;y+=25)line(c,[[x0,y],[x0+size,y+Math.sin(y)*5]],'#c5dfd633',2);
          line(c,[[region.x,region.y+160],[region.x+region.w,region.y+160]],'#c4c5a966',12);
        }
        if(region.id==='jadeauen'&&y0<region.y+region.h&&y0+size>region.y&&x0<region.x+region.w&&x0+size>region.x){
          const points=[];for(let y=y0-40;y<=y0+size+40;y+=40)points.push([region.x+region.w*.61+Math.sin((y-region.y)/280)*95,y]);
          line(c,points,'#244b535e',90);line(c,points,'#70a49d44',48);
        }
      }
    }
    // Draw only nearby static routes. Cross-region paths remain continuous at chunk seams.
    for(const path of world.paths||[]){
      for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];if(Math.max(a[0],b[0])<x0-path.width||Math.min(a[0],b[0])>x0+size+path.width||Math.max(a[1],b[1])<y0-path.width||Math.min(a[1],b[1])>y0+size+path.width)continue;
        if(world.isDungeon){line(c,[a,b],'#c0adcc0c',path.width);continue;}
        line(c,[a,b],'#24333348',path.width+12);line(c,[a,b],'#6c6254',path.width);line(c,[a,b],'#b9a57421',path.width-10);
      }
    }
    for(const landmark of world.landmarks||[]){if(!inside(landmark.x,landmark.y)||landmark.x<3200&&landmark.y<2400)continue;
      const {x,y,r}=landmark,region=world.regions.find(a=>a.id===landmark.region),color=region?.color||'#9ab183';
      if(landmark.type==='pond'){ellipse(c,x,y,r+15,r*.58+9,'#a0a76a36');ellipse(c,x,y,r,r*.58,'#284d56');ellipse(c,x-15,y-12,r*.8,r*.4,'#63908948');for(let i=0;i<16;i++){const a=i*2.4;ellipse(c,x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.45,6,3,'#90b36f');}}
      else if(landmark.type==='circle'){ellipse(c,x,y,r,r*.67,'#b3a18416');c.beginPath();c.ellipse(x,y,r*.84,r*.56,0,0,TAU);c.strokeStyle=`${color}50`;c.lineWidth=3;c.stroke();for(let i=0;i<10;i++){const a=i*TAU/10;rounded(c,x+Math.cos(a)*r*.88-8,y+Math.sin(a)*r*.58-16,16,27,3,'#76796b','#323b45');text(c,'✧',x+Math.cos(a)*r*.88,y+Math.sin(a)*r*.58-6,11,color);}}
    }
    this.gothicGround(c,x0,y0,size);
    c.restore();
  }
  drawTerrain(c) {
    const size=TERRAIN_CHUNK_SIZE,x0=Math.max(0,Math.floor(this.bounds.x/size)),x1=Math.min(Math.ceil(this.world.width/size)-1,Math.floor((this.bounds.x+this.bounds.w)/size)),y0=Math.max(0,Math.floor(this.bounds.y/size)),y1=Math.min(Math.ceil(this.world.height/size)-1,Math.floor((this.bounds.y+this.bounds.h)/size));
    for(let row=y0;row<=y1;row++)for(let column=x0;column<=x1;column++){
      if(this.background&&column*size+size<=3200&&row*size+size<=2400)continue;
      c.drawImage(this.terrainChunk(column,row),column*size,row*size);
    }
    if(this.background){const x=Math.max(0,Math.floor(this.bounds.x/2)*2),y=Math.max(0,Math.floor(this.bounds.y/2)*2),w=Math.min(3200,Math.ceil((this.bounds.x+this.bounds.w)/2)*2)-x,h=Math.min(2400,Math.ceil((this.bounds.y+this.bounds.h)/2)*2)-y;if(w>0&&h>0)c.drawImage(this.background,x,y,w,h,x,y,w,h);}
  }
  createTerrain() {
    const bg=document.createElement('canvas');bg.width=3200;bg.height=2400;
    const c=bg.getContext('2d');const w={...this.world,width:3200,height:2400,landmarks:this.world.landmarks.filter(l=>l.x<3200&&l.y<2400)};
    rect(c,0,0,w.width,w.height,'#202c28');
    const forest=c.createLinearGradient(0,850,1400,2300);forest.addColorStop(0,'#27382f');forest.addColorStop(.55,'#303b2e');forest.addColorStop(1,'#1b2c28');rect(c,0,850,1550,1550,forest);
    const snow=c.createLinearGradient(0,0,0,980);snow.addColorStop(0,'#657f87');snow.addColorStop(.6,'#526d74');snow.addColorStop(.86,'#3d514f');snow.addColorStop(1,'#27382f');rect(c,0,0,1500,990,snow);
    const marsh=c.createLinearGradient(1700,0,3200,1200);marsh.addColorStop(0,'#2e3637');marsh.addColorStop(.5,'#252c35');marsh.addColorStop(1,'#30312c');rect(c,1500,0,1700,1150,marsh);
    const ash=c.createLinearGradient(1600,1180,3100,2400);ash.addColorStop(0,'#322d2b');ash.addColorStop(.5,'#422e29');ash.addColorStop(1,'#302126');rect(c,1500,1100,1700,1300,ash);
    // Layered earth and meadow brushwork is deterministic and drawn only once.
    for(let i=0;i<1800;i++) {
      const x=noise(i*4+1)*w.width,y=noise(i*4+2)*w.height,r=12+noise(i*4+3)*75;
      const snowy=x<1500&&y<840,ashey=x>=1500&&y>=1100,moor=x>=1500&&y<1100;
      const colors=snowy?['#bad0c725','#6a888d32','#d4dad424']:ashey?['#ab714629','#382a2c3d','#87745020']:moor?['#70867821','#242d343d','#77794c22']:['#92a25e16','#69784721','#293e3237'];
      ellipse(c,x,y,r,r*.45,colors[i%3]);
    }
    for(let i=0;i<23000;i++) {
      const x=noise(i*3+13)*w.width,y=noise(i*3+16)*w.height;
      const icy=x<1500&&y<840,ashy=x>1500&&y>1100;
      const palette=icy?['#bdd0c452','#4f757c48','#a7bdb952']:ashy?['#ab765431','#2f2b3059','#b290652d']:['#a1ab642a','#1b302d49','#72895534','#c3b6761c'];
      rect(c,x,y,1+noise(i*3+12)*4,1+noise(i*3+10)*2,palette[i%palette.length]);
      if(i%14===0&&!icy&&!ashy)line(c,[[x,y],[x-2,y-4],[x,y-2],[x+2,y-5]],'#83945b48',1);
    }
    // Natural waterways. All banks can be crossed; two broad timber crossings lead the route.
    line(c,w.river,'#233c3d',155);line(c,w.river,'#59634b',143);line(c,w.river,'#243f43',124);line(c,w.river,'#335a5c',112);line(c,w.river,'#47716b',82);
    for(let i=0;i<w.river.length-1;i++) {
      const a=w.river[i],b=w.river[i+1];
      for(let k=0;k<16;k++){const t=k/16,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;line(c,[[x-34,y],[x+9,y+5]],'#86ab8b21',1.5);}
    }
    for(const path of w.paths) {line(c,path.points,'#23362e5c',path.width+14);line(c,path.points,'#655e50',path.width);line(c,path.points,'#7a6c52',path.width-9);line(c,path.points,'#aa976717',path.width-20);}
    // Pebbles interrupt the paths, retaining their leading lines.
    for(const p of w.paths)for(let i=0;i<p.points.length-1;i++)for(let j=0;j<50;j++) {
      const a=p.points[i],b=p.points[i+1],t=noise(i*94+j*4),x=a[0]+(b[0]-a[0])*t+(noise(j*12+i)-.5)*p.width*.75,y=a[1]+(b[1]-a[1])*t+(noise(j*8+i+7)-.5)*p.width*.75;
      rect(c,x,y,2+noise(j+3)*4,1+noise(j+9)*2,j%3?'#71664b55':'#d1bf813e');
    }
    // The village plaza is broad enough for free movement and conversational pauses.
    ellipse(c,545,1237,257,173,'#8f7d6740');ellipse(c,545,1237,223,143,'#a9977930');
    for(let y=1090;y<1390;y+=18)for(let x=295;x<790;x+=25){if(Math.hypot((x-545)/1.5,y-1240)<142){rounded(c,x+(y%36?12:0),y,21,13,3,'#8b83664e');rect(c,x+4,y+2,12,1,'#c6bd9624');}}
    for(const l of w.landmarks) {
      if(l.type==='pond') {ellipse(c,l.x,l.y,l.r+17,l.r*.6+11,'#748153');ellipse(c,l.x,l.y,l.r,l.r*.6,'#284e50');ellipse(c,l.x-10,l.y-9,l.r-24,l.r*.42,'#3c6960');for(let i=0;i<28;i++){const a=i*2.4,r=35+noise(i+333)*80;ellipse(c,l.x+Math.cos(a)*r,l.y+Math.sin(a)*r*.5,6,3,'#6d8650');}}
      if(l.type==='circle') {
        const ice=l.region==='frostgrat',fire=l.region==='glutoede',clr=ice?'#b2c6b569':fire?'#673d335d':'#756e5666';
        ellipse(c,l.x,l.y,l.r+18,l.r*.66+12,'#202b3033');ellipse(c,l.x,l.y,l.r,l.r*.66,clr);
        c.beginPath();c.ellipse(l.x,l.y,l.r*.88,l.r*.58,0,0,TAU);c.strokeStyle=ice?'#d5e1cd61':fire?'#dc94515c':'#9cba7739';c.lineWidth=3;c.stroke();
        for(let i=0;i<12;i++){const a=i*TAU/12,x=l.x+Math.cos(a)*l.r*.88,y=l.y+Math.sin(a)*l.r*.58;poly(c,[[x-9,y+8],[x-7,y-12],[x+5,y-16],[x+10,y+5]],ice?'#9eafac':fire?'#59473b':'#676f5c','#313b364d',2);line(c,[[x-1,y-6],[x+1,y+2]],ice?'#d6f2e6':fire?'#ffa46a':'#b5c387',2);}
      }
      if(l.type==='graveyard')for(let i=0;i<9;i++){const x=l.x+(i%3-1)*38,y=l.y+(Math.floor(i/3)-1)*32;rect(c,x-3,y-12,7,18,'#677367');rect(c,x-9,y-7,19,5,'#778070');ellipse(c,x,y+9,12,3,'#172b2944');}
    }
    for(const b of w.bridges) {
      c.save();c.translate(b.x,b.y);c.rotate(b.angle);rounded(c,-b.w/2,-38,b.w,80,5,'#473f30');
      for(let x=-b.w/2+3;x<b.w/2;x+=14){rect(c,x,-34,12,72,'#96805c');line(c,[[x+3,-30],[x+3,32]],'#b79c6966',1);rect(c,x+5,-34,2,3,'#453f32');rect(c,x+5,34,2,3,'#453f32');}
      rect(c,-b.w/2-5,-44,b.w+10,8,'#64583e');rect(c,-b.w/2-5,38,b.w+10,8,'#64583e');
      for(const x of [-b.w/2,-b.w/2+70,b.w/2-70,b.w/2]){rect(c,x-4,-51,8,16,'#b4a073');rect(c,x-4,37,8,16,'#b4a073');}c.restore();
    }
    // Timber fences frame the farm without creating invisible collision walls.
    this.fence(c,[[610,1420],[875,1420],[875,1575]]);this.fence(c,[[610,1495],[610,1575],[835,1575]]);
    for(let i=0;i<3;i++){rounded(c,800+i*19,1460+i*6,15,23,3,'#8e7851','#3c432d');line(c,[[802+i*19,1467+i*6],[812+i*19,1467+i*6]],'#c0a56a',2);}
    // A few decorative flowers and lantern posts make settlements feel inhabited.
    for(const [x,y] of [[236,1230],[881,1175],[466,1430],[837,1540],[412,1165],[305,1560]])for(let k=0;k<9;k++){const a=k*2.4,r=noise(k+x)*23;line(c,[[x+Math.cos(a)*r,y+Math.sin(a)*r],[x+Math.cos(a)*r,y+Math.sin(a)*r-7]],'#5d8053',1);ellipse(c,x+Math.cos(a)*r,y+Math.sin(a)*r-7,2.4,2.2,k%3?'#c0a364':'#cfb8a0');}
    for(let y=0;y<2400;y+=TERRAIN_CHUNK_SIZE)for(let x=0;x<3200;x+=TERRAIN_CHUNK_SIZE)this.gothicGround(c,x,y,TERRAIN_CHUNK_SIZE);
    return bg;
  }
  fence(c,points) {
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];line(c,[[a[0],a[1]-16],[b[0],b[1]-16]],'#ad9666',4);line(c,[[a[0],a[1]-8],[b[0],b[1]-8]],'#847250',3);const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/34);for(let j=0;j<=count;j++){const t=j/count,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;rect(c,x-3,y-24,6,28,'#62553d');rect(c,x-3,y-24,6,4,'#c2a778');}}
  }
  draw(game,dt=1/60) {
    this.elapsed+=Math.min(dt,.05);const c=this.worldCtx,p=game.player,w=game.world||this.world;
    if(w!==this.terrainWorldRef)this.setWorld(w);
    const camera=game.camera||(game.camera={x:p.x,y:p.y});
    const halfW=this.viewport.width/(2*this.scale),halfH=this.viewport.height/(2*this.scale);
    const smallX=w.width<=halfW*2,smallY=w.height<=halfH*2,targetX=smallX?w.width/2:clamp(p.x,halfW,w.width-halfW),targetY=smallY?w.height/2:clamp(p.y,halfH,w.height-halfH);
    const ease=1-Math.exp(-Math.max(.001,Math.min(dt,.1))*7);camera.x=smallX?targetX:camera.x+(targetX-camera.x)*ease;camera.y=smallY?targetY:camera.y+(targetY-camera.y)*ease;
    this.camera={x:Math.round(camera.x/2)*2,y:Math.round(camera.y/2)*2};
    this.bounds={x:this.camera.x-halfW,y:this.camera.y-halfH,w:halfW*2,h:halfH*2};
    this.worldLabels=[];this.eventWarnings=new Set();
    const pvp=w.isPvp||game.worldMode==='pvp';
    const opponent=pvp?[...(game.otherPlayers||[]),...(game.partyPlayers||[])].map(raw=>raw.player||raw).filter(other=>other!==p&&other.id!==p.id&&!other.dead&&!other.downed&&other.hp>0&&Number.isFinite(other.x)&&Number.isFinite(other.y)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]:null;
    const waypoint=pvp?(opponent?{x:opponent.x,y:opponent.y,id:opponent.id,kind:'pvpOpponent',label:'Gegner',distance:Math.hypot(opponent.x-p.x,opponent.y-p.y)}:null):typeof game.waypointTarget==='function'?game.waypointTarget():game.waypoint;
    this.activeWaypoint=Number.isFinite(waypoint?.x)&&Number.isFinite(waypoint?.y)?waypoint:null;
    c.setTransform(1,0,0,1,0,0);rect(c,0,0,this.worldCanvas.width,this.worldCanvas.height,'#151c21');
    c.save();c.translate(this.screenOrigin.x/2,this.screenOrigin.y/2);c.scale(.5,.5);
    const shaking=game.settings?.shake!==false&&!game.settings?.reducedMotion&&game.shake>0;
    const amplitude=game.shake*16;
    const shakeX=shaking?Math.round(Math.sin(this.elapsed*71)*amplitude/2)*2:0,shakeY=shaking?Math.round(Math.cos(this.elapsed*59)*amplitude*.55/2)*2:0;
    c.translate(shakeX-this.camera.x,shakeY-this.camera.y);
    this.drawTerrain(c);this.waterDetails(c,game);this.routeSafetyIslands(c,game);
    if(this.activeWaypoint&&this.activeWaypoint.kind!=='pvpOpponent'&&this.visible(this.activeWaypoint.x,this.activeWaypoint.y,60))this.waypointBeacon(c,this.activeWaypoint,game);
    for(const hazard of game.hazards||[]){
      // A raid cone/ring can reach into view while its center is offscreen.
      const box=(hazard.raidEncounter||hazard.routeHazard)&&shapeBounds(hazard.shape);
      if(box?this.intersects(box,4):this.visible(hazard.x,hazard.y,(hazard.radius||80)+20))this.hazard(c,hazard,game);
    }
    for(const portal of w.dungeonEntrances||[])if(this.visible(portal.x,portal.y,150))this.portal(c,portal,game);
    if(w.dungeonExit&&this.visible(w.dungeonExit.x,w.dungeonExit.y,140))this.portal(c,{...w.dungeonExit,exit:true},game);
    for(const plot of w.plots||[])if(this.visible(plot.x,plot.y))this.plot(c,plot,game.time);
    for(const s of w.shrines||[])if(this.visible(s.x,s.y))this.shrine(c,s,game);
    for(const object of w.puzzleObjects||[])if(this.visible(object.x,object.y,150))this.puzzleObject(c,object,game);
    for(const e of w.enemies||[])if(e.alive){
      if(game.dungeonInstance?.raidEncounter?.type===e.type){
        // The raid controller publishes every live warning as a hazard. Do not
        // duplicate it with the old generic boss circle or a second timer rim.
        if(e.phase==='windup'&&e.telegraphMechanic!=='raid')this.telegraph(c,e,game);
        this.encounterShapes(c,e,game,true);
      }else if(ENEMY_TYPES[e.type]?.encounterProfile){
        if(e.phase==='windup')this.telegraph(c,e,game);
        this.encounterShapes(c,e,game,true);
      }else if(e.phase==='windup'&&this.visible(e.telegraphX??e.x,e.telegraphY??e.y,Math.max(100,e.telegraphRange||0,e.telegraphChargeDistance||0,e.telegraphExtraFan?.range||0)))this.telegraph(c,e,game);
    }
    this.floorLootFocusGame=game;this.floorLootFocus=this.closestFloorLoot(game);
    for(const d of game.drops||[])if(this.visible(d.x,d.y))this.drop(c,d,game);
    const actors=[];
    this.interactionFocusGame=game;this.interactionFocus=typeof game.nearby==='function'?game.nearby()?.object?.id:null;
    const objects=w.isPvp?[]:game.worldObjects||w.worldObjects||w.interactions||[];
    for(const ornament of this.worldDecorations())if(this.visible(ornament.x,ornament.y,100))actors.push({y:ornament.y,draw:()=>this.decoration(c,ornament,game)});
    for(const object of w.eventObjects||[])if(!object.hidden&&this.visible(object.x,object.y,180))actors.push({y:object.y,draw:()=>this.worldEventObject(c,object,game)});
    for(const object of objects)if(!object.removed&&this.visible(object.x,object.y,130))actors.push({y:object.y,draw:()=>this.worldObject(c,object,game)});
    for(const r of w.rocks||[])if(this.visible(r.x,r.y))actors.push({y:r.y,draw:()=>this.rock(c,r)});
    for(const s of w.structures||[])if(this.intersects(s,80))actors.push({y:s.type?.startsWith('dungeon_')?s.y+s.h:s.y+s.h*.87,draw:()=>this.structure(c,s,game)});
    for(const s of w.walls||[])if(!(w.structures||[]).some(other=>other.id===s.id)&&this.intersects(s,80))actors.push({y:s.y+s.h,draw:()=>this.structure(c,{...s,type:'dungeon_wall'},game)});
    for(const t of w.trees||[])if(this.visible(t.x,t.y,180))actors.push({y:t.y,draw:()=>this.tree(c,t,p)});
    for(const n of w.nodes||[])if(this.visible(n.x,n.y))actors.push({y:n.y,draw:()=>this.node(c,n,game)});
    for(const ch of w.chests||[])if(this.visible(ch.x,ch.y))actors.push({y:ch.y,draw:()=>this.chest(c,ch)});
    for(const npc of game.npcs||w.npcs||[])if(this.visible(npc.x,npc.y))actors.push({y:npc.y,draw:()=>this.person(c,npc,game,false)});
    for(const e of w.enemies||[])if(e.alive&&this.visible(e.x,e.y,190))actors.push({y:e.y,draw:()=>this.enemy(c,e,game)});
    for(const summon of game.summons||[])if(this.visible(summon.x,summon.y))actors.push({y:summon.y,draw:()=>this.summon(c,summon,game)});
    const teammates=game.partyPlayers||game.otherPlayers||[];
    const seen=new Set([p.id]);
    for(const raw of teammates){const ally=raw.player||raw;if(ally===p||ally.id&&seen.has(ally.id)||!this.visible(ally.x,ally.y))continue;seen.add(ally.id);actors.push({y:ally.y,draw:()=>this.person(c,{...ally,remote:true},game,true)});}
    actors.push({y:p.y,draw:()=>this.person(c,p,game,true)});actors.sort((a,b)=>a.y-b.y);for(const actor of actors)actor.draw();
    for(const projectile of game.projectiles||[])if(this.visible(projectile.x,projectile.y))this.projectile(c,projectile,game);
    for(const effect of game.effects||[])if(this.effectVisible(effect))this.effect(c,effect,game);
    this.ambient(c,game);this.atmosphere(c,game,shakeX,shakeY);c.restore();
    const display=this.ctx;display.setTransform(this.viewport.dpr,0,0,this.viewport.dpr,0,0);display.imageSmoothingEnabled=false;
    display.drawImage(this.worldCanvas,0,0,this.worldCanvas.width*2,this.worldCanvas.height*2);
    this.vignette(display,game);
    display.save();display.translate(this.screenOrigin.x+shakeX-this.camera.x,this.screenOrigin.y+shakeY-this.camera.y);
    for(const label of this.worldLabels)this.drawLabel(display,...label);
    display.restore();this.worldLabels=null;
    this.waypointIndicator(display,game);this.directorIndicators(display,game);

  }
  worldDecorations() {
    if(this.world.isPvp)return [];
    const size=TERRAIN_CHUNK_SIZE,b=this.bounds,w=this.world,result=[];
    const themes={daemmerhain:['tombstone','raven_perch','bone_pile','stone_lantern'],frostgrat:['frost_shards','broken_pillar','skull_pike'],aschenmoor:['drowned_marker','tombstone','reeds'],glutoede:['ash_vent','skull_pike','banner'],sonnensteppe:['cart_wreck','banner','broken_pillar'],jadeauen:['reeds','fungal_patch','bone_pile'],sturmkueste:['drowned_marker','cart_wreck','reeds'],dornwildnis:['fungal_patch','skull_pike','banner'],obsidianpass:['broken_pillar','ash_vent','stone_lantern'],mondbruch:['broken_pillar','stone_lantern','tombstone'],permafrost:['frost_shards','cart_wreck','broken_pillar'],sandsenke:['bone_pile','broken_pillar','banner'],traumsenke:['fungal_patch','tombstone','raven_perch'],blutmark:['banner','skull_pike','cart_wreck'],sternensund:['broken_pillar','drowned_marker','stone_lantern'],nexusriss:['skull_pike','ash_vent','broken_pillar']};
    const clear=(x,y)=>!(w.structures||[]).some(o=>o.blocking!==false&&x>o.x-30&&x<o.x+o.w+30&&y>o.y-30&&y<o.y+o.h+30)&&
      ![...(w.nodes||[]),...(w.plots||[]),...(w.chests||[]),...(w.shrines||[]),...(w.npcs||[]),...(w.interactions||[]),...(w.eventObjects||[])].some(o=>Math.hypot(x-o.x,y-o.y)<(w.shrines?.includes(o)?120:50))&&
      !(w.enemies||[]).some(o=>Math.hypot(x-(o.homeX??o.x),y-(o.homeY??o.y))<50)&&!(w.trees||[]).some(o=>Math.hypot(x-o.x,y-o.y)<45*(o.scale||1))&&
      !(w.paths||[]).some(path=>(path.points||[]).slice(1).some((v,i)=>{const a=path.points[i],dx=v[0]-a[0],dy=v[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<(path.width||40)/2+16;}));
    const x0=Math.max(0,Math.floor((b.x-80)/size)),x1=Math.min(Math.ceil(w.width/size)-1,Math.floor((b.x+b.w+80)/size)),y0=Math.max(0,Math.floor((b.y-80)/size)),y1=Math.min(Math.ceil(w.height/size)-1,Math.floor((b.y+b.h+80)/size));
    for(let row=y0;row<=y1;row++)for(let column=x0;column<=x1;column++){
      const key=`${column}:${row}`;let props=this.decorationChunks.get(key);
      if(!props){props=[];const seed=(w.seed||0)+column*7717+row*14591;
        for(let i=0;i<16&&props.length<3;i++){
          const x=Math.round((column*size+32+noise(seed+i*131)*448)/2)*2,y=Math.round((row*size+32+noise(seed+i*197)*448)/2)*2;
          if(x>w.width-30||y>w.height-30||!clear(x,y)||w.isDungeon&&!(w.rooms||[]).some(r=>x>r.x+25&&x<r.x+r.w-25&&y>r.y+25&&y<r.y+r.h-25))continue;
          const region=(w.regions||[]).find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h),choices=w.isDungeon?['bone_pile','tombstone','broken_pillar','stone_lantern']:themes[region?.id]||['bone_pile','broken_pillar','banner'];
          props.push({x,y,variant:choices[Math.floor(noise(seed+i*283)*choices.length)]});
        }
        if(this.decorationChunks.size>=TERRAIN_CACHE_LIMIT)this.decorationChunks.delete(this.decorationChunks.keys().next().value);
      }else this.decorationChunks.delete(key);
      this.decorationChunks.set(key,props);result.push(...props);
    }
    return result;
  }
  decoration(c,prop,game) {
    c.save();if(game.player.y<prop.y&&Math.hypot(game.player.x-prop.x,game.player.y-prop.y+30)<42)c.globalAlpha=.5;
    drawPixelProp(c,prop,game.settings?.reducedMotion?0:game.time);
    if(prop.variant==='stone_lantern')glow(c,prop.x,prop.y-68,55,'#dba66d1c');c.restore();
  }
  waterDetails(c,game) {
    if(this.world.isPvp)return;
    const phase=game.settings?.reducedMotion?0:Math.floor(game.time*3)%4,river=this.world.river||[];let budget=30;
    const ripple=(x,y,width)=>{if(budget<=0||!this.visible(x,y,40))return;budget--;x=Math.round(x/2)*2;y=Math.round(y/2)*2;rect(c,x-width/2+phase*2,y,width,2,'#7797a050');rect(c,x-width/2+4,y+4,width-8,2,'#adbbbf25');};
    for(let i=1;i<river.length;i++){const a=river[i-1],b=river[i];for(let j=0;j<6&&budget>0;j++){const t=(j+.5)/6;ripple(a[0]+(b[0]-a[0])*t-15+(j%2)*20,a[1]+(b[1]-a[1])*t,28);}}
    for(const pond of this.world.landmarks||[])if(pond.type==='pond'&&this.visible(pond.x,pond.y,(pond.r||100)+40))for(let i=0;i<8&&budget>0;i++){const a=i*2.4,r=(pond.r||100)*(.22+(i%3)*.17);ripple(pond.x+Math.cos(a)*r,pond.y+Math.sin(a)*r*.45,24);}
  }
  relicAura(c,p,relic,game) {
    const angle=p.face||0,x=Math.round((p.x+Math.cos(angle)*20)/2)*2,y=Math.round((p.y-39+Math.sin(angle)*6)/2)*2,color=relic.color,t=game.settings?.reducedMotion?0:game.time;
    glow(c,x,y,23,`${color}20`);
    if(relic.aura==='moon'){c.beginPath();c.arc(x,y,9,.28*Math.PI,1.72*Math.PI);c.strokeStyle=color;c.lineWidth=2;c.stroke();rect(c,x+4,y-4,2,2,'#d9edf4');}
    else {for(const [dx,dy] of [[0,-8],[8,0],[0,8],[-8,0]])poly(c,[[x+dx,y+dy],[x+dx*.45-dy*.18,y+dy*.45+dx*.18],[x+dx*.45+dy*.18,y+dy*.45-dx*.18]],color);}
    for(let i=0;i<2;i++){const a=t*.8+i*Math.PI;rect(c,Math.round((x+Math.cos(a)*13)/2)*2,Math.round((y+Math.sin(a)*9)/2)*2,2,2,color);}
  }
  gothicGround(c,x0,y0,size) {
    const world=this.world,seed=(world.seed||0)+x0*13+y0*37;
    // Wet stone, desiccated roots and ossuary fragments sit under the actors.
    for(let i=0;i<38;i++){
      const x=x0+noise(seed+i*79)*size,y=y0+noise(seed+i*113)*size,n=noise(seed+i*191);
      if(world.isDungeon||n>.57){
        poly(c,[[x-14,y],[x-9,y-8],[x+10,y-7],[x+16,y],[x+7,y+7],[x-12,y+5]],'#080d182b');
        line(c,[[x-8,y-5],[x+8,y-5]],'#b2b0ad14',1);
        if(n>.87)line(c,[[x-10,y-2],[x-1,y],[x+4,y-5],[x+11,y+3]],'#0c101e80',1.5);
      }else if(n<.22){
        ellipse(c,x,y,18+n*90,5+n*22,'#09161d45');line(c,[[x-12,y-2],[x+7,y-2]],'#939eaa22',1);
      }else{
        line(c,[[x-16,y+3],[x-5,y-1],[x+2,y+2],[x+15,y-3]],'#101c2370',2);
        line(c,[[x-5,y-1],[x-9,y-7]],'#68695933',1);
      }
    }
    for(const path of world.paths||[])for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(Math.max(a[0],b[0])<x0-40||Math.min(a[0],b[0])>x0+size+40||Math.max(a[1],b[1])<y0-40||Math.min(a[1],b[1])>y0+size+40)continue;
      for(let d=14;d<length;d+=36){const t=d/length,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;if(x<x0-25||x>x0+size+25||y<y0-25||y>y0+size+25)continue;
        const n=noise(d+i*43);poly(c,[[x-11,y-5],[x+9,y-7],[x+14,y],[x+6,y+6],[x-12,y+4]],n>.45?'#bcb5a223':'#191c263f');line(c,[[x-8,y-4],[x+7,y-5]],'#d8c9b123',1);
      }
    }
    // Small relic fields: repeatable, sparse silhouettes, never collision walls.
    const region=(world.regions||[]).find(r=>x0+size/2>=r.x&&x0+size/2<r.x+r.w&&y0+size/2>=r.y&&y0+size/2<r.y+r.h);
    if(!world.isDungeon&&region&&!['daemmerhain','jadeauen','sonnensteppe'].includes(region.id))for(let i=0;i<4;i++){
      const x=x0+noise(seed+i*373)*size,y=y0+noise(seed+i*509)*size;
      ellipse(c,x+4,y+3,15,5,'#050b174a');rect(c,x-3,y-13,6,14,'#6e6e6b88');rect(c,x-9,y-9,18,4,'#8c8b7d88');line(c,[[x,y-11],[x,y]],'#bfbaa13b',1);
      if(i===1){ellipse(c,x+17,y+4,4,3,'#d0c6ac90');rect(c,x+16,y+4,3,2,'#151720');}
    }
    for(const landmark of world.landmarks||[]){if(landmark.type!=='circle'||landmark.x<x0-220||landmark.x>x0+size+220||landmark.y<y0-220||landmark.y>y0+size+220)continue;
      const {x,y,r}=landmark;line(c,[[x-r*.55,y],[x+r*.55,y]],'#7c3d4630',2);line(c,[[x,y-r*.34],[x,y+r*.34]],'#7c3d4630',2);
      for(let i=0;i<7;i++){const a=i*TAU/7,sx=x+Math.cos(a)*r*.65,sy=y+Math.sin(a)*r*.4;poly(c,[[sx,sy-5],[sx+5,sy],[sx,sy+5],[sx-5,sy]],'#a6817340');}
    }
  }
  waypointBeacon(c,target,game) {
    const distance=Math.hypot(target.x-game.player.x,target.y-game.player.y);if(distance<26)return;
    const color='#dcbb86',pulse=game.settings?.reducedMotion?1:1+Math.sin(game.time*2)*.08;
    glow(c,target.x,target.y-10,48,`${color}16`);ellipse(c,target.x,target.y+1,20*pulse,9*pulse,'#d6af6530');
    poly(c,[[target.x,target.y-7],[target.x-6,target.y-15],[target.x,target.y-24],[target.x+6,target.y-15]],'#ebcd9c','#2c2433',2);
    line(c,[[target.x,target.y-29],[target.x,target.y-55]],'#e4c28c80',2);
    if(distance<130)this.label(c,target.label||target.name||'Reiseziel',target.x,target.y-72,'#e4c995',10);
  }
  directorIndicators(c,game) {
    if(game.world?.isPvp||game.world?.isDungeon||game.worldMode==='pvp')return;
    const nearest=new Map(),player=game.player;
    for(const h of game.hazards||[]){
      if(!h.directorId||h.kind!=='warning'||!(h.life>0)||!Number.isFinite(h.x)||!Number.isFinite(h.y))continue;
      const distance=Math.hypot(h.x-player.x,h.y-player.y);if(distance>700)continue;
      if(!nearest.has(h.directorId)||distance<nearest.get(h.directorId).distance)nearest.set(h.directorId,{x:h.x,y:h.y,distance,kind:'directorWarning'});
    }
    for(const target of [...nearest.values()].sort((a,b)=>a.distance-b.distance).slice(0,3))this.waypointIndicator(c,game,target);
  }
  waypointIndicator(c,game,target=this.activeWaypoint) {
    if(!target)return;
    const targetScreen=this.worldToScreen(target.x,target.y),w=this.viewport.width,h=this.viewport.height;
    const opponent=target.kind==='pvpOpponent',director=target.kind==='directorWarning',hostile=opponent||director;
    if(hostile?targetScreen.x>=0&&targetScreen.x<=w&&targetScreen.y>=0&&targetScreen.y<=h:targetScreen.x>26&&targetScreen.x<w-26&&targetScreen.y>65&&targetScreen.y<h-90)return;
    const playerScreen=this.worldToScreen(game.player.x,game.player.y),angle=Math.atan2(targetScreen.y-playerScreen.y,targetScreen.x-playerScreen.x),dx=Math.cos(angle),dy=Math.sin(angle);
    const mobile=w<700,left=mobile?26:32,right=w-(mobile?24:36),top=mobile?86:80,bottom=h-(mobile?172:110);
    const usableBottom=Math.max(top+35,bottom),cx=clamp(playerScreen.x,left,right),cy=clamp(playerScreen.y,top,usableBottom);
    const tx=Math.abs(dx)<.001?Infinity:(dx>0?right-cx:cx-left)/Math.abs(dx),ty=Math.abs(dy)<.001?Infinity:(dy>0?usableBottom-cy:cy-top)/Math.abs(dy),length=Math.max(0,Math.min(tx,ty));
    const x=cx+dx*length;let y=cy+dy*length;
    // Map, chronicle and touch controls occupy the outer corners; keep the
    // small bearing marker on a clear edge of the playable world.
    if(mobile){if(x>w-115&&y<240)y=240;if(x>w-115&&y>240&&y<365)y=dy<0?240:375;if(x<190&&y<215)y=215;}
    else {if(x>w-270&&y<220)y=220;else if(x>w-270&&y>230&&y<610)y=dy<0?220:620;if(x<340&&y<155)y=165;}
    c.save();c.translate(x,y);ellipse(c,0,0,director?13:17,director?13:17,'#15121dee');c.beginPath();c.arc(0,0,director?12:16,0,TAU);c.strokeStyle=hostile?'#c57582':'#ae8b58';c.lineWidth=1;c.stroke();c.rotate(angle);
    poly(c,[[9,0],[-3,-6],[-1,0],[-3,6]],hostile?'#f0a0ac':'#e8c992');line(c,[[-8,-4],[-5,0],[-8,4]],hostile?'#be6f80':'#a78961',1.5);c.restore();
    if(opponent){c.font='10px "Inter",system-ui,sans-serif';const caption=`Gegner · ${Math.round(target.distance)} Schritte`,rightEdge=x>w/2,captionX=x+(rightEdge?-24:24),captionWidth=c.measureText(caption).width+12;rounded(c,rightEdge?captionX-captionWidth:captionX,y-10,captionWidth,20,3,'#15121dee');text(c,caption,captionX+(rightEdge?-6:6),y,10,'#efa0ac',rightEdge?'right':'left');}
    // The HUD already names the destination; the bearing stays one small icon.
  }
  worldEventObject(c,o,game) {
    if(o.hidden)return;
    const event=(this.world.worldEvents||[]).find(e=>e.id===o.eventId)||{},active=event.state==='active'||o.active,color=o.color||'#c4a67c',role=o.role||'start';
    const done=['success','rewarded'].includes(event.state),failed=event.state==='failure',distance=Math.hypot(o.x-game.player.x,o.y-game.player.y),caravan=role==='escort'||role==='objective'&&/Wagen|Karren|Kolonne/.test(o.name||'');
    if(role==='start'&&event.state==='active'&&(this.world.eventObjects||[]).some(prop=>prop.eventId===o.eventId&&!prop.hidden&&!['start','reward'].includes(prop.role)))return;
    c.save();c.translate(Math.round(o.x/2)*2,Math.round(o.y/2)*2);ellipse(c,3,8,caravan?51:27,caravan?17:9,'#0b0f1baa');
    if(role==='escort'&&/Fährmann|Stimme/.test(o.name||'')){
      poly(c,[[-16,3],[-16,-36],[-9,-57],[0,-67],[9,-57],[16,-36],[16,3],[8,-2],[0,6],[-8,-2]],'#363743','#1b2030',2);poly(c,[[-10,-43],[-6,-57],[0,-63],[5,-54],[8,-42],[4,-4],[-7,-5]],'#78747c');
      ellipse(c,0,-49,7,9,'#a89887');poly(c,[[-10,-43],[-9,-59],[0,-67],[9,-59],[10,-43],[5,-53],[0,-57],[-5,-53]],'#46444e');ellipse(c,-3,-50,1.5,1.5,'#ddd0b5');ellipse(c,3,-50,1.5,1.5,'#ddd0b5');line(c,[[-8,-35],[-25,-24]],'#77707c',5);line(c,[[-25,-24],[-25,-13]],'#b8a98a',2);rounded(c,-32,-14,14,19,2,'#383544','#c6b794');glow(c,-25,-5,35,`${color}30`);rect(c,-28,-10,7,11,color);line(c,[[13,-34],[26,-19]],'#77707c',4);line(c,[[26,-19],[27,8]],'#958064',3);
    }else if(caravan){
      // A physical caravan with canvas canopy, cargo and iron-rimmed wheels.
      for(const x of [-30,28]){ellipse(c,x,7,13,14,'#161b27');ellipse(c,x,7,10,11,'#79634e');ellipse(c,x,7,6,7,'#34313b');for(let i=0;i<4;i++){const a=i*Math.PI/2;line(c,[[x,7],[x+Math.cos(a)*8,7+Math.sin(a)*9]],'#b0976a',2);}}
      rect(c,-39,-8,78,13,'#594842');rect(c,-40,-11,80,5,'#b0956c');for(let x=-36;x<36;x+=12){rect(c,x,-31,10,23,'#877254');line(c,[[x+3,-28],[x+3,-11]],'#ae946655',1);}
      poly(c,[[-45,-28],[-36,-57],[-15,-68],[18,-67],[38,-55],[45,-28]],'#63505c','#292335',2);poly(c,[[-42,-29],[-33,-55],[-14,-63],[-13,-29]],'#887064');poly(c,[[16,-62],[34,-54],[42,-29],[15,-29]],'#44394b');
      for(const x of [-34,33])line(c,[[x,-54],[x,2]],'#b7a08a',3);line(c,[[-43,-28],[43,-28]],'#c4ab84',2);poly(c,[[-13,-57],[-7,-40],[0,-46],[7,-40],[13,-57]],'#993e4d');line(c,[[38,-5],[59,10]],'#71523d',5);
      if(active){glow(c,-30,-22,35,'#e7aa5935');this.flame(c,-35,-20,game.settings?.reducedMotion?0:game.time,6);}
    }else if(role==='objective'){
      ellipse(c,0,2,32,15,'#494652');ellipse(c,0,-1,27,12,'#8a7b77');rect(c,-5,-39,10,31,'#6c6070');poly(c,[[-18,-40],[0,-61],[18,-40],[0,-15]],'#373342','#a39a85',2);poly(c,[[-10,-39],[0,-52],[10,-39],[0,-25]],failed?'#604450':color);rect(c,-31,-10,62,7,'#504b5d');
      for(const side of [-1,1]){line(c,[[side*23,-4],[side*27,-35]],'#78727c',3);poly(c,[[side*27,-37],[side*30,-22],[side*20,-26]],'#873a49');}
      if(active)glow(c,0,-37,60,`${color}25`);
    }else if(role==='rune'){
      const charged=!!o.active,symbol=({asche:'✧',knochen:'†',name:'◇',mond:'☾',glut:'✦',frost:'❄'})[o.symbol]||o.symbol||'✧';
      poly(c,[[-13,4],[-11,-28],[-3,-43],[8,-40],[14,-26],[13,4]],charged?'#716976':'#4d495a','#232536',2);poly(c,[[-9,-26],[-2,-37],[0,-3],[-9,0]],'#938884');
      if(event.stageType==='ritual'&&event.objective?.label?.startsWith('Linsen:')){ellipse(c,0,-20,12,12,'#2d2a43');const a=(o.rotation||0)*Math.PI/2-Math.PI/2;line(c,[[0,-20],[Math.cos(a)*22,-20+Math.sin(a)*22]],charged?'#f4d5ac':color,3);text(c,['N','O','S','W'][o.rotation||0],0,16,10,charged?'#f4d5ac':'#bbb0bc');}
      else text(c,symbol,0,-20,18,charged?'#f4d5ac':color);if(charged)glow(c,0,-19,35,`${color}25`);
    }else if(role==='choice'){
      rect(c,-4,-48,8,54,'#695445');poly(c,[[-30,-43],[23,-43],[33,-34],[23,-25],[-30,-25]],'#645563','#262238',2);line(c,[[-22,-35],[18,-35]],'#c4ab8580',2);poly(c,[[25,-20],[-23,-20],[-32,-11],[-23,-2],[25,-2]],'#433c51','#262238',2);line(c,[[-18,-12],[17,-12]],'#ae86b580',2);rect(c,-7,-50,14,5,'#a7967b');
      const risky=['risk','feed','vengeance'].includes(o.choice);text(c,risky?'†':'✧',0,-34,15,risky?'#e29b89':'#bfd2a7');text(c,risky?'Wagnis':'Bewahren',0,20,9,risky?'#c99484':'#aebb9d');
    }else if(role==='reward'){
      rounded(c,-25,-21,50,27,4,'#685046','#282330');rounded(c,-25,done?-39:-32,50,15,5,'#a47a57','#282330');for(const x of [-16,12])rect(c,x,-30,5,34,'#cba564');rect(c,-5,-18,10,10,'#e0be78');if(done||o.active){glow(c,0,-15,52,'#e8b47235');poly(c,[[0,-42],[-5,-35],[0,-28],[5,-35]],'#f1d08d');}
    }else {
      poly(c,[[-22,5],[-20,-40],[-11,-58],[12,-54],[22,-36],[22,5]],'#56515f','#232535',2);poly(c,[[-17,-36],[-9,-51],[0,-49],[0,-1],[-17,1]],'#827782');rect(c,-15,-26,30,4,'#b1a086');text(c,done?'✓':failed?'!':'◇',2,-39,19,failed?'#d79583':color);line(c,[[-20,-9],[20,-9]],'#ac9568',2);
    }
    c.restore();
    if(['escort','objective'].includes(role)&&Number.isFinite(o.hp)&&o.maxHp>0&&distance<420){
      const top=o.y-(caravan?91:82),width=caravan?82:62;rounded(c,o.x-width/2,top,width,6,2,'#141321');rounded(c,o.x-width/2,top,width*clamp(o.hp/o.maxHp,0,1),6,2,o.hp/o.maxHp<.3?'#d67a66':'#b6ae78');
      if(distance<200)this.label(c,o.name||event.name||'Schutzziel',o.x,top-16,'#d8c6a2',10);
    }
    const focus=typeof game.nearby==='function'?(this.interactionFocusGame===game?this.interactionFocus:game.nearby()?.object?.id)===o.id:distance<75;
    if(focus)this.label(c,o.label||o.name||'Weltbegegnung',o.x,o.y-(caravan?115:77),color,10);
    if(active&&distance<230&&!this.eventWarnings?.has(o.eventId)&&(['objective','escort'].includes(role)||focus)){
      const countdown=Math.ceil(Math.max(0,(event.warningUntil||0)-(event.elapsed||0)));
      const warning=countdown>0?`HINTERHALT · ${countdown}s`:typeof event.warning==='string'?event.warning:event.objective?.label||'';
      if(warning){this.label(c,warning.length>48?`${warning.slice(0,47)}…`:warning,o.x,o.y+35,'#e1b29a',10);this.eventWarnings?.add(o.eventId);}
      if(event.objective?.goal>1){const ratio=clamp(event.objective.progress/event.objective.goal,0,1);rounded(c,o.x-29,o.y+49,58,3,1,'#272331');rounded(c,o.x-29,o.y+49,58*ratio,3,1,'#b3a473');}
    }
  }
  worldObject(c,o,game) {
    const kind=o.kind||o.type||'altar',spent=o.used||o.depleted||o.broken||o.opened,color=o.color||'#d99564';
    c.save();c.translate(Math.round(o.x/2)*2,Math.round(o.y/2)*2);ellipse(c,3,5,27,9,'#070e1990');
    if(['barrel','urn','vase','crate','breakable'].includes(kind)){
      if(spent){for(let i=0;i<7;i++){const a=i*2.4;line(c,[[Math.cos(a)*5,Math.sin(a)*2],[Math.cos(a)*20,Math.sin(a)*8]],'#7c6450',3);}rect(c,-6,-1,11,3,'#a18762');}
      else if(kind==='urn'||kind==='vase'){poly(c,[[-11,2],[-17,-10],[-13,-25],[-7,-28],[-9,-33],[9,-33],[7,-28],[13,-25],[17,-10],[11,2]],'#3c3541','#161724',2);poly(c,[[-11,-11],[-8,-24],[-3,-25],[-3,-2]],'#9f8880');line(c,[[-10,-23],[10,-23]],'#c1a27a',2);line(c,[[-13,-8],[13,-8]],'#a48055',2);}
      else if(kind==='crate'){rect(c,-18,-28,36,34,'#655043');rect(c,-18,-28,36,5,'#a38560');line(c,[[-15,-23],[15,2]],'#ab8d63',3);line(c,[[15,-23],[-15,2]],'#352c31',3);}
      else {rounded(c,-15,-31,30,37,7,'#785e47','#252431');for(const x of [-8,0,8])line(c,[[x,-29],[x,4]],'#322d35',2);rect(c,-16,-23,32,5,'#999080');rect(c,-16,-6,32,4,'#514e58');rect(c,-10,-27,5,2,'#c0a077');}
    }else if(['sarcophagus','tomb','coffin'].includes(kind)){
      poly(c,[[-23,7],[-25,-34],[-16,-48],[16,-48],[25,-34],[23,7]],'#3d3e49','#171925',2);poly(c,[[-19,3],[-20,-33],[-13,-43],[13,-43],[20,-33],[19,3]],spent?'#171a25':'#74737c');line(c,[[-15,-34],[13,-34]],'#c5b6a650',2);
      if(!spent){rect(c,-2,-35,4,25,'#b3a58a');rect(c,-9,-29,18,4,'#b3a58a');}else line(c,[[-16,-32],[17,-9]],'#8b818880',3);
    }else if(['campfire','brazier','torch'].includes(kind)){
      for(let i=0;i<6;i++){const a=i*TAU/6;ellipse(c,Math.cos(a)*19,Math.sin(a)*7,5,3,'#72747c');}line(c,[[-13,2],[12,-4]],'#704d3e',5);line(c,[[12,2],[-11,-3]],'#8b6447',4);if(!spent)this.flame(c,0,-6,game.settings?.reducedMotion?0:game.time,19);
    }else if(['cursed_chest','chest','reliquary','sealed_cache'].includes(kind)){
      rounded(c,-23,-22,46,29,4,'#51403a','#252130');rounded(c,-23,spent?-39:-32,46,16,5,'#907155','#302b37');rect(c,-16,-30,5,34,'#bd955f');rect(c,11,-30,5,34,'#bd955f');rect(c,-5,-22,10,10,'#c1a578');rect(c,-1,-19,2,4,'#2a202a');if(!spent){glow(c,0,-16,42,'#b56e4b22');text(c,o.locked?'◈':'✦',0,-41,12,color);}
    }else if(['captive','prisoner','cage'].includes(kind)){
      rect(c,-24,-55,48,62,'#20232c');poly(c,[[-26,-54],[0,-67],[26,-54]],'#55535d');rect(c,-8,-38,16,27,'#786b72');ellipse(c,0,-43,7,8,'#bea382');for(let x=-22;x<24;x+=9)rect(c,x,-53,3,57,'#a39884');rect(c,-25,-6,50,4,'#6d6d76');if(spent)line(c,[[13,-53],[24,-5]],'#c8b394',3);
    }else if(['lever','switch'].includes(kind)){
      rect(c,-19,-7,38,14,'#5a5763');line(c,[[0,-4],[o.active?13:-13,-34]],'#a59984',5);ellipse(c,o.active?13:-13,-34,6,6,color);
    }else if(kind==='lore'){
      rect(c,-17,-18,34,23,'#60545b');poly(c,[[-20,-20],[0,-24],[20,-20],[20,-37],[0,-42],[-20,-37]],'#a89982','#2a2534',2);line(c,[[0,-40],[0,-25]],'#635158',2);
      for(const side of [-1,1])for(let i=0;i<3;i++)line(c,[[side*3,-37+i*4],[side*16,-35+i*4]],'#514352',1);rect(c,-25,-8,50,8,'#7c7379');
    }else if(kind==='obelisk'){
      poly(c,[[-15,6],[-11,-47],[0,-63],[11,-47],[15,6]],'#484051','#1d1929',2);poly(c,[[-11,-44],[0,-57],[0,2],[-12,3]],'#797187');line(c,[[0,-51],[0,-8]],spent?'#5f526b':color,2);for(let i=0;i<3;i++)poly(c,[[0,-42+i*11],[5,-37+i*11],[0,-32+i*11],[-5,-37+i*11]],spent?'#75617f':color);if(!spent)glow(c,0,-31,55,`${color}26`);
    }else if(['fountain','well','blood_fountain'].includes(kind)){
      ellipse(c,0,5,33,17,'#72717c');ellipse(c,0,0,29,13,'#393641');ellipse(c,0,-1,24,10,spent?'#292630':'#673940');rect(c,-5,-37,10,28,'#686771');poly(c,[[-13,-36],[0,-48],[13,-36]],'#a29488');if(!spent){line(c,[[0,-29],[0,-6]],'#c2706455',3);glow(c,0,-12,40,'#df887b18');}
    }else {
      // Ritual altars, shrines and resource reliquaries share stone anatomy.
      rect(c,-28,-8,56,13,'#42404c');rect(c,-23,-18,46,13,'#73707c');poly(c,[[-18,-20],[-14,-43],[0,-53],[14,-43],[18,-20]],'#575361','#191b29',2);poly(c,[[-10,-26],[0,-44],[10,-26],[0,-15]],spent?'#49424f':color);line(c,[[-26,-7],[26,-7]],'#b4a28a',2);if(!spent)glow(c,0,-28,50,`${color}2b`);
      for(const x of [-24,24]){rect(c,x-2,-29,4,13,'#b6a78c');if(!spent)this.flame(c,x,-30,game.settings?.reducedMotion?0:game.time,6);}
    }
    c.restore();
    const dist=Math.hypot(o.x-game.player.x,o.y-game.player.y);
    const focus=typeof game.nearby==='function'?(this.interactionFocusGame===game?this.interactionFocus:game.nearby()?.object?.id)===o.id:dist<75;
    if(!spent&&focus){this.label(c,o.label||o.name||'Relikt',o.x,o.y-79,'#ddc6ac',10);if(o.locked)this.label(c,'Versiegelt · Kette finden',o.x,o.y+24,'#c49b78',9);}
    else if(!spent&&o.active&&!o.challengeCompleted&&dist<180)this.label(c,'Herausforderung · Wächter besiegen',o.x,o.y-79,'#e79e89',10);
  }
  atmosphere(c,game,shakeX=0,shakeY=0) {
    // One viewport-sized mask. No per-light canvases or world-sized buffers.
    const mask=this.lightCtx,p=game.player,b=this.bounds;
    mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,this.lightCanvas.width,this.lightCanvas.height);
    const contrast=game.settings?.highContrast||game.settings?.contrast==='high';
    rect(mask,0,0,this.lightCanvas.width,this.lightCanvas.height,this.world.isPvp?'#08081224':this.world.isDungeon?(contrast?'#07081222':'#07081265'):(contrast?'#080d1620':'#080d1652'));
    mask.save();mask.translate(this.screenOrigin.x/2,this.screenOrigin.y/2);mask.scale(.5,.5);mask.translate(shakeX-this.camera.x,shakeY-this.camera.y);mask.globalCompositeOperation='destination-out';
    const sources=[{x:p.x,y:p.y-22,r:230,a:.88}];
    if(this.activeWaypoint&&this.visible(this.activeWaypoint.x,this.activeWaypoint.y,100))sources.push({x:this.activeWaypoint.x,y:this.activeWaypoint.y,r:80,a:.7});
    for(const object of this.world.eventObjects||[])if(!object.hidden&&object.active&&this.visible(object.x,object.y,100))sources.push({x:object.x,y:object.y-25,r:90,a:.52});
    for(const s of this.world.shrines||[])if(this.visible(s.x,s.y,170))sources.push({x:s.x,y:s.y-32,r:140,a:.6});
    for(const [x,y] of [[238,1205],[895,1222],[605,1585],[1960,1610],[2480,1900]])if(!this.world.isDungeon&&this.visible(x,y,155))sources.push({x,y:y-24,r:155,a:.72});
    for(const room of this.world.isDungeon?this.world.rooms||[]:[])if(this.visible(room.x+35,room.y+70,140))sources.push({x:room.x+35,y:room.y+50,r:145,a:.72});
    for(const o of game.worldObjects||this.world.worldObjects||this.world.interactions||[])if(!o.used&&!o.depleted&&['campfire','brazier','torch','altar','blood_fountain'].includes(o.kind||o.type)&&this.visible(o.x,o.y,150))sources.push({x:o.x,y:o.y-22,r:135,a:.62});
    for(const e of this.world.enemies||[])if(e.alive&&e.phase==='windup'&&this.visible(e.x,e.y,200))sources.push({x:e.telegraphX??e.x,y:e.telegraphY??e.y,r:(e.telegraphRadius||100)+60,a:.75});
    for(const source of sources.slice(0,24)){
      const flicker=game.settings?.reducedMotion?1:1+Math.sin(game.time*7+source.x)*.025,g=mask.createRadialGradient(source.x,source.y,source.r*.1,source.x,source.y,source.r*flicker);
      g.addColorStop(0,`rgba(0,0,0,${source.a})`);g.addColorStop(.46,`rgba(0,0,0,${source.a*.75})`);g.addColorStop(1,'transparent');ellipse(mask,source.x,source.y,source.r*flicker,source.r*flicker,g);
    }
    mask.restore();
    c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(this.lightCanvas,0,0);c.restore();
    // A few broad, slow mist ribbons preserve enemy and floor-edge visibility.
    const still=game.settings?.reducedMotion,phase=still?0:this.elapsed*.06;
    for(let i=0;i<(this.world.isPvp?1:3);i++){
      const x=b.x+b.w*(.15+i*.39)+Math.sin(phase+i)*65,y=b.y+b.h*(.28+i*.28)+Math.cos(phase*.8+i)*23;
      const mist=c.createRadialGradient(x,y,0,x,y,b.w*.5);mist.addColorStop(0,this.world.isDungeon?'#b5a5cb08':'#afbbc70b');mist.addColorStop(1,'transparent');ellipse(c,x,y,b.w*.5,35+i*8,mist);
    }
    glow(c,p.x-70,p.y-130,160,'#c4d8e405');
  }
  vignette(c,game) {
    const w=this.viewport.width,h=this.viewport.height,g=c.createRadialGradient(w/2,h*.46,h*.26,w/2,h/2,Math.max(w,h)*.66);
    g.addColorStop(0,'transparent');g.addColorStop(.58,'#10111b0b');g.addColorStop(1,game.settings?.highContrast?'#090a1b40':'#080a16a8');rect(c,0,0,w,h,g);
  }
  portal(c,p,game) {
    const color=p.exit?'#d8c990':p.raid?'#da99dc':'#8ebcd1';
    c.save();c.translate(p.x,p.y);glow(c,0,-15,85,`${color}23`);
    ellipse(c,0,7,60,29,'#161f325c');c.beginPath();c.ellipse(0,3,47,23,0,0,TAU);c.strokeStyle=`${color}80`;c.lineWidth=3;c.stroke();
    for(const side of [-1,1]){poly(c,[[side*34,3],[side*47,-16],[side*42,-61],[side*31,-71],[side*26,-18]],'#626978','#293341',2);line(c,[[side*36,-55],[side*35,-15]],color,2);}
    c.beginPath();c.ellipse(0,-28,26,39,0,0,TAU);c.fillStyle=`${color}17`;c.fill();c.strokeStyle=`${color}b0`;c.lineWidth=2;c.stroke();
    for(let i=0;i<5;i++){const a=game.time*.65+i*TAU/5;ellipse(c,Math.cos(a)*19,-28+Math.sin(a)*30,2,2,color);}
    text(c,p.exit?'↩':p.raid?'◈':'✧',0,-29,23,color);c.restore();
    if(Math.hypot(p.x-game.player.x,p.y-game.player.y)<290){this.label(c,p.name||'Dungeon',p.x,p.y-90,color,11);if(p.minLevel)this.label(c,`Stufe ${p.minLevel}${p.partyRequired>1?` · ${p.partyRequired} Spieler`:''}`,p.x,p.y+42,'#c3c6cf',9);}
  }
  puzzleObject(c,o,game) {
    if(o.routeGuide||o.routeHint||o.routeBeacon||o.kind==='route_core'){this.routePuzzleObject(c,o,game);return;}
    const active=o.active,color=active?'#b8e5a8':o.kind==='boss_plate'?'#edb0e4':'#c6b3de';
    c.save();c.translate(o.x,o.y);
    if(['plate','boss_plate','crate_plate'].includes(o.kind)){
      const radius=o.radius||30;ellipse(c,0,0,radius+6,radius*.59+4,'#161d2f9a');ellipse(c,0,0,radius,radius*.56,active?'#74a77566':'#77618d3d');
      c.beginPath();c.ellipse(0,0,radius,radius*.56,0,0,TAU);c.strokeStyle=color;c.lineWidth=active?3:1.5;c.stroke();text(c,o.kind==='crate_plate'?'⬡':'✧',0,0,21,color);
      if(active)glow(c,0,0,radius*1.7,`${color}32`);
      const instance=game.dungeonInstance||game.dungeon,puzzle=instance?.puzzles?.find(p=>p.id===o.puzzle),hold=puzzle?.hold||instance?.shieldHold||0;
      if(hold>0){c.beginPath();c.arc(0,0,radius+8,-Math.PI/2,-Math.PI/2+TAU*Math.min(1,hold/2));c.strokeStyle='#d9edaf';c.lineWidth=3;c.stroke();}
    }else if(o.kind==='rune'){
      ellipse(c,2,7,23,9,'#171d2b90');poly(c,[[-19,2],[-16,-36],[0,-48],[16,-36],[20,3]],active?'#657861':'#666274','#252d3c',2);
      if(active)glow(c,0,-23,45,`${color}31`);text(c,({mond:'☾',blatt:'❧',glut:'✦',frost:'❄',stern:'★'})[o.symbol]||'✧',0,-23,22,color);
    }else if(o.kind==='lens'){
      ellipse(c,0,4,25,11,'#272b3b');rounded(c,-5,-24,10,27,3,'#8e8398','#383d4c');ellipse(c,0,-27,17,17,'#413e5e');ellipse(c,0,-27,13,13,`${color}90`);
      const a=(o.rotation||0)*Math.PI/2;line(c,[[0,-27],[Math.cos(a)*29,-27+Math.sin(a)*29]],color,4);
      if(active)line(c,[[Math.cos(a)*23,-27+Math.sin(a)*23],[Math.cos(a)*95,-27+Math.sin(a)*95]],`${color}6a`,5);
      text(c,['O','S','W','N'][o.rotation||0],0,23,11,color);
    }else if(o.kind==='switch'){
      rounded(c,-20,-3,40,17,4,'#5e5c70','#2d3040');line(c,[[0,0],[active?13:-13,-30]],active?'#aacf88':'#afa0bd',6);ellipse(c,active?13:-13,-30,8,8,color);text(c,String(o.index+1),0,23,11,color);
    }else if(o.kind==='crate'){
      rounded(c,-20,-25,40,36,3,'#a38260','#37323c');rect(c,-20,-25,40,5,'#c6a37c');line(c,[[-15,-18],[15,5]],'#665b55',5);line(c,[[15,-18],[-15,5]],'#dbc29a',3);text(c,'⬡',0,-10,17,'#463a38');
    }else if(['reset','undo'].includes(o.kind)){
      ellipse(c,0,3,23,12,'#454452');ellipse(c,0,-11,17,17,'#898093');text(c,o.kind==='undo'?'↶':'↺',0,-11,23,'#ded1b3');
    }else{
      rounded(c,-22,-29,44,35,3,'#827886','#343345');line(c,[[-16,-16],[16,-16]],'#c9b6cb',2);text(c,'☷',0,-9,21,'#cbbcd4');
    }
    c.restore();
    if(Math.hypot(o.x-game.player.x,o.y-game.player.y)<130)this.label(c,o.label||'Erinnerung',o.x,o.y-66,color,9);
  }
  routeSafetyIslands(c,game) {
    for(const chamber of game.dungeonInstance?.routes?.chambers||[]){
      if(chamber.kind!=='tactical'||!this.intersects(chamber,8))continue;
      const bands=routeHazardShapes(chamber,0).map(phase=>shapeBounds(phase.shape)).filter(Boolean).sort((a,b)=>a.y-b.y);
      // Only permanent gaps between real damage bands are marked cool. A
      // currently resting band is not falsely advertised as a safe island.
      for(let index=1;index<bands.length;index++){
        const top=bands[index-1].y+bands[index-1].h,bottom=bands[index].y;if(bottom-top<16)continue;
        const y=Math.round((top+bottom)/4)*2;
        for(let x=chamber.x+32;x<chamber.x+chamber.w-32;x+=64){
          rect(c,x,y-4,32,8,'#72a79f22');rect(c,x+6,y-2,20,4,'#b2d7c44d');rect(c,x+14,y-6,4,12,'#b2d7c44d');
        }
      }
    }
  }
  routePuzzleObject(c,o,game) {
    const routes=game.dungeonInstance?.routes,chamber=routes?.chambers.find(room=>room.id===o.routeChamberId);
    const completed=!!chamber&&routes.completed.includes(chamber.id),relay=chamber&&routes?.relay?.chamberId===chamber.id?routes.relay:null;
    const next=!!relay&&chamber.beacons[relay.step]?.id===o.id,color=completed?'#b7d59a':next?'#f1cf86':o.active?'#b6dab9':'#c4b0d7';
    c.save();c.translate(Math.round(o.x/2)*2,Math.round(o.y/2)*2);rect(c,-20,2,40,6,'#19162788');rect(c,-12,0,24,10,'#19162788');
    if(o.routeGuide||o.routeHint){
      rect(c,-4,-6,8,12,'#65545b');rect(c,-22,-40,44,30,'#302838');rect(c,-20,-38,40,26,'#766575');
      rect(c,-18,-36,36,2,'#c0a8b5');rect(c,-18,-16,36,2,'#413647');
      routePixelGlyph(c,o.routeGuide?'relay':chamber?.kind||'core',0,-28,'#e4c397');
      if(o.routeGuide){rect(c,-15,-22,4,4,'#cb9ca4');rect(c,13,-22,4,4,'#cb9ca4');}
    }else if(o.routeBeacon){
      rect(c,-18,-4,36,8,'#352d43');rect(c,-14,-32,28,28,'#65596f');rect(c,-10,-40,20,8,'#857488');rect(c,-6,-44,12,4,'#413647');
      rect(c,-12,-30,24,22,next?'#534132':completed||o.active?'#34504a':'#3b324d');routePixelGlyph(c,completed?'check':o.symbol,0,-21,color);
      if(next){for(const x of [-22,20]){rect(c,x,-24,2,12,'#e1ba79');rect(c,x-2,-20,6,4,'#f3d5a0');}}
    }else{
      rect(c,-22,-4,44,10,'#353043');rect(c,-16,-12,32,8,'#716573');rect(c,-12,-20,24,8,'#a1909d');
      rect(c,-8,-40,16,4,'#403746');rect(c,-12,-36,24,20,completed?'#506a50':'#5d536c');rect(c,-8,-34,16,16,'#292633');
      routePixelGlyph(c,completed?'check':chamber?.kind||'core',0,-26,color);
    }
    const hold=o.routeTactical?routes?.tacticalHolds?.[chamber?.id]||0:next&&relay.holding?relay.hold||0:0;
    if(hold>0){c.beginPath();c.arc(0,0,30,-Math.PI/2,-Math.PI/2+TAU*clamp(hold/2,0,1));c.strokeStyle='#d4e5b4';c.lineWidth=2;c.stroke();}
    c.restore();
    if(Math.hypot(o.x-game.player.x,o.y-game.player.y)<(o.routeGuide||o.routeHint?220:160)){
      const order=o.routeBeacon?chamber?.beacons.findIndex(beacon=>beacon.id===o.id)+1:0;
      const label=completed?`${chamber.title} · gemeistert`:o.routeBeacon?`${order}. ${ROUTE_SYMBOLS[o.symbol]||o.symbol}${next?' · als Nächstes halten':o.active?' · getragen':''}`:o.label||'Wegzeichen';
      this.label(c,label,o.x,o.y-56,color,10);
    }
  }
  hazard(c,h,game) {
    const radius=h.radius||100,color=h.color||'#df7568',pending=(h.windup||0)>0||h.pending;
    if(h.routeHazard){
      if(!shapeBounds(h.shape))return;
      this.encounterShape(c,{...h.shape,color},{active:!!h.active||!pending,progress:clamp(1-(h.life||0)/(h.maxLife||h.life||1),0,1),color});return;
    }
    if(h.raidEncounter){
      const shape=h.shape,box=shapeBounds(shape);if(!box)return;
      const cast=game.dungeonInstance?.raidEncounter?.pending;
      const duration=cast&&cast.mechanicId===h.mechanicId?cast.resolveAt-cast.time:h.maxLife||h.life||1;
      const progress=clamp(1-(h.life||0)/(duration||1),0,1);
      this.encounterShape(c,{...shape,color:RAID_WARNING_COLOR},{active:!pending,progress,color:RAID_WARNING_COLOR});
      this.raidRefuges(c,shape);
      return;
    }
    if(h.directorId&&h.kind==='warning'){
      const progress=clamp(1-Math.max(0,h.life||0)/(h.maxLife||8),0,1);
      ellipse(c,h.x,h.y,radius,radius,`${color}26`);c.beginPath();c.arc(h.x,h.y,radius,0,TAU);c.strokeStyle=`${color}c0`;c.lineWidth=2;c.stroke();
      c.beginPath();c.arc(h.x,h.y,radius,-Math.PI/2,-Math.PI/2+TAU*progress);c.strokeStyle='#f2b8a6';c.lineWidth=4;c.stroke();
      for(let i=0;i<4;i++){const a=i*TAU/4;line(c,[[h.x+Math.cos(a)*(radius-7),h.y+Math.sin(a)*(radius-7)],[h.x+Math.cos(a)*(radius-2),h.y+Math.sin(a)*(radius-2)]],`${color}e0`,2);}
      poly(c,[[h.x,h.y-8],[h.x+6,h.y],[h.x,h.y+8],[h.x-6,h.y]],'#281925',`${color}e0`,2);
      return;
    }
    if(h.pvp&&['line','cone'].includes(h.shape)){
      const angle=h.angle||0,length=h.length||85,progress=clamp(1-(h.life||0)/(h.maxLife||1),0,1);
      if(h.shape==='line'){const dx=Math.cos(angle),dy=Math.sin(angle),half=(h.width||30)/2,x=h.x+dx*length,y=h.y+dy*length;poly(c,[[h.x-dy*half,h.y+dx*half],[x-dy*half,y+dx*half],[x+dy*half,y-dx*half],[h.x+dy*half,h.y-dx*half]],`${color}28`,`${color}d8`,2);line(c,[[h.x,h.y],[h.x+dx*length*progress,h.y+dy*length*progress]],`${color}80`,2);}
      else {const arc=h.arc||1.9;c.beginPath();c.moveTo(h.x,h.y);c.arc(h.x,h.y,length,angle-arc/2,angle+arc/2);c.closePath();c.fillStyle=`${color}28`;c.fill();c.strokeStyle=`${color}d8`;c.lineWidth=2;c.stroke();}
      return;
    }
    const alpha=pending ? .11 : .2;ellipse(c,h.x,h.y,radius,radius,`${color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`);
    c.beginPath();c.arc(h.x,h.y,radius,0,TAU);c.strokeStyle=`${color}b0`;c.lineWidth=2;c.stroke();
    if(!game.settings?.reducedMotion)for(let i=0;i<6;i++){const a=i*TAU/6+game.time*.2;ellipse(c,h.x+Math.cos(a)*radius*.72,h.y+Math.sin(a)*radius*.72,3,3,color);}
    if(h.kind==='trap')for(let i=0;i<8;i++){const a=i*TAU/8;poly(c,[[h.x+Math.cos(a)*radius*.5,h.y+Math.sin(a)*radius*.5],[h.x+Math.cos(a+.12)*radius*.3,h.y+Math.sin(a+.12)*radius*.3],[h.x+Math.cos(a-.12)*radius*.3,h.y+Math.sin(a-.12)*radius*.3]],`${color}c0`);}
    if(h.kind==='meteor'){const time=game.settings?.reducedMotion?0:game.time;line(c,[[h.x-30,h.y-140+Math.sin(time)*8],[h.x,h.y-12]],`${color}60`,5);ellipse(c,h.x,h.y-10,6,6,'#ffcd94');this.label(c,'METEOR',h.x,h.y-radius-13,color,9);}
    if(h.kind==='storm')for(let i=0;i<3;i++){const a=i*TAU/3;line(c,[[h.x+Math.cos(a)*radius*.55,h.y+Math.sin(a)*radius*.55-28],[h.x+Math.cos(a)*radius*.4-5,h.y+Math.sin(a)*radius*.4],[h.x+Math.cos(a)*radius*.5+6,h.y+Math.sin(a)*radius*.5-4]],`${color}75`,2);}
    if(h.kind==='heal'||h.healing)this.label(c,'Heilkreis',h.x,h.y-radius-12,'#a3d8af',9);
  }
  summon(c,s,game) {
    if(s.companion){const color=s.color||'#bca885',owner=game.partyGames?.find(ally=>(ally.player.id||'local')===s.actorId)?.player||game.player,face=Number.isFinite(s.face)?s.face:Math.atan2(owner.y-s.y,owner.x-s.x);glow(c,s.x,s.y-16,27,`${color}19`);drawPixelCompanion(c,{...s,face},game.settings?.reducedMotion?0:game.time);return;}
    c.save();c.translate(s.x,s.y);const bob=game.settings?.reducedMotion?0:Math.sin(game.time*4+s.x)*3,color=s.color||'#bda3e2';
    glow(c,0,-12,35,`${color}26`);ellipse(c,0,8,16,5,'#0e142355');
    if(s.visualType==='ranger_dusk_flock'){
      const flap=game.settings?.reducedMotion?4:Math.sin(game.time*9)*5;
      for(const side of [-1,1]){poly(c,[[side*3,-15-bob],[side*20,-26-bob+flap],[side*25,-17-bob],[side*13,-11-bob]],'#a8b4a2','#1d2736',2);line(c,[[side*6,-16-bob],[side*19,-21-bob+flap]],color,2);}
      poly(c,[[-5,-10-bob],[-5,-23-bob],[0,-29-bob],[5,-23-bob],[4,-10-bob],[0,-5-bob]],'#56665e','#202336',2);poly(c,[[2,-24-bob],[9,-21-bob],[3,-19-bob]],'#d5b579');ellipse(c,3,-24-bob,1.5,1.5,'#e5efc2');
    }else if(s.visualType==='druid_ancient_guard'){
      poly(c,[[-12,5],[-16,-23],[-8,-42],[0,-49],[11,-37],[15,-19],[12,5],[5,1],[0,8],[-5,1]],'#53614c','#202b2a',2);line(c,[[-5,-32],[-6,0]],'#a3aa6d',3);line(c,[[6,-30],[7,-3]],'#8a7658',3);
      for(const side of [-1,1]){line(c,[[side*9,-24],[side*23,-16]],'#687d50',5);line(c,[[side*23,-16],[side*20,-5]],'#a5ba7b',3);line(c,[[side*6,-39],[side*16,-49]],'#aebc80',3);}
      ellipse(c,-4,-33,2,2,'#c8e6a0');ellipse(c,4,-33,2,2,'#c8e6a0');
    }else if(s.visualType==='shadowbinder_abyss_eye'){
      for(let i=0;i<6;i++){const a=i*TAU/6;line(c,[[Math.cos(a)*11,-22-bob+Math.sin(a)*11],[Math.cos(a)*22,-22-bob+Math.sin(a)*22]],color,3);}
      ellipse(c,0,-22-bob,15,17,'#2c2444');ellipse(c,0,-22-bob,11,7,'#cdbbde');ellipse(c,2,-22-bob,4,7,'#635078');ellipse(c,3,-22-bob,2,6,'#201b35');ellipse(c,1,-26-bob,1,2,'#f2e4eb');
    }else {poly(c,[[-16,6],[-14,-21-bob],[-3,-32-bob],[11,-23-bob],[16,7],[7,0],[0,9],[-7,0]],`${color}8a`,'#454166',2);ellipse(c,-5,-19-bob,2,2,'#f5e6cb');ellipse(c,5,-19-bob,2,2,'#f5e6cb');}
    c.restore();
  }
  tree(c,t,p) {
    c.save();if(Math.hypot(p.x-t.x,p.y-t.y+55)<64*t.scale&&p.y<t.y)c.globalAlpha=.48;
    drawPixelTree(c,t,this.elapsed);c.restore();
  }
  rock(c,r) {drawPixelRock(c,r);}
  structure(c,s,game) {
    if(s.type==='puzzle_crate')return;
    if(s.type==='dungeon_route_gate'){
      const {x,y,w,h}=s,open=s.blocking===false;
      c.save();
      if(open){rect(c,x,y,6,h,'#829e93');rect(c,x+w-6,y,6,h,'#829e93');for(let px=x+16;px<x+w-8;px+=32){rect(c,px,y+6,4,4,'#86b1a67d');rect(c,px,y+h-10,4,4,'#86b1a67d');}}
      else{rect(c,x,y,w,h,'#584765');for(let px=x+8;px<x+w-8;px+=16){rect(c,px,y+2,4,h-4,'#aa8fbb');rect(c,px+4,y+4,2,h-8,'#342d47');}rect(c,x,y,w,2,'#d1b9de');rect(c,x,y+h-2,w,2,'#2a2638');routePixelGlyph(c,'core',x+w/2,y+h/2,'#ead5a1');}
      c.restore();if(Math.hypot(game.player.x-x-w/2,game.player.y-y-h/2)<190)this.label(c,open?`Weg ${s.routeStage} offen`:`Wegsiegel ${s.routeStage} · einen Weg meistern`,x+w/2,y-16,open?'#b4d6c3':'#dfc5e8',10);return;
    }
    if(s.type==='dungeon_wall'||s.type==='dungeon_gate'){
      c.save();c.translate(s.x,s.y);const {w,h}=s;let gateHint=false;
      if(s.type==='dungeon_gate'&&s.blocking===false){
        glow(c,w/2,h/2,Math.max(w,h)*.65,'#a5d3b517');line(c,[[0,0],[w,0]],'#b9d6bd',4);line(c,[[0,h],[w,h]],'#b9d6bd',4);
        for(let i=0;i<5;i++)ellipse(c,w/2+Math.sin(game.time+i)*8,h*(i+.5)/5,2,2,'#d4e7b180');
      }else{
        rect(c,-3,7,w+6,h+7,'#131a2a72');rect(c,0,0,w,h,s.type==='dungeon_gate'?'#4c4264':'#555663');
        for(let y=0;y<h;y+=24)for(let x=0;x<w;x+=38){const offset=Math.floor(y/24)%2?19:0;rect(c,x+offset+1,y+1,Math.min(36,Math.max(0,w-x-offset-2)),Math.min(21,h-y-2),'#92909a18');line(c,[[x+offset,y],[Math.min(w,x+offset+38),y]],'#bdb5c442',1);}
        line(c,[[0,0],[w,0]],'#b3a8b9',3);line(c,[[0,h],[w,h]],'#242837',3);
        if(s.type==='dungeon_gate'){for(let y=20;y<h-10;y+=35){line(c,[[6,y],[w-6,y]],'#ba96de',3);text(c,'✧',w/2,y+16,14,'#d0b0ee');}gateHint=Math.hypot(game.player.x-s.x,game.player.y-s.y-h/2)<220;}
      }
      c.restore();if(gateHint)this.label(c,'Löse die Erinnerungen',s.x+w/2,s.y+h/2,'#d1bbdf',10);return;
    }
    c.save();c.translate(s.x,s.y);const {w,h}=s;ellipse(c,w*.59,h*.85,w*.64,h*.18,'#0a101c98');
    if(s.type==='well') {
      ellipse(c,w/2,h*.75,36,19,'#283f3b');ellipse(c,w/2,h*.7,34,18,'#8d9481');ellipse(c,w/2,h*.63,25,14,'#354e52');ellipse(c,w/2,h*.64,17,8,'#7399a0');
      for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[[w/2+Math.cos(a)*31,h*.7+Math.sin(a)*16],[w/2+Math.cos(a)*23,h*.67+Math.sin(a)*11]],'#c0c2a766',2);}
      rect(c,8,4,6,43,'#5a6047');rect(c,w-14,4,6,43,'#5a6047');poly(c,[[-3,15],[w/2,-8],[w+3,15]],'#526c65','#273d3d',2);line(c,[[w/2,11],[w/2,42]],'#bda974',2);ellipse(c,w/2,41,5,4,'#bc9c55');
    } else if(s.type==='market') {
      rect(c,7,h*.45,w-14,h*.5,'#786347');rect(c,7,h*.51,w-14,7,'#ba9a64');
      for(let i=0;i<6;i++){const x=15+i*15;ellipse(c,x,h*.6,5,4,i%2?'#c79045':'#7b9254');}
      rect(c,9,14,5,h-15,'#88734e');rect(c,w-15,14,5,h-15,'#88734e');poly(c,[[0,14],[15,-3],[w-15,-3],[w,14],[w,h*.42],[0,h*.42]],'#a48459','#403f30',2);
      for(let x=0;x<w;x+=20)poly(c,[[x,14],[x+10,0],[x+20,0],[x+20,h*.4],[x,h*.4]],x%40?'#ddc88b':'#657b64');
      for(let x=0;x<w;x+=20)ellipse(c,x+10,h*.41,10,5,x%40?'#cfb77b':'#566e5b');
      rounded(c,w*.48,h*.73,35,21,2,'#5c563e','#b39b5e');text(c,'◆',w*.62,h*.84,13,'#c9ad61');
    } else if(s.type==='ruins'||s.type==='tower') {
      const tower=s.type==='tower',top=tower?4:20;
      poly(c,[[7,h*.91],[7,h*.32],[17,top+10],[28,top+19],[35,top],[w*.5,top+7],[w*.66,top-5],[w-17,top+24],[w-7,h*.31],[w-7,h*.91]],'#53545e','#242734',3);
      poly(c,[[8,h*.35],[21,top+13],[29,top+23],[36,top+4],[w*.49,top+11],[w*.5,h*.88],[8,h*.88]],'#737078');
      for(let y=h*.35;y<h*.85;y+=18){line(c,[[10,y],[w-10,y]],'#262a354d',2);for(let x=17;x<w-16;x+=26)line(c,[[x+(Math.floor(y/18)%2?12:0),y],[x+(Math.floor(y/18)%2?12:0),y+16]],'#24283355',1);}
      const ax=w*.5,ay=h*.41;poly(c,[[ax-18,h*.91],[ax-18,ay+26],[ax-10,ay+10],[ax,ay],[ax+10,ay+10],[ax+18,ay+26],[ax+18,h*.91]],'#171b29','#b0a28d',3);
      for(const x of [w*.17,w*.72]){poly(c,[[x-5,h*.58],[x-5,h*.44],[x,h*.36],[x+6,h*.44],[x+6,h*.58]],'#252839');line(c,[[x,h*.42],[x,h*.57]],'#aea8a038',2);}
      for(const x of [0,w-17]){rect(c,x,h*.53,17,h*.38,'#3b3d49');rect(c,x-2,h*.51,21,6,'#928982');line(c,[[x+4,h*.58],[x+4,h*.86]],'#83808b55',2);}
      line(c,[[w*.72,top+25],[w*.62,h*.48],[w*.71,h*.6],[w*.63,h*.8]],'#1c233b',3);line(c,[[w*.28,h*.64],[w*.2,h*.8],[w*.28,h*.88]],'#313f3350',5);
      poly(c,[[w*.72,h*.47],[w*.81,h*.5],[w*.83,h*.77],[w*.76,h*.72],[w*.71,h*.78]],'#6c303c');line(c,[[w*.71,h*.47],[w*.83,h*.5]],'#ba955e',2);
      for(let i=0;i<6;i++){const x=14+noise(i+s.x)*w*.7,y=h*.94+noise(i+s.y)*9;poly(c,[[x-7,y],[x-4,y-6],[x+5,y-5],[x+8,y+1]],'#67626d','#34333f',1);}
      this.flame(c,w*.13,h*.76,game.settings?.reducedMotion?0:game.time,7);
    } else if(s.type==='camp') {
      poly(c,[[-8,h*.9],[w*.5,-8],[w+8,h*.9]],'#b39469','#493d32',2);poly(c,[[w*.5,-8],[w*.64,h*.9],[w+8,h*.9]],'#856a4d');poly(c,[[w*.5,h*.31],[w*.73,h*.9],[w*.33,h*.9]],'#493f35');line(c,[[w*.5,-8],[w*.5,h*.31]],'#e2c083',2);
    } else {
      const inn=s.type==='inn',smith=s.type==='smith',roof=smith?'#647778':inn?'#5b3940':'#424b45';
      rect(c,13,h*.35,w-26,h*.54,'#8a837a');rect(c,w*.75,h*.35,w*.16,h*.54,'#575962');rect(c,12,h*.85,w-24,12,'#6c6f57');
      for(const x of [17,w*.37,w*.69,w-20])rect(c,x,h*.36,6,h*.48,'#45454a');rect(c,17,h*.53,w-36,5,'#716c4e');
      rounded(c,w*.41,h*.57,w*.2,h*.3,13,'#454b3b','#847953');line(c,[[w*.5,h*.62],[w*.5,h*.84]],'#88794f',2);ellipse(c,w*.55,h*.75,2,2,'#d2b26a');
      for(const x of [w*.17,w*.7]){rounded(c,x,h*.55,23,24,2,'#d8af60','#5d6147');rect(c,x+10,h*.55,3,24,'#6c6849');rect(c,x,h*.65,23,3,'#6c6849');glow(c,x+11,h*.66,28,'#ffd3751c');}
      poly(c,[[-10,h*.39],[w*.38,-10],[w+9,h*.2],[w+10,h*.42]],roof,'#24252c',3);
      poly(c,[[-10,h*.39],[w*.38,-10],[w*.48,h*.22],[w+10,h*.42]],roof);poly(c,[[w*.38,-10],[w+9,h*.2],[w+10,h*.42],[w*.48,h*.22]],smith?'#4d6164':inn?'#3f303a':'#303b37');
      for(let i=1;i<8;i++){const t=i/8;line(c,[[-10+(w*.38+10)*t,h*.39-(h*.39+10)*t],[w*.48+(w*.52+10)*t,h*.22+(h*.2)*t]],'#c9b68532',1.5);}
      for(let i=0;i<8;i++){const t=i/8;line(c,[[-6+w*.38*t,h*.39-(h*.39+10)*t],[w*.39+(w*.6)*t,-5+h*.2*t]],'#342f2525',1);}
      line(c,[[-9,h*.4],[w*.47,h*.23],[w+11,h*.43]],'#c8ae71',3);
      rect(c,w*.72,-7,18,35,'#7b8070');rect(c,w*.69,-10,24,6,'#a6aa93');
      for(let i=0;i<3;i++){const offset=(game.time*8+i*15)%48;ellipse(c,w*.79+Math.sin(game.time+i)*7,-12-offset,5+offset*.13,4+offset*.13,`rgba(211,207,179,${.12*(1-offset/50)})`);}
      if(inn){line(c,[[w+3,h*.35],[w+21,h*.35]],'#655f42',3);line(c,[[w+18,h*.35],[w+18,h*.49]],'#968559',2);rounded(c,w+1,h*.48,35,28,3,'#414f3b','#b49e5d');text(c,'✦',w+18,h*.58,21,'#d6bd73');}
      if(smith){ellipse(c,w-6,h-10,22,12,'#41473e');poly(c,[[w-26,h-17],[w+15,h-17],[w+8,h-9],[w-1,h-7],[w+4,h],[w-14,h],[w-10,h-9]],'#89918a','#2f4139',2);this.flame(c,18,h-8,game.time,14);}
      if(!smith){rounded(c,-5,h*.76,21,31,4,'#766247','#c19b5c');line(c,[[-4,h*.82],[15,h*.82]],'#463c2c',3);line(c,[[-4,h*.95],[15,h*.95]],'#463c2c',3);}
    }
    c.restore();
  }
  plot(c,p,time) {
    rounded(c,p.x-21,p.y-18,43,38,4,'#4d3e2e','#7b6a45');
    for(let y=-11;y<17;y+=9)line(c,[[p.x-16,p.y+y],[p.x+17,p.y+y]],'#84613e',3);
    const planted=p.state!=='empty',ripe=p.state==='ripe'||p.state==='ready'||planted&&p.readyAt>0&&p.readyAt<=time;
    if(planted)for(let i=0;i<6;i++){const x=p.x-12+(i%3)*12,y=p.y-5+Math.floor(i/3)*15;line(c,[[x,y+5],[x+(Math.sin(time*1.4+i)*1.4),y-(ripe?21:8)]],ripe?'#b9a75b':'#72915b',2);for(let k=0;k<3;k++)ellipse(c,x+(k%2?3:-3),y-(ripe?8+k*4:2+k*2),ripe?3:3.5,ripe?4:2,ripe?'#ddc77a':'#98ab67');}
  }
  node(c,n,game) {
    const ready=(n.readyAt||0)<=game.time;c.save();c.translate(n.x,n.y);if(!ready)c.globalAlpha=.32;
    ellipse(c,3,5,21,8,'#19302d55');
    if(n.type==='wood'){for(let i=0;i<3;i++){rounded(c,-18+i*7,-5-i*7,33,10,4,'#72583c','#323e2d');ellipse(c,13+i*2,-i*7,5,5,'#bc9962');ellipse(c,13+i*2,-i*7,2,2,'#87653f');line(c,[[-13+i*5,-3-i*7],[6+i*5,-3-i*7]],'#aa815249',1.5);}}
    else if(n.type==='herb'){for(let i=0;i<7;i++){const a=i*2.4;line(c,[[0,4],[Math.cos(a)*13,Math.sin(a)*8-12]],'#66805d',2);ellipse(c,Math.cos(a)*13,Math.sin(a)*8-12,5,3,i%2?'#9eb785':'#658d68');if(i%3===0)ellipse(c,Math.cos(a)*13,Math.sin(a)*8-18,3,3,'#d9d7a6');}}
    else if(n.type==='crystal'){glow(c,0,-8,38,'#ad90e326');poly(c,[[-15,3],[-18,-16],[-8,-31],[2,-17],[5,-3]],'#ad9bca','#514968',2);poly(c,[[0,5],[2,-27],[12,-41],[22,-19],[17,7]],'#a88dc7','#514968',2);poly(c,[[12,-41],[12,-7],[22,-19]],'#dcc5ed');poly(c,[[-8,-31],[-8,-5],[2,-17]],'#ddc2e8');}
    else {poly(c,[[-23,3],[-18,-13],[-4,-24],[15,-19],[24,-2],[16,9],[-6,11]],'#697b75','#3b4c47',2);poly(c,[[-18,-13],[-4,-24],[15,-19],[3,-5]],'#8d9f94');for(let i=0;i<3;i++)poly(c,[[-12+i*11,-8-i*3],[-6+i*11,-16-i*3],[i*11,-7-i*3],[-6+i*11,1-i*3]],'#d4c79a');}
    if(ready&&Math.hypot(n.x-game.player.x,n.y-game.player.y)<90){text(c,'✦',0,-42,13,'#d4c18a');}c.restore();
  }
  chest(c,ch) {
    c.save();c.translate(ch.x,ch.y);ellipse(c,2,6,23,9,'#172b2866');rounded(c,-20,-16,40,25,4,'#6d5135','#332d29');
    if(ch.opened){rounded(c,-20,-28,40,16,4,'#9b7445','#423d2b');rect(c,-17,-15,34,8,'#2c322c');}
    else {rounded(c,-20,-26,40,16,6,'#ae8750','#423d2b');line(c,[[-18,-16],[18,-16]],'#d3b777',2);}
    rect(c,-13,-24,4,30,'#b6a15e');rect(c,9,-24,4,30,'#b6a15e');rounded(c,-5,-14,10,10,2,'#ddc97f');rect(c,-1,-11,2,4,'#4e482f');c.restore();
  }
  shrine(c,s,game) {
    c.save();c.translate(s.x,s.y);ellipse(c,0,6,40,22,'#677765');ellipse(c,0,4,33,17,'#414f45');
    c.beginPath();c.ellipse(0,4,26,13,0,0,TAU);c.strokeStyle='#aabc8855';c.lineWidth=1.5;c.stroke();
    glow(c,0,-31,60,'#b2cc7930');poly(c,[[-15,0],[-12,-48],[0,-65],[12,-48],[15,0]],'#76876e','#314b3c',2);poly(c,[[0,-65],[0,0],[15,0],[12,-48]],'#4b6654');
    poly(c,[[0,-53],[-7,-39],[0,-24],[7,-39]],'#d5d6a0');glow(c,0,-38,20,'#dbeca47a');
    for(let i=0;i<3;i++){const a=game.time*.5+i*TAU/3;ellipse(c,Math.cos(a)*21,-33+Math.sin(a)*13,1.8,1.8,'#e0e7b0');}
    c.restore();if(Math.hypot(s.x-game.player.x,s.y-game.player.y)<155)this.label(c,s.name,s.x,s.y+31,'#c1c8a1',10);
  }
  person(c,p,game,hero) {
    c.save();c.translate(Math.round(p.x/2)*2,Math.round(p.y/2)*2);
    if(hero){
      const appearance=p.remote?(p.appearanceDescriptor||deriveCharacterAppearance({classId:p.classId})):deriveCharacterAppearance({classId:p.classId,equipment:game.equipment||{},item:id=>game.item?.(id)});
      drawCharacterSprite(c,p,{atlas:this.characterAtlas,metadata:this.atlasMetadata,appearance,time:game.time,reducedMotion:!!game.settings?.reducedMotion});
      c.restore();this.heroStatus(c,p,game);return;
    }
    const dashing=(p.dashUntil||0)>game.time,facing=dashing?(p.dashAngle??p.face??Math.PI/2):typeof p.face==='number'?p.face:Math.PI/2,walking=p.walking&&!game.settings?.reducedMotion;
    rect(c,-16,2,32,6,'#142c2c80');rect(c,-10,0,20,10,'#142c2c80');
    if(hero&&!game.settings?.reducedMotion&&(p.invulnerable||0)>0&&Math.floor(game.time*12)%2)c.globalAlpha=.72;
    const meta=hero?this.atlasMetadata:this.npcMetadata,atlas=hero?this.characterAtlas:this.npcAtlas;
    const row=hero?meta.classes.indexOf(getClass(p.classId).id):meta.npcs.indexOf(p.id);
    if(atlas&&row>=0&&atlas.naturalWidth===1024&&atlas.naturalHeight>=(row+1)*48){
      const direction=Math.abs(Math.cos(facing))>Math.abs(Math.sin(facing))?(Math.cos(facing)>0?1:3):(Math.sin(facing)>0?0:2);
      const attackEnd=Math.max(p.attackUntil||0,p.castUntil||0),attacking=attackEnd>game.time;
      const pose=p.downed||p.dead?7:dashing?(game.settings?.reducedMotion?2:(p.dashUntil-game.time>.09?2:4)):attacking?(attackEnd-game.time>.11?5:6):walking?1+Math.floor(game.time*9)%4:0;
      const [px,py]=meta.pivot||[16,40];
      c.imageSmoothingEnabled=false;
      if(hero&&dashing&&!game.settings?.reducedMotion){const alpha=c.globalAlpha;for(let i=2;i>=1;i--){c.globalAlpha=.1/i;c.drawImage(atlas,(direction*8+pose)*32,row*48,32,48,-px*2-Math.round(Math.cos(facing)*i*16/2)*2,-py*2-Math.round(Math.sin(facing)*i*16/2)*2,64,96);}c.globalAlpha=alpha;}
      c.drawImage(atlas,(direction*8+pose)*32,row*48,32,48,-px*2,-py*2,64,96);
    }else{
      // A small native-pixel silhouette is visible while the atlas is loading.
      const color=hero?getClass(p.classId).color:p.color||'#8d9c78';
      rect(c,-12,-38,24,34,'#182d34');rect(c,-10,-36,20,24,color);rect(c,-10,-12,20,4,'#72573e');
      rect(c,-8,-58,16,20,'#e2b989');rect(c,-10,-62,20,8,'#5b4636');rect(c,-8,-6,6,12,'#25323a');rect(c,2,-6,6,12,'#25323a');
      if(Math.sin(facing)>=0){rect(c,-4,-50,2,4,'#182d34');rect(c,4,-50,2,4,'#182d34');}
    }
    if(hero&&!p.dead&&!p.downed){const phase=dashing?'dash':(p.castUntil||0)>game.time?'cast':(p.attackUntil||0)>game.time?'strike':null;if(phase)drawPixelClassAccent(c,{x:0,y:0,classId:p.classId,face:facing,accentPhase:phase,accentFrame:game.settings?.reducedMotion?0:Math.floor(game.time*12)%2});}
    c.restore();
    if(hero)this.heroStatus(c,p,game);else this.npcStatus(c,p,game);
  }
  npcStatus(c,p,game) {
    if(Math.hypot(p.x-game.player.x,p.y-game.player.y)>=360)return;
    const relevant=QUESTS.filter(q=>q.giver===p.id);
    const ready=relevant.some(q=>game.questState?.[q.id]?.ready||game.questState?.[q.id]?.status==='ready');
    const marker=ready?'?':relevant.some(q=>game.canAccept?.(q))?'!':'';
    if(marker)this.label(c,marker,p.x,p.y-96,'#ebcf86',18);
    this.label(c,p.name,p.x,p.y-73,'#d7d5af',10);
  }
  heroStatus(c,p,game) {
    const hostile=!!((game.world?.isPvp||game.worldMode==='pvp')&&p.remote),color=hostile?'#e7939f':getClass(p.classId).color;
    if(hostile){c.beginPath();c.ellipse(p.x,p.y+2,23,9,0,0,TAU);c.strokeStyle='#d77989b0';c.lineWidth=2;c.stroke();}
    if(p===game.player&&!game.world?.isPvp&&game.worldMode!=='pvp'){const relic=getRelic(game.item?.(game.equipment?.weapon));if(relic)this.relicAura(c,p,relic,game);}
    if(p.shield>0&&(p.shieldUntil||Infinity)>game.time){c.beginPath();c.ellipse(p.x,p.y-23,29,43,0,0,TAU);c.strokeStyle=`${color}90`;c.lineWidth=2;c.stroke();glow(c,p.x,p.y-24,43,`${color}14`);}
    if(p.downed||p.dead){c.beginPath();c.ellipse(p.x,p.y,25,15,0,0,TAU);c.strokeStyle='#e19b887a';c.lineWidth=2;c.stroke();this.label(c,`${p.name||'Gefährte'} · Am Boden`,p.x,p.y-35,'#ebaf9c',10);}
    else if(p.remote){this.label(c,p.name||getClass(p.classId).name,p.x,p.y-76,color,10);const fraction=p.maxHp?p.hp/p.maxHp:p.hpRatio??1;rounded(c,p.x-22,p.y-63,44,4,2,'#192a37');rounded(c,p.x-22,p.y-63,44*clamp(fraction,0,1),4,2,hostile?'#d77989':'#91c39b');}
    if(!p.presentation&&(p.castUntil||0)>game.time){for(let i=0;i<3;i++){const a=(game.settings?.reducedMotion?0:game.time*4)+i*TAU/3;ellipse(c,p.x+Math.cos(a)*26,p.y-23+Math.sin(a)*16,3,3,color);}}
  }
  label(c,value,x,y,color='#e4dab8',size=11) {
    if(c===this.worldCtx&&this.worldLabels){this.worldLabels.push([value,x,y,color,size]);return;}
    this.drawLabel(c,value,x,y,color,size);
  }
  drawLabel(c,value,x,y,color='#e4dab8',size=11) {
    c.font=`500 ${size}px "Inter",system-ui,sans-serif`;const width=c.measureText(value).width+14;
    rounded(c,x-width/2,y-8,width,17,4,'#11131be8');text(c,value,x,y,size,color);
  }
  enemy(c,e,game) {
    if(e.bossObjectiveId){this.raidObjective(c,e,game);return;}
    const def=ENEMY_TYPES[e.type]||{},boss=!!(e.boss||e.bossVariant||def.boss),elite=!!e.elite&&!boss;
    if(boss){ellipse(c,e.x,e.y+2,39,15,'#240c1880');c.beginPath();c.ellipse(e.x,e.y+2,35,13,0,0,TAU);c.strokeStyle='#d0784d88';c.lineWidth=2;c.stroke();}
    else if(elite){c.beginPath();c.ellipse(e.x,e.y+2,27,10,0,0,TAU);c.strokeStyle='#d67f8dba';c.lineWidth=2;c.stroke();}
    drawPixelEnemy(c,e,game.settings?.reducedMotion?0:game.time);
    if((e.hitUntil||0)>game.time)drawPixelImpact(c,{x:e.x,y:e.y-28,variant:'physical',impactFrame:game.settings?.reducedMotion?0:e.hitUntil-game.time>.08?0:e.hitUntil-game.time>.04?1:2});
    if(!this.enemyPixelHeights.has(e.type))this.enemyPixelHeights.set(e.type,pixelEnemyHeight(e.type));
    if(e.shielded){glow(c,e.x,e.y-38,78,'#b5b3ee12');c.beginPath();c.ellipse(e.x,e.y-34,61,75,0,0,TAU);c.strokeStyle='#c4b5eeaa';c.lineWidth=3;c.stroke();for(let i=0;i<4;i++){const a=game.time*.3+i*TAU/4;text(c,'◈',e.x+Math.cos(a)*61,e.y-34+Math.sin(a)*75,13,'#ded0f0');}}
    const dist=Math.hypot(e.x-game.player.x,e.y-game.player.y);
    const level=e.level||def.level||1,challenge=pveLevelGap(game.player.level,level);
    if(dist<500&&(e.hp<e.maxHp||e.aggro||boss||elite||challenge.gap>3)) {
      const width=boss?94:elite?62:43,top=e.y-this.enemyPixelHeights.get(e.type)-12;rounded(c,e.x-width/2,top,width,5,2,'#1d2c29');rounded(c,e.x-width/2,top,width*clamp(e.hp/e.maxHp,0,1),5,2,boss?'#cf7456':elite?'#d77f8d':'#af706b');
      if(elite){const x=e.x-width/2-11,y=top+3;poly(c,[[x-5,y+2],[x-6,y-5],[x-2,y-2],[x,y-7],[x+2,y-2],[x+6,y-5],[x+5,y+2]],'#f0a1ad','#341c29',1.5);}
      if(boss||elite&&dist<360||dist<170||challenge.gap>3)this.label(c,`${elite?'Elite · ':''}${e.name||def.name||e.type} · ${challenge.overwhelming?'☠ Übermächtig · ':challenge.gap>=10?'Gefährlich · ':''}${level}`,e.x,top-15,challenge.gap>=10?'#ed9b91':boss?'#efc08c':elite?'#efb0b9':'#c9beb4',boss?11:9);
      const raid=game.dungeonInstance?.raidEncounter?.type===e.type;
      if(boss&&e.shielded&&!raid)this.label(c,`Schild · ${def.mechanics?.shield?.plates||3} Quellsiegel gemeinsam halten`,e.x,e.y+30,'#cebbea',10);
      else if(boss&&e.mechanicCycle&&!raid)this.label(c,e.mechanicCycle==='stack'?`Sternfall · ${e.stackRequired||2} zusammen`:'Nova · Abstand halten',e.x,e.y+30,e.mechanicCycle==='stack'?'#afd7d8':'#e0aa90',10);
      if(e.enraged)this.label(c,'RASEREI',e.x,e.y+51,'#ef9788',11);
    }
  }
  raidRefuges(c,shape) {
    if(shape.kind!=='annulus')return;
    const arcs=annulusDangerArcs(shape);if(!arcs.length)return;
    c.save();c.beginPath();
    // This cool boundary marks the exact inner refuge; no filled safe area
    // covers, dims or narrows the actual dangerous annulus.
    if(shape.innerRadius>0){c.arc(shape.x,shape.y,shape.innerRadius,0,TAU);c.strokeStyle=RAID_SAFE_COLOR;c.lineWidth=2;c.stroke();}
    if(shape.gapWidth){
      const gaps=shape.gapAngles??[shape.gapAngle??0];
      for(const center of gaps){
        const half=Math.min(shape.gapWidth,TAU)/2;c.beginPath();
        for(const angle of [center-half,center+half]){c.moveTo(shape.x+Math.cos(angle)*shape.innerRadius,shape.y+Math.sin(angle)*shape.innerRadius);c.lineTo(shape.x+Math.cos(angle)*shape.outerRadius,shape.y+Math.sin(angle)*shape.outerRadius);}
        c.strokeStyle=RAID_SAFE_COLOR;c.lineWidth=2;c.stroke();
      }
    }
    c.restore();
  }
  raidObjective(c,e,game) {
    const objective=game.dungeonInstance?.raidEncounter?.objectives?.[e.bossObjectiveId],exploding=!!objective?.exploding;
    drawRaidObjective(c,e,{time:game.time,reducedMotion:!!game.settings?.reducedMotion,exploding});
    if((e.hitUntil||0)>game.time)drawPixelImpact(c,{x:e.x,y:e.y-30,variant:'physical',impactFrame:game.settings?.reducedMotion?0:1});
    const width=66,top=e.y-RAID_OBJECTIVE_HEIGHT-10;
    rounded(c,e.x-width/2,top,width,5,2,'#211b2d');rounded(c,e.x-width/2,top,width*clamp(e.hp/(e.maxHp||1),0,1),5,2,exploding?'#e98d69':'#bd93d4');
    const remaining=objective?Math.max(0,Math.ceil(objective.expiresAt-(game.dungeonInstance?.bossTime||0)-1e-6)):null;
    this.label(c,`${e.name||'Raidziel'}${remaining!==null?` · ${exploding?'ÜBERLADEN':`${remaining}s`}`:''}`,e.x,top-12,exploding?'#ffbd9e':'#d8bfeb',10);
  }
  projectileTelegraph(c,center,angle,range,color) {
    const dx=Math.cos(angle),dy=Math.sin(angle),tx=center.x+dx*range,ty=center.y+dy*range,start=Math.min(25,range*.25);
    line(c,[[center.x+dx*start,center.y+dy*start],[tx,ty]],`${color}95`,3);
    poly(c,[[tx,ty],[tx-dx*11-dy*5,ty-dy*11+dx*5],[tx-dx*11+dy*5,ty-dy*11-dx*5]],`${color}dd`);
  }
  encounterShapes(c,e,game,active=false) {
    const shapes=active?e.activeShapes:e.telegraphShapes;if(!Array.isArray(shapes))return;
    const color=ENEMY_TYPES[e.type]?.color||'#fa8064',progress=clamp(1-(e.attackTimer||0)/(e.telegraphDuration||1.4),0,1);
    for(const shape of shapes){const box=shapeBounds(shape);if(box&&this.intersects(box,4))this.encounterShape(c,shape,{active,progress,color});}
  }
  encounterShape(c,s,{active=false,progress=0,color='#fa8064'}={}) {
    const safe=s.safe===true; color=s.color||(safe?'#8dbbb9':color);const projectile=s.delivery==='projectile';
    c.save();c.lineCap='round';c.lineJoin='round';c.beginPath();
    if(s.kind==='circle')c.arc(s.x,s.y,s.radius,0,TAU);
    else if(s.kind==='annulus'){
      const arcs=annulusDangerArcs(s);if(!arcs.length){c.restore();return;}
      for(const [start,end] of arcs){
        c.moveTo(s.x+Math.cos(start)*s.outerRadius,s.y+Math.sin(start)*s.outerRadius);c.arc(s.x,s.y,s.outerRadius,start,end);
        if(s.gapWidth){c.lineTo(s.x+Math.cos(end)*s.innerRadius,s.y+Math.sin(end)*s.innerRadius);c.arc(s.x,s.y,s.innerRadius,end,start,true);c.closePath();}
        else {c.closePath();c.moveTo(s.x+s.innerRadius,s.y);c.arc(s.x,s.y,s.innerRadius,TAU,0,true);c.closePath();}
      }
    }else if(s.kind==='cone'){
      c.moveTo(s.x,s.y);c.arc(s.x,s.y,s.length,s.angle-s.halfAngle,s.angle+s.halfAngle);c.closePath();
    }else if(s.kind==='segment'){
      const angle=Math.atan2(s.y2-s.y1,s.x2-s.x1),nx=-Math.sin(angle)*s.width,ny=Math.cos(angle)*s.width;
      c.moveTo(s.x1+nx,s.y1+ny);c.lineTo(s.x2+nx,s.y2+ny);c.arc(s.x2,s.y2,s.width,angle+Math.PI/2,angle-Math.PI/2,true);
      c.lineTo(s.x1-nx,s.y1-ny);c.arc(s.x1,s.y1,s.width,angle-Math.PI/2,angle+Math.PI/2,true);c.closePath();
    }else {c.restore();return;}
    if(!projectile){c.fillStyle=`${color}${safe?'20':active?'55':'2c'}`;c.fill('evenodd');}
    c.strokeStyle=`${color}${active||safe?'ee':'cc'}`;c.lineWidth=active||safe?3:2;c.stroke();
    if(!active&&progress>0&&!projectile){
      c.beginPath();
      if(s.kind==='circle')c.arc(s.x,s.y,s.radius,-Math.PI/2,-Math.PI/2+TAU*progress);
      else if(s.kind==='annulus'){
        const arcs=annulusDangerArcs(s);let remaining=arcs.reduce((sum,[start,end])=>sum+end-start,0)*progress;
        for(const [start,end] of arcs){if(remaining<=0)break;const sweep=Math.min(remaining,end-start);c.moveTo(s.x+Math.cos(start)*s.outerRadius,s.y+Math.sin(start)*s.outerRadius);c.arc(s.x,s.y,s.outerRadius,start,start+sweep);remaining-=sweep;}
      }
      else if(s.kind==='cone')c.arc(s.x,s.y,s.length,s.angle-s.halfAngle,s.angle-s.halfAngle+2*s.halfAngle*progress);
      else if(s.kind==='segment'){c.moveTo(s.x1,s.y1);c.lineTo(s.x1+(s.x2-s.x1)*progress,s.y1+(s.y2-s.y1)*progress);}
      c.strokeStyle=safe?'#b5e4de':'#f4d5b0';c.lineWidth=3;c.stroke();
    }
    if(projectile&&s.kind==='segment'){
      const angle=Math.atan2(s.y2-s.y1,s.x2-s.x1),dx=Math.cos(angle),dy=Math.sin(angle),head=Math.min(10,Math.hypot(s.x2-s.x1,s.y2-s.y1)*.3),half=Math.min(4,s.width*.65);line(c,[[s.x1,s.y1],[s.x2,s.y2]],`${color}b0`,2);
      poly(c,[[s.x2,s.y2],[s.x2-dx*head-dy*half,s.y2-dy*head+dx*half],[s.x2-dx*head+dy*half,s.y2-dy*head-dx*half]],`${color}dd`);
    }
    c.restore();
  }
  telegraph(c,e,game) {
    const def=ENEMY_TYPES[e.type]||{};if(def.encounterProfile){this.encounterShapes(c,e,game);return;}
    const boss=!!(e.boss||e.bossVariant||def.boss),r=e.telegraphRadius||(boss?105:62),progress=clamp(1-e.attackTimer/(e.telegraphDuration||(boss?1.1:.55)),0,1);
    const centers=e.telegraphMechanic==='spread'?(e.spreadTargets||[]):[{x:e.telegraphX??e.x,y:e.telegraphY??e.y}];
    const radius=e.telegraphMechanic==='spread'?75:r,color=e.telegraphMechanic==='stack'?'#8fdae4':'#fa8064';
    for(const center of centers){
      if(!this.visible(center.x,center.y,Math.max(radius+30,e.telegraphRange||0,e.telegraphChargeDistance||0,e.telegraphExtraFan?.range||0)))continue;
      const pattern=e.telegraphPattern||def.combat?.pattern,aim=e.telegraphAngle??e.attackAngle??e.face??0;
      if(pattern==='charge'){
        const length=e.telegraphChargeDistance||def.combat?.chargeDistance||180,half=35,dx=Math.cos(aim),dy=Math.sin(aim),tx=center.x+dx*length,ty=center.y+dy*length;
        poly(c,[[center.x-dy*half,center.y+dx*half],[tx-dy*half,ty+dx*half],[tx+dy*half,ty-dx*half],[center.x+dy*half,center.y-dx*half]],`${color}32`,`${color}dd`,2);
        line(c,[[center.x,center.y],[tx,ty]],'#ffd2a780',2);
        poly(c,[[tx,ty],[tx-dx*18-dy*11,ty-dy*18+dx*11],[tx-dx*18+dy*11,ty-dy*18-dx*11]],'#ffb38ce0');
        if(boss)this.label(c,'ANSTURM · Aus der Bahn',center.x,center.y-57,color,10);
      }else if(['ranged','fan','burst','ring','summoner'].includes(pattern)){
        const actualCount=Math.max(1,Math.min(pattern==='burst'?4:12,Math.floor(e.telegraphProjectileCount??def.combat?.projectileCount??(pattern==='ring'?8:1))));
        const count=['burst','summoner'].includes(pattern)?1:actualCount,spread=e.telegraphProjectileSpread??def.combat?.spread??.7;
        const length=e.telegraphRange||e.telegraphProjectileRange||Math.min(250,Math.max(100,(e.telegraphProjectileSpeed||def.combat?.projectileSpeed||185)*1.2));
        for(let i=0;i<count;i++){
          const angle=pattern==='ring'?aim+i*TAU/count:count>1?aim-spread/2+i*spread/(count-1):aim;
          this.projectileTelegraph(c,center,angle,length,color);
        }
        ellipse(c,center.x,center.y,18,18,`${color}35`);c.beginPath();c.arc(center.x,center.y,22,-Math.PI/2,-Math.PI/2+TAU*progress);c.strokeStyle='#ffd9b5';c.lineWidth=3;c.stroke();
        if(boss)this.label(c,pattern==='ring'?'NOVA · Lücken nutzen':pattern==='burst'?'SALVE · Seitlich ausweichen':pattern==='summoner'?'RUF · Geschoss ausweichen':'GESCHOSSE · Seitlich ausweichen',center.x,center.y-48,color,10);
      }else if(e.telegraphShape==='cone'){
        const angle=e.telegraphAngle??e.face??0,arc=e.telegraphArc||Math.PI/2;c.beginPath();c.moveTo(center.x,center.y);c.arc(center.x,center.y,radius,angle-arc/2,angle+arc/2);c.closePath();c.fillStyle=`${color}30`;c.fill();c.strokeStyle=`${color}ee`;c.lineWidth=boss?3:2;c.stroke();
      }else{
        ellipse(c,center.x,center.y,radius,radius,`${color}${Math.round(44+(game.settings?.reducedMotion?0:12*Math.sin(this.elapsed*12))).toString(16).padStart(2,'0')}`);
        c.beginPath();c.ellipse(center.x,center.y,radius,radius,0,0,TAU);c.strokeStyle=`${color}ee`;c.lineWidth=boss?3:2;c.stroke();
        c.beginPath();c.ellipse(center.x,center.y,radius,radius,0,-Math.PI/2,-Math.PI/2+TAU*progress);c.strokeStyle='#f8e3b8';c.lineWidth=3;c.stroke();
      }
      if(e.telegraphExtraFan){
        const fan=e.telegraphExtraFan,count=Math.max(1,Math.min(12,Math.floor(fan.count||3))),spread=fan.spread??.8,angle=fan.angle??aim,range=fan.range||e.telegraphRange||440;
        for(let i=0;i<count;i++)this.projectileTelegraph(c,center,angle+(count>1?(i/(count-1)-.5)*spread:0),range,'#eac08a');
      }
      if(e.telegraphMechanic&&!game.dungeonInstance?.raidEncounter)this.label(c,e.telegraphMechanic==='stack'?`Zusammen · mindestens ${e.stackRequired||2}`:'Auseinander · Fläche verlassen',center.x,center.y-radius-18,color,10);
    }
  }
  closestFloorLoot(game) {
    let selected=null,best=Infinity;
    for(const drop of game.drops||[]) {
      if(!(drop.life>0)||!Number.isFinite(drop.x)||!Number.isFinite(drop.y))continue;
      const distance=Math.hypot(drop.x-game.player.x,drop.y-game.player.y);
      if(distance>=180)continue;
      const own=!drop.ownerId||drop.ownerId===(game.player.id||'local'),score=distance+(own?0:180);
      if(score<best){best=score;selected=drop;}
    }
    return selected;
  }
  drop(c,d,game) {
    if(d.life<=0)return;
    const item=d.loot||game.item?.(d.item),rarity=item?.rarity||'common';
    const rank=Math.max(0,['common','uncommon','rare','epic','legendary'].indexOf(rarity));
    const own=!d.ownerId||d.ownerId===(game.player.id||'local'),color=RARITIES[rarity]?.color||'#bdc3b0';
    const x=Math.round(d.x),y=Math.round(d.y),moving=!game.settings?.reducedMotion;
    const landing=Number.isFinite(d.pickupAfter)?game.time-d.pickupAfter+.55:.55;
    const lift=moving&&landing>=0&&landing<.55?Math.round(Math.sin(landing/.55*Math.PI)*10):0;
    const height=rank>=3?60:rank>=1?38:0;
    c.save();c.globalAlpha*=own?1:.38;
    rect(c,x-13,y+2,26,3,'#151b2488');rect(c,x-9,y+5,18,2,'#151b2455');
    if(height){
      c.save();c.globalAlpha*=.28;
      rect(c,x-2,y-height-18,4,height,color);rect(c,x-5,y-height-9,10,height-16,color);c.restore();
      for(let i=0;i<rank;i++){
        const phase=moving?(game.time*.65+i*.27)%1:i/(rank+1),sx=x+(i%2?-1:1)*(8+i*3),sy=Math.round(y-20-phase*height);
        rect(c,sx,sy,2,2,color);if(rank>=3){rect(c,sx-1,sy+1,4,1,color);rect(c,sx+1,sy-1,1,4,color);}
      }
    }
    if(d.gold){rect(c,x-5,y-9,10,6,'#987343');rect(c,x-4,y-11,8,5,'#dcb56e');rect(c,x-3,y-11,5,2,'#f0d99f');}
    else drawPixelItem(c,item,x,y-13-lift,{size:32});
    if(rank>=2){rect(c,x-18,y+1,5,2,color);rect(c,x+13,y+1,5,2,color);rect(c,x-1,y+7,2,2,color);}
    c.restore();
    if(item?.name&&(this.floorLootFocusGame!==game||this.floorLootFocus===d)&&Math.hypot(d.x-game.player.x,d.y-game.player.y)<180){
      const name=item.name.length>40?item.name.slice(0,39)+'…':item.name;
      this.label(c,name,d.x,d.y-height-43,own?color:'#8f919f',10);
      this.label(c,own?`${RARITIES[rarity]?.name||'Beute'} · Stufe ${equipmentRequiredLevel(item)}`:'Für Gefährten',d.x,d.y-height-30,own?'#d7d0ba':'#8f919f',8);
    }
  }
  projectile(c,p,game) {
    const hostile=p.hostile||p.owner==='enemy'||p.type==='enemy',actor=(game.partyPlayers||[]).find(a=>(a.player||a).id===p.actorId),classId=(actor?.player||actor)?.classId||game.player.classId;
    const variant=hostile?'hostile':this.world.isPvp?'void':({ranger:'arrow',flamecaller:'fire',frostweaver:'frost',druid:'nature',paladin:'holy',shadowbinder:'void'})[classId]||'void',color=p.color||(hostile?'#d48b99':getClass(classId).color);
    if(variant!=='arrow')glow(c,p.x,p.y,18,`${color}30`);
    drawPixelProjectile(c,{...p,variant,projectileFrame:game.settings?.reducedMotion?0:Math.floor(game.time*12)%2});
  }
  effectVisible(e) {
    if(e.kind==='mastery-channel'){
      const end={x:e.x+Math.cos(e.angle||0)*(e.length||0),y:e.y+Math.sin(e.angle||0)*(e.length||0)},box=shapeBounds({kind:'segment',x1:e.x,y1:e.y,x2:end.x,y2:end.y,width:e.width||0});return !!box&&this.intersects(box,4);
    }
    if(e.kind==='mastery-step'){const box=shapeBounds({kind:'cone',x:e.x,y:e.y,angle:e.angle||0,length:e.range||0,halfAngle:(e.arc||0)/2});return !!box&&this.intersects(box,4);}
    return this.visible(e.x,e.y,Math.max(200,e.radius||0));
  }
  masteryEffect(c,e,game) {
    const color=e.color||'#bd95cf',ratio=clamp((e.life||0)/(e.maxLife||.5),0,1),reduced=!!game.settings?.reducedMotion;
    if(e.kind==='mastery-channel'){
      const angle=e.angle||0,length=e.length||0,pulse=(e.maxLife||0)<=.24;
      this.encounterShape(c,{kind:'segment',x1:e.x,y1:e.y,x2:e.x+Math.cos(angle)*length,y2:e.y+Math.sin(angle)*length,width:e.width||0,delivery:pulse?'impact':'projectile'},{active:pulse,color});
      if(pulse)for(let i=1;i<=3;i++){const distance=length*i/4;rect(c,Math.round((e.x+Math.cos(angle)*distance)/2)*2-2,Math.round((e.y+Math.sin(angle)*distance)/2)*2-2,4,4,'#efe0cf');}
    }else if(e.kind==='mastery-mark'){
      const r=e.radius||24;c.beginPath();c.arc(e.x,e.y,r,0,TAU);c.strokeStyle=`${color}b0`;c.lineWidth=2;c.stroke();
      for(const dx of [-1,1])for(const dy of [-1,1]){const x=Math.round((e.x+dx*r*.75)/2)*2,y=Math.round((e.y+dy*r*.75)/2)*2;rect(c,dx<0?x:x-6,y,6,2,color);rect(c,x,dy<0?y:y-6,2,6,color);}
      rect(c,Math.round(e.x/2)*2-2,Math.round(e.y/2)*2-4,4,8,`${color}a0`);
    }else if(e.kind==='mastery-ward'){
      const r=e.radius||42;c.beginPath();c.arc(e.x,e.y,r,0,TAU);c.strokeStyle=`${color}b0`;c.lineWidth=3;c.stroke();
      for(let i=0;i<4;i++){const a=i*TAU/4,x=e.x+Math.cos(a)*r,y=e.y+Math.sin(a)*r;poly(c,[[x,y-5],[x+4,y],[x,y+5],[x-4,y]],color,'#262337',1);}
    }else if(e.kind==='mastery-step'){
      this.encounterShape(c,{kind:'cone',x:e.x,y:e.y,angle:e.angle||0,length:e.range||0,halfAngle:(e.arc||0)/2},{active:true,color});
      drawPixelImpact(c,{x:e.x,y:e.y,variant:'void',impactFrame:reduced?0:Math.min(2,Math.floor((1-ratio)*3))});
    }else if(e.kind==='mastery-proc'){
      drawPixelImpact(c,{x:e.x,y:e.y-20,variant:'void',impactFrame:reduced?0:Math.min(2,Math.floor((1-ratio)*3))});
      for(let i=0;i<4;i++){const a=i*TAU/4,r=(e.radius||32)*.55;rect(c,Math.round((e.x+Math.cos(a)*r)/2)*2-2,Math.round((e.y+Math.sin(a)*r)/2)*2-2,4,4,color);}
    }
  }
  effect(c,e,game) {
    if(e.kind?.startsWith('mastery-')){c.save();c.globalAlpha=clamp((e.life||0)/(e.maxLife||e.life||1),0,1);this.masteryEffect(c,e,game);c.restore();return;}
    const ratio=clamp(e.life/(e.maxLife||1),0,1),color=e.color||'#edca86',radius=e.radius||e.size||65;c.save();c.globalAlpha=Math.min(1,ratio*2);
    if(e.kind==='text'){c.font=`700 ${e.crit?21:15}px "Inter",system-ui,sans-serif`;c.textAlign='center';c.lineWidth=3;c.strokeStyle='#213331';const y=e.y-22-(1-ratio)*28;c.strokeText(e.text||'',e.x,y);c.fillStyle=color;c.fillText(e.text||'',e.x,y);}
    else if(e.kind==='slash') {
      const halfAngle=Number.isFinite(e.arc)?clamp(e.arc,.15,TAU)/2:.95;
      c.translate(e.x,e.y);c.rotate(e.angle||0);c.beginPath();c.arc(0,0,radius,-halfAngle,halfAngle);c.strokeStyle=color;c.lineWidth=9*ratio;c.stroke();
      c.beginPath();c.arc(0,0,radius+5,-halfAngle*(.7/.95),halfAngle*(.9/.95));c.strokeStyle='#f8eccc';c.lineWidth=2*ratio;c.stroke();
    }
    else if(e.kind==='ring'){c.beginPath();c.ellipse(e.x,e.y,radius*(1-ratio*.6),radius*(1-ratio*.6),0,0,TAU);c.strokeStyle=color;c.lineWidth=4*ratio;c.stroke();glow(c,e.x,e.y,radius,`${color}15`);}
    else {drawPixelImpact(c,{x:e.x,y:e.y-10,variant:e.element||e.impactType||(e.kind==='heal'?'nature':e.aura==='moon'?'frost':e.aura==='star'?'fire':'physical'),impactFrame:game.settings?.reducedMotion?0:Math.min(2,Math.floor((1-ratio)*3))});for(let i=0;i<8;i++){const a=i*2.4,r=radius*(1-ratio)*(i%3*.2+.5);const x=Math.round((e.x+Math.cos(a)*r)/2)*2,y=Math.round((e.y+Math.sin(a)*r*.7-12*(1-ratio))/2)*2;rect(c,x,y,2+2*Math.round(ratio),2,color);}if(e.kind==='heal')glow(c,e.x,e.y-20,45,'#b4d79044');}c.restore();
  }
  flame(c,x,y,time,size=13) {
    glow(c,x,y-10,size*3,'#f6b65c35');ellipse(c,x,y,9,4,'#4c4332');poly(c,[[x-size*.45,y],[x-size*.5,y-12],[x-2,y-size*1.5-Math.sin(time*9)*4],[x+size*.25,y-13],[x+size*.5,y-6],[x+size*.3,y]],'#d99148');poly(c,[[x-3,y],[x-4,y-8],[x+1,y-size*.95],[x+5,y-5],[x+3,y]],'#ead390');
  }
  ambient(c,game) {
    const region=(this.world.regions||[]).find(r=>game.player.x>=r.x&&game.player.x<r.x+r.w&&game.player.y>=r.y&&game.player.y<r.y+r.h)||this.world.regions?.[0]||{id:'void'};
    const time=game.settings?.reducedMotion?0:game.time,elapsed=game.settings?.reducedMotion?0:this.elapsed;
    const winter=['frostgrat','permafrost'].includes(region.id),ash=['glutoede','obsidianpass','blutmark'].includes(region.id),cosmic=['mondbruch','sternensund','nexusriss'].includes(region.id);
    for(let i=0;i<30;i++){const x=this.bounds.x+noise(i*9+41)*this.bounds.w+Math.sin(elapsed*.35+i)*18,y=this.bounds.y+((noise(i*9+66)*this.bounds.h+elapsed*(winter?12:5)*(1+noise(i)))%this.bounds.h);ellipse(c,x,y,winter?1.6:ash?1.3:1,winter?1.5:ash?1.2:.7,winter?'#bbc9d85c':ash?'#ed946866':cosmic?'#ae96cd47':'#b2bab333');}
    for(const [x,y] of [[238,1205],[895,1222],[605,1585],[1960,1610],[2480,1900]])if(this.visible(x,y,90)){line(c,[[x,y+5],[x,y-23]],'#514a35',4);this.flame(c,x,y-22,time+noise(x)*5,10);}
    if(this.world.isDungeon){
      for(const room of this.world.rooms||[]){const x=room.x+35,y=room.y+70;if(this.visible(x,y,100)){line(c,[[x,y],[x,y-20]],'#716270',5);this.flame(c,x,y-20,time,11);}}
    }else{
      for(const npc of this.world.npcs||[])if(this.visible(npc.x+60,npc.y+80,90))this.flame(c,npc.x+60,npc.y+80,time+noise(npc.x)*4,13);
      if(!game.settings?.reducedMotion&&!winter&&!ash&&!cosmic)for(let i=0;i<3;i++){const x=this.bounds.x+((this.elapsed*20+i*359)% (this.bounds.w+200))-100,y=this.bounds.y+80+i*100+Math.sin(this.elapsed+i)*25;line(c,[[x-4,y],[x,y+Math.sin(this.elapsed*7)*2],[x+4,y]],'#20362d70',2);}
    }
  }
}
