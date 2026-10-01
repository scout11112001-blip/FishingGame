import { button, el } from './dom.ts'

/** Кнопки поверх игры: внизу слева и вверху справа. Сцена показывает их только между забросами. */
export class Hud {
  private readonly bar: HTMLDivElement
  private readonly top: HTMLDivElement

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

  setVisible(visible: boolean): void {
    // Меняем DOM только при смене состояния: сцена зовёт это каждый кадр
    if (this.bar.hidden !== !visible) {
      this.bar.hidden = !visible
      this.top.hidden = !visible
    }
  }

  destroy(): void {
    this.bar.remove()
    this.top.remove()
  }
}
