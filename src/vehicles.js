// Drivable supercars (and hover cars in the future). Arcade handling, real collisions.
import * as THREE from 'three';
import { G } from './game.js';
import { clamp, damp, angDamp, pick } from './util.js';

const dark = new THREE.MeshLambertMaterial({ color: 0x15181d }), rim = new THREE.MeshLambertMaterial({ color: 0xc9ced6 });
const glass = new THREE.MeshPhongMaterial({ color: 0x14202e, shininess: 120, specular: 0x88aacc });
const head = new THREE.MeshBasicMaterial({ color: 0xfff6cf }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a }), pad = new THREE.MeshBasicMaterial({ color: 0x7ff6ff });

function profile(pts, width, bevel) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y))); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); return g;
}
function keiMesh(color) {
  const root = new THREE.Group(), paint = new THREE.MeshPhongMaterial({ color, shininess: 70, specular: 0x555555 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
  add(new THREE.BoxGeometry(1.5, 0.62, 3.3), paint, 0, 0.6, 0); add(new THREE.BoxGeometry(1.44, 0.6, 2.05), paint, 0, 1.2, -0.25);
  add(new THREE.BoxGeometry(1.46, 0.44, 1.85), glass, 0, 1.2, -0.25); add(new THREE.BoxGeometry(1.3, 0.46, 2.07), glass, 0, 1.2, -0.25);
  add(new THREE.BoxGeometry(1.52, 0.12, 0.08), dark, 0, 0.36, 1.66); add(new THREE.BoxGeometry(1.52, 0.12, 0.08), dark, 0, 0.36, -1.66);
  for (const s of [-0.52, 0.52]) { add(new THREE.BoxGeometry(0.32, 0.16, 0.04), head, s, 0.7, 1.66).castShadow = false; add(new THREE.BoxGeometry(0.3, 0.14, 0.04), tail, s, 0.72, -1.66).castShadow = false; add(new THREE.BoxGeometry(0.06, 0.1, 0.18), dark, s * 1.48, 1.0, 0.75); }
  const wheels = [];
  for (const [x, z] of [[-0.72, 1.08], [0.72, 1.08], [-0.72, -1.08], [0.72, -1.08]]) { const w = new THREE.Group(); w.position.set(x, 0.3, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14).rotateZ(Math.PI / 2), dark); t.castShadow = true; w.add(t); w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.21, 6).rotateZ(Math.PI / 2), rim)); root.add(w); wheels.push(w); }
  root.rotation.order = 'YXZ';
  return { root, wheels, paint };
}
function carMesh(color, hover, kind) {
  if (kind === 'kei') return keiMesh(color);
  const root = new THREE.Group(), paint = new THREE.MeshPhongMaterial({ color, shininess: 95, specular: 0x777777 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
  add(profile([[-2.15, 0.28], [-2.2, 0.62], [-2.05, 0.8], [-0.9, 0.84], [0.75, 0.8], [1.6, 0.62], [2.2, 0.46], [2.26, 0.3], [1.7, 0.2], [-1.8, 0.2]], 1.9, 0.1), paint);
  add(profile([[-1.08, 0.8], [-0.66, 1.15], [0.16, 1.15], [0.9, 0.8]], 1.46, 0.08), glass);
  add(new THREE.BoxGeometry(1.22, 0.035, 0.74), paint, 0, 1.165, -0.25);
  add(new THREE.BoxGeometry(1.78, 0.05, 0.36), paint, 0, 1.08, -2.02); for (const s of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.06, 0.26, 0.2), dark, s, 0.93, -1.98);
  add(new THREE.BoxGeometry(1.7, 0.06, 0.3), dark, 0, 0.2, 2.12); add(new THREE.BoxGeometry(1.2, 0.14, 0.05), dark, 0, 0.38, 2.27);
  for (const s of [-0.62, 0.62]) { add(new THREE.BoxGeometry(0.42, 0.1, 0.06), head, s, 0.52, 2.2).castShadow = false; add(new THREE.BoxGeometry(0.5, 0.09, 0.06), tail, s, 0.66, -2.2).castShadow = false; add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8).rotateX(Math.PI / 2), dark, s * 0.5, 0.3, -2.2); }
  const wheels = [];
  if (hover) { for (const [x, z] of [[-0.8, 1.35], [0.8, 1.35], [-0.8, -1.35], [0.8, -1.35]]) { const p = add(new THREE.CylinderGeometry(0.34, 0.26, 0.1, 14), pad, x, 0.16, z); p.castShadow = false; wheels.push(p); } for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.5, 0.9), paint, s * 0.98, 0.75, -1.6); }
  else for (const [x, z] of [[-0.9, 1.32], [0.9, 1.32], [-0.9, -1.3], [0.9, -1.3]]) { const w = new THREE.Group(); w.position.set(x, 0.34, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16).rotateZ(Math.PI / 2), dark); t.castShadow = true; w.add(t); w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.275, 6).rotateZ(Math.PI / 2), rim)); root.add(w); wheels.push(w); }
  root.rotation.order = 'YXZ';
  return { root, wheels, paint };
}

