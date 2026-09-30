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
  /** Водоёмы в порядке открытия. */
  waters: readonly WaterBody[]
  rods: readonly Rod[]
  lines: readonly Line[]
  reels: readonly Reel[]
  starter: Loadout
  texts: PackTexts
}

export interface WaterBody {
  id: string
  name: string
  description?: string
  /**
   * Места ловли по уровням заброса (1..MAX_CAST_LEVELS): от берега к глубине. Диапазон заброса делится
   * между ними поровну, так что в водоёме с двумя местами каждое шире.
   * Рыба ближнего места водится и дальше — дальний заброс ничего не отнимает, только добавляет.
   */
  zones: readonly CastZone[]
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
}

/** Леска задаёт прочность: чем выше, тем слабее рывки и ниже зелёная зона. */
export interface Line {
  id: string
  name: string
  description?: string
  strength: number
}

/** Катушка задаёт скорость подмотки. */
export interface Reel {
  id: string
  name: string
  description?: string
  speed: number
}

export interface Loadout {
  rod: Rod
  line: Line
  reel: Reel
}

export function tackleOf({ rod, line, reel }: Loadout): Tackle {
  return { castLevels: rod.castLevels, lineStrength: line.strength, reelSpeed: reel.speed }
}

/** Все тексты интерфейса. Функции — там, где в текст подставляются значения. */
export interface PackTexts {
  /** Подписи счётчиков в углу экрана. */
  wallet: string
  catchCount: string
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
  }
  waters: {
    button: string
    title: string
    /** Подпись места ловли с глубиной и рыбой: новая на этом месте рыба идёт с «+». */
    zone: (name: string, depth: string, fish: string) => string
  }
}
