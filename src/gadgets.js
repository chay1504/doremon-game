// Tiko's Gadget Pocket: 67 gadgets, loose props, particles, portals, riding, and the wish box.
import * as THREE from 'three';
import { G } from './game.js';
import { Batch, gableGeo, mat4, fuse } from './build.js';
import { tree, flowers as flowerPatch } from './props.js';
import { emojiTexture } from './textures.js';
import { spawnActor } from './actors.js';
import { clamp, damp, pick, rnd, rng, TAU } from './util.js';

const GD = []; let S = null;
const D = (id, name, icon, cat, desc, use, x = {}) => GD.push({ id, name, icon, cat, desc, use, ...x });
const _v = new THREE.Vector3(), _c = new THREE.Color();
const BRIGHT = [0xff5a5f, 0xffb400, 0x00c2a8, 0x3a86ff, 0xb5179e, 0x8ac926, 0xff7b00, 0xff99c8];

// ------------------------------------------------------------------ helpers
const near = (r, from = G.pc) => G.actors.filter((a) => a !== from && a.era === from.era && !a.hidden && a !== from.mount && a.dist(from) < r);
function fling(a, vx, vy, vz, stun = 0) { a.vel.set(vx, vy, vz); a.thrown = 1.2; a.onGround = false; if (stun) a.setState('stun', stun); }
function toggle(a, key, on, off) { if (a.fx[key]) { delete a.fx[key]; off(a); return false; } a.fx[key] = true; on(a); return true; }
function timed(a, key, secs, label, on, off) { const e = S.fx.find((f) => f.a === a && f.key === key); if (e) { e.t = secs; return; } on(a); a.fx[key] = true; S.fx.push({ a, key, t: secs, label, off }); }
function endTimed(a, key) { const i = S.fx.findIndex((f) => f.a === a && f.key === key); if (i >= 0) { const f = S.fx[i]; S.fx.splice(i, 1); delete a.fx[key]; f.off(a); } }
const TOGGLES = { beanie: '🧢 Propeller Cap', cloudboard: '☁️ Cloud Board', spring: '🦘 Spring Soles', leaf: '🍃 Parachute Leaf', cloak: '👻 Invisible', bubble: '🫧 Bubble Shield', minisun: '☀️ Pocket Sun', baby: '🍼 Age Wrap', disguise: '🎩 Disguised' };

function burst(x, y, z, { n = 40, speed = 6, life = 1.2, colors = [0xffffff], size = 0.2, grav = 9, up = 2 } = {}) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = speed * (0.35 + Math.random() * 0.65); pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = Math.cos(a) * r * s; vel[i * 3 + 1] = u * s + up; vel[i * 3 + 2] = Math.sin(a) * r * s; _c.set(colors[(Math.random() * colors.length) | 0]); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, fog: false })); pts.frustumCulled = false; G.scene.add(pts);
  S.bursts.push({ pts, vel, life, t: 0, grav, n }); if (S.bursts.length > 40) killBurst(S.bursts.shift());
}
function killBurst(b) { G.scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); }
const poof = (a, colors = [0xffffff, 0xdfefff]) => burst(a.pos.x, a.pos.y + a.height * a.size * 0.5, a.pos.z, { n: 26, speed: 3.5, life: 0.6, colors, grav: 0, up: 0.5, size: 0.28 });

// Loose physics props (food, balls, coins, gifts). Emoji billboards or any mesh.
function prop(o) {
  let obj = o.mesh;
  if (!obj) { obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(o.emoji), transparent: true })); obj.scale.setScalar(o.s || 0.6); obj.center.set(0.5, 0.08); }
  obj.position.set(o.x, o.y, o.z); G.scene.add(obj);
  const p = { obj, pos: obj.position, vel: new THREE.Vector3(o.vx || 0, o.vy || 0, o.vz || 0), r: o.r ?? 0.3, era: o.era || G.era, label: o.label, use: o.use, reach: o.reach, life: o.life ?? 180, bounce: o.bounce ?? 0.45, touch: o.touch, grav: o.grav !== false, emoji: o.emoji, cool: 0, rest: false, spin: o.spin };
  G.props.push(p); if (G.props.length > 240) removeProp(G.props[0]); return p;
}
function removeProp(p) { G.scene.remove(p.obj); const i = G.props.indexOf(p); if (i >= 0) G.props.splice(i, 1); if (p.obj.isSprite) p.obj.material.dispose(); }

// Things built into the world at run time (cottages, trees, bridges…). Remembered so the Tidy Vacuum can remove them.
function build(fn, { x, y = null, z, era = G.era, grow = true, life = 0 }) {
  const E = G.eras[era], cols = [], proxy = { add: (...a) => { const c = E.colliders.add(...a); cols.push(c); return c; } };
  const b = new Batch(G.M, proxy, 0); b.height = E.heightAt; const gy = y ?? E.heightAt(x, z); b.push(x, gy, z); b.height = null; fn(b); const g = new THREE.Group(); b.build(g); E.group.add(g);
  const s = { g, cols, era, t: 0, grow, pivot: new THREE.Vector3(x, gy, z), life }; S.spawned.push(s); if (grow) { g.scale.setScalar(0.01); g.position.copy(s.pivot).multiplyScalar(0.99); } return s;
}
function unbuild(s) { const E = G.eras[s.era]; E.group.remove(s.g); s.g.traverse((m) => m.geometry && m.geometry.dispose()); for (const c of s.cols) E.colliders.remove(c); const i = S.spawned.indexOf(s); if (i >= 0) S.spawned.splice(i, 1); }
function glowMesh(geo, color, opacity = 0.75) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide, fog: false })); return m; }
function freeSpot(x, z, eraKey = G.era) { const E = G.eras[eraKey], p = { x, z }; E.colliders.resolve(p, 0.6, E.heightAt(x, z) + 0.5, E.heightAt(x, z) + 1.4); return p; }
const ahead = (d, a = G.pc) => ({ x: a.pos.x + Math.sin(a.yaw) * d, z: a.pos.z + Math.cos(a.yaw) * d });

