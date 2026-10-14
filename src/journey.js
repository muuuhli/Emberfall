/** Permanent progress rewards different discoveries, never repeated grinding.
 * No UI, storage, transport or mutable global character state belongs here.
 */
import { REGIONS as STARTING_REGIONS, RECIPES as BASE_RECIPES, ENEMY_TYPES as STORY_ENEMIES } from './content.js';
import { EXPANSION_REGIONS } from './expansion.js';
import { DUNGEONS } from './dungeons.js';
import { BESTIARY_SPECIES } from './bestiary.js';
import { EXTRA_RECIPES } from './arsenal.js';
import { PROFESSION_RECIPES } from './professions.js';
import { EQUIPMENT_RECIPES } from './equipment-system.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS, WORLD_EVENT_ENEMIES } from './world-events.js';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const levelOf=game=>Number.isFinite(game?.player?.level)?Math.max(1,Math.min(100,Math.floor(game.player.level))):1;
const REGION_IDS=[...STARTING_REGIONS,...EXPANSION_REGIONS].map(r=>r.id);
const DUNGEON_IDS=DUNGEONS.map(d=>d.id);
const RAID_IDS=DUNGEONS.filter(d=>d.raid).map(d=>d.id);
const EVENT_IDS=[...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS].map(event=>event.id);
const BOSS_IDS=[...BESTIARY_SPECIES,...Object.entries(STORY_ENEMIES).filter(([,definition])=>definition.boss).map(([id])=>id),...DUNGEONS.map(d=>d.boss),...Object.keys(WORLD_EVENT_ENEMIES)];
const RECORD_LIMITS={explored:16,rescued:16,lore:16,bosses:BOSS_IDS.length,dungeons:8,puzzles:8,crafted:256,contracts:16,revives:32,coopDungeons:8,encounters:48,events:EVENT_IDS.length};

export const FACTION_RANKS=Object.freeze([
  {rank:0,name:'Unbekannt',reputation:0},{rank:1,name:'Vertraut',reputation:80},
  {rank:2,name:'Verbündet',reputation:200},{rank:3,name:'Eidträger',reputation:400},
]);
export const FACTIONS=Object.freeze([
  {id:'wardens',name:'Orden der letzten Wacht',color:'#b6a283',description:'Befreie Reisende, brich verschiedene Bossmächte und öffne Dungeons. Jeder neue Erfolg zählt einmal.',sources:{rescued:15,bosses:8,dungeons:15,events:5},masteryId:'wardens_oath'},
  {id:'archivists',name:'Zirkel des Nachtäthers',color:'#b0a0c4',description:'Sichere regionale Chroniken, löse unterschiedliche Siegel und erkunde vergessenes Wissen.',sources:{lore:18,puzzles:15,dungeons:10,explored:3,events:5},masteryId:'archivists_voice'},
  {id:'wayfarers',name:'Bund der Grenzläufer',color:'#9eae89',description:'Entdecke neue Regionen, schließe dort einen Vertrag ab und führe Gefangene nach Hause.',sources:{explored:12,contracts:15,rescued:6,events:5},masteryId:'wayfarers_stride'},
]);

