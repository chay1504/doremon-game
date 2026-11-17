// The two time-travel destinations: Dino Valley (100 million years ago) and Neo Hinode (2226).
// Each builds an era object (see PLAN.md "Era object contract"), its scenery, and its inhabitants.
import * as THREE from 'three';
import { Batch, fuse, mat4 } from './build.js';
import { Colliders } from './physics.js';
import { G } from './game.js';
import { spawnActor } from './actors.js';
import { rng, clamp, lerp, damp, smooth, TAU, pick } from './util.js';
import { tree, bush, flowers, bench, signAt } from './props.js';

// ------------------------------------------------------------------ shared helpers
// A grid terrain whose heightAt() interpolates the very same triangles the mesh draws,
// so feet never float or sink. fn(x,z) is sampled once per vertex.
function makeTerrain(x0, z0, nx, nz, sx, sz, fn, colorFn, mat) {
  const W = nx + 1, D = nz + 1, n = W * D, hs = new Float32Array(n);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), colr = new Float32Array(n * 3), idx = new Uint32Array(nx * nz * 6);
  const tile = mat.userData.tile || [6, 6], c = new THREE.Color();
  for (let iz = 0; iz < D; iz++) for (let ix = 0; ix < W; ix++) {
    const i = iz * W + ix, x = x0 + ix * sx, z = z0 + iz * sz, h = fn(x, z);
    hs[i] = h; pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z; uv[i * 2] = x / tile[0]; uv[i * 2 + 1] = z / tile[1];
    colorFn(x, z, h, c); colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
  }
  let k = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) { const a = iz * W + ix, b = a + W, cc = b + 1, d = a + 1; idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = cc; idx[k++] = d; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  const heightAt = (x, z) => {
    const fx = clamp((x - x0) / sx, 0, nx - 1e-4), fz = clamp((z - z0) / sz, 0, nz - 1e-4), ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, a = iz * W + ix;
    const ha = hs[a], hb = hs[a + W], hc = hs[a + W + 1], hd = hs[a + 1];
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  };
  return { mesh, heightAt };
}

// The arrival Time Pod (same look as the one in Kenta's garden).
function addTimePod(era, M, x, z) {
  const y = era.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
  const tb = new Batch(M, null, 0);
  tb.cyl('metal', 0, 0.12, 0, 1.3, 1.45, 0.24, 0xd9e2ea, 20); tb.sph('plain', 0, 1.25, 0, 1.05, 0x3fb6c9, 1, 1.15, 1, 16, 10); tb.cyl('plain', 0, 1.25, 0, 1.12, 1.12, 0.16, 0xf2c94c, 20);
  tb.sph('glass', 0, 1.6, 0.55, 0.62, 0xffffff, 1, 0.8, 0.8, 12, 8);
  for (let i = 0; i < 3; i++) tb.cyl('metal', Math.cos(i * 2.09) * 1.0, 0.45, Math.sin(i * 2.09) * 1.0, 0.07, 0.1, 0.9, 0xffffff, 6, Math.sin(i * 2.09) * 0.35, -Math.cos(i * 2.09) * 0.35);
  tb.cyl('plain', 0, 2.55, 0, 0.03, 0.03, 0.6, 0xdddddd, 5); tb.sph('glow', 0, 2.9, 0, 0.13, 0xff7b54);
  tb.build(g); era.group.add(g); era.timePod = g;
  era.colliders.add(x - 1.1, x + 1.1, z - 1.1, z + 1.1, y, y + 2.5, 'pod', false);
  era.pois.timePod = new THREE.Vector3(x, y, z);
  era.interact.push({ id: 'timePod', x, y: y + 1, z, r: 3.2, label: 'Board the Time Pod', icon: '⏳' });
}

// Rounded-rectangle loop (monorail, sky lanes). at(s, out) fills out.x / out.z / out.yaw for distance s along it.
function loopPath(cx, cz, hx, hz, r) {
  const ex = 2 * (hx - r), ez = 2 * (hz - r), arc = Math.PI * r / 2, L = 2 * ex + 2 * ez + 4 * arc, H = Math.PI / 2;
  return {
    L, at(s, o) {
      s = ((s % L) + L) % L; let p;
      if (s < ex) { o.x = cx - hx + r + s; o.z = cz - hz; o.yaw = H; return o; } s -= ex;
      if (s < arc) { p = s / r; o.x = cx + hx - r + r * Math.sin(p); o.z = cz - hz + r - r * Math.cos(p); o.yaw = H - p; return o; } s -= arc;
      if (s < ez) { o.x = cx + hx; o.z = cz - hz + r + s; o.yaw = 0; return o; } s -= ez;
      if (s < arc) { p = s / r; o.x = cx + hx - r + r * Math.cos(p); o.z = cz + hz - r + r * Math.sin(p); o.yaw = -p; return o; } s -= arc;
      if (s < ex) { o.x = cx + hx - r - s; o.z = cz + hz; o.yaw = -H; return o; } s -= ex;
      if (s < arc) { p = s / r; o.x = cx - hx + r - r * Math.sin(p); o.z = cz + hz - r + r * Math.cos(p); o.yaw = -H - p; return o; } s -= arc;
      if (s < ez) { o.x = cx - hx; o.z = cz + hz - r - s; o.yaw = Math.PI; return o; } s -= ez;
      p = s / r; o.x = cx - hx + r - r * Math.cos(p); o.z = cz - hz + r - r * Math.sin(p); o.yaw = Math.PI - p; return o;
    },
  };
}

// Model-building bits: a tapered limb between two points, an ellipsoid, a box.
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _td = new THREE.Vector3(), _tq = new THREE.Quaternion(), _UP = new THREE.Vector3(0, 1, 0), _ONE = new THREE.Vector3(1, 1, 1);
function tube(rb, rt, a, e, c, n = 8) {
  _ta.set(a[0], a[1], a[2]); _tb.set(e[0], e[1], e[2]); _td.subVectors(_tb, _ta); const len = _td.length(); _td.divideScalar(len);
  _tq.setFromUnitVectors(_UP, _td); _ta.add(_tb).multiplyScalar(0.5);
  return [new THREE.CylinderGeometry(rt, rb, len, n), c, new THREE.Matrix4().compose(_ta, _tq, _ONE)];
}
const ball = (r, c, x, y, z, sx = 1, sy = 1, sz = 1, w = 10, h = 7) => [new THREE.SphereGeometry(r, w, h), c, mat4(x, y, z, 0, 0, 0, sx, sy, sz)];
const cube = (w, h, d, c, x, y, z, ry = 0, rx = 0, rz = 0) => [new THREE.BoxGeometry(w, h, d), c, mat4(x, y, z, ry, rx, rz)];
function rig(s) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }), root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(s);
  const mesh = (parts, m = mat) => { const x = new THREE.Mesh(fuse(parts), m); x.castShadow = true; return x; };
  const grp = (parent, x, y, z, parts) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parts) g.add(mesh(parts)); parent.add(g); return g; };
  return { mat, root, body, mesh, grp };
}
const animal = (plain, translated) => () => (G.flags.translate ? pick(translated) : pick(plain));
const DARK = 0x1c1c1e, HORN = 0xf4ecd8;

// ------------------------------------------------------------------ dinosaur models (original low-poly designs)
// One animation routine for all of them. Leg phase advances with distance walked, so feet do not slide.
function dinoAnimate(cfg, s) {
  const stride = TAU / (4 * cfg.legLen * s * Math.sin(cfg.amp));
  return (a, dt, speed) => {
    const j = a.j, t = G.t, st = a.state, body = j.body, L = j.legs;
    a.dph = (a.dph || 0) + dt * speed * stride / Math.max(0.3, a.size);
    const sw = clamp(speed / (a.walkSpeed * a.speedMul * 0.8 + 0.01), 0, 1.25), k = Math.min(sw, 1), idle = 1 - k, sn = Math.sin(a.dph), la = cfg.amp * sw;
    if (cfg.legs === 4) { L[0].rotation.x = sn * la; L[3].rotation.x = sn * la; L[1].rotation.x = -sn * la; L[2].rotation.x = -sn * la; }
    else { L[0].rotation.x = sn * la; L[1].rotation.x = -sn * la; }
    j.tail.rotation.y = Math.sin(t * cfg.tailSp + a.ph) * cfg.tailAmp + sn * 0.07 * k;
    j.tail.rotation.x = Math.sin(t * cfg.tailSp * 0.6 + a.ph) * 0.04;
    a.gz = damp(a.gz || 0, cfg.graze && speed < 0.1 && a.ai.mode === 'wander' && a.ai.wait > 1 ? cfg.graze : 0, 1.5, dt);   // lower the head to nibble while resting
    j.neck.rotation.x = Math.sin(a.dph * 2) * cfg.neckBob * k + Math.sin(t * 0.45 + a.ph) * cfg.neckIdle * idle + a.gz;
    j.neck.rotation.y = Math.sin(t * 0.3 + a.ph * 2) * cfg.look * idle;
    let by = Math.abs(Math.cos(a.dph)) * cfg.bounce * s * k, bz = 0;
    const bx = cfg.lean * clamp((speed - a.walkSpeed) / (a.runSpeed - a.walkSpeed + 0.01), 0, 1) + a.flyTilt * 0.3;
    if (st === 'sleep' || st === 'stun') { bz = 1.35; by = cfg.lie * s; }
    else if (st === 'dance' || st === 'float') body.rotation.y += dt * 4;
    else if (st === 'laugh' || st === 'cheer') by += Math.abs(Math.sin(t * 9)) * cfg.bounce * s * 2.5;
    if (st !== 'dance' && st !== 'float') body.rotation.y = damp(body.rotation.y % TAU, 0, 8, dt);
    body.rotation.z = damp(body.rotation.z, bz, 6, dt); body.position.y = damp(body.position.y, by, 10, dt); body.rotation.x = damp(body.rotation.x, bx, 6, dt);
    if (j.jaw) { a.roarT = Math.max(0, (a.roarT || 0) - dt); j.jaw.rotation.x = damp(j.jaw.rotation.x, a.roarT > 0 ? 0.6 + Math.sin(t * 30) * 0.05 : 0.05 + Math.max(0, Math.sin(t * 0.8 + a.ph)) * 0.06, 12, dt); }
  };
}

// Long-necked giant: about 9 m to the top of the head. `height` is the back, so riders sit behind the neck.
function makeLongneck(look) {
  const s = look.s || 1, c = look.skin, bl = look.belly, sp = look.spot, { mat, root, body, grp } = rig(s);
  const tp = [ball(1, c, 0, 0, 0, 1.45, 1.4, 2.9, 14, 9), ball(1, bl, 0, -0.35, 0.1, 1.3, 1.15, 2.6, 12, 7)];
  for (let i = 0; i < 6; i++) tp.push(ball(0.3, sp, 0, 1.32 - Math.abs(i - 2.5) * 0.11, -1.9 + i * 0.75, 1, 0.6, 1.5, 6, 4));
  for (const sx of [-1, 1]) { tp.push(ball(0.5, sp, sx * 1.2, 0.35, -0.7, 0.5, 1, 1.3, 6, 5)); tp.push(ball(0.4, sp, sx * 1.22, 0.1, 0.9, 0.5, 1, 1.2, 6, 5)); }
  const torso = grp(body, 0, 3.4, 0, tp);
  const np = [tube(0.85, 0.36, [0, -0.25, -0.35], [0, 4.3, 2.9], c, 9), ball(0.5, c, 0, 4.55, 3.3, 0.95, 0.8, 1.5, 10, 7), ball(0.36, bl, 0, 4.42, 3.9, 1, 0.7, 1.15, 8, 6), ball(0.2, sp, 0, 4.95, 3.15, 0.8, 0.6, 1.3, 6, 4)];
  for (const sx of [-1, 1]) { np.push(ball(0.075, DARK, sx * 0.38, 4.68, 3.55, 1, 1, 1, 6, 5)); np.push(ball(0.03, DARK, sx * 0.14, 4.52, 4.28, 1, 1, 1, 5, 4)); }
  for (let i = 0; i < 4; i++) np.push(ball(0.2, sp, 0, 0.75 + i * 0.95, 0.15 + i * 0.66, 0.7, 0.9, 1.3, 6, 4));
  const neck = grp(torso, 0, 0.5, 2.2, np);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => grp(body, sx * 0.95, 3.1, sz * 1.55, [
    tube(0.52, 0.42, [0, 0.2, 0], [0, -2.75, 0], c, 8), tube(0.6, 0.5, [0, -2.7, 0.05], [0, -3.1, 0.05], c, 8),
    ball(0.13, HORN, -0.25, -3.0, 0.55, 1, 1, 1, 5, 4), ball(0.13, HORN, 0, -3.0, 0.62, 1, 1, 1, 5, 4), ball(0.13, HORN, 0.25, -3.0, 0.55, 1, 1, 1, 5, 4)]));
  const tail = grp(torso, 0, 0.1, -2.5, [tube(0.82, 0.07, [0, 0, 0.35], [0, -0.9, -5.6], c, 8)]);
  const cfg = { legs: 4, amp: 0.3, legLen: 3.1, tailAmp: 0.2, tailSp: 0.9, neckBob: 0.04, neckIdle: 0.07, look: 0.22, bounce: 0.05, lean: 0.03, lie: 0.75, graze: 0.2 };
  return { root, j: { body, torso, head: neck, neck, legs, tail }, mat, kind: 'dino', height: 5.0 * s, radius: 1.6 * s, eye: 5.6 * s, animate: dinoAnimate(cfg, s) };
}

