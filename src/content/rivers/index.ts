import type { FishSpawn } from '../../core/fish.ts'
import type { Bait, ContentPack, Line, Reel, Rod, WaterBody } from '../types.ts'
import { ALL_FISH, BREAM, CATFISH, CRUCIAN, PERCH, PIKE, ROACH, ZANDER } from './fish.ts'
import { RIVERS_TEXTS } from './texts.ts'

// Черновой пакет-заглушка: нейтральный сеттинг, на котором отлаживаем данные и экономику.

/**
 * Разброс размеров на месте ловли: больше — чаще мелочь, ближе к 1 — чаще крупные.
 * Как в жизни, крупные особи держатся глубже: чем дальше место, тем меньше разброс.
 */
const withSizeSkew = (sizeSkew: number, spawns: readonly FishSpawn[]): FishSpawn[] => spawns.map((s) => ({ ...s, sizeSkew }))

// Кто где держится — примерно как в жизни: карась и плотва на мелководье в траве, окунь охотится на свале,
// лещ стоит в ямах, щука караулит на кромке травы, судак — на русле с твёрдым дном, сом — в омутах.
// Рыба ближних мест водится и дальше, просто там её доля меньше.

const POND: WaterBody = {
  id: 'pond',
  name: 'Деревенский пруд',
  description: 'Тихий пруд за деревней. Мелкая рыба — самое то для начала.',
  zones: [
    {
      name: 'Мелководье у камыша',
      depthM: 1,
      spawns: withSizeSkew(3.5, [
        { species: CRUCIAN, rarity: 60 },
        { species: ROACH, rarity: 40 },
      ]),
    },
    {
      name: 'Яма посередине',
      depthM: 3,
      spawns: withSizeSkew(2.75, [
        { species: CRUCIAN, rarity: 25 },
        { species: ROACH, rarity: 25 },
        { species: PERCH, rarity: 30 },
        { species: BREAM, rarity: 20 },
      ]),
    },
  ],
  palette: { sky: 0x9fd8ea, waterFar: 0x3d8f7a, water: 0x2f6f5e },
  // Мелководье — где камыш и кувшинки, яма — ровная вода над ними
  backdrop: { image: 'bg/pond.webp', waterline: 0.25, shore: 0.88, zoneEdges: [0.72, 0.5, 0.3] },
}

const RIVER: WaterBody = {
  id: 'river',
  name: 'Тихая река',
  description: 'Течение приносит щуку и судака, а в омутах живёт сом.',
  // Опыт за рыбу: столько ловят примерно за 10 минут в пруду (бот — 42 рыбы, человек — чуть дольше)
  unlockXp: 40,
  zones: [
    {
      name: 'У берега',
      depthM: 1.5,
      spawns: withSizeSkew(2, [
        { species: ROACH, rarity: 50 },
        { species: PERCH, rarity: 50 },
      ]),
    },
    {
      name: 'Бровка',
      depthM: 3,
      spawns: withSizeSkew(1.6, [
        { species: ROACH, rarity: 20 },
        { species: PERCH, rarity: 20 },
        { species: BREAM, rarity: 35 },
        { species: PIKE, rarity: 25 },
      ]),
    },
    {
      name: 'Русло и омут',
      depthM: 6,
      spawns: withSizeSkew(1.3, [
        { species: ROACH, rarity: 10 },
        { species: PERCH, rarity: 15 },
        { species: BREAM, rarity: 25 },
        { species: PIKE, rarity: 15 },
        { species: ZANDER, rarity: 25 },
        { species: CATFISH, rarity: 10 },
      ]),
    },
  ],
  palette: { sky: 0x7ec8e3, waterFar: 0x2d86b0, water: 0x1f6f99 },
  // У берега — галька под водой, бровка — зеленоватая кромка травы, русло — тёмная вода с омутом
  backdrop: { image: 'bg/river.webp', waterline: 0.245, shore: 0.9, zoneEdges: [0.76, 0.64, 0.52, 0.31] },
}

const LAKE: WaterBody = {
  id: 'lake',
  name: 'Лесное озеро',
  description: 'Глубокое и холодное. Крупная рыба — и крупный улов.',
  // Примерно 2 часа игры при выгодных покупках снастей (бот к 2 часам ловит 389 рыб)
  unlockXp: 400,
  zones: [
    {
      name: 'Заросли и свал',
      depthM: 3.5,
      spawns: withSizeSkew(1.15, [
        { species: PERCH, rarity: 35 },
        { species: PIKE, rarity: 30 },
        { species: BREAM, rarity: 20 },
        { species: ZANDER, rarity: 15 },
      ]),
    },
    {
      name: 'Глубокая яма',
      depthM: 10,
      spawns: withSizeSkew(0.85, [
        { species: PERCH, rarity: 10 },
        { species: PIKE, rarity: 20 },
        { species: BREAM, rarity: 25 },
        { species: ZANDER, rarity: 25 },
        { species: CATFISH, rarity: 20 },
      ]),
    },
  ],
  // У озера и у берега глубоко: бамбуковой тут делать нечего, болонская добросит до свала, до ямы — только фидер
  minCastLevels: 2,
  palette: { sky: 0xa9c4d6, waterFar: 0x2a5d7c, water: 0x1b4560 },
  // Заросли и свал — от светлой отмели до края тёмного клина, яма — глубокая вода за ним
  backdrop: { image: 'bg/lake.webp', waterline: 0.235, shore: 0.87, zoneEdges: [0.76, 0.5, 0.3] },
}

