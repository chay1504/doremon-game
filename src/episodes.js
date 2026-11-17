// Episodes: short stories you can start in any order (press P). Each is a list of steps;
// the current step shows as an objective with a beam of light marking where to go.
// Nothing here can be failed — stop any time, the town carries on.
import * as THREE from 'three';
import { G } from './game.js';

let S = null;                                    // the runner
const P = (name, era = 'present') => G.eras[era].pois[name];
const pcSub = () => G.player.vehicle || G.pc;
const nearPt = (p, r, era = 'present') => { const a = pcSub(); return G.pc.era === era && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < r; };
const talkedTo = (id) => (S2, ev, d) => { if (ev === 'talk' && d.id === id) S2.ok = true; };
const speak = (a, line, secs = 5) => { a.say(line, secs); G.ui.dialogue(a, line, secs); };

const EPISODES = [
  { id: 'firstday', icon: '🤖', title: "Tiko's First Day", blurb: 'A robot from the year 2226 has moved into your room. Learn the pocket, take to the sky, meet the neighbours.',
    setup: (s) => { if (G.pc !== G.cast.kenta) G.player.control(G.cast.kenta, true); if (G.era !== 'present') G.travel('present'); },
    steps: [
      { text: 'Walk up to <b>Tiko</b> and press <kbd>E</kbd> to talk.', at: () => G.cast.tiko, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'tiko') { speak(d, 'Bee-boop! My pocket holds 67 gadgets. Press Q and try the Breeze Beanie first!'); s.ok = true; } } },
      { text: 'Press <kbd>Q</kbd> to open the Gadget Pocket and pick the <b>Breeze Beanie</b>.', done: () => !!G.pc.fx.beanie, event: (s, ev, d) => { if (ev === 'gadget' && d === 'beanie') s.ok = true; } },
      { text: 'Fly to <b>Hinode Park</b>. <kbd>Space</kbd> up, <kbd>C</kbd> down, <kbd>Shift</kbd> fast.', at: () => P('park'), done: () => nearPt(P('park'), 12) },
      { text: (s) => `Say hello to three neighbours (${s.met.size}/3).`, enter: (s) => { s.met = new Set(); }, event: (s, ev, d) => { if (ev === 'talk' && d.id !== 'tiko') { s.met.add(d.id); if (s.met.size >= 3) s.ok = true; } } },
    ] },
  { id: 'pup', icon: '🐕', title: 'The Runaway Pup', blurb: 'Goro sang. Maru fled. Track down the shiba before dinner.',
    setup: (s) => { if (G.era !== 'present') G.travel('present'); const h = P('hill'); s.borrow(G.cast.maru, h.x + 2, h.z + 1, 'present'); s.borrow(G.cast.goro, P('goroHome').x, P('goroHome').z, 'present'); },
    steps: [
      { text: 'Goro looks upset. Talk to <b>Goro</b>.', at: () => G.cast.goro, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'goro') { speak(d, 'I only sang ONE song and Maru bolted! Find him, please — try the Finder Compass!'); s.ok = true; } } },
      { text: 'Open the pocket (<kbd>Q</kbd>) and use the <b>Finder Compass</b> on Maru.', done: () => G.gadgets && G.gadgets.track === G.cast.maru, event: (s, ev, d) => { if (ev === 'track' && d.id === 'maru') s.ok = true; } },
      { text: 'Follow the beam and find <b>Maru</b>.', at: () => G.cast.maru, done: () => G.pc.era === 'present' && G.cast.maru.dist(G.pc) < 5 },
      { text: 'Aim at Maru and use the <b>Friendship Badge</b> (or a Dino Biscuit) so he follows you.', at: () => G.cast.maru, done: () => G.cast.maru.ai.mode === 'follow' && G.cast.maru.ai.follow === G.pc, event: (s, ev, d) => { if (ev === 'befriend' && d.id === 'maru') s.ok = true; } },
      { text: 'Bring Maru home to <b>Goro</b>.', at: () => G.cast.goro, done: () => G.cast.maru.dist(G.cast.goro) < 7 && G.cast.goro.dist(G.pc) < 9, leave: () => { speak(G.cast.goro, 'MARU! You came back! …I promise I\'ll only hum from now on.'); G.cast.goro.setState('cheer', 3); if (G.gadgets) G.gadgets.track = null; } },
    ] },
  { id: 'biggame', icon: '⚾', title: 'The Big Game', blurb: 'The Hinode Comets face the East Town Rockets at the riverside. You pitch. You bat. No pressure.',
    setup: () => { if (G.era !== 'present') G.travel('present'); },
    steps: [
      { text: 'Head over the levee to the <b>Riverside Ballpark</b>.', at: () => P('field'), done: () => nearPt(P('field'), 14) },
      { text: 'Press <kbd>E</kbd> at home plate, pick the innings, and play the match to the end.', at: () => P('field'), event: (s, ev, d) => { if (ev === 'baseballEnd') { s.won = d.won; s.score = `${d.home}–${d.away}`; s.ok = true; } } },
    ], finishText: (s) => (s.won ? `Comets win ${s.score}!` : `Final score ${s.score}. Rematch any time.`) },
  { id: 'eggs', icon: '🥚', title: 'Eggs-pedition', blurb: 'A hundred million years ago, three eggs have rolled out of a nest. Somebody very large would like them back.',
    steps: [
      { text: 'Travel to <b>Dino Valley</b>: board the Time Pod in Kenta\'s garden, or use the Time Pod gadget.', at: () => (G.era === 'present' ? P('timePod') : null), done: () => G.pc.era === 'past' && G.era === 'past' },
      { text: (s) => `Find the three lost eggs and pick them up with <kbd>E</kbd> (${s.eggs}/3).`, enter: (s) => { s.eggs = 0; s.eggItems = G.eras.past.eggSpots.map((p) => s.item('past', p.x, p.z, eggMesh(), 'Pick up the egg', (it) => { s.take(it); s.eggs++; G.sfx('coin'); G.toast(`Egg ${s.eggs} of 3`); if (s.eggs >= 3) s.ok = true; }, { y: 0.42, r: 3 })); },
        at: (s) => { const left = s.eggItems.filter((i) => !i.taken); if (!left.length) return null; const a = G.pc; left.sort((p, q) => Math.hypot(p.x - a.pos.x, p.z - a.pos.z) - Math.hypot(q.x - a.pos.x, q.z - a.pos.z)); return { x: left[0].x, z: left[0].z, era: 'past' }; } },
      { text: 'Carry the eggs back to the <b>nest</b>.', at: () => ({ ...xz(P('nest', 'past')), era: 'past' }), done: () => nearPt(P('nest', 'past'), 6, 'past'), leave: (s) => { const n = P('nest', 'past'); for (let i = 0; i < 3; i++) s.item('past', n.x + Math.cos(i * 2.1) * 0.6, n.z + Math.sin(i * 2.1) * 0.6, eggMesh(), null, null, { y: 0.45, keep: true }); G.toast('The eggs are safe.'); G.sfx('cheer'); } },
      { text: 'Make a friend: aim a <b>Dino Biscuit</b> at a long-neck or a three-horn.', event: (s, ev, d) => { if (ev === 'befriend' && d.rideable) s.ok = true; } },
      { text: 'Stand next to your new friend and press <kbd>E</kbd> to <b>ride</b>.', event: (s, ev) => { if (ev === 'ride') s.ok = true; } },
      { text: 'Hop off with <kbd>F</kbd> when you like, then travel back to the <b>present</b>.', at: () => (G.era === 'past' ? { ...xz(P('timePod', 'past')), era: 'past' } : null), done: () => G.pc.era === 'present' && G.era === 'present' },
    ] },
  { id: 'tomorrow', icon: '🚀', title: 'Field Trip to Tomorrow', blurb: 'Tiko\'s little sister runs the Gadget Depot in 2226. Visit her, then take a hover car through the sky rings.',
    setup: (s) => { const f = G.eras.future; if (f && f.depotSpot) s.borrow(G.cast.piko, f.depotSpot.x, f.depotSpot.z, 'future'); },
    steps: [
      { text: 'Travel to <b>Neo Hinode, year 2226</b> with the Time Pod.', at: () => (G.era === 'present' ? P('timePod') : null), done: () => G.pc.era === 'future' && G.era === 'future' },
      { text: 'Find <b>Piko</b> at the Gadget Depot and talk to her.', at: () => G.cast.piko, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'piko') { speak(d, 'Welcome to the Depot! Borrow a hover car from the plaza — five sky rings are waiting. Space goes up!'); s.ok = true; } } },
      { text: 'Get into a <b>hover car</b> on the plaza (<kbd>F</kbd>).', at: () => ({ ...xz(P('garage', 'future') || P('plaza', 'future')), era: 'future' }), done: () => !!(G.player.vehicle && G.player.vehicle.hover), event: (s, ev, d) => { if (ev === 'enterCar' && d.hover) s.ok = true; } },
      { text: (s) => `Fly through the five <b>sky rings</b> (${s.n}/5). <kbd>Space</kbd> up, <kbd>C</kbd> down.`, enter: (s) => { s.n = 0; }, at: (s) => { const r = G.eras.future.rings[s.n]; return r ? { x: r.x, y: r.y, z: r.z, era: 'future', air: true } : null; },
        done: (s) => { const r = G.eras.future.rings[s.n], a = pcSub(); if (r && G.pc.era === 'future' && Math.hypot(a.pos.x - r.x, a.pos.y + 0.8 - r.y, a.pos.z - r.z) < r.r * 0.95) { s.n++; G.sfx('coin'); G.toast(`Ring ${s.n} of 5!`); } return s.n >= 5; } },
      { text: 'Land, hop out, and travel back to the <b>present</b>.', done: () => G.pc.era === 'present' && G.era === 'present' },
    ] },
  { id: 'dare', icon: '🏎️', title: "Riku's Supercar Dare", blurb: 'Six checkpoints around town in ninety seconds. Riku says nobody can do it. Riku is twelve.',
    setup: (s) => { if (G.era !== 'present') G.travel('present'); s.borrow(G.cast.riku, P('mansion').x + 1.5, P('mansion').z, 'present'); },
    steps: [
      { text: 'Talk to <b>Riku</b> outside the mansion.', at: () => G.cast.riku, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'riku') { speak(d, 'Six checkpoints, ninety seconds. Take any car from the carport. Scratch it and you\'re washing all four.'); s.ok = true; } } },
      { text: 'Get into a <b>supercar</b> in the carport (<kbd>F</kbd>).', at: () => G.eras.present.garage[0], done: () => !!G.player.vehicle, event: (s, ev) => { if (ev === 'enterCar') s.ok = true; } },
      { text: (s) => `Drive through the checkpoints (${s.n}/6) — <b>${Math.max(0, Math.ceil(s.left))} s</b> left.`,
        enter: (s) => { s.n = 0; s.left = 90; s.cps = [[63, -63], [-21, -63], [-21, 21], [63, 21], [105, 21], [105, -63]].map(([x, z]) => { const m = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, fog: false })); m.position.set(x, 2.4, z); return s.item('present', x, z, m, null, null, { y: 2.4, raw: true }); }); },
        at: (s) => { const c = s.cps[s.n]; return c ? { x: c.x, z: c.z, era: 'present' } : null; },
        done: (s, dt) => { s.left -= dt; const c = s.cps[s.n], a = pcSub(); if (c) { c.mesh.rotation.y += dt * 2; if (G.player.vehicle && Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 6) { s.take(c); s.n++; G.sfx('coin'); } } if (s.n >= 6) { s.time = (90 - s.left).toFixed(1); return true; } if (s.left <= 0) { G.toast('Out of time! The checkpoints reset — go again.'); for (const k of s.cps) s.take(k); s.restep(); } return false; } },
    ], finishText: (s) => `All six in ${s.time} seconds. Riku is speechless.` },
  { id: 'picnic', icon: '🧺', title: 'The Rainy Picnic', blurb: 'Everyone is at the park, the sandwiches are soggy, and somebody in this town owns a Weather Box.',
    setup: (s) => { if (G.era !== 'present') G.travel('present'); G.env.setWeather('rain'); const p = P('park'); ['mira', 'hana', 'sora', 'goro'].forEach((id, i) => s.borrow(G.cast[id], p.x - 3 + i * 2, p.z + 2 + (i % 2), 'present')); },
    steps: [
      { text: 'It is pouring! Get to <b>Hinode Park</b>.', at: () => P('park'), done: () => nearPt(P('park'), 12) },
      { text: 'Use the <b>Weather Box</b> until the sun comes out.', done: () => G.env.weather === 'clear' },
      { text: 'Unroll a <b>Feast Mat</b> and serve something.', event: (s, ev) => { if (ev === 'serve') s.ok = true; } },
      { text: 'Blow the <b>Party Horn</b> to call everyone over.', event: (s, ev) => { if (ev === 'party') s.ok = true; } },
      { text: 'Eat something from the mat (<kbd>E</kbd>).', event: (s, ev) => { if (ev === 'eat') s.ok = true; } },
    ] },
  { id: 'tiny', icon: '💍', title: 'Tiny Trouble', blurb: 'Mira has dropped her grandmother\'s ring somewhere in her room. It is very small. So, shortly, are you.',
    setup: (s) => { if (G.era !== 'present') G.travel('present'); s.borrow(G.cast.mira, P('miraHome').x, P('miraHome').z, 'present'); },
    steps: [
      { text: 'Talk to <b>Mira</b> outside her house.', at: () => G.cast.mira, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'mira') { speak(d, 'My grandmother\'s ring rolled away in my room… it\'s too tiny to spot. Could you look?'); s.ok = true; } } },
      { text: 'Shrink yourself with the <b>Size Lantern</b>: click twice with nobody in your sights.', done: () => G.pc.sizeT <= 0.3 },
      { text: 'Search <b>Mira\'s room</b> (through the front door, on the right). The ring only shows up when you are tiny.',
        enter: (s) => { const r = P('miraRoom'); const m = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 14), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a00 })); m.rotation.x = Math.PI / 2; s.ring = s.item('present', r.x + 0.7, r.z + 0.9, m, 'Pick up the ring', (it) => { s.take(it); s.ok = true; G.sfx('coin'); G.toast('Found it!'); }, { y: r.y + 0.03, r: 0.9, abs: true }); },
        tick: (s) => { if (s.ring && !s.ring.taken) s.ring.it.hidden = G.pc.size > 0.4; }, at: () => ({ ...xz(P('miraRoom')), era: 'present' }) },
      { text: 'Grow back to normal size (<kbd>right-click</kbd> or <kbd>G</kbd> with the lantern).', done: () => G.pc.sizeT >= 0.9 && G.pc.sizeT <= 1.1 },
      { text: 'Give the ring back to <b>Mira</b>.', at: () => G.cast.mira, event: (s, ev, d) => { if (ev === 'talk' && d.id === 'mira') { speak(d, 'You found it! Thank you, thank you! …Why are your shoes so dusty?'); d.setState('cheer', 2.5); s.ok = true; } } },
    ] },
];
const MOVIES = [['🏰', 'Movie: The Clockwork Kingdom'], ['🐋', 'Movie: Kenta and the Cloud Whales'], ['🛸', 'Movie: Voyage to the Star Bazaar']];
const xz = (p) => ({ x: p.x, z: p.z });
function eggMesh() { const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf2ead2, roughness: 0.6 })); m.scale.y = 1.3; m.castShadow = true; for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshStandardMaterial({ color: 0x8fae7a, roughness: 0.8 })); const a = i * 2.4, u = (i % 3) * 0.5 - 0.5; s.position.set(Math.cos(a) * 0.31 * Math.sqrt(1 - u * u * 0.6), u * 0.25, Math.sin(a) * 0.31 * Math.sqrt(1 - u * u * 0.6)); s.scale.set(1, 1, 0.4); s.lookAt(0, 0, 0); m.add(s); } return m; }

