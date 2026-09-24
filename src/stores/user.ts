// ============================================================
// 演示上下文：登录态 / 当前用户 / 角色权限 / 当前报表周期
// 对应需求模块 8（用户与角色）与模块 9（操作日志）的登录前置
// 说明：
//   1. 演示账号取自 mock 数据 allUsers()（账号为姓名拼音），5 类角色各 1 个；
//   2. 密码为演示统一密码 DEMO_PASSWORD，不参与后端校验（本项目全 mock，无网络请求）；
//   3. 登录态写入 sessionStorage：刷新页面保持登录，关闭标签页自动失效；
//   4. 保留原有 role / name / org / can() / switchRole() 供全站权限判断复用。
// ============================================================

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { allUsers, TODAY } from '@/mock'
import type { PermissionCode, RoleCode, UserInfo } from '@/mock/types'

/** 角色 → 权限码映射（需求模块8：权限细粒度控制） */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  admin: [
    'project:view',
    'project:edit',
    'doc:upload',
    'report:export',
    'fund:edit',
    'supervision:edit',
    'user:manage',
    'log:view',
  ],
  'owner-admin': [
    'project:view',
    'project:edit',
    'doc:upload',
    'report:export',
    'fund:edit',
    'supervision:edit',
  ],
  // 监理人员可录入监理通知单、整改回执、问题台账与变更签证（需求模块 6：监理业务线上工作）
  supervisor: ['project:view', 'doc:upload', 'report:export', 'supervision:edit'],
  auditor: ['project:view', 'report:export'],
  viewer: ['project:view'],
}

export const ROLE_NAMES: Record<RoleCode, string> = {
  admin: '平台管理员',
  'owner-admin': '采购人管理员',
  viewer: '普通查看人员',
  supervisor: '监理人员',
  auditor: '审计人员',
}

/** 角色在系统中的职责（登录页账号卡片、用户管理页展示） */
export const ROLE_DUTY: Record<RoleCode, string> = {
  admin: '系统配置、用户管理与操作日志查看',
  'owner-admin': '维护项目台账、资金批次与归档材料',
  supervisor: '录入监理周报月报、监理通知单与问题整改',
  auditor: '跟踪审计简报、软件测评任务与评审会议材料',
  viewer: '只读查看项目、进度、统计与报表',
}

/** 演示统一密码：8 位以上，含大小写字母与数字（与登录页复杂度提示一致） */
export const DEMO_PASSWORD = 'Demo@2026'

/** 登录态在 sessionStorage 中的键名（关闭标签页即失效，满足政务演示环境安全要求） */
const AUTH_KEY = 'pmc-auth'

/** 各角色登录后的默认首页：普通查看人员无驾驶舱菜单，直接落到项目台账 */
export function homePath(role: RoleCode): string {
  return role === 'viewer' ? '/projects' : '/'
}

/** 演示账号：登录页账号卡片一键填充用 */
export interface DemoAccount {
  account: string
  name: string
  role: RoleCode
  roleName: string
  /** 所属单位 / 处室 */
  org: string
  phone: string
  /** 角色职责说明 */
  duty: string
}

/** 演示账号的角色顺序：采购人管理员 → 监理人员 → 审计人员 → 平台管理员 → 普通查看人员 */
const DEMO_ROLES: RoleCode[] = ['owner-admin', 'supervisor', 'auditor', 'admin', 'viewer']

/** 每个角色取 allUsers() 中第一个启用账号，拼出 5 个演示账号 */
function pickDemoAccounts(): DemoAccount[] {
  const users: UserInfo[] = allUsers()
  const list: DemoAccount[] = []
  for (const role of DEMO_ROLES) {
    const u = users.find((x) => x.role === role && x.enabled)
    if (!u) continue
    list.push({
      account: u.account,
      name: u.name,
      role,
      roleName: ROLE_NAMES[role],
      org: u.org,
      phone: u.phone,
      duty: ROLE_DUTY[role],
    })
  }
  return list
}

/** 5 个演示账号（登录页展示与一键填充） */
export const DEMO_ACCOUNTS: DemoAccount[] = pickDemoAccounts()

/** 登录返回结果：ok=false 时 message 为失败原因（登录页直接展示） */
export interface LoginResult {
  ok: boolean
  message: string
}

/** sessionStorage 中的登录快照结构 */
interface AuthSnapshot {
  account: string
  name: string
  role: RoleCode
  org: string
  token: string
  loginAt: string
}

