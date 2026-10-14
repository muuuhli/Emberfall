import { BESTIARY_ENEMIES, REGION_ENEMY_POOLS, bestiaryCombatStats } from './bestiary.js';
import { NAMED_BOSS_ENEMIES, NAMED_BOSS_HUNTS } from './encounter-content.js';
import { EXPEDITION_CONTENT } from './expedition-content.js';

const alive = value => value && value.hp !== 0 && !value.dead && !value.downed && value.alive !== false;
const body = value => value?.player || value;
const playersOf = values => (values || []).map(body).filter(alive);
const playerId = player => String(player.id || 'local');
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const statusNames = { idle: 'Bereit', active: 'Läuft', success: 'Belohnung bereit', failure: 'Gescheitert', rewarded: 'Erholt sich' };

const namedBosses = [
  ['mourning_bell', 'Die Trauerglocke', 'bell_ringer_boss', 'ring', 8, '#aa9980'],
  ['harbor_bailiff', 'Vark, Richter der Ertrunkenen', 'drowned_pike_boss', 'charge', 1, '#8eacb3'],
  ['furnace_widow', 'Sereva, Witwe des Ofens', 'furnace_acolyte_boss', 'fan', 5, '#bd816c'],
  ['sleep_judge', 'Der Richter ohne Augen', 'veiled_witch_boss', 'hex', 1, '#aa92b2'],
];
export const WORLD_EVENT_ENEMIES = Object.freeze({...Object.fromEntries(namedBosses.map(([id, name, source, pattern, count, color]) => {
  const parent = BESTIARY_ENEMIES[source];
  const def = { ...parent, id, name, color, species: false, speciesId: id, baseType: parent.baseType,
    questTarget: undefined, hpScale: parent.hpScale * 1.15, damageScale: parent.damageScale * .9,
    combat: { ...parent.combat, pattern, windup: pattern === 'hex' ? 1.8 : 1.4, recovery: 1.65,
      projectileCount: count, projectileSpeed: pattern === 'ring' ? 95 : 145, spread: 1.15,
      chargeDistance: 230, preferredRange: pattern === 'ring' ? 170 : 190, telegraphRadius: pattern === 'hex' ? 90 : 105 },
    description: 'Ein benannter Expeditionsboss. Seine Warnungen bleiben auch in der zweiten Phase vollständig sichtbar.' };
  return [id, { ...def, ...bestiaryCombatStats(def, parent.level) }];
})),...NAMED_BOSS_ENEMIES});

