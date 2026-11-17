// Maps. Each era is photographed once from straight above (a real render of the world, not a drawing),
// then used for a rotating minimap in the corner and a full map on M.
// Click the full map to drop a marker; double-click (or pick a place in the list) to jump there.
import * as THREE from 'three';
import { G } from './game.js';

const RES = 1024;
const PLACE_ICON = { kentaHome: '🏠', miraHome: '🏡', goroHome: '🥁', soraHome: '📚', rikuHome: '🏰', mansion: '🏰', park: '🌸', school: '🏫', shops: '🛍️', lot: '📦', levee: '🌳', field: '⚾', bridge: '🌉', hill: '⛩️', timePod: '⏳', riverside: '🏞️', nest: '🥚', lake: '💧', falls: '💦', volcano: '🌋', bones: '🦴', arch: '🪨', plaza: '🛸', depot: '🎁', clock: '🕰️', garage: '🚗', skyGarden: '🌿', canal: '🚤', dome: '🔮' };
const PLACE_NAME = { kentaHome: "Kenta's home", miraHome: "Mira's home", goroHome: "Goro's home", soraHome: "Sora's home", rikuHome: "Riku's mansion", mansion: "Riku's mansion", park: 'Hinode Park', school: 'School', shops: 'Shop street', lot: 'Empty lot', levee: 'Levee', field: 'Ballpark', bridge: 'River bridge', hill: 'Lookout Hill', timePod: 'Time Pod', riverside: 'Riverside', nest: 'Nest', lake: 'Lake', falls: 'Waterfall', volcano: 'Volcano', bones: 'Big bones', arch: 'Rock arch', plaza: 'Plaza', depot: 'Gadget Depot', clock: 'Clock tower', garage: 'Hover cars', skyGarden: 'Sky garden', canal: 'Canal', dome: 'Park dome' };
const SKIP = new Set(['kentaRoom', 'miraRoom', 'goroRoom', 'soraRoom', 'rikuRoom', 'parkGate', 'schoolGate', 'mansion']);

// ---------- photograph an era from above ----------
function shoot(era) {
  const r = G.renderer, B = (era.bounds || 340) + 12;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9fb48c);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9a9a8a, 2.3)); const sun = new THREE.DirectionalLight(0xfff4e0, 2.4); sun.position.set(0.35, 1, 0.25); sc.add(sun);
  const cam = new THREE.OrthographicCamera(-B, B, B, -B, 1, 4000); cam.position.set(0, 2000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  // show everything that is normally culled or hidden (roofs over interiors, far detail), hide wires and signs
  const restore = [];
  era.group.traverse((o) => {
    const want = o.isLine || o.isLineSegments || o.isPoints || o.isSprite || o.userData.sign ? false : true;
    if (o.visible !== want) { restore.push([o, o.visible]); o.visible = want; }
  });
  const parent = era.group.parent; sc.add(era.group);
  const rt = new THREE.WebGLRenderTarget(RES, RES, { depthBuffer: true }), shadows = r.shadowMap.enabled, old = r.getRenderTarget();
  r.shadowMap.enabled = false; r.setRenderTarget(rt); r.clear(); r.render(sc, cam); r.setRenderTarget(old); r.shadowMap.enabled = shadows;
  const buf = new Uint8Array(RES * RES * 4); r.readRenderTargetPixels(rt, 0, 0, RES, RES, buf); rt.dispose();
  if (parent) parent.add(era.group); else sc.remove(era.group);
  for (const [o, v] of restore) o.visible = v;
  // render targets are linear: convert to sRGB, flip rows so north (-z) is at the top
  const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const c = i / 255, s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; lut[i] = Math.min(255, Math.round(s * 255 * 1.02)); }
  const cv = document.createElement('canvas'); cv.width = cv.height = RES; const x = cv.getContext('2d'), img = x.createImageData(RES, RES), d = img.data;
  for (let row = 0; row < RES; row++) { const src = row * RES * 4, dst = (RES - 1 - row) * RES * 4; for (let i = 0; i < RES * 4; i += 4) { d[dst + i] = lut[buf[src + i]]; d[dst + i + 1] = lut[buf[src + i + 1]]; d[dst + i + 2] = lut[buf[src + i + 2]]; d[dst + i + 3] = 255; } }
  x.putImageData(img, 0, 0);
  return { cv, B };
}

