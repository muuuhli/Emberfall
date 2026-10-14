import { BESTIARY_ENEMIES, REGION_ENEMY_POOLS } from './bestiary.js';
import { NAMED_BOSS_ENEMIES, NAMED_BOSS_HUNTS } from './encounter-content.js';

const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

const routes = [
  ['Unter der weißen Wiege', 'Die Winterwacht sucht einen freien Weg zu Sivras Wiege. Räume Frostwölfe und Eiskluftspinnen aus dem Grat und binde danach die beiden Spuren der Weißhorn-Mutter.'],
  ['Die Saat, die niemand erntet', 'In der verlassenen Saat verstecken sich Steppenräuber und Vogelscheuchen. Brich ihre Wacht und rufe Irdan zwischen den Furchen; erst sein gefallener Ernteschwur beendet diese Jagd.'],
  ['Anker unter schwarzem Wasser', 'Gezeitenbrecher und ertrunkene Pikenträger halten die alte Ankerlinie besetzt. Löse ihre Wacht, binde Orsas Spuren und bezwinge die Gezeitenwacht, bevor ihre Kette erneut den Strand teilt.'],
  ['Zeugen der fehlenden Stunde', 'Mondkonstrukte und Mondblutegel sammeln die verlorenen Minuten für Vey. Jage beide Arten und stelle anschließend den Uhrenschlächter am Zeichen seiner fehlenden Stunde.'],
  ['Ein Morgen ohne fremde Träume', 'Risswächter und Albtraumhunde tragen Neras Schlaf über die Senke. Unterbrich ihre Wege und schließe die Begegnung mit dem Schlaf ohne Namen ab, damit der Morgen eigene Stimmen behält.'],
  ['Die Narbe bleibt geschlossen', 'Risshetzer und Abgrundaugen bewachen Asterions letzte Narbe. Bezwinge beide Arten, binde den Hüter an seinen Spuren und schließe seine Begegnung ab; ein einzelner gefallener Diener genügt nicht.'],
];

// Hunting starts with empty counts. All three goals require new activity:
// ordinary regional foes count, while rewardless event actors do not substitute
// for those kills. The boss goal records a completed, participatory encounter.
export const CONTENT_HUNTS = freeze(NAMED_BOSS_HUNTS.map((encounter, index) => {
  const species = REGION_ENEMY_POOLS[encounter.region];
  return {
    id: encounter.id.replace('event-', 'hunt-'),
    name: `Jagdroute · ${routes[index][0]}`,
    description: routes[index][1],
    minLevel: encounter.minLevel,
    maxLevel: Math.min(100, encounter.minLevel + 14),
    region: encounter.region,
    partyRequired: 1,
    objectives: [
      ...species.slice(0, 2).map(target => ({ kind: 'kill', target, count: 3, name: BESTIARY_ENEMIES[target].name, fresh: true })),
      { kind: 'world_event', target: encounter.id, count: 1, name: NAMED_BOSS_ENEMIES[encounter.boss].name, fresh: true },
    ],
    reward: { tokens: 3 + index * 2, dust: 4 + index * 3 },
    waypoint: { kind: 'event', id: encounter.id },
  };
}));

export const CONTENT_HUNT_REWARDS = freeze([
  { id: 'hunt-helmet', name: 'Helm der Spurwacht', description: 'Ein seltener Helm. Seine Beutestufe reicht bis zur höchsten durch abgeschlossene Jagden verdienten Stufe und höchstens bis zu deiner Charakterstufe.', cost: 8, minLevel: 12, slot: 'helmet', rarity: 'rare' },
  { id: 'hunt-gloves', name: 'Handschuhe des Fährtenlesers', description: 'Seltene Handschuhe auf der durch deine abgeschlossenen Jagden verdienten Beutestufe, höchstens auf deiner Charakterstufe.', cost: 7, minLevel: 12, slot: 'gloves', rarity: 'rare' },
  { id: 'hunt-boots', name: 'Stiefel der letzten Spur', description: 'Seltene Stiefel auf der durch deine abgeschlossenen Jagden verdienten Beutestufe, höchstens auf deiner Charakterstufe.', cost: 7, minLevel: 12, slot: 'boots', rarity: 'rare' },
  { id: 'hunt-charm', name: 'Amulett des gebundenen Zeichens', description: 'Ein seltenes Amulett auf der durch deine abgeschlossenen Jagden verdienten Beutestufe, höchstens auf deiner Charakterstufe.', cost: 10, minLevel: 12, slot: 'charm', rarity: 'rare' },
]);
