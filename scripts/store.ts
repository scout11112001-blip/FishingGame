// Картинки для витрин площадок — то, что загружается в кабинет разработчика, а не в саму игру. Запуск: npm run store
// - Большой сниппет ВК (art/store/snippet.jpg → store/vk/snippet.jpg): 1120×630, название крупно в левом верхнем углу,
//   в свободном от удочки небе. Низ картинки пустой: в подборках ВК может наложить туда свой текст.
//   Шрифт — Arial Black из Windows: тот же жирный рубленый, что у заголовка меню в игре.
// - Универсальная иконка ВК (из той же картинки → store/vk/icon.jpg): 576×576, сом в прыжке с брызгами, без текста —
//   ВК сам делает из неё иконки 278 и 150 px, где надпись всё равно не прочитать. Кусок картинки маленький, поэтому
//   его сначала увеличивает нейросеть Real-ESRGAN (как фоны в npm run art); без неё — просто растягиваем.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const SOURCE = 'art/store/snippet.jpg'
const SNIPPET = { out: 'store/vk/snippet.jpg', width: 1120, height: 630 }
const TITLE = ['Наша', 'рыбалка']
const SUBTITLE = 'ХИЖИНА У ОЗЕРА'
/** Иконка: квадрат исходника (в его пикселях, 1376×768) — сом целиком от пасти до хвоста и брызги под ним. */
const ICON = { out: 'store/vk/icon.jpg', size: 576, crop: { left: 800, top: 150, size: 440 } }

const UPSCALER = 'tools/realesrgan/realesrgan-ncnn-vulkan.exe'
const UPSCALE = 4

mkdirSync('store/vk', { recursive: true })

const { width, height } = SNIPPET
// Тёмная обводка и мягкая тень: белые буквы читаются и на светлом рассветном небе, и на тёмной удочке
const text = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="140%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <g filter="url(#shadow)" font-family="Arial Black" paint-order="stroke" stroke="#0b2a3a" stroke-linejoin="round">
    <text x="36" y="92" font-size="66" fill="#ffffff" stroke-width="7">${TITLE[0]}</text>
    <text x="36" y="166" font-size="66" fill="#ffffff" stroke-width="7">${TITLE[1]}</text>
    <text x="40" y="208" font-size="23" letter-spacing="2" fill="#ffe08a" stroke-width="5">${SUBTITLE}</text>
  </g>
</svg>`

const snippet = await sharp(SOURCE)
  .resize(width, height, { fit: 'cover' })
  .composite([{ input: Buffer.from(text) }])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(SNIPPET.out)
console.log(`${SOURCE} → ${SNIPPET.out}: ${snippet.width}×${snippet.height}, ${Math.round(snippet.size / 1024)} КБ`)

const temp = mkdtempSync(join(tmpdir(), 'fishing-store-'))
try {
  let source = SOURCE
  let scale = 1
  if (existsSync(UPSCALER)) {
    source = join(temp, 'source.png')
    execFileSync(UPSCALER, ['-i', SOURCE, '-o', source, '-n', 'realesrgan-x4plus'], { stdio: 'ignore' })
    scale = UPSCALE
  } else console.warn(`Нет ${UPSCALER} — иконка без увеличения`)
  const { left, top, size } = ICON.crop
  const icon = await sharp(source)
    .extract({ left: left * scale, top: top * scale, width: size * scale, height: size * scale })
    .resize(ICON.size, ICON.size)
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(ICON.out)
  console.log(`${SOURCE} → ${ICON.out}: ${icon.width}×${icon.height}, ${Math.round(icon.size / 1024)} КБ`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
