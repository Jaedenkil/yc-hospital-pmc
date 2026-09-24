<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="项目数量分类统计"
      desc="按四大阶段、子任务五色状态、投资规模区间与风险等级对示范子项目分类归集，口径与项目台账一致"
      tag="模块 2"
    >
      <a-button v-if="user.can('report:export')" @click="exportStat">
        <template #icon><DownloadOutlined /></template>
        导出统计汇总
      </a-button>
      <a-button type="primary" @click="$router.push('/statistics/dept')">
        <template #icon><TeamOutlined /></template>
        按牵头处室统计
      </a-button>
    </PageHeader>

    <!-- 看板主体：占满页头以下的剩余高度，各个统计 / 图表卡片保持自然高度，内容超出在主体内部滚动 -->
    <div class="board pmc-scroll">
      <!-- 四阶段项目数量 KPI -->
      <div class="kpi-row">
        <StatCard v-for="card in phaseCards" :key="card.label" v-bind="card" />
      </div>

      <!-- 总体规模与风险 KPI -->
      <div class="kpi-row">
        <StatCard v-for="card in overallCards" :key="card.label" v-bind="card" />
      </div>

      <!-- 可下钻图表：各阶段占比 + 子任务五色状态 -->
      <div class="chart-row">
        <div class="pmc-card panel">
          <div class="panel-head">
            <span class="panel-title">各阶段项目数量占比</span>
            <span class="panel-tip">点击扇区 → 项目台账按阶段筛选</span>
          </div>
          <div ref="phaseEl" class="chart"></div>
        </div>
        <div class="pmc-card panel">
          <div class="panel-head">
            <span class="panel-title">子任务状态分布（五色标记）</span>
            <span class="panel-tip">灰 · 蓝 · 绿 · 黄 · 红 对应五色状态</span>
          </div>
          <div ref="statusEl" class="chart"></div>
        </div>
      </div>

      <!-- 投资规模区间 + 风险等级 -->
      <div class="chart-row">
        <ChartCard
          title="投资规模区间分布"
          desc="柱：项目数（个）· 折线：建设总投资（亿元）"
          :option="investOption"
          height="280px"
        />
        <ChartCard
          title="风险等级分布"
          desc="风险等级由子任务滞后情况自动标记"
          :option="riskOption"
          height="280px"
        />
      </div>

      <!-- 各阶段项目数量与风险结构（固定 4 行数据，无分页，按自然高度展示） -->
      <div class="pmc-card panel block">
        <div class="panel-head">
          <span class="panel-title">各阶段项目数量与风险结构</span>
          <span class="panel-tip">金额单位：万元 · 平均进度为阶段内项目整体完成度均值</span>
        </div>
        <a-table
          class="num-table"
          :columns="phaseColumns"
          :data-source="phaseRows"
          row-key="phase"
          size="middle"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'phase'">
              <a-tag :color="record.phaseTag">{{ record.phase }}</a-tag>
            </template>
            <template v-else-if="column.key === 'risk'">
              <span class="risk-cell">
                低 <b class="risk-low">{{ record.low }}</b>
                · 中 <b class="risk-mid">{{ record.mid }}</b>
                · 高 <b class="risk-high">{{ record.high }}</b>
              </span>
            </template>
            <template v-else-if="column.key === 'progress'">
              <a-progress :percent="record.progress" :stroke-color="record.progressColor" size="small" />
            </template>
          </template>
        </a-table>
        <a-empty v-if="!phaseRows.length" description="暂无数据" />
      </div>

      <!-- 投资规模区间明细（固定 4 行数据，无分页，按自然高度展示） -->
      <div class="pmc-card panel block">
        <div class="panel-head">
          <span class="panel-title">投资规模区间明细</span>
          <span class="panel-tip">区间划分：3000 万元以下 / 3000 万~8000 万 / 8000 万~1.5 亿 / 1.5 亿以上</span>
        </div>
        <a-table
          class="num-table"
          :columns="rangeColumns"
          :data-source="rangeRows"
          row-key="key"
          size="middle"
          :pagination="false"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'sample'">
              <span>{{ record.sample }}</span>
            </template>
            <template v-else-if="column.key === 'centralShare'">
              <span>{{ record.centralShare }}</span>
            </template>
          </template>
        </a-table>
        <a-empty v-if="!rangeRows.length" description="暂无数据" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 项目数量分类统计看板：四阶段 KPI + 阶段占比 / 五色状态分布（可点击下钻）+ 投资规模区间 + 风险等级
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumnType } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined, TeamOutlined } from '@ant-design/icons-vue'
import { PHASE_ORDER, RISK_LABEL, TASK_STATUS_LABEL } from '@/mock/types'
import type { Phase, RiskLevel, TaskStatus } from '@/mock/types'
import { TODAY, allProjects, fundSummary, phaseStats, projectProgress, riskStats, taskStatusStats } from '@/mock'
import { delayCountOf, groupByPhase, statsByInvestRange } from '@/utils/stats'
import { ratio, toWan, toYi } from '@/utils/format'
import { exportExcel } from '@/utils/export'
import type { ChartOption } from '@/utils/echarts'
import { useChart } from '@/composables/useChart'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
const router = useRouter()
const projects = allProjects()

