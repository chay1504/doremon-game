// Geometry batching. The whole static world is thousands of small boxes/cylinders;
// drawing them one by one would crawl on an integrated GPU, so a Batch collects them,
// groups by (material, map chunk) and merges each group into a single mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// Normalise any geometry to {indexed, position, normal, uv, color} so everything can merge.
export function prep(geo, hex = 0xffffff) {
  if (!geo.index) { const n = geo.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; geo.setIndex(new THREE.BufferAttribute(idx, 1)); }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.color) {
    _c.set(hex); const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  geo.morphAttributes = {};
  return geo;
}
// Box whose UVs are measured in metres / tile so textures keep a constant physical size.
export function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile[0], uv.getY(k) * dims[f][1] / tile[1]); }
  }
  return g;
}
export function scaleUV(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
export const mat4 = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

// Gable roof prism: ridge runs along X. w,d = footprint incl. overhang, h = ridge height.
export function gableGeo(w, d, h, tile = [1, 1]) {
  const hw = w / 2, hd = d / 2, sl = Math.hypot(hd, h);
  const P = [], U = [], I = [];
  const quad = (a, b, c, e, uw, uh) => { const n = P.length / 3; P.push(...a, ...b, ...c, ...e); U.push(0, 0, uw, 0, uw, uh, 0, uh); I.push(n, n + 1, n + 2, n, n + 2, n + 3); };
  quad([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [-hw, h, 0], w / tile[0], sl / tile[1]);   // front slope
  quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0], w / tile[0], sl / tile[1]); // back slope
  quad([-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], 1, 1);                   // underside
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
// The two triangular gable-end walls under a gable roof.
export function gableEndsGeo(w, d, h, tile = [2, 2]) {
  const hw = w / 2, hd = d / 2, P = [], U = [], I = [];
  const tri = (a, b, c) => { const n = P.length / 3; P.push(...a, ...b, ...c); U.push(0, 0, d / tile[0], 0, d / 2 / tile[0], h / tile[1]); I.push(n, n + 1, n + 2); };
  tri([hw, 0, hd], [hw, 0, -hd], [hw, h, 0]); tri([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
// Hip (pyramid-ish) roof.
export function hipGeo(w, d, h, ridge = 0.4, tile = [1, 1]) {
  const hw = w / 2, hd = d / 2, r = Math.max(0, hw - hd) * ridge + 0.01, P = [], U = [], I = [];
  const poly = (pts) => { const n = P.length / 3; for (const p of pts) { P.push(...p); U.push((p[0] + p[2] * 0.0) / tile[0], (p[1] * 1.6 + Math.abs(p[2]) * 0 ) / tile[1]); } for (let i = 1; i < pts.length - 1; i++) I.push(n, n + i, n + i + 1); };
  poly([[-hw, 0, hd], [hw, 0, hd], [r, h, 0], [-r, h, 0]]);
  poly([[hw, 0, -hd], [-hw, 0, -hd], [-r, h, 0], [r, h, 0]]);
  poly([[hw, 0, hd], [hw, 0, -hd], [r, h, 0]]);
  poly([[-hw, 0, -hd], [-hw, 0, hd], [-r, h, 0]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}

export class Batch {
  // mats: material registry. colliders: optional Colliders that solid() writes into. chunk: metres (0 = no chunking).
  constructor(mats, colliders = null, chunk = 72) { this.mats = mats; this.col = colliders; this.chunk = chunk; this.b = new Map(); this.stack = [new THREE.Matrix4()]; this.m = this.stack[0]; this.det = false; }
  // Geometry added while detail is on (window frames, sills, shelf goods, flowers…) is only drawn near the camera and never casts shadows.
  detail(on = true) { this.det = on; return this; }
  push(x = 0, y = 0, z = 0, ry = 0) { const n = this.m.clone().multiply(_m.makeRotationY(ry).setPosition(x, y, z)); this.stack.push(n); this.m = n; return this; }
  pop() { this.stack.pop(); this.m = this.stack[this.stack.length - 1]; return this; }
  // local point -> world point
  w(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.m); }
  add(mat, geo, c = 0xffffff, local = null) {
    prep(geo, c); if (local) geo.applyMatrix4(local); geo.applyMatrix4(this.m);
    let key = this.det ? mat + '~d' : mat;
    if (this.chunk) { const ch = this.det ? this.chunk / 2 : this.chunk; geo.computeBoundingBox(); const bb = geo.boundingBox; key += '|' + Math.floor((bb.min.x + bb.max.x) / 2 / ch) + '|' + Math.floor((bb.min.z + bb.max.z) / 2 / ch); }
    let a = this.b.get(key); if (!a) this.b.set(key, a = []); a.push(geo);
  }
  box(mat, x, y, z, w, h, d, c, ry = 0, rx = 0, rz = 0) { this.add(mat, boxGeo(w, h, d, this.mats[mat].userData.tile), c, mat4(x, y, z, ry, rx, rz)); }
  cyl(mat, x, y, z, rt, rb, h, c, seg = 10, rx = 0, rz = 0, ry = 0) { const g = new THREE.CylinderGeometry(rt, rb, h, seg); const t = this.mats[mat].userData.tile; if (t) scaleUV(g, (rt + rb) * Math.PI / t[0], h / t[1]); this.add(mat, g, c, mat4(x, y, z, ry, rx, rz)); }
  sph(mat, x, y, z, r, c, sx = 1, sy = 1, sz = 1, ws = 10, hs = 7) { const g = new THREE.SphereGeometry(r, ws, hs); const t = this.mats[mat].userData.tile; if (t) scaleUV(g, r * 6 / t[0], r * 3 / t[1]); this.add(mat, g, c, mat4(x, y, z, 0, 0, 0, sx, sy, sz)); }
  ico(mat, x, y, z, r, c, sx = 1, sy = 1, sz = 1, det = 1, ry = 0) { const g = new THREE.IcosahedronGeometry(r, det); const t = this.mats[mat].userData.tile; if (t) scaleUV(g, r * 6 / t[0], r * 3 / t[1]); this.add(mat, g, c, mat4(x, y, z, ry, 0, 0, sx, sy, sz)); }
  cone(mat, x, y, z, r, h, c, seg = 8, rx = 0, rz = 0) { this.add(mat, new THREE.ConeGeometry(r, h, seg), c, mat4(x, y, z, 0, rx, rz)); }
  // Flat picture quad. Faces +Z by default (ry turns it). uv is 0..1 unless the material tiles.
  quad(mat, x, y, z, w, h, c, ry = 0, rx = 0) { const g = new THREE.PlaneGeometry(w, h); const t = this.mats[mat].userData.tile; if (t) scaleUV(g, w / t[0], h / t[1]); this.add(mat, g, c, mat4(x, y, z, ry, rx, 0)); }
  // Horizontal decal quad lying on the ground.
  flat(mat, x, y, z, w, d, c, ry = 0) { const g = new THREE.PlaneGeometry(w, d); const t = this.mats[mat].userData.tile; if (t) scaleUV(g, w / t[0], d / t[1]); g.rotateX(-Math.PI / 2); this.add(mat, g, c, mat4(x, y, z, ry)); }
  // Register a solid box (centre x,z, size w,d, from y0 to y1) in the current local frame.
  solid(x, z, w, d, y0, y1, tag = '', walk = true) {
    if (!this.col) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { _p.set(x + sx * w / 2, 0, z + sz * d / 2).applyMatrix4(this.m); x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); z0 = Math.min(z0, _p.z); z1 = Math.max(z1, _p.z); }
    const oy = this.m.elements[13];
    return this.col.add(x0, x1, z0, z1, y0 + oy, y1 + oy, tag, walk);
  }
  // box + collider in one call (y is the box centre).
  sbox(mat, x, y, z, w, h, d, c, tag = '') { this.box(mat, x, y, z, w, h, d, c); return this.solid(x, z, w, d, y - h / 2, y + h / 2, tag); }
  build(parent) {
    const out = [];
    for (const [key, geos] of this.b) {
      const mk = key.split('|')[0], det = mk.endsWith('~d'), mat = this.mats[det ? mk.slice(0, -2) : mk];
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!g) { console.warn('merge failed', key); continue; }
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !det && !mat.userData.noShadow && !mat.userData.noCast; mesh.receiveShadow = !mat.userData.noShadow;
      if (det) { g.computeBoundingSphere(); mesh.userData.detail = true; }
      mesh.matrixAutoUpdate = false; parent.add(mesh); out.push(mesh);
      for (const x of geos) if (x !== g) x.dispose();
    }
    this.b.clear();
    return out;
  }
}

// Merge a list of [geometry, colour, matrix?] parts into one vertex-coloured geometry (used for characters & props).
export function fuse(parts) {
  const gs = parts.map(([g, c, m]) => { prep(g, c); if (m) g.applyMatrix4(m); return g; });
  const out = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
  for (const g of gs) if (g !== out) g.dispose();
  return out;
}
