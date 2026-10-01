import { weakestFittingRod, type ContentPack, type PackTexts, type WaterBody } from '../content/types.ts'
import { isWaterOpen } from '../content/progress.ts'
import { card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatDepth } from './units.ts'

/** Выбор водоёма: описание и кто там водится. Выбор один — после тапа панель закрывается. Закрытые — со счётчиком опыта. */
export class WaterPanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly onChange: (water: WaterBody) => void
  private readonly getXp: () => number
  /** Все водоёмы открыты независимо от опыта — тестовая версия. */
  private readonly unlockAll: boolean
  private current: WaterBody

  constructor(pack: ContentPack, current: WaterBody, getXp: () => number, onChange: (water: WaterBody) => void, unlockAll = false) {
    this.pack = pack
    this.current = current
    this.getXp = getXp
    this.onChange = onChange
    this.unlockAll = unlockAll
    this.sheet = new Sheet(pack.texts.waters.title, pack.texts.ui.done)
    this.list = el('ul', 'sheet-list')
    this.sheet.body.append(this.list)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  open(): void {
    this.render()
    this.sheet.open()
  }

  destroy(): void {
    this.sheet.destroy()
  }

  private render() {
    const t = this.pack.texts
    this.list.replaceChildren()
    const xp = this.getXp()
    for (const water of this.pack.waters) {
      const selected = water.id === this.current.id
      const open = this.unlockAll || isWaterOpen(water, xp)
      const c = card(water.name, water.description, selected ? t.ui.selected : null, () => open && this.select(water))
      if (!open) {
        const need = water.unlockXp ?? 0
        c.classList.add('locked')
        c.append(el('div', 'sheet-stat', t.waters.locked(need, need - xp)))
      }
      // Удочку называем, только если подходит не любая
      const rod = water.minCastLevels ? weakestFittingRod(this.pack, water) : undefined
      if (rod) c.append(el('div', 'sheet-stat', t.cast.needsRod(rod.name)))
      for (const line of zoneLines(water, t)) c.append(el('div', 'sheet-fish', line))
      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  private select(water: WaterBody) {
    this.current = water
    this.onChange(water)
    this.sheet.close()
  }
}

/**
 * По строке на место ловли: «Мелководье у камыша, глубина 1 м: карась, плотва», дальше — только новая рыба: «…: + окунь».
 * Новую рыбу — от частой к редкой.
 */
function zoneLines(water: WaterBody, t: PackTexts): string[] {
  const seen = new Set<string>()
  return water.zones.map((zone, i) => {
    const fresh = [...zone.spawns].sort((a, b) => b.rarity - a.rarity).filter((s) => !seen.has(s.species.id))
    for (const s of fresh) seen.add(s.species.id)
    const names = fresh.map((s) => s.species.name.toLocaleLowerCase('ru')).join(', ')
    return t.waters.zone(zone.name, formatDepth(zone.depthM), i === 0 ? names : `+ ${names}`)
  })
}
