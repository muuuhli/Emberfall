import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createBestiaryEnemy, BESTIARY_ENEMIES } from '../src/bestiary.js';
import { incomingDamage } from '../src/balance.js';

function arena(type='frostwolf') {
  const game=new Game({storage:null,random:()=>.5});
  for(const field of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies','interactions'])game.world[field]=[];
  game.npcs=[];Object.assign(game.player,{level:20,x:2000,y:1000,invulnerable:0});
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.start();
  const enemy=createBestiaryEnemy(type,'affliction-source',2030,1000,{level:20});game.world.enemies=[enemy];
  return {game,enemy};
}
function projectile(game,enemy) {
  game.projectiles.push({x:game.player.x,y:game.player.y,angle:0,speed:0,life:1,owner:'enemy',damage:enemy.damage,attackerId:enemy.id,attackerLevel:enemy.level});
  game.updateWorld(.02);
}

test('a real frost hit slows movement temporarily; shields and dodges prevent its status',()=>{
  const {game,enemy}=arena();projectile(game,enemy);
  assert.ok(game.player.slowUntil>game.time);
  game.keys.add('d');const x=game.player.x,speed=game.stats().speed;
  game.update(.04,{simulateWorld:false});assert.ok(Math.abs(game.player.x-x-speed*.85*.04)<1e-8);
  game.time=game.player.slowUntil+.1;const recovered=game.player.x;
  game.update(.04,{simulateWorld:false});assert.ok(Math.abs(game.player.x-recovered-speed*.04)<1e-8);
  for(const protection of ['shield','dodge']) {
    const {game:safe,enemy:foe}=arena();
    if(protection==='shield'){safe.player.shield=1e4;safe.player.shieldUntil=10;}
    else safe.player.invulnerable=1;
    const hp=safe.player.hp;projectile(safe,foe);
    assert.equal(safe.player.hp,hp);assert.equal(safe.player.slowUntil,undefined);
  }
});

test('venom refreshes one bounded wound, respects roll immunity and is removed by rescue',()=>{
  const {game,enemy}=arena('plague_spitter');projectile(game,enemy);
  assert.equal(game.player.afflictions.length,1);
  const firstExpiry=game.player.afflictions[0].expiresAt;
  for(let frame=0;frame<10;frame++)game.update(.02,{simulateWorld:false});
  const beforeRefresh=game.player.hp;
  game.player.invulnerable=0;projectile(game,enemy);
  assert.equal(game.player.afflictions.length,1,'Repeated projectiles refresh rather than multiply damage effects');
  assert.ok(game.player.hp<beforeRefresh,'The refresh comes from a real hit after source recovery');
  assert.ok(game.player.afflictions[0].expiresAt>firstExpiry);
  game.time=.99;game.player.invulnerable=2;const hp=game.player.hp;
  game.update(.04,{simulateWorld:false});assert.equal(game.player.hp,hp);
  game.player.invulnerable=0;game.time=1.99;
  game.update(.04,{simulateWorld:false});assert.ok(game.player.hp<hp);
  const wound=structuredClone(game.player.afflictions);
  assert.equal(game.respawn(),false,'A living hero cannot cleanse a wound by asking for rescue');
  assert.deepEqual(game.player.afflictions,wound);
  game.damagePlayer(game.stats().maxHp*2,{trueDamage:true,ignoreInvulnerability:true,attackerId:'fatal-rescue-fixture'});
  assert.equal(game.dead,true);assert.equal(game.player.hp,0);
  assert.equal(game.respawn(),true);assert.deepEqual(game.player.afflictions,[]);assert.equal(game.player.slowUntil,0);
  assert.equal(game.player.hp,game.stats().maxHp);
});

test('a draining projectile heals its attacker only from damage that reaches health',()=>{
  const {game,enemy}=arena('wraith');enemy.hp=enemy.maxHp/2;
  const initial=enemy.hp,hp=game.player.hp;projectile(game,enemy);
  assert.ok(Math.abs(enemy.hp-initial-(hp-game.player.hp)*.25)<1e-8);
  game.player.invulnerable=0;game.player.shield=1e4;const shielded=enemy.hp;
  projectile(game,enemy);assert.equal(enemy.hp,shielded);
});

test('armored anatomy changes actual hit damage and regeneration cannot exceed maximum health',()=>{
  const {game,enemy}=arena('skeleton');
  assert.ok(BESTIARY_ENEMIES[enemy.type].traits.includes('armored'));
  const applied=game.hitEnemy(enemy,100,0);assert.equal(applied,90);
  const regenerating=createBestiaryEnemy('root_hulk','regenerator',2030,1000,{level:20});
  game.world.enemies=[regenerating];regenerating.hp=regenerating.maxHp-1;
  regenerating.phase='recover';regenerating.attackTimer=1;regenerating.aggro=true;
  game.updateEnemies(.04);assert.ok(regenerating.hp>regenerating.maxHp-1);assert.ok(regenerating.hp<=regenerating.maxHp);
});

test('healing cooldowns survive a reload and cannot be bypassed by importing the same journey',()=>{
  const {game}=arena();game.player.hp=1;assert.equal(game.consume('heal_potion'),true);
  const saved=JSON.parse(JSON.stringify(game.capture()));const restored=new Game({storage:null});restored.applySave(saved);restored.start();
  assert.equal(restored.cooldowns.potion,3);assert.equal(restored.consume('heal_potion'),false);
  const gold=restored.player.gold,broken={...saved,consumableCooldowns:{potion:-1}};
  assert.throws(()=>restored.applySave(broken));assert.equal(restored.player.gold,gold);
});

test('reloading retains a wound, frost and combat recovery instead of cleansing them for free',()=>{
  const {game,enemy}=arena();projectile(game,enemy);
  const poison=createBestiaryEnemy('plague_spitter','poison-source',2030,1000,{level:20});
  game.world.enemies=[poison];game.player.invulnerable=0;projectile(game,poison);
  const snapshot=JSON.parse(JSON.stringify(game.capture()));
  const restored=new Game({storage:null});restored.applySave(snapshot);restored.start();
  assert.equal(restored.player.lastDamageAt,game.player.lastDamageAt);assert.equal(restored.inCombat(),true);
  assert.equal(restored.player.slowUntil,game.player.slowUntil);
  assert.deepEqual(restored.player.afflictions,game.player.afflictions);
  const hp=restored.player.hp;restored.time=1;restored.update(.04,{simulateWorld:false});assert.ok(restored.player.hp<hp);
  const broken=structuredClone(snapshot);broken.player.afflictions[0].damage=Infinity;
  const before=restored.player.hp;assert.throws(()=>restored.applySave(broken));assert.equal(restored.player.hp,before);
});