// Three-horned grazer with a spotted neck shield.
function makeTrihorn(look) {
  const s = look.s || 1, c = look.skin, bl = look.belly, sp = look.spot, { mat, root, body, grp } = rig(s);
  const tp = [ball(1, c, 0, 0, 0, 0.9, 0.85, 1.65, 12, 8), ball(1, bl, 0, -0.25, 0.05, 0.8, 0.7, 1.5, 10, 6)];
  for (let i = 0; i < 4; i++) tp.push(ball(0.22, sp, 0, 0.78 - Math.abs(i - 1.5) * 0.08, -0.9 + i * 0.6, 1.2, 0.5, 1.2, 6, 4));
  const torso = grp(body, 0, 1.5, 0, tp);
  const fa = 1.15, hp = [ball(0.5, c, 0, 0, 0.45, 1, 0.95, 1.35, 10, 7), [new THREE.CylinderGeometry(1.05, 1.05, 0.14, 12), c, mat4(0, 0.5, -0.05, 0, fa)],
    tube(0.3, 0.06, [0, -0.14, 0.9], [0, -0.34, 1.32], 0x6a5a40, 6), tube(0.1, 0.01, [0, 0.14, 1.0], [0, 0.52, 1.3], HORN, 6)];
  for (let i = 0; i < 5; i++) { const p = 0.45 + i * 0.56, r = 1.0; hp.push(ball(0.15, sp, r * Math.cos(p), 0.5 + r * Math.sin(p) * Math.sin(fa), -0.05 - r * Math.sin(p) * Math.cos(fa), 1, 1, 0.6, 6, 4)); }
  for (const sx of [-1, 1]) { hp.push(tube(0.11, 0.01, [sx * 0.24, 0.33, 0.5], [sx * 0.34, 0.95, 1.5], HORN, 6)); hp.push(ball(0.055, DARK, sx * 0.42, 0.1, 0.72, 1, 1, 1, 6, 5)); }
  const head = grp(torso, 0, 0.1, 1.45, hp);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => grp(body, sx * 0.6, 1.35, sz * 1.0, [tube(0.3, 0.24, [0, 0.15, 0], [0, -1.2, 0], c, 7), tube(0.31, 0.29, [0, -1.15, 0.04], [0, -1.35, 0.04], bl, 7)]));
  const tail = grp(torso, 0, 0, -1.4, [tube(0.5, 0.05, [0, 0.05, 0.25], [0, -0.55, -2.0], c, 7)]);
  const cfg = { legs: 4, amp: 0.42, legLen: 1.35, tailAmp: 0.25, tailSp: 1.4, neckBob: 0.05, neckIdle: 0.06, look: 0.25, bounce: 0.04, lean: 0.06, lie: 0.45, graze: 0.32 };
  return { root, j: { body, torso, head, neck: head, legs, tail }, mat, kind: 'dino', height: 2.5 * s, radius: 1.05 * s, eye: 2.0 * s, animate: dinoAnimate(cfg, s) };
}

// Small two-legged runner with a feathery crest.
function makeRunner(look) {
  const s = look.s || 1, c = look.skin, bl = look.belly, sp = look.spot, { mat, root, body, grp } = rig(s);
  const tp = [ball(1, c, 0, 0.02, 0.08, 0.2, 0.21, 0.5, 10, 6), ball(1, bl, 0, -0.04, 0.1, 0.17, 0.17, 0.44, 8, 5)];
  for (let i = 0; i < 3; i++) tp.push(ball(0.06, sp, 0, 0.21, -0.2 + i * 0.22, 1.6, 0.4, 1.2, 5, 4));
  for (const sx of [-1, 1]) tp.push(tube(0.04, 0.025, [sx * 0.15, 0, 0.38], [sx * 0.17, -0.2, 0.52], c, 5));
  const torso = grp(body, 0, 0.78, 0, tp);
  const np = [tube(0.1, 0.065, [0, -0.05, -0.05], [0, 0.42, 0.22], c, 6), ball(1, c, 0, 0.5, 0.34, 0.1, 0.095, 0.2, 8, 6), ball(1, bl, 0, 0.47, 0.5, 0.065, 0.05, 0.12, 6, 4)];
  for (const sx of [-1, 1]) np.push(ball(0.024, DARK, sx * 0.085, 0.53, 0.38, 1, 1, 1, 5, 4));
  for (let i = -1; i <= 1; i++) np.push(tube(0.045, 0.004, [i * 0.03, 0.57, 0.28], [i * 0.1, 0.8 - Math.abs(i) * 0.05, 0.02], look.crest ?? 0xff7b54, 4));
  const neck = grp(torso, 0, 0.1, 0.48, np);
  const legs = [-1, 1].map((sx) => grp(body, sx * 0.13, 0.76, 0, [tube(0.09, 0.06, [0, 0.04, 0], [0, -0.34, 0.1], c, 6), tube(0.05, 0.04, [0, -0.34, 0.1], [0, -0.72, -0.02], c, 5), cube(0.1, 0.05, 0.26, bl, 0, -0.735, 0.08)]));
  const tail = grp(torso, 0, 0.02, -0.42, [tube(0.13, 0.015, [0, 0, 0.06], [0, 0.08, -1.15], c, 6), ball(0.05, sp, 0, 0.08, -1.12, 1, 1, 1.6, 5, 4)]);
  const cfg = { legs: 2, amp: 0.7, legLen: 0.76, tailAmp: 0.28, tailSp: 3.0, neckBob: 0.1, neckIdle: 0.12, look: 0.5, bounce: 0.05, lean: 0.22, lie: 0.12 };
  return { root, j: { body, torso, head: neck, neck, legs, tail }, mat, kind: 'dino', height: 1.3 * s, radius: 0.34 * s, eye: 1.2 * s, animate: dinoAnimate(cfg, s) };
}

// The big toothy one: about 5 m tall, tiny arms, a jaw that opens when it roars.
function makeChomper(look) {
  const s = look.s || 1, c = look.skin, bl = look.belly, sp = look.spot, { mat, root, body, grp } = rig(s);
  const tp = [ball(1, c, 0, 0.05, 0.1, 0.95, 1.05, 2.0, 12, 8), ball(1, bl, 0, -0.3, 0.25, 0.8, 0.85, 1.7, 10, 6)];
  for (let i = 0; i < 6; i++) tp.push(tube(0.16, 0.01, [0, 1.02 - Math.abs(i - 2) * 0.07, 1.1 - i * 0.5], [0, 1.4 - Math.abs(i - 2) * 0.07, 0.95 - i * 0.5], sp, 4));
  for (const sx of [-1, 1]) { tp.push(tube(0.13, 0.07, [sx * 0.75, -0.3, 1.2], [sx * 0.8, -0.75, 1.55], c, 5)); tp.push(ball(0.5, sp, sx * 0.72, 0.4, -0.3, 0.4, 0.9, 1.5, 6, 5)); }
  const torso = grp(body, 0, 2.7, 0, tp);
  const hp = [tube(0.82, 0.6, [0, -0.35, -0.35], [0, 0.95, 0.75], c, 8), ball(1, c, 0, 1.25, 1.25, 0.62, 0.6, 1.15, 10, 7), cube(0.86, 0.5, 1.05, c, 0, 1.13, 2.0), cube(0.7, 0.12, 0.3, sp, 0, 1.42, 2.4)];
  for (const sx of [-1, 1]) {
    hp.push(ball(1, sp, sx * 0.38, 1.66, 1.4, 0.2, 0.12, 0.36, 6, 4)); hp.push(ball(0.085, 0xffd23a, sx * 0.52, 1.47, 1.5, 1, 1, 1, 6, 5)); hp.push(ball(0.04, DARK, sx * 0.585, 1.47, 1.53, 1, 1, 1, 5, 4));
    for (let i = 0; i < 6; i++) hp.push(tube(0.06, 0.005, [sx * 0.38, 0.9, 1.6 + i * 0.17], [sx * 0.38, 0.68, 1.6 + i * 0.17], 0xffffff, 4));
  }
  for (let i = -1; i <= 1; i++) hp.push(tube(0.06, 0.005, [i * 0.22, 0.9, 2.5], [i * 0.22, 0.68, 2.5], 0xffffff, 4));
  const head = grp(torso, 0, 0.75, 1.55, hp);
  const jp = [cube(0.76, 0.22, 1.5, bl, 0, -0.16, 0.74), cube(0.6, 0.06, 1.3, 0xb5484a, 0, -0.03, 0.74)];
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) jp.push(tube(0.05, 0.005, [sx * 0.31, -0.05, 0.75 + i * 0.17], [sx * 0.31, 0.13, 0.75 + i * 0.17], 0xffffff, 4));
  const jaw = grp(head, 0, 0.93, 1.02, jp);
  const legs = [-1, 1].map((sx) => grp(body, sx * 0.7, 2.6, -0.1, [tube(0.52, 0.34, [0, 0.25, 0], [0, -1.2, 0.35], c, 7), tube(0.3, 0.2, [0, -1.2, 0.35], [0, -2.4, -0.1], c, 6), cube(0.56, 0.28, 1.15, c, 0, -2.46, 0.3),
    ball(0.1, HORN, -0.2, -2.5, 0.9, 1, 1, 1.6, 5, 4), ball(0.1, HORN, 0, -2.5, 0.92, 1, 1, 1.6, 5, 4), ball(0.1, HORN, 0.2, -2.5, 0.9, 1, 1, 1.6, 5, 4)]));
  const tail = grp(torso, 0, 0.1, -1.7, [tube(0.86, 0.06, [0, 0, 0.35], [0, 0.35, -4.4], c, 8)]);
  const cfg = { legs: 2, amp: 0.5, legLen: 2.6, tailAmp: 0.16, tailSp: 1.2, neckBob: 0.06, neckIdle: 0.05, look: 0.3, bounce: 0.1, lean: 0.12, lie: 0.55 };
  return { root, j: { body, torso, head, neck: head, legs, tail, jaw }, mat, kind: 'dino', height: 4.6 * s, radius: 1.3 * s, eye: 4.7 * s, animate: dinoAnimate(cfg, s) };
}

// A one-wheeled service robot for the future city.
const eyeMats = new Map();
const eyeMat = (hex) => { if (!eyeMats.has(hex)) eyeMats.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return eyeMats.get(hex); };
function makeWheelBot(look) {
  const s = (look.h || 1.25) / 1.25, c = look.body ?? 0xf2f5f8, ac = look.accent ?? 0xff8a3d, { mat, root, body, mesh, grp } = rig(s);
  const wheel = grp(body, 0, 0.24, 0, [[new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14), 0x2a2e36, mat4(0, 0, 0, 0, 0, Math.PI / 2)], cube(0.16, 0.4, 0.06, ac, 0, 0, 0), cube(0.16, 0.06, 0.4, ac, 0, 0, 0)]);
  const torso = grp(body, 0, 0.3, 0, [tube(0.2, 0.34, [0, 0.12, 0], [0, 0.5, 0], c, 12), tube(0.34, 0.26, [0, 0.5, 0], [0, 0.8, 0], c, 12), tube(0.345, 0.345, [0, 0.47, 0], [0, 0.53, 0], ac, 12),
    cube(0.1, 0.3, 0.1, 0x8a929c, -0.13, 0.02, 0), cube(0.1, 0.3, 0.1, 0x8a929c, 0.13, 0.02, 0), cube(0.2, 0.12, 0.02, 0x18202e, 0, 0.64, 0.275)]);
  const head = grp(torso, 0, 0.84, 0, [ball(0.24, c, 0, 0.14, 0, 1, 0.8, 1, 12, 8), cube(0.36, 0.13, 0.2, 0x18202e, 0, 0.15, 0.14), tube(0.012, 0.012, [0, 0.3, 0], [0, 0.52, 0], 0x9aa2aa, 4), tube(0.06, 0.05, [0, -0.04, 0], [0, 0.02, 0], ac, 8)]);
  head.add(mesh([ball(0.035, 0xffffff, -0.08, 0.155, 0.245, 1, 1.2, 0.5, 6, 5), ball(0.035, 0xffffff, 0.08, 0.155, 0.245, 1, 1.2, 0.5, 6, 5), ball(0.04, 0xffffff, 0, 0.55, 0, 1, 1, 1, 6, 5)], eyeMat(look.eye ?? 0x7ff6ff)));
  const arm = (sx) => { const g = grp(torso, sx * 0.33, 0.68, 0, [tube(0.05, 0.04, [0, 0, 0], [sx * 0.05, -0.34, 0.02], ac, 6), ball(0.06, c, sx * 0.05, -0.38, 0.02, 1, 1, 1, 6, 5)]); return g; };
  const armL = arm(1), armR = arm(-1);
  const animate = (a, dt, speed, sw) => {
    const t = G.t, st = a.state, k = Math.min(sw, 1.3);
    wheel.rotation.x += speed * dt / (0.24 * s * Math.max(0.3, a.size));
    let lean = k * 0.2 + a.flyTilt * 0.5, bz = 0, by = 0, arms = Math.sin(t * 2 + a.ph) * 0.15 - k * 0.5;
    if (st === 'sleep' || st === 'stun') { bz = 1.35; by = 0.2 * s; } else if (st === 'dance' || st === 'float') { body.rotation.y += dt * 7; arms = -2.5; } else if (st === 'laugh' || st === 'cheer') { by = Math.abs(Math.sin(t * 9)) * 0.1; arms = -2.6; }
    if (st !== 'dance' && st !== 'float') body.rotation.y = damp(body.rotation.y % TAU, 0, 8, dt);
    torso.rotation.x = damp(torso.rotation.x, lean, 8, dt); body.rotation.z = damp(body.rotation.z, bz, 7, dt); body.position.y = damp(body.position.y, by, 10, dt);
    head.rotation.y = Math.sin(t * 0.8 + a.ph) * 0.6 * (1 - Math.min(sw, 1));
    armL.rotation.x = damp(armL.rotation.x, arms, 10, dt); armR.rotation.x = damp(armR.rotation.x, -arms - k, 10, dt);
  };
  return { root, j: { body, torso, head, wheel, armL, armR }, mat, kind: 'wheelbot', height: 1.42 * s, radius: 0.32 * s, eye: 1.25 * s, animate };
}

