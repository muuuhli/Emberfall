import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { RECIPES, RESOURCES, NPCS } from '../src/catalog.js';
import { CLASSES } from '../src/classes.js';
import { generateLoot, ITEM_BASES, computeItemStats } from '../src/loot.js';
import { PROFESSIONS, PROFESSION_RECIPES, socketDescriptor } from '../src/professions.js';
import { PROFESSION_TRAINERS, craftProfessionGate, craftedEquipmentPreview } from '../src/profession-system.js';
import { itemSpriteMarkup } from '../src/item-art.js';

const decode = text => String(text || '').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const snapshot = game => { const state=structuredClone(game.capture());delete state.savedAt;return state; };
const recipeMarkup = (markup,id) => markup.split('<article').find(part=>part.includes(`data-recipe-id="${id}"`))?.split('</article>')[0] || '';
const recipeIds = markup => [...markup.matchAll(/data-recipe-id="([^"]+)"/g)].map(match=>match[1]);

// Small DOM/event models run the production bind/render/command paths. Root's
// browser smoke check separately verifies actual mobile geometry and pixel paint.
function fixture({classId='guardian',level=100,trainer=null}={}) {
  const saved={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame},listeners=new Map(),nodes=new Map(),frames=[],pending=[];
  const listen=(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);};
  let document;
  function node(tag='DIV',attrs={},parent=null) {
    const classes=new Set(),attributes=new Map(Object.entries(attrs));let html='';
    const element={tagName:tag,dataset:{},parentElement:parent,controls:[],hidden:false,disabled:Object.hasOwn(attrs,'disabled'),isConnected:true,scrollTop:0,textContent:'',value:attrs.value || '',writes:0,style:{},
      classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name),toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);}},
      addEventListener(){},setAttribute(name,value){attributes.set(name,String(value));},getAttribute:name=>attributes.get(name),
      focus(){if(!this.disabled)document.activeElement=this;},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
      contains(other){for(let cursor=other;cursor;cursor=cursor.parentElement)if(cursor===this)return true;return false;},
      matches(selector){return selector==='select'?this.tagName==='SELECT':false;},closest(selector){return selector==='button'&&this.tagName==='BUTTON'?this:null;},
      querySelector(selector){return this.querySelectorAll(selector)[0] || null;},
      querySelectorAll(selector){return this.controls.filter(control=>selector.split(',').some(part=>{const type=part.match(/^(button|input|select)/)?.[1]?.toUpperCase(),field=part.match(/\[data-([a-z-]+)="([^"]+)"\]/);return (!type||control.tagName===type)&&(!field||control.dataset[field[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]===field[2]);}));},
      get innerHTML(){return html;},set innerHTML(value){
        if(this.controls.some(control=>control===document.activeElement))document.activeElement=document.body;
        for(const control of this.controls)control.isConnected=false;html=value;this.writes++;this.controls=[];
        for(const match of value.matchAll(/<(button|input|select)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)\/?>/g)) {
          const tag=(match[1] || 'input').toUpperCase(),source=match[2] || match[4],parsed={};
          for(const attr of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g))parsed[attr[1]]=decode(attr[2]??'');
          const control=node(tag,parsed,this);if(tag==='SELECT')control.value=match[3]?.match(/<option value="([^"]+)" selected/)?.[1] || match[3]?.match(/<option value="([^"]+)"/)?.[1] || '';
          this.controls.push(control);
        }
        const status=value.match(/<p id="profession-feedback"([^>]*)>/);if(status){const feedback=node('P',{},this);feedback.hidden=/\bhidden\b/.test(status[1]);nodes.set('profession-feedback',feedback);}
      }};
    for(const [name,value] of Object.entries(attrs))if(name.startsWith('data-'))element.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
    return element;
  }
  const ids=['start-button','continue-button','close-panel','panel-overlay','save-button','save-import','panel-content','game-panel','panel-title','panel-description','world-hud','world'];
  const elements=Object.fromEntries(ids.map(id=>{const element=node();nodes.set(id,element);return[id,element];}));
  elements['panel-content'].parentElement=elements['game-panel'];elements['game-panel'].parentElement=elements['panel-overlay'];
  const touch=node(),body=node();document={body,activeElement:body,getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.touch-controls'?touch:null,querySelectorAll:()=>[],addEventListener:listen,
    fire(name,target){for(const handler of listeners.get(name)||[])handler({target,preventDefault(){},stopImmediatePropagation(){}});}};
  globalThis.document=document;globalThis.window={addEventListener(){}};globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.player.level=level;game.player.gold=1000;game.start();
  if(trainer)Object.assign(game.player,{x:PROFESSION_TRAINERS[trainer].x,y:PROFESSION_TRAINERS[trainer].y});
  const ui=Object.assign(Object.create(GameUI.prototype),{game,elements,activePanel:'craft',renderedPanel:'craft',panelPointers:new Set(),craftFilter:'all',craftProfession:'all',craftSource:'all',craftSearch:'',craftPage:0,inventoryTab:'resources',inventoryPage:0,inventorySearch:'',inventoryMaterialsAll:false,infoOpen:false,renderInformation(){},renderNotice(){},updateHudLayout(){},showNotice(){},update(){this.renderPanel();}});
  const command=ui.command.bind(ui);ui.command=(...args)=>{const operation=command(...args);pending.push(operation);return operation;};ui.bind();ui.renderPanel();
  return{ui,game,elements,document,
    controls(){return elements['panel-content'].controls;},markup(){return elements['panel-content'].innerHTML;},
    button(command,id,choice){const button=this.controls().find(control=>control.tagName==='BUTTON'&&control.dataset.command===command&&(id===undefined||control.dataset.id===id)&&(choice===undefined||control.dataset.choice===choice));assert.ok(button,`${command}: ${id}`);return button;},
    click(command,id,choice){const button=this.button(command,id,choice);button.focus();document.fire('click',button);return button;},
    input(key,value){const input=this.controls().find(control=>control.dataset.uiSearch===key);assert.ok(input,key);input.value=value;input.selectionStart=value.length;input.selectionEnd=value.length;input.focus();document.fire('input',input);},
    change(key,value){const select=this.controls().find(control=>control.dataset.uiFilter===key);assert.ok(select,key);select.value=value;select.focus();document.fire('change',select);},
    async flush(){while(pending.length)await Promise.all(pending.splice(0));while(frames.length)frames.shift()();},
    restore(){Object.assign(globalThis,saved);}};
}
async function withFixture(options,run){const f=fixture(options);try{return await run(f);}finally{f.restore();}}

