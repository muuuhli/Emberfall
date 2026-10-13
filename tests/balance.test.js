import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, getClass } from '../src/classes.js';
import { ITEMS, ENEMY_TYPES } from '../src/content.js';
import { ITEM_BASES, RARITIES, GEAR_STAT_CAPS, generateLoot, computeItemStats, validateLootItem } from '../src/loot.js';
import { BALANCE_VERSION, BALANCE_LEVELS, COMBAT_CAPS, basePlayerStats, classStatModifiers, capCombatStats,
  armorMitigation, incomingDamage, classPowerMultiplier, normalEnemyStats, enemyXpReward, estimateCombat } from '../src/balance.js';

const seeded = initial => {let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const clone = value => JSON.parse(JSON.stringify(value));
const add = (stats,modifiers) => {for(const [key,value] of Object.entries(modifiers))stats[key]=(stats[key]||0)+value;return stats;};

function loadout(level,classId,rarity='rare'){
  const cls=getClass(classId),primary=cls.abilities.attack.stat||'damage';
  const stats=add(basePlayerStats(level),classStatModifiers(classId,level)),items=[];
  if(rarity==='naked')return {stats,items,benchmark:estimateCombat({level,classId,stats})};
  if(rarity==='starter'){
    add(stats,ITEMS[cls.weaponId].stats);add(stats,ITEMS.leather_armor.stats);
  }else for(const type of ['weapon','armor','charm']){
    let bases=ITEM_BASES.filter(base=>base.type===type&&base.minLevel<=level&&(!base.classIds||base.classIds.includes(classId)));
    if(type==='weapon'||type==='charm')bases=bases.filter(base=>base.stats[primary]>0);
    if(type==='armor')bases=bases.filter(base=>base.stats.maxHp&&base.stats.armor);
    bases.sort((a,b)=>b.minLevel-a.minLevel);
    const item=generateLoot({level,classId,rarity,baseId:bases[0].id,rng:seeded(991+level),uid:`balance-${classId}-${type}-${level}-${rarity}`});
    items.push(item);add(stats,computeItemStats(item));
  }
  return {stats,items,benchmark:estimateCombat({level,classId,stats})};
}

test('base growth and class role modifiers are pure and bounded over levels one through one hundred',()=>{
  assert.deepEqual(basePlayerStats(1),{maxHp:112,mana:85,damage:15,armor:3,crit:.06,speed:175,spellDamage:16,manaRegen:4,cooldown:0,dodgeCooldown:0,gatherYield:0,lifeSteal:0});
  assert.equal(basePlayerStats(100).maxHp,1300);assert.equal(basePlayerStats(100).damage,312);
  assert.equal(basePlayerStats(100).armor,26.76);
  assert.deepEqual(basePlayerStats(NaN),basePlayerStats(1));assert.deepEqual(basePlayerStats(1000),basePlayerStats(100));
  for(const cls of CLASSES){
    const original=clone(cls.statMods),end=classStatModifiers(cls.id,100);
    assert.deepEqual(Object.keys(end).sort(),Object.keys(basePlayerStats()).sort());
    assert.deepEqual(cls.statMods,original);
    if(cls.statMods.maxHp)assert.ok(Math.abs(end.maxHp)>Math.abs(cls.statMods.maxHp)*4);
  }
  assert.ok(classStatModifiers('guardian',100).armor>classStatModifiers('ranger',100).armor);
});

test('rating mitigation scales with attacker level and never makes ordinary damage immune',()=>{
  assert.equal(armorMitigation(20,1),.5);
  assert.ok(armorMitigation(100,100)<.36,'A hundred armor does not grant naked eighty percent reduction at level100');
  assert.ok(armorMitigation(100,1)>armorMitigation(100,100));
  assert.equal(armorMitigation(1e9,100),.75);assert.equal(armorMitigation(-10,100),0);
  assert.equal(incomingDamage(100,{armor:1e9,attackerLevel:100}),25);
  assert.equal(incomingDamage(100,{armor:1e9,attackerLevel:100,trueDamage:true}),100);
  assert.equal(incomingDamage(.1,{armor:500,attackerLevel:100}),1);
  assert.equal(incomingDamage(0,{armor:500}),0);assert.equal(incomingDamage(NaN),0);
});

test('combined talents, sockets and sets obey shared combat caps without mutating their source',()=>{
  const raw={...basePlayerStats(100),crit:99,cooldown:99,lifeSteal:99,dodgeCooldown:99,speed:999,armor:1e9};
  const original=clone(raw),stats=capCombatStats(raw,{level:100});
  for(const [key,value] of Object.entries(COMBAT_CAPS))assert.equal(stats[key],value);
  assert.equal(stats.armor,600);assert.deepEqual(raw,original);
  for(const cls of CLASSES)for(const kind of ['attack','spell','heal','shield','summon'])assert.ok(classPowerMultiplier(cls.id,kind)>0&&classPowerMultiplier(cls.id,kind)<1.5);
});

test('gray enemies cannot fund unlimited late progression and authored rewards can remain separate',()=>{
  assert.equal(enemyXpReward(100,{enemyLevel:50,playerLevel:50}),100);
  assert.equal(enemyXpReward(100,{enemyLevel:45,playerLevel:50}),100);
  assert.equal(enemyXpReward(100,{enemyLevel:44,playerLevel:50}),60);
  assert.equal(enemyXpReward(100,{enemyLevel:40,playerLevel:50}),25);
  assert.equal(enemyXpReward(100,{enemyLevel:35,playerLevel:50}),10);
  assert.equal(enemyXpReward(100,{enemyLevel:30,playerLevel:50}),0);
  assert.equal(enemyXpReward(100,{enemyLevel:1,playerLevel:100,boss:true}),10);
  assert.equal(enemyXpReward(-100),0);
});

test('new normal enemy budgets grow monotonically without exponential health or damage',()=>{
  let hp=0,damage=0;
  for(let level=1;level<=100;level++){
    const foe=normalEnemyStats(level);
    assert.ok(foe.hp>hp&&foe.damage>=damage);assert.equal(foe.maxHp,foe.hp);
    assert.ok(foe.hp<=5000&&foe.damage<=300);hp=foe.hp;damage=foe.damage;
  }
  assert.equal(normalEnemyStats(100).hp,4956);
  assert.ok(normalEnemyStats(100,{tier:30}).hp>normalEnemyStats(100).hp);
});

test('new rolls use the versioned canonical budget and caster smart loot supplies real spell power',()=>{
  for(const cls of CLASSES){
    const primary=cls.abilities.attack.stat||'damage',rng=seeded(531);
    for(let index=0;index<500;index++){
      const item=generateLoot({level:100,classId:cls.id,rng,uid:`smart-balance-${cls.id}-${index}`});
      assert.equal(item.balanceVersion,BALANCE_VERSION);assert.equal(item.classId,cls.id);assert.ok(validateLootItem(item));
      if(item.type==='weapon')assert.ok(item.stats[primary]>0,`${cls.id}: ${item.baseId} misses ${primary}`);
      if(primary==='spellDamage')assert.ok(item.affixes.every(affix=>affix.id!=='power'));
    }
  }
});

test('canonical legacy rolls load unchanged and receive the new runtime budget exactly once',()=>{
  // Golden serialized roll from the original 1+0.04*delta / .35*delta formula.
  const legacy={id:'loot:legacy-golden',baseId:'iron_longsword',name:'Alter Eid',type:'weapon',rarity:'legendary',level:100,icon:'⚔',description:'Bestandsschutz',
    stats:{damage:124.845},price:100,power:500,upgrade:8,dungeonTier:17,setId:null,sockets:[null,null,null],
    affixes:[{id:'power',stats:{damage:34.678}},{id:'sorcery',stats:{spellDamage:45.78}},{id:'precision',stats:{crit:.0376}},
      {id:'legendary_last_stand',stats:{maxHp:120,armor:8},legendary:true}]};
  assert.equal(validateLootItem(legacy),true);
  const before=clone(legacy),derived=computeItemStats(legacy);
  assert.ok(derived.damage>legacy.stats.damage*3);assert.equal(derived.crit,.0376);
  assert.deepEqual(legacy,before);assert.deepEqual(computeItemStats(legacy),derived);
  const modern={...clone(legacy),balanceVersion:2,classId:'guardian',stats:{damage:317.1525}};
  modern.affixes[0].stats.damage=61.012;modern.affixes[1].stats.spellDamage=80.43;
  assert.equal(validateLootItem(modern),true);assert.deepEqual(computeItemStats(modern),derived);
  const forged=clone(legacy);forged.stats.damage+=1;assert.equal(validateLootItem(forged),false);
  const wrongVersion=clone(legacy);wrongVersion.balanceVersion=2;wrongVersion.classId='guardian';assert.equal(validateLootItem(wrongVersion),false);
});

test('rare and epic weapon and armor power visibly exceed each own-class starter after level ten',()=>{
  for(const cls of CLASSES)for(const level of BALANCE_LEVELS.filter(level=>level>=10)){
    const starter=loadout(level,cls.id,'starter'),rare=loadout(level,cls.id),epic=loadout(level,cls.id,'epic');
    const primary=cls.abilities.attack.stat||'damage';
    assert.ok(rare.items[0].stats[primary]>=ITEMS[cls.weaponId].stats[primary]*2,`${cls.id} level${level} weapon`);
    assert.ok(rare.items[1].stats.maxHp>=ITEMS.leather_armor.stats.maxHp*2);
    assert.ok(rare.benchmark.dps>starter.benchmark.dps*1.35,`${cls.id} level${level} damage improvement`);
    assert.ok(rare.benchmark.ttd>starter.benchmark.ttd*1.2,`${cls.id} level${level} defense improvement`);
    assert.ok(epic.benchmark.dps>rare.benchmark.dps*1.03,`${cls.id} level${level} epic progression`);
  }
});

test('all eight class benchmarks stay finite at six milestones and endgame trash remains readable',()=>{
  for(const level of BALANCE_LEVELS){
    const rows=CLASSES.map(cls=>loadout(level,cls.id).benchmark);
    for(const row of rows){
      assert.ok(row.ttk>0&&row.ttk<6&&row.ttd>8&&row.ttd<50);
      assert.ok(row.dps>0&&row.manaDuty>0&&row.manaDuty<=1);
    }
    if(level>=10)assert.ok(Math.max(...rows.map(row=>row.dps))/Math.min(...rows.map(row=>row.dps))<1.9,`class DPS spread level${level}`);
    if(level===100){
      assert.ok(rows.every(row=>row.ttk>=2.2&&row.ttk<=4.5));
      assert.ok(rows.find(row=>row.classId==='guardian').ttd>rows.find(row=>row.classId==='ranger').ttd*1.1);
      assert.ok(rows.find(row=>row.classId==='druid').healingPerSecond>rows.find(row=>row.classId==='paladin').healingPerSecond);
    }
  }
});

test('all eight own-class starter loadouts can fight the real first wolf and level-ten imp',()=>{
  for(const level of [1,10]){
    const definition=ENEMY_TYPES[level===1?'wolf':'imp'];
    const rows=CLASSES.map(cls=>{
      const {stats}=loadout(level,cls.id,'starter');
      return estimateCombat({level,classId:cls.id,stats,enemy:{...definition,attackPeriod:1.65}});
    });
    assert.ok(rows.every(row=>row.ttk>.3&&row.ttk<2.5&&row.ttd>12),'Early combat has readable hits and a survivable beginner margin');
    assert.ok(Math.max(...rows.map(row=>row.dps))/Math.min(...rows.map(row=>row.dps))<2.1,'Early class spread remains below double damage');
  }
});

test('healer rotation is mana-limited early and remains meaningful against incoming packs',()=>{
  for(const classId of ['paladin','druid'])for(const level of [12,25,100])for(const rarity of ['naked','starter','rare']){
    const row=loadout(level,classId,rarity).benchmark;
    const singleIncoming=row.hitDamage/3,threeIncoming=singleIncoming*3;
    assert.ok(row.healingPerSecond>singleIncoming*.5,`${classId} level${level} healing is useful`);
    assert.ok(row.healingPerSecond<row.stats.maxHp*.25,`${classId} level${level} healing is bounded`);
    assert.ok(threeIncoming>singleIncoming&&row.threeEnemyTtd<row.ttd);
    if(rarity==='starter'&&level===12)assert.ok(row.manaDuty<.8,'Full early rotations cannot sustain with starter mana regeneration');
  }
});

test('depth, upgrades and tier-three sockets stay within per-item caps and preserve canonical roll truth',()=>{
  for(const cls of CLASSES)for(const rarity of Object.keys(RARITIES))for(const type of ['weapon','armor','charm']){
    const {items}=loadout(100,cls.id,rarity),item=items.find(item=>item.type===type),original=clone(item.stats);
    item.upgrade=10;item.dungeonTier=30;item.sockets=item.sockets.map(()=>({id:'emerald',tier:3}));
    const stats=computeItemStats(item);
    assert.equal(validateLootItem(item),true,`${cls.id} ${rarity} ${type}`);
    for(const [stat,value]of Object.entries(stats))assert.ok(value<=GEAR_STAT_CAPS[stat]);
    assert.deepEqual(item.stats,original);
    for(const mutate of [value=>value.balanceVersion=99,value=>value.classId='invented',value=>value.upgrade=11]){
      const forged=clone(item);mutate(forged);assert.equal(validateLootItem(forged),false);
    }
  }
});
