// Riverside ballpark + a complete baseball match (PLAN.md section 13).
// Home "Hinode Comets" (the cast kids + Tiko) v away "East Town Rockets" (nine generated kids).
// The player pitches in the top halves and bats in the bottom halves; fielding and running are automatic.
import * as THREE from 'three';
import { G, FIELD } from './game.js';
import { Batch } from './build.js';
import { spawnActor } from './actors.js';
import { clamp, damp, lerp, angDiff } from './util.js';

const HX = FIELD.x, HZ = FIELD.z, BD = FIELD.base, FENCE = FIELD.fence, Q = Math.SQRT1_2, PI = Math.PI;
// World positions of home (0), first (1), second (2), third (3) and home again (4).
const BX = [HX, HX - BD * Q, HX, HX + BD * Q, HX], BZ = [HZ, HZ + BD * Q, HZ + BD * Math.SQRT2, HZ + BD * Q, HZ];
const MOUND = 13, WIND = 0.9, SWING = 0.1, THROW_REL = 0.55, FIELD_MUL = 1.1, RUN_MUL = 1.22;   // runners get a little extra so the small diamond plays fair
const GRAV = 9.8, KD = 0.0038, BALL_R = 0.06;
const ZX = 0.27, ZY0 = 0.42, ZY1 = 1.04, ZCY = (ZY0 + ZY1) / 2;          // strike zone (plate plane z = HZ)
const PITCHES = [
  { name: 'Fastball', speed: 21, bx: 0, by: 0.03, miss: 0.04, sc: 0.07 },
  { name: 'Curve', speed: 15, bx: -0.1, by: -0.36, miss: 0.12, sc: 0.11 },
  { name: 'Slider', speed: 18, bx: -0.32, by: -0.1, miss: 0.1, sc: 0.1 },
  { name: 'Change-up', speed: 13.5, bx: 0.08, by: -0.18, miss: 0.11, sc: 0.09 },
];
// Fielding spots relative to home plate: P C 1B 2B 3B SS LF CF RF.
const SPOT = [[0, MOUND], [0, -1.45], [-11.6, 16.2], [-6.2, 23.2], [11.6, 16.2], [6.2, 23.2], [18, 33.5], [0, 39], [-18, 33.5]];
const COMETS = [
  { id: 'taro', pos: 5, pow: 1.0 }, { id: 'mira', pos: 7, pow: 0.94 }, { id: 'kenta', pos: 6, pow: 0.97 }, { id: 'goro', pos: 2, pow: 1.12 }, { id: 'tiko', pos: 1, pow: 1.04 },
  { id: 'riku', pos: 4, pow: 0.97 }, { id: 'jun', pos: 0, pow: 1.0 }, { id: 'sora', pos: 3, pow: 0.93 }, { id: 'hana', pos: 8, pow: 0.95 },
];
const ROCKETS = [
  { name: 'Aki', pos: 7, h: 1.26, hair: 0x2b2018, hairStyle: 'short', skill: 0.62, pow: 0.97 }, { name: 'Botan', pos: 3, h: 1.22, hair: 0x5a3825, hairStyle: 'bob', skill: 0.58, pow: 0.93 },
  { name: 'Chiyo', pos: 5, h: 1.3, hair: 0x1c1c1e, hairStyle: 'ponytail', skill: 0.7, pow: 1.0 }, { name: 'Daigo', pos: 2, h: 1.44, hair: 0x1c1c1e, hairStyle: 'buzz', skill: 0.66, pow: 1.12, build: 1.3 },
  { name: 'Emi', pos: 6, h: 1.27, hair: 0x6b4226, hairStyle: 'twintails', skill: 0.64, pow: 0.98 }, { name: 'Fuyu', pos: 4, h: 1.32, hair: 0x3a2a1c, hairStyle: 'side', skill: 0.6, pow: 1.0 },
  { name: 'Gaku', pos: 1, h: 1.36, hair: 0x2b2b3a, hairStyle: 'spiky', skill: 0.56, pow: 1.05 }, { name: 'Hoshi', pos: 8, h: 1.24, hair: 0x4a3526, hairStyle: 'short', skill: 0.52, pow: 0.94 },
  { name: 'Isamu', pos: 0, h: 1.38, hair: 0x1f2a44, hairStyle: 'short', skill: 0.5, pow: 0.98 },
];
const TEAM = ['Rockets', 'Comets'], FULL = ['East Town Rockets', 'Hinode Comets'];
const ORD = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const NUM = ['zero', 'one', 'two', 'three', 'four'];
const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.87;   // ~N(0,0.5)
const hyp = Math.hypot;

// ------------------------------------------------------------------ module state
let S = null;                    // match state while a game is on
let rockets = null;              // the nine away actors (created on first start, hidden between games)
let ballMesh, ballBlob, bat, fx, zoneFrame, reticle, predRing, hudEl = null, batArm = null, batOff = -0.35, batRX = 1.3;
const _m = new THREE.Matrix4();
let sbCanvas, sbCtx, sbTex;
const SB = { line: [[], []], runs: [0, 0], hits: [0, 0], errs: [0, 0], inning: 0, half: 0, outs: 0, live: false, final: false };
const api = { active: false, menu, start, stop, update };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camWantP = new THREE.Vector3(), camWantL = new THREE.Vector3();
const TRAJ_N = 330, traj = new Float32Array(TRAJ_N * 3);

// ------------------------------------------------------------------ field
function fanGeo(pts, tile = 1) {   // flat fan in the XZ plane; pts = [x,z,...], first point is the hub, the rest go from +Z toward +X
  const n = pts.length / 2, P = new Float32Array(n * 3), U = new Float32Array(n * 2), N = new Float32Array(n * 3), I = [];
  for (let i = 0; i < n; i++) { P[i * 3] = pts[i * 2]; P[i * 3 + 2] = pts[i * 2 + 1]; U[i * 2] = pts[i * 2] / tile; U[i * 2 + 1] = pts[i * 2 + 1] / tile; N[i * 3 + 1] = 1; }
  for (let i = 1; i < n - 1; i++) I.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}
function sectorPts(r, a0, a1, seg, cx = 0, cz = 0) { const p = [cx, cz]; for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; p.push(cx + Math.sin(a) * r, cz + Math.cos(a) * r); } return p; }

