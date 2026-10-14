import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { ENEMY_TYPES, ITEMS, RECIPES } from '../src/catalog.js';
import { ABILITIES } from '../src/abilities.js';
import { getArsenalShopStock } from '../src/arsenal.js';
import { generateLoot, itemPower } from '../src/loot.js';

const view=game=>Object.assign(Object.create(GameUI.prototype),{game:game || new Game({storage:null}),inventoryTab:'equipment',inventoryPage:0,talentTab:'abilities',inventorySearch:'',inventoryType:'all',inventoryRarity:'all',inventorySort:'default',bestiaryPage:0,craftFilter:'all'});

test('bag filters make only matching, wearable loot accessible and sort by actual item power',()=>{
  const ui=view(),game=ui.game;game.player.level=15;
  const low=generateLoot({level:8,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:'low-power',rng:()=>.2});
  const high=generateLoot({level:15,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:'high-power',rng:()=>.7});
  const rival=generateLoot({level:8,classId:'ranger',rarity:'epic',baseId:'greenwood_bow',uid:'rival',rng:()=>.5});
  for(const item of [low,high,rival])game.addItem(item);
  ui.inventoryUsable=true;ui.inventoryRarity='rare';ui.inventorySort='power';
  let html=ui.inventory();assert.ok(!html.includes(`data-id="${rival.id}"`));
  assert.ok(itemPower(high)>itemPower(low));assert.ok(html.indexOf(`data-id="${high.id}"`)<html.indexOf(`data-id="${low.id}"`));
  ui.inventorySearch='Kein existierender Gegenstand';html=ui.inventory();assert.match(html,/Keine passenden Gegenstände/);assert.ok(!html.includes(`data-id="${high.id}"`));
});

test('bestiary lists canonical species once and exposes their actual boss form and kill ledger',()=>{
  const ui=view(),species=Object.entries(ENEMY_TYPES).filter(([,enemy])=>enemy.species===true);
  assert.ok(species.length>=80);ui.bestiarySearch='Frostwolf';
  const [id,enemy]=species.find(([,enemy])=>enemy.name==='Frostwolf');ui.game.ledger[`kill:${id}`]=3;
  const html=ui.bestiary();assert.match(html,/1 Arten/);assert.match(html,/3 besiegt/);assert.ok(html.includes(ENEMY_TYPES[enemy.bossType].name));assert.match(html,/Bossform/);
  assert.match(html,/Bestien/);assert.match(html,/Schnell/);assert.ok(!html.includes('>swift<'));
});

test('expanded skills expose every learned technique and enforce prerequisite ranks for keystones',()=>{
  const ui=view(),game=ui.game;game.player.level=100;game.player.skillPoints=30;
  const abilities=ABILITIES.filter(a=>a.classId===game.player.classId);assert.ok(abilities.length>=8);
  let all='';for(let page=0;page<Math.ceil(abilities.length/6);page++){ui.talentPage=page;all+=ui.activeAbilities();}
  for(const ability of abilities)assert.ok(all.includes(ability.name));
  ui.talentTab='passives';const keystone=game.availableSkills().find(skill=>skill.keystone&&typeof skill.requires==='string');
  assert.ok(keystone);game.skills[keystone.requires]=(keystone.requiresRank || 1)-1;
  ui.talentSearch=keystone.name;ui.talentPage=0;
  let html=ui.talents();const article=html.slice(html.indexOf(`data-talent-id="${keystone.id}"`)).split('</article>')[0];
  assert.match(article,/data-command="learn"[^>]+disabled/);assert.ok(article.includes(`Rang ${keystone.requiresRank}`));
  game.skills[keystone.requires]=keystone.requiresRank;html=ui.talents();
  const unlocked=html.slice(html.indexOf(`data-talent-id="${keystone.id}"`)).split('</article>')[0];
  assert.ok(!/data-command="learn"[^>]+disabled/.test(unlocked));assert.match(unlocked,/SCHLÜSSELTALENT/);assert.match(unlocked,/stat-worse/);
});

test('merchants use class-aware arsenals and crafting clearly locks future recipes',()=>{
  const ui=view(),game=ui.game;game.player.level=40;game.player.gold=10000;
  ui.dialogueNPC={id:'elin',name:'Elin',role:'Schmiedin',dialogue:'Die Werkbank wartet.'};
  for(const item of getArsenalShopStock({level:40,classId:'guardian',merchant:'elin'}))assert.ok(ui.dialogue().includes(`data-id="${item.id}"`));
  const future=RECIPES.find(recipe=>recipe.minLevel>40&&(!recipe.classIds||recipe.classIds.includes('guardian')));assert.ok(future);
  for(const [resource,count] of Object.entries(future.ingredients))game.resources[resource]=count*10;
  const html=ui.craft(),article=html.split('<article').find(part=>part.includes(`data-id="${future.id}"`));
  assert.ok(article.includes(`Stufe ${future.minLevel} benötigt`));assert.match(article,/data-command="craft"[^>]*disabled/);
  assert.ok(html.includes(ITEMS[future.output].name));
});

