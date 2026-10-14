import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { NetworkClient } from '../src/network.js';
import { startServer } from '../server.mjs';
import { cumulativeXp } from '../src/progression.js';
import { CLASSES } from '../src/classes.js';
import { TECHNIQUE_SPECIALIZATIONS } from '../src/technique-specializations.js';

function character(classId='ranger') {
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.gainXp(cumulativeXp(70));
  game.resources.raidSigil=24;game.world.enemies=[];game.start();
  assert.equal(game.inSettlement(),true);return game;
}
function view(game=character()) {
  return Object.assign(Object.create(GameUI.prototype),{game,activePanel:'talents',talentTab:'abilities',techniqueBusy:false,
    talentSearch:'',talentStatus:'all',talentBranch:'all',talentPage:0,renderPanel(){},update(){},showNotice(){}});
}
const cards=html=>[...html.matchAll(/data-technique-id="([^"]+)"/g)].map(match=>match[1]);
const button=(html,command,id)=>new RegExp(`<button[^>]*data-command="${command}"${id?`[^>]*data-id="${id}"`:''}[^>]*>`).exec(html)?.[0];
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('the existing active-technique view shows the two own-class choices, countervalues, level and existing sigil price',()=>{
  for(const cls of CLASSES){
    const ui=view(character(cls.id)),html=ui.activeAbilities(),choices=TECHNIQUE_SPECIALIZATIONS.filter(def=>def.classId===cls.id);
    assert.deepEqual(cards(html),choices.map(choice=>choice.id));assert.match(html,/Technikprägung/);
    for(const choice of choices){assert.ok(html.includes(choice.description));assert.ok(html.includes(choice.techniqueName));assert.match(button(html,'learnTechniqueSpecialization',choice.id),/aria-busy="false"/);}
    assert.match(html,/Erlernen · 12 Quellensiegel/);assert.match(html,/STUFE 70/);assert.match(html,/eine Wahl|Eine Wahl/);
    assert.match(html,/kostenlos in einer Siedlung außerhalb des Kampfes/);assert.match(html,/Abklingzeiten bleiben bestehen/);
    assert.match(html,/data-technique-field="cost"/);assert.match(html,/data-technique-field="cooldown"/);
    assert.match(html,/data-ability-loadout="0"/);assert.match(html,/data-ability-loadout="1"/);
  }
});

test('comparison facts use the same adjusted current profile as actual casting, including fractional mana and post-stat cooldown',()=>{
  const game=character('paladin'),ui=view(game);game.combatTalentModifiers=()=>({healing:{healPower:.2},bolt:{radius:.1,cost:.15,cooldown:.1}});
  const offer=game.techniqueSpecializationSummary().offers.find(choice=>choice.id==='paladin_close_light'),facts=ui.techniqueProfileFacts(offer.modifiedProfile),html=ui.techniqueSpecializations();
  const number=value=>Number(value).toLocaleString('de-DE',{maximumFractionDigits:2});
  assert.ok(html.includes(`${number(offer.baseProfile.cost)}`));assert.ok(html.includes(`${number(offer.modifiedProfile.cost)}`));
  assert.ok(html.includes(`${number(offer.modifiedProfile.cooldown*(1-game.stats().cooldown))} s`));
  assert.ok(html.includes(`${number(offer.modifiedProfile.radius)}`));
  assert.equal(game.learnTechniqueSpecialization(offer.id),true);assert.equal(game.selectTechniqueSpecialization(offer.id),true);
  const profile=game.coreAbilityProfile('bolt');assert.equal(profile.cost,offer.modifiedProfile.cost);assert.equal(profile.radius,offer.modifiedProfile.radius);
  assert.deepEqual(ui.techniqueProfileFacts(profile),facts);assert.ok(ui.buildOverview().includes(`${number(profile.cost)} Mana`));
});