// ================================================================== PAST — Dino Valley
const LAKE = { x: -90, z: 70, r: 64, y: -0.7 }, VOL = { x: 190, z: -232, r: 125, h: 92 }, NEST = { x: 34, z: -52 };
const P_NX = [-120, -60, 0, 60, 120], P_NZ = [-90, -30, 30, 90, 150];
const TRAILS = [[-22, 96, 26, 22], [26, 22, 30, -38], [70, 128, 132, 96]];      // muddy tracks with footprints
const mesaAt = (x, z) => smooth(-140, -152, x) * smooth(2, 16, z) * smooth(138, 124, z);
function segDist(x, z, [ax, az, bx, bz]) { const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
function pastH(x, z) {
  let h = 1.2 + 1.5 * Math.sin(x * 0.019 + 1.3) * Math.cos(z * 0.016 - 0.4) + 0.8 * Math.sin((x + z) * 0.031) + 0.5 * Math.cos(x * 0.043 - z * 0.037);
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < 90) { const shore = lerp(0.4, h, smooth(50, 88, dl)); h = lerp(shore, -3.6, smooth(62, 36, dl)); }     // lake bowl
  h += (22 - h) * mesaAt(x, z);                                                                                   // waterfall mesa west of the lake
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  h += smooth(232, 345, r) * (46 + 12 * Math.sin(a * 3 + 0.7) + 7 * Math.sin(a * 7));                              // valley rim
  const dv = Math.hypot(x - VOL.x, z - VOL.z);
  if (dv < VOL.r) { const t = 1 - dv / VOL.r; h += VOL.h * t * t * (1.6 - 0.6 * t) - smooth(19, 6, dv) * 15; }    // volcano + crater
  return h;
}

