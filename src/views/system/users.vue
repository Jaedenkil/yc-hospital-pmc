<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="用户与角色管理"
      desc="平台账号按角色分配权限，权限码共 8 项；账号操作实时写入操作日志（模块 9）"
      tag="模块 8"
    >
      <a-tag v-if="!canManage" color="orange">当前角色无用户管理权限，页面为只读</a-tag>
      <Button v-if="canManage" type="primary" @click="openCreate">
        <template #icon><PlusOutlined /></template>
        新增用户
      </Button>
    </PageHeader>

    <!-- 账号与权限概览 -->
    <div class="kpi-row">
      <StatCard
        v-for="k in kpis"
        :key="k.label"
        :label="k.label"
        :value="k.value"
        :unit="k.unit"
        :sub="k.sub"
        :accent="k.accent"
      />
    </div>

    <div class="main-row">
      <!-- 左侧：角色列表 + 权限矩阵 -->
      <div class="left-col">
        <div class="pmc-card panel role-card">
          <div class="panel-title">
            角色列表
            <span class="panel-sub">点击角色可筛选右侧账号</span>
          </div>
          <!-- 角色列表：占满卡片剩余高度，列表内容超出时在卡片内部滚动 -->
          <div class="role-list">
            <button
              v-for="r in ROLE_CODES"
              :key="r"
              type="button"
              class="role-item"
              :class="{ active: roleFilter === r }"
              @click="toggleRole(r)"
            >
              <span class="ri-head">
                <span class="ri-name">{{ ROLE_NAMES[r] }}</span>
                <span class="ri-count">{{ roleCount(r) }} 个账号 · {{ ROLE_PERMISSIONS[r].length }} 项权限</span>
              </span>
              <span class="ri-duty">{{ ROLE_DUTY[r] }}</span>
              <span class="ri-perm">{{ permissionText(r) }}</span>
            </button>
          </div>
          <div v-if="roleFilter" class="role-reset">
            <a @click="roleFilter = ''">清除角色筛选（显示全部账号）</a>
          </div>
        </div>

        <div :ref="setMatrixCard" class="pmc-card panel matrix-card">
          <div class="panel-title">
            角色权限矩阵
            <span class="panel-sub">共 {{ PERMISSION_CODES.length }} 个权限码 × {{ ROLE_CODES.length }} 类角色</span>
          </div>
          <!-- 矩阵容器：占满卡片剩余高度，行数超出时表体内部滚动（不足 3 行按 3 行兜底） -->
          <div class="matrix-wrap">
            <a-table
              :columns="matrixColumns"
              :data-source="matrixRows"
              :pagination="false"
              row-key="key"
              size="small"
              :scroll="{ ...matrixScroll, x: 620 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key !== 'label'">
                  <span v-if="record[String(column.key)] === 'Y'" class="yes">
                    <CheckOutlined />
                  </span>
                  <span v-else class="no">—</span>
                </template>
                <template v-else>
                  <span class="perm-label">{{ record.label }}</span>
                  <span class="perm-code">{{ record.key }}</span>
                </template>
              </template>
            </a-table>
          </div>
        </div>
      </div>

      <!-- 右侧：账号表格 -->
      <div class="right-col">
        <div :ref="setTableCard" class="pmc-card panel table-card">
          <div class="panel-title">
            平台账号
            <span class="panel-sub">共 {{ filtered.length }} 个账号，其中启用 {{ enabledCount }} 个</span>
          </div>

          <div class="filter-row">
            <Input v-model:value="keyword" placeholder="搜索账号 / 姓名 / 单位 / 手机号" allow-clear style="width: 250px">
              <template #prefix><SearchOutlined /></template>
            </Input>
            <Select
              v-model:value="statusFilter"
              :options="statusOptions"
              style="width: 150px"
              @change="onFilterChange"
            />
            <Button @click="resetFilter">重置</Button>
          </div>

          <!-- 表格容器：筛选行与底部说明之间的剩余高度全部给它，表体在此内部滚动 -->
          <div class="table-wrap">
            <a-table
              :columns="columns"
              :data-source="filtered"
              :pagination="pagination"
              row-key="id"
              size="middle"
              :scroll="{ ...tableScroll, x: 1180 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'account'">
                  <span class="mono">{{ record.account }}</span>
                </template>
                <template v-else-if="column.key === 'name'">
                  {{ record.name }}
                </template>
                <template v-else-if="column.key === 'role'">
                  <a-tag :color="roleColor(record.role)">{{ roleLabel(record) }}</a-tag>
                </template>
                <template v-else-if="column.key === 'org'">
                  {{ record.org }}
                </template>
                <template v-else-if="column.key === 'phone'">
                  <span class="mono">{{ record.phone }}</span>
                </template>
                <template v-else-if="column.key === 'enabled'">
                  <a-tag v-if="record.enabled" color="green">启用</a-tag>
                  <a-tag v-else color="red">停用</a-tag>
                </template>
                <template v-else-if="column.key === 'lastLogin'">
                  <span class="mono">{{ record.lastLogin }}</span>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-space>
                    <a @click="toggleEnabled(userRow(record))">{{ record.enabled ? '禁用' : '启用' }}</a>
                    <APopconfirm
                      title="确认将该账号密码重置为演示统一密码？"
                      ok-text="确认重置"
                      cancel-text="取消"
                      @confirm="resetPassword(userRow(record))"
                    >
                      <a>重置密码</a>
                    </APopconfirm>
                  </a-space>
                </template>
              </template>
              <template #emptyText>
                <AEmpty description="暂无符合条件的账号，请调整筛选条件" />
              </template>
            </a-table>
          </div>

          <div class="panel-foot">
            账号操作（新增 / 禁用 / 启用 / 重置密码）会即时写入操作日志，
            可在「系统管理 → 操作日志」中按账号与操作类型查询；本次会话已产生 {{ runLogCount }} 条操作记录。
          </div>
        </div>
      </div>
    </div>

    <!-- 新增用户 -->
    <Modal
      v-model:open="createOpen"
      title="新增用户"
      ok-text="保存"
      cancel-text="取消"
      :confirm-loading="saving"
      @ok="submitCreate"
      @cancel="resetForm"
    >
      <Form layout="vertical" :model="form">
        <FormItem label="登录账号（姓名拼音）" required>
          <Input v-model:value="form.account" placeholder="如 zhangjianguo" @blur="normalizeAccount" />
        </FormItem>
        <FormItem label="姓名" required>
          <Input v-model:value="form.name" placeholder="请输入真实姓名" />
        </FormItem>
        <FormItem label="角色" required>
          <Select v-model:value="form.role" :options="roleOptions" />
        </FormItem>
        <FormItem label="所属单位 / 处室" required>
          <Select v-model:value="form.org" :options="orgOptions" show-search />
        </FormItem>
        <FormItem label="手机号" required>
          <Input v-model:value="form.phone" placeholder="11 位手机号，如 13805100001" />
        </FormItem>
        <div class="form-note">
          初始密码为演示统一密码 {{ DEMO_PASSWORD }}（8 位以上，含大小写字母与数字），
          首次登录后可在账号详情中重置。
        </div>
      </Form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
