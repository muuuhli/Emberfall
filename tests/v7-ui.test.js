import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { ABILITIES } from '../src/abilities.js';
import { CLASSES, canLearnTalent } from '../src/classes.js';
import { applyTalentAbilityProfile, describeTalentCombatEffects } from '../src/talent-combat.js';

const view=()=>Object.assign(Object.create(GameUI.prototype),{game:new Game({storage:null}),talentTab:'abilities',talentSearch:'',talentStatus:'all',talentBranch:'all',talentPage:0});
const ids=(html,kind)=>[...html.matchAll(new RegExp(`data-${kind}-id="([^"]+)"`,'g'))].map(match=>match[1]);
function learnTalent(game,id){
  const skill=game.availableSkills().find(skill=>skill.id===id);assert.ok(skill,id);
  for(const prerequisite of !skill.requires?[]:Array.isArray(skill.requires)?skill.requires:[skill.requires]){
    const parent=typeof prerequisite==='string'?prerequisite:prerequisite.id,count=typeof prerequisite==='string'?skill.requiresRank||1:prerequisite.rank||1;
    while((game.skills[parent]||0)<count)learnTalent(game,parent);
  }
  assert.equal(game.learn(id),true,id);
}

test('all expanded class techniques stay discoverable on pages of at most six',()=>{
  for(const cls of CLASSES){const ui=view();ui.game.selectClass(cls.id);const records=ABILITIES.filter(record=>record.classId===cls.id),found=[];
    for(let page=0;page<Math.ceil(records.length/6);page++){ui.talentPage=page;const rows=ids(ui.activeAbilities(),'ability');assert.ok(rows.length<=6);found.push(...rows);}
    assert.deepEqual(new Set(found),new Set(records.map(record=>record.id)));
    const last=records.at(-1);ui.talentSearch=last.name;ui.talentPage=99;assert.deepEqual(ids(ui.activeAbilities(),'ability'),[last.id]);assert.equal(ui.talentPage,0);
    ui.talentBranch=records.find(record=>record.branch!==last.branch)?.branch || 'absent';if(ui.talentBranch!=='absent')assert.equal(ids(ui.activeAbilities(),'ability').length,0);
  }
});

test('passive catalogs expose canonical branches and translated mechanics without unbounded trees',()=>{
  const ui=view();ui.talentTab='passives';const records=ui.game.availableSkills(),found=[];
  for(let page=0;page<Math.ceil(records.length/6);page++){ui.talentPage=page;const rows=ids(ui.talents(),'talent');assert.ok(rows.length<=6);found.push(...rows);}
  assert.deepEqual(new Set(found),new Set(records.map(record=>record.id)));
  const mechanical=records.find(record=>record.combatDepth&&!record.keystone);ui.talentSearch=mechanical.name;ui.talentPage=99;
  const html=ui.talents();assert.deepEqual(ids(html,'talent'),[mechanical.id]);for(const text of describeTalentCombatEffects(mechanical))assert.ok(html.includes(text));
  ui.talentStatus='keystones';assert.equal(ids(ui.talents(),'talent').length,0);ui.talentSearch='';assert.ok(ids(ui.talents(),'talent').every(id=>records.find(record=>record.id===id).keystone));
});

test('exclusive combat oaths show their chosen blocker, real prerequisites and negative stat price',()=>{
  const ui=view(),game=ui.game;game.player.level=100;game.player.skillPoints=250;ui.talentTab='passives';
  const oath=game.availableSkills().find(record=>record.exclusiveGroup&&record.secondaryEffects?.some(effect=>effect.value<0));
  const rival=game.availableSkills().find(record=>record.exclusiveGroup===oath.exclusiveGroup&&record.id!==oath.id);
  learnTalent(game,oath.id);ui.talentSearch=oath.name;let html=ui.talents();assert.match(html,/stat-worse/);assert.ok(html.includes(rival.name));
  for(const prerequisite of [rival.requires]){const id=typeof prerequisite==='string'?prerequisite:prerequisite.id;while((game.skills[id]||0)<rival.requiresRank)learnTalent(game,id);}
  ui.talentSearch=rival.name;html=ui.talents();const check=canLearnTalent(game,rival.id);assert.equal(check.ok,false);assert.ok(html.includes(check.reason));assert.match(html,/data-command="learn"[^>]+disabled/);
});

test('equipped and learnable filters reflect actual loadout while profile facts use the same talent adjustment as combat',()=>{
  const ui=view(),game=ui.game;game.player.level=100;game.player.skillPoints=250;
  const ability=ABILITIES.find(record=>record.classId==='guardian'),oath=game.availableSkills().find(record=>record.combatEffects?.some(effect=>effect.stat==='cost'));
  learnTalent(game,oath.id);assert.equal(game.learnAbility(ability.id),true);assert.equal(game.setAbilityLoadout(0,null),true);assert.equal(game.setAbilityLoadout(1,ability.id),true);
  ui.talentStatus='equipped';const html=ui.activeAbilities();assert.deepEqual(ids(html,'ability'),[ability.id]);assert.ok(html.includes('AUF PLATZ 4'));
  const profile=applyTalentAbilityProfile(ability,game.combatTalentModifiers(),{action:'learned'});assert.ok(html.includes(`${profile.cost.toLocaleString('de-DE',{maximumFractionDigits:2})} Mana`));
  ui.talentStatus='learnable';assert.ok(!ids(ui.activeAbilities(),'ability').includes(ability.id));
  ui.talentSearch='"><img src=x onerror=alert(1)>';assert.ok(!ui.activeAbilities().includes('<img src=x'));
  const shielding=ABILITIES.find(record=>record.id==='guardian_answering_steel');
  const learnAbility=id=>{const def=ABILITIES.find(record=>record.id===id);if(game.learnedAbilities[id])return;if(def.requires)learnAbility(def.requires);assert.equal(game.learnAbility(id),true,id);};
  learnAbility(shielding.id);assert.equal(game.setAbilityLoadout(0,shielding.id),true);
  const actual=applyTalentAbilityProfile(shielding,game.combatTalentModifiers(),{action:'learned'}),mana=actual.cost.toLocaleString('de-DE',{maximumFractionDigits:2});
  assert.notEqual(actual.cost,shielding.cost);assert.notEqual(actual.cost,Math.round(actual.cost));
  ui.talentSearch=shielding.name;ui.talentStatus='all';assert.ok(ui.activeAbilities().includes(`${mana} Mana`));assert.ok(ui.buildOverview().includes(`${mana} Mana`));
});