function buildPast(M) {
  const col = new Colliders(), group = new THREE.Group(); group.name = 'past';
  const R = rng(1000001);
  const era = {
    key: 'past', label: 'Dino Valley', year: '100 million years ago', group, colliders: col,
    waterAt: (x, z) => (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r ? LAKE.y : -Infinity),
    pois: {}, nodes: [], nodeGap: 65, interiors: [], interact: [], spawn: { x: 0, z: 116, yaw: Math.PI },
    fog: [0xf2d9ae, 70, 540], skyTint: 0xfff0d8, tod: 9, bounds: 330,
  };
  // ---------- terrain ----------
  const terr = makeTerrain(-360, -360, 144, 144, 5, 5, pastH, (x, z, h, c) => {
    const k = 0.84 + R() * 0.16, slope = Math.hypot(pastH(x + 2, z) - h, pastH(x, z + 2) - h) / 2;
    c.setRGB(k * 0.98, k * 1.0, k * 0.8);                                                   // warm, sunlit green
    const rim = smooth(12, 50, h); c.r *= 1 - rim * 0.22; c.g *= 1 - rim * 0.18; c.b *= 1 - rim * 0.3;
    const rocky = smooth(0.45, 0.95, slope); c.lerp(_c.setRGB(0.74 * k, 0.6 * k, 0.46 * k), rocky * 0.85);
    let mud = 0; for (const t of TRAILS) mud = Math.max(mud, smooth(9, 3, segDist(x, z, t)));
    c.lerp(_c.setRGB(0.6 * k, 0.43 * k, 0.27 * k), mud * 0.85);
    if (h < -0.35 && Math.hypot(x - LAKE.x, z - LAKE.z) < 80) c.setRGB(0.86 * k, 0.76 * k, 0.5 * k);       // sandy lake bed
    const dv = Math.hypot(x - VOL.x, z - VOL.z);
    if (dv < VOL.r) { const t = smooth(VOL.r, 45, dv); c.lerp(_c.setRGB(0.36 * k, 0.29 * k, 0.26 * k), t * 0.92); if (dv < 22) c.lerp(_c.setRGB(1.0, 0.42, 0.12), smooth(22, 8, dv) * 0.8); }
  }, M.grass);
  group.add(terr.mesh); era.heightAt = terr.heightAt;
  const H = era.heightAt, b = new Batch(M, col, 144); b.height = H;

  // ---------- where things may go ----------
  const keep = [{ x: 3, z: 118, r: 13 }, { x: NEST.x, z: NEST.z, r: 9 }, { x: 140, z: 42, r: 17 }, { x: -30, z: -140, r: 13 }, { x: 165, z: 80, r: 11 }, { x: -150, z: -60, r: 12 }];   // spawn, nest, bones, arches
  era.eggSpots = [{ x: -70, z: -110 }, { x: 150, z: 20 }, { x: 0, z: 50 }];
  for (const e of era.eggSpots) keep.push({ x: e.x, z: e.z, r: 5 });
  const near = (v, arr, m) => arr.some((a) => Math.abs(v - a) < m);
  const onPath = (x, z, m) => (near(x, P_NX, m) && z > -96 && z < 156) || (near(z, P_NZ, m) && x > -126 && x < 126);
  const free = (x, z, m = 3, solid = false) => {
    if (Math.abs(x) > 322 || Math.abs(z) > 322) return false;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) return false;
    const ms = mesaAt(x, z); if (ms > 0.02 && ms < 0.98) return false;
    if (x < -150 && x > -228 && Math.abs(z - 70) < 7 + m) return false;                    // the stream on the mesa
    if (Math.hypot(x - VOL.x, z - VOL.z) < 62) return false;
    for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + m) return false;
    return !onPath(x, z, solid ? 6 : m);
  };
  for (const x of P_NX) for (const z of P_NZ) if (Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 8) era.nodes.push({ x, z });

  // ---------- plants ----------
  const GRN = [0x4f9a3a, 0x5fae42, 0x3f8a34, 0x6dbb4c, 0x4a9440], DGRN = [0x2c6a3c, 0x33743f, 0x286236, 0x3a7c48];
  const frond = (x, y, z, az, tilt, len, wid, c) => { const g = new THREE.ConeGeometry(wid, len, 4, 1, true); g.translate(0, len / 2, 0); g.scale(1, 1, 0.22); b.add('leaf', g, c, mat4(x, y, z, az, tilt)); };
  const fern = (x, z, s) => { const y = H(x, z), n = 7, a0 = R() * TAU, c = R.pick(GRN); for (let i = 0; i < n; i++) frond(x, y, z, a0 + i * TAU / n + R.range(-0.2, 0.2), R.range(0.7, 1.2), R.range(1.8, 3.1) * s, 0.42 * s, c); frond(x, y, z, a0, 0.15, 1.5 * s, 0.3 * s, c); };
  const cycad = (x, z, s) => {
    const y = H(x, z), th = R.range(1.5, 2.6) * s, c = R.pick(GRN), a0 = R() * TAU;
    b.cyl('bark', x, y + th / 2, z, 0.42 * s, 0.6 * s, th, 0xe0b27c, 7);
    for (let i = 0; i < 10; i++) frond(x, y + th - 0.1, z, a0 + i * TAU / 10, R.range(1.0, 1.35), R.range(2.8, 3.6) * s, 0.5 * s, c);
    for (let i = 0; i < 4; i++) frond(x, y + th, z, a0 + i * TAU / 4 + 0.4, 0.45, 2.2 * s, 0.4 * s, c);
    b.cone('plain', x, y + th + 0.45 * s, z, 0.3 * s, 0.9 * s, 0xe0a030, 6);
    b.solid(x, z, 1.0 * s, 1.0 * s, y, y + th, 'tree', false);
  };
  const palm = (x, z, s) => {
    const y = H(x, z), th = R.range(6, 10) * s, c = R.pick([0x63b84a, 0x58aa40, 0x74c456]), a0 = R() * TAU;
    b.cyl('bark', x, y + th / 2, z, 0.2 * s, 0.34 * s, th, 0xcfa878, 6);
    for (let i = 0; i < 9; i++) { const az = a0 + i * TAU / 9, l1 = 2.6 * s, t1 = R.range(0.9, 1.1); frond(x, y + th, z, az, t1, l1, 0.5 * s, c); frond(x + Math.sin(az) * Math.sin(t1) * l1 * 0.92, y + th + Math.cos(t1) * l1 * 0.92, z + Math.cos(az) * Math.sin(t1) * l1 * 0.92, az, 1.9, 2.3 * s, 0.46 * s, c); }
    b.solid(x, z, 0.7 * s, 0.7 * s, y, y + th, 'tree', false);
  };
  const conifer = (x, z, s, solid = true) => {
    const y = H(x, z), c = R.pick(DGRN);
    b.cyl('bark', x, y + 4.5 * s, z, 0.5 * s, 0.78 * s, 9 * s, 0xb98a66, 7);
    for (let i = 0; i < 5; i++) b.cone('leaf', x, y + (6 + i * 2.7) * s, z, (4.3 - i * 0.72) * s, 4.4 * s, c, 8);
    if (solid) b.solid(x, z, 1.3 * s, 1.3 * s, y, y + 8 * s, 'tree', false);
  };
  const boulder = (x, z, r, solid = true) => {
    const y = H(x, z), sx = 1 + R() * 0.5, sz = 1 + R() * 0.5;
    b.ico('rock', x, y + r * 0.42, z, r, R.pick([0xffffff, 0xe6dccb, 0xd0c4b2]), sx, 0.78, sz, 1, R() * 6);
    if (solid && r > 1.1) b.solid(x, z, r * 1.25 * sx, r * 1.25 * sz, y - 1, y + r * 0.95, 'rock');
  };
  const scatter = (n, gen, fn, m, solid) => { let made = 0; for (let i = 0; i < n * 6 && made < n; i++) { const [x, z] = gen(); if (free(x, z, m, solid)) { fn(x, z); made++; } } };
  const ring = (r0, r1) => () => { const a = R() * TAU, r = R.range(r0, r1); return [Math.cos(a) * r, Math.sin(a) * r]; };
  scatter(46, ring(150, 235), (x, z) => conifer(x, z, R.range(0.9, 1.5)), 4, true);
  scatter(52, ring(235, 330), (x, z) => conifer(x, z, R.range(1.0, 1.7), false), 4, true);
  for (const [gx, gz] of [[-150, -130], [95, 205], [200, 60], [-30, -200]]) scatter(7, () => [gx + R.range(-28, 28), gz + R.range(-28, 28)], (x, z) => conifer(x, z, R.range(1.1, 1.6)), 4, true);
  scatter(80, ring(20, 215), (x, z) => cycad(x, z, R.range(0.8, 1.3)), 3, true);
  scatter(60, ring(30, 205), (x, z) => palm(x, z, R.range(0.85, 1.2)), 3, true);
  scatter(16, () => { const a = R() * TAU, r = LAKE.r + R.range(8, 22); return [LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r]; }, (x, z) => palm(x, z, R.range(0.9, 1.25)), 2, true);
  scatter(58, ring(15, 225), (x, z) => { const n = R.int(3, 6); for (let i = 0; i < n; i++) { const fx = x + R.range(-4, 4), fz = z + R.range(-4, 4); if (free(fx, fz, 2.5)) fern(fx, fz, R.range(0.8, 1.35)); } }, 3, false);
  scatter(26, () => { const a = R() * TAU, r = LAKE.r + R.range(7, 14); return [LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r]; }, (x, z) => fern(x, z, R.range(0.9, 1.4)), 1, false);
  scatter(70, ring(25, 300), (x, z) => boulder(x, z, R.range(0.7, 2.6)), 3, true);
  scatter(40, ring(10, 220), (x, z) => bush(b, R, x, z, R.range(1.2, 2.2), R.pick(GRN)), 3, false);
  for (let i = 0; i < 12; i++) { const a = R() * TAU, r = LAKE.r - R.range(1, 5); boulder(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r, R.range(0.6, 1.3), false); }
  scatter(9, ring(60, 210), (x, z) => { const y = H(x, z), l = R.range(5, 9), ry = R() * 3; b.cyl('bark', x, y + 0.4, z, 0.45, 0.55, l, 0xb08a62, 7, 0, Math.PI / 2, ry); }, 4, false);     // fallen logs

  // ---------- rock spires, arches, cliffs ----------
  const spire = (x, z, h) => {
    const y = H(x, z), c = R.pick([0xf0dcc0, 0xe4cdb0, 0xd8c0a4]);
    b.ico('rock', x, y + h * 0.28, z, h * 0.3, c, 1.15, 1.25, 1.05, 1, R() * 6); b.ico('rock', x + h * 0.04, y + h * 0.62, z, h * 0.22, c, 1, 1.3, 1, 1, R() * 6); b.ico('rock', x, y + h * 0.9, z + h * 0.03, h * 0.13, c, 1, 1.25, 1, 0, R() * 6);
    b.solid(x, z, h * 0.5, h * 0.5, y - 2, y + h * 0.62, 'rock'); b.solid(x, z, h * 0.3, h * 0.3, y + h * 0.62, y + h * 0.98, 'rock');
  };
  scatter(11, ring(150, 240), (x, z) => spire(x, z, R.range(10, 22)), 7, true);
  const arch = (x, z, ry, s) => {
    const y = H(x, z); b.push(x, 0, z, ry);
    for (const sx of [-1, 1]) { b.ico('rock', sx * 4.6 * s, y + 2.6 * s, 0, 2.2 * s, 0xecd6b8, 0.9, 1.9, 1, 1, sx); b.ico('rock', sx * 4.3 * s, y + 5.6 * s, 0, 1.9 * s, 0xe2cbac, 1, 1.1, 1, 1, sx * 2); b.solid(sx * 4.6 * s, 0, 3.4 * s, 3.6 * s, y - 2, y + 6.3 * s, 'rock'); }
    b.ico('rock', 0, y + 7.3 * s, 0, 2.3 * s, 0xf0dcc0, 2.7, 0.55, 1.05, 1, 0.3); b.solid(0, 0, 11.5 * s, 3.6 * s, y + 6.3 * s, y + 8.3 * s, 'rock');
    b.pop();
  };
  arch(-30, -140, 0, 1.3); arch(165, 80, Math.PI / 2, 1.1); arch(-150, -60, 0, 1.2);
  era.pois.arch = new THREE.Vector3(-30, H(-30, -128), -128);

  // ---------- lake, stream and waterfall ----------
  {
    const wg = new THREE.CircleGeometry(LAKE.r, 40).rotateX(-Math.PI / 2), uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 9);
    const water = new THREE.Mesh(wg, M.water); water.position.set(LAKE.x, LAKE.y, LAKE.z); water.matrixAutoUpdate = false; water.updateMatrix(); group.add(water);
    b.box('water', -187, 22.1, 70, 70, 0.14, 7, 0xffffff);                                   // stream across the mesa top
    for (let x = -153; x < -139; x += 2) {                                                   // the fall follows the cliff face
      const ya = Math.max(H(x, 70) + 0.45, LAKE.y), yb = Math.max(H(x + 2, 70) + 0.45, LAKE.y);
      b.box('water', x + 1, (ya + yb) / 2, 70, Math.hypot(2, yb - ya) + 0.3, 0.3, 6.6, 0xf2fbff, 0, 0, Math.atan2(yb - ya, 2));
    }
    for (let i = 0; i < 7; i++) b.ico('glass', -139 + R.range(-2, 3), LAKE.y + R.range(0.3, 1.6), 70 + R.range(-4, 4), R.range(1.2, 2.4), 0xffffff, 1, 0.7, 1, 1, R() * 6);      // mist
    for (const sz of [-1, 1]) { for (let i = 0; i < 5; i++) boulder(-152 + i * 3.2, 70 + sz * (4.6 + R() * 1.5), R.range(1.2, 2.3), false); boulder(-154, 70 + sz * 5, 1.6, false); }
    b.ico('rock', -224, 23.5, 70, 5, 0xecd6b8, 1.2, 0.8, 1.6, 1, 0.4); b.solid(-224, 70, 9, 12, 20, 26.5, 'rock');       // the spring the stream comes from
    era.pois.lake = new THREE.Vector3(LAKE.x + LAKE.r + 9, H(LAKE.x + LAKE.r + 9, LAKE.z + 12), LAKE.z + 12);
    era.pois.falls = new THREE.Vector3(-160, H(-160, 80), 80);
  }

  // ---------- volcano ----------
  const craterY = H(VOL.x, VOL.z);
  b.cyl('glow', VOL.x, craterY + 3.2, VOL.z, 12, 9, 1.2, 0xff6a1a, 14); b.cyl('glow', VOL.x, craterY + 3.9, VOL.z, 6, 6, 0.3, 0xffc23a, 12);
  for (let i = 0; i < 16; i++) { const a = R() * TAU, r = R.range(24, 70), x = VOL.x + Math.cos(a) * r, z = VOL.z + Math.sin(a) * r; if (Math.abs(x) < 325 && Math.abs(z) < 325) b.ico('rock', x, H(x, z) + 0.6, z, R.range(1, 2.6), 0x8a7468, 1.2, 0.7, 1, 0, R() * 6); }
  era.pois.volcano = new THREE.Vector3(VOL.x - 21, H(VOL.x - 21, VOL.z + 8), VOL.z + 8);
  const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xa39a94, transparent: true, opacity: 0.82 }), 7);
  smoke.frustumCulled = false; group.add(smoke);

  // ---------- the nest: a ring of rocks and twigs on a soft bed ----------
  {
    const { x, z } = NEST, y = H(x, z);
    b.cyl('dirt', x, y + 0.1, z, 2.9, 3.3, 0.5, 0xf0d8a8, 16); b.solid(x, z, 4.6, 4.6, y - 1, y + 0.34, 'nest');
    for (let i = 0; i < 13; i++) { const a = i / 13 * TAU, r = 3.5 + R.range(-0.2, 0.2); b.ico('rock', x + Math.cos(a) * r, H(x + Math.cos(a) * r, z + Math.sin(a) * r) + 0.3, z + Math.sin(a) * r, R.range(0.55, 0.85), R.pick([0xffffff, 0xe6dccb]), 1.2, 0.75, 1, 0, R() * 6); }
    for (let i = 0; i < 34; i++) { const a = R() * TAU, r = R.range(2.5, 3.3); b.cyl('bark', x + Math.cos(a) * r, y + R.range(0.35, 0.7), z + Math.sin(a) * r, 0.05, 0.07, R.range(1.2, 2.2), R.pick([0xc89a6a, 0xa87a50, 0xe0b888]), 4, Math.PI / 2 + R.range(-0.3, 0.3), 0, -a + R.range(-0.5, 0.5)); }
    for (let i = 0; i < 10; i++) frond(x + R.range(-2, 2), y + 0.36, z + R.range(-2, 2), R() * TAU, 1.5, 1.4, 0.35, 0xd8c070);
    era.pois.nest = new THREE.Vector3(x, y + 0.34, z);
  }

  // ---------- giant bones ----------
  {
    const bx = 140, bz = 40, y = H(bx, bz), BONE = 0xf6eeda; b.push(bx, 0, bz, 0);
    for (let i = 0; i < 8; i++) { const r = 2.9 - Math.abs(i - 3) * 0.28; b.add('plain', new THREE.TorusGeometry(r, 0.15, 5, 9, Math.PI), BONE, mat4(0, y - 0.2, -5 + i * 1.5, 0, 0, 0, 1, 1.15, 1)); }
    b.cyl('plain', 0, y + 2.95, 0.2, 0.26, 0.2, 13, BONE, 6, Math.PI / 2);
    for (let i = 0; i < 9; i++) b.sph('plain', 0, y + 2.4 - i * 0.28, -7 - i * 1.0, 0.3 - i * 0.022, BONE, 1, 1, 1.5, 6, 4);
    b.sph('plain', 0, y + 1.5, 8.6, 1.1, BONE, 1, 0.9, 1.7, 10, 7); b.box('plain', 0, y + 0.6, 9.4, 1.5, 0.3, 2.2, BONE, 0, 0.12);
    for (const sx of [-1, 1]) { b.sph('plain', sx * 0.75, y + 1.75, 8.9, 0.34, 0x4a4038, 0.6, 1, 1, 6, 5); b.cone('plain', sx * 0.5, y + 2.6, 7.9, 0.2, 0.9, BONE, 5); }
    b.solid(0, 8.8, 2.2, 3.6, y - 1, y + 2.4, 'bone');
    for (const [fx, fz, ry] of [[9, -3, 0.5], [-8, 6, 2.1], [6, 12, 1.2], [-10, -8, 2.8]]) { const fy = H(bx + fx, bz + fz) + 0.3; b.cyl('plain', fx, fy, fz, 0.2, 0.2, 3.4, BONE, 6, 0, Math.PI / 2, ry); for (const e of [-1, 1]) b.sph('plain', fx + Math.cos(ry) * 1.7 * e, fy, fz - Math.sin(ry) * 1.7 * e, 0.38, BONE, 1, 1, 1, 6, 5); }
    b.pop(); era.pois.bones = new THREE.Vector3(bx - 7, H(bx - 7, bz - 2), bz - 2);
  }

  // ---------- footprints pressed into the muddy tracks ----------
  TRAILS.forEach((t, ti) => {
    const [ax, az, bx, bz] = t, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, yaw = Math.atan2(dx, dz), big = ti < 2, step = big ? 4.2 : 1.5, sc = big ? 1 : 0.42;
    for (let d = 2, i = 0; d < len - 1; d += step, i++) {
      const side = i % 2 ? 1 : -1, x = ax + dx * d + dz * side * 1.3 * sc * (big ? 1 : 0.5), z = az + dz * d - dx * side * 1.3 * sc * (big ? 1 : 0.5), y = H(x, z) + 0.05, c = 0x6e4a2c;
      b.cyl('paint', x, y, z, 0.62 * sc, 0.62 * sc, 0.05, c, 9);
      for (let k = -1; k <= 1; k++) { const tx = x + dx * (big ? 0.72 : 1.0) * sc + dz * k * 0.42 * sc, tz = z + dz * (big ? 0.72 : 1.0) * sc - dx * k * 0.42 * sc; if (big) b.cyl('paint', tx, H(tx, tz) + 0.05, tz, 0.22 * sc, 0.22 * sc, 0.05, c, 6); else b.box('paint', tx, H(tx, tz) + 0.05, tz, 0.2 * sc, 0.05, 1.1 * sc, c, yaw + k * 0.35); }
    }
  });

  addTimePod(era, M, 8, 121);
  b.build(group);
  era.warp = { timePod: ['⏳', 'Time Pod'], nest: ['🥚', 'Dino Nest'], lake: ['💧', 'Fern Lake'], falls: ['🌊', 'Thunder Falls'], volcano: ['🌋', 'Mount Grumble'], bones: ['🦴', 'Giant Bones'], arch: ['🪨', 'Stone Arch'] };

  // ---------- fliers: bodies + wings as two instanced meshes ----------
  const flMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.55, 3.5, 0, 0.3, 1.7, 0, -0.55, 0, 0, 0.55, 1.7, 0, -0.55, 0, 0, -0.5], 3));
  const flBody = new THREE.InstancedMesh(fuse([ball(1, 0xc98a52, 0, 0, 0, 0.28, 0.24, 0.85, 8, 6), tube(0.15, 0.1, [0, 0.03, 0.65], [0, 0.26, 1.3], 0xc98a52, 6), ball(1, 0xc98a52, 0, 0.3, 1.45, 0.14, 0.13, 0.26, 6, 5),
    tube(0.09, 0.01, [0, 0.29, 1.6], [0, 0.2, 2.55], 0xf2c14a, 5), tube(0.09, 0.01, [0, 0.36, 1.42], [0, 0.62, 0.7], 0xe2553a, 5), tube(0.1, 0.01, [0, 0, -0.7], [0, 0.05, -1.5], 0xc98a52, 5)]), flMat, 4);
  const flWing = new THREE.InstancedMesh(fuse([[wingG, 0xe8b070], tube(0.06, 0.02, [0, 0, 0.5], [3.45, 0, 0.3], 0xa86a3a, 5)]), flMat, 8);
  flBody.frustumCulled = flWing.frustumCulled = false; group.add(flBody, flWing);
  const fliers = [{ cx: 0, cz: 10, r: 115, y: 58, w: 0.1, a: 0 }, { cx: LAKE.x, cz: LAKE.z, r: 72, y: 42, w: -0.14, a: 2 }, { cx: 115, cz: -75, r: 62, y: 66, w: 0.17, a: 4 }, { cx: VOL.x - 40, cz: VOL.z + 40, r: 120, y: 150, w: -0.08, a: 1 }];

  // ---------- per-frame: smoke, fliers, water, the predator's temper ----------
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _flip = new THREE.Vector3(-1, 1, 1);
  const hunt = { on: false, cool: 3, t: 0 };
  const calm = (rex) => { hunt.on = false; if (rex.ai.mode === 'goto') { rex.ai.mode = 'wander'; rex.ai.target = null; rex.ai.node = null; rex.ai.onArrive = null; } };
  era.update = (dt, G) => {
    const t = G.t;
    M.water.map.offset.x += dt * 0.02; M.water.map.offset.y += dt * 0.05;
    for (let i = 0; i < 7; i++) {
      const u = (t * 0.05 + i / 7) % 1, sc = (7 + u * 30) * smooth(0, 0.08, u) * smooth(1, 0.8, u);
      _p.set(VOL.x + u * 46 + Math.sin(i * 2.4 + t * 0.2) * 4, craterY + 6 + u * 105, VOL.z + u * 22 + Math.cos(i * 1.7) * 4); _s.set(sc, sc * 0.8, sc); _e.set(0, i + t * 0.1, 0);
      smoke.setMatrixAt(i, _m1.compose(_p, _q.setFromEuler(_e), _s));
    }
    smoke.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 4; i++) {
      const f = fliers[i]; f.a += f.w * dt; const dir = Math.sign(f.w), flap = Math.sin(t * 2.6 + i * 1.7) * 0.45 + 0.1;
      _p.set(f.cx + Math.cos(f.a) * f.r, f.y + Math.sin(f.a * 2 + i) * 5, f.cz + Math.sin(f.a) * f.r); _e.set(0, Math.atan2(-Math.sin(f.a) * dir, Math.cos(f.a) * dir), -dir * 0.3); _s.setScalar(1.7);
      _m1.compose(_p, _q.setFromEuler(_e), _s); flBody.setMatrixAt(i, _m1);
      _m2.makeRotationZ(flap).setPosition(0.2, 0.06, 0); flWing.setMatrixAt(i * 2, _m3.multiplyMatrices(_m1, _m2));
      _m2.makeRotationZ(-flap).scale(_flip).setPosition(-0.2, 0.06, 0); flWing.setMatrixAt(i * 2 + 1, _m3.multiplyMatrices(_m1, _m2));
    }
    flBody.instanceMatrix.needsUpdate = flWing.instanceMatrix.needsUpdate = true;
    // The predator charges anyone on foot who wanders close, bumps them over (harmlessly) and then sulks for a while.
    const rex = era.predator, pc = G.pc; if (!rex) return;
    hunt.cool -= dt;
    const fair = pc && pc !== rex && pc.era === 'past' && !pc.ghost && !pc.mount && !pc.dino && !G.player.vehicle && !rex.friendly && !rex.controlled && !rex.rider && rex.state === 'idle' && !(G.frozen > 0) && (rex.ai.mode === 'wander' || rex.ai.mode === 'goto');
    if (!fair) { if (hunt.on) calm(rex); return; }
    const d = rex.dist(pc);
    if (!hunt.on && hunt.cool <= 0 && d < 28) { hunt.on = true; hunt.t = 12; rex.roarT = 1.4; rex.ai.wait = 0; rex.say('ROOOAR!', 2.5); G.sfx('thud'); G.player.shake = 0.3; }
    if (hunt.on) {
      hunt.t -= dt; if (rex.ai.mode === 'goto' && rex.ai.target) { rex.ai.target.x = pc.pos.x; rex.ai.target.z = pc.pos.z; } else rex.goTo(pc.pos.x, pc.pos.z, true);
      if (d < rex.radius * rex.size + 1 && Math.abs(pc.pos.y - rex.pos.y) < rex.height * rex.size + 1) {
        const nx = (pc.pos.x - rex.pos.x) / (d || 1), nz = (pc.pos.z - rex.pos.z) / (d || 1);
        pc.vel.x = nx * 13; pc.vel.z = nz * 13; pc.vel.y = 6; pc.onGround = false; pc.setState('stun', 1.5);
        rex.roarT = 0.8; G.sfx('hit'); G.player.shake = 0.45; hunt.cool = 8; calm(rex);
      } else if (d > 70 || hunt.t <= 0) { hunt.cool = 5; calm(rex); }
    }
  };
  return era;
}
const _c = new THREE.Color();

