import { EQUIPMENT_SLOT_IDS, equipmentSlot } from './equipment-system.js';
import { getAbility } from './abilities.js';
import { CLASSES } from './classes.js';

export const STASH_CAPACITY=120;
export const LOADOUT_CAPACITY=3;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const owned=(game,id)=>(game.inventory[id]||0)+(game.stash?.[id]||0)>0;

export function isItemProtected(game,id) {
  return !!(game.itemFlags?.[id]?.favorite||game.itemFlags?.[id]?.locked);
}

export function toggleItemFlag(game,id,flag) {
  if(!['favorite','locked'].includes(flag)||!game.item(id)||!owned(game,id))return false;
  const state=game.itemFlags[id]||={favorite:false,locked:false};state[flag]=!state[flag];
  game.change();game.save(false);return true;
}

export function transferStashItem(game,id,toStash) {
  if(!game.inSettlement()||game.inCombat()||game.dead||!game.item(id))return false;
  const source=toStash?game.inventory:game.stash,target=toStash?game.stash:game.inventory;
  if(!(source[id]>0)||toStash&&Object.values(game.equipment).includes(id))return false;
  if(toStash&&!target[id]&&Object.values(game.stash).filter(n=>n>0).length>=STASH_CAPACITY)return false;
  if(!toStash&&game.generatedItems[id]&&!game.inventory[id]&&game.bagUsed()>=240)return false;
  source[id]--;target[id]=(target[id]||0)+1;
  if(source[id]===0)delete source[id];
  game.notice(`${game.item(id).name} ${toStash?'eingelagert':'aus dem Lager genommen'}`);
  game.change();game.save(false);return true;
}

export function saveEquipmentLoadout(game,name) {
  if(typeof name!=='string'||game.dead||game.inCombat())return false;
  const label=name.trim().slice(0,32);if(!label)return false;
  const existing=game.loadouts.find(l=>l.name===label&&l.classId===game.player.classId);
  if(!existing&&game.loadouts.length>=LOADOUT_CAPACITY)return false;
  const id=existing?.id||Array.from({length:LOADOUT_CAPACITY},(_,i)=>`loadout-${i+1}`).find(id=>!game.loadouts.some(l=>l.id===id));
  const saved={id,name:label,classId:game.player.classId,equipment:{...game.equipment},abilityLoadout:[...game.abilityLoadout]};
  if(existing)Object.assign(existing,saved);else game.loadouts.push(saved);
  game.notice(`Ausrüstungsvorlage „${label}“ gespeichert`);game.change();game.save(false);return true;
}

export function loadoutProblems(game,loadout) {
  if(!loadout||loadout.classId!==game.player.classId)return ['Die Vorlage gehört zu einer anderen Klasse.'];
  const errors=[];
  for(const [slot,id] of Object.entries(loadout.equipment))if(id) {
    const item=game.item(id);
    if(!item||!(game.inventory[id]>0))errors.push(`${item?.name||id}: nicht im Gepäck`);
    else if(equipmentSlot(item)!==slot||!game.canEquipItem(id))errors.push(`${item.name}: nicht verwendbar`);
  }
  for(const id of loadout.abilityLoadout)if(id) {
    const ability=getAbility(id);
    if(!ability||ability.classId!==game.player.classId||ability.level>game.player.level||!game.learnedAbilities[id])errors.push(`${ability?.name||id}: nicht erlernt`);
  }
  return errors;
}

export function applyEquipmentLoadout(game,id) {
  if(game.dead||game.inCombat())return false;
  const loadout=game.loadouts.find(l=>l.id===id);if(!loadout)return false;
  const problems=loadoutProblems(game,loadout);
  if(problems.length){game.notice(problems[0]);return false;}
  game.equipment=Object.fromEntries(EQUIPMENT_SLOT_IDS.map(slot=>[slot,loadout.equipment[slot]||null]));
  game.abilityLoadout=[...loadout.abilityLoadout];
  const stats=game.stats();game.player.hp=Math.min(game.player.hp,stats.maxHp);game.player.mana=Math.min(game.player.mana,stats.mana);
  game.notice(`Vorlage „${loadout.name}“ angelegt`);game.change();game.save(false);return true;
}

export function validateInventoryExtensions(data) {
  if(data.stash!==undefined&&(!record(data.stash)||Object.keys(data.stash).length>STASH_CAPACITY||Object.values(data.stash).some(n=>!Number.isInteger(n)||n<=0||n>1e7)))return false;
  if(data.itemFlags!==undefined&&(!record(data.itemFlags)||Object.keys(data.itemFlags).length>3000||Object.values(data.itemFlags).some(v=>!record(v)||Object.keys(v).some(k=>!['favorite','locked'].includes(k))||Object.values(v).some(b=>typeof b!=='boolean'))))return false;
  if(data.loadouts!==undefined&&(!Array.isArray(data.loadouts)||data.loadouts.length>LOADOUT_CAPACITY||new Set(data.loadouts.map(l=>l?.id)).size!==data.loadouts.length||data.loadouts.some(l=>
    !record(l)||!/^loadout-[123]$/.test(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>32||!CLASSES.some(c=>c.id===l.classId)||!record(l.equipment)||Object.entries(l.equipment).some(([slot,id])=>!EQUIPMENT_SLOT_IDS.includes(slot)||id!==null&&typeof id!=='string')||!Array.isArray(l.abilityLoadout)||l.abilityLoadout.length!==2||l.abilityLoadout.some(id=>id!==null&&typeof id!=='string')||l.abilityLoadout[0]&&l.abilityLoadout[0]===l.abilityLoadout[1])))return false;
  return true;
}

export function restoreInventoryExtensions(game,data) {
  game.stash={};game.itemFlags={};
  for(const [id,count] of Object.entries(data.stash||{}))if(game.item(id))game.stash[id]=count;
  for(const [id,flags] of Object.entries(data.itemFlags||{}))if(game.item(id)&&owned(game,id))game.itemFlags[id]={favorite:!!flags.favorite,locked:!!flags.locked};
  game.loadouts=(data.loadouts||[]).map(l=>({...l,equipment:{...l.equipment},abilityLoadout:[...l.abilityLoadout]}));
}
