// ============================================================
// 资金模块金额展示工具（资金总览 / 资金台账 / 报表中心共用）
// 口径：页面上的金额一律以「万元 / 亿元」呈现，且带千分位分组，
//       配合全局 .pmc-metric / MoneyText 的等宽数字（tabular-nums）使用
// ============================================================

/** 千分位分组：12345678 → 1,234.57（保留符号，小数位可指定） */
export function groupNumber(value: number, digits = 2): string {
  const fixed = Math.abs(value).toFixed(digits)
  const [int, dec] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = value < 0 ? '-' : ''
  return dec ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`
}

/** 元 → 万元（仅数值，千分位；表格数值列右对齐用） */
export function wan(yuan: number, digits = 2): string {
  return groupNumber(yuan / 1_0000, digits)
}

/** 元 → 万元金额文本（含单位） */
export function wanText(yuan: number, digits = 2): string {
  return `${wan(yuan, digits)} 万元`
}

/** 元 → 亿元（仅数值，千分位） */
export function yi(yuan: number, digits = 2): string {
  return groupNumber(yuan / 1_0000_0000, digits)
}

/** 元 → 亿元金额文本（含单位） */
export function yiText(yuan: number, digits = 2): string {
  return `${yi(yuan, digits)} 亿元`
}
