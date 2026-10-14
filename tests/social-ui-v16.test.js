import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {GameUI} from '../src/ui.js';
const decode=text=>text.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const profile=(id,extra={})=>({accountId:id,username:id,playerName:id,online:false,inParty:false,canJoin:false,joinReason:'Offline',...extra});
const snapshot=(extra={})=>({version:1,revision:1,accountId:'owner',friends:[],friendRequests:{incoming:[],outgoing:[]},blocked:[],guildInvites:[],guild:null,...extra});
const guild=(extra={})=>({id:'guild-1',name:'Die Glut',role:'leader',leaderId:'owner',members:[{...profile('owner',{classId:'guardian',level:1}),role:'leader'}],invites:[],messages:[],...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

// Native event/DOM contract fixture. Browser layout and real transport are verified separately.
function fixture({account=true,social=snapshot(),network:overrides={}}={}){
 const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame},listeners=new Map(),frames=[],pending=[];
 let document;const roots=[];
 const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
 function matches(node,selector){
  const parts=selector.trim().split(/\s+/),own=parts.pop();
  const tag=own.match(/^[a-z]+/i)?.[0];if(tag&&node.tagName!==tag.toUpperCase())return false;
  for(const match of own.matchAll(/\[([\w-]+)(?:([\^]?=)"([^"]*)")?\]/g)){const value=node.getAttribute(match[1]);if(value===undefined||match[2]&&(match[2]==='^='?!value.startsWith(match[3]):value!==match[3]))return false;}
  if(parts.length){for(let cursor=node.parentElement;cursor;cursor=cursor.parentElement)if(matches(cursor,parts.join(' ')))return true;return false;}
  return true;
 }
 function node(tag='DIV',attrs={},parent=null){
  const attributes=new Map(Object.entries(attrs)),classes=new Set((attrs.class||'').split(' '));let html='',value=attrs.value||'';
  const element={tagName:tag.toUpperCase(),dataset:{},parentElement:parent,children:[],hidden:Object.hasOwn(attrs,'hidden'),disabled:Object.hasOwn(attrs,'disabled'),open:Object.hasOwn(attrs,'open'),isConnected:true,scrollTop:0,scrollHeight:300,clientHeight:120,writes:0,textContent:'',style:{},
   get value(){return value;},set value(next){value=next;},
   get innerHTML(){return html;},set innerHTML(next){
    for(const child of descendants(this)){child.isConnected=false;if(document.activeElement===child)document.activeElement=document.body;}this.children=[];html=next;this.writes++;
    const stack=[this];for(const match of next.matchAll(/<([^>]+)>|([^<]+)/g)){
     if(match[2]){const target=stack.at(-1);target.textContent+=decode(match[2]);if(target.tagName==='TEXTAREA')target.value+=decode(match[2]);continue;}
     const raw=match[1];if(raw.startsWith('/')){if(stack.length>1)stack.pop();continue;}const name=raw.match(/^([\w-]+)/)?.[1];if(!name)continue;
     const parsed={};for(const attr of raw.slice(name.length).matchAll(/([\w-]+)(?:="([^"]*)")?/g))parsed[attr[1]]=decode(attr[2]??'');
     const child=node(name,parsed,stack.at(-1));stack.at(-1).children.push(child);if(!['input','br','hr','img','use','path'].includes(name)&&!raw.endsWith('/'))stack.push(child);
    }
   },
   classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name),toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);}},
   setAttribute(name,next){attributes.set(name,String(next));},getAttribute:name=>attributes.get(name),addEventListener(){},
   focus(){if(!this.disabled)document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
   contains(other){for(let cursor=other;cursor;cursor=cursor.parentElement)if(cursor===this)return true;return false;},
   matches(selector){return matches(this,selector);},closest(selector){for(let cursor=this;cursor;cursor=cursor.parentElement)if(matches(cursor,selector))return cursor;return null;},
   querySelectorAll(selector){return descendants(this).filter(child=>selector.split(',').some(part=>matches(child,part)));},querySelector(selector){return this.querySelectorAll(selector)[0]||null;},reportValidity(){return true;}
  };
  for(const [name,next]of Object.entries(attrs))if(name.startsWith('data-'))element.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=next;
  return element;
 }
 const ids=['welcome-overlay','welcome-classes','welcome-account','start-button','continue-button','panel-overlay','game-panel','panel-title','panel-description','panel-content','close-panel','save-button','save-import','world-hud','world'];
 const elements=Object.fromEntries(ids.map(id=>{const element=node('DIV',{id});roots.push(element);return[id,element];}));
 elements['panel-content'].parentElement=elements['game-panel'];elements['game-panel'].parentElement=elements['panel-overlay'];
 const body=node(),touch=node(),trigger=node('BUTTON',{id:'social-trigger'});roots.push(body,touch,trigger);
 document={body,activeElement:trigger,visibilityState:'visible',getElementById:id=>roots.flatMap(root=>[root,...descendants(root)]).find(node=>node.getAttribute('id')===id)||null,querySelector:selector=>selector==='.touch-controls'?touch:roots.flatMap(root=>[root,...descendants(root)]).find(node=>matches(node,selector))||null,querySelectorAll:()=>[],
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
  fire(name,target,extra={}){const event={target,key:undefined,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...extra};for(const handler of listeners.get(name)||[])handler(event);return event;}
 };
 globalThis.document=document;globalThis.window={addEventListener(){}};globalThis.requestAnimationFrame=fn=>frames.push(fn);
 const game=new Game({storage:null});game.start();let opened=0,closed=0;const calls=[];
 game.networkClient={baseUrl:'https://play.example.test',account:account?{id:'owner',username:'owner',classId:'guardian'}:null,accountStatus:account?'authenticated':'anonymous',social,socialStatus:'ready',socialSource:{},onSocial(){},
  openSocial:async()=>{opened++;},closeSocial(){closed++;this.socialSource=null;},socialAction:async(action,fields)=>{calls.push({action,fields});return{ok:true,snapshot:social};},refreshSocial:async()=>{},joinContact:async accountId=>{calls.push({join:accountId});},...overrides};
 const ui=Object.assign(Object.create(GameUI.prototype),{game,elements,activePanel:null,renderedPanel:null,panelPointers:new Set(),infoOpen:false,accountBusy:false,networkBusy:false,socialBusy:null,socialTab:'friends',socialGeneration:1,socialOwner:account?'https://play.example.test|owner':null,socialFriendUsername:'',socialGuildName:'',socialInviteUsername:'',socialChatText:'',socialMessage:'',socialMessageError:false,
  renderInformation(){},renderNotice(){},updateHudLayout(){},showNotice(){},syncWelcome(){},update(){}});
 for(const name of ['command','submitSocial']){const original=ui[name].bind(ui);ui[name]=(...args)=>{const promise=original(...args);pending.push(promise);return promise;};}
 ui.bind();ui.togglePanel('social');
 return{ui,game,network:game.networkClient,document,elements,calls,trigger,
  get opened(){return opened;},get closed(){return closed;},
  node(id){const found=document.getElementById(id);assert.ok(found,id);return found;},
  button(command,id,action){const button=elements['panel-content'].querySelectorAll('button').find(button=>button.dataset.command===command&&(id===undefined||button.dataset.id===id)&&(action===undefined||button.dataset.actionName===action));assert.ok(button,`${command} ${id} ${action}`);return button;},
  click(command,id,action){const button=this.button(command,id,action);button.focus();document.fire('click',button);return button;},
  input(id,text){const field=this.node(id);field.value=text;field.focus();document.fire('input',field);return field;},
  submit(kind){const form=elements['panel-content'].querySelector(`[data-social-form="${kind}"]`);assert.ok(form,kind);return document.fire('submit',form);},
  emit(next){this.network.social=next;this.network.onSocial({snapshot:next,status:'ready'});},
  async flush(){while(pending.length)await Promise.all(pending.splice(0));while(frames.length)frames.shift()();await Promise.resolve();},
  restore(){Object.assign(globalThis,saved);}
 };
}
async function withFixture(options,run){const f=fixture(options);try{return await run(f);}finally{f.restore();}}

test('anonymous community has one account path, no editable social forms or background stream',async()=>withFixture({account:false,social:null},async f=>{
 await f.flush();assert.equal(f.opened,0);assert.match(f.elements['panel-content'].innerHTML,/Spielerkonto öffnen/);assert.doesNotMatch(f.elements['panel-content'].innerHTML,/<form|textarea/);assert.equal(f.ui.menuNavigation('social').includes('Gemeinschaft'),true);
}));

test('native friendship form uses an exact username, waits for consent, rejects invalid input and preserves pending drafts/focus',async()=>withFixture({},async f=>{
 await f.flush();assert.equal(f.opened,1);const input=f.input('social-friend-request',' Wrong Name ');f.submit('friend-request');await f.flush();assert.equal(f.calls.length,0);assert.match(f.node('social-feedback').textContent,/exakten/);assert.equal(f.document.activeElement,input);
 const flight=deferred();f.network.socialAction=async(action,fields)=>{f.calls.push({action,fields});return flight.promise;};f.input('social-friend-request','Friend_12');const event=f.submit('friend-request');assert.equal(event.prevented,true);assert.equal(input.disabled,true);assert.ok(f.ui.socialBusy);
 f.submit('friend-request');assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{action:'friend_request',fields:{username:'Friend_12'}});
 const writes=f.elements['panel-content'].writes,bodyWrites=f.node('social-body').writes;input.focus();input.selectionStart=2;input.selectionEnd=4;f.elements['panel-content'].scrollTop=77;f.emit(snapshot({friendRequests:{incoming:[profile('newperson')],outgoing:[]}}));
 assert.equal(f.node('social-friend-request'),input);assert.equal(f.elements['panel-content'].writes,writes);assert.equal(f.node('social-body').writes,bodyWrites);assert.equal(f.elements['panel-content'].scrollTop,77);assert.equal(input.value,'Friend_12');
 flight.reject(new Error('<img src=x> Anfrage fehlgeschlagen'));await f.flush();assert.equal(input.disabled,false);assert.equal(input.value,'Friend_12');assert.equal(f.node('social-feedback').textContent,'<img src=x> Anfrage fehlgeschlagen');assert.equal(f.document.activeElement,input);assert.equal(input.selectionStart,2);
}));

