import { describe, expect, it } from 'vitest'
import { ALL_PACKS } from './index.ts'
import { RIVERS } from './rivers/index.ts'
import { itemsOf, Shop, SLOTS } from './shop.ts'

describe('магазин снастей', () => {
  it('стартовая снасть есть сразу, остальное надо купить', () => {
    const shop = new Shop(RIVERS)
    for (const slot of SLOTS) {
      for (const item of itemsOf(RIVERS, slot)) expect(shop.owns(slot, item), item.name).toBe(item === RIVERS.starter[slot])
    }
  })

  it('без серебра не купить, с серебром — списывается цена', () => {
    const shop = new Shop(RIVERS)
    const line = RIVERS.lines[1]
    expect(shop.shortfall('line', line)).toBe(150)
    expect(shop.buy('line', line)).toBe(false)
    expect(shop.owns('line', line)).toBe(false)

    shop.earn(100)
    expect(shop.shortfall('line', line)).toBe(50)
    shop.earn(70)
    expect(shop.buy('line', line)).toBe(true)
    expect(shop.owns('line', line)).toBe(true)
    expect(shop.silver).toBe(20)
  })

  it('купленное второй раз не списывает серебро', () => {
    const shop = new Shop(RIVERS)
    shop.earn(1000)
    shop.buy('rod', RIVERS.rods[1])
    expect(shop.buy('rod', RIVERS.rods[1])).toBe(true)
    expect(shop.silver).toBe(700)
    expect(shop.shortfall('rod', RIVERS.rods[1])).toBe(0)
  })

  it.each(ALL_PACKS.map((p) => [p.id, p] as const))('пакет %s: у всего, кроме стартового, есть цена, и в слоте лучшее дороже', (_id, pack) => {
    for (const slot of SLOTS) {
      const items = itemsOf(pack, slot).filter((i) => i !== pack.starter[slot])
      for (const item of items) expect(item.price, item.name).toBeGreaterThan(0)
      const prices = items.map((i) => i.price!)
      expect([...prices].sort((a, b) => a - b), slot).toEqual(prices)
    }
  })

  it('цены рек — по расчёту прогресса', () => {
    const prices = (slot: (typeof SLOTS)[number]) => itemsOf(RIVERS, slot).map((i) => i.price ?? 0)
    expect(prices('rod')).toEqual([0, 300, 72000])
    expect(prices('line')).toEqual([0, 150, 7000, 30000])
    expect(prices('reel')).toEqual([0, 1500, 12000, 40000])
  })
})
