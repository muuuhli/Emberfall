import { getClass } from './classes.js';
import { MAX_LEVEL, xpToNext } from './progression.js';

/** Pure PvE balance rules. Analytical estimates below are not human playtests. */
export const BALANCE_VERSION = 2;
export const BALANCE_LEVELS = [1, 10, 25, 50, 75, 100];
export const COMBAT_CAPS = Object.freeze({crit:.45,lifeSteal:.08,cooldown:.45,dodgeCooldown:.6,speed:300});
/** Shared-owner passive leech and per-source damage grace. Direct class heals stay separate. */
export const COMBAT_SUSTAIN = Object.freeze({
  leechMaxHpPerSecond:.02,leechBurstSeconds:1,earlyGrace:.24,lateGrace:.16,
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const levelOf = value => clamp(Math.floor(finite(value,1)),1,MAX_LEVEL);
const round = value => Math.round(value * 10000) / 10000;

export function basePlayerStats(level = 1) {
  const current = levelOf(level);
  return {maxHp:100+current*12,mana:80+current*5,damage:12+current*3,
    armor:round(3+(current-1)*.24),crit:.06,speed:175,spellDamage:12+current*4,
    manaRegen:4,cooldown:0,dodgeCooldown:0,gatherYield:0,lifeSteal:0};
}

/** Return this instead of adding the original flat class modifiers a second time. */
export function classStatModifiers(classId = 'guardian', level = 1) {
  const delta = levelOf(level)-1;
  return Object.fromEntries(Object.entries(getClass(classId).statMods).map(([stat,value])=>{
    const factor=stat==='maxHp'?1+delta*.04:stat==='armor'?1+delta*.045:
      ['damage','spellDamage'].includes(stat)?1+delta*.025:1;
    return [stat,round(value*factor)];
  }));
}

export function capCombatStats(stats = {}, {level = 1} = {}) {
  const fallback=basePlayerStats(level),result={};
  for(const stat of Object.keys(fallback))result[stat]=finite(stats[stat],fallback[stat]);
  result.maxHp=clamp(result.maxHp,1,16000);result.mana=clamp(result.mana,0,6000);
  result.damage=clamp(result.damage,1,5000);result.spellDamage=clamp(result.spellDamage,1,6500);
  result.armor=clamp(result.armor,0,600);result.manaRegen=clamp(result.manaRegen,0,100);
  result.gatherYield=clamp(result.gatherYield,0,12);
  result.crit=clamp(result.crit,0,COMBAT_CAPS.crit);result.lifeSteal=clamp(result.lifeSteal,0,COMBAT_CAPS.lifeSteal);
  result.cooldown=clamp(result.cooldown,-.6,COMBAT_CAPS.cooldown);
  result.dodgeCooldown=clamp(result.dodgeCooldown,-.7,COMBAT_CAPS.dodgeCooldown);
  result.speed=clamp(result.speed,120,COMBAT_CAPS.speed);
  return result;
}

/** Armor is a rating against the attacker's level, with diminishing returns. */
export function armorMitigation(armor = 0, attackerLevel = 1) {
  const rating=Math.max(0,finite(armor)),constant=20+1.6*(levelOf(attackerLevel)-1);
  return clamp(rating/(rating+constant),0,.75);
}

export function incomingDamage(amount, {armor = 0,attackerLevel = 1,trueDamage = false} = {}) {
  const raw=Math.max(0,finite(amount));
  if(raw===0)return 0;
  return Math.max(1,Math.round(raw*(trueDamage?1:1-armorMitigation(armor,attackerLevel))));
}

// Single-target melee damage, ranged safety, AoE/control and healing are distinct
// jobs. Apply exactly once when creating an attack/spell/heal/summon/shield.
export const CLASS_POWER = Object.freeze({
  guardian:{attack:.78,spell:.9,heal:1,summon:1,shield:.65},
  paladin:{attack:1.1,spell:1,heal:.55,summon:1,shield:.7},
  ranger:{attack:1.15,spell:1.1,heal:1,summon:1,shield:1},
  nightblade:{attack:1,spell:1,heal:1,summon:1,shield:1},
  flamecaller:{attack:1.4,spell:1.1,heal:1,summon:1,shield:1},
  frostweaver:{attack:1.35,spell:1,heal:1,summon:1,shield:1},
  druid:{attack:1.35,spell:1,heal:.35,summon:1,shield:1},
  shadowbinder:{attack:1.05,spell:.9,heal:.5,summon:.65,shield:1},
});
export function classPowerMultiplier(classId = 'guardian', kind = 'attack') {
  return CLASS_POWER[getClass(classId).id][kind]??1;
}

/** Only apply to ordinary overworld enemies; authored boss/dungeon budgets stay separate. */
export function normalEnemyStats(level = 1, {tier = 1} = {}) {
  const current=levelOf(level),delta=current-1,depth=clamp(Math.floor(finite(tier,1)),1,30);
  const hp=Math.round((38+delta*18+delta*delta*.32)*(1+(depth-1)*.20));
  return {level:current,hp,maxHp:hp,damage:Math.round((7+current*2.2+current*current*.006)*(1+(depth-1)*.075)),
    xp:Math.round(35+current*current*2.3),attackPeriod:1.65};
}

/** Gray farm kills lose XP; quests and dungeon-completion rewards never call this. */
export function enemyXpReward(baseXp, {enemyLevel = 1,playerLevel = 1,boss = false} = {}) {
  const amount=Math.max(0,finite(baseXp)),gap=levelOf(playerLevel)-levelOf(enemyLevel);
  if(gap<=5)return Math.round(amount);
  const factor=gap>=20?0:gap>=15?.1:gap>=10?.25:.6;
  return Math.round(amount*(boss?Math.max(.1,factor):factor));
}

/** Reproducible stationary-target benchmark with explicitly declared assumptions. */
export function estimateCombat({level = 1,classId = 'guardian',stats,enemy,attackUptime = .7} = {}) {
  const current=levelOf(level),cls=getClass(classId);
  const raw=stats||Object.fromEntries(Object.entries(basePlayerStats(current)).map(([k,v])=>[k,v+classStatModifiers(cls.id,current)[k]]));
  const s=capCombatStats(raw,{level:current}),target={...normalEnemyStats(current),...enemy};
  const uptime=clamp(finite(attackUptime,.7),.05,1),critMean=1+s.crit*.7,comboMean=3.55/3;
  const attack=cls.abilities.attack;
  const basicDps=(s[attack.stat||'damage']||s.damage)*attack.damageMultiplier/attack.cooldown*
    classPowerMultiplier(cls.id,'attack')*comboMean*critMean;
  const actives=[cls.abilities.bolt,cls.abilities.nova].filter(Boolean);
  const manaDemand=actives.reduce((sum,p)=>sum+(p.cost||0)/(p.cooldown*(1-s.cooldown)),0);
  const manaDuty=manaDemand?clamp(s.manaRegen/manaDemand,0,1):1;
  let abilityDps=0,summonDps=0,healingPerSecond=0,shieldPerSecond=0;
  for(const ability of actives){
    const cooldown=ability.cooldown*(1-s.cooldown),power=s[ability.stat||'spellDamage']||s.spellDamage;
    if(ability.kind==='summon')summonDps+=power*(ability.damageMultiplier||0)*(ability.summonCount||1)*
      (ability.duration||cooldown)/cooldown/(ability.summonAttackCooldown||1)*classPowerMultiplier(cls.id,'summon')*critMean*manaDuty;
    else abilityDps+=power*((ability.damageMultiplier||0)+(ability.burnDamageMultiplier||0)*(ability.duration||0))/
      cooldown*classPowerMultiplier(cls.id,'spell')*critMean*manaDuty;
    if(ability.healMultiplier&&ability.kind!=='drain')healingPerSecond+=s.spellDamage*(ability.healMultiplier+
      (ability.regenerationMultiplier||0)*(ability.duration||0))/cooldown*classPowerMultiplier(cls.id,'heal')*manaDuty;
    if(ability.shieldMultiplier)shieldPerSecond+=s.maxHp*ability.shieldMultiplier/cooldown*
      classPowerMultiplier(cls.id,'shield')*manaDuty;
  }
  const dps=(basicDps+abilityDps)*uptime+summonDps*.8;
  const hitDamage=incomingDamage(target.damage,{armor:s.armor,attackerLevel:target.level});
  const incomingDps=hitDamage/(target.attackPeriod||1.65);
  return {level:current,classId:cls.id,stats:s,enemy:target,attackUptime:uptime,manaDuty:round(manaDuty),
    basicDps:round(basicDps),abilityDps:round(abilityDps),summonDps:round(summonDps),dps:round(dps),
    healingPerSecond:round(healingPerSecond),shieldPerSecond:round(shieldPerSecond),
    mitigation:round(armorMitigation(s.armor,target.level)),hitDamage,
    ttk:round(target.hp/Math.max(1,dps)),ttd:round(s.maxHp/Math.max(.01,incomingDps)),
    threeEnemyTtd:round(s.maxHp/Math.max(.01,incomingDps*3)),
    killsPerLevel:current===MAX_LEVEL?0:Math.ceil(xpToNext(current)/Math.max(1,enemyXpReward(target.xp,{enemyLevel:target.level,playerLevel:current})))};
}