const recipe=(id,name,factionId,factionRank,minLevel,ingredients,output,description)=>Object.freeze({id,name,factionId,factionRank,minLevel,ingredients,output,amount:2,category:'faction',description});
export const JOURNEY_RECIPES=Object.freeze([
  recipe('journey_warden_reserve','Vorrat der Totenwache','wardens',1,20,{herb:6,wood:2},'grave_red_vial','Zwei Grabrot-Essenzen. Zusätzliche Holzvorräte sparen Kräuter; Vertrauen der Wacht nötig.'),
  recipe('journey_warden_lifeblood','Lebensbund des Ordens','wardens',3,65,{herb:12,crystal:4,dust:4},'martyr_lifeblood','Zwei Lebensblut-Tränke. Arkanstaub ersetzt einen Teil der seltenen Zutaten.'),
  recipe('journey_archive_tonic','Tonikum aus dem Nachtarchiv','archivists',1,30,{herb:6,crystal:4,dust:2},'blackwell_tonic','Zwei Schwarzquellen-Tonika. Archivwissen tauscht Arkanstaub gegen gesparte Kräuter und Kristalle.'),
  recipe('journey_archive_tears','Tränenritus des Zirkels','archivists',3,65,{herb:9,crystal:6,dust:4},'night_oracle_tears','Zwei Tränen des Nachtorakels. Ein Vorratsritus für erfahrene Ätherkundige.'),
  recipe('journey_frontier_rations','Proviant der Grenzläufer','wayfarers',1,35,{wheat:8,herb:3,ore:2},'blackgrain_ration','Zwei Schwarzkorn-Rationen. Reisende tauschen Erz für haltbare Gewürze und sparen Kräuter.'),
  recipe('journey_last_supper','Speisen am letzten Weg','wayfarers',3,70,{wheat:10,herb:6,wood:4},'last_supper_ration','Zwei Vorräte der letzten Nacht. Brennholz spart Weizen und Kräuter für lange Expeditionen.'),
]);
const RECIPE_IDS=[...BASE_RECIPES,...EXTRA_RECIPES,...PROFESSION_RECIPES,...EQUIPMENT_RECIPES,...JOURNEY_RECIPES].map(r=>r.id);

export const JOURNEY_MASTERIES=Object.freeze([
  {id:'wardens_oath',name:'Eid der Bewahrung',factionId:'wardens',factionRank:2,minLevel:40,talentCost:4,icon:'⬡',effects:{maxHp:35,armor:1.4,speed:-2},description:'Pro Meisterrang: +35 Leben, +1,4 Rüstung, −2 Tempo. Schütze die Front; drei Ränge bis zum Endspiel.'},
  {id:'archivists_voice',name:'Stimme des Archivs',factionId:'archivists',factionRank:2,minLevel:40,talentCost:4,icon:'✦',effects:{spellDamage:8,mana:14,armor:-.6},description:'Pro Meisterrang: +8 Zauberkraft, +14 Mana, −0,6 Rüstung. Wissen verlangt eine verwundbarere Stellung.'},
  {id:'wayfarers_stride',name:'Schritt des Grenzläufers',factionId:'wayfarers',factionRank:2,minLevel:40,talentCost:4,icon:'↝',effects:{speed:4,dodgeCooldown:.02,maxHp:-15},description:'Pro Meisterrang: +4 Tempo, 2 % kürzere Ausweichzeit, −15 Leben. Bewege dich bewusst statt Treffer einzustecken.'},
]);

const requirement=(kind,count,options={})=>({kind,count,...options});
const companionStories={
  cinder_moth:'Eine letzte Glut wohnt in ihren durchscheinenden Flügeln. Sie folgt denen, die in alten Chroniken noch Namen finden.',
  ossuary_hound:'Unter seinen bleichen Rippen schlägt kein Herz mehr. Befreite Reisende erkennen trotzdem den Hund, der einst ihre Wagen bewachte.',
  root_wisp:'Ein Irrlicht aus dem vergifteten Schilf der Jadeauen. Es trägt den Atem eines geretteten Hains in die sterbende Welt.',
  rime_lynx:'Seine Pfoten hinterlassen Frostblüten statt Spuren. Erst wenn eine Winterlaterne wieder leuchtet, verlässt er die Gräber am Grat.',
  gloam_raven:'Die Dämmerkrähe sammelt Namen statt glänzender Dinge. Deine Chroniken bewahren jene, die sie nicht mehr heimführen kann.',
  tide_lantern:'Im Glas dieser schwebenden Leuchte schläft das Licht eines versunkenen Hafens. Das Salzarchiv hat seinen Docht nicht vergessen.',
  iron_beetle:'Ein Grabkäfer mit einer Schale aus rostigen Eidnägeln. An deiner Werkbank findet er neues Eisen für seine verwundete Rüstung.',
  moon_eidolon:'Ein kleiner Geist aus der Stunde, die dem Mondbruch fehlt. Er lauscht auf den Takt deiner Schritte zwischen zwei verlorenen Sekunden.',
  blood_weasel:'Der Trauermarder trägt rote Bänder aus verlassenen Rettungswagen. Er begleitet jene, die trotz der Nacht noch Menschen nach Hause bringen.',
  abyss_sentinel:'Ein Wächter aus dem kalten Licht hinter dem Riss. Er erkennt den Eid derer, die mit anderen zurückkehrten, und hält die letzte Wache.',
};
const companion=(id,name,role,silhouette,color,minLevel,stats,requirements,combat=null)=>Object.freeze({id,name,role,silhouette,color,minLevel,stats,requirements,combat,
  description:`${companionStories[id]} ${combat?'Unterstützt dich mit seltenen, begrenzten Angriffen.':'Begleitet dich mit einem kleinen passiven Segen.'} Nur ein Reisegefährte kann aktiv sein.`});