function spawnDinos(era) {
  const n = era.nodes, at = (i) => n[i % n.length], out = [];
  const add = (def, flags) => { const a = spawnActor({ era: 'past', cast: false, ai: 'wander', ...def }); Object.assign(a, { friendly: false, playable: true, dino: true }, flags); a.ai.wait = out.length * 0.7 % 4; out.push(a); return a; };
  const LN = [['Long-neck Momo', 0x5fae8a, 0xd8ecc0, 0x3f8f72, 1.0], ['Long-neck Bibi', 0x7fb0c8, 0xe2f0e8, 0x5a8fae, 0.9], ['Long-neck Olu', 0xa8b86a, 0xeef0c8, 0x86964a, 1.08]];
  LN.forEach(([name, skin, belly, spot, s], i) => { const p = at(2 + i * 7); add({ id: 'longneck' + (i + 1), name, emoji: '🦕', role: 'A gentle long-necked giant. Rideable once it trusts you.', x: p.x + 3, z: p.z + 3, walk: 1.5, run: 4.2,
    look: { make: makeLongneck, skin, belly, spot, s },
    lines: [animal(['Mmmmoooooh…', 'Hrrrooommm.', '*slow chewing*', 'Mooo-oo-ooh?'], ['The top leaves are the sweetest. You would not know.', 'I have been chewing this branch since breakfast. Yesterday\'s breakfast.', 'Mind the tail. I cannot see that far back.', 'Is it raining down there? It is lovely up here.'])] }, { rideable: true }); });
  const TH = [['Three-horn Tuff', 0xc9864a, 0xf0d8a8, 0x8a5230, 1.0], ['Three-horn Pebble', 0x9a8fb8, 0xe8e0f0, 0x6a5f90, 0.85], ['Three-horn Bonk', 0x6fa07a, 0xd8ecc8, 0x47785a, 1.1]];
  TH.forEach(([name, skin, belly, spot, s], i) => { const p = at(5 + i * 6); add({ id: 'trihorn' + (i + 1), name, emoji: '🦏', role: 'A sturdy three-horned grazer. Rideable once it trusts you.', x: p.x - 3, z: p.z + 2, walk: 1.9, run: 6.5,
    look: { make: makeTrihorn, skin, belly, spot, s },
    lines: [animal(['Hrrrmph!', 'Grunt. Grunt.', '*stamps a foot*', 'Bwooof.'], ['These ferns are mine. Those ferns are also mine.', 'Three horns. Count them. Impressive, yes?', 'I am not grumpy. This is just my face.', 'If the big toothy one comes, stand behind me.'])] }, { rideable: true }); });
  const RN = [['Zippy', 0xe2a03a, 0xf8e8b8, 0x9a5a20, 0xe2553a], ['Skitter', 0x58b8a8, 0xdaf4e8, 0x2f7f72, 0xf2c14a], ['Pip', 0xd87a8a, 0xf8dcd8, 0x9a4458, 0x6fd0f0], ['Dart', 0x8fb84a, 0xe8f4c0, 0x5a8028, 0xb070e0]];
  RN.forEach(([name, skin, belly, spot, crest], i) => { const p = at(1 + i * 5); add({ id: 'runner' + (i + 1), name, emoji: '🦖', role: 'A small, very fast two-legged runner.', x: p.x + 1.5, z: p.z - 2, walk: 3.4, run: 10,
    look: { make: makeRunner, skin, belly, spot, crest, s: 0.95 + i * 0.07 },
    lines: [animal(['Chirp-chirp!', 'Skree!', 'Kik-kik-kik!', '*head tilt*'], ['Can\'t talk. Running. Always running.', 'You are very slow. Are you a plant?', 'I found a shiny beetle! It\'s gone now. I ate it.', 'Race you to the lake! I already won.'])] }); });
  const p = at(13);
  era.predator = add({ id: 'chomper', name: 'Big Chompo', emoji: '🦖', role: 'The valley\'s big toothy grump. Roars first, thinks later.', x: p.x, z: p.z, walk: 2.4, run: 9,
    look: { make: makeChomper, skin: 0xb8523a, belly: 0xf0d0a0, spot: 0x6a2a24, s: 1 },
    lines: [animal(['GRRRRAAAH!', 'Hrrrrrr…', '*teeth clack*', 'ROOOAR!'], ['I\'m not angry, I\'m just hungry. All the time.', 'My arms are small. Do NOT mention the arms.', 'I roared at the volcano once. It roared back. We don\'t talk now.', 'Fine. You may stay. But no touching my rocks.'])] });
  era.dinos = out;
}

// ================================================================== FUTURE — Neo Hinode
// Streets on a 60 m grid; blocks are centred on multiples of 60. Block (0,0) is the plaza, (0,-60) the Gadget Depot.
const F_RX = [-150, -90, -30, 30, 90, 150], F_RZ = [-150, -90, -30, 30, 90];
const futH = (x, z) => (z <= 148 || z >= 184 ? 0 : z < 152 ? -(z - 148) * 0.75 : z > 180 ? -(184 - z) * 0.75 : -3);     // flat city, one canal

