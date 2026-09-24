// ============================================================
// 归档文档（需求模块 5：项目档案归档）mock 数据生成器
// 数据来源：buildProjects() 的项目编号、建设单位、计划开工与子任务状态
// 生成规则：
//   1. 20 个子项目 × 8 类归档目录，每个目录 1~4 个文件，全站 300~400 条；
//   2. 只有项目推进到相应节点（阶段门槛 + 子任务已启动）才产生该类材料，
//      不会把「验收材料」发给仍在立项阶段的项目；
//   3. 上传时间晚于该项目计划开工且不晚于演示基准日 TODAY（minDate 兜底）；
//   4. 固定种子 + seedRandom 确定性随机，每次生成的档案完全一致。
// ============================================================

import type { DocCategory, DocItem, Phase, SubProject } from './types'
import { DOC_CATEGORIES, PHASE_ORDER } from './types'
import { buildProjects, projectProgress } from './generate'
import { OWNERS, SUPERVISORS } from './seed'
import { TODAY, addDays, daysBetween, minDate, pad, pickOne, pickSome, seedRandom } from './utils'

/** 文件类型（沿用 DocItem 的 pdf / doc / xls / img） */
type DocFileType = DocItem['fileType']

/** 归档材料文件名模板与体量基准 */
interface DocTemplate {
  /** 文件名模板（含中文书名号）：{name} 项目名称、{hospital} 建设单位全称、{n} 同目录内序号 */
  title: string
  type: DocFileType
  /** 文件大小基准（KB），实际大小在此基础上下浮动 */
  baseKb: number
}

