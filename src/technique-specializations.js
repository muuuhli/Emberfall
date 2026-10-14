/** Earned horizontal choices for the existing Q/F actions. The catalog owns all
 * runtime values; saves and network commands contain canonical IDs only. */
import { CLASSES } from './classes.js';
import { applyTalentAbilityProfile } from './talent-combat.js';

export const TECHNIQUE_SPECIALIZATION_VERSION = 1;
export const TECHNIQUE_SPECIALIZATION_MIN_LEVEL = 70;
export const TECHNIQUE_SPECIALIZATION_SIGIL_COST = 12;
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const variant = (classId, suffix, action, name, description, multiply, set = {}) => ({
  id: `${classId}_${suffix}`, classId, action, name, description,
  minLevel: TECHNIQUE_SPECIALIZATION_MIN_LEVEL, sigilCost: TECHNIQUE_SPECIALIZATION_SIGIL_COST,
  techniqueName: CLASSES.find(cls => cls.id === classId).abilities[action].name,
  color: CLASSES.find(cls => cls.id === classId).color,
  actionLabel: action === 'bolt' ? 'Q' : 'F', multiply, set,
});

export const TECHNIQUE_SPECIALIZATIONS = freeze([
  variant('guardian', 'enduring_wall', 'nova', 'Ausdauernder Wall',
    'Eiserner Wall: 50 % längere Schilddauer, aber 25 % weniger Schild und 15 % längere Abklingzeit. Hält längeren Gefahren stand.',
    { duration: 1.5, shieldMultiplier: .75, cooldown: 1.15 }),
  variant('guardian', 'impact_wall', 'nova', 'Stoßwacht',
    'Eiserner Wall: 20 % stärkeres Schild, aber halbe Schilddauer und 10 % längere Abklingzeit. Plane einen einzelnen schweren Einschlag.',
    { duration: .5, shieldMultiplier: 1.2, cooldown: 1.1 }),
  variant('paladin', 'far_light', 'bolt', 'Weites Licht',
    'Licht der Treue: 65 % größerer Heilradius, aber 30 % weniger Heilung je Gefährte. Erreicht eine verteilte Gruppe.',
    { radius: 1.65, healMultiplier: .7 }),
  variant('paladin', 'close_light', 'bolt', 'Naher Eid',
    'Licht der Treue: 20 % stärkere Heilung, aber 35 % kleinerer Heilradius, 15 % mehr Mana und 20 % längere Abklingzeit.',
    { radius: .65, healMultiplier: 1.2, cost: 1.15, cooldown: 1.2 }),
  variant('ranger', 'linebreaker', 'bolt', 'Reihenbrecher',
    'Durchschlag trifft bis zu fünf Gegner in einer Linie, aber mit 28 % weniger Schaden, 15 % kürzerer Reichweite und 15 % mehr Manakosten.',
    { damageMultiplier: .72, range: .85, cost: 1.15 }, { piercing: 5 }),
  variant('ranger', 'focused_arrow', 'bolt', 'Fokuspfeil',
    'Durchschlag trifft einen Gegner mit 20 % mehr Schaden und 10 % längerer Reichweite. Verliert Durchdringung und braucht 25 % länger zum erneuten Einsatz.',
    { damageMultiplier: 1.2, range: 1.1, cooldown: 1.25 }, { piercing: 1 }),
  variant('nightblade', 'long_shadow', 'bolt', 'Langer Schatten',
    'Schattenstich reicht 25 % weiter, aber trifft mit 30 % kleinerem Radius und 25 % weniger Schaden. Ein weiter Vorstoß braucht eine klare Bahn.',
    { range: 1.25, radius: .7, damageMultiplier: .75 }),
  variant('nightblade', 'close_cut', 'bolt', 'Nahschnitt',
    'Schattenstich trifft mit 25 % größerem Radius und 15 % mehr Schaden, aber seine Strecke ist 35 % kürzer. Du musst näher an deine Ziele.',
    { range: .65, radius: 1.25, damageMultiplier: 1.15 }),
  variant('flamecaller', 'cinder_core', 'bolt', 'Glutkern',
    'Feuerball verursacht 20 % mehr direkten Schaden, aber seine Spritzfläche ist 60 % kleiner. Kostet 10 % mehr Mana und braucht 15 % länger.',
    { damageMultiplier: 1.2, splashRadius: .4, cost: 1.1, cooldown: 1.15 }),
  variant('flamecaller', 'fire_blossom', 'bolt', 'Feuerblüte',
    'Feuerball entfaltet eine 70 % größere Spritzfläche, aber verursacht 28 % weniger Schaden, reicht 10 % kürzer und kostet 10 % mehr Mana.',
    { damageMultiplier: .72, splashRadius: 1.7, range: .9, cost: 1.1 }),
  variant('frostweaver', 'frost_bite', 'bolt', 'Kurzer Frostbiss',
    'Frostlanze verlangsamt 30 % stärker, höchstens um 75 %. Ihre Kälte hält 40 % kürzer und der Treffer verursacht 20 % weniger Schaden.',
    { slow: 1.3, duration: .6, damageMultiplier: .8 }),
  variant('frostweaver', 'creeping_rime', 'bolt', 'Schleichender Reif',
    'Frostlanze verlangsamt 70 % länger, aber 30 % schwächer. Verursacht 5 % weniger Schaden und kostet 10 % mehr Mana.',
    { slow: .7, duration: 1.7, damageMultiplier: .95, cost: 1.1 }),
  variant('druid', 'renewing_circle', 'nova', 'Nachblüte',
    'Kreis des Lebens hält 50 % länger und seine Heilimpulse sind 20 % stärker. Die sofortige Heilung ist dafür 35 % schwächer.',
    { duration: 1.5, regenerationMultiplier: 1.2, healMultiplier: .65 }),
  variant('druid', 'life_pulse', 'nova', 'Lebenspuls',
    'Kreis des Lebens heilt sofort 30 % stärker. Seine Heilimpulse sind dafür halb so stark und der Kreis hält ein Drittel kürzer.',
    { duration: 2 / 3, regenerationMultiplier: .5, healMultiplier: 1.3 }),
  variant('shadowbinder', 'patient_pact', 'nova', 'Geduldiger Pakt',
    'Schattenpakt hält ein Drittel länger. Die Zeit zwischen den Angriffen der zwei Diener und die Pause bis zum erneuten Ruf wachsen ebenfalls um ein Drittel.',
    { duration: 4 / 3, summonAttackCooldown: 4 / 3, cooldown: 4 / 3 }),
  variant('shadowbinder', 'ravenous_pact', 'nova', 'Hungerpakt',
    'Die Zeit zwischen den Angriffen der zwei Diener sinkt um ein Drittel. Sie bestehen dafür nur zehn statt achtzehn Sekunden. Ihr gemeinsames Dienerlimit bleibt bestehen.',
    { duration: 10 / 18, summonAttackCooldown: 2 / 3 }),
]);
const catalog = new Map(TECHNIQUE_SPECIALIZATIONS.map(definition => [definition.id, definition]));
const classes = new Map(CLASSES.map(cls => [cls.id, cls]));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const copy = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round(value * 10000) / 10000;
const context = game => ({ classId: game?.player?.classId, level: game?.player?.level });
const stateOf = game => game?.techniqueSpecializations === undefined ? createTechniqueSpecializationState() : game.techniqueSpecializations;

