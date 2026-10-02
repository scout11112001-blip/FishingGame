import { describe, expect, it } from 'vitest'
import { makeFish } from '../core/fish.ts'
import { BAIT_DURATION_MS } from './bait.ts'
import { parseSave, PlayerState, SAVE_VERSION, type SaveData } from './player.ts'
import { CRUCIAN, PIKE } from './rivers/fish.ts'
import { RIVERS } from './rivers/index.ts'

const NOW = 1_000_000
const [POND, RIVER, LAKE] = RIVERS.waters

/** Прогресс «поиграл немного»: купил болонку и леску, открыл реку, поймал рыбы, активировал прикормку. */
function played(): PlayerState {
  const p = new PlayerState(RIVERS)
  p.shop.earn(1000)
  p.shop.buy('rod', RIVERS.rods[1])
  p.shop.buy('line', RIVERS.lines[1])
  p.loadout = { rod: RIVERS.rods[1], line: RIVERS.lines[1], reel: RIVERS.reels[0] }
  for (let i = 1; i <= 45; i++) {
    p.xp = i
    p.achievements.onCatch(makeFish(CRUCIAN, i === 45 ? 1 : 0.3), p.xp)
  }
  p.water = RIVER
  p.bait = { bait: RIVERS.baits[0], until: NOW + BAIT_DURATION_MS }
  p.achievements.markSeen('catches-1')
  p.tutorialDone = true
  return p
}

/** Сохранить и загрузить в новый прогресс — как при перезагрузке страницы. */
function reload(p: PlayerState, now = NOW, edit?: (d: SaveData) => void): PlayerState {
  const data = parseSave(JSON.stringify({ ...p.toSave(), savedAt: now }))!
  edit?.(data)
  const fresh = new PlayerState(RIVERS)
  fresh.restore(data, now)
  return fresh
}

describe('сохранение прогресса', () => {
  it('после перезагрузки всё на месте', () => {
    const before = played()
    const after = reload(before)
    expect(after.toSave()).toEqual(before.toSave())
    expect(after.shop.silver).toBe(550)
    expect(after.shop.owns('rod', RIVERS.rods[1])).toBe(true)
    expect(after.loadout.rod).toBe(RIVERS.rods[1])
    expect(after.water).toBe(RIVER)
    expect(after.bait?.bait).toBe(RIVERS.baits[0])
    expect(after.achievements.stats.bySpecies.crucian).toBe(45)
    expect(after.achievements.isDone('water-river')).toBe(true)
    expect(after.achievements.isUnseen('catches-1')).toBe(false)
    expect(after.achievements.isUnseen('water-river')).toBe(true)
    expect(after.tutorialDone).toBe(true)
  })

  it('новый игрок сохраняется и загружается без потерь', () => {
    const p = new PlayerState(RIVERS)
    expect(reload(p).toSave()).toEqual(p.toSave())
  })

  it('чужое и битое — не сохранение', () => {
    expect(parseSave('не json')).toBeNull()
    expect(parseSave('null')).toBeNull()
    expect(parseSave('[]')).toBeNull()
    expect(parseSave(JSON.stringify({ v: SAVE_VERSION + 1 }))).toBeNull()
  })

  it('сохранение с дырами читается: чего нет — по умолчанию', () => {
    const data = parseSave(JSON.stringify({ v: SAVE_VERSION, silver: 77, owned: { rod: ['feeder', 42] } }))!
    const p = new PlayerState(RIVERS)
    p.restore(data, NOW)
    expect(p.shop.silver).toBe(77)
    expect(p.shop.owns('rod', RIVERS.rods[2])).toBe(true)
    expect(p.loadout).toEqual(RIVERS.starter)
    expect(p.water).toBe(POND)
    expect(p.tutorialDone).toBe(false)
  })

  it('неизвестные id пропускаются, числа приводятся в порядок', () => {
    const p = reload(played(), NOW, (d) => {
      d.silver = -50
      d.xp = 12.7
      d.owned.rod.push('удочка-из-будущего')
      d.stats.bySpecies = { crucian: 3.9, kraken: 5 }
      d.stats.best = { crucian: -1, pike: 2.5 }
      d.achievements.done.push('несуществующее')
    })
    expect(p.shop.silver).toBe(0)
    expect(p.xp).toBe(12)
    expect(p.shop.ownedIds().rod).not.toContain('удочка-из-будущего')
    expect(p.achievements.stats.bySpecies).toEqual({ crucian: 3 })
    expect(p.achievements.stats.best).toEqual({ pike: 2.5 })
    expect(p.achievements.ids().done).not.toContain('несуществующее')
  })

  it('надетая, но не купленная снасть меняется на стартовую', () => {
    const p = reload(played(), NOW, (d) => {
      d.loadout.rod = 'feeder'
      d.loadout.reel = 'нет-такой'
    })
    expect(p.loadout.rod).toBe(RIVERS.starter.rod)
    expect(p.loadout.reel).toBe(RIVERS.starter.reel)
    expect(p.loadout.line).toBe(RIVERS.lines[1])
  })

  it('закрытый по опыту водоём меняется на первый', () => {
    const p = reload(played(), NOW, (d) => {
      d.water = LAKE.id
    })
    expect(p.water).toBe(POND)
  })

  it('в тестовой версии открыт любой водоём', () => {
    const data = parseSave(JSON.stringify({ ...new PlayerState(RIVERS).toSave(), water: LAKE.id }))!
    const p = new PlayerState(RIVERS, { unlockAll: true })
    p.restore(data, NOW)
    expect(p.water).toBe(LAKE)
  })

  it('прикормка идёт и при закрытой игре: истекла — пропадает', () => {
    expect(reload(played(), NOW + BAIT_DURATION_MS - 1).bait).not.toBeNull()
    expect(reload(played(), NOW + BAIT_DURATION_MS).bait).toBeNull()
  })

  it('достижения, выполненные по статистике, но не засчитанные (добавлены в обновлении), засчитываются при загрузке', () => {
    const p = reload(played(), NOW, (d) => {
      d.achievements.done = []
      d.achievements.unseen = []
      d.stats.best[PIKE.id] = PIKE.maxWeightKg
    })
    expect(p.achievements.isDone('catches-1')).toBe(true)
    expect(p.achievements.isUnseen('catches-1')).toBe(true)
    expect(p.achievements.isDone('record-pike')).toBe(true)
  })
})