test('native profession/source filters and eight-recipe pages retain every canonical recipe across all classes',async()=>{
  const found=new Set();assert.equal(RECIPES.length,124);
  for(const cls of CLASSES)await withFixture({classId:cls.id},async f=>{
    f.change('craftFilter','all');f.change('craftSource','all');
    const expected=RECIPES.filter(recipe=>!recipe.classIds||recipe.classIds.includes(cls.id)),seen=[];
    const pages=f.ui.craftCollection().pages;
    for(let page=0;page<pages;page++){if(page){f.click('craft-page',String(page));await f.flush();}const shown=recipeIds(f.markup());assert.ok(shown.length<=8);seen.push(...shown);shown.forEach(id=>found.add(id));}
    assert.deepEqual(new Set(seen),new Set(expected.map(recipe=>recipe.id)),cls.id);
    f.change('craftSource','new');const learned=[];
    for(let page=0;page<f.ui.craftCollection().pages;page++){if(page){f.click('craft-page',String(page));await f.flush();}learned.push(...recipeIds(f.markup()));}
    assert.deepEqual(new Set(learned),new Set(PROFESSION_RECIPES.map(recipe=>recipe.id)));
    f.click('craft-profession','runecraft');await f.flush();assert.equal(f.ui.craftPage,0);
    assert.ok(recipeIds(f.markup()).every(id=>PROFESSION_RECIPES.find(recipe=>recipe.id===id)?.profession==='runecraft'));
    f.input('craftSearch',PROFESSION_RECIPES.find(recipe=>recipe.id==='bind_ruby_t3').name);assert.deepEqual(recipeIds(f.markup()),['bind_ruby_t3']);
    await f.ui.command('craft-page','999');await f.flush();assert.equal(f.ui.craftPage,0);
  });
  assert.deepEqual(found,new Set(RECIPES.map(recipe=>recipe.id)));
});

