import { REGIONS, RESOURCES, ITEMS, RECIPES, QUESTS, NPCS, ENEMY_TYPES } from './catalog.js';
import { CLASSES, getClass } from './classes.js';
import { GEM_TYPES, SETS, ITEM_BASES, itemPower, describeStat } from './loot.js';
import { ABILITIES, getAbility, canLearnAbility, getLearnedAbilities } from './abilities.js';
import { DUNGEONS } from './dungeons.js';
import { MAX_LEVEL } from './progression.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = (name, classes = '') => `<svg class="${classes}" aria-hidden="true"><use href="#i-${name}" /></svg>`;
const format = value => Math.round(Number(value) || 0).toLocaleString('de-DE');
const seconds = value => Number(value).toLocaleString("de-DE",{maximumFractionDigits:2});
const percent = value => `${((Number(value) || 0) * 100).toLocaleString('de-DE',{maximumFractionDigits:2})} %`;
const statValue = (key,value) => ['crit','lifeSteal','cooldown','dodgeCooldown'].includes(key) ? percent(value) : (Number(value)||0).toLocaleString('de-DE',{maximumFractionDigits:2});
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const statLabels = { damage:'Waffenschaden',spellDamage:'Zauberkraft',maxHp:'Lebenspunkte',mana:'Mana',armor:'Rüstung',crit:'Kritische Treffer',speed:'Bewegungstempo',manaRegen:'Mana / Sekunde',lifeSteal:'Lebensraub',gatherYield:'Sammelbonus',cooldown:'Kürzere Zauberabklingzeit',dodgeCooldown:'Kürzere Ausweichabklingzeit',hpRestore:'Heilung',manaRestore:'Mana auffüllen' };
const rarityLabels = { common:'Gewöhnlich',uncommon:'Ungewöhnlich',rare:'Selten',epic:'Episch',legendary:'Legendär' };
const typeLabels = {weapon:'Waffe',armor:'Rüstung',charm:'Amulett',consumable:'Verbrauchsgegenstand'};
const itemIcon = item => item?.type === 'weapon' ? /bow|string/.test(item.baseId || '') ? 'bow' : /staff|wand|scepter|focus|branch/.test(item.baseId || item.id) ? 'bolt' : 'sword' : item?.type === 'armor' ? 'shield' : item?.type === 'charm' ? 'gem' : item?.id === 'hearty_meal' ? 'leaf' : 'potion';
const resourceIcon = id => ['wood','herb','seed','wheat'].includes(id) ? 'leaf' : 'gem';
const classIcons = { guardian:'shield',paladin:'sun',ranger:'bow',nightblade:'sword',flamecaller:'flame',frostweaver:'snowflake',druid:'leaf',shadowbinder:'gem' };
const abilityIcon = (ability, classId) => ({ heal:'heart', shield:'shield', drain:'gem', summon:'group', dashstrike:'dash', trap:classId==='frostweaver'?'snowflake':'leaf', aoe:'nova', projectile:classId==='ranger'?'bow':classIcons[classId] || 'bolt', melee:'sword' }[ability?.kind] || 'bolt');
const learnedIcon = ability => ({'⬡':'shield','⚑':'group','⚔':'sword','✚':'heart','☀':'sun','➤':'bow','⌘':'leaf','❧':'leaf','↝':'dash','◆':'gem','✦':'flame','☄':'flame','❄':'snowflake','✿':'leaf','☾':'gem','◈':'group'}[ability?.icon] || ability?.icon || 'tree');
const branchIcons = {'Wächter':'shield','Arkanist':'flame','Wildläufer':'leaf'};
const branchDescriptions = {'Wächter':'Halte stand. Jede Wunde macht dich stärker.','Arkanist':'Entfache die Glut und forme den Äther.','Wildläufer':'Bewege dich frei. Lebe von den Gaben des Hains.'};
const panels = {map:['Die freien Lande','Neue Horizonte, uralte Tore und Wege bis Stufe 100.'],world:['Die freien Lande','Neue Horizonte, uralte Tore und Wege bis Stufe 100.'],character:['Dein Charakter','Werde zu dem Helden, den diese Welt braucht.'],inventory:['Dein Gepäck','Affixe, Sockel und Sets formen deine Ausrüstung.'],talents:['Dein eigener Weg','Meistere die Pfade deiner Klasse bis Stufe 100.'],craft:['Handwerk','Aus den Gaben der Welt entstehen deine nächsten Abenteuer.'],journal:['Deine Reise','Menschen, denen du hilfst. Orte, die du veränderst.'],party:['Gemeinsam durch die Glut','Bilde eine Gruppe mit bis zu acht Reisenden.'],dungeons:['Tore der Erinnerung','Rätsel, schwere Bosse und immer tiefere Herausforderungen.'],settings:['Ein Moment der Ruhe','Deine Reise wird direkt in diesem Browser gespeichert.']};

export class GameUI {
  constructor(game) {
    this.game = game;
    this.activePanel = null;
    this.inventoryTab = 'equipment';
    this.inventoryPage = 0;
    this.talentTab = 'abilities';
    this.panelPointers = new Set();
    this.questTab = 'active';
    this.contractRegion = null;
    this.dialogueNPC = null;
    this.lastState = '';
    this.lastTracker = '';
    this.lastMapAt = -Infinity;
    this.previousFocus = null;
    this.pendingClass = game.player?.classId || 'guardian';
    this.networkBusy = false;
    this.lastPartyState = '';
    this.lastAbilityClass = '';
    this.lastSeenLevel = game.player?.level || 1;
    this.notices = [];
    this.elements = {};
    for (const id of ['welcome-overlay','welcome-classes','start-button','continue-button','panel-overlay','game-panel','panel-title','panel-description','panel-content','close-panel','save-button','save-state','save-import','world-hud','quest-tracker','region-name','region-subtitle','player-name','player-class','player-level','hp-fill','hp-text','hp-shield','party-hud','mana-fill','mana-text','xp-fill','xp-text','gold-count','talent-badge','potion-count','interact-prompt','world-time','world-weather','notice-stack','minimap','world']) this.elements[id] = document.getElementById(id);
    this.bind();
    this.syncWelcome();
    this.update(true);
  }

