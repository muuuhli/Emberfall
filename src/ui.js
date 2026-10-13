import { REGIONS, RESOURCES, ITEMS, RECIPES, QUESTS, NPCS, ENEMY_TYPES } from './catalog.js';
import { CLASSES, getClass } from './classes.js';
import { GEM_TYPES, SETS, ITEM_BASES, itemPower, describeStat } from './loot.js';
import { ABILITIES, getAbility, canLearnAbility, getLearnedAbilities } from './abilities.js';
import { DUNGEONS } from './dungeons.js';
import { MAX_LEVEL } from './progression.js';
import { getArsenalShopStock } from './arsenal.js';
import { getConsumableProfile } from './professions.js';
import { drawMapFeatures } from './map-art.js';
import { PVP_RULES } from './pvp.js';
import { relicPresentation } from './relics.js';
import { loadoutProblems } from './inventory-system.js';
import { summarizeWorldEvents } from './world-events.js';
import { FACTIONS, FACTION_RANKS, ACHIEVEMENTS, COMPANIONS, JOURNEY_RECIPES, JOURNEY_MASTERIES, getFactionProgress, getJourneyUnlocks, getAchievementProgress, canClaimAchievement, canChooseJourneyMastery, getMasteryRank, canSelectCompanion, canCraftJourneyRecipe } from './journey.js';
import { EQUIPMENT_SLOTS, equipmentSlot, getEquipmentShopStock, scaleEquipmentStats } from './equipment-system.js';

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
const familyLabels={beast:'Bestien',plant:'Verderbte Flora',cultist:'Kultisten',undead:'Untote',spectral:'Geister',demon:'Dämonen',insect:'Kriechtiere',construct:'Konstrukte',abomination:'Scheusale'};
const traitLabels={swift:'Schnell',venom:'Giftig',bleeding:'Blutend',vicious:'Grausam',frost:'Frost',draining:'Lebensraub',armored:'Gepanzert',arcane:'Arkan',summoner:'Beschwört Diener',burning:'Brennend',regenerating:'Regeneriert'};
const itemIcon = item => ['helmet','gloves','boots','ring'].includes(item?.slot) ? item.slot : item?.type === 'weapon' ? (/bow|string|crossbow/.test(item.baseId || item.id || '') || item.family==='ranger') ? 'bow' : (/staff|wand|scepter|focus|branch/.test(item.baseId || item.id) || ['flamecaller','frostweaver','druid','shadowbinder'].includes(item.family)) ? 'bolt' : 'sword' : item?.type === 'armor' ? 'shield' : item?.type === 'charm' ? 'gem' : item?.id === 'hearty_meal' ? 'leaf' : 'potion';
const resourceIcon = id => ['wood','herb','seed','wheat'].includes(id) ? 'leaf' : 'gem';
const classIcons = { guardian:'shield',paladin:'sun',ranger:'bow',nightblade:'sword',flamecaller:'flame',frostweaver:'snowflake',druid:'leaf',shadowbinder:'gem' };
const abilityIcon = (ability, classId) => ({ heal:'heart', shield:'shield', drain:'gem', summon:'group', dashstrike:'dash', trap:classId==='frostweaver'?'snowflake':'leaf', aoe:'nova', projectile:classId==='ranger'?'bow':classIcons[classId] || 'bolt', melee:'sword' }[ability?.kind] || 'bolt');
const learnedIcon = ability => ({'⬡':'shield','⚑':'group','⚔':'sword','✚':'heart','☀':'sun','➤':'bow','⌘':'leaf','❧':'leaf','↝':'dash','◆':'gem','✦':'flame','☄':'flame','❄':'snowflake','✿':'leaf','☾':'gem','◈':'group'}[ability?.icon] || ability?.icon || 'tree');
const branchIcons = {'Wächter':'shield','Arkanist':'flame','Wildläufer':'leaf'};
const branchDescriptions = {'Wächter':'Halte stand. Jede Wunde macht dich stärker.','Arkanist':'Entfache die Glut und forme den Äther.','Wildläufer':'Bewege dich frei. Lebe von den Gaben des Hains.'};
const combatPatterns = { melee:'Nahkampf',ranged:'Fernkampf',charge:'Ansturm',caster:'Zauberwirker',summon:'Beschwörer',swarm:'Schwarm',ambush:'Hinterhalt',artillery:'Artillerie',support:'Unterstützer',guardian:'Wächter',bruiser:'Brecher',skirmisher:'Plänkler',assassin:'Meuchler',siege:'Belagerung',drain:'Lebensraub',nova:'Flächenangriff',burst:'Angriffsserie',hex:'Fluch',ring:'Geschossring',fan:'Geschossfächer',summoner:'Beschwörer' };
const menuGroups=[{id:'hero',name:'Held',icon:'shield',panels:[['character','Charakter'],['talents','Talente']]},{id:'arsenal',name:'Arsenal',icon:'bag',panels:[['inventory','Gepäck & Lager'],['craft','Schmieden & Brauen']]},{id:'chronicle',name:'Chronik',icon:'book',panels:[['journal','Questen & Aufträge'],['journey','Ruf & Gefährten'],['bestiary','Bestiarium']]},{id:'world',name:'Welt',icon:'map',panels:[['map','Atlas'],['adventures','Ereignisse'],['dungeons','Dungeons'],['interactions','Spuren'],['party','Gruppe']]}];
const groupFor=panel=>menuGroups.find(group=>group.panels.some(([id])=>id===panel));
const panels = {map:['Atlas der Asche','Verlorene Siedlungen, alte Tore und gefährliche Wege.'],world:['Atlas der Asche','Verlorene Siedlungen, alte Tore und gefährliche Wege.'],character:['Der Glutträger','Rüstung, Werte und die Macht deiner Klasse.'],inventory:['Dein Arsenal','Vergleiche Beute, verstärke Ausrüstung und bereite dich vor.'],talents:['Pfade der Macht','Aktive Techniken, Talentzweige und folgenschwere Entscheidungen.'],craft:['Die schwarze Werkbank','Schmiede Waffen, braue Elixiere und verarbeite deine Beute.'],journal:['Chronik der Verlorenen','Questen, regionale Aufträge und unerfüllte Eide.'],bestiary:['Bestiarium der Finsternis','Jede Kreatur kann als mächtiger Boss wiederkehren.'],interactions:['Spuren in der Asche','Altäre, Reliquien und Begegnungen auf deinem Weg.'],party:['Ein Bund in der Dunkelheit','Gemeinsam bestehen: bis zu acht Glutträger.'],dungeons:['Tore in die Tiefe','Runenrätsel, schwere Bosse und immer tiefere Herausforderungen.'],journey:['Dein Vermächtnis','Fraktionen, Errungenschaften und Gefährten auf deiner Reise.'],adventures:['Jenseits der Straßen','Regionale Ereignisse und Expeditionen mit eigenen Entscheidungen.'],settings:['Am letzten Feuer','Deine Reise wird direkt in diesem Browser gespeichert.']};

