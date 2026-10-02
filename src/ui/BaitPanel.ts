import { showRewardedAd } from '../ads.ts'
import { baitWaters, isBaitActive } from '../content/bait.ts'
import type { PlayerState } from '../content/player.ts'
import type { Bait, ContentPack } from '../content/types.ts'
import { button, card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatDuration } from './units.ts'

/**
 * Выбор прикормки из запаса. Действует одна: пока она не кончилась, другую не включить; включение — минус одна из запаса.
 * Пустой запас — карточка не нажимается, подсказывает, где взять, и даёт получить прикормку за рекламу.
 * Что включили — сообщает наружу через onActivate.
 */
export class BaitPanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly player: PlayerState
  private readonly onActivate: () => void

  constructor(pack: ContentPack, player: PlayerState, onActivate: () => void) {
    this.pack = pack
    this.player = player
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
    const active = this.player.bait
    this.list.replaceChildren()
    for (const bait of this.pack.baits) {
      const on = isBaitActive(active, now) && active.bait.id === bait.id
      const count = this.player.baitCount(bait)
      // Пустой запас — не кнопка: внутри своя кнопка «Получить сейчас». Пока действует прикормка — тоже не кнопка
      const usable = this.player.canUseBait(bait, now)
      const c = card(bait.name, bait.description, on ? t.active : null, usable ? () => this.activate(bait) : null)
      const waters = baitWaters(this.pack, bait).map((w) => w.name)
      c.append(el('div', 'sheet-fish', t.waters(bait.species.name.toLocaleLowerCase('ru'), waters.join(', '))))
      if (on) c.append(el('div', 'sheet-stat', t.left(formatDuration(active.until - now))))
      // Запас: в тестовой версии он бесконечный — тогда не пишем
      if (count < 1) {
        c.classList.add('empty')
        c.append(el('div', 'sheet-buy', t.empty), button('sheet-ad', t.getNow, () => void this.getNow(bait)))
      } else {
        if (Number.isFinite(count)) c.append(el('div', 'sheet-buy', t.stock(count)))
        // Действующей прикормке подсказка не нужна — у неё метка и сколько осталось
        if (!usable && !on) {
          c.classList.add('locked')
          c.append(el('div', 'sheet-stat', t.busy))
        }
      }
      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  /** Прикормка в запас за просмотр рекламы. */
  private async getNow(bait: Bait) {
    if (!(await showRewardedAd())) return
    this.player.addBait(bait)
    this.render()
  }

  private activate(bait: Bait) {
    if (!this.player.useBait(bait, Date.now())) return
    this.onActivate()
    this.render()
  }
}
