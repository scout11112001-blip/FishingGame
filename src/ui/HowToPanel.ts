import type { ContentPack } from '../content/types.ts'
import { card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'

/** «Как играть»: правила игры по разделам — для тех, кто пропустил или забыл обучение. */
export class HowToPanel {
  private readonly sheet: Sheet

  constructor(pack: ContentPack) {
    const t = pack.texts.howTo
    this.sheet = new Sheet(t.title, pack.texts.ui.done)
    const list = el('ul', 'sheet-list')
    for (const section of t.sections) {
      const c = card(section.title, section.text, null, null)
      c.classList.add('info-card')
      const li = el('li')
      li.append(c)
      list.append(li)
    }
    this.sheet.body.append(list)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  open(): void {
    this.sheet.open()
  }

  destroy(): void {
    this.sheet.destroy()
  }
}
