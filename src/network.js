import { isCharacterAppearance } from './character-appearance.js';
import { SnapshotAccumulator, cloneSnapshot } from './network-snapshots.js';
import { normalizeServerAddress, SERVER_ADDRESS_KEY } from './server-address.js';

const SESSION_KEY='emberfall.network.v1';
export function invitationCode(pageUrl=globalThis.location?.href||'') {
  try{const code=new URL(pageUrl).searchParams.get('join')?.trim().toUpperCase();return /^[A-F0-9]{8}$/.test(code||'')?code:null;}catch{return null;}
}
const INPUT_KEYS=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const REMOTE_METHODS=['questAccept','questTurnIn','learn','learnAbility','learnTechniqueSpecialization','selectTechniqueSpecialization','setAbilityLoadout','useLearnedAbility','equip','unequip','pickupLoot','buy','sell','consume','craft','travel','respawn','enterDungeon','exitDungeon','leaveDungeon','attune','salvage','socket','upgradeItem','acceptContract','turnInContract','cancelContract','interactWorldObject','setItemFlag','depositItem','withdrawItem','saveLoadout','applyLoadout','deleteLoadout','respecTalents','trackQuest','setWaypoint','claimAchievement','selectCompanion','chooseMastery','interactWorldEvent','claimWorldEvent','pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn','startHunt','abandonHunt','claimHunt','redeemHuntReward'];
const PERSONAL_FIELDS=['inventory','resources','equipment','generatedItems','lootPity','lootSerial','skills','learnedAbilities','abilityLoadout','techniqueSpecializations','questState','discovered','unlockedShrines','flags','ledger','kills','cooldowns','playTime','dead','classId','dungeonProgress','dungeonRecords','contracts','professionXp','buffs','itemFlags','stash','loadouts','trackedQuestId','waypoint','journey','endgame','deathPenalty'];

