import { ITEMS, SKILLS, QUESTS, RECIPES, ENEMY_TYPES, NPCS, REGIONS, RESOURCES } from './catalog.js';
import { makeWorld } from './world.js';
import { expandWorld } from './expansion.js';
import { CLASSES, getClass, getTalentModifiers, canLearnTalent } from './classes.js';
import { MAX_LEVEL, xpToNext } from './progression.js';
import { basePlayerStats, classStatModifiers, capCombatStats, incomingDamage, classPowerMultiplier, normalEnemyStats, enemyXpReward } from './balance.js';
import { generateLoot, computeItemStats, validateLootItem, salvageYield, computeSetBonuses, GEM_TYPES, ITEM_BASES } from './loot.js';
import { DUNGEONS, createDungeon, interactPuzzle, updateDungeon, validateDungeonEchoes, restoreDungeonEchoes } from './dungeons.js';
import { MAX_ACTIVE_CONTRACTS, getContractOffers, createContract, advanceContract, resolveContractOffer, validateContractState, restoreContractState } from './contracts.js';
import { ABILITIES, getAbility, canLearnAbility, validateAbilityState } from './abilities.js';
import { BESTIARY_ENEMIES, REGION_ENEMY_POOLS, createBestiaryEnemy } from './bestiary.js';
import { getSupplyDrop } from './arsenal.js';
import { getConsumableProfile } from './professions.js';
import { updateBestiaryEnemy, applyEnemyTraits } from './enemy-ai.js';
import { INTERACTION_TYPES, WORLD_BOONS, addWorldInteractions, interactionAvailable, captureInteractions, validateInteractionSave, restoreInteractions } from './interactions.js';
import { SKILLS as LEGACY_SKILLS } from './content.js';
import { equipmentSlot, EQUIPMENT_SLOT_IDS, createEmptyEquipment } from './equipment-system.js';
import { isItemProtected, toggleItemFlag, transferStashItem, saveEquipmentLoadout, applyEquipmentLoadout, validateInventoryExtensions, restoreInventoryExtensions } from './inventory-system.js';
import { resolveWaypoint, adventureGuidance } from './navigation.js';
import { createJourneyState, validateJourneyState, restoreJourneyState, advanceJourney, claimJourneyAchievement, chooseJourneyMastery, selectJourneyCompanion, getJourneyModifiers, getCompanionModifiers, getCompanionCombatProfile, canCraftJourneyRecipe, COMPANIONS, FACTIONS, ACHIEVEMENTS, JOURNEY_MASTERIES } from './journey.js';
import { addWorldEvents, interactWorldEvent as interactEvent, updateWorldEvents, claimWorldEventReward, summarizeWorldEvents, captureWorldEvents, validateWorldEventSave, restoreWorldEvents, recordWorldEventContribution } from './world-events.js';
import { createEndgameState, validateEndgameState, restoreEndgameState, advanceHunts, endgameSummary, startHunt, abandonHunt, claimHunt, redeemHuntReward } from './endgame.js';
import { getRelic, resolveRelicProc } from './relics.js';
import { createEncounterDirector, updateEncounterDirector, captureEncounterDirector, validateEncounterDirectorSave, restoreEncounterDirector, encounterSummary, ordinaryRespawnDelay, encounterSpawnBlocked } from './encounter-director.js';
import { updateEncounterBoss } from './encounter-boss-ai.js';

export const SAVE_KEY = 'emberfall.save.v1';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const angleDiff = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const validNum = (v, fallback, lo = 0, hi = 1e7) => Number.isFinite(v) ? clamp(v,lo,hi) : fallback;
const collisionCaches=new WeakMap();
function nearbyObstacles(world,x,y,r) {
  let cache=collisionCaches.get(world);
  if(!cache||cache.trees!==world.trees||cache.rocks!==world.rocks||cache.count!==world.trees.length+world.rocks.length) {
    cache={trees:world.trees,rocks:world.rocks,count:world.trees.length+world.rocks.length,cells:new Map()};
    for(const [objects,type] of [[world.trees,'tree'],[world.rocks,'rock']])for(const object of objects) {
      const key=`${Math.floor(object.x/128)},${Math.floor(object.y/128)}`;
      if(!cache.cells.has(key))cache.cells.set(key,[]);cache.cells.get(key).push({object,type});
    }
    collisionCaches.set(world,cache);
  }
  const result=[];const margin=r+32;
  for(let cy=Math.floor((y-margin)/128);cy<=Math.floor((y+margin)/128);cy++)for(let cx=Math.floor((x-margin)/128);cx<=Math.floor((x+margin)/128);cx++)result.push(...(cache.cells.get(`${cx},${cy}`)||[]));
  return result;
}

