import { describe, expect, it } from 'vitest'
import { makeFish } from '../core/fish.ts'
import { seededRng, type Rng } from '../core/rng.ts'
import { BAIT_DURATION_MS, isBaitActive } from './bait.ts'
import { parseSave, PlayerState } from './player.ts'
import { itemsOf, SLOTS } from './shop.ts'
import { RIVERS } from './rivers/index.ts'

// Сохранение — единственное, что приходит в игру «снаружи»: из браузера, из облака, из старой версии игры.
// Здесь его портим как угодно и проверяем: игра не падает и восстанавливает разумное состояние.

const NOW = 1_800_000_000_000
const pack = RIVERS

/** Что угодно вместо значения: не тот тип, пусто, огромное, отрицательное, дробное, вложенный мусор. */
function junk(rng: Rng, depth = 0): unknown {
  const kinds = [
    () => null,
    () => undefined,
    () => true,
    () => -1,
    () => 0,
    () => 1e300,
    () => -1e300,
    () => 3.7,
    () => Number.NaN,
    () => '',
    () => 'мусор',
    () => '2026-13-45',
    () => 'roach',
    () => 'table',
    () => ({}),
    () => [],
    () => (depth < 2 ? [junk(rng, depth + 1), junk(rng, depth + 1)] : 1),
    () => (depth < 2 ? { roach: junk(rng, depth + 1), id: junk(rng, depth + 1), until: junk(rng, depth + 1) } : 2),
  ]
  return kinds[Math.floor(rng() * kinds.length)]()
}

