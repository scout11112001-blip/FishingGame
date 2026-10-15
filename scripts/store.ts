// Картинки для витрин площадок — то, что загружается в кабинет разработчика, а не в саму игру. Запуск: npm run store
// - Большой сниппет ВК (art/store/snippet.jpg → store/vk/snippet.jpg): 1120×630, название крупно в левом верхнем углу,
//   в свободном от удочки небе. Низ картинки пустой: в подборках ВК может наложить туда свой текст.
//   Шрифт — Arial Black из Windows: тот же жирный рубленый, что у заголовка меню в игре.
// - Универсальная иконка ВК (из той же картинки → store/vk/icon.jpg): 576×576, сом в прыжке с брызгами, без текста —
//   ВК сам делает из неё иконки 278 и 150 px, где надпись всё равно не прочитать. Кусок картинки маленький, поэтому
//   его сначала увеличивает нейросеть Real-ESRGAN (как фоны в npm run art); без неё — просто растягиваем.
// - Обложка сообщества ВК (оттуда же → store/vk/cover.jpg): 1920×768, тоже из увеличенной картинки.
// - Фавикон ВК (рисованный поплавок → store/vk/favicon.png): 32×32.
// Скриншоты для ВК (store/vk/screenshots, 600×1200) скриптом не делаются — их снимают в игре (npm run dev:vk).
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
/**
 * Обложка сообщества ВК: 1920×768 (2,5 : 1) — полоса исходника во всю ширину, от верхушек сосен до брызг под сомом.
 * Без текста: название сообщества ВК пишет под обложкой сам.
 */
const COVER = { out: 'store/vk/cover.jpg', width: 1920, height: 768, crop: { top: 110, height: 550 } }
/**
 * Фавикон ВК (значок вкладки браузера): 32×32 PNG, до 50 КБ. Сом в таком размере — пятно, тонкий поплавок из игры —
 * полоска; читается только простая фигура: круглый красно-белый поплавок на воде, на тёмно-синем скруглённом квадрате.
 */
const FAVICON = { out: 'store/vk/favicon.png', size: 32 }

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

  const meta = await sharp(source).metadata()
  const cover = await sharp(source)
    .extract({ left: 0, top: COVER.crop.top * scale, width: meta.width, height: COVER.crop.height * scale })
    .resize(COVER.width, COVER.height, { fit: 'cover' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(COVER.out)
  console.log(`${SOURCE} → ${COVER.out}: ${cover.width}×${cover.height}, ${Math.round(cover.size / 1024)} КБ`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}

// Рисуем в 8 раз крупнее и уменьшаем — так края сглаживаются. Координаты — в долях стороны 256
const floatSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><clipPath id="top"><rect width="256" height="132"/></clipPath></defs>
  <rect width="256" height="256" rx="56" fill="#10364a"/>
  <path d="M30 176 q24 -14 48 0 t48 0 t48 0 t48 0" fill="none" stroke="#5fb3d9" stroke-width="10" stroke-linecap="round"/>
  <rect x="122" y="30" width="12" height="54" rx="6" fill="#f5f5f5"/>
  <circle cx="128" cy="132" r="56" fill="#ffffff"/>
  <circle cx="128" cy="132" r="56" fill="#e53935" clip-path="url(#top)"/>
  <circle cx="128" cy="132" r="56" fill="none" stroke="#0b2a3a" stroke-width="8"/>
</svg>`
const favicon = await sharp(Buffer.from(floatSvg)).resize(FAVICON.size, FAVICON.size).png().toFile(FAVICON.out)
console.log(`поплавок → ${FAVICON.out}: ${favicon.width}×${favicon.height}, ${(favicon.size / 1024).toFixed(1)} КБ`)
