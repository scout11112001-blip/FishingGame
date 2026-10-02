import { emptyStats, AchievementLog, type PlayerStats } from './achievements.ts'
import { BAIT_DURATION_MS, isBaitActive, type ActiveBait } from './bait.ts'
import { claimDaily, dailyOffer, emptyDaily, type DailyReward, type DailyState } from './daily.ts'
import { isWaterOpen } from './progress.ts'
import { itemsOf, Shop, type Slot } from './shop.ts'
import type { Bait, ContentPack, Line, Loadout, Reel, Rod, WaterBody } from './types.ts'

// Прогресс игрока — всё, что переживает перезагрузку: серебро, снасти, опыт, водоём, прикормка, достижения, обучение.
// Здесь же формат сохранения и проверка при загрузке. Ничего не знает ни о графике, ни о том, где лежит сохранение.

/** Версия формата. Меняется, когда старое сохранение нельзя прочитать как есть, — тогда добавляем перевод из старой. */
export const SAVE_VERSION = 1

/** Сохранение — только id и числа: по ним предметы ищутся в пакете заново, так переживается правка контента. */
export interface SaveData {
  v: typeof SAVE_VERSION
  /** Когда записано (Date.now()): из двух сохранений (в браузере и в облаке) берём более свежее. */
  savedAt: number
  silver: number
  xp: number
  owned: Record<Slot, string[]>
  loadout: Record<Slot, string>
  water: string
  bait: { id: string; until: number } | null
  /** Запас прикормок: id → штук. */
  baitStock: Record<string, number>
  daily: DailyState
  stats: Omit<PlayerStats, 'xp'>
  achievements: { done: string[]; unseen: string[] }
  tutorialDone: boolean
}

export interface PlayerOptions {
  /** Тестовая версия: всё куплено и все водоёмы открыты. */
  unlockAll?: boolean
}

export class PlayerState {
  readonly shop: Shop
  readonly achievements: AchievementLog
  xp = 0
  water: WaterBody
  loadout: Loadout
  bait: ActiveBait | null = null
  /** Запас прикормок по id. */
  baitStock: Record<string, number> = {}
  daily: DailyState = emptyDaily()
  tutorialDone = false
  private readonly pack: ContentPack
  private readonly unlockAll: boolean

  constructor(pack: ContentPack, options: PlayerOptions = {}) {
    this.pack = pack
    this.unlockAll = !!options.unlockAll
    this.shop = new Shop(pack, this.unlockAll)
    this.achievements = new AchievementLog(pack)
    this.water = pack.waters[0]
    this.loadout = pack.starter
  }

  /** Открыт ли водоём: по опыту, а в тестовой версии — все. */
  isOpen(water: WaterBody): boolean {
    return this.unlockAll || isWaterOpen(water, this.xp)
  }

  /** Сколько прикормки в запасе. В тестовой версии — сколько угодно. */
  baitCount(bait: Bait): number {
    return this.unlockAll ? Infinity : (this.baitStock[bait.id] ?? 0)
  }

  /** Положить прикормку в запас: награда за вход или за просмотр рекламы. */
  addBait(bait: Bait, count = 1): void {
    this.baitStock[bait.id] = (this.baitStock[bait.id] ?? 0) + count
  }

  /** Можно ли сейчас включить прикормку: есть в запасе и никакая другая (или эта же) ещё не действует. */
  canUseBait(bait: Bait, now: number): boolean {
    return this.baitCount(bait) >= 1 && !isBaitActive(this.bait, now)
  }

  /**
   * Включить прикормку из запаса. Действует одна за раз: пока она не кончилась, ни другую, ни ту же ещё раз не включить —
   * иначе вторая сгорела бы впустую. false — нельзя (см. canUseBait).
   */
  useBait(bait: Bait, now: number): boolean {
    if (!this.canUseBait(bait, now)) return false
    if (!this.unlockAll) this.baitStock[bait.id] -= 1
    this.bait = { bait, until: now + BAIT_DURATION_MS }
    return true
  }

  /** Какую награду за вход можно забрать сегодня (номер дня серии с 0), или null — уже забрана. */
  dailyOffer(today: string): number | null {
    return this.pack.daily.length ? dailyOffer(this.daily, today, this.pack.daily.length) : null
  }

  /** Забрать награду за вход: серебро и прикормка в запас. Возвращает выданное. */
  claimDaily(today: string): DailyReward | null {
    const index = this.dailyOffer(today)
    if (index === null) return null
    const reward = this.pack.daily[index]
    this.shop.earn(reward.silver)
    if (reward.bait) this.addBait(reward.bait)
    this.daily = claimDaily(index, today)
    return reward
  }

