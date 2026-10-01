import { baitWaters, isBaitActive, type ActiveBait } from '../content/bait.ts'
import type { Bait, ContentPack } from '../content/types.ts'
import { card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatDuration } from './units.ts'

/**
 * Выбор прикормки. Действует одна: новая заменяет прежнюю, повторный тап по действующей — продлевает.
 * Сама ничего не знает об игре: выбор отдаёт наружу через onActivate, а что сейчас действует — спрашивает через getActive.
 */
export class BaitPanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly getActive: () => ActiveBait | null
  private readonly onActivate: (bait: Bait) => void

  constructor(pack: ContentPack, getActive: () => ActiveBait | null, onActivate: (bait: Bait) => void) {
    this.pack = pack
    this.getActive = getActive
    this.onActivate = onActivate
    this.sheet = new Sheet(pack.texts.bait.title, pack.texts.ui.done)
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
    const t = this.pack.texts.bait
    const now = Date.now()
    const active = this.getActive()
    this.list.replaceChildren()
    for (const bait of this.pack.baits) {
      const on = isBaitActive(active, now) && active.bait.id === bait.id
      const c = card(bait.name, bait.description, on ? t.active : null, () => this.activate(bait))
      const waters = baitWaters(this.pack, bait).map((w) => w.name)
      c.append(el('div', 'sheet-fish', t.waters(bait.species.name.toLocaleLowerCase('ru'), waters.join(', '))))
      if (on) c.append(el('div', 'sheet-stat', t.left(formatDuration(active.until - now))))
      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  private activate(bait: Bait) {
    this.onActivate(bait)
    this.render()
  }
}
