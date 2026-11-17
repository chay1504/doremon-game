// Real grass: thousands of small alpha-cut tufts that sway in the wind, built in 8 m patches
// around the player. A top-down mask of each era (rendered once) keeps grass off roads,
// floors, paving, water and dirt — anything that is not bare lawn.
import * as THREE from 'three';
import { G } from './game.js';
import { rng } from './util.js';

const CELL = 8, RES = 2048;

function buildMask(era) {
  const M = G.M, r = G.renderer, B = (era.bounds || 340) + 12, hidden = [];
  let hasLawn = false;
  era.group.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
    const m = o.material; if (m === M.grass) hasLawn = true;
    const skip = !o.isMesh || m === M.grass || m === M.leaf || m === M.leafcard || m === M.glass || m === M.glow || o.userData.sign;
    if (skip && o.visible) { o.visible = false; hidden.push(o); }
  });
  if (!hasLawn) { for (const o of hidden) o.visible = true; return null; }
  const rt = new THREE.WebGLRenderTarget(RES, RES, { depthBuffer: true }), cam = new THREE.OrthographicCamera(-B, B, B, -B, 1, 3000);
  cam.position.set(0, 1500, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  const sc = new THREE.Scene(), parent = era.group.parent, wasVisible = era.group.visible; sc.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  sc.add(era.group); era.group.visible = true;
  const oldTarget = r.getRenderTarget(), oldColor = new THREE.Color(); r.getClearColor(oldColor); const oldAlpha = r.getClearAlpha(), shadows = r.shadowMap.enabled;
  r.shadowMap.enabled = false; r.setRenderTarget(rt); r.setClearColor(0xffffff, 1); r.clear(); r.render(sc, cam);
  const buf = new Uint8Array(RES * RES * 4); r.readRenderTargetPixels(rt, 0, 0, RES, RES, buf);
  r.setRenderTarget(oldTarget); r.setClearColor(oldColor, oldAlpha); r.shadowMap.enabled = shadows;
  era.group.visible = wasVisible; if (parent) parent.add(era.group); for (const o of hidden) o.visible = true; rt.dispose(); sc.overrideMaterial.dispose();
  const mask = new Uint8Array(RES * RES); for (let i = 0; i < mask.length; i++) mask[i] = buf[i * 4];
  return { mask, B };
}