class Maps {
  constructor() {
    this.imgs = {}; this.wp = null; this.t = 0; this.fullT = 0;
    // minimap element
    const wrap = document.createElement('div'); wrap.id = 'minimap'; wrap.title = 'Map (M)';
    wrap.innerHTML = '<canvas></canvas><b class="mmN">N</b><span class="mmHint">M</span>';
    document.getElementById('hud').appendChild(wrap); this.wrap = wrap; this.mm = wrap.querySelector('canvas'); this.nTag = wrap.querySelector('.mmN');
    wrap.addEventListener('click', () => this.open());
    const dpr = Math.min(2, devicePixelRatio || 1); this.size = 176; this.mm.width = this.mm.height = Math.round(this.size * dpr); this.dpr = dpr;
    this.range = 85;                                              // metres from centre to edge
    // waypoint beam in the world
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 140, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 70; this.beam = new THREE.Group(); this.beam.add(beam); this.beam.visible = false; G.scene.add(this.beam);
  }
  image(key) { if (!this.imgs[key]) this.imgs[key] = shoot(G.eras[key]); return this.imgs[key]; }
  // refresh after the world changes a lot (gadget buildings etc.)
  invalidate(key = G.era) { delete this.imgs[key]; }
  setWaypoint(x, z, era = G.era, label = 'Marker') { this.wp = { x, z, era, label }; G.toast(`📍 ${label} set — follow the blue beam.`); }
  clearWaypoint() { this.wp = null; }
  places(key = G.era) { const e = G.eras[key]; return Object.entries(e.pois).filter(([k]) => !SKIP.has(k)).map(([k, p]) => ({ k, p, icon: (e.warp && e.warp[k] && e.warp[k][0]) || PLACE_ICON[k] || '📍', name: (e.warp && e.warp[k] && e.warp[k][1]) || PLACE_NAME[k] || k })); }
  jump(x, z, y) {
    const pc = G.pc; G.ui.fade(() => { if (G.player.vehicle) G.player.vehicle.place(x, z); else pc.teleport(x, z, y); G.bus.emit('warp', 'map'); }, false, 250);
  }
  // ---------- per frame ----------
  update(dt) {
    const pc = G.pc; if (!pc) return;
    // waypoint beam + arrival
    const wp = this.wp;
    if (wp && wp.era === G.era) { this.beam.visible = true; this.beam.position.set(wp.x, G.eras[G.era].heightAt(wp.x, wp.z), wp.z); const sub = G.player.vehicle || pc; if (Math.hypot(sub.pos.x - wp.x, sub.pos.z - wp.z) < 5) { G.toast(`📍 You reached: ${wp.label}`); this.wp = null; } }
    else this.beam.visible = false;
    this.wrap.style.display = G.mode === 'baseball' ? 'none' : '';
    this.t -= dt; if (this.t <= 0) { this.t = 1 / 30; this.drawMini(); }
    if (G.ui.modal === 'map') { this.fullT -= dt; if (this.fullT <= 0) { this.fullT = 0.25; this.drawFull(); } }
  }
  dots(fn) {
    const pc = G.pc;
    for (const v of G.vehicles) if (v.era === G.era && !v.driver) fn(v.pos.x, v.pos.z, 'car', v);
    for (const a of G.actors) { if (a === pc || a.era !== G.era || a.hidden || a.mount === pc) continue; if (!G.cast[a.id] && !a.dino) continue; fn(a.pos.x, a.pos.z, a.id === 'tiko' ? 'tiko' : a.dino ? 'dino' : 'person', a); }
    const ep = G.episodes && G.episodes.marker; if (ep && ep.visible) fn(ep.position.x, ep.position.z, 'goal');
    if (this.wp && this.wp.era === G.era) fn(this.wp.x, this.wp.z, 'wp');
  }
  drawMini() {
    const pc = G.pc, im = this.image(G.era), c = this.mm, x = c.getContext('2d'), S = c.width, half = S / 2, sub = G.player.vehicle || pc;
    const k = half / this.range, imgK = RES / (2 * im.B);                    // canvas px per metre, image px per metre
    const yaw = G.player.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rot = -Math.PI / 2 - Math.atan2(fz, fx);
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, S, S);
    x.save(); x.beginPath(); x.arc(half, half, half - 1, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#7f9a6c'; x.fillRect(0, 0, S, S);
    x.translate(half, half); x.rotate(rot); x.scale(k / imgK, k / imgK);
    x.drawImage(im.cv, -(sub.pos.x + im.B) * imgK, -(sub.pos.z + im.B) * imgK);
    x.restore();
    const cr = Math.cos(rot), sr = Math.sin(rot), P = (wx, wz) => { const dx = (wx - sub.pos.x) * k, dz = (wz - sub.pos.z) * k; return [half + dx * cr - dz * sr, half + dx * sr + dz * cr]; };
    // places
    x.font = `${Math.round(13 * this.dpr)}px "Segoe UI Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const pl of this.places()) { const [px, py] = P(pl.p.x, pl.p.z); if (Math.hypot(px - half, py - half) < half - 10) x.fillText(pl.icon, px, py); }
    // people, cars, goals
    this.dots((wx, wz, kind) => {
      let [px, py] = P(wx, wz); const dx = px - half, dy = py - half, dd = Math.hypot(dx, dy), edge = half - 8 * this.dpr;
      if (dd > edge) { if (kind !== 'goal' && kind !== 'wp') return; px = half + dx / dd * edge; py = half + dy / dd * edge; }
      const r = this.dpr;
      if (kind === 'car') { x.fillStyle = '#ffffff'; x.strokeStyle = '#1f2a44'; x.lineWidth = r; x.fillRect(px - 2.5 * r, py - 2.5 * r, 5 * r, 5 * r); x.strokeRect(px - 2.5 * r, py - 2.5 * r, 5 * r, 5 * r); return; }
      if (kind === 'goal' || kind === 'wp') { x.fillStyle = kind === 'goal' ? '#ffb400' : '#4fd1ff'; x.strokeStyle = '#1f2a44'; x.lineWidth = 1.5 * r; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 3 : 7) * r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); return; }
      x.fillStyle = kind === 'tiko' ? '#2fb7a8' : kind === 'dino' ? '#b5651d' : '#ff8a3d'; x.strokeStyle = '#fff'; x.lineWidth = 1.5 * r; x.beginPath(); x.arc(px, py, (kind === 'dino' ? 4.5 : 3.5) * r, 0, Math.PI * 2); x.fill(); x.stroke();
    });
    // you: an arrow pointing where your character faces
    const face = G.player.vehicle ? G.player.vehicle.yaw : pc.yaw, ax = Math.sin(face), az = Math.cos(face), ang = Math.atan2(ax * sr + az * cr, ax * cr - az * sr);
    x.save(); x.translate(half, half); x.rotate(ang + Math.PI / 2); const r = this.dpr;
    x.fillStyle = '#ffffff'; x.strokeStyle = '#1f2a44'; x.lineWidth = 2 * r; x.beginPath(); x.moveTo(0, -9 * r); x.lineTo(6.5 * r, 7 * r); x.lineTo(0, 3.5 * r); x.lineTo(-6.5 * r, 7 * r); x.closePath(); x.fill(); x.stroke(); x.restore();
    // ring + north marker
    x.strokeStyle = 'rgba(31,42,68,.9)'; x.lineWidth = 3 * r; x.beginPath(); x.arc(half, half, half - 1.5 * r, 0, Math.PI * 2); x.stroke();
    const nx = -sr, ny = -cr; this.nTag.style.left = `${this.size / 2 + nx * (this.size / 2 - 11) - 8}px`; this.nTag.style.top = `${this.size / 2 + ny * (this.size / 2 - 11) - 9}px`;
  }
  // ---------- full map (wheel to zoom, drag to pan) ----------
  open() {
    const era = G.cur(), body = G.ui.open('map', `Map · ${era.label}`, 'Click to drop a marker · double-click to jump there · scroll to zoom · drag to move.', { closeKey: 'KeyM' });
    const box = Math.min(Math.round(innerHeight * 0.66), Math.round(innerWidth * 0.62), 720), im = this.image(G.era), sub = G.player.vehicle || G.pc;
    this.view = { cx: sub.pos.x, cz: sub.pos.z, h: Math.min(im.B, 150) };
    body.innerHTML = `<div class="mapWrap"><canvas class="bigMap" width="${box * this.dpr}" height="${box * this.dpr}" style="width:${box}px;height:${box}px"></canvas><div class="mapSide"></div></div>`;
    this.big = body.querySelector('.bigMap'); const side = body.querySelector('.mapSide');
    const btn = (icon, label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'mapPlace ' + cls; b.innerHTML = `<span>${icon}</span>${label}`; b.onclick = fn; side.appendChild(b); return b; };
    btn('🎯', 'Centre on me', () => { const s2 = G.player.vehicle || G.pc; this.view.cx = s2.pos.x; this.view.cz = s2.pos.z; this.drawFull(); });
    btn('🗺️', 'Whole map', () => { this.view = { cx: 0, cz: 0, h: im.B }; this.drawFull(); });
    if (this.wp && this.wp.era === G.era) { btn('🚀', 'Jump to marker', () => { const w = this.wp; G.ui.close(); this.jump(w.x, w.z); }, 'hot'); btn('✖️', 'Clear marker', () => { this.wp = null; G.ui.close(); this.open(); }); }
    for (const pl of this.places()) btn(pl.icon, pl.name, () => { G.ui.close(); this.jump(pl.p.x, pl.p.z, pl.p.y > 0.5 ? pl.p.y : undefined); });
    const toWorld = (e) => { const rc = this.big.getBoundingClientRect(), v = this.view; return { x: v.cx + ((e.clientX - rc.left) / rc.width * 2 - 1) * v.h, z: v.cz + ((e.clientY - rc.top) / rc.height * 2 - 1) * v.h }; };
    let clickT = null, drag = null;
    this.big.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cz: this.view.cz, moved: 0 }; });
    addEventListener('mousemove', this._mm = (e) => { if (!drag || !(e.buttons & 1)) return; const rc = this.big.getBoundingClientRect(), k = 2 * this.view.h / rc.width; drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y)); this.view.cx = drag.cx - (e.clientX - drag.x) * k; this.view.cz = drag.cz - (e.clientY - drag.y) * k; this.clampView(); this.drawFull(); });
    addEventListener('mouseup', this._mu = () => { setTimeout(() => { drag = null; }, 0); });
    this.big.addEventListener('wheel', (e) => { e.preventDefault(); const w = toWorld(e), v = this.view, nh = Math.max(40, Math.min(im.B, v.h * (e.deltaY > 0 ? 1.18 : 1 / 1.18))), f = nh / v.h; v.cx = w.x + (v.cx - w.x) * f; v.cz = w.z + (v.cz - w.z) * f; v.h = nh; this.clampView(); this.drawFull(); }, { passive: false });
    this.big.addEventListener('click', (e) => { if (drag && drag.moved > 6) return; const w = toWorld(e); clearTimeout(clickT); clickT = setTimeout(() => { const near = this.places().find((pl) => Math.hypot(pl.p.x - w.x, pl.p.z - w.z) < this.view.h * 0.05); this.setWaypoint(near ? near.p.x : w.x, near ? near.p.z : w.z, G.era, near ? near.name : 'Marker'); this.drawFull(); }, 230); });
    this.big.addEventListener('dblclick', (e) => { clearTimeout(clickT); const w = toWorld(e), b = (G.eras[G.era].bounds || 340) - 4; if (Math.abs(w.x) > b || Math.abs(w.z) > b) return; G.ui.close(); this.jump(w.x, w.z); });
    G.ui.onClose = () => { removeEventListener('mousemove', this._mm); removeEventListener('mouseup', this._mu); };
    this.fullT = 0; this.drawFull();
  }
  clampView() { const B = this.image(G.era).B, v = this.view; v.cx = Math.max(-B + v.h, Math.min(B - v.h, v.cx)); v.cz = Math.max(-B + v.h, Math.min(B - v.h, v.cz)); }
  drawFull() {
    if (!this.big || !this.big.isConnected) return;
    const im = this.image(G.era), c = this.big, x = c.getContext('2d'), S = c.width, v = this.view, r = this.dpr, imgK = RES / (2 * im.B);
    const k = S / (2 * v.h), P = (wx, wz) => [(wx - v.cx + v.h) * k, (wz - v.cz + v.h) * k];
    x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingQuality = 'high';
    x.drawImage(im.cv, (v.cx - v.h + im.B) * imgK, (v.cz - v.h + im.B) * imgK, 2 * v.h * imgK, 2 * v.h * imgK, 0, 0, S, S);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const close = v.h < 170;
    for (const pl of this.places()) { const [px, py] = P(pl.p.x, pl.p.z); if (px < -20 || py < -20 || px > S + 20 || py > S + 20) continue; x.font = `${Math.round((close ? 20 : 15) * r)}px "Segoe UI Emoji",sans-serif`; x.fillText(pl.icon, px, py); x.font = `bold ${Math.round((close ? 12 : 10) * r)}px "Trebuchet MS",sans-serif`; x.lineWidth = 3.5 * r; x.strokeStyle = 'rgba(255,255,255,.95)'; x.strokeText(pl.name, px, py + 16 * r); x.fillStyle = '#1f2a44'; x.fillText(pl.name, px, py + 16 * r); }
    this.dots((wx, wz, kind, o) => {
      const [px, py] = P(wx, wz); if (px < -10 || py < -10 || px > S + 10 || py > S + 10) return;
      if (kind === 'car') { x.fillStyle = '#fff'; x.strokeStyle = '#1f2a44'; x.lineWidth = r; x.fillRect(px - 3 * r, py - 3 * r, 6 * r, 6 * r); x.strokeRect(px - 3 * r, py - 3 * r, 6 * r, 6 * r); return; }
      if (kind === 'goal' || kind === 'wp') { x.fillStyle = kind === 'goal' ? '#ffb400' : '#4fd1ff'; x.strokeStyle = '#1f2a44'; x.lineWidth = 2 * r; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 4 : 10) * r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); return; }
      x.fillStyle = kind === 'tiko' ? '#2fb7a8' : kind === 'dino' ? '#b5651d' : '#ff8a3d'; x.strokeStyle = '#fff'; x.lineWidth = 2 * r; x.beginPath(); x.arc(px, py, 5 * r, 0, Math.PI * 2); x.fill(); x.stroke();
      if (close && o && o.name && kind !== 'dino') { x.font = `bold ${Math.round(10 * r)}px "Trebuchet MS",sans-serif`; x.lineWidth = 3 * r; x.strokeStyle = 'rgba(31,42,68,.85)'; x.strokeText(o.name, px, py - 11 * r); x.fillStyle = '#fff'; x.fillText(o.name, px, py - 11 * r); }
    });
    const pc = G.pc, sub = G.player.vehicle || pc, [px, py] = P(sub.pos.x, sub.pos.z), face = G.player.vehicle ? G.player.vehicle.yaw : pc.yaw;
    x.save(); x.translate(px, py); x.rotate(Math.atan2(Math.cos(face), Math.sin(face)) + Math.PI / 2); x.fillStyle = '#fff'; x.strokeStyle = '#1f2a44'; x.lineWidth = 2.5 * r; x.beginPath(); x.moveTo(0, -12 * r); x.lineTo(9 * r, 9 * r); x.lineTo(0, 4 * r); x.lineTo(-9 * r, 9 * r); x.closePath(); x.fill(); x.stroke(); x.restore();
    x.font = `bold ${Math.round(16 * r)}px "Trebuchet MS",sans-serif`; x.fillStyle = '#1f2a44'; x.strokeStyle = '#fff'; x.lineWidth = 4 * r; x.strokeText('N', S / 2, 16 * r); x.fillText('N', S / 2, 16 * r);
    const bar = 50, barPx = bar * k; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(S - barPx - 16 * r, S - 22 * r, barPx, 6 * r); x.strokeStyle = '#1f2a44'; x.lineWidth = 1.5 * r; x.strokeRect(S - barPx - 16 * r, S - 22 * r, barPx, 6 * r); x.font = `bold ${Math.round(10 * r)}px sans-serif`; x.fillStyle = '#1f2a44'; x.fillText('50 m', S - barPx / 2 - 16 * r, S - 32 * r);
  }
}

export function init() { G.map = new Maps(); }