// ============================================================
// 用户与角色管理（需求模块 8）
// 左：角色列表 + 权限矩阵（8 个权限码 × 5 类角色，打勾显示）
// 右：平台账号表格（账号 / 姓名 / 角色 / 单位 / 手机 / 状态 / 最后登录）
//     新增用户、禁用/启用、重置密码按钮按 can('user:manage') 显隐
// 每次操作均给出 message 提示，并追加一条操作日志（模块 9 页面即时可见）
// ============================================================
import { computed, reactive, ref } from 'vue'
import {
  Button,
  Empty as AEmpty,
  Form,
  FormItem,
  Input,
  Modal,
  Popconfirm as APopconfirm,
  Select,
  message,
} from 'ant-design-vue'
import { CheckOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { DEPARTMENTS, OWNER_ORGS, SUPERVISORS } from '@/mock/seed'
import { allLogs, allUsers, TODAY } from '@/mock'
import type { OperationLog, PermissionCode, RoleCode, UserInfo } from '@/mock/types'
import { pad } from '@/mock/utils'
import {
  DEMO_PASSWORD,
  ROLE_DUTY,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  useUserStore,
} from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
/** 是否可管理用户（无权限时按钮直接不渲染） */
const canManage = computed(() => user.can('user:manage'))

/** 权限码中文名 */
const PERMISSION_LABELS: Record<PermissionCode, string> = {
  'project:view': '项目查看',
  'project:edit': '项目编辑',
  'doc:upload': '文档上传',
  'report:export': '报表导出',
  'fund:edit': '资金编辑',
  'supervision:edit': '监理录入',
  'user:manage': '用户管理',
  'log:view': '日志查看',
}

/** 权限码清单（矩阵行，按需求原文顺序） */
const PERMISSION_CODES: PermissionCode[] = [
  'project:view',
  'project:edit',
  'doc:upload',
  'report:export',
  'fund:edit',
  'supervision:edit',
  'user:manage',
  'log:view',
]

/** 角色清单（矩阵列 / 角色列表） */
const ROLE_CODES: RoleCode[] = ['admin', 'owner-admin', 'supervisor', 'auditor', 'viewer']

// ---------------- 账号数据（本地副本，支持演示期增改） ----------------
const rows = ref<UserInfo[]>(allUsers().map((u) => ({ ...u })))
/** 新增账号的编号游标（延续 mock 的 USR-0xx 编号） */
let idSeq = rows.value.length

const keyword = ref('')
const statusFilter = ref<'' | 'enabled' | 'disabled'>('')
const roleFilter = ref<RoleCode | ''>('')

/** 账号状态筛选项（与表格「状态」列一致） */
const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
]

