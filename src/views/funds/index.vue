<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="资金总览"
      desc="口径：中央专项资金 = 中央财政拨款；其他资金 = 建设总投资 − 中央专项资金，含地方配套与单位自筹"
      tag="资金监管"
    >
      <a-button v-if="user.can('report:export')" type="primary" @click="exportDetail">导出 Excel</a-button>
      <a-button @click="$router.push('/funds/warning')">资金预警</a-button>
    </PageHeader>

    <!-- 金额 KPI：中央资金与其他资金两条拨付线分开展示 -->
    <div class="kpi-row">
      <template v-for="k in kpis" :key="k.key">
        <!-- 其他资金已拨付：可展开地方配套 / 单位自筹两个子项 -->
        <div v-if="k.key === 'otherPaid'" class="kpi-other" :style="{ '--accent': k.accent }">
          <div class="label">{{ k.label }}</div>
          <div class="value pmc-metric">{{ k.value }}<span class="unit">{{ k.unit }}</span></div>
          <div class="sub">{{ k.sub }}</div>
          <a class="toggle" @click="toggleOtherDetail">
            {{ showOtherDetail ? '收起地方配套 / 单位自筹明细' : '展开地方配套 / 单位自筹明细' }}
          </a>
          <div v-if="showOtherDetail" class="detail">
            <div v-for="d in otherSources" :key="d.source" class="detail-item">
              <span class="name">{{ d.source }}</span>
              <span class="num pmc-metric">{{ moneyAuto(d.paid) }}</span>
              <span class="rate-text">拨付率 {{ fmtPercent(d.paidRate) }}</span>
            </div>
          </div>
        </div>
        <StatCard
          v-else
          :label="k.label"
          :value="k.value"
          :unit="k.unit"
          :sub="k.sub"
          :accent="k.accent"
        />
      </template>
    </div>

    <!-- 拨付构成对比 + 中央资金拨付进度 -->
    <div class="chart-row">
      <ChartCard
        title="拨付构成对比"
        desc="按资金来源：柱为已拨付（亿元）、折线为拨付率"
        :option="sourceCompareOption"
        height="270px"
      />
      <ChartCard
        title="中央资金拨付进度构成"
        desc="分母为中央专项资金总额"
        :option="ringOption"
        height="270px"
      />
      <ChartCard
        title="中央资金拨付率"
        desc="中央已拨付 ÷ 中央专项资金"
        :option="gaugeOption"
        height="270px"
      />
      <ChartCard
        title="各牵头处室拨付率"
        desc="按中央专项资金口径"
        :option="deptOption"
        height="270px"
      />
    </div>

    <div class="pmc-card fund-note">
      <div class="note-item">
        <span class="dot dot-central"></span>
        中央专项已拨付 <MoneyText :value="summary.centralPaid" unit="yi" bold />
        <span class="sub">拨付率 {{ fmtPercent(summary.paidRate) }} · 待拨付 {{ moneyAuto(summary.centralPending) }}</span>
      </div>
      <div class="note-item">
        <span class="dot dot-other"></span>
        其他资金已拨付 <MoneyText :value="summary.otherPaid" unit="yi" bold />
        <span class="sub">
          拨付率 {{ fmtPercent(summary.otherPaidRate) }}（地方配套 {{ moneyAuto(summary.localPaid) }} + 单位自筹
          {{ moneyAuto(summary.selfPaid) }}）
        </span>
      </div>
      <div class="note-item">
        <span class="dot dot-used"></span>
        已使用（全部来源） <MoneyText :value="summary.used" unit="yi" bold />
        <span class="sub">中央 {{ moneyAuto(centralUsed) }} / 其他 {{ moneyAuto(summary.otherUsed) }}</span>
      </div>
      <div class="note-item">
        <span class="dot dot-balance"></span>
        结余（全部来源） <MoneyText :value="summary.balance" unit="yi" bold />
        <span class="sub">已拨付未使用，占拨付合计 {{ fmtPercent(ratio(summary.balance, summary.paid)) }}</span>
      </div>
      <div class="note-tip">
        已拨付 + 待拨付 = 对应资金来源总额；「拨付合计」「结余」为全部资金来源之和
      </div>
    </div>

    <!-- 各项目资金明细表：占满剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <div class="filter-row">
        <a-input
          v-model:value="query.keyword"
          placeholder="搜索项目名称 / 编号"
          allow-clear
          style="width: 220px"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-select v-model:value="query.dept" :options="deptOptions" style="width: 190px" />
        <a-select v-model:value="query.phase" :options="phaseOptions" style="width: 140px" />
        <a-select v-model:value="query.payStatus" :options="payOptions" style="width: 210px" />
        <span class="spacer"></span>
        <a-button @click="resetQuery">重置筛选</a-button>
        <a-button v-if="user.can('report:export')" type="primary" ghost @click="exportDetail">
          导出 Excel
        </a-button>
      </div>
      <div class="filter-summary">
        共筛选出 <b>{{ rows.length }}</b> 个项目 · 建设总投资 <b>{{ wanText(totals.total) }}</b> · 中央资金
        <b>{{ wanText(totals.central) }}</b>（已拨付 <b>{{ wanText(totals.centralPaid) }}</b>）· 其他资金
        <b>{{ wanText(totals.other) }}</b>（已拨付 <b>{{ wanText(totals.otherPaid) }}</b>）· 拨付合计
        <b>{{ wanText(totals.paid) }}</b> · 结余 <b>{{ wanText(totals.balance) }}</b>
      </div>

      <!-- 表格容器：筛选与汇总行以下的剩余高度全部给它，表体在此内部滚动 -->
      <div class="table-wrap">
        <a-table
          v-model:expanded-row-keys="expandedKeys"
          :columns="columns"
          :data-source="rows"
          :pagination="pagination"
          row-key="id"
          size="middle"
          :scroll="{ ...tableScroll, x: 2200 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a @click="$router.push(`/funds/${record.id}`)">{{ record.name }}</a>
              <div class="sub">{{ record.id }} · {{ record.leadDept }}</div>
            </template>
            <template v-else-if="column.key === 'total'">
              <span class="num">{{ record.totalText }}</span>
            </template>
            <template v-else-if="column.key === 'central'">
              <span class="num bold">{{ record.centralText }}</span>
            </template>
            <template v-else-if="column.key === 'centralPaid'">
              <span class="num bold">{{ record.centralPaidText }}</span>
              <div class="sub">中央拨付率 {{ fmtPercent(record.paidRate) }}</div>
            </template>
            <template v-else-if="column.key === 'otherPaid'">
              <span class="num bold">{{ record.otherPaidText }}</span>
              <div class="sub">其他拨付率 {{ fmtPercent(record.otherPaidRate) }}</div>
            </template>
            <template v-else-if="column.key === 'paid'">
              <span class="num">{{ record.paidText }}</span>
              <div class="sub">批次 {{ record.paidBatch }}/{{ record.batchCount }}</div>
            </template>
            <template v-else-if="column.key === 'paidRate'">
              <div class="rate">
                <a-progress
                  :percent="Number(record.paidRate.toFixed(1))"
                  :stroke-color="rateColor(record.paidRate)"
                  size="small"
                />
                <span class="num">{{ fmtPercent(record.paidRate) }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'otherPaidRate'">
              <div class="rate">
                <a-progress
                  :percent="Number(record.otherPaidRate.toFixed(1))"
                  :stroke-color="rateColor(record.otherPaidRate)"
                  size="small"
                />
                <span class="num">{{ fmtPercent(record.otherPaidRate) }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'used'">
              <span class="num">{{ record.usedText }}</span>
            </template>
            <template v-else-if="column.key === 'usedRate'">
              <div class="rate">
                <a-progress
                  :percent="Number(record.usedRate.toFixed(1))"
                  :stroke-color="rateColor(record.usedRate)"
                  size="small"
                />
                <span class="num">{{ fmtPercent(record.usedRate) }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'balance'">
              <span class="num">{{ record.balanceText }}</span>
            </template>
            <template v-else-if="column.key === 'change'">
              <span class="num" :class="record.changeClass">{{ record.changeText }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space :size="8">
                <a @click="toggleSources(record.id)">
                  {{ expandedKeys.includes(record.id) ? '收起来源' : '来源明细' }}
                </a>
                <a @click="$router.push(`/funds/${record.id}`)">资金台账</a>
              </a-space>
            </template>
          </template>

          <!-- 展开行：单个项目按资金来源（中央专项 / 地方配套 / 单位自筹）拆分的应拨、已拨、已用 -->
          <template #expandedRowRender="{ record }">
            <div class="expand">
              <div class="expand-head">
                {{ record.name }} · 资金来源明细
                <span class="expand-sub">中央专项 = 中央财政拨款；地方配套 + 单位自筹 = 其他资金</span>
              </div>
              <div class="source-list">
                <div v-for="s in expandedSources(record)" :key="s.source" class="source-item">
                  <div class="source-name">{{ s.source }}</div>
                  <div class="source-kv">
                    应拨 <b class="num">{{ s.planText }}</b> 万元 · 已拨付
                    <b class="num">{{ s.paidText }}</b> 万元 · 已使用
                    <b class="num">{{ s.usedText }}</b> 万元 · 批次
                    <b class="num">{{ s.batchText }}</b>
                  </div>
                  <div class="rate">
                    <a-progress :percent="s.ratePercent" :stroke-color="s.rateColor" size="small" />
                    <span class="num">{{ s.rateText }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </a-table>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
// 资金总览（需求模块 3）：中央专项资金与其他资金两条拨付线分开展示
// 口径：中央专项资金 = 中央财政拨款（centralFund /「中央专项」批次）；
//      其他资金 = 建设总投资 − 中央专项资金，含地方配套与单位自筹；
//      取数一律走 @/mock 的按来源口径函数，金额一律万元 / 亿元并带千分位（money.ts）
import { computed, reactive, ref } from 'vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import type { FundSource, Phase } from '@/mock/types'
import {
  allProjects,
  byDepartment,
  fundSummary,
  OTHER_SOURCES,
  paidAmount,
  paidAmountOf,
  usedAmount,
  usedAmountOf,
} from '@/mock'
import { DEPARTMENTS } from '@/mock/seed'
import { exportExcel } from '@/utils/export'
import { fmtPercent, ratio } from '@/utils/format'
import type { ChartOption } from '@/utils/echarts'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'
import { groupNumber, wan, wanText, yi, yiText } from './money'

const user = useUserStore()
const projects = allProjects()
const summary = fundSummary()
const deptStats = byDepartment()

/** 资金来源三分类（顺序固定：中央专项 → 地方配套 → 单位自筹） */
const FUND_SOURCES: FundSource[] = ['中央专项', ...OTHER_SOURCES]

/** 各资金来源的图表配色（与五色令牌 / 主色一致的取色，ECharts 无法引用 less 变量） */
const SOURCE_COLORS: Record<FundSource, string> = {
  '中央专项': '#1a5fd0',
  '地方配套': '#1677ff',
  '单位自筹': '#52c41a',
}

/** KPI 顶部强调色（取值同 styles/variables.less 的令牌，内联样式无法引用 less 变量） */
const ACCENT = {
  /** @primary 政务蓝 */
  primary: '#1a5fd0',
  /** @status-done 绿（已拨付） */
  done: '#52c41a',
  /** @status-doing 蓝（其他资金） */
  doing: '#1677ff',
  /** @status-warn 黄（结余） */
  warn: '#faad14',
}

/** 金额（元）→ 万元数值：导出 Excel 用真实数字，避免导出为文本列 */
function wanValue(yuan: number): number {
  return Number((yuan / 1_0000).toFixed(2))
}

/** 金额自适应文本：≥ 1 亿元用亿元、否则万元，均带千分位 */
function moneyAuto(yuan: number, digits = 2): string {
  return Math.abs(yuan) >= 1_0000_0000 ? yiText(yuan, digits) : wanText(yuan, digits)
}

/** 表格展开行：单个项目内某资金来源的汇总（字段全部预计算，模板中直接渲染） */
interface FundSourceRow {
  source: FundSource
  /** 应拨总额（万元，该来源批次金额合计） */
  planText: string
  /** 已拨付（万元） */
  paidText: string
  /** 已使用（万元） */
  usedText: string
  /** 拨付率文本、进度条数值与配色 */
  rateText: string
  ratePercent: number
  rateColor: string
  /** 批次数：已拨 / 计划 */
  batchText: string
}

/** 表格行：在项目数据上预计算资金口径字段与展示文本 */
interface FundRow {
  id: string
  name: string
  leadDept: string
  phase: Phase
  totalInvestment: number
  centralFund: number
  otherFund: number
  centralPaid: number
  otherPaid: number
  localPaid: number
  selfPaid: number
  paid: number
  used: number
  balance: number
  changeNet: number
  paidRate: number
  otherPaidRate: number
  usedRate: number
  batchCount: number
  paidBatch: number
  totalText: string
  centralText: string
  centralPaidText: string
  otherPaidText: string
  paidText: string
  usedText: string
  balanceText: string
  changeText: string
  changeClass: string
  sources: FundSourceRow[]
}

const query = reactive({
  keyword: '',
  dept: '',
  phase: '' as Phase | '',
  payStatus: '' as '' | 'full' | 'partial' | 'none',
})

/** 展开的项目行（row-key 为项目编号） */
const expandedKeys = ref<Array<string | number>>([])

/** KPI 卡「其他资金已拨付」的子项明细展开状态 */
const showOtherDetail = ref(false)

const deptOptions = [
  { value: '', label: '全部牵头处室' },
  ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
]

const phaseOptions = [
  { value: '', label: '全部阶段' },
  { value: '立项', label: '立项阶段' },
  { value: '采购', label: '采购阶段' },
  { value: '建设', label: '建设阶段' },
  { value: '验收', label: '验收阶段' },
]

const payOptions = [
  { value: '', label: '拨付状态：全部' },
  { value: 'full', label: '已全额拨付（全部来源）' },
  { value: 'partial', label: '部分拨付（全部来源）' },
  { value: 'none', label: '尚未拨付（全部来源）' },
]

const rows = computed<FundRow[]>(() =>
  projects
    .filter((p) => {
      if (query.keyword && !`${p.name}${p.id}${p.owner}`.includes(query.keyword)) return false
      if (query.dept && p.leadDept !== query.dept) return false
      if (query.phase && p.phase !== query.phase) return false
      // 拨付状态按「全部资金来源」判定：全额 = 应拨总额（建设总投资）已全部到账
      const paid = paidAmount(p)
      if (query.payStatus === 'full' && paid < p.totalInvestment) return false
      if (query.payStatus === 'partial' && (paid === 0 || paid >= p.totalInvestment)) return false
      if (query.payStatus === 'none' && paid > 0) return false
      return true
    })
    .map((p) => {
      const paid = paidAmount(p) // 全部来源已拨付
      const used = usedAmount(p) // 全部来源已使用
      const centralPaid = paidAmountOf(p, ['中央专项'])
      const localPaid = paidAmountOf(p, ['地方配套'])
      const selfPaid = paidAmountOf(p, ['单位自筹'])
      const otherPaid = localPaid + selfPaid
      const otherFund = p.totalInvestment - p.centralFund
      const changeNet = p.changes.reduce((s, c) => s + c.amount, 0)
      // 展开行：三个资金来源各自的应拨 / 已拨付 / 已使用 / 拨付率
      const sources: FundSourceRow[] = FUND_SOURCES.map((source) => {
        const batches = p.fundPlan.filter((b) => b.source === source)
        const plan = batches.reduce((s, b) => s + b.amount, 0)
        const sourcePaid = batches.filter((b) => b.payDate).reduce((s, b) => s + b.amount, 0)
        const sourceUsed = batches.reduce((s, b) => s + b.used, 0)
        const rate = ratio(sourcePaid, plan)
        return {
          source,
          planText: wan(plan),
          paidText: wan(sourcePaid),
          usedText: wan(sourceUsed),
          rateText: fmtPercent(rate),
          ratePercent: Number(rate.toFixed(1)),
          rateColor: rateColor(rate),
          batchText: `${batches.filter((b) => b.payDate).length}/${batches.length}`,
        }
      })
      return {
        id: p.id,
        name: p.name,
        leadDept: p.leadDept,
        phase: p.phase,
        totalInvestment: p.totalInvestment,
        centralFund: p.centralFund,
        otherFund,
        centralPaid,
        otherPaid,
        localPaid,
        selfPaid,
        paid,
        used,
        balance: paid - used,
        changeNet,
        paidRate: ratio(centralPaid, p.centralFund), // 中央资金拨付率
        otherPaidRate: ratio(otherPaid, otherFund), // 其他资金拨付率
        usedRate: ratio(used, paid),
        batchCount: p.fundPlan.length,
        paidBatch: p.fundPlan.filter((b) => b.payDate).length,
        totalText: wan(p.totalInvestment),
        centralText: wan(p.centralFund),
        centralPaidText: wan(centralPaid),
        otherPaidText: wan(otherPaid),
        paidText: wan(paid),
        usedText: wan(used),
        balanceText: wan(paid - used),
        changeText: changeNet ? wan(changeNet) : '—',
        changeClass: changeNet > 0 ? 'up' : changeNet < 0 ? 'down' : '',
        sources,
      }
    })
    .sort((a, b) => b.centralFund - a.centralFund),
)

/** 筛选结果的资金合计（中央 / 其他两条线各自合计，口径与 KPI 一致） */
const totals = computed(() => {
  const list = rows.value
  return {
    total: list.reduce((s, r) => s + r.totalInvestment, 0),
    central: list.reduce((s, r) => s + r.centralFund, 0),
    other: list.reduce((s, r) => s + r.otherFund, 0),
    centralPaid: list.reduce((s, r) => s + r.centralPaid, 0),
    otherPaid: list.reduce((s, r) => s + r.otherPaid, 0),
    paid: list.reduce((s, r) => s + r.paid, 0),
    balance: list.reduce((s, r) => s + r.balance, 0),
  }
})

/** 单个资金来源的汇总（图表与 KPI 展开子项共用） */
interface SourceStat {
  source: FundSource
  /** 应拨总额 = 该来源全部批次金额合计（中央专项即中央专项资金） */
  plan: number
  /** 已拨付 */
  paid: number
  /** 已使用 */
  used: number
  /** 拨付率（%）= 已拨付 ÷ 应拨总额 */
  paidRate: number
  /** 批次数：计划 / 已拨 */
  batchCount: number
  paidBatch: number
}

/** 按资金来源汇总（取数走 mock 的按来源口径函数，与 fundSummary 同源） */
const sourceStats = computed<SourceStat[]>(() =>
  FUND_SOURCES.map((source) => {
    const batches = projects.flatMap((p) => p.fundPlan).filter((b) => b.source === source)
    const paid = projects.reduce((s, p) => s + paidAmountOf(p, [source]), 0)
    const used = projects.reduce((s, p) => s + usedAmountOf(p, [source]), 0)
    const plan = batches.reduce((s, b) => s + b.amount, 0)
    return {
      source,
      plan,
      paid,
      used,
      paidRate: ratio(paid, plan),
      batchCount: batches.length,
      paidBatch: batches.filter((b) => b.payDate).length,
    }
  }),
)

/** 其他资金明细（地方配套 + 单位自筹）：KPI 卡展开子项用 */
const otherSources = computed(() => sourceStats.value.filter((s) => OTHER_SOURCES.includes(s.source)))

/** 已使用的中央部分：mock 未单独提供，用「全部来源已使用 − 其他资金已使用」扣减得出 */
const centralUsed = computed(() => summary.used - summary.otherUsed)

/** KPI 卡片数据（含强调色与展开标识） */
interface KpiItem {
  key: string
  label: string
  value: string
  unit: string
  sub: string
  accent: string
}

const kpis = computed<KpiItem[]>(() => [
  {
    key: 'total',
    label: '建设总投资',
    value: yi(summary.total),
    unit: '亿元',
    sub: `${projects.length} 个子项目批复总投资合计`,
    accent: ACCENT.primary,
  },
  {
    key: 'central',
    label: '中央专项资金',
    value: yi(summary.central),
    unit: '亿元',
    sub: `中央财政拨款 · 占建设总投资 ${fmtPercent(ratio(summary.central, summary.total))}`,
    accent: ACCENT.primary,
  },
  {
    key: 'centralPaid',
    label: '中央资金已拨付',
    value: yi(summary.centralPaid),
    unit: '亿元',
    sub: `中央拨付率 ${fmtPercent(summary.paidRate)} · 待拨付 ${moneyAuto(summary.centralPending)}`,
    accent: ACCENT.done,
  },
  {
    key: 'otherPaid',
    label: '其他资金已拨付',
    value: yi(summary.otherPaid),
    unit: '亿元',
    sub: `其他拨付率 ${fmtPercent(summary.otherPaidRate)}（对其他资金 ${moneyAuto(summary.other)}）`,
    accent: ACCENT.doing,
  },
  {
    key: 'paid',
    label: '拨付合计',
    value: yi(summary.paid),
    unit: '亿元',
    sub: `中央 ${moneyAuto(summary.centralPaid)} + 其他 ${moneyAuto(summary.otherPaid)}（全部资金来源）`,
    accent: ACCENT.primary,
  },
  {
    key: 'used',
    label: '已使用',
    value: yi(summary.used),
    unit: '亿元',
    sub: `使用率 ${fmtPercent(summary.usedRate)}（对拨付合计，含中央与其他）`,
    accent: ACCENT.done,
  },
  {
    key: 'balance',
    label: '结余',
    value: yi(summary.balance),
    unit: '亿元',
    sub: `全部来源已拨付未使用 · 占拨付合计 ${fmtPercent(ratio(summary.balance, summary.paid))}`,
    accent: ACCENT.warn,
  },
])

function resetQuery() {
  query.keyword = ''
  query.dept = ''
  query.phase = ''
  query.payStatus = ''
}

/** 展开 / 收起「其他资金已拨付」KPI 卡的地方配套 / 单位自筹明细 */
function toggleOtherDetail() {
  showOtherDetail.value = !showOtherDetail.value
}

/**
 * 表格展开行取数：表格 slot 的 record 类型为 Record<string, any>，
 * 这里用宽松参数取出 rows 里预计算好的资金来源明细，模板中即可直接读具体字段（不传整个 record 给具体类型函数）
 */
function expandedSources(record: Record<string, unknown>): FundSourceRow[] {
  return (record.sources ?? []) as FundSourceRow[]
}

/** 展开 / 收起某个项目的资金来源明细 */
function toggleSources(id: string) {
  expandedKeys.value = expandedKeys.value.includes(id)
    ? expandedKeys.value.filter((k) => String(k) !== id)
    : [...expandedKeys.value, id]
}

/** 拨付率 / 使用率配色（与五色令牌一致：达标绿、过半蓝、偏低黄） */
function rateColor(v: number): string {
  if (v >= 80) return '#52c41a'
  if (v >= 50) return '#1677ff'
  return '#faad14'
}

// ---------------- 图表 ----------------

/** 图表 tooltip：回调参数为联合类型，按 unknown 收窄后再读取，避免使用 any */
function fundTooltip(params: unknown): string {
  const raw = Array.isArray(params) ? params[0] : params
  if (!raw || typeof raw !== 'object') return ''
  const item = raw as { name?: string; value?: number | string; percent?: number }
  const value = Number(item.value ?? 0)
  const percent = Number(item.percent ?? 0)
  return `${item.name ?? ''}：${groupNumber(value)} 万元（${percent.toFixed(1)}%）`
}

/** 拨付构成对比图 tooltip：按 dataIndex 取对应资金来源的汇总 */
function sourceTooltip(params: unknown): string {
  const raw = Array.isArray(params) ? params[0] : params
  if (!raw || typeof raw !== 'object') return ''
  const item = raw as { dataIndex?: number }
  const s = sourceStats.value[Number(item.dataIndex ?? 0)]
  if (!s) return ''
  return [
    s.source,
    `应拨总额：${moneyAuto(s.plan)}`,
    `已拨付：${moneyAuto(s.paid)}（${fmtPercent(s.paidRate)}）`,
    `已使用：${moneyAuto(s.used)}`,
    `批次数：${s.paidBatch}/${s.batchCount} 已拨`,
  ].join('<br/>')
}

/** 拨付构成对比：各来源已拨付金额（柱，亿元）+ 拨付率（折线，右轴） */
const sourceCompareOption = computed<ChartOption>(() => {
  const list = sourceStats.value
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: sourceTooltip },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12, color: '#4e5969' },
      data: ['已拨付金额', '拨付率'],
    },
    grid: { left: 52, right: 50, top: 26, bottom: 46 },
    xAxis: {
      type: 'category',
      data: list.map((s) => s.source),
      axisTick: { show: false },
      axisLabel: { fontSize: 12 },
    },
    yAxis: [
      {
        type: 'value',
        name: '亿元',
        nameTextStyle: { fontSize: 11, color: '#86909c' },
        axisLabel: { formatter: '{value}', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f0f1f3' } },
      },
      {
        type: 'value',
        max: 100,
        name: '%',
        nameTextStyle: { fontSize: 11, color: '#86909c' },
        axisLabel: { formatter: '{value}%', fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '已拨付金额',
        type: 'bar',
        barWidth: 34,
        data: list.map((s) => ({
          value: Number((s.paid / 1_0000_0000).toFixed(2)),
          itemStyle: { color: SOURCE_COLORS[s.source] },
        })),
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', formatter: '{c}', fontSize: 11, color: '#4e5969' },
      },
      {
        name: '拨付率',
        type: 'line',
        yAxisIndex: 1,
        symbolSize: 7,
        data: list.map((s) => Number(s.paidRate.toFixed(1))),
        itemStyle: { color: '#faad14' },
        lineStyle: { width: 2, color: '#faad14' },
        label: { show: true, position: 'bottom', formatter: '{c}%', fontSize: 11, color: '#faad14' },
      },
    ],
  }
})

/** 环形图：中央专项资金的拨付构成（已拨付已使用 / 已拨付结余 / 待拨付，合计 = 中央专项资金） */
const ringOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item', formatter: fundTooltip },
  legend: {
    bottom: 0,
    icon: 'circle',
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { fontSize: 12, color: '#4e5969' },
    data: ['已拨付·已使用', '已拨付·结余', '待拨付'],
  },
  series: [
    {
      name: '中央资金构成',
      type: 'pie',
      radius: ['46%', '62%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{d}%', fontSize: 11, color: '#4e5969' },
      labelLine: { length: 8, length2: 8 },
      data: [
        { name: '已拨付·已使用', value: wanValue(centralUsed.value), itemStyle: { color: '#52c41a' } },
        {
          name: '已拨付·结余',
          value: wanValue(summary.centralPaid - centralUsed.value),
          itemStyle: { color: '#faad14' },
        },
        { name: '待拨付', value: wanValue(summary.centralPending), itemStyle: { color: '#1677ff' } },
      ],
    },
    {
      name: '拨付进度',
      type: 'pie',
      radius: ['30%', '40%'],
      center: ['50%', '44%'],
      silent: true,
      label: { show: false },
      data: [
        { name: '已拨付', value: wanValue(summary.centralPaid), itemStyle: { color: '#1a5fd0' } },
        { name: '待拨付', value: wanValue(summary.centralPending), itemStyle: { color: '#d9d9d9' } },
      ],
    },
  ],
}))

