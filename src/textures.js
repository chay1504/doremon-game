// Every surface is painted here on canvases — no image downloads.
// Each tiling surface is drawn twice at once: a colour picture and a height picture.
// The height picture becomes a normal map, so every brick, block and roof tile has real
// relief under the sun. Each texture knows how many metres one repeat covers (userData.m).
import * as THREE from 'three';
import { rng } from './util.js';

const R = rng(20261116);
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const grey = (v) => { v = Math.max(0, Math.min(255, v | 0)); return `rgb(${v},${v},${v})`; };
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
function tex(canvas, m, srgb = true) {
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (m) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.m = m; }
  return t;
}
// Height canvas (0..255 grey) -> tangent-space normal map. Wraps at the edges so it tiles.
function normalFrom(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data, out = cv(w, h), ox = out.getContext('2d'), img = ox.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = src[(y * w + ((x - 1 + w) % w)) * 4], r = src[(y * w + ((x + 1) % w)) * 4], u = src[(((y - 1 + h) % h) * w + x) * 4], dn = src[(((y + 1) % h) * w + x) * 4];
    let nx = -(r - l) / 255 * strength, ny = (dn - u) / 255 * strength, nz = 1; const k = 1 / Math.hypot(nx, ny, nz); nx *= k; ny *= k; nz *= k;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ox.putImageData(img, 0, 0); return out;
}
// A pair of contexts drawn in lock-step: colour (c) and height (k).
function duo(w, h) {
  const a = cv(w, h), b = cv(w, h), c = a.getContext('2d'), k = b.getContext('2d');
  const D = {
    a, b, c, k, w, h,
    fill(col, hv) { c.fillStyle = col; c.fillRect(0, 0, w, h); k.fillStyle = grey(hv); k.fillRect(0, 0, w, h); },
    rect(x, y, ww, hh, col, hv) { if (col) { c.fillStyle = col; c.fillRect(x, y, ww, hh); } if (hv != null) { k.fillStyle = grey(hv); k.fillRect(x, y, ww, hh); } },
    // raised block with sloped edges (drawn with wrap-around so it tiles)
    block(x, y, ww, hh, col, h0, h1, bev = 4) { for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) { if (x + ox + ww < 0 || x + ox > w || y + oy + hh < 0 || y + oy > h) continue; c.fillStyle = col; c.fillRect(x + ox, y + oy, ww, hh); for (let i = 0; i <= bev; i++) { k.fillStyle = grey(h0 + (h1 - h0) * i / bev); k.fillRect(x + ox + i, y + oy + i, ww - 2 * i, hh - 2 * i); } } },
    // random specks in colour and tiny pits/bumps in height
    speck(n, cols, alpha = 0.3, s0 = 1, s1 = 3, hAmp = 0) { for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, s = s0 + R() * (s1 - s0); c.globalAlpha = alpha * (0.4 + R() * 0.6); c.fillStyle = cols[(R() * cols.length) | 0]; c.fillRect(x, y, s, s); if (hAmp) { k.globalAlpha = 0.5; k.fillStyle = grey(128 + (R() - 0.5) * 2 * hAmp); k.fillRect(x, y, s, s); } } c.globalAlpha = 1; k.globalAlpha = 1; },
    // big soft colour blotches: weathering, stains, moss
    blotch(n, cols, alpha = 0.12, r0 = 20, r1 = 70) { for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0); for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) { const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); const col = cols[(R() * cols.length) | 0]; g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = alpha; c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } } c.globalAlpha = 1; },
    soften(px = 1) { const t = cv(w, h); t.getContext('2d').drawImage(b, 0, 0); k.filter = `blur(${px}px)`; k.drawImage(t, 0, 0); k.filter = 'none'; },
  };
  return D;
}
// Run a painter, return colour texture + normal texture.
function surf(T, name, w, h, m, strength, paint) { const D = duo(w, h); paint(D); T[name] = tex(D.a, m); T[name + 'N'] = tex(normalFrom(D.b, strength), m, false); }
function pic(w, h, draw) { const c = cv(w, h); draw(c.getContext('2d'), w, h); return tex(c, null); }