test('learning and selecting controls reflect actual gates, and learned techniques require a separate explicit selection',async()=>{
  const game=character(),ui=view(game),id='ranger_linebreaker';await ui.command('learnTechniqueSpecialization',id);
  assert.equal(game.resources.raidSigil,12);assert.equal(game.techniqueSpecializations.active,null);
  let html=ui.techniqueSpecializations();assert.ok(button(html,'selectTechniqueSpecialization',id));assert.ok(!button(html,'learnTechniqueSpecialization',id));
  game.inCombat=()=>true;html=ui.techniqueSpecializations();assert.match(button(html,'selectTechniqueSpecialization',id),/disabled/);assert.match(html,/Beende zuerst den Kampf/);
  game.inCombat=()=>false;await ui.command('selectTechniqueSpecialization',id);assert.equal(game.techniqueSpecializations.active,id);
  assert.match(ui.techniqueSpecializations(),/GEPRÄGT/);assert.match(button(ui.techniqueSpecializations(),'selectTechniqueSpecialization',id),/disabled/);
  game.inSettlement=()=>false;assert.match(button(ui.techniqueSpecializations(),'clear-technique'),/disabled/);
  const young=view();young.game.player.level=69;assert.match(button(young.techniqueSpecializations(),'learnTechniqueSpecialization',id),/disabled/);assert.match(young.techniqueSpecializations(),/Stufe 70/);
});

test('the actual UI command waits for its authority, blocks another payment and leaves learning separate from activation',async()=>{
  const ui=view(),game=ui.game,native=game.learnTechniqueSpecialization.bind(game);let finish,calls=0;
  game.learnTechniqueSpecialization=id=>{calls++;return new Promise(resolve=>{finish=()=>resolve(native(id));});};
  const flight=ui.command('learnTechniqueSpecialization','ranger_linebreaker');
  assert.equal(ui.techniqueBusy,true);assert.equal(game.resources.raidSigil,24);
  assert.match(button(ui.techniqueSpecializations(),'learnTechniqueSpecialization','ranger_linebreaker'),/disabled aria-busy="true"/);
  await ui.command('learnTechniqueSpecialization','ranger_focused_arrow');assert.equal(calls,1);
  finish();await flight;assert.equal(ui.techniqueBusy,false);assert.equal(game.resources.raidSigil,12);
  assert.equal(game.techniqueSpecializations.active,null);assert.ok(button(ui.techniqueSpecializations(),'selectTechniqueSpecialization','ranger_linebreaker'));
});

test('native UI switching between both owned alternatives and clearing retains the exact running cooldown and balance',async()=>{
  const game=character(),ui=view(game);for(const id of ['ranger_linebreaker','ranger_focused_arrow'])await ui.command('learnTechniqueSpecialization',id);
  game.cooldowns.bolt=2.75;game.cooldowns.nova=5.25;
  for(const id of ['ranger_focused_arrow','ranger_linebreaker']){
    await ui.command('selectTechniqueSpecialization',id);assert.equal(game.techniqueSpecializations.active,id);
    assert.equal(game.resources.raidSigil,0);assert.equal(game.cooldowns.bolt,2.75);assert.equal(game.cooldowns.nova,5.25);
  }
  await ui.command('clear-technique');assert.equal(game.techniqueSpecializations.active,null);assert.equal(game.cooldowns.bolt,2.75);
});

test('the production action-bar renderer uses the selected core cost and cooldown while keeping compact mobile names',()=>{
  const game=character(),ui=view(game),previous=globalThis.document;
  for(const id of ['ranger_linebreaker','ranger_focused_arrow'])game.learnTechniqueSpecialization(id);
  const controls=[];
  for(const action of ['attack','bolt','nova'])for(const touch of [false,true]){
    const parts={span:{textContent:''},use:{setAttribute(){}},'.cooldown-cover':{style:{}}};
    controls.push({dataset:touch?{touchAction:action}:{action},touch,action,title:'',querySelector:key=>parts[key],
      classList:{toggle(){}},setAttribute(){}});
  }
  // A minimal element seam observes the real renderer's writes; this is not a
  // rendered browser/device layout test. The browser QA covers that separately.
  globalThis.document={querySelector:selector=>{const action=/data-(?:touch-action|action)="([^"]+)"/.exec(selector)?.[1];return controls.find(control=>control.action===action&&control.touch===selector.startsWith('[data-touch-action'))||null;},
    querySelectorAll:selector=>selector==='.ability,.touch-ability'?controls:controls.filter(control=>control.action===/data-action="([^"]+)"/.exec(selector)?.[1])};
  try{
    game.selectTechniqueSpecialization('ranger_linebreaker');game.cooldowns.bolt=2.75;ui.updateCooldowns();
    for(const control of controls.filter(control=>control.action==='bolt')){
      assert.match(control.title,/Reihenbrecher/);assert.match(control.title,/16,1 Mana/);assert.match(control.title,/3 Sek/);
      assert.equal(control.querySelector('span').textContent,'Durchschlag');
      assert.ok(Math.abs(parseFloat(control.querySelector('.cooldown-cover').style.height)-2.75/3*100)<1e-8);
    }
    game.selectTechniqueSpecialization('ranger_focused_arrow');ui.updateCooldowns();
    for(const control of controls.filter(control=>control.action==='bolt')){
      assert.match(control.title,/Fokuspfeil/);assert.match(control.title,/3,75 Sek/);assert.equal(control.querySelector('span').textContent,'Durchschlag');
    }
    assert.equal(game.cooldowns.bolt,2.75);
  }finally{globalThis.document=previous;}
});

