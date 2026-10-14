import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { GameUI } from './ui.js';
import { GameAudio } from './audio.js';
import { NetworkClient } from './network.js';
import { readPreferredServerAddress } from './server-address.js';
import { MobileInput, bindMobileControls, nearestVisibleEnemy } from './mobile-input.js';
import { ENEMY_TYPES } from './catalog.js';

const game=new Game();
const network=new NetworkClient(game,{baseUrl:readPreferredServerAddress()});game.networkClient=network;
const renderer=new Renderer(document.getElementById('world'),game.world);
const ui=new GameUI(game);
const audio=new GameAudio(game);
game.onNotice=(text,tone)=>ui.showNotice(text,tone);
game.onDialogue=npc=>ui.showDialogue(npc);
game.onDeath=()=>ui.showDeath();
game.onVictory=()=>ui.showVictory();
game.onSound=(event,details)=>audio.play(event,details);

const canvas=document.getElementById('world');
const keyboardKeys=new Set(),touch=new MobileInput();
const blocked=()=>!game.started||game.paused||Boolean(ui.currentPanel)||network.online&&!network.connected||!document.getElementById('welcome-overlay').hidden;
const touchControls=bindMobileControls(document.querySelector('.touch-controls'),touch,{isBlocked:blocked,onPress:()=>audio.unlock()});
let attackRepeat=0;
const syncKeys=()=>{game.keys.clear();for(const key of keyboardKeys)game.keys.add(key);for(const key of touch.keys())game.keys.add(key);};
const clearInput=()=>{keyboardKeys.clear();touchControls.clear();game.keys.clear();game.aim=null;attackRepeat=0;};
ui.onInputReset=clearInput;
network.onWorldChange=clearInput;
function performAction(action,autoAim=false) {
  if(blocked())return;
  if(game.worldMode==='pvp'&&!['attack','bolt','nova','dash'].includes(action))return;
  audio.unlock();
  if(autoAim&&['attack','bolt','nova','skill0','skill1'].includes(action)) {
    const targets=game.worldMode==='pvp'?(game.otherPlayers||[]).map(p=>({...p,alive:!p.dead})):game.world.enemies;
    const target=nearestVisibleEnemy(game.player,targets,renderer.bounds);
    game.aim=target?{x:target.x,y:target.y}:null;
    if(target)game.player.face=Math.atan2(target.y-game.player.y,target.x-game.player.x);
    else {const move=touch.movement();if(move.x||move.y)game.player.face=Math.atan2(move.y,move.x);}
  }
  if(network.online)network.sendInput(game.keys,game.player.face);
  if(action==='skill0'||action==='skill1') {
    const slot=action==='skill0'?0:1;
    if(game.abilityLoadout?.[slot])game.useLearnedAbility(slot);
    else {ui.talentTab='abilities';ui.togglePanel('talents');}
  }else game.action(action);
}
const actionKeys={j:'attack',' ':'dash',q:'bolt','1':'bolt','2':'nova','3':'skill0','4':'skill1',f:'nova',r:'potion',e:'interact'};
const panelKeys={i:'inventory',t:'skills',c:'character',m:'map',l:'journal',b:'crafting',p:'party',u:'dungeons',v:'bestiary',h:'interactions',n:'journey',o:'adventures'};
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
  if(event.target.closest('button')&&(ui.currentPanel||!game.started)&&[' ','Enter'].includes(event.key))return;
  const key=event.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
  if(key==='escape') { ui.togglePanel('settings');clearInput();return; }
  if(!event.repeat&&panelKeys[key]&&game.started) { ui.togglePanel(panelKeys[key]);clearInput();return; }
  if(blocked()) return;
  keyboardKeys.add(key);syncKeys();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) game.aim=null;
  if(!event.repeat&&actionKeys[key]) performAction(actionKeys[key]);
});
document.addEventListener('keyup',event=>{keyboardKeys.delete(event.key.toLowerCase());syncKeys();});
window.addEventListener('blur',()=>{ clearInput(); if(game.started&&!game.paused) ui.togglePanel('settings'); });
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(game.started)game.save(false);}});
canvas.addEventListener('pointermove',event=>{ if(event.pointerType!=='touch'&&!blocked()) game.aim=renderer.screenToWorld(event.clientX,event.clientY); });
canvas.addEventListener('pointerleave',()=>game.aim=null);
canvas.addEventListener('pointerdown',event=>{
  if(blocked()||event.pointerType==='touch')return;
  audio.unlock();if(event.button===0) { game.aim=renderer.screenToWorld(event.clientX,event.clientY);game.player.face=Math.atan2(game.aim.y-game.player.y,game.aim.x-game.player.x);performAction('attack'); }
  if(event.button===2) performAction('dash');
});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('pointerdown',()=>audio.unlock(),{once:true});
window.addEventListener('resize',()=>{clearInput();renderer.resize();});
window.visualViewport?.addEventListener('resize',()=>renderer.resize());
window.addEventListener('beforeunload',()=>{if(game.started)game.save(false);audio.dispose?.();});

let last=performance.now(),hudTimer=0;
function frame(now) {
  const dt=Math.min(.04,(now-last)/1000);last=now;
  touch.setBlocked(blocked());syncKeys();
  if(!blocked()) {
    const move=touch.movement();if((move.x||move.y)&&!touch.held('attack'))game.aim=null;
    const actions=touch.drainActions();for(const action of actions)performAction(action,true);
    attackRepeat-=dt;
    if(actions.includes('attack'))attackRepeat=.1;
    if(touch.held('attack')&&attackRepeat<=0){performAction('attack',true);attackRepeat=.1;}
  }
  if(network.online) {
    network.update(dt);
    const dx=(game.keys.has('d')||game.keys.has('arrowright')?1:0)-(game.keys.has('a')||game.keys.has('arrowleft')?1:0),dy=(game.keys.has('s')||game.keys.has('arrowdown')?1:0)-(game.keys.has('w')||game.keys.has('arrowup')?1:0);
    const angle=game.aim?Math.atan2(game.aim.y-game.player.y,game.aim.x-game.player.x):dx||dy?Math.atan2(dy,dx):game.player.face;
    network.sendInput(ui.currentPanel?[]:game.keys,angle);
  } else game.update(dt);
  audio.update?.({regionId:game.regionAt().id,dungeonId:game.dungeonInstance?.id||null,boss:!!game.dungeonInstance?.bossEngaged&&!game.dungeonInstance?.bossDefeated||game.world.enemies.some(e=>e.alive&&e.aggro&&(ENEMY_TYPES[e.type]?.boss||e.boss||e.bossVariant)&&Math.hypot(e.x-game.player.x,e.y-game.player.y)<650),pvp:game.worldMode==='pvp'});
  renderer.draw(game,dt);
  hudTimer+=dt;
  if(hudTimer>.1||game.dirty) { ui.update();hudTimer=0;game.dirty=false; }
  requestAnimationFrame(frame);
}
renderer.resize();ui.update();requestAnimationFrame(frame);
// A small inspection surface is helpful to local QA and modding. No network services.
window.emberfall={game,ui,renderer,network,touch};
