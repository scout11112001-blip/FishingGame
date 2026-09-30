import Phaser from 'phaser'
import type { HookedFish } from '../core/fish.ts'
import { castLevelRange, DEFAULT_TUNING, FishingSession, MAX_CAST_LEVELS, type EscapeReason, type FightView, type FishingEvent } from '../core/FishingSession.ts'
import { ACTIVE_PACK } from '../content/index.ts'
import { tackleOf, zoneSpawns, type ContentPack, type Loadout, type PackTexts, type WaterBody } from '../content/types.ts'
import { Hud } from '../ui/Hud.ts'
import { TacklePanel } from '../ui/TacklePanel.ts'
import { WaterPanel } from '../ui/WaterPanel.ts'
import { formatDepth, toMeters } from '../ui/units.ts'

/** Дальняя граница отрисовки воды в единицах дистанции (равна длине лески). */
const MAX_DRAW_DISTANCE = 1.5
/** Где проходит горизонт, доля высоты экрана. Небо — только под счётчики и подсказку. */
const HORIZON = 0.16
/** Итог нельзя закрыть сразу, чтобы игрок, жмущий кнопку, успел его прочитать. */
const RESULT_MIN_SECONDS = 0.6
/** Какая доля ширины экрана соответствует полному отведению пальца (-1..1). */
const ROD_SPAN = 0.8
/** Какая доля ширины экрана доступна для заброса по горизонтали. */
const CAST_SPAN = 0.9
/** Сколько секунд висит предупреждение «удочка не добросит». */
const TOO_FAR_SECONDS = 2.5

const COLOR = {
  rod: 0x6b4423,
  line: 0xf5f5f5,
  floatTop: 0xe53935,
  floatBottom: 0xffffff,
  fish: 0x0d3b52,
  panel: 0x0b2a3a,
  slack: 0x607d8b,
  ok: 0x4caf50,
  warn: 0xffc107,
  danger: 0xf44336,
  white: 0xffffff,
}

type Result = { kind: 'caught'; fish: HookedFish; price: number } | { kind: 'escaped'; reason: EscapeReason; fish: HookedFish | null }

export class FishingScene extends Phaser.Scene {
  private session!: FishingSession
  private gfx!: Phaser.GameObjects.Graphics
  /** Фоновая картинка водоёма; у водоёма без картинки — скрыта, вместо неё заливка из палитры. */
  private bg!: Phaser.GameObjects.Image
  private statusText!: Phaser.GameObjects.Text
  private walletText!: Phaser.GameObjects.Text
  private fightText!: Phaser.GameObjects.Text
  private resultText!: Phaser.GameObjects.Text
  private tooFarText!: Phaser.GameObjects.Text
  /** Подписи мест ловли на воде — видны, пока выбираешь дальность заброса. */
  private zoneTexts: Phaser.GameObjects.Text[] = []
  /** Все надписи — чтобы при смене плотности экрана перерисовать их в новом разрешении. */
  private labels: Phaser.GameObjects.Text[] = []
  private keyLeft?: Phaser.Input.Keyboard.Key
  private keyRight?: Phaser.Input.Keyboard.Key
  private hud!: Hud
  private tacklePanel!: TacklePanel
  private waterPanel!: WaterPanel

  private readonly pack: ContentPack = ACTIVE_PACK
  private water: WaterBody = this.pack.waters[0]
  private loadout: Loadout = this.pack.starter

  private silver = 0
  private catches = 0
  private elapsed = 0
  private nibbleAge = Infinity
  private tooFarAge = Infinity
  private result: Result | null = null

  constructor() {
    super('FishingScene')
  }

  preload() {
    for (const water of this.pack.waters) if (water.backdrop) this.load.image(backdropKey(water), water.backdrop.image)
  }

