/** Additional active abilities are learned with talent points, then slotted.
 * Base class actions Q / F are independent and stay available from level one.
 * Data contains costs and effects; Game resolves them on the authority only.
 */
import { classPowerMultiplier } from './balance.js';

const active=(classId,suffix,name,description,level,kind,options={})=>{
  const ability={
  id:`${classId}_${suffix}`,classId,name,description,level,minLevel:level,
  talentCost:level===4?1:level===12?2:3,cost:18,cooldown:8,icon:'✦',
  requires:null,kind,stat:'spellDamage',damageMultiplier:0,color:'#c7b4df',
  powerKind:kind==='summon'?'summon':['mend','regeneration','revive'].includes(kind)?'heal':options.stat==='damage'?'attack':'spell',...options,
  };
  const percentages={
    damage:ability.damageMultiplier*classPowerMultiplier(classId,ability.powerKind),
    execute:ability.executeMultiplier*classPowerMultiplier(classId,ability.powerKind),
    shield:ability.shieldFraction*classPowerMultiplier(classId,'shield'),
    drain:ability.drain*classPowerMultiplier(classId,'heal'),
  };
  ability.description=description.replace(/\{(damage|execute|shield|drain)\}/g,(_,key)=>(percentages[key]*100).toLocaleString('de-DE',{maximumFractionDigits:2}));
  return Object.freeze(ability);
};

