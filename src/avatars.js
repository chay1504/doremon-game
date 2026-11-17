// Rigged anime-style character models (VRoid Studio sample avatars, CC0) for the human cast.
// Each Actor keeps its simple procedural body as a fallback; when the actor is near the camera
// its avatar is loaded, attached under the same "body" joint, and its humanoid bones are driven
// every frame from the procedural joints — so every existing animation and gadget keeps working.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { G } from './game.js';

const loader = new GLTFLoader(); loader.register((parser) => new VRMLoaderPlugin(parser));
const buffers = new Map();
const fetchFile = (name) => { if (!buffers.has(name)) buffers.set(name, fetch(`/models/${name}.vrm`).then((r) => { if (!r.ok) throw new Error('missing model ' + name); return r.arrayBuffer(); })); return buffers.get(name); };
const _v = new THREE.Vector3(), _c = new THREE.Color();
const EXTRA_CITIZENS = [{ file: 'Darkness_Shibu' }, { file: 'Vita' }, { file: 'Victoria_Rubin', cloth: 0xa8e0f2 }, { file: 'Sakurada_Fumiriya', hair: 0x6ad0c0, cloth: 0xc8f0e8 }, { file: 'Sendagaya_Shibu', cloth: 0xd0b8f2 }, { file: 'HairSample_Male', cloth: 0xf2e08a }];
const BONES = ['hips', 'spine', 'chest', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot'];

// Shrink oversized textures (each avatar ships ~30 images up to 2048px — far too much video memory for twenty characters).
function shrinkTextures(root, cap) {
  const seen = new Set(), jobs = [];
  const visit = (t, big) => {
    if (!t || !t.isTexture || seen.has(t) || !t.image) return; seen.add(t);
    const img = t.image, w = img.width, h = img.height, lim = big ? cap * 2 : cap; if (!w || Math.max(w, h) <= lim) return;
    const k = lim / Math.max(w, h), rw = Math.max(1, Math.round(w * k)), rh = Math.max(1, Math.round(h * k));
    if (typeof createImageBitmap === 'function') { jobs.push(createImageBitmap(img, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'medium', premultiplyAlpha: 'none' }).then((bm) => { if (img.close) img.close(); t.image = bm; t.needsUpdate = true; }).catch(() => {})); return; }
    const c = document.createElement('canvas'); c.width = rw; c.height = rh;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); if (img.close) img.close(); t.image = c; t.needsUpdate = true;
  };
  root.traverse((o) => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const big = /FACE|EYE|Face|Eye/.test(m.name || ''); for (const k of ['map', 'normalMap', 'emissiveMap']) visit(m[k], big); if (m.uniforms) for (const u of Object.values(m.uniforms)) visit(u && u.value, big); } });
  return Promise.all(jobs);
}
// Drop the toon outline pass (it doubles the draw calls) and merge the many little hair/cloth pieces that share a material.
function slim(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return; o.frustumCulled = false;
    if (Array.isArray(o.material)) { const keep = o.material.filter((m) => !m.isOutline); if (keep.length === 1) { o.material = keep[0]; o.geometry.clearGroups(); } else o.material = keep; }
    if (!o.isSkinnedMesh || Array.isArray(o.material) || Object.keys(o.geometry.morphAttributes).length || !o.parent) return;
    const key = o.parent.uuid + '|' + o.material.uuid + '|' + o.skeleton.uuid + '|' + Object.keys(o.geometry.attributes).sort().join(',') + '|' + (o.geometry.index ? 'i' : 'n');
    let a = groups.get(key); if (!a) groups.set(key, a = []); a.push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    let merged = null; try { merged = mergeGeometries(list.map((m) => m.geometry), false); } catch (e) { merged = null; }
    if (!merged) continue;
    const first = list[0], mesh = new THREE.SkinnedMesh(merged, first.material); mesh.name = first.name + '_merged'; mesh.frustumCulled = false;
    mesh.bind(first.skeleton, first.bindMatrix); first.parent.add(mesh);
    for (const m of list) { m.parent.remove(m); m.geometry.dispose(); }
  }
}
async function loadVRM(name, cap) {
  const buf = await fetchFile(name), gltf = await loader.parseAsync(buf, ''), vrm = gltf.userData.vrm; if (!vrm) throw new Error('not a VRM: ' + name);
  VRMUtils.removeUnnecessaryVertices(gltf.scene); if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
  slim(vrm.scene); await shrinkTextures(vrm.scene, cap);
  return vrm;
}

