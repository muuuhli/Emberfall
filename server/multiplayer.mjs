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

const KEYS = new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const ACTIONS = new Set(['attack','dash','bolt','nova','potion','interact','primary','secondary','ultimate']);
const METHODS = new Set(['questAccept','questTurnIn','learn','learnAbility','learnTechniqueSpecialization','selectTechniqueSpecialization','setAbilityLoadout','useLearnedAbility','equip','unequip','buy','sell','consume','craft','travel','respawn','enterDungeon','exitDungeon','leaveDungeon','attune','salvage','socket','upgradeItem','acceptContract','turnInContract','cancelContract','interactWorldObject','setItemFlag','depositItem','withdrawItem','saveLoadout','applyLoadout','deleteLoadout','respecTalents','trackQuest','setWaypoint','claimAchievement','selectCompanion','chooseMastery','interactWorldEvent','claimWorldEvent','pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn','startHunt','abandonHunt','claimHunt','redeemHuntReward','setSetting']);
const PVP_METHODS = new Set(['pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn']);
const SHOP_STOCK = {
  elin:new Set(['forest_blade','sentinel_mail']),
  sera:new Set(['heal_potion','mana_potion']),
  oren:new Set(['heal_potion','mana_potion','leather_armor','forest_blade','seed']),
};
const PERSONAL_FIELDS = ['inventory','resources','equipment','generatedItems','lootPity','lootSerial','skills','learnedAbilities','abilityLoadout','techniqueSpecializations','questState','discovered','unlockedShrines','flags','ledger','kills','cooldowns','playTime','dead','classId','dungeonProgress','dungeonRecords','contracts','professionXp','buffs','itemFlags','stash','loadouts','trackedQuestId','waypoint','journey','endgame','deathPenalty'];
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
      values[key]=value;
      mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
      const temp=`${filename}.tmp`;
      writeFileSync(temp,JSON.stringify(values),{mode:0o600});
      renameSync(temp,filename);
    },
  };
}

