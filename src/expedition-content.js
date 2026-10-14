// Original expedition data only. The shared world-event controller owns every
// stage, actor, warning, participation check, completion and repeat reward.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const EXPEDITION_CONTENT = freeze([
  {
    id: 'expedition-weisshorn', region: 'frostgrat', name: 'Der Atem unter Weißhorn',
    level: 7, minLevel: 6, at: [.8, .35], mode: 'expedition', contentType: 'expedition', partyRequired: 1, repeatable: true,
    description: 'Unter Sivras gefrorener Wiege liegt ein Dorf, dessen letzter Atem noch durch die Hörner klingt. Entscheide, ob du seinen Eid bewahrst oder sein Silber nimmst. Führe den einzigen Zeugen hinaus, ordne die drei Atemzeichen und halte die letzte warme Glut, bevor du die Weißhorn-Mutter rufst.',
    hint: 'Wähle links den bewahrten Eid für den ruhigeren Weg; rechts lockt Silber weitere Gegner und stärkt Sivra. Bleibe bei der Eskorte. Das Ritual nennt Atem, Asche, Heimkehr. Halte danach 18 Sekunden an der Glut; im Finale stehen die Mitte und der Bereich außerhalb der angekündigten Eiswiege sicher.',
    stages: [
      { type: 'choice', safe: 'Den letzten Atem bewahren', risk: 'Das Silbergeld der Toten nehmen' },
      { type: 'escort', targetName: 'Zeuge des verschütteten Dorfs', speed: 24, repairs: 2 },
      { type: 'ritual', rule: 'sequence', symbols: ['atem', 'asche', 'heimkehr'] },
      { type: 'defend', duration: 18, waves: [2, 2], targetName: 'Letzte warme Dorfglut', repairs: 2 },
      { type: 'boss_hunt', boss: 'sivra_whitehorn', tracks: 1 },
    ],
  },
  {
    id: 'expedition-schilfzug', region: 'jadeauen', name: 'Der Schilfzug ohne Ernte',
    level: 24, minLevel: 22, at: [.22, .8], mode: 'expedition', contentType: 'expedition', partyRequired: 1, repeatable: true,
    description: 'Eine Ernte aus der Sonnensteppe treibt flussaufwärts, obwohl niemand den Karren zieht. Irdan hat die Namen seiner Schuldner in die Garben gebunden. Wähle freie Namen oder verbotene Vorräte, breche den Schilfhinterhalt und löse die Schleuse, damit der leere Karren seinen letzten Weg fahren kann.',
    hint: 'Die Namen freizugeben hält die Beute und Gefahr im normalen Rahmen; die Garben zu plündern stärkt die letzte Begegnung. Entschärfe beide Schilfknoten vor dem Hinterhalt. An der Schleuse müssen Gegengewicht eins und zwei aktiv sein, das dritte ruhen. Bleibe danach beim Karren und weiche hinter Irdans angekündigte Sichelbahn aus.',
    stages: [
      { type: 'choice', safe: 'Die Namen aus den Garben lösen', risk: 'Die verbotene Ernte plündern' },
      { type: 'ambush', pack: 3, traps: 2 },
      { type: 'ritual', rule: 'switches', pattern: [true, true, false] },
      { type: 'escort', targetName: 'Karren der freigewordenen Namen', speed: 25, repairs: 2 },
      { type: 'boss_hunt', boss: 'irdan_reaper', tracks: 1 },
    ],
  },
  {
    id: 'expedition-zeitbruch', region: 'mondbruch', name: 'Der Morgen, den Vey zerschlug',
    level: 54, minLevel: 52, at: [.8, .4], mode: 'expedition', contentType: 'expedition', partyRequired: 1, repeatable: true,
    description: 'In einem abgebrochenen Morgen wartet eine Wache auf Menschen, die niemals geboren wurden. Vey schnitt ihre Ankunft aus dem Uhrwerk. Bewahre das offene Versprechen oder raube eine fremde Stunde. Schütze den Antrieb, richte seine Linsen und durchbrich die Nachbilder, bis der Uhrenschlächter selbst antwortet.',
    hint: 'Der bewahrte Morgen ist der sichere Entscheidungsweg; die geraubte Stunde gibt mehr Abschlussbeute und stärkere Gegner. Halte 26 Sekunden am Uhrwerk. Die drei Linsen müssen nach Süden, Norden und Westen zeigen. Entschärfe danach alle drei Nachbildknoten und verlasse im Finale jede neu markierte Pendelschneise.',
    stages: [
      { type: 'choice', safe: 'Den ungelebten Morgen bewahren', risk: 'Eine fremde Stunde rauben' },
      { type: 'defend', duration: 26, waves: [2, 3], targetName: 'Uhrwerk des unbeendeten Morgens', repairs: 2 },
      { type: 'ritual', rule: 'alignment', rotations: [2, 0, 3] },
      { type: 'ambush', pack: 4, traps: 3 },
      { type: 'boss_hunt', boss: 'vey_clockslayer', tracks: 1 },
    ],
  },
  {
    id: 'expedition-namenlos', region: 'traumsenke', name: 'Ein Wachlicht für die Unbenannten',
    level: 80, minLevel: 78, at: [.38, .35], mode: 'expedition', contentType: 'expedition', partyRequired: 1, repeatable: true,
    description: 'Nera hat einer Gemeinschaft die Namen genommen, damit niemand den anderen wecken kann. Ein Zeuge trägt noch ihr letztes Wachlicht. Entscheide zwischen seiner Erinnerung und den fremden Träumen, begleite ihn durch die Senke und halte die Flamme fest, bis Schlaf ohne Namen aus ihren Spiegeln tritt.',
    hint: 'Die Erinnerung zurückzugeben führt durch den normalen Weg; die fremden Träume mitzunehmen steigert Abschlussbeute und Gegnerstärke. Bleibe am Zeugen, dann sechs Sekunden ohne Unterbrechung im einzelnen Wachlicht. Schütze seine Flamme weitere 32 Sekunden. Gegen Nera bleibt die helle Lücke des angekündigten Rings sicher; unter halbem Leben wird sie schmaler.',
    stages: [
      { type: 'choice', safe: 'Dem Zeugen seine Erinnerung lassen', risk: 'Die fremden Träume mitnehmen' },
      { type: 'escort', targetName: 'Zeuge der unbenannten Gemeinschaft', speed: 22, repairs: 2 },
      { type: 'ritual', rule: 'hold', duration: 6 },
      { type: 'defend', duration: 32, waves: [3, 2], targetName: 'Wachlicht der Unbenannten', repairs: 2 },
      { type: 'boss_hunt', boss: 'nera_nameless', tracks: 1 },
    ],
  },
]);