export const COMPANIONS=Object.freeze([
  companion('cinder_moth','Glutmottengeist','Ätherlicht','moth','#d2a174',4,{mana:6,manaRegen:.2},[requirement('explored',2),requirement('lore',1)]),
  companion('ossuary_hound','Ossuarhund','Frontbegleiter','hound','#b8a795',12,{maxHp:16,armor:.4},[requirement('rescued',2),requirement('bosses',2)],{stat:'damage',damageMultiplier:.055,attackCooldown:2.1,range:200,ranged:false,maximumDamage:80}),
  companion('root_wisp','Dornlicht','Hainsegen','wisp','#9db58c',20,{gatherYield:.2,maxHp:12},[requirement('explored',1,{targets:['jadeauen']}),requirement('rescued',1,{targets:['jadeauen']}),requirement('faction',80,{factionId:'wayfarers'})]),
  companion('rime_lynx','Reifluchs','Frostjäger','lynx','#b3c6d1',25,{crit:.006,speed:2},[requirement('explored',1,{targets:['frostgrat']}),requirement('bosses',1,{targets:['glacier_ram']}),requirement('lore',3),requirement('events',1,{targets:['event-frostgrat']})],{stat:'damage',damageMultiplier:.06,attackCooldown:2.5,range:230,ranged:false,maximumDamage:80}),
  companion('gloam_raven','Dämmerkrähe','Wegkundige','raven','#94899f',30,{speed:3,dodgeCooldown:.018},[requirement('explored',5),requirement('lore',4)]),
  companion('tide_lantern','Flutlaterne','Fernfunke','lantern','#86b4b7',35,{mana:12,spellDamage:4},[requirement('dungeons',1,{targets:['salzarchiv']}),requirement('lore',1,{targets:['sturmkueste']})],{stat:'spellDamage',damageMultiplier:.05,attackCooldown:2.8,range:350,ranged:true,maximumDamage:80}),
  companion('iron_beetle','Grabkäfer','Panzersegen','beetle','#b1a084',40,{armor:1.4,maxHp:18},[requirement('crafted',6),requirement('dungeons',2),requirement('faction',200,{factionId:'wardens'})]),
  companion('moon_eidolon','Mondsplittergeist','Zeitflüsterer','eidolon','#b6a1cd',60,{cooldown:.01,manaRegen:.3},[requirement('explored',1,{targets:['mondbruch']}),requirement('dungeons',1,{targets:['uhrwerk']}),requirement('lore',6),requirement('faction',200,{factionId:'archivists'})],{stat:'spellDamage',damageMultiplier:.055,attackCooldown:2.5,range:330,ranged:true,maximumDamage:80}),
  companion('blood_weasel','Trauermarder','Beharrlicher Jäger','weasel','#b2908e',70,{lifeSteal:.004,crit:.007},[requirement('rescued',8),requirement('bosses',12)],{stat:'damage',damageMultiplier:.07,attackCooldown:2.3,range:260,ranged:false,maximumDamage:80}),
  companion('abyss_sentinel','Risshüter','Letzte Wache','sentinel','#a49bbe',90,{armor:1.5,maxHp:24},[requirement('coopDungeons',2),requirement('dungeons',5),requirement('explored',12),requirement('events',12),requirement('faction',400,{factionId:'archivists'})],{stat:'spellDamage',damageMultiplier:.06,attackCooldown:2.7,range:380,ranged:true,maximumDamage:80}),
]);