/** 8 类归档目录下真实项目中常见的材料（模板均按材料形成的自然先后排列） */
const DOC_TEMPLATES: Record<DocCategory, DocTemplate[]> = {
  // 立项：可研、项目建议书、立项批复等
  立项: [
    { title: '《{name}可行性研究报告》', type: 'pdf', baseKb: 4600 },
    { title: '《{name}项目建议书》', type: 'doc', baseKb: 1500 },
    { title: '《{name}建设方案》', type: 'pdf', baseKb: 6800 },
    { title: '《{name}需求调研报告》', type: 'doc', baseKb: 1200 },
    { title: '《{name}投资估算明细表》', type: 'xls', baseKb: 360 },
    { title: '《{hospital}信息化建设立项申请表》', type: 'xls', baseKb: 220 },
    { title: '《{hospital}信息化建设项目立项批复》', type: 'pdf', baseKb: 900 },
    { title: '《{name}建设内容与投资测算说明》', type: 'doc', baseKb: 800 },
  ],
  // 概算评审：初步设计、概算书、审核与批复
  概算评审: [
    { title: '《{name}初步设计文件》', type: 'pdf', baseKb: 7200 },
    { title: '《{name}投资概算书》', type: 'xls', baseKb: 480 },
    { title: '《{name}造价咨询审核报告》', type: 'pdf', baseKb: 1900 },
    { title: '《{name}概算审核报告》', type: 'pdf', baseKb: 2100 },
    { title: '《{name}概算评审专家意见汇总》', type: 'doc', baseKb: 620 },
    { title: '《{name}概算调整申请及说明》', type: 'doc', baseKb: 540 },
    { title: '《{name}概算批复文件》', type: 'pdf', baseKb: 760 },
  ],
  // 采购合同：采购需求、招标、评标、合同及变更
  采购合同: [
    { title: '《{name}采购意向公开说明》', type: 'doc', baseKb: 260 },
    { title: '《{name}采购需求说明书》', type: 'doc', baseKb: 1100 },
    { title: '《{name}招标文件》', type: 'pdf', baseKb: 5400 },
    { title: '《{name}采购公告（第{n}次）》', type: 'pdf', baseKb: 320 },
    { title: '《{name}投标文件资格预审记录表》', type: 'xls', baseKb: 240 },
    { title: '《{name}评标报告》', type: 'pdf', baseKb: 2400 },
    { title: '《{name}中标通知书》', type: 'pdf', baseKb: 280 },
    { title: '《{name}合同协议书》', type: 'pdf', baseKb: 3600 },
    { title: '《{name}技术开发合同附件》', type: 'doc', baseKb: 1400 },
    { title: '《{name}合同变更协议（第{n}号）》', type: 'doc', baseKb: 460 },
  ],
  // 监理资料：监理规划先行，月报、通知单、整改回执按期归档
  监理资料: [
    { title: '《{name}监理规划》', type: 'pdf', baseKb: 2800 },
    { title: '《{name}监理实施细则》', type: 'doc', baseKb: 1600 },
    { title: '《{name}监理例会纪要（第{n}次）》', type: 'doc', baseKb: 340 },
    { title: '《{name}监理周报（第{n}周）》', type: 'doc', baseKb: 520 },
    { title: '《{name}监理月报（第{n}期）》', type: 'pdf', baseKb: 1300 },
    { title: '《{name}旁站监理记录》', type: 'xls', baseKb: 300 },
    { title: '《{name}监理通知单（第{n}号）》', type: 'pdf', baseKb: 380 },
    { title: '《{name}整改回执（第{n}号）》', type: 'pdf', baseKb: 420 },
    { title: '《{name}监理工作总结》', type: 'pdf', baseKb: 1100 },
  ],
  // 审计资料：跟踪审计简报按期出具，另有意见书、专项报告与整改报告
  审计资料: [
    { title: '《{name}跟踪审计通知书》', type: 'pdf', baseKb: 420 },
    { title: '《{name}跟踪审计简报（第{n}期）》', type: 'pdf', baseKb: 900 },
    { title: '《{name}资金使用情况审计取证单》', type: 'xls', baseKb: 210 },
    { title: '《{name}跟踪审计意见书》', type: 'pdf', baseKb: 1200 },
    { title: '《{name}专项审计报告》', type: 'pdf', baseKb: 2600 },
    { title: '《{name}工程结算审核意见》', type: 'pdf', baseKb: 1500 },
    { title: '《{name}审计工作底稿（第{n}册）》', type: 'doc', baseKb: 640 },
    { title: '《{name}审计整改情况报告》', type: 'doc', baseKb: 780 },
  ],
  // 软件测评报告：委托书 → 测评方案 → 测评/等保报告 → 缺陷整改
  软件测评报告: [
    { title: '《{name}软件测评委托书》', type: 'pdf', baseKb: 240 },
    { title: '《{name}软件测试方案》', type: 'doc', baseKb: 1200 },
    { title: '《{name}测评原始记录表》', type: 'xls', baseKb: 460 },
    { title: '《{name}功能性能测评报告》', type: 'pdf', baseKb: 2900 },
    { title: '《{name}网络安全等级保护测评报告》', type: 'pdf', baseKb: 4100 },
    { title: '《{name}软件测评报告》', type: 'pdf', baseKb: 3400 },
    { title: '《{name}测评缺陷整改说明》', type: 'doc', baseKb: 560 },
  ],
  // 评审会议材料：会议通知、汇报材料、专家意见与整改落实
  评审会议材料: [
    { title: '《{name}评审会议通知》', type: 'doc', baseKb: 180 },
    { title: '《{name}评审会汇报材料》', type: 'pdf', baseKb: 4200 },
    { title: '《{name}专家评审会会议纪要》', type: 'doc', baseKb: 680 },
    { title: '《{name}方案论证会专家意见汇总》', type: 'doc', baseKb: 740 },
    { title: '《{name}需求评审会议材料》', type: 'pdf', baseKb: 2600 },
    { title: '《{name}评审意见整改落实表》', type: 'xls', baseKb: 240 },
    { title: '《{name}评审专家签到表》', type: 'img', baseKb: 860 },
    { title: '《{name}评审会现场照片》', type: 'img', baseKb: 1900 },
  ],
  // 验收材料：试运行、预验收、验收测试、验收报告与移交清单
  验收材料: [
    { title: '《{name}试运行报告》', type: 'doc', baseKb: 1400 },
    { title: '《{name}预验收意见书》', type: 'pdf', baseKb: 1100 },
    { title: '《{name}初验会议纪要》', type: 'doc', baseKb: 620 },
    { title: '《{name}验收测试用例及结果记录》', type: 'xls', baseKb: 520 },
    { title: '《{name}验收会现场照片》', type: 'img', baseKb: 2100 },
    { title: '《{name}验收报告》', type: 'pdf', baseKb: 3100 },
    { title: '《{name}用户使用意见反馈汇总》', type: 'doc', baseKb: 460 },
    { title: '《{name}竣工资料移交清单》', type: 'xls', baseKb: 300 },
    { title: '《{name}验收证书》', type: 'pdf', baseKb: 420 },
  ],
}

