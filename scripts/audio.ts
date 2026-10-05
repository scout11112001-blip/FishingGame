// Готовит звуки для игры из скачанных исходников. Запуск: npm run audio
// art/audio → public/audio: вырезает нужный кусок, сводит в моно, при надобности понижает частоту,
// делает короткие затухания на краях (без них на стыке щёлкает) и пишет 16-битный WAV.
// Без ffmpeg и сторонних пакетов: исходники — WAV или FLAC, их читаем сами.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { readFlacMono } from './flac.ts'

interface Job {
  src: string
  out: string
  /** Кусок исходника, секунды. Без end — до конца. */
  start?: number
  end?: number
  /** Во сколько раз понизить частоту: 2 — с 44,1 до 22 кГц (фону хватает) или с 96 до 48 кГц (больше и не нужно). */
  downsample?: number
  /** Затухание на краях, секунды. */
  fade: number
}

const JOBS: Job[] = [
  // Всплеск поплавка: сам удар и брызги — первые 1,1 с, дальше тишина
  { src: 'mixkit-fish-jumping-in-water-2922.wav', out: 'splash', end: 1.1, fade: 0.08 },
  // Фон у воды — 30 с из середины трёхминутной записи, по кругу. Затухание крошечное: только чтобы стык не щёлкал
  { src: 'mixkit-crickets-near-the-river-2459.wav', out: 'ambient-river', start: 60, end: 90, downsample: 2, fade: 0.01 },
  // Рыба вытащена — всплеск. Записан на 96 кГц: вдвое ниже ничего не теряет
  { src: '867458__qubodup__waboba-moon-ball-water-splash-3.flac', out: 'catch', downsample: 2, fade: 0.03 },
]

mkdirSync('public/audio', { recursive: true })
for (const job of JOBS) {
  const { samples, rate } = readMono(`art/audio/${job.src}`)
  const from = Math.floor((job.start ?? 0) * rate)
  const to = Math.min(samples.length, Math.floor((job.end ?? Infinity) * rate))
  let cut = samples.subarray(from, to)
  let outRate = rate
  if (job.downsample && job.downsample > 1) {
    cut = downsample(cut, job.downsample)
    outRate = rate / job.downsample
  }
  fadeEdges(cut, Math.floor(job.fade * outRate))
  const out = `public/audio/${job.out}.wav`
  const bytes = writeWav16(out, cut, outRate)
  console.log(`${job.src} → ${out}: ${(cut.length / outRate).toFixed(2)} с, ${outRate} Гц, ${Math.round(bytes / 1024)} КБ`)
}

/** Исходник в моно: FLAC или WAV. */
function readMono(path: string): { samples: Float32Array; rate: number } {
  const b = readFileSync(path)
  return path.endsWith('.flac') ? readFlacMono(b) : readWavMono(b, path)
}

/** WAV в моно: PCM 16 или 24 бит, в том числе формат «extensible» (так пишут многие сайты со звуками). */
function readWavMono(b: Buffer, path: string): { samples: Float32Array; rate: number } {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: не WAV`)
  let pos = 12
  let channels = 0
  let rate = 0
  let bits = 0
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4)
    const size = b.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === 'fmt ') {
      const tag = b.readUInt16LE(body)
      channels = b.readUInt16LE(body + 2)
      rate = b.readUInt32LE(body + 4)
      bits = b.readUInt16LE(body + 14)
      // 0xFFFE — extensible: настоящий формат в подформате
      const format = tag === 0xfffe ? b.readUInt16LE(body + 24) : tag
      if (format !== 1 || (bits !== 16 && bits !== 24)) throw new Error(`${path}: нужен PCM 16 или 24 бит`)
    } else if (id === 'data') {
      const bytes = bits / 8
      const frames = Math.floor(size / (bytes * channels))
      const samples = new Float32Array(frames)
      for (let f = 0; f < frames; f++) {
        let sum = 0
        for (let c = 0; c < channels; c++) {
          const at = body + (f * channels + c) * bytes
          sum += bits === 16 ? b.readInt16LE(at) / 32768 : b.readIntLE(at, 3) / 8388608
        }
        samples[f] = sum / channels
      }
      return { samples, rate }
    }
    pos = body + size + (size & 1)
  }
  throw new Error(`${path}: нет звука`)
}

/** Понизить частоту в factor раз: среднее соседних отсчётов заодно срезает то, что новая частота не передаст. */
function downsample(x: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(x.length / factor))
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    for (let k = 0; k < factor; k++) sum += x[i * factor + k]
    out[i] = sum / factor
  }
  return out
}

function fadeEdges(x: Float32Array, n: number) {
  for (let i = 0; i < n && i < x.length; i++) {
    const k = i / n
    x[i] *= k
    x[x.length - 1 - i] *= k
  }
}

function writeWav16(path: string, x: Float32Array, rate: number): number {
  const data = Buffer.alloc(x.length * 2)
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // моно
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([header, data]))
  return header.length + data.length
}
