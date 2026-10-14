// Native skill-pair and controlled sustain probes. These are artificial fixtures,
// not human playtests or boss-difficulty evidence. See docs/v8-ability-balance.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const project = fileURLToPath(new URL('../../', import.meta.url));
const options = { sourceRoot: project, output: null, mode: 'all', build: 'paid', pairLimit: 55, director: 'isolated' };
const flags = { '--source-root': 'sourceRoot', '--output': 'output', '--mode': 'mode', '--build': 'build', '--pair-limit': 'pairLimit', '--director': 'director' };
if (process.argv.includes('--help')) {
  process.stdout.write('node tests/scripts/v8-ability-balance-audit.mjs --output report.json [--source-root project] [--mode all|pairs|sustain|multisource] [--build paid|bounded] [--pair-limit 1..55] [--director isolated|historical]\n');
  process.exit(0);
}
for (let index = 2; index < process.argv.length; index++) {
  const key = flags[process.argv[index]], value = process.argv[++index];
  if (!key || !value || value.startsWith('--')) throw Error('Unknown or incomplete audit option. Use --help.');
  options[key] = value;
}
options.sourceRoot = path.resolve(options.sourceRoot); options.pairLimit = Number(options.pairLimit);
if (!options.output || !['all', 'pairs', 'sustain', 'multisource'].includes(options.mode) || !['paid', 'bounded'].includes(options.build) || !['isolated', 'historical'].includes(options.director)
  || !Number.isInteger(options.pairLimit) || options.pairLimit < 1 || options.pairLimit > 55) throw Error('Invalid audit options. --output is required.');