// ------------------------------------------------------------------ the catalogue
// --- Getting around
D('beanie', 'Propeller Cap', '🧢', 'Getting around', 'A cap with a spinning propeller: fly anywhere. Space up, C down, Shift to go fast. Use again to land.', ({ pc }) => { const on = toggle(pc, 'beanie', (a) => { a.fly = true; if (a.onGround) a.vel.y = 5; addCap(a); }, (a) => { a.fly = !!a.fx.cloudboard; removeCap(a); }); G.toast(on ? 'Propeller spinning — up, up and away!' : 'Propeller Cap off.'); });
D('cloudboard', 'Cloud Board', '☁️', 'Getting around', 'Surf the sky on a little cloud. Twice as fast as the beanie.', ({ pc }) => {
  const on = toggle(pc, 'cloudboard', (a) => { a.fly = true; a.speedMul = 3.2; const m = new THREE.Mesh(fuse([0, 1, 2, 3].map((i) => [new THREE.IcosahedronGeometry(0.28, 1), 0xffffff, mat4((i - 1.5) * 0.3, 0, (i % 2) * 0.12 - 0.06, 0, 0, 0, 1.2, 0.6, 1.5)])), new THREE.MeshLambertMaterial({ vertexColors: true })); m.position.y = -0.08; a.root.add(m); a.fx.cloudMesh = m; if (a.onGround) a.vel.y = 5; }, (a) => { a.fly = !!a.fx.beanie; a.speedMul = 1; if (a.fx.cloudMesh) { a.root.remove(a.fx.cloudMesh); delete a.fx.cloudMesh; } });
  G.toast(on ? 'Cloud Board ready — hold Shift to zoom!' : 'Cloud Board put away.');
});
D('sneakers', 'Rocket Sneakers', '👟', 'Getting around', 'Run three times faster for 20 seconds.', ({ pc }) => timed(pc, 'speed', 20, '👟 Rocket Sneakers', (a) => { a.speedMul = 3; }, (a) => { a.speedMul = a.fx.cloudboard ? 3.2 : 1; }));
D('moonboots', 'Moon Boots', '🌙', 'Getting around', 'Moon gravity: huge floaty jumps for 25 seconds.', ({ pc }) => timed(pc, 'moon', 25, '🌙 Moon Boots', (a) => { a.gravMul = 0.22; a.jumpMul = 1.5; }, (a) => { a.gravMul = 1; a.jumpMul = a.fx.spring ? 1.6 : 1; }));
D('spring', 'Spring Soles', '🦘', 'Getting around', 'Bounce every time you land. Use again to stop.', ({ pc }) => toggle(pc, 'spring', (a) => { a.bouncy = true; a.jumpMul = 1.6; }, (a) => { a.bouncy = false; a.jumpMul = 1; }));
D('straw', 'Rocket Straw', '🚀', 'Getting around', 'Blast 60 metres straight up, then drift down gently.', ({ pc }) => { pc.vel.y = 36; pc.onGround = false; burst(pc.pos.x, pc.pos.y, pc.pos.z, { colors: [0xffb400, 0xff5a5f, 0xffffff], n: 50, up: -4 }); timed(pc, 'drift', 14, '🍃 Drifting down', (a) => { a.glide = true; }, (a) => { a.glide = !!a.fx.leaf; }); }, { sfx: 'whoosh' });
D('leaf', 'Parachute Leaf', '🍃', 'Getting around', 'Fall as slowly as a leaf. Use again to stop.', ({ pc }) => toggle(pc, 'leaf', (a) => { a.glide = true; }, (a) => { a.glide = false; }));
D('sling', 'Giant Slingshot', '🪃', 'Getting around', 'Fling yourself wherever you are looking.', ({ pc }) => { const d = G.player.look(_v); fling(pc, d.x * 30, Math.max(9, -d.y * -30 + 12), d.z * 30); timed(pc, 'drift', 8, '🍃 Drifting down', (a) => { a.glide = true; }, (a) => { a.glide = !!a.fx.leaf; }); }, { sfx: 'whoosh' });
D('mole', 'Mole Mitts', '🕳️', 'Getting around', 'Dig under everything and pop up 30 metres ahead.', ({ pc }) => { burst(pc.pos.x, pc.pos.y + 0.2, pc.pos.z, { colors: [0x8a6a48, 0xb8936a], n: 30, speed: 4 }); const t = ahead(30), p = freeSpot(t.x, t.z); pc.teleport(p.x, p.z); burst(p.x, pc.pos.y + 0.2, p.z, { colors: [0x8a6a48, 0xb8936a], n: 30, speed: 4 }); pc.vel.y = 5; pc.onGround = false; }, { sfx: 'thud' });
D('gill', 'Gill Candy', '🍬', 'Getting around', 'Walk on the riverbed and breathe under water for a minute.', ({ pc }) => timed(pc, 'gill', 60, '🍬 Gill Candy', (a) => { a.gills = true; }, (a) => { a.gills = false; }));
D('ice', 'Ice Rink Spray', '⛸️', 'Getting around', 'The ground turns to ice under you for 20 seconds. Wheee.', ({ pc }) => timed(pc, 'ice', 20, '⛸️ Slippery', (a) => { a.slippery = true; }, (a) => { a.slippery = false; }));
// --- Body
D('size', 'Size Lantern', '🔦', 'Body tricks', 'Click: shrink. Right-click or G: grow. Aim at someone, or it works on you.', ({ pc, target, alt }) => { const a = target || pc; a.sizeT = clamp(a.sizeT * (alt ? 2 : 0.5), 0.08, 16); poof(a, alt ? [0xfff3a0, 0xffc857] : [0xa0e9ff, 0x7fd0ff]); G.toast(`${a.name} is now ${a.sizeT >= 1 ? a.sizeT + '×' : '1/' + Math.round(1 / a.sizeT)} size`); G.bus.emit('size', a); }, { aim: true, tgt: true, sfx: 'zap' });
D('cloak', 'Ghost Cloak', '👻', 'Body tricks', 'Turn invisible. Nobody notices you. Use again to reappear.', ({ pc }) => { const on = toggle(pc, 'cloak', (a) => a.setGhost(true), (a) => a.setGhost(false)); G.toast(on ? 'You vanish…' : 'You are visible again.'); });
D('wallring', 'Wall-Pass Ring', '⭕', 'Body tricks', 'Walk straight through walls for 15 seconds.', ({ pc }) => timed(pc, 'noclip', 15, '⭕ Walking through walls', (a) => { a.noclip = true; }, (a) => { a.noclip = false; const p = freeSpot(a.pos.x, a.pos.z, a.era); a.pos.x = p.x; a.pos.z = p.z; }));
D('balloon', 'Balloon Gum', '🎈', 'Body tricks', 'Blow a bubble, puff up and float away for 8 seconds.', ({ pc }) => { timed(pc, 'float', 8, '🎈 Floating', (a) => { a.fx.preSize = a.sizeT; a.sizeT *= 1.5; a.gravMul = -0.035; a.vel.y = 1.5; a.onGround = false; a.setState('float', 8); }, (a) => { a.sizeT = a.fx.preSize || 1; delete a.fx.preSize; a.gravMul = 1; a.setState('idle'); poof(a, [0xff8fab]); G.sfx('pop'); timed(a, 'drift', 8, '🍃 Drifting down', (b) => { b.glide = true; }, (b) => { b.glide = !!b.fx.leaf; }); }); });
D('antigrav', 'Float Paint', '🖌️', 'Body tricks', 'Paint someone and they float gently for 8 seconds.', ({ pc, target }) => { const a = target || pc; timed(a, 'float', 8, '🖌️ Floating', (x) => { x.gravMul = -0.035; x.vel.y = 1.5; x.onGround = false; x.setState('float', 8); x.say('Waaah?!', 2); }, (x) => { x.gravMul = 1; x.setState('idle'); x.glide = true; setTimeout(() => { x.glide = !!x.fx.leaf; }, 7000); }); }, { aim: true, tgt: true });
D('baby', 'Age Wrap', '🍼', 'Body tricks', 'Wrap someone up and they turn baby-sized with a big head. Again to undo.', ({ pc, target }) => { const a = target || pc; toggle(a, 'baby', (x) => { x.fx.preSize2 = x.sizeT; x.sizeT *= 0.55; if (x.j.head !== x.j.body) x.j.head.scale.setScalar(1.45); poof(x, [0xffd6e0, 0xffffff]); }, (x) => { x.sizeT = x.fx.preSize2 || 1; delete x.fx.preSize2; if (x.j.head !== x.j.body) x.j.head.scale.setScalar(1); poof(x); }); }, { aim: true, tgt: true });
D('disguise', 'Disguise Hat', '🎩', 'Body tricks', 'Look exactly like anyone in town.', ({ pc }) => {
  const items = Object.values(G.cast).filter((a) => a !== pc).map((a) => ({ icon: a.emoji, label: a.name, fn: () => { pc.fx.trueLook ??= pc.look; pc.fx.disguise = true; pc.setLook(a.look); poof(pc, [0xb5179e, 0xffffff]); G.toast(`You look just like ${a.name}!`); G.bus.emit('gadget', 'disguise'); } }));
  if (pc.fx.trueLook) items.unshift({ icon: '↩️', label: 'Back to myself', fn: () => { pc.setLook(pc.fx.trueLook); delete pc.fx.trueLook; delete pc.fx.disguise; poof(pc); } });
  G.ui.choose('Disguise Hat', 'Who do you want to look like?', items); return false;
});
D('mirror', 'Copy Mirror', '🪞', 'Body tricks', 'Step out of the mirror: a copy of you that follows you around.', ({ pc }) => { if (S.clones.length >= 6) { G.toast('The mirror is tired. (6 copies max — use the Tidy Vacuum.)'); return false; } const p = ahead(-1.5); const c = spawnActor({ id: 'clone' + (++S.uid), cast: false, name: pc.name + ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII'][S.clones.length], emoji: pc.emoji, look: pc.look, era: pc.era, x: p.x, z: p.z, ai: 'follow', lines: ['I\'m the real one!', 'No, I\'M the real one.', 'We should form a baseball team.'], walk: pc.walkSpeed, run: pc.runSpeed }); c.ai.follow = pc; c.ai.slot = 1 + S.clones.length; c.playable = true; c.sizeT = c.size = pc.sizeT; S.clones.push(c); poof(c, [0xdfefff, 0xffffff]); });
D('swap', 'Swap Baton', '🔁', 'Body tricks', 'Tap someone and you become them.', ({ target }) => { if (!target) { G.toast('Aim at someone first.'); return false; } poof(target, [0x3a86ff, 0xffffff]); G.player.control(target); }, { aim: true, tgt: true });
D('statue', 'Statue Spray', '🗿', 'Body tricks', 'Turn someone into a statue for 10 seconds.', ({ target }) => { if (!target) { G.toast('Aim at someone first.'); return false; } target.tint(0x8f9296); target.setState('statue', 10); poof(target, [0x9a9a9a]); }, { aim: true, tgt: true });
D('bubble', 'Bubble Shield', '🫧', 'Body tricks', 'A springy bubble that boings everyone away from you.', ({ pc }) => toggle(pc, 'bubble', (a) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshLambertMaterial({ color: 0xbfefff, transparent: true, opacity: 0.25, depthWrite: false })); m.position.y = a.height * 0.5; m.scale.setScalar(a.height * 0.95); a.root.add(m); a.fx.bubbleMesh = m; }, (a) => { a.root.remove(a.fx.bubbleMesh); delete a.fx.bubbleMesh; }));
// --- Places and time
D('hoop', 'Warp Hoop', '🌀', 'Places and time', 'Pick a place. Step through the glowing hoop and you are there.', () => {
  const era = G.cur(), items = Object.entries(era.pois).filter(([k]) => !/Room$/.test(k)).map(([k, p]) => ({ icon: '📍', label: (era.warp && era.warp[k] ? era.warp[k][1] : k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())), fn: () => S.portal(p) }));
  G.ui.choose('Warp Hoop', 'Where should the other end open?', items); return false;
});
D('timepod', 'Time Pod & Chrono Screen', '⏳', 'Places and time', 'Travel to the age of dinosaurs or the year 2226 — or just peek at them.', () => { S.openTime(); return false; }, { inCar: true });
D('rewind', 'Rewind Watch', '⏪', 'Places and time', 'Jump back to where you were 10 seconds ago.', ({ pc }) => { const h = G.player.history, s = h[Math.max(0, h.length - 40)]; if (!s || s.era !== pc.era) { G.toast('Nothing to rewind yet.'); return false; } poof(pc, [0x9bf6ff]); pc.teleport(s.x, s.z, s.y); poof(pc, [0x9bf6ff]); h.length = 0; }, { sfx: 'warp' });
D('stopclock', 'Freeze Clock', '⏱️', 'Places and time', 'Time stops for everyone but you for 10 seconds.', () => { G.frozen = 10; G.toast('Tick… tock… … …'); timed(G.pc, 'stop', 10, '⏱️ Time is frozen', () => {}, () => G.toast('Time flows again.')); }, { inCar: true });
D('dial', 'Day-Night Dial', '🌗', 'Places and time', 'Spin day into night, or night into day.', () => { G.env.setTime(G.env.night < 0.5 ? 21.5 : 10, 7); }, { inCar: true });
D('hourglass', 'Fast-Forward Hourglass', '⌛', 'Places and time', 'Watch a whole day and night fly past in five seconds.', () => { G.env.setTime(G.env.tod + 23.8, 5); }, { inCar: true });
D('whistle', 'Homing Whistle', '🏠', 'Places and time', 'One toot and you are standing at Kenta\'s front door, from any era.', ({ pc }) => { const p = G.eras.present.pois.kentaHome; if (G.era !== 'present') G.travel('present', { x: p.x, z: p.z }); else G.ui.fade(() => pc.teleport(p.x, p.z), false, 250); }, { sfx: 'warp' });
D('pin', 'Bookmark Pin', '📌', 'Places and time', 'First use: remember this spot. Next use: come back to it.', ({ pc }) => { const pin = S.pin; if (pin && (pin.era !== pc.era || Math.hypot(pin.x - pc.pos.x, pin.z - pc.pos.z) > 6)) { if (pin.era !== G.era) G.travel(pin.era, { x: pin.x, z: pin.z }); else G.ui.fade(() => pc.teleport(pin.x, pin.z, pin.y), false, 250); S.pin = null; G.toast('Back at your bookmark. Pin cleared.'); } else { S.pin = { era: pc.era, x: pc.pos.x, y: pc.pos.y, z: pc.pos.z }; G.toast('Spot bookmarked. Use the pin again from anywhere to return.'); } });
// --- World
const WEATHERS = [['clear', '☀️ Sunny'], ['rain', '🌧️ Rain'], ['snow', '❄️ Snow'], ['fog', '🌫️ Fog'], ['storm', '⛈️ Storm']];
D('weather', 'Weather Box', '🌦️', 'Changing the world', 'Each use switches the weather: sun, rain, snow, fog, storm.', () => { const i = (WEATHERS.findIndex((w) => w[0] === G.env.weather) + 1) % WEATHERS.length; G.env.setWeather(WEATHERS[i][0]); G.toast('Weather: ' + WEATHERS[i][1]); G.bus.emit('weather', WEATHERS[i][0]); }, { inCar: true });
D('thunder', 'Thunder Drum', '⚡', 'Changing the world', 'Bang! Lightning strikes where you aim.', ({ point }) => { G.env.lightning(); G.player.shake = 0.35; const bolt = glowMesh(new THREE.CylinderGeometry(0.15, 0.4, 120, 5), 0xfff7b0, 0.95); bolt.position.set(point.x, point.y + 60, point.z); G.scene.add(bolt); setTimeout(() => G.scene.remove(bolt), 160); burst(point.x, point.y + 0.3, point.z, { colors: [0xfff7b0, 0xffffff], n: 40, speed: 9 }); for (const a of G.actors) if (a.era === G.era && !a.controlled && Math.hypot(a.pos.x - point.x, a.pos.z - point.z) < 4.5) { a.tint(0x3a3a3a); a.setState('stun', 2.5); a.say('*cough*', 2.5); setTimeout(() => a.tint(0xffffff), 4000); } }, { aim: true, sfx: 'zap', inCar: true });
D('quake', 'Stomp Boots', '🥾', 'Changing the world', 'One stomp shakes the whole street. Everyone nearby falls over.', ({ pc }) => { G.player.shake = 0.9; for (const a of near(20)) fling(a, rnd(-2, 2), 5.5, rnd(-2, 2), 2); burst(pc.pos.x, pc.pos.y + 0.1, pc.pos.z, { colors: [0xb8936a, 0xd6c3a1], n: 50, speed: 7, up: 1 }); }, { sfx: 'thud' });
D('fan', 'Gale Fan', '🪭', 'Changing the world', 'A gust that blows people and things down the street.', ({ pc }) => { const fx = Math.sin(pc.yaw), fz = Math.cos(pc.yaw); for (const a of near(16)) { const dx = a.pos.x - pc.pos.x, dz = a.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1; if ((dx * fx + dz * fz) / d > 0.45) fling(a, fx * 15, 6, fz * 15, 1.5); } for (const p of G.props) { const dx = p.pos.x - pc.pos.x, dz = p.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1; if (d < 16 && (dx * fx + dz * fz) / d > 0.4) { p.vel.set(fx * 16, 6, fz * 16); p.rest = false; } } burst(pc.pos.x + fx * 2, pc.pos.y + 1, pc.pos.z + fz * 2, { colors: [0xffffff, 0xdff6ff], n: 40, speed: 10, grav: 0, up: 0, life: 0.6 }); }, { sfx: 'whoosh' });
D('seeds', 'Instant Seeds', '🌱', 'Changing the world', 'Plant a seed where you aim. A full tree in one second.', ({ point }) => { build((b) => tree(b, rng((point.x * 31 + point.z * 17) | 0), 0, 0, rnd(0.9, 1.7), pick(['round', 'round', 'cherry', 'pine', 'ginkgo'])), { x: point.x, z: point.z }); }, { aim: true, sfx: 'pop' });
D('flowers', 'Flower Wand', '🌸', 'Changing the world', 'Wave it and a patch of flowers springs up where you aim.', ({ point }) => { build((b) => flowerPatch(b, rng((point.x * 13 + point.z * 7) | 0), 0, 0, 34, 2.6), { x: point.x, z: point.z }); }, { aim: true, sfx: 'pop' });
D('rainbow', 'Rainbow Brush', '🌈', 'Changing the world', 'Paint a rainbow across the sky.', ({ pc }) => { const g = new THREE.Group(); [0xff595e, 0xff924c, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93].forEach((c, i) => g.add(glowMesh(new THREE.TorusGeometry(130 - i * 4, 2, 5, 48, Math.PI), c, 0.6))); const t = ahead(170); g.position.set(t.x, G.cur().heightAt(pc.pos.x, pc.pos.z) - 6, t.z); g.rotation.y = pc.yaw; G.scene.add(g); S.temps.push({ obj: g, t: 90, era: G.era }); G.toast('🌈'); });
D('fireworks', 'Firework Pencil', '🎆', 'Changing the world', 'Draw fireworks in the sky where you aim. Best at night.', ({ point }) => { for (let i = 0; i < 7; i++) setTimeout(() => { burst(point.x + rnd(-14, 14), point.y + rnd(26, 46), point.z + rnd(-14, 14), { colors: [pick(BRIGHT), pick(BRIGHT), 0xffffff], n: 90, speed: 13, life: 1.9, grav: 3, up: 0, size: 0.5 }); G.sfx('pop', 0.06); }, i * 380); }, { aim: true, inCar: true });
D('snowman', 'Snowman Maker', '⛄', 'Changing the world', 'Pop! A snowman where you aim.', ({ point }) => { build((b) => { b.sph('plain', 0, 0.55, 0, 0.6, 0xffffff); b.sph('plain', 0, 1.35, 0, 0.44, 0xffffff); b.sph('plain', 0, 1.95, 0, 0.32, 0xffffff); b.cone('plain', 0, 1.95, 0.4, 0.06, 0.3, 0xff7b00, 6, Math.PI / 2); b.cyl('plain', 0, 2.3, 0, 0.2, 0.22, 0.26, 0x222222, 10); b.cyl('plain', 0, 2.18, 0, 0.36, 0.36, 0.03, 0x222222, 12); for (const s of [-0.1, 0.1]) b.sph('plain', s, 2.03, 0.28, 0.035, 0x111111); for (const s of [-1, 1]) b.cyl('wood', s * 0.62, 1.45, 0, 0.02, 0.03, 0.7, 0x6d4526, 4, 0, s * 1.1); b.solid(0, 0, 0.9, 0.9, 0, 2.2, 'snowman', false); }, { x: point.x, z: point.z }); }, { aim: true, sfx: 'pop' });
D('cloud', 'Cloud Kneader', '🌥️', 'Changing the world', 'Knead a cloud you can stand on: under your feet in the air, or as a step in front of you.', ({ pc }) => { const air = !pc.onGround || pc.fly, t = air ? { x: pc.pos.x, z: pc.pos.z } : ahead(2.6), y = air ? pc.pos.y - 0.02 : pc.pos.y + 0.4 + (S.lastCloudY > pc.pos.y - 0.3 && S.lastCloudY < pc.pos.y + 0.3 ? 0 : 0); S.lastCloudY = y; build((b) => { for (let i = 0; i < 9; i++) b.ico('plain', ((i % 3) - 1) * 1.3, -0.45 + (i % 2) * 0.1, (((i / 3) | 0) - 1) * 1.3, 1.05, 0xffffff, 1, 0.5, 1, 1); b.solid(0, 0, 4.2, 4.2, -0.6, 0, 'cloud'); }, { x: t.x, y, z: t.z }); }, { sfx: 'pop' });
D('bridge', 'Light Bridge', '🌉', 'Changing the world', 'A glowing bridge shoots 36 metres ahead from your feet (north, south, east or west).', ({ pc }) => { const q = Math.round(pc.yaw / (Math.PI / 2)) * (Math.PI / 2), dx = Math.round(Math.sin(q)), dz = Math.round(Math.cos(q)), L = 36, y = pc.pos.y; build((b) => { b.box('glass', dx * (L / 2 + 0.4), -0.08, dz * (L / 2 + 0.4), dx ? L : 2.6, 0.16, dz ? L : 2.6, 0x7ff6ff); for (const s of [-1.3, 1.3]) b.box('glow', dx * (L / 2 + 0.4) + (dz ? s : 0), 0.02, dz * (L / 2 + 0.4) + (dx ? s : 0), dx ? L : 0.1, 0.06, dz ? L : 0.1, 0x7ff6ff); b.solid(dx * (L / 2 + 0.4), dz * (L / 2 + 0.4), dx ? L : 2.6, dz ? L : 2.6, -0.16, 0, 'bridge'); }, { x: pc.pos.x, y, z: pc.pos.z, grow: false, life: 60 }); G.toast('Light Bridge — lasts one minute.'); }, { sfx: 'zap' });
D('tramp', 'Trampoline Pad', '🤸', 'Changing the world', 'Drop a trampoline where you aim. Step on it.', ({ point }) => { const s = build((b) => { b.cyl('plain', 0, 0.14, 0, 1.5, 1.5, 0.28, 0x2b2f36, 18); b.cyl('plain', 0, 0.29, 0, 1.3, 1.3, 0.02, 0x3a86ff, 18); b.solid(0, 0, 2.3, 2.3, 0, 0.3, 'tramp'); }, { x: point.x, z: point.z }); S.pads.push({ x: point.x, z: point.z, y: s.pivot.y + 0.3, era: G.era, s }); }, { aim: true, sfx: 'pop' });
D('house', 'Capsule Cottage', '🏡', 'Changing the world', 'Throw the capsule where you aim: an instant little cottage.', ({ point }) => { const c = pick([0xf7efdc, 0xe6edf2, 0xfbeef2, 0xe3efdc]), r = pick([0x9a4b3c, 0x3c4a63, 0x4e6b52]); build((b) => { b.box('concrete', 0, 0.1, 0, 4.6, 0.2, 4.2, 0xb8b5ad); b.box('plaster', 0, 1.5, 0, 4.2, 2.6, 3.8, c); b.add('roof', gableGeo(5.2, 4.8, 1.5, G.M.roof.userData.tile), r, mat4(0, 2.55, 0)); b.quad('door', 0, 1.2, 1.93, 0.95, 2.0, 0xffffff); b.quad('win', -1.3, 1.6, 1.93, 0.9, 0.9, 0xffffff); b.quad('win', 1.3, 1.6, 1.93, 0.9, 0.9, 0xffffff); b.cyl('brick', 1.4, 3.6, -0.8, 0.22, 0.22, 1.2, 0xffffff, 6); b.solid(0, 0, 4.2, 3.8, 0, 3.4, 'cottage'); }, { x: point.x, z: point.z }); }, { aim: true, sfx: 'pop' });
D('vacuum', 'Tidy Vacuum', '🧹', 'Changing the world', 'Sucks up everything gadgets have made: props, cottages, clones, clouds.', () => { S.tidy(); G.toast('All tidy!'); }, { sfx: 'whoosh', inCar: true });
D('minisun', 'Pocket Sun', '🔆', 'Changing the world', 'A tiny sun floats above your head and lights your way at night.', ({ pc }) => toggle(pc, 'minisun', (a) => { const g = new THREE.Group(); g.add(glowMesh(new THREE.SphereGeometry(0.18, 12, 8), 0xfff3b0, 1)); const l = new THREE.PointLight(0xffe6a0, 40, 34, 1.8); g.add(l); g.position.y = a.height + 0.9; a.root.add(g); a.fx.sunMesh = g; }, (a) => { a.root.remove(a.fx.sunMesh); delete a.fx.sunMesh; }));
// --- People
D('megaphone', 'Mega Megaphone', '📣', 'People and pets', 'HELLO!!! Everyone nearby is blown off their feet.', ({ pc }) => { pc.say('HELLOOO!!!', 1.5); for (const a of near(13)) { const dx = a.pos.x - pc.pos.x, dz = a.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1; fling(a, dx / d * 9, 5, dz / d * 9, 1.4); a.say('!!!', 1.5); } G.player.shake = 0.25; }, { sfx: 'horn' });
D('flute', 'Sleepy Flute', '🪈', 'People and pets', 'A lullaby. Everyone nearby dozes off for 10 seconds.', () => { for (const a of near(15)) { a.setState('sleep', 10); a.say('Zzz…', 9); } });
D('laugh', 'Giggle Powder', '🤣', 'People and pets', 'A pinch of powder and everyone nearby cannot stop laughing.', ({ pc }) => { burst(pc.pos.x, pc.pos.y + 1.2, pc.pos.z, { colors: [0xfff3a0, 0xffd6e0], n: 60, speed: 6, grav: 1, life: 1.4 }); for (const a of near(13)) { a.setState('laugh', 7); a.say(pick(['Hahaha!', 'Hee hee hee!', 'Stop— hahaha!', 'Bwahaha!']), 5); } });
D('dance', 'Dance Disc', '💿', 'People and pets', 'Drop the beat. You and everyone nearby dance for 8 seconds.', ({ pc }) => { pc.setState('dance', 8); for (const a of near(18)) a.setState('dance', 8); [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => setTimeout(() => G.sfx(i % 2 ? 'coin' : 'pop', 0.05), i * 260)); });
const SECRETS = { mira: 'I named a star after Tiko. Don\'t tell him.', goro: 'I… I cry at puppy films. Every time.', riku: 'I\'d swap all the cars for one day of baseball where I hit a home run.', sora: 'I got 98 once. I still think about those two points.', mom: 'I know about the snacks hidden in the bedroom. I always knew.', dad: 'I pretend to read the newspaper. I\'m napping.', teacher: 'Kenta\'s essays are my favourite. Zero points, but so creative.', tiko: 'My pocket has a gadget I\'m too scared to take out.', kenta: 'I practise baseball at night so nobody sees me miss.', granny: 'The lucky candies are just normal candies.', officer: 'I\'ve never given a ticket. I just wave.', piko: 'I polish big brother\'s antenna while he sleeps.' };
D('truth', 'Truth Bubble', '💬', 'People and pets', 'Blow it at someone and they blurt out a secret.', ({ target }) => { if (!target) { G.toast('Aim at someone first.'); return false; } const s = SECRETS[target.id] || pick(['I once ate six melon breads in a row.', 'I talk to the cat. It answers.', 'I still sleep with a night light.', 'I\'m scared of the school skeleton.']); target.ai.pause = 5; target.say(s, 5); G.ui.dialogue(target, s, 5); }, { aim: true, tgt: true });
D('badge', 'Friendship Badge', '🎖️', 'People and pets', 'Pin it on someone and they follow you everywhere. Again to let them go.', ({ pc, target }) => { if (!target) { G.toast('Aim at someone first.'); return false; } if (target.ai.mode === 'follow' && target.ai.follow === pc && target.id !== 'tiko') { target.ai.mode = target.ai.wasB || 'wander'; target.say('See you later!', 2.5); } else { target.ai.wasB = target.ai.mode === 'follow' ? 'wander' : target.ai.mode; target.ai.mode = 'follow'; target.ai.follow = pc; target.ai.slot = 1 + G.actors.filter((a) => a.ai.mode === 'follow' && a.ai.follow === pc).length; target.say('Wait for me!', 2.5); G.bus.emit('befriend', target); } }, { aim: true, tgt: true });
D('bell', 'Friend Bell', '🔔', 'People and pets', 'Ring for anyone and they pop up next to you.', ({ pc }) => { G.ui.choose('Friend Bell', 'Who should come?', Object.values(G.cast).filter((a) => a !== pc).map((a) => ({ icon: a.emoji, label: a.name, fn: () => S.summon(a) }))); return false; });
D('horn', 'Party Horn', '🥳', 'People and pets', 'Toot! Every friend appears around you and cheers.', ({ pc }) => { const list = Object.values(G.cast).filter((a) => a !== pc && a.ai.mode !== 'scripted'); list.forEach((a, i) => { const an = i / list.length * TAU, p = freeSpot(pc.pos.x + Math.cos(an) * 4, pc.pos.z + Math.sin(an) * 4); if (a.era !== pc.era) a.era = pc.era; a.teleport(p.x, p.z); a.yaw = Math.atan2(pc.pos.x - p.x, pc.pos.z - p.z); a.setState('cheer', 3); a.ai.wait = 12; poof(a); }); burst(pc.pos.x, pc.pos.y + 2, pc.pos.z, { colors: BRIGHT, n: 120, speed: 7, grav: 5, life: 2 }); G.bus.emit('party'); }, { sfx: 'cheer' });
D('translator', 'Translator Jelly', '🍮', 'People and pets', 'Eat it and you understand animals. Talk to the dog. And the dinosaurs.', () => { G.flags.translate = !G.flags.translate; G.toast(G.flags.translate ? 'You can understand animals now!' : 'Back to woofs and meows.'); }, { inCar: true });
D('tracker', 'Finder Compass', '🧭', 'People and pets', 'Choose someone and a beam of light shows where they are.', ({ pc }) => { const items = Object.values(G.cast).filter((a) => a !== pc).map((a) => ({ icon: a.emoji, label: a.name, fn: () => { S.track = a; G.toast(a.era === G.era ? `Follow the beam to ${a.name}.` : `${a.name} is in ${G.eras[a.era].label}!`); G.bus.emit('track', a); } })); if (S.track) items.unshift({ icon: '✖️', label: 'Stop tracking', fn: () => { S.track = null; } }); G.ui.choose('Finder Compass', 'Who are you looking for?', items); return false; });
D('xray', 'X-Ray Specs', '🕶️', 'People and pets', 'See into every house and read name tags from far away.', () => { G.flags.xray = !G.flags.xray; G.toast(G.flags.xray ? 'X-ray on.' : 'X-ray off.'); }, { inCar: true });
D('paint', 'Paint Popper', '🎨', 'People and pets', 'Splat! Recolours whoever you aim at (or you). Right-click cleans it off.', ({ pc, target, alt }) => { const a = target || pc; a.tint(alt ? 0xffffff : pick(BRIGHT)); poof(a, alt ? [0xffffff] : BRIGHT); }, { aim: true, tgt: true, sfx: 'pop' });
// --- Things
const FOODS = 'ramen:🍜|noodles:🍜|sushi:🍣|pizza:🍕|hamburger:🍔|burger:🍔|fries:🍟|hot dog:🌭|hotdog:🌭|taco:🌮|burrito:🌯|curry:🍛|biryani:🍛|rice ball:🍙|onigiri:🍙|rice:🍚|bento:🍱|dumpling:🥟|gyoza:🥟|samosa:🥟|momo:🥟|tempura:🍤|shrimp:🍤|melon bread:🥐|croissant:🥐|bun:🥐|bread:🍞|toast:🍞|pancake:🥞|dosa:🥞|waffle:🧇|omelette:🍳|egg:🍳|bacon:🥓|steak:🥩|chicken:🍗|sandwich:🥪|salad:🥗|soup:🍲|stew:🍲|spaghetti:🍝|pasta:🍝|birthday cake:🎂|cake:🍰|cupcake:🧁|doughnut:🍩|donut:🍩|cookie:🍪|biscuit:🍪|chocolate:🍫|candy:🍬|sweet:🍬|lollipop:🍭|ice cream:🍦|icecream:🍦|kulfi:🍦|pudding:🍮|dango:🍡|mochi:🍡|honey:🍯|popcorn:🍿|pie:🥧|naan:🫓|roti:🫓|chapati:🫓|paratha:🫓|falafel:🧆|pani puri:🧆|pretzel:🥨|jalebi:🥨|cheese:🧀|paneer:🧀|apple:🍎|banana:🍌|orange:🍊|grapes:🍇|watermelon:🍉|strawberry:🍓|peach:🍑|cherry:🍒|mango:🥭|pineapple:🍍|lemon:🍋|melon:🍈|kiwi:🥝|coconut:🥥|corn:🌽|carrot:🥕|sweet potato:🍠|potato:🥔|tomato:🍅|milk:🥛|juice:🧃|chai:🍵|tea:🍵|coffee:☕|lassi:🥤|soda:🥤|cola:🥤|milkshake:🥤|bubble tea:🧋|water:💧'.split('|').map((s) => s.split(':'));
const THINGS = 'football:⚽|soccer ball:⚽|basketball:🏀|baseball:⚾|cricket bat:🏏|tennis:🎾|kite:🪁|balloon:🎈|teddy:🧸|toy:🧸|guitar:🎸|drum:🥁|piano:🎹|trumpet:🎺|violin:🎻|comic:📖|book:📚|pencil:✏️|phone:📱|laptop:💻|computer:💻|tv:📺|camera:📷|video game:🎮|game:🎮|console:🎮|crown:👑|ring:💍|diamond:💎|gem:💎|trophy:🏆|medal:🏅|gift:🎁|present:🎁|umbrella:☂️|hat:🎩|cap:🧢|glasses:👓|shoes:👟|bag:🎒|key:🔑|lamp:💡|candle:🕯️|rocket:🚀|ufo:🛸|plane:✈️|aeroplane:✈️|helicopter:🚁|train:🚂|bicycle:🚲|bike:🚲|scooter:🛴|skateboard:🛹|boat:⛵|ship:🚢|bus:🚌|star:⭐|moon:🌙|heart:❤️|fire:🔥|rose:🌹|sunflower:🌻|cactus:🌵|mushroom:🍄|dragon:🐉|unicorn:🦄|panda:🐼|penguin:🐧|monkey:🐒|elephant:🐘|tiger:🐯|lion:🦁|rabbit:🐰|bunny:🐰|parrot:🦜|bird:🐦|fish:🐟|whale:🐳|butterfly:🦋|ghost:👻|alien:👽|treasure:💰|sword:🗡️|shield:🛡️|magic wand:🪄|wand:🪄|telescope:🔭|microscope:🔬|globe:🌍|map:🗺️|alarm clock:⏰|flag:🚩|tent:⛺|homework:📝|medicine:💊|peacock:🦚|cow:🐄|horse:🐎|duck:🦆|owl:🦉|frog:🐸|turtle:🐢|snake:🐍|bee:🐝|spider:🕷️|robot toy:🤖|magnet:🧲|bomb:💣|kettle:🫖|chair:🪑|bed:🛏️|toilet:🚽|soap:🧼|broom:🧹|basket:🧺|ladder:🪜|axe:🪓|hammer:🔨|anchor:⚓|battery:🔋|satellite:🛰️|volcano:🌋|rainbow flag:🏳️‍🌈|snowflake:❄️|pumpkin:🎃|christmas tree:🎄|firecracker:🧨|lantern:🏮|doll:🪆|yo-yo:🪀|dice:🎲|puzzle:🧩|chess:♟️|microphone:🎤|headphones:🎧|radio:📻|money:💵'.split('|').map((s) => s.split(':'));
const BIG = new Set('🚀🛸✈️🚁🚂🚌🚢⛵🐘🐳🐉⛺🌋🎄🛰️🦄🐄🐎'.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu));
function food(emoji, name, x, z, y) { return prop({ emoji, x, y: y ?? G.cur().heightAt(x, z) + 1.2, z, s: 0.55, label: `Eat the ${name}`, use: (p, pc) => { removeProp(p); pc.say(pick(['Yum!', 'Delicious!', 'Mmm!', 'So good!', 'Itadakimasu!']), 2); pc.setState('cheer', 0.9); G.sfx('pop'); G.bus.emit('eat', name); } }); }
function thing(emoji, name, x, z) { const big = BIG.has(emoji); return prop({ emoji, x, y: G.cur().heightAt(x, z) + 1.5, z, s: big ? 3 : 0.75, r: big ? 0.9 : 0.3, reach: big ? 3.2 : 1.8, label: `Play with the ${name}`, use: (p, pc) => { p.vel.set(Math.sin(pc.yaw) * 4, 6, Math.cos(pc.yaw) * 4); p.rest = false; pc.setState('cheer', 0.7); G.sfx('pop'); } }); }
D('feast', 'Feast Mat', '🍱', 'Things', 'Unroll the mat, name a food, and it appears. E to eat.', ({ pc }) => {
  const menu = ['ramen', 'sushi', 'pizza', 'burger', 'curry', 'onigiri', 'bento', 'melon bread', 'pancake', 'cake', 'donut', 'ice cream', 'dango', 'watermelon', 'mango', 'biryani', 'dosa', 'samosa', 'chai', 'juice'];
  const items = menu.map((n) => ({ icon: FOODS.find((f) => f[0] === n)[1], label: n[0].toUpperCase() + n.slice(1), fn: () => S.serve([n]) }));
  items.unshift({ icon: '🎉', label: 'A whole feast', sub: 'Eight dishes at once', fn: () => S.serve(['ramen', 'sushi', 'pizza', 'curry', 'cake', 'watermelon', 'dango', 'juice']) });
  G.ui.choose('Feast Mat', 'Pick a dish — or press T and wish for any food by name.', items); return false;
});
D('wishstar', 'Wishing Star', '🌠', 'Things', 'Say what you want. Anything at all.', () => { S.openWish(); return false; }, { inCar: true });
D('carcap', 'Car Capsule', '🏎️', 'Things', 'Pop the capsule where you aim: a brand-new supercar. F to drive.', ({ point }) => { if (!G.spawnCar) { G.toast('No cars yet.'); return false; } const names = [['Rosso GT', 0xd62828], ['Sunbeam V12', 0xf7b801], ['Aqua Spyder', 0x1fa3a3], ['Violet Arrow', 0x7b4fd6], ['Mikan Turbo', 0xf2762e], ['Lime Bolt', 0x7ac943]], [name, color] = pick(names), p = freeSpot(point.x, point.z); const hover = G.era === 'future'; const c = G.spawnCar({ name: hover ? 'Sky ' + name : name, color, era: G.era, x: p.x, z: p.z, yaw: G.pc.yaw, hover }); c.spawned = true; burst(p.x, point.y + 1, p.z, { colors: [color, 0xffffff], n: 50, speed: 6 }); G.toast(`${c.name} delivered. Press F next to it.`); }, { aim: true, sfx: 'pop' });
D('ball', 'Kick Ball', '⚽', 'Things', 'A ball to kick around. Run into it.', ({ pc }) => { const t = ahead(1.5); prop({ emoji: '⚽', x: t.x, y: pc.pos.y + 1, z: t.z, s: 0.5, r: 0.25, bounce: 0.7, life: 600, touch: (p, a) => { if (p.cool > 0) return; const sp = Math.hypot(a.vel.x, a.vel.z); if (sp < 0.5) return; p.vel.set(a.vel.x * 1.6 + Math.sin(a.yaw) * 3, 3 + sp * 0.5, a.vel.z * 1.6 + Math.cos(a.yaw) * 3); p.rest = false; p.cool = 0.3; G.sfx('thud', 0.05); } }); }, { sfx: 'pop' });
D('robo', 'Robo-Buddies', '🤖', 'Things', 'Three palm-sized robots march behind you in a line.', ({ pc }) => { if (S.clones.length >= 6) { G.toast('Too many followers — use the Tidy Vacuum first.'); return false; } for (let i = 0; i < 3; i++) { const p = ahead(-1.2 - i * 0.7); const c = spawnActor({ id: 'buddy' + (++S.uid), cast: false, name: ['Bip', 'Bop', 'Boop'][i], emoji: '🤖', look: { type: 'robot', h: 0.42, body: 0xffffff, accent: BRIGHT[(S.uid + i) % BRIGHT.length], eye: 0xfff59d }, era: pc.era, x: p.x, z: p.z, ai: 'follow', lines: ['Bip!', 'Bop!', 'Boop!'], walk: 3, run: 7 }); c.ai.follow = pc; c.ai.slot = 2 + S.clones.length; c.playable = true; S.clones.push(c); poof(c); } });
D('magnet', 'Magnet Glove', '🧲', 'Things', 'Everything loose within 25 metres flies to you for 4 seconds.', ({ pc }) => timed(pc, 'magnet', 4, '🧲 Magnet Glove', () => {}, () => {}));
D('coins', 'Lucky Coin Tree', '🪙', 'Things', 'Shake it and coins rain down. Run through them to collect.', ({ pc }) => { for (let i = 0; i < 24; i++) prop({ emoji: '🪙', x: pc.pos.x + rnd(-6, 6), y: pc.pos.y + rnd(7, 14), z: pc.pos.z + rnd(-6, 6), s: 0.4, r: 0.35, life: 60, touch: (p, a) => { if (!a.controlled) return; removeProp(p); G.save.coins++; G.persist(); G.ui.refresh(); G.sfx('coin', 0.05); G.bus.emit('coin'); } }); });
D('biscuit', 'Dino Biscuit', '🦴', 'People and pets', 'Feed it to any animal or dinosaur: instant friend. Big ones let you ride (E).', ({ pc, target }) => { if (!target || !(target.kind === 'quad' || target.dino || target.rideable)) { G.toast('Aim at an animal or a dinosaur.'); return false; } target.friendly = true; target.ai.mode = 'follow'; target.ai.follow = pc; target.ai.slot = 3; target.say(G.flags.translate ? 'Best. Biscuit. Ever. I\'m yours.' : '♥ ♥ ♥', 3); burst(target.pos.x, target.pos.y + target.height * target.size, target.pos.z, { colors: [0xff5a8a, 0xffb3c6], n: 20, speed: 2, grav: -2, life: 1.2 }); if (target.rideable) G.toast(`${target.name} is your friend. Press E next to it to ride!`); G.bus.emit('befriend', target); }, { aim: true, tgt: true });
D('camera', 'Snapshot Camera', '📸', 'Things', 'Click! Saves a picture of what you see.', () => { G.ui.hud(false); G.renderer.render(G.scene, G.camera); const url = G.renderer.domElement.toDataURL('image/png'); G.ui.hud(true); const a = document.createElement('a'); a.href = url; a.download = `pocket-town-${Date.now()}.png`; a.click(); G.toast('Picture saved to your downloads.'); }, { inCar: true });
D('confetti', 'Confetti Popper', '🎉', 'Things', 'Pop! Because why not.', ({ pc }) => burst(pc.pos.x, pc.pos.y + pc.height * pc.size + 0.4, pc.pos.z, { colors: BRIGHT, n: 140, speed: 8, grav: 6, life: 2.2, size: 0.22 }), { sfx: 'pop', inCar: true });

