import { baitWaters, isBaitActive } from '../content/bait.ts'
import type { PlayerState } from '../content/player.ts'
import type { Platform } from '../platform/platform.ts'
import type { Bait, ContentPack } from '../content/types.ts'
import { button, card, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatDuration, formatSilver } from './units.ts'

/**
 * Сколько миллисекунд после перерисовки кнопки не нажимаются. Иначе второй тап двойного нажатия попадает в кнопку,
 * которая встала на то же место: «Купить» покупает вторую, а у только что купленной — «Включить» сразу включает её.
 */
const TAP_GUARD_MS = 400

/**
 * Прикормки: запас, покупка и включение. Действует одна: пока она не кончилась, другую не включить; включение — минус одна
 * из запаса. Прикормку можно купить за серебро в любой момент, а при пустом запасе — ещё и получить за рекламу.
 * Сама карточка не нажимается: в ней свои кнопки (кнопка в кнопке не работает). Что включили — сообщает наружу через onActivate.
 */
export class BaitPanel {
  private readonly sheet: Sheet
  private readonly balance: HTMLDivElement
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly player: PlayerState
  private readonly platform: Platform
  private readonly onActivate: () => void
  private renderedAt = 0
  private adPending = false

  constructor(pack: ContentPack, player: PlayerState, platform: Platform, onActivate: () => void) {
    this.pack = pack
    this.player = player
    this.platform = platform
    this.onActivate = onActivate
    this.sheet = new Sheet(pack.texts.bait.title, pack.texts.ui.done)
    this.balance = el('div', 'sheet-balance')
    this.list = el('ul', 'sheet-list')
    this.sheet.body.append(this.balance, this.list)
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
    const silver = this.player.shop.silver
    const now = this.platform.now()
    const active = this.player.bait
    this.renderedAt = performance.now()
    this.balance.textContent = this.pack.texts.tackle.balance(formatSilver(silver))
    this.list.replaceChildren()
    for (const bait of this.pack.baits) {
      const on = isBaitActive(active, now) && active.bait.id === bait.id
      const count = this.player.baitCount(bait)
      const c = card(bait.name, bait.description, on ? t.active : null, null)
      c.classList.add('bait-card')
      const waters = baitWaters(this.pack, bait).map((w) => w.name)
      c.append(el('div', 'sheet-fish', t.waters(bait.species.name.toLocaleLowerCase('ru'), waters.join(', '))))
      if (on) c.append(el('div', 'sheet-stat', t.left(formatDuration(active.until - now))))

      const actions = el('div', 'sheet-actions')
      // Запас: в тестовой версии он бесконечный — тогда не пишем и не продаём
      if (count < 1) {
        c.classList.add('empty')
        c.append(el('div', 'sheet-buy', t.empty))
      } else if (Number.isFinite(count)) {
        c.append(el('div', 'sheet-buy', t.stock(count)))
      }
      if (this.player.canUseBait(bait, now)) actions.append(this.action('sheet-act use', t.use, () => this.activate(bait)))
      // Действующей прикормке подсказка не нужна — у неё метка и сколько осталось
      else if (count >= 1 && !on) c.append(el('div', 'sheet-stat', t.busy))
      if (Number.isFinite(count)) {
        const short = Math.max(0, bait.price - silver)
        const tackle = this.pack.texts.tackle
        const buy = this.action('sheet-act buy', short ? tackle.notEnough(formatSilver(short)) : tackle.buy(formatSilver(bait.price)), () => this.buy(bait))
        buy.disabled = short > 0
        actions.append(buy)
      }
      if (count < 1) {
        const ad = this.action('sheet-act sheet-ad', t.getNow, () => void this.getNow(bait))
        // Без рекламы (не на площадке) — кнопка видна, но не нажимается
        ad.disabled = !this.platform.rewardedAds
        actions.append(ad)
      }
      if (actions.childElementCount) c.append(actions)
      const li = el('li')
      li.append(c)
      this.list.append(li)
    }
  }

  /** Кнопка карточки, которая сразу после перерисовки не нажимается (см. TAP_GUARD_MS). */
  private action(className: string, text: string, onClick: () => void): HTMLButtonElement {
    return button(className, text, () => {
      if (performance.now() - this.renderedAt >= TAP_GUARD_MS) onClick()
    })
  }

  /** Прикормка в запас за серебро. */
  private buy(bait: Bait) {
    if (!this.player.buyBait(bait)) return
    this.render()
  }

  /** Прикормка в запас за просмотр рекламы. */
  private async getNow(bait: Bait) {
    // Пока реклама грузится или идёт, панель не перерисована — повторный тап не должен запросить вторую поверх первой
    if (this.adPending) return
    this.adPending = true
    const rewarded = await this.platform.showRewardedAd().finally(() => (this.adPending = false))
    if (!rewarded) return
    this.player.addBait(bait)
    this.render()
  }

  private activate(bait: Bait) {
    if (!this.player.useBait(bait, this.platform.now())) return
    this.onActivate()
    this.render()
  }
}