/** 阶段配色（取自设计令牌，与令牌一致：政务蓝 → 蓝 → 黄 → 绿） */
const PHASE_COLOR: Record<Phase, string> = {
  立项: '#1a5fd0',
  采购: '#1677ff',
  建设: '#faad14',
  验收: '#52c41a',
}

/** 阶段标签色（表格用） */
const PHASE_TAG: Record<Phase, string> = { 立项: 'blue', 采购: 'cyan', 建设: 'orange', 验收: 'green' }

/** 子任务五色状态顺序与配色（全站统一口径） */
const STATUS_ORDER: TaskStatus[] = ['not-started', 'doing', 'done', 'warn', 'overdue']
const STATUS_COLOR: Record<TaskStatus, string> = {
  'not-started': '#d9d9d9',
  doing: '#1677ff',
  done: '#52c41a',
  warn: '#faad14',
  overdue: '#ff4d4f',
}

const RISK_ORDER: RiskLevel[] = ['low', 'mid', 'high']
const RISK_COLOR: Record<RiskLevel, string> = { low: '#52c41a', mid: '#faad14', high: '#ff4d4f' }

const phases = phaseStats()
const statusStat = taskStatusStats()
const riskStat = riskStats()
const summary = fundSummary()

/** 各阶段汇总：项目数、金额、风险结构、滞后任务、平均进度 */
const phaseRows = computed(() =>
  groupByPhase(projects).map(({ phase, list }) => {
    const investment = list.reduce((s, p) => s + p.totalInvestment, 0)
    const central = list.reduce((s, p) => s + p.centralFund, 0)
    const progress = list.length
      ? Math.round(list.reduce((s, p) => s + projectProgress(p), 0) / list.length)
      : 0
    return {
      phase,
      // 阶段标签色在 script 内预计算：表格 slot 的 record 为宽松记录，模板内不可直接用作字面量联合键索引
      phaseTag: PHASE_TAG[phase],
      count: list.length,
      share: `${ratio(list.length, projects.length).toFixed(1)}%`,
      investmentWan: Number(toWan(investment)),
      centralWan: Number(toWan(central)),
      low: list.filter((p) => p.riskLevel === 'low').length,
      mid: list.filter((p) => p.riskLevel === 'mid').length,
      high: list.filter((p) => p.riskLevel === 'high').length,
      delay: list.reduce((s, p) => s + delayCountOf(p), 0),
      progress,
      progressColor: progressColor(progress),
    }
  }),
)

/** 投资规模区间汇总（含中央资金占比与代表项目） */
const rangeRows = computed(() =>
  statsByInvestRange(projects).map((r) => {
    const central = r.list.reduce((s, p) => s + p.centralFund, 0)
    return {
      key: r.key,
      label: r.label,
      count: r.count,
      share: `${ratio(r.count, projects.length).toFixed(1)}%`,
      investmentWan: Number(toWan(r.investment)),
      centralWan: Number(toWan(central)),
      centralShare: `${ratio(central, r.investment).toFixed(1)}%`,
      avgWan: Number(toWan(r.count ? r.investment / r.count : 0)),
      sample: r.list.length
        ? r.list
            .slice(0, 2)
            .map((p) => p.name)
            .join('、') + (r.list.length > 2 ? ` 等 ${r.list.length} 个` : '')
        : '—',
    }
  }),
)

const phaseCards = computed(() =>
  phaseRows.value.map((row) => ({
    label: `${row.phase}阶段项目`,
    value: String(row.count),
    unit: '个',
    sub: `占总数 ${row.share} · 建设投资 ${toYi(phaseInvestment(row.phase))} 亿元`,
    accent: PHASE_COLOR[row.phase],
  })),
)