const achievement=(id,name,description,requirements,reward,minLevel=1)=>Object.freeze({id,name,description,requirements,reward,minLevel,icon:'★'});
export const ACHIEVEMENTS=Object.freeze([
  achievement('first_horizons','Drei Horizonte','Entdecke drei unterschiedliche Regionen.',[requirement('explored',3)],{gold:80,resources:{herb:4}}),
  achievement('names_remembered','Die Namen bewahren','Lies die Chroniken in vier unterschiedlichen Regionen.',[requirement('lore',4)],{xp:150,resources:{dust:8}}),
  achievement('unbroken_chain','Ungebrochene Kette','Befreie Reisende in drei unterschiedlichen Regionen.',[requirement('rescued',3)],{gold:120,skillPoints:1}),
  achievement('gravebreaker','Gräberbrecher','Besiege vier unterschiedliche Bossmächte.',[requirement('bosses',4)],{gold:100,resources:{crystal:5}}),
  achievement('many_paths','Pfade und Erinnerungen','Entdecke acht Regionen und sichere vier ihrer Chroniken.',[requirement('explored',8),requirement('lore',4)],{gold:180,resources:{ore:8}},20),
  achievement('artisan','Mehr als eine Klinge','Fertige fünf unterschiedliche Rezepte; wiederholtes Brauen zählt einmal.',[requirement('crafted',5)],{resources:{dust:10,seed:6}},15),
  achievement('sealed_promises','Versprechen hinter Siegeln','Löse die Rätsel von drei unterschiedlichen Dungeons.',[requirement('puzzles',3)],{skillPoints:1,resources:{crystal:8}},35),
  achievement('depthwalker','Wege unter der Erde','Schließe drei unterschiedliche Dungeons ab.',[requirement('dungeons',3)],{gold:200,resources:{dust:12}},35),
  achievement('black_oaths','Vier gebrochene Schwüre','Beende vier unterschiedliche Weltabenteuer und berge zwei Grab-, Fluch- oder Kettenvorräte.',[requirement('events',4),requirement('encounters',2)],{resources:{ruby:1,dust:10}},20),
  achievement('faction_friend','Ein Name am Feuer','Erreiche 200 Ruf bei einem Bund.',[requirement('faction',200,{any:true})],{gold:180,resources:{herb:8}},25),
  achievement('three_oaths','Drei Bündnisse','Erreiche 200 Ruf bei allen drei Bünden.',FACTIONS.map(f=>requirement('faction',200,{factionId:f.id})),{gold:300,skillPoints:2},40),
  achievement('shared_torch','Die geteilte Fackel','Schließe einen Dungeon mit Gefährten ab und hilf einem gefallenen Reisenden auf.',[requirement('coopDungeons',1),requirement('revives',1)],{gold:160,resources:{raidSigil:1}},25),
  achievement('last_horizon','Kein Horizont bleibt verborgen','Entdecke alle sechzehn Regionen.',[requirement('explored',16)],{gold:500,skillPoints:2},70),
  achievement('echo_librarian','Archivar der verlorenen Welt','Lies alle sechzehn Chroniken und beende fünf unterschiedliche Dungeons.',[requirement('lore',16),requirement('dungeons',5)],{resources:{sapphire:1,dust:24}},60),
  achievement('champion_road','Der Weg der Champions','Besiege 24 verschiedene Bossmächte und erfülle Verträge in acht Regionen.',[requirement('bosses',24),requirement('contracts',8)],{gold:500,resources:{emerald:1}},70),
  achievement('worlds_oath','Acht Tore, ein Eid','Beende alle acht Dungeons und drei unterschiedliche Dungeons gemeinsam.',[requirement('dungeons',8),requirement('coopDungeons',3)],{skillPoints:3,resources:{raidSigil:2}},95),
]);

