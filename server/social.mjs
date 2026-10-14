import { randomUUID } from 'node:crypto';

export const SOCIAL_LIMITS=Object.freeze({friends:32,requests:32,blocks:32,members:32,invites:32,messages:50,messageLength:240,guildNameLength:32});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const copy=value=>structuredClone(value);
const pair=(a,b)=>[a,b].sort();
const pairKey=(a,b)=>JSON.stringify(pair(a,b));
const directedKey=(a,b)=>JSON.stringify([a,b]);
const timestamp=value=>Number.isFinite(value)&&value>=0;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const empty=()=>({version:1,friendships:[],requests:[],blocks:[],guilds:[]});
const normalName=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' '):null;
const validName=value=>typeof value==='string'&&value.length>=3&&value.length<=32&&value===normalName(value)&&/^[\p{L}\p{N} _'\-]+$/u.test(value);
const chatText=value=>typeof value==='string'&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)?value.trim().replace(/\s+/gu,' '):null;
const validText=value=>typeof value==='string'&&value.length>=1&&value.length<=240&&value===chatText(value);
const actions=Object.freeze({friend_request:['username'],friend_accept:['accountId'],friend_decline:['accountId'],friend_cancel:['accountId'],friend_remove:['accountId'],block:['accountId'],unblock:['accountId'],guild_create:['guildName'],guild_invite:['username'],guild_accept:['guildId'],guild_decline:['guildId'],guild_cancel:['accountId'],guild_kick:['accountId'],guild_transfer:['accountId'],guild_role:['accountId','role'],guild_leave:[],guild_chat:['text']});

export class SocialError extends Error {constructor(status,message){super(message);this.status=status;}}