function buildFuture(M) {
  const col = new Colliders(), group = new THREE.Group(); group.name = 'future';
  const R = rng(2226), CYAN = 0x6ff2ff, WHITE = 0xf2f6fb, NEON = [0x6ff2ff, 0xff5fa2, 0xffd23a, 0x8a6aff, 0x3df0b0, 0xff8a3d];
  const era = {
    key: 'future', label: 'Neo Hinode', year: 'Year 2226', group, colliders: col, heightAt: futH,
    waterAt: (x, z) => (z > 148.8 && z < 183.2 ? -0.6 : -Infinity),
    pois: {}, nodes: [], nodeGap: 65, interiors: [], interact: [], spawn: { x: 0, z: 9, yaw: Math.PI },
    fog: [0x9db6ea, 80, 620], skyTint: 0xd8e6ff, tod: 19.5, bounds: 330,
  };
  const terr = makeTerrain(-360, -360, 6, 180, 120, 4, futH, (x, z, h, c) => { const k = 0.9 + R() * 0.1; if (h < -0.3) c.setRGB(0.42, 0.62, 0.72); else c.setRGB(0.8 * k, 0.88 * k, 1.0 * k); }, M.panel);
  group.add(terr.mesh);
  {
    const wg = new THREE.PlaneGeometry(720, 34).rotateX(-Math.PI / 2), uv = wg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 50, uv.getY(i) * 2.4);
    const water = new THREE.Mesh(wg, M.water); water.position.set(0, -0.6, 166); water.matrixAutoUpdate = false; water.updateMatrix(); group.add(water);
  }
  const b = new Batch(M, col, 240); b.height = futH;
  const holo = (text, x, y, z, w, h, opts = {}) => {      // a sign that glows: signAt's plate with an unlit material
    const m = signAt(b, group, text, x, y, z, w, h, 0, { double: true, fg: '#ffffff', ...opts }), old = m.material;
    m.material = new THREE.MeshBasicMaterial({ map: old.map, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }); old.dispose(); return m;
  };
  const glowRing = (x, y, z, r, tube, c) => b.add('glow', new THREE.TorusGeometry(r, tube, 4, Math.max(12, Math.round(r * 3))).rotateX(Math.PI / 2), c, mat4(x, y, z));

  // ---------- streets ----------
  const ROADC = 0x8ea4cc;
  for (const z of F_RZ) b.flat('asphalt', 0, 0.04, z, 320, 10, ROADC);
  for (const x of F_RX) for (let i = 0; i < F_RZ.length - 1; i++) { const a = F_RZ[i] + 5, e = F_RZ[i + 1] - 5; b.flat('asphalt', x, 0.04, (a + e) / 2, 10, e - a, ROADC); }
  for (const x of [-30, 30]) { b.flat('asphalt', x, 0.04, 120.5, 10, 51, ROADC); b.flat('asphalt', x, 0.04, 198, 10, 24, ROADC); }
  b.flat('asphalt', 0, 0.04, 205, 50, 10, ROADC);
  for (const z of F_RZ) for (let i = 0; i < F_RX.length - 1; i++) for (const s of [-1, 1]) b.box('glow', (F_RX[i] + F_RX[i + 1]) / 2, 0.07, z + s * 4.85, 50, 0.06, 0.16, CYAN);
  for (const x of F_RX) for (let i = 0; i < F_RZ.length - 1; i++) for (const s of [-1, 1]) b.box('glow', x + s * 4.85, 0.07, (F_RZ[i] + F_RZ[i + 1]) / 2, 0.16, 0.06, 50, CYAN);
  for (const x of F_RX) for (const z of F_RZ) { era.nodes.push({ x, z }); glowRing(x, 0.07, z, 2.2, 0.09, 0xffd23a); }
  for (const x of [-30, 30]) { era.nodes.push({ x, z: 144.5 }, { x, z: 200 }); for (const s of [-1, 1]) b.box('glow', x + s * 4.85, 0.07, 120.5, 0.16, 0.06, 51, CYAN); }
  // canal bridges
  for (const x of [-30, 30]) {
    b.box('panel', x, 0, 166, 12, 0.6, 40, WHITE); b.solid(x, 166, 12, 40, -0.3, 0.3, 'bridge'); b.flat('asphalt', x, 0.34, 166, 10, 40, ROADC);
    for (const s of [-1, 1]) { b.box('glass', x + s * 5.9, 0.85, 166, 0.12, 1.1, 37, 0xffffff); b.box('glow', x + s * 5.9, 1.43, 166, 0.14, 0.06, 37, CYAN); b.solid(x + s * 5.9, 166, 0.25, 37, 0.3, 1.4, 'rail', false); }
    for (const z of [157, 175]) b.box('concrete', x, -1.8, z, 9, 3, 1.6, 0xd4dcea);
  }
  era.pois.canal = new THREE.Vector3(30, 0.3, 166);

  // ---------- small street furniture ----------
  const planter = (x, z, kind = 'round', s = 0.9) => {
    b.cyl('panel', x, 0.3, z, 1.15, 1.0, 0.6, WHITE, 10); b.cyl('grass', x, 0.6, z, 1.0, 1.0, 0.06, 0xffffff, 10); glowRing(x, 0.63, z, 1.13, 0.05, 0x3df0b0);
    tree(b, R, x, z, s, kind, false); b.solid(x, z, 2, 2, 0, 0.62, 'planter');
  };
  const kiosk = (x, z, ry, c) => {            // a vending machine shaped like a friendly robot
    b.push(x, 0, z, ry);
    b.cyl('metal', 0, 0.1, 0, 0.8, 0.86, 0.2, 0xdfe8f2, 12); b.cyl('panel', 0, 1.0, 0, 0.62, 0.72, 1.6, c, 12); b.quad('vend', 0, 1.02, 0.7, 0.82, 1.3, 0xffffff);
    b.sph('panel', 0, 2.12, 0, 0.5, WHITE, 1, 0.85, 1, 12, 8); b.box('plain', 0, 2.14, 0.36, 0.62, 0.2, 0.3, 0x18202e);
    for (const s of [-1, 1]) { b.sph('glow', s * 0.14, 2.15, 0.5, 0.06, CYAN, 1, 1, 1, 6, 5); b.cyl('panel', s * 0.78, 1.25, 0.12, 0.09, 0.11, 0.75, c, 6, 0.5); b.sph('panel', s * 0.78, 0.9, 0.3, 0.13, WHITE, 1, 1, 1, 6, 5); }
    b.cyl('plain', 0, 2.72, 0, 0.015, 0.015, 0.4, 0x9aa2aa, 4); b.sph('glow', 0, 2.95, 0, 0.08, 0xff8a3d, 1, 1, 1, 6, 5);
    b.solid(0, 0, 1.5, 1.5, 0, 2.5, 'kiosk', false); b.pop();
  };

  // ---------- central plaza: arrival pod, holo clock tower, hover-car bays ----------
  b.flat('concrete', 0, 0.035, 0, 50, 50, 0xe4ecfa);
  glowRing(0, 0.08, 2, 6, 0.1, CYAN); glowRing(0, 0.08, 2, 13, 0.12, 0xff5fa2); glowRing(0, 0.08, 2, 19.5, 0.1, 0xffd23a);
  b.cyl('metal', 0, 0.06, 2, 3.2, 3.4, 0.1, 0xdfe8f2, 24);
  b.push(0, 0, -15);
  b.cyl('panel', 0, 0.6, 0, 2.2, 2.6, 1.2, WHITE, 8); b.solid(0, 0, 4, 4, 0, 1.2, 'clock'); b.cyl('metal', 0, 11, 0, 0.45, 0.8, 20, 0xe8eef6, 10); b.solid(0, 0, 1.3, 1.3, 1.2, 21, 'clock', false);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.box('glass', Math.sin(a) * 1.3, 9, Math.cos(a) * 1.3, 0.12, 14, 1.8, 0x9fe8ff, a); b.box('glow', Math.sin(a) * 2.2, 8.5, Math.cos(a) * 2.2, 0.1, 13, 0.1, NEON[i], a); }
  b.cyl('glass', 0, 25, 0, 4.4, 4.4, 0.12, 0x8fe8ff, 28, Math.PI / 2); b.add('glow', new THREE.TorusGeometry(4.5, 0.14, 5, 36), CYAN, mat4(0, 25, 0));
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; b.box('glow', Math.sin(a) * 3.8, 25 + Math.cos(a) * 3.8, 0, 0.14, i % 3 ? 0.45 : 0.9, 0.3, 0xffffff, 0, 0, -a); }
  b.sph('glow', 0, 21.4, 0, 0.5, 0xffb347); glowRing(0, 1.24, 0, 2.3, 0.08, CYAN);
  b.pop();
  const basic = (hex) => new THREE.MeshBasicMaterial({ color: hex });
  const clock = new THREE.Group(); clock.position.set(0, 25, -15); group.add(clock);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.3, 0.4).translate(0, 1.0, 0), basic(0xffd23a)), minHand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.44).translate(0, 1.5, 0), basic(0xffffff));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.07, 4, 40), basic(0xff5fa2)); clock.add(hourHand, minHand, halo);
  era.pois.clock = new THREE.Vector3(0, 0, -8); era.pois.plaza = new THREE.Vector3(0, 0, 14);
  const CARS = [[-18, 0xff4a5a, 'Sky Coupe'], [-12, 0x35c8ff, 'Comet GT'], [12, 0xffc428, 'Nimbus Roadster'], [18, 0x9a5cff, 'Photon Dart']];
  era.garage = CARS.map(([x, color, name]) => ({ x, z: 19, yaw: 0, hover: true, color, name }));
  for (const [x, color] of CARS) { b.flat('paint', x, 0.05, 19, 3.4, 6.6, 0x35507e); for (const s of [-1, 1]) b.box('glow', x + s * 1.75, 0.08, 19, 0.1, 0.06, 6.7, color); b.box('glow', x, 0.08, 15.7, 3.5, 0.06, 0.1, color); }
  era.pois.garage = new THREE.Vector3(0, 0, 14.5);
  bench(b, -7, -22.5, 0, 0xe8eef8); bench(b, 7, -22.5, 0, 0xe8eef8); bench(b, -22.5, -4, Math.PI / 2, 0xe8eef8); bench(b, 22.5, -4, -Math.PI / 2, 0xe8eef8);
  kiosk(-22.5, 6, Math.PI / 2, 0xff5fa2); kiosk(22.5, 6, -Math.PI / 2, 0x35c8ff);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) planter(sx * 22.8, sz * 22.8, sz < 0 ? 'cherry' : 'ginkgo');

  // ---------- towers ----------
  const TINT = [0xffffff, 0xcfe6ff, 0xffe2c8, 0xcdffe8, 0xe8d8ff], info = {};
  const tower = (cx, cz, type) => {
    const t = R.pick(TINT), nc = R.pick(NEON); let ext = [15, 15, 50];      // half-size along x, along z, height of the lowest tier
    b.push(cx, 0, cz);
    if (type === 'step') {
      const w1 = R.range(30, 34), h1 = R.range(46, 70), w2 = w1 - R.range(7, 10), h2 = R.range(26, 46), w3 = w2 - R.range(7, 9), h3 = R.range(14, 40), t1 = h1 + 1, t2 = t1 + h2 + 1, t3 = t2 + h3;
      b.box('panel', 0, 2, 0, w1 + 1.2, 4, w1 + 1.2, WHITE); b.box('fwin', 0, 4 + (h1 - 4) / 2, 0, w1, h1 - 4, w1, t); b.box('panel', 0, h1 + 0.5, 0, w1 + 1, 1, w1 + 1, WHITE); b.solid(0, 0, w1, w1, 0, t1, 'tower');
      b.box('fwin', 0, t1 + h2 / 2, 0, w2, h2, w2, t); b.box('panel', 0, t1 + h2 + 0.5, 0, w2 + 1, 1, w2 + 1, WHITE); b.solid(0, 0, w2, w2, t1, t2, 'tower');
      b.box('fwin', 0, t2 + h3 / 2, 0, w3, h3, w3, t); b.box('metal', 0, t3 + 0.4, 0, w3 + 0.8, 0.8, w3 + 0.8, 0xdfe8f2); b.solid(0, 0, w3, w3, t2, t3 + 0.8, 'tower');
      b.cyl('metal', 0, t3 + 7.8, 0, 0.15, 0.6, 14, 0xe8eef6, 6); b.sph('glow', 0, t3 + 15, 0, 0.8, nc, 1, 1, 1, 8, 6);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.box('glow', Math.sin(a) * (w1 / 2 + 0.62), 1.6, Math.cos(a) * (w1 / 2 + 0.62), 4.5, 3, 0.06, 0xc8f6ff, a); b.box('glow', Math.sin(a) * (w1 / 2 + 0.52), h1 + 0.5, Math.cos(a) * (w1 / 2 + 0.52), w1 * 0.8, 0.25, 0.06, nc, a); }
      ext = [w1 / 2, w1 / 2, h1];
    } else if (type === 'twin') {
      const ax = R() < 0.5, hA = R.range(75, 150), hB = R.range(60, 130), w = 13, o = 10.5, gap = 2 * o - w;
      for (const [d, h] of [[-o, hA], [o, hB]]) {
        const x = ax ? d : 0, z = ax ? 0 : d;
        b.box('panel', x, 1.5, z, w + 1, 3, w + 1, WHITE); b.box('fwin', x, 3 + (h - 3) / 2, z, w, h - 3, w, t); b.box('metal', x, h + 0.4, z, w + 0.8, 0.8, w + 0.8, 0xdfe8f2);
        b.cyl('glow', x, h + 1.2, z, 2.6, 2.6, 0.8, nc, 10); b.cyl('metal', x, h + 5, z, 0.12, 0.3, 7, 0xe8eef6, 5); b.solid(x, z, w, w, 0, h + 0.8, 'tower');
      }
      for (const f of [0.34, 0.62]) { const y = Math.min(hA, hB) * f, W = ax ? gap : 4, D = ax ? 4 : gap; b.box('glass', 0, y + 1.5, 0, W, 3, D, 0xffffff); b.box('panel', 0, y - 0.15, 0, W, 0.3, D, WHITE); b.box('glow', 0, y + 3.05, 0, ax ? gap : 0.3, 0.1, ax ? 0.3 : gap, nc); b.solid(0, 0, W, D, y - 0.3, y, 'bridge'); }
      ext = ax ? [o + w / 2, w / 2, 40] : [w / 2, o + w / 2, 40];
    } else if (type === 'round') {
      const r = R.range(12, 15), h = R.range(60, 140);
      b.cyl('panel', 0, 2, 0, r + 0.8, r + 0.8, 4, WHITE, 20); b.cyl('fwin', 0, 4 + (h - 4) / 2, 0, r, r, h - 4, t, 20);
      for (let k = 1; k < 4; k++) { b.cyl('panel', 0, h * k / 4, 0, r + 0.5, r + 0.5, 1, WHITE, 20); glowRing(0, h * k / 4, 0, r + 0.6, 0.12, nc); }
      b.cyl('metal', 0, h + 0.5, 0, r + 0.6, r + 0.6, 1, 0xdfe8f2, 20); b.sph('glass', 0, h + 1, 0, r * 0.8, 0xffffff, 1, 0.5, 1, 14, 8); b.sph('glow', 0, h + 2.6, 0, 1.3, nc, 1, 1, 1, 8, 6);
      b.solid(0, 0, r * 1.8, r * 1.8, 0, h + 1, 'tower'); ext = [r, r, h];
    } else {      // slab with a tall fin
      const ax = R() < 0.5, h = R.range(80, 135), W = ax ? 34 : 14, D = ax ? 14 : 34;
      b.box('panel', 0, 2, 0, W + 1.2, 4, D + 1.2, WHITE); b.box('fwin', 0, 4 + (h - 4) / 2, 0, W, h - 4, D, t); b.box('metal', 0, h + 0.5, 0, W + 1, 1, D + 1, 0xdfe8f2);
      b.box('panel', ax ? W / 2 + 0.6 : 0, h / 2 + 7, ax ? 0 : D / 2 + 0.6, ax ? 1.2 : 3, h + 14, ax ? 3 : 1.2, WHITE); b.box('glow', ax ? W / 2 + 1.25 : 0, h / 2 + 7, ax ? 0 : D / 2 + 1.25, ax ? 0.1 : 0.4, h + 14, ax ? 0.4 : 0.1, nc);
      b.solid(0, 0, W, D, 0, h + 1, 'tower'); ext = [W / 2, D / 2, h];
    }
    b.pop(); return ext;
  };
  const TUBED = new Set(['-1,-1', '-1,0', '-1,1', '0,1', '1,1', '1,-1', '1,0']), KINDS = ['step', 'twin', 'round', 'slab', 'twin', 'round'];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const key = i + ',' + j, cx = i * 60, cz = j * 60;
    if (key === '0,0') continue;
    if (key !== '0,-1') info[key] = tower(cx, cz, TUBED.has(key) ? 'step' : R.pick(KINDS));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) planter(cx + sx * 21, cz + sz * 21, R.pick(['round', 'round', 'cherry', 'ginkgo']), R.range(0.8, 1.05));
    if (key === '0,-1') continue;
    const side = (i + j) & 1 ? 1 : -1;
    bench(b, cx - 6, cz + side * 22.6, side > 0 ? 0 : Math.PI, 0xe8eef8); bench(b, cx + 6, cz + side * 22.6, side > 0 ? 0 : Math.PI, 0xe8eef8);
    if ((i * 3 + j * 5 + 20) % 3 === 0) kiosk(cx + side * 22.4, cz + 8, side > 0 ? Math.PI / 2 : -Math.PI / 2, R.pick(NEON));
  }
  // glass tube walkways between neighbouring towers, 36 m up (walls are see-through AND fly-through; the floor is solid)
  const tubeWalk = (x0, z0, x1, z1, y) => {
    const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), L = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    b.box('panel', mx, y - 0.15, mz, ax ? L : 4.2, 0.3, ax ? 4.2 : L, WHITE); b.cyl('glass', mx, y + 1.25, mz, 2.6, 2.6, L, 0xffffff, 12, ax ? 0 : Math.PI / 2, ax ? Math.PI / 2 : 0);
    for (let k = 1; k < L; k += 6) b.add('metal', new THREE.TorusGeometry(2.66, 0.1, 5, 14), 0xdfe8f2, mat4(ax ? Math.min(x0, x1) + k : mx, y + 1.25, ax ? mz : Math.min(z0, z1) + k, ax ? Math.PI / 2 : 0));
    for (const s of [-1, 1]) b.box('glow', ax ? mx : mx + s * 2, y + 0.04, ax ? mz + s * 2 : mz, ax ? L : 0.12, 0.06, ax ? 0.12 : L, CYAN);
    b.solid(mx, mz, ax ? L : 4.2, ax ? 4.2 : L, y - 0.3, y, 'tube');
  };
  for (const [a, c] of [['-1,-1', '-1,0'], ['-1,0', '-1,1'], ['1,-1', '1,0'], ['-1,1', '0,1'], ['0,1', '1,1']]) {
    const [ai, aj] = a.split(',').map(Number), [ci, cj] = c.split(',').map(Number), A = info[a], C = info[c];
    if (ai === ci) tubeWalk(ai * 60, aj * 60 + A[1], ci * 60, cj * 60 - C[1], 36); else tubeWalk(ai * 60 + A[0], aj * 60, ci * 60 - C[0], cj * 60, 36);
  }
  // holo billboards on the tower faces that look onto the busiest streets
  const ADS = [['-1,0', 1, 0, 'SKY NOODLES', '#ff3d81'], ['1,0', -1, 0, 'STAR ARCADE', '#7a5cff'], ['0,1', 0, -1, 'NEO HINODE', '#00b8e6'], ['-1,-1', 0, 1, 'ROBO WASH', '#1fc98e'], ['1,-1', 0, 1, 'MOON MILK', '#ff7a1a'],
    ['-1,1', 0, -1, 'CLOUD BAKERY', '#e6a800'], ['1,1', 0, -1, 'HOVER TAXI', '#ff3d81'], ['-2,0', 1, 0, 'ZERO-G GYM', '#00b8e6'], ['2,0', -1, 0, 'COMET CAFE', '#1fc98e'], ['0,-2', 0, 1, 'YEAR 2226', '#7a5cff'], ['0,2', 0, -1, 'PLANET PIZZA', '#ff7a1a']];
  ADS.forEach(([key, dx, dz, text, bg], n) => {
    const [i, j] = key.split(',').map(Number), e = info[key], y = 13 + (n % 3) * 3;
    b.push(i * 60 + dx * (e[0] + 0.9), 0, j * 60 + dz * (e[1] + 0.9), Math.atan2(dx, dz));
    holo(text, 0, y, 0.12, 14, 3.5, { bg }); const c = NEON[n % NEON.length];
    for (const s of [-1, 1]) { b.box('glow', 0, y + s * 1.95, 0.1, 14.8, 0.22, 0.2, c); b.box('glow', s * 7.3, y, 0.1, 0.22, 3.7, 0.2, c); }
    b.pop();
  });

  // ---------- the Gadget Depot (block north of the plaza; its open front faces the plaza) ----------
  b.push(0, 0, -60);
  b.sbox('panel', 0, 0.15, 0, 30, 0.3, 20, 0xf6fafd, 'floor'); b.sbox('panel', 0, 3.8, -9.6, 30, 7, 0.8, WHITE, 'wall');
  for (const s of [-1, 1]) { b.sbox('panel', s * 14.6, 3.8, 0, 0.8, 7, 20, WHITE, 'wall'); b.box('glow', s * 14.6, 3.8, 10.05, 0.5, 6.6, 0.1, 0x2ee6c8); b.box('fwin', s * 15.02, 4.2, 0, 0.06, 4, 14, 0xffffff); }
  b.box('panel', 0, 7.6, 0.5, 32, 0.6, 22, 0x2fc8b8); b.solid(0, 0.5, 32, 22, 7.3, 7.9, 'roof'); b.box('glow', 0, 7.25, 11.45, 32, 0.22, 0.12, 0xffd23a);
  b.cyl('metal', 0, 9, -1, 5, 6, 2.2, 0xdfe8f2, 16); b.sph('glass', 0, 10, -1, 4.6, 0xffffff, 1, 1, 1, 14, 9); b.sph('glow', 0, 11.2, -1, 1.5, 0xffb347, 1, 1, 1, 10, 7);
  for (const s of [-1, 1]) {      // giant gadget ornaments on the roof corners: a capsule and a propeller-less "spring"
    b.cyl('plain', s * 11.5, 9.6, -5, 1.2, 1.2, 2.6, s > 0 ? 0xff5fa2 : 0x35c8ff, 12); b.sph('plain', s * 11.5, 10.9, -5, 1.2, WHITE, 1, 1, 1, 12, 7); b.sph('plain', s * 11.5, 8.3, -5, 1.2, s > 0 ? 0xff5fa2 : 0x35c8ff, 1, 0.5, 1, 12, 5);
    for (let k = 0; k < 4; k++) glowRing(s * 11.5, 8.3 + k * 0.7, 5, 1.1 - k * 0.12, 0.12, NEON[(k + (s > 0 ? 0 : 3)) % 6]);
  }
  holo('GADGET DEPOT', 0, 9.6, 11.7, 19, 3, { bg: '#ff7a1a', w: 512, h: 96, font: 'bold 66px "Trebuchet MS", sans-serif' });
  for (const s of [-1, 1]) { b.box('glow', 0, 9.6 + s * 1.7, 11.65, 19.8, 0.25, 0.2, 0xffd23a); b.box('glow', s * 9.8, 9.6, 11.65, 0.25, 3.65, 0.2, 0xffd23a); b.cyl('metal', s * 7, 8.2, 11.4, 0.12, 0.12, 0.6, 0xdfe8f2, 6); }
  b.sbox('panel', 0, 0.85, -4, 12, 1.1, 1.4, 0x2fc8b8, 'counter'); b.box('metal', 0, 1.43, -4, 12.3, 0.06, 1.7, 0xffffff); b.box('glow', 0, 0.5, -3.28, 11.6, 0.12, 0.05, 0xffd23a);
  for (let r = 0; r < 3; r++) {
    b.box('metal', 0, 2.0 + r * 1.35, -8.85, 26, 0.08, 0.7, 0xe8eef6);
    for (let k = 0; k < 17; k++) { const x = -12 + k * 1.5 + R.range(-0.2, 0.2), y = 2.04 + r * 1.35, c = R.pick(NEON), q = R.int(0, 3); if (q === 0) b.box('plain', x, y + 0.3, -8.85, 0.6, 0.6, 0.45, c); else if (q === 1) b.sph('plain', x, y + 0.32, -8.85, 0.32, c, 1, 1, 1, 8, 6); else if (q === 2) b.cyl('plain', x, y + 0.35, -8.85, 0.16, 0.26, 0.7, c, 8); else b.cone('glow', x, y + 0.35, -8.85, 0.26, 0.7, c, 6); }
  }
  for (const [x, z, c] of [[-9, 4, 0x6ff2ff], [9, 4, 0xff5fa2], [-9, -1, 0xffd23a], [9, -1, 0x3df0b0]]) { b.sbox('panel', x, 0.8, z, 1.4, 1.0, 1.4, WHITE, 'stand'); b.sph('glow', x, 2.0, z, 0.38, c, 1, 1, 1, 8, 6); b.sph('glass', x, 2.0, z, 0.8, 0xffffff, 1, 1, 1, 10, 7); glowRing(x, 1.32, z, 0.6, 0.05, c); }
  for (let k = 0; k < 6; k++) b.box('glow', 0, 0.32, 9 - k * 1.6, 2.2 - k * 0.2, 0.03, 0.3, CYAN);
  era.pois.depot = b.w(0, 0, 13.5); { const p = b.w(0, 0.3, -6); era.depotSpot = { x: p.x, y: 0.3, z: p.z, yaw: 0 }; }
  b.pop();
  const depotRing = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.22, 5, 40), basic(0x6ff2ff)); depotRing.position.set(0, 10.4, -61); depotRing.rotation.x = 1.2; group.add(depotRing);

  // ---------- monorail loop on pylons ----------
  const rail = loopPath(0, 0, 84, 84, 12), _o = { x: 0, z: 0, yaw: 0 }, ARC = Math.PI * 6;
  const pylon = (x, z) => { b.cyl('concrete', x, 5.6, z, 0.5, 0.7, 11.2, 0xe4ecf6, 8); b.box('metal', x, 11.0, z, 1.8, 0.4, 1.8, 0xdfe8f2); b.solid(x, z, 1.3, 1.3, 0, 11.2, 'pylon', false); };
  for (const s of [-1, 1]) {
    b.box('metal', 0, 11.6, s * 84, 144, 0.8, 1.2, 0xe8eef6); b.box('metal', s * 84, 11.6, 0, 1.2, 0.8, 144, 0xe8eef6); b.box('glow', 0, 11.15, s * 84, 144, 0.1, 0.5, CYAN); b.box('glow', s * 84, 11.15, 0, 0.5, 0.1, 144, CYAN);
    for (const p of [-72, -42, 0, 42, 72]) { pylon(p, s * 84); pylon(s * 84, p); }
  }
  for (let c = 0; c < 4; c++) for (let k = 0; k < 5; k++) { rail.at(144 + c * (144 + ARC) + (k + 0.5) * ARC / 5, _o); b.box('metal', _o.x, 11.6, _o.z, 1.2, 0.8, ARC / 5 + 0.5, 0xe8eef6, _o.yaw); }
  const lit = (emissive) => new THREE.MeshLambertMaterial({ vertexColors: true, emissive });
  const train = new THREE.InstancedMesh(fuse([cube(2.7, 2.5, 8.2, 0xffffff, 0, 1.6, 0), ball(1, 0xffffff, 0, 1.6, 4.1, 1.35, 1.25, 1.1, 10, 6), ball(1, 0xffffff, 0, 1.6, -4.1, 1.35, 1.25, 1.1, 10, 6),
    cube(2.76, 0.8, 7.6, 0x16243e, 0, 2.05, 0), cube(2.78, 0.2, 8.3, 0xff5fa2, 0, 1.05, 0), cube(1.1, 0.5, 6.5, 0x2a3244, 0, 0.2, 0), cube(1.4, 0.3, 0.1, 0xfff2b0, 0, 1.3, 5.12), cube(1.4, 0.3, 0.1, 0xff4040, 0, 1.3, -5.12)]), lit(0x2a3856), 3);
  train.frustumCulled = false; group.add(train);

  // ---------- sky lanes: flying cars as one instanced mesh ----------
  const lanes = [{ p: loopPath(0, 0, 90, 90, 14), y: 30, v: 22 }, { p: loopPath(0, -30, 150, 120, 18), y: 46, v: -27 }, { p: loopPath(0, -30, 30, 120, 10), y: 62, v: 31 }, { p: loopPath(0, -30, 150, 120, 24), y: 80, v: -36 }];
  const NCAR = 52, cars = [], carCols = [0xff4a5a, 0x35c8ff, 0xffc428, 0x9a5cff, 0x3df0b0, 0xffffff, 0xff8a3d, 0xff7ac0];
  const skyCars = new THREE.InstancedMesh(fuse([ball(1, 0xffffff, 0, 0, 0, 1.0, 0.42, 2.2, 10, 6), ball(1, 0x1a2638, 0, 0.3, -0.15, 0.72, 0.42, 1.1, 8, 5), cube(2.7, 0.1, 0.8, 0xffffff, 0, 0.05, -1.1),
    cube(0.5, 0.14, 0.1, 0xfffbe0, -0.45, 0, 2.08), cube(0.5, 0.14, 0.1, 0xfffbe0, 0.45, 0, 2.08), cube(1.3, 0.12, 0.1, 0xff5050, 0, 0.05, -2.1), cube(1.1, 0.08, 2.6, 0x9ff6ff, 0, -0.4, 0)]), lit(0x3a4660), NCAR);
  skyCars.frustumCulled = false; group.add(skyCars);
  for (let i = 0; i < NCAR; i++) { const l = i % 4; cars.push({ l, s: ((i / 4) | 0) / 13 * lanes[l].p.L + R.range(-6, 6) }); skyCars.setColorAt(i, _c.set(R.pick(carCols))); }

  // ---------- hover platforms with floating gardens (fly up to them) ----------
  const platform = (x, y, z, kind, n) => {
    b.height = null; b.push(x, y, z);
    b.box('panel', 0, -0.5, 0, 14, 1, 14, WHITE); b.box('metal', 0, -1.2, 0, 9, 0.5, 9, 0xdfe8f2); b.cyl('glow', 0, -1.7, 0, 2.2, 3.6, 0.6, CYAN, 14); b.cyl('metal', 0, -2.4, 0, 0.6, 1.8, 0.9, 0xcfd8e4, 10);
    b.flat('grass', 0, 0.03, 0, 12.4, 12.4, 0xffffff);
    for (const s of [-1, 1]) { b.box('glow', 0, -0.5, s * 7.03, 14, 0.2, 0.06, NEON[n % 6]); b.box('glow', s * 7.03, -0.5, 0, 0.06, 0.2, 14, NEON[n % 6]); }
    tree(b, R, -3.6, -3, 1.0, kind); tree(b, R, 3.7, 3.3, 0.8, 'round'); bush(b, R, 3.6, -3.6, 1.2); bush(b, R, -4, 3.6, 1); flowers(b, R, 0.5, 0.5, 16, 3); bench(b, 0, -5, 0, 0xe8eef8);
    b.solid(0, 0, 14, 14, -1, 0, 'platform'); b.pop(); b.height = futH;
  };
  [[-17, 12, -16, 'cherry'], [17, 22, -16, 'ginkgo'], [60, 32, 30, 'cherry'], [30, 44, -60, 'round'], [40, 18, 215, 'ginkgo'], [-40, 26, 205, 'cherry'], [0, 14, 166, 'round']].forEach(([x, y, z, k], n) => platform(x, y, z, k, n));
  era.pois.skyGarden = new THREE.Vector3(16.5, 22.03, -15);

  // ---------- five sky rings in a loose circuit round the plaza ----------
  era.rings = [[0, 18, -30, Math.PI / 2], [30, 26, 0, 0], [0, 34, 30, Math.PI / 2], [-30, 42, 0, 0], [-30, 24, -30, Math.PI * 0.75]].map(([x, y, z, ry], i) => {
    b.add('glow', new THREE.TorusGeometry(5, 0.38, 8, 30), NEON[i], mat4(x, y, z, ry)); b.add('glow', new THREE.TorusGeometry(5.7, 0.08, 4, 30), 0xffffff, mat4(x, y, z, ry));
    return { x, y, z, r: 5, ry, nx: Math.sin(ry), nz: Math.cos(ry) };
  });

  // ---------- moving walkways ----------
  const walks = [];
  const walkway = (x0, z0, x1, z1) => {      // carries you from (x0,z0) towards (x1,z1)
    const ax = z0 === z1, L = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, dx = ax ? Math.sign(x1 - x0) : 0, dz = ax ? 0 : Math.sign(z1 - z0);
    b.box('metal', mx, 0.07, mz, ax ? L : 2.6, 0.06, ax ? 2.6 : L, 0xc8d4e6);
    for (const s of [-1, 1]) b.box('glow', ax ? mx : mx + s * 1.3, 0.1, ax ? mz + s * 1.3 : mz, ax ? L : 0.08, 0.06, ax ? 0.08 : L, 0x3df0b0);
    const cb = new Batch(M, null, 0), g = new THREE.Group(); cb.push(x0, 0.115, z0, Math.atan2(dx, dz));
    for (let k = 0.5; k < L - 2.6; k += 2) for (const s of [-1, 1]) cb.box('glow', s * 0.4, 0, k + 0.3, 1.0, 0.03, 0.2, 0xffffff, s * 0.64);
    cb.build(g); group.add(g);
    walks.push({ x0: Math.min(x0, x1) - (ax ? 0 : 1.3), x1: Math.max(x0, x1) + (ax ? 0 : 1.3), z0: Math.min(z0, z1) - (ax ? 1.3 : 0), z1: Math.max(z0, z1) + (ax ? 1.3 : 0), dx, dz, g, off: 0 });
  };
  walkway(33, -84, 33, -36); walkway(27, -36, 27, -84); walkway(84, 33, 36, 33); walkway(36, 27, 84, 27);

  // ---------- the park across the canal, under a climate dome ----------
  {
    const DX = 0, DZ = 245, DR = 26;
    b.flat('grass', 0, 0.045, 257.5, 240, 95, 0xffffff); b.flat('grass', -77.5, 0.045, 199, 85, 22, 0xffffff); b.flat('grass', 77.5, 0.045, 199, 85, 22, 0xffffff); b.flat('grass', 0, 0.045, 194, 50, 12, 0xffffff);
    b.add('glass', new THREE.SphereGeometry(DR, 24, 10, 0, TAU, 0, Math.PI / 2), 0xffffff, mat4(DX, 0.05, DZ));
    for (let i = 0; i < 6; i++) b.add('metal', new THREE.TorusGeometry(DR, 0.16, 4, 20, Math.PI), 0xe8eef6, mat4(DX, 0.05, DZ, i * Math.PI / 6));
    glowRing(DX, 0.16, DZ, DR, 0.22, 0x3df0b0); b.sph('glow', DX, DR + 0.8, DZ, 1.2, 0xfff2b0, 1, 1, 1, 8, 6);
    b.cyl('panel', DX, 0.12, DZ + 4, 7.6, 7.8, 0.24, WHITE, 24); b.cyl('water', DX, 0.2, DZ + 4, 7, 7, 0.12, 0xffffff, 24); b.sph('glow', DX, 9, DZ + 4, 1.5, 0xffd98a, 1, 1, 1, 10, 7); glowRing(DX, 9, DZ + 4, 2.6, 0.08, 0xff8a3d);
    for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + 0.3, r = 15 + (i % 3) * 3.2; if (Math.abs(Math.sin(a) * r) < 3 && Math.cos(a) < 0) continue; tree(b, R, DX + Math.sin(a) * r, DZ + Math.cos(a) * r, R.range(1.0, 1.5), ['cherry', 'round', 'ginkgo', 'cherry'][i % 4]); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; flowers(b, R, DX + Math.sin(a) * 11, DZ + 4 + Math.cos(a) * 11, 14, 2.2); bush(b, R, DX + Math.sin(a + 0.4) * 22.5, DZ + Math.cos(a + 0.4) * 22.5, 1.3); }
    bench(b, DX - 9.5, DZ + 4, Math.PI / 2, 0xe8eef8); bench(b, DX + 9.5, DZ + 4, -Math.PI / 2, 0xe8eef8); bench(b, DX, DZ - 6.5, Math.PI, 0xe8eef8);
    for (let z = 212; z < DZ - 8; z += 2.6) b.box('panel', 0, 0.08, z, 3.2, 0.08, 1.7, WHITE);
    for (let i = 0, made = 0; i < 200 && made < 30; i++) { const x = R.range(-114, 114), z = R.range(190, 300); if (Math.hypot(x - DX, z - DZ) < DR + 4 || (z < 213 && Math.abs(Math.abs(x) - 30) < 9) || (Math.abs(x) < 28 && z > 197 && z < 213) || (Math.abs(x) < 4 && z < DZ)) continue; tree(b, R, x, z, R.range(0.9, 1.5), R.pick(['round', 'round', 'cherry', 'ginkgo', 'pine'])); made++; }
    kiosk(8, 214, Math.PI, 0x3df0b0); holo('PARK DOME', 0, 4.2, 211.5, 7, 1.5, { bg: '#1fc98e' }); for (const s of [-1, 1]) b.cyl('metal', s * 3.3, 2.1, 211.5, 0.08, 0.08, 4.2, 0xdfe8f2, 6);
    era.pois.dome = new THREE.Vector3(DX, 0, DZ - 9);
  }

  // ---------- skyline: solid towers out to the edge of the map, then silhouettes in the haze ----------
  {
    const placed = [];
    for (let i = 0; i < 600 && placed.length < 30; i++) {
      const w = R.range(26, 44), h = R.range(45, 125), x = R.range(-316 + w / 2, 316 - w / 2), z = R.range(-316 + w / 2, 316 - w / 2);
      const ok = z < -168 - w / 2 || (Math.abs(x) > 168 + w / 2 && z < 122 - w / 2) || (Math.abs(x) > 130 + w / 2 && z > 198 + w / 2);
      if (!ok || placed.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) < (p.w + w) / 2 + 14)) continue;
      placed.push({ x, z, w }); const nc = R.pick(NEON);
      b.box('panel', x, 2, z, w + 1.2, 4, w + 1.2, WHITE); b.box('fwin', x, 4 + (h - 4) / 2, z, w, h - 4, w, R.pick(TINT)); b.box('panel', x, h + 0.5, z, w + 1, 1, w + 1, WHITE); b.box('glow', x, h + 1.2, z, w * 0.5, 0.4, w * 0.5, nc);
      if (R() < 0.5) { b.box('fwin', x, h + 1 + h * 0.15, z, w * 0.55, h * 0.3, w * 0.55, R.pick(TINT)); b.solid(x, z, w * 0.55, w * 0.55, h + 1, h + 1 + h * 0.3, 'tower'); }
      b.solid(x, z, w, w, 0, h + 1, 'tower');
    }
    const far = new Batch(M, null, 0);
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU + R.range(-0.08, 0.08), r = R.range(395, 470), w = R.range(46, 80), h = R.range(110, 280); far.box('fwin', Math.cos(a) * r, h / 2, Math.sin(a) * r, w, h, w, R.pick(TINT)); }
    far.build(group);
  }

  addTimePod(era, M, 0, 2);
  b.build(group);
  era.warp = { timePod: ['⏳', 'Time Pod'], plaza: ['⛲', 'Central Plaza'], depot: ['🛍️', 'Gadget Depot'], clock: ['🕰️', 'Holo Clock Tower'], garage: ['🚗', 'Hover Car Bays'], skyGarden: ['🪴', 'Sky Garden'], canal: ['🌉', 'Canal Bridge'], dome: ['🌳', 'Park Dome'] };

  // ---------- per-frame: train, sky traffic, walkways, clock ----------
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  let trainS = 0;
  era.update = (dt, G) => {
    const t = G.t;
    M.water.map.offset.x += dt * 0.015;
    trainS += dt * 15;
    for (let k = 0; k < 3; k++) { rail.at(trainS - k * 10.6, _o); _p.set(_o.x, 12, _o.z); _e.set(0, _o.yaw, 0); train.setMatrixAt(k, _m.compose(_p, _q.setFromEuler(_e), _ONE)); }
    train.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NCAR; i++) {
      const c = cars[i], l = lanes[c.l]; c.s += l.v * dt; l.p.at(c.s, _o);
      _p.set(_o.x, l.y + Math.sin(t * 0.7 + i) * 0.5, _o.z); _e.set(0, _o.yaw + (l.v < 0 ? Math.PI : 0), 0); skyCars.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e), _ONE));
    }
    skyCars.instanceMatrix.needsUpdate = true;
    const A = G.actors, still = G.frozen > 0;
    for (let k = 0; k < walks.length; k++) {
      const w = walks[k]; if (still) continue;
      w.off = (w.off + 2.6 * dt) % 2; w.g.position.set(w.dx * w.off, 0, w.dz * w.off);
      for (let i = 0; i < A.length; i++) { const a = A[i]; if (a.era !== 'future' || !(a.controlled || a.ai.mode === 'follow') || a.mount || a.pos.y > 0.4 || a.pos.x < w.x0 || a.pos.x > w.x1 || a.pos.z < w.z0 || a.pos.z > w.z1) continue; a.pos.x += w.dx * 2.6 * dt; a.pos.z += w.dz * 2.6 * dt; }
    }
    const tod = G.env ? G.env.tod : 19.5;
    hourHand.rotation.z = -(tod % 12) / 12 * TAU; minHand.rotation.z = -(tod % 1) * TAU; halo.rotation.y = t * 0.5; depotRing.rotation.y = t * 0.6;
  };
  return era;
}

