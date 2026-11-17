// Boot + main loop.
import * as THREE from 'three';
import { G } from './game.js';
import { makeTextures, makeMaterials } from './textures.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Env } from './env.js';
import { buildPresent } from './town.js';
import { spawnCast } from './cast.js';
import { Player } from './player.js';

// Optional modules: each exports init(G). Missing files are simply skipped, so the game runs at every stage of the build.
const modLoaders = import.meta.glob(['./eras.js', './vehicles.js', './gadgets.js', './baseball.js', './episodes.js', './avatars.js', './grass.js', './map.js']);
const mods = {};
// A module that fails to load or to start is reported and skipped; it never stops the game from booting.
async function loadMods() { await Promise.all(Object.entries(modLoaders).map(async ([path, load]) => { try { mods[path] = await load(); } catch (e) { console.error('[module failed to load]', path, e); } })); }
function startMods(paths) { for (const path of paths) { try { mods[path]?.init?.(G); } catch (e) { console.error('[module failed to start]', path, e); } } }
const $ = (id) => document.getElementById(id);
const QUALITY = { low: { pr: 0.8, shadow: 0 }, med: { pr: 1, shadow: 2048 }, high: { pr: 1.5, shadow: 4096 } };

// ---------- tiny synth for sound effects ----------
let actx = null;
const SFX = { talk: [620, 0.06, 'triangle', 0], pop: [520, 0.12, 'sine', 400], use: [440, 0.15, 'square', 500], coin: [990, 0.12, 'square', 300], whoosh: [240, 0.3, 'sawtooth', -160], thud: [110, 0.18, 'sine', -60], hit: [900, 0.07, 'square', -500], warp: [300, 0.5, 'sine', 900], zap: [1400, 0.2, 'sawtooth', -1200], horn: [330, 0.35, 'square', 0], cheer: [700, 0.4, 'triangle', 300] };
G.sfx = (name, vol = 0.08) => {
  if (!actx) return; const s = SFX[name] || SFX.pop;
  try { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime; o.type = s[2]; o.frequency.setValueAtTime(s[0], t); o.frequency.linearRampToValueAtTime(Math.max(40, s[0] + s[3]), t + s[1]); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + s[1]); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + s[1] + 0.02); } catch (e) { /* audio is optional */ }
};

G.setEra = (key) => { for (const k in G.eras) { const g = G.eras[k].group; g.visible = true; if (k === key) { if (g.parent !== G.scene) G.scene.add(g); } else if (g.parent) g.parent.remove(g); } G.era = key; G.env.applyEra(G.eras[key]); G.ui.refresh(); };
// Automatic quality governor: if the frame rate stays low it trims the most expensive extras step by step, and gives them back when there is headroom.
const PERF = [{ shadowEvery: 3, detail: 55, avatars: 6, grass: 1 }, { shadowEvery: 5, detail: 40, avatars: 4, grass: 0.8 }, { shadowEvery: 8, detail: 28, avatars: 3, grass: 0.62 }, { shadowEvery: 12, detail: 18, avatars: 2, grass: 0.45 }];
G.perf = { level: 0, ...PERF[0] };
G.setPerf = (l) => { l = Math.max(0, Math.min(PERF.length - 1, l)); Object.assign(G.perf, PERF[l], { level: l }); if (G.avatars) G.avatars.max = Math.min(G.avatars.maxBase, G.perf.avatars + (G.save.quality === 'high' ? 2 : 0)); if (G.grass) { G.grass.radius = G.grass.radiusBase * G.perf.grass; G.grass.u.uFar.value = G.grass.radius; G.grass.cx = 1e9; } };
let lowT = 0, highT = 0, detT = 0;
// Time travel: the player, anyone following, and the car you are in all go.
G.travel = (key, at = null) => {
  const era = G.eras[key]; if (!era) { G.toast('That era is not built yet.'); return; }
  if (key === G.era && !at) { G.toast('You are already here.'); return; }
  G.sfx('warp');
  return G.ui.fade(() => {
    const pc = G.pc, sp = at || era.spawn, v = G.player.vehicle;
    for (const a of G.actors) if (a !== pc && ((a.ai.mode === 'follow' && a.ai.follow === pc) || a.mount === pc || pc.mount === a)) { a.era = key; a.teleport(sp.x - 1.5, sp.z - 1.5); }
    pc.era = key; G.setEra(key); pc.teleport(sp.x, sp.z); if (sp.yaw != null) { pc.yaw = sp.yaw; G.player.yaw = sp.yaw + Math.PI; }
    if (v) { v.era = key; v.place(sp.x, sp.z); }
    G.ui.banner(era.label, era.year); G.bus.emit('era', key);
  }, true, 900);
};
G.setQuality = (q) => {
  const was = G.save.quality; G.save.quality = q; G.persist();
  if (q !== was) { location.reload(); return; }
};
let prCap = 1, pr = 1;
function applyQuality() { const q = QUALITY[G.save.quality] || QUALITY.med; prCap = Math.min(q.pr, devicePixelRatio || 1); pr = prCap; G.renderer.setPixelRatio(pr); G.env.setShadows(q.shadow); }
function resize() { G.renderer.setSize(innerWidth, innerHeight, false); G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); }

