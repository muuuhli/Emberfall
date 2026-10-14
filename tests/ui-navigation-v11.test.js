import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';

test('every existing game view is reachable through four groups with only the active group expanded',()=>{
  const ui=Object.create(GameUI.prototype),views=['character','talents','inventory','craft','journal','journey','bestiary','map','adventures','dungeons','interactions','party','social'];
  const reachable=new Set();
  for(const view of views){
    const html=ui.menuNavigation(view);
    assert.equal((html.match(/class="menu-group-button/g)||[]).length,4);
    assert.equal((html.match(/class="menu-section-list"/g)||[]).length,1);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
    assert.match(html,new RegExp(`data-panel="${view}" class="active" aria-current="page"`));
    for(const match of html.matchAll(/data-panel="([^"]+)"/g))reachable.add(match[1]);
  }
  assert.deepEqual([...reachable].sort(),views.sort());
  const settings=ui.menuNavigation('settings');
  assert.equal((settings.match(/class="menu-group-button/g)||[]).length,4);
  assert.equal((settings.match(/class="menu-section-list"/g)||[]).length,0);
});

test('inventory refresh keeps its navigation controls mounted while actual item content changes',()=>{
  const previousDocument=globalThis.document,previousFrame=globalThis.requestAnimationFrame;
  const game=new Game({storage:null}),ui=Object.create(GameUI.prototype),content={scrollTop:0,innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}};
  let navigationWrites=0,navigationHtml='',focused=null;
  const navigation={hidden:false,get innerHTML(){return navigationHtml;},set innerHTML(value){navigationWrites++;navigationHtml=value;if(focused?.belongsToNavigation)focused=null;}};
  const navButton={dataset:{panel:'craft'},belongsToNavigation:true,matches(){return false;}};
  globalThis.document={get activeElement(){return focused;},getElementById(id){return id==='panel-navigation'?navigation:null;},querySelectorAll(){return [];}};
  globalThis.requestAnimationFrame=callback=>callback();
  Object.assign(ui,{game,activePanel:'inventory',inventoryTab:'consumables',inventoryPage:0,inventorySearch:'',inventoryType:'all',inventoryRarity:'all',inventorySort:'default',inventoryFlags:'all',panelPointers:new Set(),pendingScrollReset:true,infoOpen:false,noticeQueue:null,
    elements:{'game-panel':{dataset:{},contains(){return false;}},'panel-content':content,'panel-title':{textContent:''},'panel-description':{textContent:''},'close-panel':{hidden:false}}});
  try{
    ui.renderPanel();assert.equal(navigationWrites,1);
    const originalContent=content.innerHTML;focused=navButton;
    game.inventory.heal_potion+=7;ui.renderPanel();
    assert.notEqual(content.innerHTML,originalContent,'the visible bag really refreshed');
    assert.equal(navigationWrites,1,'state updates do not replace the navigation tree');
    assert.equal(focused,navButton,'the same focused navigation button survives');
  }finally{globalThis.document=previousDocument;globalThis.requestAnimationFrame=previousFrame;}
});