export const ABILITIES=Object.freeze([
  active('guardian','bulwark','Schildstoß','Trifft Gegner vor dir mit {damage} % Angriffsschaden und verlangsamt sie zwei Sekunden um 45 %.',4,'cone',{cost:14,cooldown:8,range:120,arc:1.8,stat:'damage',damageMultiplier:.75,slow:.45,duration:2,knockback:16,icon:'⬡',color:'#a4b6bb'}),
  active('guardian','challenge','Herausforderung','Stürmt 160 Schritte vor und zwingt Gegner am Ziel sechs Sekunden zu dir. Hindernisse stoppen den Ansturm.',12,'taunt',{requires:'guardian_bulwark',cost:24,cooldown:18,chargeRange:160,radius:280,duration:6,shieldFraction:.1,icon:'⚑',color:'#c9b985'}),
  active('guardian','sunder','Schildbrecher','Schwerer Hieb vor dir: {damage} % Angriffsschaden, Rückstoß und zwei Sekunden starke Verlangsamung.',25,'cone',{requires:'guardian_challenge',cost:28,cooldown:10,range:135,arc:1.6,stat:'damage',damageMultiplier:2.2,knockback:28,slow:.65,duration:2,icon:'⚔',color:'#dec79b'}),

  active('paladin','mend','Lichtbeistand','Heilt den am stärksten verwundeten lebenden Gefährten in 350 Schritten. Erreicht auch entfernte Mitstreiter.',4,'mend',{cost:18,cooldown:7,radius:350,healMultiplier:1.4,healFraction:.04,icon:'✚',color:'#f3d698'}),
  active('paladin','consecration','Weihegrund','Fünf Sekunden heiliger Boden: verletzt Gegner und heilt Verbündete jede Sekunde.',12,'sanctum',{requires:'paladin_mend',cost:28,cooldown:16,radius:135,duration:5,damageMultiplier:.22,healMultiplier:.12,icon:'☀',color:'#e7ca87'}),
  active('paladin','aegis','Gemeinsamer Eid','Schützt lebende Gefährten im Umkreis sechs Sekunden mit einem Schild aus {shield} % ihres maximalen Lebens.',25,'partyShield',{requires:'paladin_consecration',cost:36,cooldown:22,radius:260,duration:6,shieldFraction:.12,icon:'⬡',color:'#efd7a1'}),

  active('ranger','volley','Fächerschuss','Fünf Pfeile decken einen breiten Fächer ab. Jeder verursacht {damage} % Angriffsschaden.',4,'fan',{cost:16,cooldown:7,count:5,spread:.7,range:650,speed:620,stat:'damage',damageMultiplier:.45,icon:'➤',color:'#b5cf83'}),
  active('ranger','snare','Jägerfalle','Platziert bis zu 260 Schritte vor dir eine Falle. Der erste Gegner löst Schaden und vier Sekunden starke Verlangsamung aus.',12,'trap',{requires:'ranger_volley',cost:22,cooldown:11,range:260,radius:85,duration:8,slow:.8,slowDuration:4,stat:'damage',damageMultiplier:1.25,icon:'⌘',color:'#97b574'}),
  active('ranger','hawk','Hainfalke','Ein Falke begleitet dich 20 Sekunden und greift aus der Entfernung mit {damage} % Angriffsschaden an.',25,'summon',{requires:'ranger_snare',cost:32,cooldown:30,duration:20,count:1,ranged:true,range:380,attackCooldown:1.15,stat:'damage',damageMultiplier:.45,icon:'❧',color:'#d2d49a'}),

  active('nightblade','fan','Klingenfächer','Kurzer, schneller Rundhieb vor dir: {damage} % Angriffsschaden gegen alle getroffenen Gegner.',4,'cone',{cost:14,cooldown:5,range:115,arc:2,stat:'damage',damageMultiplier:1.25,knockback:8,icon:'⚔',color:'#c3a5d4'}),
  active('nightblade','smoke','Rauchschritt','Weicht 110 Schritte rückwärts aus und macht dich für 0,8 Sekunden unverwundbar. Hindernisse bleiben wirksam.',12,'escape',{requires:'nightblade_fan',cost:20,cooldown:14,range:110,duration:.8,icon:'↝',color:'#a48ab8'}),
  active('nightblade','execute','Letzte Klinge','Trifft den schwächsten nahen Gegner. Unter 35 % Leben steigt der Schaden auf {execute} %; heilt für {drain} % echten Schadens.',25,'execute',{requires:'nightblade_smoke',cost:30,cooldown:12,range:155,stat:'damage',damageMultiplier:1.6,executeMultiplier:3,threshold:.35,drain:.15,icon:'◆',color:'#d4b5e5'}),

  active('flamecaller','cinder','Brandlanze','Durchdringt drei Gegner. Jeder Treffer entzündet vier Sekunden einen kleinen Brandherd.',4,'projectile',{cost:18,cooldown:6,range:680,speed:490,piercing:3,damageMultiplier:.9,burnMultiplier:.15,duration:4,icon:'✦',color:'#e9a267'}),
  active('flamecaller','meteor','Meteorruf','Markiert einen Punkt vor dir. Nach einer Sekunde trifft ein Meteor mit {damage} % Zauberkraft.',12,'meteor',{requires:'flamecaller_cinder',cost:32,cooldown:15,range:300,radius:115,windup:1,damageMultiplier:2.2,knockback:18,icon:'☄',color:'#e8a66a'}),
  active('flamecaller','phoenix','Glutphönix','Ein Phönix greift 14 Sekunden aus der Entfernung an. Seine Funken treffen zusätzlich nahe Gegner.',25,'summon',{requires:'flamecaller_meteor',cost:38,cooldown:28,duration:14,count:1,ranged:true,range:330,attackCooldown:1.1,damageMultiplier:.5,splashRadius:60,icon:'☀',color:'#f0bd7b'}),

  active('frostweaver','shards','Splitterfächer','Drei Frostsplitter verursachen je {damage} % Zauberkraft und verlangsamen zwei Sekunden.',4,'fan',{cost:17,cooldown:6,count:3,spread:.45,range:640,speed:500,damageMultiplier:.55,slow:.35,duration:2,icon:'❄',color:'#b6ddea'}),
  active('frostweaver','barrier','Kristallhaut','Schützt dich sechs Sekunden mit einem Eisschild aus {shield} % deines maximalen Lebens.',12,'shield',{requires:'frostweaver_shards',cost:24,cooldown:15,shieldFraction:.2,duration:6,icon:'⬡',color:'#c4e4ea'}),
  active('frostweaver','blizzard','Wandernder Winter','Beschwört vor dir sechs Sekunden Schneesturm. Jede Sekunde Schaden und Verlangsamung in der sichtbaren Fläche.',25,'storm',{requires:'frostweaver_barrier',cost:36,cooldown:18,range:180,radius:145,duration:6,damageMultiplier:.3,slow:.5,icon:'❄',color:'#a8d4df'}),

  active('druid','vines','Wurzelgriff','Ranken greifen nach Gegnern vor dir, verursachen Schaden und verlangsamen sie drei Sekunden um 85 %.',4,'cone',{cost:16,cooldown:8,range:145,arc:2.4,damageMultiplier:.7,slow:.85,duration:3,icon:'❧',color:'#9ac692'}),
  active('druid','grove','Lebensrinde','Lebende Rinde schützt Gefährten in 240 Schritten acht Sekunden mit einem Schild aus {shield} % ihres maximalen Lebens.',12,'partyShield',{requires:'druid_vines',cost:30,cooldown:22,radius:240,duration:8,shieldFraction:.1,icon:'❧',color:'#b5d6a0'}),
  active('druid','rebirth','Neuer Frühling','Erweckt einen gefallenen Gefährten in 220 Schritten mit 25 % Leben und zwei Sekunden Schutz. Braucht ein Ziel.',25,'revive',{requires:'druid_grove',cost:40,cooldown:75,radius:220,reviveFraction:.25,duration:2,icon:'✚',color:'#c6dfb0'}),

  active('shadowbinder','curse','Hungriges Mal','Markiert einen nahen Gegner für fünf Sekunden. Jede Sekunde Schaden; {drain} % echten Schadens heilen dich.',4,'curse',{cost:18,cooldown:9,range:300,duration:5,damageMultiplier:.24,drain:.3,icon:'☾',color:'#bc9ccc'}),
  active('shadowbinder','legion','Flüsternde Schar','Beschwört drei kleine Seelen für zwölf Sekunden. Jeder Nahkampftreffer verursacht {damage} % Zauberkraft.',12,'summon',{requires:'shadowbinder_curse',cost:32,cooldown:22,count:3,duration:12,range:310,attackCooldown:.95,damageMultiplier:.28,icon:'◈',color:'#ae91c1'}),
  active('shadowbinder','bargain','Blut und Äther','Opfert 15 % deines aktuellen Lebens für 30 % maximales Mana und einen kleinen Schild. Braucht mehr als 20 % Leben.',25,'bargain',{requires:'shadowbinder_legion',cost:0,cooldown:25,healthCost:.15,minHealth:.2,manaFraction:.3,shieldFraction:.08,duration:5,icon:'✚',color:'#c59aba'}),
]);

