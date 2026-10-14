import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { PVP_RULES } from '../src/pvp.js';
import { generateLoot } from '../src/loot.js';
import { rollRelic } from '../src/relics.js';

const view=game=>Object.assign(Object.create(GameUI.prototype),{game:game || new Game({storage:null}),update(){},showNotice(){},inventoryTab:'equipment',inventoryPage:0,journeyTab:'hunts'});

test('arena UI sends exact command arity for the authoritative duel API',async()=>{
  const ui=view(),calls=[];
  for(const method of ['pvpInvite','pvpAccept','pvpDecline','pvpCancel','pvpForfeit','pvpReturn'])ui.game[method]=(...args)=>calls.push([method,args]);
  for(const [command,id] of [['pvp-invite','opponent'],['pvp-accept','invitation'],['pvp-decline','invitation'],['pvp-cancel',undefined],['pvp-forfeit',undefined],['pvp-return',undefined]])await ui.pvpCommand(command,id);
  assert.deepEqual(calls,[['pvpInvite',['opponent']],['pvpAccept',['invitation']],['pvpDecline',['invitation']],['pvpCancel',[]],['pvpForfeit',[]],['pvpReturn',[]]]);
});

test('duel invitations expose consent and availability without enabling unavailable rivals',()=>{
  const ui=view();ui.game.networkActive=true;
  ui.game.pvp={rules:PVP_RULES,roster:[{id:'free',name:'Freier Gegner',classId:'ranger',available:true},{id:'busy',name:'Im Kampf',classId:'guardian',available:false,reason:'Im Dungeon'}],invites:[{id:'invite',fromName:'<b>Einladender</b>',toName:'Aren',outgoing:false,remaining:18}]};
  const html=ui.duelLobby();assert.match(html,/data-command="pvp-accept"/);assert.match(html,/data-command="pvp-decline"/);assert.match(html,/data-command="pvp-invite" data-id="busy" disabled/);
  assert.ok(html.includes('&lt;b&gt;Einladender&lt;/b&gt;'));assert.match(html,/Identische 300 LP, 100 Mana/);assert.match(html,/Keine EP, Beute, Gold/);
});

test('PvP UI blocks PvE commands but lets players forfeit without mutating their journey',async()=>{
  const ui=view();ui.game.worldMode='pvp';ui.game.pvp={duel:{state:'active'}};let consumed=0,forfeited=0;
  ui.game.consume=()=>consumed++;ui.game.pvpForfeit=(...args)=>{assert.equal(args.length,0);forfeited++;};
  await ui.command('consume','heal_potion',{});await ui.command('startHunt','hunt-gruft',{});await ui.command('pvp-forfeit',undefined,{});
  assert.equal(consumed,0);assert.equal(forfeited,1);
});

test('PvP result and sound settings offer a return path and no PvE save or load controls',()=>{
  const ui=view();ui.game.worldMode='pvp';ui.game.pvp={duel:{state:'finished',result:'defeat',opponentName:'Rival',reason:'Zeit abgelaufen',returnIn:8}};
  const result=ui.pvpResult(ui.game.pvp.duel);assert.match(result,/data-command="pvp-return"/);assert.match(result,/Reiseausrüstung, Erfahrung und Vorräte bleiben erhalten/);
  const settings=ui.settings();for(const setting of ['masterVolume','musicVolume','effectsVolume'])assert.ok(settings.includes(`data-setting="${setting}"`));
  assert.ok(!/data-command="(?:save|import|export)"|data-panel="reset"/.test(settings));
  ui.game.settings.masterVolume=0;ui.game.settings.musicVolume=.23;ui.game.settings.effectsVolume=1;
  assert.match(ui.audioControls(),/value="0" data-setting="masterVolume"/);assert.match(ui.audioControls(),/23 %/);assert.match(ui.audioControls(),/100 %/);
});

test('fixed edge notices suppress ordinary arena updates and still show genuine errors',()=>{
  const ui=view(),appended=[];ui.game.worldMode='pvp';ui.game.pvp={duel:{state:'finished'}};
  ui.notices=[];ui.elements={'notice-stack':{appendChild:notice=>appended.push(notice),setAttribute(){}}};
  const originalDocument=globalThis.document,originalTimeout=globalThis.setTimeout;
  globalThis.document={getElementById:()=>null,querySelectorAll:()=>[],createElement:()=>{const text={textContent:''};return {classList:{add(){}},querySelector:()=>text,get textContent(){return text.textContent;},remove(){this.removed=true;}};}};
  globalThis.setTimeout=()=>0;
  try{
    for(const tone of ['info','quest','success'])GameUI.prototype.showNotice.call(ui,'Duell beendet; deine Reise bleibt erhalten.',tone);
    assert.equal(appended.length,0);
    GameUI.prototype.showNotice.call(ui,'Die Rückkehr konnte nicht ausgeführt werden.','error');
    assert.equal(appended.length,1);assert.equal(appended[0].className,'notice error');
    GameUI.prototype.showNotice.call(ui,'Versuche die Rückkehr erneut.','error');
    assert.equal(ui.notices.length,1);assert.equal(appended[0].removed,true);assert.equal(ui.notices[0].textContent,'Versuche die Rückkehr erneut.');
  }finally{globalThis.document=originalDocument;globalThis.setTimeout=originalTimeout;}
});

test('hunt journal reports actual active progress and level-gates its earned equipment choices',()=>{
  const ui=view(),game=ui.game;game.player.level=12;
  const offered=game.endgameSummary().offers.find(offer=>offer.eligible);assert.ok(offered);assert.equal(game.startHunt(offered.id),true);
  const partial=Math.max(0,offered.objectives[0].count-1);game.endgame.active[0].counts[0]=partial;
  let html=ui.hunts();assert.ok(html.includes(`${partial}/${offered.objectives[0].count}`));assert.ok(!html.includes('data-command="claimHunt"'));
  game.endgame.active[0].counts=offered.objectives.map(objective=>objective.count);html=ui.hunts();assert.match(html,/data-command="claimHunt"/);
  game.endgame.tokens=100;html=ui.hunts();assert.match(html,/data-command="redeemHuntReward" data-id="hunt-epic" disabled/);assert.match(html,/Ab Charakterstufe 45/);
});

test('seal weapon inspector uses canonical effect, exact conditional chance and bounded upgrade guidance',()=>{
  const ui=view(),game=ui.game;game.player.level=30;
  const weapon=generateLoot({level:30,classId:'guardian',baseId:'iron_longsword',rarity:'rare',source:'wolf',uid:'ui-moon-seal',rng:()=>.4});
  weapon.relic=rollRelic(weapon,{kind:'enemy',enemyId:'wolf'},()=>0);assert.ok(weapon.relic);assert.equal(game.addItem(weapon),true);
  const html=ui.itemRow(weapon,1);assert.match(html,/SELTENE SIEGELWAFFE/);assert.match(html,/Mondsiegel/);assert.match(html,/0,08 % je geeigneter Waffenfund/);assert.match(html,/Im PvP ruht das Siegel/);
});
