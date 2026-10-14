import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';

// Small DOM/event fixtures exercise production account and group handlers.
// Layout, touch sizing and rendered focus are checked in the browser separately.
function fixture(network={}) {
  const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,navigator:globalThis.navigator};
  const nodes=new Map(),listeners=new Map(),frames=[];
  const listen=(map,name,handler)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(handler);};
  function node(id,{dataset={},tag='DIV',parent=null,value=''}={}) {
    const attributes=new Map(),classes=new Set(),events=new Map();let markup='';
    const element={id,dataset,tagName:tag,parentElement:parent,value,hidden:false,disabled:false,isConnected:true,scrollTop:0,writes:0,textContent:'',controls:[],style:{},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;this.writes++;},
      classList:{add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      setAttribute(name,value){attributes.set(name,String(value));},getAttribute:name=>attributes.get(name),
      addEventListener(name,handler){listen(events,name,handler);},focus(){if(!this.disabled)document.activeElement=this;},select(){this.selected=true;},
      contains(other){for(let cursor=other;cursor;cursor=cursor.parentElement)if(cursor===this)return true;return false;},
      matches(selector){return selector==='[data-account-form]'?Boolean(this.dataset.accountForm):selector==='select'?this.tagName==='SELECT':false;},
      closest(selector){return selector==='button'&&this.tagName==='BUTTON'?this:null;},
      querySelector(selector){const name=selector.match(/^\[name="([^"]+)"\]$/)?.[1];return name?this.controls.find(control=>control.name===name):this.controls.find(control=>control.tagName==='BUTTON') || null;},
      querySelectorAll(selector){if(selector==='input')return this.controls.filter(control=>control.tagName==='INPUT');return this.controls;}};
    nodes.set(id,element);return element;
  }
  const ids=['welcome-overlay','welcome-classes','welcome-account','start-button','continue-button','panel-overlay','game-panel','panel-content','panel-title','panel-description','close-panel','save-button','save-state','save-import','world-hud','pvp-hud','notice-stack','world'];
  const elements=Object.fromEntries(ids.map(id=>[id,node(id)]));
  elements['panel-content'].parentElement=elements['game-panel'];elements['game-panel'].parentElement=elements['panel-overlay'];
  const touch=node('touch'),body=node('body'),trigger=node('account-trigger',{tag:'BUTTON',dataset:{command:'account-open'}});
  const document={body,activeElement:trigger,getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.touch-controls'?touch:selector==='[data-command="account-play"]'?nodes.get('account-play'):null,
    querySelectorAll:selector=>selector==='[data-command="account-open"]'?[trigger]:[],addEventListener(name,handler){listen(listeners,name,handler);},
    fire(name,event={}){const data={target:document.activeElement,defaultPrevented:false,immediateStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediateStopped=true;},...event};for(const handler of listeners.get(name)||[]){handler(data);if(data.immediateStopped)break;}return data;}};
  globalThis.document=document;globalThis.window={addEventListener(){}};globalThis.requestAnimationFrame=handler=>frames.push(handler);
  const game=new Game({storage:null});game.networkClient={account:null,accountStatus:'anonymous',online:false,serverAvailable:true,loginAccount:async()=>{},...network};
  const ui=Object.assign(Object.create(GameUI.prototype),{game,elements,activePanel:'account',accountTab:'login',accountBusy:false,accountMessage:'',accountMessageTone:'info',lastAccountState:'',networkBusy:false,panelPointers:new Set(),infoOpen:false,lastPartyState:'',notices:[],renderedPanel:'account',events:[],
    update(){this.events.push(['update']);},updateHudLayout(){},renderNotice(){},renderInformation(){},refreshRooms(){},showNotice(message,tone){this.notices.push([message,tone]);},
    renderPanel(){this.events.push(['render']);},syncWelcome(){this.events.push(['welcome']);},closeInformation(){},closePanel(){this.clearAccountPassword();this.activePanel=null;this.events.push(['close']);}});
  const form=node('account-form',{tag:'FORM',dataset:{accountForm:'login'},parent:elements['panel-content']});
  const fields={};
  for(const [name,value] of [['username','Aren_12'],['password','saved-password-12'],['playerName','Aren'],['classId','ranger']]) {
    const field=node(`account-${name==='playerName'?'player-name':name==='classId'?'class':name}`,{tag:name==='classId'?'SELECT':'INPUT',parent:form,value});field.name=name;fields[name]=field;form.controls.push(field);
  }
  fields.submit=node('account-submit',{tag:'BUTTON',parent:form});form.controls.push(fields.submit);form.reportValidity=()=>true;
  const feedback=node('account-feedback',{parent:form});
  ui.bind();
  return{ui,game,network:game.networkClient,document,nodes,node,elements,form,fields,feedback,trigger,frames,
    flush(){while(frames.length)frames.shift()();},restore(){for(const [key,value] of Object.entries(saved))if(key!=='navigator')globalThis[key]=value;}};
}
async function withFixture(network,run){const f=fixture(network);try{return await run(f);}finally{f.restore();}}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('account login and registration render native constraints and appropriate password manager fields',()=>withFixture({},f=>{
  const login=f.ui.account();assert.match(login,/data-account-form="login"/);assert.match(login,/autocomplete="username"/);assert.match(login,/autocomplete="current-password"/);assert.match(login,/type="password" minlength="12" maxlength="128" required/);assert.doesNotMatch(login,/data-ui-draft/);assert.match(login,/Ohne Anmeldung spielen/);
  f.ui.accountTab='register';const register=f.ui.account();assert.match(register,/autocomplete="new-password"/);assert.match(register,/name="playerName"/);assert.equal((register.match(/<option value=/g)||[]).length,8);assert.match(register,/value="guardian" selected/);
}));

