// ============================================================
// 监理台账（模块 6）与问题台账 mock 数据生成器
//   · 监理记录：监理周报 / 监理月报 / 专题报告 / 监理通知单 / 整改回执
//   · 问题台账：质量 / 进度 / 投资 / 安全 四类问题
// 全部由固定种子推算（禁用 Math.random），保证每次打开数据完全一致；
// 已发生的记录日期、问题发现日期一律不晚于演示基准日 TODAY，
// 整改期限（deadline）属计划类日期，保证晚于对应记录的日期。
// 注：utils.addDays 以本地时区解析日期字符串，在非 UTC 时区会出现 1 天偏移，
//     因此本文件对「不得晚于 / 必须晚于」的日期一律用 minDate / maxDate 兜底。
// ============================================================

import type { IssueItem, Phase, SubProject, SupervisionRecord } from './types'
import { buildProjects } from './generate'
import { OWNER_ORGS, OWNERS, SUPERVISORS } from './seed'
import { TODAY, addDays, maxDate, minDate, pad, pickOne, seedRandom } from './utils'

// ------------------------------------------------------------
// 类型别名（与 types.ts 保持一致，便于阅读）
// ------------------------------------------------------------
/** 监理记录类型 */
type SupervisionType = SupervisionRecord['type']
/** 整改状态 */
type Rectification = NonNullable<SupervisionRecord['rectification']>
/** 问题分类 */
type IssueCategory = IssueItem['category']
/** 问题等级 */
type IssueLevel = IssueItem['level']
/** 问题状态 */
type IssueStatus = IssueItem['status']

// ------------------------------------------------------------
// 生成参数
// ------------------------------------------------------------
/** 生成器固定种子（与 generate.ts 的 20260920 区分，两个生成器互不干扰） */
const SUPERVISION_SEED = 20260926

/** 监理工程师姓名（配合 seed.ts 的 SUPERVISORS 组成记录作者 / 责任方） */
const SUPERVISOR_STAFF = ['王立群', '沈志远', '吴佩瑶', '徐海东', '陆明轩', '顾晓宁']

/** 在建项目阶段：只有已进入建设 / 验收的项目才按周、按月出具监理报表 */
const BUILDING_PHASES: Phase[] = ['建设', '验收']

/** 监理周报：每个在建项目最近 9 周（本周之前，按每周五出具） */
const WEEK_REPORT_COUNT = 9

/** 监理月报：每个在建项目最近 6 个自然月（本月尚未结束，不出月报） */
const MONTH_REPORT_COUNT = 6

/** 专题报告：每个在建项目 2 份 */
const TOPIC_REPORT_COUNT = 2

/** 监理通知单：每个在建项目 3~5 张 */
const NOTICE_RANGE: [number, number] = [3, 5]

/** 整改状态轮换顺序：保证每个项目的通知单三种状态都出现 */
const RECTIFICATION_CYCLE: Rectification[] = ['待整改', '整改中', '已闭环']

/** 各整改状态对应的通知单日期区间（相对基准日往前多少天），近期为待整改、远期为已闭环 */
const RECTIFICATION_AGE: Record<Rectification, [number, number]> = {
  待整改: [6, 26],
  整改中: [30, 80],
  已闭环: [45, 200],
}

/** 各问题状态对应的发现日期区间（相对基准日往前多少天） */
const ISSUE_FOUND_AGE: Record<IssueStatus, [number, number]> = {
  待整改: [4, 22],
  整改中: [20, 60],
  已销号: [75, 240],
}

// ------------------------------------------------------------
// 主题库
// ------------------------------------------------------------
/** 在建项目的专题报告主题库 */
const TOPIC_REPORTS = [
  '关于建设进度偏慢风险的专题报告',
  '关于需求变更影响范围评估的专题报告',
  '关于系统联调接口对接问题的专题报告',
  '关于上线试运行准备工作的专题报告',
  '关于数据治理与历史数据迁移的专题报告',
  '关于等级保护测评整改情况的专题报告',
  '关于合同履约与资金支付进度的专题报告',
  '关于参建单位人员投入不足的专题报告',
  '关于系统性能压测结果的专题报告',
  '关于试运行期间系统稳定性问题的专题报告',
]

