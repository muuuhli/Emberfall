import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { ABILITIES, getAbility, canLearnAbility, getLearnedAbilities } from '../src/abilities.js';
import { CLASSES } from '../src/classes.js';
import { generateLoot } from '../src/loot.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';

const clone=v=>JSON.parse(JSON.stringify(v));
let serial=0;
function arena(classId='guardian',level=25) {
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);
  game.player.id=`ability-test-${++serial}`;game.player.level=level;game.player.skillPoints=6;
  game.player.x=3000;game.player.y=2000;game.player.face=0;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  game.npcs=[];game.updateEnemies=()=>{};game.start();return game;
}
function enemy(game,dx=60,changes={}) {
  const e={id:`enemy-${game.world.enemies.length}`,type:'wolf',x:game.player.x+dx,y:game.player.y,homeX:game.player.x+dx,homeY:game.player.y,hp:10000,maxHp:10000,alive:true,phase:'idle',attackTimer:99,...changes};
  game.world.enemies.push(e);return e;
}
function party(...games) {for(const game of games){game.world=games[0].world;game.partyGames=games;for(const key of ['projectiles','hazards','summons','effects','drops'])game[key]=games[0][key];}return games;}
function advance(game,seconds) {for(let t=0;t<seconds-1e-8;t+=.02){for(const ally of game.partyGames)ally.update(.02,{simulateWorld:false});game.updateWorld(.02,game.partyGames);}}
function prepare(game,id) {for(const a of ABILITIES.filter(a=>a.classId===game.player.classId&&a.level<=getAbility(id).level))assert.equal(game.learnAbility(a.id),true);game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,null);assert.equal(game.setAbilityLoadout(0,id),true);}

test('all eight classes have three real learning milestones and strict class, level, points and prerequisites',()=>{
  assert.equal(ABILITIES.length,24);assert.equal(new Set(ABILITIES.map(a=>a.id)).size,24);
  for(const cls of CLASSES) {
    const defs=ABILITIES.filter(a=>a.classId===cls.id);assert.deepEqual(defs.map(a=>a.level),[4,12,25]);
    const game=arena(cls.id,3),[first,second,third]=defs;
    assert.equal(canLearnAbility(game,first.id).ok,false);assert.equal(game.learnAbility(first.id),false);
    game.player.level=25;assert.equal(game.learnAbility(second.id),false);
    const foreign=ABILITIES.find(a=>a.classId!==cls.id);assert.equal(game.learnAbility(foreign.id),false);
    game.player.skillPoints=0;assert.equal(game.learnAbility(first.id),false);game.player.skillPoints=6;
    assert.equal(game.learnAbility(first.id),true);assert.equal(game.player.skillPoints,5);assert.equal(game.learnAbility(first.id),false);
    assert.equal(game.learnAbility(second.id),true);assert.equal(game.player.skillPoints,3);
    assert.equal(game.learnAbility(third.id),true);assert.equal(game.player.skillPoints,0);
    assert.deepEqual(game.abilityLoadout,[first.id,second.id]);assert.equal(getLearnedAbilities(game).length,3);
    assert.equal(game.setAbilityLoadout(0,second.id),false);assert.equal(game.setAbilityLoadout(2,third.id),false);assert.equal(game.setAbilityLoadout('0',third.id),false);
    assert.equal(game.setAbilityLoadout(0,third.id),true);assert.equal(game.setAbilityLoadout(0,null),true);
  }
});