test('an insecure deployment exposes only its HTTPS account link and retains the explicit invitation',()=>withFixture({requiresHTTPS:true,secureOrigin:'https://play.example.test',pendingInvitation:' A1B2C3D4 '},async f=>{
  const html=f.ui.account();assert.doesNotMatch(html,/<form|type="password"/);assert.match(html,/href="https:\/\/play\.example\.test\/\?join=A1B2C3D4"/);assert.match(html,/Anmelden sicher öffnen/);
  let calls=0;f.network.loginAccount=async()=>calls++;await f.ui.submitAccount(f.form);assert.equal(calls,0);assert.equal(f.fields.password.value,'');
  f.network.secureOrigin='http://play.example.test';assert.equal(f.ui.secureAccountUrl(),null);assert.doesNotMatch(f.ui.account(),/<form|href="http:/);
}));

test('native form submission blocks duplicates, clears the password before the request and restores failure focus',()=>withFixture({},async f=>{
  const flight=deferred(),payloads=[];f.network.loginAccount=async payload=>{payloads.push({...payload});await flight.promise;throw new Error('Name oder Passwort stimmt nicht.');};
  const event=f.document.fire('submit',{target:f.form});assert.equal(event.defaultPrevented,true);assert.equal(f.ui.accountBusy,true);assert.equal(f.fields.password.value,'');assert.equal(f.fields.username.disabled,true);assert.equal(f.fields.submit.disabled,true);assert.equal(f.form.getAttribute('aria-busy'),'true');
  await f.ui.submitAccount(f.form);assert.equal(payloads.length,1);assert.deepEqual(payloads[0],{username:'Aren_12',password:'saved-password-12'});
  flight.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.ui.accountBusy,false);assert.equal(f.fields.username.value,'Aren_12');assert.equal(f.fields.password.value,'');assert.equal(f.fields.password.disabled,false);assert.equal(f.document.activeElement,f.fields.password);assert.match(f.feedback.textContent,/Name oder Passwort/);assert.equal(f.ui.notices.length,0);assert.ok(!JSON.stringify(f.ui.accountMessage).includes('saved-password-12'));
}));

test('registration submits exactly the chosen class and display name without persisting its secret in UI state',()=>withFixture({},async f=>{
  const submitted=[];f.form.dataset.accountForm='register';f.fields.username.value='  Glutwacht  ';f.fields.playerName.value='  Mira  ';f.fields.classId.value='frostweaver';
  f.network.registerAccount=async payload=>{submitted.push({...payload});f.network.account={id:'account-1',username:payload.username,playerName:payload.playerName,classId:payload.classId,level:1};f.network.accountStatus='authenticated';};
  await f.ui.submitAccount(f.form);assert.deepEqual(submitted,[{username:'Glutwacht',password:'saved-password-12',playerName:'Mira',classId:'frostweaver'}]);assert.equal(f.fields.password.value,'');assert.equal(f.ui.accountBusy,false);assert.match(f.ui.account(),/Mira/);assert.match(f.ui.account(),/Frostweber/);assert.match(f.ui.account(),/data-command="account-play"/);assert.equal(f.ui.notices.length,0);
}));

test('invalid usernames and short passwords do not reach the account server and name the correction',()=>withFixture({},async f=>{
  let calls=0;f.network.loginAccount=async()=>calls++;f.fields.username.value='<Aren>';
  await f.ui.submitAccount(f.form);assert.equal(calls,0);assert.equal(f.document.activeElement,f.fields.username);assert.match(f.feedback.textContent,/3–24/);
  f.fields.username.value='Aren';f.fields.password.value='short';await f.ui.submitAccount(f.form);assert.equal(calls,0);assert.equal(f.document.activeElement,f.fields.password);assert.match(f.feedback.textContent,/12–128/);
}));

