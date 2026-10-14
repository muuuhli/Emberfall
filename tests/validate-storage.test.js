import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {startServer} from '../server.mjs';
import {validateRoomStorage} from '../server/validate-storage.mjs';
import {generateLoot} from '../src/loot.js';
import {cumulativeXp} from '../src/progression.js';
import {QUESTS} from '../src/catalog.js';

const STORE_KEY='emberfall.multiplayer.v1',validator=path.resolve('server/validate-storage.mjs');
const cli=bytes=>spawnSync(process.execPath,[validator],{input:bytes,encoding:'utf8',timeout:30000});

test('the deployment validator reads the actual file envelope and strictly restores accounts, a group, a private home and legal progression',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-native-backup-')),filename=path.join(directory,'rooms.json');
  let server;
  try {server=await startServer({port:0,storagePath:filename,autoTick:false,strictStorage:true});}
  catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
  const base=`http://127.0.0.1:${server.server.address().port}`;
  const request=async(route,body,cookie='',playerId=null)=>{
    const response=await fetch(`${base}${route}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'}),...(playerId?{'X-Emberfall-Player-Id':playerId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  let closed=false;
  try {
    // These are generated test accounts only. No fixture save is committed.
    const password='test-only-native-backup-2026';
    const groupAccount=await request('/api/account/register',{username:'BackupGroup',password,playerName:'Testwächter',classId:'guardian'});
    const homeAccount=await request('/api/account/register',{username:'BackupHome',password,playerName:'Testheiler',classId:'druid'});
    assert.equal(groupAccount.status,201);assert.equal(homeAccount.status,201);
    const groupMember=server.hub.accountMembers.get(groupAccount.data.account.id),homeMember=server.hub.accountMembers.get(homeAccount.data.account.id);
    assert.equal((await request('/api/account/play',{},groupAccount.cookie,groupMember.id)).status,200);
    assert.equal((await request('/api/account/rooms',{name:'Prüfgruppe'},groupAccount.cookie,groupMember.id)).status,201);
    groupMember.game.gainXp(cumulativeXp(27));assert.equal(groupMember.game.player.level,27);
    groupMember.game.player.gold=517;groupMember.game.resources.wood=23;
    const item=generateLoot({level:27,baseId:'iron_longsword',classId:'guardian',rarity:'rare',uid:'native-backup-gear',rng:()=>.5});
    assert.equal(groupMember.game.addItem(item),true);assert.equal(groupMember.game.equip(item.id),true);
    const quest=QUESTS.find(entry=>groupMember.game.canAccept(entry));assert.ok(quest);assert.equal(groupMember.game.questAccept(quest.id),true);
    homeMember.game.gainXp(cumulativeXp(12));homeMember.game.player.gold=89;
    const expectedGroup=groupMember.game.capture(),expectedHome=homeMember.game.capture(),groupId=groupMember.id,homeId=homeMember.id,groupAccountId=groupAccount.data.account.id,homeAccountId=homeAccount.data.account.id;
    assert.equal(server.hub.persist(),true);await server.close();closed=true;
    const bytes=await fs.readFile(filename),outer=JSON.parse(bytes),checkpoint=JSON.parse(outer[STORE_KEY]);
    assert.equal(typeof outer[STORE_KEY],'string');assert.equal(checkpoint.accounts.records.length,2);assert.ok(!bytes.toString().includes(password));
    const restored=validateRoomStorage(bytes),restoredGroup=restored.accountMembers.get(groupAccountId),restoredHome=restored.accountMembers.get(homeAccountId);
    assert.equal(restoredGroup.id,groupId);assert.equal(restoredHome.id,homeId);assert.equal(restoredGroup.room.accountHome,undefined);assert.equal(restoredHome.room.accountHome,true);
    assert.equal(restoredGroup.game.player.level,27);assert.equal(restoredGroup.game.player.gold,517);assert.equal(restoredGroup.game.resources.wood,23);
    assert.deepEqual(restoredGroup.game.equipment,expectedGroup.equipment);assert.deepEqual(restoredGroup.game.generatedItems[item.id],item);assert.equal(restoredGroup.game.canEquipItem(item.id),true);assert.deepEqual(restoredGroup.game.questState,expectedGroup.questState);
    assert.equal(restoredHome.game.player.level,expectedHome.player.level);assert.equal(restoredHome.game.player.gold,89);
    assert.deepEqual(restored.accounts.capture(),checkpoint.accounts);assert.equal(restored.timer,undefined);assert.equal(restored.persist(),false,'The inspection authority cannot write any snapshot');
    assert.deepEqual(await fs.readFile(filename),bytes,'Validation did not modify the source backup');
    const accepted=cli(bytes);assert.equal(accepted.status,0);assert.equal(accepted.stdout,'');assert.equal(accepted.stderr,'');
    const invalid=structuredClone(checkpoint);invalid.rooms.find(room=>!room.accountHome).members[0].save.player.level=0;
    assert.throws(()=>validateRoomStorage(JSON.stringify({...outer,[STORE_KEY]:JSON.stringify(invalid)})));
    const rejected=cli(JSON.stringify({...outer,[STORE_KEY]:JSON.stringify(invalid)}));assert.notEqual(rejected.status,0);assert.equal(rejected.stdout,'');assert.match(rejected.stderr,/nicht kompatibel/);assert.ok(!rejected.stderr.includes(password));assert.ok(!rejected.stderr.includes(groupAccountId));
  } finally {if(!closed)await server.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('the real validator CLI rejects malformed envelopes and missing, null or unsupported checkpoints without echoing their payload',()=>{
  const invalid=['secret-malformed-json','null','[]','{}',JSON.stringify({[STORE_KEY]:{version:1,rooms:[]}}),JSON.stringify({[STORE_KEY]:'secret-inner-json'}),JSON.stringify({[STORE_KEY]:'null'}),JSON.stringify({[STORE_KEY]:JSON.stringify({version:99,rooms:[]})}),JSON.stringify({[STORE_KEY]:JSON.stringify({version:1,rooms:{}})})];
  for(const bytes of invalid){const result=cli(bytes);assert.notEqual(result.status,0);assert.equal(result.stdout,'');assert.match(result.stderr,/nicht kompatibel/);assert.ok(!result.stderr.includes('secret-malformed-json'));assert.ok(!result.stderr.includes('secret-inner-json'));}
  const empty=cli(JSON.stringify({[STORE_KEY]:JSON.stringify({version:1,rooms:[]})}));assert.equal(empty.status,0);assert.equal(empty.stdout,'');assert.equal(empty.stderr,'');
});
