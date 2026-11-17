// Characters: procedural models (kids, grown-ups, robots, four-legged animals) and the Actor
// class that gives every one of them the same physics, animation, AI and speech bubbles.
// Any Actor can be player-controlled — that is how POV switching works.
import * as THREE from 'three';
import { fuse, mat4 } from './build.js';
import { G } from './game.js';
import { clamp, damp, angDamp, angDiff, TAU, pick, rnd } from './util.js';

const C = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const S = (r, w = 10, h = 8, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const glowMats = new Map();
const glowMat = (hex) => { if (!glowMats.has(hex)) glowMats.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return glowMats.get(hex); };

// ------------------------------------------------------------------ humans
export function buildHuman(spec) {
  const sc = (spec.h || 1.3) / 1.3, ad = !!spec.adult, bw = spec.build || 1;
  const hr = ad ? 0.165 : 0.21, ll = ad ? 0.54 : 0.42, th = ad ? 0.44 : 0.38, hipY = ll + 0.02, shY = th - 0.05;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(sc);
  const mesh = (parts) => { const m = new THREE.Mesh(fuse(parts), mat); m.castShadow = true; m.matrixAutoUpdate = false; return m; };
  const skin = spec.skin ?? 0xf6cfa8, hair = spec.hair ?? 0x2b2018;
  // torso (pivot at the hips)
  const torso = new THREE.Group(); torso.position.y = hipY; body.add(torso);
  const tp = [[C(0.132 * bw, 0.15 * bw, th, 10), spec.top, mat4(0, th / 2, 0, 0, 0, 0, 1, 1, 0.78)], [S(0.134 * bw), spec.top, mat4(0, th - 0.015, 0, 0, 0, 0, 1, 0.42, 0.78)], [C(0.052, 0.06, 0.09, 8), skin, mat4(0, th + 0.03, 0)]];
  if (spec.skirt) tp.push([C(0.15 * bw, 0.25 * bw, spec.longSkirt ? 0.42 : 0.2, 10), spec.bottom, mat4(0, spec.longSkirt ? -0.12 : 0.0, 0, 0, 0, 0, 1, 1, 0.85)]);
  else tp.push([C(0.152 * bw, 0.15 * bw, 0.1, 10), spec.bottom, mat4(0, 0.03, 0, 0, 0, 0, 1, 1, 0.8)]);
  if (spec.stripe != null) tp.push([C(0.14 * bw, 0.144 * bw, 0.06, 10), spec.stripe, mat4(0, th * 0.55, 0, 0, 0, 0, 1.012, 1, 0.8)]);
  if (spec.apron != null) tp.push([B(0.2 * bw, 0.34, 0.02), spec.apron, mat4(0, th * 0.36, 0.118 * bw)]);
  if (spec.tie != null) tp.push([B(0.04, 0.2, 0.015), spec.tie, mat4(0, th * 0.6, 0.107 * bw)]);
  if (spec.collar != null) tp.push([C(0.078, 0.095, 0.045, 8), spec.collar, mat4(0, th - 0.002, 0)]);
  if (spec.jacket != null) { tp.push([B(0.09 * bw, th * 0.9, 0.02), spec.jacket, mat4(-0.085 * bw, th * 0.5, 0.1 * bw)]); tp.push([B(0.09 * bw, th * 0.9, 0.02), spec.jacket, mat4(0.085 * bw, th * 0.5, 0.1 * bw)]); }
  if (spec.backpack != null) tp.push([B(0.2, 0.24, 0.1), spec.backpack, mat4(0, th * 0.55, -0.15)]);
  if (spec.number != null) tp.push([B(0.12, 0.14, 0.012), 0xffffff, mat4(0, th * 0.6, -0.118 * bw)]);
  torso.add(mesh(tp));
  // head (pivot at the neck)
  const head = new THREE.Group(); head.position.y = th + 0.05; torso.add(head);
  const cy = hr * 0.9, hp = [];
  hp.push([S(hr, 14, 10), skin, mat4(0, cy, 0, 0, 0, 0, 1, 0.96, 0.94)]);
  for (const s of [-1, 1]) {
    hp.push([S(hr * 0.2, 6, 5), skin, mat4(s * hr * 0.97, cy - 0.01, 0)]);
    hp.push([S(hr * 0.17, 8, 6), 0x2a2320, mat4(s * hr * 0.37, cy + 0.005, hr * 0.83, 0, 0, 0, 0.75, 1.15, 0.4)]);
    hp.push([S(hr * 0.055, 5, 4), 0xffffff, mat4(s * hr * 0.37 + 0.012, cy + 0.035, hr * 0.9)]);
    hp.push([B(hr * 0.32, 0.014, 0.012), hair, mat4(s * hr * 0.37, cy + hr * 0.36, hr * 0.87, 0, 0, s * (spec.brow ?? -0.08))]);
    if (!ad) hp.push([S(hr * 0.15, 6, 5), 0xf4a59c, mat4(s * hr * 0.6, cy - hr * 0.26, hr * 0.74, 0, 0, 0, 1, 0.6, 0.2)]);
  }
  hp.push([S(hr * 0.12, 8, 6), 0xa9463f, mat4(0, cy - hr * 0.43, hr * 0.86, 0, 0, 0, spec.mouthW ?? 1.3, 0.45, 0.3)]);
  hp.push([S(hr * 0.06, 6, 5), 0xe8b48c, mat4(0, cy - hr * 0.1, hr * 0.95)]);
  if (spec.glasses) { for (const s of [-1, 1]) hp.push([new THREE.TorusGeometry(hr * 0.25, 0.012, 5, 14), spec.glasses === true ? 0x22262e : spec.glasses, mat4(s * hr * 0.37, cy + 0.005, hr * 0.92)]); hp.push([B(hr * 0.25, 0.014, 0.014), 0x22262e, mat4(0, cy + 0.02, hr * 0.95)]); }
  if (spec.mustache) hp.push([B(hr * 0.5, 0.025, 0.02), hair, mat4(0, cy - hr * 0.28, hr * 0.92)]);
  // hair
  const R = hr * 1.07, st = spec.hairStyle || 'short', P = Math.PI;
  const capH = () => hp.push([S(R, 14, 8, 0, TAU, 0, P * 0.42), hair, mat4(0, cy + 0.006, -0.008, 0, -0.16)]);
  const back = (t0, t1, open = 1.0, r = R, sy = 1) => hp.push([S(r, 14, 8, P / 2 + open, TAU - 2 * open, P * t0, P * (t1 - t0)), hair, mat4(0, cy + 0.004, -0.006, 0, 0, 0, 1, sy, 1)]);
  if (st !== 'bald') capH();
  if (st === 'short' || st === 'side' || st === 'spiky' || st === 'twintails' || st === 'ponytail' || st === 'bun') back(0.3, 0.68);
  if (st === 'buzz') back(0.3, 0.6, 1.15, hr * 1.035);
  if (st === 'bald') back(0.35, 0.66, 1.25, hr * 1.04);
  if (st === 'bob') { back(0.28, 0.82, 0.95, R * 1.03); hp.push([B(hr * 1.2, hr * 0.22, 0.03), hair, mat4(0, cy + hr * 0.52, hr * 0.86, 0, -0.25)]); }
  if (st === 'long') { back(0.28, 0.9, 0.95, R * 1.03, 1.45); hp.push([B(hr * 1.2, hr * 0.2, 0.03), hair, mat4(0, cy + hr * 0.54, hr * 0.86, 0, -0.25)]); }
  if (st === 'side') hp.push([S(hr * 0.5, 8, 6), hair, mat4(hr * 0.35, cy + hr * 0.62, hr * 0.62, 0, 0, 0, 1.5, 0.5, 0.8)]);
  if (st === 'spiky') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, tilt = 0.75; hp.push([new THREE.ConeGeometry(hr * 0.24, hr * 0.62, 5), hair, mat4(Math.sin(a) * hr * 0.62, cy + hr * 0.78, Math.cos(a) * hr * 0.62 - 0.02, 0, Math.cos(a) * tilt, -Math.sin(a) * tilt)]); }
  if (st === 'spiky') hp.push([new THREE.ConeGeometry(hr * 0.26, hr * 0.6, 5), hair, mat4(0, cy + hr * 1.1, 0)]);
  if (st === 'twintails') for (const s of [-1, 1]) { hp.push([S(hr * 0.3, 8, 6), hair, mat4(s * hr * 1.2, cy - hr * 0.35, -hr * 0.1, 0, 0, s * 0.25, 0.8, 1.7, 0.8)]); hp.push([S(hr * 0.12, 6, 5), spec.ribbon ?? 0xe84a5f, mat4(s * hr * 1.02, cy + hr * 0.28, -hr * 0.05)]); }
  if (st === 'ponytail') { hp.push([S(hr * 0.3, 8, 6), hair, mat4(0, cy - hr * 0.2, -hr * 1.25, 0, 0.5, 0, 0.8, 1.8, 0.8)]); hp.push([S(hr * 0.12, 6, 5), spec.ribbon ?? 0xf2c94c, mat4(0, cy + hr * 0.45, -hr * 1.0)]); }
  if (st === 'bun') hp.push([S(hr * 0.36, 8, 6), hair, mat4(0, cy + hr * 0.95, -hr * 0.35)]);
  if (spec.cap != null) { hp.push([S(hr * 1.12, 14, 8, 0, TAU, 0, P * 0.45), spec.cap, mat4(0, cy + 0.012, -0.004, 0, -0.1)]); hp.push([C(hr * 0.72, hr * 0.72, 0.022, 12), spec.cap, mat4(0, cy + hr * 0.34, hr * 0.98, 0, 0.12, 0, 1, 1, 1.15)]); }
  head.add(mesh(hp));
  // arms (pivot at the shoulder) and legs (pivot at the hip)
  const arm = (s) => { const g = new THREE.Group(); g.position.set(s * (0.142 * bw + 0.045), shY, 0); g.rotation.z = s * 0.12; g.add(mesh([[C(0.05, 0.047, 0.15, 8), spec.top, mat4(0, -0.06, 0)], [C(0.042, 0.037, 0.2, 8), spec.longSleeve ? spec.top : skin, mat4(0, -0.225, 0)], [S(0.05, 8, 6), skin, mat4(0, -0.345, 0)]])); torso.add(g); return g; };
  const leg = (s) => { const g = new THREE.Group(); g.position.set(s * 0.075 * bw, hipY, 0); g.add(mesh([[C(0.066, 0.057, ll * 0.5, 8), spec.skirt ? skin : spec.bottom, mat4(0, -ll * 0.25, 0)], [C(0.054, 0.046, ll * 0.48, 8), spec.longPants ? spec.bottom : spec.socks ?? skin, mat4(0, -ll * 0.72, 0)], [B(0.105, 0.075, 0.2), spec.shoes ?? 0xffffff, mat4(0, -ll + 0.02, 0.035)]])); body.add(g); return g; };
  const j = { body, torso, head, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1) };
  return { root, j, mat, kind: 'human', height: (hipY + th + 0.05 + hr * 2.05) * sc, radius: 0.22 * sc * Math.max(1, bw * 0.9), eye: (hipY + th + 0.05 + hr) * sc };
}

