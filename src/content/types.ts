import type { FishSpawn, FishSpecies, HookedFish } from '../core/fish.ts'
import type { EscapeReason, Phase, Tackle } from '../core/FishingSession.ts'

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
  /** Кто клюёт и как часто. Ссылки — на объекты рыб, чтобы опечатку поймал TypeScript. */
  spawns: readonly FishSpawn[]
  palette: WaterPalette
}

export interface WaterPalette {
  sky: number
  waterFar: number
  water: number
}

/** Удочка задаёт дальность заброса. */
export interface Rod {
  id: string
  name: string
  description?: string
  castMin: number
  castMax: number
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
  return { castMin: rod.castMin, castMax: rod.castMax, lineStrength: line.strength, reelSpeed: reel.speed }
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
  /** Общие надписи панелей. */
  ui: {
    selected: string
    done: string
  }
  tackle: {
    button: string
    title: string
    tabs: Record<keyof Loadout, string>
    stats: { cast: string; strength: string; speed: string }
  }
  waters: {
    button: string
    title: string
    /** Подпись перед списком рыб водоёма. */
    fish: string
  }
}