/** 立项 / 采购阶段项目的专题报告主题库 */
const EARLY_TOPIC_REPORTS = [
  '关于可研报告与概算编制质量的专题报告',
  '关于招标文件技术条款设置风险的专题报告',
  '关于采购需求与建设内容一致性的专题报告',
  '关于项目前期工作计划安排的专题报告',
]

/** 监理通知单主题库：通知单与其整改回执成对，保证「已闭环必有回执」且标题相互呼应 */
const NOTICE_TOPICS: Array<{ notice: string; receipt: string }> = [
  { notice: '关于开发进度滞后的监理通知单', receipt: '关于开发进度滞后问题的整改回执' },
  { notice: '关于机房桥架线缆敷设不规范的监理通知单', receipt: '关于机房桥架线缆敷设问题的整改回执' },
  { notice: '关于接口联调配合不及时的监理通知单', receipt: '关于接口联调配合问题的整改回执' },
  { notice: '关于系统缺陷整改不及时的监理通知单', receipt: '关于系统缺陷整改问题的整改回执' },
  { notice: '关于测试用例执行不到位的监理通知单', receipt: '关于测试用例执行问题的整改回执' },
  { notice: '关于参建人员变更未报审的监理通知单', receipt: '关于参建人员变更报审问题的整改回执' },
  { notice: '关于工程资料报审不齐全的监理通知单', receipt: '关于工程资料报审问题的整改回执' },
  { notice: '关于安全管理制度落实不到位的监理通知单', receipt: '关于安全管理制度落实问题的整改回执' },
  { notice: '关于数据迁移方案未报审的监理通知单', receipt: '关于数据迁移方案报审问题的整改回执' },
  { notice: '关于进度计划未按周更新的监理通知单', receipt: '关于进度计划更新问题的整改回执' },
]

/** 问题描述条目 */
interface IssueDesc {
  /** 中文问题描述 */
  text: string
  /** 是否仅适用于建设 / 验收阶段项目（立项、采购阶段不涉及开发、上线与等保整改） */
  buildOnly?: boolean
}

/** 各分类具体问题描述库（按类别归集，建设期描述只出现在建设 / 验收阶段项目上） */
const ISSUE_DESCS: Record<IssueCategory, IssueDesc[]> = {
  质量: [
    { text: '可研报告与初步设计内容不一致，概算编制依据说明缺失' },
    { text: '招标文件技术需求描述不完整，存在后期扯皮风险' },
    { text: '归档材料扫描件不清晰、存在缺页，不满足档案验收要求' },
    { text: '监理周报内容过于简单，未如实反映现场问题与整改情况' },
    { text: '机房桥架线缆标识缺失，未按规范敷设', buildOnly: true },
    { text: '门诊药房模块保存后数据未落库，存在数据一致性风险', buildOnly: true },
    { text: '电子病历文书模板与省级质控要求不一致，需重新配置', buildOnly: true },
    { text: '接口联调返回报文缺少必填字段校验，异常未做兜底处理', buildOnly: true },
    { text: '影像调阅响应时间超过 3 秒，未达技术规格书要求', buildOnly: true },
    { text: '检验仪器双向通讯异常未记录日志，问题难以追溯', buildOnly: true },
    { text: '数据字典变更未同步至数据中台，报表统计口径存在偏差', buildOnly: true },
    { text: '系统测试用例执行率偏低，关键业务场景未覆盖', buildOnly: true },
  ],
  进度: [
    { text: '项目信息化例会未按期召开，进度问题未及时上报' },
    { text: '进度计划未按周更新，滞后节点未说明原因及措施' },
    { text: '关键节点较计划滞后，未提交书面赶工措施' },
    { text: '进度台账与现场实际情况不符，数据更新滞后' },
    { text: '采购环节较计划顺延，未及时提交调整后的实施计划' },
    { text: '参建单位现场人员投入不足，与投标承诺不一致', buildOnly: true },
    { text: '需求评审会因准备不充分两次延期，影响后续排期', buildOnly: true },
    { text: '开发实施较计划滞后约 3 周，未提交赶工措施', buildOnly: true },
    { text: '上线试运行时间较合同约定顺延，未办理书面工期调整手续', buildOnly: true },
    { text: '硬件设备到货延迟，影响接口联调上线节点', buildOnly: true },
    { text: '系统测试执行进度滞后，测试报告未按期提交', buildOnly: true },
  ],
  投资: [
    { text: '变更台账未及时更新，变更金额与合同口径不一致' },
    { text: '进度款支付申请缺少监理确认的工程量佐证材料' },
    { text: '已拨付资金使用率偏低，结余资金规模偏大' },
    { text: '合同外新增内容未履行变更审批程序即行实施' },
    { text: '发票开具金额与形象进度不匹配，存在付款风险' },
    { text: '质保金退还条件未在合同中明确，存在结算争议风险' },
    { text: '资金支付进度滞后于建设进度，未按合同约定节点支付', buildOnly: true },
  ],
  安全: [
    { text: '机房出入登记不完整，外单位人员未办理审批手续', buildOnly: true },
    { text: '运维账号共享使用，操作日志无法追溯到责任人', buildOnly: true },
    { text: '备份策略未覆盖数据库增量备份，容灾能力不足', buildOnly: true },
    { text: '机房施工作业未佩戴安全帽，安全交底记录缺失', buildOnly: true },
    { text: '上线试运行前未完成等级保护测评整改，存在合规风险', buildOnly: true },
    { text: '生产环境账号权限分配过宽，未落实最小权限原则', buildOnly: true },
    { text: '患者个人信息导出未做脱敏处理，存在数据泄露风险', buildOnly: true },
    { text: '系统日志留存不足 6 个月，不满足等级保护要求', buildOnly: true },
  ],
}