export function createJourneyState() {
  return {version:1,records:Object.fromEntries(Object.keys(RECORD_LIMITS).map(key=>[key,[]])),reputation:Object.fromEntries(FACTIONS.map(f=>[f.id,0])),claimed:[],ownedCompanions:[],activeCompanion:null,mastery:null};
}
export function computeJourneyReputation(state) {
  return Object.fromEntries(FACTIONS.map(faction=>[faction.id,Math.min(500,Object.entries(faction.sources).reduce((sum,[key,value])=>sum+(state?.records?.[key]?.length||0)*value,0))]));
}
const journeyOf=game=>game?.journey||createJourneyState();
export function factionRank(reputation) {return FACTION_RANKS.filter(rank=>rank.reputation<=reputation).at(-1)?.rank||0;}
export function getFactionProgress(game,factionId) {
  const faction=FACTIONS.find(f=>f.id===factionId);if(!faction)return null;
  const reputation=journeyOf(game).reputation[factionId]||0,rank=factionRank(reputation);
  return {...faction,reputation,rank,rankName:FACTION_RANKS[rank].name,nextRankAt:FACTION_RANKS[rank+1]?.reputation||null};
}

function progress(state,requirement) {
  if(requirement.kind==='faction')return requirement.any?Math.max(...Object.values(state.reputation)):state.reputation[requirement.factionId]||0;
  const values=state.records[requirement.kind]||[];
  return requirement.targets?values.filter(id=>requirement.targets.includes(id)).length:values.length;
}
const fulfilled=(state,requirements)=>requirements.every(r=>progress(state,r)>=r.count);
function eligibleCompanion(state,definition,level) {return level>=definition.minLevel&&fulfilled(state,definition.requirements);}
export function getAchievementProgress(game,id) {
  const achievement=ACHIEVEMENTS.find(a=>a.id===id);if(!achievement)return null;
  const state=journeyOf(game),requirements=achievement.requirements.map(r=>({...r,current:Math.min(r.count,progress(state,r)),complete:progress(state,r)>=r.count}));
  return {achievement,requirements,complete:levelOf(game)>=achievement.minLevel&&requirements.every(r=>r.complete),claimed:state.claimed.includes(id)};
}
export function canClaimAchievement(game,id) {
  const status=getAchievementProgress(game,id);
  if(!status)return {ok:false,reason:'Unbekannte Errungenschaft.'};
  if(game?.dead||game?.player?.hp<=0)return {ok:false,reason:'Erwache zuerst am Glutherd.'};
  if(status.claimed)return {ok:false,reason:'Belohnung bereits abgeholt.'};
  if(!status.complete)return {ok:false,reason:`Erfülle zuerst das Ziel und erreiche Stufe ${status.achievement.minLevel}.`};
  return {ok:true,reason:''};
}
/** Marks a reward paid exactly once; Game applies the returned trusted reward. */
export function claimJourneyAchievement(game,id) {
  if(!canClaimAchievement(game,id).ok)return null;
  game.journey.claimed.push(id);return clone(ACHIEVEMENTS.find(a=>a.id===id).reward);
}

function validRecordId(key,id) {
  if(typeof id!=='string')return false;
  if(['explored','rescued','lore','contracts'].includes(key))return REGION_IDS.includes(id);
  if(['dungeons','puzzles','coopDungeons'].includes(key))return DUNGEON_IDS.includes(id);
  if(key==='bosses')return BOSS_IDS.includes(id);
  if(key==='crafted')return RECIPE_IDS.includes(id);
  if(key==='events')return EVENT_IDS.includes(id);
  if(key==='revives')return /^[\p{L}\p{N} _:.~-]{1,96}$/u.test(id);
  if(key==='encounters')return REGION_IDS.some(region=>['sarcophagus','cursed_chest','sealed_cache'].some(kind=>id===`encounter-${region}-${kind}`));
  return false;
}
const uniqueList=(value,max,accept)=>Array.isArray(value)&&value.length<=max&&new Set(value).size===value.length&&value.every(accept);
export function validateJourneyState(state,{level=100}={}) {
  if(state===undefined)return true;
  if(!record(state)||state.version!==1||!record(state.records)||!record(state.reputation)||!integer(level,1,100))return false;
  const stateKeys=['version','records','reputation','claimed','ownedCompanions','activeCompanion','mastery'];
  if(Object.keys(state).length!==stateKeys.length||!stateKeys.every(key=>Object.hasOwn(state,key))||Object.keys(state.records).length!==Object.keys(RECORD_LIMITS).length)return false;
  if(!Object.entries(RECORD_LIMITS).every(([key,max])=>uniqueList(state.records[key],max,id=>validRecordId(key,id))))return false;
  const expected=computeJourneyReputation(state);
  if(Object.keys(state.reputation).length!==FACTIONS.length||!FACTIONS.every(f=>state.reputation[f.id]===expected[f.id]))return false;
  if(!uniqueList(state.claimed,ACHIEVEMENTS.length,id=>ACHIEVEMENTS.some(a=>a.id===id&&level>=a.minLevel&&fulfilled(state,a.requirements))))return false;
  if(!uniqueList(state.ownedCompanions,COMPANIONS.length,id=>COMPANIONS.some(c=>c.id===id&&eligibleCompanion(state,c,level))))return false;
  if(state.activeCompanion!==null&&(typeof state.activeCompanion!=='string'||!state.ownedCompanions.includes(state.activeCompanion)))return false;
  if(state.mastery!==null&&!JOURNEY_MASTERIES.some(m=>m.id===state.mastery&&level>=m.minLevel&&factionRank(state.reputation[m.factionId])>=m.factionRank))return false;
  return true;
}