// Цены подобраны расчётом прогресса: первая покупка (леска) — ещё в пруду, болонская — сразу после открытия реки,
// полная снасть — примерно за 7,5 часа игры. Без цены — стартовая снасть.
// Удочка решает, до какого места ловли добросишь: дальше — глубже, другая и более крупная рыба
const BAMBOO: Rod = { id: 'bamboo', name: 'Бамбуковая удочка', description: 'Простая и надёжная. Ловит у самого берега', castLevels: 1, sprite: 'sprites/rod-bamboo.webp' }
const BOLOGNESE: Rod = { id: 'bolognese', name: 'Болонская удочка', description: 'Длинная, с катушкой. Пруд добросит целиком, реку — до бровки, на озере — до свала', castLevels: 2, sprite: 'sprites/rod-bolognese.webp', price: 300 }
const FEEDER: Rod = { id: 'feeder', name: 'Фидер', description: 'Дальний заброс к руслу, омутам и глубокой яме озера', castLevels: 3, sprite: 'sprites/rod-feeder.webp', price: 72000 }

const LINE_02: Line = { id: 'mono02', name: 'Леска 0,2 мм', description: 'Для плотвы, карася и окуня', strength: 1 }
const LINE_03: Line = { id: 'mono03', name: 'Леска 0,3 мм', description: 'Выдержит леща и некрупную щуку', strength: 1.3, price: 150 }
const BRAID: Line = { id: 'braid', name: 'Плетёнка', description: 'Для щуки и судака', strength: 1.7, price: 7000 }
// Под крупного сома: без неё его рывок поднимает усилие быстрее, чем оно падает с отпущенным пальцем
const CATFISH_CORD: Line = { id: 'catfishCord', name: 'Сомовий шнур', description: 'Выдержит рывки крупного сома', strength: 3.2, price: 30000 }

const BASIC_REEL: Reel = { id: 'basic', name: 'Простая катушка', description: 'Медленная, но своё дело делает', speed: 0.1 }
const SPINNING_REEL: Reel = { id: 'spinning', name: 'Безынерционная катушка', description: 'Подматывает заметно быстрее', speed: 0.13, price: 1500 }
const MULTIPLIER_REEL: Reel = { id: 'multiplier', name: 'Мультипликатор', description: 'Быстро вытаскивает даже тяжёлую рыбу', speed: 0.17, price: 12000 }
const POWER_REEL: Reel = { id: 'power', name: 'Силовая катушка', description: 'Самая быстрая подмотка', speed: 0.2, price: 40000 }

// Прикормка — на рыбу покрупнее и подороже: за мелочью её не сыплют
const BREAM_BAIT: Bait = {
  id: 'bream',
  name: 'Прикормка на леща',
  description: 'Каша с жмыхом. 2 часа лещ клюёт вдвое чаще и подходит даже туда, где сам не стоит',
  species: BREAM,
}
const ZANDER_BAIT: Bait = {
  id: 'zander',
  name: 'Прикормка на судака',
  description: 'Мелкая рыбёшка с пахучим фаршем. 2 часа судак клюёт вдвое чаще и подходит даже туда, где сам не стоит',
  species: ZANDER,
}
const CATFISH_BAIT: Bait = {
  id: 'catfish',
  name: 'Прикормка на сома',
  description: 'Печень с перловкой — сом чует издалека. 2 часа клюёт вдвое чаще и подходит даже туда, где сам не стоит',
  species: CATFISH,
}

export const RIVERS: ContentPack = {
  id: 'rivers',
  title: 'Рыбалка',
  fish: ALL_FISH,
  waters: [POND, RIVER, LAKE],
  rods: [BAMBOO, BOLOGNESE, FEEDER],
  lines: [LINE_02, LINE_03, BRAID, CATFISH_CORD],
  reels: [BASIC_REEL, SPINNING_REEL, MULTIPLIER_REEL, POWER_REEL],
  baits: [BREAM_BAIT, ZANDER_BAIT, CATFISH_BAIT],
  starter: { rod: BAMBOO, line: LINE_02, reel: BASIC_REEL },
  art: {
    float: 'sprites/float.webp',
    floatAboveWater: 0.3,
    fish: Object.fromEntries(ALL_FISH.map((f) => [f.id, `sprites/${f.id}.webp`])),
    silver: 'sprites/silver.webp',
  },
  texts: RIVERS_TEXTS,
}