function buildField(era) {
  const b = new Batch(G.M, era.colliders, 72); b.height = era.heightAt;
  const at = (y) => new THREE.Matrix4().makeTranslation(HX, y, HZ);
  // dirt: infield wedge + the circle round home plate, then the grass diamond laid back on top
  b.add('dirt', fanGeo(sectorPts(28.5, -0.86, 0.86, 28), 5), 0xf4e6cf, at(0.04));
  b.add('dirt', fanGeo(sectorPts(4.3, 0, PI * 2, 24), 5), 0xf4e6cf, at(0.045));
  b.flat('grass', HX, 0.075, HZ + BD * Q, 15.4, 15.4, 0xe2e8dc, PI / 4);
  // mound + rubber
  b.cyl('dirt', HX, 0.05, HZ + MOUND, 2.2, 2.7, 0.1, 0xf4e6cf, 20); b.solid(HX, HZ + MOUND, 3.2, 3.2, 0, 0.1, 'mound');
  b.box('plain', HX, 0.115, HZ + MOUND, 0.6, 0.04, 0.15, 0xffffff);
  // chalk: foul lines, batter's boxes
  for (const s of [-1, 1]) {
    b.flat('paint', HX + s * FENCE * Q / 2, 0.055, HZ + FENCE * Q / 2, 0.1, FENCE, 0xffffff, s * PI / 4);
    const cx = HX + s * 0.86;
    b.flat('paint', cx - 0.55, 0.06, HZ, 0.07, 1.7, 0xffffff); b.flat('paint', cx + 0.55, 0.06, HZ, 0.07, 1.7, 0xffffff);
    b.flat('paint', cx, 0.06, HZ - 0.85, 1.17, 0.07, 0xffffff); b.flat('paint', cx, 0.06, HZ + 0.85, 1.17, 0.07, 0xffffff);
  }
  // bases + home plate (pentagon, point toward the catcher)
  for (let i = 1; i <= 3; i++) b.box('plain', BX[i], 0.07, BZ[i], 0.42, 0.08, 0.42, 0xffffff, PI / 4);
  b.add('paint', fanGeo([0, 0.02, 0, 0.22, 0.22, 0.22, 0.22, 0, 0, -0.22, -0.22, 0, -0.22, 0.22, 0, 0.22]), 0xffffff, at(0.065));
  // backstop: a U of posts, a kick board and netting, open toward the field
  const bz = HZ - 4.6, bw = 5.5, bh = 4.2, sideL = 2.6, net = 0x9aa3ad;
  for (let x = -bw; x <= bw + 0.01; x += 2.75) b.cyl('metal', HX + x, bh / 2, bz, 0.06, 0.06, bh, 0xcfd6dc, 6);
  for (const s of [-1, 1]) b.cyl('metal', HX + s * bw, bh / 2, bz + sideL, 0.06, 0.06, bh, 0xcfd6dc, 6);
  b.box('plain', HX, 0.45, bz, bw * 2, 0.9, 0.07, 0x2e6b4f); b.box('plain', HX, bh, bz, bw * 2 + 0.1, 0.08, 0.08, 0xcfd6dc);
  for (let y = 1.35; y < bh; y += 0.45) b.box('plain', HX, y, bz, bw * 2, 0.02, 0.02, net);
  for (let x = -bw + 0.55; x < bw; x += 0.55) b.box('plain', HX + x, 0.9 + (bh - 0.9) / 2, bz, 0.02, bh - 0.9, 0.02, net);
  for (const s of [-1, 1]) {
    const x = HX + s * bw, zc = bz + sideL / 2;
    b.box('plain', x, 0.45, zc, 0.07, 0.9, sideL, 0x2e6b4f); b.box('plain', x, bh, zc, 0.08, 0.08, sideL, 0xcfd6dc);
    for (let y = 1.35; y < bh; y += 0.45) b.box('plain', x, y, zc, 0.02, 0.02, sideL, net);
    for (let z = 0.52; z < sideL; z += 0.52) b.box('plain', x, 0.9 + (bh - 0.9) / 2, bz + z, 0.02, bh - 0.9, 0.02, net);
    b.solid(x, zc, 0.2, sideL, 0, bh, 'fence', false);
  }
  b.solid(HX, bz, bw * 2, 0.2, 0, bh, 'fence', false);
  // two benches under little roofs (Comets on the third-base side, Rockets on the first-base side)
  for (const s of [-1, 1]) {
    const cx = HX + s * 11, cz = HZ - 4.1, c = s > 0 ? 0x2a5fb5 : 0xd62828;
    b.box('wood', cx, 0.45, cz, 5.6, 0.07, 0.45, 0xc9a977); b.box('wood', cx, 0.85, cz - 0.24, 5.6, 0.3, 0.05, 0xc9a977);
    for (const lx of [-2.5, 0, 2.5]) b.box('plain', cx + lx, 0.22, cz, 0.08, 0.44, 0.4, 0x3a3f45);
    for (const px of [-2.95, 2.95]) for (const pz of [-0.55, 0.75]) b.cyl('plain', cx + px, 1.15, cz + pz, 0.05, 0.05, 2.3, 0x4a5058, 6);
    b.box('plain', cx, 2.33, cz + 0.1, 6.3, 0.09, 1.7, c); b.box('plain', cx, 2.2, cz + 0.93, 6.3, 0.2, 0.05, 0xffffff);
    b.solid(cx, cz, 5.6, 0.5, 0, 0.5, 'bench');
  }
  // outfield fence (visual only) + foul poles
  const seg = 24, da = (PI / 2) / seg, len = FENCE * da + 0.05;
  for (let i = 0; i < seg; i++) {
    const a = -PI / 4 + (i + 0.5) * da, x = HX + Math.sin(a) * FENCE, z = HZ + Math.cos(a) * FENCE;
    b.box('plain', x, 0.55, z, len, 1.0, 0.07, i % 2 ? 0x2e6b4f : 0x347a5a, a); b.box('plain', x, 1.08, z, len, 0.07, 0.1, 0xf2c94c, a);
  }
  for (const s of [-1, 1]) { const x = HX + s * FENCE * Q, z = HZ + FENCE * Q; b.cyl('plain', x, 3.5, z, 0.08, 0.08, 7, 0xf2c94c, 6); b.box('plain', x - s * 0.25, 5.6, z - 0.25, 0.04, 2.6, 0.6, 0xf2c94c, PI / 4 * s); }
  // scoreboard beyond left-centre field, facing home plate
  const sa = 0.35, sx = HX + Math.sin(sa) * 55.5, sz = HZ + Math.cos(sa) * 55.5, ry = Math.atan2(HX - sx, HZ - sz), ux = Math.cos(ry), uz = -Math.sin(ry);
  b.box('plain', sx, 4.2, sz, 9.6, 4.0, 0.3, 0x1c2b24, ry); b.box('plain', sx, 6.32, sz, 9.9, 0.24, 0.5, 0xf2c94c, ry);
  for (const k of [-3.6, 3.6]) { const px = sx + ux * k, pz = sz + uz * k; b.cyl('metal', px, 1.1, pz, 0.14, 0.16, 2.2, 0xb9c0c7, 8); b.solid(px, pz, 0.45, 0.45, 0, 2.3, 'post', false); }
  b.build(era.group);
  sbCanvas = document.createElement('canvas'); sbCanvas.width = 768; sbCanvas.height = 288; sbCtx = sbCanvas.getContext('2d');
  sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 3.45), new THREE.MeshBasicMaterial({ map: sbTex }));
  face.position.set(sx + Math.sin(ry) * 0.17, 4.2, sz + Math.cos(ry) * 0.17); face.rotation.y = ry; face.matrixAutoUpdate = false; face.updateMatrix(); era.group.add(face);
  drawBoard();
}

// Line score on the big board: innings, R, H, E.
function drawBoard() {
  const x = sbCtx, W = 768, H = 288; if (!x) return;
  x.fillStyle = '#12261c'; x.fillRect(0, 0, W, H); x.strokeStyle = '#f2c94c'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
  x.textBaseline = 'middle'; x.textAlign = 'center';
  const n = Math.max(SB.line[0].length, SB.line[1].length), first = Math.max(0, n - 9), cw = 44, x0 = 214;
  x.font = 'bold 26px "Trebuchet MS", sans-serif'; x.fillStyle = '#9fd3b5';
  for (let i = 0; i < 9; i++) x.fillText(String(first + i + 1), x0 + i * cw + cw / 2, 46);
  ['R', 'H', 'E'].forEach((t, i) => x.fillText(t, 640 + i * 44, 46));
  x.strokeStyle = 'rgba(159,211,181,.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(16, 72); x.lineTo(W - 16, 72); x.moveTo(618, 22); x.lineTo(618, 200); x.stroke();
  for (let t = 0; t < 2; t++) {
    const y = 108 + t * 62;
    x.textAlign = 'left'; x.font = 'bold 30px "Trebuchet MS", sans-serif'; x.fillStyle = t ? '#8fc4ff' : '#ff9a8f'; x.fillText(TEAM[t].toUpperCase(), 22, y);
    x.textAlign = 'center'; x.font = 'bold 32px "Trebuchet MS", sans-serif';
    for (let i = 0; i < 9; i++) {
      const k = first + i, v = SB.line[t][k], cur = SB.live && k === SB.inning - 1 && t === SB.half;
      x.fillStyle = cur ? '#ffffff' : '#ffe27a';
      if (v != null) x.fillText(String(v), x0 + i * cw + cw / 2, y);
    }
    x.fillStyle = '#ffffff'; x.fillText(String(SB.runs[t]), 640, y); x.fillStyle = '#ffe27a'; x.fillText(String(SB.hits[t]), 684, y); x.fillText(String(SB.errs[t]), 728, y);
  }
  x.font = 'bold 24px "Trebuchet MS", sans-serif'; x.fillStyle = '#9fd3b5'; x.textAlign = 'left';
  x.fillText(SB.final ? 'FINAL' : SB.live ? `${SB.half ? 'BOTTOM' : 'TOP'} ${ORD(SB.inning).toUpperCase()}` : 'RIVERSIDE BALLPARK', 22, 244);
  if (SB.live) { x.textAlign = 'right'; x.fillText('OUT', 660, 244); for (let i = 0; i < 2; i++) { x.beginPath(); x.arc(686 + i * 34, 243, 11, 0, 7); x.fillStyle = i < SB.outs ? '#ff5a4a' : '#27463a'; x.fill(); } }
  sbTex.needsUpdate = true;
}

// ------------------------------------------------------------------ props that exist only for matches
function makeProps() {
  if (ballMesh) return;
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777 }));
  ballBlob = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); ballBlob.renderOrder = 1;
  bat = new THREE.Group(); bat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.02, 0.62, 6).translate(0, 0.27, 0), new THREE.MeshLambertMaterial({ color: 0xcfa468 }))); bat.matrixAutoUpdate = false; bat.visible = false; G.scene.add(bat);
  fx = new THREE.Group();
  zoneFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ZX, ZY0, 0), new THREE.Vector3(ZX, ZY0, 0), new THREE.Vector3(ZX, ZY1, 0), new THREE.Vector3(-ZX, ZY1, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
  zoneFrame.position.set(HX, 0, HZ); zoneFrame.renderOrder = 44;
  const ring = (r0, r1, c, o) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 24), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: o, depthTest: false })); m.renderOrder = 45; return m; };
  reticle = ring(0.085, 0.108, 0xffe066, 0.95); const dot = ring(0.001, 0.016, 0xffffff, 0.95); dot.renderOrder = 46; reticle.add(dot);
  predRing = ring(0.045, 0.06, 0xffffff, 0.85);
  fx.add(zoneFrame, reticle, predRing);
  for (const m of [ballMesh, ballBlob, fx]) { m.visible = false; G.scene.add(m); }
}