// The rules are deliberately authored, not one arena copied sixteen times.
// Locations are fractions of the owning biome; placement adds a clear route.
const REGIONAL_EVENT_DEFINITIONS = Object.freeze([
  { id:'event-daemmerhain',region:'daemmerhain',name:'Das letzte Begräbnis',mode:'defend',at:[.34,.78],duration:42,waves:[2,2,1],targetName:'Wagen der Namenlosen',description:'Halte 42 Sekunden beim Leichenwagen aus. Drei Rudel kommen aus dem Hain. Tote dürfen nicht noch einmal verschwinden.' },
  { id:'event-frostgrat',region:'frostgrat',name:'Eine Laterne gegen den Winter',mode:'escort',at:[.32,.58],targetName:'Fährmann Osvik',speed:22,description:'Begleite Osvik zur Felslaterne. Er wartet bei Feinden und an zwei Wegmarken; bleibe bei ihm und beseitige die Frostwölfe.' },
  { id:'event-aschenmoor',region:'aschenmoor',name:'Namen unter dem Moor',mode:'ritual',rule:'sequence',symbols:['asche','knochen','name'],at:[.58,.7],description:'Die Grabtafel nennt die Reihenfolge: Asche, Knochen, Name. Berühre die drei Zeichen, während die Toten ihre Namen zurückfordern.' },
  { id:'event-glutoede',region:'glutoede',name:'Die hungrige Schmiede',mode:'seal_choice',at:[.43,.7],options:[{id:'extinguish',name:'Die Glut löschen',text:'Drei Glutbruten vertreiben; normale Belohnung.',pack:3,bonus:1},{id:'feed',name:'Die Glut nähren',text:'Einen Aschenbrecher herausfordern; 40 % mehr Abschlussbeute.',boss:'ash_brute_boss',bonus:1.4}],description:'Der Ofen frisst Erinnerungen. Lösche ihn für die Flüchtlinge oder nähre ihn und stelle dich seinem entfesselten Wächter.' },
  { id:'event-sonnensteppe',region:'sonnensteppe',name:'Saat für einen schwarzen Morgen',mode:'defend',at:[.57,.82],duration:48,waves:[2,3,2],targetName:'Letzte Saatkolonne',repairs:2,description:'Schütze die Saatkolonne 48 Sekunden vor Räubern und Hungerhyänen. Zwei Reparaturen retten den Wagen, wenn die Angreifer durchbrechen.' },
  { id:'event-jadeauen',region:'jadeauen',name:'Netze im vergifteten Schilf',mode:'ambush',at:[.66,.76],traps:3,pack:4,description:'Drei Schilffallen markieren einen Hinterhalt. Entschärfe sie während der achtsekündigen Warnung: Jede offene Falle ruft einen weiteren Jäger.' },
  { id:'event-sturmkueste',region:'sturmkueste',name:'Der Zoll der Ertrunkenen',mode:'boss_hunt',at:[.72,.7],boss:'tide_reaver_boss',tracks:3,description:'Untersuche drei salzige Spuren. Erst die dritte ruft den Gezeitenfürsten. Sein Tod gibt die Namen der verschollenen Seeleute frei.' },
  { id:'event-dornwildnis',region:'dornwildnis',name:'Ein Herz hinter Dornen',mode:'boss_hunt',at:[.61,.8],boss:'antler_horror_boss',tracks:2,description:'Zerschlage zwei Blutwurzelsiegel, um den Geweihschrecken hervorzulocken. Jedes Siegel kündigt seinen Wächter an; bekämpfe ihn vor dem letzten Ruf.' },
  { id:'event-obsidianpass',region:'obsidianpass',name:'Der Wall der gebrochenen Eide',mode:'defend',at:[.57,.78],duration:50,waves:[2,2,3],targetName:'Glaswall-Signalfeuer',repairs:3,description:'Halte das Signalfeuer 50 Sekunden gegen die Glaslegion. Repariere seine drei Ketten bei Bedarf; die Glut darf nicht vor dem Morgen erlöschen.' },
  { id:'event-mondbruch',region:'mondbruch',name:'Die Stunde, die fehlen muss',mode:'ritual',rule:'switches',pattern:[true,false,true],at:[.56,.72],description:'Eine Inschrift warnt: Tag und Nacht tragen die Uhr, die Stunde dazwischen muss ruhen. Aktiviere das erste und dritte Gegengewicht, nicht das zweite.' },
  { id:'event-permafrost',region:'permafrost',name:'Die zweite Stimme des Eises',mode:'escort',at:[.6,.74],targetName:'Sivs verlorene Stimme',speed:19,description:'Führe die verlorene Stimme an drei vereisten Wegmarken vorbei. Sie bewegt sich nur im Licht deiner Nähe und wartet, solange die Eisleichen folgen.' },
  { id:'event-sandsenke',region:'sandsenke',name:'Wasser für die Namenlosen',mode:'escort',at:[.55,.73],targetName:'Karawane der letzten Brunnen',speed:24,repairs:2,description:'Eskortiere die dürstende Karawane. Zwei Wasserpausen heilen sie, doch an jeder Wegmarke lauern Grabskorpione und Dünenwiedergänger.' },
  { id:'event-traumsenke',region:'traumsenke',name:'Wach auf, bevor es dich kennt',mode:'ambush',at:[.55,.77],traps:2,pack:3,description:'Öffne die zwei Traumknoten vor dem Hinterhalt. Ungebrochene Knoten lassen Albtraumhunde folgen. Besiege den letzten Traum, um die Schlafenden zu wecken.' },
  { id:'event-blutmark',region:'blutmark',name:'Das Banner und die Kinder',mode:'seal_choice',at:[.56,.8],options:[{id:'mercy',name:'Die Gefangenen lösen',text:'Zwei Legionäre vertreiben und Leben im Banner bewahren.',pack:2,bonus:1},{id:'vengeance',name:'Den Bluteid erwidern',text:'Das Kriegsungetüm bezwingen; 50 % mehr Abschlussbeute.',boss:'war_abomination_boss',bonus:1.5}],description:'Unter dem Blutbanner warten Gefangene. Brich seine Fesseln oder fordere das Kriegsungetüm zum Duell. Beide Wege beenden den Fluch.' },
  { id:'event-sternensund',region:'sternensund',name:'Die Karte aus kaltem Licht',mode:'ritual',rule:'alignment',rotations:[1,2,3],at:[.56,.8],description:'Richte die drei Sternlinsen nach Osten, Süden und Westen. Jede Linse dreht sich im Uhrzeigersinn. Besiege danach die Wächter der zerbrochenen Karte.' },
  { id:'event-nexusriss',region:'nexusriss',name:'Drei Narben der Quelle',mode:'boss_hunt',at:[.52,.68],boss:'abyss_beholder_boss',tracks:3,description:'Schließe die drei Quellnarben nacheinander. Jede Narbe ruft einen Risshetzer. Das Abgrundauge tritt erst hervor, wenn du die dritte bindest.' },
]);
export const WORLD_EVENT_DEFINITIONS = Object.freeze([...REGIONAL_EVENT_DEFINITIONS,...NAMED_BOSS_HUNTS]);