function syncCompanions(state,level) {
  const unlocked=[];
  for(const definition of COMPANIONS)if(eligibleCompanion(state,definition,level)&&!state.ownedCompanions.includes(definition.id)){state.ownedCompanions.push(definition.id);unlocked.push(definition.id);}
  return unlocked;
}
/** Legacy adventures inherit already demonstrated discoveries, not new rewards. */
export function restoreJourneyState(saved,{level=1,legacy}={}) {
  if(!integer(level,1,100)||!validateJourneyState(saved,{level}))throw new TypeError('Ungültige Reisechronik.');
  const state=saved===undefined?createJourneyState():clone(saved);
  if(saved===undefined&&legacy) {
    const add=(key,id)=>{if(validRecordId(key,id)&&!state.records[key].includes(id))state.records[key].push(id);};
    for(const region of legacy.discovered||[])add('explored',region);
    for(const region of REGION_IDS){if(legacy.ledger?.[`rescue:${region}`]>0)add('rescued',region);if(legacy.contracts?.completed?.[region]>0)add('contracts',region);if(legacy.ledger?.[`interact:encounter-${region}-lore`]>0)add('lore',region);}
    for(const id of BOSS_IDS)if(legacy.flags?.[id]||legacy.flags?.[`${id}_boss`]||legacy.ledger?.[`kill:${id}_boss`]>0)add('bosses',id);
    for(const id of DUNGEON_IDS){if(legacy.dungeonRecords?.[id]?.runs>0){add('dungeons',id);if(RAID_IDS.includes(id))add('coopDungeons',id);}if(legacy.ledger?.[`puzzle:${id}`]>0)add('puzzles',id);}
    for(const id of RECIPE_IDS)if(legacy.ledger?.[`craft:${id}`]>0)add('crafted',id);
    for(const entry of legacy.world?.interactions||[])if(entry.used)add('encounters',entry.id);
    for(const id of EVENT_IDS)if(legacy.ledger?.[`world_event:${id}`]>0||(legacy.world?.worldEvents||[]).some(entry=>entry.id===id&&entry.claimedBy?.includes(legacy.player?.id||'local'))) {
      add('events',id);
      for(const stage of EXPEDITIONS.find(expedition=>expedition.id===id)?.stages||[])if(stage.boss)add('bosses',stage.boss);
    }
    state.reputation=computeJourneyReputation(state);
  }
  syncCompanions(state,level);return state;
}