test('friendship acceptance, decline, cancellation, removal, blocking and direct group join use explicit canonical actions',async()=>withFixture({social:snapshot({friends:[profile('friend',{classId:'ranger',level:17,online:true,inParty:true,canJoin:true,roomName:'Glutwacht'})],friendRequests:{incoming:[profile('newperson')],outgoing:[profile('waiting')]},blocked:[profile('blocked')]})},async f=>{
 await f.flush();const requests=f.node('social-requests').innerHTML;assert.doesNotMatch(requests,/Stufe 1|Wächter/);assert.match(f.node('social-friends').innerHTML,/Stufe 17/);assert.match(f.node('social-friends').innerHTML,/Glutwacht/);
 for(const [id,action]of [['newperson','friend_accept'],['newperson','friend_decline'],['waiting','friend_cancel'],['friend','friend_remove'],['friend','block'],['blocked','unblock']]){f.click('social-action',id,action);await f.flush();assert.deepEqual(f.calls.at(-1),{action,fields:{accountId:id}});}
 assert.equal(f.calls.some(call=>call.join),false);f.click('social-join','friend');await f.flush();assert.deepEqual(f.calls.at(-1),{join:'friend'});assert.equal(f.ui.activePanel,null);assert.equal(f.document.activeElement,f.elements.world);
}));

