// ============================================================
// mock 数据访问层（页面只从这里取数，将来换真接口只改本文件）
// ============================================================

import type { FundSource, Phase, SubProject } from './types'
import { buildProjects, TODAY, validateProjects } from './generate'
import { buildDocs } from './docs'
import { buildIssues, buildSupervisionRecords } from './supervision'
import { buildAuditRecords, buildMeetings, buildTestTasks } from './audit'
import { buildLogs, buildUsers } from './users'
import type {
  AuditRecord,
  DocItem,
  IssueItem,
  OperationLog,
  ReviewMeeting,
  SupervisionRecord,
  TestTask,
  UserInfo,
} from './types'

export * from './types'
export { TASK_WEIGHT, TODAY, phaseOf, projectProgress, validateProjects } from './generate'
export type { DataIssue } from './generate'

/** 全部子项目（懒构建 + 缓存，保证演示期间数据稳定） */
let cache: SubProject[] | null = null
export function allProjects(): SubProject[] {
  if (!cache) {
    cache = buildProjects()
    // 开发期自检：数据不自洽时在控制台暴露，避免演示时被追问穿帮
    if (import.meta.env.DEV) {
      const issues = validateProjects(cache)
      if (issues.length) console.warn('[mock 数据自洽校验] 发现问题 →', issues)
    }
  }
  return cache
}

/** 模拟接口异步（演示加载态用） */
export function fetchProjects(delay = 200): Promise<SubProject[]> {
  return new Promise((resolve) => setTimeout(() => resolve(allProjects()), delay))
}

/** 按编号取单个项目 */
export function findProject(id: string): SubProject | undefined {
  return allProjects().find((p) => p.id === id)
}

/** 已拨付金额（全部资金来源合计：中央专项 + 其他资金） */
export function paidAmount(p: SubProject): number {
  return p.fundPlan.filter((b) => b.payDate).reduce((s, b) => s + b.amount, 0)
}

/** 已使用金额（全部资金来源合计） */
export function usedAmount(p: SubProject): number {
  return p.fundPlan.reduce((s, b) => s + b.used, 0)
}

/** 按资金来源统计已拨付金额；不传来源即统计全部 */
export function paidAmountOf(p: SubProject, sources?: FundSource[]): number {
  const list = sources ? p.fundPlan.filter((b) => sources.includes(b.source)) : p.fundPlan
  return list.filter((b) => b.payDate).reduce((s, b) => s + b.amount, 0)
}

/** 按资金来源统计已使用金额；不传来源即统计全部 */
export function usedAmountOf(p: SubProject, sources?: FundSource[]): number {
  const list = sources ? p.fundPlan.filter((b) => sources.includes(b.source)) : p.fundPlan
  return list.reduce((s, b) => s + b.used, 0)
}

/** 「其他资金」包含的来源（地方配套 + 单位自筹），供各页复用 */
export const OTHER_SOURCES: FundSource[] = ['地方配套', '单位自筹']

export interface FundSummary {
  /** 建设总投资 */
  total: number
  /** 中央专项资金总额 */
  central: number
  /** 其他资金总额（建设总投资 − 中央专项资金） */
  other: number
  /** 已拨付总额（中央专项 + 其他资金） */
  paid: number
  /** 已使用总额（全部来源） */
  used: number
  /** 结余（已拨付 − 已使用） */
  balance: number
  /** 待拨付中央资金 */
  centralPending: number
  /** 中央专项资金已拨付 */
  centralPaid: number
  /** 其他资金已拨付（地方配套 + 单位自筹） */
  otherPaid: number
  /** 其中：地方配套已拨付 */
  localPaid: number
  /** 其中：单位自筹已拨付 */
  selfPaid: number
  /** 其他资金已使用 */
  otherUsed: number
  /** 中央资金拨付率（%）= 中央已拨付 ÷ 中央专项资金 */
  paidRate: number
  /** 其他资金拨付率（%）= 其他已拨付 ÷ 其他资金 */
  otherPaidRate: number
  /** 已拨付资金使用率（%）= 已使用 ÷ 已拨付 */
  usedRate: number
}

/**
 * 资金总览（需求模块3 的总览五大金额）
 * 按需求区分「中央专项资金」与「其他资金」两条拨付线，其他资金再细分为地方配套与单位自筹。
 */
export function fundSummary(): FundSummary {
  const list = allProjects()
  const total = list.reduce((s, p) => s + p.totalInvestment, 0)
  const central = list.reduce((s, p) => s + p.centralFund, 0)
  const other = total - central
  const centralPaid = list.reduce((s, p) => s + paidAmountOf(p, ['中央专项']), 0)
  const localPaid = list.reduce((s, p) => s + paidAmountOf(p, ['地方配套']), 0)
  const selfPaid = list.reduce((s, p) => s + paidAmountOf(p, ['单位自筹']), 0)
  const otherPaid = localPaid + selfPaid
  const paid = centralPaid + otherPaid
  const used = list.reduce((s, p) => s + usedAmount(p), 0)
  const otherUsed = list.reduce((s, p) => s + usedAmountOf(p, OTHER_SOURCES), 0)
  return {
    total,
    central,
    other,
    paid,
    used,
    balance: paid - used,
    centralPending: central - centralPaid,
    centralPaid,
    otherPaid,
    localPaid,
    selfPaid,
    otherUsed,
    paidRate: central ? (centralPaid / central) * 100 : 0,
    otherPaidRate: other ? (otherPaid / other) * 100 : 0,
    usedRate: paid ? (used / paid) * 100 : 0,
  }
}

/** 各阶段项目数量（需求模块2 统计看板） */
export function phaseStats(): Record<Phase, number> {
  const stat: Record<Phase, number> = { 立项: 0, 采购: 0, 建设: 0, 验收: 0 }
  for (const p of allProjects()) stat[p.phase]++
  return stat
}

