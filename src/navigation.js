import { REGIONS,QUESTS,NPCS,ENEMY_TYPES } from './catalog.js';
const closest=(list,p)=>[...list].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
const target=(object,label)=>object&&Number.isFinite(object.x)&&Number.isFinite(object.y)?{x:object.x,y:object.y,objectId:object.id,label:label||object.name||object.label||'Reiseziel'}:null;

export function resolveQuestTarget(game,id) {
  const quest=QUESTS.find(q=>q.id===id)||game.contracts?.active.find(q=>q.id===id),state=game.questState[id]||quest;
  if(!quest||!['active','ready'].includes(state?.status))return null;
  const giver=NPCS.find(n=>n.id===quest.giver)||game.contractGiver?.(quest.region);
  if(state.status==='ready')return target(giver,`Abgeben: ${quest.title}`);
  const objective=quest.objectives.find((o,i)=>(state.counts?.[i]||0)<o.count);if(!objective)return target(giver,quest.title);
  const world=game.world;
  if(objective.kind==='kill') {
    const matches=world.enemies.filter(e=>e.alive&&(e.type===objective.target||ENEMY_TYPES[e.type]?.questTarget===objective.target));
    const ordinary=matches.filter(e=>!ENEMY_TYPES[e.type]?.boss);
    return target(closest(ordinary.length?ordinary:matches,game.player),objective.label);
  }
  if(objective.kind==='boss')return target(closest((game.overworld||world).enemies.filter(e=>e.alive&&!e.rewardless&&ENEMY_TYPES[e.type]?.boss&&(ENEMY_TYPES[e.type].baseType===objective.target||ENEMY_TYPES[e.type].speciesId===objective.target||e.type===objective.target)),game.player),objective.label);
  if(objective.kind==='interact')return target((game.overworld||world).interactions?.find(o=>o.id===objective.target&&!o.used),objective.label);
  if(objective.kind==='world_event')return resolveWaypoint(game,'event',objective.target);
  if(objective.kind==='gather')return target(closest(world.nodes.filter(n=>n.type===objective.target&&n.readyAt<=game.time),game.player),objective.label);
  if(objective.kind==='farm')return target(closest(world.plots,game.player),objective.label);
  if(['dungeon','raid','puzzle'].includes(objective.kind))return target(world.dungeonEntrances?.find(d=>d.id===objective.target),objective.label);
  if(objective.kind==='explore')return target(world.shrines.find(s=>s.region===objective.target)||REGIONS.find(r=>r.id===objective.target)&&{x:REGIONS.find(r=>r.id===objective.target).x+350,y:REGIONS.find(r=>r.id===objective.target).y+420},objective.label);
  if(objective.kind==='craft')return target(NPCS.find(n=>n.id===(/brew/.test(objective.target)?'sera':/bake/.test(objective.target)?'toma':'elin')),objective.label);
  return target(giver,quest.title);
}

export function resolveWaypoint(game,kind,id) {
  if(kind==='quest')return resolveQuestTarget(game,id);
  if(kind==='npc')return target(NPCS.find(n=>n.id===id));
  if(kind==='shrine')return target(game.world.shrines.find(s=>s.id===id));
  if(kind==='interaction')return target(game.world.interactions?.find(o=>o.id===id&&!o.used));
  if(kind==='event') {
    const state=game.world.worldEvents?.find(e=>e.id===id);
    const options=game.world.eventObjects?.filter(o=>o.eventId===id&&!o.hidden&&(state?.state==='active'?o.role!=='start':o.role==='start'||o.role==='reward'))||[];
    const summary=game.networkWorldEventSummary?.find(e=>e.id===id);
    return target(closest(options,game.player)||state||summary,state?.objective?.label||summary?.objective?.label||state?.name||summary?.name);
  }
  if(kind==='dungeon')return target(game.world.dungeonEntrances?.find(o=>o.id===id));
  if(kind==='region') {
    const region=REGIONS.find(r=>r.id===id);return region?target(game.world.shrines.find(s=>s.region===id)||{x:region.x+region.w*.5,y:region.y+region.h*.5},region.name):null;
  }
  return null;
}

export function adventureGuidance(game) {
  if(!game.questState.q_hainwacht)return {title:'Die erste Wacht',description:'Sprich mit Mira am Dorfbrunnen und übernimm den Schutz der Wege.',kind:'npc',id:'mira'};
  if(game.questState.q_hainwacht.status!=='done')return {title:'Die Wege sichern',description:'Verfolge die Hainwacht im Journal. Kehre nach vier Hainwölfen zu Mira zurück.',kind:'quest',id:'q_hainwacht'};
  if(!game.ledger['craft:brew_heal'])return {title:'Bereit für die Nacht',description:'Sammle drei Mondkräuter und braue einen Heiltrank in der Werkbank.',panel:'craft'};
  if(!Object.keys(game.learnedAbilities).length)return {title:'Dein eigener Kampfstil',description:'Erlerne ab Stufe 4 eine Klassenfähigkeit und belege Zusatzplatz 3.',panel:'talents'};
  if(!game.journey?.activeCompanion)return {title:'Ein Gefährte an deiner Seite',description:'Prüfe freigeschaltete Begleiter in deiner Reisechronik und wähle einen aus.',panel:'journey'};
  return {title:'Jenseits der Dorfmauern',description:'Wähle ein regionales Ereignis oder eine Expedition. Die Chronik zeigt neue Fraktions- und Entdeckungsziele.',panel:'adventures'};
}
