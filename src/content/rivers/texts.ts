import type { PackTexts } from '../types.ts'

export const RIVERS_TEXTS: PackTexts = {
  wallet: 'Серебро',
  catchCount: 'Улов',
  hints: {
    idle: 'Нажми, чтобы забросить',
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
  ui: {
    selected: 'Выбрано',
    done: 'Готово',
  },
  tackle: {
    button: 'Снасти',
    title: 'Снасти',
    tabs: { rod: 'Удочка', line: 'Леска', reel: 'Катушка' },
    stats: { cast: 'Заброс', strength: 'Прочность', speed: 'Скорость подмотки' },
  },
  waters: {
    button: 'Водоём',
    title: 'Водоёмы',
    fish: 'Водится',
  },
}