async function boot() {
  await loadMods();
  G.load();
  if (!QUALITY[G.save.quality]) G.save.quality = 'med';
  $('quality').value = G.save.quality;
  const canvas = $('game');
  const renderer = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: G.save.quality === 'high', powerPreference: 'high-performance' });
  const pbr = G.save.quality !== 'low';
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.type = pbr ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMapping = pbr ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; renderer.toneMappingExposure = 0.92;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 2200);
  G.T = makeTextures(pbr); G.M = makeMaterials(G.T, pbr);
  G.input = new Input(canvas); G.ui = new UI(); G.env = new Env(G); G.env.usePBR = pbr;
  const present = buildPresent(G); G.eras.present = present; G.scene.add(present.group);
  startMods(['./eras.js', './vehicles.js']);
  spawnCast();
  G.player = new Player(); G.player.control(G.cast.kenta, true);
  startMods(['./gadgets.js', './baseball.js', './episodes.js', './avatars.js', './grass.js', './map.js']);
  G.setEra('present'); applyQuality(); resize(); addEventListener('resize', resize);
  // warm up: compile shaders + upload textures behind the title card
  G.player.camera(0.016); G.env.update(0.016); renderer.render(G.scene, G.camera);
  $('loadMsg').textContent = 'Ready!'; const btn = $('startBtn'); btn.disabled = false;
  $('quality').onchange = (e) => G.setQuality(e.target.value);
  btn.onclick = () => {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    $('title').classList.add('hidden'); G.ui.hud(true); G.started = true; G.ui.refresh();
    G.ui.banner('Hinode Town', 'A sunny morning. Tiko is waiting.'); try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) { /* preview panes cannot lock */ }
    G.bus.emit('start');
  };
  window.G = G;
  requestAnimationFrame(frame);
}

