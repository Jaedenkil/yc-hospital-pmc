<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="问题台账"
      desc="质量 / 进度 / 投资 / 安全四类问题的发现、整改与销号全过程记录，支持按等级与状态跟踪督办"
      tag="模块 6"
    >
      <a-button v-if="user.can('supervision:edit')" type="primary" @click="openIssueForm">
        <template #icon><PlusOutlined /></template>
        登记问题
      </a-button>
      <a-button v-if="user.can('report:export')" @click="exportIssues">
        <template #icon><DownloadOutlined /></template>
        导出问题台账
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 分类标签 + 筛选 -->
    <a-card :bordered="false" class="pmc-card filter">
      <ATabs v-model:activeKey="activeCategory">
        <ATabPane v-for="c in CATEGORY_TABS" :key="c" :tab="c" />
      </ATabs>
      <div class="filter-row">
        <a-select v-model:value="query.level" :options="levelOptions" style="width: 150px" />
        <a-select v-model:value="query.status" :options="statusOptions" style="width: 150px" />
        <a-input v-model:value="query.keyword" placeholder="搜索问题描述 / 项目 / 责任方" allow-clear style="width: 300px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="resetQuery">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">筛选出 <b>{{ rows.length }}</b> 条问题，其中严重问题 <b>{{ tableStat.severe }}</b> 条</span>
      </div>
    </a-card>

    <!-- 问题表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1560 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'project'">
            <div>{{ projectNameMap.get(record.projectId) }}</div>
            <div class="sub">{{ record.projectId }} · {{ record.category }}类</div>
          </template>
          <template v-else-if="column.key === 'desc'">
            <span>{{ record.desc }}</span>
          </template>
          <template v-else-if="column.key === 'level'">
            <a-tag :color="levelColor(record.level)">{{ record.level }}</a-tag>
          </template>
          <template v-else-if="column.key === 'foundDate'">
            <span class="num">{{ record.foundDate }}</span>
          </template>
          <template v-else-if="column.key === 'deadline'">
            <span class="num" :class="{ overdue: record.overdue }">{{ record.deadline }}</span>
            <div v-if="record.overdue" class="sub overdue">已超整改期限</div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
            <div v-if="record.closedAt" class="sub">销号 {{ record.closedAt }}</div>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a @click="openUpdate(record.entity)">更新状态</a>
              <APopconfirm
                v-if="user.can('supervision:edit') && record.status !== '已销号'"
                title="确认销号？确认后问题状态置为「已销号」并记录销号时间"
                ok-text="确认销号"
                cancel-text="取消"
                @confirm="markClosed(record.entity)"
              >
                <a>销号</a>
              </APopconfirm>
              <span v-if="record.status === '已销号'" class="sub">已销号</span>
            </a-space>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的问题记录" />
    </a-card>

    <!-- 登记问题 -->
    <AModal
      v-model:open="formOpen"
      title="登记问题"
      ok-text="提交登记"
      cancel-text="取消"
      :width="760"
      @ok="submitIssueForm"
    >
      <AForm ref="formRef" :model="form" :rules="rules" layout="vertical">
        <div class="form-grid">
          <AFormItem label="所属项目" name="projectId">
            <a-select
              v-model:value="form.projectId"
              :options="projectFormOptions"
              show-search
              option-filter-prop="label"
              placeholder="请选择问题所属项目"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem label="问题分类" name="category">
            <a-select v-model:value="form.category" :options="categoryFormOptions" style="width: 100%" />
          </AFormItem>
          <AFormItem label="严重程度" name="level">
            <a-select v-model:value="form.level" :options="levelFormOptions" style="width: 100%" />
          </AFormItem>
          <AFormItem label="责任方" name="responsible">
            <a-input v-model:value="form.responsible" placeholder="如：市第一人民医院 张伟（单位 + 责任人）" />
          </AFormItem>
          <AFormItem label="发现日期" name="foundDate">
            <a-date-picker
              v-model:value="form.foundDate"
              value-format="YYYY-MM-DD"
              :disabled-date="disableFutureDate"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem label="整改期限" name="deadline">
            <a-date-picker v-model:value="form.deadline" value-format="YYYY-MM-DD" style="width: 100%" />
          </AFormItem>
        </div>
        <AFormItem label="问题描述" name="desc">
          <ATextarea
            v-model:value="form.desc"
            :rows="3"
            placeholder="如：机房桥架线缆敷设未按规范固定，走线凌乱且未见标识，需限期整改"
          />
        </AFormItem>
      </AForm>
      <div class="dialog-tip">
        演示环境：登记后问题插入台账顶部并在本页内存生效，顶部统计同步刷新；演示数据仅内存生效，未提交服务端，刷新页面恢复初始演示数据。
      </div>
    </AModal>

    <!-- 更新整改状态 -->
    <AModal v-model:open="updateOpen" title="更新整改状态" ok-text="确认更新" cancel-text="取消" :width="660" @ok="submitUpdate">
      <div v-if="currentIssue" class="upd">
        <ADescriptions :column="2" size="small" bordered>
          <ADescriptionsItem label="问题编号">{{ currentIssue.id }}</ADescriptionsItem>
          <ADescriptionsItem label="问题分类">{{ currentIssue.category }}</ADescriptionsItem>
          <ADescriptionsItem label="所属项目" :span="2">
            {{ projectNameMap.get(currentIssue.projectId) }}（{{ currentIssue.projectId }}）
          </ADescriptionsItem>
          <ADescriptionsItem label="问题描述" :span="2">{{ currentIssue.desc }}</ADescriptionsItem>
          <ADescriptionsItem label="问题等级">{{ currentIssue.level }}</ADescriptionsItem>
          <ADescriptionsItem label="责任方">{{ currentIssue.responsible }}</ADescriptionsItem>
          <ADescriptionsItem label="发现日期">{{ currentIssue.foundDate }}</ADescriptionsItem>
          <ADescriptionsItem label="整改期限">{{ currentIssue.deadline }}</ADescriptionsItem>
        </ADescriptions>
        <AForm layout="vertical" class="upd-form">
          <AFormItem label="整改状态" required>
            <ARadioGroup v-model:value="updateForm.status">
              <ARadioButton value="待整改">待整改</ARadioButton>
              <ARadioButton value="整改中">整改中</ARadioButton>
              <ARadioButton value="已销号">已销号</ARadioButton>
            </ARadioGroup>
          </AFormItem>
          <AFormItem label="整改情况说明">
            <ATextarea
              v-model:value="updateForm.note"
              :rows="3"
              placeholder="如：施工单位已提交整改方案并按期完成整改，监理复查合格后办结"
            />
          </AFormItem>
        </AForm>
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
  Popconfirm as APopconfirm,
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
import { TODAY, allIssues, allProjects } from '@/mock'
import type { IssueItem } from '@/mock/types'
import { addDays, pad } from '@/mock/utils'
import { useUserStore } from '@/stores/user'
import { exportExcel } from '@/utils/export'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
const projects = allProjects()
const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))