test('every learned skill pays mana once, animates and has a real combat / support effect',()=>{
  for(const a of ABILITIES) {
    const game=arena(a.classId),ally=arena('guardian');ally.player.x=game.player.x+20;ally.player.hp=ally.stats().maxHp*.5;
    party(game,ally);prepare(game,a.id);game.player.hp=game.stats().maxHp*.8;
    const target=enemy(game,['trap','fan','projectile','meteor','summon','storm','curse'].includes(a.kind)?140:60);
    game.aim={x:target.x,y:target.y};
    if(a.kind==='revive'){ally.dead=true;ally.paused=true;ally.player.hp=0;}
    if(a.kind==='bargain')game.player.mana=game.stats().mana*.4;
    const hp=game.player.hp,allyHp=ally.player.hp,mana=game.player.mana,enemyHp=target.hp;
    assert.equal(game.useLearnedAbility(0),true,a.id);
    if(a.kind!=='bargain')assert.equal(game.player.mana,mana-a.cost,a.id);
    assert.ok(game.player.castUntil>game.time);assert.ok(game.cooldowns[`ability:${a.id}`]>0);
    assert.equal(game.useLearnedAbility(0),false,`${a.id}: cooldown`);
    if(a.kind==='shield'||a.kind==='partyShield'||a.kind==='taunt')assert.ok(game.player.shield>0,a.id);
    if(a.kind==='partyShield')assert.ok(ally.player.shield>0);
    if(a.kind==='taunt')assert.equal(target.targetId,game.player.id);
    if(a.kind==='mend')assert.ok(ally.player.hp>allyHp);
    if(a.kind==='escape')assert.ok(game.player.x<3000&&game.player.invulnerable>0);
    if(a.kind==='revive'){assert.equal(ally.dead,false);assert.equal(ally.player.hp,ally.stats().maxHp*.25);}
    if(a.kind==='bargain'){assert.equal(game.player.hp,hp*.85);assert.ok(game.player.mana>mana);}
    if(a.kind==='summon')assert.equal(game.summons.length,a.count);
    advance(game,2.05);
    if(['cone','execute','fan','projectile','trap','meteor','sanctum','storm','curse','summon'].includes(a.kind))assert.ok(target.hp<enemyHp,`${a.id}: actual damage`);
    if(a.kind==='regeneration')assert.ok(ally.player.hp>allyHp,a.id);
    if(a.kind==='sanctum')assert.ok(ally.player.hp>allyHp,a.id);
    if(a.kind==='storm'||a.kind==='trap')assert.ok(target.slowFactor<1,a.id);
  }
});

test('meteor advertises its actual impact area, waits one second and damages once',()=>{
  const game=arena('flamecaller');prepare(game,'flamecaller_meteor');const target=enemy(game,220),outside=enemy(game,400);game.aim={x:target.x,y:target.y};
  game.useLearnedAbility(0);const warning=game.hazards.find(h=>h.kind==='meteor');assert.equal(warning.x,target.x);assert.equal(warning.radius,115);assert.equal(warning.windup,true);
  advance(game,.8);assert.equal(target.hp,10000);advance(game,.3);assert.ok(target.hp<10000);assert.equal(outside.hp,10000);
  const hp=target.hp;advance(game,2);assert.equal(target.hp,hp);assert.equal(game.hazards.some(h=>h.kind==='meteor'),false);
});

test('new support and control skills complement the base kit at their actual range',()=>{
  const guardian=arena();prepare(guardian,'guardian_bulwark');const front=enemy(guardian,90),back=enemy(guardian,-90);guardian.useLearnedAbility(0);
  assert.ok(front.hp<10000);assert.equal(back.hp,10000);assert.equal(front.slowFactor,.55);assert.equal(front.slowUntil,2);
  const paladin=arena('paladin'),farAlly=arena();farAlly.player.x=paladin.player.x+330;farAlly.player.hp=100;party(paladin,farAlly);prepare(paladin,'paladin_mend');
  paladin.useLearnedAbility(0);assert.ok(farAlly.player.hp>100,'New single-target light reaches beyond the base group heal.');
  const druid=arena('druid'),tank=arena();tank.player.x=druid.player.x+220;party(druid,tank);prepare(druid,'druid_grove');druid.useLearnedAbility(0);assert.ok(tank.player.shield>0,'Life bark prevents damage rather than duplicating the base regeneration.');
});