  create() {
    this.session = new FishingSession({ zones: zoneSpawns(this.water), tackle: tackleOf(this.loadout) })
    this.session.on((e) => this.onEvent(e))
    // Отладка: в dev-сборке сессия доступна из консоли браузера как __fishing
    if (import.meta.env.DEV) Object.assign(window, { __fishing: this.session })

    // Картинка создаётся первой — она под всем остальным
    this.bg = this.add.image(0, 0, '__DEFAULT').setOrigin(0)
    this.gfx = this.add.graphics()
    const text = () => {
      const t = this.add
        .text(0, 0, '', { fontFamily: 'sans-serif', color: '#ffffff', align: 'center', stroke: '#0b2a3a', strokeThickness: 4 })
        .setOrigin(0.5)
        .setResolution(this.pixelRatio)
      this.labels.push(t)
      return t
    }
    this.statusText = text()
    this.fightText = text()
    this.resultText = text()
    this.tooFarText = text()
    this.walletText = text().setOrigin(0, 0).setAlign('left')
    // С запасом на водоём с наибольшим числом мест; лишние просто не показываем
    this.zoneTexts = Array.from({ length: MAX_CAST_LEVELS }, () => text().setOrigin(1, 0.5).setAlign('right'))

    // Интерфейс вне боя — HTML поверх игры: кнопки внизу и панели выбора
    this.tacklePanel = new TacklePanel(this.pack, this.loadout, (loadout) => {
      this.loadout = loadout
      this.session.equip(zoneSpawns(this.water), tackleOf(loadout))
    })
    this.waterPanel = new WaterPanel(this.pack, this.water, (water) => {
      this.water = water
      this.session.equip(zoneSpawns(water), tackleOf(this.loadout))
    })
    this.hud = new Hud()
    this.hud.addButton(this.texts.tackle.button, () => this.tacklePanel.open())
    this.hud.addButton(this.texts.waters.button, () => this.waterPanel.open())
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hud.destroy()
      this.tacklePanel.destroy()
      this.waterPanel.destroy()
    })

    this.input.mouse?.disableContextMenu()
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Между забросами нажатие — это бросок в точку; в остальное время — палец на удочке
      if (this.session.phase === 'idle') return this.castAt(p)
      this.aimRod(p)
      this.press()
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => p.isDown && this.aimRod(p))
    this.input.on('pointerup', () => this.session.release())
    this.input.on('pointerupoutside', () => this.session.release())
    // На ПК: пробел — усилие (и заброс на всю дальность удочки), стрелки — отвести удочку
    const kb = this.input.keyboard
    kb?.on('keydown-SPACE', (e: KeyboardEvent) => !e.repeat && this.press())
    kb?.on('keyup-SPACE', () => this.session.release())
    this.keyLeft = kb?.addKey('LEFT')
    this.keyRight = kb?.addKey('RIGHT')
    // Ушли из вкладки с зажатым пальцем — отпускаем, иначе вернёмся к порванной леске
    this.game.events.on('blur', () => this.session.release())
    this.game.events.on('hidden', () => this.session.release())
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000
    this.elapsed += dt
    this.nibbleAge += dt
    this.tooFarAge += dt
    this.steerWithKeys(dt)
    this.session.update(dt)
    this.draw()
  }

  private get texts(): PackTexts {
    return this.pack.texts
  }

  private aimRod(p: Phaser.Input.Pointer) {
    const { w } = this.view
    this.session.setRod((p.x / this.pixelRatio - w / 2) / ((w * ROD_SPAN) / 2))
  }

  /** Бросок туда, куда нажали: высота на экране → дистанция, горизонталь → где ляжет поплавок. */
  private castAt(p: Phaser.Input.Pointer) {
    if (this.panelOpen) return
    const { w, h } = this.view
    const x = p.x / this.pixelRatio
    this.session.castTo(this.water3d(w, h).yToDist(p.y / this.pixelRatio), (x - w / 2) / ((w * CAST_SPAN) / 2))
  }

  /** Во сколько раз холст детальнее CSS-пикселей (его задаёт main.ts через zoom). */
  private get pixelRatio(): number {
    return 1 / this.scale.zoom
  }

  /** Размер экрана в CSS-пикселях — в них сцена всё раскладывает; камера увеличивает до пикселей холста. */
  private get view(): { w: number; h: number } {
    return { w: this.scale.width / this.pixelRatio, h: this.scale.height / this.pixelRatio }
  }

  /** Камера и надписи — под текущую плотность экрана. Меняется редко: при переносе окна на другой монитор. */
  private syncPixelRatio() {
    const r = this.pixelRatio
    const cam = this.cameras.main
    if (cam.zoom === r) return
    cam.setOrigin(0, 0).setZoom(r)
    for (const t of this.labels) t.setResolution(r)
  }

  private get panelOpen(): boolean {
    return this.tacklePanel.isOpen || this.waterPanel.isOpen
  }

  /**
   * Где на экране лежит фоновая картинка: по высоте экрана, лишнее по бокам обрезается
   * (на очень широком экране — наоборот, по ширине с обрезкой сверху и снизу). null — картинки нет.
   */
  private backdropRect(w: number, h: number) {
    if (!this.water.backdrop || !this.textures.exists(backdropKey(this.water))) return null
    const frame = this.textures.getFrame(backdropKey(this.water))
    const scale = Math.max(w / frame.width, h / frame.height)
    const dw = frame.width * scale
    const dh = frame.height * scale
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh }
  }

  /**
   * Перспектива воды: дистанция ↔ экранная Y и масштаб по дальности. Общая для отрисовки и для броска в точку.
   * Нажатие ближе берега — ближайший заброс, в небо — самый дальний.
   */
  private water3d(w: number, h: number) {
    // Опорные точки «дистанция → экранная Y». С картинкой — по отметкам на ней: места ловли ложатся
    // на нарисованные глубины. Без картинки — участок заброса растянут почти на полэкрана.
    const rect = this.backdropRect(w, h)
    const b = this.water.backdrop
    const { castNear, castFar } = DEFAULT_TUNING
    let points: [number, number][]
    if (rect && b) {
      const y = (f: number) => rect.y + f * rect.h
      const levels = b.zoneEdges.length - 1
      points = [
        [0, y(b.shore)],
        ...b.zoneEdges.map((f, i): [number, number] => [castNear + ((castFar - castNear) * i) / levels, y(f)]),
        [MAX_DRAW_DISTANCE, y(b.waterline + 0.01)],
      ]
    } else {
      points = [
        [0, h * 0.84],
        [castNear, h * 0.7],
        [castFar, h * (HORIZON + 0.09)],
        [MAX_DRAW_DISTANCE, h * (HORIZON + 0.02)],
      ]
    }
    const horizon = rect && b ? rect.y + b.waterline * rect.h : h * HORIZON
    const nearY = points[0][1]
    const farY = points[points.length - 1][1]
    const distToY = (d: number) => piecewise(points, d, 0, 1)
    return {
      horizon,
      photo: !!rect,
      distToY,
      yToDist: (y: number) => piecewise(points, y, 1, 0),
      perspective: (d: number) => 1 - 0.5 * Phaser.Math.Clamp((nearY - distToY(d)) / (nearY - farY), 0, 1),
      /** Экранная X поплавка по горизонтали заброса -1..1. */
      castToX: (x: number) => w / 2 + (Phaser.Math.Clamp(x, -1, 1) * w * CAST_SPAN) / 2,
    }
  }

  private steerWithKeys(dt: number) {
    const fight = this.session.fight
    const left = this.keyLeft?.isDown ?? false
    const right = this.keyRight?.isDown ?? false
    if (fight && left !== right) this.session.setRod(fight.rodX + (right ? 1 : -1) * 2.5 * dt)
  }

  private press() {
    // Пока открыта панель, пробел не должен забрасывать удочку у неё за спиной
    if (this.panelOpen) return
    const phase = this.session.phase
    if ((phase === 'caught' || phase === 'escaped') && this.session.timeInPhase < RESULT_MIN_SECONDS) return
    this.session.press()
  }

  private onEvent(e: FishingEvent) {
    switch (e.type) {
      case 'nibble':
        this.nibbleAge = 0
        break
      case 'caught':
        this.silver += e.price
        this.catches++
        this.result = { kind: 'caught', fish: e.fish, price: e.price }
        break
      case 'escaped':
        this.result = { kind: 'escaped', reason: e.reason, fish: e.fish }
        break
      case 'cast':
        this.tooFarAge = e.clamped ? 0 : Infinity
        break
      case 'phase':
        if (e.phase === 'idle') this.result = null
        break
    }
  }

  private draw() {
    this.syncPixelRatio()
    const { w, h } = this.view
    const g = this.gfx.clear()
    const s = this.session
    const phase = s.phase
    const fight = phase === 'fighting' ? s.fight : null
    const fontSize = Phaser.Math.Clamp(Math.min(w, h) / 22, 14, 30)

    // Сцена: картинка водоёма, а без неё — небо и вода заливкой
    const { horizon, distToY, perspective, castToX } = this.water3d(w, h)
    const rect = this.backdropRect(w, h)
    this.bg.setVisible(!!rect)
    if (rect) {
      const key = backdropKey(this.water)
      if (this.bg.texture.key !== key) this.bg.setTexture(key)
      this.bg.setPosition(rect.x, rect.y).setDisplaySize(rect.w, rect.h)
    } else {
      const palette = this.water.palette
      g.fillStyle(palette.sky).fillRect(0, 0, w, horizon)
      g.fillStyle(palette.waterFar).fillRect(0, horizon, w, h * 0.06)
      g.fillStyle(palette.water).fillRect(0, horizon + h * 0.06, w, h - horizon)
    }

    // Места ловли: пока игрок решает, куда бросать, — видно, где что и куда не добросить
    const idle = phase === 'idle'
    this.zoneTexts.forEach((t, i) => t.setVisible(idle && i < this.water.zones.length))
    if (idle) this.drawZones(w, h, fontSize)

    // Удочка наклоняется туда, куда отведён палец, и гнётся от усилия
    const rodX = fight?.rodX ?? 0
    const bend = fight ? Math.min(fight.effort, 1.2) * h * 0.04 : 0
    const butt = { x: w * 0.5 + rodX * w * 0.1, y: h + 10 }
    const tip = { x: w * 0.5 + rodX * w * 0.28, y: h * 0.74 + bend }

    // Поплавок или рыба на конце лески
    let end: { x: number; y: number } | null = null
    const castTarget = { x: castToX(s.castX) + Math.sin(this.elapsed * 0.7) * w * 0.01, y: distToY(s.cast) }
    const floatR = Math.max(6, w * 0.012) * perspective(s.cast)

    if (phase === 'casting') {
      const p = s.castProgress
      end = {
        x: Phaser.Math.Linear(tip.x, castTarget.x, p),
        y: Phaser.Math.Linear(tip.y, castTarget.y, p) - Math.sin(p * Math.PI) * h * 0.25,
      }
      this.drawFloat(end.x, end.y, floatR, 0)
    } else if (phase === 'waiting') {
      const dip = 8 * Math.exp(-this.nibbleAge * 10) * perspective(s.cast)
      end = { x: castTarget.x, y: castTarget.y + Math.sin(this.elapsed * 3) * 1.5 + dip }
      this.drawFloat(end.x, end.y, floatR, 0)
    } else if (phase === 'bite') {
      end = { x: castTarget.x, y: castTarget.y + floatR * 1.2 }
      this.drawFloat(end.x, end.y, floatR, 0.6)
      const ring = 1 - s.hookWindowLeft
      g.lineStyle(3, COLOR.white, 1 - ring).strokeCircle(end.x, end.y, floatR * (1.5 + ring * 4))
    } else if (fight) {
      const k = perspective(fight.distance)
      // Перед рывком тень рыбы дрожит — это подсказка «сейчас рванёт»
      const shake = fight.mode === 'warn' ? Math.sin(this.elapsed * 60) * w * 0.006 : 0
      // Рыба клюнула там, где лежал поплавок, и по мере подмотки подходит к удочке
      const offset = (castToX(s.castX) - w / 2) * Math.min(fight.distance / s.cast, 1)
      end = { x: w * 0.5 + offset + fight.fishX * w * 0.38 + shake, y: distToY(fight.distance) }
      g.fillStyle(COLOR.fish, 0.85).fillEllipse(end.x, end.y, w * 0.09 * k, w * 0.035 * k)
      if (fight.mode === 'rush') {
        g.lineStyle(2, COLOR.white, 0.7).strokeCircle(end.x, end.y, w * 0.05 * k * (1 + ((this.elapsed * 3) % 1)))
      }
    }

    if (end) {
      const color = fight ? effortColor(fight) : COLOR.line
      g.lineStyle(2, color, 0.9).lineBetween(tip.x, tip.y, end.x, end.y)
    }

    // Удочка — ближе всего к игроку, поэтому поверх воды, рыбы и лески (но под интерфейсом боя)
    g.lineStyle(Math.max(4, w * 0.008), COLOR.rod).lineBetween(butt.x, butt.y, tip.x, tip.y)

    // Интерфейс
    this.walletText
      .setFontSize(fontSize * 0.8)
      .setPosition(12, 10)
      .setText(`${this.texts.wallet}: ${this.silver}   ${this.texts.catchCount}: ${this.catches}`)
    this.hud.setVisible(idle)
    this.statusText
      .setWordWrapWidth(w * 0.9)
      .setFontSize(phase === 'bite' ? fontSize * 1.4 : phase === 'fighting' ? fontSize * 0.8 : fontSize)
      // В небе, но не ниже верхней десятой экрана: на картинках дальний берег стоит ниже, чем у заливки
      .setPosition(w / 2, Math.min(horizon * 0.55, h * 0.11))
      .setText(this.texts.hints[phase])

    // Ненавязчиво: мелко, над поплавком, и само гаснет
    const tooFar = Phaser.Math.Clamp((TOO_FAR_SECONDS - this.tooFarAge) / 0.6, 0, 1)
    this.tooFarText.setVisible(tooFar > 0 && !idle)
    if (tooFar > 0) {
      // Над поплавком, но целиком в экране: центр прижимается от краёв на половину ширины надписи
      const t = this.tooFarText.setFontSize(fontSize * 0.7).setWordWrapWidth(w * 0.9).setAlpha(tooFar).setText(this.texts.cast.tooFar)
      const half = t.width / 2 + 8
      t.setPosition(Phaser.Math.Clamp(castTarget.x, half, Math.max(half, w - half)), castTarget.y - fontSize * 1.6)
    }

    this.fightText.setVisible(!!fight)
    if (fight) {
      this.drawEffortBar(fight, w, h, horizon, fontSize)
      this.drawRodControl(fight, w, h)
    }

    this.resultText.setVisible(!!this.result)
    if (this.result) {
      this.resultText.setWordWrapWidth(w * 0.9).setFontSize(fontSize * 1.1).setPosition(w / 2, h * 0.58).setText(resultMessage(this.result, this.texts))
      if (this.result.kind === 'caught') {
        const len = Phaser.Math.Clamp(w * 0.08 * Math.cbrt(this.result.fish.weightKg) * 1.5, w * 0.06, w * 0.5)
        g.fillStyle(COLOR.fish).fillEllipse(w / 2, h * 0.45, len, len * 0.4)
        g.fillTriangle(w / 2 + len * 0.45, h * 0.45, w / 2 + len * 0.7, h * 0.45 - len * 0.18, w / 2 + len * 0.7, h * 0.45 + len * 0.18)
      }
    }
  }

  /**
   * Полосы мест ловли на воде, от берега к горизонту. Куда удочка не добрасывает — затемнено и подписано замком,
   * место под мышью подсвечено.
   */
  private drawZones(w: number, h: number, fontSize: number) {
    const g = this.gfx
    const { distToY, yToDist, perspective, castToX, photo } = this.water3d(w, h)
    const reach = this.session.castLevels
    // На ПК подсвечиваем место под мышью и показываем, куда ляжет поплавок. На телефоне наведения нет.
    const pointer = this.input.activePointer
    const px = pointer.x / this.pixelRatio
    const py = pointer.y / this.pixelRatio
    const hover = !pointer.wasTouch && !this.panelOpen && py > 0 ? yToDist(py) : null
    const landing = hover === null ? null : Phaser.Math.Clamp(hover, DEFAULT_TUNING.castNear, this.session.maxCast)
    const hoverLevel = landing === null ? null : this.levelAt(landing)
    this.water.zones.forEach((zone, i) => {
      const [from, to] = castLevelRange(i, this.water.zones.length)
      const bottom = distToY(from)
      const top = distToY(to)
      const locked = i >= reach
      if (locked) g.fillStyle(COLOR.panel, 0.5).fillRect(0, top, w, bottom - top)
      else if (hoverLevel === i) g.fillStyle(COLOR.ok, 0.22).fillRect(0, top, w, bottom - top)
      // На картинке места и так различимы по воде — полосы-зебра нужны только на заливке
      else if (!photo) g.fillStyle(COLOR.white, i % 2 ? 0.05 : 0.1).fillRect(0, top, w, bottom - top)
      g.lineStyle(1, COLOR.white, 0.3).lineBetween(0, top, w, top)
      if (i === 0) g.lineBetween(0, bottom, w, bottom)

      const label = this.texts.cast.zone(zone.name, formatDepth(zone.depthM))
      this.zoneTexts[i]
        .setFontSize(fontSize * 0.7)
        .setWordWrapWidth(w * 0.55)
        .setAlpha(locked ? 0.75 : 1)
        .setPosition(w - 10, (top + bottom) / 2)
        .setText(locked ? `🔒 ${label}\n${this.texts.cast.locked}` : label)
    })

    if (landing !== null) {
      const r = Math.max(6, w * 0.012) * perspective(landing)
      this.drawFloat(castToX((px - w / 2) / ((w * CAST_SPAN) / 2)), distToY(landing), r, 0.6)
    }
  }

  /** Уровень места ловли по дистанции — как его считает ядро. */
  private levelAt(distance: number): number {
    const levels = this.water.zones.length
    for (let i = 0; i < levels; i++) if (distance < castLevelRange(i, levels)[1]) return i
    return levels - 1
  }

  /**
   * Вертикальная шкала усилия у левого края, прямо над полосой для пальца — рядом с ним, чтобы не переводить взгляд.
   * Снизу вверх: серая зона — мало (рыба сойдёт), зелёная — нормально, красная — леска на пределе.
   */
  private drawEffortBar(fight: FightView, w: number, h: number, horizon: number, fontSize: number) {
    const g = this.gfx
    const { top: stripTop } = this.rodStrip(w, h)
    const barW = Phaser.Math.Clamp(w * 0.06, 22, 34)
    const barH = Phaser.Math.Clamp(h * 0.28, 120, 280)
    const x = 12
    const bottom = stripTop - 10
    const y = bottom - barH
    // Доля шкалы → экранная Y: 0 внизу, 1 наверху
    const at = (v: number) => bottom - barH * Phaser.Math.Clamp(v, 0, 1)

    g.fillStyle(COLOR.slack, 0.9).fillRect(x, at(fight.need), barW, bottom - at(fight.need))
    g.fillStyle(COLOR.ok, 0.9).fillRect(x, at(fight.zoneTop), barW, at(fight.need) - at(fight.zoneTop))
    g.fillStyle(COLOR.danger, 0.9).fillRect(x, y, barW, at(fight.zoneTop) - y)

    // Бегунок текущего усилия
    g.fillStyle(COLOR.white).fillRect(x - 5, at(fight.effort) - 3, barW + 10, 6)

    const blink = Math.sin(this.elapsed * 30) > 0
    const border = fight.breakDanger > 0 && blink ? COLOR.danger : fight.slackDanger > 0.3 && blink ? COLOR.warn : COLOR.panel
    g.lineStyle(3, border).strokeRect(x, y, barW, barH)

    const meters = toMeters(fight.distance)
    const say = this.texts.warnings
    const warning =
      fight.breakDanger > 0
        ? say.lineBreaking
        : fight.slackDanger > 0.3
          ? say.slack
          : fight.sideDanger > 0.3
            ? say.wrongSide
            : fight.mode === 'warn'
              ? say.rushSoon
              : ''
    this.fightText
      .setFontSize(fontSize * 0.85)
      .setPosition(w / 2, horizon + h * 0.04)
      .setText(warning ? `${meters} м — ${warning}` : `${meters} м`)
  }

  /** Геометрия полосы для пальца — общая для её отрисовки и для шкалы усилия над ней. */
  private rodStrip(w: number, h: number) {
    const spot = Phaser.Math.Clamp(w * 0.1, 34, 60)
    const y = h - spot - 12
    return { spot, y, cx: w / 2, half: (w * ROD_SPAN) / 2, top: y - spot - 6 }
  }

  /** Полоса управления внизу: прямоугольник — куда поставить палец (зеркально рыбе), пятно — где палец сейчас. */
  private drawRodControl(fight: FightView, w: number, h: number) {
    const g = this.gfx
    const { spot, y, cx, half, top: stripTop } = this.rodStrip(w, h)

    g.fillStyle(COLOR.panel, 0.35).fillRoundedRect(cx - half - spot, stripTop, half * 2 + spot * 2, spot * 2 + 12, spot + 6)
    g.lineStyle(3, COLOR.white, 0.35).lineBetween(cx - half, y, cx + half, y)

    // Цель: вся зона, где срыв вбок не копится, и яркая середина — идеальное положение пальца.
    // Обрезаем по краям полосы, куда палец всё равно не дотянется.
    const toScreen = (x: number) => cx + Phaser.Math.Clamp(x, -1, 1) * half
    const left = toScreen(fight.targetX - fight.safeHalfWidth)
    const right = toScreen(fight.targetX + fight.safeHalfWidth)
    const top = y - spot
    const height = spot * 2
    g.fillStyle(COLOR.ok, 0.22).fillRoundedRect(left, top, right - left, height, 10)
    const core = Math.min(spot * 0.6, (right - left) / 2)
    g.fillStyle(COLOR.ok, 0.35).fillRect(toScreen(fight.targetX) - core / 2, top, core, height)
    const alarm = fight.sideDanger > 0.3 && Math.sin(this.elapsed * 20) > 0
    g.lineStyle(3, alarm ? COLOR.danger : COLOR.white, alarm ? 0.9 : 0.5).strokeRoundedRect(left, top, right - left, height, 10)

    // Пятно под пальцем: слои с растущей плотностью к центру дают мягкий край.
    // Цвет — качество противодействия; при угрозе срыва вбок пятно пульсирует красным.
    const sideAlarm = fight.sideDanger > 0.3 && Math.sin(this.elapsed * 20) > 0
    const color = sideAlarm ? COLOR.danger : fight.counter > 0.7 ? COLOR.ok : fight.counter > 0.4 ? COLOR.warn : COLOR.danger
    const r = spot * (fight.holding ? 1.1 : 0.9)
    const alpha = fight.holding ? 0.16 : 0.09
    const sx = cx + fight.rodX * half
    for (let i = 0; i < 6; i++) g.fillStyle(color, alpha).fillCircle(sx, y, r * (1 - i * 0.14))
    g.lineStyle(2, COLOR.white, fight.holding ? 0.6 : 0.3).strokeCircle(sx, y, r)
  }

  private drawFloat(x: number, y: number, r: number, sunk: number) {
    // sunk: 0 — поплавок на воде, 1 — полностью утонул
    this.gfx.fillStyle(COLOR.floatBottom, 1 - sunk).fillCircle(x, y + r * 0.4, r * 0.8)
    this.gfx.fillStyle(COLOR.floatTop, 1 - sunk * 0.5).fillCircle(x, y - r * 0.3, r)
  }
}

