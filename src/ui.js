import { REGIONS, RESOURCES, SKILLS, ITEMS, RECIPES, QUESTS, NPCS } from './content.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = (name, classes = '') => `<svg class="${classes}" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const format = value => Math.round(Number(value) || 0).toLocaleString('de-DE');
const percent = value => `${Math.round((Number(value) || 0) * 100)} %`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const statLabels = { damage:'Nahkampfschaden',spellDamage:'Zauberschaden',maxHp:'Lebenspunkte',mana:'Mana',armor:'Rüstung',crit:'Kritische Treffer',speed:'Bewegungstempo',manaRegen:'Mana / Sekunde',lifeSteal:'Lebensraub',gatherYield:'Sammelbonus',cooldown:'Kürzere Zauberabklingzeit',dodgeCooldown:'Kürzere Ausweichabklingzeit',hpRestore:'Heilung',manaRestore:'Mana auffüllen' };
const rarityLabels = { common:'Gewöhnlich',uncommon:'Ungewöhnlich',rare:'Selten',epic:'Episch',legendary:'Legendär' };
const typeLabels = {weapon:'Waffe',armor:'Rüstung',charm:'Amulett',consumable:'Verbrauchsgegenstand'};
const itemIcon = item => item?.type === 'weapon' ? item.id === 'arcanist_staff' ? 'bolt' : 'sword' : item?.type === 'armor' ? 'shield' : item?.type === 'charm' ? 'gem' : item?.id === 'hearty_meal' ? 'leaf' : 'potion';
const resourceIcon = id => ['wood','herb','seed','wheat'].includes(id) ? 'leaf' : 'gem';
const branchIcons = {'Wächter':'shield','Arkanist':'flame','Wildläufer':'leaf'};
const branchDescriptions = {'Wächter':'Halte stand. Jede Wunde macht dich stärker.','Arkanist':'Entfache die Glut und forme den Äther.','Wildläufer':'Bewege dich frei. Lebe von den Gaben des Hains.'};
const panels = {map:['Die freien Lande','Vier Regionen. Vergessene Wege. Eine letzte Glut.'],world:['Die freien Lande','Vier Regionen. Vergessene Wege. Eine letzte Glut.'],character:['Dein Charakter','Werde zu dem Helden, den diese Welt braucht.'],inventory:['Dein Gepäck','Jede Klinge hat eine Geschichte. Diese beginnt mit dir.'],talents:['Dein eigener Weg','Wächter, Arkanist oder Wildläufer – verbinde die Talente zu deinem Spielstil.'],craft:['Handwerk','Aus den Gaben der Welt entstehen deine nächsten Abenteuer.'],journal:['Deine Reise','Menschen, denen du hilfst. Orte, die du veränderst.'],settings:['Ein Moment der Ruhe','Deine Reise wird direkt in diesem Browser gespeichert.']};

export class GameUI {
  constructor(game) {
    this.game = game;
    this.activePanel = null;
    this.inventoryTab = 'equipment';
    this.questTab = 'active';
    this.dialogueNPC = null;
    this.lastState = '';
    this.lastTracker = '';
    this.lastMapAt = -Infinity;
    this.previousFocus = null;
    this.notices = [];
    this.elements = {};
    for (const id of ['welcome-overlay','start-button','continue-button','panel-overlay','game-panel','panel-title','panel-description','panel-content','close-panel','save-button','save-state','save-import','world-hud','quest-tracker','region-name','region-subtitle','player-name','player-level','hp-fill','hp-text','mana-fill','mana-text','xp-fill','xp-text','gold-count','talent-badge','potion-count','interact-prompt','world-time','world-weather','notice-stack','minimap','world']) this.elements[id] = document.getElementById(id);
    this.bind();
    this.syncWelcome();
    this.update(true);
  }

  bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.panel) { this.togglePanel(button.dataset.panel === 'world' ? 'map' : button.dataset.panel); return; }
      if (button.dataset.action) { this.game.action(button.dataset.action); this.update(true); return; }
      if (button.dataset.inventoryTab) { this.inventoryTab = button.dataset.inventoryTab; this.renderPanel(); return; }
      if (button.dataset.questTab) { this.questTab = button.dataset.questTab; this.renderPanel(); return; }
      if (button.dataset.command) this.command(button.dataset.command, button.dataset.id, button);
    });
    this.elements['start-button'].addEventListener('click', () => {
      if (this.game.hasSave) { this.togglePanel('reset'); return; }
      this.begin();
    });
    this.elements['continue-button'].addEventListener('click', () => this.begin());
    this.elements['close-panel'].addEventListener('click', () => this.closePanel());
    this.elements['panel-overlay'].addEventListener('click', event => { if (event.target === this.elements['panel-overlay']) this.closePanel(); });
    this.elements['save-button'].addEventListener('click', () => this.manualSave());
    document.getElementById('touch-interact').addEventListener('click', () => this.game.interact());
    this.elements['save-import'].addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = await this.game.importSave(file);
        if (result !== false) { this.showNotice('Deine Reise wurde geladen.', 'success'); this.closePanel(); this.syncWelcome(); this.update(true); }
      } catch (error) { this.showNotice('Dieser Spielstand konnte nicht geladen werden. Bitte wähle eine Emberfall-Datei.', 'error'); }
      event.target.value = '';
    });
    document.addEventListener('change', event => {
      const key = event.target.dataset.setting;
      if (!key) return;
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      this.game.setSetting(key, value);
      if (key === 'reducedMotion') document.body.classList.toggle('reduced-motion', value);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.activePanel) { event.preventDefault(); event.stopImmediatePropagation(); this.closePanel(); }
      if (event.key === 'Tab') this.trapFocus(event);
    });
    const moveKeys = {up:'w',left:'a',down:'s',right:'d'};
    document.querySelectorAll('[data-move]').forEach(button => {
      const key = moveKeys[button.dataset.move];
      const stop = () => { this.game.keys?.delete(key); button.classList.remove('pressed'); };
      button.addEventListener('pointerdown', event => { event.preventDefault(); if (!this.game.started || this.game.paused) return; button.setPointerCapture(event.pointerId); this.game.keys?.add(key); button.classList.add('pressed'); });
      for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, stop);
    });
    window.addEventListener('blur', () => { this.game.keys?.clear(); });
  }

  get currentPanel() { return this.activePanel; }

  begin() {
    this.closePanel();
    this.game.start();
    this.elements['welcome-overlay'].hidden = true;
    this.elements.world.focus({preventScroll:true});
    this.update(true);
  }

  syncWelcome() {
    this.elements['welcome-overlay'].hidden = Boolean(this.game.started);
    this.elements['continue-button'].hidden = !this.game.hasSave;
    this.elements['start-button'].innerHTML = `${this.game.hasSave ? 'Eine neue Reise beginnen' : 'Deine Reise beginnt'}${icon('arrow')}`;
    this.elements['save-state'].textContent = this.game.hasSave ? 'Reise gespeichert' : 'Ein neuer Anfang';
    if (!this.game.started) requestAnimationFrame(() => (this.game.hasSave ? this.elements['continue-button'] : this.elements['start-button']).focus({preventScroll:true}));
    document.body.classList.toggle('reduced-motion', Boolean(this.game.settings?.reducedMotion));
  }

  setText(id, value) { const element = this.elements[id]; if (element && element.textContent !== String(value)) element.textContent = value; }
  setWidth(id, value) { const element = this.elements[id]; const width = `${clamp(value, 0, 100)}%`; if (element && element.style.width !== width) element.style.width = width; }

  update(force = false) {
    const game = this.game;
    const player = game.player || {};
    const stats = typeof game.stats === 'function' ? game.stats() : {};
    let region = game.region;
    if (typeof region === 'function') region = region.call(game);
    if (!region && typeof game.regionAt === 'function') region = game.regionAt(player.x, player.y);
    if (typeof region === 'string') region = REGIONS.find(entry => entry.id === region);
    region ||= REGIONS.find(entry => player.x >= entry.x && player.x < entry.x + entry.w && player.y >= entry.y && player.y < entry.y + entry.h) || REGIONS[0];
    const hpMax = stats.maxHp || player.maxHp || 100;
    const manaMax = stats.mana || stats.maxMana || player.maxMana || 60;
    const xpMax = typeof game.xpNeeded === 'function' ? game.xpNeeded() : Number(game.xpNeeded) || 100;
    this.setText('region-name', region.name);
    this.setText('region-subtitle', `${region.subtitle.toUpperCase()} · STUFE ${region.level}+`);
    this.setText('player-name', player.name || 'Aren');
    this.setText('player-level', player.level || 1);
    this.setWidth('hp-fill', (player.hp || 0) / hpMax * 100);
    this.setWidth('mana-fill', (player.mana || 0) / manaMax * 100);
    this.setText('hp-text', `${format(player.hp)} / ${format(hpMax)}`);
    this.setText('mana-text', `${format(player.mana)} / ${format(manaMax)}`);
    this.setWidth('xp-fill', (player.xp || 0) / xpMax * 100);
    this.setText('xp-text', `STUFE ${player.level || 1} · ${format(player.xp)} / ${format(xpMax)} EP`);
    this.setText('gold-count', format(player.gold));
    const healingSupplies = Object.entries(game.inventory || {}).reduce((sum,[id,count]) => sum + (ITEMS[id]?.stats?.hpRestore ? Number(count) || 0 : 0),0);
    this.setText('potion-count', format(healingSupplies));
    this.setText('talent-badge', player.skillPoints || 0);
    this.elements['talent-badge'].hidden = !(player.skillPoints > 0);
    const nearby = game.started && !game.paused && typeof game.nearby === 'function' ? game.nearby() : null;
    this.elements['interact-prompt'].hidden = !nearby;
    if (nearby) this.elements['interact-prompt'].querySelector('span').textContent = nearby.label || 'Interagieren';
    const trackerState = JSON.stringify(game.questState || {});
    if (force || trackerState !== this.lastTracker) { this.lastTracker = trackerState; this.renderTracker(); }
    const state = JSON.stringify([player.level,player.skillPoints,Math.round(player.hp),Math.round(player.mana),player.gold,game.inventory,game.equipment,game.resources,game.skills,game.questState,game.discovered]);
    if (force || state !== this.lastState) { this.lastState = state; if (this.activePanel && !['death','victory','reset','settings'].includes(this.activePanel)) this.renderPanel(); }
    const now = performance.now();
    if (force || now - this.lastMapAt > 500) { this.lastMapAt = now; this.updateMinimap(); }
    const seconds = Number(game.time ?? game.elapsed ?? game.world?.time ?? 0);
    const minutes = Math.floor((8 * 60 + seconds / 3) % (24 * 60));
    this.setText('world-time', `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`);
    this.setText('world-weather', minutes < 600 ? 'Morgenlicht' : minutes < 1020 ? 'Tageslicht' : minutes < 1200 ? 'Abendglut' : 'Sternennacht');
    this.updateCooldowns();
  }

  updateCooldowns() {
    const maxCooldown = {attack:.34,dash:1.35,nova:6,bolt:1.5,potion:3};
    for (const button of document.querySelectorAll('.ability')) {
      const action = button.dataset.action;
      const value = Number(this.game.cooldowns?.[action] ?? this.game.player?.cooldowns?.[action]) || 0;
      button.classList.toggle('is-cooling', value > 0);
      const cover = button.querySelector('.cooldown-cover');
      if (cover) cover.style.height = `${clamp(value / (maxCooldown[action] || 1) * 100,0,100)}%`;
    }
  }

  renderTracker() {
    const quests = QUESTS.filter(quest => ['active','ready'].includes(this.game.questState?.[quest.id]?.status));
    this.elements['quest-tracker'].innerHTML = quests.length ? quests.slice(0,3).map(quest => {
      const state = this.game.questState[quest.id];
      const isReady = state.status === 'ready' || quest.objectives.every((objective,index) => (state.counts?.[index] || 0) >= objective.count);
      return `<div class="tracked-quest"><h3><span class="quest-diamond"></span>${escape(quest.title)}</h3>${isReady ? `<div class="quest-objective complete">${icon('check')}<span>Kehre zu ${escape(NPCS.find(npc=>npc.id===quest.giver)?.name)} zurück</span></div>` : quest.objectives.map((objective,index)=> `<div class="quest-objective ${(state.counts?.[index] || 0)>=objective.count?'complete':''}">${(state.counts?.[index] || 0)>=objective.count?icon('check'):'<span class="objective-dot"></span>'}<span>${escape(objective.label)} <b>${Math.min(state.counts?.[index] || 0,objective.count)}/${objective.count}</b></span></div>`).join('')}</div>`;
    }).join('') : `<div class="tracker-empty">Deine Geschichte beginnt hier.<small>Sprich mit Mira in Glutwacht. Folge den goldenen Zeichen auf deiner Karte.</small></div>`;
  }

  togglePanel(name) {
    if (name === 'world') name = 'map';
    if (name === 'skills') name = 'talents';
    if (name === 'crafting') name = 'craft';
    if (this.activePanel === 'death' && this.game.player?.hp <= 0 && name !== 'death') return;
    if (name === this.activePanel) { this.closePanel(); return; }
    if (!this.activePanel) this.previousFocus = document.activeElement;
    this.activePanel = name;
    if (this.game.started) this.game.paused = true;
    this.game.keys?.clear();
    this.elements['panel-overlay'].hidden = false;
    this.elements['world-hud'].classList.add('disabled');
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.panel===name));
    this.renderPanel();
    requestAnimationFrame(() => (name === 'death' ? this.elements['panel-content'].querySelector('button') : this.elements['close-panel'])?.focus({preventScroll:true}));
  }

  closePanel() {
    if (this.activePanel === 'death' && this.game.player?.hp <= 0) return;
    const previous = this.activePanel;
    this.activePanel = null;
    this.dialogueNPC = null;
    this.elements['panel-overlay'].hidden = true;
    this.elements['world-hud'].classList.remove('disabled');
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.remove('active'));
    if (previous && this.game.started && this.game.player?.hp > 0) this.game.paused = false;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({preventScroll:true});
    else if (this.game.started) this.elements.world.focus({preventScroll:true});
    this.previousFocus = null;
  }

  renderPanel() {
    const name = this.activePanel;
    if (!name) return;
    const focusId = document.activeElement?.dataset?.id;
    const focusCommand = document.activeElement?.dataset?.command;
    const titles = name === 'dialogue' ? [this.dialogueNPC?.name || 'Eine Begegnung',this.dialogueNPC?.role || ''] : name==='death' ? ['Die Glut lebt weiter','Auch die dunkelste Nacht endet.'] : name==='victory' ? ['Ein neuer Morgen','Du hast der Welt ihre Glut zurückgebracht.'] : name==='reset' ? ['Ein neuer Anfang','Eine neue Reise ersetzt deinen gespeicherten Fortschritt.'] : panels[name] || panels.inventory;
    this.setText('panel-title', titles[0]);
    this.setText('panel-description', titles[1]);
    this.elements['close-panel'].hidden = name === 'death';
    const renderers = {inventory:()=>this.inventory(),character:()=>this.character(),talents:()=>this.talents(),craft:()=>this.craft(),journal:()=>this.journal(),map:()=>this.map(),settings:()=>this.settings(),dialogue:()=>this.dialogue(),death:()=>this.death(),victory:()=>this.victory(),reset:()=>this.resetConfirmation()};
    this.elements['panel-content'].innerHTML = (renderers[name] || renderers.inventory)();
    if (name === 'map') this.drawMap(document.getElementById('full-map'), true);
    if (focusId && focusCommand) {
      const target = [...this.elements['panel-content'].querySelectorAll('button')].find(button=>button.dataset.id===focusId&&button.dataset.command===focusCommand);
      if (target && !target.disabled) target.focus({preventScroll:true});
    }
  }

  statsText(stats = {}, compare = null) {
    return Object.entries(stats).map(([key,value]) => {
      const isPercent = ['crit','lifeSteal','cooldown','dodgeCooldown'].includes(key);
      const text = isPercent ? percent(value) : format(value);
      const delta = compare ? Number(value) - (Number(compare[key]) || 0) : null;
      return `${escape(statLabels[key] || key)} +${text}${delta !== null && delta !== 0 ? ` <span class="${delta>0?'stat-better':'stat-worse'}">(${delta>0?'+':''}${isPercent?percent(delta):format(delta)})</span>` : ''}`;
    }).join(' · ');
  }

  itemRow(item, count, action = 'equip', shop = false) {
    const equipped = this.game.equipment?.[item.type] === item.id;
    const comparison = ITEMS[this.game.equipment?.[item.type]]?.stats;
    const canBuy = (this.game.player?.gold || 0) >= item.price;
    const command = shop ? 'buy' : action === 'sell' ? 'sell' : item.type === 'consumable' ? 'consume' : action;
    const stats = this.game.stats();
    const consumeDisabled = command === 'consume' && (!item.stats.hpRestore || this.game.player.hp >= stats.maxHp) && (!item.stats.manaRestore || this.game.player.mana >= stats.mana);
    return `<div class="item-row"><div class="item-icon ${escape(item.rarity)}">${icon(itemIcon(item))}</div><div class="item-main"><h3>${escape(item.name)}</h3><p>${escape(rarityLabels[item.rarity])} · ${escape(typeLabels[item.type])}</p><p class="item-description">${this.statsText(item.stats, !shop && !equipped ? comparison : null)}</p></div>${shop ? `<button class="small-button" data-command="buy" data-id="${escape(item.id)}" ${canBuy?'':'disabled'}>${icon('coin')}${format(item.price)}</button>` : `${count>1?`<span class="item-count">×${count}</span>`:''}${equipped?'<span class="equipped-badge">ANGELEGT</span>':`<button class="small-button" data-command="${command}" data-id="${escape(item.id)}" ${consumeDisabled?'disabled':''}>${command==='consume'?'Nutzen':command==='sell'?`Verkaufen · ${Math.max(1,Math.floor(item.price*.4))}`:'Anlegen'}</button>`}`}</div>`;
  }

  inventory() {
    const tab = this.inventoryTab;
    const entries = Object.entries(this.game.inventory || {}).filter(([id,count])=>count>0 && ITEMS[id]);
    const tabs = `<div class="panel-tabs"><button class="${tab==='equipment'?'active':''}" data-inventory-tab="equipment">Ausrüstung</button><button class="${tab==='consumables'?'active':''}" data-inventory-tab="consumables">Vorräte</button><button class="${tab==='resources'?'active':''}" data-inventory-tab="resources">Ressourcen</button></div>`;
    const filtered = entries.filter(([id]) => tab === 'consumables' ? ITEMS[id].type === 'consumable' : ITEMS[id].type !== 'consumable');
    const resourceRows = Object.entries(RESOURCES).map(([id,resource])=>`<div class="item-row"><div class="item-icon">${icon(resourceIcon(id))}</div><div class="item-main"><h3>${escape(resource.name)}</h3><p>${escape(resource.description)}</p></div><span class="item-count">${format(this.game.resources?.[id])}</span></div>`).join('');
    const body = tab === 'resources' ? resourceRows : filtered.length ? filtered.map(([id,count])=>this.itemRow(ITEMS[id],count)).join('') : '<p class="empty-inventory">Dein Rucksack hat noch Platz für neue Geschichten.<br><span class="panel-note">Finde Truhen, besiege Gegner oder stelle etwas an der Werkbank her.</span></p>';
    return `${tabs}<div class="inventory-layout"><div class="item-list">${body}</div><aside class="inventory-summary"><h3 class="section-title">Angelegt</h3>${this.equipmentSlots()}<h3 class="section-title">Dein Vermögen</h3><div class="summary-stat"><span>Goldstücke</span><strong>${format(this.game.player?.gold)}</strong></div><p class="panel-note">Werte in Klammern vergleichen einen Gegenstand mit deiner aktuellen Ausrüstung.</p><button class="small-button" data-panel="craft">${icon('craft')}Handwerk öffnen</button></aside></div>`;
  }

  equipmentSlots() {
    return [['weapon','Waffe'],['armor','Rüstung'],['charm','Amulett']].map(([slot,label])=> {
      const item = ITEMS[this.game.equipment?.[slot]];
      return `<div class="equipment-slot"><div class="item-icon ${escape(item?.rarity || '')}">${icon(item ? itemIcon(item) : slot === 'weapon' ? 'sword' : slot === 'armor' ? 'shield' : 'gem')}</div><div class="item-main"><span class="slot-label">${label.toUpperCase()}</span><h3>${escape(item?.name || 'Noch unbesetzt')}</h3></div></div>`;
    }).join('');
  }

  character() {
    const player = this.game.player || {};
    const stats = this.game.stats();
    const xpNeeded = typeof this.game.xpNeeded === 'function' ? this.game.xpNeeded() : this.game.xpNeeded || 100;
    const completed = Object.values(this.game.questState || {}).filter(state=>state.status==='done').length;
    const values = ['damage','spellDamage','maxHp','mana','armor','crit','speed','manaRegen','lifeSteal','gatherYield','cooldown','dodgeCooldown'];
    return `<div class="character-banner"><div class="character-seal">${icon('flame')}</div><div><h3>${escape(player.name || 'Aren')}</h3><p>Glutträger · Stufe ${player.level || 1}<br>${format(player.xp)} / ${format(xpNeeded)} Erfahrung · ${format(player.skillPoints)} freie Talentpunkte</p></div></div><div class="stats-grid">${values.map(key=>`<div class="summary-stat"><span>${escape(statLabels[key])}</span><strong>${['crit','lifeSteal','cooldown','dodgeCooldown'].includes(key)?percent(stats[key]):Number(stats[key] || 0).toLocaleString('de-DE',{maximumFractionDigits:1})}</strong></div>`).join('')}</div><h3 class="section-title">Was du mit dir trägst</h3><div class="character-equipment">${this.equipmentSlots()}</div><p class="panel-note">${completed} von ${QUESTS.length} Questen abgeschlossen · ${(this.game.discovered || []).length} von ${REGIONS.length} Regionen entdeckt.<br>Mit jeder neuen Stufe erhältst du Talentpunkte. Du kannst alle drei Pfade miteinander verbinden.</p>`;
  }

  talents() {
    const branches = [...new Set(SKILLS.map(skill=>skill.branch))];
    const points = this.game.player?.skillPoints || 0;
    return `<div class="talent-header"><span>Jeder Rang zählt. Baue auf bereits gelernte Talente auf.</span><strong>${points} Talentpunkt${points===1?'':'e'} verfügbar</strong></div><div class="talent-trees">${branches.map(branch=>`<section class="talent-tree"><h3>${escape(branch)}</h3><p>${escape(branchDescriptions[branch])}</p>${SKILLS.filter(skill=>skill.branch===branch).map(skill=> {
      const rank = Number(this.game.skills?.[skill.id]) || 0;
      const requirementMet = !skill.requires || Number(this.game.skills?.[skill.requires]) > 0;
      const canLearn = requirementMet && points>=skill.cost && rank<skill.maxRank;
      const prerequisite = SKILLS.find(entry=>entry.id===skill.requires);
      return `<div class="talent-node ${!requirementMet?'unavailable':''} ${rank?'learned':''}"><div class="talent-node-top"><div class="item-icon">${icon(branchIcons[branch])}</div><div><h4>${escape(skill.name)}</h4><span class="talent-node-rank">RANG ${rank} / ${skill.maxRank}</span></div></div><p>${escape(skill.description)}</p><button class="small-button" data-command="learn" data-id="${escape(skill.id)}" ${canLearn?'':'disabled'}>${rank>=skill.maxRank?'Meisterhaft':`Lernen · ${skill.cost} Punkt`}</button>${!requirementMet?`<span class="talent-requirement">Benötigt ${escape(prerequisite?.name)}</span>`:''}</div>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  craft() {
    return `<div class="craft-layout">${RECIPES.map(recipe=> {
      const output = ITEMS[recipe.output];
      const enough = Object.entries(recipe.ingredients).every(([id,amount])=>(this.game.resources?.[id] || 0)>=amount);
      return `<article class="recipe"><div class="recipe-top"><div class="item-icon ${escape(output?.rarity)}">${icon(itemIcon(output))}</div><div><h3>${escape(recipe.name)}</h3><p>${escape(recipe.description)}</p></div></div><div class="ingredients">${Object.entries(recipe.ingredients).map(([id,amount])=>`<span class="ingredient ${(this.game.resources?.[id] || 0)<amount?'missing':''}">${escape(RESOURCES[id]?.name || id)} ${format(this.game.resources?.[id])}/${amount}</span>`).join('')}</div><div class="recipe-actions"><span class="recipe-level">${recipe.amount || 1} × ${escape(output?.name)}</span><button class="small-button" data-command="craft" data-id="${escape(recipe.id)}" ${enough?'':'disabled'}>Herstellen ${icon('craft')}</button></div></article>`;
    }).join('')}</div><p class="panel-note">Sammle Holz an Bäumen, Erz an Felsen und Mondkraut auf den Lichtungen. Glutkristalle findest du in den Fernlanden. Für Hainbrot pflanzt du Saatgut auf dem Acker in Glutwacht.</p>`;
  }

  reward(quest) {
    const reward = quest.reward;
    return `${format(reward.xp)} EP · ${format(reward.gold)} Gold${reward.item?` · ${escape(ITEMS[reward.item]?.name || reward.item)}`:''}`;
  }

  journal() {
    const active = QUESTS.filter(quest=>['active','ready'].includes(this.game.questState?.[quest.id]?.status));
    const done = QUESTS.filter(quest=>this.game.questState?.[quest.id]?.status==='done');
    const available = QUESTS.filter(quest=>!this.game.questState?.[quest.id] && (!quest.prerequisite || this.game.questState?.[quest.prerequisite]?.status==='done'));
    const quests = this.questTab==='done' ? done : this.questTab==='available' ? available : active;
    const tabs = `<div class="panel-tabs"><button data-quest-tab="active" class="${this.questTab==='active'?'active':''}">Deine Questen · ${active.length}</button><button data-quest-tab="available" class="${this.questTab==='available'?'active':''}">Entdecken · ${available.length}</button><button data-quest-tab="done" class="${this.questTab==='done'?'active':''}">Abgeschlossen · ${done.length}</button></div>`;
    return `${tabs}${quests.length ? quests.map(quest=> {
      const state = this.game.questState?.[quest.id];
      const giver = NPCS.find(npc=>npc.id===quest.giver);
      const total = quest.objectives.reduce((sum,objective)=>sum+objective.count,0);
      const complete = quest.objectives.reduce((sum,objective,index)=>sum+Math.min(state?.counts?.[index] || 0,objective.count),0);
      return `<article class="quest-log-item"><div class="quest-log-heading"><h3>${escape(quest.title)}</h3><span class="quest-status">${state?.status==='done'?'ABGESCHLOSSEN':state?.status==='ready'?'BELOHNUNG ABHOLEN':state?.status==='active'?'AUF DEINEM WEG':`BEI ${escape(giver?.name || '').toUpperCase()}`}</span></div><p>${escape(quest.description)}</p>${state && state.status!=='done'?`<div class="quest-progress"><div style="width:${complete/total*100}%"></div></div>`:''}<div class="quest-log-objectives">${quest.objectives.map((objective,index)=>`<span>${state?.status==='done'||(state?.counts?.[index]||0)>=objective.count?icon('check'):icon('marker')}${escape(objective.label)}${state&&state.status!=='done'?` ${Math.min(state.counts?.[index]||0,objective.count)}/${objective.count}`:''}</span>`).join('')}</div><div class="quest-reward">Belohnung: ${this.reward(quest)} · ${escape(giver?.name)} in Glutwacht</div></article>`;
    }).join('') : `<p class="empty-inventory">${this.questTab==='done'?'Die ersten Geschichten warten noch darauf, erzählt zu werden.':this.questTab==='available'?'Deine nächste Aufgabe wartet am Ende deines jetzigen Weges.':'Mach den ersten Schritt.'}<br><span class="panel-note">${this.questTab==='active'?'Sprich mit den Bewohnern von Glutwacht. Mira, Sera und Toma brauchen deine Hilfe.':'Setze deine Reise fort und sprich regelmäßig mit deinen Weggefährten.'}</span></p>`}`;
  }

  map() {
    return `<div class="map-layout"><div><canvas id="full-map" class="world-map" width="900" height="580" aria-label="Weltkarte mit deiner Position, Glutwacht und entdeckten Schreinen"></canvas><div class="map-legend"><span><i class="legend-dot"></i>Du & Glutwacht</span><span><i class="legend-dot blue"></i>Glutschrein</span><span><i class="legend-dot red"></i>Gefahr</span></div><p class="panel-note">Die Welt steht dir offen. Entdeckte Glutschreine sind deine Ankerpunkte: Reise zwischen ihnen, erhole dich und setze deinen Weg fort.</p></div><aside class="map-regions"><h3 class="section-title">Deine Horizonte</h3>${REGIONS.map(region=> {
      const discovered = (this.game.discovered || []).includes(region.id);
      const shrine = (this.game.world?.shrines || []).find(entry=>entry.region===region.id || entry.regionId===region.id || entry.x>=region.x&&entry.x<region.x+region.w&&entry.y>=region.y&&entry.y<region.y+region.h);
      const shrineDiscovered = shrine && (shrine.discovered || shrine.unlocked || shrine.active || (this.game.unlockedShrines || []).includes(shrine.id));
      return `<div class="region-entry ${discovered?'':'undiscovered'}"><strong>${escape(region.name)}</strong><p>Stufe ${region.level}+ · ${discovered?'Entdeckt':'Unbekannte Wege'}<br>${escape(region.subtitle)}</p>${shrineDiscovered?`<button class="small-button" data-command="travel" data-id="${escape(shrine.id)}">Zum Glutschrein ${icon('arrow')}</button>`:''}</div>`;
    }).join('')}</aside></div>`;
  }

  settings() {
    return `<div class="settings-row"><div><h3>Klänge der Welt</h3><p>Musik und Klang geben deiner Reise eine Stimme. Der Ton beginnt nach deiner ersten Eingabe.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="sound" ${this.game.settings?.sound!==false?'checked':''}/>Ton an</label></div><div class="settings-row"><div><h3>Weniger Bewegung</h3><p>Reduziert Kamerabewegungen und Animationen in der Oberfläche.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="reducedMotion" ${this.game.settings?.reducedMotion?'checked':''}/>Aktiv</label></div><h3 class="section-title">Dein Spielstand</h3><p class="panel-note">Emberfall speichert deine Reise automatisch in diesem Browser. Exportiere den Spielstand als Datei, um ihn zu sichern oder auf einem anderen Gerät weiterzuspielen.</p><div class="settings-actions"><button class="small-button" data-command="save">${icon('save')}Jetzt speichern</button><button class="small-button" data-command="export">Spielstand exportieren</button><button class="small-button" data-command="import">Spielstand laden</button><button class="small-button danger-button" data-panel="reset">Neue Reise</button></div><h3 class="section-title">Deine Hände, deine Fähigkeiten</h3><div class="settings-controls"><div class="summary-stat"><span>Bewegen</span><strong>WASD / Pfeiltasten</strong></div><div class="summary-stat"><span>Schwerthieb / Ausweichen</span><strong>J oder Klick / Leertaste</strong></div><div class="summary-stat"><span>Glutnova / Glutblitz / Heiltrank</span><strong>F / Q / R</strong></div><div class="summary-stat"><span>Sprechen, sammeln, pflanzen & ernten</span><strong>E</strong></div><div class="summary-stat"><span>Inventar / Talente / Handwerk / Questen</span><strong>I / T / B / L</strong></div><div class="summary-stat"><span>Weltkarte / Charakter</span><strong>M / C</strong></div></div>`;
  }

  showDialogue(npc) {
    if (typeof npc === 'string') npc = NPCS.find(entry=>entry.id===npc);
    if (!npc) return;
    this.dialogueNPC = npc;
    this.togglePanel('dialogue');
  }

  dialogue() {
    const npc = this.dialogueNPC;
    if (!npc) return '';
    const quests = QUESTS.filter(quest=>quest.giver===npc.id && (!quest.prerequisite || this.game.questState?.[quest.prerequisite]?.status==='done'));
    const current = quests.filter(quest=>this.game.questState?.[quest.id]?.status!=='done');
    let extra = '';
    if (['oren','elin','sera'].includes(npc.id)) {
      const shopIds = npc.id==='elin'?['forest_blade','sentinel_mail']:npc.id==='sera'?['heal_potion','mana_potion']:['heal_potion','mana_potion','leather_armor','forest_blade'];
      extra = `<h3 class="section-title">${npc.id==='elin'?'Elins Ausrüstung':npc.id==='sera'?'Tränke für den Weg':'Vorräte & Ausrüstung'}</h3><div class="item-list">${shopIds.map(id=>this.itemRow(ITEMS[id],0,'buy',true)).join('')}</div>`;
      if (npc.id==='oren') {
        const sellable = Object.entries(this.game.inventory||{}).filter(([id,count])=>count>0 && ITEMS[id] && this.game.equipment?.[ITEMS[id].type]!==id);
        extra += `<div class="item-row"><div class="item-icon">${icon('leaf')}</div><div class="item-main"><h3>Saatgut</h3><p>Drei Samen für deinen Dorfacker.</p></div><button class="small-button" data-command="buy" data-id="seed" ${(this.game.player?.gold||0)>=4?'':'disabled'}>${icon('coin')}4</button></div>${sellable.length?`<h3 class="section-title">Aus deinem Gepäck verkaufen</h3>${sellable.map(([id,count])=>this.itemRow(ITEMS[id],count,'sell')).join('')}`:''}`;
      }
    }
    if (npc.id==='toma') extra = `<div class="dialogue-quest"><h3>Dein Stück Erde</h3><p>Die Beete liegen südlich von Toma. Stelle dich neben ein leeres Beet und drücke E, um Saatgut zu pflanzen. Wenn der Weizen reif ist, drücke erneut E zum Ernten.</p><p>Dein Saatgut: ${format(this.game.resources?.seed)} · Deine Ernte: ${format(this.game.resources?.wheat)} Sonnenweizen.</p><button class="small-button" data-command="buy" data-id="seed" ${(this.game.player?.gold||0)>=4?'':'disabled'}>${icon('leaf')}3 Saatgut kaufen · 4 Gold</button><button class="small-button" data-panel="craft">Hainbrot backen</button></div>`;
    if (['elin','sera'].includes(npc.id)) extra += `<p class="panel-note"><button class="small-button" data-panel="craft">${icon('craft')}${npc.id==='elin'?'Zur Werkbank':'Tränke selbst brauen'}</button></p>`;
    return `<div class="dialogue-layout"><div class="npc-portrait">${icon(npc.id==='elin'?'craft':npc.id==='toma'?'leaf':npc.id==='sera'?'potion':npc.id==='oren'?'coin':npc.id==='rowan'?'map':'flame')}</div><div><p class="npc-role">${escape(npc.role).toUpperCase()}</p><p class="npc-dialogue">„${escape(npc.dialogue)}“</p>${current.map(quest=> {
      const state = this.game.questState?.[quest.id];
      const ready = state && (state.status==='ready' || quest.objectives.every((objective,index)=>(state.counts?.[index]||0)>=objective.count));
      return `<article class="dialogue-quest"><h3>${escape(quest.title)}</h3><p>${escape(quest.description)}</p><div class="quest-reward">${this.reward(quest)}</div>${!state?`<button class="small-button" data-command="questAccept" data-id="${escape(quest.id)}">Ich helfe dir ${icon('arrow')}</button>`:ready?`<button class="small-button" data-command="questTurnIn" data-id="${escape(quest.id)}">Belohnung abholen ${icon('check')}</button>`:`<p class="panel-note">Deine Aufgabe läuft. ${quest.objectives.map((objective,index)=>`${escape(objective.label)} ${Math.min(state.counts?.[index]||0,objective.count)}/${objective.count}`).join(' · ')}</p>`}</article>`;
    }).join('')}${extra}${!current.length&&!extra?'<p class="panel-note">Dein Weg ist noch nicht zu Ende. Kehre wieder, wenn du neue Geschichten zu erzählen hast.</p>':''}</div></div>`;
  }

  death() { return `<div class="large-state">${icon('flame')}<h3>Dein Funke ist nicht erloschen.</h3><p>Die Glut trägt dich zurück nach Glutwacht. Sammle Kraft, verbessere deine Ausrüstung und versuche einen neuen Weg.</p><button class="primary-button" data-command="respawn">Zurück ins Licht ${icon('arrow')}</button></div>`; }
  victory() { return `<div class="large-state">${icon('sun')}<h3>Die Welt atmet wieder.</h3><p>Veyr ist gefallen. Die letzte Glut wurde zu einem neuen Anfang. Doch die freien Lande haben noch immer Geschichten für dich.</p><button class="primary-button" data-command="resume">Deine Reise fortsetzen ${icon('arrow')}</button><p class="panel-note">Sprich mit Mira, um die Belohnung für deine letzte Quest zu erhalten.</p></div>`; }
  resetConfirmation() { return `<div class="large-state">${icon('leaf')}<h3>Jede Geschichte beginnt mit einem Schritt.</h3><p>Deine aktuelle Reise wird ersetzt. Exportiere deinen Spielstand in den Einstellungen, wenn du sie für später behalten möchtest.</p><button class="primary-button" data-command="confirm-reset">Neue Reise beginnen ${icon('arrow')}</button><button class="text-button" data-command="resume">Zur aktuellen Reise zurück</button></div>`; }
  showDeath() { if (this.activePanel==='death') return; this.togglePanel('death'); }
  showVictory() { if (this.activePanel==='victory') return; this.togglePanel('victory'); }

  command(name, id, button) {
    if (name==='resume') { this.closePanel(); return; }
    if (name==='confirm-reset') { this.closePanel(); this.game.reset(); this.begin(); this.showNotice('Eine neue Reise. Ein neuer Funke.', 'success'); return; }
    if (name==='respawn') { this.game.respawn(); this.closePanel(); this.update(true); return; }
    if (name==='save') { this.manualSave(); return; }
    if (name==='import') { this.elements['save-import'].click(); return; }
    if (name==='export') { this.game.exportSave(); return; }
    if (name==='travel') { this.game.travel(id); this.closePanel(); this.update(true); return; }
    const method = this.game[name];
    if (typeof method==='function') { const result = method.call(this.game,id); if (result?.then) result.then(()=>this.update(true)); else this.update(true); }
  }

  manualSave() {
    try {
      const result = this.game.save(false);
      if (result === false) return;
      this.setText('save-state','Gerade gespeichert');
      this.showNotice('Deine Reise ist gespeichert.', 'success');
    } catch (error) { this.showNotice('Speichern ist in diesem Browser nicht verfügbar. Sichere deine Reise über den Export.', 'error'); }
  }

  showNotice(message, tone = 'info') {
    if (!message) return;
    const notice = document.createElement('div');
    notice.className = `notice ${['success','error'].includes(tone)?tone:''}`;
    notice.textContent = message;
    this.elements['notice-stack'].appendChild(notice);
    this.notices.push(notice);
    if (this.notices.length>4) this.notices.shift().remove();
    setTimeout(()=>{notice.classList.add('fading');setTimeout(()=>{notice.remove();this.notices=this.notices.filter(entry=>entry!==notice);},350);},3700);
  }

  trapFocus(event) {
    const overlay = this.activePanel ? this.elements['game-panel'] : !this.game.started ? this.elements['welcome-overlay'] : null;
    if (!overlay) return;
    const controls = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>!element.hidden && element.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length-1];
    if (event.shiftKey && (document.activeElement===first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement===last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }

  updateMinimap() { this.drawMap(this.elements.minimap,false); }

  drawMap(canvas, full = false) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const world = this.game.world || {};
    const worldWidth = world.width || 3200, worldHeight = world.height || 2400;
    const scale = Math.min(width/worldWidth,height/worldHeight);
    const ox = (width-worldWidth*scale)/2, oy = (height-worldHeight*scale)/2;
    const mapX = x=>ox+x*scale, mapY=y=>oy+y*scale;
    ctx.fillStyle = '#102016';ctx.fillRect(0,0,width,height);
    for (const region of REGIONS) {
      const discovered = (this.game.discovered || []).includes(region.id);
      ctx.fillStyle = region.id==='daemmerhain'?'#304f2e':region.id==='frostgrat'?'#586c66':region.id==='aschenmoor'?'#4b4547':'#654a2e';
      ctx.globalAlpha = discovered ? .88 : .36;
      ctx.fillRect(mapX(region.x),mapY(region.y),region.w*scale,region.h*scale);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#9bac7150';ctx.lineWidth = full?1:.6;
      ctx.strokeRect(mapX(region.x),mapY(region.y),region.w*scale,region.h*scale);
      if (full) {
        ctx.fillStyle = discovered ? '#e5dab2' : '#859475';ctx.font = '20px Georgia';ctx.textAlign = 'center';
        ctx.fillText(region.name,mapX(region.x+region.w/2),mapY(region.y+region.h/2)-10);
        ctx.fillStyle = discovered?'#b9c1a1':'#718367';ctx.font = '10px sans-serif';ctx.fillText(`Stufe ${region.level}+`,mapX(region.x+region.w/2),mapY(region.y+region.h/2)+10);
      }
    }
    ctx.strokeStyle='#8c86505c';ctx.lineWidth=full?5:2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(mapX(555),mapY(1250));ctx.lineTo(mapX(790),mapY(950));ctx.lineTo(mapX(750),mapY(440));ctx.moveTo(mapX(790),mapY(950));ctx.lineTo(mapX(1740),mapY(760));ctx.lineTo(mapX(2420),mapY(560));ctx.moveTo(mapX(1740),mapY(760));ctx.lineTo(mapX(2400),mapY(1850));ctx.stroke();
    for (const node of (world.nodes || [])) { if (node.depleted || node.amount===0) continue;ctx.fillStyle='#a6bd6570';ctx.fillRect(mapX(node.x)-.7,mapY(node.y)-.7,1.5,1.5); }
    for (const shrine of (world.shrines || [])) {
      const discovered = shrine.discovered || shrine.unlocked || shrine.active || (this.game.unlockedShrines || []).includes(shrine.id);
      if (!discovered) continue;
      const x=mapX(shrine.x),y=mapY(shrine.y);ctx.fillStyle='#8fc8c7';ctx.beginPath();ctx.moveTo(x,y-4);ctx.lineTo(x+3,y);ctx.lineTo(x,y+4);ctx.lineTo(x-3,y);ctx.closePath();ctx.fill();
      if (full) {ctx.fillStyle='#c5dbbd';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText(shrine.name || 'Glutschrein',x+9,y+3);}
    }
    for (const enemy of (world.enemies || [])) {
      if (!enemy.boss || enemy.dead || enemy.hp<=0) continue;
      const region=REGIONS.find(entry=>enemy.x>=entry.x&&enemy.x<entry.x+entry.w&&enemy.y>=entry.y&&enemy.y<entry.y+entry.h);
      if (!(this.game.discovered || []).includes(region?.id)) continue;
      ctx.fillStyle='#bd7254';ctx.fillRect(mapX(enemy.x)-2,mapY(enemy.y)-2,4,4);
    }
    for (const npc of NPCS) {ctx.fillStyle='#d9c484';ctx.beginPath();ctx.arc(mapX(npc.x),mapY(npc.y),full?2.2:1.4,0,Math.PI*2);ctx.fill();}
    if (full) {ctx.fillStyle='#e0d2a6';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('GLUTWACHT',mapX(565),mapY(1460));}
    const player=this.game.player || {};
    const px=mapX(player.x || 560),py=mapY(player.y || 1230);
    ctx.fillStyle='#eeda9b';ctx.strokeStyle='#12251a';ctx.lineWidth=full?2:1;
    ctx.beginPath();ctx.moveTo(px,py-5);ctx.lineTo(px+4,py+4);ctx.lineTo(px,py+2);ctx.lineTo(px-4,py+4);ctx.closePath();ctx.fill();ctx.stroke();
    if (full) {ctx.fillStyle='#f1e2b1';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('DU',px+10,py-4);}
  }
}