// ------------------------------------------------------------------ players
function mkP(a, team, i, def) { return { a, team, i, pos: def.pos, pow: def.pow || 1, skill: def.skill || 0.6, role: 'bench', sx: 0, sz: 0, syaw: 0, pose: '', pt: 0, sw: -1, cover: 0, sv: null }; }
function saveActor(p) {
  const a = p.a;
  p.sv = { mode: a.ai.mode, follow: a.ai.follow, x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, era: a.era, fly: a.fly, noclip: a.noclip, speedMul: a.speedMul, hidden: a.hidden, pose: a.pose };
  a.ai.mode = 'scripted'; a.ai.target = null; a.era = 'present'; a.fly = false; a.noclip = false; a.speedMul = FIELD_MUL; a.hidden = false; a.setState('idle'); a._bb = p; a.pose = poseFn;
}
function restoreActor(p) {
  const a = p.a, v = p.sv, m = a.move; if (!v) return;
  a.pose = v.pose || null; a._bb = null; a.ai.mode = v.mode; a.ai.follow = v.follow; a.ai.target = null; a.ai.node = null; a.era = v.era; a.fly = v.fly; a.noclip = v.noclip; a.speedMul = v.speedMul; a.hidden = v.hidden;
  a.setState('idle'); a.pos.set(v.x, v.y, v.z); a.vel.set(0, 0, 0); a.yaw = v.yaw; m.x = m.z = 0; m.run = m.jump = m.up = m.down = false;
  p.sv = null;
}
const setPose = (p, name) => { if (p.pose !== name) { p.pose = name; p.pt = 0; } };
function turn(a, yaw, dt) { a.yaw += angDiff(a.yaw, yaw) * Math.min(1, dt * 9); }
function faceTo(a, x, z, dt) { if (hyp(x - a.pos.x, z - a.pos.z) > 0.3) turn(a, Math.atan2(x - a.pos.x, z - a.pos.z), dt); }
function place(p, x, z, yaw) { p.a.teleport(x, z); p.a.yaw = yaw; p.sx = x; p.sz = z; p.syaw = yaw; }
function goSpot(p, dt) { const a = p.a, d = hyp(p.sx - a.pos.x, p.sz - a.pos.z); if (d > 45) a.teleport(p.sx, p.sz); else if (d > 0.35) a.steer(p.sx, p.sz, d > 3, 0.3); else turn(a, p.syaw, dt); }
function zeroMoves() { const all = S.all; for (let i = 0; i < all.length; i++) { const m = all[i].a.move; m.x = m.z = 0; m.run = m.jump = m.up = m.down = false; } }
const benchX = (team, i) => HX + (team ? 1 : -1) * (8.4 + i * 0.64), BENCH_Z = HZ - 2.9;
function toBench(p) { p.role = 'bench'; p.sx = benchX(p.team, p.i < 0 ? -2 : p.i); p.sz = BENCH_Z; p.syaw = 0; setPose(p, ''); }
// The bat lives in the scene and copies the hand's world transform every frame (the arm joint itself may be hidden under a full avatar).
function attachBat(p) { const a = p.a; batArm = a.j.armR || a.j.body; batOff = a.kind === 'human' ? -0.35 : -0.22; batRX = 1.3; }
function dropBat() { batArm = null; if (bat) bat.visible = false; }
function syncBat() { if (!batArm) return; batArm.updateWorldMatrix(true, false); bat.matrix.multiplyMatrices(batArm.matrixWorld, _m.makeRotationX(batRX).setPosition(0, batOff, 0)); bat.matrixWorldNeedsUpdate = true; bat.visible = true; }

// Extra poses layered over the default animation (runs from Actor.animate).
function poseFn(a, dt) {
  const p = a._bb; if (!p) return;
  const j = a.j, hu = a.kind === 'human', aL = j.armL, aR = j.armR; if (!aL || !aR) return;
  p.pt += dt;
  let ty = 0;
  switch (p.pose) {
    case 'bat': {
      let u = 0; if (p.sw >= 0) { p.sw += dt; u = Math.min(1, p.sw / 0.2); if (p.sw > 0.8) p.sw = -1; }
      const e = u * u * (3 - 2 * u);
      ty = lerp(-0.4, 1.9, e); aR.rotation.x = aL.rotation.x = lerp(-1.25, -1.5, e); aR.rotation.z = 0.15; aL.rotation.z = -0.6; batRX = lerp(1.3, 2.9, e);
      if (hu && j.head) j.head.rotation.y = clamp(1.35 - ty, -1.3, 1.3);
      break;
    }
    case 'pitch': {
      const u = p.pt / WIND;
      if (u < 0.55) { const k = u / 0.55; aR.rotation.x = aL.rotation.x = -2.7 * k; if (hu && j.legL) j.legL.rotation.x = -1.1 * Math.sin(k * PI * 0.5); }
      else if (u < 1) { const k = (u - 0.55) / 0.45; aR.rotation.x = lerp(-2.7, 1.1, k); aL.rotation.x = lerp(-2.7, -1.2, k); ty = -0.7 * k; if (hu && j.legL) j.legL.rotation.x = lerp(-1.1, -0.5, k); }
      else { const k = Math.min(1, (p.pt - WIND) / 0.14); aR.rotation.x = lerp(1.1, -2.3, k); aL.rotation.x = -0.4; ty = lerp(-0.7, 0.5, k); if (hu && j.torso) j.torso.rotation.x = 0.45 * k; if (p.pt > WIND + 0.7) setPose(p, 'ready'); }
      break;
    }
    case 'catch':
      aL.rotation.x = -1.45; aR.rotation.x = -0.9;
      if (hu && j.legL && j.legR) { j.legL.rotation.x = j.legR.rotation.x = -1.4; j.body.position.y = -0.27 * a.height / 1.3; if (j.torso) j.torso.rotation.x = 0.25; }
      break;
    case 'ready':
      if (a.vel.x * a.vel.x + a.vel.z * a.vel.z < 1.2) { aL.rotation.x = aR.rotation.x = -0.75; aL.rotation.z = -0.25; aR.rotation.z = 0.25; if (hu && j.torso) j.torso.rotation.x = 0.3; }
      break;
    case 'glove': aL.rotation.x = -2.9; aL.rotation.z = -0.1; break;
    case 'throw': { const k = Math.min(1, p.pt / THROW_REL); aR.rotation.x = k < 0.6 ? lerp(-0.5, 1.0, k / 0.6) : lerp(1.0, -2.4, (k - 0.6) / 0.4); ty = lerp(-0.5, 0.4, k); if (p.pt > THROW_REL + 0.35) setPose(p, ''); break; }
    default: break;
  }
  if (ty && j.body) j.body.rotation.y = ty;                 // twist the whole figure so full avatars follow too
}

// ------------------------------------------------------------------ HUD
const HIDE = ['hotbar', 'keys', 'cross'];
let el = null;
function makeHud() {
  hudEl = document.createElement('div'); hudEl.id = 'bbHud';
  hudEl.innerHTML = '<div class="bb-top"><div class="bb-inn"><b data-k="half">▲</b><span data-k="inn">1</span></div>'
    + '<div class="bb-score"><div><i class="bb-r"></i>Rockets<b data-k="a">0</b></div><div><i class="bb-c"></i>Comets<b data-k="h">0</b></div></div>'
    + '<div class="bb-dia"><i data-k="b2"></i><i data-k="b3"></i><i data-k="b1"></i></div>'
    + '<div class="bb-count"><div>B<span data-k="balls"></span></div><div>S<span data-k="str"></span></div><div>O<span data-k="outs"></span></div></div></div>'
    + '<div class="bb-msg" data-k="msg"></div><div class="bb-pitch" data-k="pitch"></div><div class="bb-hint" data-k="hint"></div>';
  document.getElementById('layer').appendChild(hudEl);
  el = {}; hudEl.querySelectorAll('[data-k]').forEach((n) => { el[n.dataset.k] = n; });
  el.b1.className = 'b1'; el.b2.className = 'b2'; el.b3.className = 'b3';
}
const dots = (n, max) => '●'.repeat(clamp(n, 0, max)) + '○'.repeat(max - clamp(n, 0, max));
function hudRefresh() {
  const s = S; s.hudDirty = false;
  el.half.textContent = s.half ? '▼' : '▲'; el.inn.textContent = String(s.inning); el.a.textContent = String(SB.runs[0]); el.h.textContent = String(SB.runs[1]);
  for (let i = 1; i <= 3; i++) el['b' + i].className = 'b' + i + (s.shown[i] ? ' on' : '');
  el.balls.textContent = dots(s.balls, 3); el.str.textContent = dots(s.strikes, 2); el.outs.textContent = dots(s.outs, 2);
  const pitching = s.half === 0 && (s.phase === 'ready' || s.phase === 'windup' || s.phase === 'pitch');
  el.pitch.style.display = pitching ? '' : 'none';
  if (pitching) el.pitch.innerHTML = PITCHES.map((p, i) => `<span${i === s.ptype ? ' class="on"' : ''}><kbd>${i + 1}</kbd>${p.name}</span>`).join('');
  el.hint.textContent = s.half === 0 ? '1–4 choose pitch · Mouse / WASD aim · Space throw · Q quit match' : 'Mouse / WASD aim · Space or click to swing · Q quit match';
}
function say(text, secs = 2.4) { if (!S || !el) return; el.msg.textContent = text; el.msg.classList.add('on'); S.msgT = secs; }

// ------------------------------------------------------------------ camera
function camFn(cam, dt) {
  const s = S; if (!s) return;
  let fov = 55;
  if (s.cam === 'bat') { camWantP.set(HX, 2.25, HZ - 2.9); camWantL.set(HX, 0.85, HZ + 8); }      // over the catcher's head
  else if (s.cam === 'pitch') { camWantP.set(HX + 0.95, 2.7, HZ + MOUND + 6); camWantL.set(HX, 0.75, HZ); fov = 24; }
  else if (s.cam === 'live') {
    const bx = s.camT.x - HX, bz = s.camT.z - HZ, d = hyp(bx, bz), k = d > 1 ? 1 / d : 0;
    camWantP.set(HX - bx * k * 6, 7 + d * 0.14, HZ - 9); camWantL.set(HX + bx * 0.8, Math.max(0.6, s.camT.y * 0.7), HZ + bz * 0.8 + 2); fov = 52;
  } else { camWantP.set(HX + 10, 9, HZ - 13); camWantL.set(HX, 0, HZ + 17); }
  if (s.camSnap) { camPos.copy(camWantP); camLook.copy(camWantL); cam.fov = fov; cam.updateProjectionMatrix(); s.camSnap = false; }
  else {
    const k = 1 - Math.exp(-dt * 4.5); camPos.lerp(camWantP, k); camLook.lerp(camWantL, Math.min(1, k * 1.6));
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 5, dt); cam.updateProjectionMatrix(); }
  }
  cam.position.copy(camPos); cam.lookAt(camLook);
}

