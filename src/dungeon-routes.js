// Authored route chambers: deterministic geometry, shared authoritative progress,
// and native player contacts. The original V9 boss arena stays at its old place.
import { createBestiaryEnemy, BESTIARY_ENEMIES } from './bestiary.js';
import { hitShape } from './encounter-geometry.js';
import { DUNGEONS, createDungeon } from './dungeons.js';

export const DUNGEON_LAYOUT_VERSION=2;
export const DUNGEON_ROUTE_HEIGHT=3840;
export const BOSS_ARENA={x:1104,y:32,w:664,h:1436};
const copy=value=>JSON.parse(JSON.stringify(value));
const finite=value=>Number.isFinite(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const alive=p=>p&&p.alive!==false&&!p.dead&&!p.downed&&(p.hp==null||p.hp>0)&&p.human!==false;
const actorId=p=>String(p.id??p.playerId??'local');
const rounded=n=>Math.round(n*1e6)/1e6;
const symbolNames={mond:'Mond',blatt:'Blatt',glut:'Glut',frost:'Frost',stern:'Stern'};
const THEMES={
  wurzelgewoelbe:{name:'Wurzelpfade',species:['root_hulk','scarecrow','steppe_raider'],symbols:['mond','blatt','glut'],offset:0},
  salzarchiv:{name:'Versunkene Lesegänge',species:['drowned_pike','brine_witch','tide_reaver'],symbols:['mond','stern','frost'],offset:1},
  dornenkloster:{name:'Drei Gärten',species:['thorn_knight','thorn_hunter','briar_widow'],symbols:['blatt','glut','mond'],offset:2},
  uhrwerk:{name:'Die verlorenen Stunden',species:['mirror_shade','bell_ringer','moon_construct'],symbols:['stern','mond','glut'],offset:3},
  frostkathedrale:{name:'Strophen des Winters',species:['frozen_dead','white_wraith','ice_mantis'],symbols:['mond','frost','stern'],offset:4},
  sturmzitadelle:{name:'Sturmgalerien',species:['dune_scorpion','sand_revenant','glass_serpent'],symbols:['glut','stern','mond'],offset:5},
  nachtschlund:{name:'Wege der letzten Stimmen',species:['dream_eater','veiled_witch','nightmare_hound'],symbols:['mond','glut','stern'],offset:6},
  weltenkern:{name:'Die drei Quelladern',species:['void_watcher','sleep_crawler','mirror_shade'],symbols:['stern','frost','glut'],offset:7},
};
const randomFor=initial=>{let seed=initial;return()=>{seed=(seed|0)+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
function shuffled(values,rng){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function wall(id,x,y,w,h,extra={}){return{id,type:'dungeon_wall',name:'Mauer der Reise',x,y,w,h,blocking:true,collision:{x,y,w,h},...extra};}
const inRectangle=(r,p)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
export function isInBossArena(instance,p){return!!instance&&!!p&&inRectangle(BOSS_ARENA,p);}

function canonicalChambers({id,seed}) {
  const theme=THEMES[id];if(!theme)throw new RangeError('Unbekannte Dungeonreise.');
  const rng=randomFor(seed+theme.offset*7919),chambers=[];
  for(const [stage,y] of [['A',2688],['B',1792]]) {
    const kinds=shuffled(['martial','relay','tactical'],rng);
    for(let lane=0;lane<3;lane++) {
      const x=96+lane*576,variant=(theme.offset+Math.floor(rng()*3)+(stage==='B'?1:0))%3;
      const chamberId=`${id}:route:${stage}:${lane}`,kind=kinds[lane],center=x+224;
      const symbols=shuffled(theme.symbols,rng),positions=shuffled([{x:center-120,y:y+312},{x:center+120,y:y+312},{x:center,y:y+96}],rng);
      const chamber={id:chamberId,stage,lane,kind,variant,x,y,w:448,h:512,centerX:center,name:`${theme.name} · ${stage==='A'?'Erste':'Zweite'} Prüfung`,
        title:kind==='martial'?'Wachtkampf':kind==='relay'?'Glutstaffel':'Wandelgang',coreId:`${chamberId}:core`,enemyIds:kind==='martial'?Array.from({length:3},(_,i)=>`${chamberId}:guard-${i}`):[],
        sequence:kind==='relay'?symbols:[],beacons:kind==='relay'?symbols.map((symbol,i)=>({id:`${chamberId}:beacon-${i}`,symbol,...positions[i]})):[],
        seconds:stage==='A'?16:14,
        hint:kind==='martial'?'Besiege alle drei Wächter dieses Weges. Deckung trennt ihre Sichtlinien.':kind==='relay'?`Trage die Glut: ${symbols.map(s=>symbolNames[s]).join(' → ')}. Jedes Zeichen zwei Sekunden halten; derselbe Träger muss alle drei erreichen.`:'Drei Querstreifen warnen 1,8 Sekunden vor dem Schlag. Warte auf einer ruhigen Insel und berühre das Zeichen am nördlichen Ende.'};
      chambers.push(chamber);
    }
  }
  return chambers;
}
export function dungeonRouteChambers(instance){return instance?.routes?.chambers||[];}
export function dungeonRouteSummary(instance){
  if(!instance?.routes)return null;
  const r=instance.routes,stageCleared=stage=>r.chambers.some(c=>c.stage===stage&&r.completed.includes(c.id));
  return{completed:r.completed.length,total:r.chambers.length,sigils:Number(stageCleared('A'))+Number(stageCleared('B')),stage:!stageCleared('A')?'A':!stageCleared('B')?'B':'boss',relay:r.relay?{...r.relay}:null};
}
/** Deferred personal first-clear rewards. Game pays these only with a real
 * boss completion and owns its per-character claim ledger; never pay on exit. */
export function dungeonRouteRewardCandidates(instance) {
  if(!instance?.routes||!instance.bossDefeated)return[];
  const eligible=instance.definition.raid||instance.definition.minLevel>=60&&instance.tier>=4;
  if(!eligible)return[];
  const completed=instance.routes.chambers.filter(c=>instance.routes.completed.includes(c.id));
  const mandatory=['A','B'].map(stage=>completed.find(c=>c.stage===stage)).filter(Boolean);
  const optional=completed.filter(c=>!mandatory.includes(c));
  return[...mandatory,...optional.slice(0,2)].map(c=>({id:c.id,tier:instance.tier,raidSigils:1}));
}
function stageGate(instance,stage) {
  const completed=instance.routes.chambers.some(c=>c.stage===stage&&instance.routes.completed.includes(c.id));
  for(const gate of instance.world.structures.filter(s=>s.routeStage===stage)){gate.open=completed;gate.blocking=!completed;}
}
function complete(instance,chamber) {
  if(instance.routes.completed.includes(chamber.id))return null;
  instance.routes.completed.push(chamber.id);instance.routes.completed.sort();
  if(instance.routes.relay?.chamberId===chamber.id)instance.routes.relay=null;
  const cache=instance.world.chests.find(c=>c.routeChamberId===chamber.id);if(cache)cache.locked=false;
  instance.world.puzzleObjects.filter(o=>o.routeChamberId===chamber.id).forEach(o=>{o.active=true;});
  stageGate(instance,chamber.stage);
  const routeReward={dust:2+instance.tier};
  return{success:true,event:'dungeon-route',target:chamber.id,routeReward,routeTier:instance.tier,
    message:`${chamber.title} gemeistert. ${dungeonRouteSummary(instance).sigils}/2 Wegsiegel · Vorratskiste geöffnet. Quellensiegel werden erst nach dem Bossabschluss vergeben.`};
}

/** Extends a freshly reconstructed legacy instance; never touches its boss data. */
export function installDungeonRoutes(instance) {
  const {world,id,seed,tier,definition}=instance,theme=THEMES[id],chambers=canonicalChambers({id,seed});
  world.height=DUNGEON_ROUTE_HEIGHT;world.regions[0].h=world.height;world.layoutVersion=2;instance.layoutVersion=2;
  world.structures=world.structures.filter(s=>s.id!=='wall-s');
  for(const wall of world.structures.filter(s=>['wall-w','wall-e'].includes(s.id))){wall.h=world.height;wall.collision.h=world.height;}
  world.structures.push(wall('wall-s',0,world.height-32,1800,32),wall('wall-legacy-s-left',32,1468,736,32),wall('wall-legacy-s-mid',960,1468,108,32),wall('wall-legacy-s-boss',1068,1468,700,32));
  const gateY={A:2656,B:1728};
  for(const stage of ['A','B']) {
    const doors=chambers.filter(c=>c.stage===stage).map(c=>({x:c.centerX-96,w:192})),y=gateY[stage];let cursor=32;
    for(const [i,door] of doors.entries()) {
      if(door.x>cursor)world.structures.push(wall(`${id}:route:${stage}:lintel-${i}`,cursor,y,door.x-cursor,32));
      world.structures.push(wall(`${id}:route:${stage}:gate-${i}`,door.x,y,door.w,32,{type:'dungeon_route_gate',name:`Wegsiegel ${stage}`,routeStage:stage,open:false}));cursor=door.x+door.w;
    }
    if(cursor<1768)world.structures.push(wall(`${id}:route:${stage}:lintel-end`,cursor,y,1768-cursor,32));
    const top=stage==='A'?2688:1760,bottom=stage==='A'?3264:2368;
    for(const [i,x] of [608,1184].entries())world.structures.push(wall(`${id}:route:${stage}:divider-${i}`,x,top,32,bottom-top));
  }
  world.rooms.push({id:'route-entry',name:'Die Wahl der Reisenden',x:40,y:3264,w:1720,h:536,color:'#38454a',intensity:.1},
    {id:'route-rest',name:'Zwischenrast · nächste Wegwahl',x:40,y:2368,w:1720,h:288,color:'#374b47',intensity:.15},
    {id:'route-convergence',name:'Zwei Erinnerungen, ein Ziel',x:40,y:1500,w:1720,h:228,color:'#42434f',intensity:.3});
  world.shrines.push({id:`${id}:route-rest`,x:896,y:2496,name:'Glut der Zwischenrast',region:id});
  world.paths.push({width:100,points:[[896,3584],[896,3376]]},{width:100,points:[[896,2496],[896,2420]]},{width:100,points:[[896,1620],[896,1380]]});
  world.puzzleObjects.push({id:`${id}:route-guide`,kind:'inscription',x:896,y:3440,label:'Drei Wege verstehen',text:'Wachtkampf, Glutstaffel oder Wandelgang: Auf jeder Ebene genügt ein Weg. Weitere Wege öffnen eigene Vorratskisten. Zwei Wegsiegel führen zu den alten Erinnerungen.',routeGuide:true,active:false});
  instance.spawn={x:896,y:3584};instance.exit={...instance.exit,x:800,y:3584};world.dungeonExit=instance.exit;
  instance.routes={version:1,chambers,completed:[],relay:null,hazardClocks:Object.fromEntries(chambers.filter(c=>c.kind==='tactical').map(c=>[c.id,0])),hazardHits:{},tacticalHolds:{}};
  for(const chamber of chambers) {
    world.rooms.push({id:chamber.id,name:`${chamber.title} · ${chamber.stage}`,x:chamber.x,y:chamber.y,w:chamber.w,h:chamber.h,color:chamber.kind==='martial'?'#493d48':chamber.kind==='relay'?'#42405b':'#3b4852',intensity:chamber.kind==='martial'?.7:.4});
    world.paths.push({width:80,points:[[chamber.centerX,chamber.y+512],[chamber.centerX,chamber.y+64]]});
    world.puzzleObjects.push({id:`${chamber.id}:hint`,kind:'inscription',x:chamber.centerX,y:chamber.y+456,label:`${chamber.title} · Regel lesen`,text:chamber.hint,routeChamberId:chamber.id,routeHint:true,active:false});
    world.chests.push({id:`${chamber.id}:cache`,routeChamberId:chamber.id,x:chamber.centerX+140,y:chamber.y+80,level:definition.level,tier,lootTier:tier,lootLevel:Math.min(100,definition.minLevel+Math.floor((tier-1)/2)),locked:true,opened:false,lootTable:'dungeon',rewards:{dust:1+tier}});
    if(chamber.kind==='martial') {
      const pillarX=chamber.centerX+(chamber.variant===0?0:chamber.variant===1?-72:72);
      world.structures.push(wall(`${chamber.id}:cover`,pillarX-28,chamber.y+224,56,80));
      const spots=[[chamber.centerX-145,chamber.y+144],[chamber.centerX+145,chamber.y+192],[chamber.centerX,chamber.y+352]];
      chamber.enemyIds.forEach((enemyId,i)=>{
        const type=theme.species[(i+chamber.variant)%theme.species.length],e=createBestiaryEnemy(type,enemyId,...spots[i],{level:definition.level});
        const hpScale=1+(tier-1)*.20,damageScale=1+(tier-1)*.075;
        e.hp=e.maxHp=Math.round(e.maxHp*hpScale);e.damage=Math.round(e.damage*damageScale);e.lootTier=tier;e.dungeon=true;e.routeChamberId=chamber.id;e.routeGuard=true;e.challengeId=chamber.id;e.respawnAt=Infinity;e.tier=tier;
        world.enemies.push(e);
      });
      world.puzzleObjects.push({id:chamber.coreId,kind:'route_core',x:chamber.centerX,y:chamber.y+64,label:'Wachtzeichen prüfen',routeChamberId:chamber.id,active:false});
    } else if(chamber.kind==='relay') {
      for(const beacon of chamber.beacons)world.puzzleObjects.push({...beacon,kind:'rune',label:`${symbolNames[beacon.symbol]} · Glut aufnehmen oder halten`,routeChamberId:chamber.id,routeBeacon:true,active:false});
      // Offset baffles make each authored variant change actual travel geometry.
      if(chamber.variant!==0)world.structures.push(wall(`${chamber.id}:baffle`,chamber.centerX+(chamber.variant===1?-36:16),chamber.y+208,20,56));
    } else {
      world.puzzleObjects.push({id:chamber.coreId,kind:'route_core',x:chamber.centerX,y:chamber.y+56,label:'Ruhiges Wegzeichen zwei Sekunden halten',routeChamberId:chamber.id,routeTactical:true,active:false});
    }
  }
  return instance;
}

function failure(instance,message){return{success:false,event:null,target:instance.id,message};}
export function interactDungeonRoute(instance,objectId,players=[]) {
  if(!instance?.routes)return failure(instance||{id:''},'Diese Reise hat keine Wegkammern.');
  const object=instance.world.puzzleObjects.find(o=>o.id===objectId),humans=[...new Map(players.filter(alive).map(p=>[actorId(p),p])).values()];
  const player=object&&humans.find(p=>distance(p,object)<=85);
  if(!player)return failure(instance,'Gehe näher an das Wegzeichen.');
  if(object.routeGuide||object.routeHint)return{success:true,event:null,target:instance.id,message:object.text};
  const chamber=instance.routes.chambers.find(c=>c.id===object.routeChamberId);if(!chamber)return failure(instance,'Unbekannter Reiseweg.');
  if(instance.routes.completed.includes(chamber.id))return{success:true,event:null,target:chamber.id,message:'Dieser Weg ist gemeistert. Seine Vorratskiste wartet.'};
  if(chamber.kind==='martial')return failure(instance,'Besiege zuerst alle drei Wächter dieses Weges.');
  if(chamber.kind==='tactical')return{success:true,event:null,target:chamber.id,message:'Halte das nördliche Wegzeichen zwei Sekunden. Die Querstreifen sind nur zwischen den Warnungen sicher.'};
  if(!object.routeBeacon)return failure(instance,'Lies zuerst die Glutfolge.');
  const r=instance.routes,relay=r.relay;
  if(relay&&relay.chamberId!==chamber.id)return failure(instance,'Die Gruppe trägt bereits eine andere Glut. Beende oder verlasse diese Staffel zuerst.');
  if(relay&&relay.actorId!==actorId(player))return failure(instance,'Nur der aktuelle Glutträger kann das nächste Zeichen halten.');
  const step=relay?.step||0;
  if(object.id!==chamber.beacons[step]?.id){r.relay=null;clearRelayObjects(instance,chamber);return failure(instance,'Falsches Zeichen: Die Glut erlischt. Lies die Folge und beginne erneut.');}
  if(!relay)r.relay={chamberId:chamber.id,actorId:actorId(player),step:0,hold:0,remaining:chamber.seconds,holding:true};
  else relay.holding=true;
  return{success:true,event:null,target:chamber.id,message:`${symbolNames[object.symbol]}: zwei Sekunden ruhig halten. ${step+1}/3`};
}
function clearRelayObjects(instance,chamber){instance.world.puzzleObjects.filter(o=>o.routeChamberId===chamber.id&&o.routeBeacon).forEach(o=>{o.active=false;});}
export function routeHazardShapes(chamber,clock) {
  if(chamber.kind!=='tactical')return[];
  const left=chamber.lane===0?32:chamber.lane===1?640:1216,right=chamber.lane===0?608:chamber.lane===1?1184:1768;
  return Array.from({length:3},(_,band)=>{
    // Each strip's first activation gets its complete warning, including when
    // the room is entered for the first time. Variants change the real order.
    const order=[[0,1,2],[1,2,0],[2,0,1]][chamber.variant],shifted=clock-order[band]*2,cycle=Math.floor(shifted/6),phase=shifted-cycle*6;
    const y=chamber.y+128+band*128;
    return{band,cycle,warning:shifted>=0&&phase<1.8,active:shifted>=0&&phase>=1.8&&phase<3.2,remaining:shifted<0?-shifted:phase<1.8?1.8-phase:phase<3.2?3.2-phase:6-phase,
      shape:{kind:'segment',x1:left+12,y1:y,x2:right-12,y2:y,width:28}};
  });
}
export function updateDungeonRoutes(instance,dt,players=[]) {
  if(!instance?.routes)return[];
  const r=instance.routes,step=Math.min(.25,Math.max(0,dt)),humans=[...new Map(players.filter(alive).map(p=>[actorId(p),p])).values()],events=[];
  const emit=event=>{if(event)events.push(event);};
  for(const chamber of r.chambers) {
    if(r.completed.includes(chamber.id))continue;
    if(chamber.kind==='martial') {
      const guards=chamber.enemyIds.map(id=>instance.world.enemies.find(e=>e.id===id));
      if(guards.every(e=>e&&!e.alive&&e.hp<=0))emit(complete(instance,chamber));
    }
    if(chamber.kind==='tactical') {
      const occupants=humans.filter(p=>p.x>chamber.lane*576+32&&p.x<(chamber.lane+1)*576+32&&p.y>chamber.y&&p.y<chamber.y+512);
      if(!occupants.length){r.tacticalHolds[chamber.id]=0;continue;}
      r.hazardClocks[chamber.id]=rounded(r.hazardClocks[chamber.id]+step);
      const phases=routeHazardShapes(chamber,r.hazardClocks[chamber.id]);
      for(const phase of phases) {
        const source=`${chamber.id}:band-${phase.band}:cycle-${phase.cycle}`,hits=r.hazardHits[source]||=[];
        if(phase.warning||phase.active)events.push({event:'mechanic',mechanic:'route-warning',target:chamber.id,
          hazards:[{id:source,kind:'warning',routeHazard:true,shape:phase.shape,x:chamber.centerX,y:phase.shape.y1,radius:300,
            color:phase.active?'#e59577':'#d5b980',windup:phase.warning,active:phase.active,life:Math.max(.05,phase.remaining),maxLife:phase.warning?1.8:1.4,name:'Wandelgang · Querstreifen'}]});
        if(phase.active)for(const p of occupants)if(!hits.includes(actorId(p))&&hitShape(phase.shape,p)) {
          hits.push(actorId(p));events.push({event:'mechanic',mechanic:'route-impact',target:chamber.id,
            damageEvents:[{actorId:actorId(p),shape:phase.shape,damageFraction:.13,attackerLevel:instance.definition.level,attackerId:source}]});
        }
      }
      const validSources=new Set(phases.map(p=>`${chamber.id}:band-${p.band}:cycle-${p.cycle}`));
      for(const key of Object.keys(r.hazardHits))if(key.startsWith(`${chamber.id}:`)&&!validSources.has(key))delete r.hazardHits[key];
      const core=instance.world.puzzleObjects.find(o=>o.id===chamber.coreId);
      r.tacticalHolds[chamber.id]=occupants.some(p=>distance(p,core)<=30)?rounded((r.tacticalHolds[chamber.id]||0)+step):0;
      if(r.tacticalHolds[chamber.id]>=2)emit(complete(instance,chamber));
    }
  }
  if(r.relay) {
    const relay=r.relay,chamber=r.chambers.find(c=>c.id===relay.chamberId),carrier=humans.find(p=>actorId(p)===relay.actorId);
    relay.remaining=rounded(relay.remaining-step);
    if(!carrier||!inRectangle({x:chamber.lane*576+32,y:chamber.y-64,w:544,h:640},carrier)||relay.remaining<=0){r.relay=null;clearRelayObjects(instance,chamber);events.push({event:'mechanic',mechanic:'route-relay-failed',target:chamber.id,message:'Die Glut erlischt. Die Staffel kann sofort neu beginnen.'});}
    else if(relay.holding) {
      const beacon=chamber.beacons[relay.step];relay.hold=distance(carrier,beacon)<=30?rounded(relay.hold+step):0;
      if(relay.hold>=2) {
        const object=instance.world.puzzleObjects.find(o=>o.id===beacon.id);object.active=true;
        relay.step++;relay.hold=0;relay.holding=false;
        if(relay.step>=3)emit(complete(instance,chamber));
        else events.push({event:'mechanic',mechanic:'route-relay-step',target:chamber.id,message:`Glut ${relay.step}/3 · nächstes Zeichen: ${symbolNames[chamber.beacons[relay.step].symbol]}`});
      }
    }
  }
  return events;
}

export function captureDungeonRoutes(instance) {
  if(!instance?.routes)return null;
  const r=instance.routes;return copy({version:1,completed:r.completed,relay:r.relay,hazardClocks:r.hazardClocks,hazardHits:r.hazardHits,tacticalHolds:r.tacticalHolds});
}
function uniqueStrings(values,allowed,max){return Array.isArray(values)&&values.length<=max&&new Set(values).size===values.length&&values.every(v=>typeof v==='string'&&allowed.has(v));}
export function validateDungeonRouteSave(saved,{id,tier,seed,layoutVersion=1,enemies=[],openedChests=[]}={}) {
  if(layoutVersion===1){if(saved!==undefined&&saved!==null)throw new Error('Legacy-Dungeons besitzen keine Reisekammern.');return true;}
  if(layoutVersion!==2||!THEMES[id]||!Number.isInteger(tier)||tier<1||tier>30||!finite(seed))throw new Error('Ungültige Dungeonreise-Version.');
  if(!record(saved)||saved.version!==1||Object.keys(saved).some(k=>!['version','completed','relay','hazardClocks','hazardHits','tacticalHolds'].includes(k)))throw new Error('Ungültige Reisekammern.');
  const chambers=canonicalChambers({id,seed}),ids=new Set(chambers.map(c=>c.id)),tactical=new Set(chambers.filter(c=>c.kind==='tactical').map(c=>c.id));
  if(!uniqueStrings(saved.completed,ids,6)||!record(saved.hazardClocks)||!record(saved.hazardHits)||!record(saved.tacticalHolds))throw new Error('Ungültiger Reiseweg-Fortschritt.');
  if(Object.keys(saved.hazardClocks).length!==tactical.size||Object.entries(saved.hazardClocks).some(([key,value])=>!tactical.has(key)||!finite(value)||value<0||value>1e7))throw new Error('Ungültige Wandelgangzeit.');
  if(Object.entries(saved.tacticalHolds).some(([key,value])=>!tactical.has(key)||!finite(value)||value<0||value>2.25))throw new Error('Ungültiges Wegzeichen.');
  for(const [key,values] of Object.entries(saved.hazardHits)) {
    const chamber=chambers.find(c=>c.kind==='tactical'&&key.startsWith(`${c.id}:band-`));
    const valid=chamber&&routeHazardShapes(chamber,saved.hazardClocks[chamber.id]).some(phase=>key===`${chamber.id}:band-${phase.band}:cycle-${phase.cycle}`);
    if(!valid||!Array.isArray(values)||values.length>8||new Set(values).size!==values.length||values.some(v=>typeof v!=='string'||!v||v.length>120))throw new Error('Ungültige Wandelgangtreffer.');
  }
  if(saved.relay!==null) {
    const r=saved.relay,c=chambers.find(c=>c.id===r?.chamberId&&c.kind==='relay');
    if(!record(r)||Object.keys(r).some(k=>!['chamberId','actorId','step','hold','remaining','holding'].includes(k))||!c||saved.completed.includes(c.id)||typeof r.actorId!=='string'||!r.actorId||r.actorId.length>120||!Number.isInteger(r.step)||r.step<0||r.step>2||!finite(r.hold)||r.hold<0||r.hold>=2||!finite(r.remaining)||r.remaining<=0||r.remaining>c.seconds||typeof r.holding!=='boolean'||!r.holding&&r.hold!==0)throw new Error('Ungültige Glutstaffel.');
  }
  const definition=DUNGEONS.find(d=>d.id===id),routeActors=enemies.filter(e=>typeof e?.id==='string'&&e.id.startsWith(`${id}:route:`)),actorIds=new Set();
  const canonical=createDungeon(id,{tier,seed,layoutVersion:2});
  for(const stage of ['A','B']) {
    const open=chambers.some(c=>c.stage===stage&&saved.completed.includes(c.id));
    canonical.world.structures.filter(s=>s.routeStage===stage).forEach(s=>{s.blocking=!open;});
  }
  for(const e of routeActors) {
    const chamber=chambers.find(c=>c.enemyIds.includes(e.id));
    if(!chamber||actorIds.has(e.id)||typeof e.alive!=='boolean'||!finite(e.hp)||e.hp<0||!finite(e.x)||!finite(e.y)||e.x<32||e.x>1768||e.y<32||e.y>DUNGEON_ROUTE_HEIGHT-32)throw new Error('Ungültiger Wegwächter.');
    actorIds.add(e.id);
    const index=chamber.enemyIds.indexOf(e.id),type=THEMES[id].species[(index+chamber.variant)%3],trusted=createBestiaryEnemy(type,e.id,0,0,{level:definition.level});
    const maximum=Math.round(trusted.maxHp*(1+(tier-1)*.2));
    if(e.type!==type||e.level!==definition.level||e.maxHp!==maximum||e.hp>maximum||e.alive&&e.hp<=0||!e.alive&&e.hp>0||saved.completed.includes(chamber.id)&&(e.alive||e.hp>0))throw new Error('Der Wegwächter passt nicht zu seiner Kammer.');
    if(canonical.world.structures.some(s=>s.blocking&&s.id!==`${id}:gate`&&s.type!=='puzzle_crate'&&e.x+10>s.collision.x&&e.x-10<s.collision.x+s.collision.w&&e.y+10>s.collision.y&&e.y-10<s.collision.y+s.collision.h))throw new Error('Der Wegwächter steht in festem Mauerwerk.');
  }
  for(const chamber of chambers.filter(c=>c.kind==='martial'))if(chamber.enemyIds.some(enemyId=>!actorIds.has(enemyId)))throw new Error('Die Wachtgruppe fehlt im Reisespeicher.');
  for(const chestId of openedChests.filter(v=>typeof v==='string'&&v.startsWith(`${id}:route:`))) {
    const chamber=chambers.find(c=>`${c.id}:cache`===chestId);if(!chamber||!saved.completed.includes(chamber.id))throw new Error('Unverdiente Reisebeute.');
  }
  return true;
}
export function restoreDungeonRoutes(instance,saved) {
  if(!instance?.routes)return instance;
  validateDungeonRouteSave(saved,{id:instance.id,tier:instance.tier,seed:instance.seed,layoutVersion:instance.layoutVersion,enemies:instance.world.enemies,openedChests:instance.world.chests.filter(c=>c.opened).map(c=>c.id)});
  Object.assign(instance.routes,copy(saved));
  for(const stage of ['A','B'])stageGate(instance,stage);
  for(const chamber of instance.routes.chambers) {
    const done=instance.routes.completed.includes(chamber.id),cache=instance.world.chests.find(c=>c.routeChamberId===chamber.id);if(cache)cache.locked=!done;
    instance.world.puzzleObjects.filter(o=>o.routeChamberId===chamber.id&&!o.routeHint).forEach(o=>{
      o.active=done||chamber.kind==='relay'&&instance.routes.relay?.chamberId===chamber.id&&chamber.beacons.findIndex(b=>b.id===o.id)<instance.routes.relay.step;
    });
  }
  return instance;
}
