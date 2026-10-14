import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { SIDE_QUESTS } from '../src/side-stories.js';
import { NPCS } from '../src/catalog.js';
import { REGIONS } from '../src/catalog.js';
import { NAMED_BOSS_HUNTS } from '../src/encounter-content.js';
import { TRIALS } from '../src/trial-content.js';
import { updateWorldEvents } from '../src/world-events.js';

const view=()=>Object.assign(Object.create(GameUI.prototype),{game:new Game({storage:null}),questTab:'available',questContentFilter:'side',questRegionFilter:'all',questSearch:'',questPage:0});
const ids=html=>[...html.matchAll(/data-quest-id="([^"]+)"/g)].map(match=>match[1]);

test('the discoverable journal exposes all 24 canonical side chapters in pages of at most eight',()=>{
  const ui=view(),found=[];assert.equal(SIDE_QUESTS.length,24);
  for(let page=0;page<3;page++){ui.questPage=page;const html=ui.journal();assert.equal(ids(html).length,8);assert.ok(!html.includes('data-quest-type="story"'));assert.ok(html.includes(`Seite ${page+1} / 3`));found.push(...ids(html));}
  assert.equal(new Set(found).size,24);assert.deepEqual(new Set(found),new Set(SIDE_QUESTS.map(quest=>quest.id)));
});

test('side stories filter by their task region, chain name and title independently of the NPC location',()=>{
  const ui=view();ui.questRegionFilter='aschenmoor';let html=ui.journal();
  assert.equal(ids(html).length,3);assert.ok(ids(html).every(id=>SIDE_QUESTS.find(quest=>quest.id===id).region==='aschenmoor'));
  assert.match(html,/Auftraggeber: Sera · Dämmerhain/);
  ui.questRegionFilter='all';ui.questSearch=SIDE_QUESTS[0].chainName;html=ui.journal();assert.equal(ids(html).length,3);
  ui.questSearch=SIDE_QUESTS[0].title;assert.deepEqual(ids(ui.journal()),[SIDE_QUESTS[0].id]);
  ui.questContentFilter='story';assert.equal(ids(ui.journal()).length,0);
});

test('future side chapters explain real level and prerequisite locks and always send players to the NPC',()=>{
  const ui=view(),first=SIDE_QUESTS[0],second=SIDE_QUESTS[1];ui.game.player.level=1;
  const html=ui.questCard(first);assert.match(html,/NEBENQUEST · KAPITEL 1\/3/);assert.ok(html.includes(first.chainName));assert.ok(html.includes(`Stufe ${first.minLevel}`));assert.ok(html.includes(`Ab Stufe ${first.minLevel}`));
  assert.match(html,/data-command="waypoint" data-kind="npc" data-id="mira"/);assert.match(html,/zuerst gelten die genannten Voraussetzungen/);
  assert.ok(ui.questCard(second).includes(`Vorher abschließen: ${first.title}`));
  ui.game.player.level=3;assert.match(ui.questCard(first),/Sprich vor Ort mit dem Auftraggeber/);
  assert.ok(!ui.journal().includes('data-command="questAccept"'));
});

test('the physical NPC dialogue distinguishes the side chain before its acceptance button',()=>{
  const ui=view(),quest=SIDE_QUESTS[0];ui.game.player.level=quest.minLevel;ui.dialogueNPC=NPCS.find(npc=>npc.id===quest.giver);
  const html=ui.dialogue();assert.ok(html.includes(`NEBENQUEST · ${quest.chainName}`));assert.ok(html.includes(`Kapitel ${quest.chapter}/${quest.chapters} · Stufe ${quest.minLevel}`));assert.ok(html.includes(`data-command="questAccept" data-id="${quest.id}"`));
});

