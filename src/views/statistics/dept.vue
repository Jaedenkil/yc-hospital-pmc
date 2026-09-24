<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="按牵头处室统计"
      desc="按牵头处室 / 单位归集子项目数量、建设投资与中央专项资金拨付情况，展开行可查看该处室项目清单"
      tag="模块 2"
    >
      <a-button v-if="user.can('report:export')" @click="exportDept">
        <template #icon><DownloadOutlined /></template>
        导出处室统计
      </a-button>
      <a-button type="primary" @click="$router.push('/statistics')">
        <template #icon><BarChartOutlined /></template>
        项目数量分类统计
      </a-button>
    </PageHeader>

    <!-- 处室总览 KPI -->
    <div class="kpi-row">
      <StatCard v-for="card in cards" :key="card.label" v-bind="card" />
    </div>

    <!-- 处室项目数分布 -->
    <ChartCard
      class="chart-block"
      title="各处室项目数量分布"
      desc="按四阶段堆叠展示项目数（个），柱条从少到多排列"
      :option="deptOption"
      height="300px"
    />

    <!-- 检索 -->
    <div class="pmc-card panel filter">
      <div class="filter-row">
        <a-input
          v-model:value="keyword"
          placeholder="搜索处室 / 单位、项目名称或项目编号"
          allow-clear
          style="width: 320px"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="keyword = ''">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">
          命中 <b>{{ rows.length }}</b> 个牵头处室 / 单位，合计 <b>{{ matchedCount }}</b> 个子项目
        </span>
      </div>
    </div>

    <!-- 处室统计表（可展开项目清单）：占满筛选区以下的剩余高度，表体内部滚动（不足 3 行按 3 行兜底） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        v-model:expanded-row-keys="expandedKeys"
        class="num-table"
        :columns="columns"
        :data-source="rows"
        row-key="dept"
        size="middle"
        :pagination="pagination"
        :scroll="{ ...tableScroll, x: 1560 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'dept'">
            <div class="dept" @click="toggleDept(record.dept)">{{ record.dept }}</div>
            <div class="sub">展开可查看该处室 {{ record.count }} 个子项目清单</div>
          </template>
          <template v-else-if="column.key === 'count'">
            <span class="strong">{{ record.count }}</span>
          </template>
          <template v-else-if="column.key === 'phase'">
            <a-space :size="4" wrap>
              <a-tag v-for="phase in PHASE_ORDER" :key="phase" :color="PHASE_TAG[phase]">
                {{ phase }} {{ record.phaseCount[phase] }}
              </a-tag>
            </a-space>
          </template>
          <template v-else-if="column.key === 'paid'">
            <div class="num">{{ record.paidWan }}</div>
            <div class="sub">拨付率 {{ record.paidRate }}</div>
          </template>
          <template v-else-if="column.key === 'risk'">
            <a-tag :color="record.highRisk ? 'red' : 'green'">
              {{ record.highRisk ? `${record.highRisk} 个高风险` : '无高风险' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a @click="toggleDept(record.dept)">{{ expandedKeys.includes(record.dept) ? '收起清单' : '展开清单' }}</a>
              <a @click="gotoProjects(record.dept)">台账</a>
            </a-space>
          </template>
        </template>

        <template #expandedRowRender="{ record }">
          <div class="expand">
            <div class="expand-head">
              {{ record.dept }} · 项目清单
              <span class="sub">
                （{{ expandRows(record).length }} 个{{ keyword.trim() ? '匹配检索条件' : '在管子项目' }}）
              </span>
            </div>
            <a-table
              class="num-table"
              :columns="projectColumns"
              :data-source="expandRows(record)"
              row-key="id"
              size="small"
              :pagination="false"
              :scroll="{ x: 1390 }"
            >
              <template #bodyCell="{ column, record: row }">
                <template v-if="column.key === 'name'">
                  <a @click="$router.push(`/projects/${row.id}`)">{{ row.name }}</a>
                  <div class="sub">{{ row.id }}</div>
                </template>
                <template v-else-if="column.key === 'phase'">
                  <a-tag :color="row.phaseTag">{{ row.phase }}</a-tag>
                </template>
                <template v-else-if="column.key === 'progress'">
                  <a-progress :percent="row.progress" :stroke-color="row.progressColor" size="small" />
                </template>
                <template v-else-if="column.key === 'risk'">
                  <a-tag :color="row.riskTag">{{ row.riskLabel }}风险</a-tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a @click="$router.push(`/projects/${row.id}`)">详情</a>
                </template>
              </template>
            </a-table>
          </div>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无数据" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
// 按牵头处室统计：处室归集表（含各阶段数量）+ 受控展开项目清单 + 关键字检索
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumnType } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import { BarChartOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { PHASE_ORDER, RISK_LABEL } from '@/mock/types'
import type { Phase, RiskLevel, SubProject } from '@/mock/types'
import { TODAY, allProjects, byDepartment, projectProgress } from '@/mock'
import { ratio, toWan, toYi } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import type { ChartOption } from '@/utils/echarts'
import { useTableScroll } from '@/composables/useTableScroll'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
const router = useRouter()
const projects = allProjects()
const deptStats = byDepartment()

/** 阶段配色与标签色（与统计看板同口径） */
const PHASE_COLOR: Record<Phase, string> = {
  立项: '#1a5fd0',
  采购: '#1677ff',
  建设: '#faad14',
  验收: '#52c41a',
}
const PHASE_TAG: Record<Phase, string> = { 立项: 'blue', 采购: 'cyan', 建设: 'orange', 验收: 'green' }
const RISK_TAG: Record<RiskLevel, string> = { low: 'green', mid: 'orange', high: 'red' }

/** 展开区项目行：SubProject 加展示派生字段（含阶段 / 风险标签色，供模板直接读取） */
interface DeptProjectRow extends SubProject {
  progress: number
  progressColor: string
  investmentWan: number
  centralWan: number
  phaseTag: string
  riskTag: string
  riskLabel: string
}

const keyword = ref('')
/** 受控展开行：点击处室名 / 「展开清单」或表格展开箭头都能切换 */
const expandedKeys = ref<Array<string | number>>([])

function toggleDept(dept: string) {
  expandedKeys.value = expandedKeys.value.includes(dept)
    ? expandedKeys.value.filter((d) => String(d) !== dept)
    : [...expandedKeys.value, dept]
}

/** 处室统计行（同步按关键字过滤） */
const rows = computed(() => {
  const kw = keyword.value.trim()
  return deptStats
    .map((d) => {
      const list: DeptProjectRow[] = d.list.map((p) => {
        const progress = projectProgress(p)
        return {
          ...p,
          progress,
          progressColor: progressColor(progress),
          investmentWan: Number(toWan(p.totalInvestment)),
          centralWan: Number(toWan(p.centralFund)),
          // 阶段 / 风险标签色在 script 内预计算：表格 slot 的 record 是宽松记录，模板内不能直接拿它索引字面量联合键字典
          phaseTag: PHASE_TAG[p.phase],
          riskTag: RISK_TAG[p.riskLevel],
          riskLabel: RISK_LABEL[p.riskLevel],
        }
      })
      return {
        dept: d.dept,
        count: d.count,
        investmentWan: Number(toWan(d.investment)),
        centralWan: Number(toWan(d.central)),
        paidWan: Number(toWan(d.paid)),
        paidRate: `${ratio(d.paid, d.central).toFixed(1)}%`,
        phaseCount: d.phaseCount,
        highRisk: d.highRisk,
        list,
      }
    })
    .filter((d) => !kw || d.dept.includes(kw) || d.list.some((p) => p.name.includes(kw) || p.id.includes(kw)))
    .sort((a, b) => b.count - a.count || b.investmentWan - a.investmentWan)
})

/** 检索命中的子项目总数 */
const matchedCount = computed(() => rows.value.reduce((s, r) => s + r.count, 0))

/** 展开区项目清单：有关键字时只列出命中项目 */
function expandRows(record: { list: DeptProjectRow[] }): DeptProjectRow[] {
  const kw = keyword.value.trim()
  if (!kw) return record.list
  return record.list.filter((p) => p.name.includes(kw) || p.id.includes(kw))
}

function gotoProjects(dept: string) {
  router.push({ path: '/projects', query: { dept } })
}

function progressColor(progress: number): string {
  if (progress >= 80) return '#52c41a'
  if (progress >= 40) return '#1677ff'
  return '#faad14'
}

const cards = computed(() => {
  const invest = deptStats.reduce((s, d) => s + d.investment, 0)
  const central = deptStats.reduce((s, d) => s + d.central, 0)
  const paid = deptStats.reduce((s, d) => s + d.paid, 0)
  const highRisk = deptStats.reduce((s, d) => s + d.highRisk, 0)
  return [
    {
      label: '牵头处室 / 单位',
      value: String(deptStats.length),
      unit: '个',
      sub: `覆盖 ${projects.length} 个示范子项目`,
      accent: '#1a5fd0',
    },
    {
      label: '建设总投资',
      value: toYi(invest),
      unit: '亿元',
      sub: `平均每处室 ${toWan(invest / Math.max(deptStats.length, 1))} 万元`,
      accent: '#1677ff',
    },
    {
      label: '中央专项资金',
      value: toYi(central),
      unit: '亿元',
      sub: `已拨付 ${toYi(paid)} 亿元（拨付率 ${ratio(paid, central).toFixed(1)}%）`,
      accent: '#52c41a',
    },
    {
      label: '高风险项目',
      value: String(highRisk),
      unit: '个',
      sub: '存在严重滞后子任务，需重点督办',
      accent: '#ff4d4f',
    },
  ]
})

const columns: TableColumnType[] = [
  { title: '牵头处室 / 单位', key: 'dept', width: 260, fixed: 'left' },
  { title: '项目数（个）', key: 'count', width: 120, align: 'right' },
  { title: '建设总投资（万元）', dataIndex: 'investmentWan', key: 'investmentWan', width: 180, align: 'right' },
  { title: '中央专项资金（万元）', dataIndex: 'centralWan', key: 'centralWan', width: 190, align: 'right' },
  { title: '已拨付（万元）', key: 'paid', width: 160, align: 'right' },
  { title: '各阶段项目数量（立项 / 采购 / 建设 / 验收）', key: 'phase', width: 340 },
  { title: '高风险', key: 'risk', width: 140 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' },
]

const projectColumns: TableColumnType[] = [
  { title: '项目名称', key: 'name', width: 320 },
  { title: '采购人 / 建设单位', dataIndex: 'owner', key: 'owner', width: 200 },
  { title: '阶段', key: 'phase', width: 90 },
  { title: '整体进度', key: 'progress', width: 200 },
  { title: '建设总投资（万元）', dataIndex: 'investmentWan', key: 'investmentWan', width: 180, align: 'right' },
  { title: '中央专项资金（万元）', dataIndex: 'centralWan', key: 'centralWan', width: 190, align: 'right' },
  { title: '风险', key: 'risk', width: 110 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个牵头处室 / 单位`,
}

/** 处室统计表自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
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

/** 处室项目数量分布（四阶段堆叠，便于看出各处室所处阶段结构） */
const deptOption = computed<ChartOption>(() => {
  const sorted = [...deptStats].sort((a, b) => a.count - b.count)
  return {
    grid: { left: 180, right: 48, top: 32, bottom: 32 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, icon: 'circle' },
    xAxis: { type: 'value', name: '项目数（个）', splitLine: { lineStyle: { type: 'dashed' } } },
    yAxis: { type: 'category', data: sorted.map((d) => d.dept), axisLabel: { fontSize: 12 } },
    series: PHASE_ORDER.map((phase) => ({
      name: phase,
      type: 'bar',
      stack: 'phase',
      barWidth: 16,
      itemStyle: { color: PHASE_COLOR[phase] },
      data: sorted.map((d) => d.phaseCount[phase]),
    })),
  }
})

/** 导出按处室统计表 */
function exportDept() {
  exportExcel(`按牵头处室统计-${TODAY}`, [
    {
      name: '牵头处室统计',
      header: [
        '牵头处室 / 单位',
        '项目数（个）',
        '建设总投资（万元）',
        '中央专项资金（万元）',
        '已拨付（万元）',
        '拨付率',
        '立项（个）',
        '采购（个）',
        '建设（个）',
        '验收（个）',
        '高风险项目（个）',
      ],
      rows: rows.value.map((r) => [
        r.dept,
        r.count,
        r.investmentWan,
        r.centralWan,
        r.paidWan,
        r.paidRate,
        r.phaseCount.立项,
        r.phaseCount.采购,
        r.phaseCount.建设,
        r.phaseCount.验收,
        r.highRisk,
      ]),
      colWidth: [26, 12, 20, 22, 18, 10, 12, 12, 12, 12, 16],
    },
  ])
  message.success('按牵头处室统计已导出，可在下载目录查看 Excel 文件')
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
  // 页头 / KPI 行 / 图表卡片 / 筛选卡片均为固定区：保持自然高度，只让下方表格卡片占满剩余高度
  flex: none;
}

// 页头与图表卡片均为固定区：图表本身不滚动，卡片保持自然高度，不参与剩余高度分配
.page-head,
.chart-block {
  flex: none;
}

.panel {
  padding: 14px 16px 16px;
  margin-bottom: 12px;

  &.filter {
    padding-bottom: 16px;
    flex: none;
  }
}

// 处室统计表卡片：占满筛选区以下的剩余高度，表格在卡片内部滚动
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;

  // 自适应高度以 .ant-card-body 为测量基准（clientHeight 已排除内边距），
  // 因此这里覆盖内边距不影响表体高度计算，只为与页内其它 .panel 卡片保持一致
  :deep(.ant-card-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 14px 16px 16px;
  }
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  .spacer {
    flex: 1;
  }

  .hint {
    font-size: 13px;
    color: @text-2;

    b {
      color: @primary;
    }
  }
}

.dept {
  font-weight: 600;
  color: @primary;
  cursor: pointer;
}

.strong {
  font-weight: 600;
  color: @text-1;
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;
}

.num-table :deep(.ant-table-tbody),
.num-table :deep(.ant-table-thead) {
  font-variant-numeric: tabular-nums;
}

.expand {
  padding: 4px 8px 8px 40px;
  background: @bg-page;

  &-head {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: @text-1;
  }
}
</style>
