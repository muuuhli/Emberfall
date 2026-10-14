/** Voluntary, mirrored duels. Arena state never writes to a PvE Game or save. */
import { deriveCharacterAppearance } from './character-appearance.js';
import { createCharacterPresentation } from './character-animation.js';

export const PVP_STATS = Object.freeze({maxHp:300,mana:100,damage:32,armor:0,crit:0,speed:185,spellDamage:36,manaRegen:8,cooldown:0,dodgeCooldown:0,gatherYield:0,lifeSteal:0});
export const PVP_RULES = Object.freeze({
  title:'Duell der Schatten',duration:90,countdown:3,
  normalization:'Identische 300 LP, 100 Mana und vier Arenaaktionen; Stufe, Ausrüstung, Talente und Begleiter zählen nicht.',
  rewards:'Keine EP, Beute, Gold oder Verlust von Reisegegenständen.',
  actions:[{id:'attack',name:'Schattenhieb',cost:0,cooldown:.55},{id:'bolt',name:'Nachtlanze',cost:18,cooldown:3},{id:'nova',name:'Grabessiegel',cost:30,cooldown:7},{id:'dash',name:'Schattenrolle',cost:0,cooldown:2.5}],
});
const INVITE_SECONDS=30,RETURN_SECONDS=8,DISCONNECT_SECONDS=5;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const copy=value=>JSON.parse(JSON.stringify(value));
const movement=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);

export function createPvpWorld(id='arena') {
  const walls=[{id:'pillar-north',type:'dungeon_wall',x:412,y:126,w:76,h:84},{id:'pillar-south',type:'dungeon_wall',x:412,y:430,w:76,h:84}];
  return {seed:55190,width:900,height:640,isDungeon:true,isPvp:true,pvpArenaId:id,dungeonId:'pvp-shadow-arena',tier:1,
    regions:[{id:'shadow-arena',name:'Hof der Schatten',x:0,y:0,w:900,h:640,color:'#b082b0',ground:'#24202b'}],
    rooms:[{id:'arena',x:28,y:28,w:844,h:584,color:'#302733'}],floors:[],walls,structures:walls,
    paths:[],river:[],bridges:[],trees:[],rocks:[],landmarks:[],dungeons:[],enemies:[],nodes:[],plots:[],shrines:[],chests:[],puzzles:[],puzzleObjects:[],gates:[],portals:[],dungeonPortals:[],interactions:[],worldEvents:[],eventObjects:[],entrance:{x:210,y:320},exit:{x:690,y:320}};
}
function collides(world,x,y,r=13) {
  return x-r<28||y-r<28||x+r>world.width-28||y+r>world.height-28||world.walls.some(w=>x+r>w.x&&x-r<w.x+w.w&&y+r>w.y&&y-r<w.y+w.h);
}
function move(world,p,dx,dy) {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));
  for(let i=0;i<steps;i++){if(!collides(world,p.x+dx/steps,p.y))p.x+=dx/steps;if(!collides(world,p.x,p.y+dy/steps))p.y+=dy/steps;}
}
function lineBlocked(world,a,b) {
  const steps=Math.max(1,Math.ceil(distance(a,b)/6));
  for(let i=1;i<steps;i++)if(collides(world,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,0))return true;
  return false;
}
function segmentDistance(a,b,p) {
  const dx=b.x-a.x,dy=b.y-a.y,denom=dx*dx+dy*dy;
  const t=denom?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/denom,0,1):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function fighter(member,index) {
  return {id:member.id,name:member.game.player.name,classId:member.game.classId,level:1,x:index?690:210,y:320,face:index?Math.PI:0,hp:300,mana:100,maxHp:300,walking:false,invulnerable:0,attackUntil:0,castUntil:0,dashUntil:0,hitUntil:0,presentation:null,appearance:deriveCharacterAppearance(member.game),keys:new Set(),cooldowns:{attack:0,bolt:0,nova:0,dash:0,potion:0},damageDealt:0};
}
const body=f=>Object.fromEntries(Object.entries(f).filter(([key])=>!['keys','cooldowns','damageDealt'].includes(key)));

