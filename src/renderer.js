import { ENEMY_TYPES, QUESTS } from './catalog.js';
import { CLASSES, getClass } from './classes.js';
import { drawPixelTree, drawPixelRock, drawPixelEnemy, pixelEnemyHeight } from './pixel-world.js';

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

export class Renderer {
  constructor(canvas,world) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.world=world;
    this.worldCanvas=document.createElement('canvas');this.worldCtx=this.worldCanvas.getContext('2d',{alpha:false});
    this.camera={x:520,y:1250};this.viewport={width:1000,height:700,dpr:1};this.scale=1;
    this.elapsed=0;this.terrainChunks=new Map();this.legacyBackground=null;this.background=null;
    this.enemyPixelHeights=new Map();
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
    this.terrainChunks.clear();this.terrainStats.bytes=0;this.world=world;this.terrainWorldRef=world;
    if(!world.isDungeon&&!this.legacyBackground)this.legacyBackground=this.createTerrain();
    this.background=world.isDungeon?null:this.legacyBackground;
  }
  loadCharacterAtlas() {
    this.characterAtlas=null;this.npcAtlas=null;
    this.atlasMetadata={tileWidth:32,tileHeight:48,pixelRatio:1,columns:32,rows:8,classes:CLASSES.map(c=>c.id),directions:['south','east','north','west'],pivot:[16,40]};
    this.npcMetadata={...this.atlasMetadata,npcs:[],classes:undefined};
    if(typeof Image==='undefined')return;
    const requests=[];
    for(const [file,imageKey,metaKey,list] of [['pixel-characters','characterAtlas','atlasMetadata','classes'],['pixel-npcs','npcAtlas','npcMetadata','npcs']]){
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
    const world=this.world,size=TERRAIN_CHUNK_SIZE;
    c.save();c.translate(-x0,-y0);rect(c,x0,y0,size,size,world.isDungeon?'#282b36':'#35463c');
    const inside=(x,y)=>x>=x0-120&&x<=x0+size+120&&y>=y0-120&&y<=y0+size+120;
    const regionAt=(x,y)=>world.regions.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)||world.regions[0];
    if(world.isDungeon){
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
      for(const region of world.regions){if(region.x+region.w<x0||region.x>x0+size||region.y+region.h<y0||region.y>y0+size)continue;rect(c,region.x,region.y,region.w,region.h,region.ground||'#3f5040');}
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
      for(const region of world.regions){
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
        line(c,[a,b],'#24333348',path.width+12);line(c,[a,b],'#97845c',path.width);line(c,[a,b],'#b9a57421',path.width-10);
      }
    }
    for(const landmark of world.landmarks||[]){if(!inside(landmark.x,landmark.y)||landmark.x<3200&&landmark.y<2400)continue;
      const {x,y,r}=landmark,region=world.regions.find(a=>a.id===landmark.region),color=region?.color||'#9ab183';
      if(landmark.type==='pond'){ellipse(c,x,y,r+15,r*.58+9,'#a0a76a36');ellipse(c,x,y,r,r*.58,'#284d56');ellipse(c,x-15,y-12,r*.8,r*.4,'#63908948');for(let i=0;i<16;i++){const a=i*2.4;ellipse(c,x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.45,6,3,'#90b36f');}}
      else if(landmark.type==='circle'){ellipse(c,x,y,r,r*.67,'#b3a18416');c.beginPath();c.ellipse(x,y,r*.84,r*.56,0,0,TAU);c.strokeStyle=`${color}50`;c.lineWidth=3;c.stroke();for(let i=0;i<10;i++){const a=i*TAU/10;rounded(c,x+Math.cos(a)*r*.88-8,y+Math.sin(a)*r*.58-16,16,27,3,'#76796b','#323b45');text(c,'✧',x+Math.cos(a)*r*.88,y+Math.sin(a)*r*.58-6,11,color);}}
    }
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
    rect(c,0,0,w.width,w.height,'#303f34');
    const forest=c.createLinearGradient(0,850,1400,2300);forest.addColorStop(0,'#354b3c');forest.addColorStop(.55,'#425139');forest.addColorStop(1,'#283d34');rect(c,0,850,1550,1550,forest);
    const snow=c.createLinearGradient(0,0,0,980);snow.addColorStop(0,'#91abb0');snow.addColorStop(.6,'#778f90');snow.addColorStop(.86,'#596d65');snow.addColorStop(1,'#354b3c');rect(c,0,0,1500,990,snow);
    const marsh=c.createLinearGradient(1700,0,3200,1200);marsh.addColorStop(0,'#404b48');marsh.addColorStop(.5,'#3c4145');marsh.addColorStop(1,'#444438');rect(c,1500,0,1700,1150,marsh);
    const ash=c.createLinearGradient(1600,1180,3100,2400);ash.addColorStop(0,'#49453c');ash.addColorStop(.5,'#594034');ash.addColorStop(1,'#452f31');rect(c,1500,1100,1700,1300,ash);
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
    for(const path of w.paths) {line(c,path.points,'#23362e5c',path.width+14);line(c,path.points,'#867652',path.width);line(c,path.points,'#95835c',path.width-9);line(c,path.points,'#aa976717',path.width-20);}
    // Pebbles interrupt the paths, retaining their leading lines.
    for(const p of w.paths)for(let i=0;i<p.points.length-1;i++)for(let j=0;j<50;j++) {
      const a=p.points[i],b=p.points[i+1],t=noise(i*94+j*4),x=a[0]+(b[0]-a[0])*t+(noise(j*12+i)-.5)*p.width*.75,y=a[1]+(b[1]-a[1])*t+(noise(j*8+i+7)-.5)*p.width*.75;
      rect(c,x,y,2+noise(j+3)*4,1+noise(j+9)*2,j%3?'#71664b55':'#d1bf813e');
    }
    // The village plaza is broad enough for free movement and conversational pauses.
    ellipse(c,545,1237,257,173,'#aa987054');ellipse(c,545,1237,223,143,'#baa57633');
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
    const targetX=clamp(p.x,halfW,w.width-halfW),targetY=clamp(p.y,halfH,w.height-halfH);
    const ease=1-Math.exp(-Math.max(.001,Math.min(dt,.1))*7);camera.x+=(targetX-camera.x)*ease;camera.y+=(targetY-camera.y)*ease;
    this.camera={x:Math.round(camera.x/2)*2,y:Math.round(camera.y/2)*2};
    this.bounds={x:this.camera.x-halfW,y:this.camera.y-halfH,w:halfW*2,h:halfH*2};
    this.worldLabels=[];
    c.setTransform(1,0,0,1,0,0);rect(c,0,0,this.worldCanvas.width,this.worldCanvas.height,'#26332d');
    c.save();c.translate(this.screenOrigin.x/2,this.screenOrigin.y/2);c.scale(.5,.5);
    const shaking=game.settings?.shake!==false&&!game.settings?.reducedMotion&&game.shake>0;
    const amplitude=game.shake*16;
    const shakeX=shaking?Math.round(Math.sin(this.elapsed*71)*amplitude/2)*2:0,shakeY=shaking?Math.round(Math.cos(this.elapsed*59)*amplitude*.55/2)*2:0;
    c.translate(shakeX-this.camera.x,shakeY-this.camera.y);
    this.drawTerrain(c);
    for(const hazard of game.hazards||[])if(this.visible(hazard.x,hazard.y,(hazard.radius||80)+20))this.hazard(c,hazard,game);
    for(const portal of w.dungeonEntrances||[])if(this.visible(portal.x,portal.y,150))this.portal(c,portal,game);
    if(w.dungeonExit&&this.visible(w.dungeonExit.x,w.dungeonExit.y,140))this.portal(c,{...w.dungeonExit,exit:true},game);
    for(const plot of w.plots)if(this.visible(plot.x,plot.y))this.plot(c,plot,game.time);
    for(const s of w.shrines)if(this.visible(s.x,s.y))this.shrine(c,s,game);
    for(const object of w.puzzleObjects||[])if(this.visible(object.x,object.y,150))this.puzzleObject(c,object,game);
    for(const e of w.enemies)if(e.alive&&this.visible(e.x,e.y)&&e.phase==='windup')this.telegraph(c,e,game);
    for(const d of game.drops||[])if(this.visible(d.x,d.y))this.drop(c,d,game);
    const actors=[];
    for(const r of w.rocks)if(this.visible(r.x,r.y))actors.push({y:r.y,draw:()=>this.rock(c,r)});
    for(const s of w.structures)if(this.intersects(s,80))actors.push({y:s.type?.startsWith('dungeon_')?s.y+s.h:s.y+s.h*.87,draw:()=>this.structure(c,s,game)});
    for(const s of w.walls||[])if(!w.structures.some(other=>other.id===s.id)&&this.intersects(s,80))actors.push({y:s.y+s.h,draw:()=>this.structure(c,{...s,type:'dungeon_wall'},game)});
    for(const t of w.trees)if(this.visible(t.x,t.y,180))actors.push({y:t.y,draw:()=>this.tree(c,t,p)});
    for(const n of w.nodes)if(this.visible(n.x,n.y))actors.push({y:n.y,draw:()=>this.node(c,n,game)});
    for(const ch of w.chests)if(this.visible(ch.x,ch.y))actors.push({y:ch.y,draw:()=>this.chest(c,ch)});
    for(const npc of game.npcs||w.npcs||[])if(this.visible(npc.x,npc.y))actors.push({y:npc.y,draw:()=>this.person(c,npc,game,false)});
    for(const e of w.enemies)if(e.alive&&this.visible(e.x,e.y,190))actors.push({y:e.y,draw:()=>this.enemy(c,e,game)});
    for(const summon of game.summons||[])if(this.visible(summon.x,summon.y))actors.push({y:summon.y,draw:()=>this.summon(c,summon,game)});
    const teammates=game.partyPlayers||game.otherPlayers||[];
    const seen=new Set([p.id]);
    for(const raw of teammates){const ally=raw.player||raw;if(ally===p||ally.id&&seen.has(ally.id)||!this.visible(ally.x,ally.y))continue;seen.add(ally.id);actors.push({y:ally.y,draw:()=>this.person(c,{...ally,remote:true},game,true)});}
    actors.push({y:p.y,draw:()=>this.person(c,p,game,true)});actors.sort((a,b)=>a.y-b.y);for(const actor of actors)actor.draw();
    for(const projectile of game.projectiles||[])if(this.visible(projectile.x,projectile.y))this.projectile(c,projectile,game);
    for(const effect of game.effects||[])if(this.visible(effect.x,effect.y,200))this.effect(c,effect,game);
    this.ambient(c,game);c.restore();
    const display=this.ctx;display.setTransform(this.viewport.dpr,0,0,this.viewport.dpr,0,0);display.imageSmoothingEnabled=false;
    display.drawImage(this.worldCanvas,0,0,this.worldCanvas.width*2,this.worldCanvas.height*2);
    display.save();display.translate(this.screenOrigin.x+shakeX-this.camera.x,this.screenOrigin.y+shakeY-this.camera.y);
    for(const label of this.worldLabels)this.drawLabel(display,...label);
    display.restore();this.worldLabels=null;
    // Restrained lens shading focuses the eye without obscuring combat.
    const vignette=display.createRadialGradient(this.viewport.width/2,this.viewport.height*.46,this.viewport.height*.23,this.viewport.width/2,this.viewport.height/2,this.viewport.width*.65);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#101c2066');rect(display,0,0,this.viewport.width,this.viewport.height,vignette);
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
  hazard(c,h,game) {
    const radius=h.radius||100,color=h.color||'#df7568',pending=(h.windup||0)>0||h.pending;
    const alpha=pending ? .11 : .2;ellipse(c,h.x,h.y,radius,radius,`${color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`);
    c.beginPath();c.arc(h.x,h.y,radius,0,TAU);c.strokeStyle=`${color}b0`;c.lineWidth=2;c.stroke();
    if(!game.settings?.reducedMotion)for(let i=0;i<6;i++){const a=i*TAU/6+game.time*.2;ellipse(c,h.x+Math.cos(a)*radius*.72,h.y+Math.sin(a)*radius*.72,3,3,color);}
    if(h.kind==='heal'||h.healing)this.label(c,'Heilkreis',h.x,h.y-radius-12,'#a3d8af',9);
  }
  summon(c,s,game) {
    c.save();c.translate(s.x,s.y);const bob=Math.sin(game.time*4+s.x)*4,color=s.color||'#bda3e2';glow(c,0,-12,35,`${color}26`);ellipse(c,0,8,16,5,'#17263b55');
    poly(c,[[-16,6],[-14,-21-bob],[-3,-32-bob],[11,-23-bob],[16,7],[7,0],[0,9],[-7,0]],`${color}8a`,'#454166',2);ellipse(c,-5,-19-bob,2,2,'#f5e6cb');ellipse(c,5,-19-bob,2,2,'#f5e6cb');c.restore();
  }
  tree(c,t,p) {
    c.save();if(Math.hypot(p.x-t.x,p.y-t.y+55)<64*t.scale&&p.y<t.y)c.globalAlpha=.48;
    drawPixelTree(c,t,this.elapsed);c.restore();
  }
  rock(c,r) {drawPixelRock(c,r);}
  structure(c,s,game) {
    if(s.type==='puzzle_crate')return;
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
    c.save();c.translate(s.x,s.y);const {w,h}=s;ellipse(c,w*.59,h*.85,w*.64,h*.18,'#1c2c2970');
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
      const tall=s.type==='tower';rect(c,8,h*.33,w-16,h*.57,'#676c62');poly(c,[[8,h*.33],[21,12],[w-20,tall?0:23],[w-8,h*.3]],'#8c8d78','#37483e',3);
      for(let y=h*.34;y<h*.85;y+=17){line(c,[[10,y],[w-10,y]],'#3f50494d',1);for(let x=16;x<w-16;x+=29)line(c,[[x+(Math.floor(y/17)%2?12:0),y],[x+(Math.floor(y/17)%2?12:0),y+16]],'#3f504938',1);}
      rounded(c,w*.37,h*.55,w*.26,h*.37,15,'#243e37');rect(c,w*.17,h*.42,12,17,'#2a4140');rect(c,w*.69,h*.39,12,17,'#2a4140');line(c,[[w*.37,h*.9],[w*.55,h*.5]],'#688849',4);
    } else if(s.type==='camp') {
      poly(c,[[-8,h*.9],[w*.5,-8],[w+8,h*.9]],'#b39469','#493d32',2);poly(c,[[w*.5,-8],[w*.64,h*.9],[w+8,h*.9]],'#856a4d');poly(c,[[w*.5,h*.31],[w*.73,h*.9],[w*.33,h*.9]],'#493f35');line(c,[[w*.5,-8],[w*.5,h*.31]],'#e2c083',2);
    } else {
      const inn=s.type==='inn',smith=s.type==='smith',roof=smith?'#647778':inn?'#937050':'#727552';
      rect(c,13,h*.35,w-26,h*.54,'#b2a381');rect(c,w*.75,h*.35,w*.16,h*.54,'#807c61');rect(c,12,h*.85,w-24,12,'#6c6f57');
      for(const x of [17,w*.37,w*.69,w-20])rect(c,x,h*.36,6,h*.48,'#68674c');rect(c,17,h*.53,w-36,5,'#716c4e');
      rounded(c,w*.41,h*.57,w*.2,h*.3,13,'#454b3b','#847953');line(c,[[w*.5,h*.62],[w*.5,h*.84]],'#88794f',2);ellipse(c,w*.55,h*.75,2,2,'#d2b26a');
      for(const x of [w*.17,w*.7]){rounded(c,x,h*.55,23,24,2,'#d8af60','#5d6147');rect(c,x+10,h*.55,3,24,'#6c6849');rect(c,x,h*.65,23,3,'#6c6849');glow(c,x+11,h*.66,28,'#ffd3751c');}
      poly(c,[[-10,h*.39],[w*.38,-10],[w+9,h*.2],[w+10,h*.42]],roof,'#3b4333',3);
      poly(c,[[-10,h*.39],[w*.38,-10],[w*.48,h*.22],[w+10,h*.42]],roof);poly(c,[[w*.38,-10],[w+9,h*.2],[w+10,h*.42],[w*.48,h*.22]],smith?'#4d6164':inn?'#74583f':'#575f43');
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
    const facing=typeof p.face==='number'?p.face:Math.PI/2,walking=p.walking&&!game.settings?.reducedMotion;
    rect(c,-16,2,32,6,'#142c2c80');rect(c,-10,0,20,10,'#142c2c80');
    if(hero&&((p.invulnerable||0)>0||(p.hitUntil||0)>game.time)&&Math.floor(game.time*16)%2)c.globalAlpha=.48;
    const meta=hero?this.atlasMetadata:this.npcMetadata,atlas=hero?this.characterAtlas:this.npcAtlas;
    const row=hero?meta.classes.indexOf(getClass(p.classId).id):meta.npcs.indexOf(p.id);
    if(atlas&&row>=0&&atlas.naturalWidth===1024&&atlas.naturalHeight>=(row+1)*48){
      const direction=Math.abs(Math.cos(facing))>Math.abs(Math.sin(facing))?(Math.cos(facing)>0?1:3):(Math.sin(facing)>0?0:2);
      const attackEnd=Math.max(p.attackUntil||0,p.castUntil||0),attacking=attackEnd>game.time;
      const pose=p.downed||p.dead?7:attacking?(attackEnd-game.time>.11?5:6):walking?1+Math.floor(game.time*9)%4:0;
      const [px,py]=meta.pivot||[16,40];
      c.imageSmoothingEnabled=false;c.drawImage(atlas,(direction*8+pose)*32,row*48,32,48,-px*2,-py*2,64,96);
    }else{
      // A small native-pixel silhouette is visible while the atlas is loading.
      const color=hero?getClass(p.classId).color:p.color||'#8d9c78';
      rect(c,-12,-38,24,34,'#182d34');rect(c,-10,-36,20,24,color);rect(c,-10,-12,20,4,'#72573e');
      rect(c,-8,-58,16,20,'#e2b989');rect(c,-10,-62,20,8,'#5b4636');rect(c,-8,-6,6,12,'#25323a');rect(c,2,-6,6,12,'#25323a');
      if(Math.sin(facing)>=0){rect(c,-4,-50,2,4,'#182d34');rect(c,4,-50,2,4,'#182d34');}
    }
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
    const color=getClass(p.classId).color;
    if(p.shield>0&&(p.shieldUntil||Infinity)>game.time){c.beginPath();c.ellipse(p.x,p.y-23,29,43,0,0,TAU);c.strokeStyle=`${color}90`;c.lineWidth=2;c.stroke();glow(c,p.x,p.y-24,43,`${color}14`);}
    if(p.downed||p.dead){c.beginPath();c.ellipse(p.x,p.y,25,15,0,0,TAU);c.strokeStyle='#e19b887a';c.lineWidth=2;c.stroke();this.label(c,`${p.name||'Gefährte'} · Am Boden`,p.x,p.y-35,'#ebaf9c',10);}
    else if(p.remote){this.label(c,p.name||getClass(p.classId).name,p.x,p.y-76,color,10);const fraction=p.maxHp?p.hp/p.maxHp:p.hpRatio??1;rounded(c,p.x-22,p.y-63,44,4,2,'#192a37');rounded(c,p.x-22,p.y-63,44*clamp(fraction,0,1),4,2,'#91c39b');}
    if((p.castUntil||0)>game.time){for(let i=0;i<3;i++){const a=game.time*4+i*TAU/3;ellipse(c,p.x+Math.cos(a)*26,p.y-23+Math.sin(a)*16,3,3,color);}}
  }
  label(c,value,x,y,color='#e4dab8',size=11) {
    if(c===this.worldCtx&&this.worldLabels){this.worldLabels.push([value,x,y,color,size]);return;}
    this.drawLabel(c,value,x,y,color,size);
  }
  drawLabel(c,value,x,y,color='#e4dab8',size=11) {
    c.font=`500 ${size}px "Inter",system-ui,sans-serif`;const width=c.measureText(value).width+14;
    rounded(c,x-width/2,y-8,width,17,4,'#172b2be0');text(c,value,x,y,size,color);
  }
  enemy(c,e,game) {
    const def=ENEMY_TYPES[e.type]||{},boss=def.boss;
    c.save();if((e.hitUntil||0)>game.time)c.globalAlpha=.65;
    drawPixelEnemy(c,e,game.settings?.reducedMotion?0:game.time);c.restore();
    if(!this.enemyPixelHeights.has(e.type))this.enemyPixelHeights.set(e.type,pixelEnemyHeight(e.type));
    if(e.shielded){glow(c,e.x,e.y-38,78,'#b5b3ee12');c.beginPath();c.ellipse(e.x,e.y-34,61,75,0,0,TAU);c.strokeStyle='#c4b5eeaa';c.lineWidth=3;c.stroke();for(let i=0;i<4;i++){const a=game.time*.3+i*TAU/4;text(c,'◈',e.x+Math.cos(a)*61,e.y-34+Math.sin(a)*75,13,'#ded0f0');}}
    const dist=Math.hypot(e.x-game.player.x,e.y-game.player.y);
    if(dist<500&&(e.hp<e.maxHp||e.aggro||boss)) {
      const width=boss?94:43,top=e.y-this.enemyPixelHeights.get(e.type)-12;rounded(c,e.x-width/2,top,width,5,2,'#1d2c29');rounded(c,e.x-width/2,top,width*clamp(e.hp/e.maxHp,0,1),5,2,boss?'#d3a765':'#b3866e');
      if(boss||dist<170)this.label(c,`${def.name||e.type}${boss?'':' · '+(e.level||def.level||1)}`,e.x,top-15,boss?'#d9bd83':'#c4c7ad',boss?11:9);
      if(boss&&e.shielded)this.label(c,`Schild · ${def.mechanics?.shield?.plates||3} Quellsiegel gemeinsam halten`,e.x,e.y+30,'#cebbea',10);
      else if(boss&&e.mechanicCycle)this.label(c,e.mechanicCycle==='stack'?`Sternfall · ${e.stackRequired||2} zusammen`:'Nova · Abstand halten',e.x,e.y+30,e.mechanicCycle==='stack'?'#afd7d8':'#e0aa90',10);
      if(e.enraged)this.label(c,'RASEREI',e.x,e.y+51,'#ef9788',11);
    }
  }
  telegraph(c,e,game) {
    const def=ENEMY_TYPES[e.type]||{},r=e.telegraphRadius||(def.boss?105:62),progress=clamp(1-e.attackTimer/(e.telegraphDuration||(def.boss?1.1:.55)),0,1);
    const centers=e.telegraphMechanic==='spread'?(e.spreadTargets||[]):[{x:e.telegraphX??e.x,y:e.telegraphY??e.y}];
    const radius=e.telegraphMechanic==='spread'?75:r,color=e.telegraphMechanic==='stack'?'#9cd7dd':'#e7967d';
    for(const center of centers){
      if(!this.visible(center.x,center.y,radius+30))continue;
      if(e.telegraphShape==='cone'){
        const angle=e.telegraphAngle??e.face??0,arc=e.telegraphArc||Math.PI/2;c.beginPath();c.moveTo(center.x,center.y);c.arc(center.x,center.y,radius,angle-arc/2,angle+arc/2);c.closePath();c.fillStyle=`${color}30`;c.fill();c.strokeStyle=`${color}aa`;c.lineWidth=2;c.stroke();
      }else{
        ellipse(c,center.x,center.y,radius,radius,`${color}${Math.round(32+18*Math.sin(this.elapsed*12)).toString(16).padStart(2,'0')}`);
        c.beginPath();c.ellipse(center.x,center.y,radius,radius,0,0,TAU);c.strokeStyle=`${color}aa`;c.lineWidth=2;c.stroke();
        c.beginPath();c.ellipse(center.x,center.y,radius,radius,0,-Math.PI/2,-Math.PI/2+TAU*progress);c.strokeStyle='#f8e3b8';c.lineWidth=3;c.stroke();
      }
      if(e.telegraphMechanic)this.label(c,e.telegraphMechanic==='stack'?`Zusammen · mindestens ${e.stackRequired||2}`:'Auseinander · Fläche verlassen',center.x,center.y-radius-18,color,10);
    }
  }
  drop(c,d,game) {
    const item=d.loot||game.item?.(d.item),rarity=item?.rarity;
    const color=d.gold?'#e4bd6c':({common:'#d4d1bb',uncommon:'#98bf83',rare:'#83bbe3',epic:'#c299e5',legendary:'#edb477',mythic:'#eca4b1'})[rarity]||'#9bbbde';glow(c,d.x,d.y-7,rarity==='legendary'?44:25,`${color}24`);ellipse(c,d.x,d.y+4,9,3,'#182d2c60');
    if(d.gold){ellipse(c,d.x,d.y-4,5,4,'#d8b970');ellipse(c,d.x,d.y-7,5,4,'#e6cb85');}else poly(c,[[d.x,d.y-16],[d.x-7,d.y-7],[d.x,d.y+1],[d.x+7,d.y-7]],color,'#27464e',1);
    const tall=['epic','legendary','mythic'].includes(rarity);line(c,[[d.x,d.y-18],[d.x,d.y-(tall?80:39)-Math.sin(game.time*2)*3]],`${color}70`,tall?3:2);
    if(item?.name&&Math.hypot(d.x-game.player.x,d.y-game.player.y)<180)this.label(c,item.name,d.x,d.y-(tall?91:50),color,10);
  }
  projectile(c,p,game) {
    const hostile=p.hostile||p.owner==='enemy'||p.type==='enemy',color=p.color||(hostile?'#b396db':'#edb963');c.save();c.translate(p.x,p.y);c.rotate(p.angle||0);glow(c,0,0,28,`${color}40`);poly(c,[[-28,0],[-10,-6],[4,-4],[9,0],[4,4],[-10,6]],`${color}9b`);ellipse(c,0,0,6,4,hostile?'#e0c7ef':'#ffedb2');c.restore();
  }
  effect(c,e,game) {
    const ratio=clamp(e.life/(e.maxLife||1),0,1),color=e.color||'#edca86',radius=e.radius||e.size||65;c.save();c.globalAlpha=Math.min(1,ratio*2);
    if(e.kind==='text'){c.font=`700 ${e.crit?21:15}px "Inter",system-ui,sans-serif`;c.textAlign='center';c.lineWidth=3;c.strokeStyle='#213331';const y=e.y-22-(1-ratio)*28;c.strokeText(e.text||'',e.x,y);c.fillStyle=color;c.fillText(e.text||'',e.x,y);}
    else if(e.kind==='slash') {c.translate(e.x,e.y);c.rotate(e.angle||0);c.beginPath();c.arc(0,0,radius,-.95,.95);c.strokeStyle=color;c.lineWidth=9*ratio;c.stroke();c.beginPath();c.arc(0,0,radius+5,-.7,.9);c.strokeStyle='#f8eccc';c.lineWidth=2*ratio;c.stroke();}
    else if(e.kind==='ring'){c.beginPath();c.ellipse(e.x,e.y,radius*(1-ratio*.6),radius*(1-ratio*.6),0,0,TAU);c.strokeStyle=color;c.lineWidth=4*ratio;c.stroke();glow(c,e.x,e.y,radius,`${color}15`);}
    else {for(let i=0;i<12;i++){const a=i*2.4,r=radius*(1-ratio)*(i%3*.2+.5);ellipse(c,e.x+Math.cos(a)*r,e.y+Math.sin(a)*r*.7-12*(1-ratio),2+ratio*2,1+ratio*2,color);}if(e.kind==='heal')glow(c,e.x,e.y-20,45,'#b4d79044');}c.restore();
  }
  flame(c,x,y,time,size=13) {
    glow(c,x,y-10,size*3,'#f6b65c35');ellipse(c,x,y,9,4,'#4c4332');poly(c,[[x-size*.45,y],[x-size*.5,y-12],[x-2,y-size*1.5-Math.sin(time*9)*4],[x+size*.25,y-13],[x+size*.5,y-6],[x+size*.3,y]],'#d99148');poly(c,[[x-3,y],[x-4,y-8],[x+1,y-size*.95],[x+5,y-5],[x+3,y]],'#ead390');
  }
  ambient(c,game) {
    const region=this.world.regions.find(r=>game.player.x>=r.x&&game.player.x<r.x+r.w&&game.player.y>=r.y&&game.player.y<r.y+r.h)||this.world.regions[0];
    const winter=['frostgrat','permafrost'].includes(region.id),ash=['glutoede','obsidianpass','blutmark'].includes(region.id),cosmic=['mondbruch','sternensund','nexusriss'].includes(region.id);
    for(let i=0;i<30;i++){const x=this.bounds.x+noise(i*9+41)*this.bounds.w+Math.sin(this.elapsed*.35+i)*18,y=this.bounds.y+((noise(i*9+66)*this.bounds.h+this.elapsed*(winter?12:5)*(1+noise(i)))%this.bounds.h);ellipse(c,x,y,winter?1.6:ash?1.3:1,winter?1.5:ash?1.2:.7,winter?'#d1e1d174':ash?'#e4ad6866':'#dddb9a47');}
    for(const [x,y] of [[238,1205],[895,1222],[605,1585],[1960,1610],[2480,1900]])if(this.visible(x,y,90)){line(c,[[x,y+5],[x,y-23]],'#514a35',4);this.flame(c,x,y-22,game.time+noise(x)*5,10);}
    if(this.world.isDungeon){
      for(const room of this.world.rooms||[]){const x=room.x+35,y=room.y+70;if(this.visible(x,y,100)){line(c,[[x,y],[x,y-20]],'#716270',5);this.flame(c,x,y-20,game.time,11);}}
    }else{
      for(const npc of this.world.npcs||[])if(this.visible(npc.x+60,npc.y+80,90))this.flame(c,npc.x+60,npc.y+80,game.time+noise(npc.x)*4,13);
      if(!game.settings?.reducedMotion&&!winter&&!ash&&!cosmic)for(let i=0;i<3;i++){const x=this.bounds.x+((this.elapsed*20+i*359)% (this.bounds.w+200))-100,y=this.bounds.y+80+i*100+Math.sin(this.elapsed+i)*25;line(c,[[x-4,y],[x,y+Math.sin(this.elapsed*7)*2],[x+4,y]],'#20362d70',2);}
    }
  }
}
