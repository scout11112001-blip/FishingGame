import type { PackTexts } from '../types.ts'

export const RIVERS_TEXTS: PackTexts = {
  wallet: 'Серебро',
  catchCount: 'Улов',
  hints: {
    idle: 'Нажми на воду туда, куда забросить',
    casting: '',
    waiting: 'Ждём поклёвку… не торопись',
    bite: 'КЛЮЁТ! Нажми!',
    fighting: 'Держи усилие в зелёной зоне шкалы,\nа палец — в зелёной рамке внизу',
    caught: 'Нажми, чтобы продолжить',
    escaped: 'Нажми, чтобы продолжить',
  },
  escape: {
    tooEarly: 'Рано подсёк — рыба испугалась',
    missed: 'Не успел подсечь',
    lineBroke: 'Перетянул — леска порвалась!',
    unhooked: 'Слабо держал — рыба сошла',
    lineOut: 'Рыба смотала всю леску',
    wrongSide: 'Тянул не в ту сторону — рыба сорвалась',
  },
  warnings: {
    lineBreaking: 'ЛЕСКА ТРЕЩИТ!',
    slack: 'СЛАБО ДЕРЖИШЬ!',
    wrongSide: 'ПАЛЕЦ — В РАМКУ!',
    rushSoon: 'Сейчас рванёт!',
  },
  caught: (fish, price) => `Поймал!\n${fish.species.name}, ${fish.weightKg} кг\n+${price} серебра`,
  lost: (fish) => `Сорвалась: ${fish.species.name}, ${fish.weightKg} кг`,
  cast: {
    locked: 'Нужна удочка дальнобойнее',
    tooFar: 'Дальше эта удочка не добросит',
    zone: (name, depth) => `${name}, глубина ${depth}`,
  },
  ui: {
    selected: 'Выбрано',
    done: 'Готово',
  },
  tackle: {
    button: 'Снасти',
    title: 'Снасти',
    tabs: { rod: 'Удочка', line: 'Леска', reel: 'Катушка' },
    stats: { strength: 'Прочность', speed: 'Скорость подмотки' },
  },
  bait: {
    button: 'Прикормка',
    title: 'Прикормка',
    waters: (fish, waters) => `Работает только там, где водится ${fish}: ${waters}`,
    active: 'Действует',
    left: (time) => `Осталось ${time}`,
    status: (name, time, works) => (works ? `${name}: ${time}` : `${name}: ${time} — здесь не действует`),
  },
  waters: {
    button: 'Водоём',
    title: 'Водоёмы',
    zone: (name, depth, fish) => `${name}, глубина ${depth}: ${fish}`,
  },
}
