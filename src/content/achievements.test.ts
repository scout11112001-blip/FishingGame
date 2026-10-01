import { describe, expect, it } from 'vitest'
import { makeFish } from '../core/fish.ts'
import { AchievementLog, achievementsOf, recordWeight } from './achievements.ts'
import { ALL_PACKS } from './index.ts'
import { RIVERS } from './rivers/index.ts'
import { CATFISH, CRUCIAN, ROACH } from './rivers/fish.ts'

const small = (species = ROACH) => makeFish(species, 0)

describe('достижения', () => {
  it.each(ALL_PACKS.map((p) => [p.id, p] as const))('пакет %s: id уникальны (по ним будут сохранения)', (_id, pack) => {
    const ids = achievementsOf(pack).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('в рыбалке 21 достижение: 4 за количество, по 2 на каждый из 7 видов, 2 водоёма и опыт', () => {
    const list = achievementsOf(RIVERS)
    expect(list).toHaveLength(21)
    expect(list.filter((a) => a.kind === 'water').map((a) => a.title)).toEqual(['Тихая река', 'Лесное озеро'])
  })

  it('первая рыба засчитывает «Первый улов» и сразу помечается новым', () => {
    const log = new AchievementLog(RIVERS)
    expect(log.hasUnseen).toBe(false)
    const fresh = log.onCatch(small(), 1)
    expect(fresh.map((a) => a.id)).toEqual(['catches-1'])
    expect(log.isUnseen('catches-1')).toBe(true)
    expect(log.hasUnseen).toBe(true)

    log.markSeen('catches-1')
    expect(log.hasUnseen).toBe(false)
    expect(log.isDone('catches-1')).toBe(true)
  })

  it('каждое достижение засчитывается один раз', () => {
    const log = new AchievementLog(RIVERS)
    log.onCatch(small(), 1)
    expect(log.onCatch(small(), 2)).toEqual([])
  })

  it('50-я рыба — «Полведра», 40 опыта — река, 100 рыб одного вида — «сотня» этого вида', () => {
    const log = new AchievementLog(RIVERS)
    const got: string[] = []
    for (let i = 1; i <= 100; i++) got.push(...log.onCatch(small(CRUCIAN), i).map((a) => `${i}:${a.id}`))
    expect(got).toEqual(['1:catches-1', '40:water-river', '50:catches-50', '100:catches-100', '100:species-crucian'])
  })

  it('рекорд — от 98% максимального веса вида, с округлением как у пойманной рыбы', () => {
    expect(recordWeight(ROACH)).toBe(0.49)
    expect(recordWeight(CRUCIAN)).toBe(0.59)
    expect(recordWeight(CATFISH)).toBe(39.2)
    const log = new AchievementLog(RIVERS)
    expect(log.onCatch({ ...small(CATFISH), weightKg: 39.19 }, 1).some((a) => a.id === 'record-catfish')).toBe(false)
    expect(log.onCatch({ ...small(CATFISH), weightKg: 39.2 }, 2).some((a) => a.id === 'record-catfish')).toBe(true)
    // Самая крупная особь вида точно рекорд
    for (const species of RIVERS.fish) expect(makeFish(species, 1).weightKg).toBeGreaterThanOrEqual(recordWeight(species))
  })
})