test('native teacher dialogue learns only its profession and preserves the real paused-menu gold charge',async()=>withFixture({level:1,trainer:'alchemy'},async f=>{
  f.game.paused=true;f.game.player.gold=50;f.ui.activePanel='dialogue';f.ui.dialogueNPC=NPCS.find(npc=>npc.id==='sera');f.ui.renderPanel();
  assert.match(f.markup(),/data-command="trainProfession" data-id="alchemy"/);assert.doesNotMatch(f.markup(),/data-command="trainProfession" data-id="smith"/);
  f.click('trainProfession','alchemy');await f.flush();assert.deepEqual(f.game.professionTraining,['alchemy']);assert.equal(f.game.player.gold,30);assert.equal(f.game.paused,true);
  assert.match(f.markup(),/Alchemie/);assert.match(f.markup(),/14 Berufs-EP/);assert.doesNotMatch(f.markup(),/data-command="trainProfession" data-id="alchemy"/);
  assert.equal(f.document.activeElement,f.document.getElementById('profession-feedback'),'When learning removes its button, status takes keyboard focus.');
  f.click('profession-open','alchemy');await f.flush();assert.equal(f.ui.activePanel,'craft');assert.equal(f.ui.craftProfession,'alchemy');
  for(const profession of PROFESSIONS){f.ui.dialogueNPC=NPCS.find(npc=>npc.id===PROFESSION_TRAINERS[profession.id].npcId);assert.ok(f.ui.dialogue().includes(`data-command="profession-open" data-id="${profession.id}"`));}
}));

test('new recipe buttons expose actual material, level, training, teacher and cap-adjusted XP gates',async()=>withFixture({level:25,trainer:'alchemy'},async f=>{
  f.game.trainProfession('alchemy');f.game.professions.alchemy.level=49;f.game.professions.alchemy.xp=109;
  f.input('craftSearch','Sturmkraut-Heiltrank brauen');const recipe=PROFESSION_RECIPES.find(entry=>entry.id==='brew_greater_heal'),gate=craftProfessionGate(f.game,recipe);
  assert.equal(gate.xpGain,1);assert.match(f.markup(),/\+1 Berufs-EP/);assert.match(f.markup(),/Fehlt:/);assert.equal(f.button('craft',recipe.id).disabled,true);
  for(const [id,count] of Object.entries(recipe.ingredients))f.game.resources[id]=count;f.ui.renderPanel();assert.equal(f.button('craft',recipe.id).disabled,false);
  f.click('craft',recipe.id);await f.flush();assert.equal(f.game.inventory.greater_heal,1);assert.equal(f.game.professions.alchemy.level,50);assert.equal(f.game.professions.alchemy.xp,0);
  f.click('craft-profession','alchemy');await f.flush();
  assert.match(f.markup(),/Aktuelles Berufslimit erreicht/);assert.match(f.markup(),/Keine Berufs-EP/);assert.match(f.markup(),/Berufs-EP über dem Limit verfallen/);
  f.game.player.x+=200;f.ui.renderPanel();assert.match(f.markup(),/Bei Sera herstellen/);assert.equal(f.button('craft',recipe.id).disabled,true);
  f.ui.craftFilter='all';f.ui.craftSearch='Nexus-Äthertrank brauen';f.ui.renderPanel();assert.match(f.markup(),/Charakterstufe 95/);assert.match(f.markup(),/Stufe 95 benötigt/);
}));

