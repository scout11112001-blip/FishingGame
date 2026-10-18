// Картинки для рекламы игры в VK Рекламе (ads.vk.ru) — для объявлений, не для каталога. Запуск: npm run ads
// Требования к объявлениям мини-приложений (ads.vk.ru/help/features/formats):
// - картинки 1:1 — 600×600 и 16:9 — 1080×607, jpg/png до 5 МБ; в верхних 10% ничего важного; текст — не больше 20%
//   площади; без рамок и полей;
// - иконка 256×256;
// - карусель: 3–6 карточек 600×600, без важного в верхних 10% и по 10% с боков (там стрелки листания).
// Все из готовых картинок: сом в прыжке (art/store/snippet.jpg), фон меню, комната и мебель хижины, рыбы, и два кадра
// игры (art/store/game-*.jpg) — их сняли с холста игры в npm run dev:vk: бой с сомом и экран улова.
// Тексты объявлений — в store/vk/ads/texts.md.
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'
import { RIVERS } from '../src/content/rivers/index.ts'
import type { Furniture } from '../src/content/types.ts'

const OUT = 'store/vk/ads'
/** Сом в прыжке и хижина за ним, 1376×768. */
const SNIPPET = 'art/store/snippet.jpg'
const JPEG = { quality: 90, mozjpeg: true }

mkdirSync(`${OUT}/carousel`, { recursive: true })

/** Белые буквы с тёмной обводкой и мягкой тенью — как название на сниппете каталога. */
function title(width: number, height: number, lines: { text: string; x: number; y: number; size: number; sub?: boolean }[], anchor = 'start') {
  const text = lines
    .map(({ text, x, y, size, sub }) =>
      sub
        ? `<text x="${x}" y="${y}" font-size="${size}" letter-spacing="2" fill="#ffe08a" stroke-width="5">${text}</text>`
        : `<text x="${x}" y="${y}" font-size="${size}" fill="#ffffff" stroke-width="7">${text}</text>`,
    )
    .join('')
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <g filter="url(#shadow)" font-family="Arial Black" text-anchor="${anchor}" paint-order="stroke" stroke="#0b2a3a" stroke-linejoin="round">${text}</g>
</svg>`)
}

async function save(image: sharp.Sharp, out: string) {
  const info = await image.jpeg(JPEG).toFile(`${OUT}/${out}`)
  console.log(`${out}: ${info.width}×${info.height}, ${Math.round(info.size / 1024)} КБ`)
}

// 1:1 — середина картинки: хижина и сом в прыжке
await save(sharp(SNIPPET).extract({ left: 570, top: 0, width: 768, height: 768 }).resize(600, 600), 'square.jpg')

// 16:9 — картинка целиком; второй вариант — с названием, опущенным ниже верхних 10% (там ВК ничего важного не пускает)
await save(sharp(SNIPPET).resize(1080, 607, { fit: 'cover' }), 'wide.jpg')
const wideTitle = title(1080, 607, [
  { text: 'Наша', x: 34, y: 128, size: 62 },
  { text: 'рыбалка', x: 34, y: 198, size: 62 },
  { text: 'ХИЖИНА У ОЗЕРА', x: 38, y: 238, size: 22, sub: true },
])
await save(sharp(SNIPPET).resize(1080, 607, { fit: 'cover' }).composite([{ input: wideTitle }]), 'wide-title.jpg')

// Иконка — та же, что у игры в каталоге
await save(sharp('store/vk/icon.jpg').resize(256, 256), 'icon.jpg')

// Карусель. 1 — название на фоне меню: хижина, мостки, удочка с подсаком
const menuTitle = title(600, 600, [
  { text: 'Наша', x: 300, y: 112, size: 60 },
  { text: 'рыбалка', x: 300, y: 176, size: 60 },
  { text: 'ХИЖИНА У ОЗЕРА', x: 300, y: 208, size: 20, sub: true },
], 'middle')
await save(sharp('art/menuBackground.jpg').extract({ left: 456, top: 0, width: 672, height: 672 }).resize(600, 600).composite([{ input: menuTitle }]), 'carousel/1-title.jpg')

// 2 — бой: рывок сома (круг брызг), шкала усилия слева, рамка для пальца внизу
await save(sharp('art/store/game-fight.jpg').extract({ left: 0, top: 590, width: 600, height: 600 }), 'carousel/2-fight.jpg')

// 3 — улов: сом на 35,87 кг и надпись «Поймал!»
await save(sharp('art/store/game-catch.jpg').extract({ left: 0, top: 300, width: 600, height: 600 }), 'carousel/3-catch.jpg')

// 4 — хижина со всей мебелью: так же, как её собирает панель хижины (CabinPanel) — по местам из контента
await save(sharp(await cabin(1024)).resize(600, 600), 'carousel/4-cabin.jpg')

// 5 — стена трофеев: таблички как в игре, от сома до плотвы
await save(sharp(await trophies()), 'carousel/5-trophies.jpg')

/** Комната хижины size×size со всей мебелью: ближние предметы поверх дальних, под каждым — тень на полу. */
async function cabin(size: number): Promise<Buffer> {
  const room = RIVERS.cabin!
  const depth = (item: Furniture): number => {
    const base = item.on && room.furniture.find((f) => f.id === item.on)
    return base ? depth(base) + 0.001 : item.place.bottom
  }
  const layers: sharp.OverlayOptions[] = []
  for (const item of [...room.furniture].sort((a, b) => depth(a) - depth(b))) {
    const { x, bottom, width } = item.place
    const w = Math.round(width * size)
    const sprite = await sharp(`public/${item.sprite}`).resize({ width: w }).toBuffer({ resolveWithObject: true })
    const left = Math.round((x - width / 2) * size)
    const floor = Math.round(bottom * size)
    // Тень — эллипс 6:1 по центру низа предмета, наполовину под ним (как .cabin-shadow)
    const sw = Math.round(w * (item.shadow ?? 0.95))
    const sh = Math.max(2, Math.round(sw / 6))
    const shadow = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><defs><radialGradient id="g"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.6" stop-color="#000" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="${sw / 2}" cy="${sh / 2}" rx="${sw / 2}" ry="${sh / 2}" fill="url(#g)"/></svg>`
    layers.push({ input: Buffer.from(shadow), left: left + Math.round((w - sw) / 2), top: floor - Math.round(sh / 2) })
    layers.push({ input: sprite.data, left, top: floor - sprite.info.height })
  }
  return sharp(`public/${room.interior}`).resize(size, size).composite(layers).png().toBuffer()
}