// ------------------------------------------------------------------ more gadgets (batch 2)
function capMesh() {
  const g = new THREE.Group(), cols = [0xe63946, 0xffd166, 0x06d6a0, 0x118ab2];
  cols.forEach((c, i) => g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, i * Math.PI / 2, Math.PI / 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 }))));
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 0.11), new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.6 })); visor.position.set(0, 0.006, 0.17); g.add(visor);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.3, metalness: 0.7 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), metal); stem.position.y = 0.19; g.add(stem);
  const prop = new THREE.Group(); prop.position.y = 0.235; g.add(prop);
  prop.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), metal));
  for (const s of [-1, 1]) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.045), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 })); blade.position.x = s * 0.095; blade.rotation.x = s * 0.25; prop.add(blade); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, prop };
}
function addCap(a) { if (a.fx.capMesh) return; const c = capMesh(); c.g.position.y = a.height - 0.05; a.root.add(c.g); a.fx.capMesh = c; S && S.caps.add(a); }
function removeCap(a) { const c = a.fx.capMesh; if (!c) return; a.root.remove(c.g); delete a.fx.capMesh; S && S.caps.delete(a); }

const FORTUNES = ['Today you will find something you lost. Probably a sock.', 'A great adventure begins at the end of the empty lot.', 'Someone nearby is thinking about melon bread.', 'Your next pitch will be a strike. Or a ball. One of those.', 'Lucky number: 7. Lucky colour: whatever Tiko is wearing.', 'Do your homework before Mom asks. Trust the cookie.', 'A dinosaur will remember your kindness.', 'Look up. No, higher.', 'You will soon wear a very silly hat.', 'Beware of dogs carrying shoes.', 'The future is bright. It is also in 2226.', 'Big things come in small pockets.', 'Today is a good day to ride something enormous.', 'A friend will surprise you near water.'];
const DREAMS = { kenta: 'Flying over town on a cloud made of pancakes, getting 100 on every test.', tiko: 'An endless warehouse of sweet buns. All perfectly organised. All his.', mira: 'Naming a brand-new star — and it waves back.', goro: 'A sold-out stadium chanting his name. He is playing the drums AND pitching.', riku: 'A garage so big it has its own weather.', sora: 'Reading every book in the library in one afternoon. Then rereading them.', piko: 'Her own Gadget Depot on the moon. Big brother works for her.', mom: 'A full, quiet afternoon with tea, a book, and no gadgets anywhere.', dad: 'A hole-in-one. Then a nap. Then another hole-in-one.', teacher: 'A class where every single student hands in homework on time.', granny: 'Fireflies all along the river, like when she was small.', maru: 'A mountain of shoes. A river of sausages. No baths.', kuro: 'Ruling the empty lot. Which, to be fair, already happened.', hana: 'Doing the monkey bars across the whole park without touching the ground.', officer: 'Directing traffic for a parade of friendly elephants.' };
const GENERIC_DREAMS = ['Being chased by a giant, very polite rice ball.', 'Flying, but only two centimetres off the ground.', 'Turning up to school in pyjamas. Again.', 'A beach where the waves are made of soda.'];

