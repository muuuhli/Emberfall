import { getClass } from './classes.js';
import { ENEMY_TYPES as BASE_ENEMIES } from './content.js';
import { EXPANSION_ENEMIES } from './expansion.js';
import { BESTIARY_ENEMIES } from './bestiary.js';
import { DUNGEONS, DUNGEON_ENEMIES } from './dungeons.js';
import { equipmentSlot } from './equipment-system.js';

const enemies = { ...BASE_ENEMIES, ...EXPANSION_ENEMIES, ...DUNGEON_ENEMIES, ...BESTIARY_ENEMIES };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const finite = value => Number.isFinite(value);

/**
 * Chances are per eligible generated weapon, after the ordinary gear/base roll.
 * They are mutually exclusive, independent of rarity, and do not alter rarity pity.
 * Example: a level-45+ normal enemy with 30% gear and 40% weapon chance has an
 * overall moon-seal chance of .3 * .4 * .0008 = .0096% per defeat.
 * Depth, rarity, crafting and upgrades do not increase these fixed chances.
 */
export const RELIC_DROP_CHANCES = Object.freeze({
  enemy: Object.freeze({ moon_seal: .0008, star_seal: .00015 }),
  boss: Object.freeze({ moon_seal: .008, star_seal: .002 }),
  dungeon_boss: Object.freeze({ moon_seal: .012, star_seal: .003 }),
});

export const RELICS = Object.freeze({
  moon_seal: Object.freeze({
    id: 'moon_seal', name: 'Mondsiegel · Grabmond', prefix: 'Grabmond', minLevel: 20, color: '#82bdda', aura: 'moon', cooldown: 12,
    proc: Object.freeze({ kind: 'slow', factor: .8, bossFactor: .9, duration: 2, bossDuration: 1 }),
    effectText: 'Ein Treffer verlangsamt einen Gegner 2 Sekunden um 20 %. Gegen Bosse: 1 Sekunde um 10 %. Danach 12 Sekunden Siegelpause.',
    description: 'Ein bleicher Mond umkreist die Schneide. Sein kalter Nachhall hemmt einen einzelnen Gegner, ohne den Waffenschaden zu vervielfachen.',
  }),
  star_seal: Object.freeze({
    id: 'star_seal', name: 'Sternensiegel · Sternenasche', prefix: 'Sternenasche', minLevel: 45, color: '#d9bb80', aura: 'star', cooldown: 16,
    proc: Object.freeze({ kind: 'shield', fraction: .035, maxAmount: 85, duration: 3 }),
    effectText: 'Ein Treffer gewährt 3 Sekunden einen Schutz aus 3,5 % deines maximalen Lebens, höchstens 85 Schutz. Danach 16 Sekunden Siegelpause.',
    description: 'Goldene Sternenasche ruht in den Bruchlinien der Waffe. Ein kleiner Schutz flackert nach einem Treffer auf und erlischt rasch.',
  }),
});
export const RELIC_IDS = Object.freeze(Object.keys(RELICS));
export const RELIC_PROC_COOLDOWN_KEY = 'relic';
export const RELIC_UPGRADE_TEXT = 'Aufwertungen und Edelsteine verbessern die normalen Waffenwerte. Die Siegelwirkung bleibt unverändert und teilt ihre Pause über Waffenwechsel hinweg. Im PvP ruht das Siegel.';

function canonicalOrigin(item, context) {
  if (!record(context) || typeof context.kind !== 'string' || !Object.hasOwn(RELIC_DROP_CHANCES, context.kind)
    || typeof context.enemyId !== 'string' || !Object.hasOwn(enemies, context.enemyId)) return null;
  const definition = enemies[context.enemyId];
  if (!definition || item.source !== context.enemyId) return null;
  const level = item.level, tier = item.dungeonTier ?? 1;
  if (!Number.isInteger(level) || level < 1 || level > 100 || !Number.isInteger(tier) || tier < 1 || tier > 30) return null;
  const dungeonId = context.dungeonId ?? null;
  if (context.kind === 'dungeon_boss') {
    const dungeon = DUNGEONS.find(dungeon => dungeon.id === dungeonId);
    if (!dungeon || dungeon.boss !== context.enemyId || !definition.boss) return null;
  } else {
    const authoredTier = Number.isInteger(definition.lootTier) ? definition.lootTier : 1;
    const maxWorldTier = context.kind === 'boss' ? Math.max(1, Math.min(2, authoredTier)) : 1;
    if (dungeonId !== null || tier > maxWorldTier || Boolean(definition.boss) !== (context.kind === 'boss')) return null;
    // Dungeon bosses can never masquerade as overworld bosses for a fresh roll.
    if (Object.hasOwn(DUNGEON_ENEMIES, context.enemyId)) return null;
  }
  return { kind: context.kind, enemyId: context.enemyId, dungeonId, level, tier };
}

