import { formatKg, isDone, type Achievement, type AchievementLog } from '../content/achievements.ts'
import type { ContentPack } from '../content/types.ts'
import { el } from './dom.ts'
import { Sheet } from './Sheet.ts'

/** Значок, пока нет картинки: такой же по смыслу эмодзи. */
const FALLBACK: Record<string, string> = {
  first: '🎣',
  fifty: '🪣',
  hundred: '🪣',
  thousand: '🏆',
  species: '🐟',
  record: '👑',
  xp: '⭐',
}
/** Значки водоёмов называются по id водоёма — им всем один запасной. */
const WATER_FALLBACK = '🏞️'

/**
 * Меню достижений: слева значок, справа название, задание и прогресс.
 * Новое засчитанное — с восклицательным знаком на краю; он гаснет, когда карточку увидели в списке.
 */
export class AchievementPanel {
  private readonly sheet: Sheet
  private readonly list: HTMLUListElement
  private readonly pack: ContentPack
  private readonly log: AchievementLog
  private observer: IntersectionObserver | null = null

  constructor(pack: ContentPack, log: AchievementLog) {
    this.pack = pack
    this.log = log
    this.sheet = new Sheet(pack.texts.achievements.title, pack.texts.ui.done)
    this.list = el('ul', 'sheet-list')
    this.sheet.body.append(this.list)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  open(): void {
    this.render()
    this.sheet.open()
    // Сразу к первому новому: иначе оно может прятаться внизу длинного списка
    this.list.querySelector('.ach-card.unseen')?.scrollIntoView({ block: 'nearest' })
  }

  destroy(): void {
    this.observer?.disconnect()
    this.sheet.destroy()
  }

  private render() {
    this.observer?.disconnect()
    // Просмотрено — когда карточка почти целиком попала в видимую часть списка.
    // Знак на ней остаётся до следующего открытия меню, чтобы игрок успел заметить, что нового.
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) this.log.markSeen((e.target as HTMLElement).dataset.id!)
      },
      { root: this.list, threshold: 0.6 },
    )
    this.list.replaceChildren()
    for (const a of this.log.list) {
      const li = el('li')
      const c = this.card(a)
      li.append(c)
      this.list.append(li)
      if (this.log.isUnseen(a.id)) this.observer.observe(c)
    }
  }

  private card(a: Achievement): HTMLDivElement {
    const t = this.pack.texts.achievements
    const stats = this.log.stats
    const done = isDone(a, stats)
    const c = el('div', `sheet-card ach-card${done ? ' done' : ''}${this.log.isUnseen(a.id) ? ' unseen' : ''}`)
    c.dataset.id = a.id
    if (this.log.isUnseen(a.id)) c.append(el('span', 'ach-alert', '!'))

    const body = el('div', 'ach-body')
    const title = el('div', 'sheet-card-title')
    title.append(el('span', 'sheet-card-name', a.title))
    if (done) title.append(el('span', 'sheet-badge', t.done))
    body.append(title, el('div', 'sheet-card-desc', a.description))

    if (!done) {
      const value = a.value(stats)
      const text = a.kind === 'record' ? (value ? t.best(formatKg(value)) : '') : t.progress(Math.floor(value), a.target)
      if (text) body.append(el('div', 'sheet-stat', text))
      const bar = el('div', 'sheet-bar')
      const fill = el('div', 'sheet-bar-fill')
      fill.style.width = `${Math.round(Math.min(1, value / a.target) * 100)}%`
      bar.append(fill)
      body.append(bar)
    }

    c.append(this.icon(a), body)
    return c
  }

  /** Значок: картинка достижения, у «сотни» и рекорда — с рыбой поверх. Без картинки — эмодзи. */
  private icon(a: Achievement): HTMLDivElement {
    const box = el('div', 'ach-icon')
    const img = el('img')
    img.alt = ''
    img.src = `sprites/ach-${a.icon}.webp`
    img.addEventListener('error', () => {
      img.remove()
      // У «сотни» и рекорда без картинки достаточно самой рыбы
      if (!a.species) box.prepend(el('span', 'ach-emoji', FALLBACK[a.icon] ?? WATER_FALLBACK))
    })
    box.append(img)
    const fish = a.species && this.pack.art?.fish[a.species.id]
    if (fish) {
      const f = el('img', 'ach-fish')
      f.alt = ''
      f.src = fish
      box.append(f)
    }
    return box
  }
}
