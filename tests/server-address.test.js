import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServerAddress, readPreferredServerAddress, SERVER_ADDRESS_KEY } from '../src/server-address.js';

test('selected authority origins are canonical and cannot carry credentials, paths or session parameters',()=>{
  assert.equal(normalizeServerAddress(' https://Play.Example.org:443/ '),'https://play.example.org');
  assert.equal(normalizeServerAddress('http://192.168.1.20:4173',{pageUrl:'http://localhost:4174/'}),'http://192.168.1.20:4173');
  assert.equal(normalizeServerAddress('http://[::1]:4173'),'http://[::1]:4173');
  for(const address of ['',null,'play.example.org','javascript:alert(1)','file:///tmp/game','https://user:secret@example.org','https://example.org/api','https://example.org/?token=secret','https://example.org/#secret'])assert.throws(()=>normalizeServerAddress(address));
  assert.throws(()=>normalizeServerAddress('http://play.example.org',{pageUrl:'https://emberfall.example.org/'}),/HTTPS/);
});

test('preferences survive reload while unavailable or invalid storage retains the current game origin',()=>{
  const pageUrl='https://emberfall.example.org/game';
  const storage={getItem:key=>{assert.equal(key,SERVER_ADDRESS_KEY);return 'https://play.example.org/';}};
  assert.equal(readPreferredServerAddress({storage,pageUrl}),'https://play.example.org');
  for(const broken of [null,{getItem:()=>{throw new Error('blocked');}},{getItem:()=> 'http://downgrade.example.org'},{getItem:()=> 'https://name:secret@example.org'}])
    assert.equal(readPreferredServerAddress({storage:broken,pageUrl}),'https://emberfall.example.org');
  assert.equal(readPreferredServerAddress({storage:null,pageUrl:''}),'');
});
