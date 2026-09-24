// ============================================================
// 系统用户与操作日志（需求模块 8 用户管理 / 模块 9 操作日志）mock 数据生成器
// 数据来源：seed.ts 的人员与机构字典（OWNERS / DEPARTMENTS / OWNER_ORGS / SUPERVISORS）、
//          buildProjects() 的真实项目编号、名称与子任务节点
// 生成规则：
//   1. 14 个账号覆盖 admin / owner-admin / supervisor / auditor / viewer 五类角色，
//      其中 2 个为「禁用」账号，用于演示账号状态与登录拦截；
//   2. 操作日志 320~380 条，覆盖登录 / 新增 / 修改 / 删除 / 导出 / 上传，
//      结果以成功为主，并按固定间隔安排少量失败（密码错误、导出超时、上传失败等）；
//   3. 所有"已发生"时间（最近登录、操作时间）均不晚于演示基准日 TODAY，日志按时间倒序；
//   4. 固定种子 + seedRandom 确定性随机，每次生成的账号与日志完全一致。
// ============================================================

import type { OperationLog, RoleCode, SubProject, UserInfo } from './types'
import { buildProjects } from './generate'
import { DEPARTMENTS, OWNER_ORGS, OWNERS, SUPERVISORS } from './seed'
import { TODAY, addDays, minDate, pad, pickOne, seedRandom } from './utils'

/** 操作类型（沿用 OperationLog.action 的六个取值） */
type LogAction = OperationLog['action']

// ============================================================
// 模块 8：系统用户
// ============================================================

/** 用户数据的固定种子（与日志种子分开，便于各自单独调参互不影响） */
const USER_SEED = 20261026

/** OWNERS 之外的补充姓名：平台管理员、审计人员各 1 名 */
const EXTRA_NAMES = ['沈文博', '顾晓芸']

/** 平台管理员所属处室（委机关规划发展与信息化处） */
const ADMIN_ORG = DEPARTMENTS[0]
/** 审计人员所属处室（财务审计处） */
const AUDIT_ORG = DEPARTMENTS[1]

/** 账号模板：姓名 / 拼音账号 / 角色 / 所属单位或处室 / 启用状态 */
interface UserTemplate {
  name: string
  account: string
  role: RoleCode
  org: string
  enabled: boolean
}

/**
 * 账号清单（14 个）：
 * 姓名取自 seed.ts 的 OWNERS（12 位项目负责人）与 2 个自定义补充姓名，账号为姓名拼音；
 * 角色覆盖 5 类，其中 2 位 viewer 已离岗停用（演示「禁用账号」）。
 */
const USER_TEMPLATES: UserTemplate[] = [
  // 平台管理员：系统配置、用户管理与操作日志查看
  { name: EXTRA_NAMES[0], account: 'shenwenbo', role: 'admin', org: ADMIN_ORG, enabled: true },
  // 采购人 / 建设单位管理员：维护项目台账、资金批次与归档材料
  { name: OWNERS[0], account: 'zhangjianguo', role: 'owner-admin', org: OWNER_ORGS[0], enabled: true },
  { name: OWNERS[1], account: 'lihuimin', role: 'owner-admin', org: OWNER_ORGS[1], enabled: true },
  { name: OWNERS[2], account: 'wangzhiqiang', role: 'owner-admin', org: OWNER_ORGS[2], enabled: true },
  // 监理人员：录入监理周报、监理月报、监理通知单与问题整改
  { name: OWNERS[3], account: 'chenxiaodong', role: 'supervisor', org: SUPERVISORS[0], enabled: true },
  { name: OWNERS[4], account: 'liuhaiyan', role: 'supervisor', org: SUPERVISORS[0], enabled: true },
  { name: OWNERS[5], account: 'zhaowenbin', role: 'supervisor', org: SUPERVISORS[0], enabled: true },
  // 审计人员：跟踪审计简报、软件测评任务与评审会议材料
  { name: OWNERS[6], account: 'sunlijuan', role: 'auditor', org: AUDIT_ORG, enabled: true },
  { name: OWNERS[7], account: 'zhouyongkang', role: 'auditor', org: AUDIT_ORG, enabled: true },
  { name: EXTRA_NAMES[1], account: 'guxiaoyun', role: 'auditor', org: AUDIT_ORG, enabled: true },
  // 普通查看人员：仅查看项目、资金与报表，不能编辑
  { name: OWNERS[8], account: 'wuchunmei', role: 'viewer', org: DEPARTMENTS[2], enabled: true },
  { name: OWNERS[9], account: 'zhengguoping', role: 'viewer', org: DEPARTMENTS[3], enabled: false },
  { name: OWNERS[10], account: 'xuxiaofeng', role: 'viewer', org: DEPARTMENTS[4], enabled: true },
  { name: OWNERS[11], account: 'maxiaoyan', role: 'viewer', org: DEPARTMENTS[5], enabled: false },
]

