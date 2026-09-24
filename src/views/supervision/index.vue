<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="监理台账"
      desc="监理周报 / 监理月报 / 专题报告 / 监理通知单 / 整改回执全流程留痕，通知单支持整改跟踪、回执查阅与闭环销号"
      tag="模块 6"
    >
      <a-button v-if="user.can('supervision:edit')" type="primary" @click="openNoticeForm">
        <template #icon><PlusOutlined /></template>
        登记通知单
      </a-button>
      <a-button v-if="user.can('report:export')" @click="exportLedger">
        <template #icon><DownloadOutlined /></template>
        导出监理台账
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 分类标签页 + 检索 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-input v-model:value="keyword" placeholder="搜索标题 / 项目名称 / 编号" allow-clear style="width: 300px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <span class="spacer"></span>
        <span class="hint">
          当前分类 <b>{{ activeType }}</b> 共 <b>{{ rows.length }}</b> 条记录
        </span>
      </div>
      <ATabs v-model:activeKey="activeType" class="type-tabs">
        <ATabPane v-for="t in TYPE_TABS" :key="t.key" :tab="t.label" />
      </ATabs>
    </a-card>

    <!-- 台账表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1360 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'project'">
            <div>{{ projectNameMap.get(record.projectId) }}</div>
            <div class="sub">{{ record.projectId }}</div>
          </template>
          <template v-else-if="column.key === 'title'">
            <span>{{ record.title }}</span>
          </template>
          <template v-else-if="column.key === 'rectification'">
            <a-tag v-if="record.rectification" :color="rectColor(record.rectification)">{{ record.rectification }}</a-tag>
            <span v-else class="sub">—</span>
          </template>
          <template v-else-if="column.key === 'deadline'">
            <span v-if="record.deadline" class="num" :class="{ overdue: record.overdue }">
              {{ record.deadline }}
            </span>
            <span v-else class="sub">—</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space v-if="record.type === '监理通知单'">
              <a @click="openReceipt(record.entity)">查看整改回执</a>
              <a v-if="user.can('supervision:edit') && record.rectification !== '已闭环'" @click="openReceiptForm(record.entity)">上传整改回执</a>
              <a v-if="user.can('supervision:edit') && record.rectification !== '已闭环'" @click="closeNotice(record.entity)">闭环销号</a>
              <span v-if="record.rectification === '已闭环'" class="sub">已闭环</span>
              <span v-else-if="!user.can('supervision:edit')" class="sub">—</span>
            </a-space>
            <span v-else class="sub">—</span>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 整改回执弹窗 -->
    <AModal v-model:open="receiptOpen" title="整改回执" :footer="null" :width="720">
      <div v-if="currentNotice" class="receipt">
        <ADescriptions :column="2" size="small" bordered>
          <ADescriptionsItem label="通知单编号">{{ currentNotice.id }}</ADescriptionsItem>
          <ADescriptionsItem label="整改状态">
            <a-tag :color="rectColor(currentNotice.rectification ?? '待整改')">
              {{ currentNotice.rectification ?? '待整改' }}
            </a-tag>
          </ADescriptionsItem>
          <ADescriptionsItem label="所属项目" :span="2">
            {{ projectNameMap.get(currentNotice.projectId) }}（{{ currentNotice.projectId }}）
          </ADescriptionsItem>
          <ADescriptionsItem label="通知单标题" :span="2">{{ currentNotice.title }}</ADescriptionsItem>
          <ADescriptionsItem label="签发日期">{{ currentNotice.date }}</ADescriptionsItem>
          <ADescriptionsItem label="整改期限">{{ currentNotice.deadline ?? '—' }}</ADescriptionsItem>
          <ADescriptionsItem label="签发人">{{ currentNotice.author }}</ADescriptionsItem>
          <ADescriptionsItem label="监理单位">{{ supervisorOf(currentNotice.projectId) }}</ADescriptionsItem>
        </ADescriptions>

        <div class="sec-title">整改要求</div>
        <div v-if="currentNotice.requirement" class="receipt-note">{{ currentNotice.requirement }}</div>
        <ol v-else class="sec-list">
          <li>施工单位针对通知单反映的问题编制整改方案，于整改期限内完成整改并书面回复。</li>
          <li>整改期间做好过程记录，形成整改前后对比照片、隐蔽工程验收记录等过程资料。</li>
          <li>整改完成后报监理工程师复查，复查合格后办理闭环手续并归档整改回执。</li>
        </ol>

        <template v-if="currentNotice.rectification === '已闭环'">
          <div class="sec-title">整改回执</div>
          <ADescriptions :column="2" size="small" bordered>
            <ADescriptionsItem label="回执编号">{{ receiptId(currentNotice) }}</ADescriptionsItem>
            <ADescriptionsItem label="回执日期">{{ receiptDateOf(currentNotice) }}</ADescriptionsItem>
            <ADescriptionsItem label="回执标题" :span="2">{{ receiptTitle(currentNotice) }}</ADescriptionsItem>
            <ADescriptionsItem label="提交单位">{{ ownerOf(currentNotice.projectId) }}</ADescriptionsItem>
            <ADescriptionsItem label="受理人">{{ currentNotice.author }}</ADescriptionsItem>
            <ADescriptionsItem v-if="currentNotice.receiptInfo" label="整改结果" :span="2">
              {{ currentNotice.receiptInfo.result }}
            </ADescriptionsItem>
          </ADescriptions>
          <template v-if="currentNotice.receiptInfo">
            <div class="sec-title">回执说明</div>
            <div class="receipt-note">{{ currentNotice.receiptInfo.note }}</div>
          </template>
          <template v-else>
            <ol class="sec-list">
              <li>施工单位已按要求完成整改，整改内容与通知单逐项对应，无遗留问题。</li>
              <li>整改资料（方案、记录、影像资料）已同步报监理机构审核，资料齐全可追溯。</li>
              <li>监理工程师复查确认整改结果符合设计与规范要求，同意本通知单闭环。</li>
            </ol>
          </template>
        </template>
        <div v-else class="pending-tip">
          该通知单当前状态为「{{ currentNotice.rectification ?? '待整改' }}」，整改回执尚未回传；施工单位整改完成后，回执将在此处展示并支持闭环销号。
        </div>
      </div>
    </AModal>
    <!-- 上传整改回执（待整改 / 整改中 → 已闭环） -->
    <AModal
      v-model:open="receiptFormOpen"
      title="上传整改回执"
      ok-text="提交回执并闭环"
      cancel-text="取消"
      :width="700"
      @ok="submitReceiptForm"
    >
      <div v-if="currentNotice" class="receipt">
        <ADescriptions :column="2" size="small" bordered>
          <ADescriptionsItem label="通知单编号">{{ currentNotice.id }}</ADescriptionsItem>
          <ADescriptionsItem label="整改状态">
            <a-tag :color="rectColor(currentNotice.rectification ?? '待整改')">
              {{ currentNotice.rectification ?? '待整改' }}
            </a-tag>
          </ADescriptionsItem>
          <ADescriptionsItem label="所属项目" :span="2">
            {{ projectNameMap.get(currentNotice.projectId) }}（{{ currentNotice.projectId }}）
          </ADescriptionsItem>
          <ADescriptionsItem label="通知单标题" :span="2">{{ currentNotice.title }}</ADescriptionsItem>
          <ADescriptionsItem label="签发日期">{{ currentNotice.date }}</ADescriptionsItem>
          <ADescriptionsItem label="整改期限">{{ currentNotice.deadline ?? '—' }}</ADescriptionsItem>
        </ADescriptions>
        <AForm ref="receiptFormRef" :model="receiptForm" :rules="receiptRules" layout="vertical" class="form-block">
          <AFormItem label="回执日期" name="date">
            <a-date-picker
              v-model:value="receiptForm.date"
              value-format="YYYY-MM-DD"
              :disabled-date="disableFutureDate"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem label="整改结果" name="result">
            <ARadioGroup v-model:value="receiptForm.result">
              <ARadioButton value="整改合格，复查通过">整改合格，复查通过</ARadioButton>
              <ARadioButton value="整改基本合格，复查通过">整改基本合格，复查通过</ARadioButton>
            </ARadioGroup>
          </AFormItem>
          <AFormItem label="回执说明" name="note">
            <ATextarea
              v-model:value="receiptForm.note"
              :rows="3"
              placeholder="如：施工单位已按通知单要求完成整改并附整改前后影像资料，监理工程师复查确认整改到位"
            />
          </AFormItem>
        </AForm>
        <div class="dialog-tip">
          演示环境：提交后本条通知单的整改状态推进为「已闭环」，回执内容归档到通知单详情并新增一条「整改回执」台账记录；演示数据仅内存生效，未提交服务端。
        </div>
      </div>
    </AModal>

    <!-- 登记通知单 -->
    <AModal
      v-model:open="noticeFormOpen"
      title="登记监理通知单"
      ok-text="提交登记"
      cancel-text="取消"
      :width="760"
      @ok="submitNoticeForm"
    >
      <AForm ref="noticeFormRef" :model="noticeForm" :rules="noticeRules" layout="vertical">
        <div class="form-grid">
          <AFormItem label="所属项目" name="projectId">
            <a-select
              v-model:value="noticeForm.projectId"
              :options="projectFormOptions"
              show-search
              option-filter-prop="label"
              placeholder="请选择通知单所属项目"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem label="签发日期" name="date">
            <a-date-picker
              v-model:value="noticeForm.date"
              value-format="YYYY-MM-DD"
              :disabled-date="disableFutureDate"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem class="span-2" label="通知单标题" name="title">
            <a-input v-model:value="noticeForm.title" placeholder="如：关于机房桥架线缆敷设不规范的监理通知单" />
          </AFormItem>
          <AFormItem label="整改期限" name="deadline">
            <a-date-picker v-model:value="noticeForm.deadline" value-format="YYYY-MM-DD" style="width: 100%" />
          </AFormItem>
          <AFormItem label="签发人">
            <a-input :value="user.name" disabled />
          </AFormItem>
        </div>
        <AFormItem label="整改要求正文" name="requirement">
          <ATextarea
            v-model:value="noticeForm.requirement"
            :rows="4"
            placeholder="如：一、对桥架内线缆重新绑扎固定并补齐标识；二、补充隐蔽工程验收记录；三、于整改期限内书面回复整改结果。"
          />
        </AFormItem>
      </AForm>
      <div class="dialog-tip">
        演示环境：登记后通知单插入台账顶部（状态「待整改」），可在行内上传整改回执推进闭环；演示数据仅内存生效，未提交服务端，刷新页面恢复初始演示数据。
      </div>
    </AModal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Form as AForm,
  FormItem as AFormItem,
  Modal as AModal,
  RadioButton as ARadioButton,
  RadioGroup as ARadioGroup,
  TabPane as ATabPane,
  Tabs as ATabs,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue'
