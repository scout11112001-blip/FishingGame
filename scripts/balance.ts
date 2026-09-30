// Отчёт по балансу пакета: для каждого водоёма и уровня снасти — как часто и как быстро ловится каждая рыба.
// Запуск: npm run balance [-- id-пакета]
import { ALL_PACKS } from '../src/content/index.ts'
import { tackleOf, type ContentPack, type Loadout } from '../src/content/types.ts'
import { simulateLargest, simulateSpecies, spawnShare, type Summary } from '../src/sim/simulate.ts'

const FIGHTS = 200
const REACTION_SECONDS = 0.5

const packId = process.argv[2]
const pack = ALL_PACKS.find((p) => !packId || p.id === packId)
if (!pack) {
  console.error(`Нет пакета «${packId}». Есть: ${ALL_PACKS.map((p) => p.id).join(', ')}`)
  process.exit(1)
}

function tiers(pack: ContentPack): { name: string; loadout: Loadout }[] {
  const count = Math.max(pack.rods.length, pack.lines.length, pack.reels.length)
  const pick = <T>(items: readonly T[], i: number) => items[Math.min(i, items.length - 1)]
  return Array.from({ length: count }, (_, i) => {
    const loadout = i === 0 ? pack.starter : { rod: pick(pack.rods, i), line: pick(pack.lines, i), reel: pick(pack.reels, i) }
    return { name: `${loadout.rod.name} + ${loadout.line.name} + ${loadout.reel.name}`, loadout }
  })
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4)
const secs = (s: Summary) => (s.catchRate > 0 ? `${s.avgSeconds.toFixed(0)} с`.padStart(5) : '    —')
const reasons = (s: Summary) =>
  Object.entries(s.reasons)
    .filter(([r]) => r !== 'caught')
    .map(([r, n]) => `${r} ${n}`)
    .join(', ')

console.log(`Пакет «${pack.title}» (${pack.id}), бот с реакцией ${REACTION_SECONDS} с, ${FIGHTS} боёв на вид`)
for (const water of pack.waters) {
  for (const { name, loadout } of tiers(pack)) {
    // Бросаем так далеко, как добрасывает удочка: там самая сильная рыба
    const levels = water.zones.length
    const castLevel = Math.min(loadout.rod.castLevels, levels) - 1
    const zone = water.zones[castLevel]
    console.log(`\n${water.name}, ${zone.name} — ${name}`)
    console.log('  рыба       доля   ловится  время   самая крупная   срывы')
    let waterCatch = 0
    let waterSeconds = 0
    for (const spawn of zone.spawns) {
      const { species } = spawn
      const setup = { tackle: tackleOf(loadout), reactionSeconds: REACTION_SECONDS, cast: { level: castLevel, levels } }
      const all = simulateSpecies(spawn, setup, FIGHTS)
      const largest = simulateLargest(species, setup, 50)
      const share = spawnShare(zone.spawns, species)
      waterCatch += share * all.catchRate
      waterSeconds += share * all.catchRate * all.avgSeconds
      console.log(
        `  ${species.name.padEnd(10)} ${pct(share)}    ${pct(all.catchRate)}   ${secs(all)}      ${pct(largest.catchRate)}        ${reasons(all)}`,
      )
    }
    console.log(`  ИТОГО: ловится ${pct(waterCatch)} поклёвок, удачный бой в среднем ${(waterSeconds / waterCatch).toFixed(0)} с`)
  }
}