const filtered = computed(() =>
  rows.value.filter((u) => {
    if (statusFilter.value === 'enabled' && !u.enabled) return false
    if (statusFilter.value === 'disabled' && u.enabled) return false
    if (roleFilter.value && u.role !== roleFilter.value) return false
    const kw = keyword.value.trim()
    if (kw && !`${u.account}${u.name}${u.org}${u.phone}`.includes(kw)) return false
    return true
  }),
)

const enabledCount = computed(() => rows.value.filter((u) => u.enabled).length)

const kpis = computed(() => [
  { label: '账号总数', value: String(rows.value.length), unit: '个', sub: `覆盖 ${ROLE_CODES.length} 类角色`, accent: '#1a5fd0' },
  { label: '启用账号', value: String(enabledCount.value), unit: '个', sub: '可正常登录平台', accent: '#52c41a' },
  {
    label: '停用账号',
    value: String(rows.value.length - enabledCount.value),
    unit: '个',
    sub: '离岗 / 待复核账号，登录被拦截',
    accent: '#ff4d4f',
  },
  { label: '权限码', value: String(PERMISSION_CODES.length), unit: '项', sub: '按角色细粒度授权', accent: '#1677ff' },
])

/** 角色账号数 / 权限明细（角色列表展示） */
function roleCount(r: RoleCode): number {
  return rows.value.filter((u) => u.role === r).length
}

function permissionText(r: RoleCode): string {
  return ROLE_PERMISSIONS[r].map((c) => PERMISSION_LABELS[c]).join(' · ')
}

/** 角色标签色（与权限粒度一致：管理员红、采购人蓝、监理青、审计紫、查看灰） */
function roleColor(r: RoleCode): string {
  const map: Record<RoleCode, string> = {
    admin: 'red',
    'owner-admin': 'blue',
    supervisor: 'cyan',
    auditor: 'purple',
    viewer: 'default',
  }
  return map[r]
}

/**
 * a-table 的 bodyCell slot 只把 record 声明为宽松对象，字段类型丢失；
 * 本页 :data-source 固定为 UserInfo 行，这里还原为行类型后再交给类型化函数使用。
 */
function userRow(record: unknown): UserInfo {
  return record as UserInfo
}

/** 账号行的角色中文名（record 同上，为宽松行对象，role 字段实际为 RoleCode） */
function roleLabel(record: unknown): string {
  return ROLE_NAMES[userRow(record).role]
}

// ---------------- 用户表格列 ----------------
interface Col {
  title: string
  key: string
  width?: number
  align?: 'left' | 'right' | 'center'
  fixed?: 'left' | 'right'
}

