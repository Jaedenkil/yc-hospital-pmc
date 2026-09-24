// ============================================================
// 报表中心内置报表定义（报表中心与报表预览共用同一份口径，避免两处各写一遍）
// 资金口径：分「中央专项」（中央财政拨款）与「其他资金」（建设总投资 − 中央专项资金，含地方配套与单位自筹）
//           两条资金线；拨付 / 使用 / 结余按资金来源拆列并给出合计，金额单位统一为万元（千分位、2 位小数）
// 表格结构：可选的「本期汇总行（summary）」+ 明细行（rows）+ 合计行（total）；
//           「数据行数」只统计明细行（rows.length），屏上表格、导出 Excel、打印三处同源同值。
// 周期口径：
//   · fund / delay 为「发生额」类报表，数据随统计周期（月度 / 季度）变化；
//   · overview / phase / dept 为「截至台账」类报表，固定为截至基准日 TODAY 的累计口径，不随周期变化。
// ============================================================

import {
  allProjects,
  byDepartment,
  fundSummary,
  OTHER_SOURCES,
  paidAmount,
  paidAmountOf,
  projectProgress,
  TODAY,
  usedAmount,
} from '@/mock'
import { PHASE_ORDER, RISK_LABEL, TASK_STATUS_LABEL } from '@/mock/types'
import type { FundSource, Phase, SubProject } from '@/mock/types'
import { inPeriod, projectTaskStat } from '@/utils/stats'
import type { Period } from '@/utils/stats'
import { ratio } from '@/utils/format'

export type Cell = string | number
export type Align = 'left' | 'center' | 'right'

export interface ReportDef {
  key: string
  /** 报表名称 */
  name: string
  /** 口径说明 */
  desc: string
  /** 数据来源（打印页脚） */
  source: string
  header: string[]
  align: Align[]
  /** 列较多时横向打印 */
  landscape?: boolean
  /** 数据行（发生额 / 本期口径随统计周期变化） */
  rows: (period: Period) => Cell[][]
  /** 合计行 */
  total: (period: Period) => Cell[]
  /** 报表级汇总行（可选）：渲染在数据行之前，用于「本期应完成 / 本期新增」等周期口径 */
  summary?: (period: Period) => Cell[]
  /** 空周期提示文案（可选）：数据行为空时在表格内提示（可按周期给出口径数字），避免出现空白表格 */
  emptyText?: (period: Period) => string
}

