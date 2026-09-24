<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="软件测评任务"
      desc="面向在建项目的第三方软件测评任务台账，跟踪测评进度、缺陷复核情况与测评报告归档"
      tag="模块 7"
    >
      <a-button v-if="user.can('report:export')" @click="exportTasks">
        <template #icon><DownloadOutlined /></template>
        导出测评台账
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 筛选 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-select v-model:value="query.status" :options="statusOptions" style="width: 150px" />
        <a-select v-model:value="query.agency" :options="agencyOptions" style="width: 260px" />
        <a-input v-model:value="query.keyword" placeholder="搜索项目名称 / 编号" allow-clear style="width: 280px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="resetQuery">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">筛选出 <b>{{ rows.length }}</b> 个测评任务</span>
      </div>
    </a-card>

    <!-- 任务表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1420 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'project'">
            <div>{{ projectNameMap.get(record.projectId) }}</div>
            <div class="sub">{{ record.projectId }} · 任务编号 {{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'defectsTotal'">
            <span class="num">{{ record.defectsTotal }}</span>
          </template>
          <template v-else-if="column.key === 'defectsFixed'">
            <span class="num">{{ record.defectsFixed }}</span>
          </template>
          <template v-else-if="column.key === 'rate'">
            <div v-if="record.defectsTotal" class="rate">
              <a-progress
                :percent="Math.round(record.rate)"
                size="small"
                :stroke-color="rateColor(record.rate)"
              />
              <span class="rate-text num">{{ record.rate.toFixed(1) }}%</span>
            </div>
            <span v-else class="sub">检测未开展</span>
          </template>
          <template v-else-if="column.key === 'reportTime'">
            <span v-if="record.reportTime" class="num">{{ record.reportTime }}</span>
            <span v-else class="sub">报告未出具</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a v-if="record.reportTime" @click="downloadReport(asTask(record))">下载报告</a>
            <span v-else class="sub">—</span>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的测评任务" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { TableColumnType } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { allProjects, allTestTasks } from '@/mock'
import type { TestTask } from '@/mock/types'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'
import { exportExcel } from '@/utils/export'

const user = useUserStore()
const projects = allProjects()
const tasks = allTestTasks()

const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))
const projectOwnerMap = new Map(projects.map((p) => [p.id, p.owner]))

const query = reactive({
  status: '' as '' | TestTask['status'],
  agency: '',
  keyword: '',
})

const statusOptions = [
  { value: '', label: '全部任务状态' },
  { value: '待测评', label: '待测评' },
  { value: '测评中', label: '测评中' },
  { value: '已完成', label: '已完成' },
]

const agencyOptions = [
  { value: '', label: '全部测评机构' },
  ...[...new Set(tasks.map((t) => t.agency))].map((a) => ({ value: a, label: a })),
]

const rows = computed(() =>
  tasks
    .filter((t) => {
      if (query.status && t.status !== query.status) return false
      if (query.agency && t.agency !== query.agency) return false
      if (query.keyword) {
        const text = `${projectNameMap.get(t.projectId) ?? ''}${t.projectId}${t.id}`
        if (!text.includes(query.keyword)) return false
      }
      return true
    })
    /** 预计算缺陷复核率，模板直接读取 record.rate，无需在插槽中重复调用业务函数 */
    .map((t) => ({ ...t, rate: rateOf(t) })),
)

/** 缺陷复核率（%）：已复核 ÷ 缺陷总数 */
function rateOf(t: TestTask): number {
  return t.defectsTotal ? (t.defectsFixed / t.defectsTotal) * 100 : 0
}

/** 全量统计（不受筛选影响） */
const summary = computed(() => {
  const finished = tasks.filter((t) => t.status === '已完成').length
  const testing = tasks.filter((t) => t.status === '测评中').length
  const defects = tasks.reduce((s, t) => s + t.defectsTotal, 0)
  const fixed = tasks.reduce((s, t) => s + t.defectsFixed, 0)
  return {
    finished,
    testing,
    pending: tasks.length - finished - testing,
    defects,
    fixed,
    rate: defects ? (fixed / defects) * 100 : 0,
  }
})

const statCards = computed(() => [
  { label: '测评任务数', value: String(tasks.length), unit: '个', sub: '覆盖已进入建设 / 验收阶段的项目', accent: '#1a5fd0' },
  { label: '已完成测评', value: String(summary.value.finished), unit: '个', sub: `测评中 ${summary.value.testing} 个 · 待测评 ${summary.value.pending} 个`, accent: '#52c41a' },
  { label: '缺陷总数', value: String(summary.value.defects), unit: '项', sub: `已复核 ${summary.value.fixed} 项`, accent: '#faad14' },
  { label: '缺陷复核率', value: summary.value.rate.toFixed(1), unit: '%', sub: '口径：已复核缺陷 ÷ 缺陷总数', accent: '#722ed1' },
  { label: '已出具测评报告', value: String(tasks.filter((t) => t.reportTime).length), unit: '份', sub: '报告出具后上传至项目档案', accent: '#1677ff' },
])