let last = performance.now(), fAcc = 0, fN = 0, fpsShown = 60, slowT = 0, fastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  if (!G.started) return;
  tick(Math.min(raw, 0.05), raw);
}
// Debug helper: run n simulation frames right now (used when testing in a hidden tab).
G.step = (n = 60, dt = 1 / 60) => { G.noRender = true; try { for (let i = 0; i < n; i++) tick(dt, dt); } finally { G.noRender = false; } };
function tick(dt, raw) {
  // fps + dynamic resolution keeps things smooth on integrated graphics
  fAcc += raw; fN++;
  if (fAcc >= 0.5) {
    fpsShown = Math.round(fN / fAcc); fAcc = 0; fN = 0; G.fps = fpsShown;
    if (document.hidden || fpsShown < 9) { slowT = fastT = 0; } else if (fpsShown < 40) { slowT += 0.5; fastT = 0; } else if (fpsShown > 57) { fastT += 0.5; slowT = 0; } else { slowT = fastT = 0; }
    if (slowT >= 2.5 && pr > 0.6 && G.perf.level >= PERF.length - 1) { pr = Math.max(0.6, pr - 0.1); G.renderer.setPixelRatio(pr); slowT = 0; }
    if (fastT >= 6 && pr < prCap) { pr = Math.min(prCap, pr + 0.1); G.renderer.setPixelRatio(pr); fastT = 0; }
    if (!document.hidden && fpsShown >= 9) { if (fpsShown < 40) { lowT += 0.5; highT = 0; } else if (fpsShown > 57) { highT += 0.5; lowT = 0; } else lowT = highT = 0; if (lowT >= 3 && G.perf.level < PERF.length - 1) { G.setPerf(G.perf.level + 1); lowT = 0; } if (highT >= 12 && G.perf.level > 0) { G.setPerf(G.perf.level - 1); highT = 0; } }
    G.ui.fps(fpsShown, ` · ${Math.round(pr * 100)}% · trim ${G.perf.level} · ${G.renderer.info.render.calls} draws · ${(G.renderer.info.render.triangles / 1000) | 0}k tris`);
  }
  G.dt = dt; G.t += dt; if (G.frozen > 0) G.frozen -= dt; if (G.slowmo > 0) G.slowmo -= dt;
  const I = G.input, ui = G.ui, P = G.player;
  // hotkeys
  if (!ui.modal && !ui.fading) {
    if (I.hit('F3')) ui.showFps = !ui.showFps;
    if (I.hit('Escape')) ui.openMenu();
    if (G.mode === 'free') {
      if (I.hit('Tab')) ui.openCast();
      else if (I.hit('KeyM')) (G.map ? G.map.open() : ui.openWarp());
      else if (I.hit('KeyH')) ui.openHelp();
      else if (I.hit('KeyQ')) G.gadgets ? G.gadgets.openPocket() : G.toast('The Gadget Pocket is still being stitched.');
      else if (I.hit('KeyT')) G.gadgets ? G.gadgets.openWish() : G.toast('The wish box is not ready yet.');
      else if (I.hit('KeyP')) G.episodes ? G.episodes.open() : G.toast('Episodes are not ready yet.');
      for (let i = 0; i < 9; i++) if (I.hit('Digit' + (i + 1))) { ui.slot = i; ui.hotbar(); }
      if (G.gadgets && !P.vehicle) { if (I.hit('KeyR') || (I.locked ? I.clicked(0) : I.tapped(0))) G.gadgets.useSlot(false); if (I.hit('KeyG') || (I.locked ? I.clicked(2) : I.tapped(2))) G.gadgets.useSlot(true); }
    }
  }
  P.update(dt);
  G.gadgets?.update(dt);
  // actors
  const A = G.actors, stop = G.frozen > 0;
  for (let i = 0; i < A.length; i++) { const a = A[i]; if (stop && !a.controlled && !(a.ai.mode === 'follow' && a.ai.follow === G.pc)) { a.root.visible = a.era === G.era && !a.hidden; continue; } a.update(G.slowmo > 0 && !a.controlled && !(a.ai.mode === 'follow' && a.ai.follow === G.pc) && !a.rider ? dt * 0.25 : dt); }
  for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.era !== G.era || a.hidden || a.mount || a.noclip) continue; for (let k = i + 1; k < A.length; k++) { const b = A[k]; if (b.era !== G.era || b.hidden || b.mount || b.noclip) continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = (a.radius * a.size + b.radius * b.size) * 0.9, d2 = dx * dx + dz * dz; if (d2 < rr * rr && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5 * Math.max(a.size, b.size)) { const d = Math.sqrt(d2), push = (rr - d) / d * 0.5, wa = a.controlled ? 0.25 : b.controlled ? 1.75 : 1, wb = 2 - wa; a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa; b.pos.x += dx * push * wb; b.pos.z += dz * push * wb; } } }
  G.avatars?.update(dt); G.grass?.update(dt); G.map?.update(dt);
  // fine detail (window frames, sills, shelf goods, flowers) is only drawn near the camera
  detT -= dt; if (detT <= 0) { detT = 0.25; const e = G.cur(); if (!e._detail) { e._detail = []; e.group.traverse((o) => { if (o.userData.detail) e._detail.push(o); }); } const c = G.camera.position, D = G.perf.detail; for (const m of e._detail) { const s = m.geometry.boundingSphere; m.visible = Math.hypot(c.x - s.center.x, c.z - s.center.z) - s.radius < D; } }
  for (const v of G.vehicles) v.update(dt);
  G.baseball?.update(dt); G.episodes?.update(dt);
  // era housekeeping: lift the roof off the house you are standing in
  const era = G.cur(), pc = G.pc; era.update && era.update(dt, G);
  let inside = false;
  for (const it of era.interiors) { const sub = P.vehicle || pc, here = sub.pos.x > it.x0 && sub.pos.x < it.x1 && sub.pos.z > it.z0 && sub.pos.z < it.z1 && sub.pos.y < it.y - 0.4; const c = G.camera.position, camIn = c.x > it.x0 && c.x < it.x1 && c.z > it.z0 && c.z < it.z1 && c.y < it.y + 3.8; it.top.visible = !(here || camIn || G.flags.xray); inside ||= here || camIn; }
  P.inside = inside;
  P.camera(dt); G.env.update(dt); ui.tick(dt);
  if (!G.noRender) G.renderer.render(G.scene, G.camera);
  I.endFrame();
}

boot();
