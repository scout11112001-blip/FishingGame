import type { PlayerState } from '../content/player.ts'
import type { ContentPack } from '../content/types.ts'
import { el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatSilver } from './units.ts'

/**
 * Окно награды за вход: лента дней серии — забранные, сегодняшний и будущие — и кнопка «Забрать».
 * Награда выдаётся при любом закрытии окна: случайно смахнуть её нельзя.
 */
export class DailyPanel {
  private readonly sheet: Sheet
  private readonly days: HTMLDivElement
  private readonly pack: ContentPack
  private readonly player: PlayerState
  private today = ''

  constructor(pack: ContentPack, player: PlayerState) {
    this.pack = pack
    this.player = player
    const t = pack.texts.daily
    this.sheet = new Sheet(t.title, t.claim, { compact: true, onClose: () => this.player.claimDaily(this.today) })
    this.days = el('div', 'daily-days')
    this.sheet.body.append(el('div', 'sheet-card-desc daily-note', t.note), this.days)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  /** Показать награду дня today (dayKey). */
  open(today: string): void {
    const index = this.player.dailyOffer(today)
    if (index === null) return
    this.today = today
    this.render(index)
    this.sheet.open()
  }

  destroy(): void {
    this.sheet.destroy()
  }

  private render(index: number) {
    const t = this.pack.texts.daily
    const silverIcon = this.pack.art?.silver
    this.days.replaceChildren()
    this.pack.daily.forEach((reward, i) => {
      const state = i < index ? 'taken' : i === index ? 'today' : 'later'
      const day = el('div', `daily-day ${state}`)
      day.append(el('div', 'daily-day-name', state === 'taken' ? `✓ ${t.day(i + 1)}` : t.day(i + 1)))
      const silver = el('div', 'daily-reward')
      if (silverIcon) {
        const img = el('img', 'daily-coin')
        img.src = silverIcon
        img.alt = ''
        silver.append(img)
      }
      silver.append(formatSilver(reward.silver))
      day.append(silver)
      if (reward.bait) day.append(el('div', 'daily-reward daily-bait', reward.bait.name))
      this.days.append(day)
    })
  }
}