// ------------------------------------------------------------------ start / stop
function menu() {
  if (api.active) return;
  if (G.player.vehicle || G.pc.mount) { G.toast('Hop off first — then we can play ball!'); return; }
  G.ui.choose('Riverside Ballpark', `${FULL[1]} v ${FULL[0]}. You pitch in the top of each inning and bat in the bottom.`, [
    { icon: '⚾', label: 'Quick game', sub: '3 innings', fn: () => start(3) },
    { icon: '🧢', label: 'Afternoon game', sub: '6 innings', fn: () => start(6) },
    { icon: '🏆', label: 'Full game', sub: '9 innings', fn: () => start(9) },
  ], { search: false });
}
const mkPlay = () => ({ kind: '', t: 0, n: 0, landI: 0, landT: 0, landX: 0, landZ: 0, hr: false, hrT: 0, fair: true, state: 'traj', chaser: null, ci: 0, ct: 0, cx: 0, cz: 0, willCatch: false, dropped: false, pickT: 0,
  holder: null, holdT: 0, throwing: false, throwT: 0, throwBase: 0, goBase: 0, th: { x0: 0, y0: 0, z0: 0, x1: 0, z1: 0, T: 1, t: 0, base: 0, arc: 0 }, cover: [null, null, null, null, null],
  outs: 0, runs: 0, error: false, forceOuts: 0, settle: 0, batter: null, done: false, hrSaid: false });

function start(innings = 3) {
  if (api.active) return;
  const pc = G.pc;
  if (!pc || G.era !== 'present') { G.toast('The ballpark is in present-day Hinode Town.'); return; }
  if (G.player.vehicle || pc.mount) { G.toast('Hop off first — then we can play ball!'); return; }
  const home = []; for (const d of COMETS) { const a = G.cast[d.id]; if (!a) { G.toast('The Comets are a player short today.'); return; } home.push(a); }
  makeProps();
  if (!rockets) rockets = ROCKETS.map((d, i) => {
    const a = spawnActor({ id: 'rocket' + (i + 1), cast: false, name: d.name, emoji: '🧢', era: 'present', x: benchX(0, i), z: BENCH_Z, ai: 'scripted', lines: ['East Town Rockets! Three, two, one — lift-off!', 'Nice field you have here.', 'Good game!'],
      look: { h: d.h, hair: d.hair, hairStyle: d.hairStyle, build: d.build, cap: 0xd62828, top: 0xffffff, stripe: 0xd62828, bottom: 0x2b2b3a, shoes: 0x1c1c1e } });
    a.hidden = true; return a;
  });
  const t0 = ROCKETS.map((d, i) => mkP(rockets[i], 0, i, d)), t1 = COMETS.map((d, i) => mkP(home[i], 1, i, d));
  const me = t1.find((p) => p.a === pc), ace = t1.find((p) => p.pos === 0);
  if (me && me !== ace) { ace.pos = me.pos; me.pos = 0; }                     // your own character takes the mound
  const all = [...t0, ...t1]; let spec = null; if (!me) { spec = mkP(pc, 1, -1, { pos: -1 }); all.push(spec); }
  for (const p of all) saveActor(p);
  pc.model.root.visible = true;
  SB.line = [[], []]; SB.runs = [0, 0]; SB.hits = [0, 0]; SB.errs = [0, 0]; SB.inning = 1; SB.half = 0; SB.outs = 0; SB.live = true; SB.final = false;
  S = {
    innings: Math.max(1, innings | 0), inning: 1, half: 0, outs: 0, balls: 0, strikes: 0, order: [0, 0], teams: [t0, t1], all, spec,
    onBase: [null, null, null, null], shown: [false, false, false, false], pitcher: null, catcher: null, batter: null,
    phase: 'intro', pt: 0, deadT: 1, cam: 'wide', camSnap: true, camT: new THREE.Vector3(HX, 1, HZ + 13), fov0: G.camera.fov,
    newBatter: true, over: false, paused: false, rx: 0, ry: ZCY, tx: 0, ty: ZCY, ptype: 0, lastType: -1, readyT: 0, retMode: -1,
    pitch: { on: false, type: 0, x0: 0, y0: 0, z0: 0, ax: 0, ay: 0, bx: 0, by: 0, arc: 0, T: 1, sc: 1.1, t: 0, tx: 0, ty: 0, swung: false, tc: 1e9, resolved: false, aiSwing: false, aiHit: false, aiQ: 0, aiEn: 0, aiLaunch: 0, swingAt: 0 },
    play: mkPlay(), runners: [], bx: HX, by: 1, bz: HZ, ballOn: false, msgT: 0, hudDirty: true, sbDirty: true,
  };
  for (const p of all) { toBench(p); place(p, p.sx, p.sz, 0); }
  makeHud(); for (const id of HIDE) { const n = document.getElementById(id); if (n) n.style.display = 'none'; }
  G.mode = 'baseball'; G.player.camOverride = camFn; api.active = true;
  G.ui.banner('Play ball!', `${FULL[0]} v ${FULL[1]} · ${S.innings} innings`); G.sfx('cheer');
}

function stop(finished = false) {
  if (!api.active) return;
  const s = S, away = SB.runs[0], home = SB.runs[1];
  api.active = false;
  dropBat();
  for (const p of s.all) restoreActor(p);
  if (rockets) for (const a of rockets) a.hidden = true;
  ballMesh.visible = ballBlob.visible = fx.visible = false;
  if (hudEl) { hudEl.remove(); hudEl = null; el = null; }
  for (const id of HIDE) { const n = document.getElementById(id); if (n) n.style.display = ''; }
  const cam = G.camera; cam.fov = s.fov0; cam.updateProjectionMatrix();
  G.player.camOverride = null; if (G.pc) G.player.yaw = G.pc.yaw + PI;
  G.mode = 'free'; SB.live = false; SB.final = finished === true; drawBoard();
  S = null;
  if (finished === true) G.bus.emit('baseballEnd', { home, away, won: home > away }); else G.toast('Match abandoned.');
}
function askQuit() {
  G.ui.choose('Leave the match?', 'The score will not count.', [{ icon: '⚾', label: 'Keep playing', fn: () => {} }, { icon: '🚪', label: 'Quit the match', fn: () => stop(false) }], { search: false });
}

// ------------------------------------------------------------------ game flow
function setPhase(name) { S.phase = name; S.pt = 0; S.hudDirty = true; }
function syncShown() { const s = S; for (let i = 1; i <= 3; i++) s.shown[i] = !!s.onBase[i]; s.hudDirty = true; }
function dead(secs, newBatter) { S.newBatter = newBatter; S.deadT = secs; setPhase('dead'); }

function beginHalf() {
  const s = S, bt = s.half, ft = 1 - bt;
  s.outs = s.balls = s.strikes = 0; s.onBase[1] = s.onBase[2] = s.onBase[3] = null; syncShown();
  SB.line[bt].push(0); SB.inning = s.inning; SB.half = bt; SB.outs = 0; SB.live = true; s.sbDirty = true;
  for (const p of s.teams[ft]) {
    const x = HX + SPOT[p.pos][0], z = HZ + SPOT[p.pos][1];
    p.role = 'field'; p.cover = 0; p.a.speedMul = FIELD_MUL; place(p, x, z, p.pos === 1 ? 0 : Math.atan2(HX - x, HZ - z)); setPose(p, p.pos === 1 ? 'catch' : 'ready');
    if (p.pos === 0) s.pitcher = p; else if (p.pos === 1) s.catcher = p;
  }
  for (const p of s.teams[bt]) { toBench(p); p.a.speedMul = RUN_MUL; place(p, p.sx, p.sz, 0); }
  dropBat(); s.ballOn = false; s.cam = 'wide'; s.batter = null;
  G.ui.banner(`${bt ? 'Bottom' : 'Top'} of the ${ORD(s.inning)}`, bt ? 'Comets at bat — you swing!' : 'Rockets at bat — you pitch!');
  setPhase('half');
}
// Put the defence back on its marks and the runners exactly on their bases.
function resetField() {
  const s = S;
  for (const p of s.teams[1 - s.half]) {
    const x = HX + SPOT[p.pos][0], z = HZ + SPOT[p.pos][1], yaw = p.pos === 1 ? 0 : Math.atan2(HX - x, HZ - z);
    p.role = 'field'; p.cover = 0; p.sx = x; p.sz = z; p.syaw = yaw;
    if (hyp(p.a.pos.x - x, p.a.pos.z - z) > 1.2) p.a.teleport(x, z);
    p.a.yaw = yaw; setPose(p, p.pos === 1 ? 'catch' : 'ready');
  }
  for (let i = 1; i <= 3; i++) { const p = s.onBase[i]; if (p) { p.role = 'run'; place(p, BX[i], BZ[i], Math.atan2(BX[i + 1] - BX[i], BZ[i + 1] - BZ[i])); setPose(p, ''); } }
}
function nextBatter() {
  const s = S, bt = s.half, p = s.teams[bt][s.order[bt] % 9];
  s.batter = p; s.balls = s.strikes = 0;
  p.role = 'bat'; place(p, HX + 0.8, HZ + 0.05, -PI / 2); p.sw = -1; setPose(p, 'bat'); attachBat(p);
  resetField(); say(`Now batting: ${p.a.name}`, 1.5);
  readyPitch();
}
function readyPitch() {
  const s = S, b = s.batter;
  s.cam = s.half ? 'bat' : 'pitch'; s.readyT = rnd(1.3, 2.1); s.rx = 0; s.ry = ZCY; s.pitch.on = false; s.ballOn = false; s.newBatter = false;
  if (b) { b.sw = -1; setPose(b, 'bat'); if (batArm !== (b.a.j.armR || b.a.j.body)) attachBat(b); }
  setPhase('ready');
}
function afterDead() {
  const s = S;
  if (s.half === 1 && s.inning >= s.innings && SB.runs[1] > SB.runs[0]) { finish(); return; }     // walk-off
  if (s.outs >= 3) { endHalf(); return; }
  if (s.newBatter) nextBatter(); else readyPitch();
}
function endHalf() {
  const s = S;
  if (s.half === 0) { if (s.inning >= s.innings && SB.runs[1] > SB.runs[0]) { SB.line[1].push('X'); finish(); return; } s.half = 1; }
  else { if (s.inning >= s.innings && (SB.runs[0] !== SB.runs[1] || s.inning >= s.innings + 6)) { finish(); return; } s.half = 0; s.inning++; }
  beginHalf();
}
function finish() {
  const s = S, a = SB.runs[0], h = SB.runs[1];
  s.over = true; SB.final = true; SB.live = false; s.sbDirty = true; s.cam = 'wide'; s.ballOn = false; dropBat();
  for (const p of s.all) { setPose(p, ''); if (p.team === (h >= a ? 1 : 0)) p.a.setState('cheer', 3.6); }
  G.ui.banner(h > a ? 'Comets win!' : h < a ? 'Rockets win!' : 'It\'s a tie!', `Final — ${FULL[0]} ${a} · ${FULL[1]} ${h}`); G.sfx('cheer');
  setPhase('final');
}

