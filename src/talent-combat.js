import { CLASSES } from './classes.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const scopes=new Set(['attack','ability','projectile','aoe','offense','healing','shielding','control','trap','summon','drain','dashstrike','bolt','nova','learned']);
export const TALENT_COMBAT_BOUNDS=Object.freeze({
  range:[-.35,.4],radius:[-.35,.4],arc:[-.5,.35],speed:[-.35,.35],power:[-.3,.2],healPower:[-.35,.25],directHealPower:[-.3,.2],regenPower:[-.3,.2],shieldPower:[-.25,.2],
  duration:[-.35,.4],cost:[-.2,.5],cooldown:[-.2,.6],splashRadius:[-.4,.4],piercing:[0,1],slowDuration:[-.3,.4],slow:[-.2,.08],
  tauntRadius:[-.3,.4],summonCount:[0,1],summonCadence:[-.15,.2],summonRange:[-.3,.3],
});
for(const bounds of Object.values(TALENT_COMBAT_BOUNDS))Object.freeze(bounds);

/** Class-owned ranks only. Raw save values never become runtime multipliers. */
export function getTalentCombatModifiers(skills={},classId='guardian') {
  const definition=CLASSES.find(entry=>entry.id===classId),result={};if(!definition)return result;
  for(const talent of definition.talents){
    const raw=skills?.[talent.id],rank=finite(raw)?clamp(Math.floor(raw),0,talent.maxRank):0;if(!rank)continue;
    for(const effect of talent.combatEffects||[]){
      if(!scopes.has(effect.target)||!Object.hasOwn(TALENT_COMBAT_BOUNDS,effect.stat)||!finite(effect.value))continue;
      const target=result[effect.target]??={};target[effect.stat]=(target[effect.stat]||0)+effect.value*rank;
    }
  }
  for(const target of Object.values(result))for(const [stat,value] of Object.entries(target))target[stat]=clamp(value,...TALENT_COMBAT_BOUNDS[stat]);
  return result;
}
function combined(mods,targets){
  const result={};for(const target of new Set(targets))for(const [stat,value] of Object.entries(mods?.[target]||{}))
    if(Object.hasOwn(TALENT_COMBAT_BOUNDS,stat)&&finite(value))result[stat]=(result[stat]||0)+value;
  for(const [stat,value] of Object.entries(result))result[stat]=clamp(value,...TALENT_COMBAT_BOUNDS[stat]);return result;
}
function applyProfile(profile,effects,{attack=false}={}){
  const result={...profile};
  if(!Object.values(effects).some(value=>value!==0))return result;
  const scale=(stat,fields)=>{const value=effects[stat];if(!value)return;for(const field of fields)if(finite(result[field])&&result[field]>0)result[field]=result[field]*(1+value);};
  scale('range',['range','length','distance','targetRange','chargeRange']);
  scale('radius',['radius','width','impactRange',...(profile.kind==='retaliationWard'?['targetRange']:[])]);
  scale('arc',['arc','spread']);scale('speed',['projectileSpeed','speed']);
  scale('power',['damageMultiplier','executeMultiplier','burnDamageMultiplier','burnMultiplier','comboMultiplier']);
  const periodic=['regeneration','sanctum'].includes(profile.kind),directHealing=clamp((effects.healPower||0)+(effects.directHealPower||0),-.35,.25),periodicHealing=clamp((effects.healPower||0)+(effects.regenPower||0),-.35,.25);
  for(const field of ['healMultiplier','healFraction'])if(finite(result[field])&&result[field]>0)result[field]*=1+(periodic?periodicHealing:directHealing);
  if(finite(result.drain)&&result.drain>0)result.drain*=1+directHealing;
  if(finite(result.regenerationMultiplier)&&result.regenerationMultiplier>0)result.regenerationMultiplier*=1+periodicHealing;
  scale('shieldPower',['shieldMultiplier','shieldFraction']);scale('duration',['duration']);
  // Learned taunts historically share radius with their shield presentation.
  // Preserve that area and give the dedicated taunt bonus its own reach.
  if(profile.kind==='taunt'&&effects.tauntRadius&&!finite(result.tauntRadius)&&finite(result.radius))result.tauntRadius=result.radius;
  scale('cost',['cost']);scale('cooldown',['cooldown']);scale('splashRadius',['splashRadius']);scale('tauntRadius',['tauntRadius']);
  if(effects.slow&&finite(result.slow)&&result.slow>0)result.slow=clamp(result.slow+effects.slow,0,.85);
  if(effects.slowDuration&&result.slow>0){
    // Projectile/cone duration is their on-hit slow. Trap duration is its
    // lifetime, so a separate slowDuration preserves the placement decision.
    const separate=finite(profile.slowDuration)||['trap','storm','aoe','sanctum','retaliationWard','mark'].includes(result.kind),base=finite(result.slowDuration)?result.slowDuration:result.kind==='storm'?1.6:separate?3:result.duration||3;
    result.slowDuration=clamp(base*(1+effects.slowDuration),.1,30);
    if(!separate&&finite(result.duration))result.duration=result.slowDuration;
  }
  if(attack&&effects.piercing&&result.kind==='projectile')result.piercing=clamp(Math.max(1,result.piercing||1)+Math.floor(effects.piercing),1,4);
  if(result.kind==='summon'){
    if(effects.summonCount){const field=finite(result.summonCount)?'summonCount':'count';result[field]=clamp(Math.floor(result[field]||1)+Math.floor(effects.summonCount),1,4);}
    scale('summonCadence',['summonAttackCooldown','attackCooldown']);
    scale('summonRange',['summonRange',...(!finite(result.summonRange)?['range']:[])]);
  }
  // Profile bounds complement the contribution caps without inventing fields.
  for(const field of ['range','length','distance','targetRange','chargeRange','radius','width','impactRange','splashRadius','tauntRadius','summonRange'])if(finite(result[field]))result[field]=clamp(result[field],0,1200);
  for(const field of ['projectileSpeed','speed'])if(finite(result[field]))result[field]=clamp(result[field],0,1200);
  if(finite(result.arc))result.arc=clamp(result.arc,.15,Math.PI*2);
  if(finite(result.duration))result.duration=clamp(result.duration,.1,60);
  if(finite(result.cost))result.cost=clamp(result.cost,0,120);
  if(finite(result.cooldown))result.cooldown=clamp(result.cooldown,.08,90);
  return result;
}
export function applyTalentAttackProfile(profile,mods={}) {return applyProfile(profile,combined(mods,['attack']),{attack:true});}
export function applyTalentAbilityProfile(profile,mods={}, {action}={}) {
  if(!profile)return profile;
  const kind=profile.kind,targets=['ability',kind,action];
  if(kind==='fan')targets.push('projectile');
  if(kind==='stepStrike')targets.push('dashstrike');
  if(profile.drain>0)targets.push('drain');
  if(profile.damageMultiplier>0||profile.burnDamageMultiplier>0||profile.burnMultiplier>0||profile.comboMultiplier>0)targets.push('offense');
  if(profile.healMultiplier>0||profile.healFraction>0||profile.regenerationMultiplier>0||['heal','mend','regeneration','sanctum','revive'].includes(kind))targets.push('healing');
  if(profile.shieldMultiplier>0||profile.shieldFraction>0||['shield','partyShield','retaliationWard'].includes(kind))targets.push('shielding');
  if(profile.slow>0)targets.push('control');
  return applyProfile(profile,combined(mods,targets));
}