export function createTechniqueSpecializationState() { return { version: TECHNIQUE_SPECIALIZATION_VERSION, learned: [], active: null }; }
export function getTechniqueSpecialization(id) { return catalog.get(id) || null; }

export function validateTechniqueSpecializations(saved, { classId, level } = {}) {
  if (saved === undefined) return true;
  if (!exactKeys(saved, ['version', 'learned', 'active']) || saved.version !== TECHNIQUE_SPECIALIZATION_VERSION || !classes.has(classId)
    || !Number.isInteger(level) || level < 1 || level > 100 || !Array.isArray(saved.learned) || saved.learned.length > 2
    || new Set(saved.learned).size !== saved.learned.length) return false;
  if (!saved.learned.every(id => typeof id === 'string' && catalog.get(id)?.classId === classId && level >= catalog.get(id).minLevel)) return false;
  return saved.active === null || typeof saved.active === 'string' && saved.learned.includes(saved.active);
}
export function restoreTechniqueSpecializations(saved, validationContext = {}) {
  if (!validateTechniqueSpecializations(saved, validationContext)) throw new TypeError('Ungültige Technikprägung.');
  return saved === undefined ? createTechniqueSpecializationState() : copy(saved);
}
export function captureTechniqueSpecializations(game) {
  const saved = stateOf(game);
  if (!validateTechniqueSpecializations(saved, context(game))) throw new TypeError('Ungültige Technikprägung.');
  return copy(saved);
}
/** A switched-off or replaced technique can still have a legitimate running
 * cooldown. Save bounds use every owned canonical variant, never only active. */
