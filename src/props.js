// Reusable scenery pieces. All take a Batch `b` and draw in its current local frame.
// b.height(wx,wz) (if set) gives terrain height so things sit on slopes.
import * as THREE from 'three';
import { signTexture } from './textures.js';

const GREENS = [0x4f8f3a, 0x5c9c42, 0x6aa84c, 0x478236, 0x79b356];
export function gy(b, x, z) { if (!b.height) return 0; const p = b.w(x, 0, z); return b.height(p.x, p.z) - b.m.elements[13]; }

const _col = new THREE.Color();
// A cloud of leaf cards on an ellipsoid shell. Each card is a small alpha-cut spray of leaves;
// normals point outward so the whole crown shades like one soft volume.
export function leafCards(b, R, cx, cy, cz, rx, ry, rz, n, size, pal) {
  if (!b.mats.leafcard) return;
  const P = [], N = [], U = [], C = [], I = [];
  for (let i = 0; i < n; i++) {
    const a = R() * 6.2832, dy = R() * 1.5 - 0.5, sxy = Math.sqrt(Math.max(0.05, 1 - Math.min(1, dy * dy))), dx = Math.cos(a) * sxy, dz = Math.sin(a) * sxy, k = 0.6 + R() * 0.42;
    const px = cx + dx * rx * k, py = cy + dy * ry * k, pz = cz + dz * rz * k;
    let nx = dx + (R() - 0.5) * 0.9, ny = dy + (R() - 0.5) * 0.9, nz = dz + (R() - 0.5) * 0.9, l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let tx = nz, tz = -nx; l = Math.hypot(tx, tz); if (l < 0.01) { tx = 1; tz = 0; l = 1; } tx /= l; tz /= l;
    const bx = ny * tz, by = nz * tx - nx * tz, bz = -ny * tx, h = size * (0.7 + R() * 0.6) * 0.5, rot = R() * 6.28, cr = Math.cos(rot), sr = Math.sin(rot);
    const ux = (tx * cr + bx * sr) * h, uy = by * sr * h, uz = (tz * cr + bz * sr) * h, vx = (bx * cr - tx * sr) * h, vy = by * cr * h, vz = (bz * cr - tz * sr) * h, base = P.length / 3;
    P.push(px - ux - vx, py - uy - vy, pz - uz - vz, px + ux - vx, py + uy - vy, pz + uz - vz, px + ux + vx, py + uy + vy, pz + uz + vz, px - ux + vx, py - uy + vy, pz - uz + vz);
    _col.set(R.pick(pal)).multiplyScalar((0.58 + 0.42 * Math.min(1, Math.max(0, dy * 0.6 + 0.5))) * (0.88 + R() * 0.24));
    let mx = dx * 0.8, my = dy * 0.8 + 0.4, mz = dz * 0.8; l = Math.hypot(mx, my, mz) || 1; mx /= l; my /= l; mz /= l;
    for (let q = 0; q < 4; q++) { N.push(mx, my, mz); C.push(_col.r, _col.g, _col.b); }
    U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  b.add('leafcard', g);
}
const CROWN = { round: [GREENS, 0x2f5f26], cherry: [[0xf6b8cf, 0xf9cfe0, 0xf3a9c4, 0xfff0f5], 0xc9839f], ginkgo: [[0xe9c53a, 0xf0d254, 0xdbb42c, 0xf6e27a], 0xa8861e] };
export function tree(b, R, x, z, s = 1, kind = 'round', solid = true) {
  const y = gy(b, x, z);
  if (kind === 'pine') {
    const th = 5.4 * s; b.cyl('bark', x, y + th / 2, z, 0.06 * s, 0.2 * s, th, 0xffffff, 7);
    const pal = [0x2f6a3a, 0x356f3f, 0x2a5f35, 0x3d7a45];
    for (let i = 0; i < 4; i++) { const ty = y + (1.5 + i * 1.08) * s, rr = (1.8 - i * 0.4) * s; b.cone('leaf', x, ty + 0.35 * s, z, rr * 0.7, 1.5 * s, 0x224a29, 6); leafCards(b, R, x, ty + 0.1 * s, z, rr, 0.6 * s, rr, Math.round((16 - i * 2) * (solid ? 1 : 0.5)), 1.2 * s * (solid ? 1 : 1.35), pal); }
  } else {
    const th = (2.0 + R() * 0.8) * s, [pal, core] = CROWN[kind] || CROWN.round, r = (1.45 + R() * 0.5) * s, cy = y + th + r * 0.5, ls = 1.3 * Math.pow(s, 0.75) * (solid ? 1 : 1.35), dens = Math.min(1.5, Math.max(0.7, s)) * (solid ? 1 : 0.5);
    b.cyl('bark', x, y + th / 2 + 0.2 * s, z, 0.14 * s, 0.26 * s, th + 0.4 * s, 0xffffff, solid ? 8 : 5);
    if (solid) for (let i = 0; i < 3; i++) { const a = R() * 6.2832, bl = r * 0.95; b.cyl('bark', x + Math.cos(a) * bl * 0.3, y + th + bl * 0.28, z + Math.sin(a) * bl * 0.3, 0.035 * s, 0.085 * s, bl, 0xffffff, 5, Math.sin(a) * 0.75, -Math.cos(a) * 0.75); }
    b.ico('leaf', x, cy, z, r * 0.66, core, 1, 0.85, 1, 0, R() * 6); leafCards(b, R, x, cy, z, r, r * 0.86, r, Math.round(44 * dens), ls, pal);
    for (const [ox, oy, oz, k] of [[0.68, -0.25, 0.2, 0.62], [-0.6, -0.15, -0.35, 0.68]]) { b.ico('leaf', x + r * ox, cy + r * oy, z + r * oz, r * k * 0.62, core, 1, 0.85, 1, 0, R() * 6); leafCards(b, R, x + r * ox, cy + r * oy, z + r * oz, r * k, r * k * 0.85, r * k, Math.round(18 * dens), ls * 0.9, pal); }
  }
  if (solid) b.solid(x, z, 0.5 * s, 0.5 * s, y, y + 2.2 * s, 'tree', false);
}
export function bush(b, R, x, z, s = 1, c) {
  const y = gy(b, x, z); c ??= R.pick(GREENS);
  b.ico('leaf', x, y + 0.4 * s, z, 0.5 * s, 0x35632b, 1.15, 0.8, 1, 1, R() * 6);
  leafCards(b, R, x, y + 0.42 * s, z, 0.72 * s, 0.55 * s, 0.66 * s, 12, 0.62 * s, [c, c, R.pick(GREENS)]);
}
export function flowers(b, ...a) { const was = b.det; b.det = true; flowersRaw(b, ...a); b.det = was; }
function flowersRaw(b, R, x, z, n = 6, spread = 0.8) {
  const cs = [0xf25a7a, 0xf7d84a, 0xffffff, 0xc77dff, 0xff9f43, 0x6fb8ff];
  for (let i = 0; i < n; i++) { const fx = x + R.range(-spread, spread), fz = z + R.range(-spread, spread), y = gy(b, fx, fz); b.cyl('plain', fx, y + 0.12, fz, 0.012, 0.012, 0.24, 0x3f8f3a, 4); b.ico('plain', fx, y + 0.27, fz, 0.07, R.pick(cs), 1, 0.6, 1, 0); }
}
export function pot(b, ...a) { const was = b.det; b.det = true; potRaw(b, ...a); b.det = was; }
function potRaw(b, R, x, z) { b.cyl('plain', x, 0.16, z, 0.17, 0.12, 0.32, R.pick([0xb5633f, 0x8a6a4a, 0xd9d2c4]), 8); b.ico('leaf', x, 0.5, z, 0.25, R.pick(GREENS), 1, 1, 1, 1); if (R() < 0.6) b.ico('plain', x + 0.05, 0.68, z, 0.07, R.pick([0xf25a7a, 0xf7d84a, 0xffffff]), 1, 1, 1, 0); }
export function bench(b, x, z, ry = 0, c = 0x9b6b3f) {
  b.push(x, gy(b, x, z), z, ry);
  for (let i = 0; i < 3; i++) b.box('wood', 0, 0.45, -0.15 + i * 0.15, 1.6, 0.04, 0.12, c);
  b.box('wood', 0, 0.72, -0.26, 1.6, 0.12, 0.04, c); b.box('wood', 0, 0.9, -0.28, 1.6, 0.12, 0.04, c);
  for (const sx of [-0.7, 0.7]) { b.box('plain', sx, 0.22, 0, 0.06, 0.44, 0.4, 0x3a3f45); b.box('plain', sx, 0.7, -0.27, 0.06, 0.52, 0.05, 0x3a3f45); }
  b.solid(0, -0.05, 1.6, 0.5, 0, 0.5, 'bench');
  b.pop();
}
export function lamp(b, x, z, h = 4.2) {
  const y = gy(b, x, z);
  b.cyl('plain', x, y + h / 2, z, 0.05, 0.08, h, 0x4a5058, 6);
  b.sph('glow', x, y + h + 0.12, z, 0.2, 0xfff3c4, 1, 1, 1, 8, 6);
  b.cyl('plain', x, y + h + 0.3, z, 0.26, 0.26, 0.05, 0x4a5058, 8);
  b.solid(x, z, 0.2, 0.2, y, y + h, 'pole', false);
}
export function vending(b, x, z, ry = 0, c = 0xe9eef2) {
  b.push(x, 0, z, ry);
  b.box('plain', 0, 0.92, 0, 1.0, 1.84, 0.7, c); b.quad('vend', 0, 0.92, 0.36, 0.96, 1.8, 0xffffff);
  b.solid(0, 0, 1.0, 0.7, 0, 1.84, 'vend');
  b.pop();
}
// A small parked kei-car made of boxes (scenery only).
export function parkedCar(b, R, x, z, ry = 0) {
  const c = R.pick([0xf2f2f2, 0xd94f4f, 0x4f79d9, 0xe9c53a, 0x7fbf7f, 0x6b6f78, 0xf08a2c]);
  b.push(x, 0, z, ry);
  b.box('plain', 0, 0.55, 0, 1.5, 0.6, 3.2, c); b.box('plain', 0, 1.1, -0.15, 1.4, 0.55, 2.0, c);
  b.box('plain', 0, 1.12, -0.15, 1.42, 0.38, 1.8, 0x2a3440); b.box('plain', 0, 1.12, -0.15, 1.3, 0.4, 2.02, 0x2a3440);
  for (const [wx, wz] of [[-0.72, 1.05], [0.72, 1.05], [-0.72, -1.05], [0.72, -1.05]]) b.cyl('plain', wx, 0.3, wz, 0.3, 0.3, 0.2, 0x1c1c1e, 10, 0, Math.PI / 2);
  b.box('glow', -0.5, 0.62, 1.61, 0.3, 0.14, 0.02, 0xfff6cf); b.box('glow', 0.5, 0.62, 1.61, 0.3, 0.14, 0.02, 0xfff6cf);
  b.box('plain', -0.5, 0.62, -1.61, 0.3, 0.12, 0.02, 0xc22a2a); b.box('plain', 0.5, 0.62, -1.61, 0.3, 0.12, 0.02, 0xc22a2a);
  b.solid(0, 0, 1.6, 3.3, 0, 1.35, 'car');
  b.pop();
}
export function rock(b, R, x, z, s = 1) { const y = gy(b, x, z); b.ico('rock', x, y + 0.3 * s, z, 0.6 * s, R.pick([0xffffff, 0xd8d8d8, 0xbdbdbd]), 1 + R() * 0.5, 0.7, 1 + R() * 0.4, 0, R() * 6); }

// A standalone text sign placed in the batch's local frame (not merged — each has its own texture).
export function signAt(b, group, text, x, y, z, w, h, ry = 0, opts = {}) {
  const tex = signTexture(text, opts);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: opts.double ? THREE.DoubleSide : THREE.FrontSide }));
  const p = b.w(x, y, z); mesh.position.copy(p);
  mesh.rotation.y = Math.atan2(b.m.elements[8], b.m.elements[10]) + ry;
  mesh.userData.sign = true; group.add(mesh); return mesh;
}