function resolveWorldObject(game,target,context) {
  const supplied=context.worldObject;if(supplied?.id===target)return supplied;
  const found=game?.world?.interactions?.find(o=>o.id===target);if(found)return found;
  for(const region of REGION_IDS)for(const kind of ['lore','sarcophagus','cursed_chest','sealed_cache'])if(target===`encounter-${region}-${kind}`)return {id:target,region,kind};
  return null;
}
/** Called on newly emitted authoritative events. Irrelevant combat ticks are cheap. */
export function advanceJourney(game,kind,target,amount=1,context={}) {
  const result={changed:false,unlockedCompanions:[],readyAchievements:[],newFactionRanks:[]};
  if(!['explore','rescue','boss','dungeon','puzzle','craft','contract','revive','interact','level','world_event'].includes(kind)||!Number.isFinite(amount)||amount<1)return result;
  game.journey??=createJourneyState();const state=game.journey;
  const readyBefore=new Set(ACHIEVEMENTS.filter(a=>getAchievementProgress(game,a.id).complete).map(a=>a.id));
  const ranksBefore=Object.fromEntries(FACTIONS.map(f=>[f.id,factionRank(state.reputation[f.id])]));
  const add=(key,id)=>{if(validRecordId(key,id)&&!state.records[key].includes(id)&&state.records[key].length<RECORD_LIMITS[key]){state.records[key].push(id);result.changed=true;}};
  const map={explore:'explored',rescue:'rescued',boss:'bosses',dungeon:'dungeons',puzzle:'puzzles',craft:'crafted',contract:'contracts',revive:'revives',world_event:'events'};
  if(map[kind])add(map[kind],kind==='boss'&&typeof target==='string'&&target.endsWith('_boss')?target.slice(0,-5):target);
  if(kind==='world_event'){
    const definition=WORLD_EVENT_DEFINITIONS.find(event=>event.id===target);
    if(definition?.boss)add('bosses',definition.boss.endsWith('_boss')?definition.boss.slice(0,-5):definition.boss);
    for(const stage of EXPEDITIONS.find(expedition=>expedition.id===target)?.stages||[])if(stage.boss)add('bosses',stage.boss);
  }
  if(kind==='dungeon'&&(context.coop===true||context.partySize>=2||DUNGEONS.some(d=>d.id===target&&d.raid)))add('coopDungeons',target);
  if(kind==='interact') {
    const object=resolveWorldObject(game,target,context);
    if(object?.kind==='lore')add('lore',object.region);
    else if(['sarcophagus','cursed_chest','sealed_cache'].includes(object?.kind))add('encounters',object.id);
  }
  state.reputation=computeJourneyReputation(state);
  result.unlockedCompanions=syncCompanions(state,levelOf(game));
  result.readyAchievements=ACHIEVEMENTS.filter(a=>!state.claimed.includes(a.id)&&!readyBefore.has(a.id)&&getAchievementProgress(game,a.id).complete).map(a=>a.id);
  result.newFactionRanks=FACTIONS.filter(f=>factionRank(state.reputation[f.id])>ranksBefore[f.id]).map(f=>({id:f.id,rank:factionRank(state.reputation[f.id])}));
  if(result.unlockedCompanions.length||result.readyAchievements.length||result.newFactionRanks.length)result.changed=true;
  return result;
}