/** 手机号：138 / 139 号段 + 8 位随机数字（共 11 位） */
function phoneOf(rand: () => number): string {
  const prefix = pickOne(['138', '139'], rand)
  let tail = ''
  for (let i = 0; i < 8; i++) tail += Math.floor(rand() * 10)
  return prefix + tail
}

/** 生成全部系统用户（模块 8 页面数据源） */
export function buildUsers(): UserInfo[] {
  const rand = seedRandom(USER_SEED)
  return USER_TEMPLATES.map((tpl, i) => {
    // 最近登录：可用账号取近 18 天内；禁用账号取停用前（40~89 天前）的最后一次登录
    const loginAgo = tpl.enabled ? Math.floor(rand() * 18) : 40 + Math.floor(rand() * 50)
    const date = minDate(addDays(TODAY, -loginAgo), TODAY)
    return {
      id: `USR-${pad(i + 1, 3)}`,
      name: tpl.name,
      account: tpl.account,
      role: tpl.role,
      org: tpl.org,
      phone: phoneOf(rand),
      enabled: tpl.enabled,
      // 登录时间落在 08:00~19:59 的办公时段
      lastLogin: `${date} ${pad(Math.floor(rand() * 12) + 8)}:${pad(Math.floor(rand() * 60))}`,
    }
  })
}

// ============================================================
// 模块 9：操作日志
// ============================================================

/** 操作日志的固定种子 */
const LOG_SEED = 20261030

/** 操作类型权重池：登录最频繁，其次为修改 / 导出 / 上传，新增与删除较少 */
const ACTION_POOL: LogAction[] = [
  '登录', '登录', '登录', '修改', '修改', '修改', '导出', '导出', '上传', '上传', '新增', '删除',
]

/** 各操作类型允许的操作人角色（与实际权限一致：如导出报表由管理员 / 采购人 / 审计人员操作） */
const ACTOR_ROLES: Record<LogAction, RoleCode[]> = {
  登录: ['admin', 'owner-admin', 'supervisor', 'auditor', 'viewer'],
  新增: ['admin', 'owner-admin'],
  修改: ['admin', 'owner-admin'],
  删除: ['admin', 'owner-admin'],
  导出: ['admin', 'owner-admin', 'auditor'],
  上传: ['admin', 'owner-admin', 'supervisor'],
}

/** 操作内容模板：{id} 项目编号、{name} 项目名称、{task} 子任务、{doc} 材料名、{n} 批次号 */
const DETAIL_TEMPLATES: Record<LogAction, string[]> = {
  登录: ['登录平台', '登录平台（内网统一认证）', '登录平台（手机验证码登录）'],
  新增: [
    '新增子项目 {id}「{name}」',
    '新增子项目 {id} 第 {n} 批资金拨付计划',
    '新增子项目 {id} 阶段子任务「{task}」',
    '新增子项目 {id} 变更记录（{doc}）',
  ],
  修改: [
    '修改子项目 {id} 计划验收时间',
    '修改子项目 {id} 子任务「{task}」负责人',
    '修改子项目 {id} 风险等级',
    '修改子项目 {id} 中央专项资金金额',
  ],
  删除: [
    '删除子项目 {id} 的重复归档材料《{doc}》',
    '删除子项目 {id} 的作废变更记录',
    '删除子项目 {id} 子任务「{task}」的失效附件',
  ],
  导出: [
    '导出《{id} 项目资金拨付及结余明细表》',
    '导出《{id} 项目进度台账》',
    '导出《{name}资金使用与结余说明》',
    '导出《{id} 监理问题整改台账》',
    '导出《{id} 归档材料清单》',
  ],
  上传: [
    '上传《{doc}》至 {id} 归档目录',
    '上传《{name}立项批复》至 {id} 立项档案',
    '上传《{name}合同协议书》至 {id} 采购合同档案',
    '上传《{name}软件测评报告》至 {id} 验收档案',
    '上传《{name}监理月报》至 {id} 监理资料',
  ],
}

/** 材料名池（上传 / 删除日志用，与归档目录口径一致） */
const DOC_NAMES = [
  '可行性研究报告', '初步设计文件', '概算审核报告', '招标文件', '评标报告', '合同协议书',
  '监理月报', '监理通知单', '跟踪审计简报', '软件测评报告', '验收报告', '资金拨付明细表',
]