test('interaction overview describes all authored choices with real completion totals',()=>{
  const ui=view(),game=ui.game;const summary=game.interactionSummary();assert.equal(summary.length,12);
  const html=ui.interactions();for(const entry of summary){assert.ok(html.includes(entry.name));assert.ok(Number.isFinite(entry.total));}
  assert.ok(!/NaN|undefined/.test(html));assert.match(html,/Spuren in deiner Nähe/);
});

test('seven-slot UI compares and unequips helmets independently from body armor',()=>{
  const ui=view(),game=ui.game;game.player.level=12;
  const bodyId=game.equipment.armor;
  const helmet=generateLoot({level:12,classId:'guardian',slot:'helmet',rarity:'rare',uid:'ui-helmet-slot',rng:()=>.4});
  assert.equal(helmet.slot,'helmet');game.addItem(helmet);assert.equal(game.equip(helmet.id),true);assert.equal(game.equipment.armor,bodyId);
  const html=ui.itemRow(helmet,1);assert.match(html,/data-command="unequip" data-id="helmet"/);assert.match(html,/Helm/);
  for(const label of ['WAFFE','KÖRPERRÜSTUNG','AMULETT','HELM','HANDSCHUHE','STIEFEL','RING'])assert.ok(ui.equipmentSlots().includes(label));
  ui.inventoryType='armor';assert.ok(!ui.inventory().split('id="inventory-grid">')[1].split('</div>')[0].includes(`data-id="${helmet.id}"`));
  ui.inventoryType='helmet';assert.ok(ui.inventory().includes(`data-command="inspect-item" data-id="${helmet.id}"`));
});

test('flags protect destructive UI actions and stash inspection offers transfers instead of equipping',()=>{
  const ui=view(),game=ui.game;game.player.level=12;
  const item=generateLoot({level:12,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:'ui-protected',rng:()=>.4});game.addItem(item);
  game.setItemFlag(item.id,'locked');
  assert.match(ui.itemRow(item,1,'sell'),/data-command="sell"[^>]*disabled/);
  assert.match(ui.itemInspector(item.id),/data-command="salvage"[^>]*disabled/);assert.match(ui.itemInspector(item.id),/aria-pressed="true"/);
  game.stash[item.id]=1;delete game.inventory[item.id];
  const html=ui.itemInspector(item.id,true);assert.match(html,/data-command="withdrawItem"/);assert.ok(!html.includes('data-command="equip"'));
  ui.inventoryTab='stash';ui.inventoryFlags='locked';assert.ok(ui.inventory().includes(`data-command="inspect-item" data-id="${item.id}"`));
});

test('build presets identify missing equipment and leave passive talents separate from presets',()=>{
  const ui=view(),game=ui.game;ui.characterTab='build';game.saveLoadout('Bossjäger');
  assert.ok(ui.character().includes('Bossjäger'));assert.match(ui.character(),/Talentränge bleiben/);
  const id=game.equipment.weapon;delete game.inventory[id];
  const html=ui.character();assert.match(html,/Fehlt im Gepäck/);assert.match(html,/data-command="applyLoadout"[^>]*disabled/);
  assert.match(html,/data-command="respecTalents"/);
});

test('journey tabs render requirement-based allies and permanent rewards without invalid values',()=>{
  const ui=view();
  for(const tab of ['factions','achievements','companions']) {
    ui.journeyTab=tab;const html=ui.journey();assert.ok(!/undefined|NaN|\[object Object\]/.test(html));
    assert.ok(html.includes(tab==='factions'?'Orden der letzten Wacht':tab==='achievements'?'Drei Horizonte':'Glutmottengeist'));
  }
  ui.journeyTab='achievements';assert.match(ui.journey(),/data-command="claimAchievement"[^>]*disabled/);
  ui.journeyTab='companions';assert.match(ui.journey(),/data-command="select-companion"[^>]*disabled/);
});

test('adventures paginate real objectives and expeditions while retaining supported waypoints',()=>{
  const ui=view(),game=ui.game,events=game.worldEventSummary();assert.ok(events.length>=20);
  let all='';for(let page=0;page<Math.ceil(events.length/6);page++){ui.adventurePage=page;const html=ui.adventures();assert.ok(!/undefined|NaN|\[object Object\]/.test(html));assert.ok((html.match(/data-adventure-id=/g)||[]).length<=6);all+=html;}
  assert.match(all,/EXPEDITION/);assert.match(all,/data-kind="event"/);for(const event of events)assert.ok(all.includes(event.name));
  ui.adventureFilter='nearby';ui.adventurePage=0;const near=ui.adventures();assert.ok(near.includes(events.find(event=>event.region===game.regionAt().id).name));assert.ok(!near.includes('Drei Narben der Quelle'));
});
