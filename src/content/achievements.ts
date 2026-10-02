import type { FishSpecies, HookedFish } from '../core/fish.ts'
import type { ContentPack } from './types.ts'

// Достижения: что засчитано, что игрок ещё не видел. Список строится из пакета —
// на каждый вид рыбы и каждый открываемый водоём своё достижение. Ничего не знает об интерфейсе.

/** Рекорд вида — рыба не легче этой доли от максимального веса. */
export const RECORD_SHARE = 0.98
/** Сколько рыбы одного вида нужно для достижения «сотня». */
export const SPECIES_GOAL = 100
export const CATCH_GOALS = [1, 50, 100, 1000] as const
export const XP_GOAL = 500

/** Всё, что нужно достижениям знать об игроке. */
export interface PlayerStats {
  catches: number
  /** Поймано по видам: id → штук. */
  bySpecies: Record<string, number>
  /** Самая тяжёлая рыба вида: id → кг. */
  best: Record<string, number>
  xp: number
}

export type AchievementKind = 'catches' | 'species' | 'water' | 'xp' | 'record'

export interface Achievement {
  id: string
  kind: AchievementKind
  title: string
  description: string
  /** Имя значка: картинка sprites/ach-<icon>.webp. У «сотни» и рекорда поверх рисуется сама рыба. */
  icon: string
  /** Рыба достижения — для «сотни» и рекорда. */
  species?: FishSpecies
  /** Сколько нужно набрать; у рекорда — вес в кг. */
  target: number
  /** Сколько уже набрано; у рекорда — лучший вес. */
  value: (stats: PlayerStats) => number
}

export function emptyStats(): PlayerStats {
  return { catches: 0, bySpecies: {}, best: {}, xp: 0 }
}

/** Вес рекорда вида, округлённый вверх до сотых, — как округляется вес пойманной рыбы. */
export function recordWeight(species: FishSpecies): number {
  return Math.ceil(species.maxWeightKg * RECORD_SHARE * 100 - 1e-9) / 100
}

export function achievementsOf(pack: ContentPack): Achievement[] {
  const t = pack.texts.achievements
  const list: Achievement[] = CATCH_GOALS.map((goal) => ({
    id: `catches-${goal}`,
    kind: 'catches',
    ...t.catches(goal),
    icon: CATCH_ICONS[goal],
    target: goal,
    value: (s) => s.catches,
  }))
  for (const species of pack.fish) {
    list.push({
      id: `species-${species.id}`,
      kind: 'species',
      ...t.species(species.name, SPECIES_GOAL),
      icon: 'species',
      species,
      target: SPECIES_GOAL,
      value: (s) => s.bySpecies[species.id] ?? 0,
    })
  }
  for (const water of pack.waters) {
    if (!water.unlockXp) continue
    const need = water.unlockXp
    list.push({ id: `water-${water.id}`, kind: 'water', ...t.water(water.name, need), icon: water.id, target: need, value: (s) => s.xp })
  }
  list.push({ id: `xp-${XP_GOAL}`, kind: 'xp', ...t.xp(XP_GOAL), icon: 'xp', target: XP_GOAL, value: (s) => s.xp })
  for (const species of pack.fish) {
    const target = recordWeight(species)
    list.push({
      id: `record-${species.id}`,
      kind: 'record',
      ...t.record(species.name, formatKg(target)),
      icon: 'record',
      species,
      target,
      value: (s) => s.best[species.id] ?? 0,
    })
  }
  return list
}

const CATCH_ICONS: Record<(typeof CATCH_GOALS)[number], string> = { 1: 'first', 50: 'fifty', 100: 'hundred', 1000: 'thousand' }

export function isDone(a: Achievement, stats: PlayerStats): boolean {
  return a.value(stats) >= a.target - 1e-9
}

/**
 * Журнал достижений игрока: статистика, засчитанные и ещё не просмотренные.
 * «Не просмотрено» — засчитано, но игрок ещё не видел его в меню: отсюда восклицательные знаки.
 */
export class AchievementLog {
  readonly list: readonly Achievement[]
  readonly stats: PlayerStats = emptyStats()
  private readonly done = new Set<string>()
  private readonly unseen = new Set<string>()

  constructor(pack: ContentPack) {
    this.list = achievementsOf(pack)
  }

  /** Учесть пойманную рыбу и опыт после неё. Возвращает достижения, засчитанные этой рыбой. */
  onCatch(fish: HookedFish, xp: number): Achievement[] {
    const s = this.stats
    const id = fish.species.id
    s.catches++
    s.bySpecies[id] = (s.bySpecies[id] ?? 0) + 1
    s.best[id] = Math.max(s.best[id] ?? 0, fish.weightKg)
    s.xp = xp
    const fresh = this.list.filter((a) => !this.done.has(a.id) && isDone(a, s))
    for (const a of fresh) {
      this.done.add(a.id)
      this.unseen.add(a.id)
    }
    return fresh
  }

  isDone(id: string): boolean {
    return this.done.has(id)
  }

  isUnseen(id: string): boolean {
    return this.unseen.has(id)
  }

  get hasUnseen(): boolean {
    return this.unseen.size > 0
  }

  markSeen(id: string): void {
    this.unseen.delete(id)
  }

  /** Полученные и непросмотренные — для сохранения. */
  ids(): { done: string[]; unseen: string[] } {
    return { done: [...this.done], unseen: [...this.unseen] }
  }

  /**
   * Восстановить из сохранения. Неизвестные id пропускаем. Достижения, которые по статистике уже выполнены,
   * но не засчитаны (их добавили в обновлении игры), засчитываем сразу — с восклицательным знаком.
   */
  restore(stats: PlayerStats, done: readonly string[], unseen: readonly string[]): void {
    Object.assign(this.stats, stats)
    const known = new Set(this.list.map((a) => a.id))
    for (const id of done) if (known.has(id)) this.done.add(id)
    for (const id of unseen) if (this.done.has(id)) this.unseen.add(id)
    for (const a of this.list) {
      if (this.done.has(a.id) || !isDone(a, this.stats)) continue
      this.done.add(a.id)
      this.unseen.add(a.id)
    }
  }
}

/** «0,59» — вес в подписи достижения. */
export function formatKg(kg: number): string {
  return String(Math.round(kg * 100) / 100).replace('.', ',')
}

