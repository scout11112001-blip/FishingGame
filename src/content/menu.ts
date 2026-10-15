import type { Phase } from '../core/FishingSession.ts'

/**
 * Что делает кнопка главного меню:
 * - open — открывает меню сразу;
 * - confirm — сначала спрашивает: заброс прервётся, рыба на крючке уйдёт;
 * - none — недоступна (и не видна).
 */
export type MenuAccess = 'open' | 'confirm' | 'none'

/**
 * Между забросами и на экране итога (рыба уже поймана или ушла) — в меню сразу. Посреди заброса или боя — с вопросом:
 * паузы нет, уход в меню бросает заброс. В обучении меню недоступно: новичок должен довести первые уловы до конца.
 */
export function menuAccess(phase: Phase, inTutorial: boolean): MenuAccess {
  if (inTutorial) return 'none'
  return phase === 'idle' || phase === 'caught' || phase === 'escaped' ? 'open' : 'confirm'
}
