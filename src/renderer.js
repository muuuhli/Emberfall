import { ENEMY_TYPES, QUESTS } from './content.js';

// Every mark is original canvas art. Terrain is cached; actors remain animated.
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
    this.camera={x:520,y:1250};this.viewport={width:1000,height:700,dpr:1};this.scale=1;
    this.elapsed=0;this.background=this.createTerrain();this.motes=Array.from({length:45},(_,i)=>({x:noise(i+44)*world.width,y:noise(i+322)*world.height,size:1+noise(i+67)*2,speed:9+noise(i+128)*18}));
    this.resize();
    if(typeof ResizeObserver!=='undefined') {this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement||canvas);}
  }
  resize() {
    const bounds=this.canvas.getBoundingClientRect();
    const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height),dpr=Math.min(window.devicePixelRatio||1,2);
    this.viewport={width,height,dpr};this.scale=clamp(height/700,.84,1.12);
    this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);
    this.ctx.imageSmoothingEnabled=true;
  }
  screenToWorld(clientX,clientY) {
    const r=this.canvas.getBoundingClientRect();
    return {x:(clientX-r.left-this.viewport.width/2)/this.scale+this.camera.x,y:(clientY-r.top-this.viewport.height/2)/this.scale+this.camera.y};
  }
  worldToScreen(x,y) {return {x:(x-this.camera.x)*this.scale+this.viewport.width/2,y:(y-this.camera.y)*this.scale+this.viewport.height/2};}
  visible(x,y,margin=100) {return x>this.bounds.x-margin&&x<this.bounds.x+this.bounds.w+margin&&y>this.bounds.y-margin&&y<this.bounds.y+this.bounds.h+margin;}
  createTerrain() {
    const bg=document.createElement('canvas');bg.width=this.world.width;bg.height=this.world.height;
    const c=bg.getContext('2d');const w=this.world;
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
    this.elapsed+=Math.min(dt,.05);const c=this.ctx,p=game.player,w=game.world||this.world;
    const camera=game.camera||(game.camera={x:p.x,y:p.y});
    const halfW=this.viewport.width/(2*this.scale),halfH=this.viewport.height/(2*this.scale);
    const targetX=clamp(p.x,halfW,w.width-halfW),targetY=clamp(p.y,halfH,w.height-halfH);
    const ease=1-Math.exp(-Math.max(.001,Math.min(dt,.1))*7);camera.x+=(targetX-camera.x)*ease;camera.y+=(targetY-camera.y)*ease;this.camera=camera;
    this.bounds={x:camera.x-halfW,y:camera.y-halfH,w:halfW*2,h:halfH*2};
    c.setTransform(this.viewport.dpr,0,0,this.viewport.dpr,0,0);rect(c,0,0,this.viewport.width,this.viewport.height,'#26332d');
    c.save();c.translate(this.viewport.width/2,this.viewport.height/2);
    if(game.settings?.shake!==false&&!game.settings?.reducedMotion&&game.shake>0)c.translate(Math.sin(this.elapsed*71)*game.shake,Math.cos(this.elapsed*59)*game.shake*.55);
    c.scale(this.scale,this.scale);c.translate(-camera.x,-camera.y);
    c.drawImage(this.background,Math.max(0,this.bounds.x-4),Math.max(0,this.bounds.y-4),Math.min(w.width,this.bounds.w+8),Math.min(w.height,this.bounds.h+8),Math.max(0,this.bounds.x-4),Math.max(0,this.bounds.y-4),Math.min(w.width,this.bounds.w+8),Math.min(w.height,this.bounds.h+8));
    for(const plot of w.plots)if(this.visible(plot.x,plot.y))this.plot(c,plot,game.time);
    for(const s of w.shrines)if(this.visible(s.x,s.y))this.shrine(c,s,game);
    for(const e of w.enemies)if(e.alive&&this.visible(e.x,e.y)&&e.phase==='windup')this.telegraph(c,e,game);
    for(const d of game.drops||[])if(this.visible(d.x,d.y))this.drop(c,d,game);
    const actors=[];
    for(const r of w.rocks)if(this.visible(r.x,r.y))actors.push({y:r.y,draw:()=>this.rock(c,r)});
    for(const s of w.structures)if(this.visible(s.x+s.w/2,s.y+s.h/2,220))actors.push({y:s.y+s.h*.87,draw:()=>this.structure(c,s,game)});
    for(const t of w.trees)if(this.visible(t.x,t.y,145))actors.push({y:t.y,draw:()=>this.tree(c,t,p)});
    for(const n of w.nodes)if(this.visible(n.x,n.y))actors.push({y:n.y,draw:()=>this.node(c,n,game)});
    for(const ch of w.chests)if(this.visible(ch.x,ch.y))actors.push({y:ch.y,draw:()=>this.chest(c,ch)});
    for(const npc of game.npcs||w.npcs||[])if(this.visible(npc.x,npc.y))actors.push({y:npc.y,draw:()=>this.person(c,npc,game,false)});
    for(const e of w.enemies)if(e.alive&&this.visible(e.x,e.y))actors.push({y:e.y,draw:()=>this.enemy(c,e,game)});
    actors.push({y:p.y,draw:()=>this.person(c,p,game,true)});actors.sort((a,b)=>a.y-b.y);for(const actor of actors)actor.draw();
    for(const projectile of game.projectiles||[])if(this.visible(projectile.x,projectile.y))this.projectile(c,projectile,game);
    for(const effect of game.effects||[])if(this.visible(effect.x,effect.y,200))this.effect(c,effect,game);
    this.ambient(c,game);c.restore();
    // Restrained lens shading focuses the eye without obscuring combat.
    const vignette=c.createRadialGradient(this.viewport.width/2,this.viewport.height*.46,this.viewport.height*.23,this.viewport.width/2,this.viewport.height/2,this.viewport.width*.65);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#101c2066');rect(c,0,0,this.viewport.width,this.viewport.height,vignette);
  }
  tree(c,t,p) {
    c.save();c.translate(t.x,t.y);c.scale(t.scale,t.scale);
    ellipse(c,13,7,38,14,'#14292766');
    if(Math.hypot(p.x-t.x,p.y-t.y+55)<64*t.scale&&p.y<t.y)c.globalAlpha=.48;
    if(t.variant==='dead'||t.variant==='burnt') {
      const burnt=t.variant==='burnt';poly(c,[[-8,4],[-6,-37],[-10,-75],[0,-105],[4,-61],[8,-27],[9,5]],burnt?'#3e332f':'#56534b','#252e2b',2);
      line(c,[[-3,-45],[-29,-66],[-33,-90]],burnt?'#433530':'#646054',8);line(c,[[3,-61],[29,-87],[36,-101]],'#524839',7);line(c,[[-17,-59],[-30,-50],[-47,-63]],'#61594b',4);line(c,[[6,-36],[33,-51],[44,-72]],'#61594b',5);
      line(c,[[2,0],[1,-37]],'#827054',2);if(burnt){ellipse(c,6,-34,3,2,'#e27f46');ellipse(c,-8,-76,2,2,'#bb6441');}
    } else if(t.variant==='pine') {
      rect(c,-7,-20,14,24,'#5d6454');poly(c,[[-48,-21],[0,-115],[49,-21]],'#365854','#243d3d',2);
      for(let i=0;i<3;i++){const y=-91+i*25,width=22+i*13;poly(c,[[-width,y+28],[0,y-14],[width,y+28]],i%2?'#57776b':'#486d63');poly(c,[[-width,y+21],[0,y-15],[width-9,y+12],[6,y+7],[-10,y+14]],'#c2d4c1');line(c,[[-width+7,y+22],[-7,y+19]],'#91b8a7',2);}
    } else {
      poly(c,[[-10,6],[-6,-54],[6,-65],[11,5]],'#786e4c','#344432',2);line(c,[[0,-22],[-20,-51]],'#6b6346',8);line(c,[[0,-27],[25,-64]],'#7d724f',7);line(c,[[3,0],[3,-35]],'#b49b65',3);
      ellipse(c,4,-62,48,45,'#1e4438');ellipse(c,-26,-57,29,28,'#34533a');ellipse(c,31,-59,27,28,'#365a3e');ellipse(c,-8,-88,35,31,'#4c693f');ellipse(c,19,-81,33,28,'#4c7044');ellipse(c,-13,-93,23,19,'#6e8448');ellipse(c,24,-90,22,17,'#6b844d');
      for(let i=0;i<21;i++){const a=i*2.4,r=12+noise(i+t.x)*29,x=Math.cos(a)*r,y=-72+Math.sin(a)*r*.9;rounded(c,x-5,y-2,8,4,2,i%3?'#8b955b5c':'#a8a76466');}
    }
    c.restore();
  }
  rock(c,r) {
    c.save();c.translate(r.x,r.y);c.scale(r.scale,r.scale);ellipse(c,4,7,27,11,'#1b2e2c70');
    const icy=r.variant==='ice';poly(c,[[-24,3],[-20,-17],[-6,-28],[14,-25],[28,-8],[24,7],[2,13]],icy?'#9aaeb0':'#646b60','#303d36',2);
    poly(c,[[-20,-17],[-6,-28],[14,-25],[9,-8],[-10,-5]],icy?'#c6d4ca':'#889083');poly(c,[[9,-8],[14,-25],[28,-8],[24,7],[2,13]],icy?'#7f9a9e':'#4e5c55');line(c,[[-13,-3],[-4,-5],[0,5]],'#a4af9133',2);c.restore();
  }
  structure(c,s,game) {
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
    if(Math.hypot(s.x-game.player.x,s.y-game.player.y)<155)text(c,s.name,0,31,10,'#c1c8a1');c.restore();
  }
  person(c,p,game,hero) {
    c.save();c.translate(p.x,p.y);const facing=typeof p.face==='number'?p.face:Math.PI/2;
    const walking=hero&&p.walking&&!game.settings?.reducedMotion,bob=walking?Math.sin(game.time*15)*1.5:Math.sin(game.time*2)*.35;
    ellipse(c,3,5,hero?17:14,7,'#0f262881');
    if(hero&&((p.invulnerable||0)>0||(p.hitUntil||0)>game.time)&&Math.floor(game.time*16)%2)c.globalAlpha=.48;
    const back=hero&&facing<0&&facing>-Math.PI,cloak=hero?'#4d6570':p.color||'#8d9c78';
    const stride=walking?Math.sin(game.time*15)*4:0;
    rounded(c,-9,-5+stride,7,11,2,'#4c4a39');rounded(c,3,-5-stride,7,11,2,'#4c4a39');rect(c,-9,2+stride,7,4,'#222f2d');rect(c,3,2-stride,7,4,'#222f2d');
    poly(c,[[-12,-32],[-15,-5],[1,-1],[15,-6],[10,-31]],cloak,'#263f3e',2);poly(c,[[2,-30],[13,-8],[2,-3]],hero?'#354e5d':'#697b6555');
    rounded(c,-10,-28,20,20,5,hero?'#677d7b':cloak);rect(c,-10,-11,20,4,'#453e31');rounded(c,-3,-11,6,5,1,'#c9b172');
    rounded(c,-15,-27+bob,7,15,3,'#b2a68a');rounded(c,9,-26+bob,7,15,3,'#b9af91');
    if(hero){poly(c,[[-12,-31],[-16,-26],[-9,-20],[-7,-28]],'#c8c4a0');poly(c,[[8,-29],[17,-27],[16,-20],[8,-20]],'#9cae9d');}
    c.translate(0,bob);rounded(c,-9,-47,18,20,7,'#d0b78f','#4b5543');
    poly(c,[[-10,-36],[-11,-46],[-5,-51],[7,-51],[11,-44],[8,-37],[4,-44],[-3,-42]],hero?'#574b36':'#70624a');
    if(!back){rect(c,-5,-37,2,3,'#3e4235');rect(c,4,-37,2,3,'#3e4235');line(c,[[-2,-31],[3,-31]],'#a17b5a',1);}
    if(hero){poly(c,[[-10,-28],[9,-28],[12,-24],[0,-22],[-13,-23]],'#d9b660');poly(c,[[-11,-25],[-25,-16-bob],[-22,-11],[-9,-21]],'#b68b43');rect(c,-7,-27,13,2,'#ead492');
      // A small bright pommel, tapering steel blade and round shield make the hero legible.
      c.save();c.translate(15,-15);const attacking=(p.attackUntil||0)>game.time,angle=attacking?facing-.7+Math.sin((p.attackUntil-game.time)*9)*.75:facing-.2;c.rotate(angle);line(c,[[-3,0],[32,0]],'#233a3d',7);poly(c,[[2,-3],[27,-3],[36,0],[27,3],[2,3]],'#c7d5c6');line(c,[[6,-1],[29,-1]],'#f1edcd',1.5);line(c,[[2,-8],[2,8]],'#d7b96d',3);line(c,[[-7,0],[0,0]],'#796948',4);ellipse(c,-8,0,3,3,'#dbc079');c.restore();
      ellipse(c,-15,-14,11,13,'#2c4545');ellipse(c,-15,-15,9,11,'#9aa68a');ellipse(c,-15,-15,6,8,'#536d69');poly(c,[[-15,-22],[-19,-15],[-15,-9],[-11,-15]],'#cdbb76');
      if((p.dashUntil||0)>game.time){glow(c,0,-18,36,'#b3d7a632');line(c,[[-Math.cos(p.dashAngle??facing)*34,10-Math.sin(p.dashAngle??facing)*34],[-Math.cos(p.dashAngle??facing)*12,10-Math.sin(p.dashAngle??facing)*12]],'#decca455',4);}
    }
    c.restore();
    if(!hero&&Math.hypot(p.x-game.player.x,p.y-game.player.y)<360){
      const relevant=QUESTS.filter(q=>q.giver===p.id);let marker='';
      for(const q of relevant){const qstate=game.questState?.[q.id];if(qstate?.ready||qstate?.status==='ready'){marker='?';break;}if(!qstate||qstate?.status==='available'){if(!q.prerequisite||game.questState?.[q.prerequisite]?.status==='done'||game.completedQuests?.includes(q.prerequisite)){marker='!';break;}}}
      if(marker){glow(c,p.x,p.y-76,17,'#efd68b35');text(c,marker,p.x,p.y-77+Math.sin(game.time*2+p.x)*2,22,'#ebcf86');}
      this.label(c,p.name,p.x,p.y-60,'#d7d5af',10);
    }
  }
  label(c,value,x,y,color='#e4dab8',size=11) {
    c.font=`500 ${size}px "Inter",system-ui,sans-serif`;const width=c.measureText(value).width+14;
    rounded(c,x-width/2,y-8,width,17,4,'#172b2be0');text(c,value,x,y,size,color);
  }
  enemy(c,e,game) {
    const def=ENEMY_TYPES[e.type]||{},boss=def.boss;const tint=def.color||'#9aaf85';
    c.save();c.translate(e.x,e.y);const pulse=Math.sin(game.time*4+e.x)*1.5;ellipse(c,4,6,boss?36:20,boss?13:8,'#16252d88');
    if((e.hitUntil||0)>game.time)c.globalAlpha=.65;
    if(e.type==='wolf'||e.type==='frostwolf') {
      const cold=e.type==='frostwolf',side=(e.face||0)>Math.PI/2||(e.face||0)<-Math.PI/2?-1:1;c.scale(side,1);
      const fur=cold?'#b5cecf':'#888e7a',dark=cold?'#789998':'#59655a';
      poly(c,[[-25,-10],[-16,-8],[-10,-18],[8,-18],[17,-8],[10,0],[-13,0],[-20,-4]],fur,'#304841',2);
      poly(c,[[-22,-8],[-34,-16],[-31,-7],[-23,-2]],dark);line(c,[[-10,0],[-14,7]],dark,5);line(c,[[7,-1],[11,7]],dark,5);
      poly(c,[[10,-15],[11,-32],[18,-26],[25,-30],[29,-17],[39,-9],[26,-5],[17,-7]],fur,'#314742',2);
      poly(c,[[10,-15],[4,-23],[14,-27],[20,-11]],dark);rect(c,26,-17,3,2,cold?'#c1f2e3':'#e8cd76');ellipse(c,37,-10,3,2,'#2e3c36');line(c,[[-9,-15],[3,-16]],cold?'#e3ece0':'#b6b49a',3);
    } else if(e.type==='slime') {
      ellipse(c,0,-8-pulse,23,19,tint);ellipse(c,-7,-14-pulse,14,10,'#bacb8a77');poly(c,[[-15,-24],[-17,-35],[-6,-27],[5,-37],[8,-25],[23,-30],[18,-19]],'#607d50');rect(c,-7,-9-pulse,4,4,'#314b39');rect(c,6,-9-pulse,4,4,'#314b39');ellipse(c,-12,-17,3,2,'#e1e0a2');
    } else if(e.type==='wraith') {
      glow(c,0,-18,38,'#9987c123');poly(c,[[-20,5],[-16,-32],[-7,-47],[9,-48],[21,-32],[22,3],[10,-2],[3,8],[-7,0]],'#675781b0','#373c5566',2);poly(c,[[-11,-31],[-6,-42],[9,-42],[14,-30]],'#292f3b');rect(c,-6,-33,4,3,'#d2b3ed');rect(c,6,-33,4,3,'#d2b3ed');poly(c,[[-15,-17],[-32,-8],[-25,-4],[-9,-6]],'#a591c7a0');poly(c,[[14,-16],[32,-7],[23,0],[10,-6]],'#a591c7a0');line(c,[[-7,-20],[-2,-10],[4,-17]],'#c1a6d343',2);
    } else if(e.type==='imp'||e.type==='emberlord') {
      const big=boss?1.8:1;c.scale(big,big);glow(c,0,-18,42,boss?'#c06d3b33':'#c06d3b14');
      poly(c,[[-12,-30],[-17,-3],[-6,2],[8,2],[17,-4],[13,-31]],boss?'#784232':'#b76643','#3e3430',2);poly(c,[[-13,-27],[-28,-34],[-37,-17],[-28,-22],[-23,-11],[-16,-16]],'#684938');poly(c,[[13,-27],[28,-34],[37,-17],[28,-22],[23,-11],[16,-16]],'#684938');
      rounded(c,-12,-46,24,21,8,'#be7a51');poly(c,[[-11,-41],[-18,-56],[-5,-49]],'#c6b079');poly(c,[[11,-41],[18,-56],[5,-49]],'#c6b079');rect(c,-7,-37,4,3,'#ffe99a');rect(c,4,-37,4,3,'#ffe99a');poly(c,[[-5,-29],[0,-25],[5,-29]],'#633c2b');line(c,[[-8,0],[-11,8]],'#56362a',6);line(c,[[8,0],[11,8]],'#56362a',6);
      if(boss){poly(c,[[-15,-31],[-18,-39],[-8,-36]],'#d1a16a');poly(c,[[15,-31],[18,-39],[8,-36]],'#d1a16a');this.flame(c,25,-13,game.time,16);line(c,[[-29,-12],[-24,-31]],'#dda16a',5);}
    } else if(e.type==='thorn_guardian') {
      c.scale(1.55,1.55);poly(c,[[-22,2],[-14,-44],[-5,-57],[15,-46],[25,4],[8,-3],[0,8],[-9,0]],'#5f6848','#2e4735',3);poly(c,[[-15,-30],[-35,-19],[-37,-2],[-28,-7],[-24,-17],[-11,-16]],'#667b4d');poly(c,[[15,-30],[34,-24],[39,-8],[29,-10],[24,-17],[12,-16]],'#667b4d');ellipse(c,0,-39,18,14,'#648554');poly(c,[[-18,-42],[-21,-61],[-10,-53],[0,-66],[8,-51],[20,-56],[18,-39]],'#889961');rect(c,-8,-38,4,4,'#ede4ab');rect(c,4,-38,4,4,'#ede4ab');line(c,[[-5,-23],[0,-3],[7,-19]],'#9eaa6a',3);glow(c,0,-20,13,'#d2cf6d55');
    } else if(e.type==='frost_sentinel') {
      c.scale(1.7,1.7);poly(c,[[-15,-34],[-23,-3],[0,7],[23,-3],[15,-34]],'#45696d','#2e4348',2);poly(c,[[-15,-30],[-20,-12],[0,-7],[20,-12],[15,-30]],'#a2c6c4');poly(c,[[-13,-37],[-9,-55],[8,-55],[14,-37],[8,-27],[-7,-27]],'#a8ccca','#42565d',2);rect(c,-6,-42,12,4,'#2d5862');rect(c,-4,-41,3,2,'#e1f6e1');rect(c,3,-41,3,2,'#e1f6e1');poly(c,[[-17,-32],[-25,-38],[-34,-30],[-26,-23],[-15,-23]],'#d0e1ce');poly(c,[[17,-32],[25,-38],[34,-30],[26,-23],[15,-23]],'#a1c4c2');line(c,[[25,-5],[25,-43]],'#829e9e',4);poly(c,[[25,-59],[14,-43],[25,-47],[36,-43]],'#b9ede2');line(c,[[-10,1],[-12,9]],'#7f9998',8);line(c,[[10,1],[12,9]],'#7f9998',8);
    } else {
      rounded(c,-10,-32,20,28,5,'#68746b');line(c,[[-7,-29],[-7,-11]],'#c2c7ad',3);line(c,[[7,-29],[7,-11]],'#b2baa4',3);for(let i=0;i<3;i++)line(c,[[-9,-25+i*5],[9,-25+i*5]],'#c5c8ad',2);rounded(c,-10,-49,20,20,6,'#c9c7a9','#596355');rect(c,-6,-42,4,5,'#3d4e43');rect(c,3,-42,4,5,'#3d4e43');rect(c,-4,-34,8,3,'#606a57');line(c,[[-8,-3],[-10,7]],'#adbaa6',5);line(c,[[8,-3],[10,7]],'#adbaa6',5);line(c,[[13,-17],[31,-23]],'#a6b4a7',4);poly(c,[[28,-29],[31,-23],[42,-29],[44,-35],[36,-33]],'#c4cdb1');
    }
    c.restore();
    const dist=Math.hypot(e.x-game.player.x,e.y-game.player.y);
    if(dist<500&&(e.hp<e.maxHp||e.aggro||boss)) {
      const width=boss?94:43,top=e.y-(boss?103:62);rounded(c,e.x-width/2,top,width,5,2,'#1d2c29');rounded(c,e.x-width/2,top,width*clamp(e.hp/e.maxHp,0,1),5,2,boss?'#d3a765':'#b3866e');
      if(boss||dist<170)this.label(c,`${def.name||e.type}${boss?'':' · '+(def.level||1)}`,e.x,top-15,boss?'#d9bd83':'#c4c7ad',boss?11:9);
    }
  }
  telegraph(c,e,game) {
    const def=ENEMY_TYPES[e.type]||{},r=e.telegraphRadius||(def.boss?(e.type==='thorn_guardian'?105:e.type==='frost_sentinel'?150:175):62);
    const intensity=.12+.08*Math.sin(this.elapsed*12);ellipse(c,e.x,e.y,r,r,`rgba(215,87,67,${intensity})`);
    c.beginPath();c.ellipse(e.x,e.y,r,r,0,0,TAU);c.strokeStyle='#e2956977';c.lineWidth=2;c.stroke();
    c.beginPath();c.ellipse(e.x,e.y,r,r,0,-Math.PI/2,-Math.PI/2+TAU*clamp(1-e.attackTimer/.7,0,1));c.strokeStyle='#ffd08dc0';c.lineWidth=3;c.stroke();
  }
  drop(c,d,game) {
    const color=d.gold?'#e4bd6c':d.item?'#9bbbde':'#9eb776';glow(c,d.x,d.y-7,25,`${color}24`);ellipse(c,d.x,d.y+4,9,3,'#182d2c60');
    if(d.gold){ellipse(c,d.x,d.y-4,5,4,'#d8b970');ellipse(c,d.x,d.y-7,5,4,'#e6cb85');}else poly(c,[[d.x,d.y-16],[d.x-7,d.y-7],[d.x,d.y+1],[d.x+7,d.y-7]],color,'#27464e',1);
    line(c,[[d.x,d.y-18],[d.x,d.y-39-Math.sin(game.time*2)*3]],`${color}47`,2);
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
    const winter=game.player.x<1500&&game.player.y<900,ash=game.player.x>1500&&game.player.y>1100;
    for(let i=0;i<30;i++){const x=this.bounds.x+noise(i*9+41)*this.bounds.w+Math.sin(this.elapsed*.35+i)*18,y=this.bounds.y+((noise(i*9+66)*this.bounds.h+this.elapsed*(winter?12:5)*(1+noise(i)))%this.bounds.h);ellipse(c,x,y,winter?1.6:ash?1.3:1,winter?1.5:ash?1.2:.7,winter?'#d1e1d174':ash?'#e4ad6866':'#dddb9a47');}
    for(const [x,y] of [[238,1205],[895,1222],[605,1585],[1960,1610],[2480,1900]])if(this.visible(x,y,90)){line(c,[[x,y+5],[x,y-23]],'#514a35',4);this.flame(c,x,y-22,game.time+noise(x)*5,10);}
    if(!game.settings?.reducedMotion)for(let i=0;i<3;i++){const x=this.bounds.x+((this.elapsed*20+i*359)% (this.bounds.w+200))-100,y=this.bounds.y+80+i*100+Math.sin(this.elapsed+i)*25;line(c,[[x-4,y],[x,y+Math.sin(this.elapsed*7)*2],[x+4,y]],'#20362d70',2);}
  }
}
