import { button, el } from './dom.ts'

/**
 * Кнопка звука в левом верхнем углу — зеркально кнопке достижений. Видна всегда, даже в бою:
 * выключить звук игрок может захотеть в любой момент. Значок показывает, включён ли звук сейчас.
 */
export class SoundButton {
  private readonly root: HTMLDivElement
  private readonly button: HTMLButtonElement
  private readonly icon: HTMLSpanElement
  private readonly labels: { mute: string; unmute: string }
  private muted: boolean

  constructor(muted: boolean, labels: { mute: string; unmute: string }, onToggle: (muted: boolean) => void) {
    this.muted = muted
    this.labels = labels
    this.root = el('div', 'hud-corner')
    this.icon = el('span')
    this.button = button('hud-button hud-icon-button', '', () => {
      this.muted = !this.muted
      this.render()
      onToggle(this.muted)
    })
    this.button.append(this.icon)
    this.root.append(this.button)
    document.body.append(this.root)
    this.render()
  }

  /** Правый край кнопки на экране, CSS-пиксели: счётчики встают правее. */
  get right(): number {
    return this.button.getBoundingClientRect().right
  }

  destroy(): void {
    this.root.remove()
  }

  private render() {
    this.icon.textContent = this.muted ? '🔇' : '🔊'
    this.button.setAttribute('aria-label', this.muted ? this.labels.unmute : this.labels.mute)
    this.button.setAttribute('aria-pressed', String(this.muted))
  }
}
