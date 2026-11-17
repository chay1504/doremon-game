// The shared hub. Every module imports G and talks through it.
//
//   G.scene / G.camera / G.renderer   three.js basics
//   G.T / G.M                         textures / material registry (see textures.js)
//   G.eras[key]                       { key,label,group,colliders,heightAt(x,z),waterAt(x,z),pois,nodes,interiors,interact[],spawn,update(dt) }
//   G.era                             key of the era currently shown ('present' | 'past' | 'future')
//   G.actors / G.cast[id]             all Actor instances / the named cast
//   G.pc                              the Actor the player is controlling right now
//   G.vehicles / G.props              drivable cars / loose physics props
//   G.bus                             event bus: 'talk','gadget','era','eat','enterCar','coin','baseballEnd','switch', ...
//   G.mode                            'free' | 'baseball' | 'menu'
import { Bus } from './util.js';

export const G = {
  scene: null, camera: null, renderer: null, T: null, M: null,
  eras: {}, era: 'present',
  actors: [], cast: {}, vehicles: [], props: [],
  pc: null, player: null, input: null, ui: null, env: null, gadgets: null, baseball: null, episodes: null,
  t: 0, dt: 0, timeScale: 1, frozen: 0, mode: 'free', started: false,
  bus: new Bus(), flags: {},
  save: { coins: 0, done: {}, hotbar: [], quality: 'med' },
  cur() { return this.eras[this.era]; },
  // Height of the walkable surface under (x,z) for something whose feet are at `feet`.
  ground(x, z, feet = 1e9, era = this.era) { const e = this.eras[era]; return Math.max(e.heightAt(x, z), e.colliders.groundAt(x, z, feet)); },
  // Ground-level floor at (x,z): ignores roofs and canopies overhead (use for spawning / teleporting).
  floor(x, z, era = this.era) { const h = this.eras[era].heightAt(x, z); return this.ground(x, z, h + 0.6, era); },
  toast(msg, ms) { this.ui && this.ui.toast(msg, ms); },
  persist() { try { localStorage.setItem('pocket-town-save', JSON.stringify(this.save)); } catch (e) { /* private mode */ } },
  load() { try { const s = JSON.parse(localStorage.getItem('pocket-town-save') || 'null'); if (s) Object.assign(this.save, s); } catch (e) { /* ignore */ } },
};

// Ballpark placement shared by the town builder and the baseball module.
// Home plate sits at (x,z); centre field is toward +Z (the river).
export const FIELD = { x: 0, z: 95, base: 19, fence: 52 };