import type { FormInstance, TableColumnType } from 'ant-design-vue'
import type { RuleObject } from 'ant-design-vue/es/form'
import type { Dayjs } from 'dayjs'
import { DownloadOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { TODAY, allProjects, allSupervisionRecords } from '@/mock'
import type { SupervisionRecord } from '@/mock/types'
import { addDays, pad } from '@/mock/utils'
import { useUserStore } from '@/stores/user'
import { exportExcel } from '@/utils/export'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
const projects = allProjects()

/** 项目编号 → 项目名称 / 采购人 / 监理单位 */
const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))
const projectOwnerMap = new Map(projects.map((p) => [p.id, p.owner]))
const projectSupervisorMap = new Map(projects.map((p) => [p.id, p.supervisor]))

/** 台账记录行（本页内存副本：登记通知单 / 上传整改回执只改副本，刷新页面回到初始演示数据） */
interface LedgerRow extends SupervisionRecord {
  /** 本页登记通知单时填写的整改要求正文（仅内存） */
  requirement?: string
  /** 本页上传的整改回执信息（回执日期 / 整改结果 / 回执说明，仅内存） */
  receiptInfo?: { date: string; result: string; note: string }
}

/** 台账记录（本地可变：登记通知单 / 上传回执 / 闭环销号直接更新内存副本） */
const records = reactive<LedgerRow[]>(allSupervisionRecords().map((r) => ({ ...r })))

