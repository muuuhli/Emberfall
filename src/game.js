import { ITEMS, SKILLS, QUESTS, RECIPES, ENEMY_TYPES, NPCS, REGIONS } from './content.js';
import { makeWorld } from './world.js';

export const SAVE_KEY = 'emberfall.save.v1';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const angleDiff = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const validNum = (v, fallback, lo = 0, hi = 1e7) => Number.isFinite(v) ? clamp(v,lo,hi) : fallback;

export class Game {
  constructor({ storage = globalThis.localStorage, random = Math.random } = {}) {
    this.storage = storage; this.random = random; this.keys = new Set();
    this.onNotice = () => {}; this.onDialogue = () => {}; this.onDeath = () => {}; this.onVictory = () => {};
    this.onSound = () => {}; this.onChange = () => {};
    this.settings = { sound:true, shake:true, reducedMotion:false };
    this.hasSave = false; this.started = false; this.paused = false;
    this.initialize();
    try { this.hasSave = !!storage?.getItem(SAVE_KEY); if(this.hasSave) this.load(); } catch { this.hasSave=false; }
  }
  initialize() {
    this.world = makeWorld(); this.npcs = NPCS; this.time = 0;
    this.player = { name:'Aren', x:520, y:1250, face:Math.PI/2, walking:false, hp:112, mana:85, level:1, xp:0, gold:45, skillPoints:2, invulnerable:0, attackUntil:0, dashUntil:0, hitUntil:0 };
    this.inventory = {}; this.resources = {wood:0,ore:0,herb:0,crystal:0,seed:6,wheat:0};
    this.equipment = {weapon:null,armor:null,charm:null};
    this.skills = {}; this.questState = {}; this.discovered = ['daemmerhain']; this.unlockedShrines = [];
    this.flags = {}; this.ledger = {}; this.kills = 0; this.cooldowns = {attack:0,dash:0,nova:0,bolt:0,potion:0};
    this.camera = {x:520,y:1250}; this.effects = []; this.projectiles = []; this.drops = [];
    this.shake = 0; this.combo = 0; this.comboTime = -Infinity; this.dead = false; this.autoSaveTimer = 0;
    this.playTime = 0; this.lastRegion = 'daemmerhain'; this.aim = null; this.dirty = true;
    const weapons = Object.values(ITEMS).filter(i=>i.type==='weapon');
    const armors = Object.values(ITEMS).filter(i=>i.type==='armor');
    if(weapons[0]) { this.inventory[weapons[0].id]=1; this.equipment.weapon=weapons[0].id; }
    if(armors[0]) { this.inventory[armors[0].id]=1; this.equipment.armor=armors[0].id; }
    const potion = Object.values(ITEMS).find(i=>i.type==='consumable');
    if(potion) this.inventory[potion.id]=5;
    this.player.hp=this.stats().maxHp;
  }
  change() { this.dirty = true; this.onChange(); }
  notice(text,tone='info') { this.onNotice(text,tone); }
  stats() {
    const p=this.player;
    const s={maxHp:100+p.level*12,mana:80+p.level*5,damage:12+p.level*3,armor:2+p.level,crit:.06,speed:175,spellDamage:25+p.level*4,manaRegen:4,cooldown:0,dodgeCooldown:0,gatherYield:0,lifeSteal:0};
    for(const id of Object.values(this.equipment)) {
      for(const [key,value] of Object.entries(ITEMS[id]?.stats||{})) s[key]=(s[key]||0)+value;
    }
    for(const skill of SKILLS) {
      const rank=this.skills[skill.id]||0;
      if(!rank) continue;
      const effects=Array.isArray(skill.effect)?skill.effect:[skill.effect];
      for(const effect of effects) if(effect?.stat) s[effect.stat]=(s[effect.stat]||0)+effect.value*rank;
    }
    s.crit=clamp(s.crit,0,.7); s.speed=clamp(s.speed,120,300);
    s.cooldown=clamp(s.cooldown,-.6,.6); s.dodgeCooldown=clamp(s.dodgeCooldown,-.7,.7);
    return s;
  }
  xpNeeded() { return 70 + this.player.level * this.player.level * 22; }
  gainXp(amount) {
    this.player.xp += Math.max(0,amount);
    while(this.player.level<30 && this.player.xp>=this.xpNeeded()) {
      this.player.xp-=this.xpNeeded(); this.player.level++; this.player.skillPoints+=2;
      const s=this.stats(); this.player.hp=s.maxHp; this.player.mana=s.mana;
      this.notice(`Level ${this.player.level} erreicht · 2 Talentpunkte`,'level');
      this.effect('ring',this.player.x,this.player.y,{color:'#e7bf68',radius:100,life:1}); this.onSound('level');
    }
    this.change();
  }
  regionAt(x=this.player.x,y=this.player.y) {
    return REGIONS.find(r=>x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h)||REGIONS[0];
  }
  start() {
    this.started=true; this.paused=false; this.dead=false; this.keys.clear();
    if(!this.flags.welcomed) {
      this.flags.welcomed=true;
      this.notice('Willkommen in Dämmerhain. Sprich mit der Hüterin am Dorfbrunnen.');
    }
    this.change();
  }
  reset() { this.initialize(); this.hasSave=false; this.start(); this.save(false); }
  setSetting(key,value) {
    if(Object.hasOwn(this.settings,key)) this.settings[key]=!!value;
    this.change(); this.save(false);
  }
  effect(kind,x,y,options={}) {
    const life=options.life||.5;
    this.effects.push({kind,x,y,color:'#f1c475',radius:25,angle:0,life,maxLife:life,...options});
  }
  text(x,y,text,color='#f2d090') { this.effect('text',x,y,{text:String(text),color,life:1.1}); }
  event(kind,target,amount=1) {
    const key=`${kind}:${target}`; this.ledger[key]=(this.ledger[key]||0)+amount;
    for(const q of QUESTS) {
      const state=this.questState[q.id]; if(state?.status!=='active') continue;
      q.objectives.forEach((o,i)=> { if(o.kind===kind && o.target===target) state.counts[i]=Math.min(o.count,(state.counts[i]||0)+amount); });
      if(q.objectives.every((o,i)=>state.counts[i]>=o.count)) {
        state.status='ready'; this.notice(`Questziel erreicht: ${q.title}`,'quest'); this.onSound('quest');
      }
    }
    this.change();
  }
  canAccept(q) {
    if(this.questState[q.id]) return false;
    const requirements=Array.isArray(q.prerequisite)?q.prerequisite:q.prerequisite?[q.prerequisite]:[];
    return requirements.every(id=>this.questState[id]?.status==='done');
  }
  questAccept(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || !this.canAccept(q)) return false;
    const counts=q.objectives.map(o=>o.kind==='explore'||(o.kind==='kill'&&ENEMY_TYPES[o.target]?.boss)?Math.min(o.count,this.ledger[`${o.kind}:${o.target}`]||0):0);
    this.questState[id]={status:q.objectives.every((o,i)=>counts[i]>=o.count)?'ready':'active',counts};
    this.notice(`Quest angenommen: ${q.title}`,'quest'); this.onSound('quest'); this.save(false); this.change(); return true;
  }
  questTurnIn(id) {
    const q=QUESTS.find(q=>q.id===id); if(!q || this.questState[id]?.status!=='ready') return false;
    this.questState[id].status='done'; this.player.gold+=q.reward.gold||0; this.gainXp(q.reward.xp||0);
    if(q.reward.item) this.addItem(q.reward.item,1);
    if(q.reward.skillPoints) this.player.skillPoints+=q.reward.skillPoints;
    this.notice(`Abgeschlossen: ${q.title} · +${q.reward.xp||0} EP · +${q.reward.gold||0} Gold`,'quest');
    this.onSound('quest'); this.change(); this.save(false); return true;
  }
  learn(id) {
    const skill=SKILLS.find(s=>s.id===id); if(!skill) return false;
    const rank=this.skills[id]||0, cost=skill.cost||1;
    const requirement=skill.requires;
    const prereq = !requirement || (typeof requirement==='string' ? (this.skills[requirement]||0)>0 : Array.isArray(requirement) ? requirement.every(r=>(this.skills[typeof r==='string'?r:r.id]||0)>=(r.rank||1)) : (this.skills[requirement.id]||0)>=(requirement.rank||1));
    if(rank>=(skill.maxRank||3) || this.player.skillPoints<cost || !prereq) return false;
    this.skills[id]=rank+1; this.player.skillPoints-=cost;
    this.notice(`${skill.name} · Rang ${rank+1}`,'level'); this.onSound('level'); this.change(); this.save(false); return true;
  }
  addItem(id,amount=1) {
    if(!ITEMS[id]) return false;
    this.inventory[id]=(this.inventory[id]||0)+amount; this.change(); return true;
  }
  equip(id) {
    const item=ITEMS[id]; if(!item || !this.inventory[id] || !['weapon','armor','charm'].includes(item.type)) return false;
    this.equipment[item.type]=id; this.player.hp=Math.min(this.player.hp,this.stats().maxHp);
    this.notice(`${item.name} ausgerüstet`); this.change(); this.save(false); return true;
  }
  buy(id) {
    if(id==='seed') {
      if(this.player.gold<4) return false;
      this.player.gold-=4; this.resources.seed+=3; this.notice('3 Saatgut gekauft'); this.change(); this.save(false); return true;
    }
    const item=ITEMS[id]; if(!item || this.player.gold<item.price) return false;
    this.player.gold-=item.price; this.addItem(id); this.notice(`${item.name} gekauft`); this.save(false); return true;
  }
  sell(id) {
    const item=ITEMS[id]; if(!item || !this.inventory[id] || Object.values(this.equipment).includes(id)) return false;
    this.inventory[id]--; this.player.gold+=Math.max(1,Math.floor(item.price*.4)); this.change(); this.save(false); return true;
  }
  consume(id) {
    const item=ITEMS[id]; if(item?.type!=='consumable'||!this.inventory[id]) return false;
    const s=this.stats(); const p=this.player;
    if((!item.stats.hpRestore||p.hp>=s.maxHp)&&(!item.stats.manaRestore||p.mana>=s.mana)) return false;
    this.inventory[id]--; p.hp=Math.min(s.maxHp,p.hp+(item.stats.hpRestore||0)); p.mana=Math.min(s.mana,p.mana+(item.stats.manaRestore||0));
    this.notice(`${item.name} verwendet`); this.onSound('heal'); this.change(); this.save(false); return true;
  }
  craft(id) {
    const recipe=RECIPES.find(r=>r.id===id); if(!recipe) return false;
    if(!Object.entries(recipe.ingredients).every(([res,n])=>(this.resources[res]||this.inventory[res]||0)>=n)) { this.notice('Dir fehlen noch Materialien.'); return false; }
    for(const [res,n] of Object.entries(recipe.ingredients)) {
      if(Object.hasOwn(this.resources,res)) this.resources[res]-=n; else this.inventory[res]-=n;
    }
    if(Object.hasOwn(this.resources,recipe.output)) this.resources[recipe.output]+=recipe.amount||1;
    else this.addItem(recipe.output,recipe.amount||1);
    this.event('craft',id); this.gainXp(12); this.notice(`${recipe.name} hergestellt`,'loot'); this.onSound('craft'); this.save(false); return true;
  }
  nearby() {
    const p=this.player, candidates=[];
    const add=(kind,object,label,range)=> { const d=dist(p,object); if(d<range) candidates.push({kind,object,label,distance:d}); };
    this.npcs.forEach(n=>add('npc',n,`Mit ${n.name} sprechen`,85));
    this.world.nodes.filter(n=>n.readyAt<=this.time).forEach(n=>add('node',n,({wood:'Holz sammeln',ore:'Erz abbauen',herb:'Kräuter sammeln',crystal:'Kristalle bergen'})[n.type],65));
    this.world.plots.forEach(n=>add('plot',n,n.state==='empty'?'Saat pflanzen':n.readyAt<=this.time?'Weizen ernten':'Weizen wächst …',48));
    this.world.chests.filter(n=>!n.opened).forEach(n=>add('chest',n,'Truhe öffnen',60));
    this.world.shrines.forEach(n=>add('shrine',n,`${n.name} entzünden / rasten`,80));
    return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
  }
  interact() {
    if(!this.started || this.dead || this.paused) return;
    const n=this.nearby(); if(!n) { this.notice('Gehe näher an eine Person oder Ressource.'); return; }
    const o=n.object;
    if(n.kind==='npc') this.onDialogue(o);
    if(n.kind==='node') {
      const amount=1+Math.floor(this.stats().gatherYield)+Math.floor(this.random()*2);
      this.resources[o.type]=(this.resources[o.type]||0)+amount; o.readyAt=this.time+40;
      this.event('gather',o.type,amount); this.gainXp(5); this.text(o.x,o.y,`+${amount}`, '#a8cf8d');
      this.effect('burst',o.x,o.y,{color:'#b4cc82',life:.55}); this.onSound('gather');
    }
    if(n.kind==='plot') {
      if(o.state==='empty') {
        if(this.resources.seed<=0) { this.notice('Kaufe Saat beim Händler oder stelle sie aus Weizen her.'); return; }
        this.resources.seed--; o.state='growing'; o.readyAt=this.time+25; this.notice('Gepflanzt · Ernte in 25 Sekunden'); this.onSound('gather');
      } else if(o.readyAt<=this.time) {
        const amount=3+Math.floor(this.stats().gatherYield);
        this.resources.wheat+=amount; this.resources.seed+=1; o.state='empty';
        this.event('farm','wheat',amount); this.event('gather','wheat',amount); this.gainXp(15);
        this.text(o.x,o.y,`+${amount} Weizen`,'#ead080'); this.onSound('gather');
      } else this.notice(`Ernte in ${Math.ceil(o.readyAt-this.time)} Sekunden.`);
    }
    if(n.kind==='chest') {
      o.opened=true; const gold=20+Math.floor(this.random()*30); this.player.gold+=gold;
      const items=Object.values(ITEMS).filter(i=>i.type!=='consumable' && !Object.values(this.equipment).includes(i.id));
      const item=items[Math.floor(this.random()*items.length)];
      if(item) { this.addItem(item.id); this.notice(`Truhe: ${item.name} · +${gold} Gold`,'loot'); }
      this.gainXp(25); this.effect('burst',o.x,o.y,{color:'#f1c374',radius:55,life:1}); this.onSound('loot');
    }
    if(n.kind==='shrine') {
      const fresh=!this.unlockedShrines.includes(o.id);
      if(fresh) this.unlockedShrines.push(o.id);
      this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
      this.notice(fresh?`${o.name} entdeckt · Schnellreise freigeschaltet`:'Gerastet · Leben und Mana wiederhergestellt','quest');
      this.effect('ring',o.x,o.y,{color:'#b5dace',radius:100,life:1}); this.onSound('level');
    }
    this.change(); this.save(false);
  }
  travel(id) {
    const shrine=this.world.shrines.find(s=>s.id===id);
    if(!shrine || !this.unlockedShrines.includes(id)) return false;
    this.player.x=shrine.x; this.player.y=shrine.y+48; this.player.invulnerable=2;
    this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
    this.notice(`Schnellreise: ${shrine.name}`); this.change(); this.save(false); return true;
  }
  collides(x,y,r=12) {
    if(x<r+16 || y<r+16 || x>this.world.width-r-16 || y>this.world.height-r-16) return true;
    if(this.world.trees.some(o=>Math.hypot(o.x-x,o.y-y)<r+8*(o.scale||1))) return true;
    if(this.world.rocks.some(o=>Math.hypot(o.x-x,o.y-y)<r+12*(o.scale||1))) return true;
    return this.world.structures.some(o=> {
      if(o.blocking===false) return false;
      const box=o.collision||{x:o.x+8,y:o.y+o.h*.4,w:o.w-16,h:o.h*.5};
      return x+r>box.x && x-r<box.x+box.w && y+r>box.y && y-r<box.y+box.h;
    });
  }
  move(body,dx,dy,r=12) {
    // Axis separation lets the character slide along foliage and house corners.
    if(!this.collides(body.x+dx,body.y,r)) body.x+=dx;
    if(!this.collides(body.x,body.y+dy,r)) body.y+=dy;
  }
  action(name) {
    if(!this.started || this.paused || this.dead) return false;
    if(name==='interact') { this.interact(); return true; }
    if((this.cooldowns[name]||0)>0) return false;
    const p=this.player,s=this.stats();
    if(name==='attack') {
      this.combo=this.time-this.comboTime<1.1?(this.combo+1)%3:0; this.comboTime=this.time;
      const heavy=this.combo===2, arc=heavy?Math.PI:2.3, range=heavy?106:88;
      this.cooldowns.attack=.34; p.attackUntil=this.time+.22;
      this.effect('slash',p.x,p.y,{angle:p.face,radius:range,color:heavy?'#ffda82':'#ebebc4',life:.23});
      for(const e of this.world.enemies) {
        if(!e.alive || dist(p,e)>range || Math.abs(angleDiff(Math.atan2(e.y-p.y,e.x-p.x),p.face))>arc/2) continue;
        this.hitEnemy(e,s.damage*(heavy?1.55:1),heavy?28:18);
      }
      this.onSound('attack');
    } else if(name==='dash') {
      this.cooldowns.dash=Math.max(.4,1.35*(1-s.dodgeCooldown)); p.dashUntil=this.time+.18; p.invulnerable=.3;
      const dx=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
      const dy=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
      p.dashAngle=dx||dy?Math.atan2(dy,dx):p.face;
      this.effect('burst',p.x,p.y,{color:'#c6dfd5',radius:22,life:.3}); this.onSound('dash');
    } else if(name==='bolt') {
      if(p.mana<12) { this.notice('Nicht genug Mana.'); return false; }
      p.mana-=12; this.cooldowns.bolt=1.5*(1-s.cooldown);
      this.projectiles.push({x:p.x+Math.cos(p.face)*20,y:p.y+Math.sin(p.face)*20,angle:p.face,type:'bolt',speed:420,damage:s.spellDamage,life:1.8,owner:'player',radius:8});
      this.onSound('spell');
    } else if(name==='nova') {
      if(p.mana<28) { this.notice('Nicht genug Mana.'); return false; }
      p.mana-=28; this.cooldowns.nova=6*(1-s.cooldown);
      this.effect('ring',p.x,p.y,{color:'#f3a454',radius:175,life:.65});
      this.effect('burst',p.x,p.y,{color:'#ffd780',radius:140,life:.65});
      for(const e of this.world.enemies) if(e.alive&&dist(p,e)<180) { this.hitEnemy(e,s.spellDamage*1.45,45); e.slowUntil=this.time+2; }
      this.onSound('nova');
    } else if(name==='potion') {
      const id=Object.keys(this.inventory).find(id=>ITEMS[id]?.type==='consumable'&&ITEMS[id]?.stats.hpRestore&&this.inventory[id]>0);
      if(!id) { this.notice('Keine Heiltränke mehr. Braue neue im Handwerk.'); return false; }
      if(p.hp>=s.maxHp && (!ITEMS[id].stats.manaRestore||p.mana>=s.mana)) { this.notice('Dein Leben ist bereits voll.'); return false; }
      this.inventory[id]--; p.hp=Math.min(s.maxHp,p.hp+(ITEMS[id].stats.hpRestore||0)); p.mana=Math.min(s.mana,p.mana+(ITEMS[id].stats.manaRestore||0));
      this.cooldowns.potion=3; this.effect('ring',p.x,p.y,{color:'#a1e29f',radius:55,life:.6}); this.onSound('heal');
    } else return false;
    this.change(); return true;
  }
  hitEnemy(e,damage,knockback=20) {
    const crit=this.random()<this.stats().crit;
    const result=Math.max(1,Math.round(damage*(crit?1.7:1)*(.9+this.random()*.2)));
    e.hp-=result; e.hitUntil=this.time+.12; e.aggro=true;
    const a=Math.atan2(e.y-this.player.y,e.x-this.player.x);
    this.move(e,Math.cos(a)*knockback,Math.sin(a)*knockback,ENEMY_TYPES[e.type]?.boss?22:10);
    this.text(e.x,e.y-24,crit?`${result}!`:result,crit?'#ffd37b':'#f4edd7');
    this.effect('burst',e.x,e.y,{color:crit?'#f7c460':'#c7d39b',radius:24,life:.3});
    if(this.settings.shake) this.shake=Math.min(1,this.shake+(crit?.25:.12));
    if(this.stats().lifeSteal) this.player.hp=Math.min(this.stats().maxHp,this.player.hp+result*this.stats().lifeSteal);
    this.onSound('hit'); if(e.hp<=0) this.killEnemy(e);
  }
  killEnemy(e) {
    if(!e.alive) return;
    const def=ENEMY_TYPES[e.type]; e.alive=false; e.hp=0; e.respawnAt=def.boss?Infinity:this.time+55; e.aggro=false;
    this.kills++; this.event('kill',e.type); this.gainXp(def.xp); this.player.gold+=def.gold;
    this.text(e.x,e.y,`+${def.xp} EP`,'#b5ce83');
    this.effect('burst',e.x,e.y,{color:def.color,radius:def.boss?80:35,life:.65});
    const eligible=Object.values(ITEMS).filter(i=>i.type!=='consumable'&&!Object.values(this.equipment).includes(i.id));
    if(this.random()<(def.boss?1:.23) && eligible.length) {
      const allowed=def.level>=9?['uncommon','rare','epic']:def.level>=4?['uncommon','rare']:['common','uncommon'];
      const candidates=eligible.filter(i=>allowed.includes(i.rarity));
      const pool=candidates.length?candidates:eligible; const item=pool[Math.floor(this.random()*pool.length)];
      this.drops.push({x:e.x,y:e.y,item:item.id,life:120});
    }
    if(def.boss) { this.flags[e.type]=true; this.notice(`${def.name} besiegt!`,'level'); this.onSound('level'); this.save(false); }
    const bossTypes=Object.entries(ENEMY_TYPES).filter(([,d])=>d.boss).map(([id])=>id);
    if(bossTypes.length && bossTypes.every(id=>this.flags[id]) && !this.flags.victory) { this.flags.victory=true; this.save(false); this.onVictory(); }
  }
  damagePlayer(damage) {
    const p=this.player; if(p.invulnerable>0||this.dead) return;
    const hit=Math.max(1,Math.round(damage*100/(100+this.stats().armor*5)));
    p.hp=Math.max(0,p.hp-hit); p.invulnerable=.6; p.hitUntil=this.time+.18;
    this.text(p.x,p.y-30,`−${hit}`,'#f39786'); this.onSound('hurt');
    if(this.settings.shake) this.shake=Math.min(1,this.shake+.35);
    this.change(); if(p.hp<=0) { this.dead=true; this.paused=true; this.keys.clear(); this.onDeath(); }
  }
  respawn() {
    this.player.x=520; this.player.y=1250; this.player.hp=this.stats().maxHp; this.player.mana=this.stats().mana;
    this.player.gold=Math.max(0,Math.floor(this.player.gold*.9)); this.player.invulnerable=3;
    this.dead=false; this.paused=false; this.projectiles=[]; this.notice('Am Glutherd erwacht · 10 % Gold für deine Rettung'); this.save(false); this.change();
  }
  update(dt) {
    dt=Math.min(.04,Math.max(0,dt));
    if(!this.started || this.paused || this.dead) return;
    this.time+=dt; this.playTime+=dt; this.shake=Math.max(0,this.shake-dt*2);
    const p=this.player,s=this.stats();
    Object.keys(this.cooldowns).forEach(k=>this.cooldowns[k]=Math.max(0,this.cooldowns[k]-dt));
    p.invulnerable=Math.max(0,p.invulnerable-dt);
    p.mana=Math.min(s.mana,p.mana+s.manaRegen*dt);
    if(Math.hypot(p.x-520,p.y-1250)<260) p.hp=Math.min(s.maxHp,p.hp+3*dt);
    let mx=(this.keys.has('d')||this.keys.has('arrowright')?1:0)-(this.keys.has('a')||this.keys.has('arrowleft')?1:0);
    let my=(this.keys.has('s')||this.keys.has('arrowdown')?1:0)-(this.keys.has('w')||this.keys.has('arrowup')?1:0);
    const length=Math.hypot(mx,my); p.walking=length>0;
    if(length>0) { mx/=length; my/=length; if(!this.aim) p.face=Math.atan2(my,mx); }
    if(this.aim) p.face=Math.atan2(this.aim.y-p.y,this.aim.x-p.x);
    if(p.dashUntil>this.time) this.move(p,Math.cos(p.dashAngle??p.face)*s.speed*3.9*dt,Math.sin(p.dashAngle??p.face)*s.speed*3.9*dt);
    else this.move(p,mx*s.speed*dt,my*s.speed*dt);
    const region=this.regionAt();
    if(!this.discovered.includes(region.id)) { this.discovered.push(region.id); this.event('explore',region.id); this.notice(`${region.name} entdeckt`,'quest'); this.save(false); }
    if(region.id!==this.lastRegion) { this.lastRegion=region.id; this.change(); }
    for(const plot of this.world.plots) if(plot.state==='growing'&&plot.readyAt<=this.time) { plot.state='ripe'; this.change(); }
    this.updateEnemies(dt);
    for(const projectile of this.projectiles) {
      projectile.x+=Math.cos(projectile.angle)*projectile.speed*dt; projectile.y+=Math.sin(projectile.angle)*projectile.speed*dt; projectile.life-=dt;
      if(this.collides(projectile.x,projectile.y,3)) { projectile.life=0; continue; }
      if(projectile.owner==='player') {
        const target=this.world.enemies.find(e=>e.alive&&dist(e,projectile)<(ENEMY_TYPES[e.type]?.boss?36:20));
        if(target) { this.hitEnemy(target,projectile.damage,10); projectile.life=0; }
      } else if(dist(projectile,p)<23) { this.damagePlayer(projectile.damage); projectile.life=0; }
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0);
    for(const fx of this.effects) { fx.life-=dt; if(fx.kind==='text') fx.y-=18*dt; }
    this.effects=this.effects.filter(f=>f.life>0);
    for(const drop of this.drops) {
      drop.life-=dt;
      if(dist(drop,p)<40) { this.addItem(drop.item); this.notice(`${ITEMS[drop.item]?.name} gefunden`,'loot'); this.onSound('loot'); drop.life=0; }
    }
    this.drops=this.drops.filter(d=>d.life>0);
    this.autoSaveTimer+=dt;
    if(this.autoSaveTimer>20) { this.autoSaveTimer=0; this.save(false); }
  }
  updateEnemies(dt) {
    const p=this.player;
    for(const e of this.world.enemies) {
      const d=ENEMY_TYPES[e.type]; if(!d) continue;
      if(!e.alive) { if(!d.boss&&e.respawnAt<this.time&&dist(p,e)>500) { e.alive=true; e.hp=e.maxHp; e.x=e.homeX; e.y=e.homeY; e.phase='idle'; } continue; }
      const distance=dist(e,p); e.attackTimer=Math.max(0,(e.attackTimer||0)-dt);
      if(distance>600) { e.aggro=false; continue; }
      if(distance<260 || e.hp<e.maxHp) e.aggro=true;
      if(dist(e,{x:e.homeX,y:e.homeY})>480 || Math.hypot(p.x-520,p.y-1250)<275) e.aggro=false;
      if(!e.aggro) {
        const homeD=Math.hypot(e.x-e.homeX,e.y-e.homeY);
        if(homeD>6) this.move(e,(e.homeX-e.x)/homeD*d.speed*.7*dt,(e.homeY-e.y)/homeD*d.speed*.7*dt,10);
        e.phase='idle'; continue;
      }
      const a=Math.atan2(p.y-e.y,p.x-e.x); e.face=a;
      if(e.phase==='windup') {
        if(e.attackTimer<=0) {
          e.phase='recover'; e.attackTimer=d.boss?1.2:.85;
          if(d.boss) {
            const radius=e.telegraphRadius||105;
            this.effect('ring',e.x,e.y,{color:d.color,radius,life:.45});
            if(distance<radius) this.damagePlayer(d.damage*1.3);
            const phase2=e.hp<e.maxHp*.5; e.cycle=(e.cycle||0)+1;
            const emit=(angle,speed=160)=>this.projectiles.push({x:e.x,y:e.y,angle,type:'enemy',speed,damage:d.damage*.7,life:2.5,owner:'enemy',color:d.color});
            if(e.type==='thorn_guardian'&&phase2) for(let i=-1;i<=1;i++) emit(a+i*.28,145);
            if(e.type==='frost_sentinel') {
              const count=phase2?12:8;
              for(let i=0;i<count;i++) emit(i*Math.PI*2/count+e.cycle*.18,130);
              e.attackTimer=1.5;
            }
            if(e.type==='emberlord') {
              const count=phase2?5:3;
              for(let i=0;i<count;i++) emit(a+(i-(count-1)/2)*.22,190);
              if(phase2&&e.cycle%2===0) for(let i=0;i<12;i++) emit(i*Math.PI/6,120);
            }
          } else if((d.range||45)>80) this.projectiles.push({x:e.x,y:e.y,angle:a,type:'enemy',speed:195,damage:d.damage,life:2,owner:'enemy'});
          else if(distance<62) this.damagePlayer(d.damage);
        }
        continue;
      }
      if(e.phase==='recover'&&e.attackTimer>0) continue;
      const radii={thorn_guardian:105,frost_sentinel:150,emberlord:175};
      const range=d.boss?radii[e.type]*.85:(d.range||45);
      if(distance<range && e.attackTimer<=0) { e.phase='windup'; e.attackTimer=d.boss?1.1:.55; e.telegraphRadius=d.boss?radii[e.type]:d.range>80?30:62; }
      else {
        e.phase='chase';
        const speed=d.speed*(e.slowUntil>this.time?.45:1);
        if(distance>28) this.move(e,Math.cos(a)*speed*dt,Math.sin(a)*speed*dt,d.boss?22:10);
      }
    }
  }
  capture() {
    return {version:1,savedAt:Date.now(),player:{...this.player,walking:false},inventory:this.inventory,resources:this.resources,equipment:this.equipment,skills:this.skills,questState:this.questState,discovered:this.discovered,unlockedShrines:this.unlockedShrines,flags:this.flags,ledger:this.ledger,kills:this.kills,settings:this.settings,time:this.time,playTime:this.playTime,world:{nodes:this.world.nodes.map(n=>({id:n.id,readyAt:n.readyAt})),plots:this.world.plots,chests:this.world.chests.map(c=>({id:c.id,opened:c.opened})),enemies:this.world.enemies.filter(e=>ENEMY_TYPES[e.type]?.boss&&!e.alive).map(e=>e.id)}};
  }
  save(manual=true) {
    try {
      const data=JSON.stringify(this.capture()); const previous=this.storage?.getItem(SAVE_KEY);
      if(previous) this.storage?.setItem(SAVE_KEY+'.backup',previous);
      this.storage?.setItem(SAVE_KEY,data); this.hasSave=true;
      if(manual) this.notice('Deine Reise wurde gespeichert.','quest');
      return true;
    } catch { if(manual) this.notice('Speichern nicht möglich. Exportiere deine Reise unter Einstellungen.'); return false; }
  }
  applySave(data) {
    if(data?.version!==1 || !data.player || !Number.isFinite(data.player.level) || data.player.level<1 || data.player.level>30 || !Number.isFinite(data.player.x) || !Number.isFinite(data.player.y) || !data.world) throw new Error('Ungültiger Spielstand.');
    // Validate the full shape before touching the current adventure. An import
    // must either succeed completely or leave the running save unchanged.
    const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    if(!record(data.world)||!record(data.player)) throw new Error('Ungültige Weltdaten.');
    for(const key of ['inventory','resources','equipment','skills','questState','flags','ledger','settings']) {
      if(data[key]!==undefined&&!record(data[key])) throw new Error(`Ungültiges Feld: ${key}`);
    }
    for(const key of ['discovered','unlockedShrines']) if(data[key]!==undefined&&(!Array.isArray(data[key])||data[key].some(id=>typeof id!=='string'))) throw new Error(`Ungültiges Feld: ${key}`);
    for(const key of ['nodes','plots','chests','enemies']) if(data.world[key]!==undefined&&!Array.isArray(data.world[key])) throw new Error(`Ungültige Weltliste: ${key}`);
    for(const key of ['nodes','plots','chests']) if(data.world[key]?.some(v=>!record(v)||typeof v.id!=='string')) throw new Error('Ungültiger Weltzustand.');
    if(data.world.enemies?.some(id=>typeof id!=='string')) throw new Error('Ungültige Gegnerdaten.');
    for(const state of Object.values(data.questState||{})) if(!record(state)||!Array.isArray(state.counts)) throw new Error('Ungültige Questdaten.');
    this.initialize();
    const p=data.player;
    for(const key of ['x','y','hp','mana','level','xp','gold','skillPoints']) this.player[key]=validNum(p[key],this.player[key]);
    this.player.x=clamp(this.player.x,30,this.world.width-30); this.player.y=clamp(this.player.y,30,this.world.height-30);
    for(const [id,count] of Object.entries(data.inventory||{})) if(ITEMS[id]) this.inventory[id]=Math.floor(validNum(count,0));
    for(const key of Object.keys(this.resources)) this.resources[key]=Math.floor(validNum(data.resources?.[key],0));
    for(const slot of Object.keys(this.equipment)) { const id=data.equipment?.[slot]; this.equipment[slot]=ITEMS[id]?.type===slot&&this.inventory[id]>0?id:null; }
    for(const s of SKILLS) this.skills[s.id]=Math.floor(validNum(data.skills?.[s.id],0,0,s.maxRank||3));
    for(const q of QUESTS) {
      const state=data.questState?.[q.id]; if(!state||!['active','ready','done'].includes(state.status)) continue;
      const counts=q.objectives.map((o,i)=>Math.floor(validNum(state.counts?.[i],0,0,o.count)));
      this.questState[q.id]={status:state.status==='ready'&&!q.objectives.every((o,i)=>counts[i]>=o.count)?'active':state.status,counts};
    }
    this.discovered=Array.isArray(data.discovered)?data.discovered.filter(id=>REGIONS.some(r=>r.id===id)):['daemmerhain'];
    this.unlockedShrines=Array.isArray(data.unlockedShrines)?data.unlockedShrines.filter(id=>this.world.shrines.some(s=>s.id===id)):[];
    this.flags=typeof data.flags==='object'&&data.flags?data.flags:{}; this.ledger={};
    for(const [key,value] of Object.entries(data.ledger||{})) this.ledger[key]=validNum(value,0);
    this.time=validNum(data.time,0); this.playTime=validNum(data.playTime,0); this.kills=validNum(data.kills,0);
    if(data.settings) for(const key of Object.keys(this.settings)) if(typeof data.settings[key]==='boolean') this.settings[key]=data.settings[key];
    for(const node of this.world.nodes) { const saved=data.world.nodes?.find(n=>n.id===node.id); if(saved) node.readyAt=validNum(saved.readyAt,0); }
    for(const plot of this.world.plots) { const saved=data.world.plots?.find(n=>n.id===plot.id); if(saved&&['empty','growing','ripe'].includes(saved.state)) { plot.state=saved.state; plot.readyAt=validNum(saved.readyAt,0); } }
    for(const chest of this.world.chests) chest.opened=!!data.world.chests?.find(c=>c.id===chest.id)?.opened;
    for(const enemy of this.world.enemies) if(ENEMY_TYPES[enemy.type]?.boss&&(data.world.enemies||[]).includes(enemy.id)) { enemy.alive=false; enemy.hp=0; enemy.respawnAt=Infinity; }
    this.player.hp=clamp(this.player.hp,1,this.stats().maxHp); this.player.mana=clamp(this.player.mana,0,this.stats().mana);
    if(this.collides(this.player.x,this.player.y)) { this.player.x=520; this.player.y=1250; }
    this.camera={x:this.player.x,y:this.player.y}; this.lastRegion=this.regionAt().id; this.change();
  }
  load() {
    try { this.applySave(JSON.parse(this.storage.getItem(SAVE_KEY))); return true; }
    catch {
      try { this.applySave(JSON.parse(this.storage.getItem(SAVE_KEY+'.backup'))); return true; }
      catch { this.hasSave=false; this.initialize(); return false; }
    }
  }
  exportSave() {
    const blob=new Blob([JSON.stringify(this.capture(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='emberfall-spielstand.json'; a.click(); URL.revokeObjectURL(url);
  }
  async importSave(file) {
    try { const data=JSON.parse(await file.text()); this.applySave(data); this.save(false); this.notice('Reise erfolgreich importiert.'); return true; }
    catch { this.notice('Dieser Spielstand ist beschädigt oder nicht kompatibel.'); return false; }
  }
}