// ------------------------------------------------------------------ pitching and batting
function moveReticle(dt) {
  const s = S, I = G.input;
  s.rx = clamp(s.rx - I.dx * 0.0024 - I.axis('KeyA', 'KeyD') * dt * 0.95, -0.62, 0.62);
  s.ry = clamp(s.ry - I.dy * 0.0024 + I.axis('KeyS', 'KeyW') * dt * 0.95, 0.12, 1.4);
}
function updReady(dt) {
  const s = S, I = G.input;
  if (s.half === 0) {                                                        // you pitch
    for (let i = 0; i < 4; i++) if (I.hit('Digit' + (i + 1)) && s.ptype !== i) { s.ptype = i; s.hudDirty = true; G.sfx('pop', 0.04); }
    s.tx = clamp(s.tx + I.dx * 0.003 + I.axis('KeyA', 'KeyD') * dt * 0.8, -0.75, 0.75);
    s.ty = clamp(s.ty - I.dy * 0.003 + I.axis('KeyS', 'KeyW') * dt * 0.8, 0.05, 1.55);
    if (s.pt > 0.45 && (I.hit('Space') || I.clicked(0))) startWindup(s.ptype, s.tx, s.ty);
  } else {                                                                   // you bat
    moveReticle(dt);
    if (s.pt >= s.readyT) {
      const r = Math.random(), type = r < 0.42 ? 0 : r < 0.62 ? 1 : r < 0.82 ? 2 : 3; let x = rnd(-0.22, 0.22), y = rnd(ZY0 + 0.05, ZY1 - 0.05);
      if (Math.random() > 0.62 && s.balls < 3) { const e = (Math.random() * 4) | 0, o = rnd(0.06, 0.24); if (e === 0) x = -ZX - o; else if (e === 1) x = ZX + o; else if (e === 2) y = ZY0 - o; else y = ZY1 + o; }
      startWindup(type, x, y);
    }
  }
}
function startWindup(type, x, y) {
  const s = S, pi = s.pitch; pi.type = type; pi.tx = x; pi.ty = y; pi.on = false;
  s.pitcher.pose = ''; setPose(s.pitcher, 'pitch'); s.pitcher.a.yaw = PI;
  setPhase('windup');
}
function releasePitch() {
  const s = S, pi = s.pitch, pt = PITCHES[pi.type], pa = s.pitcher.a, sc = pt.sc * (s.half === 0 ? 1 : 0.8);
  pi.tx += gauss() * sc; pi.ty = Math.max(0.06, pi.ty + gauss() * sc);
  pi.x0 = HX - 0.25; pi.y0 = pa.pos.y + pa.height * 0.9; pi.z0 = HZ + MOUND - 0.8;
  pi.bx = pt.bx; pi.by = pt.by; pi.ax = HX + pi.tx - pt.bx; pi.ay = pi.ty - pt.by;
  const dist = pi.z0 - HZ; pi.T = dist / pt.speed; pi.sc = 1 + 1.25 / dist; pi.arc = 0.1 + (21 - pt.speed) * 0.035;
  pi.t = 0; pi.swung = false; pi.resolved = false; pi.tc = 1e9; pi.aiSwing = false; pi.on = true;
  if (s.half === 0) aiBatter();
  s.bx = pi.x0; s.by = pi.y0; s.bz = pi.z0; s.ballOn = true; G.sfx('pop', 0.04);
  setPhase('pitch');
}
// The computer batter decides before the ball leaves the hand: swing or take, and how well it connects.
function aiBatter() {
  const s = S, pi = s.pitch, pt = PITCHES[pi.type], sk = s.batter.skill;
  const px = pi.tx - pt.bx * 0.45, py = pi.ty - pt.by * 0.45;               // breaking balls look straighter than they are
  const inz = Math.abs(px) <= ZX && py >= ZY0 && py <= ZY1, dout = hyp(Math.max(0, Math.abs(px) - ZX), Math.max(0, ZY0 - py, py - ZY1));
  let ps = inz ? 0.72 + 0.1 * sk : 0.46 * Math.exp(-dout / 0.13) * (1.15 - 0.45 * sk);
  if (s.strikes === 2) ps += inz ? 0.24 : dout < 0.2 ? 0.14 : 0;
  if (s.balls === 3 && s.strikes < 2 && !inz) ps *= 0.55;
  if (s.balls === 0 && s.strikes === 0) ps *= 0.86;
  pi.aiSwing = Math.random() < ps; if (!pi.aiSwing) return;
  const rout = hyp(Math.max(0, Math.abs(pi.tx) - ZX), Math.max(0, ZY0 - pi.ty, pi.ty - ZY1)), dc = clamp(hyp(pi.tx / ZX, (pi.ty - ZCY) / (ZY1 - ZCY)), 0, 1.4);
  let pc = 0.66 + 0.4 * sk - pt.miss - 0.13 * dc - (rout > 0 ? 0.16 + rout * 1.3 : 0);
  if (s.lastType === pi.type) pc += 0.07; else if (s.lastType >= 0 && (pi.type === 3 || s.lastType === 3)) pc -= 0.08;
  pi.aiHit = Math.random() < pc;
  pi.aiEn = clamp(gauss() * 0.15, -0.118, 0.1);
  pi.aiQ = clamp((0.25 + 0.7 * Math.random()) * (0.6 + 0.45 * sk) - 0.22 * dc * Math.random(), 0.08, 1);
  pi.aiLaunch = -16 + 52 * Math.pow(Math.random(), 1.3);
  pi.swingAt = pi.T + pi.aiEn - SWING;
}
function doSwing() { const s = S, pi = s.pitch; pi.swung = true; pi.tc = pi.t + SWING; s.batter.sw = 0; }
function updPitch(dt) {
  const s = S, pi = s.pitch, I = G.input;
  pi.t += dt;
  const u = pi.t / pi.T;
  s.bx = pi.x0 + (pi.ax - pi.x0) * u + pi.bx * u * u; s.by = Math.max(BALL_R, pi.y0 + (pi.ay - pi.y0) * u + pi.by * u * u + pi.arc * 4 * u * (1 - u)); s.bz = pi.z0 + (HZ - pi.z0) * u;
  if (s.half === 1) { moveReticle(dt); if (!pi.swung && (I.hit('Space') || I.clicked(0))) doSwing(); }
  else if (pi.aiSwing && !pi.swung && pi.t >= pi.swingAt) doSwing();
  if (pi.swung && !pi.resolved && pi.t >= pi.tc) { pi.resolved = true; if (resolveSwing()) return; }
  if (u >= pi.sc) pitchDone();
}
// Bat meets ball? Timing sets the direction (early = pulled), aim sets the quality and the launch angle.
function resolveSwing() {
  const s = S, pi = s.pitch;
  let en, q, launch;
  if (s.half === 1) {
    en = pi.tc - pi.T;
    const d = hyp(s.rx - pi.tx, s.ry - pi.ty);
    if (Math.abs(en) > 0.125 || d > 0.36) return false;
    const k = en / 0.125; q = clamp(Math.pow(1 - d / 0.36, 0.75) * (1 - 0.7 * k * k), 0.05, 1);
    launch = 9 + (pi.ty - s.ry) / 0.36 * 38 + rnd(-5, 5);
  } else { if (!pi.aiHit) return false; en = pi.aiEn; q = pi.aiQ; launch = pi.aiLaunch; }
  hitBall((12 + 21 * q) * s.batter.pow, clamp(launch, -30, 62), -en / 0.105 * 50 + rnd(-6, 6));
  return true;
}
function pitchDone() {
  const s = S, pi = s.pitch; pi.on = false; s.ballOn = false; s.lastType = pi.type; G.sfx('thud', 0.05);
  const inz = Math.abs(pi.tx) <= ZX + 0.035 && pi.ty >= ZY0 - 0.035 && pi.ty <= ZY1 + 0.035;
  if (pi.swung || inz) {
    s.strikes++; s.hudDirty = true;
    if (s.strikes >= 3) { say(pi.swung ? 'Strike three — swinging! Batter out!' : 'Strike three — called! Batter out!'); G.sfx('pop'); batterOut(); }
    else { say(pi.swung ? `Swing and a miss — strike ${NUM[s.strikes]}!` : `Strike ${NUM[s.strikes]}!`); dead(1.3, false); }
  } else {
    s.balls++; s.hudDirty = true;
    if (s.balls >= 4) { say('Ball four — take your base!'); startPlay('walk'); } else { say(`Ball ${NUM[s.balls]}.`, 1.6); dead(1.2, false); }
  }
}
function batterOut() {
  const s = S; s.outs++; SB.outs = Math.min(s.outs, 3); s.sbDirty = true; s.hudDirty = true;
  dropBat(); toBench(s.batter); s.order[s.half]++; s.batter = null;
  dead(1.7, true);
}

