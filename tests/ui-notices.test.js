import test from 'node:test';
import assert from 'node:assert/strict';
import { NoticeQueue } from '../src/ui-notices.js';

function fixture() { let time=0;return {queue:new NoticeQueue({now:()=>time}),tick(ms){time+=ms;return this.queue.advance();}}; }

test('loot and XP bursts become one accurate message without a replay backlog',()=>{
  const f=fixture(),q=f.queue;
  for(let index=0;index<20;index++)q.push(`Klinge ${index} gefunden`,'loot');
  q.push('+45 EP erhalten','xp');q.push('+12 EP erhalten','xp');
  assert.equal(q.active,null);assert.equal(q.pending.length,1);assert.equal(q.history.length,1);
  const notice=f.tick(250);assert.equal(notice.finds,20);assert.equal(notice.xp,57);assert.match(notice.text,/20 Beutefunde · \+57 EP/);
  assert.equal(f.tick(3000),null);
});

test('errors immediately preempt loot, levels preempt story, and recent errors do not extend forever',()=>{
  const f=fixture(),q=f.queue;q.push('Klinge gefunden','loot');f.tick(250);
  q.push('Quest angenommen: Der erste Eid','quest');assert.equal(q.active.kind,'story');
  q.push('Level 2 erreicht · 2 Talentpunkte','level');assert.equal(q.active.kind,'level');
  q.push('Nicht genug Mana.');assert.equal(q.active.kind,'error');const deadline=q.active.visibleUntil;
  f.tick(400);for(let index=0;index<100;index++)q.push('Nicht genug Mana.');
  assert.equal(q.active.visibleUntil,deadline);assert.equal(q.history.filter(entry=>entry.kind==='error').length,1);
  f.tick(4800);assert.equal(q.active.kind,'level');
});

test('multiple quest goals coalesce, while different story passages retain their text and order',()=>{
  const f=fixture(),q=f.queue;
  q.push('Questziel erreicht: Der Brunnen','quest');q.push('Questziel erreicht: Glutwacht','quest');f.tick(250);
  assert.equal(q.active.count,2);assert.match(q.active.text,/2 Questziele bereit/);assert.ok(q.active.text.includes('Glutwacht'));
  q.push('Die Grabwächter erwachen.','quest');q.push('Eine Kette schlägt gegen Stein.','quest');
  f.tick(5200);assert.equal(q.active.text,'Die Grabwächter erwachen.');f.tick(5200);assert.equal(q.active.text,'Eine Kette schlägt gegen Stein.');
});

test('queue and history remain bounded, stale low-priority messages expire, and arena clear preserves history',()=>{
  const f=fixture(),q=f.queue;q.push('Level 4 erreicht','level');
  for(let index=0;index<60;index++)q.push(`Hinweis ${index}`);
  assert.equal(q.pending.length,8);assert.equal(q.history.length,40);
  f.tick(13000);assert.equal(q.active,null);assert.equal(q.pending.length,0);
  q.push('Dein Weg führt nach Norden.','quest');q.clear();assert.equal(q.active,null);assert.equal(q.pending.length,0);assert.ok(q.history.some(entry=>entry.text==='Dein Weg führt nach Norden.'));
});