/** 各状态子任务数量（五色统计） */
export function taskStatusStats() {
  const stat = { 'not-started': 0, doing: 0, done: 0, warn: 0, overdue: 0 }
  for (const p of allProjects()) for (const t of p.tasks) stat[t.status]++
  return stat
}

/** 风险等级分布 */
export function riskStats() {
  const stat = { low: 0, mid: 0, high: 0 }
  for (const p of allProjects()) stat[p.riskLevel]++
  return stat
}

/** 牵头处室归集（需求模块2：按牵头处室统计项目清单） */
export interface DeptStat {
  dept: string
  list: SubProject[]
  count: number
  investment: number
  central: number
  paid: number
  /** 各阶段项目数量 */
  phaseCount: Record<Phase, number>
  /** 高风险项目数 */
  highRisk: number
}

export function byDepartment(): DeptStat[] {
  const map = new Map<string, SubProject[]>()
  for (const p of allProjects()) {
    const arr = map.get(p.leadDept) ?? []
    arr.push(p)
    map.set(p.leadDept, arr)
  }
  return [...map.entries()].map(([dept, list]) => ({
    dept,
    list,
    count: list.length,
    investment: list.reduce((s, p) => s + p.totalInvestment, 0),
    central: list.reduce((s, p) => s + p.centralFund, 0),
    paid: list.reduce((s, p) => s + paidAmount(p), 0),
    phaseCount: {
      立项: list.filter((p) => p.phase === '立项').length,
      采购: list.filter((p) => p.phase === '采购').length,
      建设: list.filter((p) => p.phase === '建设').length,
      验收: list.filter((p) => p.phase === '验收').length,
    },
    highRisk: list.filter((p) => p.riskLevel === 'high').length,
  }))
}

/** 资金预警（需求模块3）：超概算 / 拨付滞后 / 结余过大 */
export interface FundWarning {
  projectId: string
  projectName: string
  type: '超概算' | '拨付滞后' | '结余过大'
  detail: string
  level: 'warn' | 'high'
}

export function fundWarnings(): FundWarning[] {
  const out: FundWarning[] = []
  for (const p of allProjects()) {
    const paid = paidAmount(p)
    const used = usedAmount(p)
    const changeSum = p.changes.reduce((s, c) => s + c.amount, 0)
    // 超概算：变更累计调增超过批复总投资 5%
    if (changeSum > p.totalInvestment * 0.05) {
      out.push({
        projectId: p.id,
        projectName: p.name,
        type: '超概算',
        detail: `变更累计调增 ${Math.round(changeSum / 10000)} 万元，超过概算 5%`,
        level: 'high',
      })
    }
    // 拨付滞后：计划拨付时间已过但仍未拨付（注明是哪个资金来源的钱）
    const late = p.fundPlan.filter((b) => !b.payDate && b.planDate < TODAY)
    if (late.length) {
      const sources = [...new Set(late.map((b) => b.source))].join('、')
      out.push({
        projectId: p.id,
        projectName: p.name,
        type: '拨付滞后',
        detail: `${late.length} 个批次已超计划拨付时间未到账（${sources}；最早 ${late[0].planDate}）`,
        level: 'warn',
      })
    }
    // 结余过大：已拨付但使用率低于 60%
    if (paid > 0 && used / paid < 0.6) {
      out.push({
        projectId: p.id,
        projectName: p.name,
        type: '结余过大',
        detail: `已拨付资金使用率仅 ${Math.round((used / paid) * 100)}%，结余 ${Math.round((paid - used) / 10000)} 万元`,
        level: 'warn',
      })
    }
  }
  return out
}

// ============================================================
// 模块 5~9 业务数据访问（懒构建 + 缓存，写法与 allProjects 保持一致）
// 各函数返回同一份缓存数组，保证演示期间数据稳定、页面之间口径一致
// ============================================================

/** 全部归档文档（模块 5） */
let docCache: DocItem[] | null = null
export function allDocs(): DocItem[] {
  if (!docCache) docCache = buildDocs()
  return docCache
}

/** 全部监理台账记录（模块 6） */
let supervisionCache: SupervisionRecord[] | null = null
export function allSupervisionRecords(): SupervisionRecord[] {
  if (!supervisionCache) supervisionCache = buildSupervisionRecords()
  return supervisionCache
}

/** 全部监理问题（模块 6） */
let issueCache: IssueItem[] | null = null
export function allIssues(): IssueItem[] {
  if (!issueCache) issueCache = buildIssues()
  return issueCache
}

/** 全部跟踪审计记录（模块 7） */
let auditCache: AuditRecord[] | null = null
export function allAuditRecords(): AuditRecord[] {
  if (!auditCache) auditCache = buildAuditRecords()
  return auditCache
}

/** 全部软件测评任务（模块 7） */
let testTaskCache: TestTask[] | null = null
export function allTestTasks(): TestTask[] {
  if (!testTaskCache) testTaskCache = buildTestTasks()
  return testTaskCache
}

/** 全部评审会议（模块 7） */
let meetingCache: ReviewMeeting[] | null = null
export function allMeetings(): ReviewMeeting[] {
  if (!meetingCache) meetingCache = buildMeetings()
  return meetingCache
}

/** 全部系统用户（模块 8） */
let userCache: UserInfo[] | null = null
export function allUsers(): UserInfo[] {
  if (!userCache) userCache = buildUsers()
  return userCache
}

/** 全部操作日志（模块 9）：按时间倒序，最近的操作在最前 */
let logCache: OperationLog[] | null = null
export function allLogs(): OperationLog[] {
  if (!logCache) {
    logCache = buildLogs().sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
  }
  return logCache
}