export class MultiplayerHub {
  constructor({createGame=()=>new Game({storage:null}),clock=Date.now,random=Math.random,storage=null,allowedOrigin=null,maxRooms=32,maxPlayers=8,disconnectMs=120000,roomExpiryMs=1800000,autoStart=true,strictRestore=false}={}) {
    this.createGame=createGame;this.clock=clock;this.random=random;this.storage=storage;this.allowedOrigin=allowedOrigin;
    this.maxRooms=maxRooms;this.maxPlayers=Math.max(2,Math.min(8,maxPlayers));this.disconnectMs=disconnectMs;this.roomExpiryMs=roomExpiryMs;
    this.strictRestore=strictRestore;
    this.rooms=new Map();this.sessions=new Map();this.creations=new Map();this.frames=0;this.lastPersist=this.clock();
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
  _createMember(room,{playerName,classId='guardian'}={}) {
    if(!classIds().includes(classId))throw new HttpError(400,'Unbekannte Klasse.');
    const game=this.createGame({roomCode:room.code,classId,playerName});
    game.selectClass?.(classId);
    game.player.name=cleanName(playerName,'Reisender');game.player.id=randomUUID();
    game.classId=classId;game.started=true;game.paused=false;game.dead=false;game.storage=null;
    const member={id:game.player.id,token:randomBytes(32).toString('base64url'),game,room,active:true,streams:new Set(),events:[],eventSequence:0,lastSeen:this.clock(),lastInput:this.clock(),windowAt:this.clock(),windowCommands:0,layoutKey:null,aimAngle:game.player.face};
    game.onNotice=(text,tone='info')=>this._event(member,{kind:'notice',text,tone});
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
    this._syncRoom(room,game);
    this._event(member,{kind:'notice',text:`Gruppe ${room.code} · ${room.members.size}/${this.maxPlayers} Reisende`,tone:'quest'});
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
    const data={protocol:1,roomCode:member.room.code,roomName:member.room.name,playerId:member.id,sequence:this.frames,time:member.room.time,player:{...p},world:{},npcs:game.npcs===Catalog.NPCS?this.canonicalNpcSnapshot:game.npcs,effects:game.effects.filter(near),projectiles:game.projectiles.filter(near),drops:game.drops.filter(near),hazards:(game.hazards||[]).filter(near),summons:(game.summons||[]).filter(near),worldMode:game.dungeonInstance?'dungeon':'overworld',activeDungeon:game.dungeonInstance?{id:game.dungeonInstance.id,tier:game.dungeonInstance.tier,name:game.dungeonInstance.definition.name}:null,party:this._partySnapshot(member.room),events:member.events};
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
    member.room.lastActive=this.clock();
    const source=member.room.members.values().next().value?.game;
    if(source)this._syncRoom(member.room,source);
  }
  capture() {
    return {version:1,savedAt:this.clock(),rooms:[...this.rooms.values()].map(room=>{
      const leader=room.members.values().next().value?.game;
      const persistentWorld=leader?.dungeonInstance?leader.overworld:room.world;
      return {code:room.code,name:room.name,createdAt:room.createdAt,lastActive:room.lastActive,time:room.time,worldMode:leader?.dungeonInstance?'dungeon':'overworld',dungeonCheckpoint:leader?.captureDungeonCheckpoint?.()||null,world:clone(Object.fromEntries([...MUTABLE_WORLD,'structures'].filter(key=>persistentWorld[key]!==undefined).map(key=>[key,persistentWorld[key]]))),members:[...room.members.values()].map(m=>({id:m.id,token:m.token,classId:m.game.classId,eventSequence:m.eventSequence,save:m.game.capture()}))};
    })};
  }
  persist() {
    try{this.storage?.setItem(STORE_KEY,JSON.stringify(this.capture()));this.lastStorageError=null;}catch(error){this.lastStorageError=error.message;}
  }
  restore() {
    let data;try{data=JSON.parse(this.storage?.getItem(STORE_KEY)||'null');}catch(error){if(this.strictRestore)throw new Error('Der Gruppenspeicher enthält keine lesbare Reise.',{cause:error});return;}
    if(data?.version!==1||!Array.isArray(data.rooms)){if(data!==null&&this.strictRestore)throw new Error('Der Gruppenspeicher besitzt eine unbekannte Reiseversion.');return;}
    // Active-room/player limits govern admissions, never the lifetime save
    // roster. Retained inactive characters must keep their personal tokens.
    for(const saved of data.rooms) {
      if(typeof saved.code!=='string'||!/^[A-F0-9]{8}$/.test(saved.code)||!Array.isArray(saved.members)){if(this.strictRestore)throw new Error('Der Gruppenspeicher besitzt eine ungültige Gruppe.');continue;}
      const room={code:saved.code,name:cleanName(saved.name,'Glutgruppe'),createdAt:saved.createdAt||this.clock(),lastActive:this.clock(),time:Number.isFinite(saved.time)?saved.time:0,members:new Map(),world:null};
      this.rooms.set(room.code,room);
      for(const entry of saved.members) {
        try {
          const member=this._createMember(room,{playerName:entry.save?.player?.name,classId:entry.classId});
          const resumeDungeon=saved.worldMode==='dungeon'&&saved.dungeonCheckpoint;
          const portableSave=resumeDungeon?{...entry.save,dungeon:{...saved.dungeonCheckpoint,returnPoint:entry.save?.dungeon?.returnPoint||saved.dungeonCheckpoint.returnPoint}}:entry.save;
          const resumeRaid=!!(resumeDungeon&&DUNGEONS.some(definition=>definition.id===saved.dungeonCheckpoint.id&&definition.raid));
          member.game.applySave(portableSave,{preserveDowned:resumeRaid});
          if(member.game.dungeonInstance&&!resumeDungeon)member.game.exitDungeon();
          member.game.player.name=cleanName(entry.save?.player?.name,'Reisender');
          member.eventSequence=Number.isSafeInteger(entry.eventSequence)?entry.eventSequence:0;member.events=[];
          this.sessions.delete(member.token);member.token=typeof entry.token==='string'&&/^[\w-]{43}$/.test(entry.token)?entry.token:randomBytes(32).toString('base64url');
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
  }
  _origin(req,res) {
    const origin=req.headers.origin;
    if(!origin)return;
    let same=false;try{const url=new URL(origin);same=['http:','https:'].includes(url.protocol)&&url.host===req.headers.host;}catch{}
    if(!same&&origin!==this.allowedOrigin)throw new HttpError(403,'Diese Spielgruppe ist nur für den freigegebenen Spielserver erreichbar.');
    if(origin===this.allowedOrigin)res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  async handle(req,res) {
    const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/'))return false;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    try {
      this._origin(req,res);
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}).end();return true;}
      if(req.method==='GET'&&url.pathname==='/api/rooms') {
        return this._json(res,200,{protocol:1,rooms:[...this.rooms.values()].filter(r=>[...r.members.values()].some(m=>m.active)).map(r=>({code:r.code,name:r.name,players:[...r.members.values()].filter(m=>m.active).length,maxPlayers:this.maxPlayers,createdAt:r.createdAt})),maxPlayers:this.maxPlayers,classes:classIds()});
      }
      if(req.method==='POST'&&url.pathname==='/api/rooms') {
        const body=await readJson(req);this._creationLimit(req);
        if([...this.rooms.values()].filter(r=>[...r.members.values()].some(m=>m.active)).length>=this.maxRooms)throw new HttpError(503,'Alle Gruppenplätze des Servers sind belegt.');
        const room={code:this._code(),name:cleanName(body.name,'Glutgruppe'),createdAt:this.clock(),lastActive:this.clock(),time:0,members:new Map(),world:null};
        this.rooms.set(room.code,room);
        let member;try{member=this._createMember(room,body);}catch(error){this.rooms.delete(room.code);throw error;}
        this.persist();return this._json(res,201,{token:member.token,roomCode:room.code,playerId:member.id,snapshot:this.snapshot(member,{includeLayout:true})});
      }
      const join=url.pathname.match(/^\/api\/rooms\/([A-Fa-f0-9]{8})\/join$/);
      if(req.method==='POST'&&join) {
        const body=await readJson(req),room=this.rooms.get(join[1].toUpperCase());
        if(!room)throw new HttpError(404,'Diese Gruppe existiert nicht.');
        if([...room.members.values()].filter(m=>m.active).length>=this.maxPlayers)throw new HttpError(409,'Die Gruppe ist voll.');
        if([...room.members.values()].some(member=>member.game.dungeonInstance))throw new HttpError(409,'Der Dungeon läuft bereits. Kehre mit deiner bestehenden Sitzung zurück oder warte, bis die Gruppe den Dungeon verlässt.');
        const member=this._createMember(room,body);this.persist();
        return this._json(res,201,{token:member.token,roomCode:room.code,playerId:member.id,snapshot:this.snapshot(member,{includeLayout:true})});
      }
      const session=url.pathname.match(/^\/api\/session\/([\w-]{43})(?:\/(events|command|leave))?$/);
      if(!session)throw new HttpError(404,'Unbekannter Spielserver-Endpunkt.');
      const member=this.sessions.get(session[1]);if(!member)throw new HttpError(401,'Die Sitzung ist abgelaufen. Erstelle eine neue Gruppe oder tritt erneut bei.');
      this._activate(member);
      member.lastSeen=this.clock();
      if(req.method==='GET'&&!session[2])return this._json(res,200,this.snapshot(member,{includeLayout:true}));
      if(req.method==='GET'&&session[2]==='events') {
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
        const initial=this.snapshot(member,{includeLayout:true});
        let payload=initial;
        if(url.searchParams.get('deltas')==='1'){
          const encoder=new SnapshotEncoder(),context=this._snapshotContext(member,initial);
          payload=encoder.encode(initial,{context});this.snapshotStreams.set(res,encoder);
        }
        res.write(`retry: 1200\nevent: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
        member.streams.add(res);
        res.on('close',()=>{member.streams.delete(res);if(!member.streams.size){member.game.keys.clear();member.lastSeen=this.clock();}});
        return true;
      }
      if(req.method==='POST'&&session[2]==='leave') {
        this.pvp.disconnect(member);
        member.active=false;member.game.keys.clear();member.lastSeen=this.clock()-this.disconnectMs-1;
        for(const stream of member.streams)stream.end();member.streams.clear();
        const leader=[...member.room.members.values()].find(m=>m.active)?.game;
        if(leader)this._syncRoom(member.room,leader);
        this.persist();return this._json(res,200,{ok:true});
      }
      if(req.method==='POST'&&session[2]==='command') {
        const command=await readJson(req);this._commandLimit(member);
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
      if(['learn','learnTechniqueSpecialization','interactWorldObject'].includes(command.name)&&(command.args.length!==1||typeof command.args[0]!=='string'))throw new HttpError(400,'Diese Aktion benötigt eine bekannte Kennung.');
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
      const accepted=game[command.name](...command.args)!==false;
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
    member.active=true;
    const leader=others[0]?.game;
    if(leader&&member.needsTeleport){member.game.player.x=leader.player.x;member.game.player.y=leader.player.y;member.needsTeleport=false;}
    this._syncRoom(member.room,leader||member.game);
  }
  _creationLimit(req) {
    const address=req.socket.remoteAddress||'local';let limit=this.creations.get(address);
    if(!limit||this.clock()-limit.at>60000){limit={at:this.clock(),count:0};this.creations.set(address,limit);}
    if(++limit.count>10)throw new HttpError(429,'Zu viele neue Gruppen.');
    if(this.creations.size>1000)for(const [key,value]of this.creations)if(this.clock()-value.at>60000)this.creations.delete(key);
  }
  _json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));return true;}
}

class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
async function readJson(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new HttpError(415,'Spielbefehle benötigen JSON.');
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw new HttpError(413,'Spielbefehl zu groß.');}
  try{return JSON.parse(text);}catch{throw new HttpError(400,'Ungültiges JSON.');}
}
