import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const updater=path.resolve('deploy/update-from-git.sh'),old='a'.repeat(40),next='b'.repeat(40),older='c'.repeat(40);

// Execute the production shell and its actual archive/config/backup/hash logic.
// Only Git network, Docker daemon and public HTTP calls are deterministic peers.
// This does not claim an actual Docker/TLS deployment.
const peer=String.raw`#!/usr/bin/env python3
import hashlib,json,os,pathlib,shutil,subprocess,sys
root=pathlib.Path(os.environ['EF_UPDATER_TEST_ROOT']);args=sys.argv[1:];tool=pathlib.Path(sys.argv[0]).name;phase=os.environ.get('EF_UPDATER_TEST_FAILURE','')
old='a'*40;target='b'*40;older='c'*40
with (root/'events.jsonl').open('a') as output: output.write(json.dumps({'tool':tool,'args':args})+'\n')
state_file=root/'state.json';state=json.loads(state_file.read_text())
def save(): state_file.write_text(json.dumps(state))
def fail(message): print(message,file=sys.stderr);sys.exit(1)
def fingerprint(folder):
    files=[folder/'package.json',folder/'index.html',folder/'server.mjs']
    for name in ['src','server','assets']: files.extend(p for p in (folder/name).rglob('*') if p.is_file())
    digest=hashlib.sha256()
    for file in sorted(files,key=lambda f:f.relative_to(folder).as_posix().encode()): digest.update(file.relative_to(folder).as_posix().encode()+b'\0'+hashlib.sha256(file.read_bytes()).hexdigest().encode()+b'\n')
    return digest.hexdigest()
if tool=='flock': sys.exit(1 if phase=='lock' else 0)
if tool=='python3':
    code=sys.stdin.read()
    if phase=='metadata' and len(args)>1 and args[1]=='publish':
        code='import os\n_saved_replace=os.replace\ndef _fail_marker(source,destination):\n    if str(destination)=='+repr(args[3])+': raise OSError("Simulated metadata publication failure")\n    return _saved_replace(source,destination)\nos.replace=_fail_marker\n'+code
    completed=subprocess.run([os.environ['EF_UPDATER_TEST_PYTHON'],*args],input=code,text=True)
    sys.exit(completed.returncode)
if tool=='git':
    if args[0]=='clone': pathlib.Path(args[-1]).mkdir();sys.exit(0)
    args=args[2:]
    command=args[0]
    if command=='rev-parse': print('false' if args[1]=='--is-bare-repository' else target)
    elif command=='remote': print('https://example.invalid/other.git' if phase=='origin' else 'https://github.com/muuuhli/Emberfall.git')
    elif command=='merge-base': sys.exit(1 if args[2]==old and args[3]==older else 0)
    elif command=='ls-tree': print('100644 blob '+target+'\tindex.html')
    elif command=='archive': subprocess.run(['tar','-cf','-','-C',str(root/'source'),'.'],check=True)
    elif command not in ['fetch','cat-file']: fail('Unexpected Git operation')
    sys.exit(0)
if tool=='docker':
    if args[:2]==['compose','up'] and '--help' in args: print('--wait --wait-timeout');sys.exit(0)
    if args[0]=='inspect':
        form=args[2]
        if 'com.docker.compose.project' in form: print('emberfall')
        elif '.Config.Image' in form: print('emberfall:'+state['commit'])
        elif '.Mounts' in form: print('foreign_data' if phase=='volume' else 'emberfall_data')
        elif '.Image' in form: print('image-'+state['commit'])
        else: fail('Unexpected inspect')
        sys.exit(0)
    if args[:2]==['image','inspect']:
        tag=args[-1].split(':')[1];print('image-'+tag if args[3]=='{{.Id}}' else tag);sys.exit(0)
    if args[0]=='build':
        if phase=='build': fail('Simulated build failure')
        sys.exit(0)
    if args[0]=='run':
        json.loads(sys.stdin.read())
        if phase=='compatibility': fail('Simulated incompatible save')
        sys.exit(0)
    if args[0]!='compose': fail('Unexpected Docker operation')
    index=1
    while args[index].startswith('-'):
        if args[index] in ['--project-name','--env-file','-f']: index+=2
        else: fail('Unexpected Compose option')
    action=args[index];tail=args[index+1:];release=os.environ['EMBERFALL_RELEASE']
    if action=='ps': print('emberfall-container')
    elif action=='config':
        if '--format' in tail:
            print(json.dumps({'services':{'emberfall':{'image':'emberfall:'+release,'environment':{'EMBERFALL_AUTH_REQUIRE_HTTPS':'1','EMBERFALL_AUTH_COOKIE_SECURE':'1','EMBERFALL_SECURE_ORIGIN':'https://203.0.113.10:9443'},'volumes':[{'source':'emberfall_data','target':'/data'}]},'emberfall-https':{}},'volumes':{'emberfall_data':{'name':'wrong_data' if phase=='config' else 'emberfall_data'}}}))
    elif action=='stop': state['running']=False;save()
    elif action=='start': state['commit']=release;state['running']=True;save()
    elif action=='cp':
        if phase=='backup' and tail[-1].endswith('rooms.json'): fail('Simulated backup failure')
        pathlib.Path(tail[-1]).write_text(json.dumps(state['data']))
    elif action=='run': state['data']=json.loads(sys.stdin.read());save()
    elif action=='up':
        state['commit']=release;state['running']=True
        if release==target: state['data']={'version':99,'rooms':[],'private':'failed-upgrade'}
        save()
        if phase=='up' and release==target: fail('Simulated health wait failure')
    elif action=='exec': print('wrong-hash' if phase=='fingerprint' else fingerprint(root/'releases'/release))
    else: fail('Unexpected Compose operation')
    sys.exit(0)
if tool=='curl':
    url=args[args.index('-o')-1];output=pathlib.Path(args[args.index('-o')+1])
    if phase=='https' and url.endswith('/healthz'): fail('Simulated TLS verification failure')
    if url.endswith('/healthz'): output.write_text('{"ok":true}')
    elif url.endswith('/api/account'): output.write_text(json.dumps({'account':None,'requiresHTTPS':False,'secureOrigin':'https://203.0.113.10:9443'}))
    else:
        relative=url.split('https://203.0.113.10:9443/')[1];shutil.copyfile(root/'releases'/state['commit']/relative,output)
        if phase=='public-source': output.write_text('other build')
    sys.exit(0)
fail('Unknown peer')
`;

