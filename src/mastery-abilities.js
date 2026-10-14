import { classPowerMultiplier } from './balance.js';

const technique = (classId, suffix, name, level, kind, branch, requires, description, options) => {
  const ability = { id: `${classId}_${suffix}`, classId, name, level, minLevel: level, talentCost: level < 30 ? 2 : level < 60 ? 3 : 4,
    kind, branch, requires, cost: 26, cooldown: 16, stat: 'spellDamage', powerKind: 'spell', damageMultiplier: .4,
    icon: '✦', color: '#b8b0d0', contentType: 'mastery', ...options };
  if (kind === 'channel') ability.length = ability.range;
  if (kind === 'stepStrike') ability.impactRange = ability.range;
  if (kind === 'retaliationWard') ability.targetRange = ability.range;
  const factor = classPowerMultiplier(classId, ability.powerKind);
  ability.description = description.replace(/\{(damage|bonus)\}/g, (_, key) =>
    ((key === 'bonus' ? ability.comboMultiplier : ability.damageMultiplier) * factor * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }));
  return Object.freeze(ability);
};

// Alternatives, not a fourth always-on action bar: the two learned slots force
// a choice between setup, position, sustained aim and reaction to incoming hits.
export const MASTERY_ABILITIES = Object.freeze([
  technique('guardian', 'oathbrand', 'Eidnarbe', 16, 'mark', 'Vergeltung', 'guardian_bulwark',
    'Markiert einen Gegner vor dir für sechs Sekunden und trifft mit {damage} % Angriffsschaden. Deine nächsten zwei echten Treffer lösen je {bonus} % Zusatzschaden aus; gegen von dir provozierte Gegner zählt der volle Bonus, sonst nur die Hälfte.',
    { stat: 'damage', powerKind: 'attack', cost: 22, cooldown: 14, range: 190, duration: 6, charges: 2, damageMultiplier: .4, comboMultiplier: .65, condition: 'taunted', color: '#d2bd8f', icon: '◆' }),
  technique('guardian', 'answering_steel', 'Antwort aus Stahl', 38, 'retaliationWard', 'Bastion', 'guardian_challenge',
    'Sechs Sekunden Wacht und ein kleiner Schild. Wenn du Leben verlierst, trifft sie höchstens dreimal den nächsten sichtbaren Gegner in 180 Schritten mit {damage} % Angriffsschaden. Zwischen Antworten liegt eine Sekunde; voll abgefangener Schaden löst nichts aus.',
    { stat: 'damage', powerKind: 'attack', cost: 30, cooldown: 24, range: 180, duration: 6, charges: 3, procCooldown: 1, shieldFraction: .1, damageMultiplier: .5, color: '#adb9b9', icon: '⬡' }),
  technique('guardian', 'breach_step', 'Breschenschritt', 62, 'stepStrike', 'Vergeltung', 'guardian_oathbrand',
    'Rückt bis zu 125 Schritte seitlich zu deiner Blickrichtung vor. Mauern stoppen den Schritt. Erst am erreichten Ende trifft ein kurzer Kegel mit {damage} % Angriffsschaden und bremst zwei Sekunden; entlang des Wegs gibt es keinen Treffer und keine Unverwundbarkeit.',
    { stat: 'damage', powerKind: 'attack', cost: 32, cooldown: 15, distance: 125, side: 1, range: 125, arc: 1.8, damageMultiplier: 1.15, slow: .4, duration: 2, color: '#c8b591', icon: '↝' }),

  technique('paladin', 'vigil_ray', 'Strahl der Totenwacht', 16, 'channel', 'Licht', 'paladin_mend',
    'Hält eine gerade Lichtbahn für drei Impulse. Jeder trifft höchstens vier sichtbare Gegner mit {damage} % Zauberkraft. Die Richtung bleibt beim Wirken fest; Bewegung, Lebensverlust oder ein neuer erfolgreicher Angriff unterbrechen die übrigen Impulse.',
    { cost: 28, cooldown: 15, range: 430, width: 28, ticks: 3, interval: .45, windup: .3, damageMultiplier: .44, color: '#e4d3a3', icon: '☀' }),
  technique('paladin', 'votive_brand', 'Kerzenmal', 38, 'mark', 'Vergeltung', 'paladin_wrath',
    'Sechs Sekunden Kerzenmal mit {damage} % Angriffsschaden. Die nächsten zwei eigenen Treffer bringen je {bonus} % Zusatzschaden. Dein aktiver Lebensschild ermöglicht den vollen Bonus; ohne Schild gilt die Hälfte. Verbündete verbrauchen das Mal nicht.',
    { stat: 'damage', powerKind: 'attack', cost: 26, cooldown: 16, range: 240, duration: 6, charges: 2, damageMultiplier: .4, comboMultiplier: .65, condition: 'shielded', color: '#dcca96', icon: '◆' }),
  technique('paladin', 'mercy_watch', 'Wacht der Gnade', 62, 'retaliationWard', 'Schutz', 'paladin_aegis',
    'Sechs Sekunden Wacht mit kleinem Lebensschild. Höchstens drei echte Lebensverluste beantworten den nächsten sichtbaren Gegner mit {damage} % Zauberkraft und heilen dich für 12 % des tatsächlich angerichteten Schadens. Jede Antwort braucht eine Sekunde Abstand.',
    { cost: 38, cooldown: 28, range: 260, duration: 6, charges: 3, procCooldown: 1, shieldFraction: .08, drain: .12, damageMultiplier: .38, color: '#dfca9d', icon: '⬡' }),

  technique('ranger', 'stillstring', 'Die stille Sehne', 16, 'channel', 'Jagd', 'ranger_volley',
    'Zielt unbewegt auf eine schmale gerade Bahn: drei Impulse mit je {damage} % Angriffsschaden gegen bis zu vier sichtbare Gegner. Bewegung, echter Lebensverlust oder ein neuer erfolgreicher Angriff brechen die übrigen Impulse ab. Die Bahn folgt deinem Ziel nicht.',
    { stat: 'damage', powerKind: 'attack', cost: 24, cooldown: 14, range: 600, width: 20, ticks: 3, interval: .45, windup: .3, damageMultiplier: .48, color: '#b4c78b', icon: '➤' }),
  technique('ranger', 'quarry_sign', 'Zeichen der Beute', 38, 'mark', 'Jagd', 'ranger_barbed',
    'Markiert einen Gegner sechs Sekunden und trifft mit {damage} % Angriffsschaden. Die nächsten zwei eigenen Treffer lösen je {bonus} % Zusatzschaden aus, wenn du mindestens 150 Schritte entfernt stehst. Näher am Ziel bleibt nur die Hälfte; fremde Treffer verbrauchen keine Ladung.',
    { stat: 'damage', powerKind: 'attack', cost: 25, cooldown: 16, range: 520, duration: 6, charges: 2, damageMultiplier: .35, comboMultiplier: .75, condition: 'distant', conditionRange: 150, color: '#a1b781', icon: '◆' }),
  technique('ranger', 'flanking_step', 'Flankenschuss', 62, 'stepStrike', 'Wildnis', 'ranger_retreat',
    'Bewegt dich bis zu 150 Schritte seitlich zur Blickrichtung und trifft erst vom erreichten Ende einen schmalen Kegel mit {damage} % Angriffsschaden. Hindernisse bleiben wirksam. Bremst getroffene Gegner zwei Sekunden, verleiht aber keinen Ausweichschutz.',
    { stat: 'damage', powerKind: 'attack', cost: 30, cooldown: 17, distance: 150, side: -1, range: 320, arc: .45, damageMultiplier: 1.25, slow: .3, duration: 2, color: '#b7c299', icon: '↝' }),

  technique('nightblade', 'widows_claim', 'Anspruch der Witwe', 16, 'mark', 'Gift', 'nightblade_poison',
    'Bindet sechs Sekunden ein Witwenmal und trifft mit {damage} % Angriffsschaden. Zwei weitere eigene Treffer verursachen je {bonus} % Zusatzschaden unter halbem Gegnerleben; darüber nur die Hälfte. Jeder Folgebonus verbraucht eine eigene Ladung.',
    { stat: 'damage', powerKind: 'attack', cost: 22, cooldown: 13, range: 180, duration: 6, charges: 2, damageMultiplier: .4, comboMultiplier: .7, condition: 'wounded', threshold: .5, color: '#b5a08a', icon: '◆' }),
  technique('nightblade', 'crosscut_step', 'Kreuzschritt', 38, 'stepStrike', 'Assassine', 'nightblade_throwing',
    'Setzt bis zu 120 Schritte seitlich neben dein Ziel. Ein Endhieb trifft mit {damage} % Angriffsschaden; die ursprüngliche Blickrichtung bleibt erhalten. Kein Teleport, kein Wegschaden und kein Unverwundbarkeitsfenster: eine freie Flanke ist die Voraussetzung.',
    { stat: 'damage', powerKind: 'attack', cost: 26, cooldown: 12, distance: 120, side: 1, range: 155, arc: 2.2, damageMultiplier: 1.35, color: '#c0a5ca', icon: '↝' }),
  technique('nightblade', 'thorn_mirror', 'Dornenspiegel', 62, 'retaliationWard', 'Schatten', 'nightblade_night_ward',
    'Fünf Sekunden Wacht mit einem kleinen Schild. Höchstens drei echte Lebensverluste treffen den nächsten sichtbaren Gegner in 150 Schritten mit {damage} % Angriffsschaden und bremsen ihn eine Sekunde. Antworten brauchen eine Sekunde Abstand; Abstand schützt besser als dieses Mal.',
    { stat: 'damage', powerKind: 'attack', cost: 32, cooldown: 23, range: 150, duration: 5, charges: 3, procCooldown: 1, shieldFraction: .06, slow: .45, slowDuration: 1, damageMultiplier: .48, color: '#ac9bb6', icon: '⬡' }),

  technique('flamecaller', 'cinder_thread', 'Glutfaden', 16, 'channel', 'Feuer', 'flamecaller_cinder',
    'Zieht eine feste Glutbahn mit drei Impulsen und je {damage} % Zauberkraft durch höchstens vier sichtbare Gegner. Breite 32 Schritte, kein verfolgtes Ziel. Bewegung, Lebensverlust oder ein neuer erfolgreicher Angriff lösen den Faden vorzeitig.',
    { cost: 30, cooldown: 15, range: 460, width: 32, ticks: 3, interval: .45, windup: .3, damageMultiplier: .43, color: '#d79163', icon: '✦' }),
  technique('flamecaller', 'pyre_seal', 'Siegel des Scheiterhaufens', 38, 'mark', 'Feuer', 'flamecaller_burning_orbit',
    'Sechs Sekunden Siegel mit {damage} % Zauberkraft. Zwei eigene Folgetreffer lösen je {bonus} % Zusatzschaden aus, wenn das Ziel in einem deiner aktiven Brandherde steht; außerhalb gilt die Hälfte. Der Brandherd wird dabei nicht verbraucht.',
    { cost: 28, cooldown: 17, range: 340, duration: 6, charges: 2, damageMultiplier: .35, comboMultiplier: .65, condition: 'burning', color: '#d4a073', icon: '◆' }),
  technique('flamecaller', 'ash_crossing', 'Aschenquerung', 62, 'stepStrike', 'Asche', 'flamecaller_ashen_escape',
    'Quert bis zu 130 Schritte seitlich und stößt erst am erreichten Ende einen kurzen Flammenkegel mit {damage} % Zauberkraft aus. Getroffene Gegner hinterlassen drei Sekunden einen kleinen eigenen Brandherd. Mauern stoppen dich; der Schritt gibt keinen Ausweichschutz.',
    { cost: 36, cooldown: 18, distance: 130, side: -1, range: 155, arc: 2, damageMultiplier: 1, burnMultiplier: .1, burnDuration: 3, color: '#ca8b61', icon: '↝' }),

  technique('frostweaver', 'winter_thread', 'Winterfaden', 16, 'channel', 'Winter', 'frostweaver_ice_spear',
    'Drei feste Frostimpulse treffen mit je {damage} % Zauberkraft entlang einer schmalen Bahn. Jeder bremst getroffene Gegner 1,5 Sekunden um 35 %. Bewegung, Lebensverlust oder ein neuer erfolgreicher Angriff beenden die verbleibenden Impulse.',
    { cost: 27, cooldown: 15, range: 470, width: 26, ticks: 3, interval: .45, windup: .3, damageMultiplier: .36, slow: .35, slowDuration: 1.5, color: '#aacdda', icon: '❄' }),
  technique('frostweaver', 'rime_lock', 'Reifverschluss', 38, 'mark', 'Reif', 'frostweaver_barrier',
    'Markiert sechs Sekunden einen Gegner mit {damage} % Zauberkraft. Deine nächsten zwei Treffer bringen je {bonus} % Zusatzschaden, solange das Ziel tatsächlich verlangsamt ist; sonst nur die Hälfte. Das Mal selbst verlangsamt nicht und belohnt einen vorbereiteten Frostangriff.',
    { cost: 26, cooldown: 16, range: 350, duration: 6, charges: 2, damageMultiplier: .35, comboMultiplier: .7, condition: 'slowed', color: '#b3d4da', icon: '◆' }),
  technique('frostweaver', 'crystal_answer', 'Kristallantwort', 62, 'retaliationWard', 'Eiswall', 'frostweaver_frozen_bastion',
    'Sechs Sekunden Wacht und ein kleiner Lebensschild. Drei mögliche Antworten auf echten Lebensverlust treffen den nächsten sichtbaren Gegner mit {damage} % Zauberkraft und bremsen ihn zwei Sekunden um 45 %. Eine Antwort je Sekunde; abgefangener Schaden zählt nicht.',
    { cost: 34, cooldown: 25, range: 240, duration: 6, charges: 3, procCooldown: 1, shieldFraction: .1, slow: .45, slowDuration: 2, damageMultiplier: .38, color: '#b6d7e0', icon: '⬡' }),

  technique('druid', 'root_claim', 'Wurzelanspruch', 16, 'mark', 'Wildnis', 'druid_vines',
    'Sechs Sekunden Wurzelmal mit {damage} % Zauberkraft. Zwei eigene Treffer lösen je {bonus} % Zusatzschaden aus, wenn dein Ziel verlangsamt ist; sonst nur die Hälfte. Das Mal hält den Gegner nicht fest: bereite seine Rankenfessel mit einer anderen Technik vor.',
    { cost: 24, cooldown: 15, range: 280, duration: 6, charges: 2, damageMultiplier: .35, comboMultiplier: .6, condition: 'slowed', color: '#91b18b', icon: '◆' }),
  technique('druid', 'briar_answer', 'Antwort der Dornen', 38, 'retaliationWard', 'Blüte', 'druid_grove',
    'Sieben Sekunden Wacht mit kleinem Lebensschild. Drei tatsächliche Lebensverluste antworten dem nächsten sichtbaren Gegner mit {damage} % Zauberkraft; 10 % echten Schadens heilen dich. Antworten sind auf eine je Sekunde begrenzt und wecken niemanden aus dem Tod.',
    { cost: 30, cooldown: 25, range: 220, duration: 7, charges: 3, procCooldown: 1, shieldFraction: .08, drain: .1, damageMultiplier: .35, color: '#9db693', icon: '⬡' }),
  technique('druid', 'moon_stride', 'Mondquerung', 62, 'stepStrike', 'Mond', 'druid_briar_circle',
    'Quert 135 Schritte seitlich zur Blickrichtung. Am tatsächlichen Ende erfasst ein Rankenbogen Gegner mit {damage} % Zauberkraft und bremst sie 2,5 Sekunden um 55 %. Der Schritt durchquert keine Hindernisse und gewährt keine Unverwundbarkeit.',
    { cost: 34, cooldown: 18, distance: 135, side: 1, range: 160, arc: 2.4, damageMultiplier: .95, slow: .55, duration: 2.5, color: '#a5bda9', icon: '↝' }),

  technique('shadowbinder', 'grave_thread', 'Faden der Gruft', 16, 'channel', 'Grab', 'shadowbinder_grave_lance',
    'Drei feste Seelenimpulse treffen je mit {damage} % Zauberkraft und heilen dich für 8 % des echten Schadens. Höchstens vier Ziele pro Impuls. Bewegung, Lebensverlust oder ein neuer erfolgreicher Angriff lösen den Faden; es gibt kein Heilen an unverwundbaren Gegnern.',
    { cost: 28, cooldown: 16, range: 420, width: 24, ticks: 3, interval: .45, windup: .3, drain: .08, damageMultiplier: .34, color: '#afa0be', icon: '☾' }),
  technique('shadowbinder', 'quiet_covenant', 'Der stille Vertrag', 38, 'mark', 'Seele', 'shadowbinder_curse',
    'Bindet sechs Sekunden einen Gegner mit {damage} % Zauberkraft. Zwei eigene Treffer bringen je {bonus} % Zusatzschaden, wenn dein Hungriges Mal oder Sterbegeläut am Ziel noch aktiv ist; sonst nur die Hälfte. Ein fremder Fluch oder Treffer erfüllt den eigenen Vertrag nicht.',
    { cost: 25, cooldown: 16, range: 320, duration: 6, charges: 2, damageMultiplier: .35, comboMultiplier: .65, condition: 'cursed', color: '#b3a1bc', icon: '◆' }),
  technique('shadowbinder', 'pact_answer', 'Antwort des Pakts', 62, 'retaliationWard', 'Pakt', 'shadowbinder_ossuary',
    'Sechs Sekunden Wacht mit kleinem Lebensschild. Nach echtem Lebensverlust antwortet sie höchstens dreimal dem nächsten sichtbaren Gegner mit {damage} % Zauberkraft. 15 % des echten Schadens heilen dich; Antworten brauchen eine Sekunde Abstand und verbrauchen keine Diener.',
    { cost: 35, cooldown: 27, range: 250, duration: 6, charges: 3, procCooldown: 1, shieldFraction: .08, drain: .15, damageMultiplier: .4, color: '#b3a2c0', icon: '⬡' }),
]);
