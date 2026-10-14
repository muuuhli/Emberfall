import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { MobileInput } from '../src/mobile-input.js';
import { NoticeQueue } from '../src/ui-notices.js';

// These fixtures expose DOM events and focus, but do not simulate browser layout.
// The handlers, queue, game state and touch state under test are production code.
function fixture() {
  const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame};
  const frames=[],documentListeners=new Map(),windowListeners=new Map(),nodes=new Map();
  const listen=(listeners,name,handler)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);};
  function surface(id,{dataset={},tag='DIV',parent=null}={}) {
    const listeners=new Map(),classes=new Set(),attributes=new Map();let html='';
    const element={id,dataset,tagName:tag,parentElement:parent,hidden:false,disabled:false,isConnected:true,scrollTop:0,writes:0,textContent:'',style:{},controls:[],
      classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
      setAttribute(name,value){attributes.set(name,String(value));},getAttribute:name=>attributes.get(name),
      get innerHTML(){return html;},set innerHTML(value){html=value;this.writes++;this.scrollTop=0;if(this.parentElement?.classList.contains('info-body'))this.parentElement.scrollTop=0;},
      addEventListener(name,handler){listen(listeners,name,handler);},
      fire(name,event={}){for(const handler of listeners.get(name)||[])handler({target:this,...event});},
      focus(){globalThis.document.activeElement=this;},
      closest(selector){if(selector==='button')return this.tagName==='BUTTON'?this:null;if(selector==='[hidden]'){let item=this;while(item){if(item.hidden)return item;item=item.parentElement;}}return null;},
      matches:selector=>selector==='select'?tag==='SELECT':false,
      contains(other){for(let item=other;item;item=item.parentElement)if(item===this)return true;return false;},
      getClientRects(){return this.closest('[hidden]')?[]:[{}];},
      querySelectorAll(selector){return selector==='[data-info-tab]'?this.controls.filter(control=>control.dataset.infoTab):this.controls;},
      querySelector(selector){return this.controls.find(control=>selector==='button'||selector==='[data-command="pvp-return"]'&&control.dataset.command==='pvp-return')||null;},
      appendChild(child){child.parentElement=this;this.controls.push(child);},remove(){this.isConnected=false;}};
    nodes.set(id,element);return element;
  }
  const ids=['welcome-overlay','welcome-classes','start-button','continue-button','panel-overlay','game-panel','panel-title','panel-description','panel-content','close-panel','save-button','save-state','save-import','world-hud','quest-tracker','notice-stack','info-panel','info-close','info-tabs','info-history','info-objectives','pvp-hud','world'];
  const elements=Object.fromEntries(ids.map(id=>[id,surface(id)])),touchControls=surface('touch-controls'),trigger=surface('info-trigger',{tag:'BUTTON',dataset:{command:'toggle-info'}}),badge=surface('info-badge'),body=surface('body');
  elements['info-panel'].hidden=true;elements['panel-overlay'].hidden=true;elements['welcome-overlay'].hidden=true;
  elements['info-close'].tagName='BUTTON';elements['info-close'].dataset.command='close-info';elements['info-close'].parentElement=elements['info-panel'];
  const infoBody=surface('info-body',{parent:elements['info-panel']});infoBody.classList.add('info-body');
  elements['info-tabs'].parentElement=elements['info-panel'];elements['info-history'].parentElement=infoBody;elements['info-objectives'].parentElement=infoBody;
  const historyTab=surface('history-tab',{tag:'BUTTON',dataset:{infoTab:'history'},parent:elements['info-tabs']}),objectivesTab=surface('objectives-tab',{tag:'BUTTON',dataset:{infoTab:'objectives'},parent:elements['info-tabs']});
  elements['info-tabs'].controls=[historyTab,objectivesTab];elements['info-panel'].controls=[elements['info-close'],historyTab,objectivesTab];
  elements['game-panel'].parentElement=elements['panel-overlay'];elements['close-panel'].parentElement=elements['game-panel'];elements['close-panel'].tagName='BUTTON';elements['game-panel'].controls=[elements['close-panel']];
  elements['panel-content'].parentElement=elements['game-panel'];
  const rescue=surface('rescue',{tag:'BUTTON',parent:elements['panel-content']});elements['panel-content'].controls=[rescue];
  const document={body,activeElement:trigger,hidden:false,getElementById:id=>nodes.get(id)||null,addEventListener(name,handler){listen(documentListeners,name,handler);},
    querySelector:selector=>selector==='.touch-controls'?touchControls:null,
    querySelectorAll:selector=>selector==='[data-info-count]'?[badge]:selector==='[data-command="toggle-info"]'?[trigger]:[],
    fire(name,event={}){const dispatched={target:this.activeElement,defaultPrevented:false,immediateStopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.immediateStopped=true;},...event};for(const handler of documentListeners.get(name)||[]){handler(dispatched);if(dispatched.immediateStopped)break;}return dispatched;}};
  globalThis.document=document;globalThis.window={addEventListener(name,handler){listen(windowListeners,name,handler);}};globalThis.requestAnimationFrame=handler=>frames.push(handler);
  const game=new Game({storage:null});game.start();let time=1000;
  const ui=Object.assign(Object.create(GameUI.prototype),{game,elements,activePanel:null,previousFocus:null,infoOpen:false,infoTab:'history',infoLastReadReceipt:0,pausedByInformation:false,notices:[],noticeQueue:new NoticeQueue({now:()=>time}),panelPointers:new Set(),updates:0,
    update(){this.updates++;},renderNotice(){},renderPanel(){},updateHudLayout(){},refreshRooms(){},showNotice(){}});
  ui.bind();
  return{ui,game,elements,document,trigger,badge,historyTab,objectivesTab,infoBody,touchControls,frames,
    tick(ms){time+=ms;},flush(){while(frames.length)frames.shift()();},restore(){Object.assign(globalThis,saved);}};
}
function withFixture(run){const f=fixture();try{return run(f);}finally{f.restore();}}