const columns = computed<Col[]>(() => {
  const cols: Col[] = [
    { title: '账号', key: 'account', width: 140, fixed: 'left' },
    { title: '姓名', key: 'name', width: 100 },
    { title: '角色', key: 'role', width: 130 },
    { title: '所属单位 / 处室', key: 'org', width: 280 },
    { title: '手机号', key: 'phone', width: 140 },
    { title: '状态', key: 'enabled', width: 100 },
    { title: '最后登录', key: 'lastLogin', width: 170 },
  ]
  if (canManage.value) cols.push({ title: '操作', key: 'action', width: 170, fixed: 'right' })
  return cols
})

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个账号`,
}

/** 账号表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素；卡片内还有标题、筛选行与底部说明，测量基准取表格容器 */
function setTableCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.table-wrap') ?? root) : null
  tableCardRef.value = host instanceof HTMLElement ? host : null
}

/** 权限矩阵自适应高度：small 表格行高约 40px，无分页 */
const { wrapRef: matrixCardRef, tableScroll: matrixScroll } = useTableScroll({ minRows: 3, rowHeight: 40 })

/** 权限矩阵卡函数式 ref：卡片内还有标题行，测量基准取矩阵表格容器 */
function setMatrixCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.matrix-wrap') ?? root) : null
  matrixCardRef.value = host instanceof HTMLElement ? host : null
}

// ---------------- 权限矩阵 ----------------
const matrixColumns = computed(() => [
  { title: '权限项', key: 'label', dataIndex: 'label', width: 160 },
  ...ROLE_CODES.map((r) => ({ title: ROLE_NAMES[r], key: r, dataIndex: r, align: 'center' as const, width: 96 })),
])

const matrixRows = PERMISSION_CODES.map((code) => {
  const row: Record<string, string> = { key: code, label: PERMISSION_LABELS[code] }
  for (const r of ROLE_CODES) row[r] = ROLE_PERMISSIONS[r].includes(code) ? 'Y' : 'N'
  return row
})

// ---------------- 筛选 ----------------
function toggleRole(r: RoleCode) {
  roleFilter.value = roleFilter.value === r ? '' : r
}

function onFilterChange() {
  // 切换状态筛选时同步清空关键字，避免演示时出现"空表格"误解
  if (statusFilter.value && keyword.value.trim()) keyword.value = ''
}

function resetFilter() {
  keyword.value = ''
  statusFilter.value = ''
  roleFilter.value = ''
}

// ---------------- 新增用户 ----------------
const createOpen = ref(false)
const saving = ref(false)

const form = reactive({
  account: '',
  name: '',
  role: 'owner-admin' as RoleCode,
  org: OWNER_ORGS[0],
  phone: '',
})

const roleOptions = ROLE_CODES.map((r) => ({ value: r, label: `${ROLE_NAMES[r]}（${ROLE_DUTY[r]}）` }))
const orgOptions = [...OWNER_ORGS, ...SUPERVISORS, ...DEPARTMENTS].map((o) => ({ value: o, label: o }))

function openCreate() {
  resetForm()
  createOpen.value = true
}

function resetForm() {
  form.account = ''
  form.name = ''
  form.role = 'owner-admin'
  form.org = OWNER_ORGS[0]
  form.phone = ''
}

/** 账号统一转小写字母（与既有账号命名一致） */
function normalizeAccount() {
  form.account = form.account.trim().toLowerCase()
}

function submitCreate() {
  const account = form.account.trim().toLowerCase()
  const name = form.name.trim()
  const phone = form.phone.trim()

  if (!/^[a-z][a-z0-9]{3,}$/.test(account)) {
    message.error('账号需为姓名拼音（小写字母开头，4 位以上，仅含字母与数字）')
    return
  }
  if (rows.value.some((u) => u.account === account)) {
    message.error(`账号 ${account} 已存在，请更换`)
    return
  }
  if (!name) {
    message.error('请填写用户姓名')
    return
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    message.error('请填写正确的 11 位手机号')
    return
  }

  saving.value = true
  idSeq += 1
  const today = TODAY
  const created: UserInfo = {
    id: `USR-${pad(idSeq, 3)}`,
    name,
    account,
    role: form.role,
    org: form.org,
    phone,
    enabled: true,
    // 新建账号尚未登录：以创建时间作为「最后登录」的初始展示值
    lastLogin: `${today} 09:00:00`,
  }
  rows.value.unshift(created)
  saving.value = false
  createOpen.value = false
  message.success(`已新增账号 ${account}（${name}·${ROLE_NAMES[form.role]}），初始密码 ${DEMO_PASSWORD}`)
  appendLog('新增', `新增账号 ${account}（${name}·${ROLE_NAMES[form.role]}），初始密码为演示统一密码`)
  resetForm()
  roleFilter.value = ''
  statusFilter.value = ''
  keyword.value = ''
}

// ---------------- 禁用 / 启用 / 重置密码 ----------------
function toggleEnabled(u: UserInfo) {
  u.enabled = !u.enabled
  const text = u.enabled ? '启用' : '禁用'
  message.success(`已${text}账号 ${u.account}（${u.name}）${u.enabled ? '，该账号可正常登录' : '，该账号登录将被拦截'}`)
  appendLog('修改', `${text}账号 ${u.account}（${u.name}·${ROLE_NAMES[u.role]}）`)
}

function resetPassword(u: UserInfo) {
  message.success(`已将 ${u.name}（${u.account}）的密码重置为演示统一密码 ${DEMO_PASSWORD}`)
  appendLog('修改', `重置账号 ${u.account}（${u.name}）的登录密码`)
}

// ---------------- 操作日志（模块 9 即时可见） ----------------
const runLogCount = ref(0)
/** 会话内追加日志的序号（与 mock 日志 ID 区分） */
let runSeq = 0

/**
 * 把本次操作追加到操作日志缓存数组（allLogs 返回同一份缓存，
 * 因此「系统管理 → 操作日志」页面刷新数据后即可看到本次操作；演示期内存追加，刷新页面后重置）
 */
function appendLog(action: OperationLog['action'], detail: string) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  runSeq += 1
  allLogs().unshift({
    id: `LOG-RUN-${Date.now().toString(36)}-${runSeq}`,
    time: `${TODAY} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    account: user.account || 'shenwenbo',
    name: user.name,
    action,
    detail,
    ip: '10.32.18.36',
    result: '成功',
  })
  runLogCount.value += 1
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头与统计卡片行固定：保持自然高度，不参与剩余高度分配
.page-head {
  flex: none;
}

