import type { ContentPack, Line, Loadout, Reel, Rod } from '../content/types.ts'
import { button, card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { toMeters } from './units.ts'

type Slot = keyof Loadout
type Item = Rod | Line | Reel

interface Stat {
  label: string
  value: string
  /** Заполнение полоски, 0..1 — относительно лучшего предмета в пакете. */
  fill: number
}

const SLOTS: readonly Slot[] = ['rod', 'line', 'reel']

/** Выбор удочки, лески и катушки. Сама ничего не знает об игре: выбор отдаёт наружу через onChange. */
export class TacklePanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly tabs = new Map<Slot, HTMLButtonElement>()
  private readonly pack: ContentPack
  private readonly onChange: (loadout: Loadout) => void
  private loadout: Loadout
  private slot: Slot = 'line'

  constructor(pack: ContentPack, loadout: Loadout, onChange: (loadout: Loadout) => void) {
    this.pack = pack
    this.loadout = loadout
    this.onChange = onChange
    const t = pack.texts

    this.sheet = new Sheet(t.tackle.title, t.ui.done)
    const nav = el('nav', 'sheet-tabs')
    for (const slot of SLOTS) {
      const tab = button('sheet-tab', t.tackle.tabs[slot], () => this.showSlot(slot))
      this.tabs.set(slot, tab)
      nav.append(tab)
    }
    this.list = el('ul', 'sheet-list')
    this.sheet.body.append(nav, this.list)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  open(): void {
    this.showSlot(this.slot)
    this.sheet.open()
  }

  destroy(): void {
    this.sheet.destroy()
  }

  private showSlot(slot: Slot) {
    this.slot = slot
    for (const [s, tab] of this.tabs) tab.classList.toggle('active', s === slot)

    this.list.replaceChildren()
    for (const item of this.itemsOf(slot)) {
      const selected = this.loadout[slot].id === item.id
      const c = card(item.name, item.description, selected ? this.pack.texts.ui.selected : null, () => this.select(slot, item))

      const stat = this.statOf(slot, item)
      const row = el('div', 'sheet-stat')
      row.append(el('span', '', stat.label), el('span', 'sheet-stat-value', stat.value))
      const bar = el('div', 'sheet-bar')
      const fill = el('div', 'sheet-bar-fill')
      fill.style.width = `${Math.round(stat.fill * 100)}%`
      bar.append(fill)
      c.append(row, bar)

      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  private select(slot: Slot, item: Item) {
    this.loadout = { ...this.loadout, [slot]: item }
    this.onChange(this.loadout)
    this.showSlot(slot)
  }

  private itemsOf(slot: Slot): readonly Item[] {
    return slot === 'rod' ? this.pack.rods : slot === 'line' ? this.pack.lines : this.pack.reels
  }

  private statOf(slot: Slot, item: Item): Stat {
    const s = this.pack.texts.tackle.stats
    const max = (values: number[]) => Math.max(...values)
    // Множитель — относительно самого слабого предмета: «×1,7» понятнее, чем «1.7»
    const times = (x: number, values: number[]) => `×${(x / Math.min(...values)).toFixed(1).replace('.', ',')}`
    if (slot === 'rod') {
      const rod = item as Rod
      return { label: s.cast, value: `${toMeters(rod.castMin)}–${toMeters(rod.castMax)} м`, fill: rod.castMax / max(this.pack.rods.map((r) => r.castMax)) }
    }
    if (slot === 'line') {
      const values = this.pack.lines.map((l) => l.strength)
      const line = item as Line
      return { label: s.strength, value: times(line.strength, values), fill: line.strength / max(values) }
    }
    const values = this.pack.reels.map((r) => r.speed)
    const reel = item as Reel
    return { label: s.speed, value: times(reel.speed, values), fill: reel.speed / max(values) }
  }
}