class Runner {
  constructor() {
    this.cur = null; this.i = 0; this.ok = false; this.items = []; this.borrowed = []; this.uiT = 0;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 120, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 60; const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10), new THREE.MeshBasicMaterial({ color: 0xffb400, fog: false })); tip.rotation.x = Math.PI;
    this.marker = new THREE.Group(); this.marker.add(beam, tip); this.tip = tip; this.beam = beam; this.marker.visible = false; G.scene.add(this.marker);
    for (const ev of ['talk', 'gadget', 'era', 'eat', 'enterCar', 'baseballEnd', 'befriend', 'ride', 'serve', 'party', 'track', 'size', 'weather', 'interact']) G.bus.on(ev, (d) => { const st = this.step(); if (st && st.event) st.event(this, ev, d); });
  }
  step() { return this.cur ? this.cur.steps[this.i] : null; }
  open() {
    const items = [];
    if (this.cur) items.push({ icon: '⏹️', label: 'Stop the current episode', sub: this.cur.title, cat: 'Now playing', fn: () => { this.stop(); G.toast('Episode stopped.'); } });
    EPISODES.forEach((e, n) => items.push({ icon: e.icon, label: `${n + 1}. ${e.title}`, sub: e.blurb, cat: 'Episodes — play in any order', done: !!G.save.done[e.id], badge: G.save.done[e.id] ? 'Done ⭐' : this.cur === e ? 'Playing' : null, fn: () => this.start(e) }));
    MOVIES.forEach(([icon, t]) => items.push({ icon, label: t, sub: 'A full-length adventure. Coming later.', cat: 'Movies', locked: true, lockedMsg: 'Movies are coming later.' }));
    G.ui.choose('Episodes', 'Pick any story. You can stop at any time and nothing can go wrong.', items, { name: 'episodes', closeKey: 'KeyP', search: false });
  }
  start(e) {
    this.stop(); this.cur = e; this.i = 0; this.num = EPISODES.indexOf(e) + 1;
    if (e.setup) e.setup(this);
    G.ui.banner(e.title, `Episode ${this.num}`); G.sfx('warp'); this.enter(); G.bus.emit('episodeStart', e.id);
  }
  enter() { const st = this.step(); this.ok = false; if (st.enter) st.enter(this); this.uiT = 0; this.show(); }
  restep() { const st = this.step(); this.ok = false; if (st.enter) st.enter(this); }
  show() { const st = this.step(); if (!st) return; const t = typeof st.text === 'function' ? st.text(this) : st.text; G.ui.objective(`Episode ${this.num} · ${this.cur.title} · ${this.i + 1}/${this.cur.steps.length}`, t + (this.dist != null ? ` <span style="opacity:.6;white-space:nowrap">· ${this.dist} m</span>` : '')); }
  next() {
    const st = this.step(); if (st.leave) st.leave(this);
    this.i++; G.sfx('coin');
    if (this.i >= this.cur.steps.length) this.finish(); else this.enter();
  }
  finish() {
    const e = this.cur, first = !G.save.done[e.id]; G.save.done[e.id] = true; if (first) G.save.coins += 50; G.persist();
    G.ui.banner('Episode complete!', (e.finishText ? e.finishText(this) : e.title) + (first ? ' · +50 🪙' : '')); G.sfx('cheer'); G.pc.setState('cheer', 2);
    this.cleanup(); G.ui.refresh(); G.bus.emit('episodeDone', e.id);
  }
  stop() { if (this.cur) this.cleanup(); }
  cleanup() {
    for (const it of this.items) if (!it.keep) this.take(it);
    this.items = this.items.filter((i) => i.keep && !i.taken);
    for (const b of this.borrowed) { const a = b.a; if (a === G.pc || a.ai.mode === 'scripted') continue; a.era = b.era; a.teleport(b.x, b.z); a.ai.mode = a.ai.mode === 'follow' && a.ai.follow === G.pc && a.id !== 'tiko' ? 'wander' : b.mode === 'idle' ? 'wander' : b.mode; a.ai.target = null; a.ai.node = null; }
    this.borrowed.length = 0; this.cur = null; this.marker.visible = false; this.dist = null; G.ui.objective(null, null);
  }
  // Park a cast member somewhere for the story (they are put back afterwards).
  borrow(a, x, z, era) { if (!a || a === G.pc || a.ai.mode === 'scripted') return; this.borrowed.push({ a, x: a.pos.x, z: a.pos.z, era: a.era, mode: a.ai.mode === 'player' ? 'wander' : a.ai.mode }); if (a.mount || a.rider) return; a.era = era; a.teleport(x, z); a.ai.mode = 'idle'; a.ai.pause = 0; a.setState('idle'); }
  // Put a story object in the world, optionally something you can pick up with E.
  item(era, x, z, mesh, label, fn, o = {}) {
    const E = G.eras[era], y = o.abs ? o.y : E.heightAt(x, z) + (o.y || 0); mesh.position.set(x, y, z); E.group.add(mesh);
    const rec = { era, x, y, z, mesh, taken: false, keep: !!o.keep, it: null };
    if (label) { rec.it = { id: 'story', x, y, z, r: o.r || 2.4, label, icon: '✨', fn: () => fn(rec) }; E.interact.push(rec.it); }
    this.items.push(rec); return rec;
  }
  take(rec) { if (rec.taken) return; rec.taken = true; const E = G.eras[rec.era]; E.group.remove(rec.mesh); if (rec.it) { const i = E.interact.indexOf(rec.it); if (i >= 0) E.interact.splice(i, 1); } }
  update(dt) {
    const st = this.step(); if (!st) return;
    if (G.mode === 'free' || G.mode === 'baseball') {
      if (st.tick) st.tick(this, dt);
      if ((st.done && st.done(this, dt)) || this.ok) { this.next(); return; }
    }
    // marker + distance read-out
    let t = st.at ? st.at(this) : null; if (t && t.pos) t = { x: t.pos.x, y: t.pos.y + t.height * t.size, z: t.pos.z, era: t.era, actor: true };
    const here = t && (t.era || 'present') === G.era;
    this.marker.visible = !!here && G.mode === 'free';
    if (here) {
      const gy = t.y != null ? t.y : G.eras[G.era].heightAt(t.x, t.z), a = pcSub();
      this.marker.position.set(t.x, t.air ? gy - 60 : gy, t.z); this.beam.visible = !t.air; this.tip.position.y = (t.air ? 60 : t.actor ? 1.2 : 3) + Math.sin(G.t * 3) * 0.3; this.tip.rotation.y += dt * 2;
      this.dist = Math.round(Math.hypot(a.pos.x - t.x, a.pos.z - t.z));
    } else this.dist = null;
    this.uiT -= dt; if (this.uiT <= 0) { this.uiT = 0.25; this.show(); }
  }
}

export function init() { S = new Runner(); G.episodes = S; }