/** 千分位格式化（保留 2 位小数）：12345.678 → 12,345.68 */
function thousands(v: number): string {
  const [int, dec] = Math.abs(v).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${v < 0 ? '-' : ''}${grouped}.${dec}`
}

/** 元 → 万元（字符串：保留 2 位 + 千分位），报表金额列统一口径 */
function toWan(yuan: number): string {
  return thousands(yuan / 1_0000)
}

/** 百分比（数值，保留 1 位） */
function toPct(part: number, whole: number): number {
  return Number(ratio(part, whole).toFixed(1))
}

/** 累计口径基准日（与 mock 数据层 TODAY 一致）：2026-09-20 */
const AS_OF = TODAY
/** 「截至台账」类报表的标题口径后缀，避免与周期口径混淆 */
const AS_OF_TAG = `（截至 ${AS_OF} 累计）`

const SOURCE_TZ = '数据来源：信息化全流程项目管控平台 · 子项目台账与四阶段子任务（资金口径：中央专项资金 + 其他资金）'
const SOURCE_FUND = '数据来源：信息化全流程项目管控平台 · 项目资金台账（批次拨付、变更调增调减）'
const SOURCE_SUP = '数据来源：信息化全流程项目管控平台 · 项目台账与监理台账（延期预警、严重滞后节点）'

/** 中央专项资金来源（单条资金线；其他资金见 mock 的 OTHER_SOURCES） */
const CENTRAL_SOURCES: FundSource[] = ['中央专项']

/** 资金口径的数据源（资金汇总） */
function fundOf() {
  return fundSummary()
}

/** 全部子项目（与页面共用同一份缓存数据） */
function list(): SubProject[] {
  return allProjects()
}

/**
 * 本期实际拨付金额（元，全部资金来源：中央专项 + 其他资金）：按批次「实际拨付时间」payDate
 * 落在统计周期内归属，计划拨付时间 planDate 仅用于计划口径，不计入发生额
 */
function paidInPeriod(p: SubProject, period: Period): number {
  return p.fundPlan.filter((b) => inPeriod(b.payDate, period)).reduce((s, b) => s + b.amount, 0)
}

/** 本期使用金额（元，全部资金来源）：mock 只提供分批次使用额（未提供使用时间），故随该批次实际拨付时间归属本期 */
function usedInPeriod(p: SubProject, period: Period): number {
  return p.fundPlan.filter((b) => inPeriod(b.payDate, period)).reduce((s, b) => s + b.used, 0)
}

/** 延期风险节点：延期预警 + 严重滞后（按任务当前状态统计，覆盖全部项目） */
interface DelayNode {
  project: SubProject
  phase: Phase
  name: string
  planEnd: string
  actualEnd: string | null
  status: 'warn' | 'overdue'
  delayReason: string
  owner: string
}

function delayNodes(): DelayNode[] {
  const out: DelayNode[] = []
  for (const p of list()) {
    for (const t of p.tasks) {
      if (t.status === 'warn' || t.status === 'overdue') {
        out.push({
          project: p,
          phase: t.phase,
          name: t.name,
          planEnd: t.planEnd,
          actualEnd: t.actualEnd,
          status: t.status,
          delayReason: t.delayReason ?? '—',
          owner: t.owner,
        })
      }
    }
  }
  return out
}

/** 计划完成时间落在统计周期内的延期 / 滞后节点（按计划完成时间升序） */
function delayNodesIn(period: Period): DelayNode[] {
  return delayNodes()
    .filter((d) => inPeriod(d.planEnd, period))
    .sort((a, b) => a.planEnd.localeCompare(b.planEnd))
}

/** 计划完成时间落在统计周期内的全部子任务节点数（「本期应完成」口径，含已完成 / 未完成） */
function dueNodesIn(period: Period): number {
  let count = 0
  for (const p of list()) {
    for (const t of p.tasks) if (inPeriod(t.planEnd, period)) count++
  }
  return count
}

/** 上期结转未闭环的延期 / 滞后节点数（计划完成时间早于本期开始，仍未闭环） */
function carriedNodesIn(period: Period): number {
  return delayNodes().filter((d) => d.planEnd < period.start).length
}

export const REPORT_DEFS: ReportDef[] = [
  {
    key: 'overview',
    name: `示范项目总体进展汇总报表${AS_OF_TAG}`,
    desc: `按 20 个子项目汇总四阶段任务推进情况、整体完成度与风险等级；截至 ${AS_OF} 累计台账口径，不随统计周期变化`,
    source: SOURCE_TZ,
    header: [
      '项目编号',
      '项目名称',
      '牵头处室',
      '当前阶段',
      '整体完成度',
      '已完成 / 进行中',
      '延期预警',
      '严重滞后',
      '风险等级',
      '计划验收',
    ],
    align: ['left', 'left', 'left', 'center', 'right', 'center', 'right', 'right', 'center', 'center'],
    rows: () =>
      list().map((p) => {
        const stat = projectTaskStat(p)
        return [
          p.id,
          p.name,
          p.leadDept,
          p.phase,
          `${projectProgress(p)}%`,
          `${stat.done} / ${stat.doing}`,
          stat.warn,
          stat.overdue,
          `${RISK_LABEL[p.riskLevel]}风险`,
          p.planAccept,
        ]
      }),
    total: () => {
      const items = list()
      const avg = Math.round(items.reduce((s, p) => s + projectProgress(p), 0) / items.length)
      return [
        '合计',
        `${items.length} 个子项目`,
        `${new Set(items.map((p) => p.leadDept)).size} 个牵头处室`,
        '',
        `${avg}%`,
        '',
        items.reduce((s, p) => s + projectTaskStat(p).warn, 0),
        items.reduce((s, p) => s + projectTaskStat(p).overdue, 0),
        `高风险 ${items.filter((p) => p.riskLevel === 'high').length} 个`,
        '',
      ]
    },
  },
  {
    key: 'phase',
    name: `分阶段项目数量统计表${AS_OF_TAG}`,
    desc: `按立项、采购、建设、验收四个阶段统计项目数量、投资额与资金拨付情况；口径：中央专项资金 = 中央财政拨款，其他资金 = 建设总投资 − 中央专项资金（含地方配套与单位自筹）；截至 ${AS_OF} 累计台账口径，不随统计周期变化`,
    source: SOURCE_TZ,
    header: [
      '阶段',
      '项目数量（个）',
      '数量占比（%）',
      '建设总投资（万元）',
      '中央专项资金（万元）',
      '其他资金（万元）',
      '累计已拨付（万元，全部来源）',
    ],
    align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
    rows: () =>
      PHASE_ORDER.map((phase) => {
        const items = list().filter((p) => p.phase === phase)
        const investment = items.reduce((s, p) => s + p.totalInvestment, 0)
        const central = items.reduce((s, p) => s + p.centralFund, 0)
        return [
          phase,
          items.length,
          toPct(items.length, list().length),
          toWan(investment),
          toWan(central),
          toWan(investment - central),
          toWan(items.reduce((s, p) => s + paidAmount(p), 0)),
        ]
      }),
    total: () => {
      const s = fundOf()
      return [
        '合计',
        list().length,
        100,
        toWan(s.total),
        toWan(s.central),
        toWan(s.other),
        toWan(s.paid),
      ]
    },
  },
  {
    key: 'dept',
    name: `各牵头处室项目清单报表${AS_OF_TAG}`,
    desc: `按牵头处室汇总项目清单、投资规模、中央资金拨付率与高风险项目数；口径：「累计已拨付·合计」为中央专项 + 其他资金两条资金线的全部到账金额，「中央拨付率」= 累计已拨付·中央专项 ÷ 中央专项资金；截至 ${AS_OF} 累计台账口径，不随统计周期变化`,
    source: SOURCE_TZ,
    header: [
      '牵头处室',
      '项目数量（个）',
      '建设总投资（万元）',
      '中央专项资金（万元）',
      '累计已拨付·合计（万元）',
      '累计已拨付·中央专项（万元）',
      '中央拨付率（%）',
      '高风险项目数（个）',
    ],
    align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
    rows: () =>
      byDepartment().map((d) => {
        const centralPaid = d.list.reduce((s, p) => s + paidAmountOf(p, CENTRAL_SOURCES), 0)
        return [
          d.dept,
          d.count,
          toWan(d.investment),
          toWan(d.central),
          toWan(d.paid),
          toWan(centralPaid),
          toPct(centralPaid, d.central),
          d.highRisk,
        ]
      }),
    total: () => {
      const s = fundOf()
      return [
        '合计',
        list().length,
        toWan(s.total),
        toWan(s.central),
        toWan(s.paid),
        toWan(s.centralPaid),
        toPct(s.centralPaid, s.central),
        list().filter((p) => p.riskLevel === 'high').length,
      ]
    },
  },
  {
    key: 'fund',
    name: '项目资金拨付及结余明细表',
    desc: `资金口径分两条线：中央专项资金（中央财政拨款）与其他资金（建设总投资 − 中央专项资金，含地方配套与单位自筹）；累计已拨付按资金来源拆列并给出合计；累计列为截至 ${AS_OF} 台账口径（不随周期变化），末两列「本期」为统计周期内实际到账批次口径（全部资金来源），随月 / 季切换变化`,
    source: SOURCE_FUND,
    landscape: true,
    header: [
      '项目编号',
      '项目名称',
      '中央专项资金（万元）',
      '其他资金（万元）',
      '累计已拨付·中央专项（万元）',
      '累计已拨付·其他资金（万元）',
      '累计已拨付·地方配套（万元）',
      '累计已拨付·单位自筹（万元）',
      '累计已拨付·合计（万元）',
      '中央拨付率（%）',
      '累计已使用（万元）',
      '累计使用率（%）',
      '累计结余（万元）',
      '待拨付·合计（万元）',
      '变更净额（万元）',
      '本期拨付·合计（万元）',
      '本期使用·合计（万元）',
    ],
    align: [
      'left',
      'left',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
    ],
    rows: (period) =>
      list().map((p) => {
        const paid = paidAmount(p)
        const centralPaid = paidAmountOf(p, CENTRAL_SOURCES)
        const otherPaid = paidAmountOf(p, OTHER_SOURCES)
        const localPaid = paidAmountOf(p, ['地方配套'])
        const selfPaid = paidAmountOf(p, ['单位自筹'])
        const otherFund = p.totalInvestment - p.centralFund
        const used = usedAmount(p)
        const change = p.changes.reduce((s, c) => s + c.amount, 0)
        return [
          p.id,
          p.name,
          toWan(p.centralFund),
          toWan(otherFund),
          toWan(centralPaid),
          toWan(otherPaid),
          toWan(localPaid),
          toWan(selfPaid),
          toWan(paid),
          toPct(centralPaid, p.centralFund),
          toWan(used),
          toPct(used, paid),
          toWan(paid - used),
          toWan(p.centralFund - centralPaid + (otherFund - otherPaid)),
          toWan(change),
          toWan(paidInPeriod(p, period)),
          toWan(usedInPeriod(p, period)),
        ]
      }),
    total: (period) => {
      const s = fundOf()
      const items = list()
      const change = items.reduce((sum, p) => sum + p.changes.reduce((x, c) => x + c.amount, 0), 0)
      return [
        '合计',
        `${items.length} 个项目`,
        toWan(s.central),
        toWan(s.other),
        toWan(s.centralPaid),
        toWan(s.otherPaid),
        toWan(s.localPaid),
        toWan(s.selfPaid),
        toWan(s.paid),
        toPct(s.centralPaid, s.central),
        toWan(s.used),
        toPct(s.used, s.paid),
        toWan(s.balance),
        toWan(s.centralPending + (s.other - s.otherPaid)),
        toWan(change),
        toWan(items.reduce((sum, p) => sum + paidInPeriod(p, period), 0)),
        toWan(items.reduce((sum, p) => sum + usedInPeriod(p, period), 0)),
      ]
    },
  },
  {
    key: 'delay',
    name: '项目延期风险预警清单报表',
    desc: '按统计周期筛选：仅列计划完成时间落在本期（月 / 季）区间内的延期预警与严重滞后节点（即本期到期未闭环），并汇总本期应完成节点数、本期新增延期风险事项与上期结转未闭环数',
    source: SOURCE_SUP,
    header: [
      '项目编号',
      '项目名称',
      '阶段',
      '延期节点',
      '计划完成时间',
      '实际完成时间',
      '任务状态',
      '滞后原因',
      '负责人',
    ],
    align: ['left', 'left', 'center', 'left', 'center', 'center', 'center', 'left', 'center'],
    /** 本期汇总行：本期应完成节点数 / 本期新增延期风险事项数（随月 / 季切换变化） */
    summary: (period) => {
      const nodes = delayNodesIn(period)
      const warn = nodes.filter((d) => d.status === 'warn').length
      return [
        '本期汇总',
        `本期应完成 ${dueNodesIn(period)} 个节点`,
        '',
        `本期新增延期风险预警 ${nodes.length} 项`,
        '',
        '',
        `延期预警 ${warn} / 严重滞后 ${nodes.length - warn}`,
        '',
        '',
      ]
    },
    /** 周期内无延期节点时的表格内提示（带本期应完成 / 结转数，随月 / 季切换变化），避免出现空白表格 */
    emptyText: (period) =>
      `本期无延期风险预警事项（本期应完成 ${dueNodesIn(period)} 个节点，上期结转未闭环 ${carriedNodesIn(period)} 项）`,
    rows: (period) =>
      delayNodesIn(period).map((d) => [
        d.project.id,
        d.project.name,
        d.phase,
        d.name,
        d.planEnd,
        d.actualEnd ?? '—',
        TASK_STATUS_LABEL[d.status],
        d.delayReason,
        d.owner,
      ]),
    total: (period) => {
      const nodes = delayNodesIn(period)
      return [
        '合计',
        `${nodes.length} 个延期节点`,
        '',
        `上期结转未闭环 ${carriedNodesIn(period)} 项`,
        '',
        '',
        `严重滞后 ${nodes.filter((d) => d.status === 'overdue').length} 个`,
        '',
        '',
      ]
    },
  },
]

/** 按 key 取报表定义 */
export function findReport(key: string): ReportDef | undefined {
  return REPORT_DEFS.find((d) => d.key === key)
}
