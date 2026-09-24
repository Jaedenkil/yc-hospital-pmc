// ============================================================
// 审计与评审（需求模块 7）mock 数据生成器
// 覆盖三块台账：
//   1. AuditRecord  —— 跟踪审计简报 + 专项审计报告（60~80 条）
//   2. TestTask     —— 软件测评任务（只为建设 / 验收阶段项目生成，8~12 条）
//   3. ReviewMeeting—— 可研评审 / 概算评审 / 招标文件评审 / 需求评审 / 验收评审（40~60 条）
// 生成规则：全部由子项目（buildProjects）的阶段推进与子任务完成情况推导，
// 所有"已发生"日期不晚于演示基准日 TODAY，且用固定种子 + seedRandom 保证可复现。
// 本文件只负责生成，数据由 src/mock/index.ts 统一对外暴露（allAuditRecords /
// allTestTasks / allMeetings 懒构建 + 缓存），页面一律从 @/mock 取数。
// ============================================================

import type { AuditRecord, PhaseTask, ReviewMeeting, SubProject, TestTask } from './types'
import { buildProjects } from './generate'
import { TEST_AGENCIES } from './seed'
import { TODAY, addDays, daysBetween, maxDate, minDate, pad, pickOne, seedRandom } from './utils'

/**
 * 基础项目数据：buildProjects() 是固定种子的纯函数，其结果与 @/mock 的 allProjects()
 * 完全一致（同样的 20 个项目、同样的任务与时间），这里缓存一份供三个生成器共用，
 * 同时避免与 index.ts 形成循环依赖。
 */
let cachedProjects: SubProject[] | null = null
function baseProjects(): SubProject[] {
  if (!cachedProjects) cachedProjects = buildProjects()
  return cachedProjects
}

/** 审计组人员（审计处派出，用作简报 / 专项报告的主审人） */
const AUDITORS = ['沈明远', '顾晓岚', '陆承志', '严晓燕']

/** 取项目下指定名称的子任务 */
function taskOf(project: SubProject, name: string): PhaseTask | undefined {
  return project.tasks.find((t) => t.name === name)
}

/** 子任务已完成时返回该任务，否则返回 undefined（审计报告 / 评审会议只在节点真正完成后出具） */
function doneTask(project: SubProject, name: string): PhaseTask | undefined {
  const task = taskOf(project, name)
  return task && task.status === 'done' ? task : undefined
}

/** 记录编号：AUD-001 / TST-001 / MTG-001 */
function seqId(prefix: string, index: number): string {
  return `${prefix}-${pad(index + 1, 3)}`
}

// ------------------------------------------------------------
// 一、跟踪审计简报 + 专项审计报告
// ------------------------------------------------------------

/** 审计记录生成器固定种子（与项目生成器的 20260920 区分，避免随机序列同步） */
const AUDIT_SEED = 20261108

/** 跟踪审计简报：2025 年 1 月起按月出一期，2026 年 9 月为最后一期（发布日期不晚于基准日） */
const BRIEF_FIRST_YEAR = 2025
const BRIEF_LAST = { year: 2026, month: 9 }
/** 每期简报覆盖的项目数（同期记录共用期号与主审人，标题带项目名以示区分） */
const BRIEF_COVER = 3
/** 每期发布日：每月 18 日（2026 年 9 月期 → 2026-09-18，早于演示基准日 2026-09-20） */
const BRIEF_DAY = 18

/** 专项审计主题（按项目轮换，避免同一项目出现两份同一主题的报告） */
const SPECIAL_TOPICS = [
  '专项资金使用专项审计报告',
  '招标采购专项审计报告',
  '合同履约情况专项审计报告',
  '资金支付与结余情况专项审计报告',
]

/** 专项审计报告条数区间：与 63 条简报合计 73~77 条，落在需求要求的 60~80 条内 */
const SPECIAL_MIN = 10
const SPECIAL_MAX = 14

/**
 * 生成审计台账（模块 7「跟踪审计简报 / 专项审计报告」列表数据源）
 * 口径：
 *   1. 跟踪审计简报：2025-01 ~ 2026-09 每月一期，每期轮转覆盖 3 个当期已开工项目，
 *      共 21 期 × 3 = 63 条；
 *   2. 专项审计报告：只对已推进到建设 / 验收阶段的项目出具，共 10~14 条；
 *   3. 合计 73~77 条，落在需求要求的 60~80 条区间内；
 *   4. 两类记录的日期均不晚于 TODAY，简报不会早于项目计划开工时间。
 */