const LEGACY_EXPEDITIONS = Object.freeze([
  {id:'expedition-trauerweg',region:'daemmerhain',name:'Der Weg der Trauerglocke',level:3,minLevel:3,at:[.19,.52],mode:'expedition',description:'Ein kurzer Weg durch die Gräber: Wähle, wessen Asche du trägst, durchbrich den Hinterhalt und ordne die drei letzten Namen vor der Trauerglocke.',stages:[{type:'choice',safe:'Die Namen bewahren',risk:'Das Grab plündern'},{type:'ambush',pack:2,traps:2},{type:'ritual',rule:'sequence',symbols:['mond','asche','name']},{type:'boss_hunt',boss:'mourning_bell',tracks:1}]},
  {id:'expedition-salzzug',region:'sturmkueste',name:'Der letzte Salzzug',level:30,minLevel:28,at:[.33,.78],mode:'expedition',description:'Begleite eine Fracht der Verschollenen. Entscheide zwischen sicherem Licht und verbotener Ladung, eskortiere den Karren und öffne das Tor zum Hafenrichter.',stages:[{type:'choice',safe:'Die Leuchte entzünden',risk:'Die verbotene Ladung öffnen'},{type:'escort',targetName:'Karren der Verschollenen',speed:25},{type:'ritual',rule:'switches',pattern:[false,true,true]},{type:'boss_hunt',boss:'harbor_bailiff',tracks:1}]},
  {id:'expedition-ofenpfad',region:'obsidianpass',name:'Der Pfad der Ofenwitwe',level:46,minLevel:44,at:[.3,.79],mode:'expedition',description:'Stiehl den Glasschmieden ihr letztes Feuer. Ein Eid oder eine Opfergabe öffnet den Weg; halte den Ofen, richte seine Linsen aus und brich Serevas Herrschaft.',stages:[{type:'choice',safe:'Den alten Eid halten',risk:'Eine Opfergabe nehmen'},{type:'defend',duration:25,waves:[2,2],targetName:'Ofen der vergessenen Wacht',repairs:2},{type:'ritual',rule:'alignment',rotations:[3,1,2]},{type:'boss_hunt',boss:'furnace_widow',tracks:1}]},
  {id:'expedition-schlafgericht',region:'traumsenke',name:'Das Gericht der Schlaflosen',level:78,minLevel:76,at:[.28,.77],mode:'expedition',description:'Ein Gericht urteilt über fremde Träume. Wähle Erinnerung oder Beute, halte das einzelne Wachlicht, zerreiße die Albtraumknoten und stelle dich dem Richter ohne Augen.',stages:[{type:'choice',safe:'Die Erinnerung zurückgeben',risk:'Den fremden Traum nehmen'},{type:'ritual',rule:'hold',duration:5},{type:'ambush',pack:3,traps:2},{type:'boss_hunt',boss:'sleep_judge',tracks:1}]},
]);
export const EXPEDITIONS = Object.freeze([...LEGACY_EXPEDITIONS,...EXPEDITION_CONTENT]);
// Preserve the placement order of the original twenty activities. New hunts
// append after them, so saved routes and one-use evidence do not move.
const allDefinitions = [...REGIONAL_EVENT_DEFINITIONS,...LEGACY_EXPEDITIONS,...NAMED_BOSS_HUNTS,...EXPEDITION_CONTENT];
const definitionOf = event => allDefinitions.find(def => def.id === event.id);

function addObject(world,event,role,x,y,changes={}) {
  const index=world.eventObjects.filter(o=>o.eventId===event.id&&o.role!=='start'&&o.role!=='reward').length;
  const object={id:role==='start'||role==='reward'?`${event.id}:${role}`:`${event.id}:prop:${index}`,eventId:event.id,
    kind:'world_event',role,x,y,region:event.region,level:event.level,color:event.color,name:event.name,
    label:role==='start'?'Abenteuer beginnen':role==='reward'?'Abschlussbelohnung bergen':'Zeichen berühren',description:event.description,active:false,hidden:false,...changes};
  world.eventObjects.push(object);return object;
}
function ownObjects(world,event) {return world.eventObjects.filter(o=>o.eventId===event.id);}
function ownEnemies(world,event) {return world.enemies.filter(e=>e.eventId===event.id&&e.eventRun===event.run&&e.alive);}
function cleanup(world,event) {for(const enemy of ownEnemies(world,event))Object.assign(enemy,{alive:false,hp:0,respawnAt:Infinity});}
function effect(kind,event,text,extra={}) {return {kind,eventId:event.id,text,x:event.x,y:event.y,...extra};}

function placement(world,region,def) {
  const base={x:region.x+region.w*def.at[0],y:region.y+region.h*def.at[1]};
  for(let n=0;n<80;n++) {
    const angle=n*2.399963229728653,radius=n?40*Math.sqrt(n):0;
    const point={x:Math.round(clamp(base.x+Math.cos(angle)*radius,region.x+210,region.x+region.w-210)),y:Math.round(clamp(base.y+Math.sin(angle)*radius,region.y+210,region.y+region.h-210))};
    if(world.worldEvents.some(e=>distance(e,point)<350)||world.shrines.some(s=>distance(s,point)<300)||world.enemies.some(e=>distance(e,point)<(e.boss?300:120)))continue;
    if(world.structures.some(s=>s.blocking!==false&&point.x>s.x-220&&point.x<s.x+s.w+220&&point.y>s.y-220&&point.y<s.y+s.h+220))continue;
    return point;
  }
  return base;
}