/** 各阶段项目可产生的问题分类（立项、采购阶段尚不涉及开发安全类问题） */
const CATEGORIES_BY_PHASE: Record<Phase, IssueCategory[]> = {
  立项: ['进度', '投资'],
  采购: ['进度', '投资', '质量'],
  建设: ['质量', '进度', '投资', '安全'],
  验收: ['质量', '进度', '投资', '安全'],
}

/** 责任方类型：建设单位项目负责人 / 监理单位监理工程师 / 两者混合 */
const RESPONSIBLE_KIND: Record<IssueCategory, 'owner' | 'supervisor' | 'mixed'> = {
  质量: 'mixed',
  进度: 'mixed',
  投资: 'owner',
  安全: 'supervisor',
}

// ------------------------------------------------------------
// 内部工具
// ------------------------------------------------------------
/** 全部子项目（懒构建 + 缓存，避免两个生成器重复推算） */
let projectCache: SubProject[] | null = null
function projects(): SubProject[] {
  if (!projectCache) projectCache = buildProjects()
  return projectCache
}

/** 基准日往前推算的历史日期（保证不晚于演示基准日） */
function pastDate(daysAgo: number): string {
  return minDate(addDays(TODAY, -daysAgo), TODAY)
}

/**
 * 在 from 之后 minDays ~ maxDays 天生成期限日期，保证结果严格晚于 from。
 * maxDate 兜底用于抵消 addDays 在非 UTC 时区的 1 天偏移。
 */
function dueAfter(from: string, minDays: number, maxDays: number, rand: () => number): string {
  const days = minDays + Math.round(rand() * (maxDays - minDays))
  return maxDate(addDays(from, days), addDays(from, 2))
}

