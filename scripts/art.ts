// Готовит картинки для игры из картинок нейросети. Запуск: npm run art
// - Фоны водоёмов (art/bg → public/bg): увеличивает нейросетью Real-ESRGAN — исходники нейросети мелкие
//   и мыльные, — уменьшает до нужного размера и сохраняет в WebP. Без апскейлера в tools/ — просто перекодирует.
// - Спрайты (art/sprites → public/sprites): вырезает однотонный фон, обрезает пустые поля,
//   уменьшает и сохраняет в WebP с прозрачностью.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

/** Апскейлер: github.com/xinntao/Real-ESRGAN/releases, архив realesrgan-ncnn-vulkan-…-windows.zip. */
const UPSCALER = 'tools/realesrgan/realesrgan-ncnn-vulkan.exe'
/** Модель для фотографий (есть ещё для аниме — им не подходит). Увеличивает в 4 раза. */
const UPSCALE_MODEL = 'realesrgan-x4plus'
const BACKGROUNDS = ['pond', 'river', 'lake']
/** Высота фона: экран телефона с плотностью 2 — около 1600 px. Выше — только лишний вес. */
const BACKGROUND_HEIGHT = 1536

mkdirSync('public/bg', { recursive: true })
const upscale = existsSync(UPSCALER)
if (!upscale) console.warn(`Нет ${UPSCALER} — фоны будут без увеличения`)
const temp = mkdtempSync(join(tmpdir(), 'fishing-art-'))
try {
  for (const name of BACKGROUNDS) {
    let source = `art/bg/${name}.jpg`
    if (upscale) {
      const big = join(temp, `${name}.png`)
      execFileSync(UPSCALER, ['-i', source, '-o', big, '-n', UPSCALE_MODEL], { stdio: 'ignore' })
      source = big
    }
    const out = `public/bg/${name}.webp`
    const result = await sharp(source)
      .resize({ height: BACKGROUND_HEIGHT, withoutEnlargement: !upscale })
      .webp({ quality: 82, effort: 6 })
      .toFile(out)
    console.log(`${name}.jpg → ${out}: ${result.width}×${result.height}, ${Math.round(result.size / 1024)} КБ`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}

interface Job {
  src: string
  out: string
  /** Размер по длинной стороне после обрезки полей: больше не нужно даже на плотном экране. */
  size: number
}

const JOBS: Job[] = [
  { src: 'float.jpg', out: 'float', size: 512 },
  { src: 'rod1.jpg', out: 'rod-bamboo', size: 1024 },
  { src: 'rod2.jpg', out: 'rod-bolognese', size: 1024 },
  { src: 'rod3.jpg', out: 'rod-feeder', size: 1024 },
  { src: 'plotva.jpg', out: 'roach', size: 720 },
  { src: 'karas.jpg', out: 'crucian', size: 720 },
  { src: 'okun.jpg', out: 'perch', size: 720 },
  { src: 'lesh.jpg', out: 'bream', size: 720 },
  { src: 'sudak.jpg', out: 'zander', size: 720 },
  { src: 'shuka.jpg', out: 'pike', size: 720 },
  { src: 'som.jpg', out: 'catfish', size: 720 },
]

/** Отличие от цвета фона (0..441): ниже SOLID — точно фон, выше EDGE — точно предмет, между — мягкий край. */
const SOLID = 40
const EDGE = 90
/** Сколько пикселей пустого поля оставить вокруг предмета. */
const PADDING = 4
/** Насколько далеко от прозрачного края искать розовый отсвет фона: тонкие детали (усы сома) целиком в этой полосе. */
const SPILL_BAND = 8

mkdirSync('public/sprites', { recursive: true })

for (const job of JOBS) {
  const { data, info } = await sharp(`art/sprites/${job.src}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const bg = borderColor(data, width, height)
  const magenta = isMagenta(bg)
  keyOut(data, width, height, bg, magenta)
  if (magenta) despillMagenta(data, width, height)
  const box = opaqueBox(data, width, height)

  const left = Math.max(0, box.left - PADDING)
  const top = Math.max(0, box.top - PADDING)
  const cropW = Math.min(width, box.right + PADDING + 1) - left
  const cropH = Math.min(height, box.bottom + PADDING + 1) - top
  const out = `public/sprites/${job.out}.webp`
  const result = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: job.size, height: job.size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85, alphaQuality: 90, effort: 6 })
    .toFile(out)
  console.log(`${job.src} → ${out}: ${result.width}×${result.height}, ${Math.round(result.size / 1024)} КБ, фон rgb(${bg.join(', ')})`)
}

/** Цвет фона — медиана пикселей по краю картинки: у нейросети фон почти ровный, но с шумом сжатия. */
function borderColor(data: Buffer, width: number, height: number): [number, number, number] {
  const samples: [number, number, number][] = []
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4
    samples.push([data[i], data[i + 1], data[i + 2]])
  }
  for (let x = 0; x < width; x += 4) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 4) {
    push(0, y)
    push(width - 1, y)
  }
  const median = (c: 0 | 1 | 2) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1]
  return [median(0), median(1), median(2)]
}

/**
 * Прозрачным делаем только фон, связанный с краем картинки: заливкой от краёв по похожим на фон пикселям.
 * Так уцелеют детали предмета того же цвета, что и фон, — тёмно-зелёная удочка на зелёном, красные плавники на розовом.
 * На мягком краю убираем примесь фона из цвета, иначе вокруг предмета останется цветная кайма.
 * enclosed — заливать и замкнутые карманы чистого фона (между усом сома и губой): у пурпурного фона так можно,
 * в рыбе такого цвета не бывает, а у зелёного нельзя — съест тёмно-зелёную удочку.
 */
function keyOut(data: Buffer, width: number, height: number, bg: [number, number, number], enclosed: boolean) {
  const distance = (p: number) => Math.hypot(data[p * 4] - bg[0], data[p * 4 + 1] - bg[1], data[p * 4 + 2] - bg[2])
  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const seed = (p: number) => {
    if (!visited[p] && distance(p) < EDGE) {
      visited[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }
  if (enclosed) for (let p = 0; p < width * height; p++) if (distance(p) < SOLID) seed(p)
  while (stack.length) {
    const p = stack.pop()!
    const x = p % width
    const d = distance(p)
    const alpha = Math.min(Math.max((d - SOLID) / (EDGE - SOLID), 0), 1)
    const i = p * 4
    if (alpha > 0) {
      for (let c = 0; c < 3; c++) data[i + c] = clampByte((data[i + c] - (1 - alpha) * bg[c]) / alpha)
    }
    data[i + 3] = Math.round(alpha * 255)
    // Заливка идёт только по почти чистому фону; мягкий край предмета красим, но дальше через него не идём
    if (d >= SOLID) continue
    if (x > 0) seed(p - 1)
    if (x < width - 1) seed(p + 1)
    if (p >= width) seed(p - width)
    if (p < width * (height - 1)) seed(p + width)
  }
}

function isMagenta([r, g, b]: [number, number, number]): boolean {
  return r - g > 80 && b - g > 80
}

/**
 * Убирает розовый отсвет пурпурного фона у краёв: пиксель не может быть «пурпурнее», чем позволяет его зелёный канал.
 * Только у краёв — внутри рыбы розовое бывает настоящим (рот, жабры). Для зелёного фона так нельзя: у фидера зелёная сама удочка.
 */
function despillMagenta(data: Buffer, width: number, height: number) {
  // Расстояние до прозрачного — волной от прозрачных пикселей на SPILL_BAND шагов
  const dist = new Uint8Array(width * height).fill(255)
  let front: number[] = []
  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] < 255) {
      dist[p] = 0
      front.push(p)
    }
  }
  for (let step = 1; step <= SPILL_BAND && front.length; step++) {
    const next: number[] = []
    for (const p of front) {
      const x = p % width
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= width * height || dist[q] <= step) continue
        dist[q] = step
        next.push(q)
      }
    }
    front = next
  }
  for (let p = 0; p < width * height; p++) {
    if (dist[p] > SPILL_BAND) continue
    const i = p * 4
    const g = data[i + 1]
    const excess = Math.min(data[i], data[i + 2]) - g
    if (excess <= 0) continue
    data[i] -= excess
    data[i + 2] -= excess
  }
}

function opaqueBox(data: Buffer, width: number, height: number) {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 16) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return { left, right, top, bottom }
}

function clampByte(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)))
}