/** 问题行（本页内存副本：新增登记 / 销号只改副本，刷新页面回到初始演示数据） */
interface IssueRecord extends IssueItem {
  /** 销号时间（本地销号登记时写入，仅内存） */
  closedAt?: string
}

/** 问题台账（本地可变：登记 / 更新状态 / 销号直接更新内存副本） */
const issues = reactive<IssueRecord[]>(allIssues().map((i) => ({ ...i })))

const CATEGORY_TABS: Array<IssueItem['category'] | '全部'> = ['全部', '质量', '进度', '投资', '安全']
const activeCategory = ref<string | number>('全部')

const query = reactive({
  level: '' as '' | IssueItem['level'],
  status: '' as '' | IssueItem['status'],
  keyword: '',
})

const levelOptions = [
  { value: '', label: '全部等级' },
  { value: '一般', label: '一般' },
  { value: '较重', label: '较重' },
  { value: '严重', label: '严重' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: '待整改', label: '待整改' },
  { value: '整改中', label: '整改中' },
  { value: '已销号', label: '已销号' },
]

/**
 * 表格行数据：在原记录上预计算派生字段。
 * 表格 slot 中的 record 类型为 Record<string, any>，预计算后模板可直接读取具体字段（record.overdue / record.entity），
 * 避免把整个 record 传给需要具体类型参数的函数而产生类型不匹配。
 */
