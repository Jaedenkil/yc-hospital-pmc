<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="跟踪审计与专项审计"
      desc="全过程跟踪审计简报与专项审计报告归档，支持按类型、项目与编制人检索并下载审计材料"
      tag="模块 7"
    >
      <a-button v-if="user.can('report:export')" @click="exportAll">
        <template #icon><DownloadOutlined /></template>
        导出审计台账
      </a-button>
      <a-button v-if="user.can('report:export')" @click="printLedger">
        <template #icon><PrinterOutlined /></template>
        打印 / 导出 PDF
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 筛选 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-select v-model:value="query.type" :options="typeOptions" style="width: 190px" />
        <a-select
          v-model:value="query.projectId"
          :options="projectOptions"
          style="width: 270px"
          show-search
          option-filter-prop="label"
        />
        <a-input v-model:value="query.keyword" placeholder="搜索标题 / 编制人 / 编号" allow-clear style="width: 260px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="resetQuery">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">筛选出 <b>{{ rows.length }}</b> 份审计材料</span>
      </div>
    </a-card>

    <!-- 台账表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1340 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag :color="record.type === '跟踪审计简报' ? 'blue' : 'purple'">{{ record.type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'title'">
            <span>{{ record.title }}</span>
            <div class="sub">{{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'project'">
            <div>{{ projectNameMap.get(record.projectId) }}</div>
            <div class="sub">{{ record.projectId }}</div>
          </template>
          <template v-else-if="column.key === 'date'">
            <span class="num">{{ record.date }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a @click="downloadOne(asAuditRecord(record))">材料下载</a>
              <a @click="printOne(asAuditRecord(record))">打印</a>
            </a-space>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的审计材料" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { TableColumnType } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { allAuditRecords, allProjects } from '@/mock'
import type { AuditRecord } from '@/mock/types'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'
import { exportExcel, printTable } from '@/utils/export'

const user = useUserStore()
const projects = allProjects()
const records = allAuditRecords()

const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))

const query = reactive({
  type: '' as '' | AuditRecord['type'],
  projectId: '',
  keyword: '',
})

const typeOptions = [
  { value: '', label: '全部材料类型' },
  { value: '跟踪审计简报', label: '跟踪审计简报' },
  { value: '专项审计报告', label: '专项审计报告' },
]

const projectOptions = [
  { value: '', label: '全部子项目' },
  ...projects.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` })),
]

const rows = computed(() =>
  records.filter((r) => {
    if (query.type && r.type !== query.type) return false
    if (query.projectId && r.projectId !== query.projectId) return false
    if (query.keyword && !`${r.title}${r.id}${r.author}`.includes(query.keyword)) return false
    return true
  }),
)

/** 全量统计（不受筛选影响） */
const summary = computed(() => {
  const briefs = records.filter((r) => r.type === '跟踪审计简报')
  const specials = records.filter((r) => r.type === '专项审计报告')
  const dates = records.map((r) => r.date).sort()
  return {
    briefs: briefs.length,
    specials: specials.length,
    projects: new Set(records.map((r) => r.projectId)).size,
    authors: new Set(records.map((r) => r.author)).size,
    latest: dates.length ? dates[dates.length - 1] : '—',
  }
})

const statCards = computed(() => [
  { label: '审计材料总数', value: String(records.length), unit: '份', sub: `由 ${summary.value.authors} 名审计人员编制`, accent: '#1a5fd0' },
  { label: '跟踪审计简报', value: String(summary.value.briefs), unit: '份', sub: '2025 年 1 月起按月出具', accent: '#1677ff' },
  { label: '专项审计报告', value: String(summary.value.specials), unit: '份', sub: '资金使用 / 招标采购 / 合同履约等专项', accent: '#722ed1' },
  { label: '覆盖子项目', value: String(summary.value.projects), unit: '个', sub: '跟踪审计覆盖全部在建项目', accent: '#52c41a' },
  { label: '最近出具时间', value: summary.value.latest, unit: '', sub: '未出具审计材料的项目将按月滚动覆盖', accent: '#faad14' },
])

const columns: TableColumnType<AuditRecord>[] = [
  { title: '材料类型', key: 'type', width: 150 },
  { title: '标题', key: 'title', width: 480 },
  { title: '所属项目', key: 'project', width: 300 },
  { title: '出具日期', key: 'date', width: 120 },
  { title: '编制人', dataIndex: 'author', key: 'author', width: 110 },
  { title: '操作', key: 'action', width: 170, fixed: 'right' as const },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 份审计材料`,
}

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

/** 表格插槽中的 record 为宽松类型，统一断言为审计材料记录后交给业务函数 */
const asAuditRecord = (r: Record<string, unknown>) => r as unknown as AuditRecord

function resetQuery() {
  query.type = ''
  query.projectId = ''
  query.keyword = ''
}

/** 单份审计材料的卷内清单（按材料类型区分） */
function fileList(r: AuditRecord): Array<[number, string, string]> {
  if (r.type === '跟踪审计简报') {
    return [
      [1, '简报正文', '本期跟踪审计发现、问题清单与整改建议'],
      [2, '审计取证单', '现场取证记录及被审计单位签认'],
      [3, '整改进展跟踪表', '上期问题整改情况销号记录'],
    ]
  }
  return [
    [1, '报告正文', '专项审计事项、审计结论与处理建议'],
    [2, '审计工作底稿', '审计程序执行记录与证据材料'],
    [3, '资金支付明细附表', '抽查批次的拨付与使用明细'],
    [4, '整改情况说明', '被审计单位整改措施与落实结果'],
  ]
}

function downloadOne(r: AuditRecord) {
  exportExcel(`审计材料-${r.id}`, [
    {
      name: '材料登记信息',
      header: ['材料编号', '材料类型', '标题', '所属项目', '项目编号', '出具日期', '编制人'],
      rows: [[r.id, r.type, r.title, projectNameMap.get(r.projectId) ?? '', r.projectId, r.date, r.author]],
      colWidth: [12, 16, 60, 34, 16, 12, 12],
    },
    {
      name: '卷内材料清单',
      header: ['序号', '材料项', '内容说明'],
      rows: fileList(r).map(([n, name, desc]) => [n, name, desc]),
      colWidth: [8, 22, 56],
    },
  ])
  message.success(`${r.title}材料包已导出`)
}

function printOne(r: AuditRecord) {
  printTable({
    title: r.title,
    subtitle: `${r.type} · ${projectNameMap.get(r.projectId) ?? ''}`,
    header: ['材料编号', '所属项目', '出具日期', '编制人'],
    rows: [[r.id, projectNameMap.get(r.projectId) ?? '', r.date, r.author]],
    align: ['center', 'left', 'center', 'center'],
    footer: '数据来源：盐城市公立医院改革与高质量发展示范项目 · 跟踪审计台账（演示数据）',
  })
}

/** 导出审计台账（明细 + 按项目汇总） */
function exportAll() {
  exportExcel('跟踪审计与专项审计台账', [
    {
      name: '审计材料明细',
      header: ['材料编号', '材料类型', '标题', '所属项目', '项目编号', '出具日期', '编制人'],
      rows: rows.value.map((r) => [
        r.id,
        r.type,
        r.title,
        projectNameMap.get(r.projectId) ?? '',
        r.projectId,
        r.date,
        r.author,
      ]),
      colWidth: [12, 16, 60, 34, 16, 12, 12],
    },
    {
      name: '按项目汇总',
      header: ['项目编号', '项目名称', '审计材料份数', '跟踪审计简报', '专项审计报告'],
      rows: projects
        .map((p) => {
          const list = records.filter((r) => r.projectId === p.id)
          return [
            p.id,
            p.name,
            list.length,
            list.filter((r) => r.type === '跟踪审计简报').length,
            list.filter((r) => r.type === '专项审计报告').length,
          ]
        })
        .filter((row) => Number(row[2]) > 0),
      colWidth: [16, 34, 14, 14, 14],
    },
  ])
  message.success(`已导出 ${rows.value.length} 份审计材料`)
}

function printLedger() {
  printTable({
    title: '跟踪审计材料台账',
    subtitle: `共 ${rows.value.length} 份（跟踪审计简报 ${summary.value.briefs} 份 · 专项审计报告 ${summary.value.specials} 份）`,
    header: ['材料编号', '材料类型', '标题', '所属项目', '出具日期', '编制人'],
    rows: rows.value.map((r) => [
      r.id,
      r.type,
      r.title,
      projectNameMap.get(r.projectId) ?? '',
      r.date,
      r.author,
    ]),
    align: ['center', 'center', 'left', 'left', 'center', 'center'],
    landscape: true,
    footer: '数据来源：盐城市公立医院改革与高质量发展示范项目 · 跟踪审计台账（演示数据）',
  })
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

// 台账卡片：占满筛选卡片以下的剩余高度，表格超出时在卡片内部滚动（数据不足时至少 3 行 + 分页）
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
</style>