test('guardian learned charge changes taunt position and stops at real collision walls',()=>{
  const game=arena();prepare(game,'guardian_challenge');const target=enemy(game,390);game.useLearnedAbility(0);
  assert.ok(Math.abs(game.player.x-3160)<1e-6);assert.equal(target.targetId,game.player.id,'A distant foe enters the new taunt only after charging.');
  const blocked=arena();prepare(blocked,'guardian_challenge');blocked.world.structures.push({x:3050,y:1900,w:30,h:200,blocking:true,collision:{x:3050,y:1900,w:30,h:200}});blocked.useLearnedAbility(0);
  assert.ok(blocked.player.x<3050-12,'Charging must not tunnel through an obstacle.');
});

test('learned casts reject dead / paused / unlearned / empty / forged class and cannot reset cooldown by swapping slots',()=>{
  const game=arena();prepare(game,'guardian_bulwark');const mana=game.player.mana;
  for(const state of ['dead','paused']){game[state]=true;assert.equal(game.useLearnedAbility(0),false);assert.equal(game.player.mana,mana);game[state]=false;}
  game.started=false;assert.equal(game.useLearnedAbility(0),false);game.started=true;
  game.player.mana=1;assert.equal(game.useLearnedAbility(0),false);game.player.mana=mana;
  assert.equal(game.useLearnedAbility(-1),false);assert.equal(game.useLearnedAbility('0'),false);assert.equal(game.useLearnedAbility(1),false);
  assert.equal(game.useLearnedAbility(0),true);const cooldown=game.cooldowns['ability:guardian_bulwark'];
  game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,'guardian_bulwark');assert.equal(game.useLearnedAbility(1),false);assert.equal(game.cooldowns['ability:guardian_bulwark'],cooldown);
  game.learnedAbilities.flamecaller_cinder=true;game.abilityLoadout[0]='flamecaller_cinder';assert.equal(game.useLearnedAbility(0),false);
});

test('a failed target preflight spends nothing; curse drain uses actual damage and never revives a dead caster',()=>{
  const druid=arena('druid');prepare(druid,'druid_rebirth');const mana=druid.player.mana;assert.equal(druid.useLearnedAbility(0),false);assert.equal(druid.player.mana,mana);assert.equal(druid.cooldowns['ability:druid_rebirth'],undefined);
  const game=arena('shadowbinder');prepare(game,'shadowbinder_curse');game.player.hp=50;const target=enemy(game,100,{hp:2,maxHp:1000});
  game.useLearnedAbility(0);advance(game,1.02);assert.equal(target.alive,false);assert.ok(game.player.hp>50&&game.player.hp<52,'Only two actual enemy HP can fund drain + existing lifesteal.');
  game.dead=true;game.player.hp=0;assert.equal(game._healAbilityAlly(game,50),0);assert.equal(game.player.hp,0);
});

test('core Drain and learned Curse apply the 0.5 role-heal factor exactly once, then active healing reduction',()=>{
  for(const kind of ['core','curse'])for(const debuff of ['none','active','expired']) {
    const game=arena('shadowbinder'),derive=game.stats.bind(game);
    // Isolate active Drain from the separate percentage-based gear/class leech.
    // Damage, mana, collision and target HP still use the actual Game loop.
    game.stats=(...args)=>({...derive(...args),lifeSteal:0});
    if(kind==='curse')prepare(game,'shadowbinder_curse');
    game.player.hp=50;game.player.healingReduction=debuff==='none'?0:.6;game.player.healingReductionUntil=debuff==='active'?10:0;
    const target=enemy(game,100),ratio=kind==='core'?.225:.15;
    if(kind==='core'){assert.equal(game.action('bolt'),true);assert.equal(game.projectiles[0].drain,.45*.5);}
    else {assert.equal(game.useLearnedAbility(0),true);assert.equal(game.hazards.find(h=>h.kind==='curse').drain,.3*.5);}
    const before=target.hp;advance(game,kind==='core'?.3:1.02);const applied=before-target.hp;
    assert.ok(applied>0);
    const expected=applied*ratio*(debuff==='active'?.4:1);
    assert.ok(Math.abs(game.player.hp-50-expected)<1e-8,`${kind}/${debuff}: real ${game.player.hp-50}, expected ${expected}`);
  }
});

