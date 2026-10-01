import type { FishSpawn, FishSpecies, HookedFish } from '../core/fish.ts'
import type { CastZones, EscapeReason, Phase, Tackle } from '../core/FishingSession.ts'

/**
 * Пакет контента — всё, чем одна обёртка игры отличается от другой.
 * Новая обёртка = новая папка в src/content с объектом этого типа; ядро и сцена не меняются.
 */
export interface ContentPack {
  id: string
  title: string
  /** Все виды рыб обёртки — понадобятся для коллекции. */
  fish: readonly FishSpecies[]
  /** Водоёмы в порядке открытия (см. unlockXp). */
  waters: readonly WaterBody[]
  rods: readonly Rod[]
  lines: readonly Line[]
  reels: readonly Reel[]
  /** Прикормки: на время чаще клюёт одна рыба. */
  baits: readonly Bait[]
  starter: Loadout
  texts: PackTexts
  /** Картинки поплавка и рыб. Без них сцена рисует простые фигуры. */
  art?: PackArt
}

/** Спрайты пакета — пути относительно public/. Готовит их скрипт npm run art из картинок в art/. */
export interface PackArt {
  /** Поплавок стоймя, антенна вверху. */
  float: string
  /** Какая доля высоты поплавка сверху торчит над водой: антенна и самый верх тела. */
  floatAboveWater: number
  /** Рыбы по id вида: вид строго сбоку, голова влево. */
  fish: Readonly<Record<string, string>>
  /** Значок серебра — после слова «Серебро» в строке счётчиков. Без него — только слово. */
  silver?: string
}

export interface WaterBody {
  id: string
  name: string
  description?: string
  /** Сколько опыта нужно, чтобы водоём открылся. Нет — открыт с начала. Опыт — по XP_PER_FISH за рыбу (progress.ts). */
  unlockXp?: number
  /**
   * Места ловли по уровням заброса (1..MAX_CAST_LEVELS): от берега к глубине. Диапазон заброса делится
   * между ними поровну, так что в водоёме с двумя местами каждое шире.
   * Рыба ближнего места водится и дальше — дальний заброс ничего не отнимает, только добавляет.
   */
  zones: readonly CastZone[]
  /**
   * Самая слабая удочка (её castLevels), которой здесь вообще можно ловить. По умолчанию 1 — любая.
   * Удочка этого уровня добрасывает до ближнего места, каждый уровень выше — на место дальше (см. rodReach).
   */
  minCastLevels?: number
  /** Цвета заливки, пока картинка не загрузилась, и для водоёма без картинки. */
  palette: WaterPalette
  backdrop?: Backdrop
}

/**
 * Фоновая картинка водоёма и где на ней что нарисовано — в долях высоты картинки (0 — верх, 1 — низ).
 * По этим отметкам игра раскладывает места ловли, поэтому их снимают с самой картинки.
 */
export interface Backdrop {
  /** Путь относительно public/. */
  image: string
  /** Где дальний берег касается воды. */
  waterline: number
  /** Где кончается вода у ног игрока (начинается его берег). */
  shore: number
  /** Границы мест ловли от ближней к дальней: zones.length + 1 отметок, каждая выше предыдущей. */
  zoneEdges: readonly number[]
}

/** Место ловли на одном уровне заброса. */
export interface CastZone {
  name: string
  depthM: number
  /** Кто клюёт и как часто. Ссылки — на объекты рыб, чтобы опечатку поймал TypeScript. */
  spawns: readonly FishSpawn[]
}

/**
 * До скольких мест водоёма добрасывает удочка: на обычном водоёме — castLevels,
 * на том, где нужна удочка не слабее minCastLevels, — на столько меньше. 0 — даже до ближнего не добросит.
 */
export function rodReach(water: WaterBody, rod: Rod): number {
  return Math.max(0, rod.castLevels - ((water.minCastLevels ?? 1) - 1))
}

/** Можно ли ловить на водоёме этой удочкой: на некоторых слабая не добрасывает даже до ближнего места. */
export function rodFits(water: WaterBody, rod: Rod): boolean {
  return rodReach(water, rod) >= 1
}

/** Самая слабая удочка пакета, которой можно ловить на водоёме, — её и советуем. */
export function weakestFittingRod(pack: ContentPack, water: WaterBody): Rod | undefined {
  return [...pack.rods].sort((a, b) => a.castLevels - b.castLevels).find((r) => rodFits(water, r))
}

/** Списки рыб по уровням — в том виде, в каком их ждёт ядро. */
export function zoneSpawns(water: WaterBody): CastZones {
  return water.zones.map((z) => z.spawns)
}

export interface WaterPalette {
  sky: number
  waterFar: number
  water: number
}