/** 失败原因：与操作类型匹配，覆盖登录密码错误、导出超时等演示场景 */
const FAIL_REASON: Record<LogAction, string> = {
  登录: '密码校验失败（连续 3 次错误）',
  新增: '必填字段校验未通过，保存失败',
  修改: '记录已被他人修改，保存失败',
  删除: '记录存在关联数据，删除被拒绝',
  导出: '服务响应超时，导出失败',
  上传: '文件格式不支持，上传失败',
}

/** 失败日志安排：每 22 条插 1 条，失败类型按池轮换，保证各类异常在演示中都能看到 */
const FAIL_EVERY = 22
const FAIL_ACTIONS: LogAction[] = ['登录', '导出', '上传', '登录', '修改', '导出']

/** 把模板占位符替换成项目真实数据，使日志内容与项目台账对得上 */
function fillDetail(tpl: string, project: SubProject, rand: () => number): string {
  // 取该项目真实的子任务节点名，避免日志里出现台账中不存在的节点
  const tasks = project.tasks
  const taskName = tasks.length ? pickOne(tasks, rand).name : '开发实施'
  return tpl
    .replace('{id}', project.id)
    .replace('{name}', project.name)
    .replace('{task}', taskName)
    .replace('{doc}', pickOne(DOC_NAMES, rand))
    .replace('{n}', String(Math.floor(rand() * 3) + 2))
}

/** 内网 IP：10.32.x.x（委机关内网）/ 172.18.x.x（机房业务网段） */
function ipOf(rand: () => number): string {
  const net = pickOne(['10.32', '172.18'], rand)
  return `${net}.${Math.floor(rand() * 254) + 1}.${Math.floor(rand() * 254) + 1}`
}

/**
 * 操作时间：minuteAgo 为「距演示基准日 24:00 的分钟数」，数值越大时间越早。
 * 换算为 YYYY-MM-DD HH:mm:ss，并用 minDate 兜底保证日期不晚于 TODAY。
 */
function stampOf(minuteAgo: number, rand: () => number): string {
  const dayAgo = Math.floor(minuteAgo / 1440)
  const minutesOfDay = (1440 - (minuteAgo % 1440)) % 1440
  const date = minDate(addDays(TODAY, -dayAgo), TODAY)
  const clock = `${pad(Math.floor(minutesOfDay / 60))}:${pad(minutesOfDay % 60)}:${pad(Math.floor(rand() * 60))}`
  return `${date} ${clock}`
}

/** 生成全部操作日志（模块 9 页面数据源），数组按时间倒序（最近的操作在最前） */
export function buildLogs(): OperationLog[] {
  const rand = seedRandom(LOG_SEED)
  const projects = buildProjects()
  const users = buildUsers()

  // 日志总量 320~380 条（确定性随机），落在需求要求的 300~400 条区间
  const total = 320 + Math.floor(rand() * 61)
  const logs: OperationLog[] = []
  // 起点取基准日 10:00~20:00 之间的某分钟，随后逐条往前推进，天然形成倒序
  let minuteAgo = 240 + Math.floor(rand() * 600)

  for (let i = 0; i < total; i++) {
    // 相邻两条日志间隔 40~939 分钟，约 4 个月的时间跨度铺满全量日志
    minuteAgo += 40 + Math.floor(rand() * 900)

    // 每 FAIL_EVERY 条安排 1 条失败日志，失败类型按池轮换
    const planIndex = (i + 1) % FAIL_EVERY === 0 ? Math.floor((i + 1) / FAIL_EVERY) - 1 : -1
    const planned = planIndex >= 0
    const action = planned ? FAIL_ACTIONS[planIndex % FAIL_ACTIONS.length] : pickOne(ACTION_POOL, rand)

    const actor = pickOne(
      users.filter((u) => ACTOR_ROLES[action].includes(u.role)),
      rand,
    )
    const project = pickOne(projects, rand)
    const content = fillDetail(pickOne(DETAIL_TEMPLATES[action], rand), project, rand)

    // 失败：计划内的失败日志，或禁用账号尝试登录（与账号状态保持一致）
    const disabled = action === '登录' && !actor.enabled
    const failed = planned || disabled
    const reason = disabled ? '账号已停用，登录被拒绝' : FAIL_REASON[action]

    logs.push({
      id: `LOG-${pad(total - i, 4)}`,
      time: stampOf(minuteAgo, rand),
      account: actor.account,
      name: actor.name,
      action,
      detail: failed ? `${content}，${reason}` : content,
      ip: ipOf(rand),
      result: failed ? '失败' : '成功',
    })
  }
  return logs
}
