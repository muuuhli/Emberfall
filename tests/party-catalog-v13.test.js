import test from 'node:test';
import assert from 'node:assert/strict';
import { GameUI } from '../src/ui.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

// This DOM fixture replaces and disconnects children on innerHTML writes. That
// lifecycle is essential: the original bug kept an obsolete list across await.
function fixture(overrides={}) {
  const saved=Object.fromEntries(['document','requestAnimationFrame','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const nodes=new Map(),frames=[];
  const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const matches=(element,selector)=>{
    if(selector==='button')return element.tagName==='BUTTON';
    if(selector==='select')return element.tagName==='SELECT';
    const attribute=selector.match(/^\[([^\]=^]+)(\^?=)?(?:"([^"]*)")?\]$/);
    if(!attribute)return false;
    const value=element.getAttribute(attribute[1]);
    return value!==undefined&&(!attribute[2]||(attribute[2]==='^='?value.startsWith(attribute[3]??''):value===attribute[3]));
  };
  function node(tag='DIV',attributes={},parent=null) {
    let markup='';const classes=new Set(),attrs=new Map(Object.entries(attributes));
    const element={tagName:tag.toUpperCase(),id:attributes.id||'',dataset:{},parentElement:parent,children:[],isConnected:true,disabled:'disabled' in attributes,hidden:'hidden' in attributes,value:decode(attributes.value||''),writes:0,scrollTop:0,textContent:'',
      get innerHTML(){return markup;},set innerHTML(value){
        if(this.contains(document.activeElement)&&document.activeElement!==this)document.activeElement=document.body;
        for(const child of this.children)detach(child);this.children=[];markup=value;this.writes++;
        const stack=[this],voids=new Set(['INPUT','BR','HR','IMG','USE','PATH']);
        for(const token of value.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)){
          const name=token[2].toUpperCase();
          if(token[1]){while(stack.length>1){const child=stack.pop();child.setParsedMarkup(value.slice(child.markupStart,token.index));if(child.tagName===name)break;}continue;}
          const parsed={};for(const match of token[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g))parsed[match[1]]=match[2]??'';
          const child=node(name,parsed,stack.at(-1));child.markupStart=token.index+token[0].length;stack.at(-1).children.push(child);
          if(!voids.has(name)&&!token[3].endsWith('/'))stack.push(child);
        }
      },setParsedMarkup(value){markup=value;},
      classList:{add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      getAttribute:name=>attrs.get(name),setAttribute(name,value){attrs.set(name,String(value));},
      focus(){if(!this.disabled)document.activeElement=this;},select(){this.selected=true;this.selectionStart=0;this.selectionEnd=this.value.length;},matches(selector){return matches(this,selector);},
      contains(other){for(let cursor=other;cursor;cursor=cursor.parentElement)if(cursor===this)return true;return false;},
      querySelectorAll(selector){return this.children.flatMap(child=>[...(matches(child,selector)?[child]:[]),...child.querySelectorAll(selector)]);},querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
    for(const [key,value] of attrs)if(key.startsWith('data-'))element.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=decode(value);
    if(element.id)nodes.set(element.id,element);return element;
  }
  function detach(element){element.isConnected=false;for(const child of element.children)detach(child);if(nodes.get(element.id)===element)nodes.delete(element.id);}
  const body=node(),elements={};
  for(const id of ['game-panel','panel-content','panel-title','panel-description','close-panel','pvp-hud']){elements[id]=node('DIV',{id},id==='panel-content'?elements['game-panel']:body);elements[id].parentElement.children.push(elements[id]);}
  const document={body,activeElement:body,getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]};
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,writable:true,value:handler=>frames.push(handler)});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  const network={baseUrl:'https://one.example.test',account:{id:'account-one',username:'Aren'},online:true,status:'online',privateWorld:true,inParty:false,serverAvailable:true,catalog:async()=>({rooms:[]}),inviteUrl:code=>`https://one.example.test/?join=${code}`,...overrides};
  const game={networkClient:network,player:{name:'Aren',classId:'guardian',level:27,hp:100},party:[],pvp:{},worldMode:'overworld'};
  const ui=Object.assign(Object.create(GameUI.prototype),{game,elements,activePanel:'party',renderedPanel:null,panelPointers:new Set(),lastPartyState:'',lastPartyCode:'',notices:[],renderInformation(){},showNotice(){}});
  ui.renderPanel();
  return{ui,network,game,document,elements,get:id=>nodes.get(id),
    restore(){for(const [key,descriptor] of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}
async function withFixture(overrides,run){const f=fixture(overrides);try{return await run(f);}finally{f.restore();}}
const room=(name='Glutwacht',code='OPEN1234')=>({name,code,players:2,maxPlayers:8,joinable:true});

test('an in-flight catalog updates the current party panel after its old list was disconnected',()=>withFixture({},async f=>{
  const flight=deferred();let calls=0;f.network.catalog=()=>{calls++;return flight.promise;};
  const old=f.get('party-room-list'),request=f.ui.refreshRooms();f.ui.renderPanel();
  const current=f.get('party-room-list');assert.notEqual(current,old);assert.equal(old.isConnected,false);
  const duplicate=f.ui.refreshRooms();assert.equal(calls,1,'A roster rerender does not start duplicate catalog requests');
  flight.resolve({rooms:[room('<Gefährten>')]});await Promise.all([request,duplicate]);
  assert.match(current.innerHTML,/&lt;Gefährten&gt;/);assert.doesNotMatch(current.innerHTML,/werden geladen/);assert.match(old.innerHTML,/werden geladen/);
  f.ui.renderPanel();assert.match(f.get('party-room-list').innerHTML,/&lt;Gefährten&gt;/);assert.equal(calls,1,'Cached catalogs survive later roster updates without frame-driven requests');
}));

test('a response from a previous server cannot replace the current server catalog',()=>withFixture({},async f=>{
  const old=deferred(),next=deferred();f.network.catalog=()=>old.promise;const previous=f.ui.refreshRooms();
  f.network.baseUrl='https://two.example.test';f.network.catalog=()=>next.promise;f.ui.renderPanel();const current=f.ui.refreshRooms();
  next.resolve({rooms:[room('Neuer Server')]});await current;old.resolve({rooms:[room('Alter Server')]});await previous;
  assert.match(f.get('party-room-list').innerHTML,/Neuer Server/);assert.doesNotMatch(f.get('party-room-list').innerHTML,/Alter Server/);
  assert.equal(f.ui.roomCatalogCache.baseUrl,'https://two.example.test');
}));

test('closing the party panel during a catalog request preserves its empty or escaped error result for reopening',()=>withFixture({},async f=>{
  const flight=deferred();f.network.catalog=()=>flight.promise;const request=f.ui.refreshRooms();f.ui.activePanel=null;
  flight.resolve({rooms:[]});await request;f.ui.activePanel='party';f.ui.renderPanel();assert.match(f.get('party-room-list').innerHTML,/Noch keine offene Gruppe/);
  f.network.catalog=async()=>{throw new Error('<Server nicht erreichbar>');};await f.ui.refreshRooms();f.ui.renderPanel();
  assert.match(f.get('party-room-list').innerHTML,/&lt;Server nicht erreichbar&gt;/);assert.doesNotMatch(f.get('party-room-list').innerHTML,/<Server nicht erreichbar>/);
}));

test('solo account PvP roster updates do not replace the group picker, while group updates keep cached rooms',()=>withFixture({},async f=>{
  f.network.catalog=async()=>({rooms:[room()]});await f.ui.refreshRooms();const writes=f.elements['panel-content'].writes;
  f.game.pvp.roster=[{id:'self',name:'Aren',available:true}];f.ui.updatePvp();assert.equal(f.elements['panel-content'].writes,writes);
  f.network.inParty=true;f.network.privateWorld=false;f.network.roomCode='OPEN1234';f.game.pvp.roster.push({id:'other',name:'Mira',available:true});f.ui.updatePvp();
  assert.equal(f.elements['panel-content'].writes,writes+1);assert.match(f.get('party-room-list').innerHTML,/Glutwacht/);
}));

test('clipboard fallback targets the replacement panel and its selected invitation survives later updates',()=>withFixture({inParty:true,privateWorld:false,roomCode:'OPEN1234'},async f=>{
  const flight=deferred();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>flight.promise}}});
  const button=f.elements['panel-content'].querySelector('[data-command="party-copy-link"]');button.focus();const pending=f.ui.networkCommand('party-copy-link');
  const old=f.get('party-copy-feedback');f.ui.renderPanel();assert.equal(old.isConnected,false);
  assert.equal(f.document.activeElement.dataset.command,'party-copy-link','A copy button without data-id keeps keyboard focus');
  flight.reject(new Error('Clipboard blocked'));await pending;
  const input=f.get('party-invite-link');assert.equal(f.document.activeElement,input);assert.equal(input.selected,true);assert.equal(input.value,'https://one.example.test/?join=OPEN1234');
  const writes=f.elements['panel-content'].writes;f.ui.renderPanel();assert.equal(f.elements['panel-content'].writes,writes);assert.equal(f.get('party-invite-link'),input);
  f.document.body.focus();f.ui.renderPanel();assert.equal(f.get('party-invite-link').value,input.value);assert.match(f.get('party-copy-feedback').innerHTML,/Wähle den Einladungslink/);
  f.network.roomCode='OTHER567';f.ui.renderPanel();assert.equal(f.get('party-invite-link'),undefined,'Another group must not expose the previous invitation');
}));

test('typed group codes are not discarded by a roster-triggered panel update',()=>withFixture({},f=>{
  const input=f.get('party-join-code');input.value=' ABC1234';input.focus();const writes=f.elements['panel-content'].writes;f.ui.renderPanel();
  assert.equal(f.elements['panel-content'].writes,writes);assert.equal(input.value,' ABC1234');assert.equal(f.ui.pendingPanelRender,true);
}));