test('passive percentage lifesteal respects a 60% healing debuff and never restores HP to a dead caster',()=>{
  const game=arena('shadowbinder');game.player.hp=50;game.player.healingReduction=.6;game.player.healingReductionUntil=10;
  const fraction=game.stats().lifeSteal,target=enemy(game,100),applied=game.hitEnemy(target,100,0);
  assert.ok(fraction>0);assert.ok(applied>0);
  assert.ok(Math.abs(game.player.hp-50-applied*fraction*.4)<1e-8,'Passive leech remains a percentage, then receives the debuff once.');
  game.dead=true;game.player.hp=0;game.hitEnemy(target,100,0);assert.equal(game.player.hp,0);assert.equal(game.dead,true);
});

test('learning, loadout and remaining cooldown survive save/reload; malformed ability imports reject atomically',()=>{
  const game=arena('ranger');prepare(game,'ranger_hawk');game.useLearnedAbility(0);const data=clone(game.capture()),restored=new Game({storage:null});restored.applySave(data);
  assert.deepEqual(restored.learnedAbilities,game.learnedAbilities);assert.deepEqual(restored.abilityLoadout,game.abilityLoadout);
  assert.equal(restored.cooldowns['ability:ranger_hawk'],game.cooldowns['ability:ranger_hawk']);
  const original=clone(game.capture());original.savedAt=0;
  for(const change of [
    d=>{d.learnedAbilities.guardian_bulwark=true;},d=>{d.player.level=3;},d=>{delete d.learnedAbilities.ranger_volley;},
    d=>{d.learnedAbilities.ranger_hawk=false;},d=>{d.abilityLoadout=['ranger_hawk','ranger_hawk'];},d=>{d.abilityLoadout=['unknown',null];},
    d=>{d.abilityCooldowns.ranger_hawk=-1;},d=>{d.abilityCooldowns.ranger_hawk=999;},d=>{d.learnedAbilities=[];},
  ]) {const bad=clone(original);change(bad);assert.throws(()=>game.applySave(bad));const after=clone(game.capture());after.savedAt=0;assert.deepEqual(after,original);}
  for(const version of [1,2]) {const legacy=clone(data);legacy.version=version;delete legacy.learnedAbilities;delete legacy.abilityLoadout;delete legacy.abilityCooldowns;restored.applySave(legacy);assert.deepEqual(restored.learnedAbilities,{});assert.deepEqual(restored.abilityLoadout,[null,null]);assert.equal(restored.player.level,25);}
});

test('equipment comparison uses final set-aware totals; equip class gates and unequip preserve inventory and legacy gear',()=>{
  const game=arena('guardian',60),weapon=generateLoot({level:60,classId:'guardian',baseId:'iron_longsword',rarity:'legendary',rng:()=>.5,uid:'equip-check'});
  game.addItem(weapon);const before=game.stats(),preview=game.previewEquipment(weapon.id);assert.deepEqual(game.stats(),before);
  assert.equal(game.equip(weapon.id),true);assert.deepEqual(game.stats(),preview.after);assert.equal(preview.delta.damage,preview.after.damage-before.damage);
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;const count=game.inventory[weapon.id];assert.equal(game.unequip('weapon'),true);assert.equal(game.inventory[weapon.id],count);assert.equal(game.equipment.weapon,null);
  assert.ok(game.player.hp<=game.stats().maxHp&&game.player.mana<=game.stats().mana);assert.equal(game.unequip('weapon'),false);assert.equal(game.unequip('__proto__'),false);
  const bow=generateLoot({level:60,classId:'ranger',baseId:'greenwood_bow',rarity:'rare',rng:()=>.5,uid:'foreign-bow'});game.addItem(bow);assert.equal(game.equip(bow.id),false);assert.ok(game.previewEquipment(bow.id));
  const legacy=clone(game.capture());legacy.equipment.weapon=bow.id;game.applySave(legacy);assert.equal(game.equipment.weapon,bow.id,'Legacy equipped gear is retained during migration.');assert.equal(game.equip(bow.id),false);
});