test('locked future recipes label canonical potential XP while a level-one trained craft shows its real forty XP',async()=>withFixture({level:1,trainer:'alchemy'},async f=>{
  const legacy=RECIPES.find(recipe=>recipe.id==='brew_heal'),bread=RECIPES.find(recipe=>recipe.id==='bake_bread');
  f.input('craftSearch',legacy.name);assert.match(recipeMarkup(f.markup(),legacy.id),/Keine Berufs-EP/);assert.doesNotMatch(recipeMarkup(f.markup(),legacy.id),/bei Freigabe/);
  const future=PROFESSION_RECIPES.find(recipe=>recipe.id==='brew_superior_heal');
  f.input('craftSearch',future.name);assert.match(f.markup(),new RegExp(`Bis zu ${future.professionXp} Berufs-EP bei Freigabe`));
  f.game.trainProfession('alchemy');for(const [id,count] of Object.entries(bread.ingredients))f.game.resources[id]=count;
  f.input('craftSearch',bread.name);assert.match(f.markup(),/\+40 Berufs-EP/);f.click('craft',bread.id);await f.flush();
  assert.equal(f.game.player.level,1);assert.equal(f.game.professions.alchemy.level,3);assert.equal(f.game.professions.alchemy.xp,10);
  for(const id of ['brew_superior_heal','brew_supreme_heal','brew_supreme_mana']){
    const recipe=PROFESSION_RECIPES.find(entry=>entry.id===id),gate=craftProfessionGate(f.game,recipe);assert.equal(gate.code,'character_level');assert.equal(gate.xpGain,158);
    f.input('craftSearch',recipe.name);assert.match(f.markup(),new RegExp(`Bis zu ${recipe.professionXp} Berufs-EP bei Freigabe`));assert.doesNotMatch(f.markup(),/\+158 Berufs-EP/);
  }
  f.input('craftSearch',legacy.name);assert.match(recipeMarkup(f.markup(),legacy.id),/\+40 Berufs-EP/);assert.doesNotMatch(recipeMarkup(f.markup(),legacy.id),/bei Freigabe/);
  f.game.player.level=100;f.input('craftSearch',future.name);assert.equal(craftProfessionGate(f.game,future).code,'profession_level');assert.match(f.markup(),/Bis zu 160 Berufs-EP bei Freigabe/);
  f.game.professions.alchemy.level=50;f.game.professions.alchemy.xp=0;f.game.player.x+=200;f.ui.renderPanel();
  assert.equal(craftProfessionGate(f.game,future).code,'teacher_distance');assert.match(f.markup(),/\+160 Berufs-EP/);assert.doesNotMatch(f.markup(),/bei Freigabe/);
}));

