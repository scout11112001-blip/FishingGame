import { DEFAULT_TUNING, type Phase, type Tuning } from '../core/FishingSession.ts'

// Обучение на первом забросе: по шагу на каждую механику. Ничего не знает ни о графике, ни об HTML —
// только какой шаг сейчас и когда переходить к следующему. Сцена сообщает о событиях игры и рисует шаг.

export type TutorialStepId =
  | 'zones'
  | 'cast'
  | 'wait'
  | 'bite'
  | 'tension'
  | 'tensionHold'
  | 'slider'
  | 'rush'
  | 'escaped'
  | 'silver'
  | 'xp'
  | 'tackleButton'
  | 'waterButton'
  | 'baitButton'
  | 'achievementsButton'

/** Что подсветить на экране. null — ничего: карточка посередине. */
export type TutorialTarget =
  | 'water'
  | 'nearZone'
  | 'float'
  | 'effortBar'
  | 'rodStrip'
  | 'silver'
  | 'xp'
  | 'tackleButton'
  | 'waterButton'
  | 'baitButton'
  | 'achievementsButton'
  | null

export interface TutorialStep {
  id: TutorialStepId
  target: TutorialTarget
  /** Игра стоит, пока шаг на экране. */
  freeze: boolean
  /** Шаг закрывается тапом по экрану. Иначе тап уходит в игру — шаг ждёт действия игрока (заброс, подсечку). */
  tapToContinue: boolean
  /** Кнопки меню видны: шаг про них. В остальное время обучения они спрятаны. */
  hud?: boolean
}

const STEPS: Record<TutorialStepId, TutorialStep> = {
  zones: { id: 'zones', target: 'water', freeze: true, tapToContinue: true },
  cast: { id: 'cast', target: 'nearZone', freeze: false, tapToContinue: false },
  wait: { id: 'wait', target: 'float', freeze: true, tapToContinue: true },
  bite: { id: 'bite', target: 'float', freeze: true, tapToContinue: false },
  tension: { id: 'tension', target: 'effortBar', freeze: true, tapToContinue: true },
  tensionHold: { id: 'tensionHold', target: 'effortBar', freeze: true, tapToContinue: true },
  slider: { id: 'slider', target: 'rodStrip', freeze: true, tapToContinue: true },
  rush: { id: 'rush', target: 'effortBar', freeze: true, tapToContinue: true },
  escaped: { id: 'escaped', target: null, freeze: true, tapToContinue: true },
  silver: { id: 'silver', target: 'silver', freeze: true, tapToContinue: true },
  xp: { id: 'xp', target: 'xp', freeze: true, tapToContinue: true },
  // Кнопки меню — по карточке на каждую. Сами меню не открываем: тап по кнопке просто листает дальше
  tackleButton: { id: 'tackleButton', target: 'tackleButton', freeze: true, tapToContinue: true, hud: true },
  waterButton: { id: 'waterButton', target: 'waterButton', freeze: true, tapToContinue: true, hud: true },
  baitButton: { id: 'baitButton', target: 'baitButton', freeze: true, tapToContinue: true, hud: true },
  achievementsButton: { id: 'achievementsButton', target: 'achievementsButton', freeze: true, tapToContinue: true, hud: true },
}

/** Последний шаг обучения: после него — обычная игра. */
export const LAST_STEP: TutorialStepId = 'achievementsButton'

/** Что идёт следом за шагом, закрытым тапом. null — шаг просто гаснет, игра продолжается. */
const AFTER: Partial<Record<TutorialStepId, TutorialStepId>> = {
  zones: 'cast',
  tension: 'tensionHold',
  tensionHold: 'slider',
  escaped: 'cast',
  silver: 'xp',
  xp: 'tackleButton',
  tackleButton: 'waterButton',
  waterButton: 'baitButton',
  baitButton: 'achievementsButton',
}

/**
 * Пока идёт обучение, рыбалка мягче: поклёвка быстрее, рывок наступает вскоре после объяснений,
 * а на ошибку больше запаса — первая рыба должна попасться, даже если игрок ещё путается.
 */
export const TUTORIAL_TUNING: Tuning = {
  ...DEFAULT_TUNING,
  biteDelayMin: 2,
  biteDelayMax: 3,
  calmMin: 2,
  calmMax: 2.5,
  slackGrace: 5,
  sideGrace: 4,
  breakGraceWeakBonus: 3,
}

/** Размер рыбы в обучении (0..1): покрупнее средней — рывок заметен, а улов радует. */
export const TUTORIAL_FISH_SIZE = 0.8

export class Tutorial {
  private _step: TutorialStep | null = STEPS.zones
  private _done = false
  /** Объяснения механик показываем по разу: после схода игрок ловит снова, но без повторов. */
  private readonly shown = new Set<TutorialStepId>(['zones'])

  get step(): TutorialStep | null {
    return this._step
  }

  get done(): boolean {
    return this._done
  }

  /** Игра стоит. */
  get frozen(): boolean {
    return !!this._step?.freeze
  }

  /** Игрок тапнул по карточке шага. Возвращает закрытый шаг — сцене бывает нужно что-то сделать вслед. */
  next(): TutorialStepId | null {
    const step = this._step
    if (!step?.tapToContinue) return null
    const after = AFTER[step.id]
    this._step = after ? STEPS[after] : null
    if (after) this.shown.add(after)
    if (step.id === LAST_STEP) this._done = true
    return step.id
  }

  /** Сменилась фаза рыбалки. */
  onPhase(phase: Phase): void {
    if (this._done) return
    switch (phase) {
      case 'casting':
        if (this._step?.id === 'cast') this._step = null
        break
      case 'waiting':
        this.showOnce('wait')
        break
      case 'bite':
        // Каждый раз, пока первая рыба не поймана: после схода новичок легко прозевает поклёвку снова
        this.show('bite')
        break
      case 'fighting':
        if (this._step?.id === 'bite') this._step = null
        this.showOnce('tension')
        break
      case 'escaped':
        this.show('escaped')
        break
      case 'caught':
        this.show('silver')
        break
    }
  }

  /** Рыба вот-вот рванёт — в бою появилось предупреждение. */
  onRushWarning(): void {
    if (!this._done && !this._step) this.showOnce('rush')
  }

  private showOnce(id: TutorialStepId) {
    if (this.shown.has(id)) return
    this.show(id)
  }

  private show(id: TutorialStepId) {
    this.shown.add(id)
    this._step = STEPS[id]
  }
}