/** 分类标签页 */
const TYPE_TABS: Array<{ key: string; label: string }> = [
  { key: '全部', label: '全部记录' },
  { key: '监理周报', label: '监理周报' },
  { key: '监理月报', label: '监理月报' },
  { key: '专题报告', label: '专题报告' },
  { key: '监理通知单', label: '监理通知单' },
  { key: '整改回执', label: '整改回执' },
]
const activeType = ref<string | number>('全部')
const keyword = ref('')

/**
 * 表格行数据：在原记录上预计算派生字段。
 * 表格 slot 中的 record 类型为 Record<string, any>，预计算后模板可直接读取具体字段（record.overdue / record.entity），
 * 避免把整个 record 传给需要具体类型参数的函数而产生类型不匹配。
 */
const rows = computed(() =>
  records
    .filter((r) => {
      if (activeType.value !== '全部' && r.type !== activeType.value) return false
      if (keyword.value) {
        const text = `${r.title}${r.id}${r.author}${projectNameMap.get(r.projectId) ?? ''}`
        if (!text.includes(keyword.value)) return false
      }
      return true
    })
    .map((r) => ({
      ...r,
      /** 是否已超整改期限：模板直接读取，无需在模板中调用 isOverdue */
      overdue: isOverdue(r),
      /** 行内原始记录引用：操作列传参用，保证闭环销号仍作用于响应式原始记录 */
      entity: r,
    })),
)

