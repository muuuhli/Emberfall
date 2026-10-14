// PvE defeat charges once, at the moment of falling. Currency is the stake;
// equipment, quest items, learned skills and earned levels remain the player's.
export const DEATH_PENALTY_VERSION=1;
export const DEATH_GOLD_RATE=.1;
export const DEBT_REPAYMENT_DIVISOR=4;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));

export function createDeathPenaltyState(){return {version:1,deaths:0,debt:0,repayQuarters:0,lastReceipt:null};}
export function deathFee(level,gold){
  const current=Math.max(1,Math.min(100,Math.floor(Number.isFinite(level)?level:1)));
  const purse=Math.max(0,Math.floor(Number.isFinite(gold)?gold:0));
  return Math.max(5+Math.ceil(current/2),Math.ceil(purse*DEATH_GOLD_RATE));
}
export function validateDeathPenaltyState(value){
  if(value===undefined)return true;
  if(!record(value)||!keys(value,['version','deaths','debt','repayQuarters','lastReceipt'])||value.version!==1||
    !integer(value.deaths)||!integer(value.debt)||!integer(value.repayQuarters)||value.repayQuarters>3||
    value.debt>value.deaths*55||!value.debt&&value.repayQuarters!==0)return false;
  const receipt=value.lastReceipt;
  if(receipt===null)return value.deaths===0&&value.debt===0;
  return value.deaths>0&&record(receipt)&&keys(receipt,['id','level','goldBefore','fee','goldLost','debtAdded','pendingRescue'])&&
    receipt.id===`death-${value.deaths}`&&integer(receipt.level,1)&&receipt.level<=100&&
    integer(receipt.goldBefore)&&integer(receipt.fee,1)&&integer(receipt.goldLost)&&integer(receipt.debtAdded)&&
    receipt.fee===deathFee(receipt.level,receipt.goldBefore)&&receipt.goldLost===Math.min(receipt.goldBefore,receipt.fee)&&
    receipt.goldLost+receipt.debtAdded===receipt.fee&&typeof receipt.pendingRescue==='boolean';
}
export function restoreDeathPenaltyState(value){
  if(!validateDeathPenaltyState(value))throw new TypeError('Ungültiger Rettungsbeleg.');
  return value===undefined?createDeathPenaltyState():{...value,lastReceipt:value.lastReceipt?{...value.lastReceipt}:null};
}
export function chargeDeathPenalty(game){
  if(game.worldMode==='pvp'||game.world?.isPvp||!game.dead&&game.player.hp>0)return null;
  const state=game.deathPenalty||(game.deathPenalty=createDeathPenaltyState());
  if(state.lastReceipt?.pendingRescue)return state.lastReceipt;
  const goldBefore=Math.max(0,Math.floor(Number.isFinite(game.player.gold)?game.player.gold:0)),level=Math.max(1,Math.min(100,Math.floor(game.player.level||1))),fee=deathFee(level,goldBefore);
  const goldLost=Math.min(goldBefore,fee),debtAdded=fee-goldLost;
  state.deaths++;state.debt+=debtAdded;game.player.gold=goldBefore-goldLost;
  state.lastReceipt={id:`death-${state.deaths}`,level,goldBefore,fee,goldLost,debtAdded,pendingRescue:true};
  return state.lastReceipt;
}
export function completeDeathRescue(game){
  const state=game.deathPenalty;
  if(state?.lastReceipt?.pendingRescue)state.lastReceipt={...state.lastReceipt,pendingRescue:false};
}
export function creditGold(game,amount){
  const gross=Number.isFinite(amount)?Math.max(0,Math.floor(amount)):0;
  if(!gross)return {gross:0,received:0,repaid:0};
  const state=game.deathPenalty;let repaid=0;
  if(state?.debt>0){
    const quarters=gross+state.repayQuarters;
    repaid=Math.min(state.debt,Math.floor(quarters/DEBT_REPAYMENT_DIVISOR));
    state.debt-=repaid;state.repayQuarters=state.debt?quarters%DEBT_REPAYMENT_DIVISOR:0;
  }
  game.player.gold+=gross-repaid;
  return {gross,received:gross-repaid,repaid};
}
export function deathSummary(game){
  const state=game.deathPenalty||createDeathPenaltyState();
  return {deaths:state.deaths,debt:state.debt,lastReceipt:state.lastReceipt?{...state.lastReceipt}:null,
    returnLabel:game.dungeonInstance?`${game.dungeonInstance.definition?.name||'Dungeon'} · Glutherd`:'Glutwacht'};
}