test('account status and routine world changes preserve a focused password form until an explicit action',()=>withFixture({},f=>{
  f.document.activeElement=f.fields.password;f.fields.password.value='still-typing-password';f.ui.renderPanel=GameUI.prototype.renderPanel;
  const writes=f.elements['panel-content'].writes;f.ui.renderPanel();assert.equal(f.elements['panel-content'].writes,writes);assert.equal(f.fields.password.value,'still-typing-password');
  f.ui.updateAccount(true);assert.equal(f.elements['panel-content'].writes,writes);assert.equal(f.document.activeElement,f.fields.password);assert.equal(f.fields.password.value,'still-typing-password');
}));

test('a Unicode password exceeding the server storage bound is corrected before any request',()=>withFixture({},async f=>{
  let calls=0;f.network.loginAccount=async()=>calls++;f.fields.password.value='ä'.repeat(65);await f.ui.submitAccount(f.form);assert.equal(calls,0);assert.equal(f.document.activeElement,f.fields.password);assert.match(f.feedback.textContent,/zu lang/);assert.ok(!f.feedback.textContent.includes(f.fields.password.value));
}));

test('native account-tab activation and Escape erase the secret when the form is abandoned',()=>withFixture({},f=>{
  const register=f.node('register-tab',{tag:'BUTTON',dataset:{command:'account-tab',id:'register'}});f.document.fire('click',{target:register});assert.equal(f.ui.accountTab,'register');assert.equal(f.fields.password.value,'');
  f.ui.closePanel=GameUI.prototype.closePanel;
  f.fields.password.value='abandoned-password';f.document.fire('keydown',{key:'Escape'});assert.equal(f.ui.activePanel,null);assert.equal(f.fields.password.value,'');
}));

test('continuing an already connected account journey returns to its current group without another play request',()=>withFixture({account:{id:'account-1',username:'Mira'},accountOwned:true,online:true,connected:true,inParty:true,playAccount:async()=>{throw new Error('Must not leave this group');}},async f=>{
  await f.ui.accountCommand('account-play');assert.equal(f.ui.activePanel,null);assert.equal(f.document.activeElement,f.elements.world);assert.equal(f.network.inParty,true);assert.equal(f.ui.accountBusy,false);
}));

test('opening an account panel refreshes the current tab identity and keeps a restored local journey paused',()=>withFixture({account:{id:'account-old',username:'Mira'},accountOwned:true,online:true,connected:true},async f=>{
  f.game.start();let checks=0;f.network.refreshAccount=async()=>{checks++;f.network.account={id:'account-new',username:'Aren'};f.network.accountOwned=false;f.network.online=false;f.network.connected=false;f.game.paused=false;};
  f.ui.activePanel=null;await f.ui.accountCommand('account-open');assert.equal(checks,1);assert.equal(f.network.account.id,'account-new');assert.equal(f.ui.activePanel,'account');assert.equal(f.game.paused,true);assert.equal(f.trigger.getAttribute('aria-label'),'Spielerkonto: Aren');
  let plays=0;f.network.playAccount=async()=>plays++;await f.ui.accountCommand('account-play');assert.equal(plays,1,'A changed identity reconnects rather than closing over the old account actor');
}));

test('logout awaits the production network logout and returns to the preserved local journey',()=>withFixture({account:{id:'account-1',username:'Mira',playerName:'Mira',classId:'druid',level:13},accountStatus:'authenticated'},async f=>{
  const flight=deferred();let calls=0;f.network.logoutAccount=async()=>{calls++;await flight.promise;f.network.account=null;};
  const pending=f.ui.accountCommand('account-logout');assert.equal(calls,1);assert.equal(f.ui.accountBusy,true);assert.equal(f.ui.activePanel,'account');assert.equal(f.fields.password.value,'');
  await f.ui.accountCommand('account-logout');assert.equal(calls,1);flight.resolve();await pending;assert.equal(f.network.account,null);assert.equal(f.ui.activePanel,null);assert.ok(f.ui.events.some(([name])=>name==='welcome'));assert.equal(f.ui.accountBusy,false);
}));

test('account-owned solo worlds can join an invitation with one action without recreating a character',()=>withFixture({account:{id:'account-1',username:'Mira'},accountStatus:'authenticated',online:true,privateWorld:true,inParty:false,pendingInvitation:'A1B2C3D4'},async f=>{
  const calls=[];f.network.join=async(code,options)=>calls.push({code,options});f.ui.activePanel='party';f.ui.updateParty=()=>{};
  assert.equal(f.ui.inParty,false);assert.match(f.ui.invitationPrompt(),/data-command="party-join" data-id="A1B2C3D4"/);assert.equal(calls.length,0,'Merely rendering an invitation does not join it');
  await f.ui.networkCommand('party-join',' a1b2c3d4 ');assert.equal(calls.length,1);assert.equal(calls[0].code,'A1B2C3D4');assert.equal(f.ui.activePanel,null);
}));