/** 仪表盘：中央资金拨付率（中央已拨付 ÷ 中央专项资金） */
const gaugeOption = computed<ChartOption>(() => ({
  tooltip: { formatter: '{b}：{c}%' },
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      radius: '92%',
      progress: { show: true, width: 16, itemStyle: { color: '#1a5fd0' } },
      axisLine: { lineStyle: { width: 16, color: [[1, '#eef4ff']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        fontSize: 26,
        color: '#1a5fd0',
        offsetCenter: [0, '10%'],
      },
      title: { show: true, offsetCenter: [0, '42%'], fontSize: 13, color: '#86909c' },
      data: [{ value: Number(summary.paidRate.toFixed(1)), name: '中央资金拨付率' }],
    },
  ],
}))

/** 各牵头处室中央资金拨付率（按「中央专项」批次汇总，升序排列便于比较差距） */
const deptOption = computed<ChartOption>(() => {
  const list = deptStats
    .map((d) => ({
      dept: d.dept,
      rate: Number(
        ratio(
          d.list.reduce((s, p) => s + paidAmountOf(p, ['中央专项']), 0),
          d.central,
        ).toFixed(1),
      ),
    }))
    .sort((a, b) => a.rate - b.rate)
  return {
    grid: { left: 118, right: 52, top: 8, bottom: 8 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}：{c}%' },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', fontSize: 11 } },
    yAxis: { type: 'category', data: list.map((d) => d.dept), axisLabel: { fontSize: 11 } },
    series: [
      {
        name: '中央资金拨付率',
        type: 'bar',
        barWidth: 12,
        data: list.map((d) => d.rate),
        itemStyle: { color: '#1677ff', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, color: '#4e5969' },
      },
    ],
  }
})

