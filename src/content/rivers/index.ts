import type { FishSpawn } from '../../core/fish.ts'
import type { ContentPack, Line, Reel, Rod, WaterBody } from '../types.ts'
import { ALL_FISH, BREAM, CATFISH, CRUCIAN, PERCH, PIKE, ROACH, ZANDER } from './fish.ts'
import { RIVERS_TEXTS } from './texts.ts'

// Черновой пакет-заглушка: нейтральный сеттинг, на котором отлаживаем данные и экономику.

/** Один разброс размеров на весь водоём: больше — чаще мелочь, ближе к 1 — чаще крупные. */
const withSizeSkew = (sizeSkew: number, spawns: readonly FishSpawn[]): FishSpawn[] => spawns.map((s) => ({ ...s, sizeSkew }))

const POND: WaterBody = {
  id: 'pond',
  name: 'Деревенский пруд',
  description: 'Тихий пруд за деревней. Мелкая рыба — самое то для начала.',
  spawns: withSizeSkew(3, [
    { species: CRUCIAN, rarity: 45 },
    { species: ROACH, rarity: 30 },
    { species: PERCH, rarity: 20 },
    { species: BREAM, rarity: 5 },
  ]),
  palette: { sky: 0x9fd8ea, waterFar: 0x3d8f7a, water: 0x2f6f5e },
}

const RIVER: WaterBody = {
  id: 'river',
  name: 'Тихая река',
  description: 'Течение приносит щуку и судака, а в омутах живёт сом.',
  spawns: withSizeSkew(1.6, [
    { species: ROACH, rarity: 20 },
    { species: PERCH, rarity: 20 },
    { species: BREAM, rarity: 25 },
    { species: PIKE, rarity: 15 },
    { species: ZANDER, rarity: 15 },
    { species: CATFISH, rarity: 5 },
  ]),
  palette: { sky: 0x7ec8e3, waterFar: 0x2d86b0, water: 0x1f6f99 },
}

const LAKE: WaterBody = {
  id: 'lake',
  name: 'Лесное озеро',
  description: 'Глубокое и холодное. Крупная рыба — и крупный улов.',
  spawns: withSizeSkew(1, [
    { species: PERCH, rarity: 15 },
    { species: BREAM, rarity: 25 },
    { species: PIKE, rarity: 25 },
    { species: ZANDER, rarity: 20 },
    { species: CATFISH, rarity: 15 },
  ]),
  palette: { sky: 0xa9c4d6, waterFar: 0x2a5d7c, water: 0x1b4560 },
}

// Удочка пока одна: дальность заброса сейчас только удлиняет бой, смысл апгрейда удочки решим на этапе экономики
const BAMBOO: Rod = { id: 'bamboo', name: 'Бамбуковая удочка', description: 'Простая и надёжная', castMin: 0.6, castMax: 1 }

const LINE_02: Line = { id: 'mono02', name: 'Леска 0,2 мм', description: 'Для плотвы, карася и окуня', strength: 1 }
const LINE_03: Line = { id: 'mono03', name: 'Леска 0,3 мм', description: 'Выдержит леща и некрупную щуку', strength: 1.3 }
const BRAID: Line = { id: 'braid', name: 'Плетёнка', description: 'Для щуки и судака', strength: 1.7 }
// Под крупного сома: без неё его рывок поднимает усилие быстрее, чем оно падает с отпущенным пальцем
const CATFISH_CORD: Line = { id: 'catfishCord', name: 'Сомовий шнур', description: 'Выдержит рывки крупного сома', strength: 3.2 }

const BASIC_REEL: Reel = { id: 'basic', name: 'Простая катушка', description: 'Медленная, но своё дело делает', speed: 0.1 }
const SPINNING_REEL: Reel = { id: 'spinning', name: 'Безынерционная катушка', description: 'Подматывает заметно быстрее', speed: 0.13 }
const MULTIPLIER_REEL: Reel = { id: 'multiplier', name: 'Мультипликатор', description: 'Быстро вытаскивает даже тяжёлую рыбу', speed: 0.17 }
const POWER_REEL: Reel = { id: 'power', name: 'Силовая катушка', description: 'Самая быстрая подмотка', speed: 0.2 }

export const RIVERS: ContentPack = {
  id: 'rivers',
  title: 'Рыбалка',
  fish: ALL_FISH,
  waters: [POND, RIVER, LAKE],
  rods: [BAMBOO],
  lines: [LINE_02, LINE_03, BRAID, CATFISH_CORD],
  reels: [BASIC_REEL, SPINNING_REEL, MULTIPLIER_REEL, POWER_REEL],
  starter: { rod: BAMBOO, line: LINE_02, reel: BASIC_REEL },
  texts: RIVERS_TEXTS,
}
