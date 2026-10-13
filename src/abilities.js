/** Additional active abilities are learned with talent points, then slotted.
 * Base class actions Q / F are independent and stay available from level one.
 * Data contains costs and effects; Game resolves them on the authority only.
 */
import { classPowerMultiplier } from './balance.js';

const coreBranches={guardian:{cone:'Vergeltung',taunt:'Wächter',shield:'Bastion'},paladin:{mend:'Licht',sanctum:'Licht',partyShield:'Schutz'},ranger:{fan:'Jagd',trap:'Wildnis',summon:'Bestien'},nightblade:{cone:'Assassine',escape:'Schatten',execute:'Assassine'},flamecaller:{projectile:'Feuer',meteor:'Feuer',summon:'Äther'},frostweaver:{fan:'Winter',shield:'Eiswall',storm:'Winter'},druid:{cone:'Wildnis',partyShield:'Blüte',revive:'Blüte'},shadowbinder:{curse:'Seele',summon:'Pakt',bargain:'Seele'}};
const active=(classId,suffix,name,description,level,kind,options={})=>{
  const ability={
  id:`${classId}_${suffix}`,classId,name,description,level,minLevel:level,
  talentCost:level===4?1:level===12?2:3,cost:18,cooldown:8,icon:'✦',
  requires:null,branch:coreBranches[classId]?.[kind]||'',kind,stat:'spellDamage',damageMultiplier:0,color:'#c7b4df',
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

const CORE_ABILITIES=Object.freeze([
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

// Alternative techniques open between the original milestones. Only two may be
// equipped at once, so gaining a technique expands choices rather than a rotation.
const ADVANCED_ABILITIES=[
  active('guardian','iron_oath','Eid aus Eisen','Fünf Sekunden Schutz aus {shield} % deines maximalen Lebens. Ein günstiger Schutz für gefährliche Einzelangriffe.',8,'shield',{requires:'guardian_bulwark',branch:'Bastion',cost:18,cooldown:14,shieldFraction:.15,duration:5,icon:'⬡',color:'#a8aaa6'}),
  active('guardian','cleave','Grabhieb','Ein breiter Hieb trifft Gegner vor dir mit {damage} % Angriffsschaden. Die lange Reichweite hält einen Weg offen.',18,'cone',{requires:'guardian_bulwark',branch:'Vergeltung',cost:24,cooldown:10,range:145,arc:2.8,stat:'damage',damageMultiplier:1.5,knockback:14,icon:'⚔',color:'#b8a68c'}),
  active('guardian','black_standard','Schwarzes Banner','Ruft Gegner in weitem Umkreis sieben Sekunden zu dir und verleiht {shield} % Lebensschild. Kein Ansturm: du bestimmst die Stellung.',35,'taunt',{requires:'guardian_challenge',branch:'Wächter',cost:34,cooldown:26,radius:360,duration:7,shieldFraction:.16,icon:'⚑',color:'#afaa83'}),
  active('guardian','iron_rain','Eiserner Fall','Nach 0,9 Sekunden schlagen Ketten am Ziel ein: {damage} % Angriffsschaden im Umkreis, dazu Rückstoß.',50,'meteor',{requires:'guardian_cleave',branch:'Vergeltung',cost:40,cooldown:20,range:250,radius:150,windup:.9,stat:'damage',damageMultiplier:2.3,knockback:24,icon:'⚔',color:'#afa394'}),
  active('guardian','last_watch','Letzte Wacht','Schützt nahe Gefährten acht Sekunden mit {shield} % ihres maximalen Lebens. Die lange Abklingzeit verlangt einen bewussten Einsatz.',70,'partyShield',{requires:'guardian_black_standard',branch:'Bastion',cost:48,cooldown:36,radius:310,duration:8,shieldFraction:.2,icon:'⬡',color:'#e1c3a1'}),

  active('paladin','wrath','Aschenurteil','Ein heiliger Hammer fliegt geradeaus und verursacht {damage} % Angriffsschaden. Ergänzt Heilung um gezielten Fernkampf.',8,'projectile',{requires:'paladin_mend',branch:'Vergeltung',cost:16,cooldown:7,range:590,speed:430,stat:'damage',damageMultiplier:1.3,icon:'☀',color:'#d7b988'}),
  active('paladin','martyr','Märtyrerwacht','Ein persönlicher Schild aus {shield} % maximalem Leben schützt sechs Sekunden, während du bei deinen Gefährten bleibst.',18,'shield',{requires:'paladin_mend',branch:'Schutz',cost:22,cooldown:18,shieldFraction:.2,duration:6,icon:'⬡',color:'#d8ccb1'}),
  active('paladin','requiem','Requiem des Lichts','Sieben Sekunden geweihtes Gelände: jede Sekunde {damage} % Zauberkraft gegen Gegner und Heilung für nahe Gefährten.',35,'sanctum',{requires:'paladin_consecration',branch:'Licht',cost:38,cooldown:24,radius:175,duration:7,damageMultiplier:.25,healMultiplier:.18,icon:'☀',color:'#d9bd8a'}),
  active('paladin','judgment','Richtersichel','Ein enger Hieb trifft vor dir mit {damage} % Angriffsschaden und verlangsamt Gegner zwei Sekunden um 35 %.',50,'cone',{requires:'paladin_wrath',branch:'Vergeltung',cost:34,cooldown:16,range:180,arc:1.6,stat:'damage',damageMultiplier:2.2,slow:.35,duration:2,knockback:12,icon:'⚔',color:'#d7bf88'}),
  active('paladin','absolution','Absolution','Heilt den am stärksten verletzten Gefährten in 420 Schritten. Große Einzelheilung aus Zauberkraft und maximalem Leben; 32 Sekunden Abklingzeit.',70,'mend',{requires:'paladin_aegis',branch:'Licht',cost:48,cooldown:32,radius:420,healMultiplier:3,healFraction:.1,icon:'✚',color:'#ead8ae'}),

  active('ranger','barbed','Widerhaken','Ein Pfeil durchdringt zwei Gegner mit je {damage} % Angriffsschaden und bremst sie drei Sekunden um 30 %.',8,'projectile',{requires:'ranger_volley',branch:'Jagd',cost:18,cooldown:7,range:720,speed:600,stat:'damage',damageMultiplier:1.05,piercing:2,slow:.3,duration:3,icon:'➤',color:'#99ad78'}),
  active('ranger','retreat','Wolfsflucht','Zieht dich 150 Schritte zurück und schützt 0,35 Sekunden. Mauern stoppen die Flucht; die Blickrichtung bestimmt den Rückzug.',18,'escape',{requires:'ranger_snare',branch:'Wildnis',cost:20,cooldown:17,range:150,duration:.35,icon:'↝',color:'#acbd93'}),
  active('ranger','hunting_ring','Blutkreis','Eine große Falle am Ziel verursacht {damage} % Angriffsschaden und bremst fünf Sekunden um 55 %. Bleibt zehn Sekunden bereit.',35,'trap',{requires:'ranger_barbed',branch:'Jagd',cost:32,cooldown:17,range:340,radius:125,duration:10,slow:.55,slowDuration:5,stat:'damage',damageMultiplier:1.8,icon:'⌘',color:'#ad8e75'}),
  active('ranger','dusk_flock','Nachtfalken','Zwei Falken greifen 16 Sekunden aus der Entfernung an, jeder mit {damage} % Angriffsschaden. Eine langsamere, verlässliche Jagd.',50,'summon',{requires:'ranger_hawk',branch:'Bestien',cost:40,cooldown:34,duration:16,count:2,ranged:true,range:400,attackCooldown:1.3,stat:'damage',damageMultiplier:.26,icon:'❧',color:'#9ca7a0'}),
  active('ranger','arrowstorm','Pfeilnacht','Sechs Sekunden Pfeilregen vor dir: jede Sekunde {damage} % Angriffsschaden. Bremst Gegner im Zielgebiet um 20 %.',70,'storm',{requires:'ranger_hunting_ring',branch:'Jagd',cost:45,cooldown:28,range:350,radius:160,duration:6,slow:.2,stat:'damage',damageMultiplier:.4,icon:'➤',color:'#c3bea1'}),

  active('nightblade','poison','Witwenmal','Markiert einen Gegner vor dir sechs Sekunden. Jede Sekunde {damage} % Angriffsschaden; Schaden braucht ein lebendes Ziel.',8,'curse',{requires:'nightblade_fan',branch:'Gift',cost:20,cooldown:11,range:280,duration:6,stat:'damage',damageMultiplier:.17,drain:0,icon:'☾',color:'#a4a679'}),
  active('nightblade','throwing','Totendolche','Wirft drei Dolche in engem Fächer. Jeder verursacht {damage} % Angriffsschaden; Abstand ersetzt den Nahkampfhieb.',18,'fan',{requires:'nightblade_fan',branch:'Assassine',cost:20,cooldown:8,count:3,spread:.45,range:470,speed:580,stat:'damage',damageMultiplier:.6,icon:'⚔',color:'#c5b6cd'}),
  active('nightblade','night_ward','Schattenhaut','Vier Sekunden Schutz aus {shield} % maximalem Leben. Hilft beim Rückzug, ohne dich aus der Position zu bewegen.',35,'shield',{requires:'nightblade_smoke',branch:'Schatten',cost:24,cooldown:20,shieldFraction:.17,duration:4,icon:'⬡',color:'#a19ab8'}),
  active('nightblade','dusk_execution','Henkerstunde','Trifft den schwächsten nahen Gegner mit {damage} % Angriffsschaden. Unter 25 % Leben: {execute} % Schaden und {drain} % Heilung aus echtem Schaden.',50,'execute',{requires:'nightblade_execute',branch:'Assassine',cost:38,cooldown:20,range:185,stat:'damage',damageMultiplier:2,executeMultiplier:3.6,threshold:.25,drain:.1,icon:'◆',color:'#d1afc3'}),
  active('nightblade','crescent','Schwarzer Halbmond','Ein weiter Sichelhieb verursacht {damage} % Angriffsschaden und bremst zwei Sekunden um 40 %. Hohe Manakosten belohnen dichte Gruppen.',70,'cone',{requires:'nightblade_throwing',branch:'Schatten',cost:42,cooldown:22,range:160,arc:3.4,stat:'damage',damageMultiplier:2,slow:.4,duration:2,knockback:10,icon:'⚔',color:'#c0aacb'}),

  active('flamecaller','eruption','Glutschrei','Ein kurzer Flammenkegel verursacht {damage} % Zauberkraft. Schafft Raum, wenn Verfolger den Fernkampf unterbrechen.',8,'cone',{requires:'flamecaller_cinder',branch:'Feuer',cost:18,cooldown:7,range:150,arc:2.4,damageMultiplier:1.1,knockback:20,icon:'✦',color:'#d08a66'}),
  active('flamecaller','ashen_escape','Aschenschritt','Zieht dich 120 Schritte zurück und schützt 0,4 Sekunden. Der schnelle Ausweg durchquert keine Mauern.',18,'escape',{requires:'flamecaller_cinder',branch:'Asche',cost:22,cooldown:18,range:120,duration:.4,icon:'↝',color:'#b39482'}),
  active('flamecaller','burning_orbit','Kreis der Verdammten','Fünf Sekunden Flammen am Ziel: jede Sekunde {damage} % Zauberkraft. Gegner müssen in der Fläche bleiben.',35,'storm',{requires:'flamecaller_meteor',branch:'Feuer',cost:32,cooldown:17,range:200,radius:130,duration:5,damageMultiplier:.32,slow:0,icon:'☄',color:'#cf875c'}),
  active('flamecaller','ember_guard','Kohlenhaut','Schützt dich fünf Sekunden mit {shield} % maximalem Leben. Kostet Mana, das währenddessen für Angriffe fehlt.',50,'shield',{requires:'flamecaller_ashen_escape',branch:'Asche',cost:26,cooldown:22,shieldFraction:.18,duration:5,icon:'⬡',color:'#b77758'}),
  active('flamecaller','falling_stars','Sternenasche','Fünf langsame Glutsterne im Fächer verursachen je {damage} % Zauberkraft, treffen bis zu zwei Gegner und hinterlassen drei Sekunden Feuer.',70,'fan',{requires:'flamecaller_burning_orbit',branch:'Feuer',cost:46,cooldown:20,count:5,spread:.6,range:620,speed:370,piercing:2,damageMultiplier:.48,burnMultiplier:.1,duration:3,icon:'☄',color:'#e5a776'}),

  active('frostweaver','ice_spear','Grabeslanze','Ein langer Eisspeer durchdringt zwei Gegner mit je {damage} % Zauberkraft. Verlangsamt sie 2,5 Sekunden um 40 %.',8,'projectile',{requires:'frostweaver_shards',branch:'Winter',cost:20,cooldown:8,range:750,speed:570,piercing:2,damageMultiplier:1.25,slow:.4,duration:2.5,icon:'❄',color:'#b7d3df'}),
  active('frostweaver','winter_step','Reifschritt','Zieht dich 145 Schritte zurück und schützt 0,4 Sekunden. Nutze den gewonnenen Abstand für deine Kontrollflächen.',18,'escape',{requires:'frostweaver_shards',branch:'Reif',cost:20,cooldown:17,range:145,duration:.4,icon:'↝',color:'#a5bfca'}),
  active('frostweaver','frozen_bastion','Gefrorene Bastion','Schützt Gefährten in 280 Schritten sechs Sekunden mit {shield} % ihres maximalen Lebens.',35,'partyShield',{requires:'frostweaver_barrier',branch:'Eiswall',cost:34,cooldown:25,radius:280,duration:6,shieldFraction:.14,icon:'⬡',color:'#b8d2d9'}),
  active('frostweaver','polar_night','Polarnacht','Acht Sekunden Winter am Ziel: jede Sekunde {damage} % Zauberkraft und 65 % Verlangsamung. Teuer, aber lang anhaltend.',50,'storm',{requires:'frostweaver_blizzard',branch:'Winter',cost:42,cooldown:28,range:260,radius:175,duration:8,damageMultiplier:.25,slow:.65,icon:'❄',color:'#819fab'}),
  active('frostweaver','glacier','Gletscherriss','Ein breiter Frostkegel verursacht {damage} % Zauberkraft und verlangsamt Gegner drei Sekunden um 70 %.',70,'cone',{requires:'frostweaver_ice_spear',branch:'Reif',cost:44,cooldown:23,range:190,arc:2.2,damageMultiplier:2.3,slow:.7,duration:3,knockback:12,icon:'❄',color:'#c3dbe1'}),

  active('druid','thorncast','Dornensaat','Vier Dornen fliegen im breiten Fächer. Jeder trifft mit {damage} % Zauberkraft und verlangsamt zwei Sekunden um 20 %.',8,'fan',{requires:'druid_vines',branch:'Wildnis',cost:18,cooldown:8,count:4,spread:.75,range:560,speed:470,damageMultiplier:.45,slow:.2,duration:2,icon:'❧',color:'#9cab81'}),
  active('druid','spring_rain','Regen der Ahnen','Acht Sekunden sanfter Regen heilen Gefährten in 165 Schritten jede Sekunde aus Zauberkraft und maximalem Leben.',18,'regeneration',{requires:'druid_grove',branch:'Blüte',cost:25,cooldown:22,radius:165,duration:8,healMultiplier:.3,healFraction:.006,icon:'✿',color:'#a3bd9c'}),
  active('druid','ancient_guard','Alter Hainwächter','Ein Diener des Hains kämpft 18 Sekunden im Nahkampf mit {damage} % Zauberkraft pro Treffer. Hält sich in deiner Nähe.',35,'summon',{requires:'druid_thorncast',branch:'Wildnis',cost:36,cooldown:32,duration:18,count:1,ranged:false,range:260,attackCooldown:1.4,damageMultiplier:.4,icon:'❧',color:'#9aa284'}),
  active('druid','briar_circle','Dornenmond','Sieben Sekunden Dornen am Ziel verursachen jede Sekunde {damage} % Zauberkraft und verlangsamen Gegner um 70 %.',50,'storm',{requires:'druid_vines',branch:'Mond',cost:38,cooldown:25,range:220,radius:170,duration:7,damageMultiplier:.22,slow:.7,icon:'☾',color:'#8caaa0'}),
  active('druid','moonwell','Brunnen der Nacht','Sieben Sekunden Mondlicht heilen Gefährten in weitem Umkreis und verletzen Gegner jede Sekunde mit {damage} % Zauberkraft.',70,'sanctum',{requires:'druid_spring_rain',branch:'Mond',cost:48,cooldown:35,radius:225,duration:7,damageMultiplier:.18,healMultiplier:.42,icon:'✿',color:'#b7c4b0'}),

  active('shadowbinder','grave_lance','Gruftlanze','Ein Seelenspeer durchdringt zwei Gegner mit je {damage} % Zauberkraft. Verlangsamt zwei Sekunden um 20 %.',8,'projectile',{requires:'shadowbinder_curse',branch:'Grab',cost:18,cooldown:8,range:650,speed:450,piercing:2,damageMultiplier:.95,slow:.2,duration:2,icon:'☾',color:'#b3a3c4'}),
  active('shadowbinder','spectral_step','Geisterschritt','Zieht dich 100 Schritte zurück und schützt 0,5 Sekunden. Diener bleiben auf dem Schlachtfeld, während du Abstand gewinnst.',18,'escape',{requires:'shadowbinder_curse',branch:'Grab',cost:22,cooldown:20,range:100,duration:.5,icon:'↝',color:'#998da9'}),
  active('shadowbinder','ossuary','Beinhaus','Sechs Sekunden Schutz aus {shield} % maximalem Leben. Hält Schaden ab, ohne weiteres Leben zu opfern.',35,'shield',{requires:'shadowbinder_bargain',branch:'Seele',cost:24,cooldown:22,shieldFraction:.18,duration:6,icon:'⬡',color:'#beb3a4'}),
  active('shadowbinder','death_mark','Sterbegeläut','Markiert einen Gegner sieben Sekunden. Jede Sekunde {damage} % Zauberkraft; {drain} % echten Schadens kehren als Leben zurück.',50,'curse',{requires:'shadowbinder_curse',branch:'Seele',cost:34,cooldown:20,range:400,duration:7,damageMultiplier:.32,drain:.22,icon:'☾',color:'#bba1b7'}),
  active('shadowbinder','abyss_eye','Auge des Abgrunds','Ein ferner Geist greift 18 Sekunden aus großer Entfernung mit {damage} % Zauberkraft an. Sein langer Pakt ersetzt häufiges Nachbeschwören.',70,'summon',{requires:'shadowbinder_legion',branch:'Pakt',cost:44,cooldown:36,duration:18,count:1,ranged:true,range:420,attackCooldown:1.3,damageMultiplier:.65,icon:'◈',color:'#a994bd'}),
];

export const ABILITIES=Object.freeze([...CORE_ABILITIES,...ADVANCED_ABILITIES]);

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
