import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive=promisify(scrypt);
const COOKIE='emberfall_account';
const TTL=30*24*60*60*1000;
const SCRYPT={N:32768,r:8,p:3,maxmem:64*1024*1024};
const tokenPattern=/^[\w-]{43}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export class AccountError extends Error {constructor(status,message){super(message);this.status=status;}}

/** Credentials and session hashes only. The hub roster owns the one character. */
export class AccountManager {
  constructor({clock=Date.now,cookieSecure=false,requireSecure=false,secureOrigin=null,isSecure=req=>!!req.socket?.encrypted,clientAddress=req=>req.socket?.remoteAddress||'local',maxAccounts=128,maxSessions=8}={}) {
    if(!Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>128)throw new RangeError('maxAccounts muss zwischen 1 und 128 liegen.');
    if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>8)throw new RangeError('maxSessions muss zwischen 1 und 8 liegen.');
    this.clock=clock;this.cookieSecure=cookieSecure;this.requireSecure=requireSecure;this.secureOrigin=secureOrigin;this.isSecure=isSecure;this.clientAddress=clientAddress;this.maxAccounts=maxAccounts;this.maxSessions=maxSessions;
    this.records=new Map();this.names=new Map();this.sessions=new Map();this.pendingNames=new Set();this.limits=new Map();this.runningKdfs=0;
    this.dummy={salt:Buffer.alloc(32,17).toString('base64url'),hash:Buffer.alloc(64,23).toString('base64url')};
  }
  _credentials(body) {
    if(!record(body)||typeof body.username!=='string'||!/^[A-Za-z0-9_-]{3,24}$/.test(body.username)||typeof body.password!=='string'||Buffer.byteLength(body.password)<12||Buffer.byteLength(body.password)>128)throw new AccountError(400,'Benutzername: 3–24 Buchstaben, Zahlen, Unterstriche oder Bindestriche. Passwort: 12–128 Bytes.');
    return {username:body.username.toLowerCase(),password:body.password};
  }
  assertTransport(req) {if(this.requireSecure&&!this.isSecure(req))throw new AccountError(426,'Anmelden und Registrieren sind nur über die verschlüsselte Spieladresse möglich.');}
  _limit(key,max,window) {
    const now=this.clock();let item=this.limits.get(key);
    if(!item||now-item.at>=window){item={at:now,count:0};this.limits.set(key,item);}
    if(++item.count>max)throw new AccountError(429,'Zu viele Anmeldeversuche. Bitte versuche es später erneut.');
    if(this.limits.size>2048){for(const [k,v]of this.limits)if(now-v.at>60*60*1000)this.limits.delete(k);if(this.limits.size>4096)this.limits.delete(this.limits.keys().next().value);}
  }
  async _hash(password,salt) {
    if(this.runningKdfs>=2)throw new AccountError(429,'Die Anmeldung ist gerade ausgelastet. Bitte versuche es gleich erneut.');
    this.runningKdfs++;
    try{return await derive(password,Buffer.from(salt,'base64url'),64,SCRYPT);}finally{this.runningKdfs--;}
  }
  async prepareRegistration(body,req) {
    this.assertTransport(req);const {username,password}=this._credentials(body);
    this._limit(`register:${this.clientAddress(req)}`,10,60*60*1000);
    if(this.records.size+this.pendingNames.size>=this.maxAccounts)throw new AccountError(503,'Der Server kann zurzeit keine weiteren Konten aufnehmen. Bestehende Reisen bleiben verfügbar.');
    if(this.names.has(username)||this.pendingNames.has(username))throw new AccountError(409,'Dieser Benutzername ist nicht verfügbar.');
    this.pendingNames.add(username);
    try{
      const salt=randomBytes(32).toString('base64url'),hash=(await this._hash(password,salt)).toString('base64url');
      if(this.names.has(username))throw new AccountError(409,'Dieser Benutzername ist nicht verfügbar.');
      return {id:randomUUID(),username,createdAt:this.clock(),memberId:null,password:{algorithm:'scrypt',N:SCRYPT.N,r:SCRYPT.r,p:SCRYPT.p,salt,hash}};
    }finally{this.pendingNames.delete(username);}
  }
  async verifyLogin(body,req) {
    this.assertTransport(req);const {username,password}=this._credentials(body);
    this._limit(`login:${this.clientAddress(req)}`,20,15*60*1000);this._limit(`user:${username}`,12,15*60*1000);
    const account=this.records.get(this.names.get(username)),credential=account?.password||this.dummy;
    const actual=await this._hash(password,credential.salt),expected=Buffer.from(credential.hash,'base64url');
    if(!timingSafeEqual(actual,expected)||!account)throw new AccountError(401,'Benutzername oder Passwort stimmen nicht.');
    return account;
  }
  add(account){this.records.set(account.id,account);this.names.set(account.username,account.id);}
  remove(account){this.records.delete(account.id);this.names.delete(account.username);for(const [key,value]of this.sessions)if(value.accountId===account.id)this.sessions.delete(key);}
  issue(account) {
    const token=randomBytes(32).toString('base64url'),key=digest(token),now=this.clock();
    for(const [sessionKey,session]of this.sessions)if(session.expiresAt<=now)this.sessions.delete(sessionKey);
    const existing=[...this.sessions].filter(([,s])=>s.accountId===account.id).sort((a,b)=>a[1].createdAt-b[1].createdAt);
    while(existing.length>=this.maxSessions)this.sessions.delete(existing.shift()[0]);
    this.sessions.set(key,{accountId:account.id,createdAt:now,expiresAt:now+TTL});return {token,key};
  }
  authenticate(req) {
    if(this.requireSecure&&!this.isSecure(req))return null;
    const raw=String(req.headers?.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!raw||!tokenPattern.test(raw))return null;
    const key=digest(raw),session=this.sessions.get(key);if(!session||session.expiresAt<=this.clock())return null;
    const account=this.records.get(session.accountId);return account?{account,session,key}:null;
  }
  sessionValid(key,accountId){const session=this.sessions.get(key);return !!(session&&session.accountId===accountId&&session.expiresAt>this.clock());}
  cookie(token){return `${COOKIE}=${token}; Path=/api/account; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(TTL/1000)}${this.cookieSecure?'; Secure':''}`;}
  clearCookie(){return `${COOKIE}=; Path=/api/account; HttpOnly; SameSite=Strict; Max-Age=0${this.cookieSecure?'; Secure':''}`;}
  capture(){return {version:1,records:[...this.records.values()],sessions:[...this.sessions].filter(([,s])=>s.expiresAt>this.clock()).map(([key,s])=>({digest:key,...s}))};}
  restore(data) {
    if(data===undefined)return;
    if(!record(data)||data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.sessions)||data.records.length>10000||data.sessions.length>80000)throw new Error('Ungültiger Kontenspeicher.');
    const records=new Map(),names=new Map(),sessions=new Map();
    for(const a of data.records){
      const p=a?.password;
      if(!record(a)||typeof a.id!=='string'||a.id.length>80||typeof a.memberId!=='string'||a.memberId.length>120||!Number.isFinite(a.createdAt)||!/^[a-z0-9_-]{3,24}$/.test(a.username)||!record(p)||p.algorithm!=='scrypt'||p.N!==SCRYPT.N||p.r!==SCRYPT.r||p.p!==SCRYPT.p||!tokenPattern.test(p.salt)||typeof p.hash!=='string'||!/^[\w-]{86}$/.test(p.hash)||records.has(a.id)||names.has(a.username))throw new Error('Ungültiger Kontenspeicher.');
      records.set(a.id,a);names.set(a.username,a.id);
    }
    for(const s of data.sessions){if(!record(s)||typeof s.digest!=='string'||!/^[a-f0-9]{64}$/.test(s.digest)||!records.has(s.accountId)||!Number.isFinite(s.createdAt)||!Number.isFinite(s.expiresAt)||s.expiresAt<=s.createdAt||sessions.has(s.digest))throw new Error('Ungültiger Sitzungsspeicher.');if(s.expiresAt>this.clock())sessions.set(s.digest,{accountId:s.accountId,createdAt:s.createdAt,expiresAt:s.expiresAt});}
    this.records=records;this.names=names;this.sessions=sessions;
  }
}
