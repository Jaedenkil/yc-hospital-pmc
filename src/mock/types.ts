// ============================================================
// 数据模型定义（演示 Demo）
// 对应知识库《yc-hospital-pmc-前端架构》§四 数据模型
// 说明：全部为假数据（mock），正式开发时替换为接口 DTO
// ============================================================

/** 项目四大阶段（需求原文） */
export type Phase = '立项' | '采购' | '建设' | '验收'

/** 子任务状态 —— 对应需求原文的五色标记 */
export type TaskStatus = 'not-started' | 'doing' | 'done' | 'warn' | 'overdue'

/** 项目风险等级 */
export type RiskLevel = 'low' | 'mid' | 'high'

/** 阶段顺序（用于排序与进度计算） */
export const PHASE_ORDER: Phase[] = ['立项', '采购', '建设', '验收']

/** 状态中文名 */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': '未开始',
  doing: '进行中',
  done: '已完成',
  warn: '延期预警',
  overdue: '严重滞后',
}

/** 风险等级中文名 */
export const RISK_LABEL: Record<string, string> = {
  low: '低',
  mid: '中',
  high: '高',
}

/** 子任务节点（每个大阶段下可自定义多个） */
export interface PhaseTask {
  /** 所属大阶段 */
  phase: Phase
  /** 子任务名称：可研编制 / 概算评审 / 招标时点 / 合同签订 / 需求评审 / 开发 / 测试 / 上线试运行 / 预验收 / 正式验收 … */
  name: string
  /** 计划完成时间 YYYY-MM-DD */
  planEnd: string
  /** 实际完成时间（未完成则为 null） */
  actualEnd: string | null
  /** 五色状态 */
  status: TaskStatus
  /** 负责人 */
  owner: string
  /** 滞后原因备注 */
  delayReason?: string
  /** 附件材料数 */
  attachments: number
}

/** 资金拨付批次 */
/** 资金来源：中央专项为中央财政拨款；地方配套与单位自筹统称"其他资金" */
export type FundSource = '中央专项' | '地方配套' | '单位自筹'

export interface FundBatch {
  /** 批次序号 */
  batch: number
  /** 资金来源 */
  source: FundSource
  /** 计划拨付时间 */
  planDate: string
  /** 实际拨付时间（未拨付为 null） */
  payDate: string | null
  /** 拨付金额（元） */
  amount: number
  /** 实际使用金额（元） */
  used: number
}

/** 变更调增 / 调减记录 */
export interface FundChange {
  id: string
  /** 变更时间 */
  date: string
  /** 变更内容 */
  reason: string
  /** 调增为正、调减为负（元） */
  amount: number
  /** 是否已审批 */
  approved: boolean
}

/** 归档文档条目 */
export interface DocItem {
  id: string
  /** 所属项目编号 */
  projectId: string
  /** 档案分类：立项 / 概算评审 / 采购合同 / 监理资料 / 审计资料 / 软件测评报告 / 评审会议材料 / 验收材料 */
  category: DocCategory
  /** 文件名 */
  fileName: string
  /** 文件类型（用于图标与预览） */
  fileType: 'pdf' | 'doc' | 'xls' | 'img'
  /** 上传人 */
  uploader: string
  /** 上传时间 */
  uploadTime: string
  /** 大小（KB） */
  sizeKb: number
}

/** 归档分类（需求原文模块 5） */
export type DocCategory =
  | '立项'
  | '概算评审'
  | '采购合同'
  | '监理资料'
  | '审计资料'
  | '软件测评报告'
  | '评审会议材料'
  | '验收材料'

export const DOC_CATEGORIES: DocCategory[] = [
  '立项',
  '概算评审',
  '采购合同',
  '监理资料',
  '审计资料',
  '软件测评报告',
  '评审会议材料',
  '验收材料',
]