// ------------------------------------------------------------------ batted ball
// Fly the ball once, ahead of time, and keep the samples (30 per second). The real ball then replays them,
// so the fielders can plan against exactly what will happen.
function simulate(x, y, z, vx, vy, vz) {
  const pl = S.play, DT = 1 / 120;
  let landed = false, rolling = false, crossed = false, stopped = false, n = 0;
  pl.hr = false; pl.hrT = 0; pl.landI = TRAJ_N - 1; pl.landX = x; pl.landZ = z;
  for (let i = 0; i < TRAJ_N; i++) {
    traj[i * 3] = x; traj[i * 3 + 1] = y; traj[i * 3 + 2] = z; n = i + 1;
    if (stopped) break;
    for (let k = 0; k < 4; k++) {
      if (!rolling) {
        const dr = KD * hyp(vx, vy, vz) * DT;
        vx -= vx * dr; vy -= vy * dr + GRAV * DT; vz -= vz * dr;
        x += vx * DT; y += vy * DT; z += vz * DT;
        if (y <= BALL_R && vy < 0) {
          if (!landed) { landed = true; pl.landI = i + 1; pl.landX = x; pl.landZ = z; }
          y = BALL_R; vy = -vy * 0.42; vx *= 0.86; vz *= 0.86;
          if (vy < 1.3) { rolling = true; vy = 0; }
        }
      } else {
        const sp = hyp(vx, vz);
        if (sp < 0.35) { vx = vz = 0; stopped = true; } else { const f = Math.max(0, sp - 3.0 * DT) / sp; vx *= f; vz *= f; x += vx * DT; z += vz * DT; }
      }
      const rx = x - HX, rz = z - HZ, r = hyp(rx, rz);
      if (r >= FENCE - 0.3 && !crossed) {
        if (!landed && y > 1.25) { crossed = true; if (rz > 0 && Math.abs(Math.atan2(rx, rz)) <= PI / 4) { pl.hr = true; pl.hrT = (i + 1) / 30; } }
        else {                                                                // off the fence (it plays as a wall once the ball has bounced)
          if (!landed) { landed = true; pl.landI = i + 1; pl.landX = x; pl.landZ = z; }
          const nx = rx / r, nz = rz / r, vn = vx * nx + vz * nz; if (vn > 0) { vx -= 1.35 * vn * nx; vz -= 1.35 * vn * nz; }
          x = HX + nx * (FENCE - 0.3); z = HZ + nz * (FENCE - 0.3);
        }
      }
    }
  }
  pl.n = Math.max(2, n); pl.landI = Math.min(pl.landI, pl.n - 1); pl.landT = pl.landI / 30;
  pl.fair = pl.hr || (pl.landZ - HZ > 0 && Math.abs(Math.atan2(pl.landX - HX, pl.landZ - HZ)) <= PI / 4 + 0.005);
}
function ballAt(t) {
  const s = S, n = s.play.n, f = clamp(t * 30, 0, n - 1), i = Math.min(n - 2, f | 0), k = f - i, o = i * 3;
  s.bx = traj[o] + (traj[o + 3] - traj[o]) * k; s.by = traj[o + 1] + (traj[o + 4] - traj[o + 1]) * k; s.bz = traj[o + 2] + (traj[o + 5] - traj[o + 2]) * k;
}
function hitBall(exit, launch, spray) {
  const s = S, pi = s.pitch, pl = s.play, la = launch * PI / 180, az = spray * PI / 180, ch = Math.cos(la) * exit;
  pi.on = false; s.lastType = pi.type; G.sfx('hit', 0.12);
  simulate(s.bx, Math.max(0.3, s.by), clamp(s.bz, HZ - 0.4, HZ + 0.9), Math.sin(az) * ch, Math.sin(la) * exit, Math.cos(az) * ch);
  s.cam = 'live'; s.camT.set(s.bx, s.by, s.bz); pl.t = 0;
  if (!pl.fair) { setPhase('foul'); return; }
  startPlay(pl.hr ? 'hr' : 'ball');
}
function updFoul(dt) {
  const s = S, pl = s.play;
  pl.t += dt; ballAt(pl.t); s.camT.set(s.bx, s.by, s.bz);
  if (pl.t > Math.min(pl.landT + 0.35, 2.2)) { s.ballOn = false; if (s.strikes < 2) s.strikes++; say('Foul ball!', 1.6); dead(1.1, false); }
}

// ------------------------------------------------------------------ a ball in play
const mkRunner = (p, at) => ({ p, at, to: at, forced: false, out: false, scored: false, hold: false, wait: 0, margin: rnd(0, 0.4) });
const throwSpeed = (d) => clamp(19 - d * 0.1, 14.5, 18);
const COVX = [0, 0, 0, 0, 0], COVZ = [0, 0, 0, 0, 0];
for (let b = 1; b <= 4; b++) { const dx = HX - BX[b], dz = HZ + BD * Q - BZ[b], d = hyp(dx, dz) || 1; COVX[b] = BX[b] + dx / d * 0.6; COVZ[b] = BZ[b] + dz / d * 0.6; }
function fielderAt(k) { const F = S.teams[1 - S.half]; for (let i = 0; i < F.length; i++) if (F[i].pos === k) return F[i]; return null; }

