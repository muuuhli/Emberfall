import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { SIDE_QUESTS } from '../src/side-stories.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { resolveQuestTarget, resolveWaypoint } from '../src/navigation.js';

const prepare=objective=>{
  const game=new Game({storage:null});game.start();game.player.level=100;
  const quest=SIDE_QUESTS.find(q=>q.objectives.some(o=>o.kind===objective));
  assert.ok(quest);game.questState[quest.id]={status:'active',counts:quest.objectives.map(o=>o.kind===objective?0:o.count)};
  return {game,quest,target:quest.objectives.find(o=>o.kind===objective)};
};

test('side-story waypoints lead to the canonical one-use object and active event objective',()=>{
  const {game,quest,target}=prepare('interact'),object=game.world.interactions.find(o=>o.id===target.target);
  assert.ok(object);assert.equal(resolveQuestTarget(game,quest.id).objectId,object.id);
  const eventFixture=prepare('world_event'),event=eventFixture.game.world.worldEvents.find(e=>e.id===eventFixture.target.target);
  const start=eventFixture.game.world.eventObjects.find(o=>o.eventId===event.id&&o.role==='start');
  assert.equal(resolveQuestTarget(eventFixture.game,eventFixture.quest.id).objectId,start.id);
});

test('a distant multiplayer adventure keeps a canonical waypoint when render objects are culled',()=>{
  const game=new Game({storage:null}),event=game.world.worldEvents[0];
  game.networkWorldEventSummary=[{id:event.id,x:event.x,y:event.y,name:event.name,objective:{label:'Die Wacht schützen'}}];
  game.world.worldEvents=[];game.world.eventObjects=[];
  assert.deepEqual(resolveWaypoint(game,'event',event.id),{x:event.x,y:event.y,objectId:event.id,label:'Die Wacht schützen'});
});

test('fresh champion objectives cannot direct a player to a rewardless event actor that emits no boss kill',()=>{
  const {game,quest,target}=prepare('boss'),type=Object.keys(ENEMY_TYPES).find(id=>ENEMY_TYPES[id].boss&&ENEMY_TYPES[id].baseType===target.target);
  assert.ok(type);
  const unpaid=createBestiaryEnemy(type,'event-copy',game.player.x+10,game.player.y,{region:quest.region});unpaid.rewardless=true;unpaid.eventId='unit-fixture';
  const genuine=createBestiaryEnemy(type,'regional-champion',game.player.x+300,game.player.y,{region:quest.region});
  game.world.enemies=[unpaid,genuine];
  assert.equal(resolveQuestTarget(game,quest.id).objectId,genuine.id);
});
