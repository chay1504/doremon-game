// Hinode Town — the present-day era. A 5 x 4 grid of blocks, a levee, a river with a
// bridge, a wooded hill, and five homes you can walk into (the roof lifts off like a dollhouse).
import * as THREE from 'three';
import { Batch, gableGeo, gableEndsGeo, hipGeo, mat4 } from './build.js';
import { Colliders } from './physics.js';
import { rng, clamp, smooth, TAU } from './util.js';
import { tree, bush, flowers, pot, bench, lamp, vending, parkedCar, rock, signAt, gy, leafCards } from './props.js';
import { FIELD } from './game.js';

export const ROADS_X = [-105, -63, -21, 21, 63, 105], ROADS_Z = [-105, -63, -21, 21, 59];
const COLS = [-84, -42, 0, 42, 84], ROWS = [[-101.5, -66.5], [-59.5, -24.5], [-17.5, 17.5], [24.5, 55.5]];
const WALLC = [0xf3ead8, 0xffffff, 0xe6edf2, 0xefe3c8, 0xf7efc2, 0xe3efdc, 0xe9d9c4, 0xdfe4ea, 0xf5e6e0];
const ROOFC = [0x3c4a63, 0x4b4b52, 0x9a4b3c, 0x4e6b52, 0x6d4a35, 0xb5633f, 0x2f3f66, 0x5a5f6b];

// Terrain height. Piecewise-linear along Z on the 4 m grid so the mesh matches exactly.
export function H(x, z) {
  let h = 0;
  if (z > 64 && z < 88) h = z < 72 ? (z - 64) * 0.5 : z < 80 ? 4 : (88 - z) * 0.5;
  else if (z > 152 && z < 208) h = z < 160 ? -(z - 152) * 0.3 : z < 200 ? -2.4 : -(208 - z) * 0.3;
  else if (z >= 216) h = smooth(216, 270, z) * smooth(14, 44, Math.abs(x - 105)) * (7 + 5 * Math.sin(x * 0.021) + 3 * Math.cos(z * 0.03 + x * 0.01));
  const r = Math.hypot(x + 196, z + 30);
  if (r < 76) { const t = 1 - r / 76; h += 26 * t * t * (3 - 2 * t); }
  if (z < -150) h += smooth(-150, -230, z) * (9 + 6 * Math.sin(x * 0.017));
  if (x > 150) h += smooth(150, 240, x) * smooth(60, 30, z) * (8 + 5 * Math.cos(z * 0.02));
  return h;
}

