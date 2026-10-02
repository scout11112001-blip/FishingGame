import type { ContentPack, Line, Loadout, Reel, Rod } from './types.ts'

// Магазин снастей: серебро игрока и купленные предметы. Ничего не знает об интерфейсе.

export type Slot = keyof Loadout
export type TackleItem = Rod | Line | Reel

export const SLOTS: readonly Slot[] = ['rod', 'line', 'reel']

export function itemsOf(pack: ContentPack, slot: Slot): readonly TackleItem[] {
  return slot === 'rod' ? pack.rods : slot === 'line' ? pack.lines : pack.reels
}

/** Предметы разных слотов могут совпасть по id — ключ с именем слота. */
const keyOf = (slot: Slot, item: TackleItem) => `${slot}:${item.id}`

export class Shop {
  private _silver = 0
  private readonly owned = new Set<string>()

  /** Стартовая снасть и всё без цены — есть с самого начала; с ownAll — вообще всё (тестовая версия). */
  constructor(pack: ContentPack, ownAll = false) {
    for (const slot of SLOTS) {
      for (const item of itemsOf(pack, slot)) if (ownAll || !item.price) this.owned.add(keyOf(slot, item))
      this.owned.add(keyOf(slot, pack.starter[slot]))
    }
  }

  get silver(): number {
    return this._silver
  }

  earn(amount: number): void {
    this._silver += Math.max(0, amount)
  }

  owns(slot: Slot, item: TackleItem): boolean {
    return this.owned.has(keyOf(slot, item))
  }

  /** Сколько ещё не хватает на предмет; 0 — хватает или уже куплен. */
  shortfall(slot: Slot, item: TackleItem): number {
    return this.owns(slot, item) ? 0 : Math.max(0, (item.price ?? 0) - this._silver)
  }

  /** Купленное по слотам — id предметов, для сохранения. */
  ownedIds(): Record<Slot, string[]> {
    const ids: Record<Slot, string[]> = { rod: [], line: [], reel: [] }
    for (const key of this.owned) {
      const [slot, id] = key.split(':') as [Slot, string]
      ids[slot].push(id)
    }
    return ids
  }

  /**
   * Восстановить из сохранения: серебро и купленное поверх того, что есть с начала.
   * Неизвестные id (предмет убрали из игры) пропускаем, серебро — целое и не меньше нуля.
   */
  restore(pack: ContentPack, silver: number, owned: Partial<Record<Slot, readonly string[]>>): void {
    this._silver = Number.isFinite(silver) ? Math.max(0, Math.floor(silver)) : 0
    for (const slot of SLOTS) {
      for (const id of owned[slot] ?? []) {
        const item = itemsOf(pack, slot).find((i) => i.id === id)
        if (item) this.owned.add(keyOf(slot, item))
      }
    }
  }

  /** Купить, если хватает серебра. Уже купленный — true без списания. */
  buy(slot: Slot, item: TackleItem): boolean {
    if (this.owns(slot, item)) return true
    if (this.shortfall(slot, item) > 0) return false
    this._silver -= item.price ?? 0
    this.owned.add(keyOf(slot, item))
    return true
  }
}