test('opening the information drawer stops native movement and held touch actions, then resumes its own offline pause',()=>withFixture(f=>{
  const {ui,game}=f,input=new MobileInput();game.keys.add('w');input.start(1,'move',48,0,{x:0,y:0});input.start(2,'attack');input.start(3,'bolt');let resets=0;
  ui.onInputReset=()=>{input.clear();resets++;};assert.equal(ui.toggleInformation(),true);f.flush();
  assert.equal(ui.informationOpen,true);assert.equal(f.elements['info-panel'].hidden,false);assert.equal(game.paused,true);assert.equal(game.keys.size,0);assert.equal(input.keys().size,0);assert.equal(input.held('attack'),false);assert.deepEqual(input.drainActions(),[]);assert.equal(f.document.activeElement,f.elements['info-close']);
  assert.equal(ui.closeInformation(),true);assert.equal(game.paused,false);assert.equal(f.document.activeElement,f.trigger);assert.equal(resets,2);
}));

test('reading an online log stops local input without pausing the shared simulation',()=>withFixture(f=>{
  f.game.networkClient={online:true};f.game.keys.add('d');let resets=0;f.ui.onInputReset=()=>resets++;
  assert.equal(f.ui.toggleInformation(),true);assert.equal(f.game.paused,false);assert.equal(f.game.keys.size,0);assert.equal(f.ui.pausedByInformation,false);
  f.ui.closeInformation();assert.equal(f.game.paused,false);assert.equal(resets,2);
}));

test('a drawer over a menu preserves the parent pause and restores that menu focus',()=>withFixture(f=>{
  f.ui.togglePanel('inventory');f.flush();assert.equal(f.game.paused,true);f.ui.toggleInformation();f.flush();
  assert.equal(f.ui.pausedByInformation,false);f.ui.closeInformation();assert.equal(f.ui.currentPanel,'inventory');assert.equal(f.game.paused,true);assert.equal(f.document.activeElement,f.elements['close-panel']);
  f.ui.closePanel();assert.equal(f.game.paused,false);assert.equal(f.document.activeElement,f.trigger);
}));

test('closing a parent menu cannot leave an open drawer over a running offline world',()=>withFixture(f=>{
  f.ui.togglePanel('inventory');f.ui.toggleInformation();f.ui.closePanel();f.flush();
  assert.equal(f.ui.currentPanel,null);assert.equal(f.ui.informationOpen,false);assert.equal(f.elements['info-panel'].hidden,true);assert.equal(f.game.paused,false);
}));

test('native Escape closes the top information layer before its parent menu and restores visible focus',()=>withFixture(f=>{
  f.ui.togglePanel('inventory');f.flush();f.ui.toggleInformation();f.flush();
  const first=f.document.fire('keydown',{key:'Escape'});assert.equal(first.defaultPrevented,true);assert.equal(first.immediateStopped,true);assert.equal(f.ui.informationOpen,false);assert.equal(f.ui.currentPanel,'inventory');assert.equal(f.game.paused,true);assert.equal(f.document.activeElement,f.elements['close-panel']);
  f.document.fire('keydown',{key:'Escape'});assert.equal(f.ui.currentPanel,null);assert.equal(f.game.paused,false);assert.equal(f.document.activeElement,f.trigger);
}));

test('native Tab stays inside the visible information controls and handles reverse traversal',()=>withFixture(f=>{
  f.ui.toggleInformation();f.flush();f.objectivesTab.focus();const forward=f.document.fire('keydown',{key:'Tab',shiftKey:false});assert.equal(forward.defaultPrevented,true);assert.equal(f.document.activeElement,f.elements['info-close']);
  const backward=f.document.fire('keydown',{key:'Tab',shiftKey:true});assert.equal(backward.defaultPrevented,true);assert.equal(f.document.activeElement,f.objectivesTab);
  f.trigger.focus();f.document.fire('keydown',{key:'Tab',shiftKey:false});assert.equal(f.document.activeElement,f.elements['info-close']);
}));