  /** Снимок для сохранения — без времени записи: его ставит тот, кто пишет. */
  toSave(): Omit<SaveData, 'savedAt'> {
    const { catches, bySpecies, best } = this.achievements.stats
    return {
      v: SAVE_VERSION,
      silver: this.shop.silver,
      xp: this.xp,
      owned: this.shop.ownedIds(),
      loadout: { rod: this.loadout.rod.id, line: this.loadout.line.id, reel: this.loadout.reel.id },
      water: this.water.id,
      bait: this.bait ? { id: this.bait.bait.id, until: this.bait.until } : null,
      baitStock: { ...this.baitStock },
      daily: { ...this.daily },
      stats: { catches, bySpecies: { ...bySpecies }, best: { ...best } },
      achievements: this.achievements.ids(),
      tutorialDone: this.tutorialDone,
    }
  }

  /**
   * Восстановить из сохранения, ничему в нём не доверяя: неизвестные id пропускаем, числа приводим в порядок,
   * некупленную снасть меняем на стартовую, закрытый водоём — на первый, истёкшую прикормку убираем.
   */
  restore(data: SaveData, now: number): void {
    const pack = this.pack
    this.shop.restore(pack, data.silver, data.owned)
    this.xp = count(data.xp)

    const pick = <T extends Rod | Line | Reel>(slot: Slot, id: string, fallback: T): T => {
      const item = itemsOf(pack, slot).find((i) => i.id === id)
      return item && this.shop.owns(slot, item) ? (item as T) : fallback
    }
    this.loadout = {
      rod: pick('rod', data.loadout.rod, pack.starter.rod),
      line: pick('line', data.loadout.line, pack.starter.line),
      reel: pick('reel', data.loadout.reel, pack.starter.reel),
    }

    const water = pack.waters.find((w) => w.id === data.water)
    this.water = water && this.isOpen(water) ? water : pack.waters[0]

    const bait = data.bait && pack.baits.find((b) => b.id === data.bait!.id)
    const active = bait ? { bait, until: Number(data.bait!.until) } : null
    this.bait = isBaitActive(active, now) ? active : null
    this.baitStock = {}
    for (const b of pack.baits) {
      const n = count(Number(data.baitStock[b.id]))
      if (n > 0) this.baitStock[b.id] = n
    }
    this.daily = { lastDay: /^\d{4}-\d{2}-\d{2}$/.test(data.daily.lastDay ?? '') ? data.daily.lastDay : null, streak: count(data.daily.streak) }

    const stats: PlayerStats = {
      catches: count(data.stats.catches),
      bySpecies: numbers(data.stats.bySpecies, pack, count),
      best: numbers(data.stats.best, pack, (x) => (Number.isFinite(x) && x > 0 ? x : 0)),
      xp: this.xp,
    }
    this.achievements.restore(stats, data.achievements.done, data.achievements.unseen)
    this.tutorialDone = data.tutorialDone === true
  }
}

/**
 * Разобрать текст сохранения. null — это не наше сохранение или оно битое: тогда игра начинается заново.
 * Проверяем только форму; содержимое (id, диапазоны) поправит PlayerState.restore.
 */
export function parseSave(json: string): SaveData | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObject(raw) || raw.v !== SAVE_VERSION) return null
  const r = raw as Record<string, unknown>
  const owned = isObject(r.owned) ? r.owned : {}
  const loadout = isObject(r.loadout) ? r.loadout : {}
  const stats = isObject(r.stats) ? r.stats : {}
  const achievements = isObject(r.achievements) ? r.achievements : {}
  const bait = isObject(r.bait) ? r.bait : null
  const daily = isObject(r.daily) ? r.daily : {}
  const empty = emptyStats()
  return {
    v: SAVE_VERSION,
    savedAt: num(r.savedAt),
    silver: num(r.silver),
    xp: num(r.xp),
    owned: { rod: strings(owned.rod), line: strings(owned.line), reel: strings(owned.reel) },
    loadout: { rod: str(loadout.rod), line: str(loadout.line), reel: str(loadout.reel) },
    water: str(r.water),
    bait: bait ? { id: str(bait.id), until: num(bait.until) } : null,
    // Поля, которых не было в первых сохранениях, — по умолчанию: формат от этого не меняется
    baitStock: isObject(r.baitStock) ? (r.baitStock as Record<string, number>) : {},
    daily: { lastDay: typeof daily.lastDay === 'string' ? daily.lastDay : null, streak: num(daily.streak) },
    stats: {
      catches: num(stats.catches),
      bySpecies: isObject(stats.bySpecies) ? (stats.bySpecies as Record<string, number>) : empty.bySpecies,
      best: isObject(stats.best) ? (stats.best as Record<string, number>) : empty.best,
    },
    achievements: { done: strings(achievements.done), unseen: strings(achievements.unseen) },
    tutorialDone: r.tutorialDone === true,
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function num(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : ''
}

function strings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
}

/** Целое неотрицательное: счётчики и опыт. */
function count(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0
}

/** Числа по видам рыб пакета: чужие id отбрасываем, значения приводим fix. */
function numbers(map: Record<string, number>, pack: ContentPack, fix: (x: number) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const fish of pack.fish) {
    const value = fix(Number(map[fish.id]))
    if (value > 0) out[fish.id] = value
  }
  return out
}
