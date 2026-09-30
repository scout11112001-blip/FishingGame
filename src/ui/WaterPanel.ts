import type { ContentPack, PackTexts, WaterBody } from '../content/types.ts'
import { card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatDepth } from './units.ts'

/** Выбор водоёма: описание и кто там водится. Выбор один — после тапа панель закрывается. */
export class WaterPanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly onChange: (water: WaterBody) => void
  private current: WaterBody

  constructor(pack: ContentPack, current: WaterBody, onChange: (water: WaterBody) => void) {
    this.pack = pack
    this.current = current
    this.onChange = onChange
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
    for (const water of this.pack.waters) {
      const selected = water.id === this.current.id
      const c = card(water.name, water.description, selected ? t.ui.selected : null, () => this.select(water))
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
