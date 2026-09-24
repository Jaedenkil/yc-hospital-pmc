// ============================================================
// 子项目 mock 数据生成器
// 用固定种子推算，保证每次打开数据完全一致（演示可复现），
// 且金额、时间、进度、阶段四者自洽（见文件末尾 validateProjects）
// ============================================================

import type {
  FundBatch,
  FundChange,
  FundSource,
  Phase,
  PhaseTask,
  RiskLevel,
  SubProject,
  TaskStatus,
} from './types'
import { PHASE_ORDER } from './types'
import {
  DEPARTMENTS,
  OWNER_ORGS,
  OWNERS,
  PROJECT_SUFFIXES,
  SUPERVISORS,
  TASK_TEMPLATES,
} from './seed'
import { TODAY, addDays, daysBetween, minDate, pad, seedRandom } from './utils'

export { TODAY }

/** 项目规模档位（万元） */
const INVEST_TIERS = [1200, 2400, 3800, 5600, 8200, 11500, 15800]

/** 中央专项资金占总投资的比例区间 */
const CENTRAL_RATIO: [number, number] = [0.32, 0.62]

/**
 * 20 个项目的进度基准（%），由高到低排列。
 * 取值经过校准，使——
 *   1. 四阶段项目数量分布 = 验收 4 / 建设 6 / 采购 5 / 立项 5；
 *   2. 每个项目「已完成子任务数」的落点与其所处阶段一致
 *      （阶段由任务推导，与任务清单天然自洽）。
 */
const PROGRESS_PLAN = [97, 92, 88, 83, 77, 71, 66, 61, 55, 51, 47, 42, 38, 33, 25, 18, 14, 9, 5, 0]

/** 拨款比例结构（按批次数量取用，每组合计为 1） */
const PAY_PLANS: Record<number, number[]> = {
  1: [1], // 一次性拨付
  2: [0.5, 0.5], // 两批对半
  3: [0.3, 0.4, 0.3], // 预付款 / 进度款 / 验收尾款
  4: [0.25, 0.3, 0.25, 0.2],
  5: [0.2, 0.25, 0.25, 0.2, 0.1], // 末批为质保金
}

/** 滞后原因备注库 */
const DELAY_REASONS = [
  '供应商人员投入不足，开发进度滞后',
  '需求变更评审延期，影响排期',
  '设备到货延迟，联调推后',
]

/** 子任务完成度权重（用于计算项目整体完成百分比） */
export const TASK_WEIGHT: Record<TaskStatus, number> = {
  done: 1,
  doing: 0.5,
  warn: 0.5,
  overdue: 0.3,
  'not-started': 0,
}

/** 当前所处阶段 = 第一个尚未完成的子任务所在阶段 */
export function phaseOf(tasks: PhaseTask[]): Phase {
  return tasks.find((t) => t.status !== 'done')?.phase ?? '验收'
}