.kpi-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 两栏区域：占满页头与统计卡片行以下的剩余高度，两栏等高
.main-row {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  gap: 12px;
}

// 左栏：两张卡片纵向排布并分配栏内高度，内容超出时在卡片内部滚动
.left-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

// 右栏：账号表格卡片占满栏高
.right-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel {
  padding: 14px 16px 16px;

  &-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  &-sub {
    font-size: 12px;
    font-weight: 400;
    color: @text-3;
  }

  &-foot {
    flex: none;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed @border-color;
    font-size: 12px;
    line-height: 1.7;
    color: @text-3;
  }
}

.left-col .panel + .panel {
  margin-top: 12px;
}

// 左栏两张卡片：均分栏内剩余高度并纵向排布（高度只由栏高决定，避免表格高度回写造成测量反馈）
.role-card,
.matrix-card {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;

  // 卡片标题不参与高度压缩
  .panel-title {
    flex: none;
  }
}

// 角色列表：占满卡片剩余高度，列表内容超出时在卡片内部滚动
.role-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

// 权限矩阵容器：占满卡片剩余高度，表体高度交由表格自适应（行数超出时表体内部滚动）
.matrix-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ---------------- 角色列表 ---------------- */
.role-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 12px;
  text-align: left;
  background: @bg-card;
  border: 1px solid @border-color;
  border-radius: @radius;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: @primary-border;
    background: @primary-bg;
  }

  &.active {
    border-color: @primary;
    background: @primary-bg;
    box-shadow: 0 2px 8px rgba(26, 95, 208, 0.12);
  }

  .ri-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ri-name {
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }

  .ri-count {
    font-size: 11px;
    color: @primary;
  }

  .ri-duty {
    font-size: 12px;
    color: @text-2;
  }

  .ri-perm {
    font-size: 11px;
    color: @text-3;
  }
}

.role-reset {
  margin-top: 6px;
  font-size: 12px;
}

/* ---------------- 权限矩阵 ---------------- */
.yes {
  color: @status-done;
  font-size: 14px;
}

.no {
  color: @text-3;
}

.perm-label {
  margin-right: 6px;
  color: @text-1;
}

.perm-code {
  font-size: 11px;
  color: @text-3;
  font-family: 'Barlow', 'Helvetica Neue', sans-serif;
}

/* ---------------- 右侧账号表格 ---------------- */
// 账号表格卡片：占满右栏高度，表体在卡片内部滚动
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

// 表格容器：卡片标题、筛选行与底部说明之间的剩余高度全部给它；
// 最少 240px（表头 47 + 3 行 × 48 + 分页 48 的兜底），空间不足时内容超出、由页面整体滚动
.table-wrap {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
}

.filter-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mono {
  font-variant-numeric: tabular-nums;
}

.form-note {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.7;
  color: @text-2;
  background: @primary-bg;
  border: 1px solid @primary-border;
  border-radius: @radius-sm;
}
</style>