const _p = { x: 0, z: 0 };
export class Car {
  constructor(o) {
    this.name = o.name || 'Supercar'; this.era = o.era || 'present'; this.hover = !!o.hover; this.color = o.color ?? 0xd62828;
    this.kind = o.kind || 'super'; const m = carMesh(this.color, this.hover, this.kind); this.root = m.root; this.wheels = m.wheels; this.paint = m.paint; this.pos = this.root.position;
    this.yaw = o.yaw || 0; this.speed = 0; this.vy = 0; this.steer = 0; this.pitch = 0; this.alt = 0.7; this.driver = null; this.grounded = true; this.spin = 0;
    this.in = { th: 0, st: 0, brake: false, up: false, down: false, boost: false };
    G.scene.add(this.root); G.vehicles.push(this); this.place(o.x || 0, o.z || 0, this.yaw);
  }
  // A parked car is solid: people bump into it and can stand on the roof. The box is removed while someone drives.
  park() {
    if (this.col) return; const c = Math.abs(Math.cos(this.yaw)), s = Math.abs(Math.sin(this.yaw)), hw = this.kind === 'kei' ? 0.78 : 0.98, hl = this.kind === 'kei' ? 1.68 : 2.25;
    const ex = c * hw + s * hl, ez = s * hw + c * hl, y0 = this.pos.y - (this.hover ? this.alt : 0);
    this.colEra = this.era; this.col = G.eras[this.era].colliders.add(this.pos.x - ex, this.pos.x + ex, this.pos.z - ez, this.pos.z + ez, y0, y0 + (this.kind === 'kei' ? 1.5 : 1.2) + (this.hover ? this.alt : 0), 'car', true);
  }
  unpark() { if (!this.col) return; G.eras[this.colEra].colliders.remove(this.col); this.col = null; }
  place(x, z, yaw) { this.unpark(); this.pos.set(x, G.floor(x, z, this.era) + (this.hover ? this.alt : 0), z); if (yaw != null) this.yaw = yaw; this.speed = 0; this.vy = 0; }
  enter(a) {
    if (this.driver) return; this.unpark(); this.driver = a; a.hidden = true; a.setState('idle'); a.fly = false; G.player.vehicle = this; G.player.yaw = this.yaw + Math.PI;
    G.toast(this.hover ? `${this.name}: W/S go, A/D steer, Space up, C down, E to get out` : `${this.name}: W/S go, A/D steer, Space brake, Shift boost, E to get out`); G.sfx('use'); G.bus.emit('enterCar', this);
  }
  exit() {
    const a = this.driver; if (!a) return; this.driver = null; a.hidden = false; G.player.vehicle = null; G.ui.speed(null);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw); a.teleport(this.pos.x + lx * 1.9, this.pos.z + lz * 1.9, this.hover && this.pos.y - G.ground(this.pos.x, this.pos.z, this.pos.y, this.era) > 2 ? this.pos.y : undefined);
    if (this.hover && a.pos.y - G.ground(a.pos.x, a.pos.z, a.pos.y, this.era) > 2) { a.glide = true; setTimeout(() => { a.glide = !!a.fx.leaf; }, 6000); }
    this.in.th = this.in.st = 0; this.in.brake = this.in.up = this.in.down = this.in.boost = false; G.bus.emit('exitCar', this);
  }
  drive(I) {
    const n = this.in; n.th = I.axis('KeyS', 'KeyW'); n.st = I.axis('KeyD', 'KeyA'); n.boost = I.down('ShiftLeft') || I.down('ShiftRight');
    n.brake = !this.hover && I.down('Space'); n.up = this.hover && I.down('Space'); n.down = this.hover && (I.down('KeyC') || I.down('ControlLeft'));
    if (I.hit('KeyH')) { G.sfx('horn', 0.12); for (const a of G.actors) if (a.era === this.era && !a.controlled && Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 12 && a.state === 'idle') { a.ai.pause = 2; a.vel.y = 4; a.onGround = false; } }
  }
  update(dt) {
    this.root.visible = this.era === G.era; if (this.era !== G.era && !this.driver) return;
    // parked and still: nothing to simulate, just make sure it is solid
    if (!this.driver && Math.abs(this.speed) < 0.05 && Math.abs(this.vy) < 0.05 && (!this.hover || this.alt <= 0.71)) { this.speed = 0; if (!this.col && this.era === G.era) this.park(); return; }
    if (this.col) this.unpark();
    const era = G.eras[this.era], n = this.in, p = this.pos, max = (this.hover ? 68 : this.kind === 'kei' ? 34 : 52) * (n.boost ? 1.25 : 1);
    // engine
    if (n.th > 0) this.speed += (this.speed < 0 ? 34 : 17 * (1 - this.speed / max)) * dt;
    else if (n.th < 0) this.speed -= (this.speed > 0.5 ? 34 : this.speed > -13 ? 9 : 0) * dt;
    else this.speed = damp(this.speed, 0, 0.5, dt);
    if (n.brake) this.speed = damp(this.speed, 0, 3.6, dt);
    this.speed -= this.speed * Math.abs(this.speed) * 0.0004 * dt * 60 * 0.05;
    this.steer = damp(this.steer, n.st, 7, dt);
    this.yaw += this.steer * 2.3 * clamp(this.speed / 7, -1, 1) / (1 + Math.abs(this.speed) / 30) * dt;
    // move + collide (three probe circles along the body)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); let nx = p.x + fx * this.speed * dt, nz = p.z + fz * this.speed * dt, bump = 0;
    for (const off of [1.45, 0, -1.45]) { _p.x = nx + fx * off; _p.z = nz + fz * off; const bx = _p.x, bz = _p.z; if (era.colliders.resolve(_p, 0.95, p.y + 0.45, p.y + 1.2)) { nx += _p.x - bx; nz += _p.z - bz; bump += Math.hypot(_p.x - bx, _p.z - bz); } }
    if (bump > 0.0005) { this.speed *= Math.max(0.3, 1 - bump * 6); if (bump > 0.06 && Math.abs(this.speed) > 8 && this.driver) { G.player.shake = Math.min(0.5, Math.abs(this.speed) * 0.012); G.sfx('thud', 0.1); } }
    const bd = (era.bounds || 340) - 3; p.x = clamp(nx, -bd, bd); p.z = clamp(nz, -bd, bd);
    // height
    const gf = G.ground(p.x + fx * 1.4, p.z + fz * 1.4, p.y + 0.6, this.era), gr = G.ground(p.x - fx * 1.4, p.z - fz * 1.4, p.y + 0.6, this.era), g = Math.max((gf + gr) / 2, G.ground(p.x, p.z, p.y + 0.6, this.era));
    const wy = era.waterAt ? era.waterAt(p.x, p.z) : -Infinity;
    if (this.hover) {
      if (this.driver) this.alt = clamp(this.alt + ((n.up ? 1 : 0) - (n.down ? 1 : 0)) * 14 * dt, 0.7, 220);
      const base = Math.max(g, wy); let ty = base + this.alt; if (!this.driver && this.alt > 0.7) this.alt = Math.max(0.7, this.alt - 6 * dt);
      p.y = damp(p.y, ty, 5, dt) + Math.sin(G.t * 2.2 + this.yaw) * 0.004; if (p.y < base + 0.5) p.y = base + 0.5; this.grounded = true;
    } else {
      const prev = p.y; this.vy -= 24 * dt; p.y += this.vy * dt;
      if (p.y <= g) { p.y = g; this.vy = this.grounded ? Math.max(-2, (p.y - prev) / Math.max(dt, 0.001)) : 0; this.grounded = true; if (this.vy > 14) this.vy = 14; } else this.grounded = p.y - g < 0.08;
      if (wy > p.y + 0.55) { p.y = damp(p.y, wy - 0.5, 6, dt); this.vy = 0; this.speed = damp(this.speed, 0, 1.2, dt); }
    }
    this.pitch = damp(this.pitch, this.grounded ? -Math.atan2(gf - gr, 2.8) : clamp(-this.vy * 0.02, -0.4, 0.4), 9, dt);
    this.root.rotation.set(this.pitch + (this.hover ? -this.speed * 0.0015 : 0), this.yaw, -this.steer * this.speed * (this.hover ? 0.012 : 0.0035));
    this.spin += this.speed * dt / 0.34; if (!this.hover) for (const w of this.wheels) w.rotation.x = this.spin; else for (const w of this.wheels) w.scale.setScalar(1 + Math.sin(G.t * 12) * 0.08);
    // people in the way get bowled over (harmlessly) and have opinions about it
    if (Math.abs(this.speed) > 4) for (const a of G.actors) {
      if (a.era !== this.era || a.hidden || a === this.driver || a.ghost || a.thrown > 0) continue;
      const dx = a.pos.x - (p.x + fx * 1.2 * Math.sign(this.speed)), dz = a.pos.z - (p.z + fz * 1.2 * Math.sign(this.speed)); if (dx * dx + dz * dz > 2.6 || Math.abs(a.pos.y - p.y) > 2) continue;
      const s = Math.min(Math.abs(this.speed), 22) * Math.sign(this.speed); a.vel.set(fx * s * 0.7 + dx * 2, 5 + Math.abs(s) * 0.15, fz * s * 0.7 + dz * 2); a.thrown = 1.3; a.onGround = false; a.setState('stun', 1.8); a.say(pick(['Whoa!', 'Hey, watch it!', 'Eep!', 'My hat!', 'Slow down!']), 2.5); this.speed *= 0.9; G.sfx('thud');
    }
    const d = this.driver;
    if (d) { d.pos.copy(p); d.yaw = this.yaw; d.era = this.era; d.vel.set(0, 0, 0); G.ui.speed(Math.abs(this.speed) * 3.6); if (Math.abs(this.speed) > 4 && !G.input.dx && !G.input.btn[0]) G.player.yaw = angDamp(G.player.yaw, this.yaw + Math.PI + (this.speed < 0 ? Math.PI : 0), 2.4, dt); }
  }
  dispose() { this.unpark(); G.scene.remove(this.root); const i = G.vehicles.indexOf(this); if (i >= 0) G.vehicles.splice(i, 1); }
}

