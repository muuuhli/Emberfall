import { bestiaryCombatStats } from './bestiary.js';

// These are optional authored fights, not variants of the eighty species.
// Each phase selects a fixed sequence. The controller freezes one action at a
// time, so a health threshold can never rewrite an already visible warning.
const freeze = value => {
  if(value&&typeof value==='object') {for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};
const action=(id,name,kind,windup,recovery=1.25,extra={})=>({id,name,kind,windup,recovery,...extra});

export const ENCOUNTER_PROFILES=freeze({
  sivra_whitehorn:{thresholds:[.55],engageRange:620,actions:{
    cradle:action('cradle','Eiswiege','cradle',1.8,1.25,{damageRatio:.9}),
    shards:action('shards','Splitterspur','shards',1.5,1.3,{damageRatio:.9}),
  },sequences:[['cradle','shards'],['cradle','shards']]},
  irdan_reaper:{thresholds:[.6],engageRange:620,actions:{
    scythe:action('scythe','Sichelbahn','scythe',1.35),
    counter:action('counter','Gegenschnitt','counter',1.35,1.35,{damageRatio:.85}),
    furrows:action('furrows','Hungrige Furchen','furrows',1.8,1.35),
  },sequences:[['scythe','furrows'],['scythe','counter','furrows']]},
  orsa_tidewarden:{thresholds:[.55],engageRange:620,actions:{
    rush:action('rush','Ankerkette','rush',1.4,1.2),
    return:action('return','Rücklauf der Kette','return',1.4,1.4,{damageRatio:.85}),
    surf:action('surf','Brandung','surf',1.8,1.45,{damageRatio:.9}),
  },sequences:[['rush','surf'],['rush','return','surf']]},
  vey_clockslayer:{thresholds:[.6],engageRange:620,actions:{
    memories:action('memories','Nachbildurteil','memories',1.7,1.45,{damageRatio:.9}),
    pendulum:action('pendulum','Erster Pendelschlag','pendulum',1.4,1.15),
    cross:action('cross','Gekreuztes Pendel','cross',1.4,1.35,{damageRatio:.9}),
    third:action('third','Die fehlende Stunde','third',1.4,1.35,{damageRatio:.85}),
  },sequences:[['memories','pendulum','cross'],['memories','pendulum','cross','third']]},
  nera_nameless:{thresholds:[.5],engageRange:620,actions:{
    light:action('light','Blindes Licht','light',1.7,1.4),
    mirrors:action('mirrors','Zehrende Spiegel','mirrors',1.5,1.5,{damageRatio:1.1}),
  },sequences:[['light','mirrors'],['light','mirrors']]},
  asterion_scarwarden:{thresholds:[.7,.35],engageRange:620,actions:{
    scissors:action('scissors','Quellenschere','scissors',1.45,1.3),
    scars:action('scars','Narbenurteil','scars',1.9,1.4,{damageRatio:1.05}),
  },sequences:[['scissors','scars'],['scars','scissors'],['scissors','scars','scissors']]},
});

const bosses=[
  {id:'sivra_whitehorn',name:'Sivra, Weißhorn-Mutter',level:4,region:'frostgrat',family:'beast',archetype:'matriarch',silhouette:'stag',size:1.6,speed:74,hpScale:4.5,damageScale:.85,color:'#b5c4c7',traits:['frost'],
    counterplay:'Eiswiege: innen oder außerhalb des Rings stehen. Splitterspur: die markierte letzte Position verlassen; unter 55 % entstehen zwei Markierungen.'},
  {id:'irdan_reaper',name:'Irdan, Ährenbrecher',level:12,region:'sonnensteppe',family:'undead',archetype:'reaper',silhouette:'lancer',size:1.5,speed:84,hpScale:3.2,damageScale:1.15,color:'#b59d74',traits:['bleeding'],
    counterplay:'Sichelbahn: hinter den gelockten Kegel treten. Furchen: zwischen den drei Bahnen bleiben. Unter 60 % wird ein eigener Gegenschnitt angekündigt.'},
  {id:'orsa_tidewarden',name:'Orsa, Gezeitenwacht',level:28,region:'sturmkueste',family:'abomination',archetype:'tidewarden',silhouette:'diver',size:1.65,speed:78,hpScale:2,damageScale:1.15,color:'#8daeb3',traits:['armored'],
    counterplay:'Ankerkette: seitlich ausweichen oder Deckung nutzen. Brandung: den wandernden Ring durchqueren. Unter 55 % wird der Rückansturm neu angekündigt.'},
  {id:'vey_clockslayer',name:'Vey, Uhrenschlächter',level:52,region:'mondbruch',family:'construct',archetype:'chronomancer',silhouette:'automaton',size:1.6,speed:82,hpScale:2.4,damageScale:1.05,color:'#b2a5c3',traits:['arcane'],
    counterplay:'Nachbildurteil: drei gespeicherte Wegpunkte verlassen. Pendelschläge: die jeweils neu markierte Schneise meiden. Unter 60 % folgt eine dritte Schneise.'},
  {id:'nera_nameless',name:'Nera, Schlaf ohne Namen',level:76,region:'traumsenke',family:'spectral',archetype:'dreamweaver',silhouette:'seer',size:1.65,speed:84,hpScale:2.55,damageScale:1.08,color:'#aa95be',traits:['arcane'],
    counterplay:'Blindes Licht: den hellen sicheren Ringsektor oder den Außenrand nutzen. Zehrende Spiegel: die drei angekündigten Projektilbahnen umgehen. Unter 50 % wird der sichere Sektor schmaler.'},
  {id:'asterion_scarwarden',name:'Asterion, Hüter der letzten Narbe',level:100,region:'nexusriss',family:'demon',archetype:'scarwarden',silhouette:'beholder',size:1.9,speed:90,hpScale:2.8,damageScale:1.12,color:'#c099b2',traits:['arcane'],
    counterplay:'Quellenschere: durch die offene Bahn zwischen den Kegeln entkommen. Narbenurteil: das blaue Feld bleibt sicher, die beiden roten Felder explodieren. Bei 70 und 35 % ändert sich die angekündigte Reihenfolge.'},
];

export const NAMED_BOSS_ENEMIES=freeze(Object.fromEntries(bosses.map(boss=>{
  const def={...boss,boss:true,species:false,speciesId:boss.id,variant:boss.id,regions:[boss.region],encounterProfile:boss.id,
    range:180,dropTable:boss.level>=76?'endgame':'adventure',description:`Eine eigenständige, freiwillig gerufene Bossbegegnung. ${boss.counterplay}`,
    combat:{pattern:'encounter',windup:1.5,recovery:1.25,preferredRange:130,aggroRange:420,leashRange:600}};
  return [boss.id,{...def,...bestiaryCombatStats(def,boss.level)}];
})));

const huntNames=['Die Wiege unter weißem Horn','Der Schnitter der letzten Ernte','Eine Kette für die Brandung','Die Stunde des Uhrenschlächters','Ein Name für den Schlaf','Der Hüter der letzten Narbe'];
const locations=[[.65,.76],[.27,.55],[.408,.294],[.28,.64],[.72,.49],[.81,.53]];
const huntIds=['event-sivra','event-irdan','event-orsa','event-vey','event-nera','event-asterion'];
export const NAMED_BOSS_HUNTS=freeze(bosses.map((boss,index)=>({
  id:huntIds[index],name:huntNames[index],region:boss.region,level:boss.level,minLevel:boss.level,at:locations[index],
  mode:'boss_hunt',contentType:'boss',boss:boss.id,tracks:2,partyRequired:1,repeatable:true,
  description:`Binde die beiden Spuren, um ${boss.name} freiwillig zu rufen. ${boss.counterplay}`,
  hint:boss.counterplay,counterplay:boss.counterplay,
  rewardPreview:{xp:70+boss.level**2*3,gold:18+boss.level*5,dust:Math.max(1,Math.round(2+boss.level/12)),lootLevel:boss.level,lootTier:1},
})));