D('door', 'Elsewhere Door', '🚪', 'Places and time', 'Set the door down, open it and step through: it opens onto any place in this era — or right next to any friend. Stays for 5 minutes.', () => { S.openDoorMenu(); return false; });
D('critter', 'Critter Cracker', '🐾', 'Body tricks', 'Crunch one and turn into an animal: a dog, a cat or a little dinosaur. Crunch again to change back.', () => { S.openCritter(); return false; });
D('drone', 'Hawk-Eye Drone', '🛰️', 'Places and time', 'Send up a camera drone and see everything from high above while you keep walking. 20 seconds, or use again to land it.', () => S.drone());
D('slowmo', 'Slow-Mo Watch', '🐢', 'Places and time', 'Everyone except you moves at quarter speed for 12 seconds.', () => { G.slowmo = 12; G.toast('Everything… slows… down…'); }, { inCar: true });
D('airgun', 'Air Blaster Ring', '💨', 'People and pets', 'Point and puff: a blast of air that knocks whoever you aim at off their feet.', ({ pc, target, point }) => {
  const tx = target ? target.pos.x : point.x, tz = target ? target.pos.z : point.z, dx = tx - pc.pos.x, dz = tz - pc.pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  for (let i = 1; i <= 4; i++) { const k = Math.min(d, 24) * i / 4; burst(pc.pos.x + ux * k, pc.pos.y + 1.1, pc.pos.z + uz * k, { colors: [0xffffff, 0xdff6ff], n: 14, speed: 2.5, grav: 0, up: 0, life: 0.45, size: 0.35 }); }
  if (target) { fling(target, ux * 16, 7, uz * 16, 1.6); target.say(pick(['Whoa!', 'Hey!', 'Wheee!', 'My hair!']), 2); }
  for (const p of G.props) { const qx = p.pos.x - pc.pos.x, qz = p.pos.z - pc.pos.z, along = qx * ux + qz * uz; if (along > 0 && along < 26 && Math.abs(qx * uz - qz * ux) < 1.5) { p.vel.set(ux * 14, 6, uz * 14); p.rest = false; } }
}, { aim: true, tgt: true, sfx: 'whoosh' });
D('raincloud', 'Raincloud Pal', '🌧️', 'People and pets', 'A tiny grumpy cloud that rains on whoever you aim at (or on you) for 15 seconds.', ({ pc, target }) => S.raincloud(target || pc), { aim: true, tgt: true });
D('mitts', 'Mighty Mitts', '🥊', 'Body tricks', 'Super-strength for 20 seconds: anyone you bump into goes flying, and parked cars roll when you shove them.', ({ pc }) => timed(pc, 'mitts', 20, '🥊 Mighty Mitts', () => {}, () => {}), { sfx: 'thud' });
D('shadow', 'Shadow Scissors', '✂️', 'Body tricks', 'Snip! Your shadow peels off the ground and wanders around town on its own.', ({ pc }) => {
  if (S.clones.length >= 6) { G.toast('Too many copies about — use the Tidy Vacuum first.'); return false; }
  const p = ahead(-1.5), look = { ...pc.look }; delete look.avatar;
  const c = spawnActor({ id: 'shadow' + (++S.uid), cast: false, name: `${pc.name}'s Shadow`, emoji: '👤', look, era: pc.era, x: p.x, z: p.z, ai: 'wander', lines: ['…', '…!', '(the shadow waves silently)', '(the shadow does a little bow)'], walk: pc.walkSpeed, run: pc.runSpeed });
  c.tint(0x1b1d24); c.playable = true; c.sizeT = c.size = pc.sizeT; S.clones.push(c); poof(c, [0x222222, 0x444444]);
}, { sfx: 'pop' });
D('stairs', 'Cloud Staircase', '🪜', 'Changing the world', 'A spiral of fluffy cloud steps climbing 17 metres into the sky. Walk straight up.', ({ pc }) => {
  const c = ahead(3.4), base = G.ground(c.x, c.z, pc.pos.y + 0.5), R0 = rng(((c.x * 7 + c.z * 13) | 0) + 99);
  build((b) => {
    for (let i = 0; i < 46; i++) { const a = i * 0.42 + pc.yaw, x = Math.cos(a) * 2.7, z = Math.sin(a) * 2.7, y = 0.36 * (i + 1); for (let k = 0; k < 3; k++) b.ico('plain', x + (R0() - 0.5) * 0.5, y - 0.18, z + (R0() - 0.5) * 0.5, 0.5, 0xffffff, 1.25, 0.42, 1.25, 0); b.solid(x, z, 1.35, 1.35, y - 0.32, y, 'cloud'); }
    const ta = 46 * 0.42 + pc.yaw, tx = Math.cos(ta) * 2.7, tz = Math.sin(ta) * 2.7, ty = 0.36 * 46;
    for (let k = 0; k < 8; k++) b.ico('plain', tx + Math.cos(k) * 1.2, ty - 0.2, tz + Math.sin(k) * 1.2, 0.85, 0xffffff, 1.3, 0.45, 1.3, 0);
    b.solid(tx, tz, 3.4, 3.4, ty - 0.3, ty + 0.02, 'cloud');
  }, { x: c.x, y: base, z: c.z });
  G.toast('Cloud Staircase — walk up the spiral!');
}, { sfx: 'pop' });
D('treasure', 'Treasure Map', '🗺️', 'Things', 'Somewhere in this era a chest is buried. The map marks it with a blue beam — find it and open it with E.', () => S.treasure());
D('fortune', 'Fortune Cookie', '🥠', 'Things', 'Crack it open and read your future. Accuracy not guaranteed.', ({ pc }) => { G.ui.dialogue({ name: 'Fortune Cookie', emoji: '🥠' }, pick(FORTUNES), 6); pc.say('Hmm…', 2); }, { sfx: 'pop', inCar: true });
D('dream', 'Dream Viewer', '💭', 'People and pets', 'Aim at anyone to see what they dream about at night.', ({ target }) => { if (!target) { G.toast('Aim at someone first.'); return false; } G.ui.dialogue({ name: `${target.name}'s dream`, emoji: '💭' }, DREAMS[target.id] || pick(GENERIC_DREAMS), 6); target.say('Zzz…', 2); }, { aim: true, tgt: true });
D('floatbomb', 'Float Bomb', '🪐', 'People and pets', 'Pop! Everyone within 18 metres floats gently up for 6 seconds.', ({ pc }) => {
  burst(pc.pos.x, pc.pos.y + 1, pc.pos.z, { colors: [0xc8b6ff, 0xffffff, 0x9bf6ff], n: 80, speed: 6, grav: -1, life: 1.6 });
  for (const a of near(18)) timed(a, 'float', 6, '🪐 Floating', (x) => { x.gravMul = -0.04; x.vel.y = 1.6; x.onGround = false; x.setState('float', 6); x.say(pick(['Eek!', 'I\'m floating!', 'Wheee!']), 2); }, (x) => { x.gravMul = 1; x.setState('idle'); x.glide = true; setTimeout(() => { x.glide = !!x.fx.leaf; }, 6000); });
}, { sfx: 'pop' });
D('birds', 'Bird Whistle', '🐦', 'Changing the world', 'Whistle and a flock of birds comes to circle above you for 40 seconds.', () => S.birds(), { sfx: 'pop', inCar: true });
D('campfire', 'Campfire Kit', '🔥', 'Changing the world', 'Pop! A crackling campfire inside a ring of stones, with logs to sit on. Lovely at night.', () => S.campfire(), { sfx: 'pop' });