/** 生成全部子项目 */
export function buildProjects(): SubProject[] {
  const rand = seedRandom(20260920)
  const projects: SubProject[] = []

  for (let i = 0; i < 20; i++) {
    const progress = PROGRESS_PLAN[i]
    const src = PROJECT_SUFFIXES[i % PROJECT_SUFFIXES.length]
    const owner = OWNER_ORGS[i % OWNER_ORGS.length]
    const tier = INVEST_TIERS[Math.floor(rand() * INVEST_TIERS.length)]
    const totalInvestment = Math.round((tier + rand() * tier * 0.18) * 10000) // 元
    const centralFund = Math.round(
      totalInvestment * (CENTRAL_RATIO[0] + rand() * (CENTRAL_RATIO[1] - CENTRAL_RATIO[0])),
    )

    // 计划开工：越靠后的项目开工越晚；计划验收：开工后 14~26 个月
    const planStart = addDays('2024-03-01', Math.round(i * 42 + rand() * 30))
    const planAccept = addDays(planStart, Math.round((420 + rand() * 360) / 30) * 30)
    /** 项目已实际经过的天数（用于把变更、拨付压在基准日之前） */
    const span = Math.max(daysBetween(planStart, TODAY), 30)

    // ---- 四阶段子任务 ----
    const names: Array<{ phase: Phase; name: string }> = []
    for (const phase of PHASE_ORDER) {
      for (const name of TASK_TEMPLATES[phase]) names.push({ phase, name })
    }
    const total = names.length
    const doneCount = Math.floor((progress / 100) * total)

    const tasks: PhaseTask[] = names.map((item, idx) => {
      const ratio = (idx / Math.max(total - 1, 1)) * 100
      const planEnd = addDays(planStart, Math.round(((idx + 1) / total) * 540))
      let status: TaskStatus = 'not-started'
      let actualEnd: string | null = null

      if (idx < doneCount) {
        status = 'done'
        // 实际完成：计划完成时间前后小幅浮动，且不晚于基准日
        actualEnd = minDate(addDays(planEnd, Math.round(rand() * 14 - 6)), TODAY)
      } else if (idx === doneCount) {
        const r = rand()
        status = r < 0.42 ? 'doing' : r < 0.72 ? 'warn' : 'overdue'
      } else {
        status = ratio > progress ? 'not-started' : 'doing'
      }

      const delayed = status === 'warn' || status === 'overdue'
      return {
        phase: item.phase,
        name: item.name,
        planEnd,
        actualEnd,
        status,
        owner: OWNERS[Math.floor(rand() * OWNERS.length)],
        delayReason: delayed ? DELAY_REASONS[Math.floor(rand() * DELAY_REASONS.length)] : undefined,
        attachments: status === 'not-started' ? 0 : Math.floor(rand() * 5),
      }
    })

    // ---- 资金拨付批次：中央专项资金 + 其他资金（地方配套 / 单位自筹）----
    // 每组批次的金额合计等于该资金来源的总额（末批补齐取整误差）；
    // 组内已拨付批次数随项目进度推进，保证"中央拨了多少、地方拨了多少"可分别统计。
    const fundPlan: FundBatch[] = []
    let batchNo = 0
    const pushBatches = (source: FundSource, grantTotal: number, count: number) => {
      if (grantTotal <= 0 || count <= 0) return
      const plan = PAY_PLANS[count] ?? PAY_PLANS[3]
      const paidCount = Math.min(
        count,
        Math.floor((progress / 100) * count) + (progress > 40 ? 1 : 0),
      )
      let amountSum = 0
      for (let b = 0; b < count; b++) {
        const planDate = addDays(planStart, 30 + Math.round(((b + 1) / count) * 520))
        const amount =
          b === count - 1
            ? grantTotal - amountSum
            : Math.round(grantTotal * (plan[b] ?? 1 / count))
        amountSum += amount
        // 已拨付：批次序号在范围内，且计划拨付时间已到（绝不会出现"未来已拨付"）
        const paid = b < paidCount && planDate <= TODAY
        fundPlan.push({
          batch: ++batchNo,
          source,
          planDate,
          payDate: paid ? minDate(addDays(planDate, Math.round(rand() * 20 - 5)), TODAY) : null,
          amount,
          used: paid ? Math.round(amount * (0.6 + rand() * 0.35)) : 0,
        })
      }
    }

    // 中央专项资金：3~5 批
    pushBatches('中央专项', centralFund, 3 + Math.floor(rand() * 3))
    // 其他资金 = 建设总投资 − 中央专项资金，细分为地方配套（约 55%~70%）与单位自筹
    const otherFund = totalInvestment - centralFund
    const localFund = Math.round(otherFund * (0.55 + rand() * 0.15))
    pushBatches('地方配套', localFund, 1 + Math.floor(rand() * 2))
    pushBatches('单位自筹', otherFund - localFund, 1 + Math.floor(rand() * 2))

    // ---- 变更调增 / 调减记录（只发生在已推进到一定程度的项目上） ----
    const changes: FundChange[] = []
    const changeCount = progress > 20 && rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0
    for (let c = 0; c < changeCount; c++) {
      const up = rand() < 0.6
      changes.push({
        id: `${pad(i + 1, 3)}-C${c + 1}`,
        date: addDays(planStart, Math.round(span * (0.25 + rand() * 0.6))),
        reason: up ? '需求新增模块，经评审批准调增' : '建设内容调减，核减预算',
        amount: Math.round(totalInvestment * (0.02 + rand() * 0.06)) * (up ? 1 : -1),
        approved: rand() < 0.85,
      })
    }

    // ---- 风险等级：由子任务状态直接推导 ----
    const riskLevel: RiskLevel = tasks.some((t) => t.status === 'overdue')
      ? 'high'
      : tasks.some((t) => t.status === 'warn')
        ? 'mid'
        : 'low'

    projects.push({
      id: `YC-HI-2026-${pad(i + 1, 3)}`,
      name: `${owner.replace('盐城市', '市')}${src.suffix}`,
      leadDept: DEPARTMENTS[i % DEPARTMENTS.length],
      owner,
      totalInvestment,
      centralFund,
      content: src.content,
      planStart,
      planAccept,
      phase: phaseOf(tasks),
      riskLevel,
      tasks,
      fundPlan,
      changes,
      docCount: Math.round((progress / 100) * 26) + Math.floor(rand() * 6),
      supervisor: SUPERVISORS[i % SUPERVISORS.length],
    })
  }

  return projects
}

