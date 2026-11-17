# Pocket Town — build plan and handoff

Self-contained plan for whoever continues this build (human or model). Keep the **Status** section at the bottom up to date after every step.

## 1. What this is

A free-roaming 3D sandbox game in Three.js, played in the browser on localhost.
A kid and his gadget robot from the future live in a Japanese-style suburban town. The player walks, flies, drives, time-travels, plays baseball, uses 60+ gadgets, and can become any character at any time. No fail states, no forced order. "Do whatever you want."

**Hard rule — original cast only.** The user asked for a famous existing anime's characters. That was declined and the user accepted an original cast. Do **not** add that franchise's (or any franchise's) character names, character designs, gadget names, logos, music, or iconic set pieces (for example: no blue earless robot cat, no belly pocket, no head-propeller, no pink teleport door, no time machine in a desk drawer, no three concrete pipes in the empty lot). Genre ideas are fine: a helper robot with gadgets, a friend group, a rich kid, a strict teacher, a town, time travel.

**User's wishes, in priority order**
1. Very large world to explore, on land (not floating in clouds), with every place a kids' neighbourhood story needs: homes of every main character (walk-in), park, empty lot, school, shops, hill, riverside baseball ground, mansion with supercars, time machine, a future city, the past.
2. Very high care in detail ("every brick planned"). Reality check already given to the user: it is procedural and must run on Intel UHD, so the target is a carefully detailed stylised look, not photoreal.
3. Very smooth frame rate.
4. 50–100 gadgets that really do something.
5. Switch POV to anyone: kids, parents, robots, the dog.
6. A real baseball match with real rules and a scoreboard.
7. Drivable supercars.
8. Time travel.
9. A wish box: type anything, get it.
10. Episodes as freely selectable levels. Movie-length stories are "coming later" (show locked cards).

**Machine**: Windows 11, Intel UHD (no dGPU), 15.6 GB RAM, Node 24. Budget: under ~450 draw calls and ~500k triangles in view, one 1024 shadow map on Balanced.

## 2. Run and test

```
cd C:\Users\hp\Downloads\xyz\pocket-town
npm run dev          # Vite on http://127.0.0.1:5183 (strict port)
```
`.claude/launch.json` has a `pocket-town` config (`npm run dev`, port 5183) for the Claude preview pane.
`window.G` should be exposed in main.js for console debugging (teleport: `G.pc.teleport(x,z)`, era: `G.travel('future')`).
Syntax check without a browser: `npx vite build`.

## 3. Conventions

- Units are metres. Y is up. **+X east, +Z south.** A model's front is **+Z**; `yaw = atan2(dx, dz)`.
- Camera orbit: position = target + dist·(sin yaw·cos pitch, sin pitch, cos yaw·cos pitch). Forward on the ground = (−sin yaw, −cos yaw); right = (cos yaw, −sin yaw).
- Everything static is drawn through `Batch` (build.js): boxes/cylinders/spheres are collected per (material, 72 m chunk) and merged. Never add thousands of separate meshes.
- Materials are shared and use **vertex colours** for tint (`G.M.<key>`). Tiling textures carry `userData.m = [metres per repeat u, v]` and `Batch.box` scales UVs so bricks stay real-size. Material keys: wall brick plaster siding roof wood asphalt grass dirt sand concrete tatami floor leaf bark rock metal facade panel plain paint glow glass water fwin win door shoji vend.
- All textures are drawn on canvas in textures.js (no image files). `signTexture(text, opts)` for signs, `emojiTexture(ch)` for emoji props.
- Colliders are axis-aligned boxes `{x0,x1,z0,z1,y0,y1,tag,walk}` in a spatial hash (physics.js). Rotate buildings only by multiples of 90° so boxes stay valid. Step-up tolerance 0.42 m. Tag `'roof'` is ignored by the camera when inside a house.
- Deterministic RNG: `rng(seed)` from util.js. Do not use Math.random for world generation.

## 4. Architecture (files in `src/`)

| File | State | Exports / purpose |
|---|---|---|
| util.js | written | clamp, lerp, damp, smooth, angDiff, angDamp, rng, pick, rnd, Bus |
| physics.js | written | `Colliders`: add, remove, each, resolve(p,r,feet,head), groundAt, ceilingAt, inside(x,y,z,skipTag) |
| textures.js | written | makeTextures(), makeMaterials(T), signTexture, emojiTexture |
| build.js | written | prep, boxGeo, gableGeo, gableEndsGeo, hipGeo, mat4, `Batch` (push/pop, box, cyl, sph, ico, cone, quad, flat, solid, sbox, w, build), fuse |
| game.js | written | `G` hub, `FIELD` = {x:0, z:95, base:19, fence:52} |
| props.js | written | tree, bush, flowers, pot, bench, lamp, vending, parkedCar, rock, signAt, gy |
| town.js | written, untested | `H(x,z)` terrain height, `buildPresent(G)` → era object, ROADS_X, ROADS_Z |
| env.js | written, untested | `Env`: sky dome, sun/hemi, shadows (`setShadows(size)`), `setTime(h,speed)`, `setWeather('clear'|'rain'|'storm'|'snow'|'fog')`, `applyEra(era)`, `lightning()`, `night` 0..1 |
| actors.js | written, untested | buildHuman/buildRobot/buildQuad/buildModel, `Actor`, spawnActor |
| cast.js | written, untested | `CAST` definitions, spawnCast() |
| input.js | written | `Input`: down, hit, clicked, axis, unlock, endFrame, dx/dy/wheel, locked |
| player.js | written, untested | `Player`: control(actor), update(dt), camera(dt), aim(), scan/interact, history buffer, shake, camOverride |
| style.css + ../index.html | written | HUD, modal sheet, title screen (element ids listed in section 9) |
| ui.js | **todo** | `UI` class, see section 9 |
| main.js | **todo** | boot, loop, G.setEra, G.travel, quality, dynamic resolution, sfx |
| vehicles.js | **todo** | `Car` class, spawnCar |
| gadgets.js | **todo** | gadget catalogue + effects + props + wish parser |
| episodes.js | **todo** | episode definitions + runner |
| eras.js (or past.js, future.js) | **todo** | buildPast(G), buildFuture(G) |
| baseball.js | **todo** | field builder + match simulation |
| world/*.js | **todo** | the large-world districts (section 6) |

### G hub (game.js)
`scene camera renderer T M eras era actors cast vehicles props pc player input ui env gadgets baseball episodes t dt timeScale frozen mode started bus flags save`
`G.cur()` current era · `G.ground(x,z,feet,era)` walkable height · `G.toast(msg)` · `G.persist()/load()` (localStorage `pocket-town-save`).
To add in main.js: `G.setEra(key)` (show that era's group, hide others, `env.applyEra`), `G.travel(key)` (time-tunnel fade, move pc + followers + vehicle to `era.spawn`, emit `'era'`), `G.sfx(name)`.
`G.mode`: `'free' | 'baseball' | 'menu'`. `G.frozen > 0` = time stopped for NPCs. `G.flags`: xray, translate, etc.
Bus events used by episodes: `talk` (actor), `gadget` (id), `era` (key), `eat`, `enterCar`, `coin`, `baseballEnd` ({home, away, won}), `switch`, `interact`, `jump`.

### Era object contract
```
{ key, label, year, group (THREE.Group), colliders (Colliders), heightAt(x,z), waterAt(x,z) → surface y or -Infinity,
  pois: {name: Vector3}, nodes: [{x,z}] road graph for NPC wandering, nodeGap,
  interiors: [{x0,x1,z0,z1,y,top (Group to hide), owner}], interact: [{id,x,y,z,r,label,icon,fn,hidden}],
  spawn: {x,z,yaw}, fog: [color, near, far], skyTint, tod (hour), update(dt, G), bounds (half-size, default 340) }
```
Only the current era's `group` is visible. Each era has its own colliders and height function, so all eras can sit at the origin.

### Actor (actors.js)
Fields: `id name emoji era root pos vel yaw size sizeT speedMul jumpMul gravMul fly noclip ghost gills bouncy slippery glide onGround inWater controlled hidden state stateT move{x,z,run,jump,up,down} ai{mode,follow,slot,target,node,pause,wait} j (joints) height radius eye look lines fx mount rider pose`.
States: idle, sleep, stun, dance, laugh, sit, cheer, float, statue. `setState(s, seconds)`.
AI modes: wander (road nodes), follow, goto, idle, scripted (module drives it), player.
Methods: `setLook(look)`, `setGhost(on)`, `tint(hex)`, `say(text, secs)`, `nextLine()`, `teleport(x,z,y)`, `goTo(x,z,run,cb)`, `steer`, `face`, `dist(other)`, `update(dt)`.
Joints for humans: body, torso, head, armL, armR, legL, legR. Robots: body, armL, armR, ring. Quads: body, torso, head, legs[4], tail. A custom model may pass `look.make(look)` (note: `look.build` is the human body-width number) returning `{root, j, mat, kind, height, radius, eye, animate(actor,dt,speed,sw)}` (use this for dinosaurs and future robots).
`actor.pose = fn(actor, dt)` runs after the default animation (baseball swing/pitch poses).

## 5. Current world (central neighbourhood, "Hinode Town") — as coded in town.js

- Road grid: N–S roads at x = −105, −63, −21, 21, 63, 105; E–W roads at z = −105, −63, −21, 21, 59. Roads 7 m wide. Road nodes = all intersections.
- Blocks: columns centred x = −84, −42, 0, 42, 84 (35 m wide); rows z = [−101.5,−66.5], [−59.5,−24.5], [−17.5,17.5], [24.5,55.5]. Block key = "col,row".
  - `2,2` centre block: Kenta's home is the SE lot (front gate on z = 21 road). Time Pod stands in its side yard (`pois.timePod`).
  - `3,2` Hinode Park (slide, swings, sandbox, jungle gym, pond, clock tower, cherry trees).
  - `2,1` Hinode Elementary School. `3,1` shop row (Sunny Bakery, Candy Corner, Book Nook, Toy Box, Noodle Bar) + Goro's home behind it.
  - `4,0` Riku's mansion (fountain, pool, 4-slot carport → `era.garage` = car spawn slots).
  - `1,2` north half = the empty lot (crates, lumber, tyres, oak). `3,3` NW lot = Mira's home. `1,1` SW lot = Sora's home.
  - All other lots: random two-storey houses with block walls / hedges / fences, gardens, bikes.
- Walk-in homes (Kenta, Mira, Goro, Sora, Riku): ground floor has real walls, family room, kitchen, bedroom with a signature item; the upper floor + roof is a separate group hidden while the player is inside (`era.interiors`).
- Terrain `H(x,z)`: flat town at y = 0; levee z 64→88 (4 m high, flat top 72–80, path at z = 76); riverside flat z 88–152; river bed z 152–208 (−2.4), water surface −0.55; bridge at x = 105 (deck top y = 0.3, z 147–213); Lookout Hill centred (−196, −30), radius 76, 26 m high with torii, shrine and a giant tree; low hills beyond.
- POIs: kentaHome, kentaRoom, miraHome, goroHome, soraHome, rikuHome, mansion, park, parkGate, school, schoolGate, shops, lot, levee, riverside, field, bridge, hill, timePod.
- Ballpark: home plate at FIELD (0, 95), centre field toward +Z, bases 19 m, fence radius 52 m. **Field visuals are not built yet** — baseball.js must build them.

## 6. The large world (to build after the core runs)

The user wants it "very very large". Target ≈ 2 km × 2 km of walkable land around the current town. Do it as districts, each one function in `src/world/<name>.js` taking `(b, era, R)` and adding its own POIs, road nodes and colliders.

Required engine changes first:
1. Terrain as 64 m tiles (4 m grid near, coarser beyond 400 m) instead of one 704 m plane; extend `H(x,z)`.
2. `era.bounds` instead of the hard ±340 clamp in `Actor.physics`.
3. Fog far ≈ 600 m so distant tiles can be skipped; chunk size stays 72 m for culling.
4. Arterial roads (10 m wide, centre line) forming a ~4 km ring for the supercars, joined to the existing grid at x = ±105 and z = −105 / the bridge.

Districts (all original designs):
- **North — Station quarter**: elevated rail line E–W with a train that runs on a loop and stops at Hinode Station (rideable: board with E, sit, get off at Seaside Station); covered shopping arcade (20 shop fronts with signs, awnings, lanterns); 4–8 storey buildings using the `facade` material; bus stop, bicycle parking, a small cinema, a bathhouse with a tall chimney.
- **East — Fields and the junior high**: rice paddies (water quads with rows of seedlings), farmhouses, greenhouses, a tractor, a long straight farm road, a sports ground with a running track and football goals.
- **West — Lookout Hill → forest → Mount Hinode**: hiking trail with wooden steps and signposts, campsite, waterfall and stream feeding the river, a cave, the summit viewpoint (≈120 m high) with coin binoculars.
- **South — across the bridge**: Kawamukai neighbourhood (another 12 blocks, different roof palette), a lake with rowing boats, then the coast: beach, pier, lighthouse, fishing boats; the sea is a big water plane, swimmable.
- **South-east — Hinode Land**: a small amusement park (ferris wheel that turns and can be ridden, carousel, roller-coaster track as scenery, stalls).
- Scatter: vending machines, shrines, bus shelters, cats, crows, laundry, potted plants — small things on every street. Every street should have something to look at.

Detail rules: every wall gets a cap, every window a sill, every roof a ridge; vary palettes per lot; no bare boxes at eye level.

## 7. Cast (cast.js) — all original

| id | Name | Who | Look |
|---|---|---|---|
| kenta | Kenta | hero kid, daydreamer | spiky brown hair, green top with white stripe, navy shorts, red shoes |
| tiko | Tiko | helper robot from 2226, carries the Gadget Pocket (a backpack hatch) | white egg-shaped hover robot, teal trim, dark visor with cyan eyes, orange antenna ball |
| mira | Mira | kind friend, stargazer | brown twin-tails, lilac top, purple skirt |
| goro | Goro | big loud baseball captain, drummer | buzz cut, orange top, broad build |
| riku | Riku | rich kid, supercars | side-parted hair, sky-blue shirt, red tie |
| sora | Sora | top student | glasses, white shirt, navy jacket |
| piko | Piko | Tiko's little sister robot | cream/coral, bow antenna |
| mom, dad | Kenta's parents | | bun + apron / glasses + tie |
| miraMom, goroMom (Baker Hanae), rikuDad (Mr. Kaneda), teacher (Mr. Ishida), granny (Granny Ume), officer (Officer Daichi) | townsfolk | |
| hana, taro, jun | other kids (baseball team) | |
| maru | Goro's shiba dog | | kuro | stray black cat |

Tiko follows whoever the player controls. Tab opens the character picker; `player.control(actor)` switches POV. Animals' lines become words when `G.flags.translate` is on.
Home baseball team "Hinode Comets": kenta, mira, goro, riku, sora, hana, taro, jun, tiko. Away team "East Town Rockets": nine generated kids with matching caps.

## 8. Controls

WASD move · mouse look (click canvas to lock; drag or arrow keys also turn the camera) · Shift run · Space jump / fly up · C fly down · E talk / use / get in or out of a car · F get in a car, hop off a ride · Q Gadget Pocket · 1–9 hotbar slot · click (captured or not), R, or clicking the selected slot = use gadget · right click or G alternate mode · Tab switch character · V first/third person · T wish box · P episodes · M map · H help · Esc menu · wheel zoom · F3 FPS + trim level.
In a car: W/S throttle, A/D steer, Space brake (hover cars: Space up, C down), H horn.

## 9. UI (ui.js, to write) — element ids already in index.html

`#hud` (chip: #chipEmoji #chipName #chipEra; #coins #clock #fps; #objective #objTitle #objText; #effects; #toasts; #prompt; #dialogue #dlgName #dlgText; #hotbar; #speedo) · `#layer` (free container for module HUDs such as the baseball scoreboard) · `#banner` (#banTitle #banSub) · `#modal` (#mTitle #mSearch #mClose #mSub #mBody) · `#fade` (classes `on`, `spin` = time tunnel) · `#title` (#loadMsg #startBtn #quality).

`UI` API expected by other modules:
`modal` (name or null) · `toast(msg, ms)` · `prompt([[key,label],…] | null)` · `dialogue(actor, text)` · `refresh()` · `objective(title, text | null)` · `banner(title, sub)` · `fade(midFn, spin)` · `choose(title, sub, items[{icon,label,sub,badge,locked,done,cat,fn}], {search})` generic card-grid modal used for pocket, cast, time, warp, episodes, food, disguise · `openWish()` · `openHelp()` · `close()` · `effects([{label, t}])` · `speed(kmh | null)` · `hotbar()`.
Opening a modal releases pointer lock and blocks game input (`G.ui.modal` truthy). Style: solid rounded panels, thick ink borders, no blur/glass.

## 10. Gadgets (gadgets.js, to write) — 64, all with original names

Each: `{id, name, icon, cat, desc, use(ctx), alt?(ctx), needsTarget?}`; `ctx = {pc, target (actor under crosshair), point (ground point), G}`. Timed effects show in `#effects`. Emit `G.bus.emit('gadget', id)`.

Move: `beanie` Breeze Beanie (toggle fly) · `cloudboard` Cloud Board (fast flight, board under feet) · `sneakers` Rocket Sneakers (speed ×3, 20 s) · `moonboots` Moon Boots (low gravity, high jump, 25 s) · `spring` Spring Soles (bouncy) · `straw` Rocket Straw (launch 60 m up) · `leaf` Parachute Leaf (toggle slow fall) · `sling` Giant Slingshot (fling where you look) · `mole` Mole Mitts (tunnel 30 m ahead) · `gill` Gill Candy (walk under water, 60 s) · `ice` Ice Rink Spray (slippery, 20 s).
Body: `size` Size Lantern (click = shrink ×0.5, alt = grow ×2, on target or self; range 0.1–12) · `cloak` Ghost Cloak (invisible, NPCs ignore) · `wallring` Wall-Pass Ring (noclip 15 s) · `balloon` Balloon Gum (float up 8 s then pop) · `baby` Age Wrap (target: small body, big head) · `disguise` Disguise Hat (pick a character, wear their look) · `mirror` Copy Mirror (spawn a clone that follows you) · `swap` Swap Baton (become the targeted character) · `statue` Statue Spray (freeze target 10 s, grey) · `antigrav` Float Paint (target floats 8 s) · `bubble` Bubble Shield (knocks things back).
Travel/time: `hoop` Warp Hoop (choose a place, a ring portal appears, walk through) · `timepod` Time Pod + Chrono Screen (travel to an era, or "peek": 6 s camera fly-over) · `rewind` Rewind Watch (back 10 s) · `stopclock` Freeze Clock (NPCs frozen 10 s) · `dial` Day-Night Dial · `hourglass` Fast-Forward Hourglass (time-lapse a day) · `whistle` Homing Whistle (teleport home) · `pin` Bookmark Pin (set / return).
World: `weather` Weather Box (cycle clear → rain → snow → fog → storm) · `thunder` Thunder Drum (lightning at aim point) · `quake` Stomp Boots (shake, nearby NPCs fall) · `fan` Gale Fan (blow NPCs and props away) · `seeds` Instant Seeds (tree grows at aim point) · `flowers` Flower Wand · `rainbow` Rainbow Brush (arc in the sky) · `fireworks` Firework Pencil · `snowman` Snowman Maker · `cloud` Cloud Kneader (walkable cloud platform) · `bridge` Light Bridge (30 m walkable beam) · `tramp` Trampoline Pad · `house` Capsule Cottage (pop-up house with collider) · `vacuum` Tidy Vacuum (remove everything spawned) · `minisun` Pocket Sun (light that follows you).
People: `megaphone` Mega Megaphone (startle + knockback) · `flute` Sleepy Flute · `laugh` Giggle Powder · `dance` Dance Disc · `truth` Truth Bubble (target says a secret) · `badge` Friendship Badge (target follows you) · `bell` Friend Bell (pick someone, they appear) · `horn` Party Horn (everyone comes) · `translator` Translator Jelly (animals talk) · `tracker` Finder Compass (beam points to a chosen character) · `xray` X-Ray Specs (roofs off, name tags through walls) · `paint` Paint Popper (recolour target).
Things: `feast` Feast Mat (pick or type a food, it appears, E to eat) · `wishstar` Wishing Star (opens the wish box) · `carcap` Car Capsule (spawn a supercar) · `ball` Kick Ball · `robo` Robo-Buddies (three mini robots march behind you) · `magnet` Magnet Glove (pull loose props) · `coins` Lucky Coin Tree (coins rain, collect them) · `biscuit` Dino Biscuit (target animal/dino becomes friendly and rideable) · `camera` Snapshot Camera (save a PNG) · `confetti` Confetti Popper.

Loose props: `G.props` items `{mesh, pos, vel, era, r, label, use(prop, pc), life}` with gravity, bounce, ground collision; emoji billboards via `emojiTexture`.

## 11. Wish box (in gadgets.js)

T opens a text input. A keyword table maps the wish to an action: car/supercar → spawn car · fly → fly on · rain/snow/sunny/storm/fog/night/day → env · big/giant/small/tiny/normal → size · any of ~150 food and object words → emoji prop · dog/cat/dinosaur → summon or spawn · friends/everyone → all come · place names → teleport · future/past/present → time travel · coins/money · fireworks · ball · house · tree · "be <name>" → switch POV · any gadget name → use it. Unknown wish → a gift box that opens into a floating label with the wish text, so something always appears.

## 12. Eras (to write)

- `past` "Dino Valley, 100 million years ago": rolling terrain, volcano with smoke, lake, giant ferns and trees, 8+ dinosaurs as Actors with custom models (long-neck, three-horn, rex that roars and bumps you, flying ones circling), a nest with 3 collectable eggs, a return Time Pod. Warm sky tint.
- `future` "Neo Hinode, 2226": plaza with a return pod, glass towers (`fwin` material, glowing at night), sky lanes with flying cars (instanced, animated), moving walkways, holo signs, hover platforms, robot citizens (custom robot looks), the Gadget Depot where Piko works, hover cars to drive (`Car` with `hover:true`), five sky rings to fly through. Cool sky tint, tod 19 by default.
- Travelling moves the controlled actor, anyone in follow mode, and the current vehicle. Everyone else stays in their era.

## 13. Baseball (baseball.js, to write)

Field: built in the present era at FIELD. Local frame: origin home plate, +Z to centre field, first base at (−d/√2, d/√2) (to the right when facing centre field), third base at (+d/√2, d/√2), d = 19; mound at 13 m; fence arc radius 52; foul lines at ±45°. Build dirt infield, chalk lines, bases, backstop, benches, foul poles, fence, and a scoreboard whose canvas texture shows the line score live.

Start: talk to Goro at the field or press B there → choose 3 / 6 / 9 innings. Cast kids are put in `scripted` mode and restored afterwards.

Rules to implement: 9-a-side; top = Rockets bat (player pitches), bottom = Comets bat (player bats); 3 strikes out, 4 balls walk, fouls count as strikes up to two; fair/foul by where the ball first lands; fly caught = out; ground balls fielded and thrown to the forced base, out if the ball beats the runner; double plays; runners advance base to base and take extra bases while the ball is in the outfield; tag-up from third on deep flies; home runs over the fence; 3 outs per half; skip the bottom of the last inning if home leads; extra innings if tied; R/H/E line score.
Batting: aim a reticle in the strike zone (mouse or WASD), Space or click to swing; timing error sets pull/opposite direction, reticle distance sets contact quality → exit speed, launch angle, spray angle; ball flight is simulated (gravity, drag, bounce).
Pitching: 1–4 choose fastball / curve / slider / change-up, move the target, Space to throw; AI batter decides to swing from location, count and skill.
Fielding and running are automatic AI. Cameras: behind the batter, behind the pitcher, ball-follow on contact (`player.camOverride`). HUD in `#layer`: inning, outs, count, base diamond, score. End → `G.bus.emit('baseballEnd', {home, away, won})`.

## 14. Vehicles (vehicles.js, to write)

`Car {name, color, era, pos, yaw, speed, hover, driver}`; `enter(actor)`, `exit()`, `drive(input, dt)`, `update(dt)`. Arcade physics: accelerate to ~190 km/h, speed-dependent steering, brake, reverse; two collision circles against `Colliders`; follows ground height with pitch; can jump off the levee; NPCs hit above walking speed are knocked over harmlessly and complain. Low-poly supercar body from an extruded side profile + dark glasshouse + 4 wheels that spin + spoiler + glowing lights. Four cars spawn at `era.garage`. Chase camera. Speedometer in `#speedo`. Hover cars in the future use Space/C for altitude.

## 15. Episodes (episodes.js, to write)

Playable in any order from P. Each = title, blurb, steps `{text, check(G) | event, marker poi}`; current step shows in `#objective` with a light-beam marker in the world; completion saved in `G.save.done`.
1. **Tiko's First Day** — meet Tiko, open the pocket, fly to the park, greet three friends.
2. **The Runaway Pup** — Maru is missing: Finder Compass → find him on Lookout Hill → Friendship Badge → bring him to Goro.
3. **The Big Game** — play a full match at the riverside (star for a win).
4. **Eggs-pedition** — Time Pod to Dino Valley, return three eggs to the nest, befriend and ride a long-neck, come home.
5. **Field Trip to Tomorrow** — visit 2226, find Piko at the Gadget Depot, fly a hover car through five sky rings.
6. **Riku's Supercar Dare** — six checkpoints around town in 90 seconds.
7. **The Rainy Picnic** — clear the rain with the Weather Box, lay out a Feast Mat at the park, call everyone with the Party Horn.
8. **Tiny Trouble** — shrink, find Mira's lost ring under her table, return to normal size, give it back.
Plus three locked "Movie — coming later" cards.

## 16. Performance plan

- Quality presets: low (pixel ratio 0.75, no shadows), med (1.0, 1024 shadows), high (1.5, 2048 shadows, antialias). Stored in `G.save.quality`; changing antialias needs a reload.
- Dynamic resolution: if average FPS < 40 for 3 s lower pixel ratio in 0.1 steps to 0.6; raise again above 58.
- Lambert materials only, one directional shadow light following the player, fog, merged static geometry, per-actor 6–7 draw calls, name tags only within 11 m.
- Only the current era is visible. Baseball extras exist only during a match.

## 17. Visual quality bar (added after user feedback — this is now the top priority)

The user rated the first flat-shaded version 0.5/10 against the reference video (a near-photoreal temple world: PBR materials, soft shadows, sun-lit volumetric clouds, hand-modelled ornament). Looks matter more to them than feature count. Do not ship boxes with pictures stuck on them.

Done in visual pass 1
- textures.js: every tiling surface is painted as colour + height; the height becomes a normal map (`T.<name>N`). `makeMaterials(T, pbr)` builds `MeshStandardMaterial` (Balanced/Pretty) or Lambert (Smooth). New key `frame` (metal window frames).
- main.js: ACES filmic tone mapping (exposure 0.92), PCF soft shadows, 2048 shadow map on Balanced, 4096 on Pretty. Changing quality reloads the page.
- env.js: sky shader with an fbm cloud layer lit from the sun direction; the sky is baked with PMREM into `scene.environment` (ambient + reflections) and re-baked when time/weather changes. Default time 15:40 for long shadows.
- town.js houses: modelled window units (frame, mullion, sill, shutter box), stepped tile courses, verge tiles, round ridge, gutters, skirting, corner boards, framed recessed door with bracketed porch roof.
- Characters use MeshStandardMaterial.

Still to do, in order of visual payoff
1. **Trees and plants**: replace icosphere blobs with alpha-tested leaf-card clusters (instanced), trunk + branches; hedges with leaf cards on the surface; flowers as cards.
2. **Grass**: instanced blades near the camera with wind sway in the vertex shader, masked off roads/floors by a top-down mask texture.
3. **Characters**: the procedural primitives read as toys. Either (a) much smoother bespoke meshes (lathe/extrude bodies, modelled hands, real faces with eyelids/mouth shapes, hair shells) or (b) rigged glTF models — (b) needs the user's permission to download free CC0 assets; ask before downloading anything.
4. Ground contact: darkened wall bases, kerbs/gutters along roads, drain grates, moss/dirt decals, puddles (low-roughness patches) after rain.
5. Interiors: modelled furniture edges, ceiling lights, wall trim, shoji that actually slide.
6. Post: subtle bloom + vignette on Pretty only (EffectComposer); skip SSAO on Intel UHD.
7. Apply the same pass to shops, school, mansion, park equipment (rounded tubes, chain swings), bridge, vehicles (wheel arches, mirrors, interior).
Check frame rate after each item with F3 on Balanced; the dynamic resolution scaler will hide small costs but not large ones.

## 18. Status — keep this current

Done and seen working in the browser
- [x] Scaffold, core engine, PBR textures/materials, filmic sky + lighting (section 17 pass 1)
- [x] town.js central neighbourhood with five walk-in homes
- [x] gadgets.js — 67 gadgets + wish box (smoke-tested, no errors)
- [x] vehicles.js — four supercars at the mansion, hover cars in the future (not yet play-tested with real key input)
- [x] eras.js — `past` (Dino Valley: 11 dinosaur actors, rideable long-necks/three-horns, predator, nest, `eggSpots`) and `future` (Neo Hinode: towers, plaza, canal, Gadget Depot, 4 hover cars in `garage`, 5 `rings`, 20 citizens). Time travel verified both ways; Tiko follows.
- [x] baseball.js — field at the riverside + full match. A 3-inning match was simulated to the end in the real game: scores advance, everything is restored afterwards. Rules left out: steals, bunts, hit-by-pitch, dropped third strike, infield fly, balks, caught foul flies.
- [x] avatars.js — rigged CC0 VRoid avatars for every human cast member, future citizens and the away team. Loaded lazily for the 6 nearest humans (8 on Pretty), procedural bodies beyond that and on Smooth. Skeleton is driven from the procedural joints (walk, arms, knees, spine, head), plus blinking, talking mouth, happy face. Hair pieces are merged per material (65–130 primitives → ~18 draw calls), outlines dropped, textures capped at 512 px (faces 1024).
- [x] Trees and bushes rebuilt from alpha-cut leaf cards (`leafCards` in props.js, material key `leafcard`).
- [x] main.js loads optional modules with dynamic import; a module that fails to load or start is logged and skipped.

- [x] Photo-scanned surface textures (Poly Haven, CC0) in `public/textures/<key>_{diff,nor,arm}.jpg`, 1k, 24 MB: asphalt (asphalt_02), wall (concrete_block_wall), brick (red_brick), plaster (painted_plaster_wall), roof (grey_roof_tiles_02), wood (weathered_brown_planks), siding (weathered_plank_siding), concrete (concrete_pavement), floor (wood_floor), bark (bark_brown_02), rock (rock_05), dirt (dirt_floor). `loadPhotos()` in textures.js swaps each scan over its painted placeholder when loaded and sets the real tile size (`PHOTO` table); `NEUTRAL` lists the ones converted to light greyscale so vertex tint gives the colour (plaster, roof, siding, wall, concrete). The ARM map drives roughness + AO. Smooth mode skips the scans. Grass, sand, tatami, facade, metal, leaf and water are still painted — Poly Haven has no clean green lawn.

- [x] grass.js — real grass: alpha-cut tufts in 8 m patches within ~34 m of the player (44 m on Pretty), wind sway and distance fade in the vertex shader (`onBeforeCompile` on `M.grasscard`, attribute `lift`). A 2048 px top-down mask of each era is rendered once (`buildMask`): everything that is not the lawn material, leaves or glass is black, so grass stays off roads, floors, paving, dirt and water with no hand-painted list. Works in any era whose terrain uses `M.grass` (present, past). Costs roughly 50–70k triangles. Skipped on Smooth.
- [x] Street gutters with drain grates along every road edge; hedges get leaf cards on their surface; CSS vignette (`#vignette`).

- [x] episodes.js — runner + all eight episodes of section 15, opened with P; objective panel, light-beam marker with distance, +50 coins and a Done badge on first completion, three locked movie cards. Each episode was run to completion by script (real interact path for eggs and the ring; events for the rest). Story objects go through `Runner.item()` (mesh + optional `era.interact` entry) and cast members are parked with `Runner.borrow()` and restored afterwards.

- [x] School and shop row brought up to the houses' level: `winUnit()` in town.js is now shared by every building. School = bays with pilasters, 70 modelled windows, floor bands, base course, parapet, penthouse with clock, water tank, AC units, glass entrance with canopy and shoe lockers. Shops = open fronts you can walk into (colliders split so the front 2.3 m is hollow), stocked shelves, counters with tills, brick piers, awnings with valance and arms, parapet roofs; the Noodle Bar has stools and a split curtain.

- [x] Performance pass (the user reported the game was slow). Measured on the user's GPU (Intel UHD, ANGLE/D3D11) with a synchronous benchmark run from the preview pane: `for N frames { G.step(1); renderer.render(scene, camera); gl.readPixels(1 px) }` at 1600x900. Findings: the game is **not** limited by pixel count (1600x900 and 960x540 cost the same), so lowering resolution does not help; costs are CPU-side scene work, skinned character models, the shadow pass and vertex count. Same-session A/B: old behaviour 27.5 ms (36 fps) -> new 20 ms (50 fps) with four character models on screen, 24.5 ms (41 fps) with six. Each full character model costs roughly 2 ms. What changed:
  - Avatars: hair physics (spring bones, 1.35 ms each) only for the character you control; everyone else gets `humanoid.update()` + expressions only. ~150 of an avatar's ~200 nodes have `matrixAutoUpdate = false` unless you control it. Hidden avatars are detached from the scene graph. Textures are resized with `createImageBitmap` (off the main thread). Model files are prefetched in the background. People in front of the camera get the full model before people behind it.
  - Scene graph: era groups and actors that are in another era, hidden, or >240 m away are removed from `G.scene` (not just made invisible) — three.js still walks invisible objects every frame. Static meshes inside procedural actors have `matrixAutoUpdate = false`. `scene.updateMatrixWorld` went from 3.7 ms to 1.2 ms.
  - Shadows: `shadowMap.autoUpdate = false`; the map is redrawn when its window moves, when the sun moves, or every `G.perf.shadowEvery` frames.
  - Detail LOD: `Batch.detail(true)` / `b.det` marks fine geometry (window frames, sills, shutters, shelf goods, flowers, pots, hedge cards, drain grates). It goes into its own 36 m chunks, never casts shadows, and main.js hides it beyond `G.perf.detail` metres (list cached in `era._detail`).
  - Trees: crown cores are 20-triangle icosahedra; backdrop trees (`solid = false`) use half the leaf cards, no branches. Leaf cards and grass do not cast shadows. Cloud shader uses fewer noise octaves.
  - Governor (`G.perf`, `G.setPerf(level)`, table `PERF` in main.js): if FPS stays under 40 for 3 s it steps down one trim level (fewer shadow redraws, shorter detail distance, fewer full avatars, smaller grass radius); above 57 for 12 s it steps back up. F3 shows the trim level. Resolution is only reduced after the last trim level.
  - Still unmeasured in real play: the benchmark includes a forced GPU sync and excludes browser compositing, so the user's real number can differ. Ask for the F3 reading.

- [x] User report "can't get in cars, can't use gadgets" — reproduced with real DOM key/mouse events and fixed:
  - Gadgets: clicks only fired while the pointer was captured. input.js now records a `tap` (click without drag, < 7 px) and main.js fires the slot on `I.locked ? clicked : tapped`. Clicking the already-selected hotbar slot also uses it. The held aiming gadget shows its key in the prompt. Gadgets no longer silently refuse when the player is mid-animation (only statue/sleep/stun block, with a toast).
  - Cars: E now gets in and out (car is a `scan()` candidate of type 'car'; F still works). The mansion's south wall has a driveway opening in front of the carport (`wallSeg` pieces in `mansion()`), and the telephone pole in front of it moved. The scenery street cars are now seven drivable compact cars (`era.parked`, `Car` with `kind: 'kei'`). A parked car is a walkable collider box (`Car.park()/unpark()`), removed while driven.
- [x] map.js — each era is rendered once from straight above into a 1024 px canvas (`shoot()`: orthographic render, linear->sRGB, rows flipped so north is up). Rotating minimap (top-right, 176 px, camera-forward up) with places, cast, dinosaurs, cars, the episode goal and your map marker clamped to the rim. M opens the full map: wheel zoom, drag pan, click = marker (blue beam in the world, auto-clears on arrival), double-click or side list = jump. `G.map.setWaypoint/clearWaypoint/places/invalidate`. HUD stats moved left of the minimap; objective panel below it.
- [x] Gadgets now 82. New (all original names and looks): Elsewhere Door (teal wooden door pair; opens as you approach, step through; to any place, friend or your map marker; 5 min), Critter Cracker (become a dog, cat or little dinosaur), Hawk-Eye Drone (20 s aerial follow camera via `camOverride`), Slow-Mo Watch (`G.slowmo`, others at 25%), Air Blaster Ring, Raincloud Pal, Mighty Mitts (fling people, shove parked cars), Shadow Scissors (dark wandering copy), Cloud Staircase (46 walkable steps, 17 m), Treasure Map (random chest + map marker, 25-40 coins), Fortune Cookie, Dream Viewer, Float Bomb, Bird Whistle (instanced flock), Campfire Kit (flames + additive glow, no real light). The Breeze Beanie became the Propeller Cap with a visible spinning cap. Wish box understands all of them. Default hotbar reset once (`save.hbv = 2`).
  - IP rule still holds: the user asked for a famous anime's gadgets by name. Functions are fine; names and iconic looks are not. No pink door, no bamboo propeller without a hat, no franchise names.

Casting (cast.js `look.avatar = { file, hair?, cloth?, wide? }`; hair/cloth are multiply tints)
- Only two of the nine files are male: `Sakurada_Fumiriya` (blond boy, vest + tie) and `HairSample_Male` (black hair, hoodie). All boys and men use those two with tints. Girls/women: Sendagaya_Shino (Mira), Sendagaya_Shibu (Mom), Vivi (Baker Hanae), Victoria_Rubin (Mira's mom), HairSample_Female (Hana), Vita (Granny). Darkness_Shibu is used only for future citizens.
- Tiko, Piko, the dog, the cat and the dinosaurs are procedural.

Not done / next, in order
- [ ] Get the user's real F3 reading after the performance pass. If still low: the next levers are fewer full avatars at trim 0, a 1024 shadow map, and merging each avatar's ~15 skinned meshes into fewer draws (needs a texture atlas).
- [ ] Play-test with real input: driving, flying, camera indoors, pointer lock, batting/pitching feel.
- [ ] Visual pass 2 remainder (section 17): ground-contact darkening at wall bases, interiors, bloom on Pretty, night street lights; bring the mansion, park equipment and the bridge up to the houses' level of modelled detail; things gadgets build later (cottages) are not in the grass mask.
- [ ] Baseball: the bat is positioned from the procedural hand, so it may not sit exactly in the avatar's hand.
- [ ] Large-world districts (section 6) — not started.
- [ ] Night lighting: street lamps as real lights near the player.

Notes
- `G.floor(x,z,era)` = ground level ignoring roofs; `G.ground(x,z,feet,era)` = surface under something at height `feet`.
- Custom actor model hook is `look.make(look)`. Actors in `ai.mode === 'scripted'` keep whatever `move` another module sets. `actor.thrown` (seconds) lets a knock-back persist.
- `G.step(n)` runs n simulation frames without rendering — use it to test in a hidden tab.
- Models: `public/models/*.vrm` (nine VRoid Studio samples, CC0 per their metadata; source github.com/madjin/vrm-samples, folder vroid/beta). Do not use AvatarSample_A/B/C. The user approved downloading character/tree models and photo-scanned textures. Ask before downloading anything else.
- Loading more than a few avatars at the same instant crashes the tab; `Avatars` loads one at a time on purpose.
- The .vrm files' embedded textures were downscaled to 1024 px (opaque ones re-encoded as JPEG) to cut the download from 149 MB to 56 MB for the web build; geometry, skeleton and VRM extension data are untouched. The originals are in the source repo above.
- Hosting: GitHub `chay1504/doremon-game`, deployed by the user with Vercel (`vercel.json`: Vite build to `dist`, long cache on /models and /textures).
