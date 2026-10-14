import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { NetworkClient } from '../src/network.js';
import { SERVER_ADDRESS_KEY } from '../src/server-address.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function view(network){const game=new Game({storage:null});game.networkClient=network;return Object.assign(Object.create(GameUI.prototype),{game,activePanel:'party',networkBusy:false,events:[],updateParty(){this.events.push(['busy',this.networkBusy]);},renderPanel(){this.events.push(['render']);},refreshRooms(){this.events.push(['rooms']);},showNotice(message,tone){this.events.push(['notice',message,tone]);}});}

test('the existing party panel accepts an actual URL and keeps online sessions and old render stubs safe',()=>{
  const network={baseUrl:'https://play.example.test',status:'offline',online:false,setServerAddress(){}};
  const ui=view(network);let html=ui.party();assert.match(html,/id="party-server-address" type="url" inputmode="url"/);assert.match(html,/value="https:\/\/play.example.test"/);const offlineButton=html.match(/<button[^>]*data-command="party-server-connect"[^>]*>/)?.[0];assert.ok(offlineButton);assert.doesNotMatch(offlineButton,/disabled/);assert.match(html,/erreichbaren HTTPS-Spielserver/);assert.match(html,/WLAN-Adresse des Hosts/);
  network.online=true;html=ui.party();assert.match(html,/id="party-server-address"[^>]*disabled/);assert.match(html,/data-command="party-server-connect"[^>]*disabled/);assert.match(html,/Verlasse zuerst die Gruppe/);
  ui.game.networkClient={baseUrl:'http://localhost:4174',status:'offline'};assert.doesNotThrow(()=>ui.party());assert.match(ui.party(),/data-command="party-server-connect"[^>]*disabled/);
});

test('server selection waits for real NetworkClient verification and room refresh, and blocks duplicate commands',async()=>{
  const previous=globalThis.document,probe=deferred(),rooms=deferred(),values=new Map(),requests=[];
  globalThis.document={getElementById:id=>id==='party-server-address'?{value:'https://play.example.test/'}:null};
  try{
    const game=new Game({storage:null}),network=new NetworkClient(game,{baseUrl:'https://old.example.test',EventSourceImpl:null,storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},fetchImpl:async(url)=>{requests.push(url);await probe.promise;return{ok:true,json:async()=>({protocol:1,rooms:[]})};}}),ui=view(network);
    ui.refreshRooms=async()=>{ui.events.push(['rooms']);await rooms.promise;};
    const flight=ui.networkCommand('party-server-connect');assert.equal(ui.networkBusy,true);assert.equal(network.baseUrl,'https://old.example.test');await ui.networkCommand('party-server-connect');assert.equal(requests.length,1);
    probe.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(network.baseUrl,'https://play.example.test');assert.equal(values.get(SERVER_ADDRESS_KEY),'https://play.example.test');assert.equal(ui.networkBusy,true,'Room reload belongs to the same pending action');assert.ok(ui.events.some(event=>event[0]==='render'));
    rooms.resolve();await flight;assert.equal(ui.networkBusy,false);assert.equal(ui.activePanel,'party');assert.ok(ui.events.some(event=>event[0]==='notice'&&event[2]==='success'));
  }finally{globalThis.document=previous;}
});

test('a rejected server leaves the selected authority intact, retains the entered URL, and reports its actual failure',async()=>{
  const previous=globalThis.document,field={value:'https://wrong.example.test'},network={baseUrl:'https://old.example.test',status:'offline',online:false,setServerAddress:async()=>{throw new Error('Diese Adresse bietet keinen unterstützten Emberfall-Spielserver.');}},ui=view(network);globalThis.document={getElementById:()=>field};
  try{
    await ui.networkCommand('party-server-connect');assert.equal(ui.networkBusy,false);assert.equal(network.baseUrl,'https://old.example.test');assert.equal(field.value,'https://wrong.example.test');assert.ok(!ui.events.some(event=>event[0]==='render'||event[0]==='rooms'));assert.deepEqual(ui.events.find(event=>event[0]==='notice'),['notice','Diese Adresse bietet keinen unterstützten Emberfall-Spielserver.','error']);
    network.setServerAddress=async()=>{throw new TypeError('Failed to fetch');};ui.events=[];await ui.networkCommand('party-server-connect');assert.deepEqual(ui.events.find(event=>event[0]==='notice'),['notice','Der Spielserver ist nicht erreichbar. Prüfe die vollständige Adresse und ob er läuft.','error']);
    network.online=true;let calls=0;network.setServerAddress=async()=>calls++;await ui.networkCommand('party-server-connect');assert.equal(calls,0);
  }finally{globalThis.document=previous;}
});

test('production party refresh re-enables the URL control and clears its busy label after settlement',()=>{
  const previous=globalThis.document,button={dataset:{command:'party-server-connect'},setAttribute(key,value){this[key]=value;}},field={},network={baseUrl:'https://play.example.test',status:'offline',online:false,setServerAddress(){}};
  globalThis.document={getElementById:id=>id==='party-server-address'?field:null};
  try{
    const ui=view(network);ui.updateParty=GameUI.prototype.updateParty;ui.elements={'panel-content':{querySelectorAll:()=>[button]}};ui.networkBusy=true;ui.updateParty();assert.equal(button.disabled,true);assert.equal(field.disabled,true);assert.equal(button['aria-busy'],'true');assert.match(button.innerHTML,/Server wird geprüft/);
    ui.networkBusy=false;ui.updateParty();assert.equal(button.disabled,false);assert.equal(field.disabled,false);assert.equal(button['aria-busy'],'false');assert.match(button.innerHTML,/Server prüfen/);assert.doesNotMatch(button.innerHTML,/wird geprüft/);
  }finally{globalThis.document=previous;}
});