function spawnCitizens(era) {
  const n = era.nodes, out = [];
  const add = (def, i) => { const p = n[(i * 5 + 2) % n.length]; const a = spawnActor({ era: 'future', cast: false, ai: 'wander', x: p.x + ((i % 3) - 1) * 1.6, z: p.z + ((i % 2) ? 1.5 : -1.5), yaw: i, ...def }); a.playable = true; a.citizen = true; out.push(a); return a; };
  const BOT_LINES = ['Welcome to Neo Hinode. Please keep your feet inside the moving walkway.', 'Bzzt. My battery is at 99 percent and so is my mood.', 'The Gadget Depot is north of the plaza. Tell Piko I sent you. She will not remember me.',
    'Sky lanes are for cars. Sky rings are for show-offs.', 'I have calculated the best noodle shop in the city. It is all of them.', 'A visitor from the past! Is it true you had to WALK up stairs?', 'The monorail is never late. It is also never early. It is a loop.',
    'Beep. I polish the plaza every night. Please do not tell me who drops the crumbs.', 'The floating gardens are lovely at dusk. You will need to fly, though.', 'Human detected. Initiating small talk. Nice weather. Small talk complete.', 'The Park Dome grows real trees. I am told they are slow robots.', 'Year 2226 and I still cannot find a matching pair of antenna caps.'];
  const BOTS = [['Bolt-7', 0xffffff, 0x35c8ff, 0x7ff6ff, 0xffd23a, 1.0], ['Nimbi', 0xfff0d8, 0xff8a3d, 0xfff59d, 0x35c8ff, 0.86], ['Quark', 0xe6f6ff, 0x8a6aff, 0xd8c8ff, 0x3df0b0, 1.1], ['Zuzu', 0xffe6f0, 0xff5fa2, 0xffffff, 0xffd23a, 0.8], ['Tock', 0xf2f2f2, 0x3a4660, 0xffb347, 0xff5050, 1.2], ['Lumo', 0xfffbe0, 0xffc428, 0x7ff6ff, 0xff5fa2, 0.92],
    ['Pip-Pip', 0xe0fff2, 0x1fc98e, 0xffffff, 0xff8a3d, 0.76], ['Orbit', 0xdfe8f8, 0x2f6fe0, 0x9ff6ff, 0xffffff, 1.05], ['Dash-E', 0xffffff, 0xff4a5a, 0xffe0e0, 0x35c8ff, 0.98], ['Mochibot', 0xfff6ee, 0xe8a8c8, 0xfff59d, 0x8a6aff, 0.88], ['Vee', 0xe8ecff, 0x00b8e6, 0x3df0b0, 0xffd23a, 1.14], ['Gizmo-Lu', 0xfff0c8, 0x7a5cff, 0x7ff6ff, 0xff5fa2, 0.95]];
  BOTS.forEach(([name, body, accent, eye, ball, h], i) => add({ id: 'bot' + (i + 1), name, emoji: '🤖', role: 'A robot citizen of Neo Hinode.', walk: 2.3 + (i % 3) * 0.2, run: 6,
    look: { type: 'robot', h, body, accent, eye, ball, bow: i % 5 === 3 ? accent : undefined }, lines: [BOT_LINES[i], BOT_LINES[(i + 5) % 12], BOT_LINES[(i + 9) % 12]] }, i));
  add({ id: 'wbot1', name: 'Wheelie Bo', emoji: '🛞', role: 'A one-wheeled courier robot. Always in a hurry.', walk: 3.2, run: 7.5, look: { make: makeWheelBot, h: 1.3, body: 0xf2f5f8, accent: 0xff8a3d, eye: 0x7ff6ff },
    lines: ['Delivery for… you? No. Delivery for someone shaped like you.', 'One wheel is all you need. Two is showing off.', 'Vrrrm! Excuse me, parcel coming through!'] }, 12);
  add({ id: 'wbot2', name: 'Sweeper Gus', emoji: '🧹', role: 'Keeps the streets of Neo Hinode spotless.', walk: 2.0, run: 5, look: { make: makeWheelBot, h: 1.5, body: 0xdff6ea, accent: 0x1fc98e, eye: 0xfff59d },
    lines: ['Mind the clean bit. It is all the clean bit.', 'Two hundred years of sweeping and still no medal.', 'You have dinosaur mud on your shoes. Fascinating. And annoying.'] }, 13);
  const PEOPLE = [
    ['Nova', '👩‍🚀', { h: 1.62, adult: true, hair: 0x7a5cff, hairStyle: 'bob', top: 0xf2f6fb, stripe: 0x35c8ff, collar: 0x35c8ff, bottom: 0x2a3a66, longPants: true, longSleeve: true, shoes: 0x35c8ff }, ['The canal lights up at night. Best seat is on the bridge.', 'I commute by monorail. The view never gets old.', 'Is that a real paper book? May I look at it?']],
    ['Juno', '🧑‍🎤', { h: 1.7, adult: true, hair: 0x1fc98e, hairStyle: 'spiky', top: 0x2a2e3e, stripe: 0xff5fa2, jacket: 0xff5fa2, bottom: 0xffd23a, longPants: true, longSleeve: true, shoes: 0xffffff }, ['My band plays the plaza on Fridays. Robots do the drums.', 'Try the hover cars. Space goes up, C comes down.', 'Nice outfit. Very… twenty-first century.']],
    ['Ren', '🧒', { h: 1.3, hair: 0x2b2b3a, hairStyle: 'short', top: 0xffd23a, stripe: 0x2a2e3e, bottom: 0x35c8ff, shoes: 0xff5fa2, cap: 0x35c8ff }, ['I can fly through all five sky rings in under a minute!', 'My robot does my homework. Then I check it. So I still do it. Hmm.', 'Have you seen the dinosaurs? Are they as big as the towers?']],
    ['Yuki', '👧', { h: 1.26, hair: 0xff8ac0, hairStyle: 'twintails', ribbon: 0x6ff2ff, top: 0xe6f6ff, collar: 0x8a6aff, bottom: 0x8a6aff, skirt: true, shoes: 0xffffff, socks: 0x6ff2ff }, ['The Sky Garden has real cherry trees. You have to fly up!', 'Piko at the Depot let me try a jelly that makes cats talk.', 'Race you along the moving walkway!']],
    ['Sol', '👴', { h: 1.66, adult: true, hair: 0xe8e8ee, hairStyle: 'side', mustache: true, top: 0x3df0b0, collar: 0xffffff, jacket: 0xf2f6fb, bottom: 0x4a5a78, longPants: true, longSleeve: true, shoes: 0x2a2e3e, glasses: 0xff8a3d }, ['I remember when this was all… well, towers. Slightly shorter ones.', 'They say an old town called Hinode stood right here, long ago.', 'The clock tower is a hologram. I still set my watch by it.']],
    ['Mei', '👩‍🔬', { h: 1.6, adult: true, hair: 0x16243e, hairStyle: 'ponytail', ribbon: 0xffd23a, top: 0xffffff, stripe: 0xff8a3d, collar: 0xff8a3d, bottom: 0xff8a3d, skirt: true, longSleeve: true, shoes: 0x2a2e3e, socks: 0xffffff }, ['I design hover platforms. The trick is remembering to put a fence on. Oops.', 'The dome keeps the park at a perfect spring day, all year.', 'A Time Pod, in this condition? That belongs in a museum! Or a garden.']],
  ];
  PEOPLE.forEach(([name, emoji, look, lines], i) => add({ id: 'cit' + (i + 1), name, emoji, role: 'Lives in Neo Hinode, year 2226.', look, lines, walk: 2.2, run: 5.4 }, 14 + i));
  era.citizens = out;
}

// Called once from main.js after the present era exists and before the cast and vehicles are created.
export function init() {
  const past = buildPast(G.M), future = buildFuture(G.M);
  for (const era of [past, future]) { G.eras[era.key] = era; era.group.visible = false; G.scene.add(era.group); }
  spawnDinos(past); spawnCitizens(future);
}
