import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dedicatedConfig, startDedicatedServer } from '../server/dedicated.mjs';
import { startServer } from '../server.mjs';

test('dedicated environment is bounded and rejects public save directories, wildcard origins and insecure internet addresses',()=>{
  const cwd=path.resolve('/private/tmp/emberfall-config-test'),base=dedicatedConfig({}, {cwd});
  assert.equal(base.host,'127.0.0.1');assert.equal(base.port,4173);assert.equal(base.allowedOrigin,null);assert.equal(base.storagePath,path.join(cwd,'.emberfall-server','rooms.json'));
  const configured=dedicatedConfig({HOST:'0.0.0.0',PORT:'8080',EMBERFALL_DATA_DIR:'private-progress',EMBERFALL_MAX_ROOMS:'8',EMBERFALL_ALLOWED_ORIGIN:'https://play.example.test/'},{cwd});
  assert.equal(configured.allowedOrigin,'https://play.example.test');assert.equal(configured.maxRooms,8);assert.equal(dedicatedConfig({EMBERFALL_ALLOWED_ORIGIN:'http://localhost:4174'},{cwd}).allowedOrigin,'http://localhost:4174');
  for(const env of [{PORT:'0'},{PORT:'70000'},{PORT:'NaN'},{HOST:'public.example.test'},{EMBERFALL_MAX_ROOMS:'33'},{EMBERFALL_ALLOWED_ORIGIN:'*'},{EMBERFALL_ALLOWED_ORIGIN:'http://public.example.test'},{EMBERFALL_ALLOWED_ORIGIN:'https://user:password@example.test'},{EMBERFALL_ALLOWED_ORIGIN:'https://example.test/api'},{EMBERFALL_ALLOWED_ORIGIN:'https://example.test?token=x'},{EMBERFALL_DATA_DIR:'assets/saves'},{EMBERFALL_DATA_DIR:'src/saves'},{EMBERFALL_DATA_DIR:'dist/saves'},{EMBERFALL_DATA_DIR:'/'},{EMBERFALL_DATA_DIR:cwd}])assert.throws(()=>dedicatedConfig(env,{cwd}));
});

test('dedicated Node server preserves real group tokens/progress on restart and exposes no save data through health or static paths',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-dedicated-v10-')),env={EMBERFALL_DATA_DIR:directory,EMBERFALL_ALLOWED_ORIGIN:'https://play.example.test',EMBERFALL_MAX_ROOMS:'8'};let running;
  try{
    running=await startDedicatedServer({env,port:0,autoTick:false});const origin=running.origin;
    const health=await fetch(origin+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ready',protocol:1,service:'emberfall-authority'});
    assert.equal((await fetch(origin+'/healthz',{method:'HEAD'})).status,200);assert.equal((await fetch(origin+'/healthz',{method:'POST'})).status,405);
    const allowed=await fetch(origin+'/api/rooms',{headers:{Origin:'https://play.example.test'}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://play.example.test');
    const preflight=await fetch(origin+'/api/rooms',{method:'OPTIONS',headers:{Origin:'https://play.example.test','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);
    assert.equal((await fetch(origin+'/api/rooms',{headers:{Origin:'https://unapproved.example.test'}})).status,403);
    const created=await fetch(origin+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerName:'Dauerhafte Reise',classId:'guardian'})}),session=await created.json();assert.equal(created.status,201);
    const member=running.hub.sessions.get(session.token);member.game.player.gold=313;running.hub.persist();
    const metadata=await fs.stat(path.join(directory,'rooms.json'));assert.equal(metadata.mode&0o777,0o600);
    const text=await (await fetch(origin+'/healthz')).text();assert.equal(text.includes(session.token),false);assert.equal(text.includes(directory),false);
    for(const pathname of ['/.emberfall-server/rooms.json','/server/dedicated.mjs','/rooms.json','/deploy/compose.yaml'])assert.equal((await fetch(origin+pathname)).status,404);
    running.hub.lastStorageError='private-file-name';const degraded=await fetch(origin+'/healthz');assert.equal(degraded.status,503);assert.equal((await degraded.text()).includes('private-file-name'),false);
    running.hub.persist();assert.equal((await fetch(origin+'/healthz')).status,200);
    await running.close();running=await startDedicatedServer({env,port:0,autoTick:false});
    const resumed=await fetch(running.origin+`/api/session/${session.token}`);assert.equal(resumed.status,200);assert.equal((await resumed.json()).player.gold,313);
    assert.equal((await fs.readdir(directory)).some(file=>file.startsWith('.write-probe-')),false);
  }finally{await running?.close();await fs.rm(directory,{recursive:true,force:true});}
});

test('a corrupt production store is rejected before listening and is never overwritten by a fresh group',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-corrupt-v10-')),filename=path.join(directory,'rooms.json');
  try{
    const corrupt='{ interrupted store';await fs.writeFile(filename,corrupt);
    await assert.rejects(startDedicatedServer({env:{EMBERFALL_DATA_DIR:directory},port:0,autoTick:false}),/sicher gelesen/);
    assert.equal(await fs.readFile(filename,'utf8'),corrupt);
    await fs.writeFile(filename,'[]');await assert.rejects(startDedicatedServer({env:{EMBERFALL_DATA_DIR:directory},port:0,autoTick:false}),/sicher gelesen/);
    assert.equal(await fs.readFile(filename,'utf8'),'[]');
    const invalidCharacter=JSON.stringify({'emberfall.multiplayer.v1':JSON.stringify({version:1,rooms:[{code:'ABCDEF01',members:[{}]}]})});
    await fs.writeFile(filename,invalidCharacter);await assert.rejects(startDedicatedServer({env:{EMBERFALL_DATA_DIR:directory},port:0,autoTick:false}),/sicher fortgesetzt/);
    assert.equal(await fs.readFile(filename,'utf8'),invalidCharacter);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('ordinary local startup retains the existing health-disabled behavior',async()=>{
  const running=await startServer({port:0,storagePath:null,autoTick:false});
  try{assert.equal((await fetch(running.origin+'/healthz')).status,404);assert.equal((await fetch(running.origin+'/')).status,200);}
  finally{await running.close();}
});
