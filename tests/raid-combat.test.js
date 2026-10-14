import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.mjs';
import { DUNGEONS, DUNGEON_ENEMIES } from '../src/dungeons.js';
import { getClass } from '../src/classes.js';
import { classPowerMultiplier, incomingDamage } from '../src/balance.js';

async function groupFixture(classes) {
  const running=await startServer({port:0,host:'127.0.0.1',storagePath:null,autoTick:false});
  const post=async(route,body)=>{const response=await fetch(running.origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const read=async session=>{const response=await fetch(`${running.origin}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const players=[];
  try {
    for(let i=0;i<classes.length;i++) {
      const created=await post(i?`/api/rooms/${players[0].roomCode}/join`:'/api/rooms',{playerName:`Raidheld ${i+1}`,classId:classes[i]});assert.equal(created.status,201);players.push(created.data);
    }
  } catch(error){await running.close();throw error;}
  const members=players.map(player=>running.hub.sessions.get(player.token));
  for(const member of members){member.game.player.level=95;member.game.player.hp=member.game.stats().maxHp;member.game.player.mana=member.game.stats().mana;}
  const room=running.hub.rooms.get(players[0].roomCode);
  const command=(index,command)=>post(`/api/session/${players[index].token}/command`,command);
  return {running,hub:running.hub,players,members,room,post,read,command,close:running.close};
}
const advance=(hub,seconds)=>{for(let remaining=seconds;remaining>1e-7;remaining-=.04)hub.tick(Math.min(.04,remaining));};
async function raidFixture(id) {
  const definition=DUNGEONS.find(d=>d.id===id),fixture=await groupFixture(Array(definition.partyRequired).fill('guardian'));
  for(const member of fixture.members)Object.assign(member.game.player,definition.entrance);
  const entered=await fixture.command(0,{type:'method',name:'enterDungeon',args:[id,1]});assert.equal(entered.data.accepted,true);
  const instance=fixture.members[0].game.dungeonInstance,boss=fixture.room.world.enemies.find(e=>e.type===definition.boss);
  // Isolate the authored boss from trash enemies and travel. All mutations here
  // are fixture setup inside the authority; browsers cannot submit these values.
  fixture.room.world.enemies=[boss];instance.gateOpened=true;
  for(const puzzle of instance.puzzles)puzzle.solved=true;
  const gate=fixture.room.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
  return {...fixture,definition,instance,boss};
}
function resetPlayers(fixture,positions) {
  for(let i=0;i<fixture.members.length;i++) {
    const game=fixture.members[i].game;game.dead=false;game.paused=false;game.keys.clear();
    Object.assign(game.player,{...positions[i],hp:game.stats().maxHp,invulnerable:0,shield:0,shieldUntil:0});
  }
}
function armMechanic(fixture,kind) {
  const {boss,instance}=fixture;
  instance.bossEngaged=true;instance.bossTime=kind==='spread'?13:1;
  instance.raidEncounter=null; // This fixture deliberately rewinds the combat clock.
  Object.assign(boss,{phase:'idle',attackTimer:0,aggro:true,telegraphMechanic:null,enraged:false});
  fixture.hub.tick(.04);
  assert.equal(boss.phase,'windup');assert.equal(boss.telegraphMechanic,kind);
  assert.ok(boss.attackTimer>1.6,'The shared server gives a readable warning before resolution');
}

test('server raid stack warns, splits damage across a valid group and wipes a missing stack through invulnerability',async()=>{
  const fixture=await raidFixture('sturmzitadelle');
  try {
    const origin={x:fixture.boss.x-50,y:fixture.boss.y};
    resetPlayers(fixture,[origin,{x:origin.x+25,y:origin.y},{x:origin.x+12,y:origin.y+25}]);
    const health=fixture.members.map(m=>m.game.player.hp);
    armMechanic(fixture,'stack');advance(fixture.hub,1.6);
    assert.deepEqual(fixture.members.map(m=>m.game.player.hp),health,'Warning time causes no premature damage');
    advance(fixture.hub,.12);
    assert.equal(fixture.boss.phase,'recover');assert.ok(fixture.members.every(m=>!m.game.dead));
    const validDamage=fixture.members.map((m,i)=>health[i]-m.game.player.hp);
    assert.ok(validDamage.every(d=>d>0));assert.ok(validDamage.every(d=>d===validDamage[0]),'Identical heroes share one stack hit fairly');
    resetPlayers(fixture,[origin,{x:1500,y:1250},{x:1660,y:1250}]);
    fixture.members.forEach(m=>{m.game.player.invulnerable=30;m.game.player.shield=m.game.stats().maxHp*.6;m.game.player.shieldUntil=10000;});
    armMechanic(fixture,'stack');advance(fixture.hub,1.72);
    assert.ok(fixture.members.every(m=>m.game.dead&&m.game.player.hp===0),'Only one human in the stack triggers a real wipe despite shields and roll invulnerability');
    const state=await fixture.read(fixture.players[1]);assert.equal(state.dead,true);assert.equal(state.player.hp,0);
    assert.equal(fixture.instance.bossDefeated,false);assert.equal(fixture.boss.alive,true);
  } finally{await fixture.close();}
});

test('server raid spread snapshots warning positions, punishes overlap and permits moving clear before impact',async()=>{
  const fixture=await raidFixture('sturmzitadelle');
  try {
    const origin={x:fixture.boss.x-50,y:fixture.boss.y};
    const separated=[origin,{x:1600,y:1000},{x:1230,y:1140}];
    resetPlayers(fixture,separated);const before=fixture.members.map(m=>m.game.player.hp);
    armMechanic(fixture,'spread');assert.equal(fixture.boss.spreadTargets.length,3);
    const warned=await fixture.read(fixture.players[0]);assert.equal(warned.hazards.filter(h=>h.kind==='warning').length,3);
    assert.equal(warned.world.enemies[0].telegraphMechanic,'spread');
    advance(fixture.hub,1.72);
    const isolatedDamage=fixture.members.map((m,i)=>before[i]-m.game.player.hp);assert.ok(isolatedDamage.every(d=>d>0));
    resetPlayers(fixture,[origin,{x:origin.x+20,y:origin.y},{x:origin.x+10,y:origin.y+20}]);
    armMechanic(fixture,'spread');advance(fixture.hub,1.72);
    for(let i=0;i<fixture.members.length;i++) {
      const overlapDamage=fixture.members[i].game.stats().maxHp-fixture.members[i].game.player.hp;
      assert.ok(Math.abs(overlapDamage-isolatedDamage[i]*3)<=2,'Three overlapping warnings multiply the resolved damage');
    }
    resetPlayers(fixture,[origin,{x:origin.x+20,y:origin.y},{x:origin.x+10,y:origin.y+20}]);
    const health=fixture.members.map(m=>m.game.player.hp);armMechanic(fixture,'spread');
    // Move authoritative fixture actors after the warning, leaving its captured
    // positions behind. The transport already tests actual server input movement.
    for(let i=0;i<fixture.members.length;i++)Object.assign(fixture.members[i].game.player,{x:1660+i*10,y:1000+i*10});
    advance(fixture.hub,1.72);assert.equal(fixture.boss.phase,'recover');
    assert.deepEqual(fixture.members.map(m=>m.game.player.hp),health,'Moving outside all marked circles avoids the impact');
  } finally{await fixture.close();}
});

test('server raid enrage starts with engagement and triples a resolved boss hit after its deadline',async()=>{
  const fixture=await raidFixture('sturmzitadelle');
  try {
    fixture.instance.gateOpened=false;fixture.instance.elapsed=10000;
    resetPlayers(fixture,[{x:220,y:320},{x:250,y:320},{x:280,y:320}]);advance(fixture.hub,2);
    assert.equal(fixture.instance.bossTime,0);assert.equal(fixture.boss.enraged,false,'Reading puzzles never burns the combat deadline');
    fixture.instance.gateOpened=true;
    const origin={x:fixture.boss.x-50,y:fixture.boss.y};
    resetPlayers(fixture,[origin,{x:1600,y:1050},{x:1220,y:1190}]);
    armMechanic(fixture,'spread');advance(fixture.hub,1.72);
    const normalDamage=fixture.members[0].game.stats().maxHp-fixture.members[0].game.player.hp;assert.ok(normalDamage>0);
    const armor=fixture.members[0].game.stats().armor,attackerLevel=fixture.boss.level;
    assert.equal(normalDamage,incomingDamage(fixture.boss.damage*1.3,{armor,attackerLevel}));
    const deadline=DUNGEON_ENEMIES[fixture.boss.type].mechanics.enrageSeconds;
    fixture.instance.bossTime=deadline-.05;fixture.boss.phase='recover';fixture.boss.attackTimer=10;
    fixture.hub.tick(.04);assert.equal(fixture.boss.enraged,false);fixture.hub.tick(.04);assert.equal(fixture.boss.enraged,true);
    // A new resolved swing follows recovery from the previous boss source.
    advance(fixture.hub,.2);
    resetPlayers(fixture,[origin,{x:1600,y:1050},{x:1220,y:1190}]);
    Object.assign(fixture.boss,{phase:'windup',attackTimer:.01,telegraphMechanic:'spread',spreadTargets:[origin],telegraphX:origin.x,telegraphY:origin.y});
    fixture.hub.tick(.04);
    const enragedDamage=fixture.members[0].game.stats().maxHp-fixture.members[0].game.player.hp;
    assert.equal(enragedDamage,incomingDamage(fixture.boss.damage*1.3*3,{armor,attackerLevel}));
    assert.ok(Math.abs(enragedDamage-normalDamage*3)<=2);
    assert.equal((await fixture.read(fixture.players[0])).world.enemies[0].enraged,true);
  } finally{await fixture.close();}
});

for(const id of ['sturmzitadelle','nachtschlund','weltenkern']) {
  test(`${id}: falling below the required living human count closes the damage window and summons cannot replace players`,async()=>{
    const fixture=await raidFixture(id);
    try {
      const bossPlates=fixture.room.world.puzzleObjects.filter(o=>o.kind==='boss_plate');
      for(let i=0;i<fixture.members.length;i++) {
        const game=fixture.members[i].game;
        Object.assign(game.player,i<bossPlates.length?bossPlates[i]:{x:1550,y:1200});game.player.invulnerable=100;
      }
      advance(fixture.hub,2.12);assert.equal(fixture.boss.shielded,false);
      const fallen=fixture.members.at(-1).game;
      fallen.damagePlayer(fallen.stats().maxHp*3,{trueDamage:true,ignoreInvulnerability:true});assert.equal(fallen.dead,true);
      for(let i=0;i<8;i++)fixture.members[0].game.summons.push({id:`fixture-servant-${i}`,x:bossPlates[i%bossPlates.length].x,y:bossPlates[i%bossPlates.length].y,life:20,damage:999999,attackTimer:0,actorId:fixture.members[0].id,color:'#aa88cc'});
      fixture.hub.tick(.04);assert.equal(fixture.boss.insufficientParty,true);assert.equal(fixture.boss.shielded,true);
      fixture.boss.hp=1;
      Object.assign(fixture.members[0].game.player,{x:fixture.boss.x-50,y:fixture.boss.y});
      await fixture.command(0,{type:'input',keys:[],angle:0});await fixture.command(0,{type:'action',name:'attack'});fixture.hub.tick(.04);
      assert.equal(fixture.boss.alive,true);assert.equal(fixture.boss.hp,1);assert.equal(fixture.instance.bossDefeated,false);
      assert.ok(fixture.members.every(m=>!(m.game.resources.raidSigil>0)&&!m.game.dungeonRecords[id]));
      const state=await fixture.read(fixture.players[0]);assert.equal(state.world.enemies[0].shielded,true);
      assert.equal(state.party.filter(p=>!p.dead).length,fixture.definition.partyRequired-1);
    } finally{await fixture.close();}
  });
  test(`${id}: a disconnect between server ticks cannot turn a stale shield window into an undersized raid kill`,async()=>{
    const fixture=await raidFixture(id);
    try {
      const plates=fixture.room.world.puzzleObjects.filter(o=>o.kind==='boss_plate');
      for(let i=0;i<fixture.members.length;i++){Object.assign(fixture.members[i].game.player,i<plates.length?plates[i]:{x:1550,y:1200});fixture.members[i].game.player.invulnerable=100;}
      advance(fixture.hub,2.12);assert.equal(fixture.boss.shielded,false);
      await fixture.post(`/api/session/${fixture.players.at(-1).token}/leave`,{});
      fixture.boss.hp=1;Object.assign(fixture.members[0].game.player,{x:fixture.boss.x-50,y:fixture.boss.y});
      await fixture.command(0,{type:'input',keys:[],angle:0});await fixture.command(0,{type:'action',name:'attack'});
      assert.equal(fixture.boss.alive,true,'Combat authority must check current humans at hit time, before the next scheduled tick');
      fixture.hub.tick(.04);assert.equal(fixture.instance.bossDefeated,false);
      assert.ok(fixture.members.every(m=>!m.game.dungeonRecords[id]&&!(m.game.resources.raidSigil>0)));
    } finally{await fixture.close();}
  });
  test(`${id}: a death during the boss update cannot permit an undersized kill before the next tick`,async()=>{
    const fixture=await raidFixture(id);
    try {
      const plates=fixture.room.world.puzzleObjects.filter(o=>o.kind==='boss_plate');
      for(let i=0;i<fixture.members.length;i++){Object.assign(fixture.members[i].game.player,i<plates.length?plates[i]:{x:1550,y:1200});fixture.members[i].game.player.invulnerable=100;}
      advance(fixture.hub,2.12);assert.equal(fixture.boss.shielded,false);
      const victim=fixture.members.at(-1).game;
      const target={x:fixture.boss.x-40,y:fixture.boss.y+10};Object.assign(victim.player,{...target,hp:1,invulnerable:0,shield:0});
      Object.assign(fixture.boss,{phase:'windup',attackTimer:.01,telegraphMechanic:'spread',spreadTargets:[target],telegraphX:target.x,telegraphY:target.y});
      fixture.hub.tick(.04);assert.equal(victim.dead,true,'A real resolved boss attack downs the missing human');
      fixture.boss.hp=1;Object.assign(fixture.members[0].game.player,{x:fixture.boss.x-50,y:fixture.boss.y});
      await fixture.command(0,{type:'input',keys:[],angle:0});await fixture.command(0,{type:'action',name:'attack'});
      assert.equal(fixture.boss.alive,true,'A hit after this tick must see the newly downed player immediately');
      fixture.hub.tick(.04);assert.equal(fixture.instance.bossDefeated,false);
      assert.ok(fixture.members.every(m=>!m.game.dungeonRecords[id]&&!(m.game.resources.raidSigil>0)));
    } finally{await fixture.close();}
  });
}

test('HTTP class ability authority heals nearby party members, rejects forged spell values and charges mana once',async()=>{
  const fixture=await groupFixture(['paladin','guardian','druid']);
  try {
    const [healer,near,far]=fixture.members.map(m=>m.game);
    fixture.room.world.enemies=[];
    Object.assign(healer.player,{x:2000,y:900,hp:100});Object.assign(near.player,{x:2050,y:900,hp:100});Object.assign(far.player,{x:2450,y:900,hp:100});
    const mana=healer.player.mana,skill=getClass('paladin').abilities.bolt;
    assert.equal((await fixture.command(0,{type:'action',name:'bolt',heal:999999,cost:0})).status,400);assert.equal(near.player.hp,100);assert.equal(healer.player.mana,mana);
    assert.equal((await fixture.command(0,{type:'method',name:'damagePlayer',args:[0]})).status,400);
    assert.equal((await fixture.command(0,{type:'action',name:'bolt'})).data.accepted,true);
    const expectedHeal=healer.stats().spellDamage*skill.healMultiplier*classPowerMultiplier('paladin','heal');
    assert.equal(near.player.hp,Math.min(near.stats().maxHp,100+expectedHeal));assert.equal(far.player.hp,100);
    assert.equal(healer.player.mana,mana-skill.cost);assert.equal(healer.cooldowns.bolt,skill.cooldown);
    assert.equal((await fixture.read(fixture.players[1])).player.hp,near.player.hp);
    assert.equal((await fixture.command(0,{type:'action',name:'bolt'})).data.accepted,false);assert.equal(healer.player.mana,mana-skill.cost);
    assert.equal((await fixture.command(0,{type:'method',name:'selectClass',args:['guardian']})).status,400);assert.equal(healer.player.classId,'paladin');
  } finally{await fixture.close();}
});
