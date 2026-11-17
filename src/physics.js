// Axis-aligned box colliders in a spatial hash. Everything solid in the world is one of these.
// A box is { x0,x1,z0,z1,y0,y1, walk, tag }. Actors are vertical cylinders (circle in XZ + feet/head Y).
import { clamp } from './util.js';

export class Colliders {
  constructor(cell = 16) { this.cell = cell; this.grid = new Map(); this.stamp = 0; this.count = 0; }
  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  add(x0, x1, z0, z1, y0, y1, tag = '', walk = true) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const c = { x0, x1, z0, z1, y0, y1, tag, walk, s: 0, cells: [] };
    const k = this.cell;
    for (let cx = Math.floor(x0 / k); cx <= Math.floor(x1 / k); cx++)
      for (let cz = Math.floor(z0 / k); cz <= Math.floor(z1 / k); cz++) {
        const key = this._key(cx, cz);
        let a = this.grid.get(key); if (!a) this.grid.set(key, a = []);
        a.push(c); c.cells.push(a);
      }
    this.count++;
    return c;
  }
  remove(c) { for (const a of c.cells) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } c.cells.length = 0; this.count--; }
  // Calls fn(c) for every collider whose cell overlaps the circle. fn may return true to stop.
  each(x, z, r, fn) {
    const k = this.cell, st = ++this.stamp;
    const ax = Math.floor((x - r) / k), bx = Math.floor((x + r) / k), az = Math.floor((z - r) / k), bz = Math.floor((z + r) / k);
    for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
      const a = this.grid.get(this._key(cx, cz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) { const c = a[i]; if (c.s === st) continue; c.s = st; if (fn(c)) return; }
    }
  }
  // Push a circle (p.x,p.z radius r, spanning feet..head) out of every box. Returns true on contact.
  resolve(p, r, feet, head) {
    let hit = false;
    this.each(p.x, p.z, r, (c) => {
      if (feet >= c.y1 - 0.42 || head <= c.y0) return;
      const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1);
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else {
        const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
      }
      hit = true;
    });
    return hit;
  }
  // Highest walkable box top under the point that the feet could be standing on.
  groundAt(x, z, feet) {
    let g = -Infinity;
    this.each(x, z, 0.05, (c) => {
      if (!c.walk || x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return;
      if (c.y1 <= feet + 0.45 && c.y1 > g) g = c.y1;
    });
    return g;
  }
  // Lowest box underside above the head (so flying actors bump ceilings).
  ceilingAt(x, z, head) {
    let g = Infinity;
    this.each(x, z, 0.05, (c) => {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) return;
      if (c.y0 >= head - 0.3 && c.y0 < g) g = c.y0;
    });
    return g;
  }
  inside(x, y, z, skipTag) {
    let hit = false;
    this.each(x, z, 0.05, (c) => {
      if (skipTag && c.tag === skipTag) return;
      if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && y >= c.y0 && y <= c.y1) { hit = true; return true; }
    });
    return hit;
  }
}