test('full catalog rooms stay disabled and account solo worlds can join available groups',()=>withFixture({account:{id:'account-1'},online:true,inParty:false,privateWorld:true,catalog:async()=>({rooms:[{code:'FULL1234',name:'Volle Gruppe',players:8,maxPlayers:8},{code:'OPEN1234',name:'Offene Gruppe',players:2,maxPlayers:8}]})},async f=>{
  f.ui.activePanel='party';const list=f.node('party-room-list');const joinOpen=f.node('join-open',{tag:'BUTTON',dataset:{command:'party-join',id:'OPEN1234',full:'false'}}),joinFull=f.node('join-full',{tag:'BUTTON',dataset:{command:'party-join',id:'FULL1234',full:'true'}});f.elements['panel-content'].controls=[joinOpen,joinFull];f.ui.updateParty=GameUI.prototype.updateParty;f.ui.refreshRooms=GameUI.prototype.refreshRooms;
  await f.ui.refreshRooms();assert.match(list.innerHTML,/Gruppe voll/);assert.equal(joinFull.disabled,true);assert.equal(joinOpen.disabled,false);
}));

test('sharing a group exposes a selectable link when clipboard permission is unavailable',()=>withFixture({online:true,inParty:true,roomCode:'A1B2C3D4',inviteUrl:code=>`https://play.example.test/?join=${code}`},async f=>{
  f.ui.activePanel='party';const feedback=f.node('party-copy-feedback'),copy=f.node('party-invite-link',{tag:'INPUT'});await f.ui.networkCommand('party-copy-link');assert.match(feedback.innerHTML,/readonly value="https:\/\/play\.example\.test\/\?join=A1B2C3D4"/);assert.match(feedback.innerHTML,/Wähle den Einladungslink/);assert.equal(f.document.activeElement,copy);assert.equal(copy.selected,true);
}));

test('successful clipboard copying still exposes the invitation without stealing focus or rewriting a stable URL',()=>withFixture({online:true,inParty:true,roomCode:'A1B2C3D4',inviteUrl:code=>`https://play.example.test/?join=${code}`},async f=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),copied=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
  try {
    f.ui.activePanel='party';const feedback=f.node('party-copy-feedback'),copy=f.node('party-invite-link',{tag:'INPUT'}),message=f.node('party-copy-message');f.trigger.focus();
    await f.ui.networkCommand('party-copy-link');assert.deepEqual(copied,['https://play.example.test/?join=A1B2C3D4']);assert.match(feedback.innerHTML,/Einladungslink kopiert/);assert.match(feedback.innerHTML,/aria-label="Einladungslink zum Kopieren" readonly value=/);assert.equal(f.document.activeElement,f.trigger);assert.equal(copy.selected,undefined);
    copy.value='https://play.example.test/?join=A1B2C3D4';copy.focus();const writes=feedback.writes;await f.ui.networkCommand('party-copy-link');assert.equal(feedback.writes,writes);assert.equal(f.document.activeElement,copy);assert.equal(message.textContent,'Einladungslink kopiert.');
  } finally {if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
}));

test('a catalog group whose server blocks entry stays unavailable through later roster updates',()=>withFixture({catalog:async()=>({rooms:[{code:'ABCD1234',name:'Unterwegs',players:2,maxPlayers:8,joinable:false}]})},async f=>{
  f.ui.activePanel='party';const list=f.node('party-room-list'),button=f.node('join-unavailable',{tag:'BUTTON',dataset:{command:'party-join',id:'ABCD1234',full:'false',unavailable:'true'}});f.elements['panel-content'].controls=[button];f.ui.refreshRooms=GameUI.prototype.refreshRooms;f.ui.updateParty=GameUI.prototype.updateParty;
  await f.ui.refreshRooms();assert.match(list.innerHTML,/data-unavailable="true" disabled/);assert.match(list.innerHTML,/Nicht verfügbar/);assert.equal(button.disabled,true);
  f.game.party=[{id:'other',name:'Gefährte',hp:99,maxHp:100,classId:'ranger'}];f.ui.updateParty();assert.equal(button.disabled,true);
}));

test('an old backend without account endpoints retains the guest journey rather than a broken login form',()=>withFixture({accountStatus:'unavailable'},f=>{
  const html=f.ui.account();assert.doesNotMatch(html,/<form|type="password"/);assert.match(html,/Ohne Anmeldung spielen/);assert.match(html,/in diesem Browser/);
}));