const columns: TableColumnType<TestTask>[] = [
  { title: '所属项目', key: 'project', width: 300 },
  { title: '测评机构', dataIndex: 'agency', key: 'agency', width: 240 },
  { title: '任务状态', key: 'status', width: 110, align: 'center' as const },
  { title: '缺陷总数', key: 'defectsTotal', width: 104, align: 'right' as const },
  { title: '已复核缺陷', key: 'defectsFixed', width: 120, align: 'right' as const },
  { title: '缺陷复核率', key: 'rate', width: 220 },
  { title: '报告上传时间', key: 'reportTime', width: 140, align: 'center' as const },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个测评任务`,
}

/** 任务表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
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

function statusColor(status: TestTask['status']): string {
  if (status === '已完成') return 'green'
  if (status === '测评中') return 'blue'
  return 'default'
}

/** 表格插槽中的 record 为宽松类型，统一断言为测评任务记录后交给业务函数 */
const asTask = (r: Record<string, unknown>) => r as unknown as TestTask

/** 复核率进度条配色：≥90% 绿、≥50% 蓝、其余黄 */
function rateColor(v: number): string {
  if (v >= 90) return '#52c41a'
  if (v >= 50) return '#1677ff'
  return '#faad14'
}

function resetQuery() {
  query.status = ''
  query.agency = ''
  query.keyword = ''
}

/** 下载测评报告：导出该任务的报告摘要与缺陷复核明细 */
function downloadReport(t: TestTask) {
  exportExcel(`软件测评报告-${t.id}`, [
    {
      name: '测评报告摘要',
      header: ['任务编号', '项目名称', '项目编号', '建设单位', '测评机构', '任务状态', '缺陷总数', '已复核缺陷', '缺陷复核率', '报告上传时间'],
      rows: [
        [
          t.id,
          projectNameMap.get(t.projectId) ?? '',
          t.projectId,
          projectOwnerMap.get(t.projectId) ?? '',
          t.agency,
          t.status,
          t.defectsTotal,
          t.defectsFixed,
          `${rateOf(t).toFixed(1)}%`,
          t.reportTime ?? '',
        ],
      ],
      colWidth: [12, 34, 16, 30, 26, 10, 10, 12, 12, 14],
    },
    {
      name: '缺陷复核情况',
      header: ['序号', '缺陷等级', '缺陷描述', '复核结论'],
      rows: defectRows(t),
      colWidth: [8, 10, 52, 20],
    },
  ])
  message.success(`${projectNameMap.get(t.projectId) ?? ''}软件测评报告已导出`)
}

/** 按任务已有的缺陷数量生成复核明细（确定性：与任务编号绑定） */
function defectRows(t: TestTask): Array<[number, string, string, string]> {
  const levels = ['一般', '一般', '较重', '一般', '较重', '严重']
  const descs = [
    '门诊挂号页面在并发访问下响应时间超过 3 秒',
    '电子病历保存后历史文书列表未及时刷新',
    '检验报告回传缺少异常值的提示标识',
    '影像调阅过程中偶发图片加载失败',
    '医保结算接口对错误码未做友好提示',
    '用户列表按科室筛选后分页信息不准确',
    '系统日志中未记录关键操作的操作用户',
    '住院预交金退还流程缺少二次确认',
    '数据字典维护页面未做必填项校验',
    '客户端在断网重连后会话状态丢失',
    '统计报表导出数据与列表展示口径不一致',
    '消息推送失败时未自动重试',
    '权限变更后未实时生效需重新登录',
    '打印模板在部分浏览器下排版错位',
  ]
  return Array.from({ length: t.defectsTotal }, (_, i) => {
    const fixed = i < t.defectsFixed
    return [
      i + 1,
      levels[i % levels.length],
      descs[i % descs.length],
      fixed ? '已复核通过' : '待复核',
    ] as [number, string, string, string]
  })
}

function exportTasks() {
  exportExcel('软件测评任务台账', [
    {
      name: '测评任务',
      header: ['任务编号', '项目名称', '项目编号', '测评机构', '任务状态', '缺陷总数', '已复核缺陷', '缺陷复核率', '报告上传时间'],
      rows: rows.value.map((t) => [
        t.id,
        projectNameMap.get(t.projectId) ?? '',
        t.projectId,
        t.agency,
        t.status,
        t.defectsTotal,
        t.defectsFixed,
        `${rateOf(t).toFixed(1)}%`,
        t.reportTime ?? '',
      ]),
      colWidth: [12, 34, 16, 26, 10, 10, 12, 12, 14],
    },
  ])
  message.success(`已导出 ${rows.value.length} 个测评任务`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头固定：不参与剩余高度分配
.page-head {
  flex: none;
}

// 顶部统计卡片行固定：高度由内容决定
.stat-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 任务卡片：占满筛选卡片以下的剩余高度，表格超出时在卡片内部滚动（数据不足时至少 3 行 + 分页）
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
  padding: 14px 16px;

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

.sub {
  font-size: 12px;
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;
}

.rate {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.ant-progress) {
    flex: 1;
    min-width: 90px;
  }

  .rate-text {
    font-size: 12px;
    color: @text-2;
  }
}
</style>