export class GameUI {
  constructor(game) {
    this.game = game;
    this.activePanel = null;
    this.inventoryTab = 'equipment';
    this.inventoryPage = 0;
    this.inventorySearch = '';
    this.inventoryType = 'all';
    this.inventoryRarity = 'all';
    this.inventorySort = 'default';
    this.inventoryUsable = false;
    this.inventorySelected = null;
    this.inventoryFlags = 'all';
    this.characterTab = 'equipment';
    this.journeyTab = 'factions';
    this.adventureFilter = 'all';
    this.loadoutName = '';
    this.trackerExpanded = false;
    this.bestiarySearch = '';
    this.bestiaryFamily = 'all';
    this.bestiaryPage = 0;
    this.craftFilter = 'available';
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
    for (const id of ['welcome-overlay','welcome-classes','start-button','continue-button','panel-overlay','game-panel','panel-title','panel-description','panel-content','close-panel','save-button','save-state','save-import','world-hud','quest-tracker','region-name','region-subtitle','player-name','player-class','player-level','hp-fill','hp-text','hp-shield','party-hud','mana-fill','mana-text','xp-fill','xp-text','gold-count','talent-badge','potion-count','interact-prompt','world-time','world-weather','world-effects','pvp-hud','waypoint-text','notice-stack','minimap','world']) this.elements[id] = document.getElementById(id);
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
      if (button.dataset.talentBranch) { this.talentBranch=button.dataset.talentBranch;this.renderPanel();return; }
      if (button.dataset.talentTab) { this.pendingScrollReset=true;this.talentTab=button.dataset.talentTab;this.renderPanel();return; }
      if (button.dataset.inventoryTab) { this.pendingScrollReset=true;this.inventoryTab = button.dataset.inventoryTab;this.inventoryType='all';this.inventoryPage=0; this.renderPanel(); return; }
      if (button.dataset.characterTab) {this.pendingScrollReset=true;this.characterTab=button.dataset.characterTab;this.renderPanel();return;}
      if (button.dataset.journeyTab) {this.pendingScrollReset=true;this.journeyTab=button.dataset.journeyTab;this.renderPanel();return;}
      if (button.dataset.questTab) { this.pendingScrollReset=true;this.questTab = button.dataset.questTab; this.renderPanel(); return; }
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
    document.addEventListener('input', event => {
      const volume=event.target.dataset.setting;
      if(event.target.type==='range'&&['masterVolume','musicVolume','effectsVolume'].includes(volume)){
        const value=clamp(event.target.value,0,1);this.game.setSetting(volume,value);
        event.target.setAttribute('aria-valuetext',`${Math.round(value*100)} Prozent`);
        const output=document.getElementById(`${volume}-value`);if(output)output.value=`${Math.round(value*100)} %`;return;
      }
      const draft=event.target.dataset.uiDraft;if(draft){this[draft]=event.target.value;return;}
      const key = event.target.dataset.uiSearch;
      if (!key) return;
      this[key] = event.target.value; this.inventoryPage = 0; this.bestiaryPage = 0;
      this.renderPanel();
    });
    document.addEventListener('change', event => {
      const filter = event.target.dataset.uiFilter;
      if (filter) { this[filter]=event.target.type==='checkbox'?event.target.checked:event.target.value;this.inventoryPage=0;this.bestiaryPage=0;this.renderPanel(true);return; }
      if(event.target.dataset.abilityLoadout!==undefined) {this.assignAbility(Number(event.target.dataset.abilityLoadout),event.target.value||null);return;}
      if(event.target.dataset.contractRegion!==undefined) {this.contractRegion=event.target.value;this.renderPanel();return;}
      const key = event.target.dataset.setting;
      if (!key) return;
      const value=event.target.type==='checkbox'?event.target.checked:event.target.type==='range'?clamp(event.target.value,0,1):event.target.value;
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
    this.elements['start-button'].innerHTML = `${this.game.hasSave ? 'Eine neue Reise beginnen' : 'Die Dunkelheit betreten'}${icon('arrow')}`;
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
  get inPvp() { return this.game.worldMode==='pvp'||this.game.world?.isPvp===true||['countdown','active','finished'].includes(this.game.pvp?.duel?.state); }
  get network() { return this.game.networkClient || this.game.network; }
  dungeonId() { return this.game.dungeonInstance?.id || (typeof this.game.activeDungeon==='string'?this.game.activeDungeon:this.game.activeDungeon?.id) || (this.game.world?.isDungeon?this.game.world.dungeonId:null); }

  update(force = false) {
    const game = this.game;
    this.updatePvp();
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
    if(this.inPvp)region={name:'Hof der Schatten',subtitle:'Freiwilliges Spiegelduell',level:1};
    const hpMax = stats.maxHp || player.maxHp || 100;
    const manaMax = stats.mana || stats.maxMana || player.maxMana || 60;
    const xpMax = typeof game.xpNeeded === 'function' ? game.xpNeeded() : Number(game.xpNeeded) || 100;
    this.setText('region-name', region.name);
    this.setText('region-subtitle', this.inPvp?'GLEICHE WERTE · FREIWILLIGES DUELL':`${region.subtitle.toUpperCase()} · STUFE ${region.level}+`);
    this.setText('player-name', player.name || 'Aren');
    this.setText('player-class', this.inPvp?'SPIEGELDUELL':getClass(player.classId).name.toUpperCase());
    this.setText('player-level', player.level || 1);
    this.setWidth('hp-fill', (player.hp || 0) / hpMax * 100);
    this.setWidth('mana-fill', (player.mana || 0) / manaMax * 100);
    for (const [id, value, max] of [['hp-fill',player.hp,hpMax],['mana-fill',player.mana,manaMax]]) {
      const bar=this.elements[id]?.parentElement;
      bar?.style.setProperty('--orb-level',`${clamp(value/max*100,0,100)}%`);
      bar?.setAttribute('aria-valuenow',String(Math.round(value || 0)));
      bar?.setAttribute('aria-valuemax',String(Math.round(max)));
    }
    document.body.classList.toggle('low-health',game.started&&(player.hp||0)/hpMax<.25&&player.hp>0);
    this.setText('hp-text', `${format(player.hp)} / ${format(hpMax)}`);
    this.setText('hp-shield', player.shield>0?`Schutz ${format(player.shield)}`:player.downed?'Kampfunfähig · E zum Wiederbeleben':'');
    if(this.elements['hp-shield']) this.elements['hp-shield'].hidden = !(player.shield>0 || player.downed);
    this.setText('mana-text', `${format(player.mana)} / ${format(manaMax)}`);
    this.setWidth('xp-fill', player.level>=MAX_LEVEL?100:(player.xp || 0) / xpMax * 100);
    this.setText('xp-text', player.level>=MAX_LEVEL?'STUFE 100 · MEISTER DER GLUT':`STUFE ${player.level || 1} · ${format(player.xp)} / ${format(xpMax)} EP`);
    this.setText('gold-count', format(player.gold));
    const healingSupplies=Object.entries(game.inventory || {}).reduce((sum,[id,count])=>{
      const profile=getConsumableProfile(this.item(id));
      return sum+(profile?.hpRestore>0&&!profile.outOfCombat&&profile.minLevel<=player.level?Number(count) || 0:0);
    },0);
    this.setText('potion-count', format(healingSupplies));
    this.setText('talent-badge', player.skillPoints || 0);
    this.elements['talent-badge'].hidden = !(player.skillPoints > 0);
    const nearby = !this.inPvp&&game.started && !game.paused && typeof game.nearby === 'function' ? game.nearby() : null;
    this.elements['interact-prompt'].hidden = !nearby;
    if (nearby) this.elements['interact-prompt'].querySelector('span').textContent = nearby.label || 'Interagieren';
    const target=game.waypointTarget?.();
    this.setText('waypoint-text',target?`${target.label} · ${format(target.distance)} Schritte`:'Jenseits des Feuers wartet die Finsternis');
    document.getElementById('exploration-pill')?.classList.toggle('waypoint-active',!!target);
    const eventState=(game.world?.worldEvents || []).filter(event=>event.state==='active'||event.state==='success').map(event=>[event.id,event.state,event.objective?.label,Math.floor(event.objective?.progress || 0)]);
    const trackerState = JSON.stringify([game.questState || {},game.contracts,game.trackedQuestId,game.endgame,eventState]);
    if (force || trackerState !== this.lastTracker) { this.lastTracker = trackerState; this.renderTracker(); }
    const state = JSON.stringify([player.classId,player.level,player.skillPoints,player.gold,game.inventory,game.stash,game.itemFlags,game.loadouts,game.journey,game.endgame,game.waypoint,game.trackedQuestId,(game.worldEventSummary?.() || []).map(event=>[event.id,event.state,event.phase,event.stageIndex,event.objective?.label,Math.floor(event.objective?.progress || 0)]),game.equipment,game.generatedItems,game.resources,game.skills,game.learnedAbilities,game.abilityLoadout,game.questState,game.contracts,game.discovered,game.dungeonRecords,game.dungeonProgress,game.ledger,game.interactionState,this.dungeonId()]);
    if (force || state !== this.lastState) { this.lastState = state; if (this.activePanel && !['death','victory','reset','settings','party'].includes(this.activePanel)) this.renderPanel(); }
    this.updateParty();
    const now = performance.now();
    if (force || now - this.lastMapAt > 500) { this.lastMapAt = now; this.updateMinimap(); }
    const seconds = Number(game.time ?? game.elapsed ?? game.world?.time ?? 0);
    const minutes = Math.floor((8 * 60 + seconds / 3) % (24 * 60));
    this.setText('world-time', `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`);
    this.setText('world-weather', minutes < 600 ? 'Kalte Asche' : minutes < 1020 ? 'Fahles Licht' : minutes < 1200 ? 'Blutdämmerung' : 'Totenstille');
    const buffs=(game.buffs || []).filter(buff=>buff.expiresAt>game.time);
    const buffState=JSON.stringify(buffs.map(buff=>[buff.id,Math.ceil(buff.expiresAt-game.time)]));
    if(this.elements['world-effects']&&buffState!==this.lastBuffState){
      this.lastBuffState=buffState;
      this.elements['world-effects'].innerHTML=buffs.map(buff=>`<span title="${escape(this.statsText(buff.effects))}">${icon('flame')}${escape(buff.name)}<b>${Math.ceil(buff.expiresAt-game.time)}s</b></span>`).join('');
      this.elements['world-effects'].hidden=!buffs.length;
    }
    this.updateCooldowns(stats);
    const blocked=!game.started||Boolean(this.activePanel)||game.paused||this.inPvp&&game.pvp?.duel?.state!=='active';
    document.querySelector('.touch-controls').hidden=blocked;
    document.querySelector('.touch-controls').inert=blocked;
    document.body.classList.toggle('gameplay-blocked',blocked);
  }

  updateCooldowns(stats=this.game.stats()) {
    if(this.inPvp){this.updatePvpCooldowns();return;}
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

  pvpResult(duel) {
    const result={victory:'Du hast das Duell gewonnen.',defeat:'Das Duell geht an deinen Gegner.',draw:'Das Duell endet unentschieden.'}[duel.result] || 'Das Duell ist beendet.';
    return `<div class="pvp-result-card" role="dialog" aria-modal="true" aria-labelledby="pvp-result-title" aria-describedby="pvp-result-description"><span class="eyebrow">DUELL DER SCHATTEN · ABGESCHLOSSEN</span>${icon(duel.result==='victory'?'crown':duel.result==='draw'?'shield':'flame')}<h3 id="pvp-result-title">${result}</h3><p id="pvp-result-description">${escape(duel.opponentName || 'Dein Gegner')}${duel.reason?` · ${escape(duel.reason)}`:''}<br>Deine Reiseausrüstung, Erfahrung und Vorräte bleiben erhalten.</p><button class="primary-button" data-command="pvp-return">Zur Reise zurück ${icon('arrow')}</button><button class="text-button" data-panel="settings">Lautstärke einstellen</button><small>Automatische Rückkehr in ${Math.ceil(Math.max(0,duel.returnIn || 0))} Sekunden.</small></div>`;
  }

  duelLobby() {
    const pvp=this.game.pvp || {},rules=pvp.rules || PVP_RULES,duel=pvp.duel;
    if(duel&&this.inPvp)return `<section class="duel-lobby" id="pvp-lobby"><h3 class="section-title">${escape(rules.title)}</h3>${duel.state==='finished'?this.pvpResult(duel):'<p class="panel-note">Das Duell läuft in der Arena. Schließe dieses Fenster zum Kämpfen.</p>'}</section>`;
    const invites=pvp.invites || [],roster=(pvp.roster || []).filter(player=>player.id!==this.game.player?.id),online=this.network?.online || this.game.networkActive;
    return `<section class="duel-lobby" id="pvp-lobby"><div class="duel-lobby-heading">${icon('sword')}<div><span class="eyebrow">FREIWILLIG · ZWEI SPIELER</span><h3>${escape(rules.title)}</h3></div></div><p>${escape(rules.normalization)}</p><p class="duel-no-loss">${icon('shield')}${escape(rules.rewards)}</p><div class="duel-rule-actions">${rules.actions.map(action=>`<span>${escape(action.name)}${action.cost?` · ${action.cost} Mana`:''}</span>`).join('')}</div>${invites.length?`<div class="pvp-invites">${invites.map(invite=>`<article class="pvp-invite ${invite.outgoing?'outgoing':'incoming'}"><div><span class="eyebrow">${invite.outgoing?'DEINE EINLADUNG':'DU WURDEST EINGELADEN'}</span><h4>${escape(invite.outgoing?invite.toName:invite.fromName)}</h4><small>Noch <b data-pvp-invite-clock="${escape(invite.id)}">${Math.ceil(Math.max(0,invite.remaining || 0))}</b> Sekunden zum Antworten.</small></div><div>${invite.outgoing?'<button class="small-button" data-command="pvp-cancel">Einladung zurückziehen</button>':`<button class="small-button" data-command="pvp-accept" data-id="${escape(invite.id)}">Duell annehmen</button><button class="small-button subtle-button" data-command="pvp-decline" data-id="${escape(invite.id)}">Ablehnen</button>`}</div></article>`).join('')}</div>`:''}<div class="pvp-roster">${roster.map(player=>`<article><div>${icon(classIcons[player.classId] || 'shield')}<strong>${escape(player.name)}</strong><span>${escape(player.available?'Bereit':player.reason || 'Gerade nicht verfügbar')}</span></div><button class="small-button" data-command="pvp-invite" data-id="${escape(player.id)}" ${online&&player.available?'':'disabled'}>Zum Duell einladen</button></article>`).join('') || `<p class="panel-note">${online?'Ein weiterer Spieler in deiner Gruppe kann eine Einladung annehmen.':'Für freiwillige Duelle verbindet sich deine Gruppe mit dem Emberfall-Spielserver. Diese Spieladresse kann deine Einzelspieler-Reise bereitstellen.'}</p>`}</div>${pvp.lastResult?`<p class="pvp-last-result">Letztes Duell: ${escape({victory:'Sieg',defeat:'Niederlage',draw:'Unentschieden'}[pvp.lastResult.result] || 'Beendet')} · ${escape(pvp.lastResult.opponentName)}</p>`:''}</section>`;
  }

  async pvpCommand(name,id) {
    const methods={'pvp-invite':'pvpInvite','pvp-accept':'pvpAccept','pvp-decline':'pvpDecline','pvp-cancel':'pvpCancel','pvp-forfeit':'pvpForfeit','pvp-return':'pvpReturn'},method=this.game[methods[name]];
    if(typeof method!=='function')return;
    try{await (['pvp-invite','pvp-accept','pvp-decline'].includes(name)?method.call(this.game,id):method.call(this.game));this.update(true);}catch(error){this.showNotice(error.message || 'Das Duell konnte gerade nicht gestartet werden.','error');}
  }

  updatePvp() {
    const arena=this.inPvp,pvp=this.game.pvp || {},duel=pvp.duel,phase=duel?.state;
    document.body.classList.toggle('pvp-mode',arena);document.body.classList.toggle('pvp-finished',arena&&phase==='finished');
    if(arena&&!this.wasInPvp){for(const notice of this.notices)notice.remove();this.notices=[];}
    if(arena&&this.activePanel&&!(phase==='finished'&&['party','settings'].includes(this.activePanel))){this.closePanel();this.game.paused=false;}
    for(const button of document.querySelectorAll('button[data-panel]')){
      const blocked=arena&&!(phase==='finished'&&['party','settings'].includes(button.dataset.panel));
      if(blocked&&!button.dataset.pvpDisabled){button.dataset.pvpDisabled=String(button.disabled);button.disabled=true;}
      if(!blocked&&button.dataset.pvpDisabled!==undefined){button.disabled=button.dataset.pvpDisabled==='true';delete button.dataset.pvpDisabled;}
    }
    if(this.wasInPvp&&!arena){this.lastAbilityClass='';for(const button of document.querySelectorAll('.ability,.touch-ability'))button.disabled=false;}
    this.wasInPvp=arena;
    const opponent=(this.game.party || []).find(player=>player.id===duel?.opponentId);
    const digest=JSON.stringify([arena,phase,duel?.opponentName,Math.ceil(duel?.countdown || 0),Math.ceil(duel?.timeLeft || 0),Math.ceil(duel?.returnIn || 0),duel?.result,duel?.reason,Math.round(opponent?.hp || 0)]);
    const hud=this.elements['pvp-hud'];
    if(hud){hud.hidden=!arena||!duel;if(digest!==this.lastPvpHud){
      this.lastPvpHud=digest;const focusedCommand=hud.contains(document.activeElement)?document.activeElement.dataset.command:null;
      const remaining=Math.max(0,Math.ceil(duel?.timeLeft || 0)),clock=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
      hud.innerHTML=arena&&duel?`<div class="pvp-toolbar"><div class="pvp-match-title"><span>DUELL DER SCHATTEN</span><strong>${phase==='countdown'?'Bereit machen':phase==='finished'?'Duell beendet':clock}</strong><small>Gleiche Werte · 300 Leben / 100 Mana</small></div><div class="pvp-opponent"><span>DEIN GEGNER</span><strong>${escape(duel.opponentName)}</strong>${opponent?`<div class="pvp-opponent-health" aria-label="Gegnerleben ${format(opponent.hp)} von 300"><i style="width:${clamp(opponent.hp/300*100,0,100)}%"></i><b>${format(opponent.hp)} / 300</b></div>`:''}</div></div>${phase==='finished'?`<div class="pvp-result-shade">${this.pvpResult(duel)}</div>`:`<button class="small-button pvp-forfeit" data-command="pvp-forfeit">Duell aufgeben</button>`}${phase==='countdown'?`<div class="pvp-countdown" role="status"><span>Das Spiegelduell beginnt</span><strong>${Math.max(1,Math.ceil(duel.countdown || 0))}</strong><p>Wähle deinen Abstand. Beide beginnen mit identischen Werten.</p></div>`:''}`:'';
      if(focusedCommand)hud.querySelector(`[data-command="${focusedCommand}"]`)?.focus({preventScroll:true});
      else if(phase==='finished'&&this.lastPvpPhase!=='finished')requestAnimationFrame(()=>hud.querySelector('[data-command="pvp-return"]')?.focus({preventScroll:true}));
      this.lastPvpPhase=phase;
    }}
    const lobbyDigest=JSON.stringify([(pvp.roster || []).map(player=>[player.id,player.name,player.available,player.reason]),(pvp.invites || []).map(invite=>[invite.id,invite.fromName,invite.toName,invite.outgoing]),duel?.state,pvp.lastResult]);
    if(this.activePanel==='party'&&lobbyDigest!==this.lastPvpLobby){this.lastPvpLobby=lobbyDigest;this.renderPanel();}
    for(const element of document.querySelectorAll('[data-pvp-invite-clock]')){const invite=(pvp.invites || []).find(invite=>invite.id===element.dataset.pvpInviteClock);if(invite)element.textContent=Math.ceil(Math.max(0,invite.remaining || 0));}
  }

  updatePvpCooldowns() {
    const actions=this.game.pvp?.rules?.actions || PVP_RULES.actions,active=this.game.pvp?.duel?.state==='active',glyphs={attack:'sword',bolt:'bolt',nova:'nova',dash:'dash'};
    for(const button of document.querySelectorAll('.ability,.touch-ability')){
      const id=button.dataset.action || button.dataset.touchAction,action=actions.find(action=>action.id===id);
      if(!action){button.disabled=true;continue;}
      button.disabled=!active;button.querySelector('use')?.setAttribute('href',`#i-${glyphs[id]}`);
      const text=button.querySelector('span');if(text)text.textContent=button.classList.contains('touch-ability')?({attack:'Angriff halten',nova:'Risskreis',dash:'Rollen'}[id] || action.name):action.name;
      button.title=`${action.name} · ${action.cost} Mana · ${seconds(action.cooldown)} Sek. Erholung`;
      button.setAttribute('aria-label',`${action.name}, ${action.cost} Mana`);
      const cooldown=Number(this.game.cooldowns?.[id]) || 0;button.classList.toggle('is-cooling',cooldown>0);
      const cover=button.querySelector('.cooldown-cover');if(cover)cover.style.height=`${clamp(cooldown/action.cooldown*100,0,100)}%`;
    }
  }

  audioControls() {
    return `<section class="audio-settings"><div class="settings-row"><div><h3>Klänge der Welt</h3><p>Musik begleitet Region und Gefahr. Waffen, Schritte und Begegnungen erhalten eigene Effekte.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="sound" ${this.game.settings?.sound!==false?'checked':''}/>Ton an</label></div>${[['masterVolume','Gesamtlautstärke',.75,'Alle Klänge gemeinsam.'],['musicVolume','Musik',.45,'Atmosphäre und Kampfmusik.'],['effectsVolume','Effekte',.8,'Waffen, Fähigkeiten, Schritte und Beute.']].map(([key,label,fallback,description])=>{
      const value=clamp(this.game.settings?.[key] ?? fallback,0,1);
      return `<div class="volume-control"><label for="volume-${key}"><strong>${label}</strong><small>${description}</small></label><div><input id="volume-${key}" type="range" min="0" max="1" step=".01" value="${value}" data-setting="${key}" aria-valuetext="${Math.round(value*100)} Prozent"/><output id="${key}-value" for="volume-${key}">${Math.round(value*100)} %</output></div></div>`;
    }).join('')}<p class="panel-note">Deine Lautstärken bleiben gespeichert. „Ton an“ schaltet alle Klänge gemeinsam ein oder aus.</p></section>`;
  }

  renderTracker() {
    const quests = [...QUESTS.filter(quest => ['active','ready'].includes(this.game.questState?.[quest.id]?.status)),...(this.game.contracts?.active||[])].sort((a,b)=>Number(b.id===this.game.trackedQuestId)-Number(a.id===this.game.trackedQuestId));
    const event=(this.game.world?.worldEvents || []).find(event=>event.state==='active'||event.state==='success');
    const hunt=!event&&!this.game.trackedQuestId?this.game.endgameSummary?.()?.active?.[0]:null;
    const tracker=this.elements['quest-tracker']?.parentElement;
    tracker?.classList.toggle('tracker-expanded',!!this.trackerExpanded);
    const toggle=document.getElementById('tracker-toggle');toggle?.setAttribute('aria-expanded',String(!!this.trackerExpanded));
    const toggleLabel=document.getElementById('tracker-toggle-label');if(toggleLabel)toggleLabel.textContent=event?`Ereignis · ${event.name}`:hunt?`Jagd · ${hunt.name}`:quests[0]?.title || 'Chronik der Asche';
    this.elements['quest-tracker'].innerHTML = `${event?`<div class="tracked-event"><span>${event.state==='success'?'BELOHNUNG BEREIT':'EREIGNIS'}</span><h3>${escape(event.name)}</h3><p>${escape(event.objective?.label)}</p>${event.state==='active'?`<b>${format(event.objective?.progress)}/${format(event.objective?.goal)}</b>`:''}<button class="text-button" data-panel="adventures">Ereignis ansehen ${icon('arrow')}</button></div>`:''}${hunt?`<div class="tracked-hunt"><span>${hunt.ready?'JAGDBELOHNUNG BEREIT':'JAGDPFAD'}</span><h3>${escape(hunt.name)}</h3>${hunt.objectives.map(objective=>`<p class="${objective.current>=objective.count?'complete':''}">${escape(objective.name)}${objective.kind==='boss'?' · Bossform':''}${objective.minTier?` · Tiefe ${objective.minTier}+`:''}<b>${objective.current}/${objective.count}</b></p>`).join('')}<button class="text-button" data-command="open-hunts">Jagdziele ansehen ${icon('arrow')}</button></div>`:''}` + (quests.length ? quests.slice(0,event||hunt?1:3).map(quest => {
      const state = this.game.questState[quest.id]||quest;
      const isReady = state.status === 'ready' || quest.objectives.every((objective,index) => (state.counts?.[index] || 0) >= objective.count);
      const giver=quest.giver?NPCS.find(npc=>npc.id===quest.giver):this.game.contractGiver?.(quest.region);
      return `<div class="tracked-quest"><h3><span class="quest-diamond"></span>${escape(quest.title)}</h3>${isReady ? `<div class="quest-objective complete">${icon('check')}<span>Kehre zu ${escape(giver?.name||'deinem Auftraggeber')} zurück</span></div>` : quest.objectives.map((objective,index)=> `<div class="quest-objective ${(state.counts?.[index] || 0)>=objective.count?'complete':''}">${(state.counts?.[index] || 0)>=objective.count?icon('check'):'<span class="objective-dot"></span>'}<span>${escape(objective.label)} <b>${Math.min(state.counts?.[index] || 0,objective.count)}/${objective.count}</b></span></div>`).join('')}</div>`;
    }).join('') : event||hunt?'':`<div class="tracker-empty">Deine Geschichte beginnt hier.<small>Sprich mit Mira in Glutwacht. Folge den goldenen Zeichen auf deiner Karte.</small></div>`);
  }

  togglePanel(name) {
    if(this.inPvp&&!(this.game.pvp?.duel?.state==='finished'&&['party','settings'].includes(name))){this.showNotice('Während des Duells bleibt die Arena im Mittelpunkt.','info');return;}
    if (name === 'world') name = 'map';
    if (name === 'skills') name = 'talents';
    if (name === 'crafting') name = 'craft';
    if (this.activePanel === 'death' && this.game.player?.hp <= 0 && name !== 'death' && !this.inPvp) return;
    if (name === this.activePanel) { this.closePanel(); return; }
    if (!this.activePanel) this.previousFocus = document.activeElement;
    this.activePanel = name;
    this.pendingScrollReset=true;
    this.elements['panel-content'].scrollTop=0;
    for(const notice of this.notices)notice.remove();this.notices=[];
    if(name==='reset') this.pendingClass=this.game.player.classId || 'guardian';
    if (this.game.started) this.game.paused = true;
    this.game.keys?.clear();
    this.onInputReset?.();
    document.querySelector('.touch-controls').hidden=true;
    document.body.classList.add('gameplay-blocked','panel-open');
    this.elements['panel-overlay'].hidden = false;
    this.elements['world-hud'].classList.add('disabled');
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',groupFor(button.dataset.panel)?.id===groupFor(name)?.id));
    this.renderPanel();
    if(name==='party') this.refreshRooms();
    requestAnimationFrame(() => (name === 'death' ? this.elements['panel-content'].querySelector('button') : this.elements['close-panel'])?.focus({preventScroll:true}));
  }

  closePanel() {
    if (this.activePanel === 'death' && this.game.player?.hp <= 0 && !this.inPvp) return;
    const previous = this.activePanel;
    this.activePanel = null;
    document.body.classList.remove('panel-open');
    this.dialogueNPC = null;
    this.elements['panel-overlay'].hidden = true;
    this.elements['world-hud'].classList.remove('disabled');
    document.querySelectorAll('.nav-item').forEach(button=>button.classList.remove('active'));
    if (previous && this.game.started && this.game.player?.hp > 0) this.game.paused = false;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({preventScroll:true});
    else if (this.game.started) this.elements.world.focus({preventScroll:true});
    this.previousFocus = null;
  }

  renderPanel(allowFocusedSelect = false) {
    const name = this.activePanel;
    if (!name) return;
    if(this.panelPointers.size||!allowFocusedSelect&&document.activeElement?.matches?.('select')&&this.elements['game-panel'].contains(document.activeElement)){this.pendingPanelRender=true;return;}
    const focused = document.activeElement;
    const focusSearch = focused?.dataset?.uiSearch,focusDraft=focused?.dataset?.uiDraft;
    const focusFilter = focused?.dataset?.uiFilter;
    const selection = focusSearch||focusDraft ? [focused.selectionStart,focused.selectionEnd] : null;
    const resetScroll=this.pendingScrollReset||this.renderedPanel!==name;
    const scroll=resetScroll?0:this.elements['panel-content'].scrollTop;
    const focusId = focused?.dataset?.id;
    const focusCommand = document.activeElement?.dataset?.command;
    const titles = name === 'dialogue' ? [this.dialogueNPC?.name || 'Eine Begegnung',this.dialogueNPC?.role || ''] : name==='death' ? ['Die Glut lebt weiter','Auch die dunkelste Nacht endet.'] : name==='victory' ? ['Das erste Kapitel ist vollendet','Glutwacht hält stand. Jenseits des Feuers beginnt deine nächste Reise.'] : name==='reset' ? ['Ein neuer Anfang','Eine neue Reise ersetzt deinen gespeicherten Fortschritt.'] : panels[name] || panels.inventory;
    this.setText('panel-title', titles[0]);
    this.setText('panel-description', titles[1]);
    this.elements['close-panel'].hidden = name === 'death';
    const navigation=document.getElementById('panel-navigation'),group=groupFor(name);
    if(navigation){
      navigation.hidden=!group||this.inPvp;
      if(group)navigation.innerHTML=`<div class="menu-group-switcher">${menuGroups.map(entry=>`<button type="button" data-panel="${entry.panels[0][0]}" class="${entry.id===group.id?'active':''}" aria-pressed="${entry.id===group.id}">${icon(entry.icon)}${entry.name}</button>`).join('')}</div><div class="menu-section-switcher" role="group" aria-label="${group.name}">${group.panels.map(([id,label])=>`<button type="button" data-panel="${id}" class="${id===name?'active':''}" aria-pressed="${id===name}">${label}</button>`).join('')}</div>`;
    }
    const renderers = {inventory:()=>this.inventory(),character:()=>this.character(),talents:()=>this.talents(),craft:()=>this.craft(),journal:()=>this.journal(),map:()=>this.map(),party:()=>this.party(),dungeons:()=>this.dungeons(),settings:()=>this.settings(),bestiary:()=>this.bestiary(),journey:()=>this.journey(),adventures:()=>this.adventures(),interactions:()=>this.interactions(),dialogue:()=>this.dialogue(),death:()=>this.death(),victory:()=>this.victory(),reset:()=>this.resetConfirmation()};
    this.elements['panel-content'].innerHTML = (renderers[name] || renderers.inventory)();
    this.elements['game-panel'].dataset.panel=name;
    this.elements['panel-content'].scrollTop=scroll;
    this.renderedPanel=name;this.pendingScrollReset=false;
    if(resetScroll)requestAnimationFrame(()=>{if(this.activePanel===name)this.elements['panel-content'].scrollTop=0;});
    const restored = focusDraft?this.elements['panel-content'].querySelector(`[data-ui-draft="${focusDraft}"]`):focusSearch ? this.elements['panel-content'].querySelector(`[data-ui-search="${focusSearch}"]`) : focusFilter ? this.elements['panel-content'].querySelector(`[data-ui-filter="${focusFilter}"]`) : null;
    if(restored&&!resetScroll) { restored.focus({preventScroll:true});if(selection&&restored.setSelectionRange)restored.setSelectionRange(...selection); }
    if (name === 'map') this.drawMap(document.getElementById('full-map'), true);
    if (name === 'party') { this.lastPartyState=''; this.updateParty(); }
    if (!resetScroll&&focusId && focusCommand) {
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
    if(!['weapon','armor','charm'].includes(item.type)||this.game.equipment?.[equipmentSlot(item)]===item.id)return '';
    const currentId=this.game.equipment?.[equipmentSlot(item)],current=this.item(currentId),before=this.game.stats();
    const candidate=this.itemStats(item.id),old=this.itemStats(currentId);
    const preview=this.game.previewEquipment?.(item.id)||{before,after:Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(candidate),...Object.keys(old)])].map(key=>[key,(before[key]||0)+(candidate[key]||0)-(old[key]||0)]))};
    const changes=Object.keys(preview.after).filter(key=>Math.abs((preview.after[key]||0)-(preview.before[key]||0))>.00001);
    return `<div class="gear-comparison"><p>Ersetzt: <strong>${escape(current?.name||'Leerer Platz')}</strong></p><dl>${changes.map(key=>{const delta=(preview.after[key]||0)-(preview.before[key]||0);return `<div><dt>${escape(statLabels[key]||key)}</dt><dd>${statValue(key,preview.before[key])} <span aria-hidden="true">→</span> <strong>${statValue(key,preview.after[key])}</strong> <span class="${delta>0?'stat-better':'stat-worse'}">${delta>0?'+':''}${statValue(key,delta)}</span></dd></div>`;}).join('')||'<div><dt>Charakterwerte</dt><dd>Unverändert</dd></div>'}</dl></div>`;
  }

  itemRow(item, count, action = 'equip', shop = false) {
    if(!item)return '';
    const slot=equipmentSlot(item),equipped=this.game.equipment?.[slot]===item.id;
    const comparison = this.itemStats(this.game.equipment?.[equipmentSlot(item)]);
    const canBuy = (this.game.player?.gold || 0) >= item.price;
    const command = shop ? 'buy' : action==='stash' ? 'withdrawItem' : action === 'sell' ? 'sell' : item.type === 'consumable' ? 'consume' : action;
    const stats = this.game.stats();
    const seal=relicPresentation(item);
    const protectedItem=this.game.itemFlags?.[item.id]?.locked||this.game.itemFlags?.[item.id]?.favorite;
    const consumeProfile=getConsumableProfile(item);
    const consumeLevelLocked=Boolean(consumeProfile&&consumeProfile.minLevel>this.game.player.level);
    const consumeCombatLocked=Boolean(consumeProfile?.outOfCombat&&this.game.inCombat?.());
    const consumeCooling=Boolean(consumeProfile&&(this.game.cooldowns?.potion>0||this.game.cooldowns?.[consumeProfile.cooldownGroup]>0));
    const consumeDisabled=command==='consume'&&(consumeLevelLocked||consumeCombatLocked||consumeCooling||(!item.stats.hpRestore||this.game.player.hp>=stats.maxHp)&&(!item.stats.manaRestore||this.game.player.mana>=stats.mana));
    const requiredLevel=item.level||item.minLevel||1;
    const classIds=item.classIds||ITEM_BASES.find(base=>base.id===item.baseId)?.classIds;
    const classLocked=Array.isArray(classIds)&&!classIds.includes(this.game.player.classId);
    const levelLocked = command==='equip' && requiredLevel>this.game.player.level;
    const lockReason=classLocked?`Nur ${classIds.map(id=>getClass(id).name).join(', ')}`:levelLocked||consumeLevelLocked?`Benötigt Stufe ${requiredLevel}`:consumeCombatLocked?'Nur außerhalb des Kampfes':consumeCooling?'Erholt sich noch …':'';
    const generated = !!item.baseId;
    const itemStats = generated ? this.itemStats(item.id) : item.stats;
    const upgrade = item.upgrade || 0, upgradeCost = 8 + upgrade * 6;
    const gems = generated && (item.sockets || []).includes(null) ? Object.values(GEM_TYPES).filter(gem=>(this.game.resources?.[gem.id] || 0)>0) : [];
    const legendaryPower=generated?(item.affixes || []).filter(affix=>affix.legendary).map(affix=>`<div class="legendary-power"><span>LEGENDÄRE MACHT</span><strong>${escape(affix.name)}</strong><p>${Object.entries(affix.stats).map(([key,value])=>escape(describeStat(key,value))).join(' · ')}</p></div>`).join(''):'';
    const modifiers = generated ? `<details class="item-details"><summary>Affixe${item.sockets.length?` · ${item.sockets.length} Sockel`:''}${item.setId?' · Set':''}</summary><p>${escape(item.description)}</p>${item.affixes.map(affix=>`<div class="item-modifier ${affix.legendary?'legendary-modifier':''}"><strong>${escape(affix.name)}</strong><span>${Object.entries(affix.stats).map(([key,value])=>escape(describeStat(key,value))).join(' · ')}</span></div>`).join('')}${item.sockets.length?`<div class="socket-list">${item.sockets.map(gem=>`<span>${icon('gem')}${gem?escape(GEM_TYPES[typeof gem==='string'?gem:gem.id]?.name || 'Edelstein'):'Freier Sockel'}</span>`).join('')}</div>`:''}${item.setId?`<p class="set-description">${escape(SETS[item.setId]?.name)} · 2 Teile: ${this.statsText(SETS[item.setId]?.bonuses[2])} · 3 Teile: ${this.statsText(SETS[item.setId]?.bonuses[3])}</p>`:''}</details>` : '';
    const improve = generated && !shop && action==='equip' ? `<div class="item-improvement-actions"><button class="small-button" data-command="upgradeItem" data-id="${escape(item.id)}" ${upgrade>=10 || (this.game.resources?.dust || 0)<upgradeCost?'disabled':''}>${upgrade>=10?'Aufwertung +10':`Aufwerten · ${upgradeCost} Staub`}</button>${!equipped?`<button class="small-button subtle-button" data-command="salvage" data-id="${escape(item.id)}" ${this.game.itemFlags?.[item.id]?.locked||this.game.itemFlags?.[item.id]?.favorite?'disabled':''}>Zerlegen</button>`:''}${gems.map(gem=>`<button class="small-button" data-command="socket" data-id="${escape(item.id)}" data-gem="${gem.id}" title="${escape(this.statsText(scaleEquipmentStats(gem.stats,item)))}">${escape(gem.name)} sockeln</button>`).join('')}</div>` : '';
    return `<div class="item-row ${generated?'instanced-item':''} ${equipped?'is-equipped':''}"><div class="item-icon ${escape(item.rarity)}">${icon(itemIcon(item))}</div><div class="item-main"><h3>${escape(item.name)}${upgrade?` <span class="item-upgrade">+${upgrade}</span>`:''}</h3><p>${escape(rarityLabels[item.rarity] || item.rarity || 'Gewöhnlich')} · ${escape(EQUIPMENT_SLOTS.find(entry=>entry.id===slot)?.name || typeLabels[item.type])} · Stufe ${requiredLevel}${generated?`${item.dungeonTier>1?` · Tiefe ${item.dungeonTier}`:''} · Macht ${itemPower(item)}`:''}${classIds?` · ${escape(classIds.map(id=>getClass(id).name).join(' / '))}`:''}</p><p class="item-description">${this.statsText(itemStats)}</p>${legendaryPower}${seal?`<div class="relic-power" style="--seal-color:${seal.color}"><span class="eyebrow">SELTENE SIEGELWAFFE</span><h4>${escape(seal.name)}</h4><p>${escape(seal.effectText)}</p><details><summary>Fundort, Chance & Aufwertung</summary><p>${escape(seal.originText)}</p><p>${escape(seal.chanceText)}</p><p>${escape(seal.upgradeText)}</p></details></div>`:''}${!shop&&command==='equip'&&!equipped?this.equipmentComparison(item):''}${consumeProfile?`<p class="consumable-profile">${consumeProfile.outOfCombat?'Mahlzeit · außerhalb des Kampfes':'Trank'} · ${seconds(consumeProfile.cooldown)} Sek. Erholung</p>`:''}${lockReason?`<p class="equipment-lock">${icon('shield')}${escape(lockReason)}</p>`:''}${modifiers}${improve}</div><div class="item-actions">${shop ? `<button class="small-button" data-command="buy" data-id="${escape(item.id)}" ${canBuy?'':'disabled'}>${icon('coin')}${format(item.price)}</button>` : `${count>1?`<span class="item-count">×${count}</span>`:''}${equipped?`<span class="equipped-badge">ANGELEGT</span><button class="small-button subtle-button" data-command="unequip" data-id="${escape(equipmentSlot(item))}">Ablegen</button>`:`<button class="small-button" data-command="${command}" data-id="${escape(item.id)}" ${consumeDisabled||command==='sell'&&protectedItem||command==='withdrawItem'&&(!this.game.inSettlement?.()||this.game.inCombat?.())||command==='equip'&&(levelLocked||classLocked)?'disabled':''}>${command==='withdrawItem'?'Ins Gepäck':command==='consume'?'Nutzen':command==='sell'?`Verkaufen · ${Math.max(1,Math.floor(item.price*.4))}`:'Anlegen'}</button>`}`}</div></div>`;
  }

  inventory() {
    const tab=this.inventoryTab,stored=tab==='stash',source=stored?this.game.stash || {}:this.game.inventory || {},search=(this.inventorySearch || '').trim().toLocaleLowerCase('de-DE');
    const entries=Object.entries(source).filter(([id,count])=>count>0&&this.item(id));
    const tabs=`<div class="panel-tabs" role="group" aria-label="Inventarbereiche">${[['equipment','Ausrüstung'],['consumables','Vorräte'],['resources','Materialien'],['stash','Lager']].map(([id,label])=>`<button class="${tab===id?'active':''}" aria-pressed="${tab===id}" data-inventory-tab="${id}">${label}${id==='stash'?` · ${Object.keys(this.game.stash || {}).length}/120`:''}</button>`).join('')}</div>`;
    const filtered=entries.filter(([id])=>{
      const item=this.item(id),classes=item.classIds || ITEM_BASES.find(base=>base.id===item.baseId)?.classIds,flags=this.game.itemFlags?.[id] || {};
      return (stored||tab==='consumables'?stored||item.type==='consumable':item.type!=='consumable')
        &&(!search||`${item.name} ${item.description || ''} ${this.statsText(this.itemStats(id))}`.toLocaleLowerCase('de-DE').includes(search))
        &&(!this.inventoryType||this.inventoryType==='all'||equipmentSlot(item)===this.inventoryType||this.inventoryType==='consumable'&&item.type==='consumable')
        &&(!this.inventoryRarity||this.inventoryRarity==='all'||item.rarity===this.inventoryRarity)
        &&(!this.inventoryFlags||this.inventoryFlags==='all'||flags[this.inventoryFlags])
        &&(!this.inventoryUsable||((item.level || item.minLevel || 1)<=this.game.player.level&&(!classes||classes.includes(this.game.player.classId))));
    });
    const rarityOrder={common:0,uncommon:1,rare:2,epic:3,legendary:4};
    if(this.inventorySort==='power')filtered.sort((a,b)=>itemPower(this.item(b[0]))-itemPower(this.item(a[0])));
    if(this.inventorySort==='rarity')filtered.sort((a,b)=>(rarityOrder[this.item(b[0]).rarity] || 0)-(rarityOrder[this.item(a[0]).rarity] || 0));
    if(this.inventorySort==='name')filtered.sort((a,b)=>this.item(a[0]).name.localeCompare(this.item(b[0]).name,'de'));
    const pageSize=12,pages=Math.max(1,Math.ceil(filtered.length/pageSize));this.inventoryPage=Math.min(this.inventoryPage || 0,pages-1);
    const page=filtered.slice(this.inventoryPage*pageSize,(this.inventoryPage+1)*pageSize);
    if(!page.some(([id])=>id===this.inventorySelected))this.inventorySelected=page[0]?.[0] || null;
    const resources=Object.entries(RESOURCES).filter(([id,r])=>!search||`${r.name} ${r.description}`.toLocaleLowerCase('de-DE').includes(search)).map(([id,resource])=>`<div class="item-row resource-row"><div class="item-icon">${icon(resourceIcon(id))}</div><div class="item-main"><h3>${escape(resource.name)}</h3><p>${escape(resource.description)}</p></div><span class="item-count">${format(this.game.resources?.[id])}</span></div>`).join('');
    const activeFilters=[this.inventoryType&&this.inventoryType!=='all',this.inventoryRarity&&this.inventoryRarity!=='all',this.inventoryFlags&&this.inventoryFlags!=='all',this.inventoryUsable,this.inventorySort&&this.inventorySort!=='default'].filter(Boolean).length;
    const controls=`<div class="inventory-search-row"><label class="search-field"><span>${stored?'Lager':'Gepäck'} durchsuchen</span><input class="game-input" type="search" data-ui-search="inventorySearch" value="${escape(this.inventorySearch || '')}" placeholder="Name oder Eigenschaft …" autocomplete="off" /></label>${tab!=='resources'?`<button class="small-button inventory-filter-toggle" data-command="inventory-filters" aria-expanded="${!!this.inventoryFiltersOpen}" aria-controls="inventory-filters">${icon('settings')}Filter & Sortierung${activeFilters?` · ${activeFilters} aktiv`:''}</button>`:''}</div>${tab!=='resources'?`<div id="inventory-filters" class="inventory-filter-content inventory-toolbar compact-toolbar ${this.inventoryFiltersOpen?'expanded':''}"><label><span>Seltenheit</span><select class="game-input" data-ui-filter="inventoryRarity"><option value="all">Alle Seltenheiten</option>${Object.entries(rarityLabels).map(([id,label])=>`<option value="${id}" ${this.inventoryRarity===id?'selected':''}>${label}</option>`).join('')}</select></label><label><span>Sortieren</span><select class="game-input" data-ui-filter="inventorySort">${[['default','Fundreihenfolge'],['power','Höchste Macht'],['rarity','Seltenheit'],['name','Name A–Z']].map(([id,label])=>`<option value="${id}" ${this.inventorySort===id?'selected':''}>${label}</option>`).join('')}</select></label>${tab!=='consumables'?`<label><span>Ausrüstungsplatz</span><select class="game-input" data-ui-filter="inventoryType"><option value="all">Alle Plätze</option>${EQUIPMENT_SLOTS.map(slot=>`<option value="${slot.id}" ${this.inventoryType===slot.id?'selected':''}>${escape(slot.name)}</option>`).join('')}${stored?'<option value="consumable">Vorräte</option>':''}</select></label>`:''}<label><span>Markierungen</span><select class="game-input" data-ui-filter="inventoryFlags">${[['all','Alle Gegenstände'],['favorite','Favoriten'],['locked','Gesperrte Beute']].map(([id,label])=>`<option value="${id}" ${this.inventoryFlags===id?'selected':''}>${label}</option>`).join('')}</select></label><label class="usable-filter"><input type="checkbox" data-ui-filter="inventoryUsable" ${this.inventoryUsable?'checked':''} /> Für mich nutzbar</label></div>`:''}`;
    const cards=page.map(([id,count])=>{
      const item=this.item(id),slot=equipmentSlot(item),equipped=Object.values(this.game.equipment || {}).includes(id),flags=this.game.itemFlags?.[id] || {},level=item.level || item.minLevel || 1;
      return `<button type="button" class="item-grid-card ${escape(item.rarity || 'common')} ${this.inventorySelected===id?'selected':''} ${equipped?'equipped':''}" data-command="inspect-item" data-id="${escape(id)}" aria-pressed="${this.inventorySelected===id}" aria-label="${escape(item.name)}, ${escape(rarityLabels[item.rarity])}, Stufe ${level}${equipped?', angelegt':''}"><span class="grid-card-flags">${flags.favorite?icon('star'):''}${flags.locked?icon('lock'):''}</span><span class="grid-card-icon">${icon(itemIcon(item))}</span><strong>${escape(item.name)}</strong><span class="grid-card-meta">${escape(EQUIPMENT_SLOTS.find(s=>s.id===slot)?.name || 'Vorrat')} · ${level}</span><span class="grid-card-rarity">${escape(rarityLabels[item.rarity] || 'Gewöhnlich')}</span>${count>1?`<b class="grid-card-count">×${count}</b>`:''}${equipped?'<span class="grid-card-equipped">ANGELEGT</span>':''}</button>`;
    }).join('');
    const pagination=tab!=='resources'&&pages>1?`<div class="inventory-pagination"><button class="small-button" data-command="inventory-page" data-id="${this.inventoryPage-1}" ${this.inventoryPage===0?'disabled':''}>Zurück</button><span>${this.inventoryPage+1} / ${pages} · ${filtered.length} Gegenstände</span><button class="small-button" data-command="inventory-page" data-id="${this.inventoryPage+1}" ${this.inventoryPage===pages-1?'disabled':''}>Weiter</button></div>`:'';
    const ready=this.game.inSettlement?.()&&!this.game.inCombat?.();
    return `${tabs}${tab==='resources'?'':`<div class="equipment-belt" aria-label="Sieben Ausrüstungsplätze">${this.equipmentBelt()}</div>`}${controls}${stored?`<p class="storage-note ${ready?'ready':''}">${icon('bag')}${ready?'Lager geöffnet. Gegenstände können kostenlos eingelagert und entnommen werden.':'Lagertransfers benötigen eine sichere Siedlung außerhalb des Kampfes. Deine gelagerten Gegenstände bleiben hier sichtbar.'}</p>`:''}<div class="inventory-workbench"><div class="inventory-bag"><div class="bag-heading"><p class="results-count">${tab==='resources'?'Materialien':`${filtered.length} von ${entries.filter(([id])=>stored||tab==='consumables'?stored||this.item(id).type==='consumable':this.item(id).type!=='consumable').length} Gegenständen`}</p><span>${icon('coin')}${format(this.game.player.gold)}</span></div>${tab==='resources'?resources:`<div class="item-grid" id="inventory-grid">${cards || '<p class="empty-inventory">Keine passenden Gegenstände.<br><small>Ändere die Filter oder entdecke neue Beute in der Welt.</small></p>'}</div>${pagination}<p class="panel-note bag-hint">Wähle einen Gegenstand zum Vergleichen. Favoriten und gesperrte Beute sind vor Verkauf und Zerlegen geschützt.</p>`}</div>${tab==='resources'?`<aside class="material-guide"><h3 class="section-title">Verarbeite deine Beute</h3><p class="panel-note">Materialien fließen in Schmiederezepte, Tränke, Runen und Aufwertungen. Zerlegte Ausrüstung liefert Arkanstaub.</p><button class="small-button" data-panel="craft">${icon('craft')}Zur Werkbank</button></aside>`:`<aside class="inventory-inspector" id="inventory-inspector" aria-label="Gegenstandsdetails">${this.itemInspector(this.inventorySelected,stored)}</aside>`}</div>`;
  }

  itemInspector(id,stored=false) {
    const item=this.item(id);if(!item)return `<div class="inspector-empty">${icon('bag')}<h3>Dein nächster Fund wartet.</h3><p>Wähle Beute im Raster. Hier siehst du Werte, Voraussetzungen und den Vergleich mit deiner Ausrüstung.</p></div>`;
    const flags=this.game.itemFlags?.[id] || {},equipped=Object.values(this.game.equipment || {}).includes(id),ready=this.game.inSettlement?.()&&!this.game.inCombat?.();
    return `<div class="inspector-heading"><span class="eyebrow">${stored?'AUS DEINEM LAGER':'GEGENSTAND PRÜFEN'}</span><button class="text-button inspector-back" data-command="inspect-back">Zur Beute ↑</button></div>${this.itemRow(item,(stored?this.game.stash:this.game.inventory)?.[id] || 0,stored?'stash':'equip')}${stored?this.equipmentComparison(item):''}<div class="item-flag-actions"><button class="small-button ${flags.favorite?'selected':''}" data-command="item-flag" data-id="${escape(id)}" data-flag="favorite" aria-pressed="${!!flags.favorite}">${icon('star')}${flags.favorite?'Favorit':'Favorisieren'}</button><button class="small-button ${flags.locked?'selected':''}" data-command="item-flag" data-id="${escape(id)}" data-flag="locked" aria-pressed="${!!flags.locked}">${icon('lock')}${flags.locked?'Gesperrt':'Sperren'}</button></div>${!stored?`<button class="small-button stash-transfer" data-command="depositItem" data-id="${escape(id)}" ${ready&&!equipped?'':'disabled'}>${icon('bag')}Ins Lager legen</button>`:''}<p class="panel-note inspector-note">${equipped?'Diese Ausrüstung ist angelegt. Lege sie ab, bevor du sie einlagerst.':!ready?'Lagertransfers sind in einer sicheren Siedlung möglich.':'Lagern kostet kein Gold.'}${flags.locked||flags.favorite?' Dieser Gegenstand ist vor Verkauf und Zerlegen geschützt.':''}</p>`;
  }

  equipmentBelt() {
    return EQUIPMENT_SLOTS.map(slot=>{const item=this.item(this.game.equipment?.[slot.id]);return `<button class="gear-belt-slot ${item?escape(item.rarity):'empty'}" data-command="${item?'inspect-item':'open-equipment'}" data-id="${escape(item?.id || slot.id)}" title="${escape(slot.name)}: ${escape(item?.name || 'Noch unbesetzt')}">${icon(item?itemIcon(item):this.slotIcon(slot.id))}<span>${escape(slot.name)}</span></button>`;}).join('');
  }

  slotIcon(slot) {return {weapon:'sword',armor:'shield',charm:'gem',helmet:'helmet',gloves:'gloves',boots:'boots',ring:'ring'}[slot] || 'shield';}

  equipmentSlots() {
    return EQUIPMENT_SLOTS.map(({id:slot,name:label})=>{
      const item=this.item(this.game.equipment?.[slot]);
      return `<div class="equipment-slot ${item?'filled':'empty'}"><div class="item-icon ${escape(item?.rarity || '')}">${icon(item?itemIcon(item):this.slotIcon(slot))}</div><div class="item-main"><span class="slot-label">${label.toUpperCase()}</span><h3>${escape(item?.name || 'Noch unbesetzt')}</h3>${item?`<p>${this.statsText(this.itemStats(item.id))}</p>`:'<p>Finde passende Ausrüstung auf deinen Wegen.</p>'}</div>${item?`<button class="small-button subtle-button" data-command="unequip" data-id="${slot}" aria-label="${label} ablegen">Ablegen</button>`:`<button class="small-button" data-command="open-equipment" data-id="${slot}">Anlegen</button>`}</div>`;
    }).join('');
  }

  paperdoll() {
    const cls=getClass(this.game.player.classId);
    return `<div class="paperdoll" style="--hero-color:${cls.color}"><div class="paperdoll-figure" aria-hidden="true"><div class="hero-atlas-sprite" style="--sprite-y:${-192*Math.max(0,['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder'].indexOf(cls.id))}px"></div><span>${escape(cls.name)}</span></div>${EQUIPMENT_SLOTS.map(slot=>{const item=this.item(this.game.equipment?.[slot.id]);return `<div class="paper-slot paper-slot-${slot.id}"><span class="slot-label">${escape(slot.name)}</span><button class="${item?escape(item.rarity):'empty'}" type="button" data-command="${item?'inspect-item':'open-equipment'}" data-id="${escape(item?.id || slot.id)}" aria-label="${escape(slot.name)}: ${escape(item?.name || 'Noch unbesetzt')}">${icon(item?itemIcon(item):this.slotIcon(slot.id))}${item?'<i class="paper-equipped" aria-hidden="true"></i>':''}</button><strong>${escape(item?.name || 'Noch unbesetzt')}</strong></div>`;}).join('')}</div>`;
  }

  character() {
    const player=this.game.player || {},stats=this.game.stats(),cls=getClass(player.classId),xpNeeded=typeof this.game.xpNeeded==='function'?this.game.xpNeeded():this.game.xpNeeded || 100;
    const tabs=`<div class="panel-tabs" role="group" aria-label="Charakteransicht"><button class="${this.characterTab!=='build'?'active':''}" data-character-tab="equipment" aria-pressed="${this.characterTab!=='build'}">Ausrüstung & Werte</button><button class="${this.characterTab==='build'?'active':''}" data-character-tab="build" aria-pressed="${this.characterTab==='build'}">Kampfaufbau & Presets</button></div>`;
    const banner=`<div class="hero-heading"><div class="hero-class-seal" style="--hero-color:${cls.color}">${icon(classIcons[cls.id])}</div><div><span class="eyebrow">${escape(cls.role)} · STUFE ${player.level || 1} / ${MAX_LEVEL}</span><h3>${escape(player.name || 'Aren')} <small>${escape(cls.name)}</small></h3><p>${player.level>=MAX_LEVEL?'Höchste Stufe erreicht':`${format(player.xp)} / ${format(xpNeeded)} Erfahrung`} · ${format(player.skillPoints)} freie Talentpunkte</p></div><button class="small-button" data-panel="talents">${icon('tree')}Talente verteilen</button></div>`;
    if(this.characterTab==='build')return `${tabs}${banner}${this.buildOverview()}`;
    const groups=[['Offensive','sword',['damage','spellDamage','crit','lifeSteal']],['Überleben','shield',['maxHp','armor','mana','manaRegen']],['Bewegung & Nutzen','dash',['speed','cooldown','dodgeCooldown','gatherYield']]];
    return `${tabs}${banner}<div class="hero-equipment-layout"><section class="paperdoll-card"><p class="eyebrow">SIEBEN PLÄTZE · DEIN EIGENER WEG</p>${this.paperdoll()}<p class="panel-note">Wähle einen Platz, um seine Beute zu prüfen oder passende Ausrüstung zu suchen.</p></section><aside class="hero-stats">${groups.map(([name,glyph,values])=>`<section class="stat-group"><h3>${icon(glyph)}${name}</h3>${values.map(key=>`<div class="summary-stat"><span>${escape(statLabels[key])}</span><strong>${statValue(key,stats[key])}</strong></div>`).join('')}</section>`).join('')}<p class="panel-note">Die Gesamtwerte enthalten Ausrüstung, Setboni, Talente und aktive Gaben.</p></aside></div><div class="hero-progress-strip"><span>${icon('book')}${Object.values(this.game.questState || {}).filter(state=>state.status==='done').length} Questen erfüllt</span><span>${icon('map')}${(this.game.discovered || []).length} / ${REGIONS.length} Regionen erkundet</span><span>${icon('tree')}${getLearnedAbilities(this.game).length} / ${ABILITIES.filter(a=>a.classId===player.classId).length} Techniken erlernt</span><button class="text-button" data-panel="journey">Dein Vermächtnis ansehen ${icon('arrow')}</button></div>`;
  }

  buildOverview() {
    const cls=getClass(this.game.player.classId),stats=this.game.stats(),learned=getLearnedAbilities(this.game),safe=this.game.inSettlement?.()&&!this.game.inCombat?.();
    const slots=[...Object.entries(cls.abilities).map(([key,ability])=>({name:ability.name,key:key==='attack'?'J':key==='bolt'?'Q / 1':'F / 2',cost:ability.cost || 0,cooldown:ability.cooldown*(key==='attack'?1:1-(stats.cooldown || 0)),glyph:abilityIcon(ability,cls.id)})),...[0,1].map(slot=>{const ability=getAbility(this.game.abilityLoadout?.[slot]);return {name:ability?.name || 'Kein Skill belegt',key:String(slot+3),cost:ability?.cost || 0,cooldown:ability?.cooldown*(1-(stats.cooldown || 0)) || 0,glyph:ability?learnedIcon(ability):'tree',empty:!ability};})];
    const cost=20+this.game.player.level*5,invested=Object.values(this.game.skills || {}).some(rank=>rank>0);
    return `<h3 class="section-title">Dein Kampfstil</h3><div class="build-action-grid">${slots.map(slot=>`<article class="build-action ${slot.empty?'empty':''}"><kbd>${slot.key}</kbd>${icon(slot.glyph)}<h4>${escape(slot.name)}</h4><span>${slot.empty?'In Talenten einen Zusatzskill wählen':`${slot.cost} Mana · ${seconds(slot.cooldown)} Sek.`}</span></article>`).join('')}</div><div class="build-summary"><span>${learned.length} aktive Techniken erlernt</span><span>${Object.values(this.game.skills || {}).reduce((sum,rank)=>sum+Number(rank || 0),0)} Talentränge verteilt</span><button class="small-button" data-panel="talents">Fähigkeiten & Talente bearbeiten</button></div><h3 class="section-title">Gespeicherte Kampfaufbauten <small>${(this.game.loadouts || []).length} / 3</small></h3><p class="panel-note">Presets wechseln deine sieben Ausrüstungsplätze und die Zusatzskills 3 und 4. Deine verteilten Talentränge bleiben dabei bestehen.</p><div class="loadout-save"><label><span>Name des Aufbaus</span><input class="game-input" data-ui-draft="loadoutName" value="${escape(this.loadoutName || '')}" maxlength="28" placeholder="z. B. Bossjäger oder Seelenschutz" autocomplete="off" /></label><button class="small-button" data-command="save-loadout" ${(this.game.loadouts || []).length>=3?'disabled':''}>${icon('save')}Aktuellen Aufbau speichern</button></div><div class="loadout-list">${(this.game.loadouts || []).map(loadout=>{
      const missing=Object.values(loadout.equipment || {}).filter(id=>id&&!(this.game.inventory?.[id]>0));
      const problems=loadoutProblems(this.game,loadout);
      const unknown=(loadout.abilityLoadout || []).filter(id=>id&&!this.game.learnedAbilities?.[id]);
      return `<article class="saved-loadout ${problems.length?'incomplete':''}"><div><h4>${escape(loadout.name)}</h4><p>${Object.values(loadout.equipment || {}).filter(Boolean).length} Ausrüstungsteile · ${(loadout.abilityLoadout || []).map(id=>getAbility(id)?.name || 'Leerer Zusatzplatz').map(escape).join(' / ')}</p>${missing.length?`<p class="equipment-lock">Fehlt im Gepäck: ${missing.map(id=>escape(this.item(id)?.name || 'Verlorener Gegenstand')).join(', ')}</p>`:''}${unknown.length?`<p class="equipment-lock">Zusatzskills erneut lernen: ${unknown.map(id=>escape(getAbility(id)?.name || id)).join(', ')}</p>`:''}${!missing.length&&!unknown.length&&problems.length?`<p class="equipment-lock">${problems.map(escape).join(' · ')}</p>`:''}${this.game.inCombat?.()?'<p class="equipment-lock">Aufbauten außerhalb des Kampfes wechseln.</p>':''}</div><div><button class="small-button" data-command="applyLoadout" data-id="${escape(loadout.id)}" ${problems.length||this.game.inCombat?.()?'disabled':''}>Aufbau anlegen</button><button class="text-button" data-command="deleteLoadout" data-id="${escape(loadout.id)}">Löschen</button></div></article>`;
    }).join('') || '<p class="panel-note">Speichere einen Aufbau, um später zwischen Jagd, Bosskämpfen und Unterstützung zu wechseln.</p>'}</div><div class="respec-card"><div><h3>Deinen Weg neu wählen</h3><p>Passive Talentränge zurücksetzen und ihre investierten Punkte neu verteilen. Möglich in einer sicheren Siedlung außerhalb des Kampfes.</p></div><button class="small-button" data-command="respecTalents" ${safe&&invested&&this.game.player.gold>=cost?'':'disabled'}>${icon('coin')}${format(cost)} Gold · Neu verteilen</button></div>`;
  }

  talents() {
    const skills=this.game.availableSkills(),currentClass=getClass(this.game.player.classId);
    const branches=[...new Set(skills.map(skill=>skill.branch))],points=this.game.player?.skillPoints || 0;
    const tabs=`<div class="panel-tabs" role="group" aria-label="Fähigkeitsart"><button data-talent-tab="abilities" aria-pressed="${this.talentTab==='abilities'}" class="${this.talentTab==='abilities'?'active':''}">Aktive Fähigkeiten</button><button data-talent-tab="passives" aria-pressed="${this.talentTab==='passives'}" class="${this.talentTab==='passives'?'active':''}">Talentpfade</button></div>`;
    const header=`<div class="talent-header"><span>${escape(currentClass.name)} · Stufe ${this.game.player.level}</span><strong>${points} Talentpunkt${points===1?'':'e'} verfügbar</strong></div>`;
    if(this.talentTab==='abilities')return `${tabs}${header}${this.activeAbilities()}`;
    const selected=this.talentBranch && branches.includes(this.talentBranch)?this.talentBranch:'all';
    const navigation=`<div class="branch-tabs" role="group" aria-label="Talentzweige">${['all',...branches].map(branch=>`<button class="small-button ${selected===branch?'selected':''}" aria-pressed="${selected===branch}" data-talent-branch="${escape(branch)}">${branch==='all'?'Alle Pfade':escape(branch)}</button>`).join('')}</div>`;
    const visible=selected==='all'?branches:[selected];
    return `${tabs}${header}<p class="panel-note">Jeder Rang verstärkt deine Werte. Folge den verbundenen Talenten; Schlüsseltalente geben große Macht und verlangen einen Preis.</p>${navigation}<div class="talent-trees" style="--tree-columns:${Math.min(3,visible.length)}">${visible.map(branch=>`<section class="talent-tree"><div class="talent-branch-heading">${icon(branchIcons[branch] || classIcons[currentClass.id])}<h3>${escape(branch)}</h3></div><p>${escape(branchDescriptions[branch] || `Ein Pfad der Klasse ${currentClass.name}.`)}</p>${skills.filter(skill=>skill.branch===branch).map(skill=>{
      const rank=Number(this.game.skills?.[skill.id]) || 0,requires=skill.requires;
      const requirements=!requires?[]:Array.isArray(requires)?requires:[requires];
      const needed=requirement=>typeof requirement==='string'?skill.requiresRank || 1:requirement.rank || 1;
      const requirementMet=requirements.every(r=>(this.game.skills?.[typeof r==='string'?r:r.id] || 0)>=needed(r));
      const levelMet=this.game.player.level>=(skill.minLevel || 1),canLearn=requirementMet&&levelMet&&points>=skill.cost&&rank<skill.maxRank;
      const prerequisiteNames=requirements.map(r=>`${skills.find(entry=>entry.id===(typeof r==='string'?r:r.id))?.name || 'Vorgängertalent'} Rang ${needed(r)}`);
      const effects=[skill.effect,...(skill.secondaryEffects || [])].filter(Boolean);
      const modifiers=effects.map(effect=>`<span class="${effect.value<0?'stat-worse':'stat-better'}">${escape(statLabels[effect.stat] || effect.stat)} ${effect.value>0?'+':''}${statValue(effect.stat,effect.value)} pro Rang</span>`).join('');
      return `<article class="talent-node ${!requirementMet||!levelMet?'unavailable':''} ${rank?'learned':''} ${skill.keystone?'keystone':''}" data-talent-id="${escape(skill.id)}">${requirements.length?`<div class="talent-link" aria-hidden="true"></div>`:''}<div class="talent-node-top"><div class="item-icon">${icon(skill.keystone?'gem':branchIcons[branch] || classIcons[currentClass.id])}</div><div>${skill.keystone?'<span class="keystone-label">SCHLÜSSELTALENT</span>':''}<h4>${escape(skill.name)}</h4><span class="talent-node-rank">RANG ${rank} / ${skill.maxRank} · STUFE ${skill.minLevel || 1}</span></div></div><div class="rank-pips" aria-label="${rank} von ${skill.maxRank} Rängen">${Array.from({length:skill.maxRank},(_,i)=>`<i class="${i<rank?'filled':''}"></i>`).join('')}</div><p>${escape(skill.description)}</p>${modifiers?`<div class="talent-effects">${modifiers}</div>`:''}<button class="small-button" data-command="learn" data-id="${escape(skill.id)}" ${canLearn?'':'disabled'}>${rank>=skill.maxRank?'Meisterhaft':`Lernen · ${skill.cost} Punkt${skill.cost===1?'':'e'}`}</button>${!levelMet?`<span class="talent-requirement">Benötigt Stufe ${skill.minLevel}</span>`:''}${!requirementMet?`<span class="talent-requirement">Benötigt ${escape(prerequisiteNames.join(', '))}</span>`:''}${levelMet&&requirementMet&&rank<skill.maxRank&&points<skill.cost?`<span class="talent-requirement">Benötigt ${skill.cost} Talentpunkt${skill.cost===1?'':'e'}</span>`:''}</article>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  activeAbilities() {
    const stats=this.game.stats(),learned=getLearnedAbilities(this.game),abilities=ABILITIES.filter(ability=>ability.classId===this.game.player.classId);
    const branches=[...new Set(abilities.map(a=>a.branch || 'Klassentechniken'))];
    return `<p class="panel-note">Deine Basisfähigkeiten bleiben auf Q und F. Wähle zwei erlernte Techniken für die Plätze 3 und 4. Lernen verbraucht Talentpunkte; Belegen ist kostenlos.</p><div class="ability-loadout">${[0,1].map(slot=>`<label class="loadout-slot"><span><kbd>${slot+3}</kbd> PLATZ ${slot+3} · ${this.game.abilityLoadout?.[slot]?'BELEGT':'FREI'}</span><select class="game-input" data-ability-loadout="${slot}" aria-label="Fähigkeit auf Platz ${slot+3}"><option value="">Keine Fähigkeit</option>${learned.map(ability=>`<option value="${ability.id}" ${this.game.abilityLoadout?.[slot]===ability.id?'selected':''}>${escape(ability.name)}</option>`).join('')}</select></label>`).join('')}</div>${branches.map(branch=>`<section class="active-branch"><h3 class="section-title">${escape(branch)}<small>${abilities.filter(a=>(a.branch || 'Klassentechniken')===branch).filter(a=>this.game.learnedAbilities?.[a.id]).length} / ${abilities.filter(a=>(a.branch || 'Klassentechniken')===branch).length} erlernt</small></h3><div class="learnable-abilities">${abilities.filter(a=>(a.branch || 'Klassentechniken')===branch).sort((a,b)=>a.level-b.level).map(ability=>{
      const known=Boolean(this.game.learnedAbilities?.[ability.id]),check=canLearnAbility(this.game,ability.id),required=ability.requires?getAbility(ability.requires):null;
      const occupied=(this.game.abilityLoadout || []).findIndex(id=>id===ability.id);
      return `<article class="learnable-ability ${known?'learned':check.ok?'learnable':'locked'}"><div class="learnable-heading"><div class="item-icon">${icon(learnedIcon(ability))}</div><div><h3>${escape(ability.name)}</h3><span class="ability-state">${known?occupied>=0?`ERLERNT · AUF PLATZ ${occupied+3}`:'ERLERNT':check.ok?'LERNBAR':this.game.player.level<ability.level?`AB STUFE ${ability.level}`:'VORAUSSETZUNG FEHLT'}</span></div></div><p>${escape(ability.description)}</p><div class="ability-facts"><span>Stufe ${ability.level}</span><span>${ability.cost} Mana</span><span>${seconds(ability.cooldown*(1-stats.cooldown))} Sek. Abklingzeit</span>${required?`<span>Benötigt ${escape(required.name)}</span>`:''}</div>${known?`<div class="ability-equip-actions">${[0,1].map(slot=>`<button class="small-button ${occupied===slot?'subtle-button':''}" data-command="assign-ability" data-id="${ability.id}" data-slot="${slot}" ${occupied===slot?'disabled':''}>${occupied===slot?`Auf ${slot+3} belegt`:`Auf ${slot+3} belegen`}</button>`).join('')}</div>`:`<button class="small-button" data-command="learnAbility" data-id="${ability.id}" ${check.ok?'':'disabled'}>Lernen · ${ability.talentCost} Talentpunkt${ability.talentCost===1?'':'e'}</button>${!check.ok?`<p class="talent-requirement">${escape(check.reason)}</p>`:''}`}</article>`;
    }).join('')}</div></section>`).join('')}`;
  }

  craft() {
    const classId=this.game.player.classId,level=this.game.player.level;
    const relevant=RECIPES.filter(recipe=>!recipe.classIds||recipe.classIds.includes(classId));
    const recipes=this.craftFilter==='all'?relevant:this.craftFilter==='ready'?relevant.filter(r=>(r.minLevel || 1)<=level&&canCraftJourneyRecipe(this.game,r).ok&&Object.entries(r.ingredients).every(([id,n])=>(this.game.resources?.[id] || 0)>=n)):relevant.filter(recipe=>(recipe.minLevel || 1)<=level+10);
    return `<div class="craft-toolbar"><p class="panel-note">Deine Klasse: ${escape(getClass(classId).name)} · Stufe ${level}. Materialien und Stufenvoraussetzungen gelten für jedes Rezept.</p><label><span>Rezepte anzeigen</span><select class="game-input" data-ui-filter="craftFilter">${[['available','Verfügbar & nächste Stufen'],['ready','Jetzt herstellbar'],['all','Alle Rezepte meiner Klasse']].map(([id,label])=>`<option value="${id}" ${this.craftFilter===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="craft-layout">${recipes.map(recipe=>{
      const output=ITEMS[recipe.output],requiredLevel=recipe.minLevel || 1;
      const enough=Object.entries(recipe.ingredients).every(([id,amount])=>(this.game.resources?.[id] || 0)>=amount),levelMet=level>=requiredLevel,journeyGate=canCraftJourneyRecipe(this.game,recipe);
      return `<article class="recipe ${!levelMet?'recipe-locked':''}"><div class="recipe-top"><div class="item-icon ${escape(output?.rarity)}">${icon(itemIcon(output))}</div><div><h3>${escape(recipe.name)}</h3><p>${escape(recipe.description)}</p></div></div><p class="recipe-output-stats">${this.statsText(output?.stats)}</p><div class="ingredients">${Object.entries(recipe.ingredients).map(([id,amount])=>`<span class="ingredient ${(this.game.resources?.[id] || 0)<amount?'missing':''}">${escape(RESOURCES[id]?.name || id)} ${format(this.game.resources?.[id])}/${amount}</span>`).join('')}</div><div class="recipe-actions"><span class="recipe-level">${recipe.amount || 1} × ${escape(output?.name)}<small>Ab Stufe ${requiredLevel}${recipe.profession?` · ${escape(recipe.profession)}`:''}</small></span><button class="small-button" data-command="craft" data-id="${escape(recipe.id)}" ${enough&&levelMet&&journeyGate.ok?'':'disabled'}>${levelMet?'Herstellen':`Stufe ${requiredLevel} benötigt`} ${icon('craft')}</button></div>${!journeyGate.ok?`<p class="talent-requirement">${escape(journeyGate.reason)}</p>`:''}</article>`;
    }).join('') || '<p class="panel-note">Für diesen Filter sind keine Rezepte verfügbar. Sammle weitere Materialien oder zeige alle Rezepte an.</p>'}</div><p class="panel-note">Sammle Holz an Bäumen, Erz an Felsen und Mondkraut auf den Lichtungen. Glutkristalle findest du in den Fernlanden. Zerlege Ausrüstung für Arkanstaub.</p>`;
  }

  bestiary() {
    const species=Object.entries(ENEMY_TYPES).filter(([,enemy])=>enemy.species===true);
    const search=(this.bestiarySearch || '').trim().toLocaleLowerCase('de-DE');
    const families=[...new Set(species.map(([,enemy])=>enemy.family || 'Weitere Kreaturen'))].sort((a,b)=>a.localeCompare(b,'de'));
    const filtered=species.filter(([id,enemy])=>(!search||`${enemy.name} ${familyLabels[enemy.family] || enemy.family || ''} ${enemy.description || ''} ${enemy.archetype || ''}`.toLocaleLowerCase('de-DE').includes(search))&&(!this.bestiaryFamily||this.bestiaryFamily==='all'||(enemy.family || 'Weitere Kreaturen')===this.bestiaryFamily));
    const pageSize=12,pages=Math.max(1,Math.ceil(filtered.length/pageSize));this.bestiaryPage=Math.min(this.bestiaryPage || 0,pages-1);
    const seen=species.filter(([id])=>(this.game.ledger?.[`kill:${id}`] || 0)>0).length;
    const controls=`<div class="bestiary-banner"><div>${icon('skull')}<span>BEOBACHTETE KREATUREN</span><strong>${seen} / ${species.length}</strong></div><p>Jede Art trägt eine eigene Kampftaktik. Bossformen verstärken ihre Macht und belohnen dich mit wertvollerer Beute.</p></div><div class="inventory-toolbar bestiary-toolbar"><label class="search-field"><span>Bestiarium durchsuchen</span><input class="game-input" type="search" data-ui-search="bestiarySearch" value="${escape(this.bestiarySearch || '')}" placeholder="Kreatur, Familie oder Taktik …" autocomplete="off" /></label><label><span>Kreaturenfamilie</span><select class="game-input" data-ui-filter="bestiaryFamily"><option value="all">Alle Familien</option>${families.map(family=>`<option ${this.bestiaryFamily===family?'selected':''} value="${escape(family)}">${escape(familyLabels[family] || family)}</option>`).join('')}</select></label></div><p class="results-count">${filtered.length} Arten · ${species.filter(([,e])=>e.bossType).length} Bossformen</p>`;
    const cards=filtered.slice(this.bestiaryPage*pageSize,(this.bestiaryPage+1)*pageSize).map(([id,enemy])=>{
      const kills=this.game.ledger?.[`kill:${id}`] || 0,boss=enemy.bossType?ENEMY_TYPES[enemy.bossType]:null;
      const pattern=enemy.combat?.pattern || enemy.archetype || (enemy.ranged?'ranged':'melee');
      const regions=(enemy.regions || []).map(r=>REGIONS.find(entry=>entry.id===r)).filter(Boolean);
      const color=/^#[\da-f]{3,8}$/i.test(enemy.color || '')?enemy.color:'#bd8570';
      return `<article class="bestiary-card ${kills?'encountered':''}"><div class="bestiary-card-heading"><div class="creature-seal" style="--creature-color:${color}">${icon(enemy.ranged?'bolt':/ghost|spirit|shade|wraith/.test(id)?'gem':'skull')}</div><div><span class="eyebrow">${escape(familyLabels[enemy.family] || enemy.family || 'Kreatur der Asche')}</span><h3>${escape(enemy.name)}</h3><small>${escape(combatPatterns[pattern] || pattern)}</small></div></div><p>${escape(enemy.description || 'Eine Kreatur der verwüsteten Lande. Beobachte ihre Angriffe und nutze die Lücken zwischen ihren Schlägen.')}</p><div class="creature-traits">${(enemy.traits || []).map(trait=>`<span>${escape(traitLabels[trait] || trait)}</span>`).join('')}${regions.map(region=>`<span>${escape(region.name)} · ${region.level}+</span>`).join('')}</div><div class="bestiary-kills"><span>${kills?`${format(kills)} besiegt`:'Noch nicht besiegt'}</span>${boss?`<details><summary>${icon('crown')}Bossform</summary><strong>${escape(boss.name)}</strong><p>Ein mächtiger Widersacher mit verstärkter Kampftaktik.${(this.game.ledger?.[`kill:${enemy.bossType}`] || 0)>0?` ${format(this.game.ledger[`kill:${enemy.bossType}`])} besiegt.`:''}</p></details>`:''}</div></article>`;
    }).join('');
    return `${controls}<div class="bestiary-grid">${cards || '<p class="panel-note">Keine Kreaturen für diesen Filter.</p>'}</div>${pages>1?`<div class="inventory-pagination"><button class="small-button" data-command="bestiary-page" data-id="${this.bestiaryPage-1}" ${this.bestiaryPage===0?'disabled':''}>Zurück</button><span>${this.bestiaryPage+1} / ${pages} · ${filtered.length} Arten</span><button class="small-button" data-command="bestiary-page" data-id="${this.bestiaryPage+1}" ${this.bestiaryPage===pages-1?'disabled':''}>Weiter</button></div>`:''}`;
  }

  interactions() {
    const summary=this.game.interactionSummary?.() || [],nearby=this.game.nearby?.();
    const objects=this.game.world?.interactions || [],nearest=objects.filter(object=>!object.used).map(object=>({object,distance:Math.hypot(object.x-this.game.player.x,object.y-this.game.player.y)})).sort((a,b)=>a.distance-b.distance).slice(0,4);
    const buffs=(this.game.buffs || []).filter(buff=>buff.expiresAt>this.game.time);
    return `<div class="interaction-intro">${icon('relic')}<p>Untersuche die Spuren einer zerbrochenen Welt. Manche Orte schenken Macht, andere fordern einen Kampf. Stelle dich neben ein Objekt und drücke <kbd>E</kbd> oder nutze „Entdecken“ auf dem Touchscreen.</p></div>${nearby?.kind==='worldObject'?`<div class="nearby-object"><span class="eyebrow">IN DEINER NÄHE</span><h3>${escape(nearby.label)}</h3><button class="small-button" data-command="world-object" data-id="${escape(nearby.object?.id)}">${icon('relic')}Interagieren</button></div>`:''}${buffs.length?`<h3 class="section-title">Aktive Gaben</h3><div class="boon-list">${buffs.map(buff=>`<div><strong>${escape(buff.name)}</strong><span>${Math.ceil(buff.expiresAt-this.game.time)} Sek.</span><p>${this.statsText(buff.effects)}</p></div>`).join('')}</div>`:''}<div class="interaction-grid">${summary.map(entry=>`<article class="interaction-card"><div class="interaction-card-heading">${icon(/altar|shrine|well/.test(entry.kind)?'flame':/chest|cache/.test(entry.kind)?'bag':/trap/.test(entry.kind)?'sword':'relic')}<h3>${escape(entry.name)}</h3></div><p>${escape(entry.description)}</p><div class="summary-stat"><span>Erkundet</span><strong>${format(entry.completed)} / ${format(entry.total)}</strong></div><div class="discovery-progress" aria-hidden="true"><i style="width:${entry.total?clamp(entry.completed/entry.total*100,0,100):0}%"></i></div></article>`).join('') || '<p class="panel-note">Die Spuren der Asche erwarten dich in der offenen Welt.</p>'}</div>${nearest.length?`<h3 class="section-title">Spuren in deiner Nähe</h3><div class="nearby-list">${nearest.map(({object,distance})=>`<div><span>${escape(object.name || summary.find(entry=>entry.kind===object.kind)?.name || 'Unerkundete Spur')}</span><strong>${format(distance)} Schritte</strong></div>`).join('')}</div>`:''}`;
  }

  journeyRequirement(requirement) {
    const labels={events:'Weltabenteuer abgeschlossen',explored:'Regionen erkundet',rescued:'Reisende befreit',lore:'Chroniken gelesen',bosses:'Bossarten besiegt',dungeons:'Dungeons beendet',puzzles:'Dungeonrätsel gelöst',crafted:'Verschiedene Rezepte gefertigt',contracts:'Regionale Verträge erfüllt',revives:'Gefährten wiederbelebt',coopDungeons:'Gemeinsame Dungeons',encounters:'Verfluchte Vorräte geborgen'};
    if(requirement.kind==='faction')return `${requirement.any?'Ruf bei einem Bund':FACTIONS.find(f=>f.id===requirement.factionId)?.name || 'Fraktionsruf'}`;
    const targets=(requirement.targets || []).map(id=>REGIONS.find(r=>r.id===id)?.name || DUNGEONS.find(d=>d.id===id)?.name || ENEMY_TYPES[id]?.name || id);
    return `${labels[requirement.kind] || requirement.kind}${targets.length?` · ${targets.join(', ')}`:''}`;
  }

  journeyReward(reward) {
    return [reward.gold?`${format(reward.gold)} Gold`:null,reward.xp?`${format(reward.xp)} EP`:null,reward.skillPoints?`${reward.skillPoints} Talentpunkt${reward.skillPoints===1?'':'e'}`:null,...Object.entries(reward.resources || {}).map(([id,n])=>`${n} ${RESOURCES[id]?.name || id}`)].filter(Boolean).map(escape).join(' · ');
  }

  hunts() {
    const summary=this.game.endgameSummary?.() || {tokens:0,totalClaims:0,active:[],offers:[],rewards:[]},level=this.game.player.level,safe=this.game.inSettlement?.()&&!this.game.inCombat?.(),filter=this.huntFilter || 'current';
    const offers=summary.offers.filter(hunt=>!hunt.active&&(filter==='all'||filter==='solo'&&hunt.partyRequired===1||filter==='current'&&hunt.maxLevel>=level&&hunt.minLevel<=level+15));
    const targets=hunt=>hunt.objectives.map((objective,index)=>`<div class="${(objective.current || 0)>=objective.count?'complete':''}"><span>${icon(objective.kind==='dungeon'?'portal':objective.kind==='boss'?'crown':'sword')}${escape(objective.name)}${objective.kind==='boss'?' · Bossform':''}${objective.minTier?` · Abschluss auf Tiefe ${objective.minTier}+`:''}</span><b>${objective.current ?? hunt.counts?.[index] ?? 0}/${objective.count}</b></div>`).join('');
    return `<div class="hunt-intro"><div><span class="eyebrow">JAGD, DUNGEONS & GESICHERTE BEUTE</span><h3>Wähle eine Route, die deinen Aufbau stärkt.</h3><p>Bis zu zwei Jagden zugleich. Ihr Fortschritt bleibt gespeichert; abgeschlossene Pfade lassen sich erneut annehmen. Du entscheidest, wann du weiterziehst.</p></div><div class="hunt-token-counter">${icon('gem')}<strong>${format(summary.tokens)}</strong><span>JAGDSIEGEL</span><small>${format(summary.totalClaims)} Jagden vollendet</small></div></div><p class="hunt-tier-note">Für Ziele auf Tiefe 2+ beende zuerst Tiefe 1, um die nächste Tiefe freizuschalten. Beende den Dungeon anschließend auf der geforderten Tiefe.</p><h3 class="section-title">Deine angenommenen Jagden <small>${summary.active.length} / 2</small></h3><div class="hunt-active-grid">${summary.active.map(hunt=>`<article class="hunt-card ${hunt.ready?'ready':''}"><span class="eyebrow">${hunt.ready?'BELOHNUNG BEREIT':'AUF DEINEM WEG'} · ${escape(REGIONS.find(region=>region.id===hunt.region)?.name)}</span><h3>${escape(hunt.name)}</h3><div class="journey-objectives">${targets(hunt)}</div><p class="journey-reward">${hunt.reward.tokens} Jagdsiegel · ${hunt.reward.dust} Arkanstaub</p><div class="hunt-actions">${hunt.ready?`<button class="small-button" data-command="claimHunt" data-id="${hunt.id}">${icon('gem')}Jagd abschließen</button>`:`<button class="small-button" data-command="waypoint" data-kind="${escape(hunt.waypoint.kind)}" data-id="${escape(hunt.waypoint.id)}">${icon('marker')}Route markieren</button>`}<button class="text-button" data-command="abandonHunt" data-id="${hunt.id}" title="Der Fortschritt dieser angenommenen Jagd wird verworfen.">Jagd aufgeben</button></div></article>`).join('') || '<p class="panel-note">Nimm einen Jagdpfad an. Erst dann zählen seine Ziele für deine Belohnung.</p>'}</div><div class="hunt-offers-heading"><h3 class="section-title">Dein nächster Pfad</h3><label><span>Jagdangebote</span><select class="game-input" data-ui-filter="huntFilter">${[['current','Meine Stufe & nächste Ziele'],['solo','Allein spielbare Pfade'],['all','Alle Jagdpfade']].map(([id,label])=>`<option value="${id}" ${filter===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="hunt-offers-grid">${offers.map(hunt=>`<article class="hunt-card ${hunt.eligible?'available':'locked'}"><span class="eyebrow">STUFE ${hunt.minLevel}–${hunt.maxLevel} · ${hunt.partyRequired>1?`${hunt.partyRequired} GEFÄHRTEN IM DUNGEON`:'ALLEIN ODER GEMEINSAM'}</span><h3>${escape(hunt.name)}</h3><p>${escape(hunt.description)}</p><div class="journey-objectives">${targets(hunt)}</div><p class="journey-reward">${hunt.reward.tokens} Jagdsiegel · ${hunt.reward.dust} Arkanstaub</p><button class="small-button" data-command="startHunt" data-id="${hunt.id}" ${hunt.eligible&&summary.active.length<2?'':'disabled'}>${!hunt.eligible?level<hunt.minLevel?`Ab Stufe ${hunt.minLevel}`:'Wähle einen höherstufigen Pfad':summary.active.length>=2?'Zwei Jagden bereits angenommen':'Jagd annehmen'}</button>${hunt.runs?`<small class="hunt-runs">${format(hunt.runs)} Mal vollendet</small>`:''}</article>`).join('') || '<p class="panel-note">Zeige alle Pfade an, um kommende Jagden zu sehen.</p>'}</div><h3 class="section-title">Jagdsiegel in Beute verwandeln</h3><p class="panel-note">Gesicherte Beute für ${escape(getClass(this.game.player.classId).name)}. Deine Jagderfolge schalten Beutestufen frei: ${summary.rewardLevel>0?`bis Stufe ${summary.rewardLevel}`:'noch keine Jagd abgeschlossen'}. Die Auswahl zeigt dir den Ausrüstungsplatz und die Seltenheit. Tausch ist in einer sicheren Siedlung außerhalb des Kampfes möglich.</p><div class="hunt-rewards-grid">${summary.rewards.map(reward=>{
      const full=reward.slot&&this.game.bagUsed?.()>=240,lootLevel=reward.level ?? summary.rewardLevel ?? 0;
      const unlockReason=level<reward.minLevel?`Benötigt Charakterstufe ${reward.minLevel}.`:reward.slot&&lootLevel<reward.minLevel?`Schließe anspruchsvollere Jagden ab, um Beutestufe ${reward.minLevel} freizuschalten.`:summary.tokens<reward.cost?`Noch ${reward.cost-summary.tokens} Jagdsiegel bis zu dieser Belohnung.`:'';
      return `<article class="hunt-reward ${escape(reward.rarity || 'common')}"><div class="item-icon ${escape(reward.rarity || '')}">${icon(reward.slot?this.slotIcon(reward.slot):'gem')}</div><div><span class="eyebrow">${reward.slot?`${escape(EQUIPMENT_SLOTS.find(slot=>slot.id===reward.slot)?.name)} · ${escape(rarityLabels[reward.rarity])}`:'AUFWERTUNGSMATERIAL'}</span><h3>${escape(reward.name)}</h3><p>${escape(reward.description.replace('Keine Siegel-Lotterie.','').replace('deiner aktuellen Stufe',lootLevel>0?`der freigeschalteten Stufe ${lootLevel}`:'einer durch Jagderfolge freigeschalteten Stufe'))}</p><small>Ab Charakterstufe ${reward.minLevel}${reward.slot?lootLevel>0?` · Beutestufe ${lootLevel}`:' · Jagderfolg erforderlich':''}</small></div><button class="small-button" data-command="redeemHuntReward" data-id="${reward.id}" ${reward.affordable&&safe&&!full?'':'disabled'}>${icon('gem')}${reward.cost} Jagdsiegel · Erhalten</button>${full?'<p class="equipment-lock">Schaffe zuerst einen freien Platz im Gepäck.</p>':unlockReason?`<p class="equipment-lock">${escape(unlockReason)}</p>`:''}</article>`;
    }).join('')}</div><div class="hunt-seal-note">${icon('gem')}<p>Jagdbeute gibt dir einen verlässlichen Weg zu Waffen und Rüstung. Seltene Mond- und Sternensiegel können auf geeigneten Waffenfunden von Gegnern und Bossen erscheinen. Im Gegenstandsinspektor stehen ihre Wirkung, Herkunft und genaue Fundchance.</p></div>`;
  }

  journey() {
    const state=this.game.journey || {},tab=this.journeyTab || 'factions',unlocks=getJourneyUnlocks(this.game);
    const tabs=`<div class="panel-tabs" role="group" aria-label="Reisefortschritt">${[['factions','Drei Bündnisse'],['hunts','Jagdziele & Beute'],['achievements',`Errungenschaften · ${(state.claimed || []).length}/${ACHIEVEMENTS.length}`],['companions',`Gefährten · ${(state.ownedCompanions || []).length}/${COMPANIONS.length}`]].map(([id,label])=>`<button class="${tab===id?'active':''}" aria-pressed="${tab===id}" data-journey-tab="${id}">${label}</button>`).join('')}</div>`;
    if(tab==='hunts')return `${tabs}${this.hunts()}`;
    if(tab==='achievements')return `${tabs}<p class="panel-note">Deine Taten hinterlassen Spuren. Jede Errungenschaft vergibt ihre Belohnung einmal; verschiedene Entdeckungen zählen, wiederholte Kämpfe am selben Ort nicht.</p><div class="achievement-grid">${ACHIEVEMENTS.map(achievement=>{
      const progress=getAchievementProgress(this.game,achievement.id),check=canClaimAchievement(this.game,achievement.id);
      return `<article class="achievement-card ${progress.claimed?'claimed':progress.complete?'ready':''}"><div class="achievement-heading">${icon(progress.claimed?'check':'crown')}<div><span class="eyebrow">${progress.claimed?'ERFÜLLT':progress.complete?'BELOHNUNG BEREIT':`STUFE ${achievement.minLevel}+`}</span><h3>${escape(achievement.name)}</h3></div></div><p>${escape(achievement.description)}</p><div class="journey-objectives">${progress.requirements.map(r=>`<div class="${r.complete?'complete':''}"><span>${r.complete?icon('check'):icon('marker')}${escape(this.journeyRequirement(r))}</span><b>${r.current}/${r.count}</b></div>`).join('')}</div><p class="journey-reward">${this.journeyReward(achievement.reward)}</p><button class="small-button" data-command="claimAchievement" data-id="${achievement.id}" ${check.ok?'':'disabled'}>${progress.claimed?'Belohnung erhalten':'Belohnung abholen'}</button></article>`;
    }).join('')}</div>`;
    if(tab==='companions')return `${tabs}<div class="companion-intro"><p>Ein Gefährte folgt dir sichtbar in der Welt. Seine Gaben stärken deinen Aufbau; bestimmte Begleiter unterstützen dich im Kampf. Wechseln ist außerhalb des Kampfes möglich.</p>${state.activeCompanion?`<button class="small-button" data-command="select-companion" data-id="" ${this.game.inCombat?.()?'disabled':''}>Gefährten rasten lassen</button>`:''}</div><div class="companion-grid">${COMPANIONS.map(companion=>{
      const active=state.activeCompanion===companion.id,owned=(state.ownedCompanions || []).includes(companion.id),check=canSelectCompanion(this.game,companion.id);
      return `<article class="companion-card ${active?'active':owned?'owned':'locked'}"><div class="companion-heading"><div class="companion-seal" style="--companion-color:${companion.color}">${icon(companion.combat?'group':/moth|wisp|lantern/.test(companion.silhouette)?'flame':'leaf')}</div><div><span class="eyebrow">${escape(companion.role)} · STUFE ${companion.minLevel}</span><h3>${escape(companion.name)}</h3><span class="companion-status">${active?'AN DEINER SEITE':owned?'GEWONNEN':'NOCH NICHT GEWONNEN'}</span></div></div><p>${escape(companion.description)}</p><div class="companion-stats">${this.statsText(companion.stats)}</div><details><summary>${owned?'Seine Geschichte':'So gewinnst du ihn'}</summary><div class="journey-objectives">${companion.requirements.map(r=>`<div><span>${escape(this.journeyRequirement(r))}</span><b>${r.count}</b></div>`).join('')}</div></details><button class="small-button" data-command="select-companion" data-id="${companion.id}" ${check.ok&&!active?'':'disabled'}>${active?'Gefährte aktiv':owned?'Gemeinsam aufbrechen':'Voraussetzungen erfüllen'}</button>${owned&&!check.ok&&!active?`<p class="talent-requirement">${escape(check.reason)}</p>`:''}</article>`;
    }).join('')}</div>`;
    return `${tabs}<p class="panel-note">Drei Bündnisse beobachten deine Taten. Ruf wächst durch neue Erkundungen, Rettungen und Siege. Ihre Rezepte und Eide öffnen dauerhafte Möglichkeiten für deinen Aufbau.</p><div class="faction-grid">${FACTIONS.map(faction=>{
      const progress=getFactionProgress(this.game,faction.id),target=progress.nextRankAt || 400;
      return `<article class="faction-card" style="--faction-color:${faction.color}"><div class="faction-heading">${icon(faction.id==='wardens'?'shield':faction.id==='archivists'?'book':'map')}<span class="eyebrow">${escape(progress.rankName)}</span><h3>${escape(faction.name)}</h3></div><p>${escape(faction.description)}</p><div class="faction-progress-label"><span>Ruf</span><strong>${progress.reputation} / ${target}</strong></div><div class="discovery-progress"><i style="width:${clamp(progress.reputation/target*100,0,100)}%"></i></div><div class="faction-rank-road">${FACTION_RANKS.slice(1).map(rank=>`<span class="${progress.rank>=rank.rank?'reached':''}">${progress.rank>=rank.rank?icon('check'):icon('lock')}${escape(rank.name)}<b>${rank.reputation}</b></span>`).join('')}</div><h4>Rezepte deines Bundes</h4>${JOURNEY_RECIPES.filter(recipe=>recipe.factionId===faction.id).map(recipe=>`<p class="faction-unlock ${unlocks.recipeIds.includes(recipe.id)?'available':''}">${icon(unlocks.recipeIds.includes(recipe.id)?'check':'lock')}${escape(recipe.name)} · ${escape(FACTION_RANKS[recipe.factionRank].name)} · Stufe ${recipe.minLevel}</p>`).join('')}<button class="small-button" data-panel="craft">Rezepte an der Werkbank ansehen</button></article>`;
    }).join('')}</div><h3 class="section-title">Dein Eid <small>Ein Meisterpfad · drei Meisterränge</small></h3><p class="panel-note">Ab Stufe 40 und verbündetem Ruf kannst du einen Eid wählen. Höhere Stufen und weitere Taten stärken ihn. Ein Wechsel zeigt seine Kosten, bevor du ihn wählst.</p><div class="mastery-grid">${JOURNEY_MASTERIES.map(mastery=>{
      const check=canChooseJourneyMastery(this.game,mastery.id),active=state.mastery===mastery.id;
      return `<article class="mastery-card ${active?'active':''}"><span class="eyebrow">${escape(FACTIONS.find(f=>f.id===mastery.factionId)?.name)}</span><h3>${escape(mastery.name)}</h3>${active?`<span class="mastery-rank">DEIN EID · RANG ${getMasteryRank(this.game)} / 3</span>`:''}<p>${escape(mastery.description)}</p><button class="small-button" data-command="chooseMastery" data-id="${mastery.id}" ${check.ok&&!active?'':'disabled'}>${active?'Eid gewählt':`Eid wählen · ${check.cost || mastery.talentCost} ${check.currency==='gold'?'Gold':'Talentpunkte'}`}</button>${!check.ok&&!active?`<p class="talent-requirement">${escape(check.reason)}</p>`:''}</article>`;
    }).join('')}</div>`;
  }

  adventures() {
    const world=this.game.overworld || this.game.world,events=this.game.worldEventSummary?.() || summarizeWorldEvents(world),filter=this.adventureFilter || 'all';
    const states={idle:'Noch nicht begonnen',active:'Ereignis läuft',success:'Belohnung bereit',failure:'Gescheitert',rewarded:'Abgeschlossen'};
    const visible=events.filter(event=>filter==='all'||filter==='active'&&['active','success'].includes(event.state)||filter==='nearby'&&event.region===this.game.regionAt?.()?.id);
    return `<div class="adventure-intro"><div>${icon('portal')}<h3>Die Welt wartet nicht nur auf deine Klinge.</h3><p>Hilf Reisenden, verteidige letzte Feuer und entscheide, was hinter den Siegeln liegt. Begib dich zum markierten Ort und interagiere dort mit E.</p><button class="small-button" data-command="open-hunts">${icon('crown')}Jagdziele & gesicherte Beute</button></div><label><span>Ereignisse anzeigen</span><select class="game-input" data-ui-filter="adventureFilter">${[['all','Alle Ereignisse'],['nearby','In meiner Region'],['active','Laufend & Belohnung bereit']].map(([id,label])=>`<option value="${id}" ${filter===id?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="adventure-grid">${visible.map(event=>{
      const region=REGIONS.find(r=>r.id===event.region),discovered=(this.game.discovered || []).includes(event.region),objects=world.eventObjects || [],point=objects.find(object=>object.eventId===event.id&&object.role===(event.state==='success'?'reward':'start')) || event;
      const distance=Math.hypot(point.x-this.game.player.x,point.y-this.game.player.y);
      return `<article class="adventure-card ${event.state}"><div class="adventure-heading"><span class="eyebrow">${escape(region?.name || 'Unbekannte Wege')} · STUFE ${region?.level || 1}+</span><span class="event-state">${event.mode==='expedition'?`EXPEDITION ${event.stageIndex+1}/${event.stages} · `:''}${states[event.state] || 'Entdecken'}</span><h3>${escape(event.name)}</h3></div><p>${escape(event.description)}</p>${event.objective?`<div class="event-objective">${icon(event.state==='success'?'check':'marker')}<span>${escape(event.objective.label)}</span>${event.state!=='idle'?`<b>${format(event.objective.progress)}/${format(event.objective.goal)}</b>`:''}</div>${event.state==='active'?`<div class="discovery-progress"><i style="width:${clamp(event.objective.progress/Math.max(1,event.objective.goal)*100,0,100)}%"></i></div>`:''}`:''}${event.warning?`<p class="event-warning">${escape(event.warning)}</p>`:''}<div class="adventure-actions"><span>${discovered?`${format(distance)} Schritte`:'Region noch nicht entdeckt'}</span><button class="small-button" data-command="waypoint" data-kind="event" data-id="${escape(event.id)}" ${discovered&&!this.dungeonId()?'':'disabled'}>${icon('marker')}Weg markieren</button></div>${distance<=85&&!this.dungeonId()?`<button class="small-button" data-command="${event.state==='success'?'claimWorldEvent':'world-event'}" data-id="${escape(event.state==='success'?event.id:point.id)}" ${event.state==='idle'&&this.game.player.level>=event.minLevel||event.state==='success'?'':'disabled'}>${event.state==='success'?'Belohnung bergen':`Beginnen · Stufe ${event.minLevel}`}</button>`:''}${event.state==='active'?`<div class="event-choices">${objects.filter(object=>object.eventId===event.id&&object.role==='choice'&&!object.active).map(object=>`<article><h4>${escape(object.name)}</h4><p>${escape(object.description)}</p><button class="small-button" data-command="world-event" data-id="${escape(object.id)}" ${Math.hypot(object.x-this.game.player.x,object.y-this.game.player.y)<=85&&!this.dungeonId()?'':'disabled'}>Diesen Weg wählen</button></article>`).join('')}</div>`:''}</article>`;
    }).join('') || '<p class="panel-note">Für diesen Filter gibt es keine Ereignisse. Erkunde weitere Regionen.</p>'}</div><p class="panel-note">Ereignisziele erscheinen während der Begegnung in der Welt. Deine Taten können andere Reisende, neue Beute und dauerhafte Fortschritte freischalten.</p>`;
  }

  reward(quest) {
    const reward = quest.reward;
    return `${format(reward.xp)} EP · ${format(reward.gold)} Gold${reward.dust?` · ${format(reward.dust)} Glutstaub`:''}${reward.item?` · ${escape(ITEMS[reward.item]?.name || reward.item)}`:''}`;
  }

  journal() {
    const guidance=this.game.adventureGuidance?.();
    const guide=guidance?`<div class="journey-next-step"><div><span class="eyebrow">DEIN NÄCHSTER SCHRITT</span><h3>${escape(guidance.title)}</h3><p>${escape(guidance.description)}</p></div>${guidance.panel?`<button class="small-button" data-panel="${escape(guidance.panel)}">Weiter ${icon('arrow')}</button>`:`<button class="small-button" data-command="waypoint" data-kind="${escape(guidance.kind)}" data-id="${escape(guidance.id)}">${icon('marker')}Ort markieren</button>`}</div>`:'';
    const active = QUESTS.filter(quest=>['active','ready'].includes(this.game.questState?.[quest.id]?.status));
    const done = QUESTS.filter(quest=>this.game.questState?.[quest.id]?.status==='done');
    const available = QUESTS.filter(quest=>this.game.canAccept(quest));
    const quests = this.questTab==='done' ? done : this.questTab==='available' ? available : active;
    const tabs = `<div class="panel-tabs"><button data-quest-tab="active" class="${this.questTab==='active'?'active':''}">Deine Questen · ${active.length}</button><button data-quest-tab="available" class="${this.questTab==='available'?'active':''}">Entdecken · ${available.length}</button><button data-quest-tab="done" class="${this.questTab==='done'?'active':''}">Abgeschlossen · ${done.length}</button><button data-quest-tab="contracts" class="${this.questTab==='contracts'?'active':''}">Aufträge · ${this.game.contracts?.active?.length||0}/3</button></div>`;
    if(this.questTab==='contracts')return `${tabs}${this.contractBoard()}`;
    return `${tabs}${guide}${quests.length ? quests.map(quest=> {
      const state = this.game.questState?.[quest.id];
      const giver = NPCS.find(npc=>npc.id===quest.giver);
      const total = quest.objectives.reduce((sum,objective)=>sum+objective.count,0);
      const complete = quest.objectives.reduce((sum,objective,index)=>sum+Math.min(state?.counts?.[index] || 0,objective.count),0);
      const giverRegion=REGIONS.find(region=>giver&&giver.x>=region.x&&giver.x<region.x+region.w&&giver.y>=region.y&&giver.y<region.y+region.h);
      return `<article class="quest-log-item"><div class="quest-log-heading"><h3>${escape(quest.title)}</h3><span class="quest-status">${state?.status==='done'?'ABGESCHLOSSEN':state?.status==='ready'?'BELOHNUNG ABHOLEN':state?.status==='active'?'AUF DEINEM WEG':`BEI ${escape(giver?.name || '').toUpperCase()}`}</span></div><p>${escape(quest.description)}</p>${state && state.status!=='done'?`<div class="quest-progress"><div style="width:${complete/total*100}%"></div></div>`:''}<div class="quest-log-objectives">${quest.objectives.map((objective,index)=>`<span>${state?.status==='done'||(state?.counts?.[index]||0)>=objective.count?icon('check'):icon('marker')}${escape(objective.label)}${state&&state.status!=='done'?` ${Math.min(state.counts?.[index]||0,objective.count)}/${objective.count}`:''}</span>`).join('')}</div><div class="quest-reward">Belohnung: ${this.reward(quest)} · ${escape(giver?.name || 'Ein Reisender')}${giverRegion?` in ${escape(giverRegion.name)}`:''}${quest.minLevel?` · Stufe ${quest.minLevel}`:''}</div>${state&&state.status!=='done'?`<button class="small-button" data-command="trackQuest" data-id="${this.game.trackedQuestId===quest.id?'':escape(quest.id)}">${icon('marker')}${this.game.trackedQuestId===quest.id?'Ziel lösen':'Diese Quest verfolgen'}</button>`:''}</article>`;
    }).join('') : `<p class="empty-inventory">${this.questTab==='done'?'Die ersten Geschichten warten noch darauf, erzählt zu werden.':this.questTab==='available'?'Deine nächste Aufgabe wartet am Ende deines jetzigen Weges.':'Mach den ersten Schritt.'}<br><span class="panel-note">${this.questTab==='active'?'Sprich mit den Bewohnern von Glutwacht. Mira, Sera und Toma brauchen deine Hilfe.':'Setze deine Reise fort und sprich regelmäßig mit deinen Weggefährten.'}</span></p>`}`;
  }

  map() {
    const dungeon=DUNGEONS.find(entry=>entry.id===this.dungeonId());
    if(dungeon)return `<div class="map-layout"><div><canvas id="full-map" class="world-map" width="900" height="580" aria-label="Dungeonkarte mit Rätselkammern, Toren und deiner Position"></canvas><p class="panel-note">Erkunde die Kammern und lies die Inschriften mit E.</p></div><aside><h3 class="section-title">${escape(dungeon.name)}</h3><p class="panel-note">${escape(dungeon.subtitle)}<br>Stufe ${dungeon.minLevel} · ${dungeon.partyRequired} Reisende</p><details class="dungeon-journal"><summary>Inschrift lesen</summary><p>${escape(dungeon.hint)}</p></details><button class="small-button" data-panel="dungeons">Expedition ansehen</button></aside></div>`;
    return `<div class="map-layout"><div><canvas id="full-map" class="world-map" width="900" height="580" aria-label="Weltkarte mit deiner Position, Schreinen, Gegnern und Interaktionsobjekten"></canvas><div class="map-legend"><span><i class="legend-dot"></i>Du & Glutwacht</span><span><i class="legend-dot blue"></i>Glutschrein</span><span><i class="legend-dot red"></i>Gefahr</span><span><i class="legend-dot relic"></i>Spuren & Reliquien</span></div><p class="panel-note">Die Welt steht dir offen. Entdeckte Glutschreine sind deine Ankerpunkte: Reise zwischen ihnen, erhole dich und setze deinen Weg fort.</p></div><aside class="map-regions"><h3 class="section-title">Deine Horizonte</h3>${REGIONS.map(region=> {
      const discovered = (this.game.discovered || []).includes(region.id);
      const shrine = (this.game.world?.shrines || []).find(entry=>entry.region===region.id || entry.regionId===region.id || entry.x>=region.x&&entry.x<region.x+region.w&&entry.y>=region.y&&entry.y<region.y+region.h);
      const shrineDiscovered = shrine && (shrine.discovered || shrine.unlocked || shrine.active || (this.game.unlockedShrines || []).includes(shrine.id));
      return `<div class="region-entry ${discovered?'':'undiscovered'}"><strong>${escape(region.name)}</strong><p>Stufe ${region.level}+ · ${discovered?'Entdeckt':'Unbekannte Wege'}<br>${escape(region.subtitle)}</p>${shrineDiscovered?`<button class="small-button" data-command="travel" data-id="${escape(shrine.id)}">Zum Glutschrein ${icon('arrow')}</button>`:''}</div>`;
    }).join('')}</aside></div>`;
  }

  party() {
    if(this.inPvp)return this.duelLobby();
    const network=this.network;
    const serverAddress=(network?.baseUrl || globalThis.location?.origin || 'http://localhost:4173').replace(/\/\/(localhost|127\.0\.0\.1)(?=:|\/|$)/,'//<Host-IP>');
    return `<div class="party-connection"><div><span class="eyebrow">DEINE GRUPPE</span><h3 id="party-status">Verbindung prüfen</h3><p id="party-connection-error" class="panel-note" role="status"></p></div><div id="party-room-code" class="party-room-code"></div></div><div id="party-roster" class="party-roster"></div>${this.duelLobby()}<div class="party-forms"><section><h3 class="section-title">Dein Gruppencharakter</h3><label class="field-label" for="party-player-name">Name</label><input id="party-player-name" class="game-input" value="${escape(this.game.player.name || 'Aren')}" maxlength="24" autocomplete="nickname"/><label class="field-label" for="party-class">Klasse</label><select id="party-class" class="game-input">${CLASSES.map(entry=>`<option value="${entry.id}" ${entry.id===this.game.player.classId?'selected':''}>${escape(entry.name)} · ${escape(entry.role)}</option>`).join('')}</select><p class="panel-note">Dein Gruppencharakter hat einen eigenen Fortschritt. Deine Einzelspieler-Reise bleibt gespeichert.</p>${network?.savedSession?'<button class="small-button" data-command="party-resume">Gespeicherte Gruppe fortsetzen</button>':''}</section><section><h3 class="section-title">Eine Gruppe bilden</h3><label class="field-label" for="party-room-name">Gruppenname</label><input id="party-room-name" class="game-input" value="Glutwacht" maxlength="32"/><button class="small-button" data-command="party-create">${icon('group')}Gruppe erstellen</button><label class="field-label" for="party-join-code">Gruppencode</label><input id="party-join-code" class="game-input code-input" placeholder="8 Zeichen" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false"/><button class="small-button" data-command="party-join">Gruppe beitreten ${icon('arrow')}</button></section></div><div class="party-actions"><button class="small-button" data-command="party-refresh">Offene Gruppen aktualisieren</button><button class="small-button danger-button" data-command="party-disconnect">Gruppe verlassen</button></div><div id="party-room-list" class="party-room-list"><p class="panel-note">Offene Gruppen werden geladen.</p></div><div class="party-guide"><h3 class="section-title">Gemeinsam losziehen</h3><p>Öffnet Emberfall auf demselben Spielserver, erstellt eine Gruppe und teilt den achtstelligen Code. Im selben WLAN verwendet ihr auf den weiteren Geräten die LAN-Adresse des Hosts.</p><p class="panel-note">Spieladresse: <code>${escape(serverAddress)}</code>${serverAddress.includes('<Host-IP>')?' · Host-IP durch die lokale IP-Adresse des Hosts ersetzen.':''}</p><p class="panel-note">Bis zu acht Reisende · Geteilte Welt und Kämpfe · Eigene Beute und Klassenpfade · Freiwillige Duelle zwischen verbundenen Mitspielern</p><button class="small-button" data-panel="dungeons">Gruppendungeons ansehen ${icon('portal')}</button></div>`;
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
    if(errorElement)errorElement.textContent=network?.error || (network?.serverAvailable===false?'Diese Spieladresse bietet deine Einzelspieler-Reise. Gruppen und freiwillige Duelle stehen auf einem verbundenen Emberfall-Spielserver zur Verfügung.':network?.online?'Die Welt läuft weiter, während dieses Fenster geöffnet ist.':'Wähle eine Klasse für deine nächste Gruppenreise.');
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
    if(this.inPvp)return `${this.audioControls()}<button class="small-button" data-command="resume">Zum Duellstatus zurück</button>`;
    const abilities=getClass(this.game.player.classId).abilities;
    const mobileMenu=`<div class="mobile-menu-shortcuts">${[["map","map","Weltkarte"],["character","shield","Charakter"],["inventory","bag","Inventar"],["talents","tree","Talente"],["craft","craft","Handwerk"],["journal","book","Questen"],["dungeons","portal","Dungeons"],["party","group","Gruppe"],["bestiary","skull","Bestiarium"],["interactions","relic","Spuren"]].map(([panel,glyph,label])=>`<button class="small-button" data-panel="${panel}">${icon(glyph)}${label}</button>`).join("")}</div>`;
    return `${mobileMenu}${this.audioControls()}<div class="settings-row"><div><h3>Weniger Bewegung</h3><p>Reduziert Kamerabewegungen und Animationen in der Oberfläche.</p></div><label class="settings-toggle"><input type="checkbox" data-setting="reducedMotion" ${this.game.settings?.reducedMotion?'checked':''}/>Aktiv</label></div><h3 class="section-title">Dein Spielstand</h3><p class="panel-note">Emberfall speichert deine Einzelspieler-Reise in diesem Browser und deine Gruppenreise auf dem Spielserver. Exportiere deinen Einzelspieler-Spielstand, um ihn zu sichern oder auf einem anderen Gerät weiterzuspielen.</p><div class="settings-actions"><button class="small-button" data-command="save">${icon('save')}Jetzt speichern</button><button class="small-button" data-command="export">Spielstand exportieren</button><button class="small-button" data-command="import">Spielstand laden</button><button class="small-button danger-button" data-panel="reset">Neue Reise</button></div><h3 class="section-title">Deine Hände, deine Fähigkeiten</h3><p class="panel-note">Auf dem Handy: Joystick für acht Richtungen ziehen, Angriff für automatische Wiederholung halten. Bewegung, Angriff und eine weitere Aktion funktionieren gleichzeitig. Angriffe zielen auf den nächsten sichtbaren Gegner.</p><div class="settings-controls"><div class="summary-stat"><span>Bewegen</span><strong>WASD / Pfeiltasten</strong></div><div class="summary-stat"><span>${escape(abilities.attack.name)} / Ausweichen</span><strong>J oder Klick / Leertaste</strong></div><div class="summary-stat"><span>${escape(abilities.nova.name)} / ${escape(abilities.bolt.name)} / Heiltrank</span><strong>F / Q / R</strong></div><div class="summary-stat"><span>Erlernte Zusatzfähigkeiten</span><strong>3 / 4 · Im Talentfenster belegen</strong></div><div class="summary-stat"><span>Sprechen, sammeln, pflanzen & ernten</span><strong>E</strong></div><div class="summary-stat"><span>Inventar / Talente / Handwerk / Questen</span><strong>I / T / B / L</strong></div><div class="summary-stat"><span>Weltkarte / Charakter / Gruppe</span><strong>M / C / P</strong></div></div>`;
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
      const baseShopIds = npc.id==='elin'?['forest_blade','sentinel_mail']:npc.id==='sera'?['heal_potion','mana_potion']:['heal_potion','mana_potion','leather_armor','forest_blade'];
      const shopItems=[...baseShopIds.map(id=>ITEMS[id]),...getArsenalShopStock({level:this.game.player.level,classId:this.game.player.classId,merchant:npc.id}),...getEquipmentShopStock({level:this.game.player.level,classId:this.game.player.classId,merchant:npc.id})].filter(Boolean);
      extra = `<h3 class="section-title">${npc.id==='elin'?'Elins Ausrüstung':npc.id==='sera'?'Tränke für den Weg':'Vorräte & Ausrüstung'}</h3><div class="item-list">${shopItems.map(item=>this.itemRow(item,0,'buy',true)).join('')}</div>`;
      if (npc.id==='oren') {
        const sellable = Object.entries(this.game.inventory||{}).filter(([id,count])=>count>0 && this.item(id) && !Object.values(this.game.equipment || {}).includes(id));
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
  victory() { return `<div class="large-state">${icon('flame')}<h3>Glutwacht hat wieder ein Feuer.</h3><p>Veyr ist gefallen und dein erstes Kapitel ist vollendet. In den ${REGIONS.length} Regionen der freien Lande warten neue Bündnisse, Ereignisse und mächtige Gegner. Wähle am letzten Feuer deinen nächsten Weg.</p><button class="primary-button" data-command="resume">Deine Reise fortsetzen ${icon('arrow')}</button><div class="victory-next-paths"><button class="small-button" data-panel="adventures">${icon('portal')}Ereignisse & Expeditionen</button><button class="small-button" data-panel="journey">${icon('book')}Dein Vermächtnis</button></div><p class="panel-note">Sprich mit Mira, um die Belohnung für dieses Kapitel zu erhalten.</p></div>`; }
  resetConfirmation() { return `<div class="large-state">${icon('leaf')}<h3>Jede Geschichte beginnt mit einem Schritt.</h3><p>Deine aktuelle Reise wird ersetzt. Exportiere deinen Spielstand in den Einstellungen, wenn du sie für später behalten möchtest.</p>${this.classSelection(this.pendingClass,true)}<button class="primary-button" data-command="confirm-reset">Als ${escape(getClass(this.pendingClass).name)} beginnen ${icon('arrow')}</button><button class="text-button" data-command="resume">Zur aktuellen Reise zurück</button></div>`; }
  showDeath() { if(this.inPvp)return; if (this.activePanel==='death') return; this.togglePanel('death'); }
  showVictory() { if (this.activePanel==='victory') return; this.togglePanel('victory'); }

  async command(name, id, button) {
    if(name.startsWith('pvp-')){await this.pvpCommand(name,id);return;}
    if(this.inPvp&&name!=='resume'){this.showNotice('Kehre zuerst aus dem Duell zurück.','info');return;}
    if(name==='open-hunts'){this.journeyTab='hunts';this.togglePanel('journey');return;}
    if(name==='inventory-filters'){this.inventoryFiltersOpen=!this.inventoryFiltersOpen;this.renderPanel();return;}
    if(name==='toggle-tracker'){this.trackerExpanded=!this.trackerExpanded;this.renderTracker();return;}
    if(name==='inspect-item'){
      const fromOther=this.activePanel!=='inventory'||button?.classList?.contains('gear-belt-slot');this.inventorySelected=id;
      if(fromOther){this.inventoryTab='equipment';this.inventoryType='all';this.inventoryRarity='all';this.inventoryFlags='all';this.inventorySearch='';this.inventoryUsable=false;const entries=Object.keys(this.game.inventory || {}).filter(key=>this.item(key)?.type!=='consumable');this.inventoryPage=Math.floor(Math.max(0,entries.indexOf(id))/12);this.togglePanel('inventory');}else this.renderPanel();
      if(typeof matchMedia==='function'&&matchMedia('(max-width:600px)').matches)requestAnimationFrame(()=>document.getElementById('inventory-inspector')?.scrollIntoView({block:'start',behavior:this.game.settings?.reducedMotion?'auto':'smooth'}));return;
    }
    if(name==='inspect-back'){document.getElementById('inventory-grid')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(name==='item-flag'){await this.game.setItemFlag?.(id,button.dataset.flag);this.update(true);return;}
    if(name==='save-loadout'){await this.game.saveLoadout?.((this.loadoutName || '').trim() || `Aufbau ${(this.game.loadouts || []).length+1}`);this.loadoutName='';this.update(true);return;}
    if(name==='world-event'){const result=await this.game.interactWorldEvent?.(id);if(result!==false)this.closePanel();this.update(true);return;}
    if(name==='claimWorldEvent'){const result=await this.game.claimWorldEvent?.(id);this.update(true);return;}
    if(name==='select-companion'){await this.game.selectCompanion?.(id || null);this.update(true);return;}
    if(name==='waypoint'){await this.game.setWaypoint?.(button.dataset.kind,id);this.update(true);return;}
    if(name==='bestiary-page'){this.bestiaryPage=Math.max(0,Number(id)||0);this.renderPanel();return;}
    if(name==='world-object'){const result=await this.game.interactWorldObject?.(id);this.update(true);if(result!==false)this.closePanel();return;}
    if(name==='inventory-page'){this.inventoryPage=Math.max(0,Number(id)||0);this.renderPanel();return;}
    if(name==='open-equipment'){this.inventoryTab='equipment';this.inventoryType=EQUIPMENT_SLOTS.some(slot=>slot.id===id)?id:'all';this.inventoryPage=0;this.inventorySelected=null;if(this.activePanel!=='inventory')this.togglePanel('inventory');else this.renderPanel();return;}
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
    if(this.inPvp){
      if(tone!=='error')return;
      for(const notice of this.notices)notice.remove();this.notices=[];
    }
    const notice = document.createElement('div');
    notice.className = `notice ${['success','error'].includes(tone)?tone:''}`;
    notice.textContent = message;
    this.elements['notice-stack'].appendChild(notice);
    this.notices.push(notice);
    if (this.notices.length>4) this.notices.shift().remove();
    setTimeout(()=>{notice.classList.add('fading');setTimeout(()=>{notice.remove();this.notices=this.notices.filter(entry=>entry!==notice);},350);},3700);
  }

  trapFocus(event) {
    const overlay = this.activePanel ? this.elements['game-panel'] : this.inPvp&&this.game.pvp?.duel?.state==='finished'?this.elements['pvp-hud']:!this.game.started ? this.elements['welcome-overlay'] : null;
    if (!overlay) return;
    const controls = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(element=>!element.hidden && element.getClientRects().length);
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
    drawMapFeatures(ctx,world,{mapX,mapY,scale,full,discovered:this.game.discovered || []});
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
    for(const object of world.interactions || []) {
      if(object.used||!(this.game.discovered || []).includes(object.region))continue;
      const x=mapX(object.x),y=mapY(object.y),size=full?2.5:1.8;
      if(x<0||x>width||y<0||y>height)continue;
      ctx.strokeStyle=['cursed_chest','sarcophagus','altar'].includes(object.kind)?'#d08a82':'#dfb785';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size,y);ctx.closePath();ctx.stroke();
    }
    for (const npc of this.game.npcs || []) {ctx.fillStyle='#d9c484';ctx.beginPath();ctx.arc(mapX(npc.x),mapY(npc.y),full?2.2:1.4,0,Math.PI*2);ctx.fill();}
    for(const entrance of world.dungeonEntrances || []) {ctx.strokeStyle='#d4b6d5';ctx.lineWidth=full?1.5:1;ctx.strokeRect(mapX(entrance.x)-3,mapY(entrance.y)-3,6,6);}
    for(const ally of this.game.partyPlayers || this.game.otherPlayers || []) {ctx.fillStyle=ally.dead?'#ba8065':(world.isPvp||this.game.worldMode==='pvp')&&ally.id!==player.id?'#ec8e9b':'#a1d0a5';ctx.beginPath();ctx.arc(mapX(ally.x),mapY(ally.y),full?3:2,0,Math.PI*2);ctx.fill();}
    if (full && !inDungeon) {ctx.fillStyle='#e0d2a6';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('GLUTWACHT',mapX(565),mapY(1460));}
    const waypoint=this.game.waypointTarget?.();if(waypoint){const x=mapX(waypoint.x),y=mapY(waypoint.y);ctx.strokeStyle='#e4bd79';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,full?7:4,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();}
    const px=mapX(player.x ?? 560),py=mapY(player.y ?? 1230);
    ctx.fillStyle='#eeda9b';ctx.strokeStyle='#12251a';ctx.lineWidth=full?2:1;
    ctx.beginPath();ctx.moveTo(px,py-5);ctx.lineTo(px+4,py+4);ctx.lineTo(px,py+2);ctx.lineTo(px-4,py+4);ctx.closePath();ctx.fill();ctx.stroke();
    if (full) {ctx.fillStyle='#f1e2b1';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('DU',px+10,py-4);}
  }
}
