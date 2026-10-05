// Чтение FLAC без сторонних пакетов — для скрипта звуков. Формат открытый: https://xiph.org/flac/format.html
// Поддержано всё, что пишут обычные кодировщики: подкадры CONSTANT, VERBATIM, FIXED и LPC, остатки Райса,
// совместное стерео. Метаданные кроме STREAMINFO пропускаем, контрольные суммы не проверяем.

/** Звук в моно: среднее всех каналов, отсчёты от -1 до 1. */
export function readFlacMono(b: Buffer): { samples: Float32Array; rate: number } {
  if (b.toString('ascii', 0, 4) !== 'fLaC') throw new Error('не FLAC')
  let pos = 4
  let rate = 0
  let channels = 0
  let bps = 0
  let total = 0
  // Блоки метаданных: первый — STREAMINFO, у последнего старший бит заголовка = 1
  for (let last = false; !last; ) {
    last = (b[pos] & 0x80) !== 0
    const type = b[pos] & 0x7f
    const size = b.readUIntBE(pos + 1, 3)
    if (type === 0) {
      const s = pos + 4
      rate = (b[s + 10] << 12) | (b[s + 11] << 4) | (b[s + 12] >> 4)
      channels = ((b[s + 12] >> 1) & 7) + 1
      bps = (((b[s + 12] & 1) << 4) | (b[s + 13] >> 4)) + 1
      total = (b[s + 13] & 0x0f) * 2 ** 32 + b.readUInt32BE(s + 14)
    }
    pos += 4 + size
  }

  const r = new BitReader(b, pos)
  const out: number[][] = Array.from({ length: channels }, () => [])
  while (r.bytePos < b.length - 2 && (!total || out[0].length < total)) {
    if (!r.syncToFrame()) break
    decodeFrame(r, out, rate, bps)
  }
  const frames = total ? Math.min(total, out[0].length) : out[0].length
  const scale = 2 ** (bps - 1)
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += out[c][i]
    samples[i] = sum / channels / scale
  }
  return { samples, rate }
}

const BLOCK_SIZES = [0, 192, 576, 1152, 2304, 4608, 0, 0, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]
const SAMPLE_SIZES = [0, 8, 12, 0, 16, 20, 24, 32]

function decodeFrame(r: BitReader, out: number[][], streamRate: number, streamBps: number) {
  r.bits(14) // синхрослово уже найдено
  r.bits(2) // резерв и способ нарезки блоков
  const sizeCode = r.bits(4)
  const rateCode = r.bits(4)
  const assignment = r.bits(4)
  const sizeBitsCode = r.bits(3)
  r.bits(1)
  r.utf8Number() // номер кадра или первого отсчёта — нам не нужен
  let blockSize = BLOCK_SIZES[sizeCode]
  if (sizeCode === 6) blockSize = r.bits(8) + 1
  else if (sizeCode === 7) blockSize = r.bits(16) + 1
  if (rateCode === 12) r.bits(8)
  else if (rateCode === 13 || rateCode === 14) r.bits(16)
  r.bits(8) // CRC-8 заголовка
  void streamRate
  const bps = SAMPLE_SIZES[sizeBitsCode] || streamBps

  const channels = assignment < 8 ? assignment + 1 : 2
  const decoded: number[][] = []
  for (let c = 0; c < channels; c++) {
    // В совместном стерео канал разности на бит шире
    const side = (assignment === 8 && c === 1) || (assignment === 9 && c === 0) || (assignment === 10 && c === 1)
    decoded.push(decodeSubframe(r, blockSize, bps + (side ? 1 : 0)))
  }
  if (assignment === 8) {
    // левый + разность
    for (let i = 0; i < blockSize; i++) decoded[1][i] = decoded[0][i] - decoded[1][i]
  } else if (assignment === 9) {
    // разность + правый
    for (let i = 0; i < blockSize; i++) decoded[0][i] = decoded[0][i] + decoded[1][i]
  } else if (assignment === 10) {
    // середина + разность
    for (let i = 0; i < blockSize; i++) {
      const side = decoded[1][i]
      const mid = decoded[0][i] * 2 + (side & 1)
      decoded[0][i] = (mid + side) / 2
      decoded[1][i] = (mid - side) / 2
    }
  }
  for (let c = 0; c < channels && c < out.length; c++) for (const s of decoded[c]) out[c].push(s)
  r.alignToByte()
  r.bits(16) // CRC-16 кадра
}