// ------------------------------------------------------------------ robots (hovering helpers from the future)
export function buildRobot(spec) {
  const sc = (spec.h || 0.95) / 0.95, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(sc);
  const mesh = (parts, m = mat) => { const x = new THREE.Mesh(fuse(parts), m); x.castShadow = true; return x; };
  const bc = spec.body ?? 0xffffff, ac = spec.accent ?? 0x2fb7a8, P = Math.PI;
  const parts = [[S(0.3, 18, 12), bc, mat4(0, 0.5, 0, 0, 0, 0, 1, 1.12, 0.95)], [C(0.303, 0.3, 0.07, 18), ac, mat4(0, 0.36, 0, 0, 0, 0, 1, 1, 0.95)],
    [S(0.304, 16, 8, P / 2 - 0.85, 1.7, P * 0.22, P * 0.28), 0x18202e, mat4(0, 0.5, 0, 0, 0, 0, 1, 1.12, 0.95)],
    [S(0.17, 10, 8), ac, mat4(0, 0.55, -0.26, 0, 0, 0, 1, 1.2, 0.7)], [C(0.16, 0.1, 0.1, 12), ac, mat4(0, 0.17, 0)], [C(0.012, 0.012, 0.22, 5), 0x9aa2aa, mat4(0, 0.93, 0)]];
  for (const s of [-1, 1]) parts.push([B(0.04, 0.13, 0.15), ac, mat4(s * 0.3, 0.64, 0, 0, 0, s * 0.2)]);
  if (spec.bow) for (const s of [-1, 1]) parts.push([new THREE.ConeGeometry(0.07, 0.14, 6), spec.bow, mat4(s * 0.08, 0.86, 0, 0, 0, s * 1.57)]);
  body.add(mesh(parts));
  const gl = [[S(0.045, 8, 6), 0xffffff, mat4(-0.1, 0.63, 0.262, 0, 0, 0, 1, 1.4, 0.4)], [S(0.045, 8, 6), 0xffffff, mat4(0.1, 0.63, 0.262, 0, 0, 0, 1, 1.4, 0.4)], [new THREE.TorusGeometry(0.05, 0.009, 4, 10, P), 0xffffff, mat4(0, 0.535, 0.283, 0, 0, P)]];
  body.add(mesh(gl, glowMat(spec.eye ?? 0x7ff6ff)));
  body.add(mesh([[S(0.05, 8, 6), 0xffffff, mat4(0, 1.06, 0)], [S(0.035, 8, 6), 0xffffff, mat4(0, 0.47, 0.287)]], glowMat(spec.ball ?? 0xff8a3d)));
  const ring = mesh([[new THREE.TorusGeometry(0.2, 0.025, 6, 18), 0xffffff, mat4(0, 0, 0, 0, P / 2)]], glowMat(spec.eye ?? 0x7ff6ff)); ring.position.y = 0.08; ring.castShadow = false; body.add(ring);
  const arm = (s) => { const g = new THREE.Group(); g.position.set(s * 0.31, 0.52, 0); g.rotation.z = s * 0.25; g.add(mesh([[S(0.07, 8, 6), ac, mat4(0, -0.08, 0, 0, 0, 0, 1, 1.5, 1)], [S(0.055, 8, 6), bc, mat4(0, -0.2, 0)]])); body.add(g); return g; };
  const j = { body, torso: body, head: body, armL: arm(1), armR: arm(-1), ring };
  return { root, j, mat, kind: 'robot', height: 1.12 * sc, radius: 0.3 * sc, eye: 0.7 * sc };
}