export const useUserStore = defineStore('user', () => {
  const role = ref<RoleCode>('owner-admin')
  const name = ref('李慧敏')
  const org = ref('盐城市卫生健康委员会 · 规划发展与信息化处')

  /** ---------------- 登录态（模块 8/9） ---------------- */
  const logged = ref(false)
  const token = ref('')
  const account = ref('')
  const loginAt = ref('')
  /** 最近一次登录失败原因（登录页异常提醒） */
  const lastError = ref('')
  /** 连续登录失败次数：达到 3 次时在登录页给出安全提示 */
  const failCount = ref(0)

  const roleName = computed(() => ROLE_NAMES[role.value])
  const permissions = computed(() => ROLE_PERMISSIONS[role.value])

  /** 是否拥有某权限 */
  function can(code: PermissionCode): boolean {
    return permissions.value.includes(code)
  }

  /** 演示用：切换角色 */
  function switchRole(next: RoleCode) {
    role.value = next
  }

  /** 把当前登录快照写入 sessionStorage（刷新后保持登录，关闭标签页失效） */
  function persist() {
    const snapshot: AuthSnapshot = {
      account: account.value,
      name: name.value,
      role: role.value,
      org: org.value,
      token: token.value,
      loginAt: loginAt.value,
    }
    try {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(snapshot))
    } catch {
      // 隐私模式下 sessionStorage 可能不可写：登录态退化为内存态，不影响演示
    }
  }

  /** 从 sessionStorage 恢复登录态（应用启动 / 刷新时调用） */
  function restore() {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(AUTH_KEY)
    } catch {
      raw = null
    }
    if (!raw) return
    try {
      const snap = JSON.parse(raw) as Partial<AuthSnapshot>
      if (!snap.account || !snap.role) return
      logged.value = true
      account.value = snap.account
      name.value = snap.name ?? name.value
      role.value = snap.role
      org.value = snap.org ?? org.value
      token.value = snap.token ?? ''
      loginAt.value = snap.loginAt ?? ''
    } catch {
      // 快照损坏：忽略并保持未登录，重新登录即可
    }
  }

  /**
   * 登录：账号必须存在于 allUsers() 且为启用状态，密码为演示统一密码。
   * 失败时记录 lastError 并累计失败次数，由登录页展示异常提醒。
   */
  function login(acc: string, pwd: string): LoginResult {
    const id = acc.trim()
    const u = allUsers().find((x) => x.account === id)
    if (!u) {
      failCount.value++
      lastError.value = `账号「${id}」不存在，请从下方演示账号卡片中选择`
      return { ok: false, message: lastError.value }
    }
    if (!u.enabled) {
      failCount.value++
      lastError.value = `账号「${id}」已停用，请联系平台管理员开通后再登录`
      return { ok: false, message: lastError.value }
    }
    if (pwd !== DEMO_PASSWORD) {
      failCount.value++
      lastError.value =
        failCount.value >= 3
          ? `密码校验失败已连续 ${failCount.value} 次：演示环境统一密码为 ${DEMO_PASSWORD}`
          : '密码校验失败，请核对后重试（8 位以上，含大小写字母与数字）'
      return { ok: false, message: lastError.value }
    }

    logged.value = true
    account.value = u.account
    name.value = u.name
    role.value = u.role
    org.value = u.org
    loginAt.value = `${TODAY} ${clockOfNow()}`
    token.value = `pmc-${u.account}-${Date.now().toString(36)}`
    failCount.value = 0
    lastError.value = ''
    persist()
    return { ok: true, message: `登录成功，欢迎回来 ${u.name}（${ROLE_NAMES[u.role]}）` }
  }

  /** 退出登录：清空内存态与 sessionStorage 快照 */
  function logout() {
    logged.value = false
    token.value = ''
    account.value = ''
    loginAt.value = ''
    lastError.value = ''
    failCount.value = 0
    try {
      sessionStorage.removeItem(AUTH_KEY)
    } catch {
      // 同上：不可写时忽略
    }
  }

  // store 首次实例化时恢复会话（刷新页面后仍保持登录）
  restore()

  return {
    role,
    roleName,
    name,
    org,
    account,
    logged,
    token,
    loginAt,
    lastError,
    failCount,
    permissions,
    can,
    switchRole,
    login,
    logout,
  }
})

/** 当前时间的 HH:mm:ss（登录时间展示用） */
function clockOfNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 报表周期（月 / 季） */
export const useAppStore = defineStore('app', () => {
  const periodType = ref<'month' | 'quarter'>('quarter')
  const periodValue = ref('2026-Q3')
  return { periodType, periodValue }
})