function startPlay(kind) {
  const s = S, pl = s.play, bt = s.half, b = s.batter, R = s.runners;
  pl.kind = kind; pl.t = 0; pl.state = kind === 'walk' ? 'dead' : 'traj'; pl.chaser = null; pl.holder = null; pl.holdT = 0; pl.throwing = false; pl.goBase = 0; pl.willCatch = false; pl.dropped = false; pl.pickT = 0;
  pl.outs = 0; pl.runs = 0; pl.error = false; pl.forceOuts = 0; pl.settle = 0; pl.done = false; pl.hrSaid = false;
  for (let i = 0; i < 5; i++) pl.cover[i] = null;
  R.length = 0;
  for (let i = 3; i >= 1; i--) if (s.onBase[i]) R.push(mkRunner(s.onBase[i], i));          // lead runner first
  const br = mkRunner(b, 0); br.to = 1; br.forced = true; br.wait = 0.3; R.push(br); pl.batter = br;
  for (let i = 1, f = true; i <= 3; i++) { const r = R.find((o) => o.at === i); if (r && f) { r.forced = true; r.to = i + 1; } else f = false; }
  dropBat(); b.role = 'run'; setPose(b, ''); s.order[bt]++;
  for (const f of s.teams[1 - bt]) { f.cover = 0; setPose(f, ''); }
  if (kind === 'walk') s.ballOn = false;
  else if (kind === 'hr') { for (const r of R) r.to = r.at + 1; }
  else {
    assignChaser(); assignCovers();
    if (pl.willCatch && s.outs < 2) for (const r of R) if (r !== br) { r.hold = true; r.to = r.at; }
  }
  setPhase('live');
}
// Who gets to the ball first, and where? Walk the stored flight and find the earliest reachable sample.
function assignChaser() {
  const s = S, pl = s.play, F = s.teams[1 - s.half], n = pl.n;
  let bestT = 1e9, best = null, bestI = n - 1;
  for (const f of F) {
    if (f.pos === 1) continue;
    const a = f.a, sp = a.runSpeed * a.speedMul * (f.pos >= 6 ? 0.8 : 0.76), react = f.pos === 0 ? 0.6 : 0.5;
    for (let i = 3; i < n; i++) {
      const t = i / 30; if (t >= bestT) break;
      if (traj[i * 3 + 1] > 1.8) continue;
      if (hyp(traj[i * 3] - a.pos.x, traj[i * 3 + 2] - a.pos.z) <= sp * Math.max(0, t - react) + 0.5) { bestT = t; best = f; bestI = i; break; }
    }
  }
  if (!best) { let bd = 1e9; const o = (n - 1) * 3; for (const f of F) { if (f.pos === 1) continue; const d = hyp(traj[o] - f.a.pos.x, traj[o + 2] - f.a.pos.z); if (d < bd) { bd = d; best = f; } } bestI = n - 1; }
  pl.chaser = best; pl.ci = bestI; pl.ct = bestI / 30; pl.cx = traj[bestI * 3]; pl.cz = traj[bestI * 3 + 2];
  pl.willCatch = bestI < pl.landI;
}
function assignCovers() {
  const pl = S.play;
  const take = (a, b2, c) => { for (const k of [a, b2, c]) { if (k < 0) continue; const f = fielderAt(k); if (f && f !== pl.chaser && !f.cover) return f; } return null; };
  const set = (b, f) => { if (f) { f.cover = b; pl.cover[b] = f; } };
  set(4, fielderAt(1)); set(1, take(2, 0, 3));
  if (pl.cx < HX) set(2, take(5, 3, -1)); else set(2, take(3, 5, -1));
  set(3, take(4, 5, 0));
}
function releaseHolds() { for (const r of S.runners) if (r.hold) { r.hold = false; if (r.forced) r.to = r.at + 1; } }
function secure(f) { const pl = S.play; pl.state = 'held'; pl.holder = f; pl.chaser = null; pl.holdT = 0.3; pl.throwing = false; pl.goBase = 0; setPose(f, ''); G.sfx('pop'); }
function chargeError() { const s = S; s.play.error = true; SB.errs[1 - s.half]++; s.sbDirty = true; }
function putOut(r, text) {
  const s = S, pl = s.play, bt = s.half, wasForced = r.forced;
  r.out = true; s.outs++; pl.outs++; SB.outs = Math.min(3, s.outs); s.sbDirty = s.hudDirty = true; toBench(r.p);
  if (r !== pl.batter && wasForced) pl.forceOuts++;
  for (const o of s.runners) if (!o.out && !o.scored && o.to > r.to) o.forced = false;      // the force is off for everyone ahead
  if (s.outs >= 3) {
    if (wasForced && pl.runs > 0) { SB.runs[bt] -= pl.runs; SB.line[bt][SB.line[bt].length - 1] -= pl.runs; pl.runs = 0; }   // no run scores on an inning-ending force
    say(pl.outs >= 3 ? 'Triple play!' : pl.outs === 2 ? 'Double play! Three outs!' : `${text} Three outs!`, 2.2); endPlay();
  } else say(pl.outs >= 2 ? 'Double play!' : text);
}
function scoreRun(r) {
  const s = S, pl = s.play, bt = s.half;
  r.scored = true; r.at = 4; r.to = 4; SB.runs[bt]++; SB.line[bt][SB.line[bt].length - 1]++; pl.runs++; s.sbDirty = s.hudDirty = true; toBench(r.p); G.sfx('cheer');
  if (pl.kind !== 'hr') say(pl.kind === 'walk' ? 'A run walks in!' : 'Run scores!', 1.8);
}
function tryField() {
  const s = S, pl = s.play, c = pl.chaser; if (!c || pl.t < pl.pickT) return;
  const a = c.a, d = hyp(s.bx - a.pos.x, s.bz - a.pos.z);
  if (!((pl.t >= pl.ct - 0.04 && d < 1.4 && s.by < 2.3) || (pl.t > pl.ct && d < 1.1 && s.by < 2.0))) return;
  if (pl.willCatch && !pl.dropped && pl.t < pl.landT) {                       // caught on the fly
    if (Math.random() < 0.03) { pl.dropped = true; pl.pickT = pl.landT + 0.45; chargeError(); say('Dropped it — error!'); G.sfx('thud'); releaseHolds(); return; }
    secure(c);
    const br = pl.batter; for (const r of s.runners) { r.hold = false; if (r !== br) r.forced = false; }
    putOut(br, hyp(a.pos.x - HX, a.pos.z - HZ) > 28 ? 'Fly ball — caught! Out!' : 'Caught! Out!');
    return;
  }
  secure(c);
}
// With the ball in hand: where is the play?
function decide(h) {
  const s = S, pl = s.play, a = h.a, R = s.runners;
  let best = 0, lead = 0;
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; if (r.out || r.scored || r.to === r.at) continue;
    const b = r.to, ra = r.p.a, dB = hyp(a.pos.x - BX[b], a.pos.z - BZ[b]);
    if (b > lead) lead = b;
    const tRun = hyp(ra.pos.x - BX[b], ra.pos.z - BZ[b]) / (ra.runSpeed * ra.speedMul) + Math.max(0, r.wait);
    const tBall = dB < 1.7 ? 0 : (pl.cover[b] === h || dB < 4) ? dB / (a.runSpeed * a.speedMul) + 0.1 : THROW_REL + dB / throwSpeed(dB) + 0.05;
    if (tBall < tRun - 0.05 && b > best) best = b;
  }
  if (best) return best;
  if (lead) return lead;                                                       // nobody can be caught: throw ahead of the lead runner
  return hyp(a.pos.x - HX, a.pos.z - HZ) > 30 ? 2 : 0;                         // quiet play: get the ball back to the infield
}
function holderLogic(dt) {
  const s = S, pl = s.play, h = pl.holder, a = h.a, R = s.runners;
  s.bx = a.pos.x + Math.sin(a.yaw) * 0.25; s.by = a.pos.y + a.height * 0.72; s.bz = a.pos.z + Math.cos(a.yaw) * 0.25;
  for (let b = 1; b <= 4; b++) {                                               // putouts: ball on the bag before the runner
    if (hyp(a.pos.x - BX[b], a.pos.z - BZ[b]) > 1.7) continue;
    for (let i = 0; i < R.length; i++) {
      const r = R[i]; if (r.out || r.scored || r.to !== b || r.at === b) continue;
      if (r.forced) putOut(r, b === 1 ? 'Out at first!' : b === 4 ? 'Out at home!' : b === 2 ? 'Force out at second!' : 'Force out at third!');
      else if (hyp(r.p.a.pos.x - BX[b], r.p.a.pos.z - BZ[b]) < 2.2) putOut(r, 'Tagged out!');
      else continue;
      if (pl.done) return;
      pl.holdT = Math.min(pl.holdT, 0.08);
    }
  }
  if (pl.throwing) { pl.throwT -= dt; faceTo(a, BX[pl.throwBase], BZ[pl.throwBase], dt); if (pl.throwT <= 0) launchThrow(); return; }
  if (pl.goBase) {
    const b = pl.goBase; let need = false;
    for (let i = 0; i < R.length; i++) { const r = R[i]; if (!r.out && !r.scored && r.to === b && r.at !== b) need = true; }
    if (!need || a.steer(BX[b], BZ[b], true, 0.9)) pl.goBase = 0;
    return;
  }
  pl.holdT -= dt; if (pl.holdT > 0) return;
  const b = decide(h);
  if (!b) { pl.holdT = 0.2; return; }
  const dB = hyp(a.pos.x - BX[b], a.pos.z - BZ[b]);
  if (dB < 1.7) { pl.holdT = 0.15; return; }                                   // already on the bag: wait for the runner
  if (pl.cover[b] === h || dB < 4 || !pl.cover[b]) { pl.goBase = b; return; }  // take it there yourself
  pl.throwing = true; pl.throwT = pl.outs > 0 ? 0.3 : THROW_REL; pl.throwBase = b; h.pose = ''; setPose(h, 'throw');
}
function launchThrow() {
  const s = S, pl = s.play, th = pl.th, b = pl.throwBase, d = hyp(s.bx - BX[b], s.bz - BZ[b]);
  th.x0 = s.bx; th.y0 = s.by; th.z0 = s.bz; th.x1 = BX[b]; th.z1 = BZ[b]; th.T = Math.max(0.12, d / throwSpeed(d)); th.t = 0; th.base = b; th.arc = Math.min(5, d * d * 0.0022 + 0.1);
  pl.state = 'thrown'; pl.holder = null; pl.throwing = false; G.sfx('pop', 0.04);
}
function throwLogic(dt) {
  const s = S, pl = s.play, th = pl.th;
  th.t += dt; const u = Math.min(1, th.t / th.T);
  s.bx = lerp(th.x0, th.x1, u); s.bz = lerp(th.z0, th.z1, u); s.by = lerp(th.y0, 1.0, u) + th.arc * 4 * u * (1 - u);
  if (u < 1) return;
  const f = pl.cover[th.base];
  if (f && hyp(f.a.pos.x - th.x1, f.a.pos.z - th.z1) < 2.6) {
    if (Math.random() < 0.022) {                                               // wild throw: it skips past the bag
      const d = hyp(th.x1 - th.x0, th.z1 - th.z0) || 1; s.bx = th.x1 + (th.x1 - th.x0) / d * 3.5; s.bz = th.z1 + (th.z1 - th.z0) / d * 3.5; s.by = BALL_R;
      pl.state = 'loose'; pl.pickT = pl.t + 0.5; chargeError(); say('Wild throw — error!'); G.sfx('thud');
    } else { secure(f); pl.holdT = 0.08; }
  } else { pl.state = 'loose'; s.by = BALL_R; pl.pickT = pl.t; }
}
function looseLogic() {
  const s = S, pl = s.play, F = s.teams[1 - s.half];
  let best = null, bd = 1e9;
  for (let i = 0; i < F.length; i++) { const d = hyp(F[i].a.pos.x - s.bx, F[i].a.pos.z - s.bz); if (d < bd) { bd = d; best = F[i]; } }
  pl.chaser = best;
  if (best && bd < 1.2 && pl.t >= pl.pickT) secure(best);
}
function fielderMove(f, dt) {
  const s = S, pl = s.play, a = f.a;
  if (pl.kind !== 'ball') { goSpot(f, dt); return; }
  if (f === pl.holder) return;
  if (f === pl.chaser) {
    if (pl.state === 'loose' || pl.t > pl.ct + 0.05) a.steer(s.bx, s.bz, true, 0.5);
    else if (a.steer(pl.cx, pl.cz, true, 0.3)) faceTo(a, s.bx, s.bz, dt);
    setPose(f, pl.state === 'traj' && pl.willCatch && !pl.dropped && pl.ct - pl.t < 0.9 ? 'glove' : '');
    return;
  }
  if (f.cover) { if (a.steer(COVX[f.cover], COVZ[f.cover], true, 0.45)) faceTo(a, s.bx, s.bz, dt); return; }
  if (pl.state === 'traj' && f.pos >= 6 && hyp(pl.cx - a.pos.x, pl.cz - a.pos.z) > 7) a.steer(pl.cx, pl.cz, true, 6); else faceTo(a, s.bx, s.bz, dt);   // back up the play
}
// How long until the defence could have the ball at base b?
function ballTime(b) {
  const s = S, pl = s.play;
  if (pl.state === 'traj') { const d = hyp(pl.cx - BX[b], pl.cz - BZ[b]); return Math.max(0, Math.max(pl.ct, pl.pickT) - pl.t) + THROW_REL + d / throwSpeed(d); }
  if (pl.state === 'held') { const a = pl.holder.a, d = hyp(a.pos.x - BX[b], a.pos.z - BZ[b]); return d < 2 ? 0 : THROW_REL + d / throwSpeed(d); }
  if (pl.state === 'thrown') { const th = pl.th, rem = th.T - th.t; if (th.base === b) return rem; const d = hyp(th.x1 - BX[b], th.z1 - BZ[b]); return rem + 0.35 + d / throwSpeed(d); }
  if (pl.state === 'loose') { const d = hyp(s.bx - BX[b], s.bz - BZ[b]); return 1 + d / throwSpeed(d); }
  return 0;
}
function wantsNext(r) {
  const pl = S.play, R = S.runners, nb = r.at + 1, a = r.p.a;
  if (pl.state === 'traj' && pl.willCatch && !pl.dropped) return false;        // tag up: wait to see the catch
  for (let i = 0; i < R.length; i++) { const o = R[i]; if (o !== r && !o.out && !o.scored && o.to === nb) return false; }
  return hyp(a.pos.x - BX[nb], a.pos.z - BZ[nb]) / (a.runSpeed * a.speedMul) + 0.1 + r.margin < ballTime(nb);
}
function stepRunners(dt) {
  const s = S, pl = s.play, R = s.runners;
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; if (r.out || r.scored) continue;
    const a = r.p.a;
    if (r.wait > 0) { r.wait -= dt; continue; }
    if (r.to === r.at) {
      if (r.at >= 1 && !r.hold && pl.kind === 'ball' && wantsNext(r)) r.to = r.at + 1;
      else { if (r.at >= 1) faceTo(a, BX[r.at + 1], BZ[r.at + 1], dt); continue; }
    }
    if (a.steer(BX[r.to], BZ[r.to], true, 0.75)) {
      r.at = r.to; r.forced = false; s.hudDirty = true;
      if (r.at >= 4) { scoreRun(r); continue; }
      if (pl.state === 'thrown' && pl.th.base === r.at) say('Safe!', 1.5);
      if (pl.kind === 'hr') r.to = r.at + 1;
    }
  }
  for (let b = 1; b <= 3; b++) { let on = false; for (let i = 0; i < R.length; i++) { const r = R[i]; if (!r.out && !r.scored && r.at === b) on = true; } if (s.shown[b] !== on) { s.shown[b] = on; s.hudDirty = true; } }
}
function updLive(dt) {
  const s = S, pl = s.play, F = s.teams[1 - s.half], R = s.runners;
  pl.t += dt;
  if (pl.kind !== 'walk') {
    if (pl.state === 'traj') {
      ballAt(pl.t);
      if (pl.kind === 'hr') { if (!pl.hrSaid && pl.t >= pl.hrT) { pl.hrSaid = true; say('HOME RUN!', 3.5); G.sfx('cheer'); for (const p of s.teams[s.half]) if (p.role === 'bench') p.a.setState('cheer', 2.5); } }
      else { if (pl.willCatch && !pl.dropped && pl.t > pl.landT) { pl.willCatch = false; releaseHolds(); } tryField(); }
    } else if (pl.state === 'held') holderLogic(dt);
    else if (pl.state === 'thrown') throwLogic(dt);
    else if (pl.state === 'loose') looseLogic();
    if (pl.done) return;
  }
  for (let i = 0; i < F.length; i++) fielderMove(F[i], dt);
  stepRunners(dt);
  if (pl.kind === 'hr' && pl.t > pl.landT + 0.6) { const a = pl.batter.p.a; s.camT.set(a.pos.x, 1, a.pos.z); } else if (pl.kind !== 'walk') s.camT.set(s.bx, s.by, s.bz);
  // is the play over?
  let running = false, alive = false;
  for (let i = 0; i < R.length; i++) { const r = R[i]; if (r.out || r.scored) continue; alive = true; if (r.to !== r.at || r.wait > 0) running = true; }
  if (pl.kind === 'hr') { if (!alive || pl.t > 18) endPlay(); }
  else if (pl.kind === 'walk') { if ((!running && pl.t > 0.4) || pl.t > 9) endPlay(); }
  else if (pl.t > 24) endPlay();
  else if (pl.state === 'held' && !pl.throwing && !pl.goBase && !running) { pl.settle += dt; if (pl.settle > 0.6) endPlay(); }
  else pl.settle = 0;
}
function endPlay() {
  const s = S, pl = s.play, R = s.runners, bt = s.half, br = pl.batter;
  if (pl.done) return; pl.done = true;
  s.onBase[1] = s.onBase[2] = s.onBase[3] = null;
  for (const r of R) {
    if (r.out || r.scored) continue;
    if (s.outs >= 3) { toBench(r.p); continue; }
    if (r.to !== r.at) { r.at = r.to; if (r.at >= 4) { scoreRun(r); continue; } }      // only on a timeout: finish the base they were running to
    if (r.at >= 1 && r.at <= 3) s.onBase[r.at] = r.p;
  }
  if (pl.kind === 'hr') SB.hits[bt]++;
  else if (pl.kind === 'ball' && (br.scored || br.at >= 1) && !pl.error && !pl.forceOuts) {
    SB.hits[bt]++; if (!pl.outs) say(br.scored ? 'Inside-the-park home run!' : br.at === 3 ? 'Triple!' : br.at === 2 ? 'Double!' : 'Base hit!');
  } else if (pl.kind === 'ball' && !br.out && !pl.outs) say(pl.error ? 'Safe on the error!' : 'Fielder\'s choice.');
  for (const f of s.teams[1 - bt]) { f.cover = 0; setPose(f, f.pos === 1 ? 'catch' : 'ready'); }
  s.ballOn = false; s.batter = null; syncShown(); s.sbDirty = true;
  dead(s.outs >= 3 ? 1.9 : 1.6, true);
}

