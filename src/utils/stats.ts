// ============================================================
// 业务统计计算（页面与报表共用）
// 只做纯计算，不依赖 UI，也不直接取数
// ============================================================

import type { Phase, SubProject, TaskStatus } from '@/mock/types'

/** 投资规模区间档位（对应需求模块 2「投资规模区间」筛选维度） */
export interface InvestRange {
  key: string
  label: string
  min: number
  max: number
}

export const INVEST_RANGES: InvestRange[] = [
  { key: 'lt2000', label: '2000 万元以下', min: 0, max: 2000 * 10000 },
  { key: '2000-5000', label: '2000 万 ~ 5000 万元', min: 2000 * 10000, max: 5000 * 10000 },
  { key: '5000-9000', label: '5000 万 ~ 9000 万元', min: 5000 * 10000, max: 9000 * 10000 },
  { key: 'gt9000', label: '9000 万元以上', min: 9000 * 10000, max: Number.POSITIVE_INFINITY },
]

/** 判断投资额所属区间 */
export function investRangeOf(investment: number): InvestRange {
  return (
    INVEST_RANGES.find((r) => investment >= r.min && investment < r.max) ?? INVEST_RANGES[INVEST_RANGES.length - 1]
  )
}

/** 按区间分组统计项目数与投资额 */
export function statsByInvestRange(list: SubProject[]) {
  return INVEST_RANGES.map((r) => {
    const group = list.filter((p) => p.totalInvestment >= r.min && p.totalInvestment < r.max)
    return {
      key: r.key,
      label: r.label,
      count: group.length,
      investment: group.reduce((s, p) => s + p.totalInvestment, 0),
      list: group,
    }
  })
}

/** 子任务状态计数（项目级） */
export function projectTaskStat(p: SubProject): Record<TaskStatus, number> {
  const stat: Record<TaskStatus, number> = { 'not-started': 0, doing: 0, done: 0, warn: 0, overdue: 0 }
  for (const t of p.tasks) stat[t.status]++
  return stat
}

/** 项目的滞后任务数（延期预警 + 严重滞后） */
export function delayCountOf(p: SubProject): number {
  return p.tasks.filter((t) => t.status === 'warn' || t.status === 'overdue').length
}

/** 当前进行中的子任务（用于"当前节点"展示） */
export function currentTask(p: SubProject) {
  return p.tasks.find((t) => t.status === 'warn' || t.status === 'overdue') ?? p.tasks.find((t) => t.status === 'doing')
}

/** 阶段分组（进度总览页按阶段分组用） */
export function groupByPhase(list: SubProject[]): Array<{ phase: Phase; list: SubProject[] }> {
  const order: Phase[] = ['立项', '采购', '建设', '验收']
  return order.map((phase) => ({ phase, list: list.filter((p) => p.phase === phase) }))
}

// ---------------- 报表周期（按月 / 按季） ----------------

export type PeriodType = 'month' | 'quarter'

export interface Period {
  type: PeriodType
  /** month: 2026-09；quarter: 2026-Q3 */
  value: string
  label: string
  start: string
  end: string
}

/** 解析周期值 → 起止日期 */
export function parsePeriod(type: PeriodType, value: string): Period {
  if (type === 'month') {
    const [y, m] = value.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    return {
      type,
      value,
      label: `${y} 年 ${m} 月`,
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    }
  }
  const [y, q] = value.split('-Q').map(Number)
  const startMonth = (q - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(y, endMonth, 0).getDate()
  return {
    type,
    value,
    label: `${y} 年第 ${q} 季度`,
    start: `${y}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** 演示基准日（与 mock 层一致）：2026-09-20 */
export const DEMO_TODAY = '2026-09-20'

/** 生成可选周期列表（以基准日所在月/季为最新一期，往前 N 期） */
export function periodOptions(type: PeriodType, count = 8): Period[] {
  const base = new Date(`${DEMO_TODAY}T00:00:00`)
  const out: Period[] = []
  for (let i = 0; i < count; i++) {
    if (type === 'month') {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      out.push(parsePeriod('month', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))
    } else {
      const q = Math.floor(base.getMonth() / 3) + 1 - i
      const y = base.getFullYear() + Math.floor((q - 1) / 4)
      const qq = ((((q - 1) % 4) + 4) % 4) + 1
      out.push(parsePeriod('quarter', `${y}-Q${qq}`))
    }
  }
  return out
}

/** 日期是否落在周期内 */
export function inPeriod(date: string | null | undefined, period: Period): boolean {
  if (!date) return false
  return date >= period.start && date <= period.end
}