class Avatars {
  constructor() {
    const hi = G.save.quality === 'high';
    this.live = new Map(); this.loading = null; this.failed = new Set(); this.t = 0; this.max = hi ? 8 : 6; this.maxBase = this.max;
    // fetch the model files in the background so walking up to someone never waits on the disk
    const files = [...new Set(G.actors.map((a) => a.look && a.look.avatar && a.look.avatar.file).filter(Boolean))]; (async () => { for (const f of files) { try { await fetchFile(f); } catch (e) { /* reported on load */ } } })(); this.cap = hi ? 1024 : 512; this.shadows = hi; this.range = 46; this.count = 0;
  }
  update(dt) {
    this.t -= dt; if (this.t <= 0) { this.t = 0.35; this.plan(); }
    for (const [a, av] of this.live) if (av.on) this.sync(a, av, dt);
  }
  // Decide which actors get a full avatar right now: the nearest few in view range (you always do).
  plan() {
    const cam = G.camera.position, cands = [], fwd = G.camera.getWorldDirection(_v);
    for (const a of G.actors) {
      // extras without their own casting (future citizens, the away baseball team) borrow a model
      if (a.look && !a.look.avatar && a.kind === 'human' && !a.look.type) { const n = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0; if (a.citizen) a.look.avatar = EXTRA_CITIZENS[n % EXTRA_CITIZENS.length]; else if (/^rocket/.test(a.id)) a.look.avatar = { file: n % 2 ? 'HairSample_Male' : 'Sakurada_Fumiriya', cloth: 0xf08a8a, hair: n % 3 ? undefined : 0x8a5a3a }; }
      const spec = a.look && a.look.avatar; if (!spec || this.failed.has(spec.file) || a.kind !== 'human') continue; if (a.era !== G.era || a.hidden || a.ghost) continue; let d = a.controlled ? -1 : Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z) / Math.max(1, a.size); if (d >= this.range) continue; if (d > 2.5 && (a.pos.x - cam.x) * fwd.x + (a.pos.z - cam.z) * fwd.z < 0) d += 30; cands.push([d, a]); }
    cands.sort((x, y) => x[0] - y[0]); const top = cands.slice(0, this.max), want = new Set(top.map((c) => c[1]));
    for (const [a, av] of this.live) { if (av.look !== a.look || !G.actors.includes(a)) { this.drop(a); continue; } this.show(a, av, want.has(a)); }
    if (!this.loading) for (const [, a] of top) if (!this.live.has(a)) { this.load(a); break; }
    if (this.live.size > this.max + 3) { let far = null, fd = -1; for (const [a, av] of this.live) { if (av.on) continue; const d = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z) + (a.era === G.era ? 0 : 1e4); if (d > fd) { fd = d; far = a; } } if (far) this.drop(far); }
    this.count = [...this.live.values()].filter((v) => v.on).length;
  }
  load(a) {
    const look = a.look, spec = look.avatar; this.loading = a;
    loadVRM(spec.file, this.cap).then((vrm) => {
      this.loading = null; if (a.look !== look || !G.actors.includes(a)) { VRMUtils.deepDispose(vrm.scene); return; }
      this.attach(a, vrm, look);
    }).catch((e) => { console.warn('[avatar]', spec.file, e); this.loading = null; this.failed.add(spec.file); });
  }
  attach(a, vrm, look) {
    const spec = look.avatar, root = vrm.scene, old = String(vrm.meta && vrm.meta.metaVersion) === '0';
    if (old) VRMUtils.rotateVRM0(vrm);                       // old files face backwards
    root.updateMatrixWorld(true);
    const head = vrm.humanoid.getRawBoneNode('head'); head.getWorldPosition(_v); const tall = _v.y + 0.19;
    const s = a.height / a.j.body.scale.x / tall, wide = spec.wide || 1; root.scale.set(s * wide, s, s * (1 + (wide - 1) * 0.7));
    const tintMat = (m, hex) => { _c.set(hex); if (m.color && m.color.isColor) m.color.multiply(_c); if (m.shadeColorFactor && m.shadeColorFactor.isColor) m.shadeColorFactor.multiply(_c); };
    root.traverse((o) => { if (!o.isMesh) return; o.castShadow = this.shadows; o.receiveShadow = false; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const n = (m.name || '').toUpperCase(); if (spec.hair != null && n.includes('HAIR')) tintMat(m, spec.hair); if (spec.cloth != null && (n.includes('CLOTH') || n.includes('TOPS') || n.includes('BOTTOMS') || n.includes('ONEPIECE'))) tintMat(m, spec.cloth); } });
    const b = {}; for (const n of BONES) b[n] = vrm.humanoid.getNormalizedBoneNode(n);
    a.j.body.add(root);
    const moving = new Set(); for (const n of Object.keys(vrm.humanoid.humanBones || {})) { const node = vrm.humanoid.getRawBoneNode(n); if (node) moving.add(node); }
    const frozen = []; root.traverse((o) => { if (o === root || moving.has(o)) return; o.updateMatrix(); o.matrixAutoUpdate = false; frozen.push(o); });
    const av = { vrm, root, b, look, frozen, live: false, on: false, k: old ? -1 : 1, blink: 1 + Math.random() * 4, em: vrm.expressionManager, first: true };
    this.live.set(a, av); this.show(a, av, true);
  }
  show(a, av, on) {
    if (a.ghost) on = false;
    if (av.on === on) return; av.on = on; av.root.visible = on; av.first = true;
    if (on) a.j.body.add(av.root); else if (av.root.parent) av.root.parent.remove(av.root);
    a.j.torso.visible = !on; a.j.legL.visible = !on; a.j.legR.visible = !on;
  }
  drop(a) { const av = this.live.get(a); if (!av) return; this.live.delete(a); if (a.j && a.j.torso) { a.j.torso.visible = true; a.j.legL.visible = true; a.j.legR.visible = true; } if (av.root.parent) av.root.parent.remove(av.root); VRMUtils.deepDispose(av.root); }
  // Copy the procedural pose onto the humanoid skeleton, then let the VRM update hair physics and the face.
  sync(a, av, dt) {
    const j = a.j, b = av.b, k = av.k, lL = j.legL.rotation.x, lR = j.legR.rotation.x, sit = a.state === 'sit';
    if (b.leftUpperLeg) b.leftUpperLeg.rotation.x = k * lL; if (b.rightUpperLeg) b.rightUpperLeg.rotation.x = k * lR;
    if (b.leftLowerLeg) b.leftLowerLeg.rotation.x = k * (sit ? 1.45 : Math.max(0, lL) * 0.95 + Math.max(0, -lL) * 0.15); if (b.rightLowerLeg) b.rightLowerLeg.rotation.x = k * (sit ? 1.45 : Math.max(0, lR) * 0.95 + Math.max(0, -lR) * 0.15);
    const aL = j.armL.rotation.x, aR = j.armR.rotation.x, zL = 1.3 - Math.max(0, j.armL.rotation.z - 0.12), zR = 1.3 - Math.max(0, -j.armR.rotation.z - 0.12);
    if (b.leftUpperArm) b.leftUpperArm.rotation.set(k * aL, 0, -k * zL); if (b.rightUpperArm) b.rightUpperArm.rotation.set(k * aR, 0, k * zR);
    const bend = (x) => 0.18 + Math.min(0.9, Math.abs(x) * 0.45);
    if (b.leftLowerArm) b.leftLowerArm.rotation.y = -k * bend(aL) * (zL > 0.6 ? 1 : 0.3); if (b.rightLowerArm) b.rightLowerArm.rotation.y = k * bend(aR) * (zR > 0.6 ? 1 : 0.3);
    if (b.spine) b.spine.rotation.x = k * j.torso.rotation.x * 0.6; if (b.chest) b.chest.rotation.x = k * j.torso.rotation.x * 0.4;
    if (b.head) { b.head.rotation.y = j.head.rotation.y; b.head.rotation.x = k * -j.torso.rotation.x * 0.5; }
    const em = av.em;
    if (em) {
      av.blink -= dt; let bl = 0; if (av.blink < 0) { bl = Math.sin(Math.min(1, -av.blink / 0.16) * Math.PI); if (av.blink < -0.16) av.blink = 1.5 + Math.random() * 4; }
      const asleep = a.state === 'sleep' || a.state === 'stun'; em.setValue('blink', asleep ? 1 : bl);
      em.setValue('aa', a.bubble && !asleep ? 0.25 + 0.35 * Math.abs(Math.sin(G.t * 11 + a.ph)) : 0);
      em.setValue('happy', a.state === 'cheer' || a.state === 'laugh' || a.state === 'dance' ? 1 : 0);
    }
    if (a.controlled !== av.live) { av.live = a.controlled; for (const o of av.frozen) o.matrixAutoUpdate = av.live; }      // hair bones only move for the character you play
    if (av.first) { av.first = false; av.vrm.update(0); if (av.vrm.springBoneManager) av.vrm.springBoneManager.reset(); }
    else if (a.controlled) av.vrm.update(Math.min(dt, 0.05));                       // full update incl. hair physics (about 1 ms)
    else { av.vrm.humanoid.update(); if (em) em.update(); }                         // everyone else: skeleton + face only (about 0.2 ms)
  }
}

export function init() {
  if (G.save.quality === 'low') return;          // Smooth mode keeps the light procedural characters
  G.avatars = new Avatars();
}