test('new log entries escape their full text while preserving the reader scroll and stable tab focus',()=>withFixture(f=>{
  const q=f.ui.noticeQueue;q.push('<img src=x onerror=alert(1)> gefunden','loot');q.push('Erster Eid angenommen','quest');f.ui.toggleInformation('history');f.flush();
  const history=f.elements['info-history'];assert.ok(history.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));assert.ok(!history.innerHTML.includes('<img src=x'));
  f.historyTab.focus();f.infoBody.scrollTop=135;const writes=history.writes;f.ui.renderInformation();assert.equal(history.writes,writes,'Unchanged log does not replace its content');
  q.push('Eine neue Reise beginnt','story');f.ui.renderInformation();assert.equal(history.writes,writes+1);assert.equal(f.infoBody.scrollTop,135);assert.equal(f.document.activeElement,f.historyTab);
}));

test('an updated loot group becomes unread again after it was read, and reading it clears the badge',()=>withFixture(f=>{
  const q=f.ui.noticeQueue;q.push('Eisenklinge gefunden','loot');f.ui.renderInformation();assert.equal(f.badge.hidden,false);assert.equal(f.badge.textContent,'1');
  f.ui.toggleInformation('history');assert.equal(f.badge.hidden,true);f.ui.closeInformation();q.push('Wanderstab gefunden','loot');assert.equal(q.history.length,1,'Both finds are still one burst');f.ui.renderInformation();assert.equal(f.badge.hidden,false);assert.equal(f.badge.textContent,'1');
  f.ui.toggleInformation('history');assert.equal(f.badge.hidden,true);assert.ok(f.elements['info-history'].innerHTML.includes('Eisenklinge gefunden'));assert.ok(f.elements['info-history'].innerHTML.includes('Wanderstab gefunden'));
}));

test('reading objectives does not silently consume unread messages and tab buttons reflect their selected state',()=>withFixture(f=>{
  f.ui.noticeQueue.push('Questziel erreicht: Der Brunnen','quest');f.ui.toggleInformation('objectives');assert.equal(f.elements['info-history'].hidden,true);assert.equal(f.elements['info-objectives'].hidden,false);assert.equal(f.badge.hidden,false);
  assert.equal(f.objectivesTab.getAttribute('aria-pressed'),'true');assert.equal(f.historyTab.getAttribute('aria-pressed'),'false');assert.equal(f.ui.selectInformationTab('unknown'),false);assert.equal(f.ui.infoTab,'objectives');
  f.document.fire('click',{target:f.historyTab});assert.equal(f.ui.infoTab,'history');assert.equal(f.badge.hidden,true);
}));

test('death takes priority over reading and its mandatory recovery cannot be dismissed or unpaused',()=>withFixture(f=>{
  f.ui.toggleInformation();f.game.dead=true;f.game.player.hp=0;f.game.paused=true;f.ui.showDeath();f.flush();
  assert.equal(f.ui.informationOpen,false);assert.equal(f.ui.currentPanel,'death');assert.equal(f.game.paused,true);assert.equal(f.ui.toggleInformation(),false);
  f.document.fire('keydown',{key:'Escape'});assert.equal(f.ui.currentPanel,'death');assert.equal(f.game.paused,true);
}));

test('PvP transitions close information layers while retaining the complete journey log',()=>withFixture(f=>{
  f.game.networkClient={online:true};f.ui.noticeQueue.push('Vor dem Duell geborgene Klinge','loot');f.ui.toggleInformation();f.game.worldMode='pvp';f.game.pvp={duel:{state:'active',opponentName:'Rival',timeLeft:90}};f.ui.updatePvp();
  assert.equal(f.ui.informationOpen,false);assert.ok(f.ui.noticeQueue.history.some(entry=>entry.text==='Vor dem Duell geborgene Klinge'));assert.equal(f.ui.noticeQueue.active,null);
  assert.equal(f.ui.toggleInformation(),true);f.game.pvp.duel.state='finished';f.ui.updatePvp();assert.equal(f.ui.informationOpen,false);assert.equal(f.ui.toggleInformation(),false,'The result stays the top layer until the player returns or opens its permitted settings');
}));

test('native action and learned-ability buttons cannot cast through an open online drawer',()=>withFixture(f=>{
  f.game.networkClient={online:true};let casts=0;f.game.action=()=>casts++;f.game.useLearnedAbility=()=>casts++;f.game.abilityLoadout[0]='guardian_bulwark';f.ui.toggleInformation();
  f.document.fire('click',{target:{disabled:false,dataset:{action:'bolt'},closest(){return this;}}});f.ui.useAbilitySlot(0);assert.equal(casts,0);assert.equal(f.ui.informationOpen,true);
}));