test('real HTTP server learns and casts authoritatively, snapshots the new fields and rejects forged commands',async()=>{
  const hub=new MultiplayerHub({autoStart:false,createGame:()=>arena('guardian',4)}),server=http.createServer((req,res)=>hub.handle(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  try {
    const created=await post('/api/rooms',{classId:'guardian',playerName:'Tank'});assert.equal(created.status,201);const route=`/api/session/${created.data.token}/command`,game=hub.sessions.get(created.data.token).game;
    assert.equal((await post(route,{type:'method',name:'learnAbility',args:['guardian_bulwark']})).data.accepted,true);
    const mana=game.player.mana;assert.equal((await post(route,{type:'method',name:'useLearnedAbility',args:[0]})).data.accepted,true);assert.equal(game.player.mana,mana-getAbility('guardian_bulwark').cost);
    assert.equal((await post(route,{type:'method',name:'useLearnedAbility',args:[0]})).data.accepted,false);
    assert.equal((await post(route,{type:'method',name:'learnAbility',args:['flamecaller_cinder']})).data.accepted,false);
    assert.equal((await post(route,{type:'method',name:'setAbilityLoadout',args:[0,null]})).data.accepted,true);
    assert.equal((await post(route,{type:'method',name:'setAbilityLoadout',args:[0,'guardian_sunder']})).data.accepted,false);
    assert.equal((await post(route,{type:'method',name:'useLearnedAbility',args:[0],damage:9999})).status,400);
    assert.equal((await post(route,{type:'method',name:'applySave',args:[]})).status,400);
    const snapshot=hub.snapshot(hub.sessions.get(created.data.token));assert.equal(snapshot.learnedAbilities.guardian_bulwark,true);assert.deepEqual(snapshot.abilityLoadout,[null,null]);assert.ok(snapshot.cooldowns['ability:guardian_bulwark']>0);
  } finally {hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('network actions flush the newest pending aim after an existing movement flight',async()=>{
  const game=arena(),calls=[];let release,blockFirst=true;
  const network=new NetworkClient(game,{baseUrl:'http://local.test',storage:null,clock:()=>100,fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);if(blockFirst){blockFirst=false;await new Promise(resolve=>{release=resolve;});}return {ok:true,json:async()=>({accepted:true})};
  }});network.active=true;network.status='online';network.token='test';
  network.sendInput(new Set(['d']),0);network.sendInput(new Set(),Math.PI/2);
  const casting=network.command('useLearnedAbility',0);await Promise.resolve();assert.equal(calls.length,1);
  release();await casting;assert.deepEqual(calls.map(c=>c.type),['input','input','method']);assert.equal(calls[1].angle,Math.PI/2);assert.equal(calls[2].name,'useLearnedAbility');
  calls.length=0;network._lastInputAt=100;network.sendInput(new Set(),Math.PI);await network.sendAction('bolt');assert.deepEqual(calls.map(c=>c.type),['input','action']);assert.equal(calls[0].angle,Math.PI);
});

test('authoritative room persistence restores learned choices and remaining cooldown with the same resume token',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const hub=new MultiplayerHub({autoStart:false,storage,createGame:()=>arena('guardian',25)});
  const room={code:'A1B2C3D4',name:'Skills',createdAt:0,lastActive:0,time:0,members:new Map(),world:null};hub.rooms.set(room.code,room);
  const member=hub._createMember(room,{classId:'guardian',playerName:'Tank'});
  assert.equal(hub.command(member,{type:'method',name:'learnAbility',args:['guardian_bulwark']}),true);
  assert.equal(hub.command(member,{type:'method',name:'useLearnedAbility',args:[0]}),true);
  const cooldown=member.game.cooldowns['ability:guardian_bulwark'],token=member.token;
  hub.dispose();
  const restored=new MultiplayerHub({autoStart:false,storage,createGame:()=>arena('guardian',25)});
  try {const resumed=restored.sessions.get(token);assert.ok(resumed);assert.equal(resumed.game.learnedAbilities.guardian_bulwark,true);assert.deepEqual(resumed.game.abilityLoadout,['guardian_bulwark',null]);assert.equal(resumed.game.cooldowns['ability:guardian_bulwark'],cooldown);assert.equal(resumed.active,false);}
  finally {restored.dispose();}
});