export class PvpArena {
  constructor({clock=Date.now,id=()=>`duel-${Math.random().toString(36).slice(2)}`,notice=()=>{},sound=()=>{}}={}) {
    this.clock=clock;this.id=id;this.notice=notice;this.sound=sound;this.invites=new Map();this.duels=new Map();
  }
  duel(member){return this.duels.get(member.pvpDuelId)||null;}
  occupied(member){return !!this.duel(member);}
  availability(member) {
    const game=member.game;
    if(!member.active)return 'Nicht verbunden';
    if(this.occupied(member))return 'Bereits im Duell';
    if(game.dead||game.player.hp<=0)return 'Am Boden';
    if(game.dungeonInstance)return 'Im Dungeon';
    if(game.inCombat?.())return 'Im Kampf';
    if(!game.inSettlement?.())return 'Besuche eine Siedlung';
    return 'Bereit';
  }
  _dropInvite(invite,message) {
    this.invites.delete(invite.id);
    if(message)for(const member of [invite.from,invite.to])this.notice(member,message,'info');
  }
  _cancelInvites(member,message) {
    for(const invite of [...this.invites.values()])if(invite.from===member||invite.to===member)this._dropInvite(invite,message);
  }
  invite(member,targetId) {
    const target=member.room.members.get(targetId);
    if(!target||target===member||this.availability(member)!=='Bereit'||this.availability(target)!=='Bereit')return false;
    if(distance(member.game.player,target.game.player)>200){this.notice(member,'Für eine Duelleinladung muss dein Gegenüber in deiner Nähe sein.');return false;}
    if([...this.invites.values()].some(invite=>invite.from===member||invite.to===member||invite.from===target||invite.to===target))return false;
    const invite={id:this.id(),from:member,to:target,expiresAt:this.clock()+INVITE_SECONDS*1000};this.invites.set(invite.id,invite);
    this.notice(target,`${member.game.player.name} lädt dich zu einem freiwilligen Duell ein.`, 'quest');
    this.notice(member,`Duellanfrage an ${target.game.player.name} gesendet.`, 'quest');return true;
  }
  accept(member,inviteId) {
    const invite=this.invites.get(inviteId);
    if(!invite||invite.to!==member)return false;
    if(invite.expiresAt<=this.clock()){this._dropInvite(invite,'Die Duellanfrage ist abgelaufen.');return false;}
    if([invite.from,invite.to].some(m=>this.availability(m)!=='Bereit')||distance(invite.from.game.player,member.game.player)>200)return false;
    const members=[invite.from,invite.to],duel={id:this.id(),members,world:createPvpWorld(),state:'countdown',elapsed:0,remaining:90,returnIn:8,winnerId:null,reason:null,projectiles:[],hazards:[],effects:[],casts:[],fighters:new Map()};
    duel.world.pvpArenaId=duel.id;
    for(const [index,m] of members.entries()){this._cancelInvites(m);m.pvpDuelId=duel.id;m.game.keys.clear();duel.fighters.set(m.id,fighter(m,index));this.notice(m,'Duell der Schatten · gleiche Werte, keine Reiseverluste.', 'quest');}
    this.duels.set(duel.id,duel);return true;
  }
  decline(member,inviteId) {
    const invite=this.invites.get(inviteId);if(!invite||invite.to!==member)return false;
    this._dropInvite(invite,`${member.game.player.name} hat die Duellanfrage abgelehnt.`);return true;
  }
  cancel(member) {
    const invite=[...this.invites.values()].find(i=>i.from===member);if(!invite)return false;
    this._dropInvite(invite,'Die Duellanfrage wurde zurückgezogen.');return true;
  }
  forfeit(member) {
    const duel=this.duel(member);if(!duel||duel.state==='finished')return false;
    this.finish(duel,duel.state==='active'?duel.members.find(m=>m!==member).id:null,duel.state==='active'?'Aufgabe':'Abgebrochen');return true;
  }
  return(member) {
    const duel=this.duel(member);if(!duel||duel.state!=='finished')return false;
    this._release(member,duel);return true;
  }
  _release(member,duel) {
    delete member.pvpDuelId;member.game.keys.clear();member.layoutKey=null;
    if(duel.members.every(m=>!m.pvpDuelId))this.duels.delete(duel.id);
  }
  disconnect(member,reason='Verbindung getrennt') {
    this._cancelInvites(member,'Die Duellanfrage wurde durch eine getrennte Verbindung beendet.');
    const duel=this.duel(member);if(!duel)return;
    const opponent=duel.members.find(m=>m!==member),connected=opponent.active&&(opponent.streams.size||this.clock()-opponent.lastSeen<=DISCONNECT_SECONDS*1000);
    if(duel.state!=='finished')this.finish(duel,duel.state==='active'&&connected?opponent.id:null,reason);
    this._release(member,duel);
  }
  input(member,keys,angle) {
    const duel=this.duel(member),p=duel?.fighters.get(member.id);if(!p)return false;
    p.keys=new Set(keys.filter(key=>movement.has(key)));p.face=Math.atan2(Math.sin(angle),Math.cos(angle));return true;
  }
  clearInput(member){this.duel(member)?.fighters.get(member.id)?.keys.clear();}
  action(member,name) {
    const duel=this.duel(member);if(!duel||duel.state!=='active')return false;
    name=({primary:'attack',secondary:'bolt',ultimate:'nova'})[name]||name;
    const config=PVP_RULES.actions.find(a=>a.id===name),p=duel.fighters.get(member.id);
    if(!config||!p||p.hp<=0||p.cooldowns[name]>0||p.mana<config.cost)return false;
    p.cooldowns[name]=config.cooldown;p.mana-=config.cost;
    for(const listener of duel.members)this.sound(listener,name==='bolt'?'spell':name);
    if(name==='dash') {
      move(duel.world,p,Math.cos(p.face)*115,Math.sin(p.face)*115);p.invulnerable=.3;p.dashUntil=duel.elapsed+.3;p.dashAngle=p.face;
      this._effect(duel,'burst',p.x,p.y,{color:'#a58abe',radius:35});return true;
    }
    p.attackUntil=duel.elapsed+.4;p.castUntil=duel.elapsed+(name==='nova'?.9:.4);
    const windup=name==='attack'?.18:name==='bolt'?.4:.9;
    p.presentation=createCharacterPresentation(name==='attack'?'melee':name==='bolt'?'projectile':'cast',duel.elapsed,{angle:p.face,windup,duration:windup+(name==='nova'?.42:.3),skillId:`pvp_${name}`,color:'#bf8398'});
    const angle=p.face,cast={name,ownerId:p.id,angle,x:p.x,y:p.y,remaining:name==='attack'?.18:name==='bolt'?.4:.9};
    if(name==='nova')for(let offset=5;offset<=220;offset+=5){const x=p.x+Math.cos(angle)*offset,y=p.y+Math.sin(angle)*offset;if(collides(duel.world,x,y,0))break;cast.x=x;cast.y=y;}
    cast.hazardId=`${duel.id}-${member.id}-${duel.elapsed}-${name}`;duel.casts.push(cast);
    duel.hazards.push({id:cast.hazardId,kind:name==='nova'?'meteor':'warning',x:cast.x,y:cast.y,radius:name==='nova'?95:name==='attack'?85:30,color:'#bf8398',ownerId:p.id,angle,shape:name==='bolt'?'line':name==='attack'?'cone':'circle',length:name==='bolt'?690:85,arc:name==='attack'?1.9:0,width:30,pending:true,windup:cast.remaining,life:cast.remaining,maxLife:cast.remaining,pvp:true});return true;
  }
  _effect(duel,kind,x,y,options={}){duel.effects.push({kind,x,y,color:'#bf91c8',radius:35,angle:0,life:.45,maxLife:.45,...options});}
  _hit(duel,ownerId,target,damage) {
    if(target.invulnerable>0||target.hp<=0)return;
    const actual=Math.min(target.hp,damage);target.hp-=actual;target.hitUntil=duel.elapsed+.22;
    duel.fighters.get(ownerId).damageDealt+=actual;
    this.sound(duel.members.find(m=>m.id===target.id),'hurt');this.sound(duel.members.find(m=>m.id===ownerId),'hit');
    this._effect(duel,'text',target.x,target.y,{text:String(actual),color:'#e9a2a1',life:.8,maxLife:.8});
  }
  _resolveCast(duel,cast) {
    const p=duel.fighters.get(cast.ownerId),target=[...duel.fighters.values()].find(f=>f!==p);
    if(!p||p.hp<=0)return;
    if(cast.name==='attack') {
      this._effect(duel,'slash',cast.x,cast.y,{angle:cast.angle,radius:85,color:'#b993c5'});
      if(distance(cast,target)<=98&&Math.abs(angleDelta(Math.atan2(target.y-cast.y,target.x-cast.x),cast.angle))<.95&&!lineBlocked(duel.world,cast,target))this._hit(duel,p.id,target,32);
    } else if(cast.name==='nova') {
      this._effect(duel,'ring',cast.x,cast.y,{radius:110,color:'#cb7d99'});
      if(distance(cast,target)<=108&&!lineBlocked(duel.world,cast,target))this._hit(duel,p.id,target,48);
    } else {
      duel.projectiles.push({id:cast.hazardId,ownerId:p.id,owner:'player',type:'pvp-bolt',x:cast.x,y:cast.y,angle:cast.angle,vx:Math.cos(cast.angle)*420,vy:Math.sin(cast.angle)*420,radius:9,color:'#b18bce',life:1.65,damage:36,pvp:true});
    }
  }
  finish(duel,winnerId,reason) {
    if(duel.state==='finished')return;
    duel.state='finished';duel.winnerId=winnerId;duel.reason=reason;duel.returnIn=RETURN_SECONDS;duel.casts=[];duel.hazards=[];duel.projectiles=[];
    for(const member of duel.members){const opponent=duel.members.find(m=>m!==member),result=winnerId===null?'draw':winnerId===member.id?'victory':'defeat';duel.fighters.get(member.id).keys.clear();member.pvpLastResult={duelId:duel.id,opponentName:opponent.game.player.name,result,reason,at:this.clock()};this.notice(member,`${result==='draw'?'Remis':result==='victory'?'Sieg':'Niederlage'} · ${reason}. Deine Reise bleibt erhalten.`, 'quest');}
  }
  tick(dt,room) {
    const now=this.clock();
    for(const invite of [...this.invites.values()])if(invite.from.room===room&&invite.expiresAt<=now)this._dropInvite(invite,'Die Duellanfrage ist abgelaufen.');
    for(const duel of [...this.duels.values()].filter(d=>d.members[0].room===room)) {
      for(const member of duel.members)if(member.pvpDuelId&&(!member.active||!member.streams.size&&now-member.lastSeen>DISCONNECT_SECONDS*1000))this.disconnect(member);
      if(!this.duels.has(duel.id))continue;
      duel.elapsed+=dt;
      for(const p of duel.fighters.values()){for(const key of Object.keys(p.cooldowns))p.cooldowns[key]=Math.max(0,p.cooldowns[key]-dt);p.invulnerable=Math.max(0,p.invulnerable-dt);}
      if(duel.state==='finished'){duel.returnIn=Math.max(0,duel.returnIn-dt);if(!duel.returnIn)for(const member of duel.members)if(member.pvpDuelId===duel.id)this._release(member,duel);continue;}
      if(duel.state==='countdown'){if(duel.elapsed>=PVP_RULES.countdown){duel.state='active';for(const m of duel.members)this.notice(m,'Das Duell beginnt.', 'quest');}continue;}
      duel.remaining=Math.max(0,PVP_RULES.duration-(duel.elapsed-PVP_RULES.countdown));
      for(const p of duel.fighters.values()) {
        let dx=(p.keys.has('d')||p.keys.has('arrowright')?1:0)-(p.keys.has('a')||p.keys.has('arrowleft')?1:0),dy=(p.keys.has('s')||p.keys.has('arrowdown')?1:0)-(p.keys.has('w')||p.keys.has('arrowup')?1:0);
        const length=Math.hypot(dx,dy);p.walking=length>0;if(length)move(duel.world,p,dx/length*PVP_STATS.speed*dt,dy/length*PVP_STATS.speed*dt);
        p.mana=Math.min(100,p.mana+PVP_STATS.manaRegen*dt);
      }
      for(const cast of [...duel.casts]){cast.remaining-=dt;const hazard=duel.hazards.find(h=>h.id===cast.hazardId);if(hazard){hazard.life=Math.max(0,cast.remaining);hazard.windup=hazard.life;}if(cast.remaining<=0){this._resolveCast(duel,cast);duel.casts.splice(duel.casts.indexOf(cast),1);duel.hazards=duel.hazards.filter(h=>h.id!==cast.hazardId);}}
      for(const projectile of duel.projectiles){const old={x:projectile.x,y:projectile.y};projectile.x+=projectile.vx*dt;projectile.y+=projectile.vy*dt;projectile.life-=dt;
        const target=[...duel.fighters.values()].find(p=>p.id!==projectile.ownerId);
        if(lineBlocked(duel.world,old,projectile)||collides(duel.world,projectile.x,projectile.y,3))projectile.life=0;
        else if(segmentDistance(old,projectile,target)<=22){this._hit(duel,projectile.ownerId,target,projectile.damage);projectile.life=0;}}
      duel.projectiles=duel.projectiles.filter(p=>p.life>0);for(const e of duel.effects)e.life-=dt;duel.effects=duel.effects.filter(e=>e.life>0);
      const living=[...duel.fighters.values()].filter(p=>p.hp>0);
      if(living.length<2)this.finish(duel,living.length===1?living[0].id:null,living.length===1?'Kampf entschieden':'Gleichzeitiger Treffer');
      else if(duel.remaining<=0)this.finish(duel,null,'Zeitlimit');
    }
  }
  summary(member) {
    const duel=this.duel(member),opponent=duel?.members.find(m=>m!==member);
    return {rules:PVP_RULES,roster:[...member.room.members.values()].filter(m=>m!==member).map(m=>({id:m.id,name:m.game.player.name,classId:m.game.classId,available:this.availability(m)==='Bereit',reason:this.availability(m)})),
      invites:[...this.invites.values()].filter(i=>i.from===member||i.to===member).map(i=>({id:i.id,fromId:i.from.id,fromName:i.from.game.player.name,toId:i.to.id,toName:i.to.game.player.name,expiresAt:i.expiresAt,remaining:Math.max(0,(i.expiresAt-this.clock())/1000),outgoing:i.from===member})),
      duel:duel?{id:duel.id,state:duel.state,countdown:Math.max(0,3-duel.elapsed),timeLeft:duel.remaining,opponentId:opponent.id,opponentName:opponent.game.player.name,winnerId:duel.winnerId,result:duel.state==='finished'?duel.winnerId===null?'draw':duel.winnerId===member.id?'victory':'defeat':null,reason:duel.reason,returnIn:duel.returnIn}:null,lastResult:member.pvpLastResult||null};
  }
  snapshot(member) {
    const duel=this.duel(member);if(!duel)return null;
    const p=duel.fighters.get(member.id);
    return {player:{...member.game.player,...body(p)},party:[...duel.fighters.values()].map(f=>({...body(f),connected:duel.members.find(m=>m.id===f.id).active,dead:f.hp<=0})),time:duel.elapsed,worldMode:'pvp',world:copy(duel.world),layout:copy(duel.world),npcs:[],effects:copy(duel.effects),projectiles:duel.projectiles.map(projectile=>({...projectile,hostile:projectile.ownerId!==member.id})),hazards:duel.hazards.map(h=>({...h,hostile:h.ownerId!==member.id,color:h.ownerId===member.id?'#af94c5':'#d77989'})),drops:[],summons:[],cooldowns:{...p.cooldowns},dead:false,buffs:[],dungeonInstance:null,activeDungeon:null,authoritativeInteractionSummary:[],authoritativeWorldEventSummary:[],pvpStats:PVP_STATS};
  }
}