function decodeSubframe(r: BitReader, n: number, bps: number): number[] {
  r.bits(1)
  const type = r.bits(6)
  let wasted = 0
  if (r.bits(1)) {
    wasted = 1
    while (!r.bits(1)) wasted++
  }
  const width = bps - wasted
  let samples: number[]
  if (type === 0) {
    const v = r.signed(width)
    samples = new Array(n).fill(v)
  } else if (type === 1) {
    samples = Array.from({ length: n }, () => r.signed(width))
  } else if (type >= 8 && type <= 12) {
    const order = type - 8
    samples = Array.from({ length: order }, () => r.signed(width))
    readResidual(r, n, order, samples)
    const FIXED = [[], [1], [2, -1], [3, -3, 1], [4, -6, 4, -1]][order]
    for (let i = order; i < n; i++) {
      let p = 0
      for (let k = 0; k < order; k++) p += FIXED[k] * samples[i - 1 - k]
      samples[i] += p
    }
  } else if (type >= 32) {
    const order = type - 31
    samples = Array.from({ length: order }, () => r.signed(width))
    const precision = r.bits(4) + 1
    const shift = r.signed(5)
    const coefs = Array.from({ length: order }, () => r.signed(precision))
    readResidual(r, n, order, samples)
    // Сумма произведений укладывается в точность double: отсчёт ≤ 32 бит, коэффициент ≤ 15 бит, слагаемых ≤ 32
    const div = 2 ** shift
    for (let i = order; i < n; i++) {
      let p = 0
      for (let k = 0; k < order; k++) p += coefs[k] * samples[i - 1 - k]
      samples[i] += Math.floor(p / div)
    }
  } else {
    throw new Error(`неизвестный подкадр FLAC ${type}`)
  }
  if (wasted) for (let i = 0; i < n; i++) samples[i] *= 2 ** wasted
  return samples
}

/** Остаток предсказания (коды Райса): дописывает отсчёты в samples после первых order «разгонных». */
function readResidual(r: BitReader, n: number, order: number, samples: number[]) {
  const method = r.bits(2)
  const paramBits = method === 0 ? 4 : 5
  const escape = method === 0 ? 15 : 31
  const partitionOrder = r.bits(4)
  const partitions = 2 ** partitionOrder
  for (let p = 0; p < partitions; p++) {
    const count = partitionOrder === 0 ? n - order : p === 0 ? n / partitions - order : n / partitions
    const k = r.bits(paramBits)
    if (k === escape) {
      const raw = r.bits(5)
      for (let i = 0; i < count; i++) samples.push(raw ? r.signed(raw) : 0)
    } else {
      for (let i = 0; i < count; i++) {
        let q = 0
        while (!r.bits(1)) q++
        const u = q * 2 ** k + (k ? r.bits(k) : 0)
        // Зигзаг: 0, -1, 1, -2, 2 …
        samples.push(u % 2 ? -(u + 1) / 2 : u / 2)
      }
    }
  }
}

class BitReader {
  bytePos: number
  private bit = 0
  private readonly b: Buffer

  constructor(b: Buffer, pos: number) {
    this.b = b
    this.bytePos = pos
  }

  /** Беззнаковое число из n бит (n ≤ 32), старшим битом вперёд. */
  bits(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.bytePos]
      v = v * 2 + ((byte >> (7 - this.bit)) & 1)
      if (++this.bit === 8) {
        this.bit = 0
        this.bytePos++
      }
    }
    return v
  }

  signed(n: number): number {
    const v = this.bits(n)
    return v >= 2 ** (n - 1) ? v - 2 ** n : v
  }

  alignToByte() {
    if (this.bit) {
      this.bit = 0
      this.bytePos++
    }
  }

  /** Встать на начало кадра: синхрослово 0xFFF8 или 0xFFF9. */
  syncToFrame(): boolean {
    this.alignToByte()
    while (this.bytePos < this.b.length - 1) {
      if (this.b[this.bytePos] === 0xff && (this.b[this.bytePos + 1] & 0xfe) === 0xf8) return true
      this.bytePos++
    }
    return false
  }

  /** Число в «UTF-8»-кодировке из заголовка кадра. */
  utf8Number(): number {
    let v = this.bits(8)
    let extra = 0
    for (let mask = 0x80; v & mask && mask; mask >>= 1) extra++
    if (extra) {
      v &= 0xff >> (extra + 1)
      for (let i = 1; i < extra; i++) v = v * 64 + (this.bits(8) & 0x3f)
    }
    return v
  }
}
