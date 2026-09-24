// ============================================================
// mock 数据层的公共工具：演示基准日、确定性随机、日期运算
// 各数据生成器共用，避免重复实现与循环依赖
// ============================================================

/** 演示基准日（固定）：所有"已发生"数据不晚于此日 */
export const TODAY = '2026-09-20'

/** 确定性伪随机（mulberry32）：同种子永远同序列，保证演示数据可复现 */
export function seedRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 日期偏移（天） */
export function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

/** 日期字符串是否早于基准日 */
export function isPast(date: string): boolean {
  return date < TODAY
}

/** 两个日期相差的天数（b - a） */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000,
  )
}

/** 数字补零：pad(3, 3) => '003' */
export function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

/** 从数组中取一个（确定性） */
export function pickOne<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

/** 从数组中取若干个不重复项（确定性），count 超过数组长度时取全部 */
export function pickSome<T>(arr: T[], count: number, rand: () => number): T[] {
  const pool = [...arr]
  const out: T[] = []
  const n = Math.min(count, pool.length)
  for (let i = 0; i < n; i++) {
    out.push(...pool.splice(Math.floor(rand() * pool.length), 1))
  }
  return out
}