/**
 * 单个项目的整体完成度（%）：按子任务完成度加权
 * 口径：已完成 100%、进行中 / 延期预警 50%、严重滞后 30%、未开始 0%
 */
export function projectProgress(p: SubProject): number {
  if (!p.tasks.length) return 0
  const sum = p.tasks.reduce((s, t) => s + TASK_WEIGHT[t.status], 0)
  return Math.round((sum / p.tasks.length) * 100)
}

/** 数据自洽问题 */
export interface DataIssue {
  projectId: string
  field: string
  message: string
}

/**
 * 演示数据自洽校验：任何一条不通过都说明生成逻辑有问题。
 * 演示前跑一遍（开发期在控制台暴露），保证数据经得起追问。
 */
export function validateProjects(list: SubProject[]): DataIssue[] {
  const issues: DataIssue[] = []
  const push = (projectId: string, field: string, message: string) =>
    issues.push({ projectId, field, message })

  for (const p of list) {
    // 1. 四大阶段子任务齐全
    for (const phase of PHASE_ORDER) {
      if (!p.tasks.some((t) => t.phase === phase)) push(p.id, 'tasks', `缺少「${phase}」阶段子任务`)
    }
    // 2. 子任务计划时间按顺序递增
    for (let i = 1; i < p.tasks.length; i++) {
      if (p.tasks[i].planEnd < p.tasks[i - 1].planEnd)
        push(p.id, 'tasks', `子任务「${p.tasks[i].name}」计划时间早于前一节点`)
    }
    // 3. 已完成任务必须有实际完成时间，且不晚于基准日
    for (const t of p.tasks) {
      if (t.status === 'done' && !t.actualEnd)
        push(p.id, 'tasks', `子任务「${t.name}」标记已完成但无实际完成时间`)
      if (t.actualEnd && t.actualEnd > TODAY)
        push(p.id, 'tasks', `子任务「${t.name}」实际完成时间晚于基准日`)
    }
    // 4. 项目所处阶段与任务推进一致
    const expectPhase = phaseOf(p.tasks)
    if (p.phase !== expectPhase)
      push(p.id, 'phase', `阶段标记为「${p.phase}」，但任务推进到「${expectPhase}」`)
    // 5. 中央资金不得超过总投资
    if (p.centralFund > p.totalInvestment)
      push(p.id, 'centralFund', '中央专项资金超过建设总投资')
    // 6. 资金批次：按来源核对合计（中央专项 = 中央资金；地方配套 + 单位自筹 = 其他资金）、
    //    拨付不超对应来源总额、使用不超拨付、时间不晚于基准日
    const sumBy = (sources: FundSource[]) =>
      p.fundPlan.filter((b) => sources.includes(b.source)).reduce((s, b) => s + b.amount, 0)
    const paidBy = (sources: FundSource[]) =>
      p.fundPlan
        .filter((b) => sources.includes(b.source) && b.payDate)
        .reduce((s, b) => s + b.amount, 0)
    const centralTotal = sumBy(['中央专项'])
    if (centralTotal !== p.centralFund)
      push(p.id, 'fundPlan', `中央专项批次合计（${centralTotal}）与中央专项资金不一致`)
    const otherTotal = sumBy(['地方配套', '单位自筹'])
    const expectOther = p.totalInvestment - p.centralFund
    if (otherTotal !== expectOther)
      push(
        p.id,
        'fundPlan',
        `其他资金批次合计（${otherTotal}）与「建设总投资 − 中央专项资金」（${expectOther}）不一致`,
      )
    const allTotal = centralTotal + otherTotal
    if (allTotal !== p.totalInvestment)
      push(p.id, 'fundPlan', `全部批次合计（${allTotal}）与建设总投资不一致`)
    if (paidBy(['中央专项']) > p.centralFund)
      push(p.id, 'fundPlan', '中央专项已拨付金额超过中央专项资金')
    if (paidBy(['地方配套', '单位自筹']) > expectOther)
      push(p.id, 'fundPlan', '其他资金已拨付金额超过其他资金总额')
    for (const b of p.fundPlan) {
      if (b.used > b.amount) push(p.id, 'fundPlan', `第 ${b.batch} 批次使用金额超过拨付金额`)
      if (b.payDate && b.payDate > TODAY)
        push(p.id, 'fundPlan', `第 ${b.batch} 批次拨付时间晚于基准日`)
      if (b.payDate && b.payDate < p.planStart)
        push(p.id, 'fundPlan', `第 ${b.batch} 批次拨付时间早于计划开工`)
    }
    // 7. 变更记录日期不得晚于基准日
    for (const c of p.changes) {
      if (c.date > TODAY) push(p.id, 'changes', `变更记录 ${c.id} 时间晚于基准日`)
    }
  }

  return issues
}
