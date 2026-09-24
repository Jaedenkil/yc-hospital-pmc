// ============================================================
// 格式化工具
// ============================================================

/** 金额（元）→ 中文金额显示：自动选亿元 / 万元 */
export function fmtMoney(yuan: number, digits = 2): string {
  if (Math.abs(yuan) >= 1_0000_0000) return `${(yuan / 1_0000_0000).toFixed(digits)} 亿元`
  if (Math.abs(yuan) >= 1_0000) return `${(yuan / 1_0000).toFixed(digits)} 万元`
  return `${yuan} 元`
}

/** 金额（元）→ 仅数值（万元），用于表格右对齐 */
export function toWan(yuan: number, digits = 2): string {
  return (yuan / 1_0000).toFixed(digits)
}

/** 金额（元）→ 仅数值（亿元） */
export function toYi(yuan: number, digits = 2): string {
  return (yuan / 1_0000_0000).toFixed(digits)
}

/** 百分比 */
export function fmtPercent(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`
}

/** 安全百分比（分母为 0 时返回 0） */
export function ratio(part: number, whole: number): number {
  if (!whole) return 0
  return (part / whole) * 100
}

/** 日期显示：2026-09-20 → 2026-09-20（原样）/ 带空值兜底 */
export function fmtDate(d: string | null | undefined, fallback = '—'): string {
  return d ? d : fallback
}

/** 取中文标签 */
export function label<T extends string>(map: Record<T, string>, key: T): string {
  return map[key] ?? key
}