export function getAbility(id) {return ABILITIES.find(a=>a.id===id)||null;}
export function getLearnedAbilities(game) {return ABILITIES.filter(a=>a.classId===game.player?.classId&&game.learnedAbilities?.[a.id]===true);}
export function canLearnAbility(game,id) {
  const a=getAbility(id),p=game.player||{};
  if(!a)return {ok:false,reason:'Unbekannte Fähigkeit.'};
  if(a.classId!==p.classId)return {ok:false,reason:'Diese Fähigkeit gehört zu einer anderen Klasse.'};
  if(game.learnedAbilities?.[id]===true)return {ok:false,reason:'Bereits erlernt.'};
  if(game.dead||p.hp<=0)return {ok:false,reason:'Erwache zuerst am Glutherd.'};
  if(p.level<a.level)return {ok:false,reason:`Benötigt Level ${a.level}.`};
  if(a.requires&&game.learnedAbilities?.[a.requires]!==true)return {ok:false,reason:`Erlerne zuerst ${getAbility(a.requires).name}.`};
  if(!Number.isFinite(p.skillPoints)||p.skillPoints<a.talentCost)return {ok:false,reason:`Benötigt ${a.talentCost} Talentpunkte.`};
  return {ok:true,reason:''};
}

/** Validate every field before Game initializes: failed imports are atomic. */
export function validateAbilityState(data) {
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const learned=data.learnedAbilities===undefined?{}:data.learnedAbilities;
  const loadout=data.abilityLoadout===undefined?[null,null]:data.abilityLoadout;
  const cooldowns=data.abilityCooldowns===undefined?{}:data.abilityCooldowns;
  if(!record(learned)||Object.keys(learned).length>ABILITIES.length||!record(cooldowns)||!Array.isArray(loadout)||loadout.length!==2)throw new TypeError('Ungültiger Fähigkeiten-Spielstand.');
  const classId=data.player?.classId||'guardian',level=data.player?.level||1;
  for(const [id,value] of Object.entries(learned)) {
    const a=getAbility(id);
    if(value!==true||!a||a.classId!==classId||level<a.level||a.requires&&learned[a.requires]!==true)throw new TypeError('Ungültige erlernte Fähigkeit.');
  }
  if(loadout.some(id=>id!==null&&(typeof id!=='string'||learned[id]!==true))||loadout[0]!==null&&loadout[0]===loadout[1])throw new TypeError('Ungültige Fähigkeitenbelegung.');
  for(const [id,value] of Object.entries(cooldowns)) {
    const a=getAbility(id);
    if(!a||learned[id]!==true||!Number.isFinite(value)||value<0||value>a.cooldown*1.6+.001)throw new TypeError('Ungültige Fähigkeiten-Abklingzeit.');
  }
  return {learned:{...learned},loadout:[...loadout],cooldowns:{...cooldowns}};
}
