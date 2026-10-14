import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { DUNGEONS } from '../src/dungeons.js';

const captured=game=>{const data=game.capture();delete data.savedAt;return JSON.stringify(data);};
const view=game=>Object.assign(Object.create(GameUI.prototype),{game:game || new Game({storage:null}),activePanel:'death',rescueBusy:false,renderPanel(){},update(){},closePanel(){this.activePanel=null;},showNotice(){}});
const fall=game=>{game.start();game.player.invulnerable=0;game.player.shield=0;game.damagePlayer(100000,{trueDamage:true,ignoreInvulnerability:true});assert.equal(game.dead,true);return game.deathSummary();};

test('the defeat screen renders the actually charged receipt without predicting from the remaining wallet',()=>{
  const game=new Game({storage:null}),ui=view(game);game.player.gold=45;const summary=fall(game),before=captured(game);
  const html=ui.death();assert.ok(html.includes(`data-death-receipt="${summary.lastReceipt.id}"`));assert.ok(html.includes(`${summary.lastReceipt.fee} Gold`));assert.ok(html.includes(`−${summary.lastReceipt.goldLost} Gold`));assert.ok(html.includes(`+${summary.lastReceipt.debtAdded} Gold`));
  assert.match(html,/BEREITS BEIM FALLEN VERBUCHT/);assert.match(html,/Wiederbelebung oder Rückkehr kostet dich nichts zusätzlich/);assert.match(html,/Stufe, Erfahrung, Ausrüstung und Aufgaben bleiben erhalten/);assert.ok(!/10 %|EP verloren|Ausrüstung verloren/.test(html));
  assert.equal(captured(game),before,'Reading the receipt never bills or saves again');
  game.player.gold=1;assert.ok(ui.death().includes(`${summary.lastReceipt.fee} Gold`),'A later wallet change must not rewrite the charge');
});

test('a broke character sees the real new debt and its total while experience and equipment stay protected',()=>{
  const game=new Game({storage:null}),ui=view(game);game.player.gold=0;game.player.xp=11;const gear={...game.equipment},summary=fall(game),html=ui.death();
  assert.equal(summary.lastReceipt.goldLost,0);assert.ok(summary.lastReceipt.debtAdded>0);assert.ok(html.includes('+0 Gold')===false);assert.ok(html.includes(`+${summary.lastReceipt.debtAdded} Gold`));assert.ok(html.includes(`${summary.debt} Gold`));
  assert.match(html,/25 % deiner künftigen Goldgewinne/);assert.equal(game.player.xp,11);assert.deepEqual(game.equipment,gear);
  game.respawn();const alive=ui.rescueOverview();assert.match(alive,/Offene Rettungsschuld/);assert.match(alive,/Letzte|Bereits|BEREITS/);assert.equal(game.deathSummary().lastReceipt.id,summary.lastReceipt.id);
});

test('debt and the last charged receipt remain inspectable from both existing character views',()=>{
  const game=new Game({storage:null}),ui=view(game);game.player.gold=0;fall(game);game.respawn();
  for(const characterTab of ['equipment','build']){ui.characterTab=characterTab;const html=ui.character();assert.match(html,/class="rescue-overview"/);assert.match(html,/Offene Rettungsschuld/);assert.match(html,/data-death-receipt=/);}
  const summary=game.deathSummary();game.deathSummary=()=>({...summary,debt:0});assert.match(ui.rescueOverview(),/keine offene Schuld/);
  game.worldMode='pvp';assert.equal(ui.rescueOverview(),'');
});

test('the rescue action names the actual dungeon glutherd instead of promising Glutwacht',()=>{
  const game=new Game({storage:null}),definition=DUNGEONS.find(dungeon=>dungeon.partyRequired===1);game.start();game.player.level=definition.minLevel;game.player.x=definition.entrance.x;game.player.y=definition.entrance.y;
  assert.equal(game.enterDungeon(definition.id),true);const summary=fall(game),html=view(game).death();assert.ok(summary.returnLabel.includes(definition.name));assert.ok(html.includes(summary.returnLabel));assert.ok(!html.includes('Glutwacht'));
});

test('native rescue command awaits the authoritative result and blocks a second request while pending',async()=>{
  const ui=view(),game=ui.game;game.dead=true;game.player.hp=0;let finish,calls=0,closed=0;
  game.respawn=(...args)=>{assert.equal(args.length,0);calls++;return new Promise(resolve=>{finish=()=>{game.dead=false;game.player.hp=30;resolve(true);};});};ui.closePanel=()=>{closed++;ui.activePanel=null;};
  const first=ui.command('respawn');assert.equal(ui.rescueBusy,true);assert.match(ui.death(),/disabled aria-busy="true"/);await ui.command('respawn');assert.equal(calls,1);assert.equal(closed,0);
  finish();await first;assert.equal(closed,1);assert.equal(ui.rescueBusy,false);await ui.command('respawn');assert.equal(calls,1,'An already revived actor cannot issue another rescue');
});

test('a rejected or failed rescue keeps the receipt open and re-enables its single action',async()=>{
  const ui=view();ui.game.dead=true;ui.game.player.hp=0;let closed=0,error;ui.closePanel=()=>closed++;ui.showNotice=(message,tone)=>{error={message,tone};};
  ui.game.respawn=async()=>false;await ui.command('respawn');assert.equal(closed,0);assert.equal(ui.rescueBusy,false);
  ui.game.respawn=async()=>{throw new Error('Verbindung unterbrochen');};await ui.command('respawn');assert.equal(closed,0);assert.deepEqual(error,{message:'Verbindung unterbrochen',tone:'error'});assert.equal(ui.rescueBusy,false);
});

test('PvP result controls never open a PvE rescue or expose journey debt',async()=>{
  const ui=view();ui.game.worldMode='pvp';ui.game.pvp={duel:{state:'finished'}};ui.game.dead=true;ui.game.player.hp=0;let calls=0;
  ui.game.respawn=()=>calls++;ui.togglePanel=()=>calls++;await ui.command('respawn');ui.showDeath();assert.equal(calls,0);assert.equal(ui.rescueOverview(),'');
});

test('adventure payout guidance follows the actual reward rarity and repeat flags',()=>{
  const ui=view(),base={xp:0,gold:2,dust:0,lootLevel:8,repeatFactor:.25};
  assert.match(ui.adventureReward({reward:{...base,bossLoot:false,rarity:'common'}}),/Graue Begegnung · gewöhnliche Beute/);
  assert.match(ui.adventureReward({reward:{...base,bossLoot:false}}),/Wiederholung · normale Fundchancen/);
  assert.ok(!/Graue Begegnung|normale Fundchancen/.test(ui.adventureReward({reward:{...base,bossLoot:true}})));
  assert.ok(!/Wiederholung/.test(ui.adventureReward({reward:{...base,bossLoot:false,repeatFactor:1}})));
});