export function makeTextures(photo = true) {
  const T = {};
  // ---- concrete block garden wall: 39 x 19 cm blocks, 1 cm recessed mortar, running bond ----
  surf(T, 'wall', 512, 256, [0.8, 0.4], 3.2, (D) => {
    D.fill('#77746d', 70);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const k = 0.9 + R() * 0.18; D.block(c * 256 + (r ? 128 : 0) + 4, r * 128 + 4, 248, 120, shade('#c4c0b5', k), 90, 170, 5); }
    D.blotch(14, ['#8d8a80', '#d9d5ca', '#6f7468'], 0.16, 30, 110);
    for (let i = 0; i < 26; i++) { const x = R() * 512; D.c.globalAlpha = 0.07; D.c.fillStyle = '#3d3b36'; D.c.fillRect(x, 0, 2 + R() * 5, 256); } D.c.globalAlpha = 1;       // rain streaks
    D.speck(5200, ['#6b6862', '#e3e0d6', '#9a968c', '#57544f'], 0.33, 1, 3, 26); D.soften(0.6);
  });
  // ---- red brick: 21 x 6.5 cm, recessed mortar, each brick its own shade ----
  surf(T, 'brick', 512, 256, [0.88, 0.3], 3.6, (D) => {
    D.fill('#a59c8d', 60);
    const cols = ['#a4553f', '#b3604a', '#96493a', '#bb6a50', '#a85a45', '#8f4636', '#b86b4c'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) D.block(c * 128 + (r % 2 ? 64 : 0) + 4, r * 64 + 4, 120, 56, shade(cols[(R() * cols.length) | 0], 0.9 + R() * 0.2), 80, 175, 5);
    D.blotch(12, ['#5d3024', '#d9a089', '#7a3f30'], 0.12, 20, 80); D.speck(4500, ['#5d3024', '#d9a089', '#3d2018'], 0.26, 1, 3, 30); D.soften(0.6);
  });
  // ---- stucco: fine sand-float texture with trowel sweeps ----
  surf(T, 'plaster', 256, 256, [2, 2], 1.5, (D) => {
    D.fill('#f2f0ea', 128); D.blotch(14, ['#e6e3da', '#ffffff', '#dcd9d0'], 0.07, 40, 110);
    D.speck(9000, ['#d8d5cc', '#ffffff', '#c9c6be'], 0.32, 1, 2.6, 52); D.soften(0.7);
  });
  // ---- lap siding: overlapping boards, each one casts a little shadow line ----
  surf(T, 'siding', 256, 256, [1.6, 1.28], 3.0, (D) => {
    D.fill('#f1efe9', 128);
    for (let y = 0; y < 256; y += 32) { for (let i = 0; i < 32; i++) D.rect(0, y + i, 256, 1, null, 95 + i * 4.6); D.rect(0, y + 29, 256, 3, 'rgba(0,0,0,.22)', null); D.rect(0, y, 256, 2, 'rgba(255,255,255,.45)', null); }
    D.speck(1600, ['#cfccc3', '#fff'], 0.22, 1, 3, 10);
  });
  // ---- kawara roof tiles: barrel profile across, stepped overlap down the slope ----
  surf(T, 'roof', 512, 512, [1.0, 1.1], 4.2, (D) => {
    D.fill('#8e8e8e', 100);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x0 = c * 128, y0 = r * 128, k = 0.88 + R() * 0.2;
      for (let i = 0; i < 128; i++) { const u = i / 127, prof = Math.sin(u * Math.PI); D.c.fillStyle = shade('#b9b9b9', k * (0.72 + prof * 0.42)); D.c.fillRect(x0 + i, y0, 1, 128); for (let s = 0; s < 8; s++) { D.k.fillStyle = grey(40 + prof * 120 + s * 11); D.k.fillRect(x0 + i, y0 + s * 16, 1, 16); } }
      D.rect(x0, y0 + 114, 128, 14, 'rgba(0,0,0,.42)', null); D.rect(x0, y0, 128, 5, 'rgba(255,255,255,.2)', null); D.rect(x0, y0 + 120, 128, 8, null, 30);
    }
    D.blotch(10, ['#5d6a58', '#a8a8a8', '#70706c'], 0.1, 40, 120); D.speck(2600, ['#6e6e6e', '#d9d9d9'], 0.2, 1, 3, 12); D.soften(0.8);
  });
  // ---- timber planks with grain ----
  surf(T, 'wood', 256, 256, [1.2, 1.2], 2.4, (D) => {
    D.fill('#a57c52', 128);
    for (let c = 0; c < 4; c++) { const x0 = c * 64; D.rect(x0, 0, 62, 256, shade('#a57c52', 0.84 + R() * 0.3), 150); D.rect(x0 + 62, 0, 2, 256, '#3b2714', 60);
      for (let i = 0; i < 16; i++) { const px = x0 + 3 + R() * 56; for (const [ctx, st] of [[D.c, 'rgba(60,35,15,.3)'], [D.k, grey(120)]]) { ctx.strokeStyle = st; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 0); ctx.bezierCurveTo(px + 5, 80, px - 5, 170, px + 2, 256); ctx.stroke(); } }
      if (R() < 0.6) { const kx = x0 + 14 + R() * 34, ky = R() * 256; D.c.fillStyle = 'rgba(50,28,12,.55)'; D.c.beginPath(); D.c.ellipse(kx, ky, 4, 7, 0, 0, 7); D.c.fill(); } }
  });
  // ---- asphalt: aggregate, patches, hairline cracks ----
  surf(T, 'asphalt', 512, 512, [5, 5], 1.6, (D) => {
    D.fill('#4d5054', 128); D.blotch(16, ['#3d4043', '#5f6367', '#44474a'], 0.25, 50, 160);
    D.speck(22000, ['#34373a', '#73777c', '#8a8d90', '#44474b', '#a2a5a8'], 0.5, 1, 3, 60);
    for (let i = 0; i < 9; i++) { let px = R() * 512, py = R() * 512; for (const [ctx, st] of [[D.c, 'rgba(20,20,22,.5)'], [D.k, grey(40)]]) { ctx.strokeStyle = st; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(px, py); let x = px, y = py; for (let j = 0; j < 9; j++) { x += R() * 44 - 22; y += R() * 44 - 22; ctx.lineTo(x, y); } ctx.stroke(); } }
    D.soften(0.5);
  });
  surf(T, 'grass', 512, 512, [6, 6], 1.8, (D) => {
    D.fill('#659f45', 128); D.blotch(26, ['#4f8a36', '#7db552', '#5c9640', '#8a9a48'], 0.3, 30, 120);
    for (let i = 0; i < 9000; i++) { const px = R() * 512, py = R() * 512, l = 4 + R() * 8, dx = R() * 5 - 2.5; D.c.strokeStyle = ['#4d8a33', '#8ccb62', '#69a848', '#3f7a2c', '#a3d474'][(R() * 5) | 0]; D.c.globalAlpha = 0.6; D.c.beginPath(); D.c.moveTo(px, py); D.c.lineTo(px + dx, py - l); D.c.stroke(); D.k.strokeStyle = grey(110 + R() * 100); D.k.beginPath(); D.k.moveTo(px, py); D.k.lineTo(px + dx, py - l); D.k.stroke(); }
    D.c.globalAlpha = 1;
  });
  surf(T, 'dirt', 512, 512, [5, 5], 1.6, (D) => { D.fill('#b48f66', 128); D.blotch(20, ['#9c7a55', '#c9a57b', '#8a6b49'], 0.25, 40, 130); D.speck(16000, ['#a07d57', '#cba87e', '#8f6f4c', '#d6b890', '#6f5538'], 0.45, 1, 4, 55); D.soften(0.6); });
  surf(T, 'sand', 256, 256, [3, 3], 1.0, (D) => { D.fill('#e3d3a4', 128); D.speck(9000, ['#cdbb8a', '#f1e6c2', '#bfae80'], 0.4, 1, 2.5, 40); D.soften(0.6); });
  // ---- poured concrete slabs with broom finish and joints ----
  surf(T, 'concrete', 256, 256, [1.2, 1.2], 2.0, (D) => { D.fill('#c6c4bd', 150); D.blotch(8, ['#aeaca5', '#dad8d1', '#9c9e97'], 0.22, 30, 100); D.speck(6000, ['#aeaca5', '#e2e0d9', '#9d9b95'], 0.35, 1, 3, 30); D.rect(0, 0, 256, 4, '#8b8983', 60); D.rect(0, 0, 4, 256, '#8b8983', 60); D.soften(0.7); });
  surf(T, 'tatami', 512, 256, [1.8, 0.9], 2.0, (D) => {
    D.fill('#c3bf7c', 128); for (let y = 0; y < 256; y += 2) { D.rect(0, y, 512, 1, y % 4 ? 'rgba(90,100,30,.18)' : 'rgba(255,255,200,.18)', y % 4 ? 110 : 150); }
    D.rect(0, 0, 512, 14, '#2e4a34', 170); D.rect(0, 242, 512, 14, '#2e4a34', 170); for (let i = 0; i < 512; i += 20) { D.rect(i, 4, 8, 6, '#b7a04a', 190); D.rect(i + 10, 246, 8, 6, '#b7a04a', 190); }
  });
  surf(T, 'floor', 256, 256, [1.6, 1.6], 1.4, (D) => { D.fill('#c99b63', 128); for (let r = 0; r < 8; r++) { D.rect(0, r * 32, 256, 30, shade('#c99b63', 0.86 + R() * 0.26), 150); D.rect(0, r * 32 + 30, 256, 2, '#5a3a18', 70); D.rect((r * 107) % 256, r * 32, 2, 30, '#5a3a18', 70); for (let i = 0; i < 5; i++) { D.c.strokeStyle = 'rgba(90,55,20,.22)'; D.c.beginPath(); const y = r * 32 + 3 + R() * 24; D.c.moveTo(0, y); D.c.bezierCurveTo(80, y + 3, 170, y - 3, 256, y + 1); D.c.stroke(); } } });
  // ---- foliage: overlapping leaf shapes, light on top ----
  surf(T, 'leaf', 256, 256, [2.2, 2.2], 2.6, (D) => {
    D.fill('#c9dcc0', 60);
    for (let i = 0; i < 900; i++) { const x = R() * 256, y = R() * 256, a = R() * 3.14, rx = 5 + R() * 8, ry = 3 + R() * 4, hv = 90 + R() * 150; for (const ox of [0, -256, 256]) for (const oy of [0, -256, 256]) { if (x + ox < -16 || x + ox > 272 || y + oy < -16 || y + oy > 272) continue; D.c.fillStyle = ['#b9d6a8', '#ffffff', '#cfe6c0', '#a7c795', '#e6f2dc', '#93b884'][(i % 6)]; D.c.globalAlpha = 0.85; D.c.beginPath(); D.c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); D.c.fill(); D.k.fillStyle = grey(hv); D.k.beginPath(); D.k.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); D.k.fill(); } }
    D.c.globalAlpha = 1; D.soften(0.8);
  });
  surf(T, 'bark', 128, 256, [1, 2], 3.5, (D) => { D.fill('#74563a', 128); for (let i = 0; i < 90; i++) { const px = R() * 128, dark = R() < 0.55; for (const [ctx, st] of [[D.c, dark ? 'rgba(40,25,12,.55)' : 'rgba(180,140,100,.3)'], [D.k, grey(dark ? 40 : 200)]]) { ctx.strokeStyle = st; ctx.lineWidth = 1 + R() * 3; ctx.beginPath(); ctx.moveTo(px, 0); ctx.bezierCurveTo(px + 8, 80, px - 8, 180, px + 4, 256); ctx.stroke(); } } D.soften(0.6); });
  surf(T, 'rock', 256, 256, [3, 3], 3.0, (D) => { D.fill('#8a8781', 128); D.blotch(30, ['#6e6b66', '#aba8a1', '#5c5a56', '#7d8275'], 0.4, 10, 60); D.speck(5000, ['#6e6b66', '#aba8a1', '#5c5a56'], 0.5, 2, 7, 80); D.soften(1.2); });
  surf(T, 'metal', 128, 128, [1.5, 1.5], 0.8, (D) => { D.fill('#d9dde2', 128); for (let y = 0; y < 128; y += 1) D.rect(0, y, 128, 1, `rgba(0,0,0,${R() * 0.07})`, 124 + R() * 8); D.rect(0, 0, 128, 2, '#8d9299', 80); D.rect(0, 0, 2, 128, '#8d9299', 80); });
  surf(T, 'water', 256, 256, [14, 14], 2.2, (D) => {
    D.fill('#2f7fb4', 128);
    for (let i = 0; i < 260; i++) { const px = R() * 256, py = R() * 256, l = 14 + R() * 34, up = R() < 0.5; for (const ox of [0, -256, 256]) { D.c.strokeStyle = up ? 'rgba(255,255,255,.2)' : 'rgba(10,50,100,.25)'; D.c.lineWidth = 1 + R() * 2; D.c.beginPath(); D.c.moveTo(px + ox, py); D.c.quadraticCurveTo(px + ox + l / 2, py - 5, px + ox + l, py); D.c.stroke(); D.k.strokeStyle = grey(up ? 220 : 50); D.k.lineWidth = 3 + R() * 4; D.k.beginPath(); D.k.moveTo(px + ox, py); D.k.quadraticCurveTo(px + ox + l / 2, py - 5, px + ox + l, py); D.k.stroke(); } }
    D.soften(2);
  });
  // ---- school / office facade: plaster with one recessed window per 3 x 3.2 m cell ----
  surf(T, 'facade', 256, 256, [3, 3.2], 3.4, (D) => {
    D.fill('#ece9e0', 170); D.speck(2400, ['#d8d5cc', '#fff'], 0.3, 1, 3, 14);
    D.rect(24, 40, 208, 148, '#59666f', 110); D.rect(32, 48, 192, 132, null, 60);
    const g = D.c.createLinearGradient(0, 48, 0, 180); g.addColorStop(0, '#a9cfe6'); g.addColorStop(1, '#5f93b4'); D.c.fillStyle = g; D.c.fillRect(32, 48, 192, 132);
    D.rect(124, 48, 8, 132, '#dfe5e8', 120); D.rect(32, 108, 192, 6, '#dfe5e8', 120);
    D.c.fillStyle = 'rgba(255,255,255,.3)'; D.c.beginPath(); D.c.moveTo(46, 178); D.c.lineTo(100, 50); D.c.lineTo(122, 50); D.c.lineTo(68, 178); D.c.fill();
    D.rect(16, 188, 224, 12, '#b9b6ad', 215); D.rect(0, 244, 256, 12, '#cfccc3', 120); D.soften(0.8);
  });
  // ---- future tower glass: lit and dark panes behind fine mullions ----
  surf(T, 'fwin', 256, 256, [8, 8], 2.0, (D) => {
    D.fill('#16213a', 150);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const lit = R() < 0.55; D.rect(c * 32 + 3, r * 32 + 5, 26, 22, lit ? ['#8fe9ff', '#ffe9a8', '#b9f6ff', '#d7c8ff'][(R() * 4) | 0] : '#2a3a5c', 90); }
    D.rect(0, 0, 256, 2, '#55e0ff', 200);
  });
  surf(T, 'panel', 256, 256, [3, 3], 1.6, (D) => { D.fill('#eef3f8', 160); D.rect(0, 0, 256, 3, '#93a8bc', 70); D.rect(0, 0, 3, 256, '#93a8bc', 70); D.rect(126, 0, 3, 126, '#93a8bc', 70); D.rect(0, 126, 256, 3, '#93a8bc', 70); D.speck(700, ['#c7d3df'], 0.4, 1, 3, 6); });

  // ---- leaf cards: a spray of individual leaves on a transparent card (near-white so vertex colour tints it) ----
  { const c = cv(256, 256), x = c.getContext('2d');
    for (let i = 0; i < 150; i++) {
      const a = R() * 6.283, rr = Math.sqrt(R()) * 104, px = 128 + Math.cos(a) * rr, py = 128 + Math.sin(a) * rr, len = 15 + R() * 15, wd = len * (0.34 + R() * 0.16), rot = a + (R() - 0.5) * 2.2, v = 150 + R() * 105;
      x.save(); x.translate(px, py); x.rotate(rot);
      const g = x.createLinearGradient(0, -wd, 0, wd); g.addColorStop(0, `rgb(${v | 0},${v | 0},${v | 0})`); g.addColorStop(1, `rgb(${(v * 0.72) | 0},${(v * 0.72) | 0},${(v * 0.72) | 0})`);
      x.fillStyle = g; x.beginPath(); x.moveTo(-len, 0); x.quadraticCurveTo(0, -wd * 1.25, len, 0); x.quadraticCurveTo(0, wd * 1.25, -len, 0); x.fill();
      x.strokeStyle = 'rgba(60,60,60,.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-len * 0.9, 0); x.lineTo(len * 0.9, 0); x.stroke();
      x.restore();
    }
    T.leafcard = tex(c, null); }
  // ---- grass tuft: a fan of blades on a transparent card (light, so vertex colour tints it; darker at the roots) ----
  { const c = cv(128, 128), x = c.getContext('2d');
    for (let i = 0; i < 34; i++) {
      const bx = 10 + R() * 108, lean = (R() - 0.5) * 46, hgt = 60 + R() * 62, wd = 3 + R() * 3.5, v = 185 + R() * 70;
      const g = x.createLinearGradient(0, 128, 0, 128 - hgt); g.addColorStop(0, `rgb(${(v * 0.74) | 0},${(v * 0.78) | 0},${(v * 0.7) | 0})`); g.addColorStop(1, `rgb(${v | 0},${v | 0},${(v * 0.92) | 0})`);
      x.fillStyle = g; x.beginPath(); x.moveTo(bx - wd, 128); x.quadraticCurveTo(bx + lean * 0.35, 128 - hgt * 0.6, bx + lean, 128 - hgt); x.quadraticCurveTo(bx + lean * 0.5 + wd, 128 - hgt * 0.55, bx + wd, 128); x.fill();
    }
    T.grasscard = tex(c, null); }
  // ---- single pictures (not tiling) ----
  const win = (lit) => pic(256, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    if (lit) { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); g.addColorStop(0, '#ffd98a'); g.addColorStop(1, '#ffb860'); x.fillStyle = g; x.fillRect(6, 6, w - 12, h - 12); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(6, 6, 52, h - 12); x.fillRect(w - 58, 6, 52, h - 12); return; }
    g.addColorStop(0, '#7fa9c4'); g.addColorStop(0.55, '#4f7890'); g.addColorStop(1, '#2f4f63'); x.fillStyle = g; x.fillRect(0, 0, w, h);                 // dim room behind the glass
    x.fillStyle = 'rgba(20,30,40,.35)'; x.fillRect(60, 120, 136, 136);
    for (const [x0, flip] of [[0, 1], [w - 62, -1]]) { const cg = x.createLinearGradient(x0, 0, x0 + 62, 0); cg.addColorStop(0, flip > 0 ? '#f6efe2' : '#d9cdb8'); cg.addColorStop(1, flip > 0 ? '#d9cdb8' : '#f6efe2'); x.fillStyle = cg; x.fillRect(x0, 0, 62, h); x.strokeStyle = 'rgba(150,130,100,.55)'; for (let i = 1; i < 7; i++) { x.beginPath(); x.moveTo(x0 + i * 9, 0); x.lineTo(x0 + i * 9 + flip * 3, h); x.stroke(); } }
    x.fillStyle = 'rgba(255,255,255,.16)'; x.beginPath(); x.moveTo(70, h); x.lineTo(150, 0); x.lineTo(186, 0); x.lineTo(106, h); x.fill();
  });
  T.win = win(false); T.winLit = win(true);
  T.door = pic(128, 256, (x, w, h) => {
    x.fillStyle = '#6f5035'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { x.strokeStyle = 'rgba(40,25,12,.18)'; x.beginPath(); const px = R() * w; x.moveTo(px, 0); x.bezierCurveTo(px + 4, 80, px - 4, 170, px + 2, h); x.stroke(); }
    for (const [y0, hh] of [[18, 96], [132, 104]]) { x.fillStyle = '#5a3f28'; x.fillRect(16, y0, 96, hh); x.fillStyle = '#7d5c3e'; x.fillRect(22, y0 + 6, 84, hh - 12); x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(22, y0 + 6, 84, 3); }
    const g = x.createLinearGradient(0, 28, 0, 78); g.addColorStop(0, '#b9d7e6'); g.addColorStop(1, '#7da3b8'); x.fillStyle = g; x.fillRect(32, 30, 64, 46);
    x.fillStyle = '#d9b44a'; x.beginPath(); x.arc(104, 128, 6, 0, 7); x.fill(); x.fillStyle = '#8f7426'; x.fillRect(100, 136, 8, 14);
  });
  T.shoji = pic(256, 256, (x, w, h) => {
    x.fillStyle = '#5e4126'; x.fillRect(0, 0, w, h); x.fillStyle = '#f7f1e0'; x.fillRect(8, 8, w - 16, h - 16);
    x.strokeStyle = '#5e4126'; x.lineWidth = 3; for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(8 + i * 40, 8); x.lineTo(8 + i * 40, h - 8); x.stroke(); } for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(8, 8 + i * 60); x.lineTo(w - 8, 8 + i * 60); x.stroke(); }
    x.lineWidth = 8; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
  });
  T.vend = pic(128, 256, (x, w, h) => {
    x.fillStyle = '#e9eef2'; x.fillRect(0, 0, w, h); x.fillStyle = '#1f2a36'; x.fillRect(10, 12, 108, 124);
    const cs = ['#e2463c', '#f2b632', '#3aa0e0', '#3bb56b', '#f08a2c', '#8f5fd0'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { x.fillStyle = cs[(r * 5 + c) % 6]; x.fillRect(16 + c * 20, 20 + r * 38, 14, 28); x.fillStyle = '#fff'; x.fillRect(16 + c * 20, 28 + r * 38, 14, 6); x.fillStyle = '#3a4a5c'; x.fillRect(16 + c * 20, 51 + r * 38, 14, 4); }
    x.fillStyle = '#2b3d50'; x.fillRect(16, 156, 60, 16); x.fillStyle = '#111'; x.fillRect(24, 200, 80, 28);
  });
  if (photo) loadPhotos(T);
  return T;
}

