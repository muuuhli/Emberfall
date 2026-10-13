// Authored routes and encounters, seeded foliage. Coordinates use world pixels.
import { ENEMY_TYPES, REGIONS } from './content.js';
import { BESTIARY_ENEMIES, createBestiaryEnemy } from './bestiary.js';

const seeded = (seed) => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const distanceToSegment = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(x-a[0]-dx*t, y-a[1]-dy*t);
};

export function makeWorld() {
  const random = seeded(826404);
  const world = {
    seed: 826404, width: 3200, height: 2400,
    regions: REGIONS,
    paths: [
      {width:72,points:[[0,1260],[250,1250],[520,1250],[840,1215],[1090,1180],[1340,1190],[1630,1125],[1940,1030],[2210,900],[2520,650],[2770,470]]},
      {width:61,points:[[510,1280],[610,1450],[775,1540],[1050,1630],[1350,1780],[1660,1870],[1950,1840],[2230,1910],[2520,1960],[2760,1960]]},
      {width:56,points:[[570,1190],[660,990],[690,790],[805,585],[960,430],[970,270]]},
      {width:44,points:[[760,1500],[785,1770],[870,1960],[1130,2090],[1320,2170]]},
      {width:46,points:[[1880,1060],[1980,1230],[2100,1420],[2160,1690],[2240,1900]]}
    ],
    river:[[1570,-80],[1460,300],[1590,630],[1440,925],[1520,1250],[1435,1490],[1580,1800],[1470,2080],[1570,2480]],
    bridges:[{x:1479,y:1168,angle:-.12,w:206},{x:1548,y:1850,angle:.1,w:212}],
    structures:[
      {id:'inn',type:'inn',x:260,y:1000,w:172,h:148,name:'Zum goldenen Hirsch'},
      {id:'smith',type:'smith',x:724,y:1050,w:150,h:133,name:'Glut & Eisen'},
      {id:'cottage',type:'cottage',x:297,y:1400,w:134,h:130,name:'Das Gärtnerhaus'},
      {id:'market',type:'market',x:674,y:1270,w:123,h:100,name:'Handelsposten',blocking:false},
      {id:'well',type:'well',x:504,y:1112,w:68,h:68,name:'Sternenbrunnen',blocking:false},
      {id:'ruins',type:'ruins',x:1170,y:2040,w:130,h:103,name:'Versunkene Abtei',blocking:false},
      {id:'tower',type:'tower',x:2350,y:670,w:118,h:165,name:'Schattenwacht',blocking:false},
      {id:'camp',type:'camp',x:1965,y:1515,w:106,h:94,name:'Aschenlager',blocking:false}
    ],
    trees:[], rocks:[], nodes:[], plots:[], enemies:[], chests:[],
    shrines:[
      {id:'home',x:475,y:1285,name:'Sternenruh',region:'daemmerhain'},
      {id:'frostgrat',x:720,y:535,name:'Frostgrat',region:'frostgrat'},
      {id:'aschenmoor',x:2180,y:880,name:'Aschenmoor',region:'aschenmoor'},
      {id:'glutoede',x:2110,y:1740,name:'Glutöde',region:'glutoede'}
    ],
    landmarks:[
      {type:'circle',x:970,y:270,r:160,region:'frostgrat'},
      {type:'circle',x:1100,y:1880,r:130,region:'daemmerhain'},
      {type:'circle',x:2770,y:470,r:176,region:'aschenmoor'},
      {type:'circle',x:2760,y:1960,r:195,region:'glutoede'},
      {type:'pond',x:345,y:1795,r:138},
      {type:'graveyard',x:1220,y:2000,r:132},
      {type:'field',x:720,y:1460,r:150}
    ]
  };
  const nearPath = (x,y,margin=20) => world.paths.some(p => p.points.slice(1).some((b,i)=>distanceToSegment(x,y,p.points[i],b)<p.width/2+margin));
  const nearRiver = (x,y,margin=0) => world.river.slice(1).some((b,i)=>distanceToSegment(x,y,world.river[i],b)<63+margin);
  const occupied = (x,y) => world.structures.some(s=>x>s.x-72&&x<s.x+s.w+72&&y>s.y-72&&y<s.y+s.h+80) ||
    Math.hypot(x-520,y-1250)<245 || Math.hypot(x-720,y-1460)<160 ||
    world.landmarks.some(l=>Math.hypot(x-l.x,y-l.y)<l.r+35) || world.shrines.some(s=>Math.hypot(x-s.x,y-s.y)<75);

  for(let i=0;i<370;i++) {
    const x=55+random()*3090,y=70+random()*2260;
    if(nearPath(x,y,38)||nearRiver(x,y,24)||occupied(x,y)||world.trees.some(t=>Math.hypot(t.x-x,t.y-y)<58))continue;
    let variant=y<900&&x<1500?'pine':x>=1500?(y<1100?'dead':'burnt'):'oak';
    if(x>1500&&random()<.44)continue;
    world.trees.push({x,y,scale:.72+random()*.62,variant});
  }
  for(let i=0;i<130;i++) {
    const x=55+random()*3090,y=60+random()*2280;
    if(nearPath(x,y,36)||nearRiver(x,y)||occupied(x,y)||world.trees.some(t=>Math.hypot(t.x-x,t.y-y)<45))continue;
    world.rocks.push({x,y,scale:.5+random()*.95,variant:x<1500&&y<900?'ice':x>1500&&y>1100?'ash':'stone'});
  }

  const nodePositions=[
    ['herb',875,1360],['herb',910,1515],['herb',505,1610],['herb',285,1325],['herb',1010,1085],['herb',1190,1700],['herb',1180,1900],['herb',255,2050],['herb',1330,1420],['herb',2020,920],['herb',2290,1040],['herb',2720,865],
    ['wood',177,1190],['wood',470,985],['wood',620,1720],['wood',1070,1435],['wood',1000,1825],['wood',265,1560],['wood',1320,1000],['wood',570,2120],['wood',2120,570],
    ['ore',1030,680],['ore',1230,520],['ore',450,545],['ore',1210,230],['ore',1870,400],['ore',2300,350],['ore',2460,1335],['ore',2580,1790],['ore',2890,1510],['ore',1860,2050],['ore',1020,1560],['ore',1200,1080],['crystal',1940,750],['crystal',2270,470],['crystal',2700,970],['crystal',2970,650],['crystal',2500,280],['crystal',2170,1320],['crystal',2870,1880],['crystal',3030,1410]
  ];
  nodePositions.forEach(([type,x,y],i)=>world.nodes.push({id:`node-${i}`,type,x,y,readyAt:0}));
  for(let row=0;row<2;row++)for(let col=0;col<4;col++)world.plots.push({id:`plot-${row}-${col}`,x:645+col*51,y:1460+row*51,state:'empty',readyAt:0});

  const spawns=[
    ['slime',1040,1290],['wolf',1150,1130],['slime',1130,1450],['wolf',980,1670],['slime',1180,1720],['wolf',810,1960],['slime',370,1970],['wolf',180,1820],['slime',1240,1940],['wolf',1350,2090],['slime',1340,1580],['thorn_guardian',1100,1880],
    ['frostwolf',530,700],['frostwolf',1160,700],['frostwolf',430,510],['frostwolf',1160,430],['frostwolf',740,365],['frostwolf',980,590],['skeleton',1350,190],['frost_sentinel',970,270],
    ['skeleton',1920,1010],['wraith',2100,1080],['skeleton',1850,680],['skeleton',2180,730],['skeleton',2360,940],['wraith',2510,580],['skeleton',2650,290],['skeleton',2880,760],['wraith',2960,350],['wraith',2770,470],['wraith',2750,1060],['skeleton',2380,420],['skeleton',1940,300],
    ['imp',1810,1470],['imp',1910,1730],['imp',2290,1580],['imp',2450,1900],['imp',2490,1470],['imp',2850,1630],['imp',2930,2120],['imp',2570,2230],['skeleton',2050,2180],['emberlord',2760,1960]
  ];
  spawns.forEach(([type,x,y],i)=>{
    if(BESTIARY_ENEMIES[type]) {
      const region=REGIONS.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)?.id;
      world.enemies.push(createBestiaryEnemy(type,`enemy-${i}`,x,y,{region}));
      return;
    }
    const data=ENEMY_TYPES[type];
    world.enemies.push({id:`enemy-${i}`,type,x,y,homeX:x,homeY:y,hp:data.hp,maxHp:data.hp,attackTimer:0,phase:'idle',alive:true,respawnAt:0,boss:data.boss});
  });
  // New species occupy side routes. The original quest packs and boss arenas
  // remain authored in place, while optional champions stay far from Glutwacht.
  const newEncounters = [
    ['grave_rat',460,2220],['carrion_crow',990,2240],['gallows_cultist',1200,1550],
    ['ice_spider',250,750],['rime_archer',650,190],['glacier_ram',1240,390],['frost_witch',320,240],
    ['bone_hound',1800,520],['plague_spitter',2620,760],['grave_cantor',2970,1020],
    ['cinder_beetle',1820,2050],['ash_brute',2180,1270],['infernal_lancer',2660,1810],['soot_priest',3120,2100],
  ];
  newEncounters.forEach(([type,x,y])=>world.enemies.push(createBestiaryEnemy(type,`bestiary-${type}`,x,y)));
  const championNests = [
    ['wolf',210,2240],['slime',630,2180],['grave_rat',920,2120],['carrion_crow',1260,2240],['gallows_cultist',1260,1050],
    ['frostwolf',180,220],['ice_spider',460,170],['rime_archer',800,140],['glacier_ram',1180,150],['frost_witch',1350,670],
    ['skeleton',1750,180],['wraith',2200,180],['bone_hound',2900,180],['plague_spitter',3040,530],['grave_cantor',2850,980],
    ['imp',1760,2350],['cinder_beetle',2180,2340],['ash_brute',2980,1220],['infernal_lancer',3100,1710],['soot_priest',2860,2320],
  ];
  championNests.forEach(([type,x,y])=>world.enemies.push(createBestiaryEnemy(type,`champion-${type}`,x,y,{boss:true})));
  [[1085,1590],[1230,2010],[390,450],[1300,350],[2040,530],[2490,1030],[2920,900],[2310,1370],[1850,2260],[2990,2250]].forEach(([x,y],i)=>world.chests.push({id:`chest-${i}`,x,y,opened:false}));
  const usable = (o) => ![...world.nodes,...world.enemies,...world.chests].some(e=>Math.hypot(e.x-o.x,e.y-o.y)<(e.boss?110:55));
  world.trees=world.trees.filter(usable); world.rocks=world.rocks.filter(usable);
  return world;
}
