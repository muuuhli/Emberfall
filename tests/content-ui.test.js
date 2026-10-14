import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { SIDE_QUESTS } from '../src/side-stories.js';
import { NPCS } from '../src/catalog.js';

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