export function buildAuditRecords(): AuditRecord[] {
  const rand = seedRandom(AUDIT_SEED)
  const projects = baseProjects()
  const drafts: Array<Omit<AuditRecord, 'id'>> = []

  // ---- 跟踪审计简报：按期发布，每期在「已开工项目」中轮转取 3 个，保证覆盖均衡 ----
  let cursor = 0
  for (let year = BRIEF_FIRST_YEAR; year <= BRIEF_LAST.year; year++) {
    const lastMonth = year === BRIEF_LAST.year ? BRIEF_LAST.month : 12
    for (let month = 1; month <= lastMonth; month++) {
      const date = `${year}-${pad(month)}-${pad(BRIEF_DAY)}`
      // 简报只覆盖发布日之前已开工的项目（不会出现「项目未开工先跟踪审计」）
      const eligible = projects.filter((p) => p.planStart <= date)
      if (!eligible.length) continue
      const cover = Math.min(BRIEF_COVER, eligible.length)
      // 同期记录由同一位主审负责，作者按期次轮换
      const author = AUDITORS[(year * 12 + month) % AUDITORS.length]
      for (let k = 0; k < cover; k++) {
        const project = eligible[(cursor + k) % eligible.length]
        drafts.push({
          projectId: project.id,
          type: '跟踪审计简报',
          title: `《${project.name}项目跟踪审计简报（${year}年第${month}期）》`,
          date,
          author,
        })
      }
      cursor = (cursor + cover) % eligible.length
    }
  }

  // ---- 专项审计报告：只对实际进入建设 / 验收阶段的项目出具 ----
  const specialPool = projects.filter((p) => p.phase === '建设' || p.phase === '验收')
  if (specialPool.length) {
    const specialCount = SPECIAL_MIN + Math.floor(rand() * (SPECIAL_MAX - SPECIAL_MIN + 1))
    for (let i = 0; i < specialCount; i++) {
      const project = specialPool[i % specialPool.length]
      // 第二轮起主题整体偏移一位，保证同一项目不会重复同一主题
      const round = Math.floor(i / specialPool.length)
      const topic = SPECIAL_TOPICS[(i + round) % SPECIAL_TOPICS.length]
      // 报告出具时间：项目计划开工 240 天之后，且不晚于演示基准日
      const from = minDate(addDays(project.planStart, 240), TODAY)
      const date = addDays(from, Math.round(rand() * Math.max(daysBetween(from, TODAY), 0)))
      drafts.push({
        projectId: project.id,
        type: '专项审计报告',
        title: `《${project.name}项目${topic}》`,
        date,
        author: pickOne(AUDITORS, rand),
      })
    }
  }

  // ---- 统一编号：按日期正序编号（编号与时间先后一致），列表按最新在前返回 ----
  const sorted = [...drafts].sort((a, b) => a.date.localeCompare(b.date))
  const records: AuditRecord[] = sorted.map((d, i) => ({ ...d, id: seqId('AUD', i) }))
  return records.reverse()
}

// ------------------------------------------------------------
// 二、软件测评任务
// ------------------------------------------------------------

/** 测评任务生成器固定种子 */
const TEST_SEED = 20261112

/**
 * 生成软件测评任务（模块 7「软件测评」列表数据源）
 * 口径：
 *   1. 测评只针对已完成开发、进入建设 / 验收阶段的项目（本项目数据下为 10 条，符合 8~12 条）；
 *   2. 任务状态由项目「软件测评」节点的实际状态推导——节点已完成 → 已完成（必有报告时间），
 *      节点进行中 / 延期预警 / 严重滞后 → 测评中，节点未开始 → 待测评；
 *   3. 缺陷数据：待测评阶段尚无缺陷记录（均为 0），测评中按 40%~85% 复核进度给出，
 *      已完成视为缺陷全部复核完毕，始终满足 0 ≤ defectsFixed ≤ defectsTotal；
 *   4. 报告上传时间不晚于 TODAY，未出报告时为 null。
 */
