import { button, el } from './dom.ts'

/** Сколько миллисекунд после появления кнопки окна не нажимаются: тап, который его открыл, не должен его же закрыть. */
const TAP_GUARD_MS = 300

/**
 * Маленькое окно с вопросом и двумя кнопками. Игру не останавливает — что происходит за ним, решает тот, кто его открыл.
 * «Остаться» — и тап мимо окна, и Esc; «Выйти» — onConfirm.
 */
export class ConfirmDialog {
  private readonly root: HTMLDivElement
  private readonly onConfirm: () => void
  private openedAt = -Infinity

  constructor(texts: { title: string; text: string; confirm: string; cancel: string }, onConfirm: () => void) {
    this.onConfirm = onConfirm
    this.root = el('div', 'confirm-backdrop')
    this.root.hidden = true
    this.root.addEventListener('click', (e) => e.target === this.root && this.close())

    const box = el('div', 'confirm')
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-label', texts.title)
    const actions = el('div', 'confirm-actions')
    actions.append(
      button('confirm-button stay', texts.cancel, () => this.guarded() && this.close()),
      button('confirm-button leave', texts.confirm, () => {
        if (!this.guarded()) return
        this.close()
        this.onConfirm()
      }),
    )
    box.append(el('div', 'confirm-title', texts.title), el('div', 'confirm-text', texts.text), actions)
    this.root.append(box)
    document.body.append(this.root)
    document.addEventListener('keydown', this.onKey)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(): void {
    this.openedAt = performance.now()
    this.root.hidden = false
  }

  close(): void {
    this.root.hidden = true
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey)
    this.root.remove()
  }

  private guarded(): boolean {
    return performance.now() - this.openedAt >= TAP_GUARD_MS
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isOpen) this.close()
  }
}