// ------------------------------------------------------------------ four-legged friends
export function buildQuad(spec) {
  const sc = spec.s || 1, len = spec.len || 0.55, hg = spec.hgt || 0.3, fur = spec.fur ?? 0xd9a05b, belly = spec.belly ?? 0xf7ead2, cat = spec.type === 'cat';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(sc);
  const mesh = (parts) => { const m = new THREE.Mesh(fuse(parts), mat); m.castShadow = true; m.matrixAutoUpdate = false; return m; };
  const torso = new THREE.Group(); torso.position.y = hg + 0.1; body.add(torso);
  torso.add(mesh([[S(0.15, 10, 8), fur, mat4(0, 0, 0, 0, 0, 0, 0.95, 0.9, len / 0.3)], [S(0.13, 10, 8), belly, mat4(0, -0.035, 0.02, 0, 0, 0, 0.9, 0.8, len / 0.33)]]));
  const head = new THREE.Group(); head.position.set(0, 0.12, len / 2 + 0.04); torso.add(head);
  const hp = [[S(0.125, 10, 8), fur, null], [S(0.066, 8, 6), belly, mat4(0, -0.035, 0.105, 0, 0, 0, 1, 0.8, cat ? 0.7 : 1.25)], [S(0.022, 6, 5), 0x1c1c1e, mat4(0, -0.012, cat ? 0.15 : 0.185)]];
  for (const s of [-1, 1]) { hp.push([S(0.02, 6, 5), 0x1c1c1e, mat4(s * 0.05, 0.03, 0.108)]); hp.push([new THREE.ConeGeometry(0.045, 0.1, 4), fur, mat4(s * 0.075, 0.125, -0.01, 0, 0, -s * 0.25)]); }
  head.add(mesh(hp));
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const g = new THREE.Group(); g.position.set(sx * 0.085, hg + 0.02, sz * len * 0.34); g.add(mesh([[C(0.036, 0.03, hg, 6), fur, mat4(0, -hg / 2, 0)], [S(0.04, 6, 5), belly, mat4(0, -hg + 0.02, 0.012)]])); body.add(g); legs.push(g); }
  const tail = new THREE.Group(); tail.position.set(0, 0.08, -len / 2 - 0.02); torso.add(tail);
  tail.add(mesh(cat ? [[C(0.02, 0.025, 0.36, 6), fur, mat4(0, 0.14, -0.08, 0, -0.6)]] : [[S(0.05, 8, 6), fur, mat4(0, 0.08, -0.02, 0, 0.5, 0, 1, 2.0, 1)], [S(0.045, 8, 6), belly, mat4(0, 0.16, 0.03)]]));
  return { root, j: { body, torso, head, legs, tail }, mat, kind: 'quad', height: (hg + 0.34) * sc, radius: 0.22 * sc, eye: (hg + 0.25) * sc };
}

