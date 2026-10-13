import { ITEMS, SKILLS, QUESTS, RECIPES, ENEMY_TYPES, NPCS, REGIONS, RESOURCES } from './catalog.js';
import { makeWorld } from './world.js';
import { expandWorld } from './expansion.js';
import { CLASSES, getClass } from './classes.js';
import { MAX_LEVEL, xpToNext } from './progression.js';
import { generateLoot, computeItemStats, validateLootItem, salvageYield, computeSetBonuses, GEM_TYPES } from './loot.js';
import { DUNGEONS, createDungeon, interactPuzzle, updateDungeon, validateDungeonEchoes, restoreDungeonEchoes } from './dungeons.js';
import { MAX_ACTIVE_CONTRACTS, getContractOffers, createContract, advanceContract, resolveContractOffer, validateContractState, restoreContractState } from './contracts.js';

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
    this.settings = { sound:true, shake:true, reducedMotion:false };
    this.hasSave = false; this.started = false; this.paused = false;
    this.initialize();
    try { this.hasSave = !!storage?.getItem(SAVE_KEY); if(this.hasSave) this.load(); } catch { this.hasSave=false; }
  }
  initialize() {
    this.world = expandWorld(makeWorld()); this.overworld=this.world;this.dungeonInstance=null;this.dungeonRecords={};this.npcs = NPCS; this.time = 0;
    this.player = { name:'Aren', x:520, y:1250, face:Math.PI/2, walking:false, hp:112, mana:85, level:1, xp:0, gold:45, skillPoints:2, invulnerable:0, attackUntil:0, dashUntil:0, hitUntil:0 };
    this.inventory = {}; this.resources = {wood:0,ore:0,herb:0,crystal:0,seed:6,wheat:0};
    for(const id of Object.keys(RESOURCES)) this.resources[id]??=0;
    this.player.classId='guardian';this.player.shield=0;this.player.shieldUntil=0;
    this.classId='guardian';
    this.generatedItems={};this.lootPity={legendaryMisses:0,bossMisses:0};this.lootSerial=0;this.summons=[];this.hazards=[];this.partyGames=[this];this.otherPlayers=[];
    this.equipment = {weapon:null,armor:null,charm:null};
    this.skills = {}; this.questState = {}; this.discovered = ['daemmerhain']; this.unlockedShrines = [];
    this.contracts={active:[],completed:{}};
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
  stats() {
    const p=this.player;
    const s={maxHp:100+p.level*12,mana:80+p.level*5,damage:12+p.level*3,armor:2+p.level,crit:.06,speed:175,spellDamage:25+p.level*4,manaRegen:4,cooldown:0,dodgeCooldown:0,gatherYield:0,lifeSteal:0};
    for(const [key,value] of Object.entries(getClass(p.classId).statMods||{})) s[key]=(s[key]||0)+value;
    for(const id of Object.values(this.equipment)) {
      const item=this.item(id); const modifiers=this.generatedItems[id]?computeItemStats(item):item?.stats||{};
      for(const [key,value] of Object.entries(modifiers)) s[key]=(s[key]||0)+value;
    }
    for(const [key,value] of Object.entries(computeSetBonuses(Object.values(this.equipment).map(id=>this.item(id)).filter(Boolean)))) s[key]=(s[key]||0)+value;
    for(const skill of SKILLS) {
      const rank=this.skills[skill.id]||0;
      if(!rank) continue;
      const effects=Array.isArray(skill.effect)?skill.effect:[skill.effect];
      for(const effect of effects) if(effect?.stat) s[effect.stat]=(s[effect.stat]||0)+effect.value*rank;
    }
    s.crit=clamp(s.crit,0,.7); s.speed=clamp(s.speed,120,300);s.lifeSteal=clamp(s.lifeSteal,0,.25);
    s.cooldown=clamp(s.cooldown,-.6,.6); s.dodgeCooldown=clamp(s.dodgeCooldown,-.7,.7);
    return s;
  }
  item(id) { return this.generatedItems[id]||ITEMS[id]||null; }
  itemStats(id) { const item=this.item(id);return this.generatedItems[id]?computeItemStats(item):item?.stats||{}; }
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
      const s=this.stats(); this.player.hp=s.maxHp; this.player.mana=s.mana;
      this.notice(`Level ${this.player.level} erreicht · 2 Talentpunkte`,'level');
      this.effect('ring',this.player.x,this.player.y,{color:'#e7bf68',radius:100,life:1}); this.onSound('level');
    }
    if(this.player.level===MAX_LEVEL) this.player.xp=Math.min(this.player.xp,this.xpNeeded());
    this.change();
  }
  regionAt(x=this.player.x,y=this.player.y) {
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
      this.notice('Willkommen in Dämmerhain. Sprich mit der Hüterin am Dorfbrunnen.');
    }
    this.change();
  }
  reset(classId='guardian') { this.initialize();this.selectClass(classId);this.hasSave=false;this.start();this.save(false); }
  setSetting(key,value) {
    if(Object.hasOwn(this.settings,key)) this.settings[key]=!!value;
    this.change(); this.save(false);
  }
  effect(kind,x,y,options={}) {
    const life=options.life||.5;
    this.effects.push({kind,x,y,color:'#f1c475',radius:25,angle:0,life,maxLife:life,...options});
  }
  text(x,y,text,color='#f2d090') { this.effect('text',x,y,{text:String(text),color,life:1.1}); }
  event(kind,target,amount=1) {
    const key=`${kind}:${target}`; this.ledger[key]=(this.ledger[key]||0)+amount;
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
  contractOffers(regionId=this.regionAt().id) {
    return getContractOffers({regionId,level:this.player.level,completed:this.contracts.completed[regionId]||0});
  }
  contractGiver(regionId) {
    const quest=QUESTS.find(q=>q.region===regionId);
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
    this.contracts.completed[offer.region]=(this.contracts.completed[offer.region]||0)+1;
    this.player.gold+=offer.reward.gold;this.resources.dust+=offer.reward.dust;this.gainXp(offer.reward.xp);
    if(offer.reward.item)this.addItem(offer.reward.item);
    this.notice(`Auftrag abgeschlossen · +${offer.reward.xp} EP · +${offer.reward.dust} Glutstaub`,'quest');this.change();this.save(false);return true;
  }
  cancelContract(id) {
    if(!this.contracts.active.some(c=>c.id===id))return false;
    this.contracts.active=this.contracts.active.filter(c=>c.id!==id);this.notice('Auftrag aufgegeben.');this.change();this.save(false);return true;
  }
  questAccept(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || !this.canAccept(q)) return false;
    const counts=q.objectives.map(o=>['explore','puzzle','dungeon','raid'].includes(o.kind)||(o.kind==='kill'&&ENEMY_TYPES[o.target]?.boss)?Math.min(o.count,this.ledger[`${o.kind}:${o.target}`]||0):0);
    this.questState[id]={status:q.objectives.every((o,i)=>counts[i]>=o.count)?'ready':'active',counts};
    this.notice(`Quest angenommen: ${q.title}`,'quest'); this.onSound('quest'); this.save(false); this.change(); return true;
  }
  questTurnIn(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || this.questState[id]?.status!=='ready') return false;
    this.questState[id].status='done'; this.player.gold+=q.reward.gold||0; this.gainXp(q.reward.xp||0);
    if(q.reward.item) this.addItem(q.reward.item,1);
    if(q.reward.skillPoints) this.player.skillPoints+=q.reward.skillPoints;
    this.notice(`Abgeschlossen: ${q.title} · +${q.reward.xp||0} EP · +${q.reward.gold||0} Gold`,'quest');
    this.onSound('quest'); this.change(); this.save(false); return true;
  }
  learn(id) {
    const skill=SKILLS.find(s=>s.id===id); if(!skill) return false;
    if(!this.availableSkills().some(s=>s.id===id)||this.player.level<(skill.minLevel||1)) return false;
    const rank=this.skills[id]||0, cost=skill.cost||1;
    const requirement=skill.requires;
    const prereq = !requirement || (typeof requirement==='string' ? (this.skills[requirement]||0)>0 : Array.isArray(requirement) ? requirement.every(r=>(this.skills[typeof r==='string'?r:r.id]||0)>=(r.rank||1)) : (this.skills[requirement.id]||0)>=(requirement.rank||1));
    if(rank>=(skill.maxRank||3) || this.player.skillPoints<cost || !prereq) return false;
    this.skills[id]=rank+1; this.player.skillPoints-=cost;
    this.notice(`${skill.name} · Rang ${rank+1}`,'level'); this.onSound('level'); this.change(); this.save(false); return true;
  }
  addItem(id,amount=1) {
    if(typeof id==='object'&&validateLootItem(id)) {if(!this.generatedItems[id.id]&&this.bagUsed()>=240)return false;this.generatedItems[id.id]=id;id=id.id;}
    if(!this.item(id)) return false;
    this.inventory[id]=(this.inventory[id]||0)+amount; this.change(); return true;
  }
  bagUsed() {return Object.keys(this.generatedItems).filter(id=>this.inventory[id]>0).length;}
  equip(id) {
    const item=this.item(id); if(!item || !this.inventory[id] || !['weapon','armor','charm'].includes(item.type)||item.level>this.player.level) return false;
    this.equipment[item.type]=id; this.player.hp=Math.min(this.player.hp,this.stats().maxHp);
    this.notice(`${item.name} ausgerüstet`); this.change(); this.save(false); return true;
  }
  buy(id) {
    if(id==='seed') {
      if(this.player.gold<4) return false;
      this.player.gold-=4; this.resources.seed+=3; this.notice('3 Saatgut gekauft'); this.change(); this.save(false); return true;
    }
    const item=this.item(id); if(!item || this.player.gold<item.price) return false;
    this.player.gold-=item.price; this.addItem(id); this.notice(`${item.name} gekauft`); this.save(false); return true;
  }
  sell(id) {
    const item=this.item(id); if(!item || !this.inventory[id] || Object.values(this.equipment).includes(id)) return false;
    this.inventory[id]--; this.player.gold+=Math.max(1,Math.floor(item.price*.4));if(this.inventory[id]<=0&&this.generatedItems[id]){delete this.generatedItems[id];delete this.inventory[id];} this.change(); this.save(false); return true;
  }
  consume(id) {
    const item=this.item(id); if(item?.type!=='consumable'||!this.inventory[id]) return false;
    const s=this.stats(); const p=this.player;
    if((!item.stats.hpRestore||p.hp>=s.maxHp)&&(!item.stats.manaRestore||p.mana>=s.mana)) return false;
    this.inventory[id]--; p.hp=Math.min(s.maxHp,p.hp+(item.stats.hpRestore||0)); p.mana=Math.min(s.mana,p.mana+(item.stats.manaRestore||0));
    this.notice(`${item.name} verwendet`); this.onSound('heal'); this.change(); this.save(false); return true;
  }
  salvage(id) {
    const item=this.generatedItems[id];if(!item||!this.inventory[id]||Object.values(this.equipment).includes(id)) return false;
    this.inventory[id]--;for(const [key,n] of Object.entries(salvageYield(item))) this.resources[key]=(this.resources[key]||0)+n;
    if(this.inventory[id]<=0){delete this.generatedItems[id];delete this.inventory[id];}
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
    for(const n of this.world.dungeonEntrances||[]) add('dungeon',n,`${n.name||DUNGEONS.find(d=>d.id===n.id)?.name} betreten`,85);
    for(const n of this.world.puzzleObjects||[]) add('puzzle',n,n.label||'Runenmechanismus betätigen',60);
    if(this.world.dungeonExit) add('exit',this.world.dungeonExit,'Dungeon verlassen',65);
    for(const other of this.partyGames||[]) if(other!==this&&other.dead) add('revive',other.player,`${other.player.name} wiederbeleben`,75);
    return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
  }
  interact() {
    if(!this.started || this.dead || this.paused) return;
    const n=this.nearby(); if(!n) { this.notice('Gehe näher an eine Person oder Ressource.'); return; }
    const o=n.object;
    if(n.kind==='dungeon') {this.enterDungeon(o.dungeonId||o.id);return;}
    if(n.kind==='exit') {this.exitDungeon();return;}
    if(n.kind==='revive') { const ally=this.partyGames.find(g=>g.player===o);if(ally) {ally.dead=false;ally.paused=false;ally.player.hp=ally.stats().maxHp*.4;ally.player.invulnerable=3;ally.onRevived?.();this.notice(`${o.name} wiederbelebt`);this.change();}return;}
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
  action(name) {
    if(!this.started || this.paused || this.dead) return false;
    if(name==='interact') { this.interact(); return true; }
    if((this.cooldowns[name]||0)>0) return false;
    const p=this.player,s=this.stats(),cls=getClass(p.classId);
    if(name==='attack') {
      this.combo=this.time-this.comboTime<1.1?(this.combo+1)%3:0; this.comboTime=this.time;
      const profile=cls.abilities.attack,heavy=this.combo===2,arc=heavy?Math.PI:profile.arc,range=profile.range+(heavy?18:0);
      const damage=(s[profile.stat||'damage']||s.damage)*profile.damageMultiplier*(heavy?1.55:1);
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
      const radius=skill.radius||100,damage=(s[skill.stat||'spellDamage']||s.spellDamage)*skill.damageMultiplier;
      const allies=(this.partyGames||[this]).filter(g=>!g.dead&&(skill.allies?dist(p,g.player)<radius:g===this));
      this.effect('ring',p.x,p.y,{color:skill.color,radius,life:.6});
      if(skill.healMultiplier&&skill.kind!=='drain') for(const ally of allies) {ally.player.hp=Math.min(ally.stats().maxHp,ally.player.hp+s.spellDamage*skill.healMultiplier);ally.text(ally.player.x,ally.player.y-24,'Heilung','#abd892');ally.change();}
      if(skill.kind==='projectile'||skill.kind==='drain') this.projectiles.push({x:p.x+Math.cos(p.face)*22,y:p.y+Math.sin(p.face)*22,angle:p.face,type:'bolt',speed:skill.projectileSpeed||430,damage,life:(skill.range||540)/(skill.projectileSpeed||430),owner:'player',actorId:p.id||'local',radius:8,color:skill.color,slow:skill.slow||0,slowDuration:skill.duration||3,drain:skill.kind==='drain'?skill.healMultiplier||.4:0,splash:skill.splashRadius||0,piercing:skill.piercing||0,hitIds:[]});
      if(skill.kind==='aoe'||skill.kind==='shield') {
        if(skill.shieldMultiplier)for(const ally of allies) {ally.player.shield=ally.stats().maxHp*skill.shieldMultiplier;ally.player.shieldUntil=this.time+(skill.duration||5);ally.change();}
        for(const e of this.world.enemies) if(e.alive&&dist(p,e)<(skill.tauntRadius||radius)) {
          if(skill.tauntRadius) {e.targetId=p.id||'local';e.tauntUntil=this.time+5;e.aggro=true;}
          if(dist(p,e)<radius&&damage>0)this.hitEnemy(e,damage,12);
          if(skill.slow){e.slowUntil=this.time+(skill.duration||3);e.slowFactor=1-skill.slow;}
        }
      }
      if(skill.kind==='trap') this.hazards.push({id:`trap-${++this.lootSerial}`,kind:'trap',x:p.x+Math.cos(p.face)*80,y:p.y+Math.sin(p.face)*80,radius,damage,slow:skill.slow||3,life:skill.duration||8,actorId:p.id||'local',color:skill.color});
      if(skill.regenerationMultiplier)this.hazards.push({id:`regen-${++this.lootSerial}`,kind:'regeneration',x:p.x,y:p.y,radius,heal:s.spellDamage*skill.regenerationMultiplier,life:skill.duration||6,actorId:p.id||'local',color:skill.color,tick:1});
      if(skill.burnDamageMultiplier)this.hazards.push({id:`burn-${++this.lootSerial}`,kind:'burn',x:p.x,y:p.y,radius,damage:s.spellDamage*skill.burnDamageMultiplier,life:skill.duration||4,actorId:p.id||'local',color:skill.color,tick:1});
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
      const id=Object.keys(this.inventory).find(id=>ITEMS[id]?.type==='consumable'&&ITEMS[id]?.stats.hpRestore&&this.inventory[id]>0);
      if(!id) { this.notice('Keine Heiltränke mehr. Braue neue im Handwerk.'); return false; }
      if(p.hp>=s.maxHp && (!ITEMS[id].stats.manaRestore||p.mana>=s.mana)) { this.notice('Dein Leben ist bereits voll.'); return false; }
      this.inventory[id]--; p.hp=Math.min(s.maxHp,p.hp+(ITEMS[id].stats.hpRestore||0)); p.mana=Math.min(s.mana,p.mana+(ITEMS[id].stats.manaRestore||0));
      this.cooldowns.potion=3; this.effect('ring',p.x,p.y,{color:'#a1e29f',radius:55,life:.6}); this.onSound('heal');
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
    const result=Math.max(1,Math.round(damage*(crit?1.7:1)*(.9+this.random()*.2)));
    const applied=Math.min(e.hp,result);e.hp-=result; e.hitUntil=this.time+.12; e.aggro=true;
    const a=Math.atan2(e.y-this.player.y,e.x-this.player.x);
    this.move(e,Math.cos(a)*knockback,Math.sin(a)*knockback,ENEMY_TYPES[e.type]?.boss?22:10);
    this.text(e.x,e.y-24,crit?`${result}!`:result,crit?'#ffd37b':'#f4edd7');
    this.effect('burst',e.x,e.y,{color:crit?'#f7c460':'#c7d39b',radius:24,life:.3});
    if(this.settings.shake) this.shake=Math.min(1,this.shake+(crit?.25:.12));
    if(this.stats().lifeSteal) this.player.hp=Math.min(this.stats().maxHp,this.player.hp+applied*this.stats().lifeSteal);
    this.onSound('hit'); if(e.hp<=0) this.killEnemy(e);
    return applied;
  }
  killEnemy(e) {
    if(!e.alive) return;
    const def=ENEMY_TYPES[e.type]; e.alive=false; e.hp=0; e.respawnAt=def.boss?Infinity:this.time+55; e.aggro=false;
    const party=(this.partyGames||[this]).filter(g=>!g.dead&&dist(g.player,e)<1200);
    for(const ally of party) {ally.kills++;ally.event('kill',e.type);ally.gainXp(e.xp||def.xp);ally.player.gold+=e.gold||def.gold;ally.change();}
    this.text(e.x,e.y,`+${e.xp||def.xp} EP`,'#b5ce83');
    this.effect('burst',e.x,e.y,{color:def.color,radius:def.boss?80:35,life:.65});
    if(this.random()<(def.boss?1:.3)) {
      for(const ally of party) {
        const item=generateLoot({level:e.lootLevel||e.level||def.level,tier:e.lootTier||1,boss:def.boss,classId:ally.player.classId,rng:ally.random,source:e.type,pity:ally.lootPity,uid:`loot-${++ally.lootSerial}-${Math.floor(ally.random()*1e9)}-${ally.player.id||'local'}`});
        this.drops.push({x:e.x+(party.indexOf(ally)-.5)*16,y:e.y,item:item.id,loot:item,ownerId:ally.player.id||'local',life:120,color:item.rarity});
        if(ally.random()<.06)ally.resources[['ruby','sapphire','emerald'][Math.floor(ally.random()*3)]]++;
      }
    }
    if(def.boss)for(const ally of party) { ally.flags[e.type]=true;ally.notice(`${def.name} besiegt!`,'level');ally.onSound('level');ally.save(false); }
    const bossTypes=['thorn_guardian','frost_sentinel','emberlord'];
    if(bossTypes.length && bossTypes.every(id=>this.flags[id]) && !this.flags.victory) { this.flags.victory=true; this.save(false); this.onVictory(); }
  }
  damagePlayer(damage,{trueDamage=false,ignoreInvulnerability=false}={}) {
    const p=this.player; if((p.invulnerable>0&&!ignoreInvulnerability)||this.dead) return;
    const hit=Math.max(1,Math.round(trueDamage?damage:damage*100/(100+this.stats().armor*5)));
    const absorbed=Math.min(p.shield||0,hit);p.shield=Math.max(0,(p.shield||0)-absorbed);
    p.hp=Math.max(0,p.hp-hit+absorbed); p.invulnerable=.6; p.hitUntil=this.time+.18;
    this.text(p.x,p.y-30,`−${hit}`,'#f39786'); this.onSound('hurt');
    if(this.settings.shake) this.shake=Math.min(1,this.shake+.35);
    this.change(); if(p.hp<=0) { this.dead=true; this.paused=true; this.keys.clear(); this.onDeath(); }
  }
  respawn() {
    this.player.x=this.dungeonInstance?.spawn.x||520; this.player.y=this.dungeonInstance?.spawn.y||1250; this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
    this.player.gold=Math.max(0,Math.floor(this.player.gold*.9)); this.player.invulnerable=3;
    this.dead=false; this.paused=false; this.projectiles=[]; this.notice('Am Glutherd erwacht · 10 % Gold für deine Rettung'); this.save(false); this.change();
  }
  update(dt,{simulateWorld=true}={}) {
    dt=Math.min(.04,Math.max(0,dt));
    if(!this.started || this.paused || this.dead) return;
    this.time+=dt; this.playTime+=dt; this.shake=Math.max(0,this.shake-dt*2);
    const p=this.player,s=this.stats();
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
    else this.move(p,mx*s.speed*dt,my*s.speed*dt);
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
    if(this.dungeonInstance) {
      const events=updateDungeon(this.dungeonInstance,dt,living.map(g=>({...g.player,human:true,alive:true})));
      for(const event of events) {
        if(event.hazards)this.hazards.push(...event.hazards);
        if(event.zones)for(const zone of event.zones)for(const ally of living)if(dist(ally.player,zone)<zone.radius)ally.damagePlayer(zone.damage);
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
    this.updateEnemies(dt,partyGames);
    for(const projectile of this.projectiles) {
      projectile.x+=Math.cos(projectile.angle)*projectile.speed*dt; projectile.y+=Math.sin(projectile.angle)*projectile.speed*dt; projectile.life-=dt;
      if(this.collides(projectile.x,projectile.y,3)) { projectile.life=0; continue; }
      if(projectile.owner==='player') {
        const caster=partyGames.find(g=>(g.player.id||'local')===(projectile.actorId||'local'))||this;
        const target=this.world.enemies.find(e=>e.alive&&!(projectile.hitIds||[]).includes(e.id)&&dist(e,projectile)<(ENEMY_TYPES[e.type]?.boss?36:20));
        if(target) {
          const applied=caster.hitEnemy(target,projectile.damage,10);(projectile.hitIds??=[]).push(target.id);
          if(projectile.piercing>1)projectile.piercing--;else projectile.life=0;
          if(projectile.slow){target.slowUntil=this.time+(projectile.slowDuration||3);target.slowFactor=1-projectile.slow;}
          if(projectile.drain&&applied)caster.player.hp=Math.min(caster.stats().maxHp,caster.player.hp+applied*projectile.drain);
          if(projectile.splash)for(const e of this.world.enemies)if(e!==target&&e.alive&&dist(e,target)<projectile.splash)caster.hitEnemy(e,projectile.damage*.6,0);
        }
      } else {const target=living.find(g=>dist(projectile,g.player)<23);if(target){target.damagePlayer(projectile.damage);projectile.life=0;}}
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0);
    for(const fx of this.effects) { fx.life-=dt; if(fx.kind==='text') fx.y-=18*dt; }
    this.effects=this.effects.filter(f=>f.life>0);
    for(const drop of this.drops) {
      drop.life-=dt;
      const owner=living.find(g=>(!drop.ownerId||(g.player.id||'local')===drop.ownerId)&&dist(drop,g.player)<40);
      if(owner) {if(owner.addItem(drop.loot||drop.item)){owner.notice(`${owner.item(drop.item)?.name} gefunden`,'loot');owner.onSound('loot');drop.life=0;}else if(!drop.warned){owner.notice('Dein Gepäck ist voll. Die Beute liegt noch am Boden.');drop.warned=true;} }
    }
    this.drops=this.drops.filter(d=>d.life>0);
    for(const trap of this.hazards) {
      trap.life-=dt;
      if(trap.kind==='regeneration'||trap.kind==='burn') {
        trap.tick-=dt;if(trap.tick<=0){trap.tick=1;const caster=partyGames.find(g=>(g.player.id||'local')===trap.actorId)||this;
          if(trap.kind==='regeneration')for(const ally of living)if(dist(ally.player,trap)<trap.radius){ally.player.hp=Math.min(ally.stats().maxHp,ally.player.hp+trap.heal);ally.change();}
          if(trap.kind==='burn')for(const e of this.world.enemies)if(e.alive&&dist(e,trap)<trap.radius)caster.hitEnemy(e,trap.damage,0);
        }continue;
      }
      if(trap.kind!=='trap')continue;
      const enemy=this.world.enemies.find(e=>e.alive&&dist(e,trap)<trap.radius);if(!enemy)continue;
      const caster=partyGames.find(g=>(g.player.id||'local')===trap.actorId)||this;
      for(const e of this.world.enemies)if(e.alive&&dist(e,trap)<trap.radius){caster.hitEnemy(e,trap.damage,0);e.slowUntil=this.time+3;e.slowFactor=1-(trap.slow||.5);}
      trap.life=0;this.effect('ring',trap.x,trap.y,{radius:trap.radius,color:trap.color,life:.5});
    }
    this.hazards=this.hazards.filter(h=>h.life>0);
    for(const summon of this.summons) {
      summon.life-=dt;summon.attackTimer-=dt;const caster=partyGames.find(g=>(g.player.id||'local')===summon.actorId)||this;
      const target=this.world.enemies.filter(e=>e.alive&&dist(e,summon)<(summon.range||350)).sort((a,b)=>dist(a,summon)-dist(b,summon))[0];
      const follow=target||caster.player,a=Math.atan2(follow.y-summon.y,follow.x-summon.x);
      if(dist(follow,summon)>45)this.move(summon,Math.cos(a)*120*dt,Math.sin(a)*120*dt,8);
      if(target&&dist(target,summon)<70&&summon.attackTimer<=0){summon.attackTimer=summon.attackCooldown||1;caster.hitEnemy(target,summon.damage,0);}
    }
    this.summons=this.summons.filter(s=>s.life>0);
    for(const ally of partyGames) {ally.effects=this.effects;ally.projectiles=this.projectiles;ally.drops=this.drops;ally.hazards=this.hazards;ally.summons=this.summons;}
  }
  updateEnemies(dt,partyGames=[this]) {
    const living=partyGames.filter(g=>!g.dead);if(!living.length)return;
    for(const e of this.world.enemies) {
      const d=ENEMY_TYPES[e.type]; if(!d) continue;
      const taunted=e.tauntUntil>this.time?living.find(g=>(g.player.id||'local')===e.targetId):null;
      const targetGame=taunted||living.reduce((a,b)=>dist(a.player,e)<dist(b.player,e)?a:b),p=targetGame.player;
      if(!e.alive) { if(!d.boss&&e.respawnAt<this.time&&living.every(g=>dist(g.player,e)>500)) { e.alive=true; e.hp=e.maxHp; e.x=e.homeX; e.y=e.homeY; e.phase='idle'; } continue; }
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
          e.phase='recover'; e.attackTimer=d.boss?1.2:.85;
          if(d.boss) {
            const radius=e.telegraphRadius||105;
            const center={x:e.telegraphX??e.x,y:e.telegraphY??e.y};
            this.effect('ring',center.x,center.y,{color:d.color,radius,life:.45});
            const baseDamage=(e.damage||d.damage)*(e.enraged?3:1)*1.3;
            if(e.telegraphMechanic==='stack') {
              const stack=living.filter(g=>dist(g.player,center)<radius);
              if(stack.length<(e.stackRequired||2))for(const ally of living)ally.damagePlayer(ally.stats().maxHp*2,{trueDamage:true,ignoreInvulnerability:true});
              else for(const ally of stack)ally.damagePlayer(baseDamage*(e.stackRequired||2)/stack.length);
            } else if(e.telegraphMechanic==='spread') {
              for(const ally of living) {const hits=(e.spreadTargets||[]).filter(t=>dist(t,ally.player)<75).length;if(hits)ally.damagePlayer(baseDamage*hits);}
            } else for(const ally of living)if(dist(ally.player,center)<radius)ally.damagePlayer(baseDamage);
            const phase2=e.hp<e.maxHp*.5; e.cycle=(e.cycle||0)+1;
            const emit=(angle,speed=160)=>this.projectiles.push({x:e.x,y:e.y,angle,type:'enemy',speed,damage:(e.damage||d.damage)*(e.enraged?3:1)*.7,life:2.5,owner:'enemy',color:d.color});
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
          } else if((d.range||45)>80) this.projectiles.push({x:e.x,y:e.y,angle:a,type:'enemy',speed:195,damage:e.damage||d.damage,life:2,owner:'enemy'});
          else if(distance<62)targetGame.damagePlayer(e.damage||d.damage);
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
  }
  capture() {
    const w=this.overworld||this.world;
    const dungeon=this.dungeonInstance?{
      id:this.dungeonInstance.id,tier:this.dungeonInstance.tier,seed:this.dungeonInstance.seed,returnPoint:this.returnPoint,
      elapsed:this.dungeonInstance.elapsed,bossTime:this.dungeonInstance.bossTime,bossEngaged:this.dungeonInstance.bossEngaged,affixState:this.dungeonInstance.affixState,gateOpened:this.dungeonInstance.gateOpened,bossDefeated:this.dungeonInstance.bossDefeated,puzzles:this.dungeonInstance.puzzles,
      objects:this.world.puzzleObjects.map(o=>({id:o.id,x:o.x,y:o.y,rotation:o.rotation,active:o.active})),
      enemies:this.world.enemies.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,alive:e.alive,affixEcho:e.affixEcho,type:e.type,level:e.level})),openedChests:this.world.chests.filter(c=>c.opened).map(c=>c.id)
    }:null;
    return {version:2,savedAt:Date.now(),player:{...this.player,walking:false},inventory:this.inventory,resources:this.resources,equipment:this.equipment,generatedItems:this.generatedItems,lootPity:this.lootPity,lootSerial:this.lootSerial,dungeonRecords:this.dungeonRecords,dungeon,contracts:this.contracts,skills:this.skills,questState:this.questState,discovered:this.discovered,unlockedShrines:this.unlockedShrines,flags:this.flags,ledger:this.ledger,kills:this.kills,settings:this.settings,time:this.time,playTime:this.playTime,world:{nodes:w.nodes.map(n=>({id:n.id,readyAt:n.readyAt})),plots:w.plots,chests:w.chests.map(c=>({id:c.id,opened:c.opened})),enemies:w.enemies.filter(e=>ENEMY_TYPES[e.type]?.boss&&!e.alive).map(e=>e.id)}};
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
    for(const key of ['inventory','resources','equipment','skills','questState','flags','ledger','settings']) {
      if(data[key]!==undefined&&!record(data[key])) throw new Error(`Ungültiges Feld: ${key}`);
    }
    for(const key of ['discovered','unlockedShrines']) if(data[key]!==undefined&&(!Array.isArray(data[key])||data[key].some(id=>typeof id!=='string'))) throw new Error(`Ungültiges Feld: ${key}`);
    for(const key of ['nodes','plots','chests','enemies']) if(data.world[key]!==undefined&&!Array.isArray(data.world[key])) throw new Error(`Ungültige Weltliste: ${key}`);
    for(const key of ['nodes','plots','chests']) if(data.world[key]?.some(v=>!record(v)||typeof v.id!=='string')) throw new Error('Ungültiger Weltzustand.');
    if(data.world.enemies?.some(id=>typeof id!=='string')) throw new Error('Ungültige Gegnerdaten.');
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
    this.contracts=restoreContractState(data.contracts||{active:[],completed:{}},{level:this.player.level});
    this.generatedItems=data.generatedItems||{};this.lootSerial=Math.floor(validNum(data.lootSerial,0));
    this.lootPity={legendaryMisses:Math.floor(validNum(data.lootPity?.legendaryMisses,0,0,500)),bossMisses:Math.floor(validNum(data.lootPity?.bossMisses,0,0,34))};
    for(const [id,value] of Object.entries(data.dungeonRecords||{}))if(DUNGEONS.some(d=>d.id===id)&&record(value))this.dungeonRecords[id]={runs:Math.floor(validNum(value.runs,0)),bestTier:Math.floor(validNum(value.bestTier,0,0,30)),bestTime:validNum(value.bestTime,0)};
    this.player.x=clamp(this.player.x,30,this.world.width-30); this.player.y=clamp(this.player.y,30,this.world.height-30);
    for(const [id,count] of Object.entries(data.inventory||{})) if(this.item(id)) this.inventory[id]=Math.floor(validNum(count,0));
    for(const key of Object.keys(this.resources)) this.resources[key]=Math.floor(validNum(data.resources?.[key],0));
    for(const slot of Object.keys(this.equipment)) { const id=data.equipment?.[slot]; this.equipment[slot]=this.item(id)?.type===slot&&this.inventory[id]>0?id:null; }
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
    if(data.settings) for(const key of Object.keys(this.settings)) if(typeof data.settings[key]==='boolean') this.settings[key]=data.settings[key];
    for(const node of this.world.nodes) { const saved=data.world.nodes?.find(n=>n.id===node.id); if(saved) node.readyAt=validNum(saved.readyAt,0); }
    for(const plot of this.world.plots) { const saved=data.world.plots?.find(n=>n.id===plot.id); if(saved&&['empty','growing','ripe'].includes(saved.state)) { plot.state=saved.state; plot.readyAt=validNum(saved.readyAt,0); } }
    for(const chest of this.world.chests) chest.opened=!!data.world.chests?.find(c=>c.id===chest.id)?.opened;
    for(const enemy of this.world.enemies) if(ENEMY_TYPES[enemy.type]?.boss&&(data.world.enemies||[]).includes(enemy.id)) { enemy.alive=false; enemy.hp=0; enemy.respawnAt=Infinity; }
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
    if(p.hp<=0) {
      // Reloading a journey at the defeat screen follows the same rescue rule
      // as the button, instead of trapping the player at one HP among enemies.
      this.player.x=this.dungeonInstance?.spawn.x||520;this.player.y=this.dungeonInstance?.spawn.y||1250;this.player.hp=this.stats().maxHp;this.player.mana=this.stats().mana;
      this.player.gold=Math.floor(this.player.gold*.9);this.player.invulnerable=3;
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
