import { button, el } from './dom.ts'

export interface MenuItem {
  icon: string
  label: string
  onClick: () => void
  /** Гореть ли восклицательному знаку на плитке (новые достижения) — проверяется при каждом открытии. */
  alert?: () => boolean
}

export interface MenuContent {
  title: string
  tagline: string
  play: string
  resume: string
  items: readonly MenuItem[]
  onPlay: () => void
}

/** Как открыть меню: фон, строка с успехами (нет — не показываем) и что на главной кнопке. */
export interface MenuState {
  background: string | null
  stats: string | null
  resume: boolean
}

/**
 * Главное меню во весь экран: размытая картинка, название, большая кнопка «Играть» и плитки со всеми разделами игры.
 * Открывается при запуске и по кнопке в углу. Панели разделов открываются поверх меню, закрылись — меню на месте.
 */
export class MainMenu {
  private readonly root: HTMLDivElement
  private readonly bg: HTMLDivElement
  private readonly stats: HTMLDivElement
  private readonly play: HTMLButtonElement
  private readonly content: MenuContent
  private readonly tiles: { item: MenuItem; alert: HTMLSpanElement }[] = []
  private background: string | null = null

  constructor(content: MenuContent) {
    this.content = content
    this.root = el('div', 'menu')
    this.root.hidden = true
    this.bg = el('div', 'menu-bg')
    const body = el('div', 'menu-body')

    const head = el('div', 'menu-head')
    head.append(el('h1', 'menu-title', content.title), el('div', 'menu-tagline', content.tagline))
    this.stats = el('div', 'menu-stats')
    head.append(this.stats)

    this.play = button('menu-play', content.play, () => this.close())
    const grid = el('div', 'menu-grid')
    for (const item of content.items) {
      const tile = button('menu-tile', '', item.onClick)
      const alert = el('span', 'hud-alert', '!')
      alert.hidden = true
      tile.append(el('span', 'menu-tile-icon', item.icon), el('span', 'menu-tile-label', item.label), alert)
      grid.append(tile)
      this.tiles.push({ item, alert })
    }

    body.append(head, this.play, grid)
    this.root.append(this.bg, el('div', 'menu-shade'), body)
    // Фон больше экрана, и в браузерах без overflow: clip слой меню может съехать (например, при повороте) — возвращаем
    this.root.addEventListener('scroll', () => this.root.scrollTo(0, 0))
    document.body.append(this.root)
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(state: MenuState): void {
    this.setBackground(state.background)
    this.stats.textContent = state.stats ?? ''
    this.stats.hidden = !state.stats
    this.play.textContent = state.resume ? this.content.resume : this.content.play
    this.syncAlerts()
    this.root.hidden = false
  }

  /**
   * Фон — когда картинка загрузится, с плавным появлением: при первом запуске она ещё грузится, и без этого
   * сначала мелькнул бы пустой тёмный экран, а потом резко картинка. Та же картинка — ничего не трогаем.
   */
  private setBackground(src: string | null) {
    if (src === this.background) return
    this.background = src
    this.bg.classList.remove('loaded')
    if (!src) return
    const img = new Image()
    img.onload = () => {
      // Пока грузилась, фон могли сменить
      if (this.background !== src) return
      this.bg.style.backgroundImage = `url("${src}")`
      this.bg.classList.add('loaded')
    }
    img.src = src
  }

  /** Восклицательные знаки на плитках — по текущему состоянию. Сцена зовёт каждый кадр: DOM трогаем только при смене. */
  syncAlerts(): void {
    for (const { item, alert } of this.tiles) {
      const on = !!item.alert?.()
      if (alert.hidden === on) alert.hidden = !on
    }
  }

  close(): void {
    if (this.root.hidden) return
    this.root.hidden = true
    this.content.onPlay()
  }

  destroy(): void {
    this.root.remove()
  }
}