/** Browser transport; the server owns combat, progression, drops and movement. */
export class NetworkClient {
  constructor(game,{baseUrl=globalThis.location?.origin||'',fetchImpl=globalThis.fetch,EventSourceImpl=globalThis.EventSource,storage=globalThis.localStorage,clock=()=>globalThis.performance?.now()??Date.now()}={}) {
    this.game=game;this.baseUrl=baseUrl.replace(/\/$/,'');this.fetchImpl=fetchImpl===globalThis.fetch?fetchImpl.bind(globalThis):fetchImpl;this.EventSourceImpl=EventSourceImpl;this.storage=storage;this.clock=clock;
    this.status='offline';this.roomCode=null;this.players=[];this.token=null;this.active=false;this.onStatus=()=>{};this.onSnapshot=()=>{};this.onWorldChange=()=>{};
    this.serverAvailable=null;
    this.account=null;this.accountStatus='checking';this.accountOwned=false;this.privateWorld=false;this.requiresHTTPS=false;this.secureOrigin=null;
    this.pendingInvitation=invitationCode();
    this._methods=new Map();this._lastInputAt=-Infinity;this._inputPending=null;this._inputSending=false;this._lastEventId=0;this._sequence=-1;this._actionQueue=Promise.resolve();
    this._targetPlayer=null;this._targets=new Map();this._enemyTargets=new Map();
    this._snapshotState=new SnapshotAccumulator();
  }
  get online(){return this.active||!!this._disconnecting;}
  get connected(){return this.status==='online';}
  get party(){return this.players;}
  get inParty(){return this.online&&(!this.accountOwned||!this.privateWorld);}
  async refreshAccount(){
    try{
      const data=await this._request('/api/account');
      if(this.active&&this.accountOwned&&this.account?.id!==data.account?.id)await this.disconnect({leave:false,logout:true});
      this.account=data.account||null;this.accountStatus=this.account?'authenticated':'anonymous';
      this.requiresHTTPS=!!data.requiresHTTPS;this.secureOrigin=null;
      if(data.secureOrigin){const origin=normalizeServerAddress(data.secureOrigin,{pageUrl:'https://localhost/'});if(origin.startsWith('https://'))this.secureOrigin=origin;}
      this._status(this.status);return data;
    }catch(error){this.account=null;this.accountStatus='unavailable';this._status(this.status);return {account:null,unavailable:true};}
  }
  async registerAccount(details){
    const data=await this._request('/api/account/register',details);
    await this.refreshAccount();return data;
  }
  async loginAccount(details){
    const data=await this._request('/api/account/login',details);
    await this.refreshAccount();return data;
  }
  async playAccount(){
    if(this._addressOperation)throw new Error('Die Spielserveradresse wird noch geprüft.');
    if(this.active&&!this.accountOwned)await this.disconnect();
    this._status('connecting');
    try{const data=await this._request('/api/account/play',{});await this.connect({...data,accountOwned:true});return data;}
    catch(error){this._status(this.active?'reconnecting':'offline',error.message);throw error;}
  }
  async logoutAccount(){
    await this._request('/api/account/logout',{});
    await this.disconnect({leave:false,logout:true});
    this.account=null;this.accountStatus='anonymous';this._status('offline');
  }
  inviteUrl(code=this.roomCode){
    if(!/^[A-F0-9]{8}$/.test(code||'')||this.accountOwned&&this.privateWorld)return null;
    const url=new URL(this.secureOrigin||this.baseUrl);url.searchParams.set('join',code);return url.href;
  }
  get savedSession() {
    try{const saved=JSON.parse(this.storage?.getItem(SESSION_KEY)||'null');return saved?.baseUrl===this.baseUrl&&typeof saved.token==='string'?saved:null;}catch{return null;}
  }
  _status(status,error=null) {this.status=status;this.error=error;this.onStatus({status,error,roomCode:this.roomCode,players:this.players});}
  async catalog() {
    try {const data=await this._request('/api/rooms');if(!Array.isArray(data.rooms))throw new Error('Hier ist kein Gruppenserver eingerichtet.');this.serverAvailable=true;return data;}
    catch(error){this.serverAvailable=false;throw error;}
  }
  async setServerAddress(value){
    if(this.account)throw new Error('Melde dich vor einem Spielserverwechsel von deinem Konto ab.');
    if(this.online||['connecting','reconnecting','online'].includes(this.status))throw new Error('Beende zuerst deine Gruppenverbindung, bevor du den Spielserver wechselst.');
    const candidate=normalizeServerAddress(value,{pageUrl:globalThis.location?.href||''});
    const controller=typeof AbortController==='function'?new AbortController():null;
    const operation=Symbol('server-address');
    let timer;this._status('connecting');this._addressProbe=controller;this._addressOperation=operation;
    try{
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('Der Spielserver antwortet nicht. Prüfe die Adresse und versuche es erneut.'));controller?.abort();},8000);});
      const data=await Promise.race([this._request('/api/rooms',undefined,{baseUrl:candidate,signal:controller?.signal}),timeout]);
      if(this._addressOperation!==operation||controller?.signal.aborted||this.active)throw new Error('Der Spielserverwechsel wurde beendet.');
      if(data.protocol!==1||!Array.isArray(data.rooms))throw new Error('Diese Adresse bietet keinen unterstützten Emberfall-Spielserver.');
      this.baseUrl=candidate;this.serverAvailable=true;
      try{this.storage?.setItem(SERVER_ADDRESS_KEY,candidate);}catch{}
      this._status('offline');return candidate;
    }catch(error){this._status('offline',error.message);throw error;}
    finally{clearTimeout(timer);if(this._addressOperation===operation){this._addressProbe=null;this._addressOperation=null;}}
  }
  async create({name='Glutgruppe',playerName=this.game.player.name,classId=this.game.classId||this.game.player.classId||'guardian'}={}) {
    if(this._addressOperation)throw new Error('Die Spielserveradresse wird noch geprüft.');
    if(this.active&&!this.accountOwned&&this.account)await this.disconnect();
    this._transferring=true;this.game.keys.clear();this._inputPending=null;await Promise.allSettled([this._actionQueue,this._inputFlight]);
    this._status('connecting');
    try {
      const data=await this._request(this.account?'/api/account/rooms':'/api/rooms',{name,playerName,classId});await this.connect(data);return data;
    } catch(error){this._status(this.active?'online':'offline',error.message);throw error;}finally{this._transferring=false;}
  }
  async join(code,{playerName=this.game.player.name,classId=this.game.classId||this.game.player.classId||'guardian'}={}) {
    if(this._addressOperation)throw new Error('Die Spielserveradresse wird noch geprüft.');
    const roomCode=String(code).trim().toUpperCase();if(!/^[A-F0-9]{8}$/.test(roomCode))throw new Error('Der Gruppencode besteht aus 8 Zeichen.');
    if(this.active&&!this.accountOwned&&this.account)await this.disconnect();
    this._transferring=true;this.game.keys.clear();this._inputPending=null;await Promise.allSettled([this._actionQueue,this._inputFlight]);
    this._status('connecting');
    try {
      const data=await this._request(`${this.account?'/api/account/rooms':'/api/rooms'}/${roomCode}/join`,{playerName,classId});await this.connect(data);this.pendingInvitation=null;return data;
    } catch(error){this._status(this.active?'online':'offline',error.message);throw error;}finally{this._transferring=false;}
  }
  async resume() {
    if(this.account)return this.playAccount();
    if(this._addressOperation)throw new Error('Die Spielserveradresse wird noch geprüft.');
    const saved=this.savedSession;if(!saved)throw new Error('Auf diesem Browser gibt es keine gespeicherte Gruppensitzung.');
    this._status('connecting');
    try {
      const snapshot=await this._request(`/api/session/${saved.token}`);await this.connect({...saved,snapshot});return snapshot;
    } catch(error){this._status('offline',error.message);throw error;}
  }
  async connect({token,roomCode,snapshot,accountOwned=false,privateWorld=false}) {
    if(this._addressOperation)throw new Error('Die Spielserveradresse wird noch geprüft.');
    if(!this.EventSourceImpl)throw new Error('Dieser Browser unterstützt keine Gruppenverbindung.');
    this.source?.close();
    if(!this._offlineSave){this._offlineSave=JSON.parse(JSON.stringify(this.game.capture()));this._offlineStarted=this.game.started;}
    this.accountOwned=!!accountOwned;this.privateWorld=!!privateWorld;this.token=accountOwned?null:token;this.roomCode=roomCode;this.active=true;this.serverAvailable=true;this._lastEventId=0;this._sequence=-1;this._snapshotState.reset();
    this._hasSnapshot=false;this._worldContext=null;this._inputPending=null;this._targetPlayer=null;this.game.aim=null;this.onWorldChange();
    if(!accountOwned)try{this.storage?.setItem(SESSION_KEY,JSON.stringify({token,roomCode,baseUrl:this.baseUrl}));}catch{}
    this._install();this.game.network=this;this.game.networkActive=true;this.game.started=true;this.game.paused=false;this.game.keys.clear();this.game.aim=null;
    if(snapshot)this.applySnapshot(snapshot);
    this._status('connecting');
    this._openSnapshotStream();
    return this;
  }
  _openSnapshotStream(){
    if(!this.active)return;
    const identity=this.accountOwned?`&playerId=${encodeURIComponent(this.playerId)}`:'';
    const source=new this.EventSourceImpl(`${this.baseUrl}${this.accountOwned?'/api/account/play':`/api/session/${this.token}`}/events?deltas=1${identity}`,this.accountOwned?{withCredentials:true}:undefined);this.source=source;
    source.onopen=()=>{if(this.source!==source)return;this._sequence=-1;this._snapshotState.reset();this._status('online');};
    source.addEventListener('snapshot',event=>{
      if(this.source!==source)return;
      try{this.applySnapshot(JSON.parse(event.data));if(this.status!=='online')this._status('online');}catch(error){
        // A missing baseline must not turn later patches into stale inventory,
        // actors or cast deadlines. A fresh stream always begins with full state.
        this.game.keys.clear();this._status('reconnecting',error.message);source.close();
        if(!this._resyncTimer)this._resyncTimer=setTimeout(()=>{this._resyncTimer=null;if(this.active&&this.source===source)this._openSnapshotStream();},1200);
      }
    });
    source.onerror=()=>{
      if(this.source!==source)return;
      this.game.keys.clear();this._status('reconnecting','Verbindung unterbrochen. Dein Servercharakter bleibt gespeichert.');
    };
  }
  _install() {
    if(this._methods.size)return;
    const intercept=(name,handler)=>{
      if(typeof this.game[name]!=='function')return;
      const original=this.game[name];this._methods.set(name,original);
      this.game[name]=(...args)=>this.active?handler(...args):original.apply(this.game,args);
    };
    intercept('action',name=>{this.sendAction(name);return true;});
    intercept('interact',()=>{this.sendAction('interact');return true;});
    for(const name of REMOTE_METHODS)intercept(name,(...args)=>{if(['respawn','learnTechniqueSpecialization','selectTechniqueSpecialization'].includes(name))return this.command(name,...args);this.command(name,...args);return true;});
    intercept('save',manual=>{if(manual)this.game.notice(this.accountOwned?'Dein Charakter wird automatisch auf dem Spielserver gespeichert.':'Dein Gruppencharakter wird automatisch auf dem Spielserver gespeichert.','quest');return true;});
    intercept('importSave',()=>{this.game.notice('Beende die Gruppenverbindung, um einen Einzelspieler-Spielstand zu importieren.');return false;});
    intercept('reset',()=>{this.game.notice('Beende zuerst die Gruppenverbindung, um eine neue Einzelspieler-Reise zu beginnen.');return false;});
    intercept('selectClass',()=>{this.game.notice('Deine Gruppenklasse wurde bei der Charaktererstellung festgelegt.');return false;});
  }
  applySnapshot(snapshot) {
    const layoutProvided=snapshot.snapshotDelta===undefined&&snapshot.layout!==undefined;
    const authoritative=this._snapshotState.accept(snapshot,state=>{
      if(state.protocol!==1||!state.player||!state.world)throw new Error('Unbekannte Spielserver-Antwort.');
      if(state.leechCredit!==undefined&&(!Number.isFinite(state.leechCredit)||state.leechCredit<0||state.leechCredit>1))throw new Error('Ungültiges Lebensraubbudget vom Spielserver.');
    });
    if(!authoritative)return;
    // Game/render objects may interpolate, sort or rebuild their arrays. None
    // may become the next delta's canonical baseline, including portable saves.
    snapshot=cloneSnapshot(authoritative);
    if(this.accountOwned){this.privateWorld=!!snapshot.privateWorld;if(this.account)this.account={...this.account,playerName:snapshot.player.name,classId:snapshot.player.classId,level:snapshot.player.level};}
    this._sequence=snapshot.sequence;
    const game=this.game,previous={x:game.player.x,y:game.player.y},isPvp=snapshot.worldMode==='pvp';
    const arenaId=snapshot.pvp?.duel?.id||snapshot.layout?.pvpArenaId||snapshot.world.pvpArenaId;
    const context=isPvp?`pvp:${arenaId}`:snapshot.dungeonInstance?`dungeon:${snapshot.dungeonInstance.id}:${snapshot.dungeonInstance.seed}:${snapshot.dungeonInstance.tier}`:'overworld';
    const worldChanged=this._hasSnapshot&&context!==this._worldContext;
    if(isPvp&&!game._pvpTravelSave)game._pvpTravelSave=JSON.parse(JSON.stringify(snapshot.pvpTravelSave||game.capture()));
    if(worldChanged){game.keys.clear();game.aim=null;this._inputPending=null;this.onWorldChange();}
    // Keep the player reference stable, but remove arena-only fields on return.
    if(worldChanged)for(const key of Object.keys(game.player))if(!Object.hasOwn(snapshot.player,key))delete game.player[key];
    this._targetPlayer={x:snapshot.player.x,y:snapshot.player.y};Object.assign(game.player,snapshot.player);
    if(this._hasSnapshot&&!worldChanged&&Math.hypot(previous.x-game.player.x,previous.y-game.player.y)<250){game.player.x=previous.x;game.player.y=previous.y;}
    const previousEnemies=new Map((worldChanged?[]:game.world.enemies).map(e=>[e.id,e]));
    if(layoutProvided) {
      // PvP sends a full layout every frame. Reuse its object so the renderer
      // retains static terrain chunks throughout one isolated duel.
      if(isPvp&&!worldChanged&&game.world.isPvp&&game.world.pvpArenaId===arenaId)Object.assign(game.world,snapshot.layout);
      else game.world={...snapshot.layout};
    }
    Object.assign(game.world,snapshot.world);
    this._enemyTargets.clear();
    for(const enemy of game.world.enemies) {
      this._enemyTargets.set(enemy.id,{x:enemy.x,y:enemy.y});const previous=previousEnemies.get(enemy.id);
      if(previous&&Math.hypot(previous.x-enemy.x,previous.y-enemy.y)<150){enemy.x=previous.x;enemy.y=previous.y;}
    }
    for(const key of PERSONAL_FIELDS)if(snapshot[key]!==undefined)game[key]=snapshot[key];
    game.time=snapshot.time;game.effects=snapshot.effects||[];game.projectiles=snapshot.projectiles||[];game.drops=snapshot.drops||[];game.hazards=snapshot.hazards||[];game.summons=snapshot.summons||[];
    game.dungeonInstance=snapshot.dungeonInstance?{...snapshot.dungeonInstance,world:game.world}:null;
    if(!isPvp&&game.dungeonInstance){
      if(layoutProvided)game.networkDungeonLayout=cloneSnapshot(snapshot.layout);
      else if(worldChanged)game.networkDungeonLayout=null;
    }else game.networkDungeonLayout=null;
    game.networkDungeonCheckpoint=isPvp?null:snapshot.authoritativeDungeonCheckpoint||null;
    game.networkRaidResume=isPvp?null:snapshot.raidResume||null;
    if(!game.dungeonInstance&&!isPvp)game.overworld=game.world;
    game.pvp=snapshot.pvp||null;game.pvpStats=isPvp?snapshot.pvpStats||null:null;
    if(!isPvp&&snapshot.leechCredit!==undefined)game.restoreLeechCredit(snapshot.leechCredit);
    game.networkInteractionSummary=snapshot.authoritativeInteractionSummary||null;
    game.networkWorldEventSummary=snapshot.authoritativeWorldEventSummary||null;
    game.networkEncounterDirectorSave=isPvp?null:snapshot.authoritativeEncounterDirectorSave||null;
    game.worldMode=snapshot.worldMode;game.activeDungeon=snapshot.activeDungeon;game.paused=!!game.dead||!!game.networkRaidResume?.waiting;
    if(snapshot.npcs)game.npcs=snapshot.npcs;
    const previousParty=new Map(this.players.map(p=>[p.id,p]));this._targets.clear();
    this.players=(snapshot.party||[]).map(player=>{
      player={...player,appearance:isCharacterAppearance(player.appearance)?player.appearance:null};
      this._targets.set(player.id,{x:player.x,y:player.y});const old=previousParty.get(player.id);
      return !worldChanged&&old&&Math.hypot(old.x-player.x,old.y-player.y)<250?{...player,x:old.x,y:old.y}:player;
    });
    game.partyPlayers=this.players.filter(p=>p.id!==snapshot.playerId);game.otherPlayers=game.partyPlayers;game.party=this.players;game.networkRoomCode=snapshot.roomCode;
    this.roomCode=snapshot.roomCode;this.playerId=snapshot.playerId;this._hasSnapshot=true;this._worldContext=context;
    for(const event of snapshot.events||[]) {
      if(event.id<=this._lastEventId)continue;this._lastEventId=event.id;
      if(event.kind==='notice'){
        if(typeof event.itemId==='string'&&event.itemId.length<=120&&game.item(event.itemId)&&game.inventory[event.itemId]>0)game.onNotice(event.text,event.tone,event.itemId);
        else game.onNotice(event.text,event.tone);
      }
      if(event.kind==='sound')game.onSound(event.name);
      if(event.kind==='dialogue')game.onDialogue(event.npc);
      if(event.kind==='death')game.onDeath();
      if(event.kind==='victory')game.onVictory();
    }
    if(!isPvp)game._pvpTravelSave=null;
    game.change();this.onSnapshot(snapshot);
  }
  /** Render interpolation only; it never resolves gameplay or grants progress. */
  update(dt) {
    if(!this.active)return;
    const lerp=(body,target)=>{if(!target)return;const k=1-Math.exp(-22*Math.max(0,Math.min(.1,dt)));body.x+=(target.x-body.x)*k;body.y+=(target.y-body.y)*k;};
    lerp(this.game.player,this._targetPlayer);
    for(const player of this.players)lerp(player,this._targets.get(player.id));
    for(const enemy of this.game.world.enemies)lerp(enemy,this._enemyTargets.get(enemy.id));
  }
  sendInput(keys=this.game.keys,angle=this.game.player.face) {
    if(!this.active||!this.connected||this._transferring)return;
    this._inputPending={type:'input',keys:[...keys].filter(key=>INPUT_KEYS.has(key)),angle:Number.isFinite(angle)?angle:0};
    if(this._inputSending||this.clock()-this._lastInputAt<75)return;
    this._inputFlight=this._flushInput();
  }
  async _flushInput() {
    if(!this._inputPending||!this.active)return;
    const input=this._inputPending;this._inputPending=null;this._inputSending=true;this._lastInputAt=this.clock();
    try{await this._request(`${this.accountOwned?'/api/account/play':`/api/session/${this.token}`}/command`,input);}catch(error){this._status('reconnecting',error.message);}finally{this._inputSending=false;}
  }
  sendAction(name){return this._queue({type:'action',name});}
  command(name,...args){return this._queue({type:'method',name,args});}
  _queue(command) {
    if(!this.active||!this.connected){this.game.notice('Die Verbindung zum Spielserver wird wiederhergestellt.');return Promise.resolve(false);}
    this._actionQueue=this._actionQueue.then(async()=>{
      if(!this.active||this._transferring)return false;
      // Touch / mouse aiming can be newer than the coalesced movement packet.
      // Flush the newest pending aim after an existing flight, before casting.
      if(command.type==='action'||command.type==='method'&&command.name==='useLearnedAbility') {
        if(this._inputFlight)await this._inputFlight;
        if(this._inputPending){this._inputFlight=this._flushInput();await this._inputFlight;}
        if(!this.active||!this.connected)return false;
      }
      try{const result=await this._request(`${this.accountOwned?'/api/account/play':`/api/session/${this.token}`}/command`,command);return result.accepted;}catch(error){this.game.notice(error.message);return false;}
    });
    return this._actionQueue;
  }
  async disconnect({leave=true,forget=false,logout=false}={}) {
    if(this.accountOwned&&leave&&!logout){
      this._transferring=true;this.game.keys.clear();this._inputPending=null;
      try{await Promise.allSettled([this._actionQueue,this._inputFlight]);const data=await this._request('/api/account/play/leave',{});await this.connect({...data,accountOwned:true});return;}
      finally{this._transferring=false;}
    }
    this._addressOperation=null;this._addressProbe?.abort();this._addressProbe=null;
    this.game.keys.clear();
    this._disconnecting=true;
    this.active=false;this.source?.close();this.source=null;this._inputPending=null;clearTimeout(this._resyncTimer);this._resyncTimer=null;this._snapshotState.reset();
    // Drain already submitted requests before marking the server actor dormant;
    // a late movement POST must not accidentally reactivate a departed player.
    await Promise.allSettled([this._actionQueue,this._inputFlight]);
    if(this.token&&leave)try{await this._request(`/api/session/${this.token}/leave`,{});}catch{}
    this.token=null;this.accountOwned=false;this.privateWorld=false;this.roomCode=null;this.players=[];this._targetPlayer=null;this._hasSnapshot=false;this._worldContext=null;
    for(const [name,original]of this._methods)this.game[name]=original;this._methods.clear();
    this.game.network=null;this.game.networkActive=false;this.game.partyPlayers=[];this.game.otherPlayers=[];this.game.party=[];
    this.game.networkInteractionSummary=null;
    this.game.networkWorldEventSummary=null;
    this.game.networkEncounterDirectorSave=null;
    this.game.networkDungeonLayout=null;
    this.game.pvp=null;this.game.pvpStats=null;this.game._pvpTravelSave=null;this.game.worldMode='overworld';
    if(this._offlineSave){this.game.applySave(this._offlineSave);this.game.started=this._offlineStarted;this.game.paused=false;this._offlineSave=null;}
    if(forget)try{this.storage?.removeItem(SESSION_KEY);}catch{}
    this._disconnecting=false;
    this._status('offline');
  }
  async _request(route,body,{baseUrl=this.baseUrl,signal}={}) {
    // Bind commands to this tab's character even if another tab replaces its cookie.
    const identity=this.accountOwned&&this.playerId&&route.startsWith('/api/account/')?{'X-Emberfall-Player-Id':this.playerId}:{};
    const response=await this.fetchImpl(`${baseUrl}${route}`,body===undefined?{credentials:'include',cache:'no-store',...(signal?{signal}:{})}:{credentials:'include',method:'POST',headers:{'Content-Type':'application/json',...identity},body:JSON.stringify(body),...(signal?{signal}:{})});
    let data;try{data=await response.json();}catch{throw new Error('Kein Multiplayer-Server erreichbar. Starte Emberfall über den Node-Spielserver.');}
    if(!response.ok)throw new Error(data.error||`Spielserver-Fehler ${response.status}`);
    return data;
  }
}