function eligibleWeapon(item) {
  return item && typeof item.id === 'string' && /^loot:[a-zA-Z0-9:_-]{1,95}$/.test(item.id)
    && item.balanceVersion === 2 && equipmentSlot(item) === 'weapon'
    && typeof item.classId === 'string' && getClass(item.classId).id === item.classId;
}

/** No implicit origin inference: shop pieces, crafted pieces and caches opt out. */
export function relicDropChances(item, context) {
  if (!eligibleWeapon(item) || !canonicalOrigin(item, context)) return { moon_seal: 0, star_seal: 0 };
  const chance = RELIC_DROP_CHANCES[context.kind];
  return Object.fromEntries(RELIC_IDS.map(id => [id, item.level >= RELICS[id].minLevel ? chance[id] : 0]));
}

/** Only a trusted encounter reward passes this context; the serialized data holds no powers. */
export function rollRelic(item, context, rng = Math.random) {
  const chances = relicDropChances(item, context);
  if (!chances.moon_seal && !chances.star_seal) return null;
  const roll = rng();
  if (!finite(roll) || roll < 0 || roll > 1) throw new TypeError('Relic RNG must return a finite number between 0 and 1.');
  const id = roll < chances.star_seal ? 'star_seal' : roll < chances.star_seal + chances.moon_seal ? 'moon_seal' : null;
  return id ? { version: 1, id, origin: canonicalOrigin(item, context) } : null;
}

/** Strict optional metadata validation, also used before any runtime effect lookup. */
export function validateRelicItem(item) {
  if (!item || item.relic == null) return true;
  const relic = item.relic;
  if (!eligibleWeapon(item) || !exactKeys(relic, ['version', 'id', 'origin']) || relic.version !== 1 || typeof relic.id !== 'string'
    || !Object.hasOwn(RELICS, relic.id) || item.level < RELICS[relic.id].minLevel
    || !exactKeys(relic.origin, ['kind', 'enemyId', 'dungeonId', 'level', 'tier'])) return false;
  const expected = canonicalOrigin(item, relic.origin);
  return !!expected && Object.entries(expected).every(([key, value]) => relic.origin[key] === value);
}

export function getRelic(item) { return item?.relic && validateRelicItem(item) ? RELICS[item.relic.id] : null; }

export function relicPresentation(item) {
  const definition = getRelic(item);
  if (!definition) return null;
  const origin = item.relic.origin, enemy = enemies[origin.enemyId], dungeon = DUNGEONS.find(dungeon => dungeon.id === origin.dungeonId);
  const percent = (RELIC_DROP_CHANCES[origin.kind][definition.id] * 100).toLocaleString('de-DE', { maximumFractionDigits: 3 });
  return {
    id: definition.id, name: definition.name, color: definition.color, aura: definition.aura,
    effectText: definition.effectText,
    originText: `${origin.kind === 'enemy' ? 'Gegnerfund' : 'Bossfund'}: ${enemy.name}${dungeon ? ` · ${dungeon.name} · Tiefe ${origin.tier}` : ''} · Stufe ${origin.level}`,
    chanceText: `${percent} % je geeigneter Waffenfund aus dieser Quelle. Keine Siegel aus Handel, Herstellung oder Vorratskisten.`,
    upgradeText: RELIC_UPGRADE_TEXT,
  };
}

/**
 * The caller owns one shared actor cooldown, never a per-item cooldown. Only
 * confirmed positive PvE damage can proc. The result contains canonical effects;
 * neither sockets, depth nor upgrade levels multiply their magnitude or duration.
 */
export function resolveRelicProc(item, { time = 0, readyAt = 0, maxHp = 0, targetIsBoss = false, damageDealt = 0, mode = 'pve' } = {}) {
  const definition = getRelic(item);
  if (!definition || mode !== 'pve' || !finite(time) || time < 0 || !finite(readyAt) || readyAt < 0
    || readyAt > time || !finite(damageDealt) || damageDealt <= 0) return null;
  const common = { id: definition.id, kind: definition.proc.kind, color: definition.color, aura: definition.aura,
    cooldown: definition.cooldown, readyAt: time + definition.cooldown };
  if (definition.proc.kind === 'slow') return { ...common,
    factor: targetIsBoss ? definition.proc.bossFactor : definition.proc.factor,
    duration: targetIsBoss ? definition.proc.bossDuration : definition.proc.duration };
  if (!finite(maxHp) || maxHp <= 0) return null;
  return { ...common, amount: Math.min(definition.proc.maxAmount, Math.max(1, Math.round(maxHp * definition.proc.fraction))), duration: definition.proc.duration };
}