/** Удочка задаёт дальность заброса: до скольких мест ловли водоёма она добрасывает. */
export interface Rod {
  id: string
  name: string
  description?: string
  /** 1..MAX_CAST_LEVELS. В водоёме с меньшим числом мест добрасывает до последнего. */
  castLevels: number
  /** Цена в серебре. Нет — есть у игрока с начала. */
  price?: number
  /** Картинка удочки относительно public/: прямая, вертикальная, рукоять внизу. Без неё удочка — линия. */
  sprite?: string
}

/** Леска задаёт прочность: чем выше, тем слабее рывки и ниже зелёная зона. */
export interface Line {
  id: string
  name: string
  description?: string
  strength: number
  /** Цена в серебре. Нет — есть у игрока с начала. */
  price?: number
}

/** Катушка задаёт скорость подмотки. */
export interface Reel {
  id: string
  name: string
  description?: string
  speed: number
  /** Цена в серебре. Нет — есть у игрока с начала. */
  price?: number
}

/**
 * Прикормка на одну рыбу: пока действует, та клюёт вдвое чаще и подходит даже на места, где сама не стоит.
 * Работает только на водоёмах, где эта рыба водится. Подробности — в bait.ts.
 */
export interface Bait {
  id: string
  name: string
  /** Должно упоминать длительность и что работает только там, где рыба водится. */
  description?: string
  species: FishSpecies
}

export interface Loadout {
  rod: Rod
  line: Line
  reel: Reel
}

/** Снасть для ядра. С водоёмом — дальность удочки именно на нём (см. rodReach). */
export function tackleOf({ rod, line, reel }: Loadout, water?: WaterBody): Tackle {
  return { castLevels: water ? rodReach(water, rod) : rod.castLevels, lineStrength: line.strength, reelSpeed: reel.speed }
}

export interface AchievementText {
  title: string
  description: string
}

/** Все тексты интерфейса. Функции — там, где в текст подставляются значения. */
export interface PackTexts {
  /** Подписи счётчиков в углу экрана. */
  wallet: string
  xp: string
  hints: Record<Phase, string>
  escape: Record<EscapeReason, string>
  warnings: {
    lineBreaking: string
    slack: string
    wrongSide: string
    rushSoon: string
  }
  caught: (fish: HookedFish, price: number) => string
  lost: (fish: HookedFish) => string
  cast: {
    /** Подпись места ловли, куда текущая удочка не добрасывает. */
    locked: string
    /** Всплывает, когда игрок целится дальше, чем добрасывает удочка. */
    tooFar: string
    /** Удочка не годится для водоёма: подставляется название самой слабой подходящей. */
    needsRod: (rod: string) => string
    /** Подпись места ловли на воде: название и глубина. */
    zone: (name: string, depth: string) => string
  }
  /** Общие надписи панелей. */
  ui: {
    selected: string
    done: string
  }
  tackle: {
    button: string
    title: string
    tabs: Record<keyof Loadout, string>
    stats: { strength: string; speed: string }
    /** Сколько серебра у игрока — вверху магазина. */
    balance: (silver: string) => string
    /** Некупленный предмет: хватает серебра — предложение купить, нет — сколько не хватает. */
    buy: (price: string) => string
    notEnough: (left: string) => string
  }
  bait: {
    button: string
    title: string
    /** На каких водоёмах прикормка работает: подставляется рыба и список водоёмов. */
    waters: (fish: string, waters: string) => string
    active: string
    /** Сколько ещё действует — в карточке прикормки. */
    left: (time: string) => string
    /** Строка под счётчиками, пока прикормка действует; works — водится ли её рыба в текущем водоёме. */
    status: (name: string, time: string, works: boolean) => string
  }
  achievements: {
    /** Подпись кнопки для экранов чтения с экрана: на самой кнопке — кубок. */
    button: string
    title: string
    /** Название и задание каждого достижения: в задание подставляются цели. */
    catches: (goal: number) => AchievementText
    species: (fish: string, goal: number) => AchievementText
    water: (name: string, xp: number) => AchievementText
    xp: (goal: number) => AchievementText
    record: (fish: string, kg: string) => AchievementText
    /** Прогресс под заданием: «37 / 50», у рекорда — «лучшая: 0,42 кг». */
    progress: (value: number, target: number) => string
    best: (kg: string) => string
    done: string
  }
  waters: {
    button: string
    title: string
    /** Подпись места ловли с глубиной и рыбой: новая на этом месте рыба идёт с «+». */
    zone: (name: string, depth: string, fish: string) => string
    /** Закрытый водоём в списке: сколько опыта нужно и сколько ещё осталось набрать. */
    locked: (xp: number, left: number) => string
    /** На экране улова, когда эта рыба открыла новый водоём. */
    opened: (name: string) => string
  }
}