const overallCards = computed(() => {
  const depts = new Set(projects.map((p) => p.leadDept)).size
  const highRisk = riskStat.high
  const delayTotal = projects.reduce((s, p) => s + delayCountOf(p), 0)
  return [
    {
      label: '子项目总数',
      value: String(projects.length),
      unit: '个',
      sub: `覆盖 ${depts} 个牵头处室 / 单位`,
      accent: '#1a5fd0',
    },
    {
      label: '建设总投资',
      value: toYi(summary.total),
      unit: '亿元',
      sub: `中央专项资金 ${toYi(summary.central)} 亿元`,
      accent: '#1677ff',
    },
    {
      label: '高风险项目',
      value: String(highRisk),
      unit: '个',
      sub: `占总数 ${ratio(highRisk, projects.length).toFixed(1)}%（存在严重滞后子任务）`,
      accent: '#ff4d4f',
    },
    {
      label: '滞后子任务',
      value: String(delayTotal),
      unit: '项',
      sub: '含延期预警与严重滞后，点击左侧状态分布图下钻',
      accent: '#faad14',
    },
  ]
})

/** 单阶段建设总投资 */
function phaseInvestment(phase: Phase): number {
  return projects.filter((p) => p.phase === phase).reduce((s, p) => s + p.totalInvestment, 0)
}

/** 进度配色：与驾驶舱口径一致 */
function progressColor(p: number): string {
  if (p >= 80) return '#52c41a'
  if (p >= 40) return '#1677ff'
  return '#faad14'
}

const phaseColumns: TableColumnType[] = [
  { title: '阶段', key: 'phase', width: 110 },
  { title: '项目数（个）', dataIndex: 'count', key: 'count', width: 120, align: 'right' },
  { title: '占比', dataIndex: 'share', key: 'share', width: 100, align: 'right' },
  { title: '建设总投资（万元）', dataIndex: 'investmentWan', key: 'investmentWan', width: 180, align: 'right' },
  { title: '中央专项资金（万元）', dataIndex: 'centralWan', key: 'centralWan', width: 190, align: 'right' },
  { title: '风险结构（低/中/高）', key: 'risk', width: 200 },
  { title: '滞后子任务（项）', dataIndex: 'delay', key: 'delay', width: 150, align: 'right' },
  { title: '平均进度', key: 'progress', width: 180 },
]

const rangeColumns: TableColumnType[] = [
  { title: '投资规模区间', dataIndex: 'label', key: 'label', width: 200 },
  { title: '项目数（个）', dataIndex: 'count', key: 'count', width: 120, align: 'right' },
  { title: '占比', dataIndex: 'share', key: 'share', width: 100, align: 'right' },
  { title: '建设总投资（万元）', dataIndex: 'investmentWan', key: 'investmentWan', width: 180, align: 'right' },
  { title: '中央专项资金（万元）', dataIndex: 'centralWan', key: 'centralWan', width: 190, align: 'right' },
  { title: '中央资金占比', key: 'centralShare', width: 130, align: 'right' },
  { title: '平均规模（万元）', dataIndex: 'avgWan', key: 'avgWan', width: 160, align: 'right' },
  { title: '代表项目', key: 'sample', width: 420 },
]

// ---------------- 图表（阶段占比 / 五色状态可点击下钻） ----------------

const phaseOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}阶段<br/>项目数：{c} 个（{d}%）' },
  legend: { bottom: 0, icon: 'circle' },
  color: PHASE_ORDER.map((phase) => PHASE_COLOR[phase]),
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c} 个' },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      data: PHASE_ORDER.map((phase) => ({ name: phase, value: phases[phase] })),
    },
  ],
}))

const statusOption = computed<ChartOption>(() => ({
  grid: { left: 88, right: 56, top: 16, bottom: 28 },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}：{c} 项' },
  xAxis: { type: 'value', name: '子任务数（项）', splitLine: { lineStyle: { type: 'dashed' } } },
  yAxis: { type: 'category', inverse: true, data: STATUS_ORDER.map((s) => TASK_STATUS_LABEL[s]) },
  series: [
    {
      type: 'bar',
      barWidth: 18,
      label: { show: true, position: 'right' },
      data: STATUS_ORDER.map((status) => ({
        value: statusStat[status],
        itemStyle: { color: STATUS_COLOR[status], borderRadius: [0, 4, 4, 0] },
      })),
    },
  ],
}))

const investOption = computed<ChartOption>(() => ({
  grid: { left: 58, right: 62, top: 34, bottom: 52 },
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: { bottom: 0, icon: 'circle' },
  xAxis: {
    type: 'category',
    data: rangeRows.value.map((r) => r.label),
    axisLabel: { interval: 0, fontSize: 11, width: 96, overflow: 'break' },
  },
  yAxis: [
    { type: 'value', name: '项目数（个）', nameTextStyle: { fontSize: 11 }, splitLine: { lineStyle: { type: 'dashed' } } },
    { type: 'value', name: '投资（亿元）', nameTextStyle: { fontSize: 11 }, splitLine: { show: false } },
  ],
  series: [
    {
      name: '项目数量（个）',
      type: 'bar',
      barWidth: 28,
      itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top' },
      data: rangeRows.value.map((r) => r.count),
    },
    {
      name: '建设总投资（亿元）',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      symbolSize: 8,
      itemStyle: { color: '#faad14' },
      lineStyle: { color: '#faad14', width: 2 },
      label: { show: true, position: 'top' },
      data: rangeRows.value.map((r) => Number(toYi(r.investmentWan * 10000))),
    },
  ],
}))

const riskOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}风险项目：{c} 个（{d}%）' },
  legend: { bottom: 0, icon: 'circle' },
  color: RISK_ORDER.map((level) => RISK_COLOR[level]),
  series: [
    {
      type: 'pie',
      radius: ['0%', '60%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c} 个' },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      data: RISK_ORDER.map((level) => ({
        name: `${RISK_LABEL[level]}风险`,
        value: riskStat[level],
      })),
    },
  ],
}))

const phaseEl = ref<HTMLDivElement | null>(null)
const statusEl = ref<HTMLDivElement | null>(null)

// 阶段环图：点击扇区带着阶段筛选参数跳到项目台账
useChart(phaseEl, () => phaseOption.value, {
  onInit: (chart) => {
    chart.on('click', (params: { name?: string }) => {
      const name = String(params.name ?? '')
      const phase = PHASE_ORDER.find((p) => p === name)
      if (phase) router.push({ path: '/projects', query: { phase } })
    })
  },
})

// 五色状态柱图：点击任一柱条跳到项目台账查看明细
useChart(statusEl, () => statusOption.value, {
  onInit: (chart) => {
    // echarts 的 on 事件处理器需返回 boolean | void，用 void 丢弃 router.push 的 Promise
    chart.on('click', () => void router.push({ path: '/projects' }))
  },
})

// ---------------- 导出 ----------------

/** 导出统计汇总（阶段 / 投资区间 / 五色状态三张工作表） */
function exportStat() {
  exportExcel(`项目数量分类统计-${TODAY}`, [
    {
      name: '四大阶段项目数量',
      header: [
        '阶段',
        '项目数（个）',
        '占比',
        '建设总投资（万元）',
        '中央专项资金（万元）',
        '低风险（个）',
        '中风险（个）',
        '高风险（个）',
        '滞后子任务（项）',
        '平均进度（%）',
      ],
      rows: phaseRows.value.map((r) => [
        r.phase,
        r.count,
        r.share,
        r.investmentWan,
        r.centralWan,
        r.low,
        r.mid,
        r.high,
        r.delay,
        r.progress,
      ]),
      colWidth: [10, 12, 10, 20, 22, 14, 14, 14, 18, 16],
    },
    {
      name: '投资规模区间分布',
      header: ['投资规模区间', '项目数（个）', '占比', '建设总投资（万元）', '中央专项资金（万元）', '中央资金占比'],
      rows: rangeRows.value.map((r) => [
        r.label,
        r.count,
        r.share,
        r.investmentWan,
        r.centralWan,
        r.centralShare,
      ]),
      colWidth: [20, 12, 10, 20, 22, 14],
    },
    {
      name: '子任务状态分布',
      header: ['子任务状态', '子任务数（项）'],
      rows: STATUS_ORDER.map((status) => [TASK_STATUS_LABEL[status], statusStat[status]]),
      colWidth: [16, 16],
    },
  ])
  message.success('统计汇总已导出（含阶段、投资规模区间、子任务状态三张工作表）')
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 页头固定在顶部（固定区）：不参与看板主体（.board，使用 .pmc-scroll）的高度分配与内部滚动
.page-head {
  flex: none;
}

// 看板主体（模板中的 .board）：内部滚动区右侧留出滚动条间隙，
// 底部留一点空隙，避免滚动到底时最后一张卡片阴影贴住容器边缘
.board {
  padding-right: 6px;
  padding-bottom: 4px;
}

.chart-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.panel {
  padding: 14px 16px 16px;

  &.block {
    margin-bottom: 12px;
  }

  &-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  &-title {
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  &-tip {
    font-size: 12px;
    color: @text-3;
  }
}

.chart {
  height: 260px;
}

.num-table :deep(.ant-table-tbody),
.num-table :deep(.ant-table-thead) {
  font-variant-numeric: tabular-nums;
}

.risk-cell {
  font-variant-numeric: tabular-nums;

  .risk-low {
    color: @status-done;
  }

  .risk-mid {
    color: @status-warn;
  }

  .risk-high {
    color: @status-overdue;
  }
}
</style>
