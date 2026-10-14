// Optional trials use authored regional species in a fixed wave order. Normal
// waves grow in pressure; the named final bosses retain their own combat budget.
const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};

export const TRIALS=freeze([
  {
    id:'trial-cinderwatch',name:'Die Wacht der Löschasche',region:'glutoede',level:10,minLevel:8,at:[.72,.48],
    mode:'gauntlet',contentType:'challenge',partyRequired:1,repeatable:true,timeout:600,
    description:'Am letzten kalten Kohlenmeiler bewahrten die Aschenwächter Glut für die Heimkehrer. Nun kommen erst Schlackenkäfer und Glutbrut, dann schwerere Brecher mit Rußpredigern. Nach drei Rudeln antwortet der Aschenbrecher selbst. Zwischen den Wellen darfst du rasten oder für einen größeren Abschlussanteil drängen.',
    hint:'Die sechs Sekunden Vorwarnung gehören deiner Aufstellung: Lass die Brecher vorlaufen und umgehe die Schützen. Rast gibt nahen lebenden Teilnehmern Kraft zurück; Drängen verstärkt nur das nächste normale Rudel. Der letzte Boss erhält eine eigene Vorwarnung und behält seinen normalen Kampfrhythmus.',
    waves:[
      {count:2,types:['cinder_beetle','imp'],hpScale:1,damageScale:1},
      {count:3,types:['ash_brute','imp','cinder_beetle'],hpScale:1.15,damageScale:1.05},
      {count:4,types:['infernal_lancer','soot_priest','cinder_beetle','imp'],hpScale:1.3,damageScale:1.1},
      {count:1,boss:'ash_brute_boss'},
    ],
  },
  {
    id:'trial-tidecircle',name:'Der Kreis der versunkenen Glocke',region:'sturmkueste',level:32,minLevel:30,at:[.85,.35],
    mode:'gauntlet',contentType:'challenge',partyRequired:1,repeatable:true,timeout:600,
    description:'Die Hafenwache schlug ihre letzte Glocke unter Wasser. Ihre Pikenträger halten den Kreis, während Sturmmöwen, Salzhexen und Gezeitenbrecher die freien Bahnen bestreichen. Drei gemischte Wellen führen zu Orsas Ankerkette und wandernder Brandung. Jede Zwischenwahl lässt Zeit für Rast oder eine härtere nächste Welle.',
    hint:'Bleib beweglich zwischen Piken und angekündigten Geschossbahnen; die Salzhexen schließen mit ihren Ringzaubern neue Wege. Wähle nach einem besiegten Rudel gemeinsam Rast oder Drängen. Gegen Orsa zählt die nächste gelockte Bahn: Weiche der Kette seitlich aus und durchquere die sichtbare Brandung.',
    waves:[
      {count:3,types:['drowned_pike','storm_gull','crab_horror'],hpScale:1,damageScale:1},
      {count:4,types:['drowned_pike','tide_reaver','brine_witch','crab_horror'],hpScale:1.15,damageScale:1.05},
      {count:5,types:['crab_horror','storm_gull','drowned_pike','brine_witch','tide_reaver'],hpScale:1.3,damageScale:1.1},
      {count:1,boss:'orsa_tidewarden'},
    ],
  },
  {
    id:'trial-last-scar',name:'Die Prüfung der letzten Narbe',region:'nexusriss',level:100,minLevel:98,at:[.3,.32],
    mode:'gauntlet',contentType:'challenge',partyRequired:1,repeatable:true,timeout:600,
    description:'Vier Wachtzeichen bewahren den Rand der letzten Quellnarbe. Leerenhenker und Risshetzer brechen nach vorn; Abgrundaugen und entweihte Seraphen teilen den Rückweg mit Ringen und Fächern. Erst nach vier wachsenden Formationen tritt Asterion hervor. Die letzte Wahl entscheidet über Erholung oder deinen Abschlussbonus.',
    hint:'Halte eine freie Flanke, solange Henker und Hetzer die Mitte bedrängen, und lies die Ringlücken vor dem nächsten Fächer. Drängen fügt dem nächsten normalen Rudel einen Gegner hinzu, höchstens sieben. Asterions eigene Warnflächen bleiben bindend: Die blaue Zuflucht ist sicher, die markierten gefährlichen Felder nicht.',
    waves:[
      {count:3,types:['void_executioner','rift_hound','nexus_seraph'],hpScale:1,damageScale:1},
      {count:4,types:['rift_hound','abyss_beholder','void_executioner','nexus_seraph'],hpScale:1.15,damageScale:1.05},
      {count:5,types:['void_executioner','nexus_seraph','abyss_beholder','rift_hound','void_executioner'],hpScale:1.3,damageScale:1.1},
      {count:6,types:['void_executioner','rift_hound','abyss_beholder','nexus_seraph'],hpScale:1.45,damageScale:1.15},
      {count:1,boss:'asterion_scarwarden'},
    ],
  },
]);
