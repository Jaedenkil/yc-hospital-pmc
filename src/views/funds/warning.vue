<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="资金预警"
      desc="预警口径：超概算（变更累计调增超过批复总投资 5%）· 拨付滞后（超计划拨付时间仍未到账）· 结余过大（已拨付资金使用率低于 60%）；「资金来源」列标注该预警涉及的资金线（中央专项 / 地方配套 / 单位自筹）"
      tag="资金监管"
    >
      <a-button v-if="user.can('report:export')" type="primary" @click="doExport">
        导出预警清单
      </a-button>
      <a-button @click="$router.push('/funds')">返回资金总览</a-button>
    </PageHeader>

    <!-- 按预警类型 / 风险等级统计 -->
    <div class="kpi-row">
      <StatCard
        v-for="k in kpis"
        :key="k.label"
        :label="k.label"
        :value="k.value"
        :unit="k.unit"
        :sub="k.sub"
      />
    </div>

    <!-- 预警清单：占满剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <div class="filter-row">
        <a-select v-model:value="filter.type" :options="typeOptions" style="width: 190px" />
        <a-select v-model:value="filter.level" :options="levelOptions" style="width: 170px" />
        <a-select v-model:value="filter.source" :options="sourceOptions" style="width: 230px" />
        <span class="spacer"></span>
        <a-button @click="resetFilter">重置筛选</a-button>
      </div>
      <div class="filter-summary">
        共筛选出 <b>{{ rows.length }}</b> 条预警 · 超概算 <b>{{ stat.overBudget }}</b> 条 · 拨付滞后
        <b>{{ stat.late }}</b> 条 · 结余过大 <b>{{ stat.bigBalance }}</b> 条 · 高风险
        <b>{{ stat.high }}</b> 条
      </div>
      <div class="source-summary">
        按资金来源（全部预警）：涉及中央专项 <b>{{ stat.central }}</b> 条 · 涉及其他资金（地方配套 +
        单位自筹）<b>{{ stat.other }}</b> 条 · 不对应单条资金线（变更口径）
        <b>{{ stat.noSource }}</b> 条
      </div>

      <!-- 表格容器：筛选与汇总行以下的剩余高度全部给它，表体在此内部滚动 -->
      <div class="table-wrap">
        <a-table
          :columns="columns"
          :data-source="rows"
          :pagination="pagination"
          row-key="id"
          size="middle"
          :scroll="tableScroll"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'project'">
              <a @click="$router.push(`/funds/${record.projectId}`)">{{ record.projectName }}</a>
              <div class="sub">{{ record.projectId }}</div>
            </template>
            <template v-else-if="column.key === 'type'">
              <a-tag :color="typeColor(record.type)">{{ record.type }}</a-tag>
            </template>
            <template v-else-if="column.key === 'source'">
              <div v-if="record.sources.length" class="src-cell">
                <a-tag v-for="s in record.sources" :key="s" :color="sourceColor(s)">{{ s }}</a-tag>
              </div>
              <span v-else class="src-none">—（变更口径）</span>
            </template>
            <template v-else-if="column.key === 'detail'">
              <span class="detail">{{ record.detail }}</span>
            </template>
            <template v-else-if="column.key === 'level'">
              <a-tag :color="record.level === 'high' ? 'red' : 'orange'">
                {{ record.level === 'high' ? '高风险' : '预警' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a @click="$router.push(`/funds/${record.projectId}`)">查看资金台账</a>
            </template>
          </template>
        </a-table>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
// 资金预警清单（需求模块 3）：按预警类型 / 风险等级 / 资金来源统计 + 明细表格 + 导出
// 资金来源维度：中央专项（中央财政拨款）与其他资金（地方配套 + 单位自筹）两条资金线，
// 页面侧按项目的资金批次反查每条预警涉及的资金线，口径与 @/mock 的 fundWarnings 一致
import { computed, reactive } from 'vue'
import { allProjects, fundWarnings, OTHER_SOURCES, TODAY } from '@/mock'
import type { FundSource, FundWarning, SubProject } from '@/mock'
import { exportExcel } from '@/utils/export'
import { fmtPercent, ratio } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()

/** 全部预警（超概算 / 拨付滞后 / 结余过大），口径见 @/mock 的 fundWarnings */
const all = fundWarnings()

/** 资金来源展示顺序：中央专项在前，其他资金（地方配套 + 单位自筹）在后 */
const SOURCE_ORDER: FundSource[] = ['中央专项', ...OTHER_SOURCES]

/** 「其他资金」聚合选项：= 地方配套 + 单位自筹 */
const OTHER_OPTION = '其他资金'

/** 按项目编号反查项目（预警按项目编号定位对应的资金批次） */
function projectOf(id: string): SubProject | undefined {
  return allProjects().find((p) => p.id === id)
}

/**
 * 预警涉及的资金来源（按项目的资金批次反查，与 @/mock 的 fundWarnings 同一批批次，保证与详情文案一致）：
 * · 拨付滞后：已超计划拨付时间仍未到账的批次来源（与 detail 文案同一批批次）；
 * · 结余过大：已拨付批次的来源（结余即这些来源的到账资金未使用完）；
 * · 超概算：变更调增口径，不对应单条资金线，返回空数组。
 */
function sourcesOf(w: FundWarning): FundSource[] {
  const p = projectOf(w.projectId)
  if (!p || w.type === '超概算') return []
  const batches =
    w.type === '拨付滞后'
      ? p.fundPlan.filter((b) => !b.payDate && b.planDate < TODAY)
      : p.fundPlan.filter((b) => b.payDate)
  return SOURCE_ORDER.filter((s) => batches.some((b) => b.source === s))
}

/** 来源标签颜色：中央专项蓝、地方配套青、单位自筹紫 */
function sourceColor(s: FundSource): string {
  return s === '中央专项' ? 'blue' : s === '地方配套' ? 'cyan' : 'purple'
}

/** 来源字符串是否为合法资金来源（筛选下拉值为普通字符串，用于类型收窄） */
function isFundSource(v: string): v is FundSource {
  return SOURCE_ORDER.some((s) => s === v)
}

interface WarningRow extends FundWarning {
  /** 表格行唯一键：项目 + 预警类型 */
  id: string
  /** 该预警涉及的资金来源（超概算为变更口径，为空数组） */
  sources: FundSource[]
}

/** 全量预警行（含资金来源），筛选、统计卡片与导出均取自同一份 */
const allRows: WarningRow[] = all.map((w) => ({
  ...w,
  id: `${w.projectId}-${w.type}`,
  sources: sourcesOf(w),
}))

const filter = reactive({ type: '', level: '', source: '' })

const typeOptions = [
  { value: '', label: '全部预警类型' },
  { value: '超概算', label: '超概算' },
  { value: '拨付滞后', label: '拨付滞后' },
  { value: '结余过大', label: '结余过大' },
]

const levelOptions = [
  { value: '', label: '全部等级' },
  { value: 'high', label: '高风险' },
  { value: 'warn', label: '预警' },
]

const sourceOptions = [
  { value: '', label: '全部资金来源' },
  { value: '中央专项', label: '中央专项' },
  { value: OTHER_OPTION, label: '其他资金（地方配套 + 单位自筹）' },
  { value: '地方配套', label: '地方配套' },
  { value: '单位自筹', label: '单位自筹' },
]

const rows = computed<WarningRow[]>(() =>
  allRows
    .filter((w) => !filter.type || w.type === filter.type)
    .filter((w) => !filter.level || w.level === filter.level)
    .filter(matchSource),
)

/** 行是否命中「资金来源」筛选：选「其他资金」时匹配地方配套 / 单位自筹任一 */
function matchSource(w: WarningRow): boolean {
  if (!filter.source) return true
  if (filter.source === OTHER_OPTION) return w.sources.some((s) => OTHER_SOURCES.includes(s))
  return isFundSource(filter.source) ? w.sources.includes(filter.source) : false
}

/** 按类型 / 等级 / 资金来源统计（卡片与汇总行口径一致，均取自同一份全量预警数据） */
const stat = computed(() => ({
  overBudget: allRows.filter((w) => w.type === '超概算').length,
  late: allRows.filter((w) => w.type === '拨付滞后').length,
  bigBalance: allRows.filter((w) => w.type === '结余过大').length,
  high: allRows.filter((w) => w.level === 'high').length,
  warn: allRows.filter((w) => w.level === 'warn').length,
  total: allRows.length,
  /** 涉及中央专项资金线的预警数 */
  central: allRows.filter((w) => w.sources.includes('中央专项')).length,
  /** 涉及其他资金（地方配套 / 单位自筹）的预警数 */
  other: allRows.filter((w) => w.sources.some((s) => OTHER_SOURCES.includes(s))).length,
  /** 不对应单条资金线的预警数（如超概算的变更口径） */
  noSource: allRows.filter((w) => !w.sources.length).length,
}))

const kpis = computed(() => {
  const s = stat.value
  const share = (n: number) => `占预警总数 ${fmtPercent(ratio(n, s.total))}`
  return [
    { label: '预警总数', value: String(s.total), unit: '条', sub: '三类资金预警合计' },
    { label: '超概算', value: String(s.overBudget), unit: '条', sub: `${share(s.overBudget)} · 高风险` },
    { label: '拨付滞后', value: String(s.late), unit: '条', sub: `${share(s.late)} · 已超计划拨付时间` },
    { label: '结余过大', value: String(s.bigBalance), unit: '条', sub: `${share(s.bigBalance)} · 使用率低于 60%` },
    { label: '高风险预警', value: String(s.high), unit: '条', sub: `预警级 ${s.warn} 条` },
  ]
})

const columns = [
  { title: '项目名称', key: 'project', width: 300 },
  { title: '预警类型', key: 'type', width: 140 },
  { title: '资金来源', key: 'source', width: 200 },
  { title: '预警详情', key: 'detail' },
  { title: '风险等级', key: 'level', width: 130 },
  { title: '操作', key: 'action', width: 150 },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条预警`,
}

/** 预警清单自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素；卡片内还有筛选与汇总行，测量基准取表格容器 */
function setTableCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.table-wrap') ?? root) : null
  tableCardRef.value = host instanceof HTMLElement ? host : null
}

function typeColor(type: FundWarning['type']): string {
  return type === '超概算' ? 'red' : type === '拨付滞后' ? 'orange' : 'gold'
}

function resetFilter() {
  filter.type = ''
  filter.level = ''
  filter.source = ''
}

/** 导出当前筛选结果（含资金来源列，口径与页面表格一致） */
function doExport() {
  exportExcel('资金预警清单', [
    {
      name: '资金预警',
      header: ['项目编号', '项目名称', '预警类型', '资金来源', '预警详情', '风险等级'],
      rows: rows.value.map((w) => [
        w.projectId,
        w.projectName,
        w.type,
        w.sources.length ? w.sources.join('、') : '—（变更口径）',
        w.detail,
        w.level === 'high' ? '高风险' : '预警',
      ]),
      colWidth: [18, 34, 12, 20, 52, 12],
    },
  ])
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 预警清单卡片：占满统计卡片行以下的剩余高度，表格在卡片内部滚动
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

// 表格容器：卡片内筛选与汇总行以下的剩余空间全部给它；
// 最少 240px（表头 47 + 3 行 × 48 + 分页 48），空间不足时撑开卡片、由页面整体滚动
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
  flex-wrap: wrap;

  .spacer {
    flex: 1;
  }
}

.filter-summary {
  flex: none;
  margin: 10px 0 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed @border-color;
  font-size: 13px;
  color: @text-2;

  b {
    color: @primary;
  }
}

// 按资金来源的分类汇总：紧接筛选汇总行，不参与表格高度分配
.source-summary {
  flex: none;
  margin: -4px 0 12px;
  font-size: 12px;
  color: @text-3;

  b {
    color: @primary;
  }
}

// 资金来源标签：多个来源时换行展示
.src-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;

  :deep(.ant-tag) {
    margin-inline-end: 0;
  }
}

.src-none {
  font-size: 12px;
  color: @text-3;
}

.detail {
  color: @text-2;
}

.sub {
  margin-top: 2px;
  font-size: 12px;
  color: @text-3;
  font-variant-numeric: tabular-nums;
}
</style>
