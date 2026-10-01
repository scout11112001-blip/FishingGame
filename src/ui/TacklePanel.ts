import { itemsOf, SLOTS, type Shop, type Slot, type TackleItem } from '../content/shop.ts'
import type { ContentPack, Line, Loadout, Reel } from '../content/types.ts'
import { button, card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatSilver } from './units.ts'

interface Stat {
  label: string
  value: string
  /** Заполнение полоски, 0..1 — относительно лучшего предмета в пакете. */
  fill: number
}

/**
 * Снасти — инвентарь и магазин сразу: купленное выбирается тапом, у некупленного — цена,
 * тап покупает и сразу надевает. Сама ничего не знает об игре: выбор отдаёт наружу через onChange.
 */
export class TacklePanel {
  private readonly sheet: Sheet
  private readonly balance: HTMLDivElement
  private readonly list: HTMLUListElement
  private readonly tabs = new Map<Slot, HTMLButtonElement>()
  private readonly pack: ContentPack
  private readonly shop: Shop
  private readonly onChange: (loadout: Loadout) => void
  private loadout: Loadout
  private slot: Slot = 'line'

  constructor(pack: ContentPack, loadout: Loadout, shop: Shop, onChange: (loadout: Loadout) => void) {
    this.pack = pack
    this.loadout = loadout
    this.shop = shop
    this.onChange = onChange
    const t = pack.texts

    this.sheet = new Sheet(t.tackle.title, t.ui.done)
    this.balance = el('div', 'sheet-balance')
    const nav = el('nav', 'sheet-tabs')
    for (const slot of SLOTS) {
      const tab = button('sheet-tab', t.tackle.tabs[slot], () => this.showSlot(slot))
      this.tabs.set(slot, tab)
      nav.append(tab)
    }
    this.list = el('ul', 'sheet-list')
    this.sheet.body.append(this.balance, nav, this.list)
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
    const t = this.pack.texts.tackle
    this.slot = slot
    for (const [s, tab] of this.tabs) tab.classList.toggle('active', s === slot)
    this.balance.textContent = t.balance(formatSilver(this.shop.silver))

    this.list.replaceChildren()
    for (const item of itemsOf(this.pack, slot)) {
      const selected = this.loadout[slot].id === item.id
      const c = card(item.name, item.description, selected ? this.pack.texts.ui.selected : null, () => this.pick(slot, item))

      const owned = this.shop.owns(slot, item)
      const short = this.shop.shortfall(slot, item)
      if (!owned) {
        const price = formatSilver(item.price ?? 0)
        c.querySelector('.sheet-card-title')?.append(el('span', 'sheet-price', price))
        if (short) c.classList.add('locked')
      }

      const stat = this.statOf(slot, item)
      if (stat) {
        const row = el('div', 'sheet-stat')
        row.append(el('span', '', stat.label), el('span', 'sheet-stat-value', stat.value))
        const bar = el('div', 'sheet-bar')
        const fill = el('div', 'sheet-bar-fill')
        fill.style.width = `${Math.round(stat.fill * 100)}%`
        bar.append(fill)
        c.append(row, bar)
      }
      if (!owned) c.append(el('div', 'sheet-buy', short ? t.notEnough(formatSilver(short)) : t.buy(formatSilver(item.price ?? 0))))

      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  /** Купленное — надеть; некупленное — купить, если хватает, и сразу надеть. */
  private pick(slot: Slot, item: TackleItem) {
    if (!this.shop.buy(slot, item)) return
    this.loadout = { ...this.loadout, [slot]: item }
    this.onChange(this.loadout)
    this.showSlot(slot)
  }

  /** Числовая характеристика предмета. У удочки её нет: что она даёт, сказано в описании. */
  private statOf(slot: Slot, item: TackleItem): Stat | null {
    const s = this.pack.texts.tackle.stats
    const max = (values: number[]) => Math.max(...values)
    // Множитель — относительно самого слабого предмета: «×1,7» понятнее, чем «1.7»
    const times = (x: number, values: number[]) => `×${(x / Math.min(...values)).toFixed(1).replace('.', ',')}`
    if (slot === 'rod') return null
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