test('pinned and ready quests lead the active list, and completed stories collapse their details',()=>{
  const ui=view();ui.questTab='active';ui.game.player.level=100;
  for(const quest of SIDE_QUESTS.slice(0,10))ui.game.questState[quest.id]={status:'active',counts:quest.objectives.map(()=>0)};
  ui.game.questState[SIDE_QUESTS[0].id].status='ready';ui.game.trackedQuestId=SIDE_QUESTS[9].id;
  assert.deepEqual(ids(ui.journal()).slice(0,2),[SIDE_QUESTS[9].id,SIDE_QUESTS[0].id]);assert.equal(ids(ui.journal()).length,8);
  ui.game.questState[SIDE_QUESTS[0].id].status='done';ui.questTab='done';const html=ui.journal();assert.equal(ids(html).length,1);assert.match(html,/<details class="quest-story-details">/);assert.ok(!html.includes('data-command="trackQuest"'));
});

test('journal clamps pages after result shrinkage and renders escaped empty-search feedback',()=>{
  const ui=view();ui.questPage=100;let html=ui.journal();assert.equal(ui.questPage,2);assert.equal(ids(html).length,8);
  ui.questRegionFilter='daemmerhain';html=ui.journal();assert.equal(ui.questPage,0);assert.equal(ids(html).length,3);
  ui.questSearch='"><img src=x onerror=alert(1)>';html=ui.journal();assert.equal(ids(html).length,0);assert.match(html,/Keine passenden Questen/);assert.ok(html.includes('&quot;&gt;&lt;img'));assert.ok(!html.includes('<img src=x'));
});