export function addWorldEvents(world) {
  if(world.worldEvents)return world;
  world.worldEvents=[];world.eventObjects=[];
  for(const def of allDefinitions) {
    const region=world.regions.find(r=>r.id===def.region);if(!region)continue;
    const point=placement(world,region,def),level=def.level||region.level;
    const event={id:def.id,name:def.name,description:def.description,region:def.region,level,minLevel:def.minLevel||Math.max(1,level-2),
      color:region.color||'#a58a70',...point,mode:def.mode,state:'idle',phase:'ready',elapsed:0,stageIndex:0,run:0,completions:0,rewardedRuns:0,readyAt:0,
      participants:[],claimedBy:[],pending:[],objective:{type:'start',progress:0,goal:1,label:def.description},bonus:1};
    world.worldEvents.push(event);addObject(world,event,'start',point.x,point.y);addObject(world,event,'reward',point.x+55,point.y,{hidden:true});
    // Clearing the authored encounter footprint gives moving NPCs and every
    // puzzle prop a broad, visible approach without copying dungeon geometry.
    world.trees=world.trees.filter(o=>distance(o,point)>260);world.rocks=world.rocks.filter(o=>distance(o,point)>260);
    const closest=world.paths.flatMap(path=>path.points).filter(p=>p[0]>=region.x&&p[0]<=region.x+region.w&&p[1]>=region.y&&p[1]<=region.y+region.h)
      .sort((a,b)=>Math.hypot(a[0]-point.x,a[1]-point.y)-Math.hypot(b[0]-point.x,b[1]-point.y))[0];
    if(closest) {
      const segmentDistance=o=>{const dx=closest[0]-point.x,dy=closest[1]-point.y,t=clamp(((o.x-point.x)*dx+(o.y-point.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(o.x-point.x-t*dx,o.y-point.y-t*dy);};
      world.paths.push({width:72,region:region.id,points:[closest,[point.x,point.y]]});
      world.trees=world.trees.filter(o=>segmentDistance(o)>65);world.rocks=world.rocks.filter(o=>segmentDistance(o)>65);
    }
  }
  return world;
}

function stageOf(event) {const def=definitionOf(event);return def.mode==='expedition'?def.stages[event.stageIndex]:{...def,type:def.mode};}
function wave(world,event,count,{delay=2,boss,type}={}) {
  event.pending.push({at:event.elapsed+delay,count,boss,type,wave:event.waveSerial++});
  event.warningUntil=event.elapsed+delay;
  return effect('warning',event,boss?'Ein mächtiger Gegner antwortet. Verlasse die rote Fläche!':'Schatten sammeln sich. Bereite dich auf den Angriff vor.',{duration:delay,radius:170});
}
function setupStage(world,event) {
  world.eventObjects=world.eventObjects.filter(o=>o.eventId!==event.id||['start','reward'].includes(o.role));
  event.stageStartedAt=event.elapsed;event.phase='objective';event.pending=[];event.waveSerial=0;event.waveIndex=0;event.mistakes=0;event.hold=0;event.escortIndex=0;event.absent=0;event.choiceCombat=false;
  const stage=stageOf(event),effects=[];
  if(!stage)return finishEvent(world,event);
  event.stageType=stage.type;
  const x=event.x,y=event.y;
  if(stage.type==='choice'||stage.type==='seal_choice') {
    const options=stage.options||[{id:'safe',name:stage.safe,text:'Weniger Gegner; normale Beute.',bonus:1},{id:'risk',name:stage.risk,text:'Mehr Gegner und stärkere Bosse; 25 % mehr Abschlussbeute.',bonus:1.25}];
    options.forEach((option,index)=>addObject(world,event,'choice',x+(index?75:-75),y,{label:option.name,name:option.name,description:option.text,choice:option.id}));
    event.objective={type:'choice',progress:0,goal:1,label:'Entscheide dich am linken oder rechten Zeichen.'};
  } else if(stage.type==='defend') {
    const hp=Math.round((140+event.level*12)*(stage.duration<30?.85:1));
    addObject(world,event,'objective',x,y,{name:stage.targetName,label:'Beschädigte Wacht reparieren',hp,maxHp:hp,repairsLeft:stage.repairs||0});
    event.objective={type:'defend',progress:0,goal:stage.duration,label:`Schütze ${stage.targetName} ${stage.duration} Sekunden.`};
    effects.push(wave(world,event,(stage.waves||[2,2])[0]+(event.risky?1:0)));
  } else if(stage.type==='escort') {
    const hp=Math.round(180+event.level*12);
    addObject(world,event,'escort',x-130,y,{name:stage.targetName,label:stage.repairs?'Wasserpause einlegen':'Bei der Eskorte bleiben',hp,maxHp:hp,repairsLeft:stage.repairs||0});
    event.route=[{x:x-130,y},{x,y:y-90},{x:x+150,y:y-90}];
    event.objective={type:'escort',progress:0,goal:2,label:`Begleite ${stage.targetName} an beiden Wegmarken vorbei.`};
    effects.push(wave(world,event,2+(event.risky?1:0)));
  } else if(stage.type==='ritual') {
    const rule=stage.rule||'sequence',count=rule==='hold'?1:3;
    for(let i=0;i<count;i++)addObject(world,event,'rune',x+(i-(count-1)/2)*90,y,{index:i,symbol:stage.symbols?.[i],rotation:0,
      name:stage.symbols?.[i]||`${rule==='alignment'?'Linse':'Gegengewicht'} ${i+1}`,label:rule==='alignment'?'Linse im Uhrzeigersinn drehen':rule==='switches'?'Gegengewicht umlegen':rule==='hold'?'Wachlicht halten':'Rune berühren'});
    event.objective={type:'ritual',progress:0,goal:rule==='hold'?stage.duration||5:3,label:rule==='sequence'?`Runenfolge: ${stage.symbols.join(' → ')}`:rule==='alignment'?`Linsen: ${stage.rotations.map(n=>['Nord','Ost','Süd','West'][n]).join(' → ')}`:rule==='switches'?`Aktiviere Gegengewichte ${stage.pattern.map((yes,i)=>yes?i+1:null).filter(Boolean).join(' und ')}.`:'Bleibe fünf Sekunden im einzelnen Wachlicht.'};
    effects.push(wave(world,event,1));
  } else if(stage.type==='ambush') {
    for(let i=0;i<(stage.traps||2);i++)addObject(world,event,'rune',x+(i-1)*85,y+50,{index:i,label:'Hinterhaltsknoten entschärfen',name:`Hinterhaltsknoten ${i+1}`});
    event.objective={type:'ambush',progress:0,goal:stage.traps||2,label:'Entschärfe die Knoten vor dem Hinterhalt; besiege danach alle Angreifer.'};
    effects.push(wave(world,event,(stage.pack||3)+(event.risky?1:0),{delay:8}));
  } else if(stage.type==='boss_hunt') {
    for(let i=0;i<(stage.tracks||1);i++)addObject(world,event,'rune',x+(i-1)*85,y-35,{index:i,label:'Spur binden und Gegner hervorrufen',name:`Verfluchte Spur ${i+1}`});
    event.objective={type:'boss_hunt',progress:0,goal:stage.tracks||1,label:'Binde die Spuren und bezwinge den gerufenen Boss.'};
  }
  return effects;
}

function failEvent(world,event,message,time) {
  event.state='failure';event.phase='failed';event.readyAt=time+60;event.pending=[];cleanup(world,event);
  for(const object of ownObjects(world,event))object.hidden=!['start'].includes(object.role);
  return [effect('failure',event,message)];
}
function finishEvent(world,event) {
  event.state='success';event.phase='complete';event.completions++;event.completedAt=event.clock;event.readyAt=event.clock+360;
  event.runRewardFactor=event.rewardedRuns===0?1:event.rewardedRuns===1?.5:.25;
  for(const object of ownObjects(world,event))object.hidden=object.role!=='reward';
  event.objective={type:'reward',progress:1,goal:1,label:'Berge deine Abschlussbelohnung am goldenen Zeichen.'};
  return [effect('success',event,`${event.name} abgeschlossen. Die Belohnung wartet am Zeichen.`)];
}
function advanceStage(world,event) {
  const def=definitionOf(event);
  if(def.mode!=='expedition')return finishEvent(world,event);
  event.stageIndex++;
  if(event.stageIndex>=def.stages.length)return finishEvent(world,event);
  return [effect('notice',event,`Nächste Begegnung: ${event.stageIndex+1} / ${def.stages.length}`),...setupStage(world,event)];
}

export function interactWorldEvent(world,objectId,values,time=0,{choice}={}) {
  const object=world.eventObjects?.find(o=>o.id===objectId&&!o.hidden),event=object&&world.worldEvents.find(e=>e.id===object.eventId);
  const player=object&&playersOf(values).find(p=>distance(p,object)<85);
  if(!event||!player)return {success:false,message:'Dieses Zeichen benötigt einen lebenden Reisenden in der Nähe.',effects:[]};
  event.clock=time;
  if((player.level??1)<event.minLevel)return {success:false,message:`Dieses Abenteuer beginnt ab Stufe ${event.minLevel}.`,effects:[]};
  if(object.role==='reward')return {success:true,message:'Berge die Abschlussbelohnung.',claim:event.id,effects:[]};
  if(object.role==='start') {
    if(event.state==='active')return {success:false,message:event.objective.label,effects:[]};
    if(event.state==='success'||event.state==='rewarded'||time<event.readyAt)return {success:false,message:'Die Region braucht Zeit, bevor dieses Abenteuer erneut beginnt.',effects:[]};
    // Remove the previous run's corpses and temporary servants before retrying.
    // Reward history lives in the event record, not in an ever-growing actor list.
    world.enemies=world.enemies.filter(e=>e.eventId!==event.id&&!String(e.summonedBy||'').startsWith(`${event.id}:run:`));
    event.state='active';event.phase='warning';event.elapsed=0;event.run++;event.stageIndex=0;event.participants=[playerId(player)];event.claimedBy=[];event.bonus=1;event.risky=false;event.contributionSeconds={};
    return {success:true,message:event.description,effects:[effect('notice',event,event.description),...setupStage(world,event)]};
  }
  if(event.state!=='active')return {success:false,message:'Das Abenteuer ist noch nicht aktiv.',effects:[]};
  if(!event.participants.includes(playerId(player))&&event.participants.length<16)event.participants.push(playerId(player));
  const stage=stageOf(event),effects=[];
  if(object.role==='choice') {
    const optionId=choice||object.choice;
    const options=stage.options||[{id:'safe',bonus:1},{id:'risk',bonus:1.25}];
    const option=options.find(o=>o.id===optionId);
    if(!option)return {success:false,message:'Diese Entscheidung ist nicht möglich.',effects:[]};
    event.choice=optionId;event.bonus=option.bonus;event.risky=optionId==='risk';
    for(const prop of ownObjects(world,event).filter(o=>o.role==='choice'))prop.hidden=true;
    if(stage.type==='choice')effects.push(...advanceStage(world,event));
    else {event.objective={type:'choice_combat',progress:1,goal:1,label:'Besiege die Gegner deiner Entscheidung.'};event.choiceCombat=true;effects.push(wave(world,event,option.pack||1,{boss:option.boss}));}
  } else if(object.role==='objective'||object.role==='escort') {
    if(!object.repairsLeft||object.hp>=object.maxHp)return {success:false,message:'Die Wacht braucht gerade keine Reparatur.',effects:[]};
    object.repairsLeft--;object.hp=Math.min(object.maxHp,object.hp+object.maxHp*.35);effects.push(effect('notice',event,`${object.name} wurde gestärkt. Noch ${object.repairsLeft} Reparaturen.`));
  } else if(object.role==='rune') {
    if(stage.type==='ambush') {if(object.active)return {success:false,message:'Dieser Knoten ist bereits gebrochen.',effects:[]};object.active=true;event.objective.progress++;}
    else if(stage.type==='boss_hunt') {
      if(object.active)return {success:false,message:'Diese Spur ist bereits gebunden.',effects:[]};
      object.active=true;event.objective.progress++;
      if(event.objective.progress===event.objective.goal)effects.push(wave(world,event,1,{boss:stage.boss}));
      else if(['dornwildnis','nexusriss'].includes(event.region))effects.push(wave(world,event,1));
    } else if(stage.type==='ritual') {
      const props=ownObjects(world,event).filter(o=>o.role==='rune'),rule=stage.rule;
      if(rule==='sequence') {
        if(object.active)return {success:false,message:'Dieser Name ist bereits gebunden. Folge der nächsten Rune.',effects:[]};
        if(object.symbol===stage.symbols[event.objective.progress]) {object.active=true;event.objective.progress++;}
        else {event.objective.progress=0;props.forEach(o=>o.active=false);event.mistakes++;effects.push(wave(world,event,1,{delay:2}));if(event.mistakes>=3)effects.push(...failEvent(world,event,'Drei falsche Namen haben das Ritual zerbrochen.',time));}
      } else if(rule==='switches') {object.active=!object.active;event.objective.progress=props.filter((o,i)=>o.active===stage.pattern[i]).length;}
      else if(rule==='alignment') {object.rotation=(object.rotation+1)%4;event.objective.progress=props.filter((o,i)=>o.rotation===stage.rotations[i]).length;object.active=object.rotation===stage.rotations[object.index];}
      else return {success:false,message:'Halte dich im Wachlicht auf, bis das Ritual antwortet.',effects:[]};
    }
  }
  return {success:true,message:event.objective.label,effects};
}

function spawnWave(world,event,pending) {
  const stage=stageOf(event),pool=REGION_ENEMY_POOLS[event.region];
  let count=pending.count;
  if(stage.type==='ambush')count=Math.max(1,count-event.objective.progress);
  for(let i=0;i<count;i++) {
    const type=pending.boss||pending.type||pool[(pending.wave+i)%pool.length],def=WORLD_EVENT_ENEMIES[type]||BESTIARY_ENEMIES[type];
    if(!def)continue;
    const angle=(i+.35)*Math.PI*2/count+pending.wave*.73,radius=pending.boss?175:170;
    const x=clamp(event.x+Math.cos(angle)*radius,30,world.width-30),y=clamp(event.y+Math.sin(angle)*radius,30,world.height-30);
    const stats=bestiaryCombatStats(def,event.level);
    const actor={id:`${event.id}:run:${event.run}:stage:${event.stageIndex}:wave:${pending.wave}:mob:${i}`,type,x,y,homeX:x,homeY:y,...stats,
      boss:def.boss,bestiary:true,eventId:event.id,eventRun:event.run,challengeId:event.id,rewardless:true,xp:0,gold:0,alive:true,respawnAt:Infinity,phase:'idle',attackTimer:1,aggro:true,region:event.region,
      name:def.name};
    if(!def.boss) {actor.hp=actor.maxHp=Math.round(actor.maxHp*.65);actor.damage=Math.max(1,Math.round(actor.damage*.8));}
    if(event.risky&&def.boss)actor.hp=actor.maxHp=Math.round(actor.maxHp*1.2);
    world.enemies.push(actor);
  }
}

export function updateWorldEvents(world,dt,values,time=0) {
  if(!world.worldEvents||!Number.isFinite(dt)||dt<=0)return [];
  const players=playersOf(values),effects=[];
  for(const event of world.worldEvents) {
    event.clock=time;
    if(event.state==='failure'||event.state==='rewarded') {
      if(time>=event.readyAt) {event.state='idle';event.phase='ready';for(const object of ownObjects(world,event))object.hidden=object.role!=='start';}
      continue;
    }
    if(event.state!=='active')continue;
    event.elapsed+=dt;
    const present=players.filter(p=>distance(p,event)<520&&(p.level??1)>=event.minLevel);
    const protectedObject=ownObjects(world,event).find(o=>['objective','escort'].includes(o.role));
    const contributionCenter=protectedObject||event;
    const contributionRadius=protectedObject?.role==='escort'?150:protectedObject?.role==='objective'?160:200;
    event.contributionSeconds ||= {};
    for(const p of players) {
      const id=playerId(p),near=(p.level??1)>=event.minLevel&&distance(p,contributionCenter)<contributionRadius;
      event.contributionSeconds[id]=near?(event.contributionSeconds[id]||0)+dt:0;
      if(event.contributionSeconds[id]>=2&&!event.participants.includes(id)&&event.participants.length<16)event.participants.push(id);
    }
    event.absent=present.length?0:event.absent+dt;
    if(event.absent>20||event.elapsed>300) {effects.push(...failEvent(world,event,event.absent>20?'Die Wacht wurde verlassen. Das Abenteuer ist gescheitert.':'Das Abenteuer versank in der Nacht.',time));continue;}
    for(const pending of event.pending.filter(p=>p.at<=event.elapsed))spawnWave(world,event,pending);
    event.pending=event.pending.filter(p=>p.at>event.elapsed);
    const enemies=ownEnemies(world,event),stage=stageOf(event),props=ownObjects(world,event);
    const target=props.find(o=>['objective','escort'].includes(o.role));
    if(target) {
      const pressure=enemies.filter(e=>distance(e,target)<140).reduce((total,e)=>total+e.damage*.09,0);
      target.hp=Math.max(0,target.hp-pressure*dt);
      if(target.hp<=0) {effects.push(...failEvent(world,event,`${target.name} wurde der Nacht überlassen.`,time));continue;}
    }
    let done=false;
    if(stage.type==='defend') {
      const elapsed=event.elapsed-event.stageStartedAt,duration=stage.duration;
      if(present.some(p=>distance(p,target)<160))event.objective.progress=Math.min(duration,event.objective.progress+dt);
      const waves=stage.waves||[2,2],index=Math.min(waves.length-1,Math.floor(elapsed/(duration/waves.length)));
      while(event.waveIndex<index) {event.waveIndex++;effects.push(wave(world,event,waves[event.waveIndex]+(event.risky?1:0)));}
      done=event.objective.progress>=duration&&!event.pending.length&&!enemies.length;
    } else if(stage.type==='escort') {
      const next=event.route[event.escortIndex+1];
      if(next&&present.some(p=>distance(p,target)<150)&&!enemies.some(e=>distance(e,target)<220)&&!event.pending.length) {
        const d=distance(target,next),move=Math.min(d,(stage.speed||22)*dt);
        if(d>0) {target.x+=(next.x-target.x)/d*move;target.y+=(next.y-target.y)/d*move;}
        if(d<=2) {event.escortIndex++;event.objective.progress=event.escortIndex;if(event.escortIndex<2)effects.push(wave(world,event,1+(event.risky?1:0)));}
      }
      done=event.escortIndex>=2&&!enemies.length&&!event.pending.length;
    } else if(stage.type==='ritual') {
      if(stage.rule==='hold') {
        event.hold=present.some(p=>distance(p,props.find(o=>o.role==='rune'))<65)?event.hold+dt:0;
        event.objective.progress=Math.min(event.objective.goal,event.hold);
      }
      done=event.objective.progress>=event.objective.goal&&!enemies.length&&!event.pending.length;
    } else if(stage.type==='ambush')done=event.elapsed-event.stageStartedAt>=8&&!enemies.length&&!event.pending.length;
    else if(stage.type==='boss_hunt')done=event.objective.progress>=event.objective.goal&&!enemies.length&&!event.pending.length;
    else if(stage.type==='seal_choice')done=event.choiceCombat&&!enemies.length&&!event.pending.length;
    if(done)effects.push(...advanceStage(world,event));
  }
  return effects;
}

/** Called only after Game has applied real damage to one of this run's foes. */
export function recordWorldEventContribution(world,eventId,value) {
  const player=body(value),event=world.worldEvents?.find(e=>e.id===eventId);
  if(!event||event.state!=='active'||!alive(player)||(player.level??1)<event.minLevel||distance(player,event)>700)return false;
  const id=playerId(player);
  if(!event.participants.includes(id)) {
    if(event.participants.length>=16)return false;
    event.participants.push(id);
  }
  return true;
}

export function claimWorldEventReward(world,eventId,value,time=0) {
  const player=body(value),event=world.worldEvents?.find(e=>e.id===eventId);
  if(!event||!alive(player)||!['success','rewarded'].includes(event.state)||distance(player,event)>110||!event.participants.includes(playerId(player))||event.claimedBy.includes(playerId(player))||(player.level??1)<event.minLevel)return null;
  const reward={...worldEventRewardPreview(event,player),eventId};
  event.claimedBy.push(playerId(player));
  if(event.state==='success')event.rewardedRuns++;
  event.state='rewarded';event.phase='claimed';event.readyAt=Math.max(event.readyAt,time+360);
  return reward;
}

export function worldEventRewardPreview(event,value) {
  const player=body(value)||{},gap=(player.level??event.level)-event.level,xpFactor=gap>=20?0:gap>=10?.25:1;
  const ongoing=['active','success','rewarded'].includes(event.state),completed=['success','rewarded'].includes(event.state);
  const ordinal=event.rewardedRuns||0,repeatFactor=completed&&event.runRewardFactor?event.runRewardFactor:ordinal===0?1:ordinal===1?.5:.25;
  const factor=repeatFactor*(ongoing?event.bonus||1:1);
  return {xp:Math.round((70+event.level**2*3)*factor*xpFactor),gold:Math.round((18+event.level*5)*factor),
    dust:Math.max(1,Math.round((2+event.level/12)*factor)),lootLevel:event.level,lootTier:event.mode==='expedition'?2:1,
    boss:event.mode==='expedition'||event.mode==='boss_hunt',repeatFactor};
}

export function summarizeWorldEvents(world,value) {
  return (world.worldEvents||[]).map(event=>{
    const {id,name,description,region,level,minLevel,x,y,mode,state,phase,objective,readyAt,stageIndex}=event,def=definitionOf(event),player=body(value);
    return {id,name,description,region,level,minLevel,x,y,mode,state,status:statusNames[state],phase,objective:{...objective},readyAt,stageIndex,
      stages:mode==='expedition'?def.stages.length:1,contentType:def.contentType||(mode==='expedition'?'expedition':mode==='boss_hunt'?'boss':'event'),
      partyRequired:def.partyRequired||1,repeatable:def.repeatable!==false,hint:def.hint||'',reward:worldEventRewardPreview(event,player),
      claimable:!!player&&['success','rewarded'].includes(state)&&event.participants.includes(playerId(player))&&!event.claimedBy.includes(playerId(player))};
  });
}

export function captureWorldEvents(world) {
  return (world.worldEvents||[]).map(({id,state,run,completions,rewardedRuns,readyAt,claimedBy,participants,bonus})=>({id,state,run,completions,rewardedRuns,readyAt,claimedBy:[...claimedBy],participants:[...participants],bonus}));
}
export function validateWorldEventSave(entries) {
  if(entries===undefined)return true;
  return Array.isArray(entries)&&entries.length<=allDefinitions.length&&new Set(entries.map(e=>e?.id)).size===entries.length&&entries.every(e=>e&&allDefinitions.some(d=>d.id===e.id)&&Object.keys(statusNames).includes(e.state)&&
    ['run','completions','rewardedRuns'].every(k=>Number.isInteger(e[k])&&e[k]>=0&&e[k]<=100000)&&Number.isFinite(e.readyAt)&&e.readyAt>=0&&
    Array.isArray(e.claimedBy)&&Array.isArray(e.participants)&&e.participants.length<=16&&e.claimedBy.length<=16&&e.claimedBy.every(id=>e.participants.includes(id))&&
    [...e.claimedBy,...e.participants].every(id=>typeof id==='string'&&id.length<100)&&new Set(e.claimedBy).size===e.claimedBy.length&&new Set(e.participants).size===e.participants.length&&
    Number.isFinite(e.bonus)&&e.bonus>=1&&e.bonus<=1.5);
}
export function restoreWorldEvents(world,entries=[],time=0) {
  if(!validateWorldEventSave(entries))throw new TypeError('Ungültige gespeicherte Weltaktivität.');
  const saved=new Map(entries.map(e=>[e.id,e]));
  for(const event of world.worldEvents||[]) {
    const value=saved.get(event.id);if(!value)continue;
    Object.assign(event,value,{claimedBy:[...value.claimedBy],participants:[...value.participants],readyAt:Math.min(value.readyAt,time+360)});
    if(event.state==='active') {event.state='failure';event.phase='failed';event.readyAt=time+60;cleanup(world,event);}
    else if(['success','rewarded'].includes(event.state)) {
      event.phase=event.state==='success'?'complete':'claimed';
      const ordinal=event.rewardedRuns-(event.state==='rewarded'?1:0);
      event.runRewardFactor=ordinal===0?1:ordinal===1?.5:.25;
    }
    for(const object of ownObjects(world,event))object.hidden=['success','rewarded'].includes(event.state)?object.role!=='reward':object.role!=='start';
  }
}
