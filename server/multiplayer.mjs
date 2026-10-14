import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { Game } from '../src/game.js';
import * as Catalog from '../src/catalog.js';
import { CLASSES } from '../src/classes.js';
import { DUNGEONS } from '../src/dungeons.js';
import { getArsenalShopStock } from '../src/arsenal.js';
import { EQUIPMENT_SLOT_IDS, getEquipmentShopStock } from '../src/equipment-system.js';
import { captureWorldEvents, restoreWorldEvents } from '../src/world-events.js';
import { PvpArena } from '../src/pvp.js';
import { captureEncounterDirector, restoreEncounterDirector } from '../src/encounter-director.js';
import { deriveCharacterAppearance } from '../src/character-appearance.js';
import { SnapshotEncoder, createSnapshotSignatureCache, immutableSnapshotValue } from '../src/network-snapshots.js';
import { AccountManager } from './accounts.mjs';

const KEYS = new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const ACTIONS = new Set(['attack','dash','bolt','nova','potion','interact','primary','secondary','ultimate']);
const METHODS = new Set(['questAccept','questTurnIn','learn','trainProfession','chooseProfessionMastery','learnAbility','learnTechniqueSpecialization','selectTechniqueSpecialization','setAbilityLoadout','useLearnedAbility','equip','unequip','pickupLoot','buy','sell','consume','craft','travel','respawn','enterDungeon','exitDungeon','leaveDungeon','attune','salvage','socket','upgradeItem','acceptContract','turnInContract','cancelContract','interactWorldObject','setItemFlag','depositItem','withdrawItem','saveLoadout','applyLoadout','deleteLoadout','respecTalents','trackQuest','setWaypoint','claimAchievement','selectCompanion','chooseMastery','interactWorldEvent','claimWorldEvent','pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn','startHunt','abandonHunt','claimHunt','redeemHuntReward','setSetting']);
const PVP_METHODS = new Set(['pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn']);
const SHOP_STOCK = {
  elin:new Set(['forest_blade','sentinel_mail']),
  sera:new Set(['heal_potion','mana_potion']),
  oren:new Set(['heal_potion','mana_potion','leather_armor','forest_blade','seed']),
};
const PERSONAL_FIELDS = ['inventory','resources','equipment','generatedItems','lootPity','lootSerial','skills','learnedAbilities','abilityLoadout','techniqueSpecializations','questState','discovered','unlockedShrines','flags','ledger','kills','cooldowns','playTime','dead','classId','dungeonProgress','dungeonRecords','contracts','professions','professionTraining','buffs','itemFlags','stash','loadouts','trackedQuestId','waypoint','journey','endgame','deathPenalty'];
const SHARED_FIELDS = ['effects','projectiles','drops','hazards','summons','dungeonInstance','overworld','activeDungeon','worldMode'];
const MUTABLE_WORLD = ['enemies','nodes','plots','shrines','chests','puzzles','puzzleObjects','gates','portals','dungeonPortals','dungeonState','dungeonExit','interactions','worldEvents','eventObjects','encounterDirector'];
const LAYOUT_FIELDS = ['seed','width','height','regions','paths','river','bridges','structures','trees','rocks','landmarks','dungeons','dungeonEntrances','npcs','walls','floors','entrance','exit','rooms','isDungeon','dungeonId','tier','layoutVersion'];
const STORE_KEY = 'emberfall.multiplayer.v1';
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const cleanName = (value,fallback) => typeof value==='string' ? value.trim().replace(/[^\p{L}\p{N} _'\-]/gu,'').slice(0,24)||fallback : fallback;
const clone = value => JSON.parse(JSON.stringify(value));
function roomResumeSummary(room){
  const instance=[...room.members.values()].find(member=>member.game.dungeonInstance)?.game.dungeonInstance;
  if(!room.waitingForRaidResume||!instance?.definition.raid)return null;
  return {waiting:true,required:instance.definition.partyRequired,ready:[...room.members.values()].filter(member=>member.active).length};
}
const classIds = () => (Array.isArray(CLASSES)?CLASSES:Object.values(CLASSES)).map(c=>c.id);

/** Atomic local server saves. Keep this file outside the static web root. */
export function createFileRoomStorage(filename,{strictRead=false}={}) {
  let values={};
  try {
    values=JSON.parse(readFileSync(filename,'utf8'));
    if(strictRead&&(!values||typeof values!=='object'||Array.isArray(values)||Object.values(values).some(value=>typeof value!=='string')))throw new Error('Invalid persistent store envelope.');
  } catch(error){if(strictRead&&error.code!=='ENOENT')throw new Error('Der dauerhafte Gruppenspeicher konnte nicht sicher gelesen werden.',{cause:error});values={};}
  return {
    getItem:key=>values[key]??null,
    setItem(key,value) {
      const next={...values,[key]:value};
      mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
      const temp=`${filename}.tmp`;
      writeFileSync(temp,JSON.stringify(next),{mode:0o600,flush:true});
      renameSync(temp,filename);
      values=next;
    },
  };
}

export class MultiplayerHub {
  constructor({createGame=()=>new Game({storage:null}),clock=Date.now,random=Math.random,storage=null,allowedOrigin=null,maxRooms=32,maxPlayers=8,maxSavedRooms=Math.max(32,maxRooms),maxSavedCharactersPerRoom=64,maxSessionStreams=4,disconnectMs=120000,roomExpiryMs=1800000,autoStart=true,strictRestore=false,accountOptions={}}={}) {
    for(const [name,value,ceiling] of [['maxSavedRooms',maxSavedRooms,Math.max(32,maxRooms)],['maxSavedCharactersPerRoom',maxSavedCharactersPerRoom,64],['maxSessionStreams',maxSessionStreams,4]])if(!Number.isInteger(value)||value<1||value>ceiling)throw new RangeError(`${name} muss eine ganze Zahl zwischen 1 und ${ceiling} sein.`);
    this.createGame=createGame;this.clock=clock;this.random=random;this.storage=storage;this.allowedOrigin=allowedOrigin;
    this.maxRooms=maxRooms;this.maxPlayers=Math.max(2,Math.min(8,maxPlayers));this.disconnectMs=disconnectMs;this.roomExpiryMs=roomExpiryMs;
    this.maxSavedRooms=maxSavedRooms;this.maxSavedCharactersPerRoom=maxSavedCharactersPerRoom;this.maxSessionStreams=maxSessionStreams;
    this.strictRestore=strictRestore;
    this.rooms=new Map();this.sessions=new Map();this.creations=new Map();this.frames=0;this.lastPersist=this.clock();
    this.accounts=new AccountManager({clock,...accountOptions});this.accountMembers=new Map();this.accountStreamSessions=new WeakMap();
    this.snapshotStreams=new WeakMap();
    this.layoutSnapshots=new WeakMap();this.canonicalNpcSnapshot=immutableSnapshotValue(Catalog.NPCS);
    this.pvp=new PvpArena({clock:this.clock,id:()=>randomUUID(),notice:(member,text,tone='info')=>this._event(member,{kind:'notice',text,tone}),sound:(member,name)=>this._event(member,{kind:'sound',name})});
    this.restore();
    if(autoStart)this.start();
  }
  start() {
    if(this.timer)return;
    this.timer=setInterval(()=>this.tick(.04),40);
    this.timer.unref?.();
  }
  dispose() {
    clearInterval(this.timer);this.timer=null;
    this.persist();
    for(const member of this.sessions.values())for(const stream of member.streams)stream.end();
  }
  _code() {
    let code;
    do { code=randomBytes(4).toString('hex').toUpperCase(); } while(this.rooms.has(code));
    return code;
  }
  _createMember(room,{playerName,classId='guardian'}={},accountId=null) {
    if(!classIds().includes(classId))throw new HttpError(400,'Unbekannte Klasse.');
    const game=this.createGame({roomCode:room.code,classId,playerName});
    game.selectClass?.(classId);
    game.player.name=cleanName(playerName,'Reisender');game.player.id=randomUUID();
    game.classId=classId;game.started=true;game.paused=false;game.dead=false;game.storage=null;
    const member={id:game.player.id,token:randomBytes(32).toString('base64url'),accountId,membershipVersion:0,game,room,active:true,streams:new Set(),events:[],eventSequence:0,lastSeen:this.clock(),lastInput:this.clock(),windowAt:this.clock(),windowCommands:0,layoutKey:null,aimAngle:game.player.face};
    game.onNotice=(text,tone='info',itemId=null)=>this._event(member,{kind:'notice',text,tone,...(typeof itemId==='string'&&itemId.length<=120&&game.item(itemId)&&game.inventory[itemId]>0?{itemId}:{})});
    game.onSound=name=>this._event(member,{kind:'sound',name});
    game.onDialogue=npc=>this._event(member,{kind:'dialogue',npc});
    game.onDeath=()=>{this._event(member,{kind:'death'});this.persist();};
    game.onVictory=()=>this._event(member,{kind:'victory'});
    game.onChange=()=>{};
    if(room.members.size) {
      const leader=room.members.values().next().value.game;
      game.world=room.world;game.time=room.time;
      for(const key of SHARED_FIELDS)game[key]=leader[key];
      game.player.x=leader.player.x+28;game.player.y=leader.player.y+28;
      if(game.collides(game.player.x,game.player.y)){game.player.x=leader.player.x;game.player.y=leader.player.y;}
    } else {
      room.world=game.world;room.time=game.time;
    }
    room.members.set(member.id,member);this.sessions.set(member.token,member);room.lastActive=this.clock();
    if(accountId)this.accountMembers.set(accountId,member);
    this._syncRoom(room,game);
    this._event(member,{kind:'notice',text:room.accountHome?'Deine persönliche Serverreise ist bereit.':`Gruppe ${room.code} · ${room.members.size}/${this.maxPlayers} Reisende`,tone:'quest'});
    return member;
  }
  _event(member,event) {
    member.events.push({...event,id:++member.eventSequence});
    if(member.events.length>40)member.events.splice(0,member.events.length-40);
  }
  _syncRoom(room,source) {
    room.world=source.world;
    // Joins/restores can replace a Game.world reference. Outside a dungeon,
    // its portable overworld must follow that live shared world rather than
    // an earlier initialized copy with stale enemies or director deadlines.
    if(!source.dungeonInstance)source.overworld=source.world;
    const party=[...room.members.values()].filter(m=>m.active&&!this.pvp.occupied(m)).map(m=>m.game);
    for(const member of room.members.values()) {
      const game=member.game;
      if(!member.active&&game.world!==room.world)member.needsTeleport=true;
      game.world=room.world;game.partyGames=party;game.multiplayer=true;
      for(const key of SHARED_FIELDS)game[key]=source[key];
    }
  }
  tick(dt=.04) {
    dt=Math.max(0,Math.min(.04,dt));const now=this.clock();this.frames++;
    for(const room of this.rooms.values()) {
      for(const member of [...room.members.values()]) {
        if(!member.streams.size&&now-member.lastSeen>this.disconnectMs){member.active=false;member.game.keys.clear();this.pvp.disconnect(member);}
        else if(now-member.lastInput>650){member.game.keys.clear();this.pvp.clearInput(member);}
      }
      this.pvp.tick(dt,room);
      const active=[...room.members.values()].filter(m=>m.active);
      if(!active.length) {
        // A dormant server character is retained with its token, rather than
        // losing months of progression when the browser closes. Empty rooms expire.
        if(!room.members.size&&now-room.lastActive>this.roomExpiryMs)this.rooms.delete(room.code);
        continue;
      }
      room.lastActive=now;
      const games=active.filter(m=>!this.pvp.occupied(m)).map(m=>m.game);
      if(!games.length){if(this.frames%2===0)this._broadcastRoom(room);continue;}
      if(room.waitingForRaidResume){
        const required=games[0].dungeonInstance?.definition.partyRequired||1;
        if(games.length<required){
          for(const game of games)game.keys.clear();
          const boss=games[0].world.enemies.find(enemy=>enemy.id===`${games[0].dungeonInstance?.id}:boss`);
          if(boss){boss.insufficientParty=true;boss.shielded=true;boss.shieldDamageMultiplier=0;}
          if(this.frames%2===0)this._broadcastRoom(room);
          continue;
        }
        room.waitingForRaidResume=false;
      }
      const authority=games.find(g=>!g.dead)||games[0];this._syncRoom(room,authority);
      for(const game of games) {
        // Menus are client UI only. One player's pause or defeat cannot freeze a group.
        if(!game.dead)game.paused=false;
        const member=active.find(m=>m.game===game);
        game.aim={x:game.player.x+Math.cos(member.aimAngle)*100,y:game.player.y+Math.sin(member.aimAngle)*100};
        game.time=room.time;
        game.update(dt,{simulateWorld:false});
        game.time=room.time+dt;
      }
      room.time+=dt;
      if(typeof authority.updateWorld!=='function')throw new Error('Game.updateWorld(dt, partyGames) is required for authoritative multiplayer.');
      const raidWipesBefore=authority.dungeonInstance?.raidWipes||0;
      const bossDefeatedBefore=!!authority.dungeonInstance?.bossDefeated,routeCompletionsBefore=authority.dungeonInstance?.routes?.completed?.length||0;
      authority.updateWorld(dt,games);this._syncRoom(room,authority);
      if((authority.dungeonInstance?.raidWipes||0)>raidWipesBefore||!bossDefeatedBefore&&authority.dungeonInstance?.bossDefeated||(authority.dungeonInstance?.routes?.completed?.length||0)!==routeCompletionsBefore)this.persist();
      if(this.frames%2===0)this._broadcastRoom(room);
    }
    if(now-this.lastPersist>10000){this.persist();this.lastPersist=now;}
  }
  _partySnapshot(room){
    const cached=this._framePartyCache?.get(room);if(cached)return cached;
    const party=[...room.members.values()].filter(m=>m.active).map(m=>({id:m.id,name:m.game.player.name,classId:m.game.classId,level:m.game.player.level,hp:m.game.player.hp,maxHp:m.game.stats().maxHp,x:m.game.player.x,y:m.game.player.y,face:m.game.player.face,walking:m.game.player.walking,dead:m.game.dead,attackUntil:m.game.player.attackUntil,castUntil:m.game.player.castUntil,dashUntil:m.game.player.dashUntil,dashAngle:m.game.player.dashAngle,hitUntil:m.game.player.hitUntil,presentation:m.game.player.presentation||null,appearance:deriveCharacterAppearance(m.game),connected:m.streams.size>0}));
    this._framePartyCache?.set(room,party);return party;
  }
  _semanticSummaries(member){
    const game=member.game,world=game.overworld||game.world;
    let shared=this._frameSemanticCache?.get(world);
    if(!shared){
      // clock changes even for idle events, but no journal/reward formula reads
      // it. Every other event field participates, including new future fields.
      shared={events:JSON.stringify(world.worldEvents||[],(key,value)=>key==='clock'?undefined:value),interactions:JSON.stringify((world.interactions||[]).map(o=>[o.id,o.kind,!!o.used]))};
      this._frameSemanticCache?.set(world,shared);
    }
    const previous=member.summaryCache||(member.summaryCache={});
    if(previous.eventsKey!==shared.events||previous.playerId!==game.player.id||previous.level!==game.player.level){previous.eventsKey=shared.events;previous.playerId=game.player.id;previous.level=game.player.level;previous.events=immutableSnapshotValue(game.worldEventSummary?.()||[]);}
    const ledgerKey=JSON.stringify(game.ledger);
    if(previous.interactionsKey!==shared.interactions||previous.ledgerKey!==ledgerKey){previous.interactionsKey=shared.interactions;previous.ledgerKey=ledgerKey;previous.interactions=immutableSnapshotValue(game.interactionSummary());}
    return previous;
  }
  snapshot(member,{includeLayout=false}={}) {
    const game=member.game,p=game.player,world=game.world;
    const near=value=>{if(!Number.isFinite(value?.x)||!Number.isFinite(value?.y))return true;const dx=value.x-p.x,dy=value.y-p.y;return dx*dx+dy*dy<1960000;};
    const data={protocol:1,roomCode:member.room.code,roomName:member.room.name,privateWorld:!!member.room.accountHome,playerId:member.id,sequence:this.frames,time:member.room.time,player:{...p},world:{},npcs:game.npcs===Catalog.NPCS?this.canonicalNpcSnapshot:game.npcs,effects:game.effects.filter(near),projectiles:game.projectiles.filter(near),drops:game.drops.filter(near),hazards:(game.hazards||[]).filter(near),summons:(game.summons||[]).filter(near),worldMode:game.dungeonInstance?'dungeon':'overworld',activeDungeon:game.dungeonInstance?{id:game.dungeonInstance.id,tier:game.dungeonInstance.tier,name:game.dungeonInstance.definition.name}:null,party:this._partySnapshot(member.room),events:member.events};
    const summaries=this._semanticSummaries(member);
    data.authoritativeInteractionSummary=summaries.interactions;
    data.authoritativeWorldEventSummary=summaries.events;
    data.dungeonInstance=game.dungeonInstance?Object.fromEntries(['id','definition','tier','seed','layoutVersion','routes','partySize','spawn','exit','puzzles','elapsed','bossTime','bossEngaged','bossDefeated','gateOpened','shieldHold','vulnerabilityUntil','raidEncounter','raidRevivesUsed'].map(key=>[key,game.dungeonInstance[key]])):null;
    // Portable dungeon progress must not depend on the client's view culling.
    // This carries boss HP, all objectives and pending deadlines, without room tokens.
    data.authoritativeDungeonCheckpoint=game.captureDungeonCheckpoint?.()||null;
    data.raidResume=roomResumeSummary(member.room);
    for(const key of PERSONAL_FIELDS)if(game[key]!==undefined)data[key]=game[key];
    data.leechCredit=game.currentLeechCredit();
    data.pvp=this.pvp.summary(member,{availability:target=>this._pvpAvailability(target)});data.pvpStats=null;
    const arena=this.pvp.snapshot(member);
    if(arena)return {...data,...arena,...(includeLayout?{pvpTravelSave:game.capture()}:{})};
    // Portable director context includes every active or spent actor even when
    // the render snapshot culls its enemy outside this client's view radius.
    data.authoritativeEncounterDirectorSave=captureEncounterDirector(game.overworld||world);
    for(const key of MUTABLE_WORLD)if(world[key]!==undefined)data.world[key]=Array.isArray(world[key])?world[key].filter(near):world[key];
    // Doors and collision rectangles may change as a party solves a dungeon.
    if(world.structures)data.world.structures=world.structures.filter(near);
    const layoutKey=`${world.isDungeon?'dungeon':'overworld'}:${world.seed}:${world.width}:${world.height}:${game.dungeonInstance?.id||''}`;
    if(includeLayout||member.layoutKey!==layoutKey) {
      data.layout={};for(const key of LAYOUT_FIELDS)if(world[key]!==undefined)data.layout[key]=world[key];
      const json=JSON.stringify(data.layout),cached=this.layoutSnapshots.get(world);
      if(cached?.json===json)data.layout=cached.value;
      else{data.layout=immutableSnapshotValue(data.layout);this.layoutSnapshots.set(world,{json,value:data.layout});}
      member.layoutKey=layoutKey;
    }
    return data;
  }
  _broadcast(member) {
    if(member.accountId)for(const stream of [...member.streams]){const key=this.accountStreamSessions.get(stream);if(!this.accounts.sessionValid(key,member.accountId))this._closeAccountStreams(member,key);}
    if(!member.streams.size)return;
    const snapshot=this.snapshot(member),signatureCache=this._frameSignatureCache||createSnapshotSignatureCache();let fullJson;
    const context=this._snapshotContext(member,snapshot);
    for(const stream of member.streams) {
      if(stream.writableEnded||stream.destroyed)continue;
      if(stream.writableLength>262144){stream.end();continue;}
      const encoder=this.snapshotStreams.get(stream);
      const payload=encoder?JSON.stringify(encoder.encode(snapshot,{context,signatureCache})):(fullJson??=JSON.stringify(snapshot));
      stream.write(`event: snapshot\ndata: ${payload}\n\n`);
    }
  }
  _broadcastRoom(room){
    this._broadcastAvailabilityCache=new WeakMap();
    this._frameSignatureCache=createSnapshotSignatureCache();this._frameSemanticCache=new WeakMap();this._framePartyCache=new WeakMap();
    try{for(const member of room.members.values())this._broadcast(member);}
    finally{this._broadcastAvailabilityCache=null;this._frameSignatureCache=null;this._frameSemanticCache=null;this._framePartyCache=null;}
  }
  _pvpAvailability(member){
    const cache=this._broadcastAvailabilityCache;if(!cache)return this.pvp.availability(member);
    if(cache.has(member))return cache.get(member);
    const value=this.pvp.availability(member);cache.set(member,value);return value;
  }
  _snapshotContext(member,snapshot){
    const world=member.game.world;
    return JSON.stringify([snapshot.roomCode,snapshot.playerId,snapshot.worldMode,world.seed,world.width,world.height,snapshot.dungeonInstance?.id,snapshot.dungeonInstance?.tier,snapshot.pvp?.duel?.id]);
  }
  _remove(member) {
    this.pvp.disconnect(member);
    for(const stream of member.streams)stream.end();member.streams.clear();member.game.keys.clear();
    member.room.members.delete(member.id);this.sessions.delete(member.token);
    if(member.accountId)this.accountMembers.delete(member.accountId);
    member.room.lastActive=this.clock();
    const source=member.room.members.values().next().value?.game;
    if(source)this._syncRoom(member.room,source);
  }
  capture() {
    return {version:1,savedAt:this.clock(),...(this.accounts.records.size?{accounts:this.accounts.capture()}:{}),rooms:[...this.rooms.values()].map(room=>{
      const leader=room.members.values().next().value?.game;
      const persistentWorld=leader?.dungeonInstance?leader.overworld:room.world;
      return {code:room.code,name:room.name,createdAt:room.createdAt,lastActive:room.lastActive,time:room.time,...(room.accountHome?{accountHome:true,accountOwnerId:room.accountOwnerId}:{}),worldMode:leader?.dungeonInstance?'dungeon':'overworld',dungeonCheckpoint:leader?.captureDungeonCheckpoint?.()||null,world:clone(Object.fromEntries([...MUTABLE_WORLD,'structures'].filter(key=>persistentWorld?.[key]!==undefined).map(key=>[key,persistentWorld[key]]))),members:[...room.members.values()].map(m=>({id:m.id,...(m.accountId?{accountId:m.accountId}:{token:m.token}),classId:m.game.classId,eventSequence:m.eventSequence,save:m.game.capture()}))};
    })};
  }
  persist() {
    try{this.storage?.setItem(STORE_KEY,JSON.stringify(this.capture()));this.lastStorageError=null;return true;}catch(error){this.lastStorageError=error.message;return false;}
  }
  restore() {
    let data;try{data=JSON.parse(this.storage?.getItem(STORE_KEY)||'null');}catch(error){if(this.strictRestore)throw new Error('Der Gruppenspeicher enthält keine lesbare Reise.',{cause:error});return;}
    if(data?.version!==1||!Array.isArray(data.rooms)){if(data!==null&&this.strictRestore)throw new Error('Der Gruppenspeicher besitzt eine unbekannte Reiseversion.');return;}
    this.accounts.restore(data.accounts);
    // Admission limits never truncate the lifetime save roster, including
    // older stores above today's limits. Personal resume tokens are retained.
    for(const saved of data.rooms) {
      if(typeof saved.code!=='string'||!/^[A-F0-9]{8}$/.test(saved.code)||!Array.isArray(saved.members)){if(this.strictRestore)throw new Error('Der Gruppenspeicher besitzt eine ungültige Gruppe.');continue;}
      if(saved.accountHome!==undefined&&(saved.accountHome!==true||typeof saved.accountOwnerId!=='string'||!this.accounts.records.has(saved.accountOwnerId)))throw new Error('Ungültige persönliche Reise.');
      const room={code:saved.code,name:cleanName(saved.name,'Glutgruppe'),createdAt:saved.createdAt||this.clock(),lastActive:this.clock(),time:Number.isFinite(saved.time)?saved.time:0,members:new Map(),world:null,...(saved.accountHome?{accountHome:true,accountOwnerId:saved.accountOwnerId}:{})};
      this.rooms.set(room.code,room);
      for(const entry of saved.members) {
        try {
          if(room.accountHome&&entry.accountId!==room.accountOwnerId)throw new Error('Ungültiger Charakter in einer persönlichen Reise.');
          if(entry.accountId!==undefined&&(typeof entry.accountId!=='string'||!this.accounts.records.has(entry.accountId)||this.accountMembers.has(entry.accountId)))throw new Error('Ungültiger Charakterbesitzer.');
          const member=this._createMember(room,{playerName:entry.save?.player?.name,classId:entry.classId},entry.accountId||null);
          const resumeDungeon=saved.worldMode==='dungeon'&&saved.dungeonCheckpoint;
          const portableSave=resumeDungeon?{...entry.save,dungeon:{...saved.dungeonCheckpoint,returnPoint:entry.save?.dungeon?.returnPoint||saved.dungeonCheckpoint.returnPoint}}:entry.save;
          const resumeRaid=!!(resumeDungeon&&DUNGEONS.some(definition=>definition.id===saved.dungeonCheckpoint.id&&definition.raid));
          member.game.applySave(portableSave,{preserveDowned:resumeRaid});
          if(member.game.dungeonInstance&&!resumeDungeon)member.game.exitDungeon();
          member.game.player.name=cleanName(entry.save?.player?.name,'Reisender');
          member.eventSequence=Number.isSafeInteger(entry.eventSequence)?entry.eventSequence:0;member.events=[];
          this.sessions.delete(member.token);member.token=!member.accountId&&typeof entry.token==='string'&&/^[\w-]{43}$/.test(entry.token)?entry.token:randomBytes(32).toString('base64url');
          member.id=typeof entry.id==='string'?entry.id:member.id;member.game.player.id=member.id;
          member.active=false;
          room.members.delete([...room.members].find(([,m])=>m===member)?.[0]);room.members.set(member.id,member);this.sessions.set(member.token,member);
          // applySave replaces the world and dungeon instance. Make this
          // validated checkpoint the shared source before restoring another
          // member, whose join would otherwise reuse the old overworld.
          this._syncRoom(room,member.game);
        } catch(error){if(this.strictRestore)throw new Error('Eine gespeicherte Gruppenreise konnte nicht sicher fortgesetzt werden.',{cause:error});}
      }
      const leader=room.members.values().next().value?.game;
      if(!leader){this.rooms.delete(room.code);continue;}
      room.waitingForRaidResume=!!(saved.worldMode==='dungeon'&&leader.dungeonInstance?.definition.raid&&leader.dungeonInstance.bossEngaged&&!leader.dungeonInstance.bossDefeated);
      // New rooms retain one canonical shared dungeon checkpoint. Older saves
      // keep their safe return behavior. The overworld remains a separate world.
      const persistentWorld=leader.dungeonInstance?leader.overworld:leader.world;
      if(['overworld','dungeon'].includes(saved.worldMode))for(const key of MUTABLE_WORLD)if(!['worldEvents','eventObjects'].includes(key)&&saved.world?.[key]!==undefined&&persistentWorld[key]!==undefined)persistentWorld[key]=saved.world[key];
      // Creating the first restore member initializes a fresh room at zero.
      // Restore the shared clock too, so absolute crop and resource deadlines
      // keep their remaining duration after a server restart.
      room.time=Number.isFinite(saved.time)?Math.max(0,saved.time):leader.time;
      for(const member of room.members.values())member.game.time=room.time;
      // The raw shared-world overlay must not bypass the portable boss-rest
      // ledger or turn old JSON-null Infinity timers into immediate respawns.
      const leaderSave=saved.members.find(entry=>entry.id===leader.player.id)?.save;
      for(const enemy of persistentWorld.enemies)if(!enemy.alive&&Catalog.ENEMY_TYPES[enemy.type]?.boss&&Catalog.ENEMY_TYPES[enemy.type]?.baseType&&!enemy.challengeId&&!enemy.eventId) {
        const remaining=leaderSave?.world?.championRespawns?.find(rest=>rest.id===enemy.id)?.remaining;
        enemy.respawnAt=room.time+(Number.isFinite(remaining)?Math.max(0,Math.min(360,remaining)):360);
      }
      // Keep generated definitions and prop layouts when old rooms acquire new
      // content. Only portable progress overlays canonical events; interrupted
      // runs fail safely and their saved guards cannot revive on restart.
      const eventProgress=leaderSave?.world?.worldEvents??(Array.isArray(saved.world?.worldEvents)?captureWorldEvents({worldEvents:saved.world.worldEvents}):undefined);
      if(Array.isArray(persistentWorld.worldEvents))restoreWorldEvents(persistentWorld,eventProgress,room.time);
      // Rebuild director enemies from canonical plans, including their spent
      // rewards and relative wilderness timers. Raw room actors never decide
      // difficulty, HP budgets, ownership or whether a dead spawn can revive.
      restoreEncounterDirector(persistentWorld,leaderSave?.world?.encounterDirector);
      this._syncRoom(room,leader);
      // Restored members already belong to this exact checkpoint. Fresh object
      // identities during reconstruction must not teleport them on activation.
      for(const member of room.members.values())member.needsTeleport=false;
    }
    for(const account of this.accounts.records.values()){
      const member=this.accountMembers.get(account.id);
      if(!member||member.id!==account.memberId)throw new Error('Der Kontencharakter konnte nicht sicher zugeordnet werden.');
      if(member.room.accountHome&&member.room.accountOwnerId!==account.id)throw new Error('Ungültiger Besitzer der persönlichen Reise.');
    }
  }
  _accountProfile(account) {
    const member=this.accountMembers.get(account.id),p=member?.game.player;
    return {id:account.id,username:account.username,playerName:p?.name||'Reisender',classId:member?.game.classId||null,level:p?.level||1};
  }
  _accountMember(auth) {
    if(!auth)throw new HttpError(401,'Melde dich zuerst bei deinem Konto an.');
    const member=this.accountMembers.get(auth.account.id);
    if(!member||member.id!==auth.account.memberId||member.accountId!==auth.account.id)throw new HttpError(503,'Dein gespeicherter Charakter ist gerade nicht verfügbar.');
    return member;
  }
  _assertOwner(req,member,auth,version) {
    const current=this.accounts.authenticate(req);
    if(member.accountId&&(!current||current.account.id!==member.accountId||auth&&current.key!==auth.key))throw new HttpError(401,'Deine Anmeldung ist abgelaufen. Melde dich erneut an.');
    if(this.sessions.get(member.token)!==member||version!==undefined&&member.membershipVersion!==version)throw new HttpError(409,'Die Gruppe hat sich geändert. Verbinde dich erneut.');
    return current;
  }
  _assertActor(req,member,{required=false,playerId=req.headers['x-emberfall-player-id']}={}) {
    if((required||playerId!==undefined)&&playerId!==member.id)throw new HttpError(409,'Der Charakter oder die Anmeldung dieses Tabs hat sich geändert. Verbinde dich erneut.');
  }
  _activeRoomCount(){return [...this.rooms.values()].filter(r=>[...r.members.values()].some(m=>m.active)).length;}
  _publicRoomCount(){return [...this.rooms.values()].filter(r=>!r.accountHome).length;}
  _assertDestination(room,member) {
    if(room.accountHome&&room.accountOwnerId!==member.accountId)throw new HttpError(404,'Diese Gruppe existiert nicht.');
    if(room===member.room)return;
    const game=member.game;
    if(game.dead||game.dungeonInstance||this.pvp.occupied(member)||game.inCombat())throw new HttpError(409,'Wechsle die Gruppe außerhalb von Kämpfen und Dungeons mit einem lebenden Charakter.');
    if([...room.members.values()].some(m=>m.game.dungeonInstance||this.pvp.occupied(m)))throw new HttpError(409,'Diese Gruppe befindet sich im Dungeon oder im Duell. Warte auf ihre Rückkehr.');
    if([...room.members.values()].filter(m=>m.active).length>=this.maxPlayers)throw new HttpError(409,'Die Gruppe ist voll.');
    if(room.members.size>=this.maxSavedCharactersPerRoom)throw new HttpError(409,'Diese Gruppe kann keine weiteren Charaktere speichern.');
    const targetActive=[...room.members.values()].some(m=>m.active);
    const releasesSource=member.active&&![...member.room.members.values()].some(m=>m!==member&&m.active);
    if(!targetActive&&this._activeRoomCount()-(releasesSource?1:0)>=this.maxRooms)throw new HttpError(503,'Alle aktiven Welten des Servers sind belegt. Dein Charakter bleibt gespeichert.');
  }
  _newAccountRoom(member,{name='Glutgruppe',home=false}={}) {
    const freesPublicRoom=!member.room.accountHome&&member.room.members.size===1;
    if(!home&&this._publicRoomCount()-(freesPublicRoom?1:0)>=this.maxSavedRooms)throw new HttpError(503,'Der Server kann keine weiteren Gruppen speichern.');
    // Reconstruct a canonical world from server progress. Never share a world
    // object with the source room or import a browser-owned save.
    const seedGame=this.createGame({classId:member.game.classId,playerName:member.game.player.name});
    seedGame.applySave(member.game.capture(),{preserveDowned:true});
    const room={code:this._code(),name:home?'Persönliche Reise':cleanName(name,'Glutgruppe'),createdAt:this.clock(),lastActive:this.clock(),time:seedGame.time,members:new Map(),world:seedGame.world,_initialShared:Object.fromEntries(SHARED_FIELDS.map(key=>[key,seedGame[key]])),...(home?{accountHome:true,accountOwnerId:member.accountId}:{})};
    return room;
  }
  _transferAccount(member,target,{newRoom=false}={}) {
    this._assertDestination(target,member);
    if(target===member.room){this._activate(member);return member;}
    const source=member.room,game=member.game,oldToken=member.token;
    const sourceMembers=new Map(source.members),targetMembers=new Map(target.members),sourceWorld=source.world,targetWorld=target.world;
    const sourceShared=Object.fromEntries(SHARED_FIELDS.map(key=>[key,game[key]]));
    const restoreFields=Object.fromEntries(['world','time','partyGames','multiplayer','npcs','keys','aim','camera','lastRegion','combo','comboTime',...SHARED_FIELDS].map(key=>[key,game[key]]));
    const oldPlayer=game.player,oldBuffs=game.buffs,oldGrace=game.damageGrace,oldLeech=game.leechBudget;
    const oldMember={room:member.room,active:member.active,token:member.token,membershipVersion:member.membershipVersion,layoutKey:member.layoutKey,needsTeleport:member.needsTeleport,lastSeen:member.lastSeen,lastInput:member.lastInput};
    try{
      const leader=[...target.members.values()].find(m=>m.active)?.game||target.members.values().next().value?.game;
      const shared=leader||target._initialShared;
      if(!shared)throw new HttpError(503,'Diese Gruppenwelt ist gerade nicht verfügbar.');
      const oldTime=game.time,delta=target.time-oldTime,rebased=value=>Number.isFinite(value)?Math.max(target.time,value+delta):value;
      game.player={...oldPlayer};
      for(const field of ['attackUntil','castUntil','dashUntil','hitUntil','shieldUntil','slowUntil','healingReductionUntil','raidSlowUntil','raidHealingUntil'])if(Number.isFinite(game.player[field]))game.player[field]=rebased(game.player[field]);
      // Transfer is blocked for five seconds after damage. Keeping a negative
      // lastDamageAt in a younger world would make later reloads inconsistent.
      delete game.player.lastDamageAt;
      delete game.player.presentation;
      game.player.afflictions=(oldPlayer.afflictions||[]).filter(a=>a.expiresAt>oldTime).map(a=>({...a,expiresAt:rebased(a.expiresAt),nextTick:rebased(a.nextTick)}));
      game.buffs=oldBuffs.filter(b=>b.expiresAt>oldTime).map(b=>({...b,expiresAt:rebased(b.expiresAt)}));game.damageGrace=new Map([...oldGrace].filter(([,until])=>until>oldTime).map(([key,value])=>[key,rebased(value)]));
      game.leechBudget=oldLeech?{...oldLeech,time:oldLeech.time+delta}:null;
      game.world=target.world;game.time=target.time;game.npcs=Catalog.NPCS;
      for(const field of SHARED_FIELDS)game[field]=shared[field];
      const anchor=leader?.player||{x:520,y:1250};game.player.x=anchor.x+28;game.player.y=anchor.y+28;
      if(game.collides(game.player.x,game.player.y)){game.player.x=anchor.x;game.player.y=anchor.y;}
      game.camera={x:game.player.x,y:game.player.y};game.lastRegion=game.regionAt().id;game.keys=new Set();game.aim=null;game.player.walking=false;game.combo=0;game.comboTime=-Infinity;
      source.members.delete(member.id);target.members.set(member.id,member);member.room=target;member.active=true;member.membershipVersion++;member.layoutKey=null;member.needsTeleport=false;member.lastSeen=this.clock();member.lastInput=this.clock();
      this.sessions.delete(oldToken);member.token=randomBytes(32).toString('base64url');this.sessions.set(member.token,member);
      if(newRoom)this.rooms.set(target.code,target);
      const sourceLeader=source.members.values().next().value?.game;
      if(sourceLeader){
        // A departed actor's delayed hits must not fall back to the old room's
        // leader and award another character its combat or loot credit.
        for(const key of ['effects','projectiles','hazards','summons'])sourceLeader[key]=sourceLeader[key].filter(effect=>effect.actorId!==member.id);
        this._syncRoom(source,sourceLeader);
      }
      this._syncRoom(target,leader||game);
      // Empty source rooms own no progression and must not exhaust the saved
      // public-room budget after repeated account group changes.
      if(!source.members.size)this.rooms.delete(source.code);
      if(!this.persist())throw new HttpError(503,'Deine Reise konnte nicht gespeichert werden. Die bisherige Gruppe bleibt bestehen.');
      delete target._initialShared;
      for(const stream of member.streams)stream.end();member.streams.clear();
      this._event(member,{kind:'notice',text:target.accountHome?'Deine persönliche Serverreise ist bereit.':`Gruppe ${target.code} · Dein Charakter reist mit.`,tone:'quest'});
      return member;
    }catch(error){
      source.members=sourceMembers;target.members=targetMembers;source.world=sourceWorld;target.world=targetWorld;
      this.rooms.set(source.code,source);if(newRoom)this.rooms.delete(target.code);
      this.sessions.delete(member.token);Object.assign(member,oldMember);this.sessions.set(oldToken,member);
      Object.assign(game,restoreFields);game.player=oldPlayer;game.buffs=oldBuffs;game.damageGrace=oldGrace;game.leechBudget=oldLeech;
      const sourceLeader=source.members.values().next().value?.game;if(sourceLeader){Object.assign(sourceLeader,sourceShared);this._syncRoom(source,sourceLeader);}
      const targetLeader=target.members.values().next().value?.game;if(targetLeader)this._syncRoom(target,targetLeader);
      throw error;
    }
  }
  _connectionResponse(member){return {accountOwned:true,privateWorld:!!member.room.accountHome,roomCode:member.room.code,playerId:member.id,snapshot:this.snapshot(member,{includeLayout:true})};}
  _closeAccountStreams(member,key) {
    for(const stream of [...member.streams])if(!key||this.accountStreamSessions.get(stream)===key){stream.end();member.streams.delete(stream);}
    member.game.keys.clear();
    if(!member.streams.size){member.game.keys.clear();member.active=false;member.lastSeen=this.clock()-this.disconnectMs-1;this.pvp.disconnect(member);}
  }
  _stream(req,res,member,url,auth=null) {
    if(member.streams.size>=this.maxSessionStreams)throw new HttpError(429,'Für diese Sitzung sind bereits zu viele Gruppenverbindungen geöffnet. Schließe einen anderen Spieltab.');
    this._activate(member);member.lastSeen=this.clock();
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
    const initial=this.snapshot(member,{includeLayout:true});let payload=initial;
    if(url.searchParams.get('deltas')==='1'){const encoder=new SnapshotEncoder();payload=encoder.encode(initial,{context:this._snapshotContext(member,initial)});this.snapshotStreams.set(res,encoder);}
    if(auth)this.accountStreamSessions.set(res,auth.key);
    res.write(`retry: 1200\nevent: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);member.streams.add(res);
    res.on('close',()=>{member.streams.delete(res);if(!member.streams.size){member.game.keys.clear();member.lastSeen=this.clock();}});return true;
  }
  async _handleAccount(req,res,url) {
    const auth=this.accounts.authenticate(req),route=url.pathname.slice('/api/account'.length);
    if(req.method==='GET'&&route==='')return this._json(res,200,{account:auth?this._accountProfile(auth.account):null,...(auth?{roomCode:this._accountMember(auth).room.code,privateWorld:!!this._accountMember(auth).room.accountHome}:{}),requiresHTTPS:this.accounts.requireSecure&&!this.accounts.isSecure(req),secureOrigin:this.accounts.secureOrigin});
    if(req.method==='POST'&&['/register','/login'].includes(route)){
      const body=await readJson(req);
      if(route==='/register'&&!classIds().includes(body?.classId||'guardian'))throw new HttpError(400,'Unbekannte Klasse.');
      const account=route==='/register'?await this.accounts.prepareRegistration(body,req):await this.accounts.verifyLogin(body,req);
      const sessionsBefore=new Map(this.accounts.sessions);let member,room;
      try{
        if(route==='/register'){
          this.accounts.add(account);
          room={code:this._code(),name:'Persönliche Reise',accountHome:true,accountOwnerId:account.id,createdAt:this.clock(),lastActive:this.clock(),time:0,members:new Map(),world:null};
          this.rooms.set(room.code,room);member=this._createMember(room,{playerName:body.playerName||body.username,classId:body.classId||'guardian'},account.id);member.active=false;account.memberId=member.id;
        }
        const issued=this.accounts.issue(account);
        if(!this.persist())throw new HttpError(503,'Deine Anmeldung konnte nicht sicher gespeichert werden. Bitte versuche es erneut.');
        res.setHeader('Set-Cookie',this.accounts.cookie(issued.token));return this._json(res,route==='/register'?201:200,{account:this._accountProfile(account),roomCode:this.accountMembers.get(account.id).room.code,privateWorld:!!this.accountMembers.get(account.id).room.accountHome});
      }catch(error){
        this.accounts.sessions=sessionsBefore;
        if(route==='/register'){if(member)this._remove(member);if(room)this.rooms.delete(room.code);this.accounts.remove(account);}
        throw error;
      }
    }
    if(!auth)throw new HttpError(401,'Melde dich zuerst bei deinem Konto an.');
    const member=this._accountMember(auth),version=member.membershipVersion;
    if(req.method==='POST'&&route==='/logout'){
      await readJson(req);this._assertOwner(req,member,auth,version);
      const previous=this.accounts.sessions.get(auth.key);this.accounts.sessions.delete(auth.key);
      if(!this.persist()){this.accounts.sessions.set(auth.key,previous);throw new HttpError(503,'Abmelden konnte nicht sicher gespeichert werden.');}
      member.membershipVersion++;this._closeAccountStreams(member,auth.key);res.setHeader('Set-Cookie',this.accounts.clearCookie());return this._json(res,200,{ok:true});
    }
    if(req.method==='POST'&&route==='/play'){
      const body=await readJson(req);this._assertOwner(req,member,auth,version);
      if(body?.solo===true&&!member.room.accountHome){const home=this._newAccountRoom(member,{home:true});this._transferAccount(member,home,{newRoom:true});}
      else this._activate(member);
      member.lastSeen=this.clock();return this._json(res,200,this._connectionResponse(member));
    }
    if(req.method==='GET'&&route==='/play'){this._activate(member);member.lastSeen=this.clock();return this._json(res,200,this.snapshot(member,{includeLayout:true}));}
    if(req.method==='GET'&&route==='/play/events'){this._assertActor(req,member,{required:true,playerId:url.searchParams.get('playerId')});return this._stream(req,res,member,url,auth);}
    if(req.method==='POST'&&route==='/play/command'){
      this._assertActor(req,member,{required:true});
      const command=await readJson(req);this._assertOwner(req,member,auth,version);this._commandLimit(member);this._activate(member);member.lastSeen=this.clock();
      const accepted=this.command(member,command);this._syncRoom(member.room,member.game);return this._json(res,200,{accepted,sequence:this.frames});
    }
    if(req.method==='POST'&&route==='/play/leave'){
      this._assertActor(req,member);
      await readJson(req);this._assertOwner(req,member,auth,version);
      if(!member.room.accountHome){const home=this._newAccountRoom(member,{home:true});this._transferAccount(member,home,{newRoom:true});}
      else this._activate(member);
      return this._json(res,200,this._connectionResponse(member));
    }
    if(req.method==='POST'&&(route==='/rooms'||/^\/rooms\/[A-Fa-f0-9]{8}\/join$/.test(route))){
      this._assertActor(req,member);
      const body=await readJson(req);this._assertOwner(req,member,auth,version);this._creationLimit(req);
      let target,newRoom=false;
      if(route==='/rooms'){target=this._newAccountRoom(member,{name:body?.name});newRoom=true;}
      else {target=this.rooms.get(route.split('/')[2].toUpperCase());if(!target||target.accountHome)throw new HttpError(404,'Diese Gruppe existiert nicht.');}
      this._transferAccount(member,target,{newRoom});return this._json(res,newRoom?201:200,this._connectionResponse(member));
    }
    throw new HttpError(404,'Unbekannter Konto-Endpunkt.');
  }
  _origin(req,res) {
    const origin=req.headers.origin;
    if(!origin)return;
    let same=false;try{const url=new URL(origin);same=['http:','https:'].includes(url.protocol)&&url.host===req.headers.host;}catch{}
    if(!same&&origin!==this.allowedOrigin)throw new HttpError(403,'Diese Spielgruppe ist nur für den freigegebenen Spielserver erreichbar.');
    if(origin===this.allowedOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');}
    res.setHeader('Vary','Origin');
  }
  async handle(req,res) {
    const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/'))return false;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try {
      this._origin(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Emberfall-Player-Id'}).end();return true;}
      if(url.pathname==='/api/account'||url.pathname.startsWith('/api/account/'))return await this._handleAccount(req,res,url);
      if(req.method==='GET'&&url.pathname==='/api/rooms') {
        return this._json(res,200,{protocol:1,rooms:[...this.rooms.values()].filter(r=>!r.accountHome&&[...r.members.values()].some(m=>m.active)).map(r=>({code:r.code,name:r.name,players:[...r.members.values()].filter(m=>m.active).length,maxPlayers:this.maxPlayers,createdAt:r.createdAt,joinable:[...r.members.values()].filter(m=>m.active).length<this.maxPlayers&&r.members.size<this.maxSavedCharactersPerRoom&&![...r.members.values()].some(m=>m.game.dungeonInstance||this.pvp.occupied(m))})),maxPlayers:this.maxPlayers,classes:classIds()});
      }
      if(req.method==='POST'&&url.pathname==='/api/rooms') {
        if(this.accounts.authenticate(req)){url.pathname='/api/account/rooms';return await this._handleAccount(req,res,url);}
        const body=await readJson(req);this._creationLimit(req);
        if(this._activeRoomCount()>=this.maxRooms)throw new HttpError(503,'Alle Gruppenplätze des Servers sind belegt.');
        if(this._publicRoomCount()>=this.maxSavedRooms)throw new HttpError(503,'Der Server kann keine weiteren Gruppen speichern. Bestehende Reisen können fortgesetzt werden.');
        const room={code:this._code(),name:cleanName(body.name,'Glutgruppe'),createdAt:this.clock(),lastActive:this.clock(),time:0,members:new Map(),world:null};
        this.rooms.set(room.code,room);
        let member;try{member=this._createMember(room,body);}catch(error){this.rooms.delete(room.code);throw error;}
        this.persist();return this._json(res,201,{token:member.token,roomCode:room.code,playerId:member.id,snapshot:this.snapshot(member,{includeLayout:true})});
      }
      const join=url.pathname.match(/^\/api\/rooms\/([A-Fa-f0-9]{8})\/join$/);
      if(req.method==='POST'&&join) {
        if(this.accounts.authenticate(req)){url.pathname='/api/account'+url.pathname.slice(4);return await this._handleAccount(req,res,url);}
        const body=await readJson(req);this._creationLimit(req);const room=this.rooms.get(join[1].toUpperCase());
        if(!room||room.accountHome)throw new HttpError(404,'Diese Gruppe existiert nicht.');
        if([...room.members.values()].filter(m=>m.active).length>=this.maxPlayers)throw new HttpError(409,'Die Gruppe ist voll.');
        if(room.members.size>=this.maxSavedCharactersPerRoom)throw new HttpError(409,'Diese Gruppe kann keine weiteren Charaktere speichern. Setze deine bestehende Reise mit ihrer gespeicherten Sitzung fort.');
        if(![...room.members.values()].some(m=>m.active)&&[...this.rooms.values()].filter(r=>[...r.members.values()].some(m=>m.active)).length>=this.maxRooms)throw new HttpError(503,'Alle Gruppenplätze des Servers sind belegt.');
        if([...room.members.values()].some(member=>member.game.dungeonInstance))throw new HttpError(409,'Der Dungeon läuft bereits. Kehre mit deiner bestehenden Sitzung zurück oder warte, bis die Gruppe den Dungeon verlässt.');
        const member=this._createMember(room,body);this.persist();
        return this._json(res,201,{token:member.token,roomCode:room.code,playerId:member.id,snapshot:this.snapshot(member,{includeLayout:true})});
      }
      const session=url.pathname.match(/^\/api\/session\/([\w-]{43})(?:\/(events|command|leave))?$/);
      if(!session)throw new HttpError(404,'Unbekannter Spielserver-Endpunkt.');
      const member=this.sessions.get(session[1]);if(!member)throw new HttpError(401,'Die Sitzung ist abgelaufen. Erstelle eine neue Gruppe oder tritt erneut bei.');
      const auth=this._assertOwner(req,member,null,member.membershipVersion),version=member.membershipVersion;
      if(req.method==='GET'&&!session[2]){this._activate(member);member.lastSeen=this.clock();return this._json(res,200,this.snapshot(member,{includeLayout:true}));}
      if(req.method==='GET'&&session[2]==='events')return this._stream(req,res,member,url,auth);
      if(req.method==='POST'&&session[2]==='leave') {
        await readJson(req);this._assertOwner(req,member,auth,version);
        if(member.accountId){url.pathname='/api/account/play/leave';const home=this._newAccountRoom(member,{home:true});this._transferAccount(member,home,{newRoom:true});return this._json(res,200,this._connectionResponse(member));}
        this.pvp.disconnect(member);
        member.active=false;member.game.keys.clear();member.lastSeen=this.clock()-this.disconnectMs-1;
        for(const stream of member.streams)stream.end();member.streams.clear();
        const leader=[...member.room.members.values()].find(m=>m.active)?.game;
        if(leader)this._syncRoom(member.room,leader);
        this.persist();return this._json(res,200,{ok:true});
      }
      if(req.method==='POST'&&session[2]==='command') {
        const command=await readJson(req);this._assertOwner(req,member,auth,version);this._commandLimit(member);this._activate(member);member.lastSeen=this.clock();
        const accepted=this.command(member,command);this._syncRoom(member.room,member.game);
        return this._json(res,200,{accepted,sequence:this.frames});
      }
      throw new HttpError(405,'Methode nicht unterstützt.');
    } catch(error) {
      if(!res.headersSent)this._json(res,error.status||500,{error:error.status?error.message:'Der Spielserver konnte diese Anfrage nicht verarbeiten.'});else res.end();
      return true;
    }
  }
  command(member,command) {
    const game=member.game;
    if(!command||typeof command!=='object'||Array.isArray(command))throw new HttpError(400,'Ungültiger Spielbefehl.');
    // After a restart, a saved warning waits for the required humans to return.
    // Joining late must not turn this pause into free attacks or movement.
    if(member.room.waitingForRaidResume&&['action','input'].includes(command.type)){game.keys.clear();return false;}
    if(member.room.waitingForRaidResume&&command.type==='method'&&!['setSetting','equip','unequip','learn','learnAbility','setAbilityLoadout','setItemFlag','trackQuest','setWaypoint','saveLoadout','applyLoadout','deleteLoadout','exitDungeon','leaveDungeon'].includes(command.name))return false;
    if(command.type==='input') {
      if(Object.keys(command).some(k=>!['type','keys','angle'].includes(k))||!Array.isArray(command.keys)||command.keys.length>8||command.keys.some(k=>!KEYS.has(k))||!Number.isFinite(command.angle))throw new HttpError(400,'Nur Bewegungstasten und Blickrichtung werden angenommen.');
      if(this.pvp.occupied(member)){member.lastInput=this.clock();return this.pvp.input(member,command.keys,command.angle);}
      game.keys=new Set(command.keys);game.player.face=Math.atan2(Math.sin(command.angle),Math.cos(command.angle));
      member.aimAngle=game.player.face;
      game.aim={x:game.player.x+Math.cos(game.player.face)*100,y:game.player.y+Math.sin(game.player.face)*100};
      member.lastInput=this.clock();return true;
    }
    if(command.type==='action') {
      if(Object.keys(command).some(k=>!['type','name'].includes(k))||!ACTIONS.has(command.name))throw new HttpError(400,'Ungültige Fähigkeit.');
      if(this.pvp.occupied(member))return this.pvp.action(member,command.name);
      if(command.name==='interact'&&['dungeon','exit'].includes(game.nearby()?.kind)&&[...member.room.members.values()].some(m=>this.pvp.occupied(m))) {
        this._event(member,{kind:'notice',text:'Warte mit dem Gruppenwechsel, bis alle Duellanten zurückgekehrt sind.',tone:'info'});return false;
      }
      return !!game.action(command.name);
    }
    if(command.type==='method') {
      if(Object.keys(command).some(k=>!['type','name','args'].includes(k))||!METHODS.has(command.name)||!Array.isArray(command.args)||command.args.length>2||command.args.some((v,i)=>typeof v!=='string'&&!Number.isFinite(v)&&!(typeof v==='boolean'&&command.name==='setSetting'&&i===1)&&!(v===null&&(command.name==='setAbilityLoadout'&&i===1||['selectCompanion','selectTechniqueSpecialization'].includes(command.name)&&i===0)))||command.args.some(v=>typeof v==='string'&&v.length>120))throw new HttpError(400,'Ungültiger Spielbefehl.');
      if(PVP_METHODS.has(command.name)) {
        const withId=['pvpInvite','pvpAccept','pvpDecline'].includes(command.name);
        if(command.args.length!==(withId?1:0)||withId&&typeof command.args[0]!=='string')throw new HttpError(400,'Ungültige Duellparameter.');
        const name=command.name.slice(3).toLowerCase();return this.pvp[name](member,...command.args);
      }
      if(this.pvp.occupied(member)&&command.name!=='setSetting'){this._event(member,{kind:'notice',text:'Diese Reiseaktion ist während eines Duells gesperrt.',tone:'info'});return false;}
      if(['enterDungeon','exitDungeon','leaveDungeon'].includes(command.name)&&[...member.room.members.values()].some(m=>this.pvp.occupied(m))) {
        this._event(member,{kind:'notice',text:'Warte mit dem Gruppenwechsel, bis alle Duellanten zurückgekehrt sind.',tone:'info'});return false;
      }
      if(typeof game[command.name]!=='function')throw new HttpError(400,'Diese Aktion ist noch nicht verfügbar.');
      if(command.name==='setSetting') {
        const [key,value]=command.args;
        if(command.args.length!==2||typeof key!=='string'||(!(['sound','shake','reducedMotion'].includes(key)&&typeof value==='boolean')&&!(['masterVolume','musicVolume','effectsVolume'].includes(key)&&Number.isFinite(value)&&value>=0&&value<=1)))throw new HttpError(400,'Ungültige Audio- oder Darstellungsoption.');
      }
      if(['learn','trainProfession','learnTechniqueSpecialization','interactWorldObject','pickupLoot','craft'].includes(command.name)&&(command.args.length!==1||typeof command.args[0]!=='string'||command.name==='pickupLoot'&&!command.args[0].length))throw new HttpError(400,'Diese Aktion benötigt eine bekannte Kennung.');
      if(command.name==='chooseProfessionMastery'&&(command.args.length!==2||command.args.some(value=>typeof value!=='string'))||command.name==='socket'&&(command.args.length!==2||command.args.some(value=>typeof value!=='string')))throw new HttpError(400,'Diese Berufsaktion benötigt genau zwei bekannte Kennungen.');
      if(['depositItem','withdrawItem','saveLoadout','applyLoadout','deleteLoadout','trackQuest','claimAchievement','chooseMastery','claimWorldEvent','startHunt','abandonHunt','claimHunt','redeemHuntReward'].includes(command.name)&&(command.args.length!==1||typeof command.args[0]!=='string'))throw new HttpError(400,'Diese Aktion benötigt eine bekannte Kennung.');
      if(['selectCompanion','selectTechniqueSpecialization'].includes(command.name)&&(command.args.length!==1||command.args[0]!==null&&typeof command.args[0]!=='string')||command.name==='respecTalents'&&command.args.length!==0||['setItemFlag','setWaypoint'].includes(command.name)&&(command.args.length!==2||command.args.some(value=>typeof value!=='string'))||command.name==='interactWorldEvent'&&(command.args.length<1||command.args.some(value=>typeof value!=='string')))throw new HttpError(400,'Ungültige Parameter für diese Reiseaktion.');
      if(command.name==='setItemFlag'&&!['favorite','locked'].includes(command.args[1])||command.name==='setWaypoint'&&!['npc','shrine','quest','event','interaction','dungeon','region','clear'].includes(command.args[0]))throw new HttpError(400,'Unbekannte Markierung.');
      if(command.name==='learnAbility'&&(command.args.length!==1||typeof command.args[0]!=='string')||command.name==='useLearnedAbility'&&(command.args.length!==1||!Number.isInteger(command.args[0])||command.args[0]<0||command.args[0]>1)||command.name==='setAbilityLoadout'&&(command.args.length!==2||!Number.isInteger(command.args[0])||command.args[0]<0||command.args[0]>1||command.args[1]!==null&&typeof command.args[1]!=='string')||command.name==='unequip'&&(command.args.length!==1||!EQUIPMENT_SLOT_IDS.includes(command.args[0])))throw new HttpError(400,'Ungültige Fähigkeiten- oder Ausrüstungsparameter.');
      if(['questAccept','questTurnIn'].includes(command.name)) {
        const quest=Catalog.QUESTS.find(q=>q.id===command.args[0]),npc=game.npcs.find(n=>n.id===quest?.giver);
        if(!npc||distance(game.player,npc)>110)throw new HttpError(409,'Sprich zuerst mit dem Questgeber in deiner Nähe.');
      }
      if(command.name==='buy') {
        const nearby=game.npcs.filter(n=>SHOP_STOCK[n.id]&&distance(game.player,n)<120);
        if(!nearby.length)throw new HttpError(409,'Ein Händler muss in deiner Nähe sein.');
        if(!command.args.length||typeof command.args[0]!=='string')throw new HttpError(400,'Wähle eine Ware aus dem Angebot.');
        const offered=nearby.some(n=>SHOP_STOCK[n.id].has(command.args[0])||[...getArsenalShopStock({level:game.player.level,classId:game.player.classId,merchant:n.id}),...getEquipmentShopStock({level:game.player.level,classId:game.player.classId,merchant:n.id})].some(item=>item.id===command.args[0]));
        if(!offered)throw new HttpError(409,'Diese Ware wird hier nicht angeboten.');
        const item=Catalog.ITEMS[command.args[0]];
        if(item&&(game.player.level<(item.minLevel||item.level||1)||item.classIds&&!item.classIds.includes(game.player.classId)))return false;
      }
      if(command.name==='sell') {
        if(!game.npcs.some(n=>(n.id==='oren'||n.role?.includes('Händler'))&&distance(game.player,n)<120))throw new HttpError(409,'Ein Händler muss in deiner Nähe sein.');
      }
      if(command.name==='respawn'&&command.args.length!==0)throw new HttpError(400,'Rückkehr erwartet keine Argumente.');
      if(command.name==='respawn'&&!game.dead)return false;
      const professionMutation=['trainProfession','chooseProfessionMastery'].includes(command.name),rollback=professionMutation?{gold:game.player.gold,hp:game.player.hp,mana:game.player.mana,professions:clone(game.professions),training:[...game.professionTraining],events:[...member.events],eventSequence:member.eventSequence}:null;
      const accepted=game[command.name](...command.args)!==false;
      if(accepted&&professionMutation&&!this.persist()){
        Object.assign(game.player,{gold:rollback.gold,hp:rollback.hp,mana:rollback.mana});game.professions=rollback.professions;game.professionTraining=rollback.training;member.events=rollback.events;member.eventSequence=rollback.eventSequence;game.change();
        throw new HttpError(503,'Deine Berufsausbildung konnte nicht gespeichert werden. Gold und Fortschritt bleiben erhalten.');
      }
      if(accepted&&['learnTechniqueSpecialization','selectTechniqueSpecialization'].includes(command.name))this.persist();
      return accepted;
    }
    throw new HttpError(400,'Der Server nimmt keine Charakterwerte oder Positionen vom Browser an.');
  }
  _commandLimit(member) {
    if(this.clock()-member.windowAt>=1000){member.windowAt=this.clock();member.windowCommands=0;}
    if(++member.windowCommands>45)throw new HttpError(429,'Zu viele Spielbefehle.');
  }
  _activate(member) {
    if(member.active)return;
    const others=[...member.room.members.values()].filter(m=>m.active);
    if(others.length>=this.maxPlayers)throw new HttpError(409,'Deine Gruppe ist gerade voll. Dein Charakter bleibt gespeichert.');
    if(member.accountId&&!others.length&&this._activeRoomCount()>=this.maxRooms)throw new HttpError(503,'Alle aktiven Welten des Servers sind belegt. Dein Charakter bleibt gespeichert.');
    member.active=true;
    const leader=others[0]?.game;
    if(leader&&member.needsTeleport){member.game.player.x=leader.player.x;member.game.player.y=leader.player.y;member.needsTeleport=false;}
    this._syncRoom(member.room,leader||member.game);
  }
  _creationLimit(req) {
    const address=this.accounts.clientAddress(req);let limit=this.creations.get(address);
    if(!limit||this.clock()-limit.at>60000){limit={at:this.clock(),count:0};this.creations.set(address,limit);}
    if(++limit.count>10)throw new HttpError(429,'Zu viele neue Gruppensitzungen.');
    if(this.creations.size>1000)for(const [key,value]of this.creations)if(this.clock()-value.at>60000)this.creations.delete(key);
  }
  _json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));return true;}
}

class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
async function readJson(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new HttpError(415,'Spielbefehle benötigen JSON.');
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw new HttpError(413,'Spielbefehl zu groß.');}
  let data;try{data=JSON.parse(text);}catch{throw new HttpError(400,'Ungültiges JSON.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(400,'Ein Spielbefehl benötigt ein JSON-Objekt.');
  return data;
}
