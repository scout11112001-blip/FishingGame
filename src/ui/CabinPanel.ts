import { formatKg } from '../content/achievements.ts'
import type { PlayerState } from '../content/player.ts'
import type { CabinContent, ContentPack, Furniture } from '../content/types.ts'
import { button, el } from './dom.ts'
import { Sheet } from './Sheet.ts'
import { formatSilver } from './units.ts'

/**
 * Хижина: сверху комната, где купленная мебель стоит на своих местах, ниже — список мебели и стена трофеев
 * (самая крупная рыба каждого вида с весом и датой). Всё прокручивается одним списком: комната на телефоне
 * занимает почти весь экран. Мебель только для красоты; покупка — тапом, как снасть в магазине.
 */
export class CabinPanel {
  private readonly sheet: Sheet
  private readonly balance: HTMLDivElement
  private readonly scroll: HTMLDivElement
  private readonly room: HTMLDivElement
  private readonly empty: HTMLDivElement
  private readonly list: HTMLUListElement
  private readonly wall: HTMLDivElement
  /** Предмет в комнате по id мебели: стоит, только когда куплен. */
  private readonly pieces = new Map<string, HTMLDivElement>()
  private readonly pack: ContentPack
  private readonly cabin: CabinContent
  private readonly player: PlayerState

  constructor(pack: ContentPack, cabin: CabinContent, player: PlayerState) {
    this.pack = pack
    this.cabin = cabin
    this.player = player
    const t = pack.texts.cabin

    this.sheet = new Sheet(t.title, pack.texts.ui.done)
    this.balance = el('div', 'sheet-balance')
    this.scroll = el('div', 'cabin-scroll')

    // Комната строится сразу, а не при открытии: картинки успеют загрузиться, пока игрок рыбачит
    this.room = el('div', 'cabin-room')
    const interior = el('img', 'cabin-interior')
    interior.alt = ''
    interior.src = cabin.interior
    this.room.append(interior)
    for (const item of cabin.furniture) {
      const piece = this.piece(item)
      this.pieces.set(item.id, piece)
      this.room.append(piece)
    }
    this.empty = el('div', 'cabin-empty', t.empty)
    this.room.append(this.empty)

    this.list = el('ul', 'cabin-list')
    this.wall = el('div', 'cabin-wall')
    this.scroll.append(
      this.room,
      el('h3', 'cabin-heading', t.furniture),
      this.list,
      el('h3', 'cabin-heading', t.trophies),
      el('div', 'sheet-card-desc', t.trophiesNote),
      this.wall,
    )
    this.sheet.body.append(this.balance, this.scroll)
  }

  get isOpen(): boolean {
    return this.sheet.isOpen
  }

  open(): void {
    this.render()
    this.sheet.open()
    this.scroll.scrollTop = 0
  }

  destroy(): void {
    this.sheet.destroy()
  }

  /** Предмет в комнате: тень на полу и картинка. Ближе к зрителю (ниже на картинке) — поверх дальних. */
  private piece(item: Furniture): HTMLDivElement {
    const { x, bottom, width } = item.place
    const piece = el('div', 'cabin-piece')
    piece.style.left = `${(x - width / 2) * 100}%`
    piece.style.width = `${width * 100}%`
    piece.style.bottom = `${(1 - bottom) * 100}%`
    piece.style.zIndex = String(Math.round(this.depth(item) * 1000))
    piece.hidden = true
    const shadow = el('div', 'cabin-shadow')
    const share = item.shadow ?? 0.95
    shadow.style.width = `${share * 100}%`
    shadow.style.left = `${((1 - share) / 2) * 100}%`
    const img = el('img')
    img.alt = item.name
    img.src = item.sprite
    piece.append(shadow, img)
    return piece
  }

  /** Насколько предмет близко к зрителю: по тому, где он касается пола. Стоящий на другом — сразу перед ним. */
  private depth(item: Furniture): number {
    const base = item.on && this.cabin.furniture.find((f) => f.id === item.on)
    return base ? this.depth(base) + 0.001 : item.place.bottom
  }

  private render() {
    const t = this.pack.texts
    this.balance.textContent = t.tackle.balance(formatSilver(this.player.shop.silver))

    let any = false
    for (const item of this.cabin.furniture) {
      const owned = this.player.ownsFurniture(item)
      this.pieces.get(item.id)!.hidden = !owned
      any ||= owned
    }
    this.empty.hidden = any

    this.list.replaceChildren()
    for (const item of this.cabin.furniture) {
      const li = el('li')
      li.append(this.card(item))
      this.list.append(li)
    }

    this.wall.replaceChildren()
    for (const species of this.pack.fish) this.wall.append(this.trophy(species.id, species.name))
  }

  /** Карточка мебели: картинка, название, цена или «стоит в хижине», что мешает купить. */
  private card(item: Furniture): HTMLElement {
    const t = this.pack.texts
    const owned = this.player.ownsFurniture(item)
    const base = this.player.missingBase(item)
    const short = Math.max(0, item.price - this.player.shop.silver)
    const c = owned ? el('div', 'sheet-card cabin-card selected') : button('sheet-card cabin-card', '', () => this.buy(item))
    if (!owned && (base || short)) c.classList.add('locked')

    const icon = el('div', 'cabin-card-icon')
    const img = el('img')
    img.alt = ''
    img.src = item.icon ?? item.sprite
    icon.append(img)

    const body = el('div', 'cabin-card-body')
    const title = el('div', 'sheet-card-title')
    title.append(el('span', 'sheet-card-name', item.name))
    title.append(owned ? el('span', 'sheet-badge', t.cabin.placed) : el('span', 'sheet-price', formatSilver(item.price)))
    body.append(title)
    if (item.description) body.append(el('div', 'sheet-card-desc', item.description))
    if (!owned) {
      const why = base ? t.cabin.needs(base.name) : short ? t.tackle.notEnough(formatSilver(short)) : t.tackle.buy(formatSilver(item.price))
      body.append(el('div', 'sheet-buy', why))
    }
    c.append(icon, body)
    return c
  }

  /** Табличка на стене: рыба, вес и дата; не пойманная — тёмный силуэт. */
  private trophy(id: string, name: string): HTMLDivElement {
    const t = this.pack.texts.cabin
    const stats = this.player.achievements.stats
    const kg = stats.best[id]
    const plaque = el('div', kg ? 'cabin-trophy' : 'cabin-trophy missing')
    const art = this.pack.art?.fish[id]
    if (art) {
      const img = el('img')
      img.alt = ''
      img.src = art
      plaque.append(img)
    }
    plaque.append(el('div', 'cabin-trophy-name', name))
    if (kg) {
      plaque.append(el('div', 'cabin-trophy-weight', t.weight(formatKg(kg))))
      const at = stats.bestAt[id]
      if (at) plaque.append(el('div', 'cabin-trophy-date', t.date(new Date(at))))
    } else plaque.append(el('div', 'cabin-trophy-date', t.notCaught))
    return plaque
  }

  /** Купить и сразу показать: комната — наверх, предмет появляется с небольшим подскоком. */
  private buy(item: Furniture) {
    if (!this.player.buyFurniture(item)) return
    this.render()
    const piece = this.pieces.get(item.id)!
    piece.classList.remove('fresh')
    void piece.offsetWidth // перезапуск анимации, если класс уже был
    piece.classList.add('fresh')
    this.scroll.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