// ------------------------------------------------------------------ the pocket itself
class Gadgets {
  constructor() { this.list = GD; this.byId = Object.fromEntries(GD.map((g) => [g.id, g])); this.fx = []; this.bursts = []; this.spawned = []; this.temps = []; this.pads = []; this.clones = []; this.portals = []; this.uid = 0; this.caps = new Set(); this.rains = []; this.fires = []; this.flock = null; this.chest = null; this.droneT = 0; this.pin = null; this.track = null; this.aimT = 0; this.beam = glowMesh(new THREE.CylinderGeometry(0.35, 0.35, 260, 8, 1, true), 0xffe066, 0.4); this.beam.visible = false; G.scene.add(this.beam); }
  isActive(id) { const pc = G.pc; return !!(pc && (pc.fx[id] || (id === 'translator' && G.flags.translate) || (id === 'xray' && G.flags.xray) || (id === 'sneakers' && pc.fx.speed) || (id === 'moonboots' && pc.fx.moon) || (id === 'wallring' && pc.fx.noclip) || (id === 'gill' && pc.fx.gill) || (id === 'tracker' && this.track) || (id === 'drone' && this.droneT > 0) || (id === 'mitts' && pc.fx.mitts) || (id === 'critter' && pc.fx.critter))); }
  openPocket() { G.ui.choose('Tiko\'s Gadget Pocket', `${GD.length} gadgets. Pick one: it goes in hotbar slot ${G.ui.slot + 1}. Aiming gadgets fire with a click (or R); the rest work straight away.`, GD.map((g) => ({ icon: g.icon, label: g.name, sub: g.desc, cat: g.cat, badge: this.isActive(g.id) ? 'On' : null, fn: () => this.equip(g.id) })), { name: 'pocket', closeKey: 'KeyQ', search: true }); }
  equip(id) { const hb = G.save.hotbar, at = hb.indexOf(id), slot = G.ui.slot, g = this.byId[id]; if (at >= 0 && at !== slot) hb[at] = hb[slot]; hb[slot] = id; G.persist(); G.ui.hotbar(); if (g.aim) G.toast(`${g.icon} ${g.name} ready — aim and click (or press R).`); else this.use(id, false); }
  useSlot(alt) { const id = G.save.hotbar[G.ui.slot]; if (!id || !this.byId[id]) { G.toast('That slot is empty — press Q to open the pocket.'); return; } this.use(id, alt); }
  use(id, alt = false) {
    const g = this.byId[id], pc = G.pc; if (!g || !pc) return;
    if ((G.player.vehicle || pc.mount) && !g.inCar) { G.toast('Get out first (E).'); return; }
    if (pc.state === 'statue' || pc.state === 'sleep' || pc.state === 'stun') { G.toast(`${pc.name} can't do that right now.`); return; }
    if (pc.state !== 'idle' && pc.state !== 'float') pc.setState('idle');
    const aim = G.player.aim(); const ok = g.use({ pc, target: aim.actor, point: aim.point.clone(), alt });
    if (ok !== false) { G.sfx(g.sfx || 'use'); G.bus.emit('gadget', id); }
    G.ui.hotbar();
  }
  serve(names) { const pc = G.pc, c = ahead(1.8), y = G.ground(c.x, c.z, pc.pos.y + 0.5); const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd94848 })); mat.position.set(c.x, y + 0.03, c.z); mat.rotation.y = pc.yaw; G.scene.add(mat); this.temps.push({ obj: mat, t: 120, era: G.era }); names.forEach((n, i) => { const e = FOODS.find((f) => f[0] === n); const k = names.length > 1 ? i / names.length * TAU : 0, r = names.length > 1 ? 0.6 : 0; food(e ? e[1] : '🍽️', n, c.x + Math.cos(k) * r, c.z + Math.sin(k) * r, y + 0.6 + i * 0.05); }); poof({ pos: { x: c.x, y, z: c.z }, height: 1, size: 1 }, [0xffffff, 0xffe9a8]); G.sfx('pop'); G.bus.emit('gadget', 'feast'); G.bus.emit('serve', names); }
  summon(a) { const pc = G.pc, p = freeSpot(ahead(2).x, ahead(2).z); if (a.ai.mode === 'scripted') { G.toast(`${a.name} is busy right now.`); return; } a.era = pc.era; a.teleport(p.x, p.z); a.yaw = pc.yaw + Math.PI; a.ai.pause = 4; a.setState('idle'); poof(a); a.say(pick(['You rang?', 'Whoa, how did I get here?', 'Hi!', '…I was in the bath!']), 3); G.sfx('pop'); G.bus.emit('gadget', 'bell'); G.bus.emit('summon', a); }
  portal(p) { const pc = G.pc, a = ahead(3), ay = G.ground(a.x, a.z, pc.pos.y + 0.5), mk = (x, y, z, yaw) => { const g = new THREE.Group(); g.add(glowMesh(new THREE.TorusGeometry(1.15, 0.13, 8, 28), 0x9b5de5, 1)); g.add(glowMesh(new THREE.CircleGeometry(1.05, 24), 0xc8b6ff, 0.45)); g.position.set(x, y + 1.35, z); g.rotation.y = yaw; G.scene.add(g); return g; }; const by = p.y > 0.5 ? p.y : G.floor(p.x, p.z); this.portals.push({ era: G.era, t: 90, cool: 0.8, a: { x: a.x, y: ay, z: a.z, m: mk(a.x, ay, a.z, pc.yaw) }, b: { x: p.x, y: by, z: p.z, m: mk(p.x, by, p.z, pc.yaw) } }); G.sfx('warp'); G.toast('Warp Hoop open for 90 seconds. Walk through!'); G.bus.emit('gadget', 'hoop'); }
  openTime() {
    const icons = { past: '🦕', present: '🏡', future: '🚀' }, items = [];
    for (const k of ['past', 'present', 'future']) { const e = G.eras[k]; if (!e) continue; items.push({ icon: icons[k], label: e.label, sub: e.year, cat: 'Travel there', badge: k === G.era ? 'You are here' : null, fn: () => { if (k === G.era) G.toast('You are already here.'); else { G.bus.emit('gadget', 'timepod'); G.travel(k); } } }); }
    for (const k of ['past', 'present', 'future']) { const e = G.eras[k]; if (!e || k === G.era) continue; items.push({ icon: '📺', label: 'Peek at ' + e.label, sub: 'Chrono Screen: a look without leaving', cat: 'Chrono Screen', fn: () => this.peek(k) }); }
    G.ui.choose('Time Pod', 'Tiko and anyone following you come too.', items, { search: false });
  }
  peek(k) { const old = G.era, e = G.eras[k], c = e.spawn, cy = e.heightAt(c.x, c.z); let t = 0, done = false; G.mode = 'menu'; G.ui.fade(() => { G.setEra(k); G.ui.banner('Chrono Screen', `${e.label} · ${e.year}`); G.player.camOverride = (cam, dt) => { t += dt; const a = t * 0.45, rad = k === 'future' ? 170 : 75, hgt = k === 'future' ? 130 : 40; cam.position.set(c.x + Math.cos(a) * rad, cy + hgt, c.z + Math.sin(a) * rad); cam.lookAt(c.x, cy + (k === 'future' ? 40 : 8), c.z); if (t > 7.5 && !done) { done = true; G.ui.fade(() => { G.setEra(old); G.player.camOverride = null; G.mode = 'free'; }, true, 500); } }; }, true, 500); }
  ride(a) { const pc = G.pc; pc.mount = a; a.rider = pc; a.ai.wasR = a.ai.mode; a.ai.mode = 'scripted'; a.move.x = a.move.z = 0; pc.setState('idle'); G.toast(`Riding ${a.name}! WASD to steer, F to hop off.`); G.bus.emit('ride', a); }
  dismount() { const pc = G.pc, a = pc.mount; if (!a) return; pc.mount = null; a.rider = null; a.ai.mode = 'follow'; a.ai.follow = pc; a.move.x = a.move.z = 0; pc.teleport(a.pos.x + Math.cos(a.yaw) * (a.radius * a.size + 1.2), a.pos.z - Math.sin(a.yaw) * (a.radius * a.size + 1.2)); }
  tidy() { for (const p of G.props.slice()) removeProp(p); for (const s of this.spawned.slice()) unbuild(s); for (const c of this.clones) { poof(c); c.dispose(); } this.clones.length = 0; for (const t of this.temps) G.scene.remove(t.obj); this.temps.length = 0; for (const p of this.portals) { G.scene.remove(p.a.m); G.scene.remove(p.b.m); } this.portals.length = 0; this.pads.length = 0; this.tidyBatch2(); for (const v of G.vehicles.slice()) if (v.spawned && !v.driver) v.dispose(); }

  // ---------------- batch 2 helpers ----------------
  openDoorMenu() {
    const pc = G.pc, era = G.cur(), items = [];
    if (G.map && G.map.wp && G.map.wp.era === G.era) { const w = G.map.wp; items.push({ icon: '📍', label: 'My map marker', sub: w.label, cat: 'Marker', fn: () => this.doorTo({ x: w.x, z: w.z }, w.label) }); }
    const places = G.map ? G.map.places() : Object.entries(era.pois).map(([k, p]) => ({ k, p, icon: '📍', name: k }));
    for (const pl of places) items.push({ icon: pl.icon, label: pl.name, cat: 'Places', fn: () => this.doorTo(pl.p, pl.name) });
    for (const a of Object.values(G.cast)) if (a !== pc && a.era === G.era && !a.hidden) items.push({ icon: a.emoji, label: `Next to ${a.name}`, cat: 'Friends', fn: () => { const p = freeSpot(a.pos.x + Math.sin(a.yaw) * 2.2, a.pos.z + Math.cos(a.yaw) * 2.2); this.doorTo({ x: p.x, z: p.z, y: a.pos.y }, a.name); } });
    G.ui.choose('Elsewhere Door', 'Where should the door open?', items, { search: true });
  }
  doorMesh(x, y, z, rot) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.7 }), paint = new THREE.MeshStandardMaterial({ color: 0x2a7f8f, roughness: 0.45 }), inset = new THREE.MeshStandardMaterial({ color: 0x35a0b2, roughness: 0.45 }), brass = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.25, metalness: 0.9 });
    const add = (parent, geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; parent.add(m); return m; };
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.1, 2.25, 0.16), wood, s * 0.5, 1.125, 0);
    add(g, new THREE.BoxGeometry(1.1, 0.12, 0.16), wood, 0, 2.28, 0); add(g, new THREE.BoxGeometry(1.2, 0.05, 0.36), wood, 0, 0.025, 0);
    const glow = glowMesh(new THREE.PlaneGeometry(0.9, 2.1), 0xd8f3ff, 0.0); glow.position.set(0, 1.1, 0); g.add(glow);
    const hinge = new THREE.Group(); hinge.position.set(-0.45, 0, 0.02); g.add(hinge);
    add(hinge, new THREE.BoxGeometry(0.9, 2.12, 0.06), paint, 0.45, 1.11, 0);
    for (const s of [-1, 1]) for (const py of [0.62, 1.55]) add(hinge, new THREE.BoxGeometry(0.62, py > 1 ? 0.7 : 0.62, 0.02), inset, 0.45, py, s * 0.035);
    for (const s of [-1, 1]) add(hinge, new THREE.SphereGeometry(0.045, 10, 8), brass, 0.81, 1.0, s * 0.07);
    G.scene.add(g); return { g, hinge, glow, open: 0, dx: Math.sin(rot), dz: Math.cos(rot) };
  }
  doorTo(p, label) {
    const pc = G.pc, a = ahead(2.4), ay = G.ground(a.x, a.z, pc.pos.y + 0.5), by = p.y != null && p.y > 0.5 ? p.y : G.floor(p.x, p.z);
    const A = this.doorMesh(a.x, ay, a.z, pc.yaw + Math.PI), B = this.doorMesh(p.x, by, p.z, pc.yaw);
    this.portals.push({ door: true, era: G.era, t: 300, cool: 0.8, a: { x: a.x, y: ay, z: a.z, m: A.g, d: A }, b: { x: p.x, y: by, z: p.z, m: B.g, d: B } });
    poof({ pos: { x: a.x, y: ay, z: a.z }, height: 2, size: 1 }, [0x9bf6ff, 0xffffff]); G.sfx('warp'); G.toast(`🚪 The door opens onto: ${label}. Walk through it!`); G.bus.emit('gadget', 'door');
  }
  doorAnim(p, dt, pc) {
    for (const end of [p.a, p.b]) {
      const d = end.d, near = p.era === G.era && Math.hypot(pc.pos.x - end.x, pc.pos.z - end.z) < 3.2, want = near ? 1.55 : 0;
      d.open = damp(d.open, want, 6, dt); d.hinge.rotation.y = -d.open; d.glow.material.opacity = Math.min(0.85, d.open * 0.6);
    }
  }
  critterTo(kind) {
    const pc = G.pc, src = kind === 'dog' ? G.cast.maru : kind === 'cat' ? G.cast.kuro : G.actors.find((a) => a.id === 'runner1');
    if (!src) { G.toast('No critter like that around right now.'); return; }
    pc.fx.trueLook ??= pc.look; pc.setLook(src.look); pc.fx.critter = kind; poof(pc, [0xffd166, 0xffffff]); G.toast(kind === 'dino' ? 'Rawr! You are a little dinosaur.' : kind === 'dog' ? 'Woof! You are a dog.' : 'Meow. You are a cat.'); G.bus.emit('gadget', 'critter');
  }
  openCritter() {
    const pc = G.pc, items = [{ icon: '🐕', label: 'A dog', fn: () => this.critterTo('dog') }, { icon: '🐈‍⬛', label: 'A cat', fn: () => this.critterTo('cat') }];
    if (G.actors.some((a) => a.id === 'runner1')) items.push({ icon: '🦖', label: 'A little dinosaur', fn: () => this.critterTo('dino') });
    if (pc.fx.trueLook) items.unshift({ icon: '↩️', label: 'Back to myself', fn: () => { pc.setLook(pc.fx.trueLook); delete pc.fx.trueLook; delete pc.fx.critter; delete pc.fx.disguise; poof(pc); } });
    G.ui.choose('Critter Cracker', 'What do you want to be?', items, { search: false });
  }
  drone() {
    if (this.droneT > 0) { this.droneT = 0; return; }
    this.droneT = 20; G.toast('🛰️ Drone up! Keep walking — the view follows you.');
    this.droneCam = (cam) => { const sub = G.player.vehicle || G.pc, y = G.player.yaw; cam.position.set(sub.pos.x + Math.sin(y) * 18, sub.pos.y + 46, sub.pos.z + Math.cos(y) * 18); cam.lookAt(sub.pos.x, sub.pos.y, sub.pos.z); };
    G.player.camOverride = this.droneCam;
  }
  raincloud(a) {
    const old = this.rains.find((r) => r.a === a); if (old) { old.t = 15; return; }
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 1 });
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), mat); m.position.set((k - 1.5) * 0.24, (k % 2) * 0.08, (k % 2 ? 0.08 : -0.06)); m.scale.set(1.2, 0.8, 1); g.add(m); }
    const n = 28, pos = new Float32Array(n * 6), seed = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fc4e8, transparent: true, opacity: 0.8 })); rain.frustumCulled = false; g.add(rain);
    g.position.y = a.height + 0.75; a.root.add(g);
    this.rains.push({ a, g, pos, seed, n, t: 15 }); a.say(pick(['Hey! Why is it raining on ME?', 'Not again…', 'Who brought the cloud?!']), 3); a.ai.pause = 2;
  }
  treasure() {
    const era = G.cur(), pc = G.pc, B = (era.bounds || 340) - 25;
    if (this.chest && this.chest.era === G.era && !this.chest.found) { G.map && G.map.setWaypoint(this.chest.x, this.chest.z, G.era, 'Treasure'); G.toast(`The chest is ${Math.round(Math.hypot(this.chest.x - pc.pos.x, this.chest.z - pc.pos.z))} m away.`); return; }
    let spot = null;
    for (let i = 0; i < 60 && !spot; i++) { const a = Math.random() * TAU, r = 60 + Math.random() * 120, x = pc.pos.x + Math.cos(a) * r, z = pc.pos.z + Math.sin(a) * r; if (Math.abs(x) > B || Math.abs(z) > B) continue; const h = era.heightAt(x, z); if (era.waterAt && era.waterAt(x, z) > h) continue; if (era.colliders.inside(x, h + 0.6, z) || era.colliders.inside(x + 1, h + 0.6, z) || era.colliders.inside(x - 1, h + 0.6, z)) continue; if (G.floor(x, z) > h + 0.1) continue; spot = { x, z, h }; }
    if (!spot) { G.toast('The map is blank… try somewhere more open.'); return false; }
    const s = build((b) => {
      b.box('wood', 0, 0.28, 0, 0.9, 0.52, 0.6, 0x8a5a2b); b.box('wood', 0, 0.62, 0, 0.92, 0.18, 0.62, 0x7a4a22);
      for (const sx of [-0.3, 0.3]) b.box('metal', sx, 0.4, 0, 0.06, 0.78, 0.64, 0xd4a017); b.box('metal', 0, 0.42, 0.31, 0.14, 0.18, 0.04, 0xd4a017);
      b.flat('dirt', 0, 0.02, 0, 2.2, 2.0, 0xc9a37a); b.solid(0, 0, 0.9, 0.6, 0, 0.72, 'chest');
    }, { x: spot.x, z: spot.z });
    const it = { id: 'chest', x: spot.x, y: spot.h + 0.5, z: spot.z, r: 2.4, label: 'Open the treasure chest', icon: '💰', fn: () => {
      const c = this.chest; if (!c || c.found) return; c.found = true; const i = era.interact.indexOf(it); if (i >= 0) era.interact.splice(i, 1);
      const gain = 25 + ((Math.random() * 4) | 0) * 5; G.save.coins += gain; G.persist(); G.ui.refresh(); G.sfx('cheer'); burst(spot.x, spot.h + 1, spot.z, { colors: [0xffd166, 0xffb400, 0xffffff], n: 120, speed: 7, grav: 6, life: 2 });
      G.ui.banner('Treasure!', `+${gain} 🪙`); if (G.map) G.map.clearWaypoint(); setTimeout(() => unbuild(s), 2500); G.bus.emit('treasure');
    } };
    era.interact.push(it); this.chest = { era: G.era, x: spot.x, z: spot.z, s, it, found: false };
    if (G.map) G.map.setWaypoint(spot.x, spot.z, G.era, 'Treasure'); G.toast(`🗺️ X marks the spot — ${Math.round(Math.hypot(spot.x - pc.pos.x, spot.z - pc.pos.z))} m away. Follow the blue beam.`);
  }
  birds() {
    if (this.flock) { this.flock.t = 40; return; }
    const P = [0, 0, 0.18, -0.5, 0, -0.05, 0, 0, -0.12, 0.5, 0, -0.05, 0, 0, 0.18, 0, 0, -0.12], geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.computeVertexNormals();
    const n = 26, im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b2f36, side: THREE.DoubleSide, roughness: 0.8 }), n); im.frustumCulled = false; G.scene.add(im);
    const b = []; for (let i = 0; i < n; i++) b.push({ a: Math.random() * TAU, r: 5 + Math.random() * 9, h: 7 + Math.random() * 7, v: (0.5 + Math.random() * 0.6) * (i % 4 ? 1 : -1), ph: Math.random() * 6, s: 0.8 + Math.random() * 0.5 });
    const c = G.pc.pos.clone(); this.flock = { im, b, t: 40, era: G.era, c, d: new THREE.Object3D() };
  }
  campfire() {
    const pc = G.pc, c = ahead(2.8), h = G.ground(c.x, c.z, pc.pos.y + 0.5), R0 = rng((c.x * 31 + c.z * 7) | 0);
    const s = build((b) => {
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; b.ico('rock', Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75, 0.2, 0xffffff, 1.2, 0.7, 1, 0, R0() * 6); }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; b.cyl('bark', 0, 0.16, 0, 0.07, 0.08, 1.0, 0xffffff, 6, Math.PI / 2, 0, a); }
      for (const s2 of [-1, 1]) { b.cyl('bark', s2 * 2.1, 0.22, 0, 0.22, 0.22, 1.7, 0xffffff, 8, Math.PI / 2, 0, 0.1 * s2); b.solid(s2 * 2.1, 0, 0.5, 1.7, 0, 0.44, 'log'); }
      b.flat('dirt', 0, 0.015, 0, 1.6, 1.6, 0x5a4636);
      b.solid(0, 0, 1.4, 1.4, 0, 0.5, 'fire', false);
    }, { x: c.x, z: c.z, grow: false });
    const g = new THREE.Group(); g.position.set(c.x, h, c.z); const flames = [];
    for (const [col, r, ht, ox] of [[0xff5a1f, 0.32, 0.95, 0], [0xffa31a, 0.22, 0.75, 0.08], [0xffe066, 0.13, 0.5, -0.05]]) { const m = glowMesh(new THREE.ConeGeometry(r, ht, 8, 1, true), col, 0.9); m.position.set(ox, 0.2 + ht / 2, 0); g.add(m); flames.push(m); }
    const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,170,80,.75)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); pool.position.y = 0.06; g.add(pool);
    G.scene.add(g); this.fires.push({ g, flames, pool, era: G.era, t: 300, s }); pc.say('Toasty!', 2);
  }
  updateBatch2(dt, pc) {
    // propeller caps spin (faster while actually flying)
    for (const a of this.caps) { const c = a.fx.capMesh; if (!c) { this.caps.delete(a); continue; } c.prop.rotation.y += dt * (a.fly && (Math.hypot(a.vel.x, a.vel.z) + Math.abs(a.vel.y)) > 0.6 ? 46 : 24); c.g.position.y = a.height - 0.05; }
    // drone view
    if (this.droneT > 0) { this.droneT -= dt; if (this.droneT <= 0 || G.player.camOverride !== this.droneCam) { this.droneT = 0; if (G.player.camOverride === this.droneCam) G.player.camOverride = null; G.toast('Drone landed.'); } }
    // mighty mitts
    if (pc.fx.mitts) {
      for (const a of near(1.25 * Math.max(1, pc.size))) if (a.thrown <= 0 && !(a.ai.mode === 'follow' && a.ai.follow === pc)) { const dx = a.pos.x - pc.pos.x, dz = a.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1; fling(a, dx / d * 15, 8, dz / d * 15, 1.6); a.say(pick(['Waaah!', 'So strong!', 'Put me down!']), 2); G.player.shake = 0.2; G.sfx('thud', 0.06); }
      for (const v of G.vehicles) { if (v.era !== G.era || v.driver || (v.shoveT || 0) > G.t) continue; const dx = v.pos.x - pc.pos.x, dz = v.pos.z - pc.pos.z; if (Math.hypot(dx, dz) > 2.7 || Math.hypot(pc.vel.x, pc.vel.z) < 1) continue; const fwd = Math.sin(v.yaw) * pc.vel.x + Math.cos(v.yaw) * pc.vel.z; v.speed = Math.sign(fwd || 1) * 9; v.yaw += (Math.random() - 0.5) * 0.4; v.shoveT = G.t + 1; G.player.shake = 0.3; G.sfx('thud', 0.1); }
    }
    // raincloud pals
    for (let i = this.rains.length - 1; i >= 0; i--) {
      const r = this.rains[i]; r.t -= dt; const vis = r.a.era === G.era && !r.a.hidden; r.g.visible = vis;
      if (r.t <= 0 || !G.actors.includes(r.a)) { r.a.root.remove(r.g); this.rains.splice(i, 1); continue; }
      r.g.position.y = r.a.height + 0.75; if (!vis) continue; const p = r.pos, s = r.seed, top = -0.1, len = r.a.height + 0.6;
      for (let k = 0; k < r.n; k++) { const x = (s[k * 3] - 0.5) * 0.8, z = (s[k * 3 + 2] - 0.5) * 0.5, y = top - ((s[k * 3 + 1] * len + G.t * 6) % len); p[k * 6] = x; p[k * 6 + 1] = y; p[k * 6 + 2] = z; p[k * 6 + 3] = x; p[k * 6 + 4] = y - 0.18; p[k * 6 + 5] = z; }
      r.g.children[r.g.children.length - 1].geometry.attributes.position.needsUpdate = true;
    }
    // bird flock
    const f = this.flock;
    if (f) {
      f.t -= dt; const gone = f.t <= 0 || f.era !== G.era; f.im.visible = f.era === G.era;
      if (gone && f.t < -4 || f.era !== G.era) { G.scene.remove(f.im); f.im.geometry.dispose(); this.flock = null; }
      else {
        f.c.lerp(pc.pos, 1 - Math.exp(-0.8 * dt)); const leave = f.t < 0 ? -f.t : 0;
        for (let i = 0; i < f.b.length; i++) { const b = f.b[i]; b.a += b.v * dt / Math.max(0.6, b.r / 8); const r = b.r + leave * 12, x = f.c.x + Math.cos(b.a) * r, z = f.c.z + Math.sin(b.a) * r, y = f.c.y + b.h + Math.sin(G.t * 1.3 + b.ph) * 1.2 + leave * 8; f.d.position.set(x, y, z); f.d.rotation.set(0, -b.a + (b.v > 0 ? 0 : Math.PI), 0); const flap = 0.35 + Math.abs(Math.sin(G.t * 9 + b.ph)); f.d.scale.set(b.s, b.s * flap, b.s); f.d.updateMatrix(); f.im.setMatrixAt(i, f.d.matrix); }
        f.im.instanceMatrix.needsUpdate = true;
      }
    }
    // campfires
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fi = this.fires[i]; fi.t -= dt; fi.g.visible = fi.era === G.era;
      if (fi.t <= 0) { G.scene.remove(fi.g); unbuild(fi.s); this.fires.splice(i, 1); continue; }
      if (!fi.g.visible) continue;
      fi.flames.forEach((m, k) => { m.scale.set(1 + Math.sin(G.t * (11 + k * 3) + k) * 0.12, 1 + Math.sin(G.t * (13 + k * 2)) * 0.22, 1 + Math.cos(G.t * (9 + k)) * 0.12); m.rotation.y += dt * (2 + k); });
      fi.pool.material.opacity = 0.75 + Math.sin(G.t * 17) * 0.1 + G.env.night * 0.25;
    }
  }
  tidyBatch2() {
    for (const r of this.rains) r.a.root.remove(r.g); this.rains.length = 0;
    if (this.flock) { G.scene.remove(this.flock.im); this.flock = null; }
    for (const fi of this.fires) { G.scene.remove(fi.g); if (this.spawned.includes(fi.s)) unbuild(fi.s); } this.fires.length = 0;
    if (this.chest && !this.chest.found) { const e = G.eras[this.chest.era], i = e.interact.indexOf(this.chest.it); if (i >= 0) e.interact.splice(i, 1); if (G.map) G.map.clearWaypoint(); } this.chest = null;
  }
  // ---------------- wish box ----------------
  openWish() {
    const body = G.ui.open('wish', 'Wishing Star', 'Type anything you want and press Enter.', { closeKey: null });
    body.innerHTML = '<div class="wish"><input id="wishIn" placeholder="I wish for…" maxlength="60" autocomplete="off"><button class="btn" id="wishGo">Wish!</button></div><div class="chips"></div>';
    const inp = body.querySelector('#wishIn'), go = () => { const v = inp.value.trim(); if (!v) return; G.ui.close(); this.wish(v); };
    inp.addEventListener('keydown', (e) => { if (e.code === 'Enter') go(); e.stopPropagation(); if (e.code === 'Escape') G.ui.close(); }); body.querySelector('#wishGo').onclick = go;
    for (const s of ['a supercar', 'pizza', 'let me fly', 'make it snow', 'night with fireworks', 'make me giant', 'a rocket', 'take me to the park', 'bring everyone here', 'lots of coins', 'be Maru', 'go to the future']) { const b = document.createElement('button'); b.textContent = s; b.onclick = () => { G.ui.close(); this.wish(s); }; body.querySelector('.chips').appendChild(b); }
    setTimeout(() => inp.focus(), 40);
  }
  wish(text) {
    const t = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\s'-]/gu, ' ') + ' ', pc = G.pc, has = (re) => re.test(t), done = (msg) => { G.toast('✨ ' + msg); G.sfx('cheer'); burst(pc.pos.x, pc.pos.y + pc.height * pc.size + 0.5, pc.pos.z, { colors: [0xfff3a0, 0xffffff, 0xffd166], n: 50, speed: 5, grav: 2 }); G.bus.emit('wish', text); };
    const use = (id, alt) => { const g = this.byId[id]; const aim = G.player.aim(); g.use({ pc, target: null, point: (g.aim && !g.tgt) ? new THREE.Vector3(ahead(5).x, G.ground(ahead(5).x, ahead(5).z, pc.pos.y + 1), ahead(5).z) : aim.point.clone(), alt }); G.bus.emit('gadget', id); };
    // become someone
    const who = Object.values(G.cast).find((a) => t.includes(' ' + a.name.toLowerCase().split(' ').pop() + ' ') || t.includes(' ' + a.id.toLowerCase() + ' '));
    if (has(/ (be|become|turn into|play as|i am|switch to) /) && who) { G.player.control(who); return done(`You are ${who.name}.`); }
    if (has(/anywhere door|elsewhere door|magic door| door /)) { this.openDoorMenu(); return done('Where should the door open?'); }
    if (has(/copter|propeller|helicopter|flying hat|fly cap/)) { if (!pc.fx.beanie) use('beanie'); return done('Propeller spinning!'); }
    { const m = t.match(/ (?:turn me into|become|be|make me) (?:a |an )?(dog|puppy|cat|kitten|dino|dinosaur) /); if (m) { this.critterTo(/dog|puppy/.test(m[1]) ? 'dog' : /cat|kitten/.test(m[1]) ? 'cat' : 'dino'); return done('Transformation complete!'); } }
    if (has(/drone|bird.?s eye|aerial|from above|from the sky/)) { this.drone(); return done('Drone up!'); }
    if (has(/slow.?mo|slow motion|slow everything/)) { use('slowmo'); return done('Slooow…'); }
    if (has(/treasure|buried|chest/)) { this.treasure(); return done('A treasure map!'); }
    if (has(/campfire|bonfire|camp fire/)) { this.campfire(); return done('A campfire.'); }
    if (has(/stair|ladder|steps to the sky/)) { use('stairs'); return done('Up we go.'); }
    if (has(/ birds| flock/)) { this.birds(); return done('Tweet tweet.'); }
    if (has(/fortune|my future/)) { use('fortune'); return done('The cookie has spoken.'); }
    if (has(/strong|strength|muscles/)) { use('mitts'); return done('Mighty!'); }
    if (has(/shadow/)) { use('shadow'); return done('Snip!'); }
    // a gadget by name
    const gd = GD.find((g) => t.includes(g.name.toLowerCase()));
    if (gd) { this.use(gd.id); return done(gd.name + '!'); }
    // time travel
    if (has(/futur|2226|tomorrow|robot city/)) { if (G.eras.future) G.travel('future'); return done('Off to the future!'); }
    if (has(/dino|prehistor|jurassic|the past|long ago|t-?rex/)) { if (G.eras.past) G.travel('past'); return done('Dinosaurs live 100 million years ago — off we go!'); }
    if (has(/present|today|back to (my|our) time/)) { G.travel('present'); return done('Back to today.'); }
    // places
    const places = [[/ (my |kenta'?s? )?(home|house) | bedroom | my room /, 'kentaHome'], [/park|playground|swing|slide/, 'park'], [/school|class/, 'school'], [/shop|bakery|candy|store|market|noodle/, 'shops'], [/mansion|riku'?s/, 'mansion'], [/empty lot|vacant|the lot/, 'lot'], [/baseball|ballpark|riverside|river|ground/, 'field'], [/bridge/, 'bridge'], [/hill|shrine|lookout|mountain/, 'hill'], [/levee|embankment/, 'levee'], [/mira'?s/, 'miraHome'], [/goro'?s/, 'goroHome'], [/sora'?s/, 'soraHome'], [/depot|gadget shop/, 'depot'], [/nest/, 'nest'], [/time ?(pod|machine)/, 'timePod']];
    if (has(/ (go|take|bring me|warp|teleport|visit|travel) /) || has(/^ (to|at) /)) for (const [re, k] of places) if (re.test(t) && G.cur().pois[k]) { const p = G.cur().pois[k]; G.ui.fade(() => pc.teleport(p.x, p.z, p.y > 0.5 ? p.y : undefined), false, 250); return done('There you go.'); }
    // weather + time of day
    if (has(/snow|blizzard|winter/)) { G.env.setWeather('snow'); return done('Let it snow!'); }
    if (has(/storm|thunder|lightning/)) { G.env.setWeather('storm'); G.env.lightning(); return done('A storm rolls in.'); }
    if (has(/rain|drizzle|monsoon/)) { G.env.setWeather('rain'); return done('Here comes the rain.'); }
    if (has(/fog|mist/)) { G.env.setWeather('fog'); return done('Foggy!'); }
    if (has(/sunny|sunshine|clear sky|good weather|stop (the )?rain/)) { G.env.setWeather('clear'); return done('Blue skies.'); }
    const night = has(/night|stars|dark|midnight/), fw = has(/firework|cracker|diwali/);
    if (night) G.env.setTime(22, 8); else if (has(/sunset|evening|dusk/)) G.env.setTime(18, 6); else if (has(/sunrise|dawn/)) G.env.setTime(6.3, 6); else if (has(/ day |morning|daytime|noon/)) G.env.setTime(10, 8);
    if (fw) { setTimeout(() => use('fireworks'), night ? 1600 : 0); return done('Fireworks!'); }
    if (night || has(/sunset|evening|dusk|sunrise|dawn| day |morning|daytime|noon/)) return done('The sky turns.');
    // body
    if (has(/normal size|regular size|my size/)) { pc.sizeT = 1; return done('Back to normal size.'); }
    if (has(/giant|huge|enormous|gigantic|titan/)) { pc.sizeT = clamp(pc.sizeT * 4, 0.08, 16); return done('You are a giant!'); }
    if (has(/ big|bigger|tall|grow/)) { pc.sizeT = clamp(pc.sizeT * 2, 0.08, 16); return done('Bigger!'); }
    if (has(/tiny|small|shrink|mini|ant/)) { pc.sizeT = clamp(pc.sizeT * 0.25, 0.08, 16); return done('Teeny tiny.'); }
    if (has(/ fly|flying|wings|float/)) { if (!pc.fx.beanie) use('beanie'); return done('You can fly. Space up, C down.'); }
    if (has(/fast|speed|quick/)) { use('sneakers'); return done('Zoom!'); }
    if (has(/invisible|vanish|disappear/)) { if (!pc.fx.cloak) use('cloak'); return done('Now you see me…'); }
    if (has(/jump|bounce/)) { use('moonboots'); return done('Moon jumps!'); }
    // things from gadgets
    if (has(/supercar|sports car| car |racecar|ferrari|lambo|vehicle/)) { use('carcap'); return done('One supercar.'); }
    if (has(/coin|rich|gold|pocket money|rupee|yen/)) { use('coins'); return done('It\'s raining coins!'); }
    if (has(/rainbow/)) { use('rainbow'); return done('A rainbow.'); }
    if (has(/everyone|everybody|all (my )?friends|party/)) { use('horn'); return done('Party time!'); }
    if (who) { this.summon(who); return done(`${who.name} is here.`); }
    if (has(/ (dog|puppy) /) && G.cast.maru) { this.summon(G.cast.maru); return done('Woof!'); }
    if (has(/ (cat|kitten|kitty) /) && G.cast.kuro) { this.summon(G.cast.kuro); return done('Meow.'); }
    if (has(/snowman/)) { use('snowman'); return done('A snowman.'); }
    if (has(/ tree|forest|woods/)) { for (let i = 0; i < (has(/forest|woods/) ? 8 : 1); i++) { const an = Math.random() * TAU, r = 4 + i * 1.5; this.byId.seeds.use({ pc, point: new THREE.Vector3(pc.pos.x + Math.cos(an) * r, 0, pc.pos.z + Math.sin(an) * r) }); } return done('Green fingers.'); }
    if (has(/flower|garden/)) { use('flowers'); return done('Flowers!'); }
    if (has(/cottage|hut|a house|new house|build .*house/)) { use('house'); return done('A cottage.'); }
    if (has(/trampoline/)) { use('tramp'); return done('Boing.'); }
    if (has(/cloud/)) { use('cloud'); return done('A cloud to stand on.'); }
    if (has(/clone|twin|copy of me/)) { use('mirror'); return done('Hello, me.'); }
    if (has(/robot/)) { use('robo'); return done('Robo-Buddies!'); }
    if (has(/confetti|celebrate/)) { use('confetti'); return done('Hooray!'); }
    if (has(/clean|tidy|remove everything/)) { this.tidy(); return done('All tidy.'); }
    if (has(/feast|hungry|food|dinner|lunch|breakfast|snack/) && !FOODS.some((f) => t.includes(f[0]))) { this.serve(['ramen', 'sushi', 'pizza', 'curry', 'cake', 'watermelon', 'dango', 'juice']); return done('Dig in!'); }
    // any food / object word, or a literal emoji
    const hits = [], c = ahead(2); let rest = t;
    for (const [k, e] of FOODS) if (rest.includes(k)) { hits.push(() => food(e, k, c.x + rnd(-0.7, 0.7), c.z + rnd(-0.7, 0.7))); rest = rest.replace(k, ' '); }
    for (const [k, e] of THINGS) if (rest.includes(' ' + k)) { hits.push(() => thing(e, k, c.x + rnd(-1, 1), c.z + rnd(-1, 1))); rest = rest.replace(k, ' '); }
    for (const e of text.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) || []) hits.push(() => thing(e, 'surprise', c.x + rnd(-1, 1), c.z + rnd(-1, 1)));
    if (hits.length) { const many = (t.match(/ (lots|many|tons|hundred|loads|bunch) /) ? 8 : +(t.match(/ (\d+) /) || [0, 1])[1] || 1); for (let i = 0; i < clamp(many, 1, 20); i++) hits.slice(0, 6).forEach((f) => f()); return done('Wish granted!'); }
    // anything else: a present with the wish written on it
    prop({ emoji: '🎁', x: c.x, y: pc.pos.y + 2.5, z: c.z, s: 0.9, label: 'Open the present', use: (p) => { burst(p.pos.x, p.pos.y + 0.5, p.pos.z, { colors: BRIGHT, n: 80, speed: 7, grav: 5, life: 1.8 }); const tag = prop({ emoji: '✨', x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z, s: 0.8, grav: false, life: 20 }); tag.obj.material.map = wishTexture(text); tag.obj.scale.set(2.6, 0.65, 1); removeProp(p); G.sfx('cheer'); } });
    done(`"${text}" — it's inside the present. Open it!`);
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const pc = G.pc, P = G.player;
    // which gadget is in hand → show the aim ring for targeting gadgets
    const cur = this.byId[G.save.hotbar[G.ui.slot]]; P.showTarget = !!(cur && cur.tgt) && G.mode === 'free'; this.aimT -= dt; if (P.showTarget && this.aimT <= 0) { this.aimT = 0.1; P.aim(); }
    // timed effects
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t -= dt; if (f.t <= 0) { this.fx.splice(i, 1); delete f.a.fx[f.key]; f.off(f.a); } }
    const list = this.fx.filter((f) => f.a === pc).map((f) => ({ label: f.label, t: f.t })); for (const k in TOGGLES) if (pc.fx[k]) list.push({ label: TOGGLES[k] }); if (this.droneT > 0) list.push({ label: '🛰️ Drone view', t: this.droneT }); if (G.slowmo > 0) list.push({ label: '🐢 Slow-mo', t: G.slowmo }); if (pc.fx.critter) list.push({ label: '🐾 Critter' }); if (G.flags.xray) list.push({ label: '🕶️ X-Ray' }); if (G.flags.translate) list.push({ label: '🍮 Animal talk' }); if (pc.size > 1.05 || pc.size < 0.95) list.push({ label: `🔦 Size ${pc.sizeT >= 1 ? pc.sizeT + '×' : '1/' + Math.round(1 / pc.sizeT)}` });
    G.ui.effects(list);
    // bubble shield
    if (pc.fx.bubble) for (const a of near(1.6 * Math.max(1, pc.size))) if (a.thrown <= 0 && !(a.ai.mode === 'follow' && a.ai.follow === pc)) { const dx = a.pos.x - pc.pos.x, dz = a.pos.z - pc.pos.z, d = Math.hypot(dx, dz) || 1; fling(a, dx / d * 8, 4, dz / d * 8); a.say('Boing!', 1.2); G.sfx('pop', 0.05); }
    // particles
    for (let i = this.bursts.length - 1; i >= 0; i--) { const b = this.bursts[i]; b.t += dt; if (b.t >= b.life) { killBurst(b); this.bursts.splice(i, 1); continue; } const p = b.pts.geometry.attributes.position, a = p.array, v = b.vel; for (let k = 0; k < b.n * 3; k += 3) { v[k + 1] -= b.grav * dt; a[k] += v[k] * dt; a[k + 1] += v[k + 1] * dt; a[k + 2] += v[k + 2] * dt; } p.needsUpdate = true; b.pts.material.opacity = 1 - (b.t / b.life) ** 2; }
    // props
    const magnet = pc.fx.magnet;
    for (let i = G.props.length - 1; i >= 0; i--) {
      const p = G.props[i]; p.obj.visible = p.era === G.era; p.life -= dt; if (p.life <= 0) { removeProp(p); continue; } if (p.era !== G.era) continue; if (p.cool > 0) p.cool -= dt;
      if (magnet) { _v.set(pc.pos.x - p.pos.x, pc.pos.y + 0.8 - p.pos.y, pc.pos.z - p.pos.z); const d = _v.length(); if (d < 25 && d > 0.6) { p.vel.addScaledVector(_v, 30 * dt / d); p.rest = false; } }
      if (p.grav && !p.rest) {
        p.vel.y -= 20 * dt; p.pos.addScaledVector(p.vel, dt);
        const g = G.ground(p.pos.x, p.pos.z, p.pos.y + 0.4);
        if (p.pos.y <= g) { p.pos.y = g; if (p.vel.y < -1.5) p.vel.y *= -p.bounce; else p.vel.y = 0; const k = Math.max(0, 1 - 3.5 * dt); p.vel.x *= k; p.vel.z *= k; if (p.vel.lengthSq() < 0.02) { p.vel.set(0, 0, 0); p.rest = true; } }
        const bx = p.pos.x, bz = p.pos.z; if (G.cur().colliders.resolve(p.pos, p.r, p.pos.y + 0.1, p.pos.y + 0.4)) { p.vel.x = (p.pos.x - bx) * 12 - p.vel.x * 0.4; p.vel.z = (p.pos.z - bz) * 12 - p.vel.z * 0.4; }
      }
      if (p.touch) for (const a of (p.emoji === '⚽' ? G.actors : [pc])) { if (a.era !== p.era || a.hidden) continue; const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z, rr = p.r + a.radius * a.size + 0.15; if (dx * dx + dz * dz < rr * rr && p.pos.y - a.pos.y < a.height * a.size + 0.3 && p.pos.y - a.pos.y > -0.6) { p.touch(p, a); break; } }
    }
    // built things: grow in, expire
    for (let i = this.spawned.length - 1; i >= 0; i--) { const s = this.spawned[i]; s.t += dt; if (s.grow && s.t < 1.2) { const k = s.t >= 1 ? 1 : 1 - Math.pow(1 - s.t, 3) * 1 + Math.sin(s.t * 9) * 0.06 * (1 - s.t); s.g.scale.setScalar(k); s.g.position.copy(s.pivot).multiplyScalar(1 - k); } else if (s.grow && s.g.scale.x !== 1) { s.g.scale.setScalar(1); s.g.position.set(0, 0, 0); } if (s.life && s.t > s.life) unbuild(s); }
    for (let i = this.temps.length - 1; i >= 0; i--) { const t = this.temps[i]; t.t -= dt; t.obj.visible = t.era === G.era; if (t.t <= 0) { G.scene.remove(t.obj); this.temps.splice(i, 1); } }
    // trampolines
    for (const pad of this.pads) { if (pad.era !== G.era || !this.spawned.includes(pad.s)) continue; for (const a of G.actors) if (a.era === pad.era && a.onGround && Math.abs(a.pos.y - pad.y) < 0.12 && Math.hypot(a.pos.x - pad.x, a.pos.z - pad.z) < 1.4) { a.vel.y = 17; a.onGround = false; if (a.controlled) G.sfx('pop'); } }
    // warp hoops
    for (let i = this.portals.length - 1; i >= 0; i--) { const p = this.portals[i]; p.t -= dt; p.cool -= dt; const vis = p.era === G.era; p.a.m.visible = p.b.m.visible = vis; if (p.door) this.doorAnim(p, dt, pc); else { p.a.m.children[1].rotation.z += dt * 2; p.b.m.children[1].rotation.z -= dt * 2; } if (p.t <= 0) { G.scene.remove(p.a.m); G.scene.remove(p.b.m); this.portals.splice(i, 1); continue; } if (!vis || p.cool > 0 || P.vehicle) continue; for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) if (Math.hypot(pc.pos.x - from.x, pc.pos.z - from.z) < (p.door ? 0.75 : 1.1) && Math.abs(pc.pos.y - from.y) < 2.5 && (!p.door || from.d.open > 1)) { const fx = p.door ? to.d.dx * 1.7 : Math.sin(pc.yaw) * 1.6, fz = p.door ? to.d.dz * 1.7 : Math.cos(pc.yaw) * 1.6; pc.teleport(to.x + fx, to.z + fz, to.y); if (p.door) { pc.yaw = Math.atan2(to.d.dx, to.d.dz); P.yaw = pc.yaw + Math.PI; to.d.open = 1.55; } p.cool = 1.2; G.sfx('warp'); poof(pc, [0x9b5de5, 0xc8b6ff]); G.bus.emit('warp', 'hoop'); break; } }
    this.updateBatch2(dt, pc);
    // finder beam
    const tr = this.track; if (tr && tr.era === G.era && tr !== pc) { this.beam.visible = true; this.beam.position.set(tr.pos.x, tr.pos.y + 130, tr.pos.z); } else this.beam.visible = false;
  }
}
function wishTexture(text) { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(255,253,246,.96)'; x.beginPath(); x.roundRect(4, 4, 504, 120, 28); x.fill(); x.strokeStyle = '#1f2a44'; x.lineWidth = 6; x.stroke(); x.fillStyle = '#1f2a44'; x.font = 'bold 44px "Trebuchet MS",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✨ ' + text, 256, 66, 470); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function init() {
  S = new Gadgets(); G.gadgets = S;
  const def = ['beanie', 'door', 'size', 'timepod', 'feast', 'carcap', 'critter', 'weather', 'wishstar'];
  if (G.save.hbv !== 2 || !Array.isArray(G.save.hotbar) || !G.save.hotbar.some((id) => S.byId[id])) { G.save.hotbar = def; G.save.hbv = 2; G.persist(); }
  for (const k in G.eras) for (const it of G.eras[k].interact) if (it.id === 'timePod') it.fn = () => S.openTime();
  G.ui.hotbar();
}