// ---------------------------------------------------------------------------------------------
// Photo-scanned surfaces (Poly Haven, CC0) in public/textures: <key>_diff.jpg, _nor.jpg, _arm.jpg.
// The painted textures above stay as instant placeholders (and as the whole look in Smooth mode);
// each scan replaces its placeholder as soon as it has loaded. Values are metres per repeat.
const PHOTO = { asphalt: [3, 3], wall: [2, 2], brick: [1.4, 1.4], plaster: [2, 2], roof: [1.5, 1.5], wood: [1.8, 1.8], siding: [1.57, 1.57], concrete: [1.8, 1.8], floor: [1.7, 1.7], bark: [1, 1], rock: [1.5, 1.5], dirt: [2.07, 2.07] };
// Surfaces that get their colour from vertex tint (house walls, roofs) are turned into light greyscale first.
const NEUTRAL = { plaster: 222, roof: 196, siding: 218, wall: 178, concrete: 200 };
function neutralise(img, target) {
  const c = cv(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data; let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
  const k = target / (sum / (a.length / 4));
  for (let i = 0; i < a.length; i += 4) { const l = Math.min(255, (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * k); a[i] = a[i + 1] = a[i + 2] = l; }
  x.putImageData(d, 0, 0); return c;
}
function loadPhotos(T) {
  T.photo = {};
  const swap = (t, image) => { t.dispose(); t.image = image; t.needsUpdate = true; };
  const load = (url, done) => { const img = new Image(); img.onload = () => done(img); img.onerror = () => console.warn('[texture missing]', url); img.src = url; };
  for (const [key, m] of Object.entries(PHOTO)) {
    if (!T[key]) continue;
    T[key].userData.m = m; if (T[key + 'N']) T[key + 'N'].userData.m = m;
    const ph = cv(2, 2), px = ph.getContext('2d'); px.fillStyle = 'rgb(255,255,0)'; px.fillRect(0, 0, 2, 2);      // AO 1, roughness 1, metal 0
    const arm = tex(ph, m, false), P = T.photo[key] = { arm, mat: null, loaded: false };
    load(`/textures/${key}_diff.jpg`, (img) => swap(T[key], NEUTRAL[key] ? neutralise(img, NEUTRAL[key]) : img));
    load(`/textures/${key}_nor.jpg`, (img) => { if (T[key + 'N']) swap(T[key + 'N'], img); });
    load(`/textures/${key}_arm.jpg`, (img) => { swap(arm, img); P.loaded = true; if (P.mat) P.mat.roughness = 1; });
  }
}

// Text signs / labels — a texture with the text on a coloured plate.
export function signTexture(text, { bg = '#ffffff', fg = '#222', w = 256, h = 64, font = 'bold 34px "Trebuchet MS", sans-serif', border = null, sub = null } = {}) {
  return pic(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    if (border) { x.strokeStyle = border; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6); }
    x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + 2, w - 16);
    if (sub) { x.font = '18px "Trebuchet MS", sans-serif'; x.fillText(sub, w / 2, h * 0.78, w - 16); }
  });
}
// Emoji drawn to a texture: hundreds of instantly recognisable props (food, toys, gifts).
const emojiCache = new Map();
export function emojiTexture(ch) {
  if (emojiCache.has(ch)) return emojiCache.get(ch);
  const t = pic(128, 128, (x) => { x.font = '100px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70); });
  emojiCache.set(ch, t); return t;
}

// pbr = true: physically based materials with normal maps (Balanced / Pretty).
// pbr = false: cheap Lambert versions of the same surfaces (Smooth).
export function makeMaterials(T, pbr = true) {
  const S = (name, rough = 0.9, extra = {}) => {
    const map = name ? T[name] : null;
    const m = pbr
      ? new THREE.MeshStandardMaterial({ map, normalMap: name && T[name + 'N'] ? T[name + 'N'] : null, roughness: rough, metalness: 0, vertexColors: true, ...extra })
      : new THREE.MeshLambertMaterial({ map, vertexColors: true, ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['metalness', 'envMapIntensity', 'normalScale'].includes(k))) });
    if (map && map.userData.m) m.userData.tile = map.userData.m;
    return m;
  };
  const V2 = (x, y = x) => new THREE.Vector2(x, y);
  const M = {
    wall: S('wall', 0.93), brick: S('brick', 0.88), plaster: S('plaster', 0.96), siding: S('siding', 0.78), roof: S('roof', 0.5, { envMapIntensity: 0.9 }), wood: S('wood', 0.74),
    asphalt: S('asphalt', 0.9), grass: S('grass', 1), dirt: S('dirt', 1), sand: S('sand', 1), concrete: S('concrete', 0.9), tatami: S('tatami', 0.92),
    floor: S('floor', 0.38, { envMapIntensity: 0.7 }), leaf: S('leaf', 0.82, { normalScale: V2(1.4) }), bark: S('bark', 1), rock: S('rock', 0.92), metal: S('metal', 0.32, { metalness: 0.75 }),
    facade: S('facade', 0.55), panel: S('panel', 0.36, { metalness: 0.35 }),
    plain: S(null, 0.72), paint: S(null, 0.7, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: S(null, 0.05, { color: 0xbfe6ff, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.6 }),
    water: S('water', 0.07, { transparent: true, opacity: 0.86, envMapIntensity: 1.5, normalScale: V2(0.8) }),
    fwin: S('fwin', 0.16, { metalness: 0.45, emissiveMap: T.fwin, emissive: 0xffffff, emissiveIntensity: 0.55, envMapIntensity: 1.3 }),
    win: S('win', 0.06, { emissiveMap: T.winLit, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.7 }),
    frame: S(null, 0.4, { metalness: 0.55 }),
    leafcard: S('leafcard', 0.86, { alphaTest: 0.4, side: THREE.DoubleSide }),
    grasscard: S('grasscard', 0.9, { alphaTest: 0.42, side: THREE.DoubleSide }),
    door: S('door', 0.55), shoji: S('shoji', 0.9), vend: S('vend', 0.35, { emissiveMap: T.vend, emissive: 0xffffff, emissiveIntensity: 0.15 }),
  };
  if (pbr && T.photo) for (const [key, P] of Object.entries(T.photo)) { const m = M[key]; if (!m) continue; m.roughnessMap = P.arm; m.aoMap = P.arm; m.aoMapIntensity = 0.9; m.normalScale = V2(1); P.mat = m; if (P.loaded) m.roughness = 1; }
  for (const k of ['glow', 'glass', 'water']) M[k].userData.noShadow = true;
  for (const k of ['paint', 'grass', 'asphalt', 'dirt', 'sand', 'leafcard', 'grasscard']) M[k].userData.noCast = true;
  return M;
}
