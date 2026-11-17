// Sky dome, sun + shadows, drifting clouds, stars, time of day and weather.
import * as THREE from 'three';
import { clamp, lerp, damp, rng, TAU } from './util.js';

const KEYS = [ // hour, sky top, horizon, sun colour, sun intensity, ambient intensity
  [0, 0x05081a, 0x101a38, 0x8fa8ff, 0.18, 0.32], [5, 0x0b1230, 0x2a2f55, 0x8fa8ff, 0.2, 0.34], [6.5, 0x4a6fb5, 0xffb37a, 0xffb07a, 0.9, 0.55],
  [8.5, 0x3f8fe0, 0xcfe6f5, 0xfff2d6, 1.75, 0.95], [16, 0x3f8fe0, 0xcfe6f5, 0xfff2d6, 1.75, 0.95], [18, 0x5a5fae, 0xff9a5c, 0xff9460, 1.0, 0.6],
  [19.5, 0x0f1638, 0x3a3560, 0x8fa8ff, 0.25, 0.36], [24, 0x05081a, 0x101a38, 0x8fa8ff, 0.18, 0.32],
];
const c1 = new THREE.Color(), c2 = new THREE.Color();

export class Env {
  constructor(G) {
    this.G = G; this.tod = 15.7; this.todTarget = null; this.todSpeed = 0; this.night = 0; this.weather = 'clear'; this.cycle = false; this.flash = 0;
    const s = G.scene;
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x8a9a6a, 0.95); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.75); s.add(this.sun); s.add(this.sun.target);
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    s.fog = new THREE.Fog(0xcfe6f5, 80, 560);
    // sky dome: atmosphere gradient + a sun-lit cloud layer, all in one shader
    this.skyU = { top: { value: new THREE.Color(0x3f8fe0) }, hor: { value: new THREE.Color(0xcfe6f5) }, sunDir: { value: this.sunDir.clone() }, sunCol: { value: new THREE.Color(0xfff2d6) }, tint: { value: new THREE.Color(1, 1, 1) }, time: { value: 0 }, cover: { value: 0.43 }, night: { value: 0 } };
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 top, hor, sunDir, sunCol, tint; uniform float time, cover, night;
        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<4;i++){ s += a*noise(p); p = p*2.03 + vec2(17.0, 9.0); a *= 0.5; } return s * 1.04; }
        float fbm2(vec2 p){ return (noise(p) * 0.62 + noise(p*2.03 + vec2(17.0, 9.0)) * 0.38) * 0.97; }
        void main(){
          vec3 d = normalize(vDir); float h = clamp(d.y, -0.15, 1.0);
          vec3 c = mix(hor, top, pow(clamp(h*1.2+0.02, 0.0, 1.0), 0.5)); if(d.y < 0.0) c = mix(hor, hor*0.78, clamp(-d.y*6.0, 0.0, 1.0));
          float sd = max(dot(d, sunDir), 0.0); c += sunCol * (pow(sd, 1200.0)*14.0 + pow(sd, 48.0)*0.28 + pow(sd, 7.0)*0.05);
          if(d.y > 0.012){
            vec2 uv = d.xz / (d.y + 0.14) * 1.25 + vec2(time*0.010, time*0.003);
            float n = fbm(uv) * 0.72 + fbm2(uv*2.9 + 3.1) * 0.28;
            float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.3, n);
            float lit = clamp((n - (fbm2(uv + sunDir.xz*0.16)*0.72 + 0.14)) * 3.2 + 0.55, 0.0, 1.0);
            vec3 shade = mix(hor, top, 0.35) * 0.62, bright = vec3(1.0) * 0.9 + sunCol * 0.45;
            vec3 cc = mix(shade, bright, lit) * (1.0 - night * 0.82);
            c = mix(c, cc, dens * smoothstep(0.012, 0.2, d.y) * 0.96);
          }
          gl_FragColor = vec4(c * tint, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; s.add(this.sky);
    // the same sky lights the world: it is baked into an environment map for ambient light + reflections
    this.pmrem = new THREE.PMREMGenerator(G.renderer); this.envScene = new THREE.Scene(); this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), this.skyMat));
    this.envRT = null; this.envTod = -99; this.envWeather = ''; this.envT = 0; this.usePBR = true;
    // stars
    { const R = rng(3), n = 900, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = R() * TAU, y = R() * 0.95 + 0.03, r = Math.sqrt(1 - y * y); p[i * 3] = Math.cos(a) * r * 850; p[i * 3 + 1] = y * 850; p[i * 3 + 2] = Math.sin(a) * r * 850; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); this.stars.frustumCulled = false; s.add(this.stars); }
    this.clouds = [];
    // rain / snow particles (one buffer that follows the camera)
    { const n = 1400; this.pN = n; this.pPos = new Float32Array(n * 6); this.pSeed = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) this.pSeed[i] = Math.random();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbcd6ee, transparent: true, opacity: 0.55 })); this.rain.frustumCulled = false; this.rain.visible = false; s.add(this.rain);
      const sp = new Float32Array(n * 3), g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(sp, 3)); this.sPos = sp;
      this.snow = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9 })); this.snow.frustumCulled = false; this.snow.visible = false; s.add(this.snow); }
    this.wet = 0; this.fogMul = 1; this.eraFog = [0xcfe6f5, 80, 560]; this.eraTint = new THREE.Color(1, 1, 1);
    this.dummy = new THREE.Object3D();
  }
  setShadows(size) {
    const on = size > 0; this.G.renderer.shadowMap.enabled = on; this.sun.castShadow = on; this.G.renderer.shadowMap.autoUpdate = false; this.G.renderer.shadowMap.needsUpdate = true; this.shKey = '';
    if (on) { const sh = this.sun.shadow; sh.mapSize.set(size, size); const c = sh.camera; c.left = c.bottom = -46; c.right = c.top = 46; c.near = 1; c.far = 280; c.updateProjectionMatrix(); sh.bias = -0.0004; sh.normalBias = 0.05; sh.radius = 2.2; sh.blurSamples = 8; if (sh.map) { sh.map.dispose(); sh.map = null; } }
    this.G.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  setTime(h, speed = 6) { this.todTarget = ((h % 24) + 24) % 24; this.todSpeed = speed; }
  setWeather(w) { this.weather = w; this.rain.visible = w === 'rain' || w === 'storm'; this.snow.visible = w === 'snow'; }
  applyEra(era) { this.eraFog = era.fog || [0xcfe6f5, 80, 560]; this.eraTint.set(era.skyTint ?? 0xffffff); if (era.tod != null && !this.keepTime) { this.tod = era.tod; this.todTarget = null; } }
  lightning() { this.flash = 1; }
  update(dt) {
    const G = this.G, cam = G.camera;
    if (this.todTarget != null) { let d = this.todTarget - this.tod; if (d < 0) d += 24; const step = this.todSpeed * dt; if (d <= step) { this.tod = this.todTarget; this.todTarget = null; } else this.tod = (this.tod + step) % 24; }
    else if (this.cycle) this.tod = (this.tod + dt * 0.02) % 24;
    // palette lookup
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= this.tod) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = clamp((this.tod - a[0]) / (b[0] - a[0]), 0, 1);
    const bad = this.weather === 'rain' || this.weather === 'storm' ? 1 : this.weather === 'snow' || this.weather === 'fog' ? 0.6 : 0;
    this.wet = damp(this.wet, bad, 1.5, dt);
    const grey = c2.set(this.weather === 'storm' ? 0x4a5058 : 0x9aa4ad);
    this.skyU.top.value.set(a[1]).lerp(c1.set(b[1]), t).lerp(grey, this.wet * 0.8).multiply(this.eraTint);
    this.skyU.hor.value.set(a[2]).lerp(c1.set(b[2]), t).lerp(grey, this.wet * 0.7).multiply(this.eraTint);
    this.sun.color.set(a[3]).lerp(c1.set(b[3]), t); this.skyU.sunCol.value.copy(this.sun.color).multiplyScalar(1 - this.wet);
    const si = lerp(a[4], b[4], t) * (1 - this.wet * 0.55), ai = lerp(a[5], b[5], t) * (1 - this.wet * 0.2);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const pb = this.usePBR; this.sun.intensity = si * (pb ? 2.1 : 1) + this.flash * 6; this.hemi.intensity = ai * (pb ? 0.38 + this.night * 2.6 : 1) + this.flash * 2;
    this.hemi.color.copy(this.skyU.hor.value).lerp(c1.set(0xffffff), 0.45); this.hemi.groundColor.set(0x8a9a6a).lerp(c1.set(0x30364a), clamp(1 - si, 0, 1) * 0.8);
    this.night = clamp(1 - (si - 0.25) / 0.6, 0, 1);
    // sun arc (moon takes over at night so there is always a key light)
    const ang = ((this.tod - 6) / 12) * Math.PI, day = this.tod > 5.6 && this.tod < 18.6;
    const sa = day ? ang : ang - Math.PI;
    this.sunDir.set(Math.cos(sa) * 0.75, Math.max(0.2, Math.sin(sa)), 0.42).normalize(); this.skyU.sunDir.value.copy(this.sunDir);
    // fog
    const f = G.scene.fog; f.color.copy(this.skyU.hor.value); const fm = this.weather === 'fog' ? 0.12 : this.weather === 'rain' ? 0.5 : this.weather === 'storm' ? 0.35 : this.weather === 'snow' ? 0.4 : 1;
    this.fogMul = damp(this.fogMul, fm, 1.2, dt); f.near = this.eraFog[1] * this.fogMul; f.far = this.eraFog[2] * this.fogMul;
    G.renderer.setClearColor(f.color);
    // follow the camera
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position); this.stars.material.opacity = this.night * (1 - this.wet);
    const pc = G.pc; if (pc) { const tx = Math.round(pc.pos.x / 2) * 2, tz = Math.round(pc.pos.z / 2) * 2; this.sun.target.position.set(tx, pc.pos.y, tz); this.sun.position.set(tx, pc.pos.y, tz).addScaledVector(this.sunDir, 130);
      // the world is static, so the shadow map is only redrawn when its window moves, the sun moves, or every few frames for moving things
      const key = tx + ',' + tz + ',' + Math.round(pc.pos.y) + ',' + Math.round(this.tod * 30); this.shF = (this.shF || 0) + 1;
      if (key !== this.shKey || this.shF >= (G.perf ? G.perf.shadowEvery : 3)) { this.shKey = key; this.shF = 0; G.renderer.shadowMap.needsUpdate = true; } }
    // window glow / neon at night
    G.M.win.emissiveIntensity = this.night * 0.95; G.M.fwin.emissiveIntensity = 0.35 + this.night * 0.7; G.M.vend.emissiveIntensity = 0.12 + this.night * 0.7;
    // sky uniforms + re-bake the environment light when the sky has changed enough
    this.skyU.time.value = G.t; this.skyU.night.value = this.night; this.skyU.cover.value = damp(this.skyU.cover.value, this.weather === 'storm' ? 0.97 : this.weather === 'rain' ? 0.9 : this.weather === 'snow' ? 0.82 : this.weather === 'fog' ? 0.7 : 0.43, 0.8, dt);
    this.envT -= dt;
    if (this.usePBR && this.envT <= 0 && (Math.abs(this.tod - this.envTod) > 0.35 || this.weather !== this.envWeather || !this.envRT)) {
      this.envT = 0.7; this.envTod = this.tod; this.envWeather = this.weather;
      const old = this.envRT; this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 500); G.scene.environment = this.envRT.texture; if (old) old.dispose();
    }
    G.scene.environmentIntensity = this.usePBR ? (0.55 + 0.5 * (1 - this.night)) * (1 - this.wet * 0.25) : 1;
    // precipitation
    if (this.rain.visible) { const p = this.pPos, s = this.pSeed, T = G.t; for (let k = 0; k < this.pN; k++) { const x = cam.position.x + (s[k * 3] - 0.5) * 60, z = cam.position.z + (s[k * 3 + 2] - 0.5) * 60, y = cam.position.y + 22 - ((s[k * 3 + 1] * 34 + T * 30) % 34); p[k * 6] = x; p[k * 6 + 1] = y; p[k * 6 + 2] = z; p[k * 6 + 3] = x + 0.12; p[k * 6 + 4] = y - 0.9; p[k * 6 + 5] = z; } this.rain.geometry.attributes.position.needsUpdate = true; }
    if (this.snow.visible) { const p = this.sPos, s = this.pSeed, T = G.t; for (let k = 0; k < this.pN; k++) { p[k * 3] = cam.position.x + (s[k * 3] - 0.5) * 50 + Math.sin(T + k) * 0.6; p[k * 3 + 2] = cam.position.z + (s[k * 3 + 2] - 0.5) * 50 + Math.cos(T * 0.7 + k) * 0.6; p[k * 3 + 1] = cam.position.y + 16 - ((s[k * 3 + 1] * 26 + T * 2.2) % 26); } this.snow.geometry.attributes.position.needsUpdate = true; }
  }
}