const KEI = [['Town Hopper', 0xf2f2f2], ['Little Red', 0xd94f4f], ['Bluebell', 0x4f79d9], ['Lemon Drop', 0xe9c53a], ['Mint Box', 0x7fbf7f], ['Grey Pebble', 0x6b6f78], ['Tangerine', 0xf08a2c]];
export const CAR_NAMES = [['Rosso GT', 0xd62828], ['Sunbeam V12', 0xf7b801], ['Aqua Spyder', 0x1fa3a3], ['Shiro RS', 0xf4f4f4], ['Violet Arrow', 0x7b4fd6], ['Mikan Turbo', 0xf2762e], ['Midnight 900', 0x1f2740], ['Lime Bolt', 0x7ac943]];
export function spawnCar(o) { return new Car(o); }
export function init() {
  G.spawnCar = spawnCar;
  for (const key in G.eras) {
    const era = G.eras[key];
    (era.garage || []).forEach((s, i) => { const [nm, col] = CAR_NAMES[i % CAR_NAMES.length]; new Car({ name: s.name || nm, color: s.color ?? col, era: key, x: s.x, z: s.z, yaw: s.yaw || 0, hover: !!s.hover }); });
    (era.parked || []).forEach((s, i) => new Car({ name: KEI[i % KEI.length][0], color: KEI[i % KEI.length][1], kind: 'kei', era: key, x: s.x, z: s.z, yaw: s.yaw || 0 }));
  }
}