const rows = computed(() =>
  issues
    .filter((i) => {
      if (activeCategory.value !== '全部' && i.category !== activeCategory.value) return false
      if (query.level && i.level !== query.level) return false
      if (query.status && i.status !== query.status) return false
      if (query.keyword) {
        const text = `${i.desc}${i.id}${i.responsible}${projectNameMap.get(i.projectId) ?? ''}`
        if (!text.includes(query.keyword)) return false
      }
      return true
    })
    .map((i) => ({
      ...i,
      /** 是否已超整改期限：模板直接读取，无需在模板中调用 isOverdue */
      overdue: isOverdue(i),
      /** 行内原始对象引用：操作列传参用，保证更新状态 / 销号仍作用于响应式原始记录 */
      entity: i,
    })),
)

const tableStat = computed(() => ({
  severe: rows.value.filter((i) => i.level === '严重').length,
}))

/** 全量统计（不受筛选影响） */
const overall = computed(() => {
  const pending = issues.filter((i) => i.status === '待整改').length
  const doing = issues.filter((i) => i.status === '整改中').length
  const closed = issues.filter((i) => i.status === '已销号').length
  /** 逾期未销号：整改期限已过但仍未销号 */
  const overdue = issues.filter((i) => i.status !== '已销号' && i.deadline < TODAY).length
  return {
    pending,
    doing,
    closed,
    overdue,
    severe: issues.filter((i) => i.level === '严重').length,
    onTimeRate: closed + overdue ? (closed / (closed + overdue)) * 100 : 100,
  }
})

const statCards = computed(() => [
  { label: '问题总数', value: String(issues.length), unit: '条', sub: `覆盖 ${new Set(issues.map((i) => i.projectId)).size} 个子项目`, accent: '#1a5fd0' },
  { label: '待整改', value: String(overall.value.pending), unit: '条', sub: '已下发整改通知待处理', accent: '#faad14' },
  { label: '整改中', value: String(overall.value.doing), unit: '条', sub: '责任方正在落实整改', accent: '#1677ff' },
  { label: '已销号', value: String(overall.value.closed), unit: '条', sub: '复查合格完成销号', accent: '#52c41a' },
  { label: '严重问题', value: String(overall.value.severe), unit: '条', sub: `逾期未销号 ${overall.value.overdue} 条`, accent: '#ff4d4f' },
  {
    label: '按期整改率',
    value: overall.value.onTimeRate.toFixed(1),
    unit: '%',
    sub: '口径：已销号 ÷（已销号 + 逾期未销号）',
    accent: '#722ed1',
  },
])

const columns: TableColumnType<IssueItem>[] = [
  { title: '所属项目', key: 'project', width: 260 },
  { title: '问题描述', key: 'desc', width: 420 },
  { title: '等级', key: 'level', width: 96, align: 'center' as const },
  { title: '责任方', dataIndex: 'responsible', key: 'responsible', width: 240 },
  { title: '发现日期', key: 'foundDate', width: 116 },
  { title: '整改期限', key: 'deadline', width: 130 },
  { title: '状态', key: 'status', width: 106, align: 'center' as const },
  { title: '操作', key: 'action', width: 168, fixed: 'right' as const },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条问题`,
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
 * 分类页签切换后重新测量表体高度：切换会改变当前分类的数据量（严重问题、超期提示等），
 * 分页与表头高度可能随之变化；useTableScroll 以 window resize 作为重测通道，这里等 DOM 更新完成后触发一次。
 */
watch(activeCategory, async () => {
  await nextTick()
  window.dispatchEvent(new Event('resize'))
})

function levelColor(level: IssueItem['level']): string {
  if (level === '严重') return 'red'
  if (level === '较重') return 'orange'
  return 'default'
}

function statusColor(status: IssueItem['status']): string {
  if (status === '已销号') return 'green'
  if (status === '整改中') return 'blue'
  return 'orange'
}

function isOverdue(i: IssueItem): boolean {
  return i.status !== '已销号' && i.deadline < TODAY
}

function resetQuery() {
  query.level = ''
  query.status = ''
  query.keyword = ''
}

// ---------------- 登记问题 ----------------
interface IssueForm {
  projectId: string
  category: IssueItem['category']
  level: IssueItem['level']
  desc: string
  responsible: string
  foundDate: string
  deadline: string
}

const formOpen = ref(false)
const formRef = ref<FormInstance>()

const projectFormOptions = projects.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` }))