async function fixture({failure='',alteredRelease=false,privateSource=false,customMarkers=false}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-git-update-')),source=path.join(root,'source'),releases=path.join(root,'releases'),repo=path.join(root,'repo'),bin=path.join(root,'bin'),backup=path.join(root,'backups'),envFile=path.join(root,'operator.env');
  const files={'index.html':'<html>Emberfall</html>\n','package.json':'{"name":"emberfall","type":"module"}\n','server.mjs':'export const server=true;\n','server/accounts.mjs':'export const accounts=true;\n','server/validate-storage.mjs':'// Validator implementation has separate real integration tests.\n','src/main.js':'console.log("Emberfall");\n','src/style.css':'body{color:#fff}\n','assets/pixel.png':'pixeldata','deploy/compose.ip.yaml':'services: {}\n','deploy/compose.account.yaml':'services: {}\n','Dockerfile':'FROM node:24\n'};
  for(const [relative,text] of Object.entries(files)){const file=path.join(source,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);}
  if(privateSource)await fs.writeFile(path.join(source,'.env.private'),'PRIVATE_VALUE=must-not-be-released\n');
  await fs.mkdir(releases,{recursive:true});await fs.cp(source,path.join(releases,old),{recursive:true});
  if(alteredRelease){await fs.cp(source,path.join(releases,next),{recursive:true});await fs.writeFile(path.join(releases,next,'src/main.js'),'foreign change\n');}
  await fs.mkdir(repo);await fs.writeFile(path.join(repo,'foreign-work.txt'),'keep my uncommitted work\n');
  const python=spawnSync('python3',['-c','import sys;print(sys.executable)'],{encoding:'utf8'}).stdout.trim();
  await fs.mkdir(bin);for(const name of ['git','docker','curl','flock',...(failure==='metadata'?['python3']:[])])await fs.writeFile(path.join(bin,name),failure==='metadata'?peer.replace('#!/usr/bin/env python3',`#!${python}`):peer,{mode:0o755});
  const original={version:1,rooms:[],accounts:{private:'pre-update-account-state'}};await fs.writeFile(path.join(root,'state.json'),JSON.stringify({commit:old,running:true,data:original}));
  const config=`# private operator values\nEMBERFALL_RELEASE=${old}\nEMBERFALL_IP=203.0.113.10\nEMBERFALL_TLS_PORT=9443\nEMBERFALL_MAX_ACCOUNTS=32\nPRIVATE_VALUE=do-not-print-or-source\n`;await fs.writeFile(envFile,config,{mode:0o600});
  const currentLink=path.join(root,customMarkers?'custom-current':'current'),sourceMarker=path.join(root,customMarkers?'custom-source':'DEPLOYED_SOURCE');await fs.symlink(path.join(releases,old),currentLink);await fs.writeFile(sourceMarker,old+'\n',{mode:0o600});
  return{root,releases,repo,backup,envFile,original,config,currentLink,sourceMarker,
    run(ref='main'){return spawnSync('bash',[updater,ref,'--repo-dir',repo,'--release-root',releases,'--backup-root',backup,'--env-file',envFile,...(customMarkers?['--current-link',currentLink,'--source-marker',sourceMarker]:[])],{env:{...process.env,PATH:`${bin}:${process.env.PATH}`,EF_UPDATER_TEST_ROOT:root,EF_UPDATER_TEST_FAILURE:failure,EF_UPDATER_TEST_PYTHON:python},encoding:'utf8',timeout:20000});},
    async state(){return JSON.parse(await fs.readFile(path.join(root,'state.json'),'utf8'));},
    async events(){try{return (await fs.readFile(path.join(root,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}},
    async close(){await fs.rm(root,{recursive:true,force:true});}};
}
async function withFixture(options,run){const f=await fixture(options);try{return await run(f);}finally{await f.close();}}

test('Git updater pins main, builds before stop, retains foreign checkout work and verifies the actual source',()=>withFixture({},async f=>{
  const result=f.run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,new RegExp(next));assert.ok(!result.stdout.includes('do-not-print-or-source'));
  assert.equal(await fs.readFile(path.join(f.repo,'foreign-work.txt'),'utf8'),'keep my uncommitted work\n');assert.equal(await fs.readFile(f.envFile,'utf8'),f.config.replace(old,next));assert.equal((await fs.stat(f.envFile)).mode&0o777,0o600);
  assert.equal(await fs.readlink(f.currentLink),path.join(f.releases,next));assert.equal(await fs.readFile(f.sourceMarker,'utf8'),next+'\n');assert.equal((await fs.stat(f.sourceMarker)).mode&0o777,0o600);
  const events=await f.events(),build=events.findIndex(e=>e.tool==='docker'&&e.args[0]==='build'),stop=events.findIndex(e=>e.tool==='docker'&&e.args.includes('stop'));assert.ok(build>=0&&stop>build);
  assert.ok(events.some(e=>e.tool==='docker'&&e.args[0]==='run'&&e.args.includes('none')&&e.args.includes('server/validate-storage.mjs')&&!e.args.some(a=>a.includes('emberfall_data'))));assert.ok(events.some(e=>e.tool==='curl'&&e.args.includes('=https')));
  assert.ok(!events.some(e=>e.args.some(a=>['reset','clean','prune','down','--force'].includes(a))));const state=await f.state();assert.equal(state.commit,next);assert.equal(state.running,true);
  const dirs=(await fs.readdir(f.backup)).filter(name=>!name.startsWith('.'));assert.equal(dirs.length,1);const saved=path.join(f.backup,dirs[0],'rooms.json');assert.deepEqual(JSON.parse(await fs.readFile(saved,'utf8')),f.original);assert.equal((await fs.stat(saved)).mode&0o777,0o600);
}));

for(const failure of ['build','config','origin','volume','lock'])test(`Git updater aborts ${failure} before stopping the running game`,()=>withFixture({failure},async f=>{
  const result=f.run();assert.notEqual(result.status,0);const state=await f.state();assert.equal(state.commit,old);assert.equal(state.running,true);assert.deepEqual(state.data,f.original);assert.equal(await fs.readFile(f.envFile,'utf8'),f.config);assert.ok(!(await f.events()).some(e=>e.args.includes('stop')));
}));

for(const failure of ['backup','compatibility'])test(`Git updater restarts unchanged code after a ${failure} failure before switching`,()=>withFixture({failure},async f=>{
  const result=f.run();assert.notEqual(result.status,0);const state=await f.state();assert.equal(state.commit,old);assert.equal(state.running,true);assert.deepEqual(state.data,f.original);assert.equal(await fs.readFile(f.envFile,'utf8'),f.config);assert.ok((await f.events()).some(e=>e.args.includes('start')));
}));

for(const failure of ['up','fingerprint','https','public-source'])test(`Git updater restores the matching account backup after ${failure} fails after replacement`,()=>withFixture({failure},async f=>{
  const result=f.run(next);assert.notEqual(result.status,0);assert.match(result.stderr,/Previous release restored/);const state=await f.state();assert.equal(state.commit,old);assert.equal(state.running,true);assert.deepEqual(state.data,f.original);assert.equal(await fs.readFile(f.envFile,'utf8'),f.config);
  const dirs=(await fs.readdir(f.backup)).filter(name=>!name.startsWith('.'));const failed=path.join(f.backup,dirs[0],'failed-state.json');assert.equal((await fs.stat(failed)).mode&0o777,0o600);assert.equal(JSON.parse(await fs.readFile(failed,'utf8')).version,99);
  assert.equal(await fs.readlink(f.currentLink),path.join(f.releases,old));assert.equal(await fs.readFile(f.sourceMarker,'utf8'),old+'\n');
}));

test('Git updater publishes explicitly configured metadata paths only after public source verification',()=>withFixture({customMarkers:true},async f=>{
  const result=f.run();assert.equal(result.status,0,result.stderr);assert.equal(await fs.readlink(f.currentLink),path.join(f.releases,next));assert.equal(await fs.readFile(f.sourceMarker,'utf8'),next+'\n');
  const events=await f.events();assert.ok(events.some(event=>event.tool==='curl'&&event.args.some(arg=>arg.endsWith('/src/style.css'))));assert.equal((await fs.stat(f.sourceMarker)).mode&0o777,0o600);
}));

test('a failed second metadata publication restores the first marker and its matching config/save',()=>withFixture({failure:'metadata',customMarkers:true},async f=>{
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Simulated metadata publication failure/);assert.match(result.stderr,/Previous release restored/);assert.equal(await fs.readlink(f.currentLink),path.join(f.releases,old));assert.equal(await fs.readFile(f.sourceMarker,'utf8'),old+'\n');assert.equal(await fs.readFile(f.envFile,'utf8'),f.config);assert.deepEqual((await f.state()).data,f.original);
}));

test('Git updater refuses altered release files without overwriting them',()=>withFixture({alteredRelease:true},async f=>{
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/preserved without overwrite/);assert.equal(await fs.readFile(path.join(f.releases,next,'src/main.js'),'utf8'),'foreign change\n');assert.ok(!(await f.events()).some(e=>e.args.includes('stop')));
}));

test('Git updater refuses private runtime configuration in an archive',()=>withFixture({privateSource:true},async f=>{
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Private environment file/);assert.ok(!(await f.events()).some(e=>e.args.includes('stop')));assert.equal(await fs.readFile(f.envFile,'utf8'),f.config);
}));

test('Git updater refuses a downgrade instead of opening accounts with old code',()=>withFixture({},async f=>{
  const result=f.run(older);assert.notEqual(result.status,0);assert.match(result.stderr,/Only forward updates/);assert.ok(!(await f.events()).some(e=>e.args.includes('stop')));
}));
