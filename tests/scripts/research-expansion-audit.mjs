// Deterministic system benchmark. This is not a human playtest or a star rating.
import { Game } from '../../src/game.js';
import { CLASSES } from '../../src/classes.js';
import { ABILITIES } from '../../src/abilities.js';
import { ITEMS,RECIPES } from '../../src/catalog.js';
import { ITEM_BASES,generateLoot } from '../../src/loot.js';
import { equipmentSlot,EQUIPMENT_ITEMS,getEquipmentShopStock } from '../../src/equipment-system.js';
import { COMPANIONS,FACTIONS,ACHIEVEMENTS,JOURNEY_MASTERIES } from '../../src/journey.js';
import { WORLD_EVENT_DEFINITIONS,EXPEDITIONS } from '../../src/world-events.js';
import { BESTIARY_SPECIES } from '../../src/bestiary.js';
import { estimateCombat } from '../../src/balance.js';

const rows=[];
for(const level of [10,25,50,75,100])for(const cls of CLASSES) {
  const game=new Game({storage:null,random:()=>.5});game.player.classId=cls.id;game.player.level=level;game.equipment={};game.inventory={};
  const primary=cls.abilities.attack.stat||'damage';
  for(const slot of ['weapon','armor','charm']) {
    let bases=ITEM_BASES.filter(b=>equipmentSlot(b)===slot&&b.minLevel<=level&&(!b.classIds||b.classIds.includes(cls.id)));
    if(slot!=='armor')bases=bases.filter(b=>b.stats[primary]>0);
    else bases=bases.filter(b=>b.stats.maxHp&&b.stats.armor);
    bases.sort((a,b)=>b.minLevel-a.minLevel||a.id.localeCompare(b.id));
    const item=generateLoot({baseId:bases[0].id,classId:cls.id,level,rarity:'rare',rng:()=>.5,uid:`audit4-core-${cls.id}-${level}-${slot}`});
    game.addItem(item);game.equip(item.id);
  }
  const core=estimateCombat({level,classId:cls.id,stats:game.stats()});
  for(const item of getEquipmentShopStock({level,classId:cls.id,merchant:'elin'})) {
    const roll=generateLoot({baseId:item.id,classId:cls.id,level,rarity:'rare',rng:()=>.5,uid:`audit4-extra-${cls.id}-${level}-${item.slot}`});game.addItem(roll);game.equip(roll.id);
  }
  const expanded=estimateCombat({level,classId:cls.id,stats:game.stats()});
  rows.push({level,classId:cls.id,coreDps:core.dps,expandedDps:expanded.dps,dpsMultiplier:expanded.dps/core.dps,
    survivalMultiplier:expanded.ttd/core.ttd,normalTtk:expanded.ttk,normalTtd:expanded.ttd});
}
const game=new Game({storage:null});
console.log(JSON.stringify({kind:'analytical-system-audit',assumptions:{rarity:'rare',rng:.5,attackUptime:.7,talents:false,learnedAbilities:false,companions:false,masteries:false,enemyAI:false},
  counts:{classes:CLASSES.length,passiveTalents:CLASSES.flatMap(c=>c.talents).length,activeAbilities:ABILITIES.length,species:BESTIARY_SPECIES.length,
    itemDefinitions:Object.keys(ITEMS).length,lootBases:ITEM_BASES.length,newSmallEquipment:Object.keys(EQUIPMENT_ITEMS).length,recipes:RECIPES.length,
    eventKinds:new Set(WORLD_EVENT_DEFINITIONS.map(e=>e.mode)).size,regionalEvents:WORLD_EVENT_DEFINITIONS.length,expeditions:EXPEDITIONS.length,
    companions:COMPANIONS.length,factions:FACTIONS.length,achievements:ACHIEVEMENTS.length,masteries:JOURNEY_MASTERIES.length,worldObjects:game.world.interactions.length},
  limits:{maxExtraGearDpsMultiplier:Math.max(...rows.map(r=>r.dpsMultiplier)),maxExtraGearSurvivalMultiplier:Math.max(...rows.map(r=>r.survivalMultiplier))},rows},null,2));
