// Reproducible analytical comparisons; this does not measure human playtime.
// node tests/scripts/darkness-balance-audit.mjs
import { CLASSES } from '../../src/classes.js';
import { Game } from '../../src/game.js';
import { ITEM_BASES, generateLoot, computeItemStats } from '../../src/loot.js';
import { ITEMS } from '../../src/catalog.js';
import { equipmentSlot } from '../../src/equipment-system.js';
import { ARSENAL_WEAPONS, ARSENAL_BASES, ARSENAL_CONSUMABLES, EXTRA_RECIPES } from '../../src/arsenal.js';
import { BESTIARY_SPECIES, BESTIARY_ENEMIES, bestiaryCombatStats } from '../../src/bestiary.js';
import { ABILITIES } from '../../src/abilities.js';
import { BALANCE_LEVELS, basePlayerStats, classStatModifiers, estimateCombat } from '../../src/balance.js';

const seeded=initial=>{let state=initial;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};};
const add=(stats,source)=>{for(const [key,value] of Object.entries(source))stats[key]=(stats[key]||0)+value;return stats;};
const world=new Game({storage:null}).world;
const rows=[];
for(const level of BALANCE_LEVELS)for(const cls of CLASSES) {
  const primary=cls.abilities.attack.stat||'damage';
  const stats=add(basePlayerStats(level),classStatModifiers(cls.id,level)),bases=[];
  for(const type of ['weapon','armor','charm']) {
    let pool=ITEM_BASES.filter(base=>equipmentSlot(base)===type&&base.minLevel<=level&&(!base.classIds||base.classIds.includes(cls.id)));
    if(type==='weapon'||type==='charm')pool=pool.filter(base=>base.stats[primary]>0);
    if(type==='armor')pool=pool.filter(base=>base.stats.maxHp&&base.stats.armor);
    pool.sort((a,b)=>b.minLevel-a.minLevel||a.id.localeCompare(b.id));
    const base=pool[0];if(!base)throw new Error(`No usable ${type} at level ${level} for ${cls.id}`);
    const item=generateLoot({level,classId:cls.id,rarity:'rare',baseId:base.id,rng:seeded(991+level),uid:`darkness-audit-${cls.id}-${level}-${type}`});
    add(stats,computeItemStats(item));bases.push(base.id);
  }
  const ordinary=BESTIARY_SPECIES.map(type=>estimateCombat({level,classId:cls.id,stats,enemy:bestiaryCombatStats(type,level)}));
  const bosses=BESTIARY_SPECIES.map(type=>estimateCombat({level,classId:cls.id,stats,enemy:bestiaryCombatStats(`${type}_boss`,level)}));
  const benchmark=estimateCombat({level,classId:cls.id,stats});
  const values=ordinary.flatMap(row=>[row.ttk,row.ttd,row.dps,row.hitDamage]).concat(bosses.flatMap(row=>[row.ttk,row.ttd]));
  if(values.some(value=>!Number.isFinite(value)||value<=0))throw new Error(`Invalid combat estimate for ${cls.id} at level ${level}`);
  rows.push({level,classId:cls.id,bases,dps:benchmark.dps,manaDuty:benchmark.manaDuty,
    normalTtk:[Math.min(...ordinary.map(row=>row.ttk)),Math.max(...ordinary.map(row=>row.ttk))],
    normalTtd:[Math.min(...ordinary.map(row=>row.ttd)),Math.max(...ordinary.map(row=>row.ttd))],
    bossTtk:[Math.min(...bosses.map(row=>row.ttk)),Math.max(...bosses.map(row=>row.ttk))]});
}
const audit={
  kind:'analytical-model-not-human-playtest',
  assumptions:{rarity:'rare',seed:991,slots:3,attackUptime:.7,talents:false,learnedAbilities:false,sockets:false,upgrades:false,enemyAI:false},
  counts:{species:BESTIARY_SPECIES.length,champions:BESTIARY_SPECIES.filter(type=>BESTIARY_ENEMIES[`${type}_boss`]?.boss).length,
    worldEnemies:world.enemies.length,worldEnemyTypes:new Set(world.enemies.map(enemy=>enemy.type)).size,
    interactions:world.interactions.length,interactionKinds:new Set(world.interactions.map(object=>object.kind)).size,
    newWeapons:ARSENAL_WEAPONS.length,newGearBases:ARSENAL_BASES.length,newConsumables:ARSENAL_CONSUMABLES.length,newRecipes:EXTRA_RECIPES.length,
    totalItemDefinitions:Object.keys(ITEMS).length,totalLootBases:ITEM_BASES.length,talents:CLASSES.reduce((sum,cls)=>sum+cls.talents.length,0),learnedAbilities:ABILITIES.length},rows,
};
if(process.argv.includes('--markdown')) {
  const display=value=>value.toLocaleString('de-DE',{maximumFractionDigits:2});
  const range=values=>values.map(display).join('–');
  const table=BALANCE_LEVELS.map(level=>{
    const cohort=rows.filter(row=>row.level===level);
    return `| ${level} | ${range([Math.min(...cohort.map(row=>row.dps)),Math.max(...cohort.map(row=>row.dps))])} | ${range([Math.min(...cohort.map(row=>row.normalTtk[0])),Math.max(...cohort.map(row=>row.normalTtk[1]))])} | ${range([Math.min(...cohort.map(row=>row.bossTtk[0])),Math.max(...cohort.map(row=>row.bossTtk[1]))])} |`;
  }).join('\n');
  console.log(`# Emberfall: Finsternis-Erweiterung und Balanceprüfung

Diese Arbeitsfassung umfasst ${audit.counts.species} eigenständige Gegnerarten mit jeweils einer Bossvariante. Die erzeugte offene Welt enthält ${audit.counts.worldEnemies} Gegner, ${audit.counts.worldEnemyTypes} unterschiedliche Gegner-IDs und ${audit.counts.interactions} Interaktionsobjekte aus ${audit.counts.interactionKinds} Kategorien. Das Arsenal ergänzt ${audit.counts.newWeapons} Waffen, insgesamt ${audit.counts.newGearBases} Ausrüstungsbasen, ${audit.counts.newConsumables} Verbrauchsgegenstände und ${audit.counts.newRecipes} Rezepte. Über die acht Klassen stehen ${audit.counts.talents} Talente und ${audit.counts.learnedAbilities} zusätzlich erlernbare aktive Techniken zur Verfügung; Klassen-Grundaktionen bleiben separat erhalten.

## Reproduzierbares Zahlenmodell

Die folgenden Zeiten sind analytische Schätzungen und keine gemessenen menschlichen Spielzeiten. Für alle acht Klassen werden sechs Stufen verglichen. Jede Figur trägt drei passende Rare-Gegenstände: jeweils die höchste freigeschaltete Basis, bei Gleichstand alphabetisch nach ID. Waffen und Schmuck müssen den tatsächlichen Primärwert der Klasse tragen; Rüstung benötigt Leben und Rüstungsrating. Der feste RNG-Seed ist 991 plus Charakterstufe. Es werden keine Talente, erlernten Zusatztechniken, Sockel, Upgrades oder temporären Weltsegen eingerechnet.

Das vorhandene estimateCombat-Modell verwendet 70 % Angriffszeit, durchschnittliche Kombos und Krits sowie nachhaltige Mana-Regeneration für die beiden Grundzauber. Jede der 80 Arten wird zum Vergleich auf dieselbe Charakterstufe skaliert. Die niedrigsten und höchsten Zeiten über alle Arten und Klassen stehen in der Tabelle. Tatsächliche regionale Gegner behalten ihre regionalen Stufen. Drei Rare-Gegenstände auf Stufe 1 sind ein Vergleichsprofil und keine zugesicherte Startausrüstung.

| Charakterstufe | Grundrotation DPS | Normaler Gegner: Sekunden | Weltbossvariante: Sekunden |
|---:|---:|---:|---:|
${table}

Die Vielfalt entsteht aus unterschiedlichen Lebens- und Schadensbudgets, Angriffstakten, Reichweiten, Positionierung und acht Angriffsmustern. Das Zahlenmodell rechnet bei Gegnern deren angegebenen Windup und Erholung ein. Es bildet Projektilausweichen, Ansturmwege, Deckung, Diener, Schilde, Gegnerheilung und Mehrfachtreffer nicht nach. Daher beschreibt die Tabelle weder eine garantierte Schwierigkeit noch die tatsächliche Bossdauer im Browser. Die bestehenden acht Dungeons und ihre Raidanforderungen besitzen eigene Budgets und gehören nicht zur Weltboss-Spalte.

## Verbindliche Grenzen und echte Interaktionen

Die gemeinsamen Statgrenzen bleiben wirksam: höchstens 45 % Kritchance, 12 % Lebensraub, 45 % Skill-Abklingzeitverkürzung, 60 % Ausweichverkürzung und 300 Bewegungstempo. Rüstung bleibt ein Rating gegen die Stufe des Angreifers, mit höchstens 75 % Schadensreduktion. Gegenstände benutzen den bestehenden validierten Beutevertrag; zusätzliche Basen ändern keine alten gespeicherten Rollen. Niedrigstufige Gegner verlieren ihren EP-Wert gegenüber stark überlevelten Figuren.

Fässer und Urnen geben Ressourcen; Gefangene benötigen einen sicheren Umkreis; Sarkophage und Fluchtruhen verlangen einen echten Kampf. Ketten öffnen nahe Vorräte. Quellen und Lagerfeuer stellen Ressourcen wieder her, wobei Lagerfeuer Holz, fehlende Ressourcen und Ruhe außerhalb des Kampfes verlangen. Bluteid und Nachtäther kosten Kristalle, wirken zeitlich begrenzt und stapeln denselben Segen nicht mehrfach. Ihre kanonischen Werte werden beim Laden rekonstruiert.

Im Mehrspielerbetrieb prüft die Autorität jede Objekt-ID und physische Nähe. Bereits benutzte Objekte können kein zweites Mal belohnen; neu eröffnete Herausforderungen werden nach einem Serverneustart gemeinsam wiederhergestellt. Segen bleiben persönlich. Händlerangebote folgen Klasse und Stufe und verwenden ausschließlich den Serverpreis. Der Browser erhält eine vollständige Fortschrittsübersicht, auch wenn weit entfernte Weltobjekte aus den lokalen Snapshots entfernt werden.

## Automatisierte Prüfung und Grenzen

Die zusätzlichen HTTP-Integrationstests prüfen Händlerpreise und Zugang, zwei Spieler am selben Fass, Raumneustart, persönliche Segen und ihr Ablaufdatum, einen tatsächlichen Bosskill für die Fluchtruhe und die Weiterleitung des Browsers an die Autorität. Der separate Chromium-Smoke prüft Desktop- und Mobilansicht, Spielfläche, Inventar, Talente, Bestiarium und Interaktionsübersicht auf JavaScriptfehler, ungültige Zahlen und horizontales Überlaufen. Er speichert echte Screenshots für die Sichtprüfung.

Diese Prüfungen ersetzen keine längeren menschlichen Solo- und Gruppentests. Besonders Endgame-Kombinationen aus legendärer Ausrüstung, Spezialisierungen, Heilung und mehreren Schadensflächen müssen weiter beobachtet werden. Es wird keine Mindestspielzeit oder Spielzeit von 200 Stunden aus diesen Rechnungen abgeleitet.

## Ausführen

~~~sh
node tests/scripts/darkness-balance-audit.mjs
node tests/scripts/darkness-balance-audit.mjs --markdown
node --test tests/darkness-network.test.js tests/network.test.js
node tests/scripts/darkness-browser-smoke.mjs /tmp/emberfall-darkness-qa
npm test
~~~
`);
} else console.log(JSON.stringify(audit,null,2));
