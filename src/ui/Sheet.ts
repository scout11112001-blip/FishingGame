import { button, el } from './dom.ts'

export interface SheetOptions {
  /** Высота по содержимому, а не во весь экран: для коротких окон. */
  compact?: boolean
  /** Вызывается при любом закрытии — кнопкой, крестиком, мимо панели, Esc. */
  onClose?: () => void
}

/**
 * Модальная панель поверх игры: снизу на телефоне, по центру на широком экране.
 * Закрывается кнопкой «Готово», крестиком, тапом мимо панели и клавишей Esc.
 * Содержимое (вкладки, список) кладёт в body тот, кто её использует.
 */
export class Sheet {
  /** Область между шапкой и кнопкой «Готово». */
  readonly body: HTMLDivElement
  private readonly root: HTMLDivElement
  private readonly onClose?: () => void

  constructor(title: string, doneLabel: string, options: SheetOptions = {}) {
    this.onClose = options.onClose
    this.root = el('div', 'sheet-backdrop')
    this.root.hidden = true
    this.root.addEventListener('click', (e) => e.target === this.root && this.close())

    const sheet = el('div', options.compact ? 'sheet compact' : 'sheet')
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-label', title)

    const header = el('header', 'sheet-header')
    const close = button('sheet-close', '✕', () => this.close())
    close.setAttribute('aria-label', doneLabel)
    header.append(el('h2', '', title), close)

    this.body = el('div', 'sheet-body')
    sheet.append(header, this.body, button('sheet-done', doneLabel, () => this.close()))
    this.root.append(sheet)
    document.body.append(this.root)
    document.addEventListener('keydown', this.onKey)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(): void {
    this.root.hidden = false
  }

  close(): void {
    if (this.root.hidden) return
    this.root.hidden = true
    this.onClose?.()
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKey)
    this.root.remove()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isOpen) this.close()
  }
}
