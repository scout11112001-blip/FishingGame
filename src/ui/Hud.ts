import { button, el } from './dom.ts'

/** Кнопки внизу слева поверх игры. Сцена показывает их только между забросами. */
export class Hud {
  private readonly bar: HTMLDivElement

  constructor() {
    this.bar = el('div', 'hud-bar')
    document.body.append(this.bar)
  }

  addButton(text: string, onClick: () => void): HTMLButtonElement {
    const b = button('hud-button', text, onClick)
    this.bar.append(b)
    return b
  }

  setVisible(visible: boolean): void {
    // Меняем DOM только при смене состояния: сцена зовёт это каждый кадр
    if (this.bar.hidden !== !visible) this.bar.hidden = !visible
  }

  destroy(): void {
    this.bar.remove()
  }
}
