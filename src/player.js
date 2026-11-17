// The player: drives whichever Actor is currently "you", runs the orbit camera,
// finds things to interact with and things to aim gadgets at.
import * as THREE from 'three';
import { G } from './game.js';
import { clamp, damp, angDiff } from './util.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Player {
  constructor() {
    this.yaw = Math.PI; this.pitch = 0.28; this.dist = 5.2; this.camD = 5.2; this.fp = false; this.vehicle = null;
    this.focus = null; this.focusT = 0; this.target = null; this.aimPoint = new THREE.Vector3(); this.shake = 0; this.camOverride = null;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, depthTest: false })); this.ring.visible = false; this.ring.renderOrder = 40; G.scene.add(this.ring);
    this.history = []; this.histT = 0;
  }
  // Take control of an actor (POV switch).
  control(a, quiet = false) {
    const old = G.pc; if (old === a) return;
    if (this.vehicle) this.vehicle.exit();
    if (old) { old.controlled = false; old.model.root.visible = true; old.move.x = old.move.z = 0; old.move.run = old.move.jump = false; if (old.ai.mode === 'player') old.ai.mode = old.ai.was || 'wander'; old.ai.pause = 3; }
    for (const o of G.actors) if (o.ai.mode === 'follow' && o.ai.follow === old) o.ai.follow = a;       // companions come along
    a.ai.was = a.ai.mode === 'player' ? a.ai.was : a.ai.mode; a.ai.mode = 'player'; a.controlled = true; a.setState('idle');
    G.pc = a;
    const tiko = G.cast.tiko;
    if (tiko && a !== tiko && tiko.ai.mode !== 'scripted') { tiko.ai.mode = 'follow'; tiko.ai.follow = a; tiko.ai.slot = 0; }
    if (a.era !== G.era) G.setEra(a.era);
    this.yaw = a.yaw + Math.PI; this.history.length = 0;
    if (!quiet) { G.toast(`You are now ${a.emoji} ${a.name}`); G.bus.emit('switch', a); }
    G.ui && G.ui.refresh();
  }
  forward(out = _v) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // Unit vector the camera is looking along.
  look(out = _d) { const cp = Math.cos(this.pitch); return out.set(-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp); }

  update(dt) {
    const I = G.input, pc = G.pc; if (!pc) return;
    const free = G.mode === 'free' && !G.ui.modal;
    // ---- camera angles ----
    if (!G.ui.modal) {
      this.yaw -= I.dx * 0.0026; this.pitch = clamp(this.pitch + I.dy * 0.0024, -1.25, 1.45);
      this.yaw += I.axis('ArrowRight', 'ArrowLeft') * dt * 2.1; this.pitch = clamp(this.pitch + I.axis('ArrowDown', 'ArrowUp') * dt * 1.3, -1.25, 1.45);
      if (I.wheel) this.dist = clamp(this.dist + I.wheel * 0.7, 2.2, 16);
      if (free && I.hit('KeyV')) { this.fp = !this.fp; G.toast(this.fp ? 'First-person view' : 'Third-person view'); }
    }
    // ---- movement ----
    const m = pc.move;
    if (free && !this.vehicle && !pc.mount) {
      const f = I.axis('KeyS', 'KeyW'), s = I.axis('KeyA', 'KeyD');
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let x = fx * f + rx * s, z = fz * f + rz * s; const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
      m.x = x; m.z = z; m.run = I.down('ShiftLeft') || I.down('ShiftRight'); m.jump = I.down('Space'); m.up = I.down('Space'); m.down = I.down('KeyC') || I.down('ControlLeft');
      if (this.fp && l < 0.05) pc.yaw = this.yaw + Math.PI;
    } else if (!this.vehicle && G.mode === 'free') { m.x = m.z = 0; m.run = m.jump = m.up = m.down = false; }
    if (free && this.vehicle) this.vehicle.drive(I, dt);
    if (free && pc.mount) { const mt = pc.mount, f = I.axis('KeyS', 'KeyW'), s = I.axis('KeyA', 'KeyD'), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); mt.ai.mode = 'scripted'; mt.move.x = fx * f + rx * s; mt.move.z = fz * f + rz * s; mt.move.run = I.down('ShiftLeft'); mt.move.jump = mt.move.up = I.down('Space'); mt.move.down = I.down('KeyC'); }
    // rewind buffer
    this.histT += dt; if (this.histT > 0.25) { this.histT = 0; this.history.push({ x: pc.pos.x, y: pc.pos.y, z: pc.pos.z, era: pc.era }); if (this.history.length > 80) this.history.shift(); }
    // ---- interaction ----
    if (free) {
      this.focusT -= dt; if (this.focusT <= 0) { this.focusT = 0.12; this.scan(); }
      if (I.hit('KeyE') && this.vehicle) this.vehicle.exit();
      else if (I.hit('KeyE') && pc.mount && !this.focus) G.gadgets?.dismount();
      else if (I.hit('KeyE') && this.focus) this.interact(this.focus);
      if (I.hit('KeyF')) { if (this.vehicle) this.vehicle.exit(); else if (pc.mount) G.gadgets?.dismount(); else { const v = this.nearVehicle(); if (v) v.enter(pc); } }
    } else if (this.focus) { this.focus = null; G.ui.prompt(null); }
  }

  nearVehicle() { let best = null, bd = 4.2; for (const v of G.vehicles) { if (v.era !== G.era || v.driver) continue; const d = Math.hypot(v.pos.x - G.pc.pos.x, v.pos.z - G.pc.pos.z); if (d < bd) { bd = d; best = v; } } return best; }
  scan() {
    const pc = G.pc, era = G.cur(); let best = null, bd = 1e9;
    const consider = (o, d, pri = 0) => { d -= pri; if (d < bd) { bd = d; best = o; } };
    if (!this.vehicle) {
      for (const a of G.actors) { if (a === pc || a.era !== G.era || a.hidden || a.mount) continue; const d = a.dist(pc), reach = 2.4 * Math.max(1, pc.size * 0.8, a.size * 0.6); if (d < reach && Math.abs(a.pos.y - pc.pos.y) < 3 * Math.max(1, a.size)) consider({ type: 'talk', actor: a, label: a.rideable && a.friendly ? `Ride ${a.name}` : `Talk to ${a.name}`, key: 'E' }, d); }
      for (const it of era.interact) { if (it.hidden) continue; const d = Math.hypot(it.x - pc.pos.x, it.z - pc.pos.z); if (d < it.r && Math.abs((it.y ?? pc.pos.y) - pc.pos.y) < 6) consider({ type: 'thing', it, label: it.label, key: 'E' }, d, 0.5); }
      for (const p of G.props) { if (p.era !== G.era || !p.use) continue; const d = Math.hypot(p.pos.x - pc.pos.x, p.pos.z - pc.pos.z); if (d < (p.reach || 1.7) * Math.max(1, pc.size) && Math.abs(p.pos.y - pc.pos.y) < 2.5 * Math.max(1, pc.size)) consider({ type: 'prop', prop: p, label: p.label, key: 'E' }, d, 0.3); }
    }
    const v = !this.vehicle && !pc.mount ? this.nearVehicle() : null;
    if (v) consider({ type: 'car', car: v, label: `Drive the ${v.name}`, key: 'E' }, Math.hypot(v.pos.x - pc.pos.x, v.pos.z - pc.pos.z), 0.9);
    this.focus = best;
    const lines = []; if (best) lines.push([best.type === 'car' ? 'E' : 'E', best.label]); if (v && best && best.type !== 'car') lines.push(['F', `Drive the ${v.name}`]); if (this.vehicle) lines.push(['E', 'Get out']); if (pc.mount) lines.push(['F', 'Hop off']);
    const held = G.gadgets && G.gadgets.byId[G.save.hotbar[G.ui.slot]]; if (held && held.aim && !this.vehicle && !pc.mount) lines.push(['R', `Use ${held.icon} ${held.name}` + (held.alt ? ' (G: other mode)' : '')]);
    G.ui.prompt(lines.length ? lines : null);
  }
  interact(f) {
    const pc = G.pc;
    if (f.type === 'talk') {
      const a = f.actor;
      if (a.rideable && a.friendly && G.gadgets) return G.gadgets.ride(a);
      a.ai.pause = 4.5; const line = a.nextLine(); a.say(line, 4.5); G.ui.dialogue(a, line); G.sfx?.('talk'); G.bus.emit('talk', a);
    } else if (f.type === 'thing') { if (f.it.fn) f.it.fn(f.it); G.bus.emit('interact', f.it); }
    else if (f.type === 'prop') { f.prop.use(f.prop, pc); }
    else if (f.type === 'car') { f.car.enter(pc); }
  }

  // What the equipped gadget would hit: the actor nearest the crosshair, and a ground point.
  aim(maxDist = 45) {
    const pc = G.pc, cam = G.camera; let best = null, bs = 0.985;
    cam.getWorldDirection(_d);
    for (const a of G.actors) {
      if (a === pc || a.era !== G.era || a.hidden) continue;
      _v.set(a.pos.x, a.pos.y + a.height * a.size * 0.55, a.pos.z).sub(cam.position); const d = _v.length(); if (d > maxDist + this.camD) continue;
      const dot = _v.dot(_d) / d, need = Math.cos(Math.atan2(Math.max(0.6, a.height * a.size * 0.6), d) + 0.045); if (dot > need && dot > bs - 0.2) { const score = dot + (1 - d / 200) * 0.01; if (score > bs || !best) { if (dot > need) { bs = score; best = a; } } }
    }
    // ground point along the view ray
    const era = G.cur(); let t = this.camD + 0.5, hit = false;
    for (; t < maxDist + this.camD; t += 0.75) { _v.copy(cam.position).addScaledVector(_d, t); if (_v.y <= era.heightAt(_v.x, _v.z) + 0.02 || era.colliders.inside(_v.x, _v.y, _v.z)) { hit = true; break; } }
    if (!hit) { _v.set(pc.pos.x + Math.sin(pc.yaw) * 7, 0, pc.pos.z + Math.cos(pc.yaw) * 7); }
    this.aimPoint.set(_v.x, hit ? Math.max(era.heightAt(_v.x, _v.z), _v.y) : G.ground(_v.x, _v.z, pc.pos.y + 1), _v.z);
    this.target = best; return { actor: best, point: this.aimPoint };
  }

  // Runs after actors have moved so the camera never lags a frame behind.
  camera(dt) {
    const pc = G.pc, cam = G.camera, era = G.cur(); if (!pc) return;
    if (this.camOverride) { this.camOverride(cam, dt); return; }
    const v = this.vehicle, sz = pc.size, sub = v ? v : pc.mount ? pc.mount : pc;
    const h = v ? 1.5 : pc.mount ? pc.mount.height * pc.mount.size + 0.8 : pc.eye * sz + 0.18 * sz;
    const tx = sub.pos.x, ty = sub.pos.y + h, tz = sub.pos.z;
    const inside = this.inside;
    pc.model.root.visible = !(this.fp && !v);
    if (this.fp && !v) {
      cam.position.set(tx, ty, tz); this.look(_d); cam.lookAt(tx + _d.x, ty + _d.y, tz + _d.z);
    } else {
      const want = this.dist * (v ? 1.7 : pc.mount ? Math.max(1.5, pc.mount.size * 2) : clamp(Math.pow(sz * Math.max(1, pc.height / 1.7), 0.85), 0.3, 16));
      const cp = Math.cos(this.pitch), dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
      let ok = want; const step = Math.max(0.2, want / 26);
      if (!pc.noclip) for (let t = step; t <= want; t += step) { const x = tx + dx * t, y = ty + dy * t, z = tz + dz * t; if (y < era.heightAt(x, z) + 0.25 || era.colliders.inside(x, y, z, inside ? 'roof' : null)) { ok = Math.max(0.5, t - step * 1.2); break; } }
      this.camD = ok < this.camD ? ok : damp(this.camD, ok, 5, dt);
      cam.position.set(tx + dx * this.camD, ty + dy * this.camD, tz + dz * this.camD);
      const gy = era.heightAt(cam.position.x, cam.position.z) + 0.25; if (cam.position.y < gy) cam.position.y = gy;
      cam.lookAt(tx, ty, tz);
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 1.6); cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; cam.position.z += (Math.random() - 0.5) * this.shake; }
    // aim ring under the current gadget target
    const tg = this.showTarget ? this.target : null;
    if (tg && tg.era === G.era) { this.ring.visible = true; this.ring.position.set(tg.pos.x, tg.pos.y + 0.06, tg.pos.z); this.ring.scale.setScalar(Math.max(0.5, tg.radius * tg.size * 2.4)); this.ring.rotation.y += dt * 2; } else this.ring.visible = false;
  }
}