test('failed authoritative changes retain the old choice and re-enable its controls with a useful error',async()=>{
  const ui=view();ui.game.learnTechniqueSpecialization('ranger_linebreaker');ui.game.selectTechniqueSpecialization('ranger_linebreaker');
  let notice;ui.showNotice=(message,tone)=>{notice={message,tone};};ui.game.selectTechniqueSpecialization=async()=>{throw new Error('Verbindung unterbrochen');};
  await ui.command('clear-technique');assert.equal(ui.techniqueBusy,false);assert.equal(ui.game.techniqueSpecializations.active,'ranger_linebreaker');
  assert.deepEqual(notice,{message:'Verbindung unterbrochen',tone:'error'});
});

test('a real delayed HTTP payment goes through the production transport and the UI blocks repeated requests until the answer',async()=>{
  const running=await startServer({port:0,host:'127.0.0.1',storagePath:null,autoTick:false});
  // SSE delivery is covered by the network integration suite. This fixture
  // deliberately substitutes the stream while preserving real HTTP commands.
  class SilentStream{addEventListener(){}close(){}}
  let release,requestStarted,requests=0,delayed=true;
  const started=new Promise(resolve=>{requestStarted=resolve;});
  const fetchImpl=async(url,options)=>{
    if(url.endsWith('/command')&&JSON.parse(options.body).name==='learnTechniqueSpecialization'){
      requests++;if(delayed){requestStarted();await new Promise(resolve=>{release=resolve;});}
    }
    return fetch(url,options);
  };
  const game=new Game({storage:null}),client=new NetworkClient(game,{baseUrl:running.origin,storage:null,fetchImpl,EventSourceImpl:SilentStream});
  try{
    const session=await client.create({name:'Prägungsprobe',playerName:'Reisender',classId:'ranger'}),authority=running.hub.sessions.get(session.token).game;
    authority.gainXp(cumulativeXp(70));authority.resources.raidSigil=24;authority.world.enemies=[];
    client.applySnapshot(running.hub.snapshot(running.hub.sessions.get(session.token),{includeLayout:true}));client._status('online');
    const ui=view(game),flight=ui.command('learnTechniqueSpecialization','ranger_linebreaker');await started;
    assert.equal(ui.techniqueBusy,true);await ui.command('learnTechniqueSpecialization','ranger_focused_arrow');assert.equal(requests,1);
    assert.equal(authority.resources.raidSigil,24);assert.equal(game.resources.raidSigil,24);release();await flight;
    assert.equal(authority.resources.raidSigil,12);assert.deepEqual(authority.techniqueSpecializations.learned,['ranger_linebreaker']);
    const reply=await fetch(`${running.origin}/api/session/${session.token}`);client.applySnapshot(await reply.json());
    assert.equal(ui.techniqueBusy,false);assert.equal(game.resources.raidSigil,12);assert.deepEqual(game.techniqueSpecializations,authority.techniqueSpecializations);
    delayed=false;await ui.command('learnTechniqueSpecialization','ranger_linebreaker');await settle();
    assert.equal(authority.resources.raidSigil,12,'server refuses the duplicate without payment');
  }finally{release?.();await client.disconnect({leave:false});await running.close();}
});