  bind() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.panel) { this.togglePanel(button.dataset.panel === 'world' ? 'map' : button.dataset.panel); return; }
      if (button.dataset.action) { if(this.game.started&&!this.activePanel&&!this.game.paused)this.game.action(button.dataset.action); this.update(true); return; }
      if (button.dataset.abilitySlot !== undefined) { this.useAbilitySlot(Number(button.dataset.abilitySlot)); return; }
      if (button.dataset.talentTab) { this.talentTab=button.dataset.talentTab;this.renderPanel();return; }
      if (button.dataset.inventoryTab) { this.inventoryTab = button.dataset.inventoryTab;this.inventoryPage=0; this.renderPanel(); return; }
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
      if(event.target.dataset.abilityLoadout!==undefined) {this.assignAbility(Number(event.target.dataset.abilityLoadout),event.target.value||null);return;}
      if(event.target.dataset.contractRegion!==undefined) {this.contractRegion=event.target.value;this.renderPanel();return;}
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
    this.elements['game-panel'].addEventListener('pointerdown',event=>this.panelPointers.add(event.pointerId));
    const release=event=>{this.panelPointers.delete(event.pointerId);if(!this.panelPointers.size&&this.pendingPanelRender)requestAnimationFrame(()=>{if(!this.panelPointers.size){this.pendingPanelRender=false;this.renderPanel();}});};
    for(const name of ['pointerup','pointercancel'])document.addEventListener(name,release);
    this.elements['game-panel'].addEventListener('focusout',()=>{if(this.pendingPanelRender)requestAnimationFrame(()=>{if(!this.panelPointers.size){this.pendingPanelRender=false;this.renderPanel();}});});
    window.addEventListener('blur',()=>{this.panelPointers.clear();this.game.keys?.clear();});
  }

  get currentPanel() { return this.activePanel; }

  useAbilitySlot(slot) {
    if(!this.game.started||this.activePanel||this.game.paused)return;
    if(this.game.abilityLoadout?.[slot])this.game.useLearnedAbility(slot);
    else {this.talentTab='abilities';this.togglePanel('talents');}
    this.update(true);
  }

  async assignAbility(slot,id) {
    const previous=id?(this.game.abilityLoadout||[]).indexOf(id):-1;
    if(previous>=0&&previous!==slot)await this.game.setAbilityLoadout(previous,null);
    await this.game.setAbilityLoadout(slot,id);this.update(true);
  }

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
    if (this.elements['welcome-classes']) this.elements['welcome-classes'].innerHTML = this.game.hasSave ? `<p class="welcome-saved-class">${escape(getClass(this.game.player.classId).name)} · Stufe ${format(this.game.player.level)} · Deine gespeicherte Reise</p>` : this.classSelection(this.game.player.classId);
    if (!this.game.started) requestAnimationFrame(() => (this.game.hasSave ? this.elements['continue-button'] : this.elements['start-button']).focus({preventScroll:true}));
    document.body.classList.toggle('reduced-motion', Boolean(this.game.settings?.reducedMotion));
  }

  setText(id, value) { const element = this.elements[id]; if (element && element.textContent !== String(value)) element.textContent = value; }
  setWidth(id, value) { const element = this.elements[id]; const width = `${clamp(value, 0, 100)}%`; if (element && element.style.width !== width) element.style.width = width; }

  classSelection(selected, reset = false) {
    const current = getClass(selected);
    return `<div class="class-choice"><p class="class-choice-label">WÄHLE DEINEN WEG</p><div class="class-grid" role="group" aria-label="Acht spielbare Klassen">${CLASSES.map(entry => `<button type="button" class="class-card ${entry.id===current.id?'selected':''}" aria-pressed="${entry.id===current.id}" data-command="${reset?'choose-reset-class':'selectClass'}" data-id="${entry.id}" style="--class-color:${entry.color}">${icon(classIcons[entry.id])}<span><strong>${escape(entry.name)}</strong><small>${escape(entry.role)}</small></span></button>`).join('')}</div><p class="class-choice-description"><strong>${escape(current.name)}:</strong> ${escape(current.description)}</p></div>`;
  }

  item(id) { return this.game.item?.(id) || ITEMS[id] || null; }
  itemStats(id) { return this.game.itemStats?.(id) || this.item(id)?.stats || {}; }
  get network() { return this.game.networkClient || this.game.network; }
  dungeonId() { return this.game.dungeonInstance?.id || (typeof this.game.activeDungeon==='string'?this.game.activeDungeon:this.game.activeDungeon?.id) || (this.game.world?.isDungeon?this.game.world.dungeonId:null); }

  update(force = false) {
    const game = this.game;
    const player = game.player || {};
    const stats = typeof game.stats === 'function' ? game.stats() : {};
    if(game.started&&player.level>this.lastSeenLevel){
      const unlocked=ABILITIES.filter(ability=>ability.classId===player.classId&&ability.level>this.lastSeenLevel&&ability.level<=player.level&&!game.learnedAbilities?.[ability.id]);
      if(unlocked.length)this.showNotice(`Neue Technik: ${unlocked.map(ability=>ability.name).join(', ')} · Öffne Talente zum Lernen.`,'level');
    }
    this.lastSeenLevel=player.level||1;
    let region = game.region;
    if (typeof region === 'function') region = region.call(game);
    if (!region && typeof game.regionAt === 'function') region = game.regionAt(player.x, player.y);
    if (typeof region === 'string') region = REGIONS.find(entry => entry.id === region);
    region ||= REGIONS.find(entry => player.x >= entry.x && player.x < entry.x + entry.w && player.y >= entry.y && player.y < entry.y + entry.h) || REGIONS[0];
    const dungeon=DUNGEONS.find(entry=>entry.id===this.dungeonId());
    if(dungeon)region={...dungeon,level:dungeon.minLevel,subtitle:`Dungeon · Tiefe ${game.dungeonInstance?.tier || game.world?.tier || 1}`};
    const hpMax = stats.maxHp || player.maxHp || 100;
    const manaMax = stats.mana || stats.maxMana || player.maxMana || 60;
    const xpMax = typeof game.xpNeeded === 'function' ? game.xpNeeded() : Number(game.xpNeeded) || 100;
    this.setText('region-name', region.name);
    this.setText('region-subtitle', `${region.subtitle.toUpperCase()} · STUFE ${region.level}+`);
    this.setText('player-name', player.name || 'Aren');
    this.setText('player-class', getClass(player.classId).name.toUpperCase());
    this.setText('player-level', player.level || 1);
    this.setWidth('hp-fill', (player.hp || 0) / hpMax * 100);
    this.setWidth('mana-fill', (player.mana || 0) / manaMax * 100);
    this.setText('hp-text', `${format(player.hp)} / ${format(hpMax)}`);
    this.setText('hp-shield', player.shield>0?`Schutz ${format(player.shield)}`:player.downed?'Kampfunfähig · E zum Wiederbeleben':'');
    if(this.elements['hp-shield']) this.elements['hp-shield'].hidden = !(player.shield>0 || player.downed);
    this.setText('mana-text', `${format(player.mana)} / ${format(manaMax)}`);
    this.setWidth('xp-fill', player.level>=MAX_LEVEL?100:(player.xp || 0) / xpMax * 100);
    this.setText('xp-text', player.level>=MAX_LEVEL?'STUFE 100 · MEISTER DER GLUT':`STUFE ${player.level || 1} · ${format(player.xp)} / ${format(xpMax)} EP`);
    this.setText('gold-count', format(player.gold));
    const healingSupplies = Object.entries(game.inventory || {}).reduce((sum,[id,count]) => sum + (this.item(id)?.stats?.hpRestore ? Number(count) || 0 : 0),0);
    this.setText('potion-count', format(healingSupplies));
    this.setText('talent-badge', player.skillPoints || 0);
    this.elements['talent-badge'].hidden = !(player.skillPoints > 0);
    const nearby = game.started && !game.paused && typeof game.nearby === 'function' ? game.nearby() : null;
    this.elements['interact-prompt'].hidden = !nearby;
    if (nearby) this.elements['interact-prompt'].querySelector('span').textContent = nearby.label || 'Interagieren';
    const trackerState = JSON.stringify([game.questState || {},game.contracts]);
    if (force || trackerState !== this.lastTracker) { this.lastTracker = trackerState; this.renderTracker(); }
    const state = JSON.stringify([player.classId,player.level,player.skillPoints,player.gold,game.inventory,game.equipment,game.generatedItems,game.resources,game.skills,game.learnedAbilities,game.abilityLoadout,game.questState,game.contracts,game.discovered,game.dungeonRecords,game.dungeonProgress,this.dungeonId()]);
    if (force || state !== this.lastState) { this.lastState = state; if (this.activePanel && !['death','victory','reset','settings','party'].includes(this.activePanel)) this.renderPanel(); }
    this.updateParty();
    const now = performance.now();
    if (force || now - this.lastMapAt > 500) { this.lastMapAt = now; this.updateMinimap(); }
    const seconds = Number(game.time ?? game.elapsed ?? game.world?.time ?? 0);
    const minutes = Math.floor((8 * 60 + seconds / 3) % (24 * 60));
    this.setText('world-time', `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`);
    this.setText('world-weather', minutes < 600 ? 'Morgenlicht' : minutes < 1020 ? 'Tageslicht' : minutes < 1200 ? 'Abendglut' : 'Sternennacht');
    this.updateCooldowns(stats);
    const blocked=!game.started||Boolean(this.activePanel)||game.paused;
    document.querySelector('.touch-controls').hidden=blocked;
    document.querySelector('.touch-controls').inert=blocked;
    document.body.classList.toggle('gameplay-blocked',blocked);
  }

  updateCooldowns(stats=this.game.stats()) {
    const currentClass = getClass(this.game.player?.classId);
    const factor=1-(stats.cooldown||0);
    const maxCooldown = {attack:currentClass.abilities.attack.cooldown,dash:Math.max(.4,1.35*(1-(stats.dodgeCooldown||0))),nova:currentClass.abilities.nova.cooldown*factor,bolt:currentClass.abilities.bolt.cooldown*factor,potion:3};
    if(this.lastAbilityClass!==currentClass.id) {
      this.lastAbilityClass=currentClass.id;
      for(const [action, ability] of Object.entries(currentClass.abilities)) {
        const button=document.querySelector(`.ability[data-action="${action}"]`);
        if(!button)continue;
        button.querySelector('span').textContent=ability.name;
        button.querySelector('use').setAttribute('href',`#i-${abilityIcon(ability,currentClass.id)}`);
        button.setAttribute('aria-label',`${ability.name}, ${action==='attack'?'J oder Linksklick':action==='bolt'?'Q oder 1':'F oder 2'}`);
        button.title=`${ability.name}${ability.cost?` · ${ability.cost} Mana`:''} · ${ability.cooldown} Sek. Abklingzeit`;
      }
    }
    for(const [action,ability] of Object.entries(currentClass.abilities)) {
      for(const control of document.querySelectorAll(`.ability[data-action="${action}"],[data-touch-action="${action}"]`))control.title=`${ability.name}${ability.cost?` · ${ability.cost} Mana`:""} · ${seconds(maxCooldown[action])} Sek. Abklingzeit`;
      const button=document.querySelector(`[data-touch-action="${action}"]`);if(!button)continue;
      button.querySelector('use').setAttribute('href',`#i-${abilityIcon(ability,currentClass.id)}`);button.setAttribute('aria-label',ability.name);
      if(action==='attack')button.querySelector('span').textContent='Angriff halten';
      else button.querySelector('span').textContent=ability.name;
    }
    for (const button of document.querySelectorAll('.ability,.touch-ability')) {
      const slot=button.dataset.abilitySlot??button.dataset.touchSlot;
      const learned=slot!==undefined?getAbility(this.game.abilityLoadout?.[Number(slot)]):null;
      const action = button.dataset.action||button.dataset.touchAction;
      const cooldownKey=learned?`ability:${learned.id}`:action;
      const value = Number(this.game.cooldowns?.[cooldownKey] ?? this.game.player?.cooldowns?.[cooldownKey]) || 0;
      if(slot!==undefined){
        button.querySelector('span').textContent=learned?learned.name:`Lernen ${Number(slot)+3}`;
        button.querySelector('use').setAttribute('href',`#i-${learnedIcon(learned)}`);
        button.setAttribute('aria-label',learned?`${learned.name}, Platz ${Number(slot)+3}`:`Fähigkeit für Platz ${Number(slot)+3} lernen`);
        button.title=learned?`${learned.name} · ${learned.cost} Mana · ${seconds(learned.cooldown*factor)} Sek. Abklingzeit`:'Neue aktive Fähigkeiten lernen und auf 3 oder 4 belegen';
        button.classList.toggle('empty-slot',!learned);
      }
      button.classList.toggle('is-cooling', value > 0);
      const cover = button.querySelector('.cooldown-cover');
      if (cover) cover.style.height = `${clamp(value / (learned?learned.cooldown*factor:maxCooldown[action]||1) * 100,0,100)}%`;
    }
  }

  renderTracker() {
    const quests = [...QUESTS.filter(quest => ['active','ready'].includes(this.game.questState?.[quest.id]?.status)),...(this.game.contracts?.active||[])];
    this.elements['quest-tracker'].innerHTML = quests.length ? quests.slice(0,3).map(quest => {
      const state = this.game.questState[quest.id]||quest;
      const isReady = state.status === 'ready' || quest.objectives.every((objective,index) => (state.counts?.[index] || 0) >= objective.count);
      const giver=quest.giver?NPCS.find(npc=>npc.id===quest.giver):this.game.contractGiver?.(quest.region);
      return `<div class="tracked-quest"><h3><span class="quest-diamond"></span>${escape(quest.title)}</h3>${isReady ? `<div class="quest-objective complete">${icon('check')}<span>Kehre zu ${escape(giver?.name||'deinem Auftraggeber')} zurück</span></div>` : quest.objectives.map((objective,index)=> `<div class="quest-objective ${(state.counts?.[index] || 0)>=objective.count?'complete':''}">${(state.counts?.[index] || 0)>=objective.count?icon('check'):'<span class="objective-dot"></span>'}<span>${escape(objective.label)} <b>${Math.min(state.counts?.[index] || 0,objective.count)}/${objective.count}</b></span></div>`).join('')}</div>`;
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
    if(name==='reset') this.pendingClass=this.game.player.classId || 'guardian';
    if (this.game.started) this.game.paused = true;
    this.game.keys?.clear();
    this.onInputReset?.();
    document.querySelector('.touch-controls').hidden=true;
    document.body.classList.add('gameplay-blocked');
    this.elements['panel-overlay'].hidden = false;
    this.elements['world-hud'].classList.add('disabled');
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.panel===name));
    this.renderPanel();
    if(name==='party') this.refreshRooms();
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
    if(this.panelPointers.size||document.activeElement?.matches?.('select')&&this.elements['game-panel'].contains(document.activeElement)){this.pendingPanelRender=true;return;}
    const focusId = document.activeElement?.dataset?.id;
    const focusCommand = document.activeElement?.dataset?.command;
    const titles = name === 'dialogue' ? [this.dialogueNPC?.name || 'Eine Begegnung',this.dialogueNPC?.role || ''] : name==='death' ? ['Die Glut lebt weiter','Auch die dunkelste Nacht endet.'] : name==='victory' ? ['Ein neuer Morgen','Du hast der Welt ihre Glut zurückgebracht.'] : name==='reset' ? ['Ein neuer Anfang','Eine neue Reise ersetzt deinen gespeicherten Fortschritt.'] : panels[name] || panels.inventory;
    this.setText('panel-title', titles[0]);
    this.setText('panel-description', titles[1]);
    this.elements['close-panel'].hidden = name === 'death';
    const renderers = {inventory:()=>this.inventory(),character:()=>this.character(),talents:()=>this.talents(),craft:()=>this.craft(),journal:()=>this.journal(),map:()=>this.map(),party:()=>this.party(),dungeons:()=>this.dungeons(),settings:()=>this.settings(),dialogue:()=>this.dialogue(),death:()=>this.death(),victory:()=>this.victory(),reset:()=>this.resetConfirmation()};
    this.elements['panel-content'].innerHTML = (renderers[name] || renderers.inventory)();
    if (name === 'map') this.drawMap(document.getElementById('full-map'), true);
    if (name === 'party') { this.lastPartyState=''; this.updateParty(); }
    if (focusId && focusCommand) {
      const target = [...this.elements['panel-content'].querySelectorAll('button')].find(button=>button.dataset.id===focusId&&button.dataset.command===focusCommand);
      if (target && !target.disabled) target.focus({preventScroll:true});
    }
  }

  statsText(stats = {}, compare = null) {
    return [...new Set([...Object.keys(stats),...Object.keys(compare || {})])].map(key => {
      const value=Number(stats[key]) || 0;
      const isPercent = ['crit','lifeSteal','cooldown','dodgeCooldown'].includes(key);
      const text = statValue(key,value);
      const delta = compare ? Number(value) - (Number(compare[key]) || 0) : null;
      return `${escape(statLabels[key] || key)} +${text}${delta !== null && delta !== 0 ? ` <span class="${delta>0?'stat-better':'stat-worse'}">(${delta>0?'+':''}${statValue(key,delta)})</span>` : ''}`;
    }).join(' · ');
  }

  equipmentComparison(item) {
    if(!['weapon','armor','charm'].includes(item.type)||this.game.equipment?.[item.type]===item.id)return '';
    const currentId=this.game.equipment?.[item.type],current=this.item(currentId),before=this.game.stats();
    const candidate=this.itemStats(item.id),old=this.itemStats(currentId);
    const preview=this.game.previewEquipment?.(item.id)||{before,after:Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(candidate),...Object.keys(old)])].map(key=>[key,(before[key]||0)+(candidate[key]||0)-(old[key]||0)]))};
    const changes=Object.keys(preview.after).filter(key=>Math.abs((preview.after[key]||0)-(preview.before[key]||0))>.00001);
    return `<div class="gear-comparison"><p>Ersetzt: <strong>${escape(current?.name||'Leerer Platz')}</strong></p><dl>${changes.map(key=>{const delta=(preview.after[key]||0)-(preview.before[key]||0);return `<div><dt>${escape(statLabels[key]||key)}</dt><dd>${statValue(key,preview.before[key])} <span aria-hidden="true">→</span> <strong>${statValue(key,preview.after[key])}</strong> <span class="${delta>0?'stat-better':'stat-worse'}">${delta>0?'+':''}${statValue(key,delta)}</span></dd></div>`;}).join('')||'<div><dt>Charakterwerte</dt><dd>Unverändert</dd></div>'}</dl></div>`;
  }

  itemRow(item, count, action = 'equip', shop = false) {
    if(!item)return '';
    const equipped = this.game.equipment?.[item.type] === item.id;
    const comparison = this.itemStats(this.game.equipment?.[item.type]);
    const canBuy = (this.game.player?.gold || 0) >= item.price;
    const command = shop ? 'buy' : action === 'sell' ? 'sell' : item.type === 'consumable' ? 'consume' : action;
    const stats = this.game.stats();
    const consumeDisabled = command === 'consume' && (!item.stats.hpRestore || this.game.player.hp >= stats.maxHp) && (!item.stats.manaRestore || this.game.player.mana >= stats.mana);
    const requiredLevel=item.level||item.minLevel||1;
    const classIds=item.classIds||ITEM_BASES.find(base=>base.id===item.baseId)?.classIds;
    const classLocked=Array.isArray(classIds)&&!classIds.includes(this.game.player.classId);
    const levelLocked = command==='equip' && requiredLevel>this.game.player.level;
    const lockReason=classLocked?`Nur ${classIds.map(id=>getClass(id).name).join(', ')}`:levelLocked?`Benötigt Stufe ${requiredLevel}`:'';
    const generated = !!item.baseId;
    const itemStats = generated ? this.itemStats(item.id) : item.stats;
    const upgrade = item.upgrade || 0, upgradeCost = 8 + upgrade * 6;
    const gems = generated && item.sockets.includes(null) ? Object.values(GEM_TYPES).filter(gem=>(this.game.resources?.[gem.id] || 0)>0) : [];
    const modifiers = generated ? `<details class="item-details"><summary>Affixe${item.sockets.length?` · ${item.sockets.length} Sockel`:''}${item.setId?' · Set':''}</summary><p>${escape(item.description)}</p>${item.affixes.map(affix=>`<div class="item-modifier ${affix.legendary?'legendary-modifier':''}"><strong>${escape(affix.name)}</strong><span>${Object.entries(affix.stats).map(([key,value])=>escape(describeStat(key,value))).join(' · ')}</span></div>`).join('')}${item.sockets.length?`<div class="socket-list">${item.sockets.map(gem=>`<span>${icon('gem')}${gem?escape(GEM_TYPES[typeof gem==='string'?gem:gem.id]?.name || 'Edelstein'):'Freier Sockel'}</span>`).join('')}</div>`:''}${item.setId?`<p class="set-description">${escape(SETS[item.setId]?.name)} · 2 Teile: ${this.statsText(SETS[item.setId]?.bonuses[2])} · 3 Teile: ${this.statsText(SETS[item.setId]?.bonuses[3])}</p>`:''}</details>` : '';
    const improve = generated && !shop && action==='equip' ? `<div class="item-improvement-actions"><button class="small-button" data-command="upgradeItem" data-id="${escape(item.id)}" ${upgrade>=10 || (this.game.resources?.dust || 0)<upgradeCost?'disabled':''}>${upgrade>=10?'Aufwertung +10':`Aufwerten · ${upgradeCost} Staub`}</button>${!equipped?`<button class="small-button subtle-button" data-command="salvage" data-id="${escape(item.id)}">Zerlegen</button>`:''}${gems.map(gem=>`<button class="small-button" data-command="socket" data-id="${escape(item.id)}" data-gem="${gem.id}" title="${escape(this.statsText(gem.stats))}">${escape(gem.name)} sockeln</button>`).join('')}</div>` : '';
    return `<div class="item-row ${generated?'instanced-item':''} ${equipped?'is-equipped':''}"><div class="item-icon ${escape(item.rarity)}">${icon(itemIcon(item))}</div><div class="item-main"><h3>${escape(item.name)}${upgrade?` <span class="item-upgrade">+${upgrade}</span>`:''}</h3><p>${escape(rarityLabels[item.rarity])} · ${escape(typeLabels[item.type])} · Stufe ${requiredLevel}${generated?`${item.dungeonTier>1?` · Tiefe ${item.dungeonTier}`:''} · Macht ${itemPower(item)}`:''}${classIds?` · ${escape(classIds.map(id=>getClass(id).name).join(' / '))}`:''}</p><p class="item-description">${this.statsText(itemStats)}</p>${!shop&&command==='equip'&&!equipped?this.equipmentComparison(item):''}${lockReason?`<p class="equipment-lock">${icon('shield')}${escape(lockReason)}</p>`:''}${modifiers}${improve}</div><div class="item-actions">${shop ? `<button class="small-button" data-command="buy" data-id="${escape(item.id)}" ${canBuy?'':'disabled'}>${icon('coin')}${format(item.price)}</button>` : `${count>1?`<span class="item-count">×${count}</span>`:''}${equipped?`<span class="equipped-badge">ANGELEGT</span><button class="small-button subtle-button" data-command="unequip" data-id="${escape(item.type)}">Ablegen</button>`:`<button class="small-button" data-command="${command}" data-id="${escape(item.id)}" ${consumeDisabled || command==='equip'&&(levelLocked||classLocked)?'disabled':''}>${command==='consume'?'Nutzen':command==='sell'?`Verkaufen · ${Math.max(1,Math.floor(item.price*.4))}`:'Anlegen'}</button>`}`}</div></div>`;
  }

  inventory() {
    const tab = this.inventoryTab;
    const entries = Object.entries(this.game.inventory || {}).filter(([id,count])=>count>0 && this.item(id));
    const tabs = `<div class="panel-tabs"><button class="${tab==='equipment'?'active':''}" data-inventory-tab="equipment">Ausrüstung</button><button class="${tab==='consumables'?'active':''}" data-inventory-tab="consumables">Vorräte</button><button class="${tab==='resources'?'active':''}" data-inventory-tab="resources">Ressourcen</button></div>`;
    const filtered = entries.filter(([id]) => tab === 'consumables' ? this.item(id).type === 'consumable' : this.item(id).type !== 'consumable');
    const pageSize=12,pages=Math.max(1,Math.ceil(filtered.length/pageSize));this.inventoryPage=Math.min(this.inventoryPage,pages-1);
    const page=filtered.slice(this.inventoryPage*pageSize,(this.inventoryPage+1)*pageSize);
    const resourceRows = Object.entries(RESOURCES).map(([id,resource])=>`<div class="item-row"><div class="item-icon">${icon(resourceIcon(id))}</div><div class="item-main"><h3>${escape(resource.name)}</h3><p>${escape(resource.description)}</p></div><span class="item-count">${format(this.game.resources?.[id])}</span></div>`).join('');
    const body = tab === 'resources' ? resourceRows : filtered.length ? page.map(([id,count])=>this.itemRow(this.item(id),count)).join('') : '<p class="empty-inventory">Dein Rucksack hat noch Platz für neue Geschichten.<br><span class="panel-note">Finde Truhen, besiege Gegner oder stelle etwas an der Werkbank her.</span></p>';
    const pagination=tab!=='resources'&&pages>1?`<div class="inventory-pagination"><button class="small-button" data-command="inventory-page" data-id="${this.inventoryPage-1}" ${this.inventoryPage===0?'disabled':''}>Zurück</button><span>${this.inventoryPage+1} / ${pages} · ${filtered.length} Gegenstände</span><button class="small-button" data-command="inventory-page" data-id="${this.inventoryPage+1}" ${this.inventoryPage===pages-1?'disabled':''}>Weiter</button></div>`:'';
    return `${tabs}<div class="inventory-layout"><div class="item-list">${body}${pagination}</div><aside class="inventory-summary"><h3 class="section-title">Deine Ausrüstungsplätze</h3>${this.equipmentSlots()}<h3 class="section-title">Dein Vermögen</h3><div class="summary-stat"><span>Goldstücke</span><strong>${format(this.game.player?.gold)}</strong></div><p class="panel-note">Der Vergleich zeigt deine gesamten Charakterwerte vor und nach dem Anlegen, einschließlich Setboni.</p><button class="small-button" data-panel="craft">${icon('craft')}Handwerk öffnen</button></aside></div>`;
  }

  equipmentSlots() {
    return [['weapon','Waffe'],['armor','Rüstung'],['charm','Amulett']].map(([slot,label])=> {
      const item = this.item(this.game.equipment?.[slot]);
      return `<div class="equipment-slot ${item?'filled':'empty'}"><div class="item-icon ${escape(item?.rarity || '')}">${icon(item ? itemIcon(item) : slot === 'weapon' ? 'sword' : slot === 'armor' ? 'shield' : 'gem')}</div><div class="item-main"><span class="slot-label">${label.toUpperCase()}</span><h3>${escape(item?.name || 'Noch unbesetzt')}</h3>${item?`<p>${this.statsText(this.itemStats(item.id))}</p>`:'<p>Finde passende Ausrüstung auf deinen Wegen.</p>'}</div>${item?`<button class="small-button subtle-button" data-command="unequip" data-id="${slot}" aria-label="${label} ablegen">Ablegen</button>`:`<button class="small-button" data-command="open-equipment">Anlegen</button>`}</div>`;
    }).join('');
  }

  character() {
    const player = this.game.player || {};
    const stats = this.game.stats();
    const xpNeeded = typeof this.game.xpNeeded === 'function' ? this.game.xpNeeded() : this.game.xpNeeded || 100;
    const completed = Object.values(this.game.questState || {}).filter(state=>state.status==='done').length;
    const currentClass = getClass(player.classId);
    const values = ['damage','spellDamage','maxHp','mana','armor','crit','speed','manaRegen','lifeSteal','gatherYield','cooldown','dodgeCooldown'];
    return `<div class="character-banner"><div class="character-seal" style="color:${currentClass.color}">${icon(classIcons[currentClass.id])}</div><div><h3>${escape(player.name || 'Aren')}</h3><p>${escape(currentClass.name)} · ${escape(currentClass.role)} · Stufe ${player.level || 1} / ${MAX_LEVEL}<br>${player.level>=MAX_LEVEL?'Höchste Stufe erreicht':`${format(player.xp)} / ${format(xpNeeded)} Erfahrung`} · ${format(player.skillPoints)} freie Talentpunkte</p></div></div><p class="panel-note">${escape(currentClass.description)}</p><div class="class-abilities">${Object.entries(currentClass.abilities).map(([key,ability])=>`<div>${icon(abilityIcon(ability,currentClass.id))}<strong>${escape(ability.name)}</strong><span>${key==='attack'?'J / Klick':key==='bolt'?'Q / 1':'F / 2'}${ability.cost?` · ${ability.cost} Mana`:''} · ${seconds(ability.cooldown*(key==="attack"?1:1-stats.cooldown))} Sek.</span></div>`).join('')}</div><div class="stats-grid">${values.map(key=>`<div class="summary-stat"><span>${escape(statLabels[key])}</span><strong>${['crit','lifeSteal','cooldown','dodgeCooldown'].includes(key)?percent(stats[key]):Number(stats[key] || 0).toLocaleString('de-DE',{maximumFractionDigits:1})}</strong></div>`).join('')}</div><p class="panel-note"><button class="small-button" data-panel="talents">${icon('tree')}Neue Fähigkeiten lernen · ${getLearnedAbilities(this.game).length} / 3 erlernt</button></p><h3 class="section-title">Was du mit dir trägst</h3><div class="character-equipment">${this.equipmentSlots()}</div><p class="panel-note">${completed} von ${QUESTS.length} Questen abgeschlossen · ${(this.game.discovered || []).length} von ${REGIONS.length} Regionen entdeckt.<br>Mit jeder neuen Stufe erhältst du Talentpunkte. Neue Klassenpfade öffnen sich auf Stufe 12, 25, 40, 60 und 80.</p>`;
  }

  talents() {
    const skills = this.game.availableSkills();
    const currentClass=getClass(this.game.player.classId);
    const branches = [...new Set(skills.map(skill=>skill.branch))];
    const points = this.game.player?.skillPoints || 0;
    const tabs=`<div class="panel-tabs"><button data-talent-tab="abilities" class="${this.talentTab==='abilities'?'active':''}">Aktive Fähigkeiten</button><button data-talent-tab="passives" class="${this.talentTab==='passives'?'active':''}">Talentpfade</button></div>`;
    const header=`<div class="talent-header"><span>${escape(currentClass.name)} · Stufe ${this.game.player.level}</span><strong>${points} Talentpunkt${points===1?'':'e'} verfügbar</strong></div>`;
    if(this.talentTab==='abilities')return `${tabs}${header}${this.activeAbilities()}`;
    return `${tabs}${header}<div class="talent-trees" style="--tree-columns:${Math.min(3,branches.length)}">${branches.map(branch=>`<section class="talent-tree"><h3>${escape(branch)}</h3><p>${escape(branchDescriptions[branch] || `Ein Weg der Klasse ${currentClass.name}.`)}</p>${skills.filter(skill=>skill.branch===branch).map(skill=> {
      const rank = Number(this.game.skills?.[skill.id]) || 0;
      const requires=skill.requires;
      const requirements=!requires?[]:Array.isArray(requires)?requires:[requires];
      const requirementMet = requirements.every(requirement=>(this.game.skills?.[typeof requirement==='string'?requirement:requirement.id] || 0)>=(typeof requirement==='string'?1:requirement.rank || 1));
      const levelMet=this.game.player.level>=(skill.minLevel || 1);
      const canLearn = requirementMet && levelMet && points>=skill.cost && rank<skill.maxRank;
      const prerequisiteNames=requirements.map(requirement=>skills.find(entry=>entry.id===(typeof requirement==='string'?requirement:requirement.id))?.name || '').filter(Boolean);
      return `<div class="talent-node ${!requirementMet || !levelMet?'unavailable':''} ${rank?'learned':''}"><div class="talent-node-top"><div class="item-icon">${icon(branchIcons[branch] || classIcons[currentClass.id])}</div><div><h4>${escape(skill.name)}</h4><span class="talent-node-rank">RANG ${rank} / ${skill.maxRank} · STUFE ${skill.minLevel || 1}</span></div></div><p>${escape(skill.description)}</p><button class="small-button" data-command="learn" data-id="${escape(skill.id)}" ${canLearn?'':'disabled'}>${rank>=skill.maxRank?'Meisterhaft':`Lernen · ${skill.cost} Punkt${skill.cost===1?'':'e'}`}</button>${!levelMet?`<span class="talent-requirement">Benötigt Stufe ${skill.minLevel}</span>`:''}${!requirementMet?`<span class="talent-requirement">Benötigt ${escape(prerequisiteNames.join(', '))}</span>`:''}</div>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  activeAbilities() {
    const stats=this.game.stats(),learned=getLearnedAbilities(this.game),abilities=ABILITIES.filter(ability=>ability.classId===this.game.player.classId);
    return `<p class="panel-note">Deine Basisfähigkeiten bleiben auf Q und F. Lerne neue Techniken ab Stufe 4, 12 und 25 und belege zwei Zusatzplätze. Lernen verbraucht Talentpunkte; Belegen ist kostenlos.</p><div class="ability-loadout">${[0,1].map(slot=>`<label class="loadout-slot"><span>PLATZ ${slot+3} · ${this.game.abilityLoadout?.[slot]?'BELEGT':'FREI'}</span><select class="game-input" data-ability-loadout="${slot}" aria-label="Fähigkeit auf Platz ${slot+3}"><option value="">Keine Fähigkeit</option>${learned.map(ability=>`<option value="${ability.id}" ${this.game.abilityLoadout?.[slot]===ability.id?'selected':''}>${escape(ability.name)}</option>`).join('')}</select></label>`).join('')}</div><div class="learnable-abilities">${abilities.map(ability=>{
      const known=Boolean(this.game.learnedAbilities?.[ability.id]),check=canLearnAbility(this.game,ability.id),required=ability.requires?getAbility(ability.requires):null;
      const occupied=(this.game.abilityLoadout||[]).findIndex(id=>id===ability.id);
      return `<article class="learnable-ability ${known?'learned':check.ok?'learnable':'locked'}"><div class="learnable-heading"><div class="item-icon">${icon(learnedIcon(ability))}</div><div><h3>${escape(ability.name)}</h3><span class="ability-state">${known?occupied>=0?`ERLERNT · AUF PLATZ ${occupied+3}`:'ERLERNT':check.ok?'LERNBAR':this.game.player.level<ability.level?`AB STUFE ${ability.level}`:'VORAUSSETZUNG FEHLT'}</span></div></div><p>${escape(ability.description)}</p><div class="ability-facts"><span>Stufe ${ability.level}</span><span>${ability.cost} Mana</span><span>${seconds(ability.cooldown*(1-stats.cooldown))} Sek. Abklingzeit</span>${required?`<span>Benötigt ${escape(required.name)}</span>`:''}</div>${known?`<div class="ability-equip-actions">${[0,1].map(slot=>`<button class="small-button ${occupied===slot?'subtle-button':''}" data-command="assign-ability" data-id="${ability.id}" data-slot="${slot}" ${occupied===slot?'disabled':''}>${occupied===slot?`Auf ${slot+3} belegt`:`Auf ${slot+3} belegen`}</button>`).join('')}</div>`:`<button class="small-button" data-command="learnAbility" data-id="${ability.id}" ${check.ok?'':'disabled'}>Lernen · ${ability.talentCost} Talentpunkt${ability.talentCost===1?'':'e'}</button>${!check.ok?`<p class="talent-requirement">${escape(check.reason)}</p>`:''}`}</article>`;
    }).join('')}</div>`;
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
    return `${format(reward.xp)} EP · ${format(reward.gold)} Gold${reward.dust?` · ${format(reward.dust)} Glutstaub`:''}${reward.item?` · ${escape(ITEMS[reward.item]?.name || reward.item)}`:''}`;
  }

  journal() {
    const active = QUESTS.filter(quest=>['active','ready'].includes(this.game.questState?.[quest.id]?.status));
    const done = QUESTS.filter(quest=>this.game.questState?.[quest.id]?.status==='done');
    const available = QUESTS.filter(quest=>this.game.canAccept(quest));
    const quests = this.questTab==='done' ? done : this.questTab==='available' ? available : active;
    const tabs = `<div class="panel-tabs"><button data-quest-tab="active" class="${this.questTab==='active'?'active':''}">Deine Questen · ${active.length}</button><button data-quest-tab="available" class="${this.questTab==='available'?'active':''}">Entdecken · ${available.length}</button><button data-quest-tab="done" class="${this.questTab==='done'?'active':''}">Abgeschlossen · ${done.length}</button><button data-quest-tab="contracts" class="${this.questTab==='contracts'?'active':''}">Aufträge · ${this.game.contracts?.active?.length||0}/3</button></div>`;
    if(this.questTab==='contracts')return `${tabs}${this.contractBoard()}`;
    return `${tabs}${quests.length ? quests.map(quest=> {
      const state = this.game.questState?.[quest.id];
      const giver = NPCS.find(npc=>npc.id===quest.giver);
      const total = quest.objectives.reduce((sum,objective)=>sum+objective.count,0);
      const complete = quest.objectives.reduce((sum,objective,index)=>sum+Math.min(state?.counts?.[index] || 0,objective.count),0);
      const giverRegion=REGIONS.find(region=>giver&&giver.x>=region.x&&giver.x<region.x+region.w&&giver.y>=region.y&&giver.y<region.y+region.h);
      return `<article class="quest-log-item"><div class="quest-log-heading"><h3>${escape(quest.title)}</h3><span class="quest-status">${state?.status==='done'?'ABGESCHLOSSEN':state?.status==='ready'?'BELOHNUNG ABHOLEN':state?.status==='active'?'AUF DEINEM WEG':`BEI ${escape(giver?.name || '').toUpperCase()}`}</span></div><p>${escape(quest.description)}</p>${state && state.status!=='done'?`<div class="quest-progress"><div style="width:${complete/total*100}%"></div></div>`:''}<div class="quest-log-objectives">${quest.objectives.map((objective,index)=>`<span>${state?.status==='done'||(state?.counts?.[index]||0)>=objective.count?icon('check'):icon('marker')}${escape(objective.label)}${state&&state.status!=='done'?` ${Math.min(state.counts?.[index]||0,objective.count)}/${objective.count}`:''}</span>`).join('')}</div><div class="quest-reward">Belohnung: ${this.reward(quest)} · ${escape(giver?.name || 'Ein Reisender')}${giverRegion?` in ${escape(giverRegion.name)}`:''}${quest.minLevel?` · Stufe ${quest.minLevel}`:''}</div></article>`;
    }).join('') : `<p class="empty-inventory">${this.questTab==='done'?'Die ersten Geschichten warten noch darauf, erzählt zu werden.':this.questTab==='available'?'Deine nächste Aufgabe wartet am Ende deines jetzigen Weges.':'Mach den ersten Schritt.'}<br><span class="panel-note">${this.questTab==='active'?'Sprich mit den Bewohnern von Glutwacht. Mira, Sera und Toma brauchen deine Hilfe.':'Setze deine Reise fort und sprich regelmäßig mit deinen Weggefährten.'}</span></p>`}`;
  }

  map() {
    const dungeon=DUNGEONS.find(entry=>entry.id===this.dungeonId());
    if(dungeon)return `<div class="map-layout"><div><canvas id="full-map" class="world-map" width="900" height="580" aria-label="Dungeonkarte mit Rätselkammern, Toren und deiner Position"></canvas><p class="panel-note">Erkunde die Kammern und lies die Inschriften mit E.</p></div><aside><h3 class="section-title">${escape(dungeon.name)}</h3><p class="panel-note">${escape(dungeon.subtitle)}<br>Stufe ${dungeon.minLevel} · ${dungeon.partyRequired} Reisende</p><details class="dungeon-journal"><summary>Inschrift lesen</summary><p>${escape(dungeon.hint)}</p></details><button class="small-button" data-panel="dungeons">Expedition ansehen</button></aside></div>`;
    return `<div class="map-layout"><div><canvas id="full-map" class="world-map" width="900" height="580" aria-label="Weltkarte mit deiner Position, Glutwacht und entdeckten Schreinen"></canvas><div class="map-legend"><span><i class="legend-dot"></i>Du & Glutwacht</span><span><i class="legend-dot blue"></i>Glutschrein</span><span><i class="legend-dot red"></i>Gefahr</span></div><p class="panel-note">Die Welt steht dir offen. Entdeckte Glutschreine sind deine Ankerpunkte: Reise zwischen ihnen, erhole dich und setze deinen Weg fort.</p></div><aside class="map-regions"><h3 class="section-title">Deine Horizonte</h3>${REGIONS.map(region=> {
      const discovered = (this.game.discovered || []).includes(region.id);
      const shrine = (this.game.world?.shrines || []).find(entry=>entry.region===region.id || entry.regionId===region.id || entry.x>=region.x&&entry.x<region.x+region.w&&entry.y>=region.y&&entry.y<region.y+region.h);
      const shrineDiscovered = shrine && (shrine.discovered || shrine.unlocked || shrine.active || (this.game.unlockedShrines || []).includes(shrine.id));
      return `<div class="region-entry ${discovered?'':'undiscovered'}"><strong>${escape(region.name)}</strong><p>Stufe ${region.level}+ · ${discovered?'Entdeckt':'Unbekannte Wege'}<br>${escape(region.subtitle)}</p>${shrineDiscovered?`<button class="small-button" data-command="travel" data-id="${escape(shrine.id)}">Zum Glutschrein ${icon('arrow')}</button>`:''}</div>`;
    }).join('')}</aside></div>`;
  }

  party() {
    const network=this.network;
    const serverAddress=(network?.baseUrl || globalThis.location?.origin || 'http://localhost:4173').replace(/\/\/(localhost|127\.0\.0\.1)(?=:|\/|$)/,'//<Host-IP>');
    return `<div class="party-connection"><div><span class="eyebrow">DEINE GRUPPE</span><h3 id="party-status">Verbindung prüfen</h3><p id="party-connection-error" class="panel-note" role="status"></p></div><div id="party-room-code" class="party-room-code"></div></div><div id="party-roster" class="party-roster"></div><div class="party-forms"><section><h3 class="section-title">Dein Gruppencharakter</h3><label class="field-label" for="party-player-name">Name</label><input id="party-player-name" class="game-input" value="${escape(this.game.player.name || 'Aren')}" maxlength="24" autocomplete="nickname"/><label class="field-label" for="party-class">Klasse</label><select id="party-class" class="game-input">${CLASSES.map(entry=>`<option value="${entry.id}" ${entry.id===this.game.player.classId?'selected':''}>${escape(entry.name)} · ${escape(entry.role)}</option>`).join('')}</select><p class="panel-note">Dein Gruppencharakter hat einen eigenen Fortschritt. Deine Einzelspieler-Reise bleibt gespeichert.</p>${network?.savedSession?'<button class="small-button" data-command="party-resume">Gespeicherte Gruppe fortsetzen</button>':''}</section><section><h3 class="section-title">Eine Gruppe bilden</h3><label class="field-label" for="party-room-name">Gruppenname</label><input id="party-room-name" class="game-input" value="Glutwacht" maxlength="32"/><button class="small-button" data-command="party-create">${icon('group')}Gruppe erstellen</button><label class="field-label" for="party-join-code">Gruppencode</label><input id="party-join-code" class="game-input code-input" placeholder="8 Zeichen" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false"/><button class="small-button" data-command="party-join">Gruppe beitreten ${icon('arrow')}</button></section></div><div class="party-actions"><button class="small-button" data-command="party-refresh">Offene Gruppen aktualisieren</button><button class="small-button danger-button" data-command="party-disconnect">Gruppe verlassen</button></div><div id="party-room-list" class="party-room-list"><p class="panel-note">Offene Gruppen werden geladen.</p></div><div class="party-guide"><h3 class="section-title">Gemeinsam losziehen</h3><p>Öffnet Emberfall auf demselben Spielserver, erstellt eine Gruppe und teilt den achtstelligen Code. Im selben WLAN verwendet ihr auf den weiteren Geräten die LAN-Adresse des Hosts.</p><p class="panel-note">Spieladresse: <code>${escape(serverAddress)}</code>${serverAddress.includes('<Host-IP>')?' · Host-IP durch die lokale IP-Adresse des Hosts ersetzen.':''}</p><p class="panel-note">Bis zu acht Reisende · Geteilte Welt und Kämpfe · Eigene Beute und Klassenpfade</p><button class="small-button" data-panel="dungeons">Gruppendungeons ansehen ${icon('portal')}</button></div>`;
  }

  updateParty() {
    const network=this.network;
    const party=this.game.party || [];
    const status=network?.status || 'offline';
    const state=JSON.stringify([status,network?.serverAvailable,network?.roomCode,network?.error,this.networkBusy,party.map(player=>[player.id,player.name,player.classId,player.level,Math.round(player.hp),player.maxHp,player.dead,player.downed,player.connected])]);
    if(state===this.lastPartyState)return;
    this.lastPartyState=state;
    const labels={offline:'Du reist allein',connecting:'Gruppe wird verbunden …',online:'Deine Gruppe ist verbunden',reconnecting:'Verbindung wird wiederhergestellt …'};
    const statusElement=document.getElementById('party-status');
    if(statusElement)statusElement.textContent=labels[status] || status;
    const errorElement=document.getElementById('party-connection-error');
    if(errorElement)errorElement.textContent=network?.error || (network?.serverAvailable===false?'Diese Spieladresse bietet aktuell die Einzelspieler-Reise. Gruppenspiel ist über den lokalen Spielserver im selben WLAN verfügbar.':network?.online?'Die Welt läuft weiter, während dieses Fenster geöffnet ist.':'Wähle eine Klasse für deine nächste Gruppenreise.');
    const codeElement=document.getElementById('party-room-code');
    if(codeElement)codeElement.innerHTML=network?.roomCode?`<span>GRUPPENCODE</span><strong>${escape(network.roomCode)}</strong><button class="small-button" data-command="party-copy-code">Code kopieren</button>`:'';
    const roster=document.getElementById('party-roster');
    if(roster)roster.innerHTML=party.length?party.map(player=>this.partyMember(player)).join(''):'<p class="panel-note">Hier erscheinen deine Gefährten nach dem Beitritt.</p>';
    const hud=this.elements['party-hud'];
    if(hud) {
      hud.hidden=!network?.online || !party.length;
      hud.innerHTML=party.map(player=>this.partyMember(player,true)).join('');
    }
    if(this.activePanel==='party') {
      for(const button of this.elements['panel-content'].querySelectorAll('[data-command^="party-"]')) {
        const command=button.dataset.command;
        button.disabled=this.networkBusy || !network || (['party-create','party-join','party-resume'].includes(command)&&(network.online||network.serverAvailable===false)) || (command==='party-disconnect'&&!network.online);
      }
      for(const id of ['party-player-name','party-class']) { const field=document.getElementById(id);if(field)field.disabled=!!network?.online || this.networkBusy; }
    }
  }

  partyMember(player, compact = false) {
    const currentClass=getClass(player.classId);
    const ratio=clamp((player.hp || 0)/(player.maxHp || 1)*100,0,100);
    const downed=player.dead || player.downed || player.hp<=0;
    return `<div class="party-member ${compact?'compact':''} ${downed?'is-downed':''}"><span class="party-member-icon" style="color:${currentClass.color}">${icon(classIcons[currentClass.id])}</span><div><strong>${escape(player.name || 'Reisender')}</strong><span>${compact?`St. ${format(player.level)}`:`${escape(currentClass.name)} · Stufe ${format(player.level)}`}${downed?' · Am Boden':player.connected===false?' · Verbindung fehlt':''}</span><div class="party-member-health"><i style="width:${ratio}%"></i></div></div>${!compact?`<small>${format(player.hp)} / ${format(player.maxHp)}</small>`:''}</div>`;
  }

  async refreshRooms() {
    const list=document.getElementById('party-room-list');
    if(!list || !this.network)return;
    try {
      const response=await this.network.catalog();
      if(!list.isConnected)return;
      list.innerHTML=response.rooms?.length?response.rooms.map(room=>`<div class="party-room-entry"><div><strong>${escape(room.name)}</strong><span>${escape(room.code)} · ${room.players} / ${room.maxPlayers || 8} Reisende</span></div><button class="small-button" data-command="party-join" data-id="${escape(room.code)}" ${room.players>=(room.maxPlayers || 8) || this.network.online?'disabled':''}>Beitreten</button></div>`).join(''):'<p class="panel-note">Noch keine offene Gruppe. Erstelle die erste Glutwacht.</p>';
    } catch(error) { if(list.isConnected)list.innerHTML=`<p class="panel-note">Gruppenspiel startet über den lokalen Emberfall-Spielserver. Teile anschließend dessen WLAN-Adresse mit deinen Gefährten.</p>`; }
    this.updateParty();
  }

  dungeons() {
    const activeId=this.dungeonId();
    const current=DUNGEONS.find(dungeon=>dungeon.id===activeId);
    const party=this.network?.online?(this.game.party || []):[{...this.game.player,dead:this.game.dead}];
    const active=current?`<div class="dungeon-active"><div><span class="eyebrow">AKTUELLE EXPEDITION</span><h3>${escape(current.name)} · Tiefe ${this.game.dungeonInstance?.tier || this.game.world?.tier || 1}</h3><p>${escape(current.subtitle)}</p></div><button class="small-button" data-command="leave-dungeon">Zur offenen Welt</button></div><details class="dungeon-journal"><summary>Inschrift und Rätselhinweis lesen</summary><p>${escape(this.game.dungeonJournal?.description || current.hint)}</p></details>`:'';
    return `${active}<p class="panel-note">Betritt Dungeons an ihrem Tor in der Welt. Nach einem Sieg öffnet sich die nächste Tiefe bis 30. Raids verlangen mehrere lebende Gefährten, die ihre Mechaniken gemeinsam lösen.</p><div class="dungeon-grid">${DUNGEONS.map(dungeon=>{
      const entrance=(this.game.world.dungeonEntrances || []).find(entry=>(entry.dungeonId || entry.id)===dungeon.id) || dungeon.entrance;
      const distance=entrance?Math.hypot(this.game.player.x-entrance.x,this.game.player.y-entrance.y):Infinity;
      const near=!activeId && distance<100;
      const record={...this.game.dungeonProgress,...this.game.dungeonRecords}[dungeon.id] || {};
      const best=record.bestTier || 0;
      const tier=Math.min(30,best+1);
      const levelMet=this.game.player.level>=dungeon.minLevel && party.every(player=>player.level>=dungeon.minLevel);
      const partyMet=party.filter(player=>!player.dead&&!player.downed&&player.hp>0).length>=dungeon.partyRequired;
      const enabled=near && levelMet && partyMet;
      return `<article class="dungeon-card ${dungeon.raid?'raid-card':''}"><div class="dungeon-card-heading">${icon(dungeon.raid?'group':'portal')}<span>${dungeon.raid?'RAID':'DUNGEON'} · STUFE ${dungeon.minLevel}</span></div><h3>${escape(dungeon.name)}</h3><p>${escape(dungeon.subtitle)}</p><div class="dungeon-facts"><span>${dungeon.partyRequired===1?'Allein oder in einer Gruppe':`${dungeon.partyRequired} Reisende benötigt`}</span><span>${best?`Beste Tiefe: ${best}`:'Noch nicht gemeistert'}</span><span>${near?'Du stehst am Tor':`Tor bei ${format(entrance?.x)}, ${format(entrance?.y)}`}</span></div><button class="small-button" data-command="enterDungeon" data-id="${dungeon.id}" data-tier="${tier}" ${enabled?'':'disabled'}>${!levelMet?`Benötigt Stufe ${dungeon.minLevel}`:!partyMet?`${dungeon.partyRequired} Gefährten benötigt`:!near?'Am Tor betreten':`Tiefe ${tier} betreten`}</button>${best>0 && tier>1 && near && levelMet && partyMet?`<button class="text-button" data-command="enterDungeon" data-id="${dungeon.id}" data-tier="1">Tiefe 1 wiederholen</button>`:''}</article>`;
    }).join('')}</div>${!this.network?.online?'<p class="panel-note"><button class="small-button" data-panel="party">Für Raids eine Gruppe bilden</button></p>':''}`;
  }

  settings() {
    const abilities=getClass(this.game.player.classId).abilities;
    const mobileMenu=`<div class="mobile-menu-shortcuts">${[["map","map","Weltkarte"],["character","shield","Charakter"],["inventory","bag","Inventar"],["talents","tree","Talente"],["craft","craft","Handwerk"],["journal","book","Questen"],["dungeons","portal","Dungeons"],["party","group","Gruppe"]].map(([panel,glyph,label])=>`<button class="small-button" data-panel="${panel}">${icon(glyph)}${label}</button>`).join("")}</div>`;
    return `${mobileMenu}<div class="settings-row"><div><h3>Klänge der Welt</h3><p>Musik und Klang geben deiner Reise eine Stimme. Der Ton beginnt nach deiner ersten Eingabe.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="sound" ${this.game.settings?.sound!==false?'checked':''}/>Ton an</label></div><div class="settings-row"><div><h3>Weniger Bewegung</h3><p>Reduziert Kamerabewegungen und Animationen in der Oberfläche.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="reducedMotion" ${this.game.settings?.reducedMotion?'checked':''}/>Aktiv</label></div><h3 class="section-title">Dein Spielstand</h3><p class="panel-note">Emberfall speichert deine Einzelspieler-Reise in diesem Browser und deine Gruppenreise auf dem Spielserver. Exportiere deinen Einzelspieler-Spielstand, um ihn zu sichern oder auf einem anderen Gerät weiterzuspielen.</p><div class="settings-actions"><button class="small-button" data-command="save">${icon('save')}Jetzt speichern</button><button class="small-button" data-command="export">Spielstand exportieren</button><button class="small-button" data-command="import">Spielstand laden</button><button class="small-button danger-button" data-panel="reset">Neue Reise</button></div><h3 class="section-title">Deine Hände, deine Fähigkeiten</h3><p class="panel-note">Auf dem Handy: Joystick für acht Richtungen ziehen, Angriff für automatische Wiederholung halten. Bewegung, Angriff und eine weitere Aktion funktionieren gleichzeitig. Angriffe zielen auf den nächsten sichtbaren Gegner.</p><div class="settings-controls"><div class="summary-stat"><span>Bewegen</span><strong>WASD / Pfeiltasten</strong></div><div class="summary-stat"><span>${escape(abilities.attack.name)} / Ausweichen</span><strong>J oder Klick / Leertaste</strong></div><div class="summary-stat"><span>${escape(abilities.nova.name)} / ${escape(abilities.bolt.name)} / Heiltrank</span><strong>F / Q / R</strong></div><div class="summary-stat"><span>Erlernte Zusatzfähigkeiten</span><strong>3 / 4 · Im Talentfenster belegen</strong></div><div class="summary-stat"><span>Sprechen, sammeln, pflanzen & ernten</span><strong>E</strong></div><div class="summary-stat"><span>Inventar / Talente / Handwerk / Questen</span><strong>I / T / B / L</strong></div><div class="summary-stat"><span>Weltkarte / Charakter / Gruppe</span><strong>M / C / P</strong></div></div>`;
  }

  contractBoard() {
    const game=this.game;
    const regionId=this.contractRegion||(!this.dungeonId()?game.regionAt().id:game.contracts?.active?.[0]?.region)||'daemmerhain';
    const region=REGIONS.find(r=>r.id===regionId)||REGIONS[0];
    const active=game.contracts?.active||[],offers=game.contractOffers?.(region.id)||[];
    const render=(contract,running)=>{
      const giver=game.contractGiver?.(contract.region);
      const nearby=!!giver&&Math.hypot(giver.x-game.player.x,giver.y-game.player.y)<110&&!this.dungeonId();
      const ready=contract.status==='ready';
      return `<article class="quest-log-item"><div class="quest-log-heading"><h3>${escape(contract.title)}</h3><span class="quest-status">${ready?'BEREIT':running?'UNTERWEGS':`STUFE ${contract.minLevel}+`}</span></div><p>${escape(contract.description)}</p>${contract.objectives.map((o,i)=>`<p class="panel-note">${escape(o.label)} · ${running?Math.min(contract.counts[i]||0,o.count):0}/${o.count}</p>`).join('')}<div class="quest-reward">${this.reward(contract)}</div><p class="panel-note">${escape(REGIONS.find(r=>r.id===contract.region)?.name||contract.region)} · Auftraggeber: ${escape(giver?.name||'Rowan')}${nearby?'':` · Sprich vor Ort mit ${escape(giver?.name||'Rowan')}.`}</p><div class="party-actions">${running?`${ready?`<button class="small-button" data-command="turnInContract" data-id="${escape(contract.id)}" ${nearby?'':'disabled'}>Auftrag abschließen</button>`:''}<button class="text-button" data-command="cancelContract" data-id="${escape(contract.id)}">Auftrag aufgeben</button>`:`<button class="small-button" data-command="acceptContract" data-id="${escape(contract.id)}" ${nearby&&active.length<3?'':'disabled'}>Auftrag annehmen</button>`}</div></article>`;
    };
    return `<p class="panel-note">Hilf den Siedlungen mit wechselnden Jagd-, Sammel-, Handwerks- und Dungeonaufträgen. Fortschritt zählt nach der Annahme im Auftragsgebiet. Bis zu drei Aufgaben gleichzeitig.</p>${active.length?`<h3 class="section-title">Deine laufenden Aufträge</h3>${active.map(c=>render(c,true)).join('')}`:''}<label class="game-input-label">Neue Aufgaben im Gebiet<select class="game-input" data-contract-region>${REGIONS.map(r=>`<option value="${escape(r.id)}" ${r.id===region.id?'selected':''}>${escape(r.name)} · Stufe ${r.level}+</option>`).join('')}</select></label>${offers.filter(o=>!active.some(a=>a.id===o.id)).map(o=>render(o,false)).join('')||'<p class="panel-note">Für deine Stufe gibt es hier noch keine passenden Aufträge. Die ersten beginnen ab Stufe 8; später führen dich die Tafeln in neue Gebiete.</p>'}`;
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
    const quests = QUESTS.filter(quest=>quest.giver===npc.id && (this.game.questState?.[quest.id] || this.game.canAccept(quest)));
    const current = quests.filter(quest=>this.game.questState?.[quest.id]?.status!=='done');
    const locked = QUESTS.find(quest=>quest.giver===npc.id && !this.game.questState?.[quest.id] && this.game.player.level<(quest.minLevel||1) && (Array.isArray(quest.prerequisite)?quest.prerequisite:quest.prerequisite?[quest.prerequisite]:[]).every(id=>this.game.questState?.[id]?.status==='done'));
    let extra = '';
    if(locked) extra=`<article class="dialogue-quest"><h3>${escape(locked.title)}</h3><p>${escape(locked.description)}</p><p class="panel-note">Diese Aufgabe beginnt ab Stufe ${locked.minLevel}. Stärke dich auf den Wegen und bei regionalen Aufträgen.</p></article>`;
    if (['oren','elin','sera'].includes(npc.id)) {
      const shopIds = npc.id==='elin'?['forest_blade','sentinel_mail']:npc.id==='sera'?['heal_potion','mana_potion']:['heal_potion','mana_potion','leather_armor','forest_blade'];
      extra = `<h3 class="section-title">${npc.id==='elin'?'Elins Ausrüstung':npc.id==='sera'?'Tränke für den Weg':'Vorräte & Ausrüstung'}</h3><div class="item-list">${shopIds.map(id=>this.itemRow(ITEMS[id],0,'buy',true)).join('')}</div>`;
      if (npc.id==='oren') {
        const sellable = Object.entries(this.game.inventory||{}).filter(([id,count])=>count>0 && this.item(id) && this.game.equipment?.[this.item(id).type]!==id);
        extra += `<div class="item-row"><div class="item-icon">${icon('leaf')}</div><div class="item-main"><h3>Saatgut</h3><p>Drei Samen für deinen Dorfacker.</p></div><button class="small-button" data-command="buy" data-id="seed" ${(this.game.player?.gold||0)>=4?'':'disabled'}>${icon('coin')}4</button></div>${sellable.length?`<h3 class="section-title">Aus deinem Gepäck verkaufen</h3>${sellable.map(([id,count])=>this.itemRow(this.item(id),count,'sell')).join('')}`:''}`;
      }
    }
    if (npc.id==='toma') extra = `<div class="dialogue-quest"><h3>Dein Stück Erde</h3><p>Die Beete liegen südlich von Toma. Stelle dich neben ein leeres Beet und drücke E, um Saatgut zu pflanzen. Wenn der Weizen reif ist, drücke erneut E zum Ernten.</p><p>Dein Saatgut: ${format(this.game.resources?.seed)} · Deine Ernte: ${format(this.game.resources?.wheat)} Sonnenweizen.</p><button class="small-button" data-command="buy" data-id="seed" ${(this.game.player?.gold||0)>=4?'':'disabled'}>${icon('leaf')}3 Saatgut kaufen · 4 Gold</button><button class="small-button" data-panel="craft">Hainbrot backen</button></div>`;
    if (['elin','sera'].includes(npc.id)) extra += `<p class="panel-note"><button class="small-button" data-panel="craft">${icon('craft')}${npc.id==='elin'?'Zur Werkbank':'Tränke selbst brauen'}</button></p>`;
    if(npc.id==='rowan'||NPCS.some(n=>n.id===npc.id&&QUESTS.some(q=>q.giver===n.id&&q.region&&q.minLevel)))extra+=`<p class="panel-note"><button class="small-button" data-command="open-contracts" data-id="${escape(QUESTS.find(q=>q.giver===npc.id&&q.region)?.region||'daemmerhain')}">Regionale Aufträge ansehen</button></p>`;
    return `<div class="dialogue-layout"><div class="npc-portrait">${icon(npc.id==='elin'?'craft':npc.id==='toma'?'leaf':npc.id==='sera'?'potion':npc.id==='oren'?'coin':npc.id==='rowan'?'map':'flame')}</div><div><p class="npc-role">${escape(npc.role).toUpperCase()}</p><p class="npc-dialogue">„${escape(npc.dialogue)}“</p>${current.map(quest=> {
      const state = this.game.questState?.[quest.id];
      const ready = state && (state.status==='ready' || quest.objectives.every((objective,index)=>(state.counts?.[index]||0)>=objective.count));
      return `<article class="dialogue-quest"><h3>${escape(quest.title)}</h3><p>${escape(quest.description)}</p><div class="quest-reward">${this.reward(quest)}</div>${!state?`<button class="small-button" data-command="questAccept" data-id="${escape(quest.id)}">Ich helfe dir ${icon('arrow')}</button>`:ready?`<button class="small-button" data-command="questTurnIn" data-id="${escape(quest.id)}">Belohnung abholen ${icon('check')}</button>`:`<p class="panel-note">Deine Aufgabe läuft. ${quest.objectives.map((objective,index)=>`${escape(objective.label)} ${Math.min(state.counts?.[index]||0,objective.count)}/${objective.count}`).join(' · ')}</p>`}</article>`;
    }).join('')}${extra}${!current.length&&!extra?'<p class="panel-note">Dein Weg ist noch nicht zu Ende. Kehre wieder, wenn du neue Geschichten zu erzählen hast.</p>':''}</div></div>`;
  }

  death() { return `<div class="large-state">${icon('flame')}<h3>Dein Funke ist nicht erloschen.</h3><p>Die Glut trägt dich zurück nach Glutwacht. Sammle Kraft, verbessere deine Ausrüstung und versuche einen neuen Weg.</p><button class="primary-button" data-command="respawn">Zurück ins Licht ${icon('arrow')}</button></div>`; }
  victory() { return `<div class="large-state">${icon('sun')}<h3>Die Welt atmet wieder.</h3><p>Veyr ist gefallen. Die letzte Glut wurde zu einem neuen Anfang. Doch die freien Lande haben noch immer Geschichten für dich.</p><button class="primary-button" data-command="resume">Deine Reise fortsetzen ${icon('arrow')}</button><p class="panel-note">Sprich mit Mira, um die Belohnung für deine letzte Quest zu erhalten.</p></div>`; }
  resetConfirmation() { return `<div class="large-state">${icon('leaf')}<h3>Jede Geschichte beginnt mit einem Schritt.</h3><p>Deine aktuelle Reise wird ersetzt. Exportiere deinen Spielstand in den Einstellungen, wenn du sie für später behalten möchtest.</p>${this.classSelection(this.pendingClass,true)}<button class="primary-button" data-command="confirm-reset">Als ${escape(getClass(this.pendingClass).name)} beginnen ${icon('arrow')}</button><button class="text-button" data-command="resume">Zur aktuellen Reise zurück</button></div>`; }
  showDeath() { if (this.activePanel==='death') return; this.togglePanel('death'); }
  showVictory() { if (this.activePanel==='victory') return; this.togglePanel('victory'); }

  async command(name, id, button) {
    if(name==='inventory-page'){this.inventoryPage=Math.max(0,Number(id)||0);this.renderPanel();return;}
    if(name==='open-equipment'){this.inventoryTab='equipment';this.inventoryPage=0;if(this.activePanel!=='inventory')this.togglePanel('inventory');else this.renderPanel();return;}
    if(name==='assign-ability'){await this.assignAbility(Number(button.dataset.slot),id);return;}
    if(name==='open-contracts') {this.questTab='contracts';this.contractRegion=id;this.togglePanel('journal');return;}
    if (name==='resume') { this.closePanel(); return; }
    if (name==='selectClass') { if(this.game.selectClass(id)) {this.pendingClass=id;this.syncWelcome();this.update(true);this.elements['welcome-classes'].querySelector(`[data-id="${id}"]`)?.focus({preventScroll:true});}return; }
    if (name==='choose-reset-class') { this.pendingClass=id;this.renderPanel();return; }
    if (name==='confirm-reset') { const result=this.game.reset(this.pendingClass);if(result===false)return;this.begin();this.showNotice('Eine neue Reise. Ein neuer Funke.', 'success');return; }
    if(name.startsWith('party-')) { await this.networkCommand(name,id);return; }
    if(name==='socket') { this.game.socket(id,button.dataset.gem);this.update(true);return; }
    if(name==='enterDungeon') { const result=await this.game.enterDungeon(id,Number(button.dataset.tier) || 1);if(result!==false)this.closePanel();this.update(true);return; }
    if(name==='leave-dungeon') { const method=this.game.leaveDungeon || this.game.exitDungeon;if(method){await method.call(this.game);this.closePanel();this.update(true);}return; }
    if (name==='respawn') { this.game.respawn(); this.closePanel(); this.update(true); return; }
    if (name==='save') { this.manualSave(); return; }
    if (name==='import') { this.elements['save-import'].click(); return; }
    if (name==='export') { this.game.exportSave(); return; }
    if (name==='travel') { this.game.travel(id); this.closePanel(); this.update(true); return; }
    const method = this.game[name];
    if (typeof method==='function') { const result = method.call(this.game,id); if (result?.then) result.then(()=>this.update(true)); else this.update(true); }
  }

  async networkCommand(name, id) {
    const network=this.network;
    if(!network) {this.showNotice('Die Gruppenverbindung wird vorbereitet. Öffne das Gruppenfenster erneut.','error');return;}
    if(name==='party-refresh') {await this.refreshRooms();return;}
    if(name==='party-copy-code') {
      try{await navigator.clipboard.writeText(network.roomCode || '');this.showNotice('Gruppencode kopiert.','success');}catch{this.showNotice(`Dein Gruppencode: ${network.roomCode || ''}`);}return;
    }
    const playerName=document.getElementById('party-player-name')?.value.trim() || this.game.player.name;
    const classId=document.getElementById('party-class')?.value || this.game.player.classId;
    const roomName=document.getElementById('party-room-name')?.value.trim() || 'Glutwacht';
    const code=id || document.getElementById('party-join-code')?.value.trim();
    this.networkBusy=true;this.updateParty();
    try {
      if(name==='party-create') await network.create({name:roomName,playerName,classId});
      else if(name==='party-join') await network.join(code,{playerName,classId});
      else if(name==='party-resume') await network.resume();
      else if(name==='party-disconnect') await network.disconnect();
      this.closePanel();this.syncWelcome();this.update(true);
      if(this.game.started)this.elements.world.focus({preventScroll:true});
    } catch(error) {this.showNotice(error.message,'error');}
    finally {this.networkBusy=false;this.updateParty();}
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
    const player=this.game.player || {};
    const viewWidth = full ? worldWidth : Math.min(worldWidth,1280);
    const viewHeight = full ? worldHeight : Math.min(worldHeight,1280*height/width);
    const left = full ? 0 : clamp((player.x ?? 560)-viewWidth/2,0,Math.max(0,worldWidth-viewWidth));
    const top = full ? 0 : clamp((player.y ?? 1230)-viewHeight/2,0,Math.max(0,worldHeight-viewHeight));
    const scale = Math.min(width/viewWidth,height/viewHeight);
    const ox = (width-viewWidth*scale)/2-left*scale, oy = (height-viewHeight*scale)/2-top*scale;
    const mapX = x=>ox+x*scale, mapY=y=>oy+y*scale;
    ctx.fillStyle = '#102016';ctx.fillRect(0,0,width,height);
    const inDungeon=!!this.dungeonId();
    for (const region of inDungeon?[]:REGIONS) {
      const discovered = (this.game.discovered || []).includes(region.id);
      ctx.fillStyle = region.color || '#496744';
      ctx.globalAlpha = discovered ? .65 : .24;
      ctx.fillRect(mapX(region.x),mapY(region.y),region.w*scale,region.h*scale);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#9bac7150';ctx.lineWidth = full?1:.6;
      ctx.strokeRect(mapX(region.x),mapY(region.y),region.w*scale,region.h*scale);
      if (full && region.w*scale>45 && region.h*scale>28) {
        ctx.fillStyle = discovered ? '#e5dab2' : '#859475';ctx.font = `${Math.max(10,Math.min(18,region.w*scale/8))}px Georgia`;ctx.textAlign = 'center';
        ctx.fillText(region.name,mapX(region.x+region.w/2),mapY(region.y+region.h/2)-6,region.w*scale-8);
        ctx.fillStyle = discovered?'#b9c1a1':'#718367';ctx.font = '10px sans-serif';ctx.fillText(`Stufe ${region.level}+`,mapX(region.x+region.w/2),mapY(region.y+region.h/2)+10);
      }
    }
    if(inDungeon) {
      for(const room of world.rooms || []) {ctx.fillStyle=room.color || '#3b4742';ctx.fillRect(mapX(room.x),mapY(room.y),room.w*scale,room.h*scale);if(full){ctx.fillStyle='#c5c9af';ctx.font='14px Georgia';ctx.textAlign='center';ctx.fillText(room.name,mapX(room.x+room.w/2),mapY(room.y+room.h/2),room.w*scale-10);}}
      for(const wall of world.structures || []) {if(wall.blocking===false)continue;const box=wall.collision || wall;ctx.fillStyle=wall.type==='dungeon_gate'?'#b49d63':'#17221c';ctx.fillRect(mapX(box.x),mapY(box.y),box.w*scale,box.h*scale);}
      for(const puzzle of world.puzzleObjects || []) {ctx.fillStyle='#b99ddd';ctx.fillRect(mapX(puzzle.x)-2,mapY(puzzle.y)-2,4,4);}
    }
    ctx.strokeStyle='#9e996b70';ctx.lineCap='round';
    for(const path of world.paths || []) {
      const points=path.points || path;
      if(!Array.isArray(points)||points.length<2)continue;
      ctx.lineWidth=Math.max(full?1:.6,(path.width || 24)*scale);
      ctx.beginPath();points.forEach((point,index)=>{const x=mapX(point.x ?? point[0]),y=mapY(point.y ?? point[1]);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    }
    for (const node of (world.nodes || [])) { if (node.depleted || node.amount===0) continue;ctx.fillStyle='#a6bd6570';ctx.fillRect(mapX(node.x)-.7,mapY(node.y)-.7,1.5,1.5); }
    for (const shrine of (world.shrines || [])) {
      const discovered = shrine.discovered || shrine.unlocked || shrine.active || (this.game.unlockedShrines || []).includes(shrine.id);
      if (!discovered) continue;
      const x=mapX(shrine.x),y=mapY(shrine.y);ctx.fillStyle='#8fc8c7';ctx.beginPath();ctx.moveTo(x,y-4);ctx.lineTo(x+3,y);ctx.lineTo(x,y+4);ctx.lineTo(x-3,y);ctx.closePath();ctx.fill();
      if (full) {ctx.fillStyle='#c5dbbd';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText(shrine.name || 'Glutschrein',x+9,y+3);}
    }
    for (const enemy of (world.enemies || [])) {
      if (enemy.dead || enemy.alive===false || enemy.hp<=0) continue;
      const boss=enemy.boss || ENEMY_TYPES[enemy.type]?.boss;
      if (full && !boss) continue;
      const region=REGIONS.find(entry=>enemy.x>=entry.x&&enemy.x<entry.x+entry.w&&enemy.y>=entry.y&&enemy.y<entry.y+entry.h);
      if (!inDungeon && !(this.game.discovered || []).includes(region?.id)) continue;
      ctx.fillStyle=boss?'#ec9069':'#bd7254';const size=boss?4:2;ctx.fillRect(mapX(enemy.x)-size/2,mapY(enemy.y)-size/2,size,size);
    }
    for (const npc of this.game.npcs || []) {ctx.fillStyle='#d9c484';ctx.beginPath();ctx.arc(mapX(npc.x),mapY(npc.y),full?2.2:1.4,0,Math.PI*2);ctx.fill();}
    for(const entrance of world.dungeonEntrances || []) {ctx.strokeStyle='#d4b6d5';ctx.lineWidth=full?1.5:1;ctx.strokeRect(mapX(entrance.x)-3,mapY(entrance.y)-3,6,6);}
    for(const ally of this.game.partyPlayers || this.game.otherPlayers || []) {ctx.fillStyle=ally.dead?'#ba8065':'#a1d0a5';ctx.beginPath();ctx.arc(mapX(ally.x),mapY(ally.y),full?3:2,0,Math.PI*2);ctx.fill();}
    if (full && !inDungeon) {ctx.fillStyle='#e0d2a6';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('GLUTWACHT',mapX(565),mapY(1460));}
    const px=mapX(player.x ?? 560),py=mapY(player.y ?? 1230);
    ctx.fillStyle='#eeda9b';ctx.strokeStyle='#12251a';ctx.lineWidth=full?2:1;
    ctx.beginPath();ctx.moveTo(px,py-5);ctx.lineTo(px+4,py+4);ctx.lineTo(px,py+2);ctx.lineTo(px-4,py+4);ctx.closePath();ctx.fill();ctx.stroke();
    if (full) {ctx.fillStyle='#f1e2b1';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('DU',px+10,py-4);}
  }
}