/** 各类型数量 */
const typeCount = computed(() => {
  const map: Record<string, number> = {}
  for (const r of records) map[r.type] = (map[r.type] ?? 0) + 1
  return map
})

/** 通知单整改情况：待整改 / 整改中 / 已闭环 */
const noticeStat = computed(() => {
  const notices = records.filter((r) => r.type === '监理通知单')
  const closed = notices.filter((r) => r.rectification === '已闭环').length
  return {
    total: notices.length,
    pending: notices.filter((r) => r.rectification === '待整改').length,
    doing: notices.filter((r) => r.rectification === '整改中').length,
    closed,
    closeRate: notices.length ? (closed / notices.length) * 100 : 0,
  }
})

const statCards = computed(() => [
  {
    label: '台账记录总数',
    value: String(records.length),
    unit: '条',
    sub: `覆盖 ${new Set(records.map((r) => r.projectId)).size} 个子项目`,
    accent: '#1a5fd0',
  },
  {
    label: '监理周报',
    value: String(typeCount.value['监理周报'] ?? 0),
    unit: '份',
    sub: '在建项目每周五出具并归档',
    accent: '#1677ff',
  },
  {
    label: '监理月报',
    value: String(typeCount.value['监理月报'] ?? 0),
    unit: '份',
    sub: '在建项目按自然月出具',
    accent: '#1677ff',
  },
  {
    label: '专题报告',
    value: String(typeCount.value['专题报告'] ?? 0),
    unit: '份',
    sub: '进度 / 质量 / 安全专题事项',
    accent: '#722ed1',
  },
  {
    label: '监理通知单',
    value: String(noticeStat.value.total),
    unit: '张',
    sub: `待整改 ${noticeStat.value.pending} 张 · 整改中 ${noticeStat.value.doing} 张`,
    accent: '#faad14',
  },
  {
    label: '整改回执',
    value: String(typeCount.value['整改回执'] ?? 0),
    unit: '份',
    sub: '与已闭环通知单逐项对应',
    accent: '#52c41a',
  },
  {
    label: '待整改通知单',
    value: String(noticeStat.value.pending),
    unit: '张',
    sub: '需施工单位在整改期限内完成整改',
    accent: '#ff4d4f',
  },
  {
    label: '通知单闭环率',
    value: noticeStat.value.closeRate.toFixed(1),
    unit: '%',
    sub: `已闭环 ${noticeStat.value.closed} 张 ÷ 通知单总数`,
    accent: '#52c41a',
  },
])