/** 单个归档类别的生成规则 */
interface CategoryRule {
  /** 阶段门槛：项目所处阶段需不早于该阶段（PHASE_ORDER 序）才可能有此类材料 */
  minPhase: Phase
  /** 需已启动的子任务（命中任一即可；未开始的子任务视为尚未形成材料） */
  requires: string[]
  /** 上传时间在「计划开工 → 基准日」时间轴上的比例区间 */
  ratio: [number, number]
  /** 上传人来源：owner = 建设单位项目负责人，supervisor = 监理 / 审计等咨询单位 */
  uploader: 'owner' | 'supervisor'
  /** 同一目录内相邻两份材料的时间间隔（天） */
  gap: [number, number]
}

/** 8 类归档目录的生成规则（订单与 DOC_CATEGORIES 一致） */
const CATEGORY_RULE: Record<DocCategory, CategoryRule> = {
  // 立项：所有项目都已启动可研编制，故 20 个项目均有立项材料
  立项: { minPhase: '立项', requires: ['可研编制'], ratio: [0.02, 0.12], uploader: 'owner', gap: [3, 9] },
  // 概算评审：需初步设计与概算评审节点已启动
  概算评审: {
    minPhase: '立项',
    requires: ['初步设计与概算评审'],
    ratio: [0.1, 0.2],
    uploader: 'owner',
    gap: [2, 8],
  },
  // 采购合同：进入采购阶段且已公开采购意向
  采购合同: { minPhase: '采购', requires: ['采购意向公开'], ratio: [0.18, 0.32], uploader: 'owner', gap: [3, 10] },
  // 监理资料：监理随招标进场（招标时点已启动或合同已签订）
  监理资料: {
    minPhase: '采购',
    requires: ['招标时点', '合同签订'],
    ratio: [0.34, 0.8],
    uploader: 'supervisor',
    gap: [5, 14],
  },
  // 审计资料：概算批复后开展全过程跟踪审计
  审计资料: {
    minPhase: '立项',
    requires: ['初步设计与概算评审'],
    ratio: [0.28, 0.72],
    uploader: 'supervisor',
    gap: [6, 16],
  },
  // 软件测评报告：仅已进入验收阶段、且系统测试已启动的项目
  软件测评报告: {
    minPhase: '验收',
    requires: ['系统测试'],
    ratio: [0.72, 0.9],
    uploader: 'supervisor',
    gap: [4, 12],
  },
  // 评审会议材料：初步设计评审到需求评审阶段的会议材料
  评审会议材料: {
    minPhase: '立项',
    requires: ['初步设计与概算评审', '需求评审'],
    ratio: [0.12, 0.45],
    uploader: 'owner',
    gap: [2, 7],
  },
  // 验收材料：仅已进入验收阶段且试运行 / 预验收已启动的项目
  验收材料: {
    minPhase: '验收',
    requires: ['上线试运行', '预验收'],
    ratio: [0.82, 0.97],
    uploader: 'owner',
    gap: [3, 10],
  },
}

/** 生成器固定种子（与项目生成器 20260920 区分开，避免随机序列同步） */
const DOC_SEED = 20261015

/** 全站归档文件总量目标区间（需求：300~400 条；此处留出安全边界） */
const TOTAL_MIN = 320
const TOTAL_MAX = 380

/** 子任务是否已启动（已完成 / 进行中 / 延期预警 / 严重滞后 均视为已形成材料） */
function taskStarted(project: SubProject, name: string): boolean {
  const task = project.tasks.find((t) => t.name === name)
  return !!task && task.status !== 'not-started'
}

/** 项目所处阶段是否不早于门槛阶段 */
function phaseReached(project: SubProject, minPhase: Phase): boolean {
  return PHASE_ORDER.indexOf(project.phase) >= PHASE_ORDER.indexOf(minPhase)
}

/**
 * 单个归档目录下的文件数量（1~4 个）：项目推进越深，归档材料越齐全
 * 立项期 1~2 个；采购 / 建设前期 2~4 个；建设后期与验收期 3~4 个
 */
function docCountOf(progress: number, rand: () => number): number {
  if (progress < 30) return 1 + (rand() < 0.45 ? 1 : 0)
  if (progress < 60) return Math.min(4, 2 + Math.floor(rand() * 3))
  return 3 + (rand() < 0.55 ? 1 : 0)
}

