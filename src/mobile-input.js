/** Device-independent touch state. Each finger owns its action until it ends. */
export class MobileInput {
  constructor({ deadzone = .2, radius = 48 } = {}) {
    this.deadzone = deadzone; this.radius = radius; this.pointers = new Map(); this.pending = []; this.blocked = false;
  }
  setBlocked(blocked) { this.blocked = Boolean(blocked); if (this.blocked) this.clear(); }
  start(id, action, x = 0, y = 0, center = { x, y }) {
    if (this.blocked || this.pointers.has(id)) return false;
    if (action === 'move' && [...this.pointers.values()].some(pointer => pointer.action === 'move')) return false;
    this.pointers.set(id, { action, x, y, center });
    if (action !== 'move') this.pending.push({ id, action });
    return true;
  }
  move(id, x, y) { const pointer = this.pointers.get(id); if (pointer) { pointer.x = x; pointer.y = y; } }
  end(id, cancelled = false) { this.pointers.delete(id); if (cancelled) this.pending = this.pending.filter(press => press.id !== id); }
  clear() { this.pointers.clear(); this.pending.length = 0; }
  drainActions() { return this.pending.splice(0).map(press => press.action); }
  held(action) { return [...this.pointers.values()].some(pointer => pointer.action === action); }
  movement() {
    const pointer = [...this.pointers.values()].find(entry => entry.action === 'move');
    if (!pointer) return { x: 0, y: 0, knobX: 0, knobY: 0 };
    const dx = pointer.x - pointer.center.x, dy = pointer.y - pointer.center.y, length = Math.hypot(dx, dy);
    const knobScale = length > this.radius ? this.radius / length : 1;
    if (length < this.radius * this.deadzone) return { x: 0, y: 0, knobX: dx * knobScale, knobY: dy * knobScale };
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    return { x: Math.round(Math.cos(angle)), y: Math.round(Math.sin(angle)), knobX: dx * knobScale, knobY: dy * knobScale };
  }
  keys() {
    const { x, y } = this.movement(), keys = new Set();
    if (x < 0) keys.add('a'); if (x > 0) keys.add('d'); if (y < 0) keys.add('w'); if (y > 0) keys.add('s');
    return keys;
  }
}

/** Only living enemies inside the rendered viewport can become a touch target. */
export function nearestVisibleEnemy(player, enemies, bounds) {
  let nearest = null, distance = Infinity;
  for (const enemy of enemies || []) {
    if (enemy.alive === false || enemy.dead || !(enemy.hp > 0) || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) continue;
    if (bounds && (enemy.x < bounds.x || enemy.x > bounds.x + bounds.w || enemy.y < bounds.y || enemy.y > bounds.y + bounds.h)) continue;
    const current = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (current < distance) { distance = current; nearest = enemy; }
  }
  return nearest;
}

/** DOM adapter stays separate so multitouch/cancellation can be verified without a browser. */
export function bindMobileControls(root, input, { onPress = () => {}, isBlocked = () => false } = {}) {
  const joystick = root.querySelector('[data-joystick]'), knob = root.querySelector('.joystick-knob');
  const buttons = [...root.querySelectorAll('[data-touch-action]')];
  const elements = [joystick, ...buttons].filter(Boolean), cleanup = [];
  const render = () => {
    const movement = input.movement();
    if (knob) knob.style.transform = `translate(${movement.knobX}px, ${movement.knobY}px)`;
    for (const button of buttons) button.classList.toggle('pressed', input.held(button.dataset.touchAction));
  };
  const listen = (element, name, handler) => { element.addEventListener(name, handler); cleanup.push(() => element.removeEventListener(name, handler)); };
  for (const element of elements) {
    listen(element, 'pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault(); input.setBlocked(isBlocked());
      const bounds = element.getBoundingClientRect(), action = element === joystick ? 'move' : element.dataset.touchAction;
      if (!input.start(event.pointerId, action, event.clientX, event.clientY, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })) return;
      try { element.setPointerCapture(event.pointerId); } catch {}
      onPress(); render();
    });
    listen(element, 'pointermove', event => { if (!input.pointers.has(event.pointerId)) return; event.preventDefault(); input.move(event.pointerId, event.clientX, event.clientY); render(); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(element, name, event => {
      if (!input.pointers.has(event.pointerId)) return;
      input.end(event.pointerId, name !== 'pointerup'); render();
    });
  }
  const clear = () => { input.clear(); render(); };
  listen(window, 'blur', clear);
  listen(document, 'visibilitychange', () => { if (document.hidden) clear(); });
  return { clear, render, destroy() { clear(); for (const remove of cleanup) remove(); } };
}