/** 通知单分类下额外展示整改状态、整改期限与操作列 */
const columns = computed<TableColumnType<SupervisionRecord>[]>(() => {
  const cols: TableColumnType<SupervisionRecord>[] = [
    { title: '编号', dataIndex: 'id', key: 'id', width: 96 },
    { title: '所属项目', key: 'project', width: 250 },
    { title: '标题', key: 'title' },
    { title: '日期', dataIndex: 'date', key: 'date', width: 116 },
    { title: '作者', dataIndex: 'author', key: 'author', width: 216 },
  ]
  if (activeType.value === '全部' || activeType.value === '监理通知单') {
    cols.push({ title: '整改状态', key: 'rectification', width: 108 })
    cols.push({ title: '整改期限', key: 'deadline', width: 118 })
    cols.push({ title: '操作', key: 'action', width: 268, fixed: 'right' as const })
  }
  return cols
})

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条记录`,
}

/** 表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
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

/**
 * 分类页签切换后重新测量表体高度：各分类的表格列结构不同（通知单页签多出整改状态 / 整改期限 / 操作列），
 * 表头与分页高度可能随之变化；useTableScroll 以 window resize 作为重测通道，这里等 DOM 更新完成后触发一次。
 */
watch(activeType, async () => {
  await nextTick()
  window.dispatchEvent(new Event('resize'))
})

function rectColor(status: string): string {
  if (status === '已闭环') return 'green'
  if (status === '整改中') return 'blue'
  return 'orange'
}

/** 待整改且已过整改期限 → 期限标红 */
function isOverdue(r: SupervisionRecord): boolean {
  return !!r.deadline && r.deadline < TODAY && r.rectification !== '已闭环'
}

function supervisorOf(projectId: string): string {
  return projectSupervisorMap.get(projectId) ?? '—'
}

function ownerOf(projectId: string): string {
  return projectOwnerMap.get(projectId) ?? '—'
}

// ---------------- 整改回执与闭环销号 ----------------
const receiptOpen = ref(false)
const currentNotice = ref<LedgerRow | null>(null)

function openReceipt(record: LedgerRow) {
  currentNotice.value = record
  receiptOpen.value = true
}

/** 由通知单编号派生回执编号（同一事项的回执与通知单编号呼应） */
function receiptId(n: SupervisionRecord): string {
  return n.id.replace('SUP-', 'SUP-R')
}

/** 由通知单标题派生回执标题：关于xx的监理通知单 → 关于xx问题的整改回执 */
function receiptTitle(n: SupervisionRecord): string {
  return n.title.replace('的监理通知单', '问题的整改回执')
}

/** 回执日期：本页上传的以回执登记日期为准，历史演示数据取通知单签发后 12 天（不晚于基准日） */
function receiptDateOf(n: LedgerRow): string {
  if (n.receiptInfo) return n.receiptInfo.date
  const d = new Date(`${n.date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 12)
  const iso = d.toISOString().slice(0, 10)
  return iso > TODAY ? TODAY : iso
}

/** 日期选择器：禁用晚于演示基准日的日期（签发日期 / 回执日期等「已发生」日期不得晚于 TODAY） */
function disableFutureDate(date: Dayjs): boolean {
  return date.format('YYYY-MM-DD') > TODAY
}

/** 校验：签发日期不得晚于演示基准日 */
async function validateNoticeDate(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择签发日期')
  if (value > TODAY) throw new Error(`签发日期不得晚于演示基准日 ${TODAY}`)
}

/** 校验：整改期限属计划类日期，可晚于基准日，但不得早于签发日期 */
async function validateNoticeDeadline(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择整改期限')
  if (noticeForm.date && value < noticeForm.date) throw new Error('整改期限不得早于签发日期')
}

/** 校验：回执日期不得晚于演示基准日 */
async function validateReceiptDate(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择回执日期')
  if (value > TODAY) throw new Error(`回执日期不得晚于演示基准日 ${TODAY}`)
}

function closeNotice(record: LedgerRow) {
  record.rectification = '已闭环'
  message.success(`${record.title}已完成闭环销号，整改状态更新为「已闭环」，整改回执同步归档`)
}

