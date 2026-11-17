// HUD + modal sheets. Everything on screen that is not WebGL lives here.
import { G } from './game.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this.modal = null; this.slot = 0; this.items = []; this.dlgT = 0; this.showFps = false;
    $('mClose').onclick = () => this.close();
    $('modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') this.close(); });
    $('mSearch').addEventListener('input', () => this.renderItems());
    addEventListener('keydown', (e) => {
      if (!this.modal) return;
      if (e.code === 'Escape' || (e.code === this.closeKey && e.target.tagName !== 'INPUT')) { e.preventDefault(); this.close(); }
      if (e.code === 'Enter' && e.target.id === 'mSearch') { const first = this.visibleItems()[0]; if (first && !first.locked) this.pick(first); }
    });
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) { const d = document.createElement('div'); d.className = 'slot'; d.innerHTML = `<i>${i + 1}</i><span></span>`; d.onclick = () => { if (this.slot === i && G.gadgets && G.save.hotbar[i]) G.gadgets.useSlot(false); else { this.slot = i; this.hotbar(); const g = G.gadgets && G.gadgets.byId[G.save.hotbar[i]]; if (g) this.toast(`${g.icon} ${g.name} — click the game, press R, or click this slot again to use it.`, 2600); } }; hb.appendChild(d); }
    this.hotbar();
  }
  // ---------- small HUD bits ----------
  toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; const box = $('toasts'); box.appendChild(t); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => t.remove(), ms); }
  prompt(lines) { const p = $('prompt'); const key = lines ? JSON.stringify(lines) : ''; if (key === this._pk) return; this._pk = key; if (!lines) { p.classList.add('hidden'); return; } p.innerHTML = lines.map(([k, l]) => `<div><kbd>${esc(k)}</kbd>${esc(l)}</div>`).join(''); p.classList.remove('hidden'); }
  dialogue(actor, text, secs = 4.5) { $('dlgName').textContent = `${actor.emoji || ''} ${actor.name}`; $('dlgText').textContent = text; $('dialogue').classList.remove('hidden'); this.dlgT = secs; }
  objective(title, text) { const o = $('objective'); if (!text) { o.classList.add('hidden'); return; } $('objTitle').textContent = title; $('objText').innerHTML = text; o.classList.remove('hidden'); }
  banner(title, sub = '') { const b = $('banner'); $('banTitle').textContent = title; $('banSub').textContent = sub; b.classList.add('hidden'); void b.offsetWidth; b.classList.remove('hidden'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.add('hidden'), 3300); }
  effects(list) { const key = list.map((e) => e.label + Math.ceil(e.t || 0)).join('|'); if (key === this._ek) return; this._ek = key; $('effects').innerHTML = list.map((e) => `<span>${esc(e.label)}${e.t ? ' · ' + Math.ceil(e.t) + 's' : ''}</span>`).join(''); }
  speed(kmh) { const s = $('speedo'); if (kmh == null) { s.classList.add('hidden'); return; } s.classList.remove('hidden'); s.innerHTML = `${Math.round(kmh)}<small>km/h</small>`; }
  hud(on) { $('hud').classList.toggle('hidden', !on); $('cross').classList.toggle('hidden', !on); }
  // Fade to the time-tunnel overlay, run mid() while hidden, fade back.
  fade(mid, spin = false, hold = 650) {
    const f = $('fade'); f.classList.toggle('spin', spin); f.classList.add('on'); this.fading = true;
    return new Promise((res) => setTimeout(() => { try { mid && mid(); } finally { setTimeout(() => { f.classList.remove('on'); this.fading = false; res(); }, hold); } }, 480));
  }
  refresh() {
    const pc = G.pc; if (!pc) return; const era = G.cur();
    $('chipEmoji').textContent = pc.emoji; $('chipName').textContent = pc.name; $('chipEra').textContent = `${era.label} · ${era.year}`;
    $('coins').textContent = `🪙 ${G.save.coins}`; this.hotbar();
  }
  tick(dt) {
    if (this.dlgT > 0) { this.dlgT -= dt; if (this.dlgT <= 0) $('dialogue').classList.add('hidden'); }
    const h = G.env.tod, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const s = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; if (s !== this._clock) { this._clock = s; $('clock').textContent = s; }
  }
  fps(v, extra = '') { $('fps').textContent = this.showFps ? `${v} fps${extra}` : ''; }
  hotbar() {
    const hb = $('hotbar'), g = G.gadgets;
    [...hb.children].forEach((d, i) => { const id = G.save.hotbar[i], gd = g && id ? g.byId[id] : null; d.querySelector('span').textContent = gd ? gd.icon : ''; d.title = gd ? gd.name : 'Empty — open the Pocket (Q)'; d.classList.toggle('on', i === this.slot); d.classList.toggle('active', !!(gd && g.isActive && g.isActive(id))); });
  }
  // ---------- modal sheet ----------
  open(name, title, sub = '', { search = false, closeKey = null } = {}) {
    this.modal = name; this.closeKey = closeKey; $('mTitle').textContent = title; $('mSub').textContent = sub; $('mSub').classList.toggle('hidden', !sub);
    const s = $('mSearch'); s.value = ''; s.classList.toggle('hidden', !search); $('modal').classList.remove('hidden');
    G.input.unlock(); G.input.enabled = false; G.input.keys.clear();
    if (search) setTimeout(() => s.focus(), 30);
    return $('mBody');
  }
  close() { if (!this.modal) return; this.modal = null; $('modal').classList.add('hidden'); G.input.enabled = true; G.input.keys.clear(); G.input.pressed.clear(); if (this.onClose) { const f = this.onClose; this.onClose = null; f(); } }
  // Generic card grid. items: [{icon,label,sub,badge,locked,done,cat,fn,keep}]
  choose(title, sub, items, opts = {}) { this.items = items; this.open(opts.name || 'choose', title, sub, { search: opts.search ?? items.length > 12, closeKey: opts.closeKey }); this.renderItems(); }
  visibleItems() { const q = $('mSearch').value.trim().toLowerCase(); return q ? this.items.filter((i) => (i.label + ' ' + (i.sub || '') + ' ' + (i.cat || '')).toLowerCase().includes(q)) : this.items; }
  renderItems() {
    const body = $('mBody'), list = this.visibleItems(); body.innerHTML = '';
    let cat = null, grid = null;
    for (const it of list) {
      if (it.cat !== cat || !grid) { cat = it.cat; if (cat) { const h = document.createElement('div'); h.className = 'cat'; h.textContent = cat; body.appendChild(h); } grid = document.createElement('div'); grid.className = 'grid'; body.appendChild(grid); }
      const b = document.createElement('button'); b.className = 'item' + (it.locked ? ' locked' : '') + (it.done ? ' done' : '');
      b.innerHTML = `<span class="ic">${it.icon || ''}</span><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ''}`;
      b.onclick = () => this.pick(it); grid.appendChild(b);
    }
    if (!list.length) body.innerHTML = '<p style="opacity:.6">Nothing matches.</p>';
  }
  pick(it) { if (it.locked) { if (it.lockedMsg) this.toast(it.lockedMsg); return; } if (!it.keep) this.close(); it.fn && it.fn(it); }
  // ---------- built-in sheets ----------
  openCast() {
    const items = Object.values(G.cast).map((a) => ({ icon: a.emoji, label: a.name, sub: (a.def.role || '') + (a.era !== G.era ? ` (in ${G.eras[a.era].label})` : ''), badge: a === G.pc ? 'You' : null, cat: a.kind === 'human' ? (a.look.adult ? 'Grown-ups' : 'Kids') : a.kind === 'robot' ? 'Robots' : 'Animals', fn: () => G.player.control(a) }));
    const order = { Kids: 0, Robots: 1, 'Grown-ups': 2, Animals: 3 }; items.sort((a, b) => order[a.cat] - order[b.cat]);
    for (const a of G.actors) if (!G.cast[a.id] && a.playable && a.era === G.era && !a.hidden) items.push({ icon: a.emoji, label: a.name, sub: a.def.role || '', cat: 'Others here', fn: () => G.player.control(a) });
    this.choose('Who do you want to be?', 'Pick anyone. Tiko follows whoever you are.', items, { name: 'cast', closeKey: 'Tab', search: false });
  }
  openWarp() {
    const era = G.cur(), names = { kentaHome: ['🏠', 'Kenta\'s home'], miraHome: ['🏡', 'Mira\'s home'], goroHome: ['🥁', 'Goro\'s home'], soraHome: ['📚', 'Sora\'s home'], mansion: ['🏰', 'Riku\'s mansion'], park: ['🌸', 'Hinode Park'], school: ['🏫', 'School'], shops: ['🥐', 'Shop street'], lot: ['📦', 'The empty lot'], levee: ['🌳', 'The levee'], field: ['⚾', 'Riverside ballpark'], bridge: ['🌉', 'River bridge'], hill: ['⛩️', 'Lookout Hill'], timePod: ['⏳', 'Time Pod'] };
    const items = Object.entries(era.pois).filter(([k]) => era.warp ? era.warp[k] : names[k]).map(([k, p]) => { const [icon, label] = (era.warp || names)[k]; return { icon, label, fn: () => { G.ui.fade(() => { const pc = G.pc; if (G.player.vehicle) G.player.vehicle.place(p.x, p.z); else pc.teleport(p.x, p.z, p.y > 0.5 ? p.y : undefined); G.bus.emit('warp', k); }, false, 250); } }; });
    this.choose('Warp list', 'Jump straight to a place in this era.', items, { name: 'warp', closeKey: 'KeyM', search: false });
  }
  openHelp() {
    const body = this.open('help', 'How to play', 'There are no rules. Go anywhere, be anyone, try every gadget.', { closeKey: 'KeyH' });
    const rows = [['W A S D', 'Move'], ['Mouse', 'Look (click the game to capture the mouse)'], ['← → ↑ ↓', 'Turn the camera without the mouse'], ['Shift', 'Run / fly fast'], ['Space', 'Jump · fly up · brake'], ['C', 'Fly down'], ['E', 'Talk, use, get in or out of a car'], ['F', 'Get in a car, hop on or off a ride'], ['Q', 'Open Tiko\'s Gadget Pocket'], ['1–9', 'Pick a hotbar slot'], ['Click / R', 'Use the gadget in the slot (or click the slot again)'], ['Right-click / G', 'Gadget\'s second mode'], ['Tab', 'Become another character'], ['V', 'First / third person'], ['T', 'Wish box — type anything'], ['P', 'Episodes'], ['M', 'Map — click to mark, double-click to jump'], ['Wheel', 'Zoom'], ['F3', 'Show FPS'], ['Esc', 'Menu']];
    body.innerHTML = `<div class="help">${rows.map(([k, l]) => `<div><kbd>${esc(k)}</kbd>${esc(l)}</div>`).join('')}</div>`;
  }
  openMenu() {
    const q = G.save.quality;
    this.choose('Menu', '', [
      { icon: '▶️', label: 'Back to the game', fn: () => {} }, { icon: '❓', label: 'How to play', keep: true, fn: () => this.openHelp() },
      { icon: '🏃', label: 'Graphics: Smooth', sub: 'Fastest. Simple lighting, no shadows.', badge: q === 'low' ? 'On' : null, fn: () => G.setQuality('low') },
      { icon: '⚖️', label: 'Graphics: Balanced', sub: 'Full materials, soft shadows.', badge: q === 'med' ? 'On' : null, fn: () => G.setQuality('med') },
      { icon: '✨', label: 'Graphics: Pretty', sub: 'Sharper picture and shadows. Slowest.', badge: q === 'high' ? 'On' : null, fn: () => G.setQuality('high') },
      { icon: '📈', label: 'Show FPS', badge: this.showFps ? 'On' : null, fn: () => { this.showFps = !this.showFps; } },
      { icon: '🌗', label: 'Day and night pass on their own', badge: G.env.cycle ? 'On' : null, fn: () => { G.env.cycle = !G.env.cycle; } },
    ], { name: 'menu', search: false });
  }
}
