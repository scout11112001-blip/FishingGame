import type { ContentPack, WaterBody } from '../content/types.ts'
import { card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'

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
      const row = el('div', 'sheet-fish')
      row.append(el('span', 'sheet-fish-label', `${t.waters.fish}: `), fishList(water))
      c.append(row)
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

/** «карась, плотва, окунь, лещ» — от частых к редким. */
function fishList(water: WaterBody): string {
  return [...water.spawns]
    .sort((a, b) => b.rarity - a.rarity)
    .map((s) => s.species.name.toLocaleLowerCase('ru'))
    .join(', ')
}