test('adventures expose every canonical event in bounded six-card pages and filter named boss metadata',()=>{
  const ui=view(),events=ui.game.worldEventSummary(),found=[];assert.ok(events.length>=33);
  for(let page=0;page<Math.ceil(events.length/6);page++){ui.adventurePage=page;const html=ui.adventures(),shown=[...html.matchAll(/data-adventure-id="([^"]+)"/g)].map(match=>match[1]);assert.ok(shown.length<=6);found.push(...shown);}
  assert.deepEqual(new Set(found),new Set(events.map(event=>event.id)));
  ui.adventureContentFilter='boss';ui.adventureRegionFilter='nexusriss';ui.adventureSearch=NAMED_BOSS_HUNTS.at(-1).name;ui.adventurePage=100;
  const html=ui.adventures();assert.equal(ui.adventurePage,0);assert.equal((html.match(/data-adventure-id=/g)||[]).length,1);assert.match(html,/data-adventure-id="event-asterion"/);assert.match(html,/data-content-type="boss"/);assert.match(html,/Stufe 100\+/);assert.ok(html.includes(NAMED_BOSS_HUNTS.at(-1).hint));assert.match(html,/Benötigt Stufe 100/);
});

test('named boss cards show their distinct hint once and use player-specific reward previews',()=>{
  const ui=view();ui.game.player.level=52;const event=ui.game.worldEventSummary().find(event=>event.id==='event-vey');assert.ok(event);
  const html=ui.adventureCard(event,ui.game.world);assert.equal(html.split(event.hint).length-1,1);assert.match(html,/Allein oder gemeinsam/);assert.match(html,/Wiederholbar/);assert.ok(html.includes(`${event.reward.gold} Gold`));
  const personal=ui.adventureReward({...event,reward:{...event.reward,gold:7},rewardPreview:{...event.reward,gold:9999}});assert.match(personal,/7 Gold/);assert.ok(!personal.includes('9.999 Gold'));
});

test('online adventure cards and waypoints remain available through the global authoritative summary after culling',()=>{
  const ui=view(),summary=ui.game.worldEventSummary();ui.game.networkActive=true;ui.game.networkWorldEventSummary=summary;ui.game.world.worldEvents=[];ui.game.world.eventObjects=[];ui.game.discovered=REGIONS.map(region=>region.id);
  ui.adventureContentFilter='boss';ui.adventureSearch=NAMED_BOSS_HUNTS.at(-1).name;
  const html=ui.adventures();assert.match(html,/data-command="waypoint" data-kind="event" data-id="event-asterion"\s*>/);assert.match(html,/Stufe 100\+/);assert.ok(!html.includes('data-command="world-event"'));
  assert.ok(!/undefined|NaN|Infinity/.test(html));
});

test('running adventures lead the list and result shrinkage clamps the page without introducing new menus',()=>{
  const ui=view(),event=ui.game.world.worldEvents.find(event=>event.id==='event-asterion');event.state='active';event.objective={label:'Den Wächter bezwingen',progress:0,goal:1};ui.adventurePage=0;
  const html=ui.adventures();assert.equal([...html.matchAll(/data-adventure-id="([^"]+)"/g)][0][1],event.id);
  ui.adventureFilter='active';ui.adventurePage=100;assert.equal((ui.adventures().match(/data-adventure-id=/g)||[]).length,1);assert.equal(ui.adventurePage,0);
  ui.adventureSearch='Kein bestehendes Abenteuer';assert.match(ui.adventures(),/Für diese Filter gibt es keine Abenteuer/);
});

test('participants can claim remaining personal rewards after another player claimed and spectators cannot',()=>{
  const ui=view();ui.game.player.level=52;
  const base=ui.game.worldEventSummary().find(event=>event.id==='event-vey'),event={...base,x:ui.game.player.x,y:ui.game.player.y,state:'rewarded',claimable:true,readyAt:360};
  let html=ui.adventureCard(event,{eventObjects:[]});assert.match(html,/reward-available/);assert.match(html,/Belohnung bereit/);assert.match(html,/data-command="claimWorldEvent" data-id="event-vey"\s*>/);assert.ok(!html.includes('Erneut bereit'));
  html=ui.adventureCard({...event,state:'success',claimable:false,readyAt:0},{eventObjects:[]});assert.ok(!html.includes('data-command="claimWorldEvent"'));assert.match(html,/keine offene Teilnehmerbelohnung/);
  assert.equal(ui.adventureRewardReady(event),true);assert.equal(ui.adventureRewardReady({...event,state:'success',claimable:false}),false);
});

test('the existing adventure filter exposes all three authored trials with real entry levels and boss finales',()=>{
  const ui=view();ui.adventureContentFilter='challenge';
  const html=ui.adventures(),shown=[...html.matchAll(/data-adventure-id="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(new Set(shown),new Set(TRIALS.map(trial=>trial.id)));assert.equal(shown.length,3);
  assert.match(html,/Wellenprüfungen · 3/);assert.ok(!html.includes('data-content-type="boss"'));
  for(const trial of TRIALS){const card=ui.adventureCard(ui.game.worldEventSummary().find(event=>event.id===trial.id),ui.game.world);assert.ok(card.includes(`Stufe ${trial.minLevel}+`));assert.ok(card.includes(`${trial.waves.length} Wellen · Bossfinale`));assert.match(card,/Sechs Sekunden Vorwarnung/);assert.match(card,/data-kind="event"/);}
  assert.equal(ui.adventureType({mode:'gauntlet'}),'challenge');
});

function activeTrial() {
  const ui=view(),game=ui.game,event=game.world.worldEvents.find(event=>event.id===TRIALS[0].id);
  game.started=true;game.player.level=event.minLevel;game.player.x=event.x;game.player.y=event.y;game.discovered.push(event.region);
  assert.equal(game.interactWorldEvent(`${event.id}:start`),true);
  return {ui,game,event,summary:()=>game.worldEventSummary().find(entry=>entry.id===event.id)};
}

test('trial cards and the HUD model share the actual six-second countdown and expose combat only after warning',()=>{
  const {ui,game,event,summary}=activeTrial();let state=summary();
  assert.match(ui.adventureWaveCard(state),/data-phase="wave-warning"/);assert.match(ui.adventureWave(state).compact,/Gegner in 6 s/);
  assert.match(ui.adventureWave({...state,warningRemaining:6.000000000000002}).compact,/Gegner in 6 s/);assert.equal(ui.adventureWarningSeconds({...state,warningRemaining:2.000000000000002}),2);
  updateWorldEvents(game.world,3.25,[game.player],3.25);state=summary();assert.match(ui.adventureWave(state).compact,/Gegner in 3 s/);
  assert.equal(game.world.enemies.filter(enemy=>enemy.eventId===event.id&&enemy.alive).length,0);
  updateWorldEvents(game.world,2.8,[game.player],6.05);state=summary();assert.equal(state.phase,'wave-combat');assert.match(ui.adventureWaveCard(state),/Im Kampf/);assert.match(ui.adventureWave(state).compact,/Noch 2 Gegner/);
  assert.ok(!ui.adventureCard(state,game.world).includes('Abenteuer beginnen'));
});

test('intermission explains the real respite and bonus choices while disabling remote and exact-boundary decisions',()=>{
  const {ui,game,event,summary}=activeTrial();updateWorldEvents(game.world,6.1,[game.player],6.1);
  for(const enemy of game.world.enemies.filter(enemy=>enemy.eventId===event.id)){enemy.alive=false;enemy.hp=0;}
  updateWorldEvents(game.world,.1,[game.player],6.2);const state=summary();assert.equal(state.phase,'intermission');
  const rest=game.world.eventObjects.find(object=>object.eventId===event.id&&object.choice==='rest'&&!object.hidden);
  game.player.x=rest.x-85;game.player.y=rest.y;let html=ui.adventureCard(state,game.world);
  assert.match(html,/Rastphase · 1\/4 Wellen bezwungen/);assert.match(html,/20 % ihres maximalen Lebens/);assert.match(html,/höchstens auf 25 %/);assert.match(html,/data-choice="rest"\s+disabled/);assert.match(html,/Gehe zu diesem Zeichen/);assert.equal(game.interactWorldEvent(rest.id),false);
  game.player.x=rest.x-80;html=ui.adventureCard(state,game.world);assert.match(html,/data-choice="rest"\s*>Rasten/);assert.match(html,/data-choice="push"\s+disabled/);
  game.player.hp=game.stats().maxHp*.5;game.player.mana=game.stats().mana*.5;const before={hp:game.player.hp,mana:game.player.mana};
  assert.equal(game.interactWorldEvent(rest.id),true);assert.ok(game.player.hp>before.hp&&game.player.mana>before.mana);assert.equal(summary().phase,'wave-warning');assert.ok(!ui.adventureChoices(summary(),game.world));
});

test('a tracked online trial uses authoritative wave metadata without leaking unrelated distant encounters into the HUD',()=>{
  const {ui,game,event,summary}=activeTrial(),canonical=summary();game.networkWorldEventSummary=[canonical];game.networkActive=true;game.world.worldEvents=[];
  assert.equal(ui.trackedAdventure(),undefined);game.waypoint={kind:'event',id:event.id};assert.equal(ui.trackedAdventure().id,event.id);
  assert.match(ui.adventureWave(ui.trackedAdventure()).compact,/Welle 1\/4/);
  ui.adventureContentFilter='challenge';const html=ui.adventures();assert.match(html,/data-adventure-id="trial-cinderwatch"/);assert.match(html,/data-phase="wave-warning"/);
});

test('journey requirements identify named encounters and expeditions through the authoritative summary',()=>{
  const ui=view(),events=ui.game.worldEventSummary(),ids=['event-sivra','expedition-weisshorn','trial-cinderwatch'];
  ui.game.networkActive=true;ui.game.networkWorldEventSummary=events;ui.game.world.worldEvents=[];
  const label=ui.journeyRequirement({kind:'events',count:3,targets:ids});
  for(const id of ids){assert.ok(label.includes(events.find(event=>event.id===id).name));assert.ok(!label.includes(id));}
  assert.match(label,/Weltabenteuer abgeschlossen/);
});