const output = path.resolve(options.output);
async function fingerprint() {
  const hashes = {};
  const files = (await fs.readdir(path.join(options.sourceRoot, 'src'))).filter(file => file.endsWith('.js')).sort();
  for (const file of files) {
    hashes[file] = createHash('sha256').update(await fs.readFile(path.join(options.sourceRoot, 'src', file))).digest('hex');
  }
  return { sha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex'), files: hashes };
}
const beforeFingerprint = await fingerprint();
const imported = await Promise.all(['game', 'classes', 'abilities', 'loot', 'equipment-system', 'progression', 'ability-runtime', 'talent-combat']
  .map(file => import(pathToFileURL(path.join(options.sourceRoot, 'src', file + '.js')))));
const { Game, CLASSES, ABILITIES, getAbility, ITEM_BASES, generateLoot, EQUIPMENT_SLOTS, equipmentSlot, cumulativeXp,
  clearMasteryAbilities, getMasteryState, applyTalentAttackProfile, applyTalentAbilityProfile } = Object.assign({}, ...imported);
if (CLASSES.length !== 8 || ABILITIES.length !== 88 || CLASSES.some(cls => ABILITIES.filter(ability => ability.classId === cls.id).length !== 11))
  throw Error('This V8 audit requires eight classes with eleven registered skills each.');
const DT = .04, SECONDS = 45;
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const round=v=>Math.round(v*100)/100;
function learnPath(game,talent,rank){
  if(talent.requires){const previous=CLASSES.find(c=>c.id===game.classId).talents.find(t=>t.id===talent.requires);learnPath(game,previous,talent.requiresRank||1);}
  while((game.skills[talent.id]||0)<rank){if(!game.learn(talent.id))return false;}return true;
}
function learnAbility(game,a){if(a.requires&&!game.learnedAbilities[a.requires])learnAbility(game,getAbility(a.requires));if(!game.learnedAbilities[a.id]&&!game.learnAbility(a.id))throw Error(a.id);}
function setup(cls,build='bounded',pair=[]){
  const game=new Game({storage:null,random:rng(8117)});game.selectClass(cls.id);game.start();game.gainXp(cumulativeXp(100));
  for(const slot of EQUIPMENT_SLOTS){const base=ITEM_BASES.filter(b=>equipmentSlot(b)===slot.id&&b.minLevel<=100&&(!b.classIds||b.classIds.includes(cls.id))).sort((a,b)=>b.minLevel-a.minLevel||a.id.localeCompare(b.id))[0];
    const item=generateLoot({level:100,baseId:base.id,classId:cls.id,rarity:'rare',rng:rng(12771),uid:`v8-${cls.id}-${slot.id}`,source:'audit_fixture'});if(!game.addItem(item)||!game.equip(item.id))throw Error('gear');}
  const abilities=ABILITIES.filter(a=>a.classId===cls.id);
  for(const a of build==='sustain'?pair:abilities)learnAbility(game,a);
  const newTalents=cls.talents.filter(t=>t.combatDepth);
  for(const t of newTalents.filter(t=>!t.keystone))learnPath(game,t,2);
  learnPath(game,newTalents.find(t=>t.keystone),1);
  if(build!=='bounded'){
    const priorities=cls.talents.filter(t=>!t.combatDepth).sort((a,b)=>{
      const score=t=>build==='sustain' ? ((t.effect?.stat==='cooldown')?100:0)+((t.effect?.stat==='manaRegen')?80:0)+(t.secondaryEffects||[]).filter(e=>e.stat==='cooldown').length*100+((t.effect?.stat==='lifeSteal')?60:0)+((t.effect?.stat==='maxHp')?20:0) : ((t.effect?.stat==='cooldown')?80:0)+((t.effect?.stat==='manaRegen')?40:0)+(t.secondaryEffects||[]).filter(e=>e.stat==='cooldown').length*80+((t.effect?.stat==='lifeSteal')?35:0)+((t.effect?.stat==='maxHp')?(cls.id==='guardian'?50:20):0)+((t.effect?.stat===(cls.abilities.attack.stat||'damage'))?60:0)+((t.effect?.stat==='armor')?10:0);
      return score(b)-score(a);});
    for(const t of priorities)learnPath(game,t,t.maxRank);
  }else for(let pass=0;pass<3;pass++)for(const t of cls.talents.filter(t=>!t.combatDepth))if((game.skills[t.id]||0)<Math.min(3,t.maxRank))game.learn(t.id);
  const cost=cls.talents.reduce((sum,t)=>sum+(game.skills[t.id]||0)*(t.cost||1),0)+abilities.filter(a=>game.learnedAbilities[a.id]).reduce((sum,a)=>sum+a.talentCost,0);
  if(cost+game.player.skillPoints!==200||game.player.skillPoints<0)throw Error('point budget');
  const fixture={points:200,spent:cost,unspent:game.player.skillPoints,skills:{...game.skills},stats:game.stats(),gear:EQUIPMENT_SLOTS.map(slot=>({slot:slot.id,...game.item(game.equipment[slot.id])})),newTalents:cls.talents.filter(t=>t.combatDepth&&game.skills[t.id]).map(t=>[t.id,game.skills[t.id]])};
  for(const key of ['trees','rocks','structures','walls','nodes','plots','chests','shrines','enemies','worldEvents','interactions'])game.world[key]=[];game.npcs=[];game.updateEnemies=()=>{};
  // Isolated test arena: no ambient AI, terrain, events or scheduled packs.
  game.world.encounterDirector.nextIn=1e6;
  if(options.director==='isolated')game.world.encounterDirector.elapsed=1;
  return {game,fixture};
}
function reset(game,pair){
  clearMasteryAbilities(game);game.cooldowns={};game.effects=[];game.hazards=[];game.summons=[];game.projectiles=[];game.drops=[];game.dead=false;game.paused=false;game.keys.clear();game.time=0;game.leechBudget=null;game.damageGrace?.clear();
  Object.assign(game.player,{x:5000,y:1800,face:0,hp:game.stats().maxHp*.2,mana:game.stats().mana,shield:0,shieldUntil:0,invulnerable:0,dashUntil:0,slowUntil:0,afflictions:[]});
  game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,null);pair.forEach((a,i)=>game.setAbilityLoadout(i,a.id));
  const enemy={id:'bench-target',type:'wolf',level:100,hp:1e9,maxHp:1e9,alive:true,x:5080,y:1800,homeX:5080,homeY:1800,phase:'idle',attackTimer:999};game.world.enemies=[enemy];
  return enemy;
}
function run(game,pair,{pressure=false,seconds=SECONDS,sourceCount=1,startHp=.2,startMana=1,respectGrace=false}={}){
  const enemy=reset(game,pair),stats=game.stats(),casts={},manaSpent={},baseActs={};let extraActorPeak=0,manaGained=0,damage=0,healing=0,requestedHealing=0,damageTaken=0,shieldFrames=0,peakSummons=0,lastPressure=0,pressureTicks=0;const pressureIntervals=[];
  game.player.hp=stats.maxHp*startHp;game.player.mana=stats.mana*startMana;
  const hit=game.hitEnemy.bind(game),heal=game._healAbilityAlly.bind(game),hurt=game.damagePlayer.bind(game);
  game.hitEnemy=(...args)=>{const dealt=hit(...args)||0;damage+=dealt;return dealt;};
  game._healAbilityAlly=(ally,amount)=>{requestedHealing+=Math.max(0,amount);const applied=heal(ally,amount);healing+=applied;return applied;};
  game.damagePlayer=(...args)=>{const applied=hurt(...args)||0;damageTaken+=applied;return applied;};
  for(let frame=0;frame<Math.ceil(seconds/DT)&&!game.dead;frame++){
    const p=game.player,dx=enemy.x-p.x,dy=enemy.y-p.y,range=Math.hypot(dx,dy);game.aim={x:enemy.x,y:enemy.y};p.face=Math.atan2(dy,dx);game.keys.clear();
    const channel=getMasteryState(game).channel,attackProfile=applyTalentAttackProfile(CLASSES.find(c=>c.id===game.classId).abilities.attack,game.combatTalentModifiers()),approach=attackProfile.kind==='projectile'?100:attackProfile.range*.6;
    if(!channel){
      if(range>approach){if(dx>5)game.keys.add('d');else if(dx<-5)game.keys.add('a');if(dy>5)game.keys.add('s');else if(dy<-5)game.keys.add('w');}
      const order=[0,1].sort((a,b)=>Number(pair[a].kind==='channel')-Number(pair[b].kind==='channel'));
      for(const slot of order){const a=pair[slot];if(a.kind==='channel'&&game.keys.size)continue;const mana=p.mana;
        if(game.useLearnedAbility(slot)){casts[a.id]=(casts[a.id]||0)+1;manaSpent[a.id]=(manaSpent[a.id]||0)+Math.max(0,mana-p.mana);manaGained+=Math.max(0,p.mana-mana);if(a.kind==='channel')break;}}
      if(!getMasteryState(game).channel)for(const action of ['attack','bolt','nova']){const mana=p.mana;if(game.action(action)){baseActs[action]=(baseActs[action]||0)+1;manaSpent[action]=(manaSpent[action]||0)+Math.max(0,mana-p.mana);}}
    }
    if(pressure&&game.time-lastPressure>=.25){pressureIntervals.push(game.time-lastPressure);lastPressure=game.time;pressureTicks++;for(let source=0;source<sourceCount;source++)game.damagePlayer(100,{attackerLevel:100,ignoreInvulnerability:!respectGrace,attackerId:'controlled-pressure-'+source});}
    game.update(DT);extraActorPeak=Math.max(extraActorPeak,game.world.enemies.filter(actor=>actor!==enemy).length);
    if(game.player.shield>0&&game.player.shieldUntil>game.time)shieldFrames++;peakSummons=Math.max(peakSummons,game.summons.filter(s=>s.life>0&&!s.companion).length);
  }
  game.hitEnemy=hit;game._healAbilityAlly=heal;game.damagePlayer=hurt;
  if(options.director==='isolated'&&extraActorPeak)throw Error('An external actor entered the isolated skill arena.');
  return {extraActorPeak,sourceCount,startHp,startMana,respectGrace,pressureTicks,damageAttempts:pressureTicks*sourceCount,pressureSpacing:pressureIntervals.length?{min:round(Math.min(...pressureIntervals)),max:round(Math.max(...pressureIntervals))}:null,pair:pair.map(a=>a.id),classId:game.classId,seconds:round(game.time),dead:game.dead,dps:round(damage/game.time),damage:round(damage),hps:round(healing/game.time),requestedHps:round(requestedHealing/game.time),damageTaken:round(damageTaken),manaPerSecond:round(Object.values(manaSpent).reduce((s,x)=>s+x,0)/game.time),manaSpent,manaGained:round(manaGained),manaLeft:round(game.player.mana),hpLeft:round(game.player.hp),shieldCoverage:round(shieldFrames/Math.ceil(game.time/DT)),peakSummons,casts,baseActs};
}