// ---------------- 明细列与导出 ----------------

const columns = [
  { title: '项目名称', key: 'name', width: 280, fixed: 'left' as const },
  { title: '建设总投资（万元）', key: 'total', width: 150, align: 'right' as const },
  { title: '中央专项资金（万元）', key: 'central', width: 170, align: 'right' as const },
  { title: '中央已拨付（万元）', key: 'centralPaid', width: 160, align: 'right' as const },
  { title: '其他已拨付（万元）', key: 'otherPaid', width: 160, align: 'right' as const },
  { title: '拨付合计（万元）', key: 'paid', width: 150, align: 'right' as const },
  { title: '中央拨付率', key: 'paidRate', width: 165 },
  { title: '其他拨付率', key: 'otherPaidRate', width: 165 },
  { title: '已使用（万元）', key: 'used', width: 140, align: 'right' as const },
  { title: '使用率', key: 'usedRate', width: 165 },
  { title: '结余（万元）', key: 'balance', width: 140, align: 'right' as const },
  { title: '变更净额（万元）', key: 'change', width: 150, align: 'right' as const },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个项目`,
}

/** 明细表自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素；卡片内还有筛选与汇总行，测量基准取表格容器 */
function setTableCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.table-wrap') ?? root) : null
  tableCardRef.value = host instanceof HTMLElement ? host : null
}

/** 导出：项目来源明细 + 资金来源构成 + 汇总口径三张工作表（金额单位为万元） */
function exportDetail() {
  exportExcel('资金总览-资金来源拨付明细', [
    {
      name: '各项目资金来源明细',
      header: [
        '项目编号',
        '项目名称',
        '牵头处室',
        '阶段',
        '建设总投资（万元）',
        '中央专项资金（万元）',
        '其他资金（万元）',
        '中央已拨付（万元）',
        '其他已拨付（万元）',
        '其中：地方配套已拨付（万元）',
        '其中：单位自筹已拨付（万元）',
        '拨付合计（万元）',
        '中央拨付率（%）',
        '其他拨付率（%）',
        '已使用（万元）',
        '使用率（%）',
        '结余（万元）',
        '变更净额（万元）',
      ],
      rows: rows.value.map((r) => [
        r.id,
        r.name,
        r.leadDept,
        r.phase,
        wanValue(r.totalInvestment),
        wanValue(r.centralFund),
        wanValue(r.otherFund),
        wanValue(r.centralPaid),
        wanValue(r.otherPaid),
        wanValue(r.localPaid),
        wanValue(r.selfPaid),
        wanValue(r.paid),
        Number(r.paidRate.toFixed(1)),
        Number(r.otherPaidRate.toFixed(1)),
        wanValue(r.used),
        Number(r.usedRate.toFixed(1)),
        wanValue(r.balance),
        wanValue(r.changeNet),
      ]),
      colWidth: [18, 30, 18, 8, 18, 20, 18, 18, 18, 24, 24, 18, 14, 14, 16, 12, 14, 16],
    },
    {
      name: '资金来源构成',
      header: ['资金来源', '应拨总额（万元）', '已拨付（万元）', '拨付率（%）', '已使用（万元）', '批次数（已拨/计划）'],
      rows: [
        ...sourceStats.value.map((s) => [
          s.source,
          wanValue(s.plan),
          wanValue(s.paid),
          Number(s.paidRate.toFixed(1)),
          wanValue(s.used),
          `${s.paidBatch}/${s.batchCount}`,
        ]),
        [
          '合计',
          wanValue(summary.total),
          wanValue(summary.paid),
          Number(ratio(summary.paid, summary.total).toFixed(1)),
          wanValue(summary.used),
          '—',
        ],
      ],
      colWidth: [16, 20, 18, 12, 18, 20],
    },
    {
      name: '资金总览汇总',
      header: ['指标', '金额（万元）', '口径说明'],
      rows: [
        ['建设总投资', wanValue(summary.total), `${projects.length} 个子项目批复总投资合计`],
        [
          '中央专项资金',
          wanValue(summary.central),
          `中央财政拨款，占建设总投资 ${fmtPercent(ratio(summary.central, summary.total))}`,
        ],
        ['其他资金', wanValue(summary.other), '建设总投资 − 中央专项资金，含地方配套与单位自筹'],
        ['中央资金已拨付', wanValue(summary.centralPaid), `中央拨付率 ${fmtPercent(summary.paidRate)}`],
        [
          '其他资金已拨付',
          wanValue(summary.otherPaid),
          `其他拨付率 ${fmtPercent(summary.otherPaidRate)}；其中地方配套 ${wanValue(summary.localPaid)}、单位自筹 ${wanValue(summary.selfPaid)}`,
        ],
        ['拨付合计', wanValue(summary.paid), '中央专项资金 + 其他资金已拨付之和'],
        [
          '已使用',
          wanValue(summary.used),
          `使用率 ${fmtPercent(summary.usedRate)}（对拨付合计）；其中中央 ${wanValue(centralUsed.value)}、其他 ${wanValue(summary.otherUsed)}`,
        ],
        [
          '结余',
          wanValue(summary.balance),
          `已拨付未使用（全部来源），占拨付合计 ${fmtPercent(ratio(summary.balance, summary.paid))}`,
        ],
        ['待拨付（中央专项）', wanValue(summary.centralPending), '中央专项资金尚未拨付部分'],
        ['待拨付（其他资金）', wanValue(summary.other - summary.otherPaid), '其他资金尚未拨付部分'],
      ],
      colWidth: [20, 16, 56],
    },
  ])
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头与金额 KPI / 图表行固定：保持自然高度，不参与剩余高度分配
.page-head {
  flex: none;
}

.kpi-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// KPI 卡「其他资金已拨付」：视觉与 StatCard 一致，底部可展开地方配套 / 单位自筹子项
.kpi-other {
  padding: 14px 16px;
  background: @bg-card;
  border-radius: @radius;
  border-top: 3px solid var(--accent);
  box-shadow: 0 1px 2px rgba(31, 35, 41, 0.04), 0 2px 8px rgba(31, 35, 41, 0.04);

  .label {
    font-size: 13px;
    color: @text-3;
  }

  .value {
    margin-top: 6px;
    font-size: 26px;
    font-weight: 600;
    color: @text-1;
    line-height: 1.2;

    .unit {
      margin-left: 4px;
      font-size: 13px;
      font-weight: 400;
      color: @text-3;
    }
  }

  .sub {
    margin-top: 4px;
    font-size: 12px;
    color: @text-3;
  }

  .toggle {
    display: inline-block;
    margin-top: 6px;
    font-size: 12px;
  }

  .detail {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed @border-color;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: @text-2;

    .name {
      color: @text-3;
    }

    .num {
      font-weight: 600;
      color: @text-1;
    }

    .rate-text {
      color: @text-3;
    }
  }
}

// 图表行：拨付构成对比 + 中央资金拨付进度 + 拨付率 + 处室拨付率
.chart-row {
  flex: none;
  display: grid;
  grid-template-columns: 1.35fr 0.95fr 0.85fr 1.35fr;
  gap: 12px;
  margin-bottom: 12px;
}

// 口径说明条：自然高度，不参与剩余高度分配
.fund-note {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 28px;
  margin-bottom: 12px;
  padding: 12px 16px;

  .note-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: @text-2;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;

    &-central {
      background: @primary;
    }

    &-other {
      background: @status-doing;
    }

    &-used {
      background: @status-done;
    }

    &-balance {
      background: @status-warn;
    }
  }

  .note-tip {
    font-size: 12px;
    color: @text-3;
  }
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

.num {
  font-variant-numeric: tabular-nums;

  &.bold {
    font-weight: 600;
  }

  &.up {
    color: @status-warn;
  }

  &.down {
    color: @status-done;
  }
}

// 明细卡片：占满口径说明条以下的剩余高度，表格在卡片内部滚动
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

.rate {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.ant-progress) {
    flex: 1;
    min-width: 56px;
    margin-bottom: 0;
  }
}

.sub {
  margin-top: 2px;
  font-size: 12px;
  color: @text-3;
}

// 展开行：单个项目三个资金来源的应拨 / 已拨付 / 已使用
.expand {
  padding: 4px 8px 8px;

  .expand-head {
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: @text-1;

    .expand-sub {
      margin-left: 8px;
      font-size: 12px;
      font-weight: 400;
      color: @text-3;
    }
  }

  .source-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .source-item {
    padding: 8px 10px;
    background: @bg-page;
    border-radius: @radius-sm;

    .source-name {
      font-size: 13px;
      font-weight: 600;
      color: @primary;
    }

    .source-kv {
      margin: 6px 0;
      font-size: 12px;
      color: @text-2;
      line-height: 1.7;
    }
  }
}
</style>
