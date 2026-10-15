import { button, el } from './dom.ts'

/**
 * Кнопки поверх игры: внизу слева — между забросами, вверху справа (меню) — и посреди боя: вернуться в главное меню
 * можно в любой момент. Когда что показывать, решает сцена.
 */
export class Hud {
  private readonly bar: HTMLDivElement
  private readonly top: HTMLDivElement
  private lastTopRect: DOMRect | null = null

  constructor() {
    this.bar = el('div', 'hud-bar')
    this.top = el('div', 'hud-top')
    document.body.append(this.bar, this.top)
  }

  addButton(text: string, onClick: () => void): HTMLButtonElement {
    const b = button('hud-button', text, onClick)
    this.bar.append(b)
    return b
  }

  /**
   * Кнопка вверху справа: на телефоне только значок (рядом счётчики, места мало), на широком экране — и подпись.
   * Восклицательный знак рядом с ней включает setAlert.
   */
  addTopButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = button('hud-button hud-icon-button', '', onClick)
    b.setAttribute('aria-label', label)
    b.append(el('span', '', icon), el('span', 'hud-label', label))
    const alert = el('span', 'hud-alert', '!')
    alert.hidden = true
    b.append(alert)
    this.top.append(b)
    return b
  }

  setAlert(b: HTMLButtonElement, on: boolean): void {
    const alert = b.querySelector<HTMLElement>('.hud-alert')
    if (alert && alert.hidden !== !on) alert.hidden = !on
  }

  /**
   * Где кнопки вверху справа, CSS-пиксели. Пока они спрятаны (обучение, открыто меню) — где были в последний раз,
   * чтобы счётчики рядом не прыгали; ни разу не показывались — null.
   */
  get topRect(): DOMRect | null {
    const r = this.top.getBoundingClientRect()
    if (r.width) this.lastTopRect = r
    return this.lastTopRect
  }

  // Меняем DOM только при смене состояния: сцена зовёт это каждый кадр
  setVisible(visible: boolean): void {
    if (this.bar.hidden !== !visible) this.bar.hidden = !visible
  }

  setTopVisible(visible: boolean): void {
    if (this.top.hidden !== !visible) this.top.hidden = !visible
  }

  destroy(): void {
    this.bar.remove()
    this.top.remove()
  }
}
