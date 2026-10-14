import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MultiplayerHub,createFileRoomStorage} from './multiplayer.mjs';
import {createServerGameFactory} from './game-factory.mjs';

const STORE_KEY='emberfall.multiplayer.v1';
function assertCheckpoint(text) {
  const value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Array.isArray(value.rooms))throw new Error('Unsupported saved authority checkpoint.');
}

/** Restore a private backup with the same readers/factory as production.
 * No server, ticks, external network, or writes to the supplied snapshot.
 * The returned authority is for inspection only; its persistence is disabled.
 */
export function validateRoomStorage(bytes,{createGame=createServerGameFactory(),clock=Date.now}={}) {
  if(!(typeof bytes==='string'||Buffer.isBuffer(bytes)))throw new TypeError('A saved file is required.');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'emberfall-storage-check-'));
  try {
    const filename=path.join(directory,'rooms.json');
    fs.writeFileSync(filename,bytes,{mode:0o600,flag:'wx'});
    const reader=createFileRoomStorage(filename,{strictRead:true}),checkpoint=reader.getItem(STORE_KEY);
    if(typeof checkpoint!=='string'||!checkpoint)throw new Error('Missing saved authority checkpoint.');
    assertCheckpoint(checkpoint);
    const storage={getItem:key=>reader.getItem(key),setItem(){throw new Error('Validation may not write saved authority data.');}};
    return new MultiplayerHub({createGame,clock,storage,autoStart:false,strictRestore:true});
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {validateRoomStorage(fs.readFileSync(0));}
  catch {process.stderr.write('Der private Spielstand ist mit dieser Fassung nicht kompatibel.\n');process.exitCode=1;}
}
