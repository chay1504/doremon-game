// Keyboard + mouse state. hit() is true only on the frame a key went down.
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.pressed = new Set(); this.dx = 0; this.dy = 0; this.wheel = 0; this.btn = [false, false, false]; this.click = [false, false, false]; this.tap = [false, false, false]; this.drag = 0; this.locked = false; this.enabled = true;
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    addEventListener('keydown', (e) => { if (typing(e)) return; if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => { this.btn[e.button] = true; this.click[e.button] = true; this.drag = 0; this.downOnCanvas = true; if (this.enabled && !this.locked && this.wantLock) { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (err) { /* ignore */ } } });
    // a 'tap' is a click on the game that did not turn into a camera drag; it works with or without mouse capture
    addEventListener('mouseup', (e) => { this.btn[e.button] = false; if (this.downOnCanvas && this.drag < 7 && e.button < 3) this.tap[e.button] = true; this.downOnCanvas = false; });
    addEventListener('mousemove', (e) => { if (this.btn[0] || this.btn[2]) this.drag += Math.abs(e.movementX) + Math.abs(e.movementY); if (this.locked || this.btn[0] || this.btn[2]) { this.dx += e.movementX; this.dy += e.movementY; } });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    this.wantLock = true;
  }
  down(c) { return this.enabled && this.keys.has(c); }
  hit(c) { return this.enabled && this.pressed.has(c); }
  clicked(b) { return this.enabled && this.click[b]; }
  tapped(b) { return this.enabled && this.tap[b]; }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  endFrame() { this.pressed.clear(); this.dx = this.dy = this.wheel = 0; this.click[0] = this.click[1] = this.click[2] = false; this.tap[0] = this.tap[1] = this.tap[2] = false; }
}