test('guild creation and invitation forms enforce names and keep consent invitations explicit',async()=>withFixture({social:snapshot({guildInvites:[{guildId:'invite-1',guildName:'Gäste der Glut',inviter:profile('leader')} ]})},async f=>{
 f.click('social-tab','guild');await f.flush();f.input('social-guild-create','Bad<>');f.submit('guild-create');await f.flush();assert.equal(f.calls.length,0);
 f.input('social-guild-create','Glutwächter 12');f.submit('guild-create');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_create',fields:{guildName:'Glutwächter 12'}});assert.equal(f.node('social-guild-create').value,'');
 assert.equal(f.calls.some(call=>call.action==='guild_accept'),false);for(const action of ['guild_accept','guild_decline']){f.click('social-action','invite-1',action);await f.flush();assert.deepEqual(f.calls.at(-1),{action,fields:{guildId:'invite-1'}});}
 f.emit(snapshot({guild:guild({invites:[profile('pending')]})}));const invite=f.input('social-guild-invite','Reisender');f.submit('guild-invite');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_invite',fields:{username:'Reisender'}});assert.equal(invite.value,'');f.click('social-action','pending','guild_cancel');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_cancel',fields:{accountId:'pending'}});
}));

test('guild roster exposes only authorized role controls and a leader must transfer before leaving members',async()=>{
 for(const role of ['leader','officer','member'])await withFixture({social:snapshot({guild:guild({role,members:[{...profile('owner'),role},{...profile('member'),role:'member'},{...profile('officer'),role:'officer'},{...profile('leader'),role:'leader'}]})})},async f=>{
  f.click('social-tab','guild');await f.flush();const roster=f.node('social-roster').innerHTML;
  assert.equal(roster.includes('data-action-name="guild_role"'),role==='leader');assert.equal(roster.includes('data-action-name="guild_transfer"'),role==='leader');
  assert.equal(f.elements['panel-content'].querySelectorAll('[data-action-name="guild_kick"]').length,role==='leader'?2:role==='officer'?1:0);
  const leave=f.button('social-action','', 'guild_leave');assert.equal(leave.disabled,role==='leader');
  if(role==='leader'){f.click('social-action','member','guild_role');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_role',fields:{accountId:'member',role:'officer'}});f.click('social-action','member','guild_transfer');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_transfer',fields:{accountId:'member'}});}
  if(role==='officer'){f.click('social-action','member','guild_kick');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_kick',fields:{accountId:'member'}});}
 });
});