/** 日期所属自然周序号（以周一为一周开始），用于周报标题里的「第 N 周」 */
function weekOfYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`)
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const dayIndex = Math.round((d.getTime() - start.getTime()) / 86400000)
  const mondayOffset = (start.getUTCDay() + 6) % 7
  return Math.floor((dayIndex + mondayOffset) / 7) + 1
}

/**
 * 记录作者：监理单位 + 本项目监理工程师。
 * 监理单位取自 seed.ts 的 SUPERVISORS（与项目台账的 supervisor 字段一致），
 * 人名按项目固定，保证同一项目的作者稳定可追溯。
 */
function authorOf(p: SubProject, index: number): string {
  const unit = SUPERVISORS.includes(p.supervisor)
    ? p.supervisor
    : SUPERVISORS[index % SUPERVISORS.length]
  return `${unit} ${SUPERVISOR_STAFF[index % SUPERVISOR_STAFF.length]}`
}

/**
 * 单位名称规范化：项目台账的采购人 / 监理单位均取自 seed.ts 字典，
 * 这里再校验一次，必要时回落到字典取值，保证展示的单位名一定来自字典。
 */
function orgOf(values: string[], value: string, rand: () => number): string {
  return values.includes(value) ? value : pickOne(values, rand)
}

/**
 * 问题责任方：按类别组合 seed.ts 的 OWNER_ORGS / OWNERS / SUPERVISORS ——
 * 建设单位方为「项目采购人 + 项目负责人」，监理方为「项目监理单位 + 监理工程师」，
 * 单位名一律取自该项目台账，保证责任方与项目信息一致。
 */
function responsibleOf(p: SubProject, category: IssueCategory, rand: () => number): string {
  const kind = RESPONSIBLE_KIND[category]
  const useOwner = kind === 'owner' || (kind === 'mixed' && rand() < 0.6)
  if (useOwner) return `${orgOf(OWNER_ORGS, p.owner, rand)} ${pickOne(OWNERS, rand)}`
  return `${orgOf(SUPERVISORS, p.supervisor, rand)} ${pickOne(SUPERVISOR_STAFF, rand)}`
}

/** 同类记录排序：日期倒序，同日按编号升序 */
function byDateDesc(a: { date: string; id: string }, b: { date: string; id: string }): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

// ------------------------------------------------------------
// 对外生成器
// ------------------------------------------------------------

/**
 * 构建监理台账记录（200~260 条）。
 * 规则：
 *   1. 在建项目（建设 / 验收阶段）按周产生周报、按月产生月报，另各出 2 份专题报告；
 *   2. 每个在建项目产生 3~5 张监理通知单，带整改状态（待整改 / 整改中 / 已闭环），
 *      整改期限不早于通知单日期；
 *   3. 已闭环的通知单必有一条同项目的「整改回执」，日期略晚于通知单；
 *   4. 立项 / 采购阶段项目各出 1 份前期工作专题报告，保证 20 个项目均有监理资料；
 *   5. 所有记录日期不晚于演示基准日 TODAY，编号形如 SUP-001 且全局唯一。
 */
export function buildSupervisionRecords(): SupervisionRecord[] {
  const rand = seedRandom(SUPERVISION_SEED)
  const list = projects()
  const out: SupervisionRecord[] = []
  let seq = 1
  /** 新增一条记录的公共字段 */
  const push = (
    p: SubProject,
    type: SupervisionType,
    title: string,
    date: string,
    author: string,
    extra?: Pick<SupervisionRecord, 'rectification' | 'deadline'>,
  ) => {
    out.push({ id: `SUP-${pad(seq++, 3)}`, projectId: p.id, type, title, date, author, ...extra })
  }

  list.forEach((p, index) => {
    const author = authorOf(p, index)
    const inBuilding = BUILDING_PHASES.includes(p.phase)

    if (!inBuilding) {
      // ---- 立项 / 采购阶段项目：出 1 份前期工作专题报告，保证项目监理资料不缺项 ----
      const date = pastDate(20 + Math.round(rand() * 120))
      const topic = EARLY_TOPIC_REPORTS[index % EARLY_TOPIC_REPORTS.length]
      push(p, '专题报告', `《${topic}》`, date, author)
      return
    }

    // ---- 监理周报：最近 9 周，每周五出具（日期不晚于基准日） ----
    for (let w = 0; w < WEEK_REPORT_COUNT; w++) {
      const date = pastDate(2 + w * 7)
      const year = date.slice(0, 4)
      push(p, '监理周报', `《监理周报（${year}年第${weekOfYear(date)}周）》`, date, author)
    }

    // ---- 监理月报：最近 6 个自然月，每月一份（同年月只出一份） ----
    const months = new Set<string>()
    for (let m = 0; m < MONTH_REPORT_COUNT; m++) {
      const date = pastDate(20 + m * 31)
      const monthKey = date.slice(0, 7)
      if (months.has(monthKey)) continue
      months.add(monthKey)
      const title = `《监理月报（${date.slice(0, 4)}年${Number(date.slice(5, 7))}月）》`
      push(p, '监理月报', title, date, author)
    }

    // ---- 专题报告：每个在建项目 2 份，最近 4 个月内不定期出具 ----
    for (let t = 0; t < TOPIC_REPORT_COUNT; t++) {
      const date = pastDate(10 + Math.round(rand() * 110))
      const topic = TOPIC_REPORTS[(index + t) % TOPIC_REPORTS.length]
      push(p, '专题报告', `《${topic}》`, date, author)
    }

    // ---- 监理通知单：整改状态按序号轮换，保证三种状态都覆盖 ----
    const span = NOTICE_RANGE[1] - NOTICE_RANGE[0] + 1
    const noticeCount = NOTICE_RANGE[0] + Math.floor(rand() * span)
    for (let n = 0; n < noticeCount; n++) {
      const rectification = RECTIFICATION_CYCLE[n % RECTIFICATION_CYCLE.length]
      const [minAgo, maxAgo] = RECTIFICATION_AGE[rectification]
      const date = pastDate(minAgo + Math.round(rand() * (maxAgo - minAgo)))
      const topic = NOTICE_TOPICS[(index + n) % NOTICE_TOPICS.length]
      push(p, '监理通知单', `《${topic.notice}》`, date, author, {
        rectification,
        deadline: dueAfter(date, 15, 30, rand),
      })
      // ---- 整改回执：已闭环的通知单必有一条回执，日期略晚于通知单且不晚于基准日 ----
      if (rectification === '已闭环') {
        push(p, '整改回执', `《${topic.receipt}》`, dueAfter(date, 7, 25, rand), author)
      }
    }
  })

  return out.sort(byDateDesc)
}

/**
 * 构建问题台账（60~90 条，实际按 20 个项目 × 3~4 条生成）。
 * 规则：
 *   1. 四类问题（质量 / 进度 / 投资 / 安全）按项目阶段与索引轮换，分布均衡；
 *   2. 等级以「一般 / 较重」为主，「严重」占少数；
 *   3. 状态「待整改 / 整改中 / 已销号」各约三分之一，并与发现时间匹配
 *      （新问题待整改、久远问题已销号）；
 *   4. 发现日期不晚于基准日且不早于项目计划开工，整改期限晚于发现日期；
 *   5. 责任方取自 seed.ts 的 OWNER_ORGS / OWNERS / SUPERVISORS，编号形如 ISS-001。
 */
export function buildIssues(): IssueItem[] {
  const rand = seedRandom(SUPERVISION_SEED + 1)
  const list = projects()
  const out: IssueItem[] = []
  /** 各类别描述轮换游标：避免同类问题连续出现相同描述 */
  const cursor: Record<IssueCategory, number> = { 质量: 0, 进度: 0, 投资: 0, 安全: 0 }

  list.forEach((p, index) => {
    const inBuild = BUILDING_PHASES.includes(p.phase)
    const categories = CATEGORIES_BY_PHASE[p.phase]
    const count = 3 + Math.floor(rand() * 2) // 每个项目 3~4 条

    for (let i = 0; i < count; i++) {
      // 分类按项目索引错位轮换，保证四类问题整体分布均衡
      const category = categories[(index + i) % categories.length]
      const pool = ISSUE_DESCS[category].filter((d) => inBuild || !d.buildOnly)
      const desc = pool[cursor[category] % pool.length].text
      cursor[category]++

      // 等级：一般 55% / 较重 35% / 严重 10%
      const levelRoll = rand()
      const level: IssueLevel = levelRoll < 0.55 ? '一般' : levelRoll < 0.9 ? '较重' : '严重'

      // 状态：三段均分（约各占 1/3）
      const statusRoll = rand()
      const status: IssueStatus =
        statusRoll < 1 / 3 ? '待整改' : statusRoll < 2 / 3 ? '整改中' : '已销号'

      // 发现日期与状态匹配，且不晚于基准日、不早于项目计划开工
      const [minAgo, maxAgo] = ISSUE_FOUND_AGE[status]
      const foundDate = maxDate(
        pastDate(minAgo + Math.round(rand() * (maxAgo - minAgo))),
        minDate(p.planStart, TODAY),
      )

      out.push({
        id: `ISS-${pad(out.length + 1, 3)}`,
        projectId: p.id,
        category,
        level,
        desc,
        responsible: responsibleOf(p, category, rand),
        deadline: dueAfter(foundDate, 15, 45, rand),
        status,
        foundDate,
      })
    }
  })

  return out.sort((a, b) =>
    a.foundDate === b.foundDate
      ? a.id === b.id
        ? 0
        : a.id < b.id
          ? -1
          : 1
      : a.foundDate < b.foundDate
        ? 1
        : -1,
  )
}