export function buildModel(look) { return look.type === 'robot' ? buildRobot(look) : look.type === 'dog' || look.type === 'cat' ? buildQuad(look) : typeof look.make === "function" ? look.make(look) : buildHuman(look); }

// ------------------------------------------------------------------ floating text (name tags, speech)
function textSprite(text, { bg = 'rgba(255,255,255,.96)', fg = '#222', size = 30, pad = 14, maxW = 380, tail = false } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = `bold ${size}px "Trebuchet MS",sans-serif`;
  const words = String(text).split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur);
  const tw = Math.max(...lines.map((l) => x.measureText(l).width)); c.width = Math.ceil(tw + pad * 2); c.height = Math.ceil(lines.length * size * 1.25 + pad * 2 + (tail ? 14 : 0));
  x.font = `bold ${size}px "Trebuchet MS",sans-serif`; x.fillStyle = bg; const r = 16, W = c.width, Hh = c.height - (tail ? 14 : 0);
  x.beginPath(); x.moveTo(r, 0); x.arcTo(W, 0, W, Hh, r); x.arcTo(W, Hh, 0, Hh, r); x.arcTo(0, Hh, 0, 0, r); x.arcTo(0, 0, W, 0, r); x.fill();
  if (tail) { x.beginPath(); x.moveTo(W / 2 - 12, Hh - 1); x.lineTo(W / 2, Hh + 14); x.lineTo(W / 2 + 12, Hh - 1); x.fill(); }
  x.fillStyle = fg; x.textBaseline = 'top'; lines.forEach((l, i) => x.fillText(l, pad, pad + i * size * 1.25));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(c.width / 260, c.height / 260, 1); sp.renderOrder = 50;
  return sp;
}
const blobGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