export function techniqueCooldownCeiling(saved, classId, action) {
  if (saved === undefined) return 1;
  if (!exactKeys(saved, ['version', 'learned', 'active']) || saved.version !== TECHNIQUE_SPECIALIZATION_VERSION
    || !classes.has(classId) || !Array.isArray(saved.learned) || saved.learned.length > 2
    || new Set(saved.learned).size !== saved.learned.length || !saved.learned.every(id => catalog.get(id)?.classId === classId)
    || saved.active !== null && !saved.learned.includes(saved.active)) return 1;
  return Math.max(1, ...saved.learned.map(id => catalog.get(id)).filter(definition => definition.action === action)
    .map(definition => definition.multiply.cooldown || 1));
}

function choiceLocation(game) {
  if (!classes.has(game?.player?.classId)) return { ok: false, reason: 'Wähle zuerst eine Klasse.' };
  if (game.dead || !(game.player.hp > 0)) return { ok: false, reason: 'Erwache zuerst am Glutherd.' };
  if (game.worldMode === 'pvp' || game.world?.isPvp) return { ok: false, reason: 'Technikprägungen ruhen im Duell.' };
  if (game.dungeonInstance || typeof game.inSettlement !== 'function' || !game.inSettlement()) return { ok: false, reason: 'Präge deine Technik in einer Siedlung.' };
  if (typeof game.inCombat !== 'function' || game.inCombat()) return { ok: false, reason: 'Beende zuerst den Kampf.' };
  if (!validateTechniqueSpecializations(stateOf(game), context(game))) return { ok: false, reason: 'Deine Technikprägung ist ungültig.' };
  return { ok: true, reason: '' };
}
export function canLearnTechniqueSpecialization(game, id) {
  const definition = catalog.get(id);
  if (!definition) return { ok: false, reason: 'Unbekannte Technikprägung.' };
  if (game?.player?.classId !== definition.classId) return { ok: false, reason: 'Diese Technik gehört zu einer anderen Klasse.' };
  const location = choiceLocation(game); if (!location.ok) return location;
  if (game.player.level < definition.minLevel) return { ok: false, reason: `Diese Technik beginnt ab Stufe ${definition.minLevel}.` };
  if (stateOf(game).learned.includes(id)) return { ok: false, reason: 'Technik bereits erlernt.' };
  const sigils = game.resources?.raidSigil;
  if (!Number.isInteger(sigils) || sigils < definition.sigilCost || sigils > 1e7) return { ok: false, reason: `Du benötigst ${definition.sigilCost} Quellensiegel aus gemeisterten Gruppenbegegnungen.` };
  return { ok: true, reason: '' };
}
/** Mutates only this character and its existing resource balance. Game owns
 * notices, autosave and change events; buying never resets an action cooldown. */
