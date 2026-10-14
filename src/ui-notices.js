// Presentation only: rewards and quest progress remain owned by the game.
const number = value => Number(String(value).replace(/\./g, '').replace(',', '.')) || 0;
const amount = (text, unit) => [...text.matchAll(new RegExp(`\\+([\\d.,]+)\\s*${unit}\\b`, 'g'))].reduce((sum, match) => sum + number(match[1]), 0);
const failure = /nicht genug|keine Heiltränke|nicht möglich|konnte nicht|fehlen noch|Gepäck ist voll|beschädigt|nicht kompatibel/i;

export function noticeKind(message, tone = 'info') {
  if (tone === 'error' || failure.test(message)) return { kind: 'error', priority: 100 };
  if (tone === 'danger') return { kind: 'danger', priority: 90 };
  if (tone === 'level') return { kind: 'level', priority: 80 };
  if (/^(Questziel erreicht:|Auftrag bereit:)/.test(message)) return { kind: 'progress', priority: 70 };
  if (tone === 'quest' || tone === 'story') return { kind: 'story', priority: 70 };
  if (tone === 'xp' || /^[+\d.,\s]+EP\b/.test(message)) return { kind: 'rewards', priority: 20 };
  if (tone === 'loot' && /gefunden|geborgen|^Truhe:|belohnung/i.test(message)) return { kind: 'rewards', priority: 20 };
  if (tone === 'loot') return { kind: 'craft', priority: 25 };
  return { kind: tone === 'success' ? 'success' : 'info', priority: 35 };
}

export function noticeText(entry) {
  if (entry.messages.length === 1 && entry.count === 1) return entry.messages[0];
  if (entry.kind === 'rewards') {
    const parts = [];
    if (entry.finds) parts.push(`${entry.finds} Beutefunde`);
    if (entry.xp) parts.push(`+${entry.xp.toLocaleString('de-DE')} EP`);
    if (entry.gold) parts.push(`+${entry.gold.toLocaleString('de-DE')} Gold`);
    if (!parts.length) parts.push(`${entry.count} Beutemeldungen`);
    return `${parts.join(' · ')}${entry.latestFind ? ` · ${entry.latestFind}` : ''}`;
  }
  if (entry.kind === 'progress') return `${entry.count} Questziele bereit · ${entry.messages.slice(-2).map(text => text.replace(/^(Questziel erreicht:|Auftrag bereit:)\s*/, '')).join(' · ')}`;
  if (entry.kind === 'craft') return `${entry.count} Beute- & Werkbankmeldungen · ${entry.messages.at(-1)}`;
  return `${entry.messages.at(-1)}${entry.count > 1 && entry.messages.length === 1 ? ` (×${entry.count})` : ''}`;
}

/** Bounded, real-time queue. Low-priority bursts coalesce before being shown. */
export class NoticeQueue {
  constructor({ now = () => Date.now(), limit = 8, historyLimit = 40 } = {}) {
    this.now = now; this.limit = limit; this.historyLimit = historyLimit;
    this.pending = []; this.history = []; this.active = null; this.serial = 0;
  }
  clear() { this.active = null; this.pending = []; }
  dismiss() { this.active = null; this.advance(); }
  push(message, tone = 'info') {
    const text = String(message || '').trim(); if (!text) return null;
    const now = this.now(), classification = noticeKind(text, tone), aggregate = ['rewards', 'progress', 'craft'].includes(classification.kind);
    // Held buttons must not keep the same warning visible indefinitely.
    const duplicate = this.history.find(entry => entry.messages.length === 1 && entry.messages[0] === text && now - entry.updated < 6500);
    if (duplicate && !aggregate) { duplicate.count++; duplicate.updated = now; if (duplicate.kind !== 'error') duplicate.text = noticeText(duplicate); return duplicate; }
    const merge = [this.active, ...this.pending].find(entry => entry && entry.kind === classification.kind && now - entry.updated < 1400 && (aggregate || entry.messages[0] === text));
    if (merge) {
      merge.count++; if (!merge.messages.includes(text)) merge.messages.push(text);
      merge.messages = merge.messages.slice(-6); merge.updated = now;
      merge.xp += amount(text, 'EP'); merge.gold += amount(text, 'Gold');
      if (tone === 'loot' && classification.kind === 'rewards') { merge.finds++; merge.latestFind = text.replace(/ gefunden$/, ''); }
      merge.text = noticeText(merge); return merge;
    }
    const entry = { id: ++this.serial, ...classification, tone, messages: [text], text, count: 1, created: now, updated: now,
      readyAt: now + (aggregate ? 250 : 0), expiresAt: now + (classification.priority >= 70 ? 45000 : 12000),
      xp: amount(text, 'EP'), gold: amount(text, 'Gold'), finds: tone === 'loot' && classification.kind === 'rewards' ? 1 : 0,
      latestFind: tone === 'loot' && classification.kind === 'rewards' ? text.replace(/ gefunden$/, '') : null };
    this.history.unshift(entry); this.history.length = Math.min(this.history.length, this.historyLimit);
    if (this.active && (entry.priority > this.active.priority || entry.kind === 'error' && this.active.kind === 'error')) {
      if (this.active.priority >= 70 && this.active.kind !== 'error') this.pending.push(this.active);
      this.active = null;
    }
    this.pending.push(entry); this.pending.sort((a, b) => b.priority - a.priority || a.id - b.id);
    this.pending.length = Math.min(this.pending.length, this.limit);
    this.advance(); return entry;
  }
  advance() {
    const now = this.now();
    if (this.active && now >= this.active.visibleUntil) this.active = null;
    this.pending = this.pending.filter(entry => now < entry.expiresAt);
    if (!this.active) {
      const index = this.pending.findIndex(entry => now >= entry.readyAt);
      if (index >= 0) { this.active = this.pending.splice(index, 1)[0]; this.active.visibleUntil = now + (this.active.priority >= 70 ? 5200 : 3000); }
    }
    return this.active;
  }
}