const categoryFormOptions: Array<{ value: IssueItem['category']; label: string }> = [
  { value: '质量', label: '质量问题' },
  { value: '进度', label: '进度问题' },
  { value: '投资', label: '投资问题' },
  { value: '安全', label: '安全问题' },
]

const levelFormOptions: Array<{ value: IssueItem['level']; label: string }> = [
  { value: '一般', label: '一般' },
  { value: '较重', label: '较重' },
  { value: '严重', label: '严重' },
]

const form = reactive<IssueForm>({
  projectId: projects[0]?.id ?? '',
  category: '质量',
  level: '一般',
  desc: '',
  responsible: '',
  foundDate: TODAY,
  deadline: addDays(TODAY, 15),
})

/** 日期选择器：禁用晚于演示基准日的日期（发现日期等「已发生」日期不得晚于 TODAY） */
function disableFutureDate(date: Dayjs): boolean {
  return date.format('YYYY-MM-DD') > TODAY
}

/** 校验：发现日期不得晚于演示基准日 */
async function validateFoundDate(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择发现日期')
  if (value > TODAY) throw new Error(`发现日期不得晚于演示基准日 ${TODAY}`)
}

/** 校验：整改期限属计划类日期，可晚于基准日，但不得早于发现日期 */
async function validateDeadline(_rule: unknown, value: string): Promise<void> {
  if (!value) throw new Error('请选择整改期限')
  if (form.foundDate && value < form.foundDate) throw new Error('整改期限不得早于发现日期')
}

/** 表单校验规则（结构与 Ant Design Vue Form rules 一致） */
const rules: Record<string, RuleObject[]> = {
  projectId: [{ required: true, message: '请选择问题所属项目' }],
  category: [{ required: true, message: '请选择问题分类' }],
  level: [{ required: true, message: '请选择严重程度' }],
  desc: [
    { required: true, message: '请填写问题描述' },
    { min: 10, message: '问题描述不少于 10 个字符' },
  ],
  responsible: [
    { required: true, message: '请填写责任方（单位 + 责任人）' },
    { min: 4, message: '责任方建议填写到单位与责任人' },
  ],
  foundDate: [{ validator: validateFoundDate, trigger: 'change' }],
  deadline: [{ validator: validateDeadline, trigger: 'change' }],
}