test('pending native craft requests preserve mounted search/focus, reject duplicate clicks and render safe errors',async()=>withFixture({},async f=>{
  const recipe=RECIPES.find(entry=>entry.id==='brew_heal');for(const [id,count] of Object.entries(recipe.ingredients))f.game.resources[id]=count*3;
  f.input('craftSearch',recipe.name);const button=f.button('craft',recipe.id);let reject,calls=0;
  f.game.craft=()=>{calls++;return new Promise((_,fail)=>{reject=fail;});};f.click('craft',recipe.id);
  const writes=f.elements['panel-content'].writes;assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');f.ui.renderPanel();assert.equal(f.elements['panel-content'].writes,writes);
  f.document.fire('click',button);await f.ui.command('craft',recipe.id,button);assert.equal(calls,1);
  const search=f.controls().find(control=>control.dataset.uiSearch==='craftSearch');search.focus();search.selectionStart=2;search.selectionEnd=4;
  reject(new Error('<img src=x onerror=alert(1)> Anfrage fehlgeschlagen'));await f.flush();
  assert.equal(f.ui.craftBusy,null);assert.match(f.markup(),/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(f.markup(),/<img src=x/);
  assert.equal(f.document.activeElement.dataset.uiSearch,'craftSearch');assert.equal(f.document.activeElement.selectionStart,2);assert.equal(f.document.activeElement.selectionEnd,4);assert.equal(f.button('craft',recipe.id).disabled,false);
}));

test('canonical ingredient banks and a full generated bag disable crafting without spending materials',async()=>withFixture({trainer:'smith'},async f=>{
  const legacy=RECIPES.find(entry=>entry.id==='forge_forest');for(const [id,count] of Object.entries(legacy.ingredients)){f.game.resources[id]=0;f.game.inventory[id]=count*100;}
  f.input('craftSearch',legacy.name);assert.equal(f.button('craft',legacy.id).disabled,true);assert.ok(f.ui.craftRecipeState(legacy).missing.length>0);assert.equal(f.game.craft(legacy.id),false);
  f.game.trainProfession('smith');f.game.professions.smith.level=100;const recipe=PROFESSION_RECIPES.find(entry=>entry.id==='forge_source_weapon');
  for(const [id,count] of Object.entries(recipe.ingredients))f.game.resources[id]=count;
  for(let index=0;index<240;index++)assert.equal(f.game.addItem(generateLoot({level:100,baseId:'iron_longsword',classId:'guardian',rarity:'rare',rng:()=>.5,uid:`profession-full-${index}`})),true);
  const before=snapshot(f.game);f.input('craftSearch',recipe.name);assert.equal(f.game.bagUsed(),240);assert.equal(f.button('craft',recipe.id).disabled,true);
  assert.match(f.markup(),/Dein Gepäck ist voll\. Das Rezept und seine Materialien bleiben erhalten\./);assert.equal(f.game.craft(recipe.id),false);assert.deepEqual(snapshot(f.game),before);
}));

test('gear previews consume no RNG or progression and missing regional materials retain real map sources',async()=>{
  for(const classId of ['guardian','ranger','flamecaller'])await withFixture({classId,trainer:'smith'},async f=>{
    const recipe=PROFESSION_RECIPES.find(entry=>entry.id==='forge_frontier_weapon');f.input('craftSearch',recipe.name);const before=snapshot(f.game);f.game.random=()=>{throw new Error('UI must not roll loot');};
    const preview=craftedEquipmentPreview(recipe,{classId});assert.ok(ITEM_BASES.some(base=>base.id===preview.baseId&&(!base.classIds||base.classIds.includes(classId))));
    assert.ok(f.markup().includes(itemSpriteMarkup(preview)));assert.match(f.markup(),/Klassenbasis:/);assert.match(f.markup(),/Affixe und Sockel entstehen beim Schmieden/);
    assert.ok(f.ui.craftRecipeState(recipe).missing.some(([id])=>id==='ore_t2'));assert.match(f.markup(),/Fehlende Materialien finden/);
    const route=f.controls().find(control=>control.dataset.command==='waypoint'&&control.dataset.kind==='region');assert.ok(route);assert.ok(RESOURCES.ore_t2.regions.includes(route.dataset.id));
    assert.deepEqual(snapshot(f.game),before);route.focus();f.document.fire('click',route);await f.flush();assert.equal(f.game.waypoint.kind,'region');assert.equal(f.game.waypoint.id,route.dataset.id);
    for(const [id,count] of Object.entries(recipe.ingredients))f.game.resources[id]=count;assert.doesNotMatch(f.ui.craftRecipe(recipe),/Fehlende Materialien finden/);
  });
});

test('native material discovery prioritizes held stock, pages all entries and searches uncollected regional materials',async()=>withFixture({},async f=>{
  f.ui.activePanel='inventory';f.game.resources.ore_t2=3;f.ui.renderPanel();let ids=[...f.markup().matchAll(/data-resource-id="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(ids.includes('ore_t2'));assert.ok(ids.includes('wood'));assert.ok(!ids.includes('crystal_t4'));assert.ok(ids.length<=12);
  f.click('materials-all');await f.flush();const found=new Set();
  for(let page=0;page<Math.ceil(Object.keys(RESOURCES).length/12);page++){if(page){f.click('inventory-page',String(page));await f.flush();}const visible=[...f.markup().matchAll(/data-resource-id="([^"]+)"/g)].map(match=>match[1]);assert.ok(visible.length<=12);visible.forEach(id=>found.add(id));}
  assert.deepEqual(found,new Set(Object.keys(RESOURCES)));f.click('materials-all');await f.flush();f.input('inventorySearch',RESOURCES.crystal_t4.name);
  assert.deepEqual([...f.markup().matchAll(/data-resource-id="([^"]+)"/g)].map(match=>match[1]),['crystal_t4']);
  f.input('inventorySearch','<img onerror=bad>');assert.match(f.markup(),/Keine passenden Materialien/);assert.doesNotMatch(f.markup(),/<img onerror/);
}));

test('mastery commands use both canonical arguments and all nine socket stones show slot-scaled actual tier bonuses',async()=>withFixture({trainer:'smith'},async f=>{
  f.game.trainProfession('smith');f.game.professions.smith.level=75;f.game.player.hp=20;f.game.player.mana=12;f.game.cooldowns.bolt=3;
  f.ui.craftProfession='smith';f.ui.renderPanel();f.click('chooseProfessionMastery','smith','weaponsmith');await f.flush();
  assert.equal(f.game.professions.smith.mastery,'weaponsmith');assert.equal(f.game.player.hp,20);assert.equal(f.game.player.mana,12);assert.equal(f.game.cooldowns.bolt,3);
  f.game.professionTraining.push('runecraft');f.game.professions.runecraft={level:100,xp:0,mastery:'weaving'};
  const item=generateLoot({level:100,baseId:'relic_ring_4_1',classId:'guardian',rarity:'rare',rng:()=>.5,uid:'profession-ring'});assert.equal(f.game.addItem(item),true);
  const gems=Object.keys(RESOURCES).filter(id=>socketDescriptor(id));assert.equal(gems.length,9);gems.forEach(id=>f.game.resources[id]=1);
  const row=f.ui.itemInspector(item.id);for(const id of gems){assert.ok(row.includes(`data-gem="${id}"`));assert.ok(row.includes(RESOURCES[id].name));}
  const descriptor=socketDescriptor('sapphire_t3'),before=computeItemStats({...item,sockets:[null]}),after=computeItemStats({...item,sockets:[descriptor]});
  const baseDelta=after.mana-before.mana,preview=f.ui.socketPreviewStats(item,'sapphire_t3');assert.ok(Math.abs(preview.mana-baseDelta*1.12)<1e-8);
  assert.equal(f.game.socket(item.id,'sapphire_t3'),true);const socketed=f.ui.itemInspector(item.id);assert.ok(socketed.includes(RESOURCES.sapphire_t3.name));assert.ok(socketed.includes(itemSpriteMarkup({...RESOURCES.sapphire_t3,id:'sapphire_t3',type:'resource'})));
}));

test('a capped gear socket preview equals the real item change instead of promising its uncapped stone budget',async()=>withFixture({trainer:'runecraft'},async f=>{
  f.game.trainProfession('runecraft');f.game.professions.runecraft={level:100,xp:0,mastery:'weaving'};
  const item=generateLoot({level:100,tier:30,baseId:'relic_ring_4_1',classId:'guardian',rarity:'legendary',rng:()=>.5,uid:'profession-capped-ring'});
  assert.equal(f.game.addItem(item),true);f.game.resources.emerald_t3=3;
  assert.equal(f.game.socket(item.id,'emerald_t3'),true);assert.equal(f.game.socket(item.id,'emerald_t3'),true);
  const before=f.game.itemStats(item.id),preview=f.ui.socketPreviewStats(item,'emerald_t3');
  assert.ok(preview.crit<.00672,'The third stone is clipped by the item cap, while weaving retains its actual extra contribution.');
  assert.match(f.ui.itemInspector(item.id),/Zuwachs am Gegenstand:/);
  assert.equal(f.game.socket(item.id,'emerald_t3'),true);const after=f.game.itemStats(item.id);
  for(const [key,value] of Object.entries(preview))assert.ok(Math.abs((after[key] || 0)-(before[key] || 0)-value)<1e-8,key);
}));