// ------------------------------------------------------------------ per-frame entry point
function update(dt) {
  if (!api.active) return;
  const s = S, I = G.input;
  if (G.ui.modal || G.ui.fading) { if (!s.paused) { s.paused = true; zeroMoves(); } return; }
  s.paused = false; zeroMoves();
  if (I.hit('KeyQ') && s.phase !== 'final') { askQuit(); return; }
  s.pt += dt;
  if (s.msgT > 0) { s.msgT -= dt; if (s.msgT <= 0) el.msg.classList.remove('on'); }
  switch (s.phase) {
    case 'intro': if (s.pt > 2.4) beginHalf(); break;
    case 'half': if (s.pt > 2.2) nextBatter(); break;
    case 'ready': updReady(dt); break;
    case 'windup': if (s.half === 1) moveReticle(dt); if (s.pt >= WIND) releasePitch(); break;
    case 'pitch': updPitch(dt); break;
    case 'foul': updFoul(dt); break;
    case 'live': updLive(dt); break;
    case 'dead': if (s.pt >= s.deadT) afterDead(); break;
    case 'final': if (s.pt > 4.2) { stop(true); return; } break;
    default: setPhase('dead'); break;
  }
  // anyone without a job drifts back to their mark
  const all = s.all, live = s.phase === 'live';
  for (let i = 0; i < all.length; i++) { const p = all[i]; if (p.role === 'bench' || (p.role === 'field' && !live)) goSpot(p, dt); }
  // bat, ball + aiming marks
  syncBat();
  ballMesh.visible = ballBlob.visible = s.ballOn;
  if (s.ballOn) {
    ballMesh.position.set(s.bx, s.by, s.bz);
    const k = s.cam === 'live' ? clamp(G.camera.position.distanceTo(ballMesh.position) / 14, 1, 6) : 1;
    ballMesh.scale.setScalar(k); ballBlob.position.set(s.bx, 0.09, s.bz); ballBlob.scale.setScalar(k);
  }
  const aim = s.phase === 'ready' || s.phase === 'windup' || s.phase === 'pitch';
  fx.visible = aim;
  if (aim) {
    const pi = s.pitch;
    if (s.retMode !== s.half) { s.retMode = s.half; reticle.material.color.setHex(s.half ? 0xffe066 : 0x6fe3ff); }
    if (s.half === 0) { reticle.position.set(HX + s.tx, s.ty, HZ); predRing.visible = false; }
    else { reticle.position.set(HX + s.rx, s.ry, HZ); predRing.visible = pi.on && pi.t / pi.T > 0.4; if (predRing.visible) predRing.position.set(HX + pi.tx, pi.ty, HZ); }
  }
  if (s.hudDirty) hudRefresh();
  if (s.sbDirty) { s.sbDirty = false; drawBoard(); }
}

export function init(g) {
  const era = g.eras.present; if (!era) return;
  buildField(era);
  era.interact.push({ id: 'ballgame', x: HX, y: 0, z: HZ - 3, r: 5, label: 'Play a baseball match', icon: '⚾', fn: () => g.baseball.menu() });
  g.baseball = api;
}

