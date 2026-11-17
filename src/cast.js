// The people (and robots, and pets) of Hinode Town. All original characters.
import { G } from './game.js';
import { spawnActor } from './actors.js';
import { pick } from './util.js';

const animal = (plain, translated) => () => (G.flags.translate ? pick(translated) : pick(plain));

export const CAST = [
  { id: 'kenta', name: 'Kenta', emoji: '🧒', role: 'A daydreamer with a good heart. Lives with Tiko.', home: 'kentaHome', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male', cloth: 0x86d08f }, h: 1.3, hair: 0x3a2a1c, hairStyle: 'spiky', top: 0x4caf50, stripe: 0xffffff, bottom: 0x2c3e66, shoes: 0xd9443f },
    lines: ['Tiko says the pocket has a gadget for everything. Even homework? …Asking for a friend.', 'Let\'s go fly over the river!', 'I wonder what the town looks like two hundred years from now.', 'Baseball at the riverside later? I\'ll bring… enthusiasm.'] },
  { id: 'tiko', name: 'Tiko', emoji: '🤖', role: 'Helper robot from the year 2226. Carries the Gadget Pocket.', home: 'kentaHome', ai: 'follow',
    look: { type: 'robot', h: 0.98, body: 0xffffff, accent: 0x2fb7a8, eye: 0x7ff6ff, ball: 0xff8a3d }, walk: 2.6, run: 6.2,
    lines: ['Bee-boop! Press Q to open my Gadget Pocket.', 'My sensors say there are sweet buns at the Sunny Bakery. Purely scientific interest.', 'The Time Pod is charged. Past or future — your call!', 'Careful with the Size Lantern. Last time Kenta shrank the bath.'] },
  { id: 'mira', name: 'Mira', emoji: '👧', role: 'Kind, sharp, and the best stargazer in town.', home: 'miraHome', ai: 'wander',
    look: { avatar: { file: 'Sendagaya_Shino' }, h: 1.28, hair: 0x5a3825, hairStyle: 'twintails', ribbon: 0xf26d8f, top: 0xc4a6ee, collar: 0xffffff, bottom: 0x6a4fb5, skirt: true, shoes: 0xffffff, socks: 0xffffff },
    lines: ['I spotted Jupiter through my telescope last night!', 'Oh, hi! Want to have a picnic at the park?', 'Please tell Tiko not to shrink my violin… I mean telescope. Again.', 'The cherry trees on the levee are so pretty today.'] },
  { id: 'goro', name: 'Goro', emoji: '💪', role: 'Captain of the Hinode Comets. Loud, loyal, loves drums.', home: 'goroHome', ai: 'wander',
    look: { avatar: { file: 'Sakurada_Fumiriya', wide: 1.25, hair: 0x6a4a32, cloth: 0xf2a25a }, h: 1.46, build: 1.38, hair: 0x1c1c1e, hairStyle: 'buzz', top: 0xf08a2c, stripe: 0x7a3b12, bottom: 0x5b4636, shoes: 0x2c2c34, brow: 0.22, mouthW: 1.7 }, walk: 2.1, run: 5.2,
    lines: ['Oi! Riverside. Baseball. Now! We need nine!', 'My drum solo last night shook the whole street. You\'re welcome.', 'Mum\'s melon bread is the best in the universe. Fight me.', 'Have you seen Maru? That dog runs off every time I sing.'] },
  { id: 'riku', name: 'Riku', emoji: '😎', role: 'Lives in the mansion. Collects supercars he is too young to drive.', home: 'rikuHome', ai: 'wander',
    look: { avatar: { file: 'Sakurada_Fumiriya' }, h: 1.2, hair: 0x2b2b3a, hairStyle: 'side', top: 0x8fd3f4, collar: 0xffffff, tie: 0xd62828, bottom: 0xe9e2cf, longPants: true, shoes: 0x5a3d1e },
    lines: ['Papa bought me another supercar. They\'re in the carport — don\'t scratch them.', 'My pool is heated. Just saying.', 'Fine, you can take the red one for a spin. Press F next to it.', 'I have a model of every car ever made. Almost.'] },
  { id: 'sora', name: 'Sora', emoji: '🤓', role: 'Top of the class and happy to explain why.', home: 'soraHome', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male' }, h: 1.33, hair: 0x1f2a44, hairStyle: 'short', glasses: true, top: 0xffffff, collar: 0xffffff, jacket: 0x2f3f66, bottom: 0x6b7280, longPants: true, shoes: 0x2c2c34 },
    lines: ['Did you know a baseball curves because of the Magnus effect?', 'I\'m reading about dinosaurs. The long-necked ones ate 400 kg of leaves a day!', 'If you time-travel, please don\'t step on any butterflies.', 'The library closes at five. I checked. Twice.'] },
  { id: 'piko', name: 'Piko', emoji: '🎀', role: 'Tiko\'s little sister. Runs the Gadget Depot in the future.', home: 'kentaHome', ai: 'wander',
    look: { type: 'robot', h: 0.82, body: 0xfff3e0, accent: 0xff8a80, eye: 0xfff59d, ball: 0xff5fa2, bow: 0xff5fa2 }, walk: 2.6, run: 6,
    lines: ['Big brother forgot to oil his antenna again.', 'I keep the newest gadgets at the Depot in 2226. Come visit!', 'Zzzt! I am 12% cuter than Tiko. It is in the manual.'] },
  { id: 'mom', name: 'Mom', emoji: '👩', role: 'Kenta\'s mother. Has a sixth sense for unfinished homework.', home: 'kentaHome', ai: 'wander',
    look: { avatar: { file: 'Sendagaya_Shibu', cloth: 0xf6c8cf }, h: 1.6, adult: true, hair: 0x3a2a1c, hairStyle: 'bun', top: 0xf6c0c0, apron: 0xffffff, bottom: 0x7a8fb5, skirt: true, longSkirt: true, shoes: 0xb5895a },
    lines: ['Kenta! Have you finished your homework?', 'Dinner is at six. Tell Tiko no gadgets at the table.', 'Who left the Time Pod running in the garden?', 'Take an umbrella… oh, you have a Weather Box. Never mind.'] },
  { id: 'dad', name: 'Dad', emoji: '👨', role: 'Kenta\'s father. Office worker, weekend golfer, nap champion.', home: 'kentaHome', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male', cloth: 0xb9c8e0 }, h: 1.72, adult: true, hair: 0x2b2018, hairStyle: 'short', glasses: true, top: 0xffffff, collar: 0xffffff, tie: 0x34495e, longSleeve: true, bottom: 0x3a3f4a, longPants: true, shoes: 0x1c1c1e },
    lines: ['Back in my day we walked to school. Uphill. Both ways.', 'A robot from the future, and it still can\'t find my glasses.', 'Good game on Sunday? I\'ll come and cheer.'] },
  { id: 'miraMom', name: 'Mira\'s Mom', emoji: '👩‍🦰', home: 'miraHome', ai: 'wander',
    look: { avatar: { file: 'Victoria_Rubin', hair: 0xa87850 }, h: 1.62, adult: true, hair: 0x6b4226, hairStyle: 'long', top: 0xe8f0d8, bottom: 0x6f8f5f, skirt: true, longSkirt: true, shoes: 0xffffff },
    lines: ['Mira is out with her telescope again.', 'Lovely weather, isn\'t it?', 'Do come in for tea sometime.'] },
  { id: 'goroMom', name: 'Baker Hanae', emoji: '👩‍🍳', role: 'Goro\'s mother. Runs the Sunny Bakery.', home: 'shops', ai: 'wander',
    look: { avatar: { file: 'Vivi', wide: 1.15 }, h: 1.58, adult: true, build: 1.3, hair: 0x2b2018, hairStyle: 'bun', top: 0xf7d9a8, apron: 0xffffff, bottom: 0x8a5a34, longPants: true, shoes: 0x5a3d1e, cap: 0xffffff },
    lines: ['Fresh melon bread! Still warm!', 'GORO! Did you practise your drums in the shop again?!', 'Take a bun, dear, you look hungry.'] },
  { id: 'rikuDad', name: 'Mr. Kaneda', emoji: '🤵', role: 'Riku\'s father. Owns half the supercars in the prefecture.', home: 'rikuHome', ai: 'wander',
    look: { avatar: { file: 'Sakurada_Fumiriya', hair: 0x55504a, cloth: 0x6f7fa8 }, h: 1.7, adult: true, hair: 0x2b2b3a, hairStyle: 'side', mustache: true, top: 0x2f3a55, jacket: 0x1f2740, tie: 0xc9a227, collar: 0xffffff, longSleeve: true, bottom: 0x1f2740, longPants: true, shoes: 0x1c1c1e },
    lines: ['Business is splendid. Splendid!', 'Mind the paintwork on the cars, young ones.', 'When I was a boy I had only ONE supercar.'] },
  { id: 'teacher', name: 'Mr. Ishida', emoji: '👨‍🏫', role: 'Class teacher. Can hear a whisper from three rooms away.', home: 'schoolGate', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male', cloth: 0xa9b58f }, h: 1.74, adult: true, hair: 0x4a4a4a, hairStyle: 'bald', glasses: true, top: 0xdfe6d4, collar: 0xffffff, tie: 0x7a1f1f, longSleeve: true, bottom: 0x5a5f4a, longPants: true, shoes: 0x3a2e24, brow: 0.2 },
    lines: ['Kenta! Zero points again? Stand in the hallway!', 'No flying in the corridors. That includes robots.', 'The test is on Monday. Yes, this Monday.'] },
  { id: 'granny', name: 'Granny Ume', emoji: '👵', role: 'Has run the Candy Corner for fifty years.', home: 'shops', ai: 'wander',
    look: { avatar: { file: 'Vita', cloth: 0x9a8aa8 }, h: 1.42, adult: true, hair: 0xd9d9d9, hairStyle: 'bun', top: 0x7a5f8f, bottom: 0x4a3f5a, skirt: true, longSkirt: true, shoes: 0x3a2e24 }, walk: 1.5, run: 3,
    lines: ['Ten-yen candies, still ten yen!', 'In my day the river was full of fireflies.', 'Such a polite robot. Have a rice cracker.'] },
  { id: 'officer', name: 'Officer Daichi', emoji: '👮', home: 'park', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male', cloth: 0x6f8fd0 }, h: 1.75, adult: true, hair: 0x1c1c1e, hairStyle: 'short', top: 0x3a5f9a, collar: 0x3a5f9a, tie: 0x1f2a44, longSleeve: true, bottom: 0x1f2a44, longPants: true, shoes: 0x1c1c1e, cap: 0x1f2a44 },
    lines: ['All quiet in Hinode. Apart from the flying children.', 'Please drive supercars at sensible speeds. Please.', 'Lost something? The dog usually has it.'] },
  { id: 'hana', name: 'Hana', emoji: '👧', home: 'park', ai: 'wander',
    look: { avatar: { file: 'HairSample_Female' }, h: 1.25, hair: 0x1c1c1e, hairStyle: 'bob', top: 0xf7d84a, bottom: 0xe07a3f, skirt: true, shoes: 0xd9443f, socks: 0xffffff },
    lines: ['Mira and I are making flower crowns!', 'I can do the monkey bars in ten seconds.', 'Is that robot yours? Can it do my chores?'] },
  { id: 'taro', name: 'Taro', emoji: '🧢', home: 'lot', ai: 'wander',
    look: { avatar: { file: 'HairSample_Male', cloth: 0x8fb8f2 }, h: 1.32, hair: 0x2b2018, hairStyle: 'short', cap: 0x2a5fb5, top: 0xffffff, stripe: 0x2a5fb5, bottom: 0x2a5fb5, shoes: 0x1c1c1e, socks: 0xffffff },
    lines: ['I play shortstop for the Comets!', 'Goro hits it into the river every week. We\'re out of balls.', 'Race you to the levee!'] },
  { id: 'jun', name: 'Jun', emoji: '🧢', home: 'lot', ai: 'wander',
    look: { avatar: { file: 'Sakurada_Fumiriya', hair: 0xb05a3a, cloth: 0xf2c0b0 }, h: 1.27, hair: 0x5a3825, hairStyle: 'buzz', cap: 0xd62828, top: 0xd9e8f5, bottom: 0x5b4636, shoes: 0xffffff },
    lines: ['My curveball is unhittable. Mostly.', 'Let\'s play at the empty lot!', 'Have you been to the top of Lookout Hill?'] },
  { id: 'maru', name: 'Maru', emoji: '🐕', role: 'Goro\'s shiba. Steals shoes, hearts, and sausages.', home: 'goroHome', ai: 'wander',
    look: { type: 'dog', s: 1.15, len: 0.56, hgt: 0.3, fur: 0xd9a05b, belly: 0xf7ead2 }, walk: 2.6, run: 8.5,
    lines: [animal(['Woof!', 'Arf arf!', 'Wan wan!', '*tail wagging intensifies*'], ['Got any sausages? No? Check again.', 'I buried Goro\'s left shoe by the big tree. Don\'t tell.', 'Chase me! Chase me!', 'The cat started it.'])] },
  { id: 'kuro', name: 'Kuro', emoji: '🐈‍⬛', role: 'The empty lot\'s resident cat. Answers to no one.', home: 'lot', ai: 'wander',
    look: { type: 'cat', s: 0.85, len: 0.42, hgt: 0.22, fur: 0x2b2b30, belly: 0x4a4a52 }, walk: 2.2, run: 7.5,
    lines: [animal(['Meow.', 'Mrrow?', 'Purrrr.', '…'], ['I allow the humans to use my lot.', 'The dog is an idiot. A lovable idiot.', 'Fish. Now.', 'I saw you fly yesterday. Show-off.'])] },
];

export function spawnCast() {
  const era = G.eras.present;
  CAST.forEach((def, i) => {
    let p = era.pois[def.home] || era.pois.kentaHome;
    const node = era.nodes[(i * 7 + 3) % era.nodes.length];
    const start = ['kenta', 'tiko'].includes(def.id) ? { x: p.x + (def.id === 'tiko' ? 1.4 : 0), z: p.z + 0.5 } : i < 9 ? { x: p.x + ((i % 3) - 1) * 1.6, z: p.z + 2.5 + (i % 2) } : { x: node.x + ((i % 3) - 1), z: node.z + (i % 2) };
    spawnActor({ ...def, era: 'present', x: start.x, z: start.z, yaw: def.id === 'kenta' ? Math.PI : 0 });
  });
  const c = G.cast;
  c.tiko.ai.follow = c.kenta; c.tiko.ai.slot = 0;
  c.maru.ai.wait = 0; c.piko.ai.wait = 2;
}
