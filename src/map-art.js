// Small cartographic marks derived exclusively from the current world's data.
// No DOM, generated locations or alternate world instances are involved.
export function drawMapFeatures(c,world,{mapX=x=>x,mapY=y=>y,scale=1,full=false,discovered=[]}={}) {
  if(!world)return;
  const regions=world.regions||[],knownIds=new Set(discovered),interior=world.isDungeon||world.isPvp;
  const known=(x,y)=>{const r=regions.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);return interior||!r||knownIds.has(r.id);};
  const point=p=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
  const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
  const line=(a,b,color,width)=>{c.beginPath();c.moveTo(mapX(a.x),mapY(a.y));c.lineTo(mapX(b.x),mapY(b.y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
  c.save();c.lineCap='round';
  const river=(world.river||[]).map(point).filter(valid);
  for(let i=1;i<river.length;i++){
    const a=river[i-1],b=river[i];if(!known((a.x+b.x)/2,(a.y+b.y)/2))continue;
    line(a,b,'#34556599',Math.max(full?1:.7,(world.riverWidth||112)*scale));
    if(full)line(a,b,'#91b8bc44',Math.max(.6,32*scale));
  }
  for(const object of world.landmarks||[]){
    if(!valid(object)||!known(object.x,object.y))continue;
    const x=mapX(object.x),y=mapY(object.y),radius=Math.max(full?2:1.2,(object.r||20)*scale),size=full?3:1.8;
    if(object.type==='pond'){
      c.beginPath();c.ellipse(x,y,radius,radius*.6,0,0,Math.PI*2);c.fillStyle='#41687899';c.fill();c.strokeStyle='#81a8a766';c.lineWidth=.7;c.stroke();
    }else if(object.type==='circle'){
      c.beginPath();c.ellipse(x,y,radius,radius*.66,0,0,Math.PI*2);c.strokeStyle='#b58b8355';c.lineWidth=1;c.stroke();
      if(full)for(let i=0;i<5;i++){const a=i*Math.PI*2/5;c.fillStyle='#b49a8266';c.fillRect(x+Math.cos(a)*radius-1,y+Math.sin(a)*radius*.66-1,2,2);}
    }else if(object.type==='graveyard'){
      c.strokeStyle='#c2b4a27a';c.lineWidth=1;for(const offset of full?[-size,0,size]:[0]){c.beginPath();c.moveTo(x+offset,y-size);c.lineTo(x+offset,y+size);c.moveTo(x+offset-size*.5,y);c.lineTo(x+offset+size*.5,y);c.stroke();}
    }else if(object.type==='field'&&full){c.strokeStyle='#9d986c77';c.lineWidth=.8;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(x-size,y+i*2);c.lineTo(x+size,y+i*2);c.stroke();}}
  }
  for(const b of world.bridges||[]){
    if(!valid(b)||!known(b.x,b.y))continue;
    const angle=b.angle||0,half=(b.w||70)/2,dx=Math.cos(angle)*half,dy=Math.sin(angle)*half;
    line({x:b.x-dx,y:b.y-dy},{x:b.x+dx,y:b.y+dy},'#dab991bb',Math.max(full?1.8:1.1,12*scale));
  }
  for(const s of world.structures||[]){
    if(!valid(s)||!known(s.x+(s.w||0)/2,s.y+(s.h||0)/2))continue;
    if(s.type?.startsWith('dungeon_'))continue; // UI already paints authoritative walls and gates.
    const x=mapX(s.x),y=mapY(s.y),w=Math.max(full?3:1.8,(s.w||25)*scale),h=Math.max(full?3:1.8,(s.h||25)*scale);
    c.fillStyle=['ruins','tower'].includes(s.type)?'#91809180':'#c2a38280';c.fillRect(x,y,w,h);
    if(full){c.strokeStyle='#e3cbaa66';c.lineWidth=.7;c.strokeRect(x,y,w,h);}
  }
  for(const event of world.worldEvents||[]){
    if(!valid(event)||!known(event.x,event.y))continue;
    const x=mapX(event.x),y=mapY(event.y),size=full?3:1.8;
    c.strokeStyle=event.state==='active'?'#e69b77':event.state==='success'?'#e8ca83':'#b8a29488';c.lineWidth=full?1.2:.8;
    c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size,y);c.lineTo(x,y+size);c.lineTo(x-size,y);c.closePath();c.stroke();
  }
  c.restore();
}