/** Стена трофеев 600×600: шесть табличек 2×3 — рыба, название, вес. Отступы — с запасом под стрелки карусели. */
async function trophies(): Promise<Buffer> {
  const records: [string, string][] = [
    ['catfish', '35,87 кг'],
    ['pike', '7,22 кг'],
    ['zander', '5,16 кг'],
    ['bream', '2,48 кг'],
    ['perch', '1,08 кг'],
    ['roach', '0,45 кг'],
  ]
  const [cardW, cardH, gap, top] = [222, 160, 16, 62]
  const left0 = (600 - cardW * 2 - gap) / 2
  const layers: sharp.OverlayOptions[] = []
  let svg = ''
  for (const [i, [id, kg]] of records.entries()) {
    const species = RIVERS.fish.find((f) => f.id === id)!
    const x = left0 + (i % 2) * (cardW + gap)
    const y = top + Math.floor(i / 2) * (cardH + gap)
    svg += `<rect x="${x + 1}" y="${y + 1}" width="${cardW - 2}" height="${cardH - 2}" rx="10" fill="url(#card)" stroke="#9a7840" stroke-width="2"/>`
    svg += `<text x="${x + cardW / 2}" y="${y + 116}" font-size="21" font-weight="700" fill="#ffffff">${species.name}</text>`
    svg += `<text x="${x + cardW / 2}" y="${y + 143}" font-size="20" font-weight="700" fill="#ffc107">${kg}</text>`
    // Рыба — в полосе над названием: длинные (сом, щука) упираются в ширину, высокие (лещ) — в высоту
    const fish = await sharp(`public/${RIVERS.art!.fish[id]}`).resize({ width: cardW - 30, height: 78, fit: 'inside' }).toBuffer({ resolveWithObject: true })
    layers.push({ input: fish.data, left: Math.round(x + (cardW - fish.info.width) / 2), top: Math.round(y + 12 + (78 - fish.info.height) / 2) })
  }
  const back = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <defs><linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a22"/><stop offset="1" stop-color="#3f2716"/></linearGradient></defs>
  <rect width="600" height="600" fill="#10364a"/>
  <g font-family="Arial" text-anchor="middle">${svg}</g>
</svg>`)
  return sharp(back).composite(layers).png().toBuffer()
}
