import { el } from './dom.ts'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Сколько миллисекунд карточку нельзя закрыть: чтобы тап (или пробел), которым игрок только что подсекал, её не пролистнул. */
const TAP_GUARD_MS = 400
const GAP = 14
const MARGIN = 12

/**
 * Слой обучения поверх игры: экран затемнён, подсвеченный элемент — в вырезе с пульсирующей рамкой,
 * рядом карточка с подсказкой. Карточка, которая ждёт тапа, ловит нажатия на весь экран; остальные
 * пропускают их в игру — там игрок должен сам забросить или подсечь.
 */
export class TutorialOverlay {
  private readonly root: HTMLDivElement
  private readonly hole: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly title: HTMLDivElement
  private readonly text: HTMLDivElement
  private readonly hint: HTMLDivElement
  private key: string | null = null
  private shownAt = 0
  private tapToContinue = false
  private readonly onTap: () => void

  constructor(onTap: () => void) {
    this.onTap = onTap
    this.root = el('div', 'tut-overlay')
    this.root.hidden = true
    this.hole = el('div', 'tut-hole')
    this.card = el('div', 'tut-card')
    this.title = el('div', 'tut-title')
    this.text = el('div', 'tut-text')
    this.hint = el('div', 'tut-hint')
    this.card.append(this.title, this.text, this.hint)
    this.root.append(this.hole, this.card)
    this.root.addEventListener('click', () => this.tap())
    document.body.append(this.root)
  }

  /** Нажатие по карточке — тапом или пробелом. Только что появившуюся не листает. */
  tap(): void {
    if (this.tapToContinue && performance.now() - this.shownAt > TAP_GUARD_MS) this.onTap()
  }

  /** Показать шаг. key — его имя: тексты и анимация появления обновляются, только когда шаг сменился. */
  show(key: string, title: string, text: string, hint: string | null, tapToContinue: boolean): void {
    this.root.hidden = false
    this.tapToContinue = tapToContinue
    this.root.classList.toggle('passthrough', !tapToContinue)
    if (key === this.key) return
    this.key = key
    this.shownAt = performance.now()
    this.title.textContent = title
    this.text.textContent = text
    this.hint.textContent = hint ?? ''
    this.hint.hidden = !hint
    // Перезапуск анимации «выпрыгивания» карточки
    this.card.classList.remove('pop')
    void this.card.offsetWidth
    this.card.classList.add('pop')
  }

  /** Вырез и карточка — у элемента rect (в CSS-пикселях экрана); без него карточка посередине. Зовётся каждый кадр. */
  place(rect: Rect | null): void {
    if (this.root.hidden) return
    const W = window.innerWidth
    const H = window.innerHeight
    this.root.classList.toggle('dim', !rect)
    this.hole.hidden = !rect
    const cardH = this.card.offsetHeight
    const cardW = this.card.offsetWidth
    let left = (W - cardW) / 2
    let top: number
    if (rect) {
      // Вырез не выходит за экран: иначе рамка у полосы внизу обрезается краем
      const x = Math.max(rect.x, 2)
      const y = Math.max(rect.y, 2)
      rect = { x, y, w: Math.min(rect.x + rect.w, W - 2) - x, h: Math.min(rect.y + rect.h, H - 2) - y }
      setBox(this.hole, rect)
      const above = rect.y - MARGIN
      const below = H - rect.y - rect.h - MARGIN
      const leftSide = rect.x - MARGIN
      const rightSide = W - rect.x - rect.w - MARGIN
      if (Math.max(above, below) < cardH + GAP && Math.max(leftSide, rightSide) >= cardW + GAP) {
        // Низкий экран (телефон лёжа): ни над вырезом, ни под ним карточка не помещается — встаёт сбоку
        left = rightSide >= leftSide ? rect.x + rect.w + GAP : rect.x - GAP - cardW
        top = rect.y + rect.h / 2 - cardH / 2
      } else top = below >= above ? rect.y + rect.h + GAP : rect.y - GAP - cardH
    } else {
      top = (H - cardH) / 2
    }
    top = Math.min(Math.max(top, MARGIN), H - cardH - MARGIN)
    left = Math.min(Math.max(left, MARGIN), W - cardW - MARGIN)
    this.card.style.left = `${left}px`
    this.card.style.top = `${top}px`
  }

  hide(): void {
    this.root.hidden = true
    this.key = null
  }

  destroy(): void {
    this.root.remove()
  }
}

function setBox(node: HTMLElement, r: Rect) {
  node.style.left = `${r.x}px`
  node.style.top = `${r.y}px`
  node.style.width = `${r.w}px`
  node.style.height = `${r.h}px`
}