class Grass {
  constructor() {
    const hi = G.save.quality === 'high';
    this.radius = hi ? 44 : 34; this.radiusBase = this.radius; this.density = hi ? 9 : 7; this.masks = {}; this.chunks = new Map(); this.eraKey = null; this.queue = []; this.cx = 1e9; this.cz = 1e9;
    this.group = new THREE.Group(); this.group.name = 'grass'; G.scene.add(this.group);
    this.u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFar: { value: this.radius } };
    const mat = this.mat = G.M.grasscard; const u = this.u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform float uTime; uniform vec3 uCam; uniform float uFar; attribute float lift;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float gd = distance(position.xz, uCam.xz); float gf = 1.0 - smoothstep(uFar * 0.55, uFar * 0.97, gd);
        transformed.y -= lift * (1.0 - gf);
        float gw = lift * gf * (sin(uTime * 1.7 + position.x * 0.7 + position.z * 0.9) * 0.16 + sin(uTime * 3.3 + position.x * 2.3 + position.z * 1.1) * 0.05);
        transformed.x += gw; transformed.z += gw * 0.6;`);
    };
    mat.needsUpdate = true;
  }
  isLawn(m, x, z) { const px = ((x + m.B) / (2 * m.B) * RES) | 0, py = ((m.B - z) / (2 * m.B) * RES) | 0; if (px < 1 || py < 1 || px >= RES - 1 || py >= RES - 1) return false; const k = m.mask, i = py * RES + px; return k[i] > 128 && k[i - 1] > 128 && k[i + 1] > 128 && k[i - RES] > 128 && k[i + RES] > 128; }
  build(ix, iz) {
    const era = G.eras[this.eraKey], m = this.masks[this.eraKey], R = rng((ix * 73856093) ^ (iz * 19349663) ^ 0x9e3779b9), n = Math.round(CELL * CELL * this.density);
    const P = [], U = [], C = [], L = [], I = [], col = new THREE.Color(), wild = this.eraKey !== 'present';
    for (let i = 0; i < n; i++) {
      const x = (ix + R()) * CELL, z = (iz + R()) * CELL; if (!this.isLawn(m, x, z)) continue;
      const y = era.heightAt(x, z); if (y < -0.25 || (era.waterAt && era.waterAt(x, z) > y)) continue;
      const rough = wild || Math.abs(x) > 116 || z > 66 || z < -112, tall = R() < (rough ? 0.3 : 0.06);
      const h = (tall ? 0.26 + R() * 0.18 : 0.1 + R() * 0.1) * (rough ? 2.1 : 1), w = (0.26 + R() * 0.2) * (rough ? 1.3 : 1), a = R() * Math.PI, k = 0.8 + R() * 0.3;
      col.setRGB(0.3 * k + R() * 0.05, 0.56 * k + R() * 0.06, 0.17 * k);
      if (R() < 0.05) col.setRGB(0.5 * k, 0.55 * k, 0.2 * k);                                   // the odd dry tuft
      for (let q = 0; q < 2; q++) {
        const ang = a + q * 1.57, dx = Math.cos(ang) * w, dz = Math.sin(ang) * w, base = P.length / 3;
        P.push(x - dx, y, z - dz, x + dx, y, z + dz, x + dx, y + h, z + dz, x - dx, y + h, z - dz);
        U.push(0, 0, 1, 0, 1, 1, 0, 1); L.push(0, 0, h, h);
        for (let v = 0; v < 4; v++) C.push(col.r, col.g, col.b);
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (!P.length) return null;
    const g = new THREE.BufferGeometry(), cnt = P.length / 3, N = new Float32Array(cnt * 3); for (let i = 0; i < cnt; i++) N[i * 3 + 1] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('lift', new THREE.Float32BufferAttribute(L, 1)); g.setIndex(I); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false; this.group.add(mesh); return mesh;
  }
  clear() { for (const c of this.chunks.values()) if (c) { this.group.remove(c); c.geometry.dispose(); } this.chunks.clear(); this.queue.length = 0; this.cx = this.cz = 1e9; }
  update(dt) {
    const key = G.era;
    if (key !== this.eraKey) { this.clear(); this.eraKey = key; if (!(key in this.masks)) this.masks[key] = buildMask(G.eras[key]); }
    const m = this.masks[key]; this.group.visible = !!m; if (!m) return;
    const sub = G.player.vehicle || G.pc; if (!sub) return;
    this.u.uTime.value = G.t; this.u.uCam.value.set(sub.pos.x, sub.pos.y, sub.pos.z);
    const cx = Math.floor(sub.pos.x / CELL), cz = Math.floor(sub.pos.z / CELL), rc = Math.ceil(this.radius / CELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx; this.cz = cz; this.queue.length = 0;
      for (let ix = cx - rc; ix <= cx + rc; ix++) for (let iz = cz - rc; iz <= cz + rc; iz++) { const d = Math.hypot(ix + 0.5 - sub.pos.x / CELL, iz + 0.5 - sub.pos.z / CELL); if (d * CELL < this.radius + CELL * 0.7 && !this.chunks.has(ix + ',' + iz)) this.queue.push([d, ix, iz]); }
      this.queue.sort((a, b) => b[0] - a[0]);
      for (const [k, c] of this.chunks) { const [ix, iz] = k.split(',').map(Number); if (Math.abs(ix - cx) > rc + 2 || Math.abs(iz - cz) > rc + 2) { if (c) { this.group.remove(c); c.geometry.dispose(); } this.chunks.delete(k); } }
    }
    for (let i = 0; i < 3 && this.queue.length; i++) { const [, ix, iz] = this.queue.pop(); this.chunks.set(ix + ',' + iz, this.build(ix, iz)); }
  }
}

export function init() {
  if (G.save.quality === 'low' || !G.M.grasscard) return;      // Smooth mode keeps the flat lawn
  G.grass = new Grass();
}
