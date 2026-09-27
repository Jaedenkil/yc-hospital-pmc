<template>
  <div class="pmc-page pmc-page-fill">
    <!-- 筛选区 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-input v-model:value="query.keyword" placeholder="搜索项目名称 / 编号" allow-clear style="width: 240px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-select v-model:value="query.phase" :options="phaseOptions" style="width: 150px" />
        <a-select v-model:value="query.dept" :options="deptOptions" style="width: 200px" />
        <a-select v-model:value="query.risk" :options="riskOptions" style="width: 150px" />
        <a-select v-model:value="query.central" :options="centralOptions" style="width: 180px" />
    <a-select v-model:value="query.investRange" :options="investOptions" style="width: 180px" />
    <a-select
      v-model:value="query.owner"
      :options="ownerOptions"
      style="width: 220px"
      show-search
      option-filter-prop="label"
    />
        <a-button type="primary" @click="() => undefined">查询</a-button>
        <a-button @click="reset">重置</a-button>
        <span class="spacer"></span>
        <a-button v-if="user.can('project:edit')" type="primary" ghost @click="openCreate">
          <template #icon><PlusOutlined /></template>
          新增项目
        </a-button>
        <a-button v-if="user.can('project:edit')" @click="openImport">
          <template #icon><UploadOutlined /></template>
          Excel 导入
        </a-button>
        <a-button v-if="user.can('project:edit')" @click="exportRows">
          <template #icon><DownloadOutlined /></template>
          导出
        </a-button>
      </div>
      <div class="filter-summary">
        共筛选出 <b>{{ filtered.length }}</b> 个子项目，建设总投资合计
        <b>{{ fmtMoney(filtered.reduce((s, p) => s + p.totalInvestment, 0)) }}</b>，中央专项资金合计
        <b>{{ fmtMoney(filtered.reduce((s, p) => s + p.centralFund, 0)) }}</b>
      </div>
    </a-card>

    <!-- 台账表格：占满剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1620 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a @click="$router.push(`/projects/${record.id}`)">{{ record.name }}</a>
            <div class="sub">{{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'leadDept'">
            <span>{{ record.leadDept }}</span>
            <div class="sub">{{ record.owner }}</div>
          </template>
          <template v-else-if="column.key === 'phase'">
            <a-tag color="blue">{{ record.phase }}</a-tag>
          </template>
          <template v-else-if="column.key === 'progress'">
            <div class="prog">
              <a-progress :percent="record.progress" :stroke-color="record.progressColor" size="small" />
              <div class="prog-tags">
                <a-tag v-for="s in record.tags" :key="s.color" :color="s.color">{{ s.text }}</a-tag>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'fund'">
            <div class="num">{{ toWan(record.totalInvestment) }} 万</div>
            <div class="sub">中央 {{ toWan(record.centralFund) }} 万</div>
          </template>
          <template v-else-if="column.key === 'plan'">
            <div class="num">{{ record.planStart }} ~ {{ record.planAccept }}</div>
            <div class="sub">计划工期 {{ record.planMonths }} 个月</div>
          </template>
          <template v-else-if="column.key === 'risk'">
            <a-tag :color="riskColor(record.riskLevel)">{{ RISK_LABEL[record.riskLevel] }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a @click="$router.push(`/projects/${record.id}`)">详情</a>
              <a @click="$router.push(`/funds/${record.id}`)">资金</a>
              <a v-if="user.can('project:edit')" @click="openEdit(record.entity)">编辑</a>
            </a-space>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的子项目" />
    </a-card>

    <!-- 新增 / 编辑项目（同一个表单复用，演示数据仅改内存） -->
    <a-modal
      v-model:open="formOpen"
      :title="formMode === 'edit' ? `编辑项目 · ${editingId}` : '新增项目'"
      :width="820"
      :ok-text="formMode === 'edit' ? '保存修改' : '提交新增'"
      cancel-text="取消"
      @ok="submitForm"
      @cancel="formOpen = false"
    >
      <a-form ref="formRef" :model="form" :rules="rules" layout="vertical">
        <div class="form-grid">
          <a-form-item label="项目名称" name="name">
            <a-input v-model:value="form.name" placeholder="如：市第一人民医院HIS系统升级改造" />
          </a-form-item>
          <a-form-item label="牵头处室" name="leadDept">
            <a-select v-model:value="form.leadDept" :options="deptFormOptions" style="width: 100%" />
          </a-form-item>
          <a-form-item label="采购人（建设单位）" name="owner">
            <a-select
              v-model:value="form.owner"
              :options="ownerFormOptions"
              style="width: 100%"
              show-search
              option-filter-prop="label"
            />
          </a-form-item>
          <a-form-item label="建设总投资（万元）" name="totalInvestmentWan">
            <a-input-number
              v-model:value="form.totalInvestmentWan"
              :min="0"
              :step="100"
              :precision="2"
              style="width: 100%"
              placeholder="如：5600"
            />
          </a-form-item>
          <a-form-item label="中央专项资金（万元）" name="centralFundWan">
            <a-input-number
              v-model:value="form.centralFundWan"
              :min="0"
              :step="100"
              :precision="2"
              style="width: 100%"
              placeholder="如：2400"
            />
          </a-form-item>
          <div class="date-pair">
            <a-form-item label="计划开工" name="planStart">
              <a-date-picker v-model:value="form.planStart" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
            <a-form-item label="计划验收" name="planAccept">
              <a-date-picker v-model:value="form.planAccept" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </div>
          <a-form-item class="span-2" label="建设内容" name="content">
            <a-textarea
              v-model:value="form.content"
              :rows="3"
              placeholder="如：院内核心业务系统（HIS）架构升级、双活容灾与性能优化，覆盖门诊、住院、药房等模块。"
            />
          </a-form-item>
        </div>
      </a-form>
      <div class="dialog-tip">
        演示环境：
        {{
          formMode === 'edit'
            ? '保存后仅更新当前页面的内存数据，不提交服务端；进入项目详情页看到的仍是原始台账数据。'
            : '提交后新项目将写入当前页面的内存数据，并自动补齐四阶段子任务与中央资金批次，不提交服务端。'
        }}
      </div>
    </a-modal>

    <!-- Excel 导入（演示模式：解析 + 预览，不写库） -->
    <a-modal v-model:open="importOpen" title="Excel 导入项目台账" :width="1080" :footer="null">
      <div class="import-bar">
        <a-upload :before-upload="handleFile" :show-upload-list="false" accept=".xlsx,.xls" :max-count="1">
          <a-button type="primary">
            <template #icon><UploadOutlined /></template>
            选择 Excel 文件
          </a-button>
        </a-upload>
        <a-button @click="downloadTemplate">
          <template #icon><DownloadOutlined /></template>
          下载导入模板
        </a-button>
        <span class="import-file">
          当前文件：{{ importFileName || '未选择（支持 .xlsx / .xls，表头需与导入模板一致）' }}
        </span>
      </div>
      <div class="import-tip">
        演示模式：仅解析并预览上传文件内容，不会写入项目台账；确认导入按钮只做导入结果提示，供流程演示使用。
      </div>
      <a-table
        :columns="importColumns"
        :data-source="importRows"
        row-key="rowNo"
        size="small"
        :pagination="false"
        :scroll="{ x: 1500 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'check'">
            <a-tag :color="record.check === '校验通过' ? 'green' : 'orange'">{{ record.check }}</a-tag>
          </template>
          <template v-else-if="column.key === 'planStart' || column.key === 'planAccept'">
            <span class="num">{{ record[String(column.key)] || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'totalInvestmentWan' || column.key === 'centralFundWan'">
            <span class="num">
              {{ record[String(column.key)] === null ? '—' : record[String(column.key)] }}
            </span>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!importRows.length" description="暂未解析到数据，请先选择 Excel 文件" />
      <div class="import-foot">
        <span class="sub">
          共解析 {{ importRows.length }} 行，其中校验通过 {{ importValidCount }} 行；校验不通过的行需在源文件中修正后重新上传。
        </span>
        <a-space>
          <a-button @click="importOpen = false">关闭</a-button>
          <a-button type="primary" @click="confirmImport">确认导入（演示）</a-button>
        </a-space>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { FormInstance, TableColumnType } from 'ant-design-vue'
import type { RuleObject } from 'ant-design-vue/es/form'
import { message } from 'ant-design-vue'
import * as XLSX from 'xlsx'
import { DownloadOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { DEPARTMENTS, OWNER_ORGS, OWNERS, SUPERVISORS, TASK_TEMPLATES } from '@/mock/seed'
import { INVEST_RANGES, investRangeOf } from '@/utils/stats'
import { PHASE_ORDER, RISK_LABEL } from '@/mock/types'
import type { FundBatch, Phase, PhaseTask, RiskLevel, SubProject, TaskStatus } from '@/mock/types'
import { TODAY, allProjects, projectProgress } from '@/mock'
import { addDays, pad } from '@/mock/utils'
import { fmtMoney, toWan } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
// 路由查询参数：统计看板下钻时带入 phase / dept / risk 初始化筛选
const route = useRoute()

/** 台账数据：页面内一份内存副本，新增 / 编辑只改副本（演示数据，不发请求） */
const list = ref<SubProject[]>([...allProjects()])

const RISK_ORDER: RiskLevel[] = ['low', 'mid', 'high']

/** 阶段筛选初始化：统计看板图表下钻会带 phase / dept / risk 查询参数 */
function initialPhase(): Phase | '' {
  const v = route.query.phase
  return typeof v === 'string' && PHASE_ORDER.includes(v as Phase) ? (v as Phase) : ''
}

function initialDept(): string {
  const v = route.query.dept
  return typeof v === 'string' && DEPARTMENTS.includes(v) ? v : ''
}

function initialRisk(): RiskLevel | '' {
  const v = route.query.risk
  return typeof v === 'string' && RISK_ORDER.includes(v as RiskLevel) ? (v as RiskLevel) : ''
}

/** 从 URL 读取投资规模区间初值（支持统计看板下钻时携带条件） */
function initialInvestRange(): string {
  const v = route.query.investRange
  return typeof v === 'string' && INVEST_RANGES.some((r) => r.key === v) ? v : ''
}

/** 从 URL 读取建设单位初值 */
function initialOwner(): string {
  const v = route.query.owner
  return typeof v === 'string' && OWNER_ORGS.includes(v) ? v : ''
}

const query = reactive({
  keyword: typeof route.query.keyword === 'string' ? route.query.keyword : '',
  phase: initialPhase(),
  dept: initialDept(),
  risk: initialRisk(),
  central: '' as '' | 'yes' | 'no',
  investRange: initialInvestRange(),
  owner: initialOwner(),
})

const phaseOptions = [
  { value: '', label: '全部阶段' },
  { value: '立项', label: '立项阶段' },
  { value: '采购', label: '采购阶段' },
  { value: '建设', label: '建设阶段' },
  { value: '验收', label: '验收阶段' },
]

const deptOptions = [{ value: '', label: '全部牵头处室' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))]

const riskOptions = [
  { value: '', label: '全部风险等级' },
  { value: 'high', label: '高风险' },
  { value: 'mid', label: '中风险' },
  { value: 'low', label: '低风险' },
]

const centralOptions = [
  { value: '', label: '中央资金：全部' },
  { value: 'yes', label: '使用中央专项资金' },
  { value: 'no', label: '未使用中央资金' },
]

/** 投资规模区间（口径与统计看板一致：INVEST_RANGES 四档） */
const investOptions = [
  { value: '', label: '全部投资规模' },
  ...INVEST_RANGES.map((r) => ({ value: r.key, label: r.label })),
]

/** 建设单位（采购人）——取自 seed 的单位字典 */
const ownerOptions = [
  { value: '', label: '全部建设单位' },
  ...OWNER_ORGS.map((o) => ({ value: o, label: o })),
]

const filtered = computed(() =>
  list.value.filter((p) => {
    if (query.keyword && !`${p.name}${p.id}${p.owner}`.includes(query.keyword)) return false
    if (query.phase && p.phase !== query.phase) return false
    if (query.dept && p.leadDept !== query.dept) return false
    if (query.risk && p.riskLevel !== query.risk) return false
    if (query.central === 'yes' && p.centralFund <= 0) return false
    if (query.central === 'no' && p.centralFund > 0) return false
    // 投资规模区间：复用 utils/stats 的分档判定，保证与统计看板口径一致
    if (query.investRange && investRangeOf(p.totalInvestment).key !== query.investRange) return false
    // 建设单位（采购人）
    if (query.owner && p.owner !== query.owner) return false
    return true
  }),
)

function reset() {
  query.keyword = ''
  query.phase = ''
  query.dept = ''
  query.risk = ''
  query.central = ''
  query.investRange = ''
  query.owner = ''
}

/** 表格行：在项目数据上预计算进度与状态小结（避免在模板里做类型断言） */
const rows = computed(() =>
  filtered.value.map((p) => {
    const progress = projectProgress(p)
    return {
      ...p,
      progress,
      progressColor: progressColor(progress),
      tags: taskSummary(p),
      planMonths: planMonthsOf(p.planStart, p.planAccept),
      /** 行内原始项目引用：操作列编辑传参用（表格 slot 中 record 为 Record<string, any>，读取该字段可避免类型不匹配） */
      entity: p,
    }
  }),
)

const columns: TableColumnType[] = [
  { title: '项目名称', key: 'name', width: 300, fixed: 'left' as const },
  { title: '牵头处室 / 采购人', key: 'leadDept', width: 230 },
  { title: '阶段', key: 'phase', width: 90 },
  { title: '整体进度与子任务状态', key: 'progress', width: 300 },
  { title: '建设总投资 / 中央资金', key: 'fund', width: 170 },
  { title: '计划工期', key: 'plan', width: 210 },
  { title: '风险', key: 'risk', width: 90 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
]

/** 台账表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素，取到根 DOM 后交给 useTableScroll 测量 */
function setTableCard(el: unknown) {
  if (!el) {
    tableCardRef.value = null
    return
  }
  if (el instanceof HTMLElement) {
    tableCardRef.value = el
    return
  }
  const root = (el as { $el?: unknown }).$el
  tableCardRef.value = root instanceof HTMLElement ? root : null
}

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个子项目`,
}

/** 子任务状态小结：只显示存在的状态，颜色与需求五色一致 */
function taskSummary(p: SubProject) {
  const stat: Record<string, number> = {}
  for (const t of p.tasks) stat[t.status] = (stat[t.status] ?? 0) + 1
  const map: Array<[string, string, string]> = [
    ['done', 'green', '已完成'],
    ['doing', 'blue', '进行中'],
    ['warn', 'orange', '延期预警'],
    ['overdue', 'red', '严重滞后'],
    ['not-started', 'default', '未开始'],
  ]
  return map
    .filter(([k]) => stat[k])
    .map(([k, color, text]) => ({ color, text: `${text} ${stat[k]}` }))
}

/** 计划工期（月）：按计划开工到计划验收的自然月差估算 */
function planMonthsOf(planStart: string, planAccept: string): number {
  const start = new Date(`${planStart}T00:00:00`).getTime()
  const end = new Date(`${planAccept}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round((end - start) / (1000 * 60 * 60 * 24 * 30))
}

function progressColor(p: number): string {
  if (p >= 80) return '#52c41a'
  if (p >= 40) return '#1677ff'
  return '#faad14'
}

function riskColor(level: RiskLevel): string {
  return level === 'high' ? 'red' : level === 'mid' ? 'orange' : 'green'
}

// ============================================================
// 新增 / 编辑项目（演示：只改内存副本）
// ============================================================

/** 表单字段（金额以万元录入，提交时换算为元） */
interface ProjectForm {
  name: string
  leadDept: string
  owner: string
  totalInvestmentWan?: number
  centralFundWan?: number
  content: string
  planStart: string
  planAccept: string
}

/** 提交时写回项目的字段（金额已换算为元） */
interface ProjectPatch {
  name: string
  leadDept: string
  owner: string
  totalInvestment: number
  centralFund: number
  content: string
  planStart: string
  planAccept: string
}

type FormMode = 'create' | 'edit'

const formOpen = ref(false)
const formMode = ref<FormMode>('create')
const editingId = ref('')
const formRef = ref<FormInstance>()

const deptFormOptions = DEPARTMENTS.map((d) => ({ value: d, label: d }))
const ownerFormOptions = OWNER_ORGS.map((d) => ({ value: d, label: d }))

const form = reactive<ProjectForm>({
  name: '',
  leadDept: DEPARTMENTS[0],
  owner: OWNER_ORGS[0],
  content: '',
  planStart: '',
  planAccept: '',
})

/** 校验：金额必须为正数（万元） */
async function validateAmount(_rule: unknown, value: number | null): Promise<void> {
  if (value === null || value === undefined) return
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) throw new Error('金额必须为大于 0 的数字（单位：万元）')
}

/** 校验：中央专项资金不得超过建设总投资 */
async function validateCentral(_rule: unknown, value: number | null): Promise<void> {
  if (value === null || value === undefined) return
  const total = Number(form.totalInvestmentWan ?? 0)
  if (Number(value) > total) throw new Error('中央专项资金不得超过建设总投资')
}

/** 校验：计划验收不得早于计划开工 */
async function validatePlanAccept(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择计划验收时间')
  if (form.planStart && value < form.planStart) throw new Error('计划验收时间不得早于计划开工时间')
}

/** 表单校验规则（结构与 Ant Design Vue Form rules 一致） */
const rules: Record<string, RuleObject[]> = {
  name: [
    { required: true, message: '请输入项目名称' },
    { min: 4, max: 60, message: '项目名称建议 4 ~ 60 个字符' },
  ],
  leadDept: [{ required: true, message: '请选择牵头处室' }],
  owner: [{ required: true, message: '请选择采购人（建设单位）' }],
  totalInvestmentWan: [
    { required: true, message: '请输入建设总投资' },
    { validator: validateAmount, trigger: 'change' },
  ],
  centralFundWan: [
    { required: true, message: '请输入中央专项资金' },
    { validator: validateCentral, trigger: 'change' },
  ],
  content: [
    { required: true, message: '请输入建设内容' },
    { min: 10, message: '建设内容不少于 10 个字符' },
  ],
  planStart: [{ required: true, message: '请选择计划开工时间' }],
  planAccept: [{ validator: validatePlanAccept, trigger: 'change' }],
}

function openCreate() {
  formMode.value = 'create'
  editingId.value = ''
  form.name = ''
  form.leadDept = DEPARTMENTS[0]
  form.owner = OWNER_ORGS[0]
  form.totalInvestmentWan = undefined
  form.centralFundWan = undefined
  form.content = ''
  form.planStart = addDays(TODAY, 30)
  form.planAccept = addDays(TODAY, 480)
  formOpen.value = true
}

function openEdit(row: SubProject) {
  formMode.value = 'edit'
  editingId.value = row.id
  form.name = row.name
  form.leadDept = row.leadDept
  form.owner = row.owner
  form.totalInvestmentWan = Number(toWan(row.totalInvestment))
  form.centralFundWan = Number(toWan(row.centralFund))
  form.content = row.content
  form.planStart = row.planStart
  form.planAccept = row.planAccept
  formOpen.value = true
}

async function submitForm() {
  const inst = formRef.value
  if (!inst) return
  try {
    await inst.validate()
  } catch {
    message.warning('请先按提示完善表单必填项后再提交')
    return
  }

  const patch: ProjectPatch = {
    name: form.name.trim(),
    leadDept: form.leadDept,
    owner: form.owner,
    totalInvestment: Math.round(Number(form.totalInvestmentWan) * 10000),
    centralFund: Math.round(Number(form.centralFundWan) * 10000),
    content: form.content.trim(),
    planStart: form.planStart,
    planAccept: form.planAccept,
  }
  if (patch.content.length < 10) {
    message.warning('建设内容不少于 10 个字符')
    return
  }

  if (formMode.value === 'edit') {
    const idx = list.value.findIndex((p) => p.id === editingId.value)
    if (idx >= 0) {
      list.value[idx] = { ...list.value[idx], ...patch }
      message.success(`演示数据：已更新「${patch.name}」的项目信息（仅内存生效，未提交服务端）`)
    } else {
      message.warning('未找到待编辑的项目，请刷新页面后重试')
    }
  } else {
    const created = buildProject(patch)
    list.value = [created, ...list.value]
    message.success(`演示数据：已新增「${created.name}」（${created.id}），仅内存生效，未提交服务端`)
  }
  formOpen.value = false
}

/** 新项目编号：沿用 PM-2026-XXX 规则顺延 */
function nextProjectId(): string {
  const maxSeq = Math.max(...allProjects().map((p) => Number(p.id.split('-').pop()) || 0))
  return `PM-2026-${pad(maxSeq + 1, 3)}`
}

/** 新增项目：自动补齐四阶段子任务与中央资金批次，保证与台账口径自洽 */
function buildProject(patch: ProjectPatch): SubProject {
  const names: Array<{ phase: Phase; name: string }> = []
  for (const phase of PHASE_ORDER) {
    for (const name of TASK_TEMPLATES[phase]) names.push({ phase, name })
  }
  const total = names.length
  const tasks: PhaseTask[] = names.map((item, idx) => {
    // 新项目刚完成可研编制，其余节点未开始
    const status: TaskStatus = idx === 0 ? 'doing' : 'not-started'
    return {
      phase: item.phase,
      name: item.name,
      planEnd: addDays(patch.planStart, Math.round(((idx + 1) / total) * 540)),
      actualEnd: null,
      status,
      owner: OWNERS[0],
      attachments: 0,
    }
  })

  // 中央专项资金按预付款 / 进度款 / 验收尾款 3 批切分，合计等于中央专项资金；
  // 其他资金（建设总投资 − 中央专项资金）按地方配套 / 单位自筹各 1 批补齐，保持两条拨付线完整
  const split = [0.3, 0.4, 0.3]
  let sum = 0
  const fundPlan: FundBatch[] = split.map((ratio, i) => {
    const amount =
      i === split.length - 1 ? patch.centralFund - sum : Math.round(patch.centralFund * ratio)
    sum += amount
    return {
      batch: i + 1,
      source: '中央专项' as const,
      planDate: addDays(patch.planStart, 30 + i * 150),
      payDate: null,
      amount,
      used: 0,
    }
  })
  const otherFund = Math.max(0, patch.totalInvestment - patch.centralFund)
  if (otherFund > 0) {
    const localFund = Math.round(otherFund * 0.6)
    fundPlan.push({
      batch: fundPlan.length + 1,
      source: '地方配套',
      planDate: addDays(patch.planStart, 200),
      payDate: null,
      amount: localFund,
      used: 0,
    })
    if (otherFund - localFund > 0) {
      fundPlan.push({
        batch: fundPlan.length + 1,
        source: '单位自筹',
        planDate: addDays(patch.planStart, 260),
        payDate: null,
        amount: otherFund - localFund,
        used: 0,
      })
    }
  }

  return {
    id: nextProjectId(),
    name: patch.name,
    leadDept: patch.leadDept,
    owner: patch.owner,
    totalInvestment: patch.totalInvestment,
    centralFund: patch.centralFund,
    content: patch.content,
    planStart: patch.planStart,
    planAccept: patch.planAccept,
    phase: PHASE_ORDER[0],
    riskLevel: 'low',
    tasks,
    fundPlan,
    changes: [],
    docCount: 0,
    supervisor: SUPERVISORS[0],
  }
}

// ============================================================
// Excel 导入（演示模式：解析 + 预览，不写库）
// ============================================================

/** 导入模板表头（与解析取值一致） */
const IMPORT_HEADERS = [
  '项目名称',
  '牵头处室',
  '采购人',
  '建设总投资（万元）',
  '中央专项资金（万元）',
  '建设内容',
  '计划开工',
  '计划验收',
]

/** 解析后的预览行 */
interface ImportRow {
  rowNo: number
  name: string
  leadDept: string
  owner: string
  totalInvestmentWan: number | null
  centralFundWan: number | null
  planStart: string
  planAccept: string
  check: string
}

const importOpen = ref(false)
const importFileName = ref('')
const importRows = ref<ImportRow[]>([])

const importValidCount = computed(() => importRows.value.filter((r) => r.check === '校验通过').length)

const importColumns: TableColumnType[] = [
  { title: '行号', key: 'rowNo', width: 80, align: 'right' },
  { title: '项目名称', key: 'name', width: 280 },
  { title: '牵头处室', key: 'leadDept', width: 170 },
  { title: '采购人 / 建设单位', key: 'owner', width: 200 },
  { title: '建设总投资（万元）', key: 'totalInvestmentWan', width: 180, align: 'right' },
  { title: '中央专项资金（万元）', key: 'centralFundWan', width: 190, align: 'right' },
  { title: '计划开工', key: 'planStart', width: 130 },
  { title: '计划验收', key: 'planAccept', width: 130 },
  { title: '校验结果', key: 'check', width: 260 },
]

function openImport() {
  importRows.value = []
  importFileName.value = ''
  importOpen.value = true
}

/** 下载导入模板（表头 + 一行样例数据，便于业务人员照填） */
function downloadTemplate() {
  exportExcel('项目台账导入模板', [
    {
      name: '项目台账导入模板',
      header: IMPORT_HEADERS,
      rows: [
        [
          '市第一人民医院HIS系统升级改造',
          '规划发展与信息化处',
          '市第一人民医院',
          3300,
          1400,
          '院内核心业务系统（HIS）架构升级、双活容灾与性能优化，覆盖门诊、住院、药房等模块。',
          '2026-11-01',
          '2028-06-30',
        ],
      ],
      colWidth: [40, 22, 24, 20, 22, 60, 14, 14],
    },
  ])
  message.success('导入模板已下载，按模板表头填写后即可上传解析')
}

/** 读取单元格：表头允许带单位后缀，取值时前缀匹配 */
function cellOf(row: Record<string, unknown>, key: string): string {
  const hit = Object.keys(row).find((k) => k.replace(/\s/g, '').startsWith(key))
  const value = hit ? row[hit] : ''
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function numOf(text: string): number | null {
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : null
}

/** 单行解析 + 行级校验（只提示问题，不在演示环境写库） */
function toImportRow(row: Record<string, unknown>, rowNo: number): ImportRow {
  const name = cellOf(row, '项目名称')
  const leadDept = cellOf(row, '牵头处室')
  const owner = cellOf(row, '采购人')
  const total = numOf(cellOf(row, '建设总投资'))
  const central = numOf(cellOf(row, '中央专项资金'))
  const planStart = cellOf(row, '计划开工')
  const planAccept = cellOf(row, '计划验收')

  let check = '校验通过'
  if (!name) check = '缺少项目名称，需补充后重新上传'
  else if (!leadDept) check = '缺少牵头处室，需补充后重新上传'
  else if (total === null || central === null) check = '金额为空或非数字，需修改为数值'
  else if (central > total) check = '中央专项资金超过建设总投资，需复核'
  else if (planStart && planAccept && planAccept < planStart) check = '计划验收早于计划开工，需复核'
  else if (!planStart || !planAccept) check = '计划开工 / 计划验收为空，需补充'

  return { rowNo, name, leadDept, owner, totalInvestmentWan: total, centralFundWan: central, planStart, planAccept, check }
}

/** 选择文件：用 xlsx 解析为预览数据，返回 false 阻止真实上传 */
async function handleFile(file: File): Promise<boolean> {
  importFileName.value = file.name
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const first = wb.SheetNames[0]
    const sheet = first ? wb.Sheets[first] : undefined
    if (!sheet) throw new Error('未读取到工作表')
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    importRows.value = raw.map((r, i) => toImportRow(r, i + 2))
    message.success(`已解析「${file.name}」：共 ${importRows.value.length} 行（演示模式，仅预览不写入台账）`)
  } catch {
    importRows.value = []
    message.error('Excel 解析失败：请确认文件为 .xlsx / .xls 格式，且表头与导入模板一致')
  }
  return false
}

function confirmImport() {
  if (!importRows.value.length) {
    message.warning('请先选择 Excel 文件并完成解析')
    return
  }
  message.info(
    `演示模式：本次解析 ${importRows.value.length} 行（校验通过 ${importValidCount.value} 行），正式环境将写入项目台账`,
  )
  importOpen.value = false
}

// ============================================================
// 导出当前筛选结果
// ============================================================

function exportRows() {
  if (!filtered.value.length) {
    message.warning('当前筛选条件下没有可导出的项目')
    return
  }
  exportExcel(`项目台账-${TODAY}`, [
    {
      name: '项目台账',
      header: [
        '项目编号',
        '项目名称',
        '牵头处室',
        '采购人 / 建设单位',
        '建设总投资（万元）',
        '中央专项资金（万元）',
        '所处阶段',
        '风险等级',
        '整体进度（%）',
        '计划开工',
        '计划验收',
        '建设内容',
      ],
      rows: filtered.value.map((p) => [
        p.id,
        p.name,
        p.leadDept,
        p.owner,
        Number(toWan(p.totalInvestment)),
        Number(toWan(p.centralFund)),
        p.phase,
        `${RISK_LABEL[p.riskLevel]}风险`,
        projectProgress(p),
        p.planStart,
        p.planAccept,
        p.content,
      ]),
      colWidth: [18, 40, 22, 24, 20, 22, 12, 12, 14, 14, 14, 60],
    },
  ])
  message.success(`已导出当前筛选结果，共 ${filtered.value.length} 个子项目`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 台账卡片：占满筛选卡片以下的剩余高度，表格在卡片内部滚动
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;

  :deep(.ant-card-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.filter {
  flex: none;
  margin-bottom: 12px;
  padding: 16px 16px 8px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  .spacer {
    flex: 1;
  }
}

.filter-summary {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed @border-color;
  font-size: 13px;
  color: @text-2;

  b {
    color: @primary;
  }
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;
}

.prog-tags {
  margin-top: 2px;

  :deep(.ant-tag) {
    margin-bottom: 2px;
    font-size: 11px;
    line-height: 16px;
  }
}

// ------- 新增 / 编辑表单 -------
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;

  .span-2 {
    grid-column: span 2;
  }

  .date-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 16px;
  }
}

.dialog-tip {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px dashed @border-color;
  font-size: 12px;
  line-height: 1.7;
  color: @text-3;
}

// ------- Excel 导入 -------
.import-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;

  .import-file {
    font-size: 13px;
    color: @text-3;
  }
}

.import-tip {
  margin-bottom: 10px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: @primary;
  background: @primary-bg;
  border: 1px solid @primary-border;
  border-radius: @radius-sm;
}

.import-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}
</style>