/** Пути ко всем полям сохранения (и вложенным), которые можно испортить. */
function paths(obj: unknown, prefix: string[] = []): string[][] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [prefix]
  return [prefix, ...Object.entries(obj).flatMap(([k, v]) => paths(v, [...prefix, k]))]
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown) {
  if (!path.length) return
  let cur: Record<string, unknown> = obj
  for (const k of path.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  if (value === undefined) delete cur[path.at(-1)!]
  else cur[path.at(-1)!] = value
}

/** Игрок, который поиграл: есть всё, что бывает в сохранении. */
function played(): PlayerState {
  const p = new PlayerState(pack)
  p.shop.earn(200_000)
  for (const slot of SLOTS) for (const item of itemsOf(pack, slot)) p.shop.buy(slot, item)
  p.loadout = { rod: pack.rods[2], line: pack.lines[3], reel: pack.reels[3] }
  p.xp = 450
  p.water = pack.waters[2]
  p.baitStock = { bream: 2, catfish: 1 }
  p.useBait(pack.baits[1], NOW)
  p.claimDaily('2026-10-01')
  for (const f of pack.cabin!.furniture) p.buyFurniture(f)
  for (const species of pack.fish) p.achievements.onCatch(makeFish(species, 0.9), p.xp, NOW - 1000)
  p.tutorialDone = true
  p.muted = true
  return p
}

/** Всё, что должно быть верно в любом восстановленном прогрессе. */
function checkSane(p: PlayerState, where: string) {
  const s = p.toSave()
  const int = (x: number) => Number.isInteger(x) && x >= 0
  expect(int(s.silver), `${where}: серебро ${s.silver}`).toBe(true)
  expect(int(s.xp), `${where}: опыт ${s.xp}`).toBe(true)
  for (const slot of SLOTS) {
    expect(p.shop.owns(slot, p.loadout[slot]), `${where}: надето некупленное (${slot})`).toBe(true)
    expect(itemsOf(pack, slot)).toContain(p.loadout[slot])
  }
  expect(pack.waters).toContain(p.water)
  expect(p.isOpen(p.water), `${where}: закрытый водоём`).toBe(true)
  if (p.bait) {
    expect(pack.baits).toContain(p.bait.bait)
    expect(isBaitActive(p.bait, NOW), `${where}: истёкшая прикормка`).toBe(true)
  }
  for (const [id, n] of Object.entries(p.baitStock)) {
    expect(pack.baits.some((b) => b.id === id), `${where}: чужая прикормка ${id}`).toBe(true)
    expect(Number.isInteger(n) && n > 0, `${where}: прикормки ${id} = ${n}`).toBe(true)
  }
  expect(p.daily.lastDay === null || /^\d{4}-\d{2}-\d{2}$/.test(p.daily.lastDay), `${where}: день ${p.daily.lastDay}`).toBe(true)
  expect(int(p.daily.streak), `${where}: серия ${p.daily.streak}`).toBe(true)
  for (const id of p.furniture) expect(pack.cabin!.furniture.some((f) => f.id === id), `${where}: мебель ${id}`).toBe(true)
  const { catches, bySpecies, best, bestAt } = p.achievements.stats
  expect(int(catches), `${where}: уловы ${catches}`).toBe(true)
  for (const map of [bySpecies, best, bestAt]) {
    for (const [id, v] of Object.entries(map)) {
      expect(pack.fish.some((f) => f.id === id), `${where}: чужая рыба ${id}`).toBe(true)
      expect(Number.isFinite(v) && v > 0, `${where}: ${id} = ${v}`).toBe(true)
    }
  }
  // Сохранённое снова читается и даёт то же самое
  const again = new PlayerState(pack)
  again.restore(parseSave(JSON.stringify({ ...s, savedAt: NOW }))!, NOW)
  expect(again.toSave(), `${where}: второе сохранение отличается`).toEqual(s)
}

describe('испорченное сохранение', () => {
  it('порча одного поля — игра восстанавливает разумное', () => {
    const base = { ...played().toSave(), savedAt: NOW }
    const all = paths(base).filter((p) => p.length && p[0] !== 'v')
    const rng = seededRng(42)
    for (const path of all) {
      for (let i = 0; i < 12; i++) {
        const data = structuredClone(base) as Record<string, unknown>
        const value = junk(rng)
        setPath(data, path, value)
        const where = `${path.join('.')} = ${JSON.stringify(value)}`
        const parsed = parseSave(JSON.stringify(data))
        expect(parsed, where).not.toBeNull()
        const p = new PlayerState(pack)
        p.restore(parsed!, NOW)
        checkSane(p, where)
      }
    }
  })

  it('порча многих полей сразу — тоже не падает', () => {
    const base = { ...played().toSave(), savedAt: NOW }
    const all = paths(base).filter((p) => p.length && p[0] !== 'v')
    const rng = seededRng(7)
    for (let i = 0; i < 400; i++) {
      const data = structuredClone(base) as Record<string, unknown>
      for (let k = 0; k < 6; k++) setPath(data, all[Math.floor(rng() * all.length)], junk(rng))
      const parsed = parseSave(JSON.stringify(data))
      if (!parsed) continue
      const p = new PlayerState(pack)
      p.restore(parsed, NOW)
      checkSane(p, `попытка ${i}`)
    }
  })

  it('вообще не сохранение — null, а не падение', () => {
    for (const text of ['', ' ', 'null', 'true', '42', '"строка"', '[]', '{}', '{"v":1', '\u0000', '{"v":"1"}', '{"v":1.0000001}']) {
      expect(() => parseSave(text), text).not.toThrow()
    }
    // Форма своя, но всё пусто — читается как новый игрок
    const p = new PlayerState(pack)
    p.restore(parseSave('{"v":1}')!, NOW)
    checkSane(p, 'пустое')
    expect(p.toSave()).toEqual(new PlayerState(pack).toSave())
  })

  it('прикормка «из будущего» (часы переводили) — не дольше, чем длится прикормка', () => {
    const data = { ...played().toSave(), savedAt: NOW, bait: { id: pack.baits[0].id, until: NOW + 100 * BAIT_DURATION_MS } }
    const p = new PlayerState(pack)
    p.restore(parseSave(JSON.stringify(data))!, NOW)
    expect(p.bait === null || p.bait.until - NOW <= BAIT_DURATION_MS).toBe(true)
  })

  it('самовар без стола (подправленное сохранение) — снимается', () => {
    const data = { ...new PlayerState(pack).toSave(), savedAt: NOW, furniture: ['samovar'] }
    const p = new PlayerState(pack)
    p.restore(parseSave(JSON.stringify(data))!, NOW)
    expect([...p.furniture]).toEqual([])
  })
})

describe('случайный прогресс сохраняется без потерь', () => {
  it('сохранить → загрузить → то же самое', () => {
    const rng = seededRng(99)
    for (let i = 0; i < 200; i++) {
      const p = new PlayerState(pack)
      p.shop.earn(Math.floor(rng() * 300_000))
      for (const slot of SLOTS) for (const item of itemsOf(pack, slot)) if (rng() < 0.5) p.shop.buy(slot, item)
      p.xp = Math.floor(rng() * 1000)
      const open = pack.waters.filter((w) => p.isOpen(w))
      p.water = open[Math.floor(rng() * open.length)]
      for (const b of pack.baits) if (rng() < 0.5) p.addBait(b, 1 + Math.floor(rng() * 5))
      if (rng() < 0.5) p.useBait(pack.baits[Math.floor(rng() * pack.baits.length)], NOW - Math.floor(rng() * BAIT_DURATION_MS))
      if (rng() < 0.7) p.claimDaily(`2026-10-0${1 + Math.floor(rng() * 9)}`)
      for (const f of pack.cabin!.furniture) if (rng() < 0.4) p.buyFurniture(f)
      for (let c = 0; c < rng() * 30; c++) {
        const species = pack.fish[Math.floor(rng() * pack.fish.length)]
        p.achievements.onCatch(makeFish(species, rng()), p.xp, NOW - Math.floor(rng() * 1e9))
      }
      p.tutorialDone = rng() < 0.5
      p.muted = rng() < 0.5
      checkSane(p, `игрок ${i}`)
    }
  })
})
