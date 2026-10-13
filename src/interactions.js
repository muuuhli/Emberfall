// Authored opportunities, not automatic rewards: every object is used in the world.
export const INTERACTION_TYPES = Object.freeze({
  barrel: { name: 'Verlassene Vorratsfässer', label: 'Vorräte durchsuchen', description: 'Berge Holz, Erz und ein wenig Gold aus verlassenen Vorräten.', color: '#9e7955' },
  urn: { name: 'Aschenurne', label: 'Aschenurne bergen', description: 'Berge Arkanstaub aus den Überresten der alten Wacht.', color: '#a69285' },
  sarcophagus: { name: 'Grab der Namenlosen', label: 'Grab öffnen · Wächter erwecken', description: 'Erwecke zwei Grabwächter. Erst nach ihrem Tod gibt das Grab seine Beute frei.', color: '#827b83' },
  altar: { name: 'Altar des Bluteids', label: 'Bluteid: 3 Kristalle + 20 % Leben', description: 'Opfere 3 Kristalle und 20 % deines aktuellen Lebens für 90 Sekunden Waffenkraft und Lebensraub.', color: '#ba575c' },
  fountain: { name: 'Quelle der verlorenen Seelen', label: 'Aus der Seelenquelle trinken', description: 'Eine einmalige Quelle stellt Leben und Mana vollständig wieder her.', color: '#719dad' },
  captive: { name: 'Gefangener der Nacht', label: 'Gefangenen befreien', description: 'Besiege zunächst die Feinde im Umkreis. Ein geretteter Reisender belohnt dich mit Gold und Erfahrung.', color: '#c4b18b' },
  cursed_chest: { name: 'Truhe des schwarzen Schwurs', label: 'Fluch brechen · Boss herausfordern', description: 'Rufe einen regionalen Boss. Er trägt garantierte Ausrüstung und gibt die Truhe frei.', color: '#af667e' },
  campfire: { name: 'Verlöschender Glutherd', label: 'Rasten · 2 Holz', description: 'Außerhalb des Kampfes: 2 Holz stellen 45 % Leben und Mana wieder her. 60 Sekunden Rastpause.', color: '#d68b55' },
  lever: { name: 'Kette der Gruft', label: 'Gruftkette ziehen', description: 'Öffnet den versiegelten Vorrat in der Nähe. Folge der glimmenden Rune.', color: '#aa9978' },
  lore: { name: 'Chronik der schwarzen Wacht', label: 'Verbotene Chronik lesen', description: 'Entdecke eine regionale Geschichte und erhalte einmalig Erfahrung.', color: '#bbad8e' },
  obelisk: { name: 'Obelisk des Nachtäthers', label: 'Äther binden · 5 Kristalle', description: '5 Kristalle stärken Zauberkraft und Mana-Regeneration für 90 Sekunden.', color: '#9886bd' },
  sealed_cache: { name: 'Versiegelter Gruftvorrat', label: 'Gruftvorrat bergen', description: 'Die nahe Gruftkette öffnet diesen Vorrat mit Ausrüstung und Schmiedematerial.', color: '#b9a17a' },
});

const memories = [
  'Die Glocken von Glutwacht läuteten auch nach dem letzten Begräbnis. Niemand zog mehr an den Seilen.',
  'Im Eis fanden wir keine Leichen. Wir fanden die Hände derer, die noch immer von unten klopften.',
  'Der Moornebel trägt die Stimmen unserer Kinder. Die Kinder sind seit Jahren fort.',
  'Asche fiel sieben Tage lang. Am achten Tag erloschen die Schatten, aber nicht das Feuer.',
  'Die Ernte stand schwarz auf den Feldern. Jeder Halm neigte sich vor etwas unter der Erde.',
  'Wir bauten Brücken für die Flüchtlinge. Bei Nacht kamen andere darüber zurück.',
  'Die Leuchtfeuer warnen keine Schiffe mehr. Sie zeigen den Ertrunkenen den Weg zum Hafen.',
  'Der Garten nahm unsere Namen an. Die Dornen tragen sie bis heute.',
  'Jeder Ritter schlug sein eigenes Wappen entzwei. Der Eid hielt ihre Rüstungen trotzdem geschlossen.',
  'Die Uhr blieb stehen, als der Mond brach. Seitdem zählen wir die Stunden an den verschwundenen Menschen.',
  'Das Lied unter dem Eis wird lauter. Niemand in der Kathedrale bewegt seine Lippen.',
  'Unter den Dünen liegt eine Stadt. Der Wind legt jeden Morgen eine neue Haustür frei.',
  'Im Traum erinnere ich mich an mein Zuhause. Am Morgen weiß ich nicht mehr, wer darin wohnte.',
  'Die Banner sind schwer von Blut. Sie wehen, auch wenn die Luft vollkommen stillsteht.',
  'Die Sterne fielen ins Meer. Was wir herausfischten, hatte Zähne.',
  'Wir glaubten, hinter dem letzten Riss läge das Licht. Dort wartet etwas, das unseren Glauben kennt.',
];

