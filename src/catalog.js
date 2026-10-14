import * as base from './content.js';
import { CLASSES } from './classes.js';
import { EXPANSION_REGIONS, EXPANSION_ENEMIES, EXPANSION_NPCS, EXPANSION_QUESTS } from './expansion.js';
import { DUNGEON_ENEMIES } from './dungeons.js';
import { BESTIARY_ENEMIES } from './bestiary.js';
import { EXTRA_ITEMS, EXTRA_RECIPES } from './arsenal.js';
import { EQUIPMENT_ITEMS, EQUIPMENT_RECIPES } from './equipment-system.js';
import { JOURNEY_RECIPES } from './journey.js';
import { WORLD_EVENT_ENEMIES } from './world-events.js';
import { SIDE_QUESTS } from './side-stories.js';
export const ITEMS={...base.ITEMS,...EXTRA_ITEMS,...EQUIPMENT_ITEMS};
export const RECIPES=[...base.RECIPES,...EXTRA_RECIPES,...EQUIPMENT_RECIPES,...JOURNEY_RECIPES];
export const RESOURCES={...base.RESOURCES,
  dust:{name:'Arkanstaub',label:'Arkanstaub',icon:'✦',color:'#c7a3dc',description:'Aus zerlegter Ausrüstung. Für Aufwertung und Runen.'},
  ruby:{name:'Rubin',label:'Rubin',icon:'♦',color:'#d67a73',description:'Gesockelt stärkt er Klinge und Lebenskraft.'},
  sapphire:{name:'Saphir',label:'Saphir',icon:'♦',color:'#78b5d3',description:'Gesockelt stärkt er Zauber und Äther.'},
  emerald:{name:'Smaragd',label:'Smaragd',icon:'♦',color:'#82c592',description:'Gesockelt stärkt er Präzision und Regeneration.'},
  raidSigil:{name:'Quellensiegel',label:'Quellensiegel',icon:'◈',color:'#dbb7e1',description:'Eine Belohnung für gemeisterte Gruppenbegegnungen.'}
};
export const REGIONS=[...base.REGIONS,...EXPANSION_REGIONS];
export const NPCS=[...base.NPCS,...EXPANSION_NPCS];
export const ENEMY_TYPES={...base.ENEMY_TYPES,...EXPANSION_ENEMIES,...DUNGEON_ENEMIES,...BESTIARY_ENEMIES,...WORLD_EVENT_ENEMIES};
export const QUESTS=[...base.QUESTS,...EXPANSION_QUESTS,...SIDE_QUESTS];
export const SKILLS=[...new Map([...base.SKILLS,...CLASSES.flatMap(c=>c.talents)].map(s=>[s.id,s])).values()];