/**
 * 全站总量校正：逐轮给未满 4 个的目录 +1 / 多于 1 个的目录 -1，
 * 把总量拉回 [TOTAL_MIN, TOTAL_MAX]（每个目录始终保持 1~4 个文件）
 */
function balanceTotal(counts: number[]): void {
  let total = counts.reduce((s, n) => s + n, 0)
  while (total < TOTAL_MIN) {
    let changed = false
    for (let i = 0; i < counts.length && total < TOTAL_MIN; i++) {
      if (counts[i] >= 4) continue
      counts[i]++
      total++
      changed = true
    }
    if (!changed) break // 所有目录都已满 4 个，无法继续补充
  }
  while (total > TOTAL_MAX) {
    let changed = false
    for (let i = 0; i < counts.length && total > TOTAL_MAX; i++) {
      if (counts[i] <= 1) continue
      counts[i]--
      total--
      changed = true
    }
    if (!changed) break // 所有目录都已只剩 1 个，无法继续裁剪
  }
}

/** 填充文件名模板：{name} 项目名称、{hospital} 建设单位全称、{n} 同目录内序号 */
function fillTitle(title: string, project: SubProject, seq: number): string {
  return title
    .replaceAll('{name}', project.name)
    .replaceAll('{hospital}', project.owner)
    .replaceAll('{n}', String(seq))
}

/** 文件大小（KB）：以模板基准值上下浮动，并限制在 50~20000 之间 */
function sizeOf(baseKb: number, rand: () => number): number {
  return Math.min(20000, Math.max(50, Math.round(baseKb * (0.6 + rand() * 0.9))))
}

/** 生成全部归档文档（模块 5 页面数据源） */
export function buildDocs(): DocItem[] {
  const rand = seedRandom(DOC_SEED)
  const projects = buildProjects()

  // ---- 第一步：确定每个「项目 × 归档类别」的文件数量（未推进到的类别直接跳过） ----
  const slots: Array<{ project: SubProject; category: DocCategory; rule: CategoryRule }> = []
  const counts: number[] = [] // 与 slots 一一对应，便于全站总量校正
  for (const project of projects) {
    const progress = projectProgress(project)
    for (const category of DOC_CATEGORIES) {
      const rule = CATEGORY_RULE[category]
      if (!phaseReached(project, rule.minPhase)) continue
      if (!rule.requires.some((name) => taskStarted(project, name))) continue
      slots.push({ project, category, rule })
      counts.push(docCountOf(progress, rand))
    }
  }
  balanceTotal(counts)

  // ---- 第二步：按项目、类别顺序生成文件条目 ----
  const docs: DocItem[] = []
  let seq = 0
  for (let i = 0; i < slots.length; i++) {
    const { project, category, rule } = slots[i]
    const count = counts[i]
    // 随机抽取模板后按模板池顺序重排，使同类材料内部的先后关系符合实际
    const picked = pickSome(DOC_TEMPLATES[category], count, rand)
    const templates = picked.sort(
      (a, b) => DOC_TEMPLATES[category].indexOf(a) - DOC_TEMPLATES[category].indexOf(b),
    )
    // 项目文档管理员：项目内多数材料由其上传，少量由同事分担
    const primaryUploader = pickOne(OWNERS, rand)
    const span = Math.max(daysBetween(project.planStart, TODAY), 1)
    const [minRatio, maxRatio] = rule.ratio
    // 首份材料的上传时间：按该类材料在项目周期中的位置取值（至少晚于计划开工 1 天）
    let offset = Math.max(1, Math.round(span * (minRatio + rand() * (maxRatio - minRatio))))
    const [minGap, maxGap] = rule.gap

    for (let k = 0; k < templates.length; k++) {
      const tpl = templates[k]
      docs.push({
        id: `DOC-${pad(++seq, 4)}`,
        projectId: project.id,
        category,
        fileName: fillTitle(tpl.title, project, k + 1),
        fileType: tpl.type,
        uploader:
          rule.uploader === 'supervisor'
            ? pickOne(SUPERVISORS, rand)
            : rand() < 0.7
              ? primaryUploader
              : pickOne(OWNERS, rand),
        // 上传时间不得晚于演示基准日（minDate 兜底），且必然晚于计划开工
        uploadTime: minDate(addDays(project.planStart, offset), TODAY),
        sizeKb: sizeOf(tpl.baseKb, rand),
      })
      offset += minGap + Math.round(rand() * (maxGap - minGap))
    }
  }

  return docs
}