export function canCraftJourneyRecipe(game,recipeOrId) {
  const id=typeof recipeOrId==='string'?recipeOrId:recipeOrId?.id,definition=JOURNEY_RECIPES.find(r=>r.id===id);
  if(!definition)return RECIPE_IDS.includes(id)?{ok:true,reason:''}:{ok:false,reason:'Unbekanntes Rezept.'};
  const faction=getFactionProgress(game,definition.factionId);
  if(!faction||faction.rank<definition.factionRank)return {ok:false,reason:`Benötigt ${FACTION_RANKS[definition.factionRank]?.name||'höheren Rang'} beim ${faction?.name||definition.factionId}.`};
  if(levelOf(game)<definition.minLevel)return {ok:false,reason:`Benötigt Stufe ${definition.minLevel}.`};
  return {ok:true,reason:''};
}
export function getJourneyUnlocks(game) {
  const state=journeyOf(game),factions=FACTIONS.map(f=>getFactionProgress(game,f.id));
  return {factions,recipeIds:JOURNEY_RECIPES.filter(r=>canCraftJourneyRecipe(game,r).ok).map(r=>r.id),masteryIds:JOURNEY_MASTERIES.filter(m=>levelOf(game)>=m.minLevel&&factionRank(state.reputation[m.factionId])>=m.factionRank).map(m=>m.id),companionIds:[...state.ownedCompanions],readyAchievements:ACHIEVEMENTS.filter(a=>canClaimAchievement(game,a.id).ok).map(a=>a.id)};
}
export function getMasteryRank(game) {
  const mastery=JOURNEY_MASTERIES.find(m=>m.id===journeyOf(game).mastery);if(!mastery)return 0;
  const level=levelOf(game),rank=factionRank(journeyOf(game).reputation[mastery.factionId]);
  if(level<40||rank<2)return 0;
  return level>=100&&rank>=3&&journeyOf(game).records.dungeons.length>=6?3:level>=70&&rank>=3?2:1;
}
export function canChooseJourneyMastery(game,id) {
  const mastery=JOURNEY_MASTERIES.find(m=>m.id===id),state=journeyOf(game);
  if(!mastery)return {ok:false,reason:'Unbekannter Meisterpfad.'};
  if(game?.dead||game?.player?.hp<=0)return {ok:false,reason:'Erwache zuerst am Glutherd.'};
  if(game?.inCombat?.())return {ok:false,reason:'Wähle deinen Eid außerhalb des Kampfes.'};
  if(state.mastery===id)return {ok:false,reason:'Dieser Eid ist bereits gewählt.'};
  if(levelOf(game)<mastery.minLevel||factionRank(state.reputation[mastery.factionId])<mastery.factionRank)return {ok:false,reason:'Benötigt Stufe 40 und den Rang Verbündet beim zugehörigen Bund.'};
  const cost=state.mastery?40+levelOf(game)*2:mastery.talentCost;
  if(!Number.isFinite(game?.player?.[state.mastery?'gold':'skillPoints'])||game.player[state.mastery?'gold':'skillPoints']<cost)return {ok:false,reason:`Benötigt ${cost} ${state.mastery?'Gold für den Eidwechsel':'Talentpunkte'}.`};
  return {ok:true,reason:'',cost,currency:state.mastery?'gold':'skillPoints'};
}
export function chooseJourneyMastery(game,id) {
  const eligibility=canChooseJourneyMastery(game,id);if(!eligibility.ok)return false;
  game.player[eligibility.currency]-=eligibility.cost;game.journey.mastery=id;return true;
}
/** Only mastery modifiers; companion modifiers are a separate, explicit source. */
export function getJourneyModifiers(game) {
  const mastery=JOURNEY_MASTERIES.find(m=>m.id===journeyOf(game).mastery),rank=getMasteryRank(game);
  return mastery?Object.fromEntries(Object.entries(mastery.effects).map(([key,value])=>[key,Math.round(value*rank*10000)/10000])):{};
}
export function canSelectCompanion(game,id) {
  const state=journeyOf(game);
  if(game?.dead||game?.player?.hp<=0)return {ok:false,reason:'Erwache zuerst am Glutherd.'};
  if(game?.inCombat?.())return {ok:false,reason:'Wechsle Reisegefährten außerhalb des Kampfes.'};
  if(id===null)return {ok:true,reason:''};
  const companion=COMPANIONS.find(c=>c.id===id);
  if(!companion||!state.ownedCompanions.includes(id)||!eligibleCompanion(state,companion,levelOf(game)))return {ok:false,reason:'Dieser Reisegefährte wurde noch nicht gewonnen.'};
  return {ok:true,reason:''};
}
export function selectJourneyCompanion(game,id) {if(!canSelectCompanion(game,id).ok)return false;game.journey??=createJourneyState();game.journey.activeCompanion=id;return true;}
export function getCompanionModifiers(game) {
  const state=journeyOf(game),companion=COMPANIONS.find(c=>c.id===state.activeCompanion);
  return companion&&state.ownedCompanions.includes(companion.id)&&eligibleCompanion(state,companion,levelOf(game))?{...companion.stats}:{};
}
export function getCompanionCombatProfile(game) {
  const state=journeyOf(game),companion=COMPANIONS.find(c=>c.id===state.activeCompanion);
  if(!companion||!state.ownedCompanions.includes(companion.id)||!eligibleCompanion(state,companion,levelOf(game)))return null;
  return {id:companion.id,visualType:companion.id,name:companion.name,color:companion.color,companion:true,...(companion.combat||{stat:'damage',damageMultiplier:0,attackCooldown:3,range:0,ranged:false,maximumDamage:0})};
}
