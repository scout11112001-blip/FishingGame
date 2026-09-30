import { RIVERS } from './rivers/index.ts'
import type { ContentPack } from './types.ts'

/** Все пакеты — их проверяют тесты. */
export const ALL_PACKS: readonly ContentPack[] = [RIVERS]

/** Пакет, с которым собирается игра. Новая обёртка = поменять эту строку. */
export const ACTIVE_PACK: ContentPack = RIVERS