function backdropKey(water: WaterBody): string {
  return `bg-${water.id}`
}

/**
 * Кусочно-линейная функция по опорным точкам [a, b]: from/to — индексы входа и выхода (0 → 1 или 1 → 0 для обратной).
 * Вход за крайними точками прижимается к ним.
 */
function piecewise(points: readonly [number, number][], x: number, from: 0 | 1, to: 0 | 1): number {
  const sorted = [...points].sort((p, q) => p[from] - q[from])
  if (x <= sorted[0][from]) return sorted[0][to]
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]]
    if (x <= b[from]) return Phaser.Math.Linear(a[to], b[to], (x - a[from]) / (b[from] - a[from]))
  }
  return sorted[sorted.length - 1][to]
}

function effortColor(f: FightView): number {
  if (f.effort >= f.zoneTop) return COLOR.danger
  if (f.effort < f.need) return COLOR.slack
  return COLOR.ok
}

function resultMessage(r: Result, texts: PackTexts): string {
  if (r.kind === 'caught') return texts.caught(r.fish, r.price)
  // Сорвавшуюся рыбу показываем, только если она успела клюнуть — это стимул закинуть снова
  const lost = r.fish && r.reason !== 'tooEarly' ? '\n' + texts.lost(r.fish) : ''
  return texts.escape[r.reason] + lost
}