const pairs = [], fixtures = [], profiles = [], sustain = [], multisource = [];
if (['all', 'pairs'].includes(options.mode)) for (const cls of CLASSES) {
  const { game, fixture } = setup(cls, options.build); fixtures.push({ classId: cls.id, ...fixture });
  const abilities = ABILITIES.filter(ability => ability.classId === cls.id); let completed = 0;
  for (let first = 0; first < abilities.length; first++) for (let second = first + 1; second < abilities.length; second++) {
    if (completed++ < options.pairLimit) pairs.push(run(game, [abilities[first], abilities[second]]));
  }
  for (const ability of abilities) {
    const profile = applyTalentAbilityProfile(ability, game.combatTalentModifiers(), { action: 'learned' });
    profiles.push({ id: ability.id, kind: ability.kind, cost: profile.cost, cooldown: profile.cooldown * (1 - game.stats().cooldown), duration: profile.duration || null });
  }
}
const sustainPairs = [
  ['guardian', ['guardian_iron_oath', 'guardian_last_watch']],
  ['druid', ['druid_spring_rain', 'druid_moonwell']],
  ['shadowbinder', ['shadowbinder_legion', 'shadowbinder_abyss_eye']],
];
for (const [classId, ids] of sustainPairs) {
  const cls = CLASSES.find(definition => definition.id === classId), pair = ids.map(getAbility);
  if (['all', 'sustain'].includes(options.mode)) {
    const { game, fixture } = setup(cls, 'sustain', pair);
    sustain.push({ ...run(game, pair, { pressure: true, seconds: 90 }), fixture });
  }
  if (['all', 'multisource'].includes(options.mode)) for (const sourceCount of [3, 4, 5]) for (const startMana of [1, .25]) {
    const { game, fixture } = setup(cls, 'sustain', pair);
    multisource.push({ ...run(game, pair, { pressure: true, seconds: 90, sourceCount, startMana, startHp: 1, respectGrace: true }), fixture });
  }
}
const afterFingerprint = await fingerprint();
if (beforeFingerprint.sha256 !== afterFingerprint.sha256) throw Error('Source files changed during the audit; rerun against a frozen tree.');
const report = {
  version: 1, humanPlaytest: false, sourceRoot: options.sourceRoot, fingerprint: beforeFingerprint,
  controllerHash: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'), options,
  assumptions: {
    level: 100, earnedPoints: 200, learning: 'Every ability and rank is paid through real Game.learn/learnAbility canonical paths; no extra quest points.',
    gear: 'Seven class-legal Rare items; highest minLevel, then alphabetical baseId per slot. This may select an arcane charm for physical classes. No gems, upgrades, relics, food or companions.',
    build: 'paid prioritizes resources/offense; bounded caps old ranks at3. Both learn all11 skills and first exclusive oath. Sustain uses the original legal200-point support allocations. Heuristic priorities are not a mathematical optimum.',
    environment: 'Cover, ambient enemies and world events are removed; native knockback and player movement remain. Huge-HP wolf dummy and disabled enemy AI are artificial fixtures. Default isolated director suppresses first bootstrap and requires zero extra actors; historical deliberately reproduces the old delayed-bootstrap limitation, recording extraActorPeak.',
    controller: 'Melee approaches60% adjusted attackreach; ranged approaches100px. Successful channels finish before ordinary attacks. Native two learned slots plus attack/bolt/nova actions retain real costs and cooldowns.',
    pressure: '100 raw damage/source with threshold >=0.25s in0.04s native steps; actual spacing0.28s. Single-source probes ignore immunity; multi-source probes use distinct attacker IDs and respect grace.',
    outputs: 'DPS includes ordinary/core attacks. hps is actual finite-wound healing; requestedHps counts calls before HP clamping and is diagnostic, not guaranteed sustainable healing. These arena fixtures are not importable play saves.',
  }, fixtures, profiles, pairs, sustain, multisource,
};
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ output, pairs: pairs.length, sustain: sustain.length, multisource: multisource.length, sourceStable: true }) + '\n');