export function learnTechniqueSpecialization(game, id) {
  if (!canLearnTechniqueSpecialization(game, id).ok) return false;
  const state = stateOf(game), definition = catalog.get(id);
  game.resources.raidSigil -= definition.sigilCost;
  game.techniqueSpecializations = { ...state, learned: [...state.learned, id] };
  return true;
}
export function canSelectTechniqueSpecialization(game, id) {
  if (id !== null && !catalog.has(id)) return { ok: false, reason: 'Unbekannte Technikprägung.' };
  const location = choiceLocation(game); if (!location.ok) return location;
  const state = stateOf(game);
  if (id !== null && !state.learned.includes(id)) return { ok: false, reason: 'Erlerne diese Technik zuerst mit Quellensiegeln.' };
  if (state.active === id) return { ok: false, reason: id === null ? 'Keine Technik geprägt.' : 'Diese Technik ist bereits geprägt.' };
  return { ok: true, reason: '' };
}
export function selectTechniqueSpecialization(game, id) {
  if (!canSelectTechniqueSpecialization(game, id).ok) return false;
  game.techniqueSpecializations = { ...stateOf(game), learned: [...stateOf(game).learned], active: id };
  return true;
}

const profileBounds = {
  radius: [1, 1200], range: [1, 1200], splashRadius: [0, 1200], slow: [0, .75],
  duration: [.1, 60], cost: [0, 120], cooldown: [.08, 90], damageMultiplier: [0, 10],
  shieldMultiplier: [0, 1.2], healMultiplier: [0, 10], regenerationMultiplier: [0, 2],
  summonAttackCooldown: [.1, 10],
};
/** Preview is independent of ownership, but never independent of the canonical
 * class/action/kind. It cannot turn an imported profile into another skill. */
export function previewTechniqueSpecialization(profile, id, { classId, action } = {}) {
  if (!record(profile)) return profile;
  const result = { ...profile }, definition = catalog.get(id), cls = classes.get(classId);
  if (!definition || definition.classId !== classId || definition.action !== action || cls?.abilities?.[action]?.kind !== profile.kind) return result;
  for (const [field, multiplier] of Object.entries(definition.multiply)) {
    if (!Number.isFinite(profile[field])) continue;
    const bounds = profileBounds[field];
    result[field] = round(Math.max(bounds[0], Math.min(bounds[1], profile[field] * multiplier)));
  }
  for (const [field, value] of Object.entries(definition.set)) result[field] = value;
  result.specializationId = definition.id;
  result.specializationName = definition.name;
  return result;
}
export function applyTechniqueSpecialization(profile, game, { action } = {}) {
  if (!record(profile)) return profile;
  const saved = stateOf(game), validationContext = context(game);
  if (game?.worldMode === 'pvp' || game?.world?.isPvp || !validateTechniqueSpecializations(saved, validationContext) || saved.active === null) return { ...profile };
  return previewTechniqueSpecialization(profile, saved.active, { ...validationContext, action });
}
export function techniqueSpecializationSummary(game) {
  const classId = game?.player?.classId, cls = classes.get(classId), saved = stateOf(game);
  const valid = validateTechniqueSpecializations(saved, context(game));
  return {
    sigils: Number.isInteger(game?.resources?.raidSigil) ? game.resources.raidSigil : 0,
    minLevel: TECHNIQUE_SPECIALIZATION_MIN_LEVEL, active: valid ? saved.active : null,
    offers: TECHNIQUE_SPECIALIZATIONS.filter(definition => definition.classId === classId).map(definition => {
      const baseProfile = applyTalentAbilityProfile(cls.abilities[definition.action], game.combatTalentModifiers?.() || {}, { action: definition.action });
      return { ...copy(definition), learned: valid && saved.learned.includes(definition.id), active: valid && saved.active === definition.id,
        learning: canLearnTechniqueSpecialization(game, definition.id), selection: canSelectTechniqueSpecialization(game, definition.id),
        baseProfile, modifiedProfile: previewTechniqueSpecialization(baseProfile, definition.id, { classId, action: definition.action }) };
    }),
  };
}
