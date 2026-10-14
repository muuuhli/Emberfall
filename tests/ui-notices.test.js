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
  f.tick(4800);assert.equal(q.active,null);
  assert.ok(q.history.some(entry=>entry.kind==='level'));
});

test('quest goals coalesce and fresh story replaces stale toast while all passages stay readable',()=>{
  const f=fixture(),q=f.queue;
  q.push('Questziel erreicht: Der Brunnen','quest');q.push('Questziel erreicht: Glutwacht','quest');f.tick(250);
  assert.equal(q.active.count,2);assert.match(q.active.text,/2 Questziele bereit/);assert.ok(q.active.text.includes('Glutwacht'));
  q.push('Die Grabwächter erwachen.','quest');q.push('Eine Kette schlägt gegen Stein.','quest');
  assert.equal(q.active.text,'Eine Kette schlägt gegen Stein.');
  assert.deepEqual(q.history.slice(0,2).map(entry=>entry.fullMessages[0]),['Eine Kette schlägt gegen Stein.','Die Grabwächter erwachen.']);
  f.tick(3200);assert.equal(q.active,null);
});

test('queue and history remain bounded, stale low-priority messages expire, and arena clear preserves history',()=>{
  const f=fixture(),q=f.queue;q.push('Level 4 erreicht','level');
  for(let index=0;index<60;index++)q.push(`Hinweis ${index}`);
  assert.ok(q.pending.length<=8);assert.equal(q.history.length,40);
  f.tick(13000);assert.equal(q.active,null);assert.equal(q.pending.length,0);
  q.push('Dein Weg führt nach Norden.','quest');q.clear();assert.equal(q.active,null);assert.equal(q.pending.length,0);assert.ok(q.history.some(entry=>entry.text==='Dein Weg führt nach Norden.'));
});

test('every received message advances unread markers, including read entries receiving another reward',()=>{
  const f=fixture(),q=f.queue,entry=q.push('+10 EP erhalten','xp');
  const read=q.receiptSerial,revision=q.revision;
  q.push('+20 EP erhalten','xp');assert.equal(q.serial,1);
  assert.ok(entry.receiptId>read);assert.ok(q.revision>revision);
  assert.deepEqual(entry.fullMessages,['+10 EP erhalten','+20 EP erhalten']);
  q.push('Reise gespeichert.');const marker=q.receiptSerial;
  q.push('Reise gespeichert.');assert.ok(q.history[0].receiptId>marker);assert.equal(q.history[0].count,2);
});

test('blocked low-priority notices expire four seconds after arrival, without replay after a warning',()=>{
  const f=fixture(),q=f.queue;q.push('Nicht genug Mana.');
  q.push('+10 EP erhalten','xp');f.tick(3900);
  assert.equal(q.active.kind,'error');f.tick(100);assert.equal(q.active,null);
  assert.ok(q.history.some(entry=>entry.xp===10));
});

test('continuous reward bursts preserve bounded full text without extending the original toast deadline',()=>{
  const f=fixture(),q=f.queue;const entry=q.push('Klinge 0 gefunden','loot');f.tick(250);
  const deadline=entry.visibleUntil;
  for(let i=1;i<=100;i++)q.push(`Klinge ${i} gefunden`,'loot');
  assert.equal(entry.visibleUntil,deadline);assert.equal(entry.fullMessages.length,80);
  assert.equal(entry.finds,101);assert.equal(entry.fullMessages.at(-1),'Klinge 100 gefunden');
  f.tick(3000);assert.equal(q.active,null);
});