function randomStream(seed) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed) + 0x6d2b79f5 | 0; return (seed >>> 0) / 4294967296; };
}

export function addWorldInteractions(world) {
  if (world.interactions) return world;
  const objects = [];
  const clear = (x, y) => !world.trees.some(o => Math.hypot(x-o.x, y-o.y) < 38*(o.scale||1)) &&
    !world.rocks.some(o => Math.hypot(x-o.x,y-o.y) < 34*(o.scale||1)) &&
    !world.structures.some(o => o.blocking!==false && x>o.x-25 && x<o.x+o.w+25 && y>o.y-25 && y<o.y+o.h+25) &&
    ![...world.nodes,...world.plots,...world.chests,...world.enemies,...objects].some(o => Math.hypot(x-o.x,y-o.y)<58);
  world.regions.forEach((region,index) => {
    const rng = randomStream(826404 + index*7717);
    Object.entries(INTERACTION_TYPES).forEach(([kind,definition],slot) => {
      const safe = ['campfire','fountain','lore'].includes(kind);
      const shrine = world.shrines.find(s=>s.region===region.id);
      let point;
      for(let attempt=0;attempt<240;attempt++) {
        let x, y;
        if(safe && shrine && attempt<100) { const angle=rng()*Math.PI*2, radius=100+rng()*120; x=shrine.x+Math.cos(angle)*radius; y=shrine.y+Math.sin(angle)*radius; }
        else { x=region.x+90+rng()*(region.w-180); y=region.y+90+rng()*(region.h-180); }
        if(x<region.x+35||x>region.x+region.w-35||y<region.y+35||y>region.y+region.h-35||!clear(x,y))continue;
        if(['sarcophagus','cursed_chest'].includes(kind)&&world.shrines.some(s=>Math.hypot(x-s.x,y-s.y)<330))continue;
        point={x:Math.round(x),y:Math.round(y)};break;
      }
      if(!point)return;
      objects.push({id:`encounter-${region.id}-${kind}`,kind,region:region.id,level:region.level,...definition,...point,
        used:false,active:false,locked:kind==='sealed_cache',readyAt:0,...(kind==='lore'?{text:memories[index]}:{})});
    });
    const lever=objects.find(o=>o.region===region.id&&o.kind==='lever'), cache=objects.find(o=>o.region===region.id&&o.kind==='sealed_cache');
    if(lever&&cache) {
      lever.linkedId=cache.id;
      // Keep the reward visibly near the mechanism, including a clear approach.
      for(const [dx,dy] of [[80,0],[-80,0],[0,80],[0,-80]])if(clear(lever.x+dx,lever.y+dy)) {
        cache.x=lever.x+dx;cache.y=lever.y+dy;break;
      }
    }
  });
  world.interactions=objects;
  return world;
}

export function interactionAvailable(object,time) {
  return !object.used && !object.locked && (object.readyAt||0)<=time;
}

export function captureInteractions(world) {
  return (world.interactions||[]).map(({id,used,active,locked,readyAt,challengeCompleted})=>({id,used:!!used,active:!!active,locked:!!locked,readyAt,challengeCompleted:!!challengeCompleted}));
}

export function validateInteractionSave(entries) {
  if(entries===undefined)return true;
  return Array.isArray(entries)&&entries.length<=1000&&new Set(entries.map(o=>o?.id)).size===entries.length&&entries.every(o=>
    o&&typeof o.id==='string'&&['used','active','locked','challengeCompleted'].every(k=>o[k]===undefined||typeof o[k]==='boolean')&&
    (o.readyAt===undefined||Number.isFinite(o.readyAt)&&o.readyAt>=0));
}

export function restoreInteractions(world,entries=[],time=0) {
  const saved=new Map(entries.map(o=>[o.id,o]));
  for(const object of world.interactions||[]) {
    const state=saved.get(object.id);if(!state)continue;
    object.used=!!state.used;object.active=!!state.active&&!object.used;object.challengeCompleted=!!state.challengeCompleted;
    if(object.kind==='sealed_cache')object.locked=state.locked!==false;
    object.readyAt=Math.min(state.readyAt||0,time+60);
  }
}

export const WORLD_BOONS = Object.freeze({
  blood_oath: { name:'Bluteid',duration:90,effects:{damage:0,lifeSteal:.02} },
  night_aether: { name:'Nachtäther',duration:90,effects:{spellDamage:0,manaRegen:1.5} },
});
