import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { HUNTS, HUNT_REWARDS, validateEndgameState } from '../src/endgame.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { getRelic } from '../src/relics.js';
import { DUNGEONS } from '../src/dungeons.js';
import { WORLD_EVENT_DEFINITIONS } from '../src/world-events.js';
import { CONTENT_HUNTS, CONTENT_HUNT_REWARDS } from '../src/hunt-content.js';
const make=(level=12)=>{const game=new Game({storage:null,random:()=>.5});game.start();game.player.level=level;return game;};
const complete=(game,def)=>{for(const o of def.objectives)game.event(o.kind,o.target,o.count);};

test('original hunts remain first and every route uses real enemies, dungeons or named encounters',()=>{
  const originalIds=[...DUNGEONS.map(d=>`hunt-${d.id}`),'hunt-moon','hunt-blood','hunt-nexus'];
  assert.equal(originalIds.length,11);
  assert.deepEqual(HUNTS.slice(0,11).map(h=>h.id),originalIds);
  assert.equal(HUNTS.length,originalIds.length+CONTENT_HUNTS.length);
  assert.deepEqual(HUNT_REWARDS.slice(0,5).map(r=>r.id),['hunt-weapon','hunt-armor','hunt-ring','hunt-epic','hunt-dust']);
  assert.equal(HUNT_REWARDS.length,5+CONTENT_HUNT_REWARDS.length);
  for(const h of HUNTS){
    assert.ok(h.minLevel<=h.maxLevel);
    for(const o of h.objectives){
      if(o.kind==='dungeon')assert.ok(DUNGEONS.some(d=>d.id===o.target));
      else if(o.kind==='world_event')assert.ok(WORLD_EVENT_DEFINITIONS.some(e=>e.id===o.target&&e.mode==='boss_hunt'&&ENEMY_TYPES[e.boss]));
      else assert.ok(ENEMY_TYPES[o.target]);
    }
  }
  assert.equal(HUNTS.find(h=>h.id==='hunt-nexus').partyRequired,1);
  assert.equal(HUNTS.find(h=>h.id==='hunt-weltenkern').partyRequired,8);
});
test('hunt enrollment requires a relevant level and permits two independent routes',()=>{
  const game=make();assert.equal(game.startHunt('hunt-wurzelgewoelbe'),true);assert.equal(game.startHunt('hunt-wurzelgewoelbe'),false);
  assert.equal(game.startHunt('hunt-weltenkern'),false);
  const veteran=make(100);assert.equal(veteran.startHunt('hunt-wurzelgewoelbe'),false);
  assert.equal(veteran.startHunt('hunt-nexus'),true);assert.equal(veteran.startHunt('hunt-blood'),true);assert.equal(veteran.startHunt('hunt-weltenkern'),false);
});
test('historical kills never count, incomplete claims fail and completed rewards pay exactly once',()=>{
  const game=make(),def=HUNTS[0];complete(game,def);game.startHunt(def.id);
  assert.deepEqual(game.endgame.active[0].counts,def.objectives.map(()=>0));assert.equal(game.claimHunt(def.id),false);
  complete(game,def);assert.equal(game.claimHunt(def.id),true);assert.equal(game.endgame.tokens,def.reward.tokens);
  assert.equal(game.claimHunt(def.id),false);assert.equal(game.endgame.totalClaims,1);assert.ok(validateEndgameState(game.endgame));
});
test('higher-depth hunt objectives reject easier dungeon completion',()=>{
  const game=make(60),def=HUNTS.find(h=>h.id==='hunt-frostkathedrale');game.startHunt(def.id);
  game.event('dungeon','frostkathedrale');assert.equal(game.endgame.active[0].counts[2],0);
  game.dungeonInstance={tier:2,definition:{name:'Fixture',minLevel:60,color:'#aaa'},id:'frostkathedrale'};
  game.event('dungeon','frostkathedrale');assert.equal(game.endgame.active[0].counts[2],1);
});
test('hunt progress, earned currency and sound levels round-trip without advancing old progress',()=>{
  const game=make(),def=HUNTS[0];game.startHunt(def.id);game.event(def.objectives[0].kind,def.objectives[0].target,3);
  game.setSetting('musicVolume',.17);const saved=JSON.parse(JSON.stringify(game.capture())),loaded=make();loaded.applySave(saved);
  assert.deepEqual(loaded.endgame,game.endgame);assert.equal(loaded.settings.musicVolume,.17);
  delete saved.endgame;delete saved.settings.musicVolume;const legacy=make();legacy.applySave(saved);assert.equal(legacy.endgame.tokens,0);assert.equal(legacy.settings.musicVolume,.45);
});
test('malformed hunt rewards, cooldowns and volume values reject imports atomically',()=>{
  for(const mutate of [s=>s.endgame.tokens=999,s=>s.endgame.active=[{id:'unknown',counts:[]}],s=>s.settings.effectsVolume=4,s=>s.relicCooldown=999]){
    const game=make(),before=JSON.stringify(game.capture()),saved=JSON.parse(before);mutate(saved);
    assert.throws(()=>game.applySave(saved));const after=game.capture();after.savedAt=saved.savedAt;assert.equal(JSON.stringify(after),before);
  }
});
test('earned seals purchase appropriate guaranteed gear, without a monster seal origin or cooldown reset',()=>{
  const game=make(45);game.endgame={version:1,tokens:45,totalClaims:15,completed:{'hunt-salzarchiv':15},active:[]};game.cooldowns.relic=11;
  assert.equal(game.redeemHuntReward('hunt-epic'),true);assert.equal(game.endgame.tokens,0);
  const item=Object.values(game.generatedItems).find(i=>i.source==='hunt_reward');assert.ok(item);assert.equal(item.rarity,'epic');assert.equal(getRelic(item),null);assert.ok(game.canEquipItem(item.id));assert.equal(game.cooldowns.relic,11);
  assert.equal(game.redeemHuntReward('hunt-epic'),false);
});
test('PvP exports the protected journey instead of normalized arena stats and blocks hunting',()=>{
  const game=make(45),travel=JSON.parse(JSON.stringify(game.capture()));game._pvpTravelSave=travel;game.worldMode='pvp';game.player.level=1;game.player.hp=300;game.pvpStats={maxHp:300,mana:100};
  assert.equal(game.stats().maxHp,300);assert.deepEqual(game.capture(),travel);assert.equal(game.startHunt(HUNTS[0].id),false);
  game._pvpTravelSave=null;assert.throws(()=>game.capture());
});