// ---------------- 登记监理通知单 ----------------
interface NoticeForm {
  projectId: string
  title: string
  date: string
  deadline: string
  requirement: string
}

const noticeFormOpen = ref(false)
const noticeFormRef = ref<FormInstance>()
const noticeForm = reactive<NoticeForm>({
  projectId: projects[0]?.id ?? '',
  title: '',
  date: TODAY,
  deadline: addDays(TODAY, 20),
  requirement: '',
})

const projectFormOptions = projects.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` }))

/** 表单校验规则（结构与 Ant Design Vue Form rules 一致） */
const noticeRules: Record<string, RuleObject[]> = {
  projectId: [{ required: true, message: '请选择通知单所属项目' }],
  title: [
    { required: true, message: '请填写通知单标题' },
    { min: 8, message: '通知单标题不少于 8 个字符' },
  ],
  date: [{ validator: validateNoticeDate, trigger: 'change' }],
  deadline: [{ validator: validateNoticeDeadline, trigger: 'change' }],
  requirement: [
    { required: true, message: '请填写整改要求正文' },
    { min: 10, message: '整改要求不少于 10 个字符' },
  ],
}

/** 下一个通知单编号：沿用 mock 的 SUP-xxx 规则，取台账现有通知单编号最大值 + 1 */
function nextNoticeId(): string {
  const max = records.reduce((m, r) => {
    if (r.type !== '监理通知单') return m
    const n = Number(r.id.replace('SUP-', ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `SUP-${pad(max + 1, 3)}`
}

function openNoticeForm() {
  noticeForm.projectId = projects[0]?.id ?? ''
  noticeForm.title = ''
  noticeForm.date = TODAY
  noticeForm.deadline = addDays(TODAY, 20)
  noticeForm.requirement = ''
  noticeFormOpen.value = true
}

/** 提交登记：通知单插入台账顶部、状态默认待整改（仅内存），并切到「监理通知单」页签展示 */
async function submitNoticeForm() {
  const inst = noticeFormRef.value
  if (!inst) return
  try {
    await inst.validate()
  } catch {
    message.warning('请先按提示完善表单必填项后再提交')
    return
  }

  const id = nextNoticeId()
  records.unshift({
    id,
    projectId: noticeForm.projectId,
    type: '监理通知单',
    title: noticeForm.title.trim(),
    date: noticeForm.date,
    author: user.name,
    rectification: '待整改',
    deadline: noticeForm.deadline,
    requirement: noticeForm.requirement.trim(),
  })
  noticeFormOpen.value = false
  /** 切到通知单页签，保证新登记的通知单在台账中直接可见 */
  activeType.value = '监理通知单'
  const project = projects.find((p) => p.id === noticeForm.projectId)
  message.success(
    `${id} 监理通知单已登记（${project?.name ?? noticeForm.projectId}），整改期限 ${noticeForm.deadline}，状态「待整改」；演示数据：仅内存生效，未提交服务端`,
  )
}

// ---------------- 上传整改回执 ----------------
interface ReceiptForm {
  date: string
  result: string
  note: string
}

const receiptFormOpen = ref(false)
const receiptFormRef = ref<FormInstance>()
const receiptForm = reactive<ReceiptForm>({
  date: TODAY,
  result: '整改合格，复查通过',
  note: '',
})

/** 表单校验规则（与登记表单同一套写法） */
const receiptRules: Record<string, RuleObject[]> = {
  date: [{ validator: validateReceiptDate, trigger: 'change' }],
  result: [{ required: true, message: '请选择整改结果' }],
  note: [
    { required: true, message: '请填写回执说明' },
    { min: 10, message: '回执说明不少于 10 个字符' },
  ],
}

function openReceiptForm(record: LedgerRow) {
  currentNotice.value = record
  receiptForm.date = TODAY
  receiptForm.result = '整改合格，复查通过'
  receiptForm.note = ''
  receiptFormOpen.value = true
}

/**
 * 提交回执：
 *   1. 通知单状态由「待整改 / 整改中」推进为「已闭环」，回执信息归档到通知单；
 *   2. 同步新增一条「整改回执」台账记录（编号与通知单呼应），与演示数据口径一致；
 *   3. 顶部统计（含闭环率）随 records 变化自动刷新。
 */
async function submitReceiptForm() {
  const inst = receiptFormRef.value
  const notice = currentNotice.value
  if (!inst || !notice) return
  try {
    await inst.validate()
  } catch {
    message.warning('请先按提示完善表单必填项后再提交')
    return
  }

  const prev = notice.rectification ?? '待整改'
  notice.rectification = '已闭环'
  notice.receiptInfo = {
    date: receiptForm.date,
    result: receiptForm.result,
    note: receiptForm.note.trim(),
  }
  receiptFormOpen.value = false

  const receiptRecordId = `SUP-R${notice.id.replace('SUP-', '')}`
  if (!records.some((r) => r.id === receiptRecordId)) {
    records.unshift({
      id: receiptRecordId,
      projectId: notice.projectId,
      type: '整改回执',
      title: receiptTitle(notice),
      date: receiptForm.date,
      author: notice.author,
    })
  }

  message.success(
    `${notice.title}整改回执已上传（回执日期 ${receiptForm.date}·${receiptForm.result}），整改状态由「${prev}」推进为「已闭环」，整改回执台账已同步；演示数据：仅内存生效，未提交服务端`,
  )
}

/** 导出当前分类的监理台账（Excel 双工作表：台账明细 + 通知单整改情况） */
function exportLedger() {
  exportExcel('监理台账', [
    {
      name: '台账明细',
      header: ['编号', '所属项目', '项目编号', '记录类型', '标题', '日期', '作者', '整改状态', '整改期限'],
      rows: rows.value.map((r) => [
        r.id,
        projectNameMap.get(r.projectId) ?? '',
        r.projectId,
        r.type,
        r.title,
        r.date,
        r.author,
        r.rectification ?? '',
        r.deadline ?? '',
      ]),
      colWidth: [10, 32, 16, 12, 50, 12, 26, 10, 12],
    },
    {
      name: '通知单整改情况',
      header: ['编号', '所属项目', '标题', '签发日期', '整改期限', '整改状态', '是否超期'],
      rows: records
        .filter((r) => r.type === '监理通知单')
        .map((r) => [
          r.id,
          projectNameMap.get(r.projectId) ?? '',
          r.title,
          r.date,
          r.deadline ?? '',
          r.rectification ?? '',
          isOverdue(r) ? '超期未闭环' : '正常',
        ]),
      colWidth: [10, 32, 50, 12, 12, 10, 12],
    },
  ])
  message.success(`已导出 ${rows.value.length} 条监理台账记录`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头 / 统计卡片行 / 筛选卡片：高度按内容固定，剩余高度全部留给台账表格
.page-head {
  flex: none;
}

.stat-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

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
  padding: 14px 16px 0;

  .filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .hint {
    font-size: 13px;
    color: @text-3;

    b {
      color: @primary;
    }
  }
}

.type-tabs {
  margin-top: 6px;

  :deep(.ant-tabs-nav) {
    margin-bottom: 0;
  }
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;

  &.overdue {
    color: @status-overdue;
    font-weight: 600;
  }
}

.receipt {
  .sec-title {
    margin: 14px 0 8px;
    padding-left: 8px;
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
    border-left: 3px solid @primary;
  }

  .sec-list {
    margin: 0;
    padding-left: 22px;
    font-size: 13px;
    line-height: 24px;
    color: @text-2;
  }

  .receipt-note {
    padding: 10px 12px;
    font-size: 13px;
    line-height: 22px;
    white-space: pre-wrap;
    color: @text-2;
    background: @bg-page;
    border-radius: @radius-sm;
  }

  .pending-tip {
    margin-top: 14px;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 22px;
    color: @text-2;
    background: @primary-bg;
    border: 1px solid @primary-border;
    border-radius: @radius-sm;
  }
}

// ------- 登记通知单 / 上传整改回执表单 -------
.form-block {
  margin-top: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;

  .span-2 {
    grid-column: span 2;
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
</style>
