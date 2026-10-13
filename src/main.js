import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { GameUI } from './ui.js';
import { GameAudio } from './audio.js';
import { NetworkClient } from './network.js';

const game=new Game();
const network=new NetworkClient(game);game.networkClient=network;
const renderer=new Renderer(document.getElementById('world'),game.world);
const ui=new GameUI(game);
const audio=new GameAudio(game);
game.onNotice=(text,tone)=>ui.showNotice(text,tone);
game.onDialogue=npc=>ui.showDialogue(npc);
game.onDeath=()=>ui.showDeath();
game.onVictory=()=>ui.showVictory();
game.onSound=event=>audio.play(event);

const canvas=document.getElementById('world');
const actionKeys={j:'attack',' ':'dash',q:'bolt','1':'bolt','2':'nova','3':'potion',f:'nova',r:'potion',e:'interact'};
const panelKeys={i:'inventory',t:'skills',c:'character',m:'map',l:'journal',b:'crafting',p:'party',u:'dungeons'};
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')) return;
  const key=event.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) event.preventDefault();
  if(key==='escape') { ui.togglePanel('settings');game.keys.clear();return; }
  if(!event.repeat&&panelKeys[key]&&game.started) { ui.togglePanel(panelKeys[key]);game.keys.clear();return; }
  if(!game.started||game.paused||ui.currentPanel) return;
  game.keys.add(key);
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) game.aim=null;
  if(!event.repeat&&actionKeys[key]) { audio.unlock();game.action(actionKeys[key]); }
});
document.addEventListener('keyup',event=>game.keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>{ game.keys.clear(); if(game.started&&!game.paused) ui.togglePanel('settings'); });
document.addEventListener('visibilitychange',()=>{game.keys.clear();if(document.hidden&&game.started) game.save(false);});
canvas.addEventListener('pointermove',event=>{ if(event.pointerType!=='touch') game.aim=renderer.screenToWorld(event.clientX,event.clientY); });
canvas.addEventListener('pointerleave',()=>game.aim=null);
canvas.addEventListener('pointerdown',event=>{
  if(ui.currentPanel)return;
  audio.unlock();if(event.button===0) { game.aim=renderer.screenToWorld(event.clientX,event.clientY);game.action('attack'); }
  if(event.button===2) game.action('dash');
});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('pointerdown',()=>audio.unlock(),{once:true});
window.addEventListener('resize',()=>renderer.resize());
window.addEventListener('beforeunload',()=>{if(game.started)game.save(false);});

let last=performance.now(),hudTimer=0;
function frame(now) {
  const dt=Math.min(.04,(now-last)/1000);last=now;
  if(network.online) {
    network.update(dt);
    const dx=(game.keys.has('d')||game.keys.has('arrowright')?1:0)-(game.keys.has('a')||game.keys.has('arrowleft')?1:0),dy=(game.keys.has('s')||game.keys.has('arrowdown')?1:0)-(game.keys.has('w')||game.keys.has('arrowup')?1:0);
    const angle=game.aim?Math.atan2(game.aim.y-game.player.y,game.aim.x-game.player.x):dx||dy?Math.atan2(dy,dx):game.player.face;
    network.sendInput(ui.currentPanel?[]:game.keys,angle);
  } else game.update(dt);
  renderer.draw(game,dt);
  hudTimer+=dt;
  if(hudTimer>.1||game.dirty) { ui.update();hudTimer=0;game.dirty=false; }
  requestAnimationFrame(frame);
}
renderer.resize();ui.update();requestAnimationFrame(frame);
// A small inspection surface is helpful to local QA and modding. No network services.
window.emberfall={game,ui,renderer,network};