export class Game {
  constructor({ storage = globalThis.localStorage, random = Math.random } = {}) {
    this.storage = storage; this.random = random; this.keys = new Set();
    this.onNotice = () => {}; this.onDialogue = () => {}; this.onDeath = () => {}; this.onVictory = () => {};
    this.onSound = () => {}; this.onChange = () => {};
    this.settings = { sound:true, shake:true, reducedMotion:false,masterVolume:.75,musicVolume:.45,effectsVolume:.8 };
    this.hasSave = false; this.started = false; this.paused = false;
    this.initialize();
    try { this.hasSave = !!storage?.getItem(SAVE_KEY); if(this.hasSave) this.load(); } catch { this.hasSave=false; }
  }
  initialize() {
    this.world = addWorldEvents(addWorldInteractions(expandWorld(makeWorld()))); this.overworld=this.world;this.dungeonInstance=null;this.dungeonRecords={};this.npcs = NPCS; this.time = 0;
    this.world.encounterDirector=createEncounterDirector();this.networkEncounterDirectorSave=null;
    for(const enemy of this.world.enemies)if(!BESTIARY_ENEMIES[enemy.type]&&!ENEMY_TYPES[enemy.type]?.boss&&enemy.level>=12){const tuned=normalEnemyStats(enemy.level);Object.assign(enemy,{hp:tuned.hp,maxHp:tuned.hp,damage:tuned.damage,xp:tuned.xp,attackPeriod:tuned.attackPeriod});}
    this.player = { name:'Aren', x:520, y:1250, face:Math.PI/2, walking:false, hp:112, mana:85, level:1, xp:0, gold:45, skillPoints:2, invulnerable:0, attackUntil:0, dashUntil:0, hitUntil:0 };
    this.inventory = {}; this.resources = {wood:0,ore:0,herb:0,crystal:0,seed:6,wheat:0};
    for(const id of Object.keys(RESOURCES)) this.resources[id]??=0;
    this.player.classId='guardian';this.player.shield=0;this.player.shieldUntil=0;
    this.classId='guardian';
    this.generatedItems={};this.lootPity={legendaryMisses:0,bossMisses:0};this.lootSerial=0;this.summons=[];this.hazards=[];this.buffs=[];this.partyGames=[this];this.otherPlayers=[];
    this.equipment=createEmptyEquipment();this.itemFlags={};this.stash={};this.loadouts=[];this.trackedQuestId='';this.waypoint=null;
    this.skills = {}; this.questState = {}; this.discovered = ['daemmerhain']; this.unlockedShrines = [];
    this.learnedAbilities={};this.abilityLoadout=[null,null];
    this.contracts={active:[],completed:{}};
    this.journey=createJourneyState();advanceJourney(this,'explore','daemmerhain');
    this.endgame=createEndgameState();this.worldMode='overworld';this.pvp=null;this.pvpStats=null;this._pvpTravelSave=null;
    this.flags = {}; this.ledger = {}; this.kills = 0; this.cooldowns = {attack:0,dash:0,nova:0,bolt:0,potion:0};
    this.camera = {x:520,y:1250}; this.effects = []; this.projectiles = []; this.drops = [];
    this.shake = 0; this.combo = 0; this.comboTime = -Infinity; this.dead = false; this.autoSaveTimer = 0;
    this.playTime = 0; this.lastRegion = 'daemmerhain'; this.aim = null; this.dirty = true;
    const weapons = Object.values(ITEMS).filter(i=>i.type==='weapon');
    const armors = Object.values(ITEMS).filter(i=>i.type==='armor');
    if(weapons[0]) { this.inventory[weapons[0].id]=1; this.equipment.weapon=weapons[0].id; }
    if(armors[0]) { this.inventory[armors[0].id]=1; this.equipment.armor=armors[0].id; }
    const potion = Object.values(ITEMS).find(i=>i.type==='consumable');
    if(potion) this.inventory[potion.id]=5;
    this.player.hp=this.stats().maxHp;
  }
  change() { this.dirty = true; this.onChange(); }
  notice(text,tone='info') { this.onNotice(text,tone); }
  stats(equipmentOverride=this.equipment) {
    if(this.worldMode==='pvp'&&this.pvpStats)return {...this.pvpStats};
    const p=this.player;
    const s=basePlayerStats(p.level);
    for(const [key,value] of Object.entries(classStatModifiers(p.classId,p.level)))s[key]=(s[key]||0)+value;
    for(const id of Object.values(equipmentOverride)) {
      const item=this.item(id); const modifiers=this.generatedItems[id]?computeItemStats(item):item?.stats||{};
      for(const [key,value] of Object.entries(modifiers)) s[key]=(s[key]||0)+value;
    }
    for(const [key,value] of Object.entries(computeSetBonuses(Object.values(equipmentOverride).map(id=>this.item(id)).filter(Boolean)))) s[key]=(s[key]||0)+value;
    for(const [key,value] of Object.entries(getTalentModifiers(this.skills,p.classId)))s[key]=(s[key]||0)+value;
    // First-generation journeys could invest in the shared arcane/ranger trees.
    // Keep those ranks effective without granting other classes' new talents.
    for(const skill of LEGACY_SKILLS)if(!skill.id.startsWith('guardian_')) {
      const rank=Math.min(skill.maxRank,Math.max(0,this.skills[skill.id]||0));
      s[skill.effect.stat]=(s[skill.effect.stat]||0)+skill.effect.value*rank;
    }
    for(const boon of this.buffs||[])if(boon.expiresAt>this.time)for(const [key,value] of Object.entries(boon.effects))s[key]=(s[key]||0)+value;
    for(const modifiers of [getJourneyModifiers(this),getCompanionModifiers(this)])for(const [key,value] of Object.entries(modifiers))s[key]=(s[key]||0)+value;
    return capCombatStats(s,{level:p.level});
  }
  item(id) { return this.generatedItems[id]||ITEMS[id]||null; }
  itemStats(id) { const item=this.item(id);return this.generatedItems[id]?computeItemStats(item):item?.stats||{}; }
  previewEquipment(id) {
    const item=this.item(id),slot=equipmentSlot(item);if(!slot)return null;
    const before=this.stats(),after=this.stats({...this.equipment,[slot]:id}),delta={};
    for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(typeof before[key]==='number'||typeof after[key]==='number')delta[key]=(after[key]||0)-(before[key]||0);
    return {before,after,delta,currentId:this.equipment[slot],slot};
  }
  availableSkills() { return getClass(this.player.classId).talents; }
  selectClass(id) {
    if(!CLASSES.some(c=>c.id===id)||this.player.level>1||this.flags.classLocked||Object.values(this.skills).some(r=>r>0)) return false;
    this.player.classId=id;this.classId=id;const cls=getClass(id);
    if(cls.weaponId&&ITEMS[cls.weaponId]) {this.inventory[cls.weaponId]=Math.max(this.inventory[cls.weaponId]||0,1);this.equipment.weapon=cls.weaponId;}
    this.player.hp=this.stats().maxHp;this.player.mana=this.stats().mana;this.change();return true;
  }
  xpNeeded() { return xpToNext(this.player.level); }
  gainXp(amount) {
    this.player.xp += Math.max(0,amount);
    while(this.player.level<MAX_LEVEL && this.player.xp>=this.xpNeeded()) {
      this.player.xp-=this.xpNeeded(); this.player.level++; this.player.skillPoints+=2;
      advanceJourney(this,'level',this.player.level);
      const s=this.stats(); this.player.hp=s.maxHp; this.player.mana=s.mana;
      this.notice(`Level ${this.player.level} erreicht · 2 Talentpunkte`,'level');
      this.effect('ring',this.player.x,this.player.y,{color:'#e7bf68',radius:100,life:1}); this.onSound('level');
    }
    if(this.player.level===MAX_LEVEL) this.player.xp=Math.min(this.player.xp,this.xpNeeded());
    this.change();
  }
  regionAt(x=this.player.x,y=this.player.y) {
    if(this.worldMode==='pvp')return {id:'ashen_arena',name:'Arena der schwarzen Eide',subtitle:'Freiwilliges Duell · gleiche Kampfwerte',color:'#9b6d9c',level:1};
    if(this.dungeonInstance) return {id:this.dungeonInstance.id,name:this.dungeonInstance.definition.name,subtitle:`Dungeon · Stufe ${this.dungeonInstance.definition.minLevel} · Tiefe ${this.dungeonInstance.tier||1}`,color:this.dungeonInstance.definition.color||'#9a86b1',level:this.dungeonInstance.definition.minLevel};
    return REGIONS.find(r=>x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h)||REGIONS[0];
  }
  inSettlement(x=this.player.x,y=this.player.y) {
    if(this.dungeonInstance) return false;
    if(this.world.shrines.some(s=>s.region!=='daemmerhain'&&Math.hypot(x-s.x,y-s.y)<160)) return true;
    return Math.hypot(x-520,y-1250)<430 || (x>=600&&x<=910&&y>=1390&&y<=1630);
  }
  start() {
    this.started=true; this.paused=false; this.dead=false; this.keys.clear();
    if(!this.flags.welcomed) {
      this.flags.welcomed=true;
      if(!this.trackedQuestId&&!this.waypoint)this.setWaypoint('npc','mira');
      this.notice('Willkommen in Dämmerhain. Sprich mit der Hüterin am Dorfbrunnen.');
    }
    this.change();
  }
  reset(classId='guardian') { this.initialize();this.selectClass(classId);this.hasSave=false;this.start();this.save(false); }
  setSetting(key,value) {
    if(['masterVolume','musicVolume','effectsVolume'].includes(key)){
      if(!Number.isFinite(value)||value<0||value>1)return false;
      this.settings[key]=value;
    }else if(Object.hasOwn(this.settings,key)&&typeof value==='boolean')this.settings[key]=value;
    else return false;
    this.change(); this.save(false);
    return true;
  }
  effect(kind,x,y,options={}) {
    const life=options.life||.5;
    this.effects.push({kind,x,y,color:'#f1c475',radius:25,angle:0,life,maxLife:life,...options});
  }
  text(x,y,text,color='#f2d090') { this.effect('text',x,y,{text:String(text),color,life:1.1}); }
  event(kind,target,amount=1) {
    const key=`${kind}:${target}`; this.ledger[key]=(this.ledger[key]||0)+amount;
    advanceHunts(this,kind,target,amount,{dungeonTier:this.dungeonInstance?.tier||1});
    const journeyEvent=advanceJourney(this,kind,target,amount,{regionId:this.regionAt().id,partySize:(this.partyGames||[this]).filter(g=>!g.dead).length,
      dungeonTier:this.dungeonInstance?.tier||1,worldObject:this.world.interactions?.find(o=>o.id===target)});
    for(const id of journeyEvent.unlockedCompanions)this.notice(`Neuer Reisegefährte gewonnen · ${COMPANIONS.find(c=>c.id===id)?.name||'Gefährte'}`,'quest');
    for(const rank of journeyEvent.newFactionRanks)this.notice(`${FACTIONS.find(f=>f.id===rank.id)?.name||'Dein Bund'} · Rufrang ${rank.rank}`,'quest');
    for(const contract of this.contracts.active) {
      const before=contract.status;
      advanceContract(contract,kind,target,amount,{regionId:this.regionAt().id});
      if(before!=='ready'&&contract.status==='ready')this.notice(`Auftrag bereit: ${contract.title}`,'quest');
    }
    for(const q of QUESTS) {
      const state=this.questState[q.id]; if(state?.status!=='active') continue;
      q.objectives.forEach((o,i)=> { if(o.kind===kind && o.target===target) state.counts[i]=Math.min(o.count,(state.counts[i]||0)+amount); });
      if(q.objectives.every((o,i)=>state.counts[i]>=o.count)) {
        state.status='ready'; this.notice(`Questziel erreicht: ${q.title}`,'quest'); this.onSound('quest');
      }
    }
    this.change();
  }
  canAccept(q) {
    if(this.questState[q.id]||this.player.level<(q.minLevel||1)) return false;
    const requirements=Array.isArray(q.prerequisite)?q.prerequisite:q.prerequisite?[q.prerequisite]:[];
    return requirements.every(id=>this.questState[id]?.status==='done');
  }
  endgameSummary(){return endgameSummary(this);}
  encounterSummary(){return encounterSummary(this);}
  startHunt(id){return startHunt(this,id);}
  abandonHunt(id){return abandonHunt(this,id);}
  claimHunt(id){return claimHunt(this,id);}
  redeemHuntReward(id){return redeemHuntReward(this,id);}
  pvpInvite(){this.notice('Verbinde dich mit einer Gruppe, um einen Mitspieler zum Duell einzuladen.');return false;}
  pvpAccept(){return false;}
  pvpDecline(){return false;}
  pvpCancel(){return false;}
  pvpForfeit(){return false;}
  pvpReturn(){return false;}
  contractOffers(regionId=this.regionAt().id) {
    return getContractOffers({regionId,level:this.player.level,completed:this.contracts.completed[regionId]||0});
  }
  contractGiver(regionId) {
    const quest=QUESTS.find(q=>q.region===regionId&&q.contentType!=='side');
    return this.npcs.find(n=>n.id===quest?.giver)||this.npcs.find(n=>n.id==='rowan')||null;
  }
  acceptContract(id) {
    const offer=resolveContractOffer(id),giver=offer&&this.contractGiver(offer.region);
    if(!offer||!giver||dist(this.player,giver)>110||this.dungeonInstance||this.contracts.active.length>=MAX_ACTIVE_CONTRACTS)return false;
    if(!this.contractOffers(offer.region).some(o=>o.id===id)||this.contracts.active.some(c=>c.id===id||c.templateId===offer.templateId))return false;
    this.contracts.active.push(createContract(offer));this.notice(`Auftrag angenommen: ${offer.title}`,'quest');this.change();this.save(false);return true;
  }
  turnInContract(id) {
    const contract=this.contracts.active.find(c=>c.id===id),offer=resolveContractOffer(id),giver=contract&&this.contractGiver(contract.region);
    if(!contract||!offer||contract.status!=='ready'||!giver||dist(this.player,giver)>110||this.dungeonInstance||!validateContractState(this.contracts,{level:this.player.level}))return false;
    this.contracts.active=this.contracts.active.filter(c=>c.id!==id);
    if(this.trackedQuestId===id)this.trackQuest('');
    this.contracts.completed[offer.region]=(this.contracts.completed[offer.region]||0)+1;
    this.event('contract',offer.region);
    this.player.gold+=offer.reward.gold;this.resources.dust+=offer.reward.dust;this.gainXp(offer.reward.xp);
    if(offer.reward.item)this.addItem(offer.reward.item);
    this.notice(`Auftrag abgeschlossen · +${offer.reward.xp} EP · +${offer.reward.dust} Glutstaub`,'quest');this.change();this.save(false);return true;
  }
  cancelContract(id) {
    if(!this.contracts.active.some(c=>c.id===id))return false;
    this.contracts.active=this.contracts.active.filter(c=>c.id!==id);if(this.trackedQuestId===id)this.trackQuest('');this.notice('Auftrag aufgegeben.');this.change();this.save(false);return true;
  }
  questAccept(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || !this.canAccept(q)) return false;
    const counts=q.objectives.map(o=>{
      if(o.fresh===true)return 0;
      if(o.remembered===true&&o.kind==='interact')return Math.min(o.count,Math.max(this.ledger[`interact:${o.target}`]||0,(this.overworld||this.world).interactions?.find(object=>object.id===o.target)?.used?1:0));
      if(o.remembered===true&&o.kind==='explore')return Math.min(o.count,Math.max(this.ledger[`explore:${o.target}`]||0,this.discovered.includes(o.target)?1:0));
      return ['explore','puzzle','dungeon','raid'].includes(o.kind)||(o.kind==='kill'&&ENEMY_TYPES[o.target]?.boss)?Math.min(o.count,this.ledger[`${o.kind}:${o.target}`]||0):0;
    });
    this.questState[id]={status:q.objectives.every((o,i)=>counts[i]>=o.count)?'ready':'active',counts};
    if(!this.trackedQuestId)this.trackQuest(id);
    this.notice(`Quest angenommen: ${q.title}`,'quest'); this.onSound('quest'); this.save(false); this.change(); return true;
  }
  questTurnIn(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || this.questState[id]?.status!=='ready') return false;
    this.questState[id].status='done'; this.player.gold+=q.reward.gold||0; this.gainXp(q.reward.xp||0);
    if(this.trackedQuestId===id)this.trackQuest('');
    if(q.reward.item) this.addItem(q.reward.item,1);
    if(q.reward.skillPoints) this.player.skillPoints+=q.reward.skillPoints;
    this.notice(`Abgeschlossen: ${q.title} · +${q.reward.xp||0} EP · +${q.reward.gold||0} Gold`,'quest');
    this.onSound('quest'); this.change(); this.save(false); return true;
  }
  learn(id) {
    const skill=SKILLS.find(s=>s.id===id),eligibility=canLearnTalent(this,id);if(!skill||!eligibility.ok)return false;
    const rank=this.skills[id]||0, cost=skill.cost||1;
    this.skills[id]=rank+1; this.player.skillPoints-=cost;
    this.notice(`${skill.name} · Rang ${rank+1}`,'level'); this.onSound('level'); this.change(); this.save(false); return true;
  }
  learnAbility(id) {
    const eligibility=canLearnAbility(this,id);if(!eligibility.ok){this.notice(eligibility.reason);return false;}
    const a=getAbility(id);this.player.skillPoints-=a.talentCost;this.learnedAbilities[id]=true;
    const slot=this.abilityLoadout.indexOf(null);if(slot>=0)this.abilityLoadout[slot]=id;
    this.notice(`${a.name} erlernt${slot>=0?` · Aktionsslot ${slot+3}`:''}`,'level');this.onSound('level');this.change();this.save(false);return true;
  }
  setAbilityLoadout(slot,id) {
    if(!Number.isInteger(slot)||slot<0||slot>1||this.dead)return false;
    if(id!==null) {
      const a=getAbility(id);
      if(!a||a.classId!==this.player.classId||this.player.level<a.level||this.learnedAbilities[id]!==true||this.abilityLoadout[1-slot]===id)return false;
    }
    this.abilityLoadout[slot]=id;this.change();this.save(false);return true;
  }
  addItem(id,amount=1) {
    if(typeof id==='object'&&validateLootItem(id)) {if(!this.inventory[id.id]&&this.bagUsed()>=240)return false;this.generatedItems[id.id]=id;id=id.id;}
    if(!this.item(id)) return false;
    this.inventory[id]=(this.inventory[id]||0)+amount; this.change(); return true;
  }
  bagUsed() {return Object.keys(this.generatedItems).filter(id=>this.inventory[id]>0).length;}
  setItemFlag(id,flag) {return toggleItemFlag(this,id,flag);}
  depositItem(id) {return transferStashItem(this,id,true);}
  withdrawItem(id) {return transferStashItem(this,id,false);}
  saveLoadout(name) {return saveEquipmentLoadout(this,name);}
  applyLoadout(id) {return applyEquipmentLoadout(this,id);}
  deleteLoadout(id) {
    if(!this.loadouts.some(l=>l.id===id))return false;
    this.loadouts=this.loadouts.filter(l=>l.id!==id);this.change();this.save(false);return true;
  }
  respecTalents() {
    const refund=SKILLS.reduce((sum,t)=>sum+Math.min(t.maxRank||3,Math.max(0,Math.floor(this.skills[t.id]||0)))*(t.cost||1),0);
    const cost=20+this.player.level*5;
    if(this.dead||!this.inSettlement()||this.inCombat()||!refund||this.player.gold<cost)return false;
    this.player.gold-=cost;this.player.skillPoints+=refund;this.skills={};
    const stats=this.stats();this.player.hp=Math.min(this.player.hp,stats.maxHp);this.player.mana=Math.min(this.player.mana,stats.mana);
    this.notice(`Talente neu verteilt · ${refund} Punkte zurück · ${cost} Gold`);this.change();this.save(false);return true;
  }
  trackQuest(id) {
    if(typeof id!=='string'||id&&!['active','ready'].includes((this.questState[id]||this.contracts.active.find(c=>c.id===id))?.status))return false;
    this.trackedQuestId=id;
    if(id)this.waypoint={kind:'quest',id,...resolveWaypoint(this,'quest',id)};
    else if(this.waypoint?.kind==='quest')this.waypoint=null;
    this.change();this.save(false);return true;
  }
  setWaypoint(kind,id) {
    if(kind==='clear'&&id===''){this.waypoint=null;this.change();this.save(false);return true;}
    if(this.dungeonInstance)return false;
    const destination=resolveWaypoint(this,kind,id);if(!destination)return false;
    this.waypoint={kind,id,...destination};this.notice(`Reiseziel: ${destination.label}`);this.change();this.save(false);return true;
  }
  waypointTarget() {
    if(!this.waypoint||this.dungeonInstance)return null;
    const point=resolveWaypoint(this,this.waypoint.kind,this.waypoint.id);
    return point?{...point,kind:this.waypoint.kind,id:this.waypoint.id,distance:dist(this.player,point)}:null;
  }
  adventureGuidance() {return adventureGuidance(this);}
  claimAchievement(id) {
    const reward=claimJourneyAchievement(this,id);if(!reward)return false;
    this.player.gold+=reward.gold||0;this.player.skillPoints+=reward.skillPoints||0;
    for(const [key,count] of Object.entries(reward.resources||{}))if(Object.hasOwn(this.resources,key))this.resources[key]+=count;
    if(reward.xp)this.gainXp(reward.xp);if(reward.item)this.addItem(reward.item);
    this.notice(`Errungenschaft belohnt · ${ACHIEVEMENTS.find(a=>a.id===id)?.name||'Deine Reise'}`,'quest');this.change();this.save(false);return true;
  }
  selectCompanion(id) {
    if(!selectJourneyCompanion(this,id))return false;
    this.summons=this.summons.filter(s=>!s.companion||s.actorId!==(this.player.id||'local'));
    const stats=this.stats();this.player.hp=Math.min(this.player.hp,stats.maxHp);this.player.mana=Math.min(this.player.mana,stats.mana);
    this.notice(id?`${COMPANIONS.find(c=>c.id===id)?.name||'Reisegefährte'} begleitet dich`:'Reisegefährte ruht');this.change();this.save(false);return true;
  }
  chooseMastery(id) {
    if(!chooseJourneyMastery(this,id))return false;
    const stats=this.stats();this.player.hp=Math.min(this.player.hp,stats.maxHp);this.player.mana=Math.min(this.player.mana,stats.mana);
    this.notice(`${JOURNEY_MASTERIES.find(m=>m.id===id)?.name||'Meistereid'} gewählt`,'level');this.change();this.save(false);return true;
  }
  worldEventSummary() {
    if(this.networkActive&&this.networkWorldEventSummary)return this.networkWorldEventSummary;
    return summarizeWorldEvents(this.overworld||this.world,this.player);
  }
  handleWorldEventEffects(effects) {
    for(const effect of effects) {
      const event=this.world.worldEvents?.find(e=>e.id===effect.eventId);
      const members=(this.partyGames||[this]);
      if(effect.kind==='warning')this.hazards.push({kind:'warning',x:effect.x,y:effect.y,radius:effect.radius||170,life:effect.duration||2,windup:true,color:'#b87759'});
      for(const ally of members) {
        if(effect.kind==='respite'&&!ally.dead&&ally.player.hp>0&&event?.participants.includes(ally.player.id||'local')&&dist(ally.player,event)<220) {
          const stats=ally.stats();ally.player.hp=Math.min(stats.maxHp,ally.player.hp+stats.maxHp*.2);ally.player.mana=Math.min(stats.mana,ally.player.mana+stats.mana*.15);
          ally.effect('ring',ally.player.x,ally.player.y,{color:'#8db6a5',radius:45,life:.8});ally.change();ally.save(false);
        }
        if(dist(ally.player,effect)<700)ally.notice(effect.text,effect.kind==='success'?'quest':'info');
        if(effect.kind==='success'&&event?.participants.includes(ally.player.id||'local')){ally.event('world_event',effect.eventId);ally.save(false);}
      }
    }
    if(effects.length)this.change();
  }
  interactWorldEvent(objectId,choice) {
    if(!this.started||this.dead)return false;
    const object=this.world.eventObjects?.find(o=>o.id===objectId&&!o.hidden);
    if(!object||dist(this.player,object)>85)return false;
    if(object.role==='reward')return this.claimWorldEvent(object.eventId);
    const result=interactEvent(this.world,objectId,[this.player],this.time,{choice});
    this.handleWorldEventEffects(result.effects||[]);
    if(result.message)this.notice(result.message,result.success?'quest':'info');
    if(result.success){this.change();this.save(false);}return !!result.success;
  }
  claimWorldEvent(id) {
    if(this.dead||this.bagUsed()>=240){this.notice('Die Belohnung wartet auf einen freien Platz in deinem Gepäck.');return false;}
    const reward=claimWorldEventReward(this.world,id,this.player,this.time);if(!reward)return false;
    const loot=generateLoot({level:reward.lootLevel,tier:reward.lootTier,boss:reward.boss,classId:this.player.classId,rng:this.random,pity:this.lootPity,
      source:id,uid:`event-loot-${++this.lootSerial}-${Math.floor(this.random()*1e9)}-${this.player.id||'local'}`});
    this.addItem(loot);this.player.gold+=reward.gold;this.resources.dust+=reward.dust;this.gainXp(reward.xp);
    this.notice(`${loot.name} · +${reward.gold} Gold · Abenteuerbelohnung geborgen`,'loot');this.change();this.save(false);return true;
  }
  canEquipItem(id) {
    const item=this.item(id);if(!item||!this.inventory[id]||!equipmentSlot(item)||(item.minLevel||item.level||1)>this.player.level)return false;
    const base=ITEM_BASES.find(b=>b.id===(item.baseId||item.id));
    return ![item.classIds,base?.classIds].some(ids=>Array.isArray(ids)&&!ids.includes(this.player.classId));
  }
  equip(id) {
    if(!this.canEquipItem(id))return false;const item=this.item(id);
    this.equipment[equipmentSlot(item)]=id;const s=this.stats();this.player.hp=Math.min(this.player.hp,s.maxHp);this.player.mana=Math.min(this.player.mana,s.mana);
    this.event('equip',id);
    this.notice(`${item.name} ausgerüstet`); this.change(); this.save(false); return true;
  }
  unequip(slot) {
    if(!EQUIPMENT_SLOT_IDS.includes(slot)||!this.equipment[slot])return false;
    this.equipment[slot]=null;const s=this.stats();this.player.hp=Math.min(this.player.hp,s.maxHp);this.player.mana=Math.min(this.player.mana,s.mana);
    this.notice('Ausrüstung abgelegt.');this.change();this.save(false);return true;
  }
  buy(id) {
    if(id==='seed') {
      if(this.player.gold<4) return false;
      this.player.gold-=4; this.resources.seed+=3; this.notice('3 Saatgut gekauft'); this.change(); this.save(false); return true;
    }
    const item=ITEMS[id]; if(!item || this.player.gold<item.price||(item.minLevel||item.level||1)>this.player.level||item.classIds&&!item.classIds.includes(this.player.classId)) return false;
    this.player.gold-=item.price; this.addItem(id); this.notice(`${item.name} gekauft`); this.save(false); return true;
  }
  sell(id) {
    const item=this.item(id); if(!item || !this.inventory[id] || Object.values(this.equipment).includes(id)||isItemProtected(this,id)) return false;
    this.inventory[id]--; this.player.gold+=Math.max(1,Math.floor(item.price*.4));if(this.inventory[id]<=0&&this.generatedItems[id]&&!this.stash[id]){delete this.generatedItems[id];delete this.inventory[id];delete this.itemFlags[id];} this.change();this.save(false);return true;
  }
  consume(id) {
    const item=this.item(id); if(item?.type!=='consumable'||!this.inventory[id]) return false;
    const profile=getConsumableProfile(item);
    if(!profile||this.dead||this.player.hp<=0||this.cooldowns.potion>0||(this.cooldowns[profile.cooldownGroup]||0)>0||profile.minLevel>this.player.level)return false;
    if(profile.outOfCombat&&this.inCombat()){this.notice('Diese Mahlzeit braucht einen ruhigen Moment außerhalb des Kampfes.');return false;}
    const s=this.stats(); const p=this.player;
    if((!item.stats.hpRestore||p.hp>=s.maxHp)&&(!item.stats.manaRestore||p.mana>=s.mana)) return false;
    this.inventory[id]--; p.hp=Math.min(s.maxHp,p.hp+(item.stats.hpRestore||0)); p.mana=Math.min(s.mana,p.mana+(item.stats.manaRestore||0));
    this.cooldowns[profile.cooldownGroup]=profile.cooldown;
    this.cooldowns.potion=Math.max(this.cooldowns.potion||0,3);
    this.notice(`${item.name} verwendet`); this.onSound('heal'); this.change(); this.save(false); return true;
  }
  salvage(id) {
    const item=this.generatedItems[id];if(!item||!this.inventory[id]||Object.values(this.equipment).includes(id)||isItemProtected(this,id)) return false;
    this.inventory[id]--;for(const [key,n] of Object.entries(salvageYield(item))) this.resources[key]=(this.resources[key]||0)+n;
    if(this.inventory[id]<=0&&!this.stash[id]){delete this.generatedItems[id];delete this.inventory[id];delete this.itemFlags[id];}
    this.notice(`${item.name} zerlegt`,'loot');this.change();this.save(false);return true;
  }
  socket(id,gemId) {
    const item=this.generatedItems[id];if(!item||!this.inventory[id]||!GEM_TYPES[gemId]||!(this.resources[gemId]>0))return false;
    const index=item.sockets.findIndex(s=>s===null);if(index<0)return false;
    this.resources[gemId]--;item.sockets[index]=gemId;this.notice('Edelstein gesockelt','loot');this.change();this.save(false);return true;
  }
  upgradeItem(id) {
    const item=this.generatedItems[id];if(!item||!this.inventory[id]||(item.upgrade||0)>=10)return false;
    const cost=8+(item.upgrade||0)*6;if(this.resources.dust<cost)return false;
    this.resources.dust-=cost;item.upgrade=(item.upgrade||0)+1;
    this.notice(`${item.name} auf +${item.upgrade} verbessert`,'loot');this.change();this.save(false);return true;
  }
  craft(id) {
    const recipe=RECIPES.find(r=>r.id===id); if(!recipe) return false;
    const factionGate=canCraftJourneyRecipe(this,recipe);if(!factionGate.ok){this.notice(factionGate.reason);return false;}
    if(this.player.level<(recipe.minLevel||1)||recipe.classIds&&!recipe.classIds.includes(this.player.classId)){this.notice('Dieses Rezept erfordert eine höhere Stufe oder eine andere Klasse.');return false;}
    if(!Object.entries(recipe.ingredients).every(([res,n])=>(this.resources[res]||this.inventory[res]||0)>=n)) { this.notice('Dir fehlen noch Materialien.'); return false; }
    for(const [res,n] of Object.entries(recipe.ingredients)) {
      if(Object.hasOwn(this.resources,res)) this.resources[res]-=n; else this.inventory[res]-=n;
    }
    if(Object.hasOwn(this.resources,recipe.output)) this.resources[recipe.output]+=recipe.amount||1;
    else this.addItem(recipe.output,recipe.amount||1);
    this.event('craft',id); this.gainXp(12); this.notice(`${recipe.name} hergestellt`,'loot'); this.onSound('craft'); this.save(false); return true;
  }
  nearby() {
    const p=this.player, candidates=[];
    const add=(kind,object,label,range)=> { const d=dist(p,object); if(d<range) candidates.push({kind,object,label,distance:d}); };
    this.npcs.forEach(n=>add('npc',n,`Mit ${n.name} sprechen`,85));
    this.world.nodes.filter(n=>n.readyAt<=this.time).forEach(n=>add('node',n,({wood:'Holz sammeln',ore:'Erz abbauen',herb:'Kräuter sammeln',crystal:'Kristalle bergen'})[n.type],65));
    this.world.plots.forEach(n=>add('plot',n,n.state==='empty'?'Saat pflanzen':n.readyAt<=this.time?'Weizen ernten':'Weizen wächst …',48));
    this.world.chests.filter(n=>!n.opened&&!n.locked).forEach(n=>add('chest',n,'Truhe öffnen',60));
    this.world.shrines.forEach(n=>add('shrine',n,`${n.name} entzünden / rasten`,80));
    for(const n of this.world.interactions||[])if(interactionAvailable(n,this.time))add('worldObject',n,n.active&&!n.challengeCompleted?'Herausforderung läuft …':n.challengeCompleted?'Belohnung bergen':n.label,70);
    for(const n of this.world.eventObjects||[])if(!n.hidden) {
      const state=this.world.worldEvents.find(e=>e.id===n.eventId);
      if(n.role==='start'&&(state.state==='active'||state.readyAt>this.time))continue;
      if(n.role==='reward'&&state.claimedBy.includes(this.player.id||'local'))continue;
      if(['objective','escort'].includes(n.role)&&(!(n.repairsLeft>0)||n.hp>=n.maxHp))continue;
      add('worldEvent',n,n.label,75);
    }
    for(const n of this.world.dungeonEntrances||[]) add('dungeon',n,`${n.name||DUNGEONS.find(d=>d.id===n.id)?.name} betreten`,85);
    for(const n of this.world.puzzleObjects||[]) add('puzzle',n,n.label||'Runenmechanismus betätigen',60);
    if(this.world.dungeonExit) add('exit',this.world.dungeonExit,'Dungeon verlassen',65);
    for(const other of this.partyGames||[]) if(other!==this&&other.dead) add('revive',other.player,`${other.player.name} wiederbeleben`,75);
    const destination=this.waypointTarget();
    return candidates.sort((a,b)=>Number(b.object.id===destination?.objectId)-Number(a.object.id===destination?.objectId)||a.distance-b.distance)[0]||null;
  }
  inCombat() {
    return (this.player.lastDamageAt!==undefined&&this.time-this.player.lastDamageAt<5)||
      this.world.enemies.some(e=>e.alive&&dist(e,this.player)<260&&(e.aggro||e.phase==='windup'));
  }
  interactionSummary() {
    if(this.networkActive&&this.networkInteractionSummary)return this.networkInteractionSummary;
    const objects=(this.overworld||this.world).interactions||[];
    return Object.entries(INTERACTION_TYPES).map(([kind,definition])=>({...definition,kind,total:objects.filter(o=>o.kind===kind).length,
      completed:objects.filter(o=>o.kind===kind&&(o.used||(this.ledger[`interact:${o.id}`]||0)>0)).length}));
  }
  addWorldBoon(id,expiresAt=this.time+WORLD_BOONS[id]?.duration) {
    const definition=WORLD_BOONS[id];if(!definition)return false;
    const base=basePlayerStats(this.player.level),effects={...definition.effects};
    if(id==='blood_oath')effects.damage=Math.round(base.damage*.1);
    if(id==='night_aether')effects.spellDamage=Math.round(base.spellDamage*.1);
    this.buffs=this.buffs.filter(b=>b.id!==id);
    this.buffs.push({id,name:definition.name,expiresAt:Math.min(expiresAt,this.time+definition.duration),effects});
    this.change();return true;
  }
  spawnWorldChallenge(object) {
    const pool=REGION_ENEMY_POOLS[object.region]||['wolf'];
    const count=object.kind==='cursed_chest'?1:2;
    const choices=Array.isArray(pool)?pool:pool.enemies||pool.normal||pool.types||['wolf'];
    object.challengeIds=[];
    for(let index=0;index<count;index++) {
      const base=choices[(index+Math.floor(this.random()*choices.length))%choices.length];
      const type=object.kind==='cursed_chest'?`${base}_boss`:base;
      if(!BESTIARY_ENEMIES[type])continue;
      const angle=index*Math.PI+Math.PI/2,x=object.x+Math.cos(angle)*85,y=object.y+Math.sin(angle)*85;
      const enemy=createBestiaryEnemy(type,`${object.id}-guardian-${index}`,x,y,{level:object.level,region:object.region});
      enemy.challengeId=object.id;enemy.phase='idle';enemy.aggro=false;enemy.attackTimer=1.2;
      this.world.enemies.push(enemy);object.challengeIds.push(enemy.id);
      this.effect('ring',x,y,{color:'#bf596b',radius:40,life:1});
    }
    object.active=true;
    this.notice(object.kind==='cursed_chest'?'Der schwarze Schwur ruft einen Boss. Besiege ihn und kehre zur Truhe zurück.':'Die Grabwächter erwachen. Besiege beide, bevor du das Grab plünderst.','quest');
  }
  updateWorldInteractions() {
    for(const object of this.world.interactions||[])if(object.active&&!object.used&&!object.challengeCompleted) {
      if(!object.challengeIds?.length)this.spawnWorldChallenge(object);
      if(object.challengeIds.length&&object.challengeIds.every(id=>!this.world.enemies.find(e=>e.id===id)?.alive)) {
        object.challengeCompleted=true;this.notice(`${object.name}: Der Fluch ist gebrochen. Berge deine Belohnung.`,'loot');this.change();
      }
    }
  }
  interactWorldObject(id) {
    const object=this.world.interactions?.find(o=>o.id===id);
    if(!this.started||this.dead||this.paused||!object||dist(this.player,object)>75||!interactionAvailable(object,this.time))return false;
    const level=object.level||1,scale=1+Math.floor(level/12),p=this.player;
    if(object.kind==='fountain'&&p.hp>=this.stats().maxHp&&p.mana>=this.stats().mana&&!(p.afflictions||[]).length&&!(p.slowUntil>this.time)) {
      this.notice('Du bist vollständig erholt. Die Seelenquelle bleibt für später erhalten.');return false;
    }
    if(['sarcophagus','cursed_chest','sealed_cache'].includes(object.kind)&&(object.challengeCompleted||object.kind==='sealed_cache')&&this.bagUsed()>=240) {
      this.notice('Dein Gepäck ist voll. Die Belohnung bleibt hier, bis du einen Platz frei machst.');return false;
    }
    if(['sarcophagus','cursed_chest'].includes(object.kind)&&!object.challengeCompleted) {
      if(object.active){this.notice('Besiege zuerst die herbeigerufenen Wächter.');return false;}
      this.spawnWorldChallenge(object);this.change();this.save(false);return true;
    }
    if(object.kind==='captive'&&this.world.enemies.some(e=>e.alive&&dist(e,object)<170)){this.notice('Der Gefangene ist noch in Gefahr. Besiege die Feinde im Umkreis.');return false;}
    if(object.kind==='campfire') {
      if(this.inCombat()){this.notice('Du kannst erst außerhalb des Kampfes rasten.');return false;}
      if(this.resources.wood<2){this.notice('Du brauchst 2 Holz, um den Glutherd zu entzünden.');return false;}
      if(p.hp>=this.stats().maxHp&&p.mana>=this.stats().mana){this.notice('Du bist bereits vollständig erholt.');return false;}
      this.resources.wood-=2;p.hp=Math.min(this.stats().maxHp,p.hp+this.stats().maxHp*.45);p.mana=Math.min(this.stats().mana,p.mana+this.stats().mana*.45);object.readyAt=this.time+60;
    } else if(['altar','obelisk'].includes(object.kind)) {
      const cost=object.kind==='altar'?3:5;
      if(this.resources.crystal<cost){this.notice(`Du brauchst ${cost} Glutkristalle für dieses Ritual.`);return false;}
      if(object.kind==='altar'&&p.hp<this.stats().maxHp*.3){this.notice('Du bist zu stark verwundet für den Bluteid.');return false;}
      this.resources.crystal-=cost;if(object.kind==='altar')p.hp=Math.max(1,p.hp*.8);
      this.addWorldBoon(object.kind==='altar'?'blood_oath':'night_aether');object.used=true;
    } else {
      object.used=true;object.active=false;
      if(object.kind==='barrel'){this.resources.wood+=2*scale;this.resources.ore+=scale;p.gold+=5+level;}
      if(object.kind==='urn'){this.resources.dust+=2*scale;this.resources.crystal+=scale;}
      if(object.kind==='fountain'){p.hp=this.stats().maxHp;p.mana=this.stats().mana;p.afflictions=[];p.slowUntil=0;this.onSound('heal');}
      if(object.kind==='captive'){p.gold+=25+level*2;this.gainXp(50+level*15);this.event('rescue',object.region);}
      if(object.kind==='lore'){this.gainXp(20+level*5);this.notice(object.text,'quest');}
      if(object.kind==='lever') {
        const cache=this.world.interactions.find(o=>o.id===object.linkedId);
        if(cache){cache.locked=false;this.effect('ring',cache.x,cache.y,{radius:50,color:'#d8b27c',life:1.5});this.notice('Eine Kette schlägt gegen Stein. Der nahe Gruftvorrat ist geöffnet.','quest');}
      }
      if(['sarcophagus','cursed_chest','sealed_cache'].includes(object.kind)) {
        p.gold+=15+level*3;this.resources.dust+=scale*3;
        const loot=generateLoot({level,boss:object.kind==='cursed_chest',source:object.kind,classId:p.classId,rng:this.random,pity:this.lootPity,uid:`loot-${++this.lootSerial}-${Math.floor(this.random()*1e9)}`});
        this.addItem(loot);this.notice(`${loot.name} aus ${object.name} geborgen`,'loot');
        this.gainXp(25+level*5);
      }
    }
    this.event('interact',object.id);this.event('interaction',object.kind);this.effect('burst',object.x,object.y,{color:object.color,radius:40,life:.6});
    this.notice(`${object.name}${object.kind==='campfire'?' · Erholt':object.kind==='lore'?' · Chronik entdeckt':' · Interaktion abgeschlossen'}`,'loot');
    this.onSound('gather');this.change();this.save(false);return true;
  }
  interact() {
    if(!this.started || this.dead || this.paused) return;
    const n=this.nearby(); if(!n) { this.notice('Gehe näher an eine Person oder Ressource.'); return; }
    const o=n.object;
    if(n.kind==='worldEvent'){this.interactWorldEvent(o.id,o.choice);return;}
    if(n.kind==='worldObject'){this.interactWorldObject(o.id);return;}
    if(n.kind==='dungeon') {this.enterDungeon(o.dungeonId||o.id);return;}
    if(n.kind==='exit') {this.exitDungeon();return;}
    if(n.kind==='revive') { const ally=this.partyGames.find(g=>g.player===o);if(ally) {ally.dead=false;ally.paused=false;ally.player.hp=ally.stats().maxHp*.4;ally.player.invulnerable=3;ally.onRevived?.();this.event('revive',o.id||o.name);this.notice(`${o.name} wiederbelebt`);this.change();}return;}
    if(n.kind==='puzzle') {
      const result=interactPuzzle(this.dungeonInstance,o.id,this.partyGames.filter(g=>!g.dead).map(g=>g.player),this.time);
      this.notice(result.message||'Mechanismus betätigt');if(result.event)for(const ally of this.partyGames)ally.event(result.event,result.target||this.dungeonInstance.id);
      this.change();return;
    }
    if(n.kind==='npc') this.onDialogue(o);
    if(n.kind==='node') {
      const amount=1+Math.floor(this.stats().gatherYield)+Math.floor(this.random()*2);
      this.resources[o.type]=(this.resources[o.type]||0)+amount; o.readyAt=this.time+40;
      this.event('gather',o.type,amount); this.gainXp(5); this.text(o.x,o.y,`+${amount}`, '#a8cf8d');
      this.effect('burst',o.x,o.y,{color:'#b4cc82',life:.55}); this.onSound('gather');
    }
    if(n.kind==='plot') {
      if(o.state==='empty') {
        if(this.resources.seed<=0) { this.notice('Kaufe Saat beim Händler oder stelle sie aus Weizen her.'); return; }
        this.resources.seed--; o.state='growing'; o.readyAt=this.time+25; this.notice('Gepflanzt · Ernte in 25 Sekunden'); this.onSound('gather');
      } else if(o.readyAt<=this.time) {
        const amount=3+Math.floor(this.stats().gatherYield);
        this.resources.wheat+=amount; this.resources.seed+=1; o.state='empty';
        this.event('farm','wheat',amount); this.event('gather','wheat',amount); this.gainXp(15);
        this.text(o.x,o.y,`+${amount} Weizen`,'#ead080'); this.onSound('gather');
      } else this.notice(`Ernte in ${Math.ceil(o.readyAt-this.time)} Sekunden.`);
    }
    if(n.kind==='chest') {
      if(this.bagUsed()>=240){this.notice('Dein Gepäck ist voll. Zerlege oder verkaufe Ausrüstung.');return;}
      o.opened=true; const gold=20+Math.floor(this.random()*30); this.player.gold+=gold;
      const item=generateLoot({level:o.lootLevel||o.level||Math.max(1,this.regionAt().level),tier:o.lootTier||1,boss:!!o.requiresBoss,classId:this.player.classId,rng:this.random,pity:this.lootPity,source:o.lootTable||'chest',uid:`loot-${++this.lootSerial}-${Math.floor(this.random()*1e9)}`});
      for(const [key,amount] of Object.entries(o.rewards||{}))if(Object.hasOwn(this.resources,key))this.resources[key]+=amount;
      if(item) { this.addItem(item); this.notice(`Truhe: ${item.name} · +${gold} Gold`,'loot'); }
      this.gainXp(25); this.effect('burst',o.x,o.y,{color:'#f1c374',radius:55,life:1}); this.onSound('loot');
    }
    if(n.kind==='shrine') {
      const fresh=!this.unlockedShrines.includes(o.id);
      if(fresh) this.unlockedShrines.push(o.id);
      this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
      this.notice(fresh?`${o.name} entdeckt · Schnellreise freigeschaltet`:'Gerastet · Leben und Mana wiederhergestellt','quest');
      this.effect('ring',o.x,o.y,{color:'#b5dace',radius:100,life:1}); this.onSound('level');
    }
    this.change(); this.save(false);
  }
  travel(id) {
    if(this.dungeonInstance) {this.notice('Verlasse zuerst den Dungeon.');return false;}
    const shrine=this.world.shrines.find(s=>s.id===id);
    if(!shrine || !this.unlockedShrines.includes(id)) return false;
    this.player.x=shrine.x; this.player.y=shrine.y+48; this.player.invulnerable=2;
    this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
    this.notice(`Schnellreise: ${shrine.name}`); this.change(); this.save(false); return true;
  }
  enterDungeon(id,tier=1) {
    const definition=DUNGEONS.find(d=>d.id===id);if(!definition||this.dungeonInstance)return false;
    if(dist(this.player,definition.entrance)>110) {this.notice('Gehe zum Eingang des Dungeons.');return false;}
    const party=(this.partyGames||[this]).filter(g=>!g.dead);
    const required=definition.partyRequired||definition.minPlayers||1;
    if(party.length<required) {this.notice(`Für ${definition.name} benötigt ihr ${required} Spieler.`,'quest');return false;}
    if(party.some(g=>g.player.level<definition.minLevel)) {this.notice(`Alle Gruppenmitglieder benötigen Stufe ${definition.minLevel}.`);return false;}
    tier=Math.floor(clamp(tier,1,30));const prior=this.dungeonRecords[id]?.bestTier||0;
    if(tier>prior+1) {this.notice('Meistere zuerst die vorherige Dungeontiefe.');return false;}
    const instance=createDungeon(id,{tier,partySize:party.length,seed:826404+tier*131});instance.tier=tier;
    for(const ally of party) {
      ally.returnPoint={x:ally.player.x,y:ally.player.y};ally.overworld=ally.world;
      ally.world=instance.world;ally.dungeonInstance=instance;ally.npcs=[];ally.player.x=instance.spawn.x+(party.indexOf(ally)%4)*32;ally.player.y=instance.spawn.y+Math.floor(party.indexOf(ally)/4)*32;
      ally.player.invulnerable=3;ally.projectiles=[];ally.effects=[];ally.drops=[];ally.hazards=[];ally.summons=[];ally.change();
      ally.notice(`${definition.name} · Tiefe ${tier}`,'quest');
    }
    return true;
  }
  exitDungeon() {
    if(!this.dungeonInstance)return false;
    for(const ally of this.partyGames||[this]) {
      if(!ally.dungeonInstance)continue;
      ally.world=ally.overworld;ally.dungeonInstance=null;ally.npcs=NPCS;
      ally.player.x=ally.returnPoint?.x||520;ally.player.y=ally.returnPoint?.y||1250;
      ally.projectiles=[];ally.effects=[];ally.drops=[];ally.hazards=[];ally.summons=[];ally.player.invulnerable=3;ally.change();ally.save(false);
    }
    return true;
  }
  leaveDungeon() {return this.exitDungeon();}
  collides(x,y,r=12) {
    if(x<r+16 || y<r+16 || x>this.world.width-r-16 || y>this.world.height-r-16) return true;
    if(nearbyObstacles(this.world,x,y,r).some(({object:o,type})=>Math.hypot(o.x-x,o.y-y)<r+(type==='tree'?8:12)*(o.scale||1)))return true;
    return [...this.world.structures,...(this.world.walls||[])].some(o=> {
      if(o.blocking===false) return false;
      const box=o.collision||{x:o.x+8,y:o.y+o.h*.4,w:o.w-16,h:o.h*.5};
      return x+r>box.x && x-r<box.x+box.w && y+r>box.y && y-r<box.y+box.h;
    });
  }
  move(body,dx,dy,r=12) {
    // Axis separation lets the character slide along foliage and house corners.
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/12));
    for(let i=0;i<steps;i++) {
      if(!this.collides(body.x+dx/steps,body.y,r))body.x+=dx/steps;
      if(!this.collides(body.x,body.y+dy/steps,r))body.y+=dy/steps;
    }
  }
  _healAbilityAlly(ally,amount) {
    if(ally.dead||ally.player.hp<=0)return 0;
    const reduction=ally.player.healingReductionUntil>ally.time?clamp(ally.player.healingReduction||0,0,1):0;
    const healed=Math.max(0,Math.min(ally.stats().maxHp-ally.player.hp,amount*(1-reduction)));
    ally.player.hp+=healed;if(healed>0){ally.text(ally.player.x,ally.player.y-24,`+${Math.round(healed)}`,'#b7d7a1');ally.change();}return healed;
  }
  _abilityPoint(range) {
    const p=this.player,length=this.aim&&Number.isFinite(this.aim.x)&&Number.isFinite(this.aim.y)?Math.min(range,dist(p,this.aim)):range;
    return {x:p.x+Math.cos(p.face)*length,y:p.y+Math.sin(p.face)*length};
  }
  _abilityShield(ally,fraction,duration) {
    const shield=ally.stats().maxHp*fraction*classPowerMultiplier(this.player.classId,'shield');
    ally.player.shield=Math.max(ally.player.shield||0,shield);ally.player.shieldUntil=Math.max(ally.player.shieldUntil||0,this.time+duration);ally.change();
  }
  useLearnedAbility(slot) {
    if(!Number.isInteger(slot)||slot<0||slot>1||!this.started||this.paused||this.dead||this.player.hp<=0)return false;
    const id=this.abilityLoadout[slot],a=getAbility(id),p=this.player;
    if(!a||a.classId!==p.classId||p.level<a.level||this.learnedAbilities[id]!==true)return false;
    for(let prerequisite=a.requires;prerequisite;prerequisite=getAbility(prerequisite)?.requires)if(this.learnedAbilities[prerequisite]!==true)return false;
    const key=`ability:${id}`;if((this.cooldowns[key]||0)>0)return false;
    const s=this.stats();if(p.mana<a.cost){this.notice('Nicht genug Mana.');return false;}
    const party=(this.partyGames||[this]).filter(g=>g.world===this.world),allies=party.filter(g=>!g.dead&&g.player.hp>0&&dist(p,g.player)<(a.radius||1));
    const targets=this.world.enemies.filter(e=>e.alive&&dist(p,e)<(a.range||a.radius||150));
    let target=null;
    if(a.kind==='revive')target=party.filter(g=>g!==this&&g.dead&&dist(p,g.player)<a.radius).sort((x,y)=>dist(p,x.player)-dist(p,y.player))[0];
    if(a.kind==='execute')target=targets.sort((x,y)=>x.hp/x.maxHp-y.hp/y.maxHp)[0];
    if(a.kind==='curse')target=targets.filter(e=>Math.abs(angleDiff(Math.atan2(e.y-p.y,e.x-p.x),p.face))<1.25).sort((x,y)=>dist(p,x)-dist(p,y))[0];
    if(['revive','execute','curse'].includes(a.kind)&&!target){this.notice(a.kind==='revive'?'Kein gefallener Gefährte in Reichweite.':'Kein Gegner in Reichweite.');return false;}
    if(a.kind==='bargain'&&(p.hp<=s.maxHp*a.minHealth||p.mana>=s.mana)){this.notice('Du brauchst genügend Leben und fehlendes Mana.');return false;}
    p.mana-=a.cost;this.cooldowns[key]=a.cooldown*(1-s.cooldown);p.castUntil=this.time+.35;p.attackUntil=this.time+.25;
    const powerFactor=classPowerMultiplier(p.classId,a.powerKind),healFactor=classPowerMultiplier(p.classId,'heal');
    const damage=(s[a.stat]||0)*a.damageMultiplier*powerFactor,actorId=p.id||'local';
    const applySlow=e=>{if(a.slow){const factor=e.slowUntil>this.time?e.slowFactor??1:1;e.slowUntil=Math.max(e.slowUntil||0,this.time+(a.duration||3));e.slowFactor=Math.min(factor,1-a.slow);}};
    this.effect('ring',p.x,p.y,{radius:a.kind==='meteor'?35:a.radius||55,color:a.color,life:.45});
    if(a.kind==='shield')this._abilityShield(this,a.shieldFraction,a.duration);
    if(a.kind==='partyShield')for(const ally of allies)this._abilityShield(ally,a.shieldFraction,a.duration);
    if(a.kind==='taunt') {
      this._abilityShield(this,a.shieldFraction,a.duration);
      if(a.chargeRange){this.move(p,Math.cos(p.face)*a.chargeRange,Math.sin(p.face)*a.chargeRange);this.effect('ring',p.x,p.y,{radius:a.radius,color:a.color,life:.5});}
      for(const enemy of this.world.enemies.filter(e=>e.alive&&dist(p,e)<a.radius)){enemy.targetId=actorId;enemy.tauntUntil=this.time+a.duration;enemy.aggro=true;}
    }
    if(a.kind==='mend') {
      const ally=allies.sort((x,y)=>x.player.hp/x.stats().maxHp-y.player.hp/y.stats().maxHp)[0];
      if(ally)this._healAbilityAlly(ally,(s.spellDamage*a.healMultiplier+ally.stats().maxHp*a.healFraction)*healFactor);
    }
    if(a.kind==='cone') {
      this.effect('slash',p.x,p.y,{radius:a.range,angle:p.face,color:a.color,life:.25});
      for(const enemy of targets)if(Math.abs(angleDiff(Math.atan2(enemy.y-p.y,enemy.x-p.x),p.face))<=a.arc/2){this.hitEnemy(enemy,damage,a.knockback||0);applySlow(enemy);}
    }
    if(a.kind==='execute') {
      const amount=(s[a.stat]||0)*(target.hp/target.maxHp<a.threshold?a.executeMultiplier:a.damageMultiplier)*powerFactor;
      const applied=this.hitEnemy(target,amount,6);if(applied)this._healAbilityAlly(this,applied*a.drain*healFactor);
      this.effect('slash',target.x,target.y,{radius:45,angle:p.face,color:a.color,life:.25});
    }
    if(a.kind==='escape') {
      this.move(p,-Math.cos(p.face)*a.range,-Math.sin(p.face)*a.range);p.invulnerable=Math.max(p.invulnerable||0,a.duration);
      this.effect('burst',p.x,p.y,{color:a.color,radius:40,life:.45});
    }
    if(a.kind==='fan'||a.kind==='projectile') {
      const count=a.count||1;
      for(let i=0;i<count;i++) {
        const angle=p.face+(count===1?0:(i/(count-1)-.5)*a.spread);
        this.projectiles.push({x:p.x+Math.cos(angle)*22,y:p.y+Math.sin(angle)*22,angle,type:'bolt',owner:'player',actorId,speed:a.speed||430,
          damage,life:a.range/(a.speed||430),radius:7,color:a.color,piercing:a.piercing||0,hitIds:[],slow:a.slow||0,slowDuration:a.duration||3,
          burnDamage:a.burnMultiplier?s.spellDamage*a.burnMultiplier*classPowerMultiplier(p.classId,'spell'):0,burnDuration:a.duration||0});
      }
    }
    if(a.kind==='trap')this.hazards.push({id:`ability-trap-${++this.lootSerial}`,kind:'trap',...this._abilityPoint(a.range),radius:a.radius,damage,slow:a.slow,slowDuration:a.slowDuration,life:a.duration,actorId,color:a.color});
    if(a.kind==='meteor')this.hazards.push({id:`ability-meteor-${++this.lootSerial}`,kind:'meteor',...this._abilityPoint(a.range),radius:a.radius,damage,knockback:a.knockback,
      life:a.windup+.1,timer:a.windup,windup:true,actorId,color:a.color});
    if(['regeneration','sanctum','storm'].includes(a.kind))this.hazards.push({id:`ability-zone-${++this.lootSerial}`,kind:a.kind,x:a.kind==='storm'?this._abilityPoint(a.range).x:p.x,y:a.kind==='storm'?this._abilityPoint(a.range).y:p.y,
      radius:a.radius,damage,heal:s.spellDamage*(a.healMultiplier||0)*healFactor,healFraction:(a.healFraction||0)*healFactor,slow:a.slow||0,life:a.duration,actorId,color:a.color,tick:1});
    if(a.kind==='curse')this.hazards.push({id:`ability-curse-${++this.lootSerial}`,kind:'curse',targetId:target.id,x:target.x,y:target.y,radius:24,damage,drain:a.drain*healFactor,life:a.duration,actorId,color:a.color,tick:1});
    if(a.kind==='summon') {
      const present=this.summons.filter(summon=>summon.actorId===actorId&&!summon.companion).length,count=Math.min(a.count,Math.max(0,8-present));
      for(let i=0;i<count;i++)this.summons.push({id:`ability-summon-${++this.lootSerial}`,x:p.x+(i-(count-1)/2)*28,y:p.y+30,life:a.duration,attackTimer:0,damage,actorId,color:a.color,
        range:a.range,attackCooldown:a.attackCooldown,ranged:!!a.ranged,splashRadius:a.splashRadius||0,visualType:a.id});
    }
    if(a.kind==='revive') {
      target.dead=false;target.paused=false;target.player.hp=target.stats().maxHp*a.reviveFraction;target.player.invulnerable=a.duration;target.keys.clear();target.onRevived?.();
      target.notice(`${p.name} hat dich mit Neuer Frühling erweckt.`,'quest');target.change();target.save(false);
      this.event('revive',target.player.id||target.player.name);
      this.effect('ring',target.player.x,target.player.y,{radius:65,color:a.color,life:.7});
    }
    if(a.kind==='bargain') {
      const sacrificed=p.hp*a.healthCost;p.hp=Math.max(1,p.hp-sacrificed);p.mana=Math.min(s.mana,p.mana+s.mana*a.manaFraction);
      this._abilityShield(this,a.shieldFraction,a.duration);this.text(p.x,p.y-24,`−${Math.round(sacrificed)} Leben`,'#cfa0ad');
    }
    this.onSound(a.kind==='mend'||a.kind==='revive'?'heal':'spell');this.change();return true;
  }
  action(name) {
    if(!this.started || this.paused || this.dead) return false;
    if(name==='interact') { this.interact(); return true; }
    if((this.cooldowns[name]||0)>0) return false;
    const p=this.player,s=this.stats(),cls=getClass(p.classId);
    if(name==='attack') {
      this.combo=this.time-this.comboTime<1.1?(this.combo+1)%3:0; this.comboTime=this.time;
      const profile=cls.abilities.attack,heavy=this.combo===2,arc=heavy?Math.PI:profile.arc,range=profile.range+(heavy?18:0);
      const damage=(s[profile.stat||'damage']||s.damage)*profile.damageMultiplier*(heavy?1.55:1)*classPowerMultiplier(p.classId,'attack');
      this.cooldowns.attack=profile.cooldown; p.attackUntil=this.time+.22;
      if(profile.kind==='projectile') {
        this.projectiles.push({x:p.x+Math.cos(p.face)*24,y:p.y+Math.sin(p.face)*24,angle:p.face,type:'bolt',speed:profile.projectileSpeed||430,damage,life:range/(profile.projectileSpeed||430),owner:'player',actorId:p.id||'local',radius:6,color:cls.color,slow:profile.slow||0,slowDuration:profile.duration||3});
        this.onSound('attack');this.change();return true;
      }
      this.effect('slash',p.x,p.y,{angle:p.face,radius:range,color:heavy?'#ffda82':profile.color||cls.color,life:.23});
      for(const e of this.world.enemies) {
        if(!e.alive || dist(p,e)>range || Math.abs(angleDiff(Math.atan2(e.y-p.y,e.x-p.x),p.face))>arc/2) continue;
        this.hitEnemy(e,damage,heavy?28:18);
      }
      this.onSound('attack');
    } else if(name==='dash') {
      this.cooldowns.dash=Math.max(.4,1.35*(1-s.dodgeCooldown)); p.dashUntil=this.time+.18; p.invulnerable=.3;
      const dx=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
      const dy=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
      p.dashAngle=dx||dy?Math.atan2(dy,dx):p.face;
      this.effect('burst',p.x,p.y,{color:'#c6dfd5',radius:22,life:.3}); this.onSound('dash');
    } else if(name==='bolt'||name==='nova') {
      const skill=cls.abilities[name];if(p.mana<skill.cost) {this.notice('Nicht genug Mana.');return false;}
      p.mana-=skill.cost;this.cooldowns[name]=skill.cooldown*(1-s.cooldown);p.castUntil=this.time+.3;
      const radius=skill.radius||100,damage=(s[skill.stat||'spellDamage']||s.spellDamage)*skill.damageMultiplier*classPowerMultiplier(p.classId,skill.kind==='summon'?'summon':'spell');
      const allies=(this.partyGames||[this]).filter(g=>!g.dead&&(skill.allies?dist(p,g.player)<radius:g===this));
      this.effect('ring',p.x,p.y,{color:skill.color,radius,life:.6});
      if(skill.healMultiplier&&skill.kind!=='drain') for(const ally of allies) {this._healAbilityAlly(ally,s.spellDamage*skill.healMultiplier*classPowerMultiplier(p.classId,'heal'));}
      if(skill.kind==='projectile'||skill.kind==='drain') this.projectiles.push({x:p.x+Math.cos(p.face)*22,y:p.y+Math.sin(p.face)*22,angle:p.face,type:'bolt',speed:skill.projectileSpeed||430,damage,life:(skill.range||540)/(skill.projectileSpeed||430),owner:'player',actorId:p.id||'local',radius:8,color:skill.color,slow:skill.slow||0,slowDuration:skill.duration||3,drain:skill.kind==='drain'?(skill.healMultiplier||.4)*classPowerMultiplier(p.classId,'heal'):0,splash:skill.splashRadius||0,piercing:skill.piercing||0,hitIds:[]});
      if(skill.kind==='aoe'||skill.kind==='shield') {
        if(skill.shieldMultiplier)for(const ally of allies) {this._abilityShield(ally,skill.shieldMultiplier,skill.duration||5);}
        for(const e of this.world.enemies) if(e.alive&&dist(p,e)<(skill.tauntRadius||radius)) {
          if(skill.tauntRadius) {e.targetId=p.id||'local';e.tauntUntil=this.time+5;e.aggro=true;}
          if(dist(p,e)<radius&&damage>0)this.hitEnemy(e,damage,12);
          if(skill.slow){e.slowUntil=this.time+(skill.duration||3);e.slowFactor=1-skill.slow;}
        }
      }
      if(skill.kind==='trap') this.hazards.push({id:`trap-${++this.lootSerial}`,kind:'trap',x:p.x+Math.cos(p.face)*80,y:p.y+Math.sin(p.face)*80,radius,damage,slow:skill.slow||3,life:skill.duration||8,actorId:p.id||'local',color:skill.color});
      if(skill.regenerationMultiplier)this.hazards.push({id:`regen-${++this.lootSerial}`,kind:'regeneration',x:p.x,y:p.y,radius,heal:s.spellDamage*skill.regenerationMultiplier*classPowerMultiplier(p.classId,'heal'),life:skill.duration||6,actorId:p.id||'local',color:skill.color,tick:1});
      if(skill.burnDamageMultiplier)this.hazards.push({id:`burn-${++this.lootSerial}`,kind:'burn',x:p.x,y:p.y,radius,damage:s.spellDamage*skill.burnDamageMultiplier*classPowerMultiplier(p.classId,'spell'),life:skill.duration||4,actorId:p.id||'local',color:skill.color,tick:1});
      if(skill.kind==='summon')for(let i=0;i<(skill.summonCount||2);i++)this.summons.push({id:`summon-${++this.lootSerial}`,x:p.x+(i-.5)*32,y:p.y+32,life:skill.duration||12,attackTimer:0,damage,actorId:p.id||'local',color:skill.color,range:skill.summonRange||350,attackCooldown:skill.summonAttackCooldown||1});
      if(skill.kind==='dashstrike') {
        const hit=new Set(),range=skill.range||160,steps=Math.ceil(range/12);
        for(let i=0;i<steps;i++) {
          this.move(p,Math.cos(p.face)*range/steps,Math.sin(p.face)*range/steps);
          if(i%3===0)this.effect('burst',p.x,p.y,{color:skill.color,radius:14,life:.2});
          for(const e of this.world.enemies)if(e.alive&&!hit.has(e.id)&&dist(p,e)<radius){hit.add(e.id);this.hitEnemy(e,damage,18);}
        }
        p.invulnerable=.4;p.attackUntil=this.time+.22;
      }
      this.onSound(name==='nova'?'nova':'spell');
    } else if(name==='potion') {
      const id=Object.keys(this.inventory).filter(id=>{const item=this.item(id),profile=getConsumableProfile(item);return profile&&profile.hpRestore>0&&!profile.outOfCombat&&this.inventory[id]>0&&profile.minLevel<=p.level;})
        .sort((a,b)=>this.item(b).stats.hpRestore-this.item(a).stats.hpRestore)[0];
      if(!id) { this.notice('Keine Heiltränke mehr. Braue neue im Handwerk.'); return false; }
      if(!this.consume(id))return false;
      this.effect('ring',p.x,p.y,{color:'#a1e29f',radius:55,life:.6});
    } else return false;
    this.change(); return true;
  }
  hitEnemy(e,damage,knockback=20) {
    if(!e.alive)return 0;
    const required=ENEMY_TYPES[e.type]?.minPlayers||1;
    const living=new Set((this.partyGames||[this]).filter(g=>!g.dead&&g.player.hp>0).map(g=>g.player.id||g));
    if(required>1&&living.size<required) {this.text(e.x,e.y-24,'Gruppe unvollständig','#b9acda');return 0;}
    if(e.shielded||e.shieldDamageMultiplier===0) {this.text(e.x,e.y-24,'Geschützt','#b9acda');return 0;}
    const crit=this.random()<this.stats().crit;
    const ward=e.wardUntil>this.time?clamp(e.wardReduction||0,0,.3):0;
    const armor=ENEMY_TYPES[e.type]?.traits?.includes('armored')?.1:0;
    const result=Math.max(1,Math.round(damage*(crit?1.7:1)*(.9+this.random()*.2)*(1-ward)*(1-armor)));
    const applied=Math.min(e.hp,result);e.hp-=result; e.hitUntil=this.time+.12; e.aggro=true;
    if(applied>0&&e.eventId)recordWorldEventContribution(this.world,e.eventId,this.player);
    const a=Math.atan2(e.y-this.player.y,e.x-this.player.x);
    // Authored bosses keep their frozen attack origin and cannot be pushed
    // into a protected village by repeated basic attacks.
    const displacement=ENEMY_TYPES[e.type]?.encounterProfile?knockback*(e.phase==='windup'?0:.08):knockback;
    this.move(e,Math.cos(a)*displacement,Math.sin(a)*displacement,ENEMY_TYPES[e.type]?.boss?22:10);
    this.text(e.x,e.y-24,crit?`${result}!`:result,crit?'#ffd37b':'#f4edd7');
    this.effect('burst',e.x,e.y,{color:crit?'#f7c460':'#c7d39b',radius:24,life:.3});
    if(this.settings.shake) this.shake=Math.min(1,this.shake+(crit?.25:.12));
    if(this.stats().lifeSteal) this._healAbilityAlly(this,applied*this.stats().lifeSteal);
    if(applied>0){
      const proc=resolveRelicProc(this.item(this.equipment.weapon),{time:this.time,readyAt:this.time+(this.cooldowns.relic||0),maxHp:this.stats().maxHp,targetIsBoss:!!ENEMY_TYPES[e.type]?.boss,damageDealt:applied,mode:this.worldMode==='pvp'?'pvp':'pve'});
      if(proc){
        this.cooldowns.relic=proc.cooldown;
        if(proc.kind==='slow'&&!(e.slowUntil>this.time)){e.slowUntil=this.time+proc.duration;e.slowFactor=proc.factor;}
        if(proc.kind==='shield'&&!(this.player.shield>0&&this.player.shieldUntil>this.time)){this.player.shield=proc.amount;this.player.shieldUntil=this.time+proc.duration;}
        this.effect('ring',this.player.x,this.player.y,{radius:38,color:proc.color,life:.5});
      }
    }
    this.onSound('hit'); if(e.hp<=0) this.killEnemy(e);
    return applied;
  }
  killEnemy(e) {
    if(!e.alive) return;
    const def=ENEMY_TYPES[e.type]; e.alive=false; e.hp=0; e.respawnAt=e.directorId?Infinity:def.boss&&def.baseType&&!e.challengeId&&!e.eventId?this.time+360:def.boss||e.challengeId?Infinity:this.time+ordinaryRespawnDelay(e,def); e.aggro=false;
    if(e.rewardless){e.respawnAt=Infinity;this.effect('burst',e.x,e.y,{color:def.color,radius:25,life:.4});return;}
    const party=(this.partyGames||[this]).filter(g=>!g.dead&&dist(g.player,e)<1200);
    for(const ally of party) {ally.kills++;ally.event('kill',e.type);if(def.questTarget&&def.questTarget!==e.type)ally.event('kill',def.questTarget);ally.gainXp(enemyXpReward(e.xp||def.xp,{enemyLevel:e.level||def.level,playerLevel:ally.player.level,boss:def.boss}));ally.player.gold+=e.gold||def.gold;ally.change();}
    this.text(e.x,e.y,`+${enemyXpReward(e.xp||def.xp,{enemyLevel:e.level||def.level,playerLevel:this.player.level,boss:def.boss})} EP`,'#b5ce83');
    this.effect('burst',e.x,e.y,{color:def.color,radius:def.boss?80:35,life:.65});
    if(this.random()<(def.boss?1:e.directorId ? .15 : .3)) {
      for(const ally of party) {
        const item=generateLoot({level:e.lootLevel||e.level||def.level,tier:e.lootTier||1,boss:def.boss,classId:ally.player.classId,traits:def.traits,rng:ally.random,source:e.type,pity:ally.lootPity,relicOrigin:{kind:this.dungeonInstance&&def.boss?'dungeon_boss':def.boss?'boss':'enemy',enemyId:e.type,dungeonId:this.dungeonInstance?.id||null},uid:`loot-${++ally.lootSerial}-${Math.floor(ally.random()*1e9)}-${ally.player.id||'local'}`});
        this.drops.push({x:e.x+(party.indexOf(ally)-.5)*16,y:e.y,item:item.id,loot:item,ownerId:ally.player.id||'local',life:120,color:item.rarity});
        if(ally.random()<.06)ally.resources[['ruby','sapphire','emerald'][Math.floor(ally.random()*3)]]++;
      }
    }
    if(def.boss)for(const ally of party) { ally.flags[e.type]=true;ally.event('boss',def.baseType||def.speciesId||e.type);ally.notice(`${def.name} besiegt!`,'level');ally.onSound('boss_defeat');ally.save(false); }
    for(const ally of party){const supply=getSupplyDrop({level:e.level||def.level,boss:!!def.boss,traits:def.traits,rng:ally.random});if(supply)ally.addItem(supply);}
    const bossTypes=['thorn_guardian','frost_sentinel','emberlord'];
    if(bossTypes.length && bossTypes.every(id=>this.flags[id]) && !this.flags.victory) { this.flags.victory=true; this.save(false); this.onVictory(); }
  }
  damagePlayer(damage,{trueDamage=false,ignoreInvulnerability=false,attackerLevel=this.player.level}={}) {
    const p=this.player; if((p.invulnerable>0&&!ignoreInvulnerability)||this.dead) return;
    const hit=incomingDamage(damage,{armor:this.stats().armor,attackerLevel,trueDamage});if(!hit)return;
    const absorbed=Math.min(p.shield||0,hit);p.shield=Math.max(0,(p.shield||0)-absorbed);
    const before=p.hp;p.hp=Math.max(0,p.hp-hit+absorbed); p.invulnerable=p.level>=12 ? .32 : .6; p.hitUntil=this.time+.18;
    p.lastDamageAt=this.time;
    this.text(p.x,p.y-30,`−${hit}`,'#f39786'); this.onSound('hurt');
    if(this.settings.shake) this.shake=Math.min(1,this.shake+.35);
    this.change(); if(p.hp<=0) { this.dead=true; this.paused=true; this.keys.clear(); this.onDeath(); }
    return before-p.hp;
  }
  respawn() {
    this.player.x=this.dungeonInstance?.spawn.x||520; this.player.y=this.dungeonInstance?.spawn.y||1250; this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
    this.player.gold=Math.max(0,Math.floor(this.player.gold*.9)); this.player.invulnerable=3;
    this.player.afflictions=[];this.player.slowUntil=0;
    this.dead=false; this.paused=false; this.projectiles=[]; this.notice('Am Glutherd erwacht · 10 % Gold für deine Rettung'); this.save(false); this.change();
  }
  update(dt,{simulateWorld=true}={}) {
    dt=Math.min(.04,Math.max(0,dt));
    if(!this.started || this.paused || this.dead) return;
    this.time+=dt; this.playTime+=dt; this.shake=Math.max(0,this.shake-dt*2);
    const boonCount=this.buffs.length;this.buffs=this.buffs.filter(b=>b.expiresAt>this.time);if(boonCount!==this.buffs.length)this.change();
    const p=this.player,s=this.stats(),previousPosition={x:this.player.x,y:this.player.y};
    Object.keys(this.cooldowns).forEach(k=>this.cooldowns[k]=Math.max(0,this.cooldowns[k]-dt));
    p.invulnerable=Math.max(0,p.invulnerable-dt);
    if(p.shieldUntil<this.time)p.shield=0;
    p.mana=Math.min(s.mana,p.mana+s.manaRegen*dt);
    if(this.inSettlement()) p.hp=Math.min(s.maxHp,p.hp+3*dt);
    let mx=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
    let my=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
    const length=Math.hypot(mx,my); p.walking=length>0;
    if(length>0) { mx/=length; my/=length; if(!this.aim) p.face=Math.atan2(my,mx); }
    if(this.aim) p.face=Math.atan2(this.aim.y-p.y,this.aim.x-p.x);
    if(p.dashUntil>this.time) this.move(p,Math.cos(p.dashAngle??p.face)*s.speed*3.9*dt,Math.sin(p.dashAngle??p.face)*s.speed*3.9*dt);
    else {const slow=p.slowUntil>this.time?p.slowFactor||.85:1;this.move(p,mx*s.speed*slow*dt,my*s.speed*slow*dt);}
    p.velocityX=dt>0?(p.x-previousPosition.x)/dt:0;p.velocityY=dt>0?(p.y-previousPosition.y)/dt:0;
    for(const affliction of p.afflictions||[])if(affliction.expiresAt>this.time&&affliction.nextTick<=this.time){affliction.nextTick+=1;this.damagePlayer(affliction.damage,{attackerLevel:affliction.attackerLevel});}
    p.afflictions=(p.afflictions||[]).filter(a=>a.expiresAt>this.time);
    const region=this.regionAt();
    if(!this.dungeonInstance&&!this.discovered.includes(region.id)) { this.discovered.push(region.id); this.event('explore',region.id); this.notice(`${region.name} entdeckt`,'quest'); this.save(false); }
    if(region.id!==this.lastRegion) { this.lastRegion=region.id; this.change(); }
    if(simulateWorld)this.updateWorld(dt,[this]);
    this.autoSaveTimer+=dt;
    if(this.autoSaveTimer>20) { this.autoSaveTimer=0; this.save(false); }
  }
  updateWorld(dt,partyGames=[this]) {
    this.partyGames=partyGames;for(const ally of partyGames)ally.partyGames=partyGames;
    const living=partyGames.filter(g=>!g.dead);
    for(const ally of living) {
      const profile=getCompanionCombatProfile(ally),actorId=ally.player.id||'local';
      let companion=this.summons.find(s=>s.companion&&s.actorId===actorId);
      if(profile) {
        if(!companion){companion={...profile,id:`companion-${actorId}`,actorId,x:ally.player.x-28,y:ally.player.y+22,attackTimer:1};this.summons.push(companion);}
        Object.assign(companion,profile,{id:`companion-${actorId}`,actorId,life:3600,damage:Math.min(profile.maximumDamage||0,ally.stats()[profile.stat]*profile.damageMultiplier)});
      } else if(companion)companion.life=0;
    }
    for(const companion of this.summons.filter(s=>s.companion))if(!living.some(g=>(g.player.id||'local')===companion.actorId))companion.life=0;
    if(this.dungeonInstance) {
      const events=updateDungeon(this.dungeonInstance,dt,living.map(g=>({...g.player,human:true,alive:true})));
      for(const event of events) {
        if(event.hazards)this.hazards.push(...event.hazards);
        if(event.zones)for(const zone of event.zones)for(const ally of living)if(dist(ally.player,zone)<zone.radius)ally.damagePlayer(zone.damage,{attackerLevel:this.dungeonInstance.definition.minLevel});
        for(const ally of partyGames) {
        if(event.event!=='mechanic')ally.event(event.event,event.target);
        if(event.message)ally.notice(event.message,'quest');
        if(event.event==='dungeon') {
          const old=ally.dungeonRecords[event.target]||{runs:0,bestTier:0,bestTime:Infinity};
          ally.dungeonRecords[event.target]={runs:old.runs+1,bestTier:Math.max(old.bestTier,this.dungeonInstance.tier),bestTime:Math.min(old.bestTime,this.dungeonInstance.elapsed)};
          const rewards=this.dungeonInstance.rewards||{completionXp:ENEMY_TYPES[this.dungeonInstance.definition.boss].xp,raidSigils:this.dungeonInstance.definition.raid?1:0};
          ally.gainXp(rewards.completionXp);ally.player.gold+=rewards.completionGold||0;ally.resources.dust+=rewards.dust||0;ally.resources.raidSigil+=rewards.raidSigils||0;
          ally.save(false);
        }
      }
      }
    }
    for(const plot of this.world.plots) if(plot.state==='growing'&&plot.readyAt<=this.time) { plot.state='ripe'; this.change(); }
    updateEncounterDirector(this,dt,partyGames);
    this.updateEnemies(dt,partyGames);
    if(this.world.worldEvents)this.handleWorldEventEffects(updateWorldEvents(this.world,dt,partyGames,this.time));
    this.updateWorldInteractions();
    for(const projectile of this.projectiles) {
      const boundedFlight=Number.isFinite(projectile.maxDistance)&&projectile.maxDistance>=0;
      const movement=boundedFlight?Math.min(projectile.speed*dt,Math.max(0,projectile.maxDistance-(projectile.travelled||0))):projectile.speed*dt;
      projectile.x+=Math.cos(projectile.angle)*movement; projectile.y+=Math.sin(projectile.angle)*movement; projectile.life-=dt;
      if(boundedFlight){projectile.travelled=(projectile.travelled||0)+movement;if(projectile.travelled>=projectile.maxDistance)projectile.life=0;}
      if(this.collides(projectile.x,projectile.y,3)) { projectile.life=0; continue; }
      if(projectile.owner==='player') {
        const caster=partyGames.find(g=>(g.player.id||'local')===(projectile.actorId||'local'))||this;
        const target=this.world.enemies.find(e=>e.alive&&!(projectile.hitIds||[]).includes(e.id)&&dist(e,projectile)<(ENEMY_TYPES[e.type]?.boss?36:20));
        if(target) {
          const applied=caster.hitEnemy(target,projectile.damage,10);(projectile.hitIds??=[]).push(target.id);
          if(projectile.piercing>1)projectile.piercing--;else projectile.life=0;
          if(projectile.slow){target.slowUntil=this.time+(projectile.slowDuration||3);target.slowFactor=1-projectile.slow;}
          if(projectile.drain&&applied)caster._healAbilityAlly(caster,applied*projectile.drain);
          if(projectile.splash)for(const e of this.world.enemies)if(e!==target&&e.alive&&dist(e,target)<projectile.splash)caster.hitEnemy(e,projectile.damage*.6,0);
          if(projectile.burnDamage&&applied)this.hazards.push({id:`ability-burn-${++caster.lootSerial}`,kind:'burn',x:target.x,y:target.y,radius:38,damage:projectile.burnDamage,life:projectile.burnDuration,actorId:projectile.actorId,color:projectile.color,tick:1});
        }
      } else {const attacker=this.world.enemies.find(e=>e.id===projectile.attackerId),curated=ENEMY_TYPES[attacker?.type]?.encounterProfile;
        const target=living.find(g=>(!curated||!g.inSettlement())&&dist(projectile,g.player)<23);if(target){const applied=target.damagePlayer(projectile.damage,{attackerLevel:projectile.attackerLevel||target.player.level});
        if(attacker)applyEnemyTraits(this,attacker,ENEMY_TYPES[attacker.type],target,applied);projectile.life=0;}}
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0);
    for(const fx of this.effects) { fx.life-=dt; if(fx.kind==='text') fx.y-=18*dt; }
    this.effects=this.effects.filter(f=>f.life>0);
    for(const drop of this.drops) {
      drop.life-=dt;
      const owner=living.find(g=>(!drop.ownerId||(g.player.id||'local')===drop.ownerId)&&dist(drop,g.player)<40);
      if(owner) {if(owner.addItem(drop.loot||drop.item)){owner.notice(`${owner.item(drop.item)?.name} gefunden`,'loot');owner.onSound(getRelic(owner.item(drop.item))||owner.item(drop.item)?.rarity==='legendary'?'rare_loot':'loot');drop.life=0;}else if(!drop.warned){owner.notice('Dein Gepäck ist voll. Die Beute liegt noch am Boden.');drop.warned=true;} }
    }
    this.drops=this.drops.filter(d=>d.life>0);
    for(const trap of this.hazards) {
      trap.life-=dt;
      const caster=partyGames.find(g=>(g.player.id||'local')===trap.actorId)||this;
      if(trap.kind==='meteor') {
        trap.timer-=dt;
        if(trap.timer<=1e-8){for(const enemy of this.world.enemies)if(enemy.alive&&dist(enemy,trap)<trap.radius)caster.hitEnemy(enemy,trap.damage,trap.knockback||0);
          this.effect('burst',trap.x,trap.y,{radius:trap.radius,color:trap.color,life:.65});trap.life=0;}
        continue;
      }
      if(['sanctum','storm','curse'].includes(trap.kind)) {
        const marked=trap.kind==='curse'?this.world.enemies.find(e=>e.id===trap.targetId&&e.alive):null;
        if(trap.kind==='curse'&&!marked){trap.life=0;continue;}
        if(marked){trap.x=marked.x;trap.y=marked.y;}
        trap.tick-=dt;
        if(trap.tick<=1e-8){trap.tick+=1;
          for(const enemy of this.world.enemies)if(enemy.alive&&(marked?enemy===marked:dist(enemy,trap)<trap.radius)) {
            const applied=caster.hitEnemy(enemy,trap.damage,0);
            if(trap.drain&&applied)caster._healAbilityAlly(caster,applied*trap.drain);
            if(trap.slow){const factor=enemy.slowUntil>this.time?enemy.slowFactor??1:1;enemy.slowUntil=this.time+1.6;enemy.slowFactor=Math.min(factor,1-trap.slow);}
          }
          if(trap.heal)for(const ally of living)if(dist(ally.player,trap)<trap.radius)caster._healAbilityAlly(ally,trap.heal);
        }continue;
      }
      if(trap.kind==='regeneration'||trap.kind==='burn') {
        trap.tick-=dt;if(trap.tick<=1e-8){trap.tick+=1;
          if(trap.kind==='regeneration')for(const ally of living)if(dist(ally.player,trap)<trap.radius)caster._healAbilityAlly(ally,trap.heal+ally.stats().maxHp*(trap.healFraction||0));
          if(trap.kind==='burn')for(const e of this.world.enemies)if(e.alive&&dist(e,trap)<trap.radius)caster.hitEnemy(e,trap.damage,0);
        }continue;
      }
      if(trap.kind!=='trap')continue;
      const enemy=this.world.enemies.find(e=>e.alive&&dist(e,trap)<trap.radius);if(!enemy)continue;
      for(const e of this.world.enemies)if(e.alive&&dist(e,trap)<trap.radius){caster.hitEnemy(e,trap.damage,0);e.slowUntil=this.time+(trap.slowDuration||3);e.slowFactor=1-(trap.slow||.5);}
      trap.life=0;this.effect('ring',trap.x,trap.y,{radius:trap.radius,color:trap.color,life:.5});
    }
    this.hazards=this.hazards.filter(h=>h.life>0);
    for(const summon of this.summons) {
      summon.life-=dt;summon.attackTimer-=dt;const caster=partyGames.find(g=>(g.player.id||'local')===summon.actorId)||this;
      const target=summon.companion&&summon.damage<=0?null:this.world.enemies.filter(e=>e.alive&&dist(e,summon)<(summon.range||350)).sort((a,b)=>dist(a,summon)-dist(b,summon))[0];
      const follow=summon.ranged?caster.player:target||caster.player,a=Math.atan2(follow.y-summon.y,follow.x-summon.x);
      if(dist(follow,summon)>45)this.move(summon,Math.cos(a)*120*dt,Math.sin(a)*120*dt,8);
      if(target&&dist(target,summon)<(summon.ranged?summon.range:70)&&summon.attackTimer<=0){summon.attackTimer=summon.attackCooldown||1;
        if(summon.ranged){const angle=Math.atan2(target.y-summon.y,target.x-summon.x);this.projectiles.push({x:summon.x,y:summon.y,angle,type:'bolt',owner:'player',actorId:summon.actorId,speed:470,damage:summon.damage,life:summon.range/470,radius:6,color:summon.color,splash:summon.splashRadius||0});}
        else caster.hitEnemy(target,summon.damage,0);
      }
    }
    this.summons=this.summons.filter(s=>s.life>0);
    for(const ally of partyGames) {ally.effects=this.effects;ally.projectiles=this.projectiles;ally.drops=this.drops;ally.hazards=this.hazards;ally.summons=this.summons;}
  }
  updateEnemies(dt,partyGames=[this]) {
    const living=partyGames.filter(g=>!g.dead);if(!living.length)return;
    for(const e of this.world.enemies) {
      const d=ENEMY_TYPES[e.type]; if(!d) continue;
      if(updateEncounterBoss(this,e,d,dt,living))continue;
      if(updateBestiaryEnemy(this,e,d,dt,living))continue;
      const taunted=e.tauntUntil>this.time?living.find(g=>(g.player.id||'local')===e.targetId):null;
      const targetGame=taunted||living.reduce((a,b)=>dist(a.player,e)<dist(b.player,e)?a:b),p=targetGame.player;
      if(!e.alive) { const home={x:e.homeX??e.x,y:e.homeY??e.y};if(!d.boss&&e.respawnAt<this.time&&!encounterSpawnBlocked(this,home,living)&&living.every(g=>dist(g.player,e)>500&&dist(g.player,home)>500)) { e.alive=true; e.hp=e.maxHp; e.x=e.homeX; e.y=e.homeY; e.phase='idle'; } continue; }
      const distance=dist(e,p); e.attackTimer=Math.max(0,(e.attackTimer||0)-dt);
      if(distance>600) { e.aggro=false; continue; }
      if(distance<260 || e.hp<e.maxHp) e.aggro=true;
      if((!d.boss&&dist(e,{x:e.homeX,y:e.homeY})>480) || targetGame.inSettlement()) e.aggro=false;
      if(!e.aggro) {
        const homeD=Math.hypot(e.x-e.homeX,e.y-e.homeY);
        if(homeD>6) this.move(e,(e.homeX-e.x)/homeD*d.speed*.7*dt,(e.homeY-e.y)/homeD*d.speed*.7*dt,10);
        e.phase='idle'; continue;
      }
      const a=Math.atan2(p.y-e.y,p.x-e.x); e.face=a;
      if(e.phase==='windup') {
        if(e.attackTimer<=0) {
          e.phase='recover'; e.attackTimer=d.boss?1.2:Math.max(.3,(e.attackPeriod||1.4)-.55);
          if(d.boss) {
            const radius=e.telegraphRadius||105;
            const center={x:e.telegraphX??e.x,y:e.telegraphY??e.y};
            this.effect('ring',center.x,center.y,{color:d.color,radius,life:.45});
            const baseDamage=(e.damage||d.damage)*(e.enraged?3:1)*1.3;
            if(e.telegraphMechanic==='stack') {
              const stack=living.filter(g=>dist(g.player,center)<radius);
              if(stack.length<(e.stackRequired||2))for(const ally of living)ally.damagePlayer(ally.stats().maxHp*2,{trueDamage:true,ignoreInvulnerability:true});
              else for(const ally of stack)ally.damagePlayer(baseDamage*(e.stackRequired||2)/stack.length,{attackerLevel:e.level||d.level});
            } else if(e.telegraphMechanic==='spread') {
              for(const ally of living) {const hits=(e.spreadTargets||[]).filter(t=>dist(t,ally.player)<75).length;if(hits)ally.damagePlayer(baseDamage*hits,{attackerLevel:e.level||d.level});}
            } else for(const ally of living)if(dist(ally.player,center)<radius)ally.damagePlayer(baseDamage,{attackerLevel:e.level||d.level});
            const phase2=e.hp<e.maxHp*.5; e.cycle=(e.cycle||0)+1;
            const emit=(angle,speed=160)=>this.projectiles.push({x:e.x,y:e.y,angle,type:'enemy',speed,damage:(e.damage||d.damage)*(e.enraged?3:1)*.7,life:2.5,owner:'enemy',attackerLevel:e.level||d.level,color:d.color});
            if(e.type==='thorn_guardian'&&phase2) for(let i=-1;i<=1;i++) emit(a+i*.28,145);
            if(e.type==='frost_sentinel') {
              const count=phase2?12:8;
              for(let i=0;i<count;i++) emit(i*Math.PI*2/count+e.cycle*.18,130);
              e.attackTimer=1.5;
            }
            if(e.type==='emberlord') {
              const count=phase2?5:3;
              for(let i=0;i<count;i++) emit(a+(i-(count-1)/2)*.22,190);
              if(phase2&&e.cycle%2===0) for(let i=0;i<12;i++) emit(i*Math.PI/6,120);
            }
            if(d.mechanics&&!e.telegraphMechanic)for(let i=0;i<(phase2?12:6);i++)emit(i*Math.PI*2/(phase2?12:6)+e.cycle*.13,145);
          } else if((d.range||45)>80) this.projectiles.push({x:e.x,y:e.y,angle:a,type:'enemy',speed:195,damage:e.damage||d.damage,life:2,owner:'enemy',attackerLevel:e.level||d.level});
          else if(distance<62)targetGame.damagePlayer(e.damage||d.damage,{attackerLevel:e.level||d.level});
        }
        continue;
      }
      if(e.phase==='recover'&&e.attackTimer>0) continue;
      const radii={thorn_guardian:105,frost_sentinel:150,emberlord:175};
      const bossRadius=radii[e.type]||d.mechanics?.telegraphRadius||145;
      const range=d.boss?bossRadius*.85:(d.range||45);
      if(distance<range && e.attackTimer<=0) {
        e.phase='windup';e.attackTimer=d.boss?d.mechanics?1.7:1.1:.55;e.telegraphDuration=e.attackTimer;e.telegraphRadius=d.boss?bossRadius:d.range>80?30:62;
        e.telegraphMechanic=d.mechanics&&e.mechanicCycle?e.mechanicCycle:null;e.telegraphX=e.telegraphMechanic?p.x:e.x;e.telegraphY=e.telegraphMechanic?p.y:e.y;
        if(e.telegraphMechanic==='stack')e.telegraphRadius=115;
        if(e.telegraphMechanic==='spread') {e.spreadTargets=living.map(g=>({x:g.player.x,y:g.player.y}));for(const pos of e.spreadTargets)this.hazards.push({...pos,kind:'warning',color:'#de887b',radius:75,life:1.7,windup:true});}
      }
      else {
        e.phase='chase';
        const speed=d.speed*(e.slowUntil>this.time?e.slowFactor||.45:1);
        if(distance>28) this.move(e,Math.cos(a)*speed*dt,Math.sin(a)*speed*dt,d.boss?22:10);
      }
    }
    this.world.enemies=this.world.enemies.filter(e=>!e.summonedBy||e.alive);
  }
  capture() {
    if(this.worldMode==='pvp'){
      if(!this._pvpTravelSave)throw new Error('Während des Duells ist noch keine Reise zum Exportieren verfügbar.');
      return JSON.parse(JSON.stringify(this._pvpTravelSave));
    }
    const w=this.overworld||this.world;
    const dungeon=this.dungeonInstance?{
      id:this.dungeonInstance.id,tier:this.dungeonInstance.tier,seed:this.dungeonInstance.seed,returnPoint:this.returnPoint,
      elapsed:this.dungeonInstance.elapsed,bossTime:this.dungeonInstance.bossTime,bossEngaged:this.dungeonInstance.bossEngaged,affixState:this.dungeonInstance.affixState,gateOpened:this.dungeonInstance.gateOpened,bossDefeated:this.dungeonInstance.bossDefeated,puzzles:this.dungeonInstance.puzzles,
      objects:this.world.puzzleObjects.map(o=>({id:o.id,x:o.x,y:o.y,rotation:o.rotation,active:o.active})),
      enemies:this.world.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,alive:e.alive,affixEcho:e.affixEcho,type:e.type,level:e.level})),openedChests:this.world.chests.filter(c=>c.opened).map(c=>c.id)
    }:null;
    const abilityCooldowns=Object.fromEntries(ABILITIES.filter(a=>this.learnedAbilities[a.id]===true).map(a=>[a.id,this.cooldowns[`ability:${a.id}`]||0]));
    return {version:2,savedAt:Date.now(),player:{...this.player,walking:false},inventory:this.inventory,resources:this.resources,equipment:this.equipment,generatedItems:this.generatedItems,lootPity:this.lootPity,lootSerial:this.lootSerial,dungeonRecords:this.dungeonRecords,dungeon,contracts:this.contracts,skills:this.skills,
      stash:{...this.stash},itemFlags:this.itemFlags,loadouts:this.loadouts,trackedQuestId:this.trackedQuestId,waypoint:this.waypoint?{kind:this.waypoint.kind,id:this.waypoint.id}:null,journey:this.journey,endgame:this.endgame,relicCooldown:this.cooldowns.relic||0,
      learnedAbilities:{...this.learnedAbilities},abilityLoadout:[...this.abilityLoadout],abilityCooldowns,
      consumableCooldowns:{potion:this.cooldowns.potion||0,food:this.cooldowns.food||0},
      buffs:this.buffs.filter(b=>b.expiresAt>this.time).map(({id,expiresAt})=>({id,expiresAt})),
      questState:this.questState,discovered:this.discovered,unlockedShrines:this.unlockedShrines,flags:this.flags,ledger:this.ledger,kills:this.kills,settings:this.settings,time:this.time,playTime:this.playTime,world:{nodes:w.nodes.map(n=>({id:n.id,readyAt:n.readyAt})),plots:w.plots,chests:w.chests.map(c=>({id:c.id,opened:c.opened})),enemies:w.enemies.filter(e=>ENEMY_TYPES[e.type]?.boss&&!e.alive&&!e.eventId).map(e=>e.id),interactions:captureInteractions(w),worldEvents:captureWorldEvents(w),
        encounterDirector:this.networkActive&&this.networkEncounterDirectorSave?JSON.parse(JSON.stringify(this.networkEncounterDirectorSave)):captureEncounterDirector(w),
        championRespawns:w.enemies.filter(e=>!e.alive&&ENEMY_TYPES[e.type]?.baseType&&!e.challengeId&&!e.eventId).map(e=>({id:e.id,remaining:clamp(e.respawnAt-this.time,0,360)})),
        challenges:w.enemies.filter(e=>e.challengeId&&!e.eventId).map(({id,type,challengeId,hp,alive,level,x,y})=>({id,type,challengeId,hp,alive,level,x,y}))}};
  }
  save(manual=true) {
    try {
      const data=JSON.stringify(this.capture()); const previous=this.storage?.getItem(SAVE_KEY);
      if(previous) this.storage?.setItem(SAVE_KEY+'.backup',previous);
      this.storage?.setItem(SAVE_KEY,data); this.hasSave=true;
      if(manual) this.notice('Deine Reise wurde gespeichert.','quest');
      return true;
    } catch { if(manual) this.notice('Speichern nicht möglich. Exportiere deine Reise unter Einstellungen.'); return false; }
  }
  applySave(data) {
    if(![1,2].includes(data?.version) || !data.player || !Number.isInteger(data.player.level) || data.player.level<1 || data.player.level>MAX_LEVEL || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.y) || !data.world) throw new Error('Ungültiger Spielstand.');
    // Validate the full shape before touching the current adventure. An import
    // must either succeed completely or leave the running save unchanged.
    const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    if(!record(data.world)||!record(data.player)) throw new Error('Ungültige Weltdaten.');
    if(data.journey!==undefined&&!validateJourneyState(data.journey,{level:data.player.level}))throw new Error('Ungültige Reisechronik.');
    if(!validateInventoryExtensions(data)||data.trackedQuestId!==undefined&&typeof data.trackedQuestId!=='string'||data.waypoint!==undefined&&data.waypoint!==null&&(!record(data.waypoint)||!['npc','shrine','quest','event','interaction','dungeon','region'].includes(data.waypoint.kind)||typeof data.waypoint.id!=='string'))throw new Error('Ungültige Inventar- oder Reisedaten.');
    if(data.player.afflictions!==undefined&&(!Array.isArray(data.player.afflictions)||data.player.afflictions.length>3||new Set(data.player.afflictions.map(a=>a?.kind)).size!==data.player.afflictions.length||data.player.afflictions.some(a=>!record(a)||!['venom','burn','bleed'].includes(a.kind)||!Number.isFinite(a.damage)||a.damage<0||a.damage>500||!Number.isFinite(a.expiresAt)||a.expiresAt<0||!Number.isFinite(a.nextTick)||a.nextTick<0||!Number.isInteger(a.attackerLevel)||a.attackerLevel<1||a.attackerLevel>MAX_LEVEL)))throw new Error('Ungültige Wunddaten.');
    const abilityState=validateAbilityState(data);
    for(const key of ['inventory','resources','equipment','skills','questState','flags','ledger','settings']) {
      if(data[key]!==undefined&&!record(data[key])) throw new Error(`Ungültiges Feld: ${key}`);
    }
    for(const key of ['discovered','unlockedShrines']) if(data[key]!==undefined&&(!Array.isArray(data[key])||data[key].some(id=>typeof id!=='string'))) throw new Error(`Ungültiges Feld: ${key}`);
    for(const key of ['nodes','plots','chests','enemies']) if(data.world[key]!==undefined&&!Array.isArray(data.world[key])) throw new Error(`Ungültige Weltliste: ${key}`);
    for(const key of ['nodes','plots','chests']) if(data.world[key]?.some(v=>!record(v)||typeof v.id!=='string')) throw new Error('Ungültiger Weltzustand.');
    if(data.world.enemies?.some(id=>typeof id!=='string')) throw new Error('Ungültige Gegnerdaten.');
    if(data.consumableCooldowns!==undefined&&(!record(data.consumableCooldowns)||Object.entries(data.consumableCooldowns).some(([key,value])=>!['potion','food'].includes(key)||!Number.isFinite(value)||value<0||value>30)))throw new Error('Ungültige Trankabklingzeit.');
    if(!validateInteractionSave(data.world.interactions))throw new Error('Ungültige Weltinteraktionen.');
    if(!validateWorldEventSave(data.world.worldEvents))throw new Error('Ungültige Weltabenteuer.');
    if(!validateEncounterDirectorSave(data.world.encounterDirector))throw new Error('Ungültige Aschenjagd.');
    if(!validateEndgameState(data.endgame))throw new Error('Ungültiges Jagdtagebuch.');
    if(data.relicCooldown!==undefined&&(!Number.isFinite(data.relicCooldown)||data.relicCooldown<0||data.relicCooldown>16))throw new Error('Ungültige Siegelerholung.');
    if(data.world.championRespawns!==undefined&&(!Array.isArray(data.world.championRespawns)||data.world.championRespawns.length>80||new Set(data.world.championRespawns.map(e=>e?.id)).size!==data.world.championRespawns.length||data.world.championRespawns.some(e=>!record(e)||typeof e.id!=='string'||!Number.isFinite(e.remaining)||e.remaining<0||e.remaining>360)))throw new Error('Ungültige Schreckensfürsten-Erholung.');
    for(const key of ['masterVolume','musicVolume','effectsVolume'])if(data.settings?.[key]!==undefined&&(!Number.isFinite(data.settings[key])||data.settings[key]<0||data.settings[key]>1))throw new Error('Ungültige Audiolautstärke.');
    if(data.buffs!==undefined&&(!Array.isArray(data.buffs)||data.buffs.length>2||new Set(data.buffs.map(b=>b?.id)).size!==data.buffs.length||data.buffs.some(b=>!record(b)||!Object.hasOwn(WORLD_BOONS,b.id)||!Number.isFinite(b.expiresAt)||b.expiresAt<0)))throw new Error('Ungültige Weltsegen.');
    if(data.world.challenges!==undefined&&(!Array.isArray(data.world.challenges)||data.world.challenges.length>100||data.world.challenges.some(e=>!record(e)||typeof e.id!=='string'||typeof e.challengeId!=='string'||!BESTIARY_ENEMIES[e.type]||!Number.isInteger(e.level)||e.level<1||e.level>100||!Number.isFinite(e.hp)||!Number.isFinite(e.x)||!Number.isFinite(e.y))))throw new Error('Ungültige Herausforderung.');
    for(const state of Object.values(data.questState||{})) if(!record(state)||!Array.isArray(state.counts)) throw new Error('Ungültige Questdaten.');
    if(data.generatedItems!==undefined&&(!record(data.generatedItems)||Object.keys(data.generatedItems).length>2000||Object.entries(data.generatedItems).some(([id,item])=>item?.id!==id||!validateLootItem(item))))throw new Error('Ungültige Ausrüstungsdaten.');
    if(data.dungeonRecords!==undefined&&!record(data.dungeonRecords))throw new Error('Ungültige Dungeonchronik.');
    if(data.contracts!==undefined&&!validateContractState(data.contracts,{level:data.player.level}))throw new Error('Ungültige Auftragsdaten.');
    if(data.dungeon) {
      const d=data.dungeon;
      if(!record(d)||!DUNGEONS.some(def=>def.id===d.id)||!Number.isInteger(d.tier)||d.tier<1||d.tier>30||!Array.isArray(d.puzzles)||!Array.isArray(d.enemies)||!Array.isArray(d.openedChests)||!Number.isFinite(d.seed))throw new Error('Ungültiger Dungeon-Spielstand.');
      if(d.puzzles.some(p=>!record(p)||typeof p.id!=='string'||!Array.isArray(p.objects)||!Array.isArray(p.history))||d.enemies.some(e=>!record(e)||typeof e.id!=='string'||!Number.isFinite(e.hp)))throw new Error('Ungültiger Dungeonzustand.');
      if(d.objects!==undefined&&(!Array.isArray(d.objects)||d.objects.some(o=>!record(o)||typeof o.id!=='string'||!Number.isFinite(o.x)||!Number.isFinite(o.y))))throw new Error('Ungültige Rätseldaten.');
      if(d.returnPoint!==undefined&&(!record(d.returnPoint)||!Number.isFinite(d.returnPoint.x)||!Number.isFinite(d.returnPoint.y)))throw new Error('Ungültiger Rückweg.');
      if(d.bossTime!==undefined&&(!Number.isFinite(d.bossTime)||d.bossTime<0))throw new Error('Ungültige Kampfzeit.');
      if(d.affixState!==undefined&&(!record(d.affixState)||!Array.isArray(d.affixState.rifts)||d.affixState.rifts.some(r=>!record(r)||!Number.isFinite(r.x)||!Number.isFinite(r.y)||!Number.isFinite(r.explodeAt)||!Number.isFinite(r.radius)||!Number.isFinite(r.damage))))throw new Error('Ungültige Dungeonaffixe.');
      validateDungeonEchoes(d.enemies,d.id,d.tier);
    }
    this.initialize();
    const p=data.player;
    for(const key of ['x','y','hp','mana','level','xp','gold','skillPoints']) this.player[key]=validNum(p[key],this.player[key]);
    this.player.name=typeof p.name==='string'?p.name.slice(0,24):'Aren';this.player.classId=getClass(p.classId).id;
    this.classId=this.player.classId;
    this.journey=restoreJourneyState(data.journey,{level:this.player.level,legacy:data});
    this.endgame=restoreEndgameState(data.endgame);this.cooldowns.relic=data.relicCooldown||0;
    this.learnedAbilities=abilityState.learned;this.abilityLoadout=abilityState.loadout;
    for(const [id,cooldown] of Object.entries(abilityState.cooldowns))this.cooldowns[`ability:${id}`]=cooldown;
    for(const [key,cooldown] of Object.entries(data.consumableCooldowns||{}))this.cooldowns[key]=cooldown;
    this.contracts=restoreContractState(data.contracts||{active:[],completed:{}},{level:this.player.level});
    this.generatedItems=data.generatedItems||{};this.lootSerial=Math.floor(validNum(data.lootSerial,0));
    this.lootPity={legendaryMisses:Math.floor(validNum(data.lootPity?.legendaryMisses,0,0,500)),bossMisses:Math.floor(validNum(data.lootPity?.bossMisses,0,0,34))};
    for(const [id,value] of Object.entries(data.dungeonRecords||{}))if(DUNGEONS.some(d=>d.id===id)&&record(value))this.dungeonRecords[id]={runs:Math.floor(validNum(value.runs,0)),bestTier:Math.floor(validNum(value.bestTier,0,0,30)),bestTime:validNum(value.bestTime,0)};
    this.player.x=clamp(this.player.x,30,this.world.width-30); this.player.y=clamp(this.player.y,30,this.world.height-30);
    for(const [id,count] of Object.entries(data.inventory||{})) if(this.item(id)) this.inventory[id]=Math.floor(validNum(count,0));
    for(const key of Object.keys(this.resources)) this.resources[key]=Math.floor(validNum(data.resources?.[key],0));
    for(const slot of Object.keys(this.equipment)) { const id=data.equipment?.[slot],legacySlot=['weapon','armor','charm'].includes(slot);
      this.equipment[slot]=equipmentSlot(this.item(id))===slot&&this.inventory[id]>0&&(legacySlot||this.canEquipItem(id))?id:null;
    }
    restoreInventoryExtensions(this,data);
    for(const s of SKILLS) this.skills[s.id]=Math.floor(validNum(data.skills?.[s.id],0,0,s.maxRank||3));
    for(const q of QUESTS) {
      const state=data.questState?.[q.id]; if(!state||!['active','ready','done'].includes(state.status)) continue;
      const counts=q.objectives.map((o,i)=>Math.floor(validNum(state.counts?.[i],0,0,o.count)));
      this.questState[q.id]={status:state.status==='ready'&&!q.objectives.every((o,i)=>counts[i]>=o.count)?'active':state.status,counts};
    }
    this.discovered=Array.isArray(data.discovered)?data.discovered.filter(id=>REGIONS.some(r=>r.id===id)):['daemmerhain'];
    this.unlockedShrines=Array.isArray(data.unlockedShrines)?data.unlockedShrines.filter(id=>this.world.shrines.some(s=>s.id===id)):[];
    this.flags=typeof data.flags==='object'&&data.flags?data.flags:{}; this.ledger={};
    for(const [key,value] of Object.entries(data.ledger||{})) this.ledger[key]=validNum(value,0);
    this.time=validNum(data.time,0); this.playTime=validNum(data.playTime,0); this.kills=validNum(data.kills,0);
    if(Number.isFinite(p.lastDamageAt)&&p.lastDamageAt>=0&&p.lastDamageAt<=this.time)this.player.lastDamageAt=p.lastDamageAt;
    this.player.afflictions=(p.afflictions||[]).filter(a=>a.expiresAt>this.time).map(a=>({...a,expiresAt:Math.min(a.expiresAt,this.time+3),nextTick:Math.min(a.nextTick,this.time+1)}));
    if(Number.isFinite(p.slowUntil)&&p.slowUntil>this.time){this.player.slowUntil=Math.min(p.slowUntil,this.time+1.4);this.player.slowFactor=.85;}
    for(const boon of data.buffs||[])if(boon.expiresAt>this.time)this.addWorldBoon(boon.id,boon.expiresAt);
    restoreInteractions(this.world,data.world.interactions,this.time);
    restoreWorldEvents(this.world,data.world.worldEvents,this.time);
    restoreEncounterDirector(this.world,data.world.encounterDirector);
    for(const saved of data.world.challenges||[]) {
      const object=this.world.interactions.find(o=>o.id===saved.challengeId);
      if(!object||object.used||!['sarcophagus','cursed_chest'].includes(object.kind)||!REGION_ENEMY_POOLS[object.region]?.includes(BESTIARY_ENEMIES[saved.type].baseType||saved.type))continue;
      const enemy=createBestiaryEnemy(saved.type,saved.id,clamp(saved.x,30,this.world.width-30),clamp(saved.y,30,this.world.height-30),{level:object.level,region:object.region});
      enemy.hp=clamp(saved.hp,0,enemy.maxHp);enemy.alive=saved.alive!==false&&enemy.hp>0;enemy.challengeId=object.id;enemy.respawnAt=Infinity;
      (object.challengeIds||=[]).push(enemy.id);this.world.enemies.push(enemy);
    }
    if(data.settings)for(const key of Object.keys(this.settings))if(typeof data.settings[key]===typeof this.settings[key])this.settings[key]=data.settings[key];
    for(const node of this.world.nodes) { const saved=data.world.nodes?.find(n=>n.id===node.id); if(saved) node.readyAt=validNum(saved.readyAt,0); }
    for(const plot of this.world.plots) { const saved=data.world.plots?.find(n=>n.id===plot.id); if(saved&&['empty','growing','ripe'].includes(saved.state)) { plot.state=saved.state; plot.readyAt=validNum(saved.readyAt,0); } }
    for(const chest of this.world.chests) chest.opened=!!data.world.chests?.find(c=>c.id===chest.id)?.opened;
    for(const enemy of this.world.enemies) if(ENEMY_TYPES[enemy.type]?.boss&&(data.world.enemies||[]).includes(enemy.id)) { enemy.alive=false; enemy.hp=0; enemy.respawnAt=Infinity; }
    for(const enemy of this.world.enemies)if(!enemy.alive&&ENEMY_TYPES[enemy.type]?.baseType&&!enemy.challengeId&&!enemy.eventId){
      const saved=data.world.championRespawns?.find(s=>s.id===enemy.id);enemy.respawnAt=this.time+(saved?.remaining??360);
    }
    if(data.dungeon) {
      const d=data.dungeon;const instance=createDungeon(d.id,{tier:d.tier,seed:d.seed,partySize:1});
      instance.elapsed=validNum(d.elapsed,0);instance.bossDefeated=!!d.bossDefeated;
      instance.bossTime=validNum(d.bossTime,0);instance.bossEngaged=!!d.bossEngaged;
      if(d.affixState&&instance.affixState) {
        for(const key of ['nextRiftAt','nextEchoAt','wave','riftSerial'])instance.affixState[key]=validNum(d.affixState[key],instance.affixState[key]);
        instance.affixState.rifts=d.affixState.rifts.map(r=>({...r,x:clamp(r.x,32,1768),y:clamp(r.y,32,1468),radius:clamp(r.radius,20,150),damage:clamp(r.damage,0,5000)}));
        for(const r of instance.affixState.rifts)if(r.explodeAt>instance.bossTime)this.hazards.push({id:r.id,kind:'warning',x:r.x,y:r.y,radius:r.radius,life:r.explodeAt-instance.bossTime,windup:true,color:'#d893ba'});
      }
      for(const puzzle of instance.puzzles) {
        const saved=d.puzzles.find(p=>p.id===puzzle.id);if(!saved)continue;
        puzzle.solved=!!saved.solved;puzzle.progress=Math.floor(validNum(saved.progress,0,0,20));
        if(Array.isArray(saved.pattern))puzzle.pattern=saved.pattern.map(v=>!!v);
        puzzle.history=Array.isArray(saved.history)?saved.history:[];
      }
      for(const object of instance.world.puzzleObjects){const saved=d.objects?.find(o=>o.id===object.id);if(saved){object.active=!!saved.active;if(object.kind==='lens')object.rotation=Math.floor(validNum(saved.rotation,0,0,3));if(object.kind==='crate'){object.x=validNum(saved.x,object.x,40,1040);object.y=validNum(saved.y,object.y,40,1420);const body=instance.world.structures.find(s=>s.id===object.id);body.x=object.x-20;body.y=object.y-20;body.collision.x=body.x;body.collision.y=body.y;}}}
      restoreDungeonEchoes(instance,d.enemies);
      for(const enemy of instance.world.enemies) {const saved=d.enemies.find(e=>e.id===enemy.id);if(saved){enemy.hp=clamp(saved.hp,0,enemy.maxHp);enemy.alive=saved.alive!==false&&enemy.hp>0;enemy.x=validNum(saved.x,enemy.x,30,1770);enemy.y=validNum(saved.y,enemy.y,30,1470);}}
      for(const chest of instance.world.chests){chest.opened=d.openedChests.includes(chest.id);if(instance.bossDefeated&&chest.requiresBoss)chest.locked=false;}
      if(instance.puzzles.every(p=>p.solved)){instance.gateOpened=true;const gate=instance.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;}
      this.world=instance.world;this.dungeonInstance=instance;this.npcs=[];this.returnPoint=d.returnPoint||{...instance.definition.entrance};
    }
    this.player.hp=clamp(this.player.hp,1,this.stats().maxHp); this.player.mana=clamp(this.player.mana,0,this.stats().mana);
    if(data.trackedQuestId&&['active','ready'].includes((this.questState[data.trackedQuestId]||this.contracts.active.find(c=>c.id===data.trackedQuestId))?.status))this.trackedQuestId=data.trackedQuestId;
    if(data.waypoint){const point=resolveWaypoint(this,data.waypoint.kind,data.waypoint.id);if(point)this.waypoint={...data.waypoint,...point};}
    if(p.hp<=0) {
      // Reloading a journey at the defeat screen follows the same rescue rule
      // as the button, instead of trapping the player at one HP among enemies.
      this.player.x=this.dungeonInstance?.spawn.x||520;this.player.y=this.dungeonInstance?.spawn.y||1250;this.player.hp=this.stats().maxHp;this.player.mana=this.stats().mana;
      this.player.gold=Math.floor(this.player.gold*.9);this.player.invulnerable=3;
      this.player.afflictions=[];this.player.slowUntil=0;
    }
    if(this.collides(this.player.x,this.player.y)) { this.player.x=this.dungeonInstance?.spawn.x||520;this.player.y=this.dungeonInstance?.spawn.y||1250; }
    this.camera={x:this.player.x,y:this.player.y}; this.lastRegion=this.regionAt().id; this.change();
  }
  load() {
    try { this.applySave(JSON.parse(this.storage.getItem(SAVE_KEY))); return true; }
    catch {
      try { this.applySave(JSON.parse(this.storage.getItem(SAVE_KEY+'.backup'))); return true; }
      catch { this.hasSave=false; this.initialize(); return false; }
    }
  }
  exportSave() {
    const blob=new Blob([JSON.stringify(this.capture(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='emberfall-spielstand.json'; a.click(); URL.revokeObjectURL(url);
  }
  async importSave(file) {
    try { const data=JSON.parse(await file.text()); this.applySave(data); this.save(false); this.notice('Reise erfolgreich importiert.'); return true; }
    catch { this.notice('Dieser Spielstand ist beschädigt oder nicht kompatibel.'); return false; }
  }
}