const names={range:'Reichweite',radius:'Wirkfläche',arc:'Angriffswinkel',speed:'Geschosstempo',power:'Aktionsschaden',healPower:'Heilstärke',directHealPower:'Direkte Heilung',regenPower:'Regeneration',shieldPower:'Schildstärke',duration:'Dauer',cost:'Manakosten',cooldown:'Abklingzeit',splashRadius:'Spritzfläche',piercing:'Zusätzliche Durchdringungen',slowDuration:'Verlangsamungsdauer',slow:'Verlangsamung',tauntRadius:'Spottreichweite',summonCount:'Zusätzliche Diener',summonCadence:'Zeit zwischen Dienerangriffen',summonRange:'Dienerreichweite'};
const targetNames={attack:'Grundangriffe',ability:'Techniken',projectile:'Zaubergeschosse',aoe:'Flächenzauber',offense:'Offensive Techniken',healing:'Heilung',shielding:'Schilde',control:'Kontrollzauber',trap:'Fallen',summon:'Beschwörungen',drain:'Seelenentzug',dashstrike:'Offensive Schritte'};
export function describeTalentCombatEffects(talent) {
  return (talent?.combatEffects||[]).filter(effect=>names[effect.stat]&&finite(effect.value)).map(effect=>{
    const value=effect.stat==='piercing'||effect.stat==='summonCount'?Math.abs(effect.value):Math.abs(effect.value)*100;
    return `${targetNames[effect.target]||'Techniken'} · ${names[effect.stat]} ${effect.value<0?'−':'+'}${Number(value.toFixed(2)).toLocaleString('de-DE')}${effect.stat==='piercing'||effect.stat==='summonCount'?'':effect.stat==='slow'?' Prozentpunkte':' %'} pro Rang`;
  });
}