/** 下一个问题编号：沿用 mock 的 ISS-xxx 规则，取台账现有编号最大值 + 1 */
function nextIssueId(): string {
  const max = issues.reduce((m, i) => {
    const n = Number(i.id.replace('ISS-', ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `ISS-${pad(max + 1, 3)}`
}

function openIssueForm() {
  form.projectId = projects[0]?.id ?? ''
  form.category = '质量'
  form.level = '一般'
  form.desc = ''
  form.responsible = ''
  form.foundDate = TODAY
  form.deadline = addDays(TODAY, 15)
  formOpen.value = true
}

/** 提交登记：新增问题插入台账顶部、状态默认待整改，顶部统计卡片随之刷新（仅内存） */
async function submitIssueForm() {
  const inst = formRef.value
  if (!inst) return
  try {
    await inst.validate()
  } catch {
    message.warning('请先按提示完善表单必填项后再提交')
    return
  }

  const id = nextIssueId()
  issues.unshift({
    id,
    projectId: form.projectId,
    category: form.category,
    level: form.level,
    desc: form.desc.trim(),
    responsible: form.responsible.trim(),
    deadline: form.deadline,
    status: '待整改',
    foundDate: form.foundDate,
  })
  formOpen.value = false
  const project = projects.find((p) => p.id === form.projectId)
  message.success(
    `${id} 问题已登记（${project?.name ?? form.projectId}·${form.category}·${form.level}），整改期限 ${form.deadline}，登记后待责任方整改；演示数据：仅内存生效，未提交服务端`,
  )
}

// ---------------- 更新状态 ----------------
const updateOpen = ref(false)
const currentIssue = ref<IssueItem | null>(null)
const updateForm = reactive({ status: '整改中' as IssueItem['status'], note: '' })

function openUpdate(issue: IssueItem) {
  currentIssue.value = issue
  updateForm.status = issue.status
  updateForm.note = ''
  updateOpen.value = true
}

function submitUpdate() {
  const issue = currentIssue.value
  if (!issue) return
  const prev = issue.status
  issue.status = updateForm.status
  updateOpen.value = false
  message.success(
    `${issue.id} 整改状态已由「${prev}」更新为「${updateForm.status}」，更新记录已同步至问题台账`,
  )
}

/** 销号：状态置为已销号、记录销号时间（演示基准日），顶部统计与按期整改率随之刷新 */
function markClosed(issue: IssueRecord) {
  const prev = issue.status
  issue.status = '已销号'
  issue.closedAt = TODAY
  const extra = issue.deadline < TODAY ? '；整改期限已过，按逾期整改闭环登记' : ''
  message.success(
    `${issue.id} 已完成销号（${prev} → 已销号），销号时间 ${TODAY}，顶部统计已刷新${extra}`,
  )
}

/** 导出问题台账（Excel 双工作表：问题明细 + 分类统计） */
function exportIssues() {
  const categories: IssueItem['category'][] = ['质量', '进度', '投资', '安全']
  exportExcel('问题台账', [
    {
      name: '问题明细',
      header: ['问题编号', '所属项目', '项目编号', '问题分类', '问题描述', '问题等级', '责任方', '发现日期', '整改期限', '状态'],
      rows: rows.value.map((i) => [
        i.id,
        projectNameMap.get(i.projectId) ?? '',
        i.projectId,
        i.category,
        i.desc,
        i.level,
        i.responsible,
        i.foundDate,
        i.deadline,
        i.status,
      ]),
      colWidth: [12, 32, 16, 10, 48, 10, 28, 12, 12, 10],
    },
    {
      name: '分类统计',
      header: ['问题分类', '问题总数', '待整改', '整改中', '已销号', '严重问题'],
      rows: categories.map((c) => {
        const list = issues.filter((i) => i.category === c)
        return [
          c,
          list.length,
          list.filter((i) => i.status === '待整改').length,
          list.filter((i) => i.status === '整改中').length,
          list.filter((i) => i.status === '已销号').length,
          list.filter((i) => i.level === '严重').length,
        ]
      }),
      colWidth: [12, 10, 10, 10, 10, 10],
    },
  ])
  message.success(`已导出 ${rows.value.length} 条问题记录`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头 / 统计卡片行 / 筛选卡片：高度按内容固定，剩余高度全部留给问题表格
.page-head {
  flex: none;
}

.stat-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 问题卡片：占满筛选卡片以下的剩余高度，表格在卡片内部滚动
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
  padding: 6px 16px 14px;

  .filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 10px;
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

.sub {
  font-size: 12px;
  color: @text-3;

  &.overdue {
    color: @status-overdue;
  }
}

.num {
  font-variant-numeric: tabular-nums;

  &.overdue {
    color: @status-overdue;
    font-weight: 600;
  }
}

.upd {
  .upd-form {
    margin-top: 14px;
  }
}

// ------- 登记问题表单 -------
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
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