// ------------------------------------------------------------------ Actor
export class Actor {
  // def: { id, name, emoji, look:{type,...}, era, x, z, yaw, walk, run, ai:'wander'|'follow'|'idle'|'scripted', lines:[...], animal:[...], home:'poiName' }
  constructor(def) {
    this.def = def; this.id = def.id; this.name = def.name; this.emoji = def.emoji || '🙂'; this.era = def.era || 'present';
    this.root = new THREE.Group(); this.pos = this.root.position; this.vel = new THREE.Vector3(); this.yaw = def.yaw || 0;
    this.walkSpeed = def.walk ?? 2.3; this.runSpeed = def.run ?? 5.6;
    this.size = 1; this.sizeT = 1; this.speedMul = 1; this.jumpMul = 1; this.gravMul = 1;
    this.fly = false; this.noclip = false; this.ghost = false; this.gills = false; this.bouncy = false; this.slippery = false; this.glide = false;
    this.onGround = true; this.inWater = false; this.controlled = false; this.hidden = false; this.frozenSelf = false; this.thrown = 0;
    this.move = { x: 0, z: 0, run: false, jump: false, up: false, down: false };
    this.state = 'idle'; this.stateT = 0; this.ph = Math.random() * 6; this.pose = null; this.flyTilt = 0;
    this.ai = { mode: def.ai || 'wander', wait: rnd(0, 3), target: null, node: null, follow: null, stuck: 0, pause: 0, home: null };
    this.lines = def.lines || ['Hello!']; this.lineI = 0; this.fx = {}; this.mount = null; this.rider = null;
    this.blob = new THREE.Mesh(blobGeo, blobMat); this.blob.renderOrder = 1; this.root.add(this.blob);
    this.setLook(def.look);
    this.tag = textSprite(this.name, { size: 26, bg: 'rgba(30,40,60,.72)', fg: '#fff', pad: 10 }); this.tag.visible = false; this.root.add(this.tag);
    this.bubble = null; this.bubbleT = 0;
    this.pos.set(def.x || 0, 0, def.z || 0); this.pos.y = G.eras[this.era] ? G.floor(this.pos.x, this.pos.z, this.era) : 0;
    G.scene.add(this.root); this.inScene = true;
  }
  // Swap the visible body (used for disguises / clones). look is the same object passed in def.look.
  setLook(look) {
    if (this.model) { this.root.remove(this.model.root); }
    this.look = look; this.model = buildModel(look); this.j = this.model.j; this.kind = this.model.kind; this.height = this.model.height; this.radius = this.model.radius; this.eye = this.model.eye;
    this.root.add(this.model.root); this.blob.scale.setScalar(this.radius * 1.5);
    if (this.tag) this.tag.position.y = this.height + 0.35;
    if (this.ghost) this.setGhost(true);
  }
  setGhost(on) { this.ghost = on; this.model.mat.transparent = on; this.model.mat.opacity = on ? 0.28 : 1; this.model.mat.needsUpdate = true; }
  tint(hex) { this.model.mat.color.set(hex); }
  setState(s, secs = 0) { this.state = s; this.stateT = secs; if (s === 'idle') { this.j.body.rotation.set(0, 0, 0); this.j.body.position.y = 0; } }
  say(text, secs = 3.5) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    this.bubble = textSprite(text, { tail: true, size: 26, maxW: 330 }); this.bubble.center.set(0.5, 0); this.bubble.position.y = this.height + 0.3; this.root.add(this.bubble); this.bubbleT = secs;
  }
  nextLine() { const l = this.lines[this.lineI % this.lines.length]; this.lineI++; return typeof l === 'function' ? l(this) : l; }
  teleport(x, z, y) { this.pos.x = x; this.pos.z = z; this.pos.y = y ?? G.floor(x, z, this.era); this.vel.set(0, 0, 0); this.ai.target = null; this.ai.node = null; }
  setEra(key) { this.era = key; }
  dist(o) { return Math.hypot(this.pos.x - o.pos.x, this.pos.z - o.pos.z); }
  get blocked() { return this.state !== 'idle' || this.frozenSelf; }

  update(dt) {
    const vis = this.era === G.era && !this.hidden; this.root.visible = vis;
    // actors in another era, hidden, or far beyond the fog are taken out of the scene graph entirely (no per-frame matrix work)
    const want = vis && (this.controlled || !!this.bubble || Math.abs(this.pos.x - G.camera.position.x) + Math.abs(this.pos.z - G.camera.position.z) < 240);
    if (want !== this.inScene) { this.inScene = want; if (want) G.scene.add(this.root); else G.scene.remove(this.root); }
    if (!vis && !this.controlled) return;
    if (this.mount) { const m = this.mount; this.pos.copy(m.pos); this.pos.y += m.height * m.size * 0.92; this.yaw = m.yaw; this.root.rotation.y = this.yaw; this.animate(dt, 0); this.updateText(dt); return; }
    if (!this.controlled) this.think(dt);
    if (this.stateT > 0) { this.stateT -= dt; if (this.stateT <= 0) { if (this.state === 'statue') this.tint(0xffffff); this.setState('idle'); } }
    this.physics(dt);
    this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
    this.updateText(dt);
  }
  updateText(dt) {
    if (this.bubble) { this.bubbleT -= dt; const k = 1 / Math.max(0.3, this.size); this.bubble.scale.setScalar(1); this.bubble.scale.set(this.bubble.material.map.image.width / 230 * k, this.bubble.material.map.image.height / 230 * k, 1); if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; } }
    const pc = G.pc; this.tag.visible = !this.controlled && !this.bubble && pc && pc !== this && (G.flags.xray ? this.dist(pc) < 140 : this.dist(pc) < 11) && !this.ghost;
  }

  physics(dt) {
    const era = G.eras[this.era], m = this.move, sz = this.size, r = this.radius * sz, h = this.height * sz, p = this.pos, v = this.vel;
    const blocked = this.blocked;
    let sp = (m.run ? this.runSpeed : this.walkSpeed) * this.speedMul * (sz < 1 ? Math.max(0.4, Math.sqrt(sz)) : Math.min(3.5, Math.sqrt(sz)));
    if (this.fly) sp = (m.run ? 24 : 11) * Math.max(1, this.speedMul * 0.6);
    if (this.inWater) sp *= 0.55;
    const tx = blocked ? 0 : m.x * sp, tz = blocked ? 0 : m.z * sp;
    if (this.thrown > 0) { this.thrown -= dt; if (this.onGround && this.thrown < 0.9) this.thrown = 0; }
    const acc = this.thrown > 0 ? 0.25 : this.slippery ? 1.1 : this.fly ? 6 : this.onGround ? 14 : 3.5;
    v.x = damp(v.x, tx, acc, dt); v.z = damp(v.z, tz, acc, dt);
    const prevY = p.y;
    if (this.fly) { const ty = blocked ? 0 : ((m.up || m.jump ? 1 : 0) - (m.down ? 1 : 0)) * sp * 0.75; v.y = damp(v.y, ty, 7, dt); }
    else {
      v.y -= 22 * this.gravMul * dt; if (this.glide && v.y < -2.2) v.y = -2.2;
      if (m.jump && this.onGround && !blocked) { v.y = 7.4 * this.jumpMul * Math.sqrt(clamp(sz, 0.4, 4)); this.onGround = false; if (this.controlled) G.bus.emit('jump', this); }
    }
    // horizontal move (sub-stepped so fast things do not tunnel through thin walls)
    const steps = Math.max(1, Math.ceil(Math.hypot(v.x, v.z) * dt / (r * 0.8)));
    for (let i = 0; i < steps && i < 8; i++) { p.x += v.x * dt / steps; p.z += v.z * dt / steps; if (!this.noclip) era.colliders.resolve(p, r, p.y, p.y + h); }
    const bd = era.bounds || 340; p.x = clamp(p.x, -bd, bd); p.z = clamp(p.z, -bd, bd);
    // vertical
    p.y += v.y * dt;
    if (!this.noclip && v.y > 0) { const c = era.colliders.ceilingAt(p.x, p.z, prevY + h); if (p.y + h > c) { p.y = c - h - 0.002; v.y = Math.min(v.y, 0); } }
    const g = Math.max(era.heightAt(p.x, p.z), this.noclip ? -Infinity : era.colliders.groundAt(p.x, p.z, prevY));
    if (p.y <= g) {
      p.y = g;
      if (this.bouncy && v.y < -4 && !this.fly) { v.y = -v.y * 0.86; this.onGround = false; } else { if (v.y < 0) v.y = 0; this.onGround = true; }
    } else this.onGround = p.y - g < 0.06 && v.y <= 0;
    // water: float unless you have gills
    const wy = era.waterAt ? era.waterAt(p.x, p.z) : -Infinity;
    this.inWater = false;
    if (wy > -1e8 && !this.fly && !this.gills && p.y < wy - h * 0.55) { p.y = damp(p.y, wy - h * 0.55, 10, dt); if (p.y < g) p.y = g; v.y = 0; this.inWater = true; this.onGround = true; }
    // facing + scale
    if (!blocked && Math.hypot(m.x, m.z) > 0.08) this.yaw = angDamp(this.yaw, Math.atan2(m.x, m.z), 12, dt);
    this.root.rotation.y = this.yaw;
    if (this.size !== this.sizeT) { this.size = Math.abs(this.size - this.sizeT) < 0.004 ? this.sizeT : damp(this.size, this.sizeT, 5, dt); }
    this.root.scale.setScalar(this.size);
    this.blob.position.y = 0.03 + (g - p.y) / this.size; this.blob.visible = p.y - g < 12 && !this.inWater;
  }

  animate(dt, speed) {
    const j = this.j, t = G.t, st = this.state, air = !this.onGround && !this.fly;
    if (st === 'statue') return;
    const sw = clamp(speed / (this.walkSpeed * this.speedMul * 1.1 + 0.01), 0, 1.6);
    if (speed > 0.15) this.ph += dt * (5.5 + Math.min(speed, 9) * 1.5) / Math.max(0.6, Math.sqrt(this.size));
    const s = Math.sin(this.ph), body = j.body;
    this.flyTilt = damp(this.flyTilt, this.fly ? (speed > 2 ? 1.2 : 0.15) : 0, 6, dt);
    if (this.kind === 'human') {
      let lL = s * 0.8 * Math.min(sw, 1.2), lR = -lL, aL = -s * 0.7 * Math.min(sw, 1.2), aR = -aL, lean = Math.min(sw, 1.5) * 0.1, by = Math.abs(Math.sin(this.ph)) * 0.025 * sw, bx = this.flyTilt, hy = Math.sin(t * 0.6 + this.ph) * 0.12 * (1 - Math.min(sw, 1)), aZ = 0.12;
      if (this.fly) { aL = aR = -2.9 * this.flyTilt / 1.2 - 0.2; lL = Math.sin(t * 7) * 0.12; lR = -lL; lean = 0; by = Math.sin(t * 2) * 0.05; }
      else if (air) { aL = aR = -2.2; lL = 0.5; lR = -0.25; }
      else if (this.inWater) { aL = Math.sin(t * 5) * 1.2 - 1.2; aR = -Math.sin(t * 5) * 1.2 - 1.2; bx = 0.9; }
      if (st === 'sleep' || st === 'stun') { bx = st === 'sleep' ? -1.5 : 1.5; by = 0.14 / this.size; aL = aR = st === 'sleep' ? 0.2 : -2.8; lL = lR = 0; }
      else if (st === 'dance') { body.rotation.y += dt * 7; aL = -2.4 + Math.sin(t * 10) * 0.5; aR = -2.4 - Math.sin(t * 10) * 0.5; by = Math.abs(Math.sin(t * 8)) * 0.12; lL = Math.sin(t * 10) * 0.4; lR = -lL; }
      else if (st === 'laugh') { lean = -0.25 + Math.sin(t * 20) * 0.1; by = Math.abs(Math.sin(t * 10)) * 0.05; aL = aR = -0.9; }
      else if (st === 'sit') { lL = lR = -1.5; by = -0.3; }
      else if (st === 'cheer') { aL = aR = -2.8 + Math.sin(t * 12) * 0.25; by = Math.abs(Math.sin(t * 8)) * 0.1; }
      else if (st === 'float') { aL = aR = -0.8; aZ = 1.0; lL = 0.2; lR = -0.2; body.rotation.y += dt * 1.5; }
      if (st !== 'dance' && st !== 'float') body.rotation.y = damp(body.rotation.y % TAU, 0, 8, dt);
      body.rotation.x = damp(body.rotation.x, bx, 9, dt); body.position.y = damp(body.position.y, by, 14, dt);
      j.torso.rotation.x = damp(j.torso.rotation.x, lean, 10, dt); j.head.rotation.y = hy;
      j.legL.rotation.x = damp(j.legL.rotation.x, lL, 18, dt); j.legR.rotation.x = damp(j.legR.rotation.x, lR, 18, dt);
      j.armL.rotation.x = damp(j.armL.rotation.x, aL, 18, dt); j.armR.rotation.x = damp(j.armR.rotation.x, aR, 18, dt);
      j.armL.rotation.z = damp(j.armL.rotation.z, aZ, 10, dt); j.armR.rotation.z = damp(j.armR.rotation.z, -aZ, 10, dt);
    } else if (this.kind === 'robot') {
      let by = 0.1 + Math.sin(t * 2.4 + this.ph) * 0.04, bx = Math.min(sw, 1.4) * 0.22 + this.flyTilt * 0.6, a = Math.sin(t * 3) * 0.2 - sw * 0.5;
      if (st === 'sleep' || st === 'stun') { by = -0.02; bx = 0.5; } else if (st === 'dance') { body.rotation.y += dt * 8; a = -2.5; by += Math.abs(Math.sin(t * 8)) * 0.1; } else if (st === 'laugh') { bx = Math.sin(t * 20) * 0.15; } else if (st === 'cheer') { a = -2.7; by += Math.abs(Math.sin(t * 8)) * 0.1; } else if (st === 'float') body.rotation.y += dt * 1.5;
      if (st !== 'dance' && st !== 'float') body.rotation.y = damp(body.rotation.y % TAU, 0, 8, dt);
      body.position.y = damp(body.position.y, by, 10, dt); body.rotation.x = damp(body.rotation.x, bx, 8, dt);
      j.armL.rotation.x = damp(j.armL.rotation.x, a, 12, dt); j.armR.rotation.x = damp(j.armR.rotation.x, st === 'dance' ? -2.5 : -a - sw, 12, dt); j.ring.rotation.y += dt * 4; j.ring.scale.setScalar(1 + Math.sin(t * 9) * 0.06);
    } else if (this.kind === 'quad') {
      const a = s * 0.75 * Math.min(sw, 1.3), L = j.legs;
      L[0].rotation.x = a; L[3].rotation.x = a; L[1].rotation.x = -a; L[2].rotation.x = -a;
      j.tail.rotation.z = Math.sin(t * 11 + this.ph) * 0.5; j.head.rotation.x = Math.sin(this.ph * 2) * 0.05 * sw - 0.1; j.head.rotation.y = Math.sin(t * 0.7 + this.ph) * 0.25 * (1 - Math.min(sw, 1));
      let by = Math.abs(Math.sin(this.ph * 2)) * 0.02 * sw, bz = 0;
      if (st === 'sleep' || st === 'stun') { bz = 1.5; by = 0.1; } else if (st === 'dance' || st === 'float') body.rotation.y += dt * 7; else if (st === 'laugh' || st === 'cheer') by = Math.abs(Math.sin(t * 10)) * 0.12;
      if (st !== 'dance' && st !== 'float') body.rotation.y = damp(body.rotation.y % TAU, 0, 8, dt);
      body.rotation.z = damp(body.rotation.z, bz, 9, dt); body.position.y = damp(body.position.y, by, 12, dt); body.rotation.x = damp(body.rotation.x, this.flyTilt * 0.3, 8, dt);
    } else if (this.model.animate) this.model.animate(this, dt, speed, sw);
    if (this.pose) this.pose(this, dt);
  }

  // ------------------------------------------------------------ simple brains
  think(dt) {
    const ai = this.ai, m = this.move, pc = G.pc;
    if (ai.mode === 'scripted') return;                      // another module (baseball, riding) drives this actor's move
    m.x = m.z = 0; m.run = m.jump = m.up = m.down = false;
    if (this.blocked || G.frozen > 0) return;
    if (ai.pause > 0) { ai.pause -= dt; if (pc && pc.era === this.era) this.face(pc.pos.x, pc.pos.z, dt); return; }
    if (ai.mode === 'follow' && ai.follow) return this.followAI(dt, ai.follow);
    if (ai.mode === 'goto' && ai.target) { if (this.steer(ai.target.x, ai.target.z, ai.run, 1.3)) { ai.mode = ai.prev || 'wander'; ai.target = null; if (ai.onArrive) { const f = ai.onArrive; ai.onArrive = null; f(this); } } return; }
    if (ai.mode === 'idle') { if (pc && pc !== this && this.dist(pc) < 7) this.face(pc.pos.x, pc.pos.z, dt); return; }
    if (ai.mode === 'wander') {
      if (ai.wait > 0) { ai.wait -= dt; if (pc && pc !== this && this.dist(pc) < 5 && !pc.ghost) this.face(pc.pos.x, pc.pos.z, dt); return; }
      const era = G.eras[this.era], nodes = era.nodes; if (!nodes || !nodes.length) return;
      if (!ai.target) {
        if (!ai.node) { let best = null, bd = 1e9; for (const n of nodes) { const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z); if (d < bd) { bd = d; best = n; } } ai.node = best; ai.target = { x: best.x + rnd(-2, 2), z: best.z + rnd(-2, 2) }; }
        else { const cand = nodes.filter((n) => n !== ai.node && n !== ai.prevNode && ((Math.abs(n.x - ai.node.x) < 1 && Math.abs(n.z - ai.node.z) < (era.nodeGap || 46)) || (Math.abs(n.z - ai.node.z) < 1 && Math.abs(n.x - ai.node.x) < (era.nodeGap || 46)))); const n = cand.length ? pick(cand) : ai.prevNode || ai.node; ai.prevNode = ai.node; ai.node = n; ai.target = { x: n.x + rnd(-2.2, 2.2), z: n.z + rnd(-2.2, 2.2) }; }
        ai.stuck = 0; ai.last = this.pos.clone();
      }
      if (this.steer(ai.target.x, ai.target.z, false, 1.4)) { ai.target = null; if (Math.random() < 0.3) ai.wait = rnd(2, 7); }
      else { ai.stuck += dt; if (ai.stuck > 3) { if (ai.last.distanceTo(this.pos) < 1) { ai.target = null; ai.node = null; } ai.stuck = 0; ai.last.copy(this.pos); } }
    }
  }
  face(x, z, dt) { this.yaw = angDamp(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z), 6, dt); }
  // Walk toward a point. Returns true on arrival.
  steer(x, z, run = false, arrive = 1.2) { const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz); if (d < arrive) return true; this.move.x = dx / d; this.move.z = dz / d; this.move.run = run; return false; }
  goTo(x, z, run = false, onArrive = null) { const ai = this.ai; if (ai.mode !== 'goto') ai.prev = ai.mode; ai.mode = 'goto'; ai.target = { x, z }; ai.run = run; ai.onArrive = onArrive; }
  followAI(dt, T) {
    if (T.era !== this.era) { this.era = T.era; this.teleport(T.pos.x - 1.2, T.pos.z - 1.2, T.pos.y); return; }
    const d = this.dist(T), slot = this.ai.slot || 0, ang = T.yaw + Math.PI + (slot % 2 ? 0.7 : -0.7) * (1 + (slot >> 1) * 0.6), rr = 1.7 + (slot >> 1) * 1.1;
    const tx = T.pos.x + Math.sin(ang) * rr * Math.max(1, T.size * 0.7), tz = T.pos.z + Math.cos(ang) * rr * Math.max(1, T.size * 0.7);
    if (d > 60) { this.teleport(tx, tz, T.pos.y); return; }
    const high = T.pos.y - G.ground(T.pos.x, T.pos.z, T.pos.y) > 1.5 && (T.fly || T.mount || G.player?.vehicle);
    this.fly = !!(T.fly || high) && (T.pos.y - this.pos.y > 1.2 || this.pos.y - G.ground(this.pos.x, this.pos.z, this.pos.y) > 0.4 || high);
    if (this.fly) { const dy = T.pos.y - this.pos.y; this.move.up = dy > 0.5; this.move.down = dy < -0.5; }
    const far = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    if (far > 0.9) { this.steer(tx, tz, far > 5 || T.move.run, 0.5); if (far > 14) this.speedMulFollow = 2.2; } else this.face(T.pos.x + Math.sin(T.yaw) * 4, T.pos.z + Math.cos(T.yaw) * 4, dt);
    this.speedMul = far > 12 ? Math.max(this.speedMul, 2.4) : (this.fx.speed ? this.speedMul : 1);
  }
  dispose() { G.scene.remove(this.root); const i = G.actors.indexOf(this); if (i >= 0) G.actors.splice(i, 1); }
}

export function spawnActor(def) { const a = new Actor(def); G.actors.push(a); if (def.id && def.cast !== false) G.cast[def.id] = a; return a; }