test('bounded escaped guild messages update only their list while keeping textarea, selection and scroll stable',async()=>withFixture({social:snapshot({blocked:[profile('blocked')],guild:guild({messages:[{id:'old',accountId:'friend',playerName:'<img>',text:'<script>unsafe</script>',createdAt:0}]})})},async f=>{
 f.click('social-tab','chat');await f.flush();const text=f.input('social-chat-text','Noch nicht senden');text.selectionStart=3;text.selectionEnd=8;const list=f.node('social-messages');list.scrollTop=20;list.scrollHeight=1000;list.clientHeight=120;f.elements['panel-content'].scrollTop=44;
 const body=f.node('social-body'),writes=body.writes;assert.match(list.innerHTML,/&lt;script&gt;unsafe/);assert.match(list.innerHTML,/<time datetime="1970-/);assert.doesNotMatch(list.innerHTML,/<script>/);
 const messages=Array.from({length:55},(_,i)=>({id:`m${i}`,accountId:i===50?'blocked':'friend',playerName:'Freund',text:`Nachricht ${i}`,createdAt:1000+i}));f.emit(snapshot({blocked:[profile('blocked')],guild:guild({messages})}));
 assert.equal(f.node('social-chat-text'),text);assert.equal(text.value,'Noch nicht senden');assert.equal(f.document.activeElement,text);assert.equal(text.selectionStart,3);assert.equal(body.writes,writes);assert.equal(list.scrollTop,20);assert.equal(f.elements['panel-content'].scrollTop,44);assert.equal((list.innerHTML.match(/data-social-message=/g)||[]).length,49);assert.doesNotMatch(list.innerHTML,/Nachricht 50<|data-social-message="m0"/);
 f.submit('guild-chat');await f.flush();assert.deepEqual(f.calls.at(-1),{action:'guild_chat',fields:{text:'Noch nicht senden'}});assert.equal(text.value,'');assert.equal(f.ui.socialChatText,'');
 f.input('social-chat-text','x'.repeat(241));f.submit('guild-chat');await f.flush();assert.equal(f.calls.length,1);assert.match(f.node('social-feedback').textContent,/1–240/);
}));

test('closing or hiding community stops Social SSE and Escape restores its trigger without reopening after world updates',async()=>withFixture({},async f=>{
 await f.flush();f.document.visibilityState='hidden';f.document.fire('visibilitychange',null);assert.equal(f.closed,1);f.document.visibilityState='visible';f.document.fire('visibilitychange',null);await f.flush();assert.equal(f.opened,2);
 f.document.fire('keydown',f.document.activeElement,{key:'Escape'});await f.flush();assert.equal(f.ui.activePanel,null);assert.equal(f.closed,2);assert.equal(f.document.activeElement,f.trigger);f.network.onSocial({snapshot:snapshot()});assert.equal(f.opened,2);
}));

test('owner logout resets social drafts, pending errors and old contacts before a late acknowledgement',async()=>withFixture({},async f=>{
 const flight=deferred();f.network.socialAction=()=>flight.promise;f.input('social-friend-request','Friend_12');f.submit('friend-request');assert.ok(f.ui.socialBusy);
 f.network.account=null;f.network.accountStatus='anonymous';f.network.social=null;f.ui.updateAccount(true);assert.equal(f.ui.socialBusy,null);assert.equal(f.ui.socialFriendUsername,'');assert.doesNotMatch(f.elements['panel-content'].innerHTML,/<form/);
 flight.reject(new Error('Old account failure'));await f.flush();assert.equal(f.ui.socialMessage,'');assert.doesNotMatch(f.elements['panel-content'].innerHTML,/Old account failure/);
}));

test('failed initial social load remains recoverable through its native refresh control',async()=>withFixture({social:null,network:{socialStatus:'unavailable',refreshSocial:async function(){this.social=snapshot();this.socialStatus='ready';}}},async f=>{
 await f.flush();const input=f.node('social-friend-request');assert.equal(input.disabled,true);f.click('social-refresh');await f.flush();assert.equal(f.network.social.accountId,'owner');assert.equal(input.disabled,false);assert.match(f.node('social-feedback').textContent,/aktualisiert/);
}));