export function buildPresent(G) {
  const M = G.M, col = new Colliders(), group = new THREE.Group(); group.name = 'present';
  const era = {
    key: 'present', label: 'Hinode Town', year: 'Today', group, colliders: col, heightAt: H,
    waterAt: (x, z) => (z > 153.5 && z < 206.5 ? -0.55 : -Infinity),
    pois: {}, nodes: [], interiors: [], interact: [], spawn: { x: 0, z: 0, yaw: 0 }, fog: [0xcfe6f5, 90, 620], tod: 15.7,
  };
  const b = new Batch(M, col, 72); b.height = H;
  const R = rng(7);

  // ---------- terrain ----------
  {
    const g = new THREE.PlaneGeometry(704, 704, 176, 176); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv, c = new Float32Array(p.count * 3), col3 = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = H(x, z); p.setY(i, h);
      uv.setXY(i, x / 6, z / 6);
      const k = 0.86 + R() * 0.14, hill = clamp(h / 26, 0, 1);
      col3.setRGB(k * (1 - hill * 0.25), k * (1 - hill * 0.12), k * (1 - hill * 0.3));
      if (h < -0.4) col3.setRGB(0.82, 0.74, 0.5);
      c[i * 3] = col3.r; c[i * 3 + 1] = col3.g; c[i * 3 + 2] = col3.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.grass); m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m);
    // river water
    const wg = new THREE.PlaneGeometry(704, 53, 1, 1); wg.rotateX(-Math.PI / 2);
    const wuv = wg.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 50, wuv.getY(i) * 4);
    const water = new THREE.Mesh(wg, M.water); water.position.set(0, -0.55, 180); group.add(water); era.water = water;
  }

  // ---------- roads ----------
  const stripZ = (mat, x, z0, z1, w, yo, c) => { for (let z = z0; z < z1 - 0.01; z += 4) { const za = z, zb = Math.min(z + 4, z1), ya = H(x, za) + yo, yb = H(x, zb) + yo, len = Math.hypot(zb - za, yb - ya); b.box(mat, x, (ya + yb) / 2 - 0.03, (za + zb) / 2, w, 0.06, len + 0.02, c, 0, -Math.atan2(yb - ya, zb - za)); } };
  for (const z of ROADS_Z) b.flat('asphalt', 0, 0.04, z, 217, 7);
  for (const x of ROADS_X) for (let i = 0; i < ROADS_Z.length - 1; i++) { const a = ROADS_Z[i] + 3.5, e = ROADS_Z[i + 1] - 3.5; b.flat('asphalt', x, 0.04, (a + e) / 2, 7, e - a); }
  b.flat('asphalt', 105, 0.04, 63.25, 7, 1.5); stripZ('asphalt', 105, 64, 148, 7, 0.07);           // main road climbs the levee to the bridge
  b.flat('asphalt', 105, 0.34, 180, 7, 64); b.flat('asphalt', 105, 0.05, 256, 7, 88);
  // concrete gutters along every street edge, with a drain grate every so often
  {
    const gut = (x, z, len, alongX) => { b.box('concrete', x, 0.036, z, alongX ? len : 0.42, 0.072, alongX ? 0.42 : len, 0xe2ded4); b.det = true; for (let k = -len / 2 + 5; k < len / 2 - 3; k += 13) b.box('plain', alongX ? x + k : x, 0.074, alongX ? z : z + k, alongX ? 0.5 : 0.3, 0.012, alongX ? 0.3 : 0.5, 0x2b2e33); b.det = false; };
    const xs = [-108.5, ...ROADS_X, 108.5];
    for (const z of ROADS_Z) for (let i = 0; i < xs.length - 1; i++) { const a0 = xs[i] + (i === 0 ? 0 : 3.5), a1 = xs[i + 1] - (i === xs.length - 2 ? 0 : 3.5); if (a1 - a0 < 2) continue; for (const s of [-3.29, 3.29]) gut((a0 + a1) / 2, z + s, a1 - a0, true); }
    for (const x of ROADS_X) for (let i = 0; i < ROADS_Z.length - 1; i++) { const a0 = ROADS_Z[i] + 3.5, a1 = ROADS_Z[i + 1] - 3.5; for (const s of [-3.29, 3.29]) gut(x + s, (a0 + a1) / 2, a1 - a0, false); }
  }
  // paint: dashed centre lines, crosswalks, stop bars
  for (let x = -100; x < 100; x += 6) if (ROADS_X.every((rx) => Math.abs(x + 1 - rx) > 5)) b.flat('paint', x + 1, 0.05, 21, 2.2, 0.14, 0xffffff);
  for (let z = -100; z < 55; z += 6) if (ROADS_Z.every((rz) => Math.abs(z + 1 - rz) > 5)) { b.flat('paint', 21, 0.05, z + 1, 0.14, 2.2, 0xffffff); b.flat('paint', 105, 0.05, z + 1, 0.14, 2.2, 0xf2c94c); }
  for (const [ix, iz] of [[21, 21], [-21, 21], [21, -21], [63, 21], [-21, -21], [63, -21]]) for (let k = -2.8; k <= 2.8; k += 0.8) {
    b.flat('paint', ix + k, 0.05, iz + 5.2, 0.42, 2.4, 0xffffff); b.flat('paint', ix + k, 0.05, iz - 5.2, 0.42, 2.4, 0xffffff);
    b.flat('paint', ix + 5.2, 0.05, iz + k, 2.4, 0.42, 0xffffff); b.flat('paint', ix - 5.2, 0.05, iz + k, 2.4, 0.42, 0xffffff);
  }
  for (const x of ROADS_X) for (const z of ROADS_Z) {
    era.nodes.push({ x, z });
    if (R() < 0.7) { b.cyl('plain', x + 2.2, 0.045, z + 2.0, 0.42, 0.42, 0.012, 0x3f4246, 12); }       // manhole
    if (R() < 0.45) { const sx = R() < 0.5 ? 3.25 : -3.25, sz = R() < 0.5 ? 3.25 : -3.25; b.cyl('plain', x + sx, 1.4, z + sz, 0.035, 0.035, 2.8, 0xf08a2c, 6); b.cyl('metal', x + sx, 2.75, z + sz, 0.36, 0.36, 0.05, 0xdfefff, 12, Math.PI / 2, 0, R() * 6); } // corner mirror
  }

  // ---------- fences / lot walls ----------
  const STYLE = [
    { mat: 'wall', c: 0xffffff, h: 1.5, t: 0.18, cap: 0xb9b6ae }, { mat: 'wall', c: 0xe8e2d4, h: 1.35, t: 0.18, cap: 0xa9a59c },
    { mat: 'leaf', c: 0x4f8f3a, h: 1.3, t: 0.5, cap: null }, { mat: 'wood', c: 0xc79b68, h: 1.4, t: 0.08, cap: null }, { mat: 'brick', c: 0xffffff, h: 1.6, t: 0.22, cap: 0xcfcabf },
  ];
  function wallSeg(x0, z0, x1, z1, st) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0); if (L < 0.2) return;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = alongX ? L : st.t, d = alongX ? st.t : L;
    b.box(st.mat, mx, st.h / 2, mz, w, st.h, d, st.c);
    if (st.cap) b.box('concrete', mx, st.h + 0.035, mz, w + (alongX ? 0 : 0.08), 0.07, d + (alongX ? 0.08 : 0), st.cap);
    if (st.mat === 'wood') for (let k = 0; k <= L; k += 1.8) b.box('wood', alongX ? Math.min(x0, x1) + k : mx, 0.78, alongX ? mz : Math.min(z0, z1) + k, 0.12, 1.56, 0.12, 0x9a7448);
    if (st.mat === 'leaf') { b.det = true; for (let k = 0.4; k < L; k += 0.8) { const hx = alongX ? Math.min(x0, x1) + k : mx, hz = alongX ? mz : Math.min(z0, z1) + k; leafCards(b, R, hx, st.h * 0.58, hz, alongX ? 0.5 : st.t * 0.72, st.h * 0.55, alongX ? st.t * 0.72 : 0.5, 7, 0.5, [0x4f8f3a, 0x5c9c42, 0x478236, 0x6aa84c]); } b.det = false; }
    b.solid(mx, mz, Math.max(w, 0.2), Math.max(d, 0.2), 0, st.h, 'wall');
  }
  function perimeter(lw, ld, gx, st, gap = 2.6, sides = 'NESW') {
    const hw = lw / 2 - st.t / 2, hd = ld / 2 - st.t / 2;
    if (sides.includes('N')) wallSeg(-lw / 2, -hd, lw / 2, -hd, st);
    if (sides.includes('W')) wallSeg(-hw, -ld / 2, -hw, ld / 2, st);
    if (sides.includes('E')) wallSeg(hw, -ld / 2, hw, ld / 2, st);
    if (sides.includes('S')) {
      wallSeg(-lw / 2, hd, gx - gap / 2, hd, st); wallSeg(gx + gap / 2, hd, lw / 2, hd, st);
      for (const s of [-1, 1]) { b.box('concrete', gx + s * (gap / 2 + 0.02), 0.95, hd, 0.36, 1.9, 0.36, 0xd2cec4); b.box('concrete', gx + s * (gap / 2 + 0.02), 1.94, hd, 0.46, 0.08, 0.46, 0xaaa69d); }
      b.box('plain', gx + gap / 2 + 0.02, 1.25, hd + 0.2, 0.24, 0.3, 0.16, R.pick([0xc0392b, 0x2f6f4f, 0x34495e]));   // mailbox
      b.quad('plain', gx - gap / 2 - 0.02, 1.45, hd + 0.19, 0.2, 0.1, 0x3a2e24);                                      // nameplate
    }
  }

  // ---------- a window: glass set into a real frame with a mullion, a sill, and sometimes a shutter box ----------
  function winUnit(bb, x, y, z, ww, hh, ry, shutter = false, fc = 0x3d4249) {
    bb.push(x, y, z, ry);
    bb.quad('win', 0, 0, 0.012, ww, hh, 0xffffff);
    const t = 0.06, wasDet = bb.det; bb.det = true;
    bb.box('frame', 0, hh / 2 + t / 2, 0.04, ww + t * 2, t, 0.1, fc); bb.box('frame', 0, -hh / 2 - t / 2, 0.04, ww + t * 2, t, 0.1, fc);
    bb.box('frame', -ww / 2 - t / 2, 0, 0.04, t, hh, 0.1, fc); bb.box('frame', ww / 2 + t / 2, 0, 0.04, t, hh, 0.1, fc);
    bb.box('frame', 0, 0, 0.035, 0.045, hh, 0.07, fc); if (hh > 1.5) bb.box('frame', 0, hh * 0.14, 0.035, ww, 0.04, 0.07, fc);
    bb.box('concrete', 0, -hh / 2 - t - 0.035, 0.09, ww + 0.3, 0.06, 0.2, 0xd9d5cb);
    if (shutter) bb.box('plain', ww / 2 + t + 0.2, 0, 0.06, 0.36, hh + 0.14, 0.1, 0xcfc8b8);
    bb.det = wasDet; bb.pop();
  }
  // ---------- a regular two-storey house (solid) ----------
  function houseShell(bb, w, d, floors, wallMat, wallC, roofC, hip, doorX, upperOnly = false) {
    const fh = 2.75, base = 0.3, top = base + floors * fh, y0 = upperOnly ? base + fh : 0;
    const trim = 0x6b5a48;
    if (!upperOnly) { bb.box('concrete', 0, 0.15, 0, w + 0.2, 0.3, d + 0.2, 0xb8b5ad); }
    bb.box(wallMat, 0, (Math.max(y0, base) + top) / 2, 0, w, top - Math.max(y0, base), d, wallC);
    if (floors > 1) bb.box('plain', 0, base + fh, 0, w + 0.12, 0.14, d + 0.12, trim);
    // skirting + corner boards give the walls an edge to catch the light
    if (!upperOnly) bb.box('concrete', 0, base + 0.2, 0, w + 0.07, 0.4, d + 0.07, 0xa9a59c);
    if (wallMat === 'siding') for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bb.box('plain', sx * w / 2, (Math.max(y0, base) + top) / 2, sz * d / 2, 0.16, top - Math.max(y0, base), 0.16, 0xf4f1ea);
    // roof: a base prism, then overlapping tile courses, verge tiles, a round ridge and gutters
    const rh = Math.min(2.4, d * 0.3), ov = 1.3, tileRoof = M.roof.userData.tile;
    if (hip) {
      bb.add('roof', hipGeo(w + ov, d + ov, rh + 0.3, 0.9, tileRoof), roofC, mat4(0, top - 0.12, 0));
      bb.box('plain', 0, top - 0.1, 0, w + ov + 0.08, 0.1, d + ov + 0.08, 0x3a3f46);
    } else {
      const drop = rh * ov / (d + ov), hd = (d + ov) / 2, ang = Math.atan2(rh, hd), sl = Math.hypot(hd, rh), rows = Math.max(6, Math.round(sl / 0.55)), ry0 = top - drop;
      bb.add('roof', gableGeo(w + ov, d + ov, rh, tileRoof), roofC, mat4(0, ry0, 0));
      bb.add(wallMat, gableEndsGeo(w, d, rh * d / (d + ov), M[wallMat].userData.tile), wallC, mat4(0, top, 0));
      for (const s of [1, -1]) {
        for (let k = 0; k < rows; k++) { const t = (k + 0.5) / rows * sl; bb.box('roof', 0, ry0 + t * Math.sin(ang) + 0.05, s * (hd - t * Math.cos(ang)), w + ov + 0.06, 0.07, sl / rows + 0.1, roofC, 0, s * (ang - 0.07)); }
        for (const e of [-1, 1]) bb.box('plain', e * (w + ov) / 2, ry0 + rh / 2 + 0.07, s * hd / 2, 0.2, 0.12, sl + 0.05, 0x2e3138, 0, s * ang);      // verge tiles
        bb.cyl('plain', 0, ry0 - 0.03, s * (hd + 0.07), 0.07, 0.07, w + ov, 0x4a4f57, 6, 0, Math.PI / 2);                                             // gutter
      }
      bb.cyl('plain', 0, ry0 + rh + 0.08, 0, 0.15, 0.15, w + ov + 0.14, 0x2e3138, 8, 0, Math.PI / 2);                                                 // ridge
      for (const e of [-1, 1]) bb.box('plain', e * ((w + ov) / 2 + 0.06), ry0 + rh + 0.1, 0, 0.08, 0.42, 0.5, 0x2e3138);                              // ridge end plates
    }
    bb.box('plain', 0, top - 0.12, 0, w + 0.5, 0.1, d + 0.5, 0xe9e5db);     // eave board
    // windows: glass set into a real frame with a mullion, a sill, and sometimes a shutter box
    const win = (x, y, z, ww, hh, ry, shutter = false) => winUnit(bb, x, y, z, ww, hh, ry, shutter);
    for (let f = upperOnly ? 1 : 0; f < floors; f++) {
      const y = base + f * fh + 1.55;
      win(doorX > 0 ? -w / 4 : w / 4, y, d / 2 + 0.03, f === 0 ? 2.3 : 1.7, f === 0 ? 1.7 : 1.3, 0, f === 0); if (f > 0) win(doorX > 0 ? w / 4 : -w / 4, y, d / 2 + 0.03, 1.5, 1.3, 0);
      win(-w / 4, y, -d / 2 - 0.03, 1.5, 1.2, Math.PI); win(w / 4, y, -d / 2 - 0.03, 1.5, 1.2, Math.PI);
      win(w / 2 + 0.03, y, 0, 1.3, 1.2, Math.PI / 2, true); win(-w / 2 - 0.03, y, 0, 1.3, 1.2, -Math.PI / 2);
    }
    if (floors > 1) {   // balcony with laundry
      const bx = doorX > 0 ? -w / 4 : w / 4, by = base + fh + 0.1;
      bb.box('concrete', bx, by, d / 2 + 0.55, 3.0, 0.1, 1.1, 0xd9d5cb);
      bb.box('plain', bx, by + 0.5, d / 2 + 1.08, 3.0, 0.9, 0.05, 0xf0ede6); bb.box('plain', bx - 1.48, by + 0.5, d / 2 + 0.55, 0.05, 0.9, 1.1, 0xf0ede6); bb.box('plain', bx + 1.48, by + 0.5, d / 2 + 0.55, 0.05, 0.9, 1.1, 0xf0ede6);
      bb.cyl('plain', bx, by + 1.55, d / 2 + 0.75, 0.02, 0.02, 2.8, 0xcfd6dc, 5, 0, Math.PI / 2);
      for (let i = 0; i < 4; i++) bb.box('plain', bx - 1.05 + i * 0.7, by + 1.22, d / 2 + 0.75, 0.5, 0.62, 0.02, R.pick([0xffffff, 0x7fb3e6, 0xf6c0c0, 0xf7e08a, 0xbfe3c0]));
    }
    // antenna
    if (!hip) { bb.cyl('plain', w / 4, top + rh + 0.6, 0, 0.02, 0.02, 1.4, 0x9aa2aa, 4); for (let i = 0; i < 4; i++) bb.box('plain', w / 4, top + rh + 0.7 + i * 0.16, 0, 0.9 - i * 0.15, 0.02, 0.02, 0x9aa2aa); }
    return { top, rh };
  }
  function frontDoor(bb, doorX, d, roofC) {
    const z = d / 2;
    bb.box('plain', doorX, 0.3 + 1.1, z + 0.02, 1.35, 2.3, 0.06, 0x3a2e24);                                  // shadowed reveal
    bb.quad('door', doorX, 0.3 + 1.05, z + 0.06, 1.0, 2.1, 0xffffff);
    for (const s of [-1, 1]) bb.box('wood', doorX + s * 0.6, 0.3 + 1.1, z + 0.07, 0.1, 2.3, 0.12, 0x6d4f35);
    bb.box('wood', doorX, 0.3 + 2.25, z + 0.07, 1.3, 0.1, 0.12, 0x6d4f35);
    bb.box('concrete', doorX, 0.1, z + 0.55, 1.7, 0.2, 1.0, 0xc4c0b6); bb.box('concrete', doorX, 0.04, z + 1.2, 1.9, 0.08, 0.4, 0xb9b5ab);
    bb.box('roof', doorX, 2.78, z + 0.62, 2.1, 0.08, 1.3, roofC, 0, 0.24); bb.box('plain', doorX, 2.71, z + 0.62, 2.0, 0.05, 1.25, 0xe9e5db, 0, 0.24);
    for (const s of [-1, 1]) bb.box('wood', doorX + s * 0.95, 2.62, z + 0.5, 0.06, 0.06, 1.0, 0x6d4f35, 0, 0.24);
    bb.cyl('plain', doorX + 0.82, 2.15, z + 0.1, 0.05, 0.07, 0.16, 0x2e3138, 6); bb.sph('glow', doorX + 0.82, 2.05, z + 0.1, 0.07, 0xfff0bf, 1, 1, 1, 6, 5);
    bb.box('plain', doorX, 0.215, z + 0.55, 0.8, 0.02, 0.5, 0x7a5a3a);                                       // doormat
  }
  function house(w, d, wallC, roofC, doorX) {
    const floors = R() < 0.82 ? 2 : 1, mat = R() < 0.6 ? 'plaster' : 'siding', hip = R() < 0.25;
    const { top, rh } = houseShell(b, w, d, floors, mat, wallC, roofC, hip, doorX);
    frontDoor(b, doorX, d, roofC);
    b.box('plain', -w / 2 - 0.2, 0.35, -d / 4, 0.32, 0.6, 0.8, 0xe6e8ea);                  // AC unit
    b.cyl('plain', w / 2 - 0.05, top / 2, d / 2 + 0.06, 0.04, 0.04, top, 0xcfcfcf, 5);      // rain pipe
    b.solid(0, 0, w, d, 0, top + rh * 0.45, 'house');
  }

  // ---------- a home with a real interior. The upper floor + roof live in a separate group that hides when you step in. ----------
  function interiorHouse(o) {
    const { w, d, doorX, wallC, roofC } = o, wm = o.wallMat || 'plaster', t = 0.2, base = 0.3, wh = 2.7, top = base + wh;
    const floorBox = b.solid(0, 0, w, d, 0, base, 'floor');
    b.box('concrete', 0, 0.15, 0, w + 0.2, 0.3, d + 0.2, 0xb8b5ad);
    b.flat('floor', 0, base + 0.01, 0, w - t, d - t, 0xffffff);
    b.sbox('concrete', doorX, 0.1, d / 2 + 0.55, 1.8, 0.2, 1.0, 0xc4c0b6);
    const seg = (x0, z0, x1, z1, c = wallC, m = wm, tt = t) => { const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; b.box(m, mx, base + wh / 2, mz, ax ? L : tt, wh, ax ? tt : L, c); b.solid(mx, mz, ax ? L : tt, ax ? tt : L, base, top, 'iw'); };
    const hw = w / 2 - t / 2, hd = d / 2 - t / 2, dw = 1.25;
    seg(-w / 2, -hd, w / 2, -hd); seg(-hw, -d / 2, -hw, d / 2); seg(hw, -d / 2, hw, d / 2);
    seg(-w / 2, hd, doorX - dw / 2, hd); seg(doorX + dw / 2, hd, w / 2, hd);
    b.box(wm, doorX, top - 0.3, hd, dw, 0.6, t, wallC);                                       // lintel
    b.box('wood', doorX + dw / 2 + 0.02, base + 1.05, hd + 0.5, 0.06, 2.1, 1.05, 0x7b5a3c);     // door, standing open
    b.box('roof', doorX, 2.9, d / 2 + 0.6, 2.2, 0.08, 1.25, roofC, 0, 0.22);
    // partition between the family room (left) and the bedroom (right), with a doorway
    const px = o.px ?? w * 0.12, pz = 0.6;
    seg(px, -d / 2, px, pz - 0.6, 0xf2ede2, 'plaster', 0.14); seg(px, pz + 0.6, px, d / 2, 0xf2ede2, 'plaster', 0.14);
    b.box('plaster', px, top - 0.3, pz, 0.14, 0.6, 1.2, 0xf2ede2);
    // windows (pictures on both faces of the wall)
    const win2 = (x, z, ww, ry) => { const s = Math.sin(ry), c = Math.cos(ry); b.quad('win', x + s * (t / 2 + 0.02), base + 1.5, z + c * (t / 2 + 0.02), ww, 1.3, 0xffffff, ry); b.quad('win', x - s * (t / 2 + 0.02), base + 1.5, z - c * (t / 2 + 0.02), ww, 1.3, 0xffffff, ry + Math.PI); };
    const lx = (-w / 2 + px) / 2, rx = (px + w / 2) / 2;
    win2(doorX > px ? lx : rx, hd, 2.2, 0); win2(lx, -hd, 1.6, Math.PI); win2(rx, -hd, 1.6, Math.PI); win2(-hw, 0, 1.6, -Math.PI / 2); win2(hw, 0, 1.6, Math.PI / 2);
    // ---- family room ----
    const L0 = -w / 2 + t, L1 = px - 0.07, lw = L1 - L0;
    b.flat('tatami', lx, base + 0.02, -0.4, Math.min(3.6, lw - 0.6), 2.7, 0xffffff);
    b.box('wood', lx, base + 0.36, -0.4, 1.3, 0.06, 0.85, 0x8a5a34); for (const [sx, sz] of [[-0.55, -0.33], [0.55, -0.33], [-0.55, 0.33], [0.55, 0.33]]) b.box('wood', lx + sx, base + 0.17, -0.4 + sz, 0.07, 0.34, 0.07, 0x6d4526);
    b.solid(lx, -0.4, 1.3, 0.85, base, base + 0.8, 'table');
    [[-1.0, 0, 0xc0504d], [1.0, 0, 0x4f81bd], [0, -0.8, 0x9bbb59], [0, 0.8, 0xf2a03d]].forEach(([sx, sz, c]) => b.box('plain', lx + sx, base + 0.06, -0.4 + sz, 0.5, 0.1, 0.5, c));
    b.cyl('plain', lx - 0.2, base + 0.44, -0.45, 0.1, 0.08, 0.1, 0xf5f5f0, 8); b.sph('plain', lx + 0.25, base + 0.45, -0.3, 0.08, 0xf2a03d);            // teacup + orange
    b.sbox('wood', L0 + 0.3, base + 0.3, d / 2 - 1.6, 0.5, 0.6, 1.5, 0x5b4633, 'tv'); b.box('plain', L0 + 0.32, base + 1.05, d / 2 - 1.6, 0.08, 0.75, 1.25, 0x16181c); b.quad('glow', L0 + 0.37, base + 1.05, d / 2 - 1.6, 1.12, 0.62, 0x6fb7e9, Math.PI / 2);
    // kitchen along the back wall
    b.sbox('plain', lx - 0.2, base + 0.45, -d / 2 + t + 0.32, Math.min(2.6, lw - 1.4), 0.9, 0.6, 0xf3f0e8, 'kitchen'); b.box('metal', lx - 0.2, base + 0.92, -d / 2 + t + 0.32, Math.min(2.6, lw - 1.4), 0.04, 0.62, 0xffffff);
    b.cyl('plain', lx - 0.7, base + 1.0, -d / 2 + t + 0.3, 0.14, 0.12, 0.14, 0x30343a, 10); b.box('plain', lx + 0.4, base + 0.96, -d / 2 + t + 0.3, 0.5, 0.03, 0.36, 0x9fb7c9);
    b.sbox('metal', L1 - 0.5, base + 0.88, -d / 2 + t + 0.38, 0.75, 1.76, 0.7, 0xf4f6f8, 'fridge'); b.box('plain', L1 - 0.5, base + 1.15, -d / 2 + t + 0.74, 0.7, 0.02, 0.02, 0x8a9199);
    b.sbox('wood', L0 + 0.22, base + 0.9, -1.6, 0.36, 1.8, 1.3, 0x8a6a48, 'shelf');
    for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) b.box('plain', L0 + 0.3, base + 0.3 + r * 0.42, -2.15 + k * 0.17, 0.2, 0.3, 0.12, R.pick([0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0xecf0f1]));
    b.cyl('plain', lx, base + 2.2, hd - 0.13, 0.22, 0.22, 0.04, 0xfdfdfd, 14, Math.PI / 2); b.box('plain', lx, base + 2.25, hd - 0.16, 0.02, 0.14, 0.01, 0x222222);     // wall clock
    pot(b, R, L1 - 0.4, d / 2 - 0.6);
    // ---- bedroom / study ----
    const R0 = px + 0.07, R1 = w / 2 - t, kid = o.kid || {};
    b.flat('plain', rx, base + 0.02, 0.5, Math.min(2.4, R1 - R0 - 0.8), 2.2, kid.rug ?? 0x7fb3e6);
    b.sbox('wood', R1 - 0.6, base + 0.22, -d / 2 + t + 1.05, 1.1, 0.44, 2.05, 0x9a7448, 'bed'); b.box('plain', R1 - 0.6, base + 0.5, -d / 2 + t + 1.05, 1.0, 0.16, 1.95, 0xfafafa);
    b.box('plain', R1 - 0.6, base + 0.6, -d / 2 + t + 1.35, 1.04, 0.1, 1.35, kid.bed ?? 0x4f81bd); b.box('plain', R1 - 0.6, base + 0.64, -d / 2 + t + 0.32, 0.7, 0.12, 0.4, 0xffffff);
    b.sbox('wood', R0 + 0.36, base + 0.375, -d / 2 + t + 0.9, 0.6, 0.75, 1.25, 0xb5895a, 'desk'); b.box('plain', R0 + 0.36, base + 0.8, -d / 2 + t + 0.6, 0.3, 0.04, 0.4, 0xffffff);
    b.cyl('plain', R0 + 0.3, base + 0.95, -d / 2 + t + 1.35, 0.03, 0.06, 0.4, 0x2f6fb5, 6); b.cone('plain', R0 + 0.36, base + 1.15, -d / 2 + t + 1.3, 0.13, 0.16, 0x2f6fb5, 8);   // desk lamp
    b.box('wood', R0 + 0.95, base + 0.25, -d / 2 + t + 0.9, 0.42, 0.06, 0.42, 0x8a5a34); b.box('wood', R0 + 1.15, base + 0.5, -d / 2 + t + 0.9, 0.05, 0.5, 0.42, 0x8a5a34);                // chair
    b.quad('shoji', hw - t / 2 - 0.02, base + 1.1, 1.9, 1.9, 2.1, 0xffffff, -Math.PI / 2);                                                  // closet
    if (kid.item === 'telescope') { b.cyl('plain', rx + 0.3, base + 1.0, 2.4, 0.07, 0.1, 0.9, 0xf0f0f0, 8, 0.9); for (let i = 0; i < 3; i++) b.cyl('plain', rx + 0.3 + Math.cos(i * 2.1) * 0.25, base + 0.4, 2.4 + Math.sin(i * 2.1) * 0.25, 0.02, 0.02, 0.85, 0x444444, 4, Math.sin(i * 2.1) * 0.3, -Math.cos(i * 2.1) * 0.3); }
    else if (kid.item === 'drums') { b.cyl('plain', rx, base + 0.35, 2.3, 0.36, 0.36, 0.5, 0xc0392b, 12, Math.PI / 2); b.cyl('plain', rx - 0.55, base + 0.55, 2.1, 0.2, 0.2, 0.22, 0xc0392b, 10); b.cyl('plain', rx + 0.55, base + 0.55, 2.1, 0.2, 0.2, 0.22, 0xc0392b, 10); b.cyl('plain', rx - 0.7, base + 1.0, 2.5, 0.25, 0.25, 0.02, 0xe6c14a, 12); b.cyl('plain', rx - 0.7, base + 0.5, 2.5, 0.015, 0.015, 1.0, 0x999999, 4); }
    else if (kid.item === 'books') { for (let s = 0; s < 2; s++) { b.sbox('wood', R0 + 0.25, base + 0.9, 1.2 + s * 1.35, 0.36, 1.8, 1.2, 0x8a6a48, 'shelf'); for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) b.box('plain', R0 + 0.32, base + 0.3 + r * 0.42, 0.75 + s * 1.35 + k * 0.17, 0.2, 0.3, 0.12, R.pick([0x1f3a5f, 0x7a1f1f, 0x1f5f3a, 0xd9c79a, 0x5a2f6f])); } b.sph('plain', R0 + 0.36, base + 1.0, -d / 2 + t + 1.2, 0.13, 0x3a8fd9); }
    else if (kid.item === 'models') { b.sbox('plain', R0 + 0.25, base + 0.6, 1.9, 0.4, 1.2, 1.8, 0x2b2f36, 'shelf'); for (let k = 0; k < 4; k++) b.box('plain', R0 + 0.3, base + 1.26, 1.25 + k * 0.42, 0.14, 0.08, 0.3, [0xd62828, 0xf7b801, 0x2a9d8f, 0x3a86ff][k]); }
    else { for (let k = 0; k < 5; k++) b.box('plain', rx - 0.3 + (k % 2) * 0.05, base + 0.04 + k * 0.035, 2.5, 0.2, 0.03, 0.28, R.pick([0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71])); b.box('plain', rx + 0.5, base + 0.08, 2.4, 0.34, 0.08, 0.24, 0x2c2c34); }
    // ---- upper floor + roof (separate group that hides when someone is inside) ----
    const tb = new Batch(M, null, 0); tb.m = b.m.clone(); tb.stack = [tb.m];
    tb.box('plaster', 0, top + 0.06, 0, w + 0.05, 0.12, d + 0.05, 0xf2ede2);
    houseShell(tb, w, d, 2, wm, wallC, roofC, !!o.hip, doorX, true);
    const topG = new THREE.Group(); tb.build(topG); group.add(topG);
    b.solid(0, 0, w, d, top + 0.02, base + 2 * 2.75 + 1.0, 'roof');
    era.interiors.push({ x0: floorBox.x0, x1: floorBox.x1, z0: floorBox.z0, z1: floorBox.z1, y: top, top: topG, owner: o.owner });
  }

  // ---------- one residential lot ----------
  function lot(cx, cz, lw, ld, ry, home) {
    b.push(cx, 0, cz, ry);
    const st = home ? STYLE[home.style ?? 0] : STYLE[R.int(0, 4)];
    const w = home ? home.w : R.range(8, 10), d = home ? home.d : R.range(6.4, 7.4);
    const hx = home ? (home.hx ?? -2.2) : R.range(-1.4, 1.4), hz = -ld / 2 + d / 2 + 1.25;
    const dxl = (home ? -1 : R() < 0.5 ? -1 : 1) * w / 4, gx = clamp(hx + dxl, -lw / 2 + 2.2, lw / 2 - 2.2);
    perimeter(lw, ld, gx, st);
    for (let z = hz + d / 2 + 1.5; z < ld / 2 - 0.4; z += 1.1) b.box('concrete', gx + (((z * 10) | 0) % 2 ? 0.08 : -0.08), 0.03, z, 0.85, 0.05, 0.8, 0xcfcbc1);   // stepping stones
    b.push(hx, 0, hz);
    const wallC = home?.wallC ?? R.pick(WALLC), roofC = home?.roofC ?? R.pick(ROOFC);
    if (home) { interiorHouse({ ...home, w, d, doorX: gx - hx, wallC, roofC }); era.pois[home.owner + 'Home'] = b.w(gx - hx, 0, d / 2 + 2.6); era.pois[home.owner + 'Room'] = b.w(w * 0.3, 0.3, 0.8); if (home.extra) home.extra(b, w, d); }
    else house(w, d, wallC, roofC, gx - hx);
    b.pop();
    // garden
    const side = gx > 0 ? -1 : 1;
    if (R() < 0.75) tree(b, R, side * (lw / 2 - 2.0), ld / 2 - 2.2, 0.75 + R() * 0.3, R.pick(['round', 'round', 'pine', 'cherry', 'ginkgo']));
    for (let i = 0; i < 3; i++) if (R() < 0.6) bush(b, R, side * (lw / 2 - 1.0 - i * 1.3), ld / 2 - 0.9, 0.8);
    if (R() < 0.7) pot(b, R, gx + 1.2, hz + d / 2 + 0.5); if (R() < 0.5) pot(b, R, gx - 1.2, hz + d / 2 + 0.5);
    if (R() < 0.5) flowers(b, R, -side * (lw / 2 - 1.6), ld / 2 - 1.2, 7, 0.9);
    if (R() < 0.35) { const bx = -side * (lw / 2 - 1.2), bz = hz + d / 2 + 1.2; b.cyl('plain', bx, 0.33, bz - 0.5, 0.32, 0.32, 0.04, 0x222222, 12, 0, Math.PI / 2); b.cyl('plain', bx, 0.33, bz + 0.5, 0.32, 0.32, 0.04, 0x222222, 12, 0, Math.PI / 2); b.box('plain', bx, 0.6, bz, 0.04, 0.05, 1.0, R.pick([0xd62828, 0x2a9d8f, 0x3a86ff])); b.box('plain', bx, 0.85, bz + 0.4, 0.4, 0.04, 0.04, 0x333333); }
    b.pop();
  }
  function residential(x0, x1, z0, z1, homes = {}) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, lw = (x1 - x0) / 2, ld = (z1 - z0) / 2;
    lot(mx - lw / 2, mz - ld / 2, lw, ld, Math.PI, homes.NW); lot(mx + lw / 2, mz - ld / 2, lw, ld, Math.PI, homes.NE);
    lot(mx - lw / 2, mz + ld / 2, lw, ld, 0, homes.SW); lot(mx + lw / 2, mz + ld / 2, lw, ld, 0, homes.SE);
  }

  // ---------- special blocks ----------
  function park(x0, x1, z0, z1) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    b.push(mx, 0, mz);
    const st = { mat: 'leaf', c: 0x4a8a38, h: 0.9, t: 0.5, cap: null };
    perimeter(w, d, 0, st, 5, 'EWS'); wallSeg(-w / 2, -d / 2 + 0.25, -3, -d / 2 + 0.25, st); wallSeg(3, -d / 2 + 0.25, w / 2, -d / 2 + 0.25, st);
    b.flat('dirt', 0, 0.02, 2, 3.2, d - 1, 0xf2e6cf); b.flat('dirt', 0, 0.025, -2, w - 8, 3, 0xf2e6cf);
    // playground: slide
    b.push(-9, 0, -9);
    b.box('plain', 0, 1.0, 0, 1.3, 0.1, 1.3, 0xd9443f); for (const [sx, sz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) b.cyl('plain', sx, 0.9, sz, 0.05, 0.05, 1.8, 0x3a7bd5, 6);
    b.box('metal', 0, 0.52, 2.2, 1.0, 0.06, 3.4, 0xdfe6ee, 0, 0.3); b.box('plain', -0.52, 0.66, 2.2, 0.06, 0.26, 3.4, 0xf2c94c, 0, 0.3); b.box('plain', 0.52, 0.66, 2.2, 0.06, 0.26, 3.4, 0xf2c94c, 0, 0.3);
    for (let i = 0; i < 5; i++) b.box('plain', 0, 0.2 + i * 0.2, -0.9 - (4 - i) * 0.08, 0.9, 0.05, 0.12, 0x3a7bd5);
    b.solid(0, 0, 1.3, 1.3, 0, 1.05, 'slide'); b.solid(0, 1.5, 1.0, 1.4, 0, 0.72, 'slide'); b.solid(0, 2.9, 1.0, 1.4, 0, 0.36, 'slide');
    b.pop();
    // swings
    b.push(-9, 0, 6);
    for (const sx of [-2.2, 2.2]) { b.cyl('plain', sx, 1.25, 0.5, 0.05, 0.05, 2.6, 0x2e9e6b, 6, 0.2); b.cyl('plain', sx, 1.25, -0.5, 0.05, 0.05, 2.6, 0x2e9e6b, 6, -0.2); }
    b.cyl('plain', 0, 2.5, 0, 0.05, 0.05, 4.6, 0x2e9e6b, 6, 0, Math.PI / 2);
    for (const sx of [-1.1, 0, 1.1]) { b.box('plain', sx, 0.55, 0, 0.5, 0.05, 0.22, 0xe9a23b); b.cyl('plain', sx - 0.22, 1.5, 0, 0.012, 0.012, 1.95, 0x777777, 4); b.cyl('plain', sx + 0.22, 1.5, 0, 0.012, 0.012, 1.95, 0x777777, 4); }
    b.pop();
    // sandbox + jungle gym + seesaw
    b.flat('sand', 8, 0.05, -9, 4.4, 4.4, 0xffffff); for (const [sx, sz, sw, sd] of [[8, -11.2, 4.8, 0.3], [8, -6.8, 4.8, 0.3], [5.75, -9, 0.3, 4.4], [10.25, -9, 0.3, 4.4]]) b.box('wood', sx, 0.12, sz, sw, 0.24, sd, 0xb08a5a);
    b.sph('plain', 7.3, 0.2, -9.4, 0.18, 0xe84a5f); b.cyl('plain', 8.8, 0.18, -8.4, 0.14, 0.11, 0.26, 0x3aa0e0, 8);
    b.push(9.5, 0, 7);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b.cyl('plain', -1.2 + i * 0.8, 1.0, -1.2 + j * 0.8, 0.03, 0.03, 2.0, [0xd9443f, 0x3a7bd5, 0xf2c94c, 0x2e9e6b][(i + j) % 4], 5);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) { b.cyl('plain', 0, 0.66 + k * 0.66, -1.2 + i * 0.8, 0.03, 0.03, 2.4, 0x3a7bd5, 5, 0, Math.PI / 2); b.cyl('plain', -1.2 + i * 0.8, 0.66 + k * 0.66, 0, 0.03, 0.03, 2.4, 0xd9443f, 5, Math.PI / 2); }
    b.solid(0, 0, 2.5, 2.5, 0, 2.0, 'gym');
    b.pop();
    b.box('plain', 3.5, 0.3, 11, 0.3, 0.6, 0.3, 0x3a7bd5); b.box('wood', 3.5, 0.66, 11, 3.6, 0.07, 0.3, 0xe9a23b, 0, 0, 0.15);
    // pond, clock tower, benches, trees
    b.cyl('water', -10, 0.06, -1.5, 2.6, 2.6, 0.04, 0xffffff, 18); for (let i = 0; i < 12; i++) rock(b, R, -10 + Math.cos(i * 0.52) * 2.8, -1.5 + Math.sin(i * 0.52) * 2.8, 0.55);
    b.cyl('concrete', 5, 2.4, 2, 0.22, 0.3, 4.8, 0xe8e4da, 8); b.box('plain', 5, 5.1, 2, 0.9, 0.9, 0.5, 0x3a6ea5); b.cyl('plain', 5, 5.1, 2.26, 0.34, 0.34, 0.02, 0xffffff, 16, Math.PI / 2); b.cyl('plain', 5, 5.1, 1.74, 0.34, 0.34, 0.02, 0xffffff, 16, Math.PI / 2);
    b.box('plain', 5, 5.2, 2.28, 0.03, 0.26, 0.01, 0x111111); b.box('plain', 5.09, 5.1, 2.28, 0.2, 0.03, 0.01, 0x111111); b.solid(5, 2, 0.6, 0.6, 0, 5, 'clock', false);
    bench(b, -3.2, -6, 0); bench(b, 3.2, -6, 0); bench(b, -3.4, 9, Math.PI / 2); bench(b, 14, 0, -Math.PI / 2); bench(b, -14.5, 3, Math.PI / 2);
    for (const [tx, tz, k] of [[-14.5, -14, 'cherry'], [14.5, -14, 'cherry'], [-14.5, 14, 'round'], [14.5, 14, 'cherry'], [0, -13, 'round'], [14.5, 4, 'ginkgo'], [-14.5, -5, 'cherry'], [3, 14, 'round']]) tree(b, R, tx, tz, 1.15, k);
    lamp(b, -2.2, 2); lamp(b, 2.2, -10); lamp(b, 2.2, 12);
    flowers(b, R, -5, -12, 16, 2.5); flowers(b, R, 12, -3, 14, 2); flowers(b, R, -12, 11, 14, 2);
    b.cyl('concrete', 2.4, 0.45, -2, 0.18, 0.22, 0.9, 0xd6d2c8, 8); b.cyl('metal', 2.4, 0.92, -2, 0.24, 0.2, 0.06, 0xffffff, 10);            // drinking fountain
    vending(b, 4.6, d / 2 - 1.2, Math.PI, 0xd9443f);
    signAt(b, group, 'HINODE PARK', 0, 2.55, d / 2 - 0.3, 3.6, 0.7, 0, { bg: '#2f6f4f', fg: '#fff', double: true }); for (const sx of [-2.4, 2.4]) b.cyl('wood', sx, 1.45, d / 2 - 0.3, 0.09, 0.09, 2.9, 0x8a6a48, 6);
    era.pois.park = b.w(0, 0, 4); era.pois.parkGate = b.w(0, 0, d / 2 + 2);
    b.pop();
  }
  function school(x0, x1, z0, z1) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    b.push(mx, 0, mz);
    perimeter(w, d, 0, STYLE[0], 6);
    b.flat('dirt', 0, 0.02, 4.5, w - 1, d - 10, 0xffffff);
    // three-storey classroom block: base course, floor bands, pilasters between bays, a real window in every bay
    const SW = 30, SD = 9, sz = -11, zf = sz + SD / 2, zk = sz - SD / 2, by = 0.4, fh = 3.2, top = by + 3 * fh, wc = 0xf2ecdc, fr = 0xdfe5ea;
    b.box('concrete', 0, 0.2, sz, SW + 0.4, 0.4, SD + 0.4, 0xbdb9b0);
    b.box('plaster', 0, (by + top) / 2, sz, SW, top - by, SD, wc); b.solid(0, sz, SW, SD, 0, top + 0.4, 'school');
    b.box('concrete', 0, by + 0.35, sz, SW + 0.1, 0.7, SD + 0.1, 0xa9a59c);
    for (let f = 1; f <= 3; f++) b.box('concrete', 0, by + f * fh, sz, SW + (f === 3 ? 0.5 : 0.18), f === 3 ? 0.26 : 0.16, SD + (f === 3 ? 0.5 : 0.18), 0xd9d5cb);
    for (let k = 0; k <= 10; k++) for (const z of [zf + 0.07, zk - 0.07]) b.box('plaster', -15 + k * 3, (by + top) / 2, z, 0.36, top - by, 0.14, 0xe4dcc8);
    for (let f = 0; f < 3; f++) {
      const y = by + f * fh + 1.85;
      for (let k = 0; k < 10; k++) { const x = -13.5 + k * 3; if (!(f === 0 && Math.abs(x) < 3.2)) winUnit(b, x, y, zf + 0.03, 2.3, 1.7, 0, false, fr); winUnit(b, x, y, zk - 0.03, 2.3, 1.7, Math.PI, false, fr); }
      for (const zz of [-2.2, 2.2]) { winUnit(b, SW / 2 + 0.03, y, sz + zz, 1.8, 1.6, Math.PI / 2, false, fr); winUnit(b, -SW / 2 - 0.03, y, sz + zz, 1.8, 1.6, -Math.PI / 2, false, fr); }
    }
    for (const [sx, sz2] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.cyl('plain', sx * (SW / 2 + 0.1), top / 2, sz + sz2 * (SD / 2 + 0.1), 0.06, 0.06, top, 0xb9bec4, 6);       // drain pipes
    // roof: parapet, stair penthouse with the clock, water tank, air-conditioning units
    for (const [px, pz, pw, pd] of [[0, zf - 0.1, SW, 0.2], [0, zk + 0.1, SW, 0.2], [-SW / 2 + 0.1, sz, 0.2, SD], [SW / 2 - 0.1, sz, 0.2, SD]]) b.box('concrete', px, top + 0.42, pz, pw, 0.6, pd, 0xd4d0c6);
    b.box('plaster', 0, top + 1.6, sz, 5, 2.9, 5, 0xf2ede2); b.box('concrete', 0, top + 3.1, sz, 5.4, 0.2, 5.4, 0xd4d0c6);
    b.cyl('plain', 0, top + 1.8, sz + 2.52, 0.95, 0.95, 0.04, 0xffffff, 24, Math.PI / 2); b.cyl('frame', 0, top + 1.8, sz + 2.5, 1.02, 1.02, 0.03, 0x3d4249, 24, Math.PI / 2);
    b.box('plain', 0, top + 2.05, sz + 2.55, 0.06, 0.6, 0.02, 0x111111); b.box('plain', 0.22, top + 1.8, sz + 2.55, 0.5, 0.06, 0.02, 0x111111);
    b.cyl('metal', 9.5, top + 1.9, sz, 1.1, 1.1, 1.8, 0xffffff, 16); for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.cyl('plain', 9.5 + lx, top + 0.6, sz + lz, 0.05, 0.05, 1.0, 0x8d9299, 5);
    for (let k = 0; k < 4; k++) { b.box('plain', -11 + k * 1.6, top + 0.55, sz + 1.2, 1.1, 0.8, 0.5, 0xe6e8ea); b.cyl('plain', -11 + k * 1.6, top + 0.55, sz + 1.46, 0.28, 0.28, 0.02, 0x8d9299, 12, Math.PI / 2); }
    // entrance: porch block, glass doors, canopy on round columns, steps, shoe-locker shelves
    b.box('plaster', 0, 1.6, -5.6, 6, 2.4, 2, 0xe6e1d5); for (const sx of [-0.85, 0.85]) winUnit(b, sx, 1.45, -4.58, 1.5, 2.1, 0, false, fr);
    b.box('concrete', 0, 3.0, -4.9, 7, 0.25, 3.4, 0xcfcbc1); b.box('frame', 0, 2.82, -3.3, 7.04, 0.1, 0.1, 0x3d4249);
    for (const sx of [-3, 3]) b.cyl('concrete', sx, 1.45, -3.5, 0.16, 0.16, 2.9, 0xdedad0, 10);
    b.box('concrete', 0, 0.1, -3.9, 6.6, 0.2, 1.6, 0xc4c0b6); b.box('concrete', 0, 0.05, -2.9, 7.2, 0.1, 0.6, 0xbab6ac);
    for (const sx of [-2.3, 2.3]) { b.box('wood', sx, 0.75, -4.4, 1.0, 1.1, 0.36, 0x9a7448); for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) b.box('plain', sx - 0.36 + k * 0.24, 0.42 + r * 0.33, -4.26, 0.16, 0.1, 0.24, R.pick([0xffffff, 0xd9443f, 0x3a7bd5, 0x2c2c34])); }
    b.cyl('plain', -12, 4, -4.5, 0.05, 0.07, 8, 0xdfe3e7, 6); b.box('plain', -11.4, 7.4, -4.5, 1.2, 0.8, 0.02, 0xffffff); b.sph('plain', -11.4, 7.4, -4.48, 0.22, 0xd62828, 1, 1, 0.1);
    for (let a = 0; a < TAU; a += TAU / 40) b.flat('paint', Math.cos(a) * 11, 0.04, 5.5 + Math.sin(a) * 6.5, 1.6, 0.14, 0xffffff, -a + Math.PI / 2);
    for (const sx of [-10, 10]) { b.cyl('plain', sx, 1.2, 14, 0.04, 0.04, 2.4, 0xffffff, 5); b.cyl('plain', sx, 1.2, 11.5, 0.04, 0.04, 2.4, 0xffffff, 5); b.cyl('plain', sx, 2.4, 12.75, 0.04, 0.04, 2.5, 0xffffff, 5, Math.PI / 2); }
    tree(b, R, -15, 14.5, 1.1, 'cherry'); tree(b, R, 15, 14.5, 1.1, 'cherry'); tree(b, R, -15, -2, 1, 'ginkgo'); tree(b, R, 15, -2, 1, 'ginkgo');
    signAt(b, group, 'Hinode Elementary School', -4.6, 1.3, d / 2 + 0.02, 2.4, 0.5, 0, { bg: '#3a2e24', fg: '#f3e6c4', font: 'bold 20px serif' });
    era.pois.school = b.w(0, 0, 8); era.pois.schoolGate = b.w(0, 0, d / 2 + 2);
    b.pop();
  }
  function shops(x0, x1, z0, z1, goro) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    b.push(mx, 0, mz);
    const names = [['Sunny Bakery', '#c46a2c', 0xf6e3c8], ['Candy Corner', '#d6457a', 0xfbe1ec], ['Book Nook', '#2f5d8c', 0xe1ecf7], ['Toy Box', '#e2a400', 0xfdf3cf], ['Noodle Bar', '#b8322a', 0xf5e2d6]];
    const sw = w / 5, W = sw - 0.3, zf = 3.9, zb = -4.7, rz = 1.6, gh = 3.1, topY = 6.8;
    b.flat('concrete', 0, 0.045, d / 2 - 0.55, w, 1.1, 0xe2ded4);                                   // paved strip in front of the row
    names.forEach(([nm, colr, wc], i) => {
      const hex = new THREE.Color(colr).getHex();
      b.push(-w / 2 + sw * (i + 0.5), 0, d / 2 - 5);
      b.box('concrete', 0, 0.1, 0, sw - 0.1, 0.2, 9.8, 0xbdb9b0);
      // shell: upper floor, rear half of the ground floor, and an open shop front you can walk into
      b.box('plaster', 0, (gh + topY) / 2, (zf + zb) / 2, W, topY - gh, zf - zb, wc); b.box('plaster', 0, (0.2 + gh) / 2, (zb + rz) / 2, W, gh - 0.2, rz - zb, wc);
      b.solid(0, (zb + rz) / 2, W, rz - zb, 0, topY, 'shop'); b.solid(0, (rz + zf) / 2, W, zf - rz, gh, topY, 'shop');
      for (const s of [-1, 1]) { b.box('plaster', s * (W / 2 - 0.12), (0.2 + gh) / 2, (rz + zf) / 2, 0.24, gh - 0.2, zf - rz, wc); b.solid(s * (W / 2 - 0.12), (rz + zf) / 2, 0.24, zf - rz, 0, gh, 'shop'); b.box('brick', s * (W / 2 - 0.2), gh / 2 + 0.1, zf + 0.05, 0.52, gh, 0.3, 0xffffff); }
      b.flat('floor', 0, 0.215, (rz + zf) / 2, W - 0.5, zf - rz, 0xffffff); b.box('plain', 0, 1.65, rz + 0.02, W - 0.5, 2.85, 0.04, 0xf3eee2); b.box('plain', 0, gh - 0.02, (rz + zf) / 2, W - 0.5, 0.04, zf - rz, 0xf7f3ea);
      for (const k of [-1.6, 1.6]) b.box('glow', k, gh - 0.08, 2.7, 1.3, 0.05, 0.22, 0xfff6d8);
      // shelves across the back wall, stocked
      b.det = true;
      for (const s of [-1, 1]) b.box('wood', s * (W / 2 - 0.55), 1.4, rz + 0.22, 0.06, 2.4, 0.36, 0x8a6a48);
      for (let r = 0; r < 4; r++) {
        const sy = 0.55 + r * 0.56; b.box('wood', 0, sy, rz + 0.22, W - 1.1, 0.04, 0.36, 0x9a7448);
        for (let gx = -W / 2 + 0.85; gx < W / 2 - 0.8; gx += i === 2 ? 0.11 : 0.34) {
          if (i === 0) b.sph('plain', gx, sy + 0.12, rz + 0.22, 0.13, R.pick([0xd9a05b, 0xc98a45, 0xe6b877, 0xb87a3a]), 1.25, 0.72, 1, 8, 6);
          else if (i === 1) { b.cyl('glass', gx, sy + 0.16, rz + 0.22, 0.1, 0.1, 0.26, 0xffffff, 8); b.cyl('plain', gx, sy + 0.12, rz + 0.22, 0.08, 0.08, 0.16, R.pick([0xff6b9d, 0x6bd4ff, 0xffe66b, 0x9dff6b, 0xff9f43]), 7); }
          else if (i === 2) b.box('plain', gx, sy + 0.17, rz + 0.22, 0.09, 0.3 - R() * 0.06, 0.22, R.pick([0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x34495e, 0xe67e22]));
          else if (i === 3) b.box('plain', gx, sy + 0.15, rz + 0.22, 0.26, 0.26, 0.24, R.pick([0xe84a5f, 0x3aa0e0, 0xf2c94c, 0x2ecc71, 0x9b59b6]));
          else b.cyl('plain', gx, sy + 0.09, rz + 0.22, 0.12, 0.08, 0.13, R.pick([0xf5f5f0, 0x2f3a55, 0xb8322a]), 9);
        }
      }
      b.det = false;
      // counter with a till; the noodle bar gets stools and a split curtain instead of a display stall
      const cx = i === 4 ? 0 : -W / 2 + 1.7, cw = i === 4 ? W - 1.6 : 2.3;
      b.sbox('wood', cx, 0.67, 2.75, cw, 0.9, 0.55, 0x8a6a48, 'counter'); b.box('plain', cx, 1.14, 2.75, cw + 0.1, 0.05, 0.65, 0xefe9dc);
      if (i === 4) { for (let k = -2; k <= 2; k++) { b.cyl('plain', k * 1.0, 0.62, 3.35, 0.17, 0.17, 0.06, 0x8a2a22, 10); b.cyl('metal', k * 1.0, 0.4, 3.35, 0.03, 0.03, 0.4, 0xffffff, 6); b.cyl('plain', k * 1.0, 1.24, 2.75, 0.15, 0.1, 0.11, 0xf5f5f0, 10); } for (let k = 0; k < 4; k++) { b.box('plain', -1.95 + k * 1.3, 2.42, zf + 0.06, 1.22, 0.75, 0.02, 0xb8322a); b.box('plain', -1.95 + k * 1.3, 2.3, zf + 0.075, 0.5, 0.06, 0.01, 0xffffff); } b.sph('glow', W / 2 - 0.55, 2.35, zf + 0.35, 0.24, 0xff6b4a, 1, 1.3, 1); }
      else { b.box('plain', cx + 0.7, 1.3, 2.75, 0.36, 0.26, 0.34, 0x2b2f36); b.box('glow', cx + 0.7, 1.36, 2.93, 0.26, 0.12, 0.01, 0x9fe3ff); }
      // fascia, shutter housing, awning with a valance and arms, sign
      b.box('metal', 0, gh - 0.16, zf + 0.03, W - 1.0, 0.3, 0.2, 0xdfe3e7); b.box('plain', 0, gh + 0.45, zf + 0.03, W - 0.5, 1.15, 0.08, 0x2e3138);
      b.box('plain', 0, 3.0, 4.75, W - 0.4, 0.08, 1.9, hex, 0, 0.28); for (let k = 0; k < 5; k++) b.box('plain', -W / 2 + 0.65 + k * (W - 1.3) / 4, 3.02, 4.76, 0.4, 0.085, 1.9, 0xffffff, 0, 0.28);
      b.box('plain', 0, 2.62, 5.66, W - 0.4, 0.24, 0.03, hex); for (const s of [-1, 1]) b.cyl('metal', s * (W / 2 - 0.35), 2.9, 4.75, 0.02, 0.02, 1.95, 0xffffff, 5, Math.PI / 2 - 0.28);
      signAt(b, group, nm, 0, gh + 0.45, zf + 0.08, W - 0.9, 0.95, 0, { bg: colr, fg: '#fff' });
      winUnit(b, -1.45, 5.45, zf + 0.03, 1.5, 1.25, 0, true); winUnit(b, 1.45, 5.45, zf + 0.03, 1.5, 1.25, 0);
      // roof: cornice, parapet, air conditioner, vent pipe
      b.box('concrete', 0, topY + 0.08, (zf + zb) / 2, W + 0.24, 0.16, zf - zb + 0.24, 0xcfcbc1);
      for (const [px, pz, pw, pd] of [[0, zf - 0.08, W, 0.16], [0, zb + 0.08, W, 0.16], [-W / 2 + 0.08, (zf + zb) / 2, 0.16, zf - zb], [W / 2 - 0.08, (zf + zb) / 2, 0.16, zf - zb]]) b.box('concrete', px, topY + 0.4, pz, pw, 0.5, pd, 0xd9d5cb);
      b.box('plain', -1.2, topY + 0.55, -1.5, 1.0, 0.7, 0.5, 0xe6e8ea); b.cyl('plain', 1.6, topY + 0.7, -2.6, 0.09, 0.09, 1.1, 0x8d9299, 7);
      // goods on a table out front (not at the noodle bar)
      if (i !== 4) {
        b.sbox('wood', 0.9, 0.45, 4.6, sw - 3.6, 0.9, 0.9, 0xa57c52, 'stall');
        for (let k = 0; k < 8; k++) { const gx = -0.45 + (k % 4) * 0.82, gz = 4.4 + ((k / 4) | 0) * 0.4; if (i === 0) b.sph('plain', gx, 0.98, gz, 0.15, R.pick([0xd9a05b, 0xc98a45, 0xe6b877]), 1.3, 0.7, 1); else if (i === 1) b.cyl('plain', gx, 1.0, gz, 0.1, 0.1, 0.2, R.pick([0xff6b9d, 0x6bd4ff, 0xffe66b, 0x9dff6b]), 8); else if (i === 2) b.box('plain', gx, 0.95, gz, 0.3, 0.08, 0.4, R.pick([0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f])); else b.box('plain', gx, 1.02, gz, 0.26, 0.26, 0.26, R.pick([0xe84a5f, 0x3aa0e0, 0xf2c94c, 0x2ecc71])); }
      } else b.box('plain', -W / 2 + 0.75, 1.0, 4.35, 0.6, 1.5, 0.04, 0x2e3138, 0.0, -0.12);                  // menu board
      b.pop();
    });
    era.pois.shops = b.w(0, 0, d / 2 + 2.5);
    b.pop();
    // Goro and his family live behind the bakery
    lot(mx - w / 4, z0 + (d - 10) / 2, w / 2, d - 10, Math.PI, goro);
    lot(mx + w / 4, z0 + (d - 10) / 2, w / 2, d - 10, Math.PI);
  }
  function mansion(x0, x1, z0, z1, home) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    b.push(mx, 0, mz);
    perimeter(w, d, 4, STYLE[4], 7, 'NEW');
    { const st = STYLE[4], hd = d / 2 - st.t / 2;                                     // south wall: main gate at x 0.5..7.5, driveway at -16.9..-0.3
      wallSeg(-w / 2, hd, -16.9, hd, st); wallSeg(-0.3, hd, 0.5, hd, st); wallSeg(7.5, hd, w / 2, hd, st);
      for (const gx of [-16.9, -0.3]) { b.box('brick', gx + (gx < -1 ? 0.35 : -0.35), 1.3, hd, 0.7, 2.6, 0.7, 0xffffff); b.sph('glow', gx + (gx < -1 ? 0.35 : -0.35), 2.85, hd, 0.22, 0xfff3c4); }
      b.flat('concrete', -8.6, 0.03, 13.7, 16.6, 7.6, 0xe9e5db); }
    for (const s of [-1, 1]) { b.box('brick', 4 + s * 3.7, 1.3, d / 2 - 0.11, 0.7, 2.6, 0.7, 0xffffff); b.sph('glow', 4 + s * 3.7, 2.85, d / 2 - 0.11, 0.26, 0xfff3c4); }
    b.flat('concrete', 4, 0.03, 9, 6.4, d - 18, 0xe9e5db); b.flat('concrete', -6, 0.03, 4.8, 18, 5.6, 0xe9e5db);
    // fountain
    b.cyl('concrete', 4, 0.3, 3, 2.4, 2.5, 0.6, 0xe6e2d8, 18); b.cyl('water', 4, 0.56, 3, 2.15, 2.15, 0.1, 0xffffff, 18); b.cyl('concrete', 4, 1.0, 3, 0.25, 0.35, 1.4, 0xe6e2d8, 10); b.cyl('concrete', 4, 1.7, 3, 0.95, 0.3, 0.2, 0xe6e2d8, 14); b.sph('water', 4, 1.95, 3, 0.4, 0xffffff, 1, 0.8, 1);
    b.solid(4, 3, 4.6, 4.6, 0, 0.62, 'fountain');
    // the house
    b.push(-1.5, 0, -8.5);
    interiorHouse({ ...home, w: 17, d: 10.5, doorX: 5.5, px: 0.5 });
    for (const sx of [3.9, 7.1]) { b.cyl('plaster', sx, 1.6, 6.4, 0.22, 0.26, 2.6, 0xffffff, 12); } b.box('plaster', 5.5, 3.02, 6.2, 4.4, 0.24, 2.0, 0xffffff);
    era.pois.rikuHome = b.w(5.5, 0, 8.5); era.pois.rikuRoom = b.w(5, 0.3, 0.8);
    b.pop();
    // carport with room for the supercars
    b.push(-8.5, 0, 6.5);
    for (const [sx, sz] of [[-7.5, -2.6], [7.5, -2.6], [-7.5, 2.6], [7.5, 2.6], [0, -2.6], [0, 2.6]]) { b.cyl('metal', sx, 1.5, sz, 0.1, 0.1, 3.0, 0xffffff, 8); b.solid(sx, sz, 0.3, 0.3, 0, 3, 'post', false); }
    b.box('metal', 0, 3.06, 0, 16, 0.14, 6.4, 0xeef2f6); b.solid(0, 0, 16, 6.4, 2.95, 3.15, 'canopy');
    for (let i = -1; i <= 1; i++) b.flat('paint', i * 3.8, 0.05, 0, 0.12, 5.2, 0xf2c94c);
    era.garage = [0, 1, 2, 3].map((i) => { const p = b.w(-5.7 + i * 3.8, 0, 0); return { x: p.x, z: p.z, yaw: 0 }; });
    b.pop();
    // pool
    b.box('water', 12.5, 0.08, -9, 7, 0.1, 8, 0x9fe3ff); b.box('concrete', 12.5, 0.06, -9, 8.4, 0.1, 9.4, 0xf2efe6);
    for (let i = 0; i < 2; i++) { b.box('plain', 10.5 + i * 2.6, 0.25, -2.6, 0.8, 0.12, 2.0, 0xffffff); b.cyl('plain', 11.7 + i * 2.6, 1.1, -2.6, 0.03, 0.03, 2.2, 0xdddddd, 5); b.cone('plain', 11.7 + i * 2.6, 2.25, -2.6, 1.1, 0.4, [0xe84a5f, 0x3aa0e0][i], 10); }
    for (let i = 0; i < 7; i++) tree(b, R, -w / 2 + 2 + i * 5.2, -d / 2 + 1.6, 0.9, i % 2 ? 'pine' : 'round');
    for (let i = 0; i < 8; i++) bush(b, R, -w / 2 + 1.2, -d / 2 + 5 + i * 3.2, 1); flowers(b, R, 10, 10, 20, 3); flowers(b, R, -2, 12.5, 16, 2.5);
    signAt(b, group, 'RIKU', 0.1, 1.5, d / 2 + 0.03, 0.9, 0.3, 0, { bg: '#c9a227', fg: '#2b2100', font: 'bold 30px serif' });
    era.pois.mansion = b.w(4, 0, d / 2 + 3);
    b.pop();
  }
  function vacantLot(x0, x1, z0, z1) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    b.push(mx, 0, mz, Math.PI);
    perimeter(w, d, 0, STYLE[3], 8);
    b.flat('dirt', 0, 0.02, 0, w - 2, d - 2, 0xe8dcc6);
    // crate pyramid, lumber, tyres, a tired old oak, a "KEEP OUT (nobody does)" board
    for (const [cx, cy, cz] of [[-6, 0.5, -3], [-4.9, 0.5, -3], [-3.8, 0.5, -3], [-5.45, 1.5, -3], [-4.35, 1.5, -3], [-4.9, 2.5, -3]]) { b.box('wood', cx, cy, cz, 1.0, 1.0, 1.0, R.pick([0xc79b68, 0xb98a55, 0xd3a976])); b.solid(cx, cz, 1.0, 1.0, cy - 0.5, cy + 0.5, 'crate'); }
    for (let i = 0; i < 6; i++) b.cyl('wood', 5 + (i % 3) * 0.42 + (i > 2 ? 0.2 : 0), 0.2 + (i > 2 ? 0.36 : 0), -4, 0.2, 0.2, 4.2, 0xc79b68, 8, Math.PI / 2); b.solid(5.4, -4, 1.3, 4.2, 0, 0.75, 'lumber');
    for (let i = 0; i < 3; i++) b.cyl('plain', 7.5, 0.14 + i * 0.26, 3.5, 0.42, 0.42, 0.24, 0x1e1e20, 12); b.solid(7.5, 3.5, 0.84, 0.84, 0, 0.8, 'tyres');
    tree(b, R, -10, 4, 1.7, 'round'); for (let i = 0; i < 9; i++) bush(b, R, R.range(-w / 2 + 2, w / 2 - 2), R.range(-d / 2 + 1.5, -d / 2 + 3), 0.6, 0x7aa84c);
    signAt(b, group, 'EMPTY LOT', 6, 1.4, d / 2 - 1.2, 2.2, 0.6, 0, { bg: '#e9dcc0', fg: '#5a3d1e', double: true }); b.cyl('wood', 6, 0.6, d / 2 - 1.2, 0.06, 0.06, 1.2, 0x8a6a48, 5);
    era.pois.lot = b.w(0, 0, 2);
    b.pop();
  }

  // ---------- lay out the 5 x 4 blocks ----------
  const HOMES = {
    kenta: { owner: 'kenta', w: 10, d: 8, wallC: 0xf7efdc, roofC: 0x3c4a63, style: 0, kid: { rug: 0x8fd0a8, bed: 0x4f81bd },
      extra: (bb, w) => { // the Time Pod pad in the side yard
        const p = bb.w(w / 2 + 2.6, 0, -0.5); era.pois.timePod = p;
      } },
    mira: { owner: 'mira', w: 10, d: 7.6, wallC: 0xfbeef2, roofC: 0x9a4b3c, style: 2, kid: { rug: 0xf6c0d0, bed: 0xe88fb0, item: 'telescope' } },
    goro: { owner: 'goro', w: 9.6, d: 7.6, wallC: 0xefe3c8, roofC: 0x6d4a35, style: 3, hx: -1.6, kid: { rug: 0xf2a03d, bed: 0xc0392b, item: 'drums' } },
    sora: { owner: 'sora', w: 10, d: 7.6, wallC: 0xe6edf2, roofC: 0x2f3f66, style: 1, kid: { rug: 0xbfd3e6, bed: 0x34495e, item: 'books' } },
    riku: { owner: 'riku', wallMat: 'brick', wallC: 0xffffff, roofC: 0x4b4b52, hip: true, kid: { rug: 0xc9a227, bed: 0x8e44ad, item: 'models' } },
  };
  COLS.forEach((cx, i) => ROWS.forEach(([z0, z1], j) => {
    const x0 = cx - 17.5, x1 = cx + 17.5, key = i + ',' + j;
    if (key === '3,2') park(x0, x1, z0, z1);
    else if (key === '2,1') school(x0, x1, z0, z1);
    else if (key === '3,1') shops(x0, x1, z0, z1, HOMES.goro);
    else if (key === '4,0') mansion(x0, x1, z0, z1, HOMES.riku);
    else if (key === '1,2') { vacantLot(x0, x1, z0, (z0 + z1) / 2); const lw = 17.5; lot(cx - lw / 2, (z0 + z1) / 2 + 8.75, lw, 17.5, 0); lot(cx + lw / 2, (z0 + z1) / 2 + 8.75, lw, 17.5, 0); }
    else if (key === '2,2') residential(x0, x1, z0, z1, { SE: HOMES.kenta });
    else if (key === '3,3') residential(x0, x1, z0, z1, { NW: HOMES.mira });
    else if (key === '1,1') residential(x0, x1, z0, z1, { SW: HOMES.sora });
    else residential(x0, x1, z0, z1);
  }));

  // ---------- utility poles + wires, street details ----------
  {
    const pts = [];
    const wire = (ax, ay, az, bx, by, bz) => { for (let k = 0; k < 6; k++) { const t0 = k / 6, t1 = (k + 1) / 6, s0 = Math.sin(t0 * Math.PI) * 0.6, s1 = Math.sin(t1 * Math.PI) * 0.6; pts.push(ax + (bx - ax) * t0, ay + (by - ay) * t0 - s0, az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1 - s1, az + (bz - az) * t1); } };
    for (const z of ROADS_Z) {
      let prev = null;
      for (let x = -98; x <= 100; x += 28) {
        let px = x + (ROADS_X.some((rx) => Math.abs(rx - x) < 5) ? 7 : 0); const pz = z - 3.15;
        if (z === -63 && px > 65 && px < 85) px = 86.5;                      // keep the mansion driveway clear
        b.cyl('concrete', px, 4.2, pz, 0.11, 0.15, 8.4, 0xb9b5ab, 7); b.box('plain', px, 7.7, pz, 0.08, 0.08, 1.7, 0x6a6660); b.box('plain', px, 7.0, pz, 0.08, 0.08, 1.2, 0x6a6660);
        if (R() < 0.5) b.cyl('plain', px, 6.2, pz + 0.3, 0.2, 0.2, 0.6, 0x8d9299, 8);
        if (R() < 0.6) { b.box('plain', px, 5.2, pz + 0.7, 0.05, 0.05, 1.4, 0x8d9299); b.box('glow', px, 5.12, pz + 1.3, 0.2, 0.06, 0.4, 0xfff3c4); }
        b.solid(px, pz, 0.3, 0.3, 0, 8.4, 'pole', false);
        if (prev) for (const o of [-0.75, 0, 0.75]) wire(prev, 7.75, pz + o, px, 7.75, pz + o);
        prev = px;
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2b2b2e })); lines.matrixAutoUpdate = false; group.add(lines);
    // parked cars, post box, bus stop
    era.parked = [[18.4, -8, 0], [-57, 23.6, Math.PI / 2], [66.2, -44, Math.PI], [-23.7, -78, 0], [30, -18.3, Math.PI / 2], [23.6, 38, Math.PI], [-18.4, 40, 0]].map(([x, z, yaw]) => ({ x, z, yaw }));    // drivable town cars (vehicles.js)
    b.cyl('plain', 24.3, 0.6, 24.3, 0.24, 0.24, 1.2, 0xd62828, 10); b.sph('plain', 24.3, 1.2, 24.3, 0.24, 0xd62828); b.solid(24.3, 24.3, 0.5, 0.5, 0, 1.4, 'post');
    b.cyl('plain', -17.6, 1.2, 17.9, 0.04, 0.04, 2.4, 0xcccccc, 5); b.cyl('plain', -17.6, 2.3, 17.9, 0.34, 0.34, 0.04, 0x3a7bd5, 12, Math.PI / 2);
  }

  // ---------- levee, riverside, bridge ----------
  {
    for (let x = -148; x < 150; x += 4) b.flat('concrete', x + 2, 4.04, 76, 4.02, 3, 0xe2ded4);        // levee-top path
    for (const sx of [-42, 0, 42]) stripZ('concrete', sx, 64, 72, 3, 0.06, 0xd6d2c8), stripZ('concrete', sx, 80, 88, 3, 0.06, 0xd6d2c8);
    for (let x = -140; x <= 140; x += 14) if (Math.abs(x - 105) > 8 && Math.abs(x) > 4 && Math.abs(Math.abs(x) - 42) > 4) tree(b, R, x, 73.3, 1.1, 'cherry');
    for (let x = -120; x <= 90; x += 42) bench(b, x + 6, 78.6, Math.PI);
    for (let i = 0; i < 70; i++) { const x = R.range(-170, 170), z = R.range(146, 152); if (Math.abs(x - 105) > 6) b.cone('leaf', x, H(x, z) + 0.5, z, 0.28, 1.2 + R() * 0.6, R.pick([0x7aa84c, 0x8fbf5a, 0x6a9a40]), 5); }
    for (let i = 0; i < 30; i++) rock(b, R, R.range(-170, 170), R.range(153, 157), 0.5 + R() * 0.6);
    // bridge
    b.box('concrete', 105, 0.0, 180, 9, 0.6, 66, 0xd0ccc2); b.solid(105, 180, 9, 66, -0.3, 0.3, 'bridge');
    for (const sx of [-4.35, 4.35]) { b.box('plain', 105 + sx, 1.25, 180, 0.12, 0.1, 66, 0x3f7fbf); b.box('plain', 105 + sx, 0.8, 180, 0.08, 0.06, 66, 0x3f7fbf); for (let z = 148; z <= 212; z += 4) b.box('plain', 105 + sx, 0.8, z, 0.12, 1.0, 0.12, 0x3f7fbf); b.solid(105 + sx, 180, 0.25, 66, 0.3, 1.3, 'rail', false); }
    for (const z of [164, 180, 196]) b.box('concrete', 105, -1.4, z, 7, 2.4, 1.6, 0xbdb9b0);
    era.pois.bridge = new THREE.Vector3(105, 0.3, 180); era.pois.levee = new THREE.Vector3(0, 4, 76); era.pois.riverside = new THREE.Vector3(30, 0, 120);
    era.pois.field = new THREE.Vector3(FIELD.x, 0, FIELD.z - 6);
    signAt(b, group, 'RIVERSIDE BALLPARK', 0, 5.4, 78.2, 5, 0.8, 0, { bg: '#1f4e79', fg: '#fff', double: true }); b.cyl('wood', -2.3, 4.7, 78.2, 0.07, 0.07, 1.4, 0x8a6a48, 5); b.cyl('wood', 2.3, 4.7, 78.2, 0.07, 0.07, 1.4, 0x8a6a48, 5);
  }

  // ---------- the wooded hill with a lookout tree and a tiny shrine ----------
  {
    const hx = -196, hz = -30;
    for (let i = 0; i < 150; i++) { const a = R() * TAU, r = 16 + R() * 58, x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r; if (x > -122) continue; if (Math.abs(z - hz) < 3.5 && x > hx) continue; tree(b, R, x, z, 0.9 + R() * 0.7, R() < 0.35 ? 'pine' : 'round', i % 3 === 0); }
    tree(b, R, hx, hz, 2.6, 'round');
    for (let x = -122; x > hx + 6; x -= 4) { const y = H(x, hz), y2 = H(x - 4, hz); b.box('dirt', x - 2, (y + y2) / 2 + 0.03, hz, Math.hypot(4, y2 - y) + 0.05, 0.06, 2.4, 0xe9dcc4, 0, 0, Math.atan2(y - y2, 4)); }
    b.flat('dirt', -113.5, 0.03, hz, 17, 2.4, 0xe9dcc4);
    // torii + shrine near the top
    const tx = hx + 10, ty = H(tx, hz);
    for (const s of [-1.4, 1.4]) b.cyl('plain', tx, ty + 1.7, hz + s, 0.14, 0.16, 3.4, 0xc0392b, 8);
    b.box('plain', tx, ty + 3.45, hz, 0.3, 0.26, 4.0, 0xc0392b); b.box('plain', tx, ty + 2.9, hz, 0.2, 0.18, 3.2, 0xc0392b); b.box('plain', tx, ty + 3.62, hz, 0.36, 0.1, 4.3, 0x2e3138);
    const sy = H(hx + 4, hz - 6); b.box('wood', hx + 4, sy + 0.9, hz - 6, 1.6, 1.4, 1.4, 0x8a5a34); b.add('roof', gableGeo(2.6, 2.4, 0.9, M.roof.userData.tile), 0x4e6b52, mat4(hx + 4, sy + 1.55, hz - 6)); b.box('rock', hx + 4, sy + 0.1, hz - 6, 2.2, 0.3, 2.0, 0xffffff); b.solid(hx + 4, hz - 6, 1.6, 1.4, sy, sy + 2.2, 'shrine');
    bench(b, hx + 2, hz + 5, Math.PI / 2);
    era.pois.hill = new THREE.Vector3(hx + 3, H(hx + 3, hz + 2), hz + 2);
    signAt(b, group, 'Lookout Hill ➜', -112.5, 1.3, hz + 2.2, 1.8, 0.5, Math.PI / 2, { bg: '#e9dcc0', fg: '#5a3d1e', font: 'bold 24px sans-serif', double: true });
  }

  // ---------- trees around the edges + distant hills ----------
  for (let i = 0; i < 170; i++) {
    const side = i % 4; let x, z;
    if (side === 0) { x = R.range(-150, 150); z = R.range(-200, -116); } else if (side === 1) { x = R.range(118, 220); z = R.range(-150, 56); if (Math.abs(x - 105) < 8) continue; }
    else if (side === 2) { x = R.range(-220, 240); z = R.range(222, 320); if (Math.abs(x - 105) < 10) continue; } else { x = R.range(-150, -116); z = R.range(-150, 56); if (Math.abs(z + 30) < 4) continue; }
    tree(b, R, x, z, 1 + R() * 0.9, R() < 0.3 ? 'pine' : R() < 0.1 ? 'cherry' : 'round', false);
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + R() * 0.2, r = 430 + R() * 90; b.ico('plain', Math.cos(a) * r, -10, Math.sin(a) * r, 95 + R() * 70, R.pick([0x6f9a78, 0x7da888, 0x5f8a6e, 0x86b08f]), 1.6, 0.5 + R() * 0.35, 1.3, 1, R() * 6); }

  // ---------- the Time Pod (interactable; the dialog is wired up by the gadget module) ----------
  {
    const p = era.pois.timePod, g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    const tb = new Batch(M, null, 0);
    tb.cyl('metal', 0, 0.12, 0, 1.3, 1.45, 0.24, 0xd9e2ea, 20); tb.sph('plain', 0, 1.25, 0, 1.05, 0x3fb6c9, 1, 1.15, 1, 16, 10); tb.cyl('plain', 0, 1.25, 0, 1.12, 1.12, 0.16, 0xf2c94c, 20);
    tb.sph('glass', 0, 1.6, 0.55, 0.62, 0xffffff, 1, 0.8, 0.8, 12, 8); for (let i = 0; i < 3; i++) tb.cyl('metal', Math.cos(i * 2.09) * 1.0, 0.45, Math.sin(i * 2.09) * 1.0, 0.07, 0.1, 0.9, 0xffffff, 6, Math.sin(i * 2.09) * 0.35, -Math.cos(i * 2.09) * 0.35);
    tb.cyl('plain', 0, 2.55, 0, 0.03, 0.03, 0.6, 0xdddddd, 5); tb.sph('glow', 0, 2.9, 0, 0.13, 0xff7b54);
    tb.build(g); group.add(g); era.timePod = g;
    col.add(p.x - 1.1, p.x + 1.1, p.z - 1.1, p.z + 1.1, 0, 2.5, 'pod', false);
    era.interact.push({ id: 'timePod', x: p.x, y: 1, z: p.z, r: 3.2, label: 'Board the Time Pod', icon: '⏳' });
  }

  b.build(group);
  era.spawn = { x: era.pois.kentaHome.x, z: era.pois.kentaHome.z + 0.5, yaw: 0 };
  era.update = (dt, G) => {
    M.water.map.offset.x += dt * 0.012; M.water.map.offset.y += dt * 0.004;
    if (era.timePod) era.timePod.children.forEach((m) => 0);
  };
  return era;
}
