import { DUNGEONS } from './dungeons.js';
import { REGIONS, ENEMY_TYPES } from './catalog.js';
import { REGION_ENEMY_POOLS } from './bestiary.js';
import { ITEM_BASES, generateLoot } from './loot.js';
import { equipmentSlot } from './equipment-system.js';

export const MAX_ACTIVE_HUNTS = 2;
const regionFor = dungeon => REGIONS.find(r => dungeon.entrance.x >= r.x && dungeon.entrance.x < r.x+r.w && dungeon.entrance.y >= r.y && dungeon.entrance.y < r.y+r.h)?.id || 'sonnensteppe';
const objective = (kind, target, count, changes={}) => ({kind,target,count,name:kind==='dungeon'?DUNGEONS.find(d=>d.id===target)?.name:ENEMY_TYPES[target]?.name||target,...changes});
export const HUNTS = Object.freeze([
  ...DUNGEONS.map((d,index)=>{
    const region=regionFor(d),species=REGION_ENEMY_POOLS[region];
    return {id:`hunt-${d.id}`,name:`Aschenpfad · ${d.name}`,description:'Jage in der Region, bezwinge ihren Schreckensfürsten und kehre aus dem Dungeon zurück.',minLevel:d.minLevel,maxLevel:Math.min(100,d.minLevel+22),region,partyRequired:d.partyRequired,
      objectives:[objective('kill',species[0],3),objective('boss',species[1],1),objective('dungeon',d.id,1,{minTier:index>=3?2:1})],reward:{tokens:4+index*2,dust:6+index*3},waypoint:{kind:'dungeon',id:d.id}};
  }),
  ...[['hunt-moon','mondbruch',52],['hunt-blood','blutmark',84],['hunt-nexus','nexusriss',100]].map(([id,region,level],index)=>{
    const species=REGION_ENEMY_POOLS[region];
    return {id,name:`Schwarze Jagd · ${REGIONS.find(r=>r.id===region).name}`,description:'Zwei verschiedene Schreckensfürsten und zwei Arten der offenen Welt. Allein oder gemeinsam spielbar.',minLevel:level,maxLevel:Math.min(100,level+22),region,partyRequired:1,
      objectives:[objective('kill',species[0],3),objective('kill',species[1],3),objective('boss',species[3],1),objective('boss',species[4],1)],reward:{tokens:8+index*3,dust:14+index*6},waypoint:{kind:'region',id:region}};
  }),
]);
export const HUNT_REWARDS = Object.freeze([
  {id:'hunt-weapon',name:'Gebundene Jagdwaffe',description:'Eine passende seltene Klassenwaffe deiner aktuellen Stufe. Keine Siegel-Lotterie.',cost:12,minLevel:12,slot:'weapon',rarity:'rare'},
  {id:'hunt-armor',name:'Jägerrüstung',description:'Seltene Körperrüstung deiner aktuellen Stufe.',cost:10,minLevel:12,slot:'armor',rarity:'rare'},
  {id:'hunt-ring',name:'Ring der schwarzen Jagd',description:'Ein seltener Ring deiner aktuellen Stufe.',cost:8,minLevel:12,slot:'ring',rarity:'rare'},
  {id:'hunt-epic',name:'Waffe des Aschenschwurs',description:'Eine garantierte epische Klassenwaffe. Hebe Siegel für diesen gezielten Fund auf.',cost:45,minLevel:45,slot:'weapon',rarity:'epic'},
  {id:'hunt-dust',name:'Vorrat für die Schmiede',description:'40 Arkanstaub für Sockel und Aufwertungen.',cost:6,minLevel:12,dust:40},
]);
export const createEndgameState = () => ({version:1,tokens:0,totalClaims:0,active:[],completed:{}});
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v,max=1000000)=>Number.isInteger(v)&&v>=0&&v<=max;
export function validateEndgameState(state) {
  if(state===undefined)return true;
  if(!record(state)||state.version!==1||!integer(state.tokens)||!integer(state.totalClaims)||!Array.isArray(state.active)||state.active.length>2||!record(state.completed))return false;
  if(new Set(state.active.map(h=>h?.id)).size!==state.active.length)return false;
  let claims=0,earned=0;
  for(const [id,count] of Object.entries(state.completed)){
    const hunt=HUNTS.find(h=>h.id===id);if(!hunt||!integer(count))return false;
    claims+=count;earned+=count*hunt.reward.tokens;
  }
  if(claims!==state.totalClaims||state.tokens>earned)return false;
  return state.active.every(h=>{
    const def=HUNTS.find(d=>d.id===h?.id);
    return record(h)&&def&&Array.isArray(h.counts)&&h.counts.length===def.objectives.length&&h.counts.every((c,i)=>integer(c,def.objectives[i].count));
  });
}
export const restoreEndgameState = saved => saved===undefined?createEndgameState():JSON.parse(JSON.stringify(saved));
export function advanceHunts(game,kind,target,amount=1,context={}) {
  if(!Number.isFinite(amount)||amount<=0)return;
  for(const state of game.endgame.active){
    const def=HUNTS.find(h=>h.id===state.id);
    def.objectives.forEach((o,i)=>{
      if(o.kind===kind&&o.target===target&&(!o.minTier||(context.dungeonTier||1)>=o.minTier))state.counts[i]=Math.min(o.count,state.counts[i]+Math.floor(amount));
    });
  }
}
const ready = (state,def)=>def.objectives.every((o,i)=>state.counts[i]>=o.count);
export function huntRewardLevel(game){
  const earned=HUNTS.filter(h=>(game.endgame.completed[h.id]||0)>0);
  return Math.min(game.player.level,earned.length?Math.max(...earned.map(h=>h.maxLevel)):0);
}
export function endgameSummary(game){
  const state=game.endgame,rewardLevel=huntRewardLevel(game);
  return {tokens:state.tokens,totalClaims:state.totalClaims,maxActive:2,rewardLevel,
    offers:HUNTS.map(h=>({...h,title:h.name,eligible:game.player.level>=h.minLevel&&game.player.level<=h.maxLevel,active:state.active.some(s=>s.id===h.id),runs:state.completed[h.id]||0})),
    active:state.active.map(s=>{const d=HUNTS.find(h=>h.id===s.id);return {...d,title:d.name,counts:[...s.counts],ready:ready(s,d),objectives:d.objectives.map((o,i)=>({...o,current:s.counts[i]}))};}),
    rewards:HUNT_REWARDS.map(r=>({...r,level:r.slot?rewardLevel:null,affordable:state.tokens>=r.cost&&game.player.level>=r.minLevel&&(!r.slot||rewardLevel>=r.minLevel)}))};
}
export function startHunt(game,id){
  const def=HUNTS.find(h=>h.id===id);
  if(!def||game.dead||game.worldMode==='pvp'||game.player.level<def.minLevel||game.player.level>def.maxLevel||game.endgame.active.length>=2||game.endgame.active.some(s=>s.id===id))return false;
  game.endgame.active.push({id,counts:def.objectives.map(()=>0)});game.notice(`Jagd angenommen · ${def.name}`,'quest');game.change();game.save(false);return true;
}
export function abandonHunt(game,id){
  const state=game.endgame.active.find(h=>h.id===id);if(!state||game.worldMode==='pvp')return false;
  game.endgame.active=game.endgame.active.filter(h=>h!==state);game.change();game.save(false);return true;
}
export function claimHunt(game,id){
  const state=game.endgame.active.find(h=>h.id===id),def=HUNTS.find(h=>h.id===id);
  if(!state||!def||!ready(state,def)||game.dead||game.worldMode==='pvp')return false;
  game.endgame.active=game.endgame.active.filter(h=>h!==state);
  game.endgame.tokens=Math.min(1000000,game.endgame.tokens+def.reward.tokens);game.endgame.totalClaims++;game.endgame.completed[id]=(game.endgame.completed[id]||0)+1;
  game.resources.dust+=def.reward.dust;game.notice(`Jagd abgeschlossen · ${def.reward.tokens} Jagdsiegel · ${def.reward.dust} Arkanstaub`,'loot');game.onSound('quest');game.change();game.save(false);return true;
}
export function redeemHuntReward(game,id){
  const reward=HUNT_REWARDS.find(r=>r.id===id);
  if(!reward||game.dead||game.worldMode==='pvp'||!game.inSettlement()||game.inCombat()||game.player.level<reward.minLevel||game.endgame.tokens<reward.cost)return false;
  if(reward.slot){
    const level=huntRewardLevel(game);if(level<reward.minLevel)return false;
    if(Object.keys(game.inventory).filter(id=>id.startsWith('loot:')&&game.inventory[id]>0).length>=240){game.notice('Dein Gepäck ist voll. Deine Jagdsiegel bleiben erhalten.');return false;}
    const choices=ITEM_BASES.filter(b=>equipmentSlot(b)===reward.slot&&b.minLevel<=level&&(!b.classIds||b.classIds.includes(game.player.classId))).sort((a,b)=>b.minLevel-a.minLevel);
    if(!choices.length)return false;
    const loot=generateLoot({baseId:choices[0].id,classId:game.player.classId,level,rarity:reward.rarity,source:'hunt_reward',rng:game.random,uid:`hunt-${++game.lootSerial}`});
    if(!game.addItem(loot))return false;
  }else game.resources.dust+=reward.dust;
  game.endgame.tokens-=reward.cost;game.notice(`${reward.name} geborgen`,'loot');game.onSound('loot');game.change();game.save(false);return true;
}