/** Account references only; character and presence come from the authority roster. */
export class SocialManager {
  constructor({accounts=()=>new Map(),clock=Date.now,profile=id=>({accountId:id}),presence=()=>({online:false,inParty:false,canJoin:false,joinReason:'Offline'})}={}) {
    this.accounts=accounts;this.clock=clock;this.profile=profile;this.presence=presence;this.state=empty();
  }
  capture(){return copy(this.state);}
  hasData(){return ['friendships','requests','blocks','guilds'].some(key=>this.state[key].length);}
  restore(data) {
    if(data===undefined){this.state=empty();return;}
    const fail=()=>{throw new Error('Ungültiger dauerhafter Sozialspielstand.');};
    if(!exact(data,['version','friendships','requests','blocks','guilds'])||data.version!==1||['friendships','requests','blocks','guilds'].some(key=>!Array.isArray(data[key])))fail();
    const accounts=this.accounts(),count=accounts.size,known=id=>typeof id==='string'&&accounts.has(id);
    if(data.friendships.length>count*16||data.requests.length>count*32||data.blocks.length>count*32||data.guilds.length>count)fail();
    const friends=new Set(),requests=new Set(),blocks=new Set(),friendCounts=new Map(),incoming=new Map(),outgoing=new Map(),blocked=new Map();
    const increment=(map,id,max)=>{const n=(map.get(id)||0)+1;map.set(id,n);if(n>max)fail();};
    for(const b of data.blocks){if(!exact(b,['from','to'])||!known(b.from)||!known(b.to)||b.from===b.to||blocks.has(directedKey(b.from,b.to)))fail();blocks.add(directedKey(b.from,b.to));increment(blocked,b.from,32);}
    const isBlocked=(a,b)=>blocks.has(directedKey(a,b))||blocks.has(directedKey(b,a));
    for(const edge of data.friendships){if(!Array.isArray(edge)||edge.length!==2||!edge.every(known)||edge[0]>=edge[1]||friends.has(pairKey(...edge))||isBlocked(...edge))fail();friends.add(pairKey(...edge));for(const id of edge)increment(friendCounts,id,32);}
    for(const r of data.requests){if(!exact(r,['from','to','createdAt'])||!known(r.from)||!known(r.to)||r.from===r.to||!timestamp(r.createdAt)||requests.has(pairKey(r.from,r.to))||friends.has(pairKey(r.from,r.to))||isBlocked(r.from,r.to))fail();requests.add(pairKey(r.from,r.to));increment(outgoing,r.from,32);increment(incoming,r.to,32);}
    const guildIds=new Set(),names=new Set(),memberships=new Map(),inviteCounts=new Map(),messageIds=new Set();
    for(const g of data.guilds){
      if(!exact(g,['id','name','createdAt','leaderId','members','invites','messages'])||!uuid(g.id)||guildIds.has(g.id)||!validName(g.name)||names.has(g.name.toLowerCase())||!timestamp(g.createdAt)||!known(g.leaderId)||!Array.isArray(g.members)||!g.members.length||g.members.length>32||!Array.isArray(g.invites)||g.invites.length>32||!Array.isArray(g.messages)||g.messages.length>50)fail();
      guildIds.add(g.id);names.add(g.name.toLowerCase());const roles=new Map();
      for(const m of g.members){if(!exact(m,['accountId','role'])||!known(m.accountId)||!['leader','officer','member'].includes(m.role)||roles.has(m.accountId)||memberships.has(m.accountId))fail();roles.set(m.accountId,m.role);memberships.set(m.accountId,g.id);}
      if(roles.get(g.leaderId)!=='leader'||[...roles.values()].filter(role=>role==='leader').length!==1)fail();
      const targets=new Set();
      for(const i of g.invites){if(!exact(i,['accountId','inviterId','createdAt'])||!known(i.accountId)||!known(i.inviterId)||roles.has(i.accountId)||targets.has(i.accountId)||!['leader','officer'].includes(roles.get(i.inviterId))||!timestamp(i.createdAt)||i.createdAt<g.createdAt||isBlocked(i.accountId,i.inviterId)||isBlocked(i.accountId,g.leaderId))fail();targets.add(i.accountId);increment(inviteCounts,i.accountId,32);}
      let last=g.createdAt;
      for(const m of g.messages){if(!exact(m,['id','accountId','playerName','text','createdAt'])||!uuid(m.id)||messageIds.has(m.id)||!known(m.accountId)||typeof m.playerName!=='string'||m.playerName.length<1||m.playerName.length>24||/[\u0000-\u001f\u007f]/.test(m.playerName)||!validText(m.text)||!timestamp(m.createdAt)||m.createdAt<last)fail();messageIds.add(m.id);last=m.createdAt;}
    }
    for(const g of data.guilds)for(const i of g.invites)if(memberships.has(i.accountId))fail();
    this.state=copy(data);
  }
  _known(id){if(typeof id!=='string'||!this.accounts().has(id))throw new SocialError(404,'Dieses Konto ist nicht verfügbar.');return id;}
  _username(name){if(typeof name!=='string'||!/^[A-Za-z0-9_-]{3,24}$/.test(name))throw new SocialError(400,'Gib einen gültigen Benutzernamen ein.');const found=[...this.accounts().values()].find(account=>account.username===name.toLowerCase());if(!found)throw new SocialError(404,'Dieses Konto ist nicht verfügbar.');return found.id;}
  _other(viewer,id){this._known(id);if(viewer===id)throw new SocialError(400,'Diese Aktion benötigt ein anderes Konto.');return id;}
  guildFor(id){return this.state.guilds.find(g=>g.members.some(m=>m.accountId===id))||null;}
  isBlocked(a,b){return this.state.blocks.some(edge=>edge.from===a&&edge.to===b||edge.from===b&&edge.to===a);}
  isFriend(a,b){return this.state.friendships.some(edge=>edge[0]===pair(a,b)[0]&&edge[1]===pair(a,b)[1]);}
  isContact(a,b){if(a===b||this.isBlocked(a,b))return false;const g=this.guildFor(a);return this.isFriend(a,b)||!!g?.members.some(m=>m.accountId===b);}
  _guild(id){const g=this.guildFor(id);if(!g)throw new SocialError(409,'Du gehörst keiner Gilde an.');return g;}
  _permission(g,id,leaderOnly=false){const role=g.members.find(m=>m.accountId===id)?.role;if(leaderOnly?role!=='leader':!['leader','officer'].includes(role))throw new SocialError(403,'Dafür brauchst du die passende Gildenrolle.');return role;}
  _cleanInvites(){for(const g of this.state.guilds)g.invites=g.invites.filter(i=>!this.guildFor(i.accountId)&&['leader','officer'].includes(g.members.find(m=>m.accountId===i.inviterId)?.role)&&!this.isBlocked(i.accountId,i.inviterId)&&!this.isBlocked(i.accountId,g.leaderId));}
  action(viewer,body) {
    this._known(viewer);
    if(!record(body)||typeof body.action!=='string'||!Object.hasOwn(actions,body.action)||!exact(body,['action',...actions[body.action]]))throw new SocialError(400,'Ungültige Sozialaktion.');
    if(actions[body.action].some(key=>typeof body[key]!=='string'))throw new SocialError(400,'Sozialaktionen benötigen bekannte Textkennungen.');
    const {action}=body,s=this.state,now=this.clock();
    if(action.startsWith('friend_')) {
      const target=this._other(viewer,action==='friend_request'?this._username(body.username):body.accountId),key=pairKey(viewer,target);
      if(action==='friend_request'){
        if(this.isBlocked(viewer,target))throw new SocialError(403,'Eine Anfrage an dieses Konto ist nicht möglich.');
        if(this.isFriend(viewer,target)||s.requests.some(r=>pairKey(r.from,r.to)===key))throw new SocialError(409,'Eine Freundschaft oder Anfrage besteht bereits.');
        for(const id of [viewer,target])if(s.friendships.filter(edge=>edge.includes(id)).length>=32)throw new SocialError(429,'Die Freundesliste ist voll.');
        if(s.requests.filter(r=>r.from===viewer).length>=32||s.requests.filter(r=>r.to===target).length>=32)throw new SocialError(429,'Zu viele offene Freundschaftsanfragen.');
        s.requests.push({from:viewer,to:target,createdAt:now});
      }else if(action==='friend_accept'||action==='friend_decline'){
        const request=s.requests.find(r=>r.from===target&&r.to===viewer);if(!request)throw new SocialError(409,'Diese eingehende Anfrage besteht nicht mehr.');
        if(action==='friend_accept'){if(this.isBlocked(viewer,target))throw new SocialError(403,'Diese Freundschaft ist gesperrt.');for(const id of [viewer,target])if(s.friendships.filter(edge=>edge.includes(id)).length>=32)throw new SocialError(429,'Die Freundesliste ist voll.');s.friendships.push(pair(viewer,target));}
        s.requests=s.requests.filter(r=>r!==request);
      }else if(action==='friend_cancel'){
        const request=s.requests.find(r=>r.from===viewer&&r.to===target);if(!request)throw new SocialError(409,'Diese versandte Anfrage besteht nicht mehr.');s.requests=s.requests.filter(r=>r!==request);
      }else {if(!this.isFriend(viewer,target))throw new SocialError(409,'Diese Freundschaft besteht nicht mehr.');s.friendships=s.friendships.filter(edge=>pairKey(...edge)!==key);}
    }else if(action==='block'||action==='unblock'){
      const target=this._other(viewer,body.accountId),existing=s.blocks.find(edge=>edge.from===viewer&&edge.to===target);
      if(action==='block'){
        if(existing)throw new SocialError(409,'Dieses Konto ist bereits blockiert.');if(s.blocks.filter(edge=>edge.from===viewer).length>=32)throw new SocialError(429,'Deine Blockliste ist voll.');
        s.blocks.push({from:viewer,to:target});s.friendships=s.friendships.filter(edge=>pairKey(...edge)!==pairKey(viewer,target));s.requests=s.requests.filter(r=>pairKey(r.from,r.to)!==pairKey(viewer,target));this._cleanInvites();
      }else{if(!existing)throw new SocialError(409,'Dieses Konto ist nicht auf deiner Blockliste.');s.blocks=s.blocks.filter(edge=>edge!==existing);}
    }else if(action==='guild_create'){
      if(this.guildFor(viewer))throw new SocialError(409,'Du gehörst bereits einer Gilde an.');const name=normalName(body.guildName);if(!validName(name))throw new SocialError(400,'Gildenname: 3–32 Buchstaben, Zahlen, Leerzeichen, Apostrophe, Unterstriche oder Bindestriche.');if(s.guilds.some(g=>g.name.toLowerCase()===name.toLowerCase()))throw new SocialError(409,'Dieser Gildenname ist bereits vergeben.');
      s.guilds.push({id:randomUUID(),name,createdAt:now,leaderId:viewer,members:[{accountId:viewer,role:'leader'}],invites:[],messages:[]});this._cleanInvites();
    }else if(action==='guild_accept'||action==='guild_decline'){
      if(typeof body.guildId!=='string')throw new SocialError(400,'Wähle eine Gildeneinladung.');const g=s.guilds.find(g=>g.id===body.guildId),invite=g?.invites.find(i=>i.accountId===viewer);if(!invite)throw new SocialError(409,'Diese Gildeneinladung besteht nicht mehr.');
      if(action==='guild_accept'){if(this.guildFor(viewer))throw new SocialError(409,'Du gehörst bereits einer Gilde an.');if(g.members.length>=32)throw new SocialError(429,'Diese Gilde ist voll.');if(this.isBlocked(viewer,invite.inviterId)||this.isBlocked(viewer,g.leaderId))throw new SocialError(403,'Diese Einladung ist gesperrt.');g.members.push({accountId:viewer,role:'member'});for(const other of s.guilds)other.invites=other.invites.filter(i=>i.accountId!==viewer);}
      else g.invites=g.invites.filter(i=>i!==invite);
    }else {
      const g=this._guild(viewer),own=g.members.find(m=>m.accountId===viewer);
      if(action==='guild_chat'){
        const text=chatText(body.text);if(!validText(text)||typeof body.text!=='string'||body.text.length>240)throw new SocialError(400,'Eine Gildennachricht benötigt 1–240 Zeichen.');
        const name=this.profile(viewer).playerName||'Reisender';g.messages.push({id:randomUUID(),accountId:viewer,playerName:name.slice(0,24),text,createdAt:Math.max(now,g.messages.at(-1)?.createdAt||g.createdAt)});if(g.messages.length>50)g.messages.splice(0,g.messages.length-50);
      }else if(action==='guild_leave'){
        if(own.role==='leader'&&g.members.length>1)throw new SocialError(409,'Übertrage zuerst die Gildenleitung.');g.members=g.members.filter(m=>m!==own);if(!g.members.length)s.guilds=s.guilds.filter(other=>other!==g);this._cleanInvites();
      }else if(action==='guild_invite'){
        this._permission(g,viewer);const target=this._other(viewer,this._username(body.username));if(this.guildFor(target))throw new SocialError(409,'Dieses Konto gehört bereits einer Gilde an.');if(this.isBlocked(viewer,target)||this.isBlocked(g.leaderId,target))throw new SocialError(403,'Eine Einladung an dieses Konto ist nicht möglich.');if(g.invites.some(i=>i.accountId===target))throw new SocialError(409,'Eine Einladung besteht bereits.');if(g.members.length>=32||g.invites.length>=32||s.guilds.reduce((n,guild)=>n+guild.invites.filter(i=>i.accountId===target).length,0)>=32)throw new SocialError(429,'Die Gilde oder Einladungsliste ist voll.');g.invites.push({accountId:target,inviterId:viewer,createdAt:Math.max(now,g.createdAt)});
      }else {
        const target=this._other(viewer,body.accountId),role=this._permission(g,viewer,['guild_role','guild_transfer'].includes(action));
        if(action==='guild_cancel'){const invite=g.invites.find(i=>i.accountId===target);if(!invite)throw new SocialError(409,'Diese Einladung besteht nicht mehr.');g.invites=g.invites.filter(i=>i!==invite);}
        else {const m=g.members.find(m=>m.accountId===target);if(!m)throw new SocialError(409,'Dieses Konto gehört nicht zu deiner Gilde.');
          if(action==='guild_kick'){if(m.role==='leader'||role==='officer'&&m.role!=='member')throw new SocialError(403,'Diese Gildenrolle kannst du nicht entfernen.');g.members=g.members.filter(member=>member!==m);}
          else if(action==='guild_role'){if(!['officer','member'].includes(body.role))throw new SocialError(400,'Wähle Mitglied oder Offizier.');if(m.role==='leader')throw new SocialError(403,'Übertrage die Leitung stattdessen.');m.role=body.role;}
          else {own.role='officer';m.role='leader';g.leaderId=target;}
          this._cleanInvites();
        }
      }
    }
    return true;
  }
  snapshot(viewer) {
    this._known(viewer);const s=this.state,g=this.guildFor(viewer);
    const profile=(id,detailed=false)=>{const p=this.profile(id),minimal={accountId:id,username:p.username,playerName:p.playerName||'Reisender'};return detailed&&!this.isBlocked(viewer,id)?{...minimal,classId:p.classId,level:p.level,...this.presence(viewer,id)}:{...minimal,online:false,inParty:false,canJoin:false,joinReason:this.isBlocked(viewer,id)?'Blockiert':'Bestätigung ausstehend'};};
    const confirmed=id=>id===viewer||this.isContact(viewer,id);
    return {version:1,accountId:viewer,friends:s.friendships.filter(edge=>edge.includes(viewer)).map(edge=>profile(edge.find(id=>id!==viewer),true)),friendRequests:{incoming:s.requests.filter(r=>r.to===viewer).map(r=>profile(r.from,confirmed(r.from))),outgoing:s.requests.filter(r=>r.from===viewer).map(r=>profile(r.to,confirmed(r.to)))},blocked:s.blocks.filter(edge=>edge.from===viewer).map(edge=>profile(edge.to)),guildInvites:s.guilds.flatMap(guild=>guild.invites.filter(i=>i.accountId===viewer).map(i=>({guildId:guild.id,guildName:guild.name,inviter:profile(i.inviterId,confirmed(i.inviterId))}))),guild:g?{id:g.id,name:g.name,role:g.members.find(m=>m.accountId===viewer).role,leaderId:g.leaderId,members:g.members.map(m=>({...profile(m.accountId,true),role:m.role})),invites:['leader','officer'].includes(g.members.find(m=>m.accountId===viewer).role)?g.invites.map(i=>profile(i.accountId,confirmed(i.accountId))):[],messages:g.messages.filter(m=>!this.isBlocked(viewer,m.accountId)).map(m=>({...m}))}:null};
  }
}