/** 子项目（台账主表） */
export interface SubProject {
  /** 项目编号，如 PM-2026-001 */
  id: string
  /** 项目名称 */
  name: string
  /** 牵头处室 */
  leadDept: string
  /** 采购人 / 建设单位 */
  owner: string
  /** 建设总投资（元） */
  totalInvestment: number
  /** 中央专项资金（元） */
  centralFund: number
  /** 建设内容 */
  content: string
  /** 计划开工 */
  planStart: string
  /** 计划验收 */
  planAccept: string
  /** 当前所处阶段 */
  phase: Phase
  /** 风险等级 */
  riskLevel: RiskLevel
  /** 四阶段子任务 */
  tasks: PhaseTask[]
  /** 资金批次 */
  fundPlan: FundBatch[]
  /** 变更记录 */
  changes: FundChange[]
  /** 归档材料数 */
  docCount: number
  /** 监理单位（演示用） */
  supervisor: string
}

/** 角色（需求原文模块 8：至少 5 类） */
export type RoleCode = 'admin' | 'owner-admin' | 'viewer' | 'supervisor' | 'auditor'

export interface RoleInfo {
  code: RoleCode
  name: string
  desc: string
}

/** 权限码（需求原文：项目查看、编辑、上传文档、导出报表、资金编辑等） */
export type PermissionCode =
  | 'project:view'
  | 'project:edit'
  | 'doc:upload'
  | 'report:export'
  | 'fund:edit'
  | 'supervision:edit'
  | 'user:manage'
  | 'log:view'

/** 用户 */
export interface UserInfo {
  id: string
  name: string
  account: string
  role: RoleCode
  /** 所属单位 / 处室 */
  org: string
  phone: string
  enabled: boolean
  lastLogin: string
}

/** 操作日志（需求原文模块 9） */
export interface OperationLog {
  id: string
  time: string
  account: string
  name: string
  /** 操作类型 */
  action: '登录' | '新增' | '修改' | '删除' | '导出' | '上传'
  /** 操作内容 */
  detail: string
  ip: string
  /** 结果 */
  result: '成功' | '失败'
}

/** 监理台账记录（模块 6） */
export interface SupervisionRecord {
  id: string
  projectId: string
  /** 记录类型：周报 / 月报 / 专题报告 / 监理通知单 / 整改回执 */
  type: '监理周报' | '监理月报' | '专题报告' | '监理通知单' | '整改回执'
  title: string
  date: string
  author: string
  /** 整改状态（通知单类才有意义） */
  rectification?: '待整改' | '整改中' | '已闭环'
  /** 整改期限 */
  deadline?: string
}

/** 问题台账（模块 6） */
export interface IssueItem {
  id: string
  projectId: string
  /** 问题分类：质量 / 进度 / 投资 / 安全 */
  category: '质量' | '进度' | '投资' | '安全'
  /** 问题等级 */
  level: '一般' | '较重' | '严重'
  desc: string
  /** 责任方 */
  responsible: string
  /** 整改期限 */
  deadline: string
  /** 状态 */
  status: '待整改' | '整改中' | '已销号'
  foundDate: string
}

/** 审计简报 / 测评任务 / 评审会议（模块 7） */
export interface AuditRecord {
  id: string
  projectId: string
  /** 类型 */
  type: '跟踪审计简报' | '专项审计报告'
  title: string
  date: string
  author: string
}

export interface TestTask {
  id: string
  projectId: string
  /** 测评机构 */
  agency: string
  /** 任务状态 */
  status: '待测评' | '测评中' | '已完成'
  /** 缺陷总数 */
  defectsTotal: number
  /** 已复核缺陷 */
  defectsFixed: number
  /** 报告上传时间 */
  reportTime: string | null
}

export interface ReviewMeeting {
  id: string
  projectId: string
  /** 会议主题 */
  topic: string
  date: string
  /** 专家人数 */
  expertCount: number
  /** 专家意见条数 */
  opinionCount: number
  /** 整改清单条数 */
  rectificationCount: number
}