export function buildTestTasks(): TestTask[] {
  const rand = seedRandom(TEST_SEED)
  const list = baseProjects().filter((p) => p.phase === '建设' || p.phase === '验收')

  return list.map((project, index) => {
    const task = taskOf(project, '软件测评')
    let status: TestTask['status'] = '待测评'
    let reportTime: string | null = null

    if (task?.status === 'done') {
      status = '已完成'
      // 报告上传时间取节点实际完成时间之后 2~6 天，且不晚于演示基准日
      reportTime = minDate(addDays(task.actualEnd ?? TODAY, 2 + Math.floor(rand() * 5)), TODAY)
    } else if (task && task.status !== 'not-started') {
      status = '测评中'
    }

    // 缺陷数据：待测评尚未开展检测，不产生缺陷记录
    let defectsTotal = 0
    let defectsFixed = 0
    if (status !== '待测评') {
      defectsTotal = 3 + Math.floor(rand() * 12) // 3~14 个缺陷
      defectsFixed =
        status === '已完成'
          ? defectsTotal // 测评完成 = 缺陷复核完毕
          : Math.floor(defectsTotal * (0.4 + rand() * 0.45)) // 测评中：复核 40%~85%
    }

    return {
      id: seqId('TST', index),
      projectId: project.id,
      agency: pickOne(TEST_AGENCIES, rand),
      status,
      defectsTotal,
      defectsFixed,
      reportTime,
    }
  })
}

// ------------------------------------------------------------
// 三、评审会议
// ------------------------------------------------------------

/** 评审会议生成器固定种子 */
const MEETING_SEED = 20261116

/** 评审会议条数上限（需求要求 40~60 条；按当前节点完成情况推导为 57 条，此处仅作上限保护） */
const MEETING_MAX = 60

/** 会议模板：与子任务节点一一对应，节点完成后才产生会议记录 */
const MEETING_SPECS: Array<{ task: string; topic: (name: string) => string }> = [
  { task: '可研编制', topic: (name) => `${name}项目可行性研究报告评审会` },
  { task: '初步设计与概算评审', topic: (name) => `${name}项目初步设计及概算评审会` },
  { task: '招标文件编制', topic: (name) => `${name}项目招标文件评审会` },
  { task: '需求评审', topic: (name) => `${name}项目需求规格说明书评审会` },
  { task: '预验收', topic: (name) => `${name}项目验收评审会` },
]

/**
 * 生成评审会议台账（模块 7「评审会议」列表数据源）
 * 口径：
 *   1. 会议类型：可研评审、初步设计概算评审、招标文件评审、需求评审、验收评审，
 *      只有对应节点已实际完成的项目才产生记录（未推进到的节点不会出现「提前评审」）；
 *   2. 会议日期取节点实际完成时间之后 1~14 天，且不晚于 TODAY；
 *      同一项目内按阶段先后递增（后一阶段会议至少比前一阶段晚 20 天）；
 *   3. 专家 3~9 人，专家意见 5~30 条，整改清单条数为意见数的 30%~100%（不超过意见总数）；
 *   4. 合计 40~60 条（本项目数据下为 57 条），若任务模板调整后超出上限则按项目顺序截断。
 */
export function buildMeetings(): ReviewMeeting[] {
  const rand = seedRandom(MEETING_SEED)
  const drafts: Array<Omit<ReviewMeeting, 'id'>> = []

  for (const project of baseProjects()) {
    let prevDate = '' // 本项目上一场会议日期，用于保证阶段先后顺序
    for (const spec of MEETING_SPECS) {
      const task = doneTask(project, spec.task)
      if (!task) continue

      // 会议日期 = 节点实际完成时间 + 1~14 天（收口到基准日），且晚于本项目上一场会议
      const anchor = addDays(task.actualEnd ?? TODAY, 1 + Math.floor(rand() * 14))
      const date = minDate(prevDate ? maxDate(anchor, addDays(prevDate, 20)) : anchor, TODAY)
      prevDate = date

      const expertCount = 3 + Math.floor(rand() * 7) // 3~9 人
      const opinionCount = 5 + Math.floor(rand() * 26) // 5~30 条
      // 整改清单只针对需要落实的专家意见，条数不超过意见总数
      const rectificationCount = Math.max(1, Math.round(opinionCount * (0.3 + rand() * 0.7)))

      drafts.push({
        projectId: project.id,
        topic: spec.topic(project.name),
        date,
        expertCount,
        opinionCount,
        rectificationCount,
      })
    }
  }

  // 上限保护：任务模板调整后候选可能超过 60 条，按项目顺序保留前 60 条
  const kept = drafts.length > MEETING_MAX ? drafts.slice(0, MEETING_MAX) : drafts

  // 统一编号：按日期正序编号，列表按最新在前返回
  const sorted = [...kept].sort((a, b) => a.date.localeCompare(b.date))
  const meetings: ReviewMeeting[] = sorted.map((d, i) => ({ ...d, id: seqId('MTG', i) }))
  return meetings.reverse()
}
