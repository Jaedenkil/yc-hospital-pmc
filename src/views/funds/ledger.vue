<template>
  <div class="pmc-page pmc-page-fill">
    <!-- 项目不存在：404 -->
    <a-result
      v-if="!project"
      class="page-404"
      status="404"
      title="项目不存在"
      sub-title="未找到该编号对应的子项目，请从资金总览进入项目的资金台账"
    >
      <template #extra>
        <a-button type="primary" @click="$router.push('/funds')">返回资金总览</a-button>
      </template>
    </a-result>

    <template v-else>
      <PageHeader
        class="page-head"
        :title="`${info.name} · 资金台账`"
        :desc="`${info.id} · 口径：中央专项资金与其他资金（地方配套 + 单位自筹）分两条拨付线统计，各来源批次金额合计等于该来源资金总额`"
        tag="资金监管"
      >
        <a-button v-if="user.can('report:export')" type="primary" @click="exportLedger">
          导出台账 Excel
        </a-button>
        <a-button @click="$router.push('/funds')">返回资金总览</a-button>
      </PageHeader>

      <!-- 项目信息头 -->
      <div class="pmc-card info-card">
        <div class="info-main">
          <div class="info-tags">
            <a-tag color="blue">{{ info.phase }}</a-tag>
            <a-tag :color="riskColor(info.riskLevel)">{{ RISK_LABEL[info.riskLevel] }}风险</a-tag>
            <a-tag>{{ info.leadDept }}</a-tag>
            <a-tag>{{ batchCount }} 个资金批次（两条拨付线）</a-tag>
          </div>
          <div class="info-content">{{ info.content }}</div>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="k">项目编号</span><span class="v">{{ info.id }}</span>
          </div>
          <div class="info-item">
            <span class="k">采购人 / 建设单位</span><span class="v">{{ info.owner }}</span>
          </div>
          <div class="info-item">
            <span class="k">监理单位</span><span class="v">{{ info.supervisor }}</span>
          </div>
          <div class="info-item">
            <span class="k">计划开工</span><span class="v">{{ info.planStart }}</span>
          </div>
          <div class="info-item">
            <span class="k">计划验收</span><span class="v">{{ info.planAccept }}</span>
          </div>
          <div class="info-item">
            <span class="k">中央批次到账</span>
            <span class="v">{{ centralBatch.arrived }} / {{ centralBatch.total }} 个</span>
          </div>
          <div class="info-item">
            <span class="k">其他批次到账</span>
            <span class="v">{{ otherBatch.arrived }} / {{ otherBatch.total }} 个</span>
          </div>
        </div>
      </div>

      <!-- 两条拨付线金额卡：中央专项资金 / 其他资金（地方配套 + 单位自筹）/ 两者合计 -->
      <div class="line-row">
        <!-- 拨付线一：中央专项资金 -->
        <div class="pmc-card line-card">
          <div class="line-head">
            <span class="line-title">中央专项资金拨付线</span>
            <a-tag color="blue">中央专项</a-tag>
            <span class="line-unit">单位：万元</span>
          </div>
          <div class="line-main">
            <span class="v">{{ wan(central) }}</span><span class="unit">万元</span>
          </div>
          <div class="line-grid">
            <div class="m">
              <span class="k">已拨付</span><span class="v">{{ wan(centralPaid) }}</span>
            </div>
            <div class="m">
              <span class="k">拨付率</span>
              <span class="v strong">{{ fmtPercent(centralPaidRate) }}</span>
            </div>
            <div class="m">
              <span class="k">尚未拨付</span><span class="v">{{ wan(centralPending) }}</span>
            </div>
          </div>
          <div class="line-foot">
            批次到账 {{ centralBatch.arrived }} / {{ centralBatch.total }} 个 · 占建设总投资
            {{ fmtPercent(ratio(central, total)) }}
          </div>
        </div>

        <!-- 拨付线二：其他资金（拆地方配套 / 单位自筹） -->
        <div class="pmc-card line-card">
          <div class="line-head">
            <span class="line-title">其他资金拨付线</span>
            <a-tag color="geekblue">地方配套 + 单位自筹</a-tag>
            <span class="line-unit">单位：万元</span>
          </div>
          <div class="line-main">
            <span class="v">{{ wan(otherFund) }}</span><span class="unit">万元</span>
          </div>
          <div class="line-grid">
            <div class="m">
              <span class="k">已拨付</span><span class="v">{{ wan(otherPaid) }}</span>
            </div>
            <div class="m">
              <span class="k">拨付率</span>
              <span class="v strong">{{ fmtPercent(otherPaidRate) }}</span>
            </div>
            <div class="m">
              <span class="k">尚未拨付</span><span class="v">{{ wan(otherPending) }}</span>
            </div>
          </div>
          <div class="line-split">
            <div class="s">
              <span class="k">地方配套</span>
              已拨付 <span class="v">{{ wan(localPaid) }}</span> / 总额
              <span class="v">{{ wan(localFund) }}</span>（{{ fmtPercent(localPaidRate) }}）
            </div>
            <div class="s">
              <span class="k">单位自筹</span>
              已拨付 <span class="v">{{ wan(selfPaid) }}</span> / 总额
              <span class="v">{{ wan(selfFund) }}</span>（{{ fmtPercent(selfPaidRate) }}）
            </div>
          </div>
          <div class="line-foot">
            批次到账 {{ otherBatch.arrived }} / {{ otherBatch.total }} 个 · 占建设总投资
            {{ fmtPercent(ratio(otherFund, total)) }}
          </div>
        </div>

        <!-- 两条线合计 -->
        <div class="pmc-card line-card">
          <div class="line-head">
            <span class="line-title">两条线合计</span>
            <a-tag>全部资金来源</a-tag>
            <span class="line-unit">单位：万元</span>
          </div>
          <div class="line-main">
            <span class="v">{{ wan(total) }}</span><span class="unit">万元（建设总投资）</span>
          </div>
          <div class="line-grid">
            <div class="m">
              <span class="k">已拨付合计</span><span class="v">{{ wan(paid) }}</span>
            </div>
            <div class="m">
              <span class="k">已使用合计</span><span class="v">{{ wan(used) }}</span>
            </div>
            <div class="m">
              <span class="k">结余资金</span><span class="v">{{ wan(balance) }}</span>
            </div>
          </div>
          <div class="line-foot">
            拨付率（对建设总投资）{{ fmtPercent(totalPaidRate) }} · 使用率（对已拨付）
            {{ fmtPercent(usedRate) }} · 共 {{ batchCount }} 个批次（已到账 {{ paidBatchCount }} 个）
          </div>
        </div>
      </div>

      <!-- 两条线拨付率 + 结余与拨付率说明 -->
      <div class="panel-row">
        <div class="pmc-card ring-card">
          <div class="ring-item">
            <ProgressRing :percent="Number(centralPaidRate.toFixed(1))" :size="96" :stroke-width="10" />
            <div class="ring-label">中央资金拨付率</div>
            <div class="ring-sub num">已拨付 {{ wan(centralPaid) }}</div>
            <div class="ring-sub num">总额 {{ wan(central) }}</div>
          </div>
          <div class="ring-item">
            <ProgressRing :percent="Number(otherPaidRate.toFixed(1))" :size="96" :stroke-width="10" />
            <div class="ring-label">其他资金拨付率</div>
            <div class="ring-sub num">已拨付 {{ wan(otherPaid) }}</div>
            <div class="ring-sub num">总额 {{ wan(otherFund) }}</div>
          </div>
          <div class="ring-item">
            <ProgressRing :percent="Number(usedRate.toFixed(1))" :size="96" :stroke-width="10" />
            <div class="ring-label">已拨付使用率</div>
            <div class="ring-sub num">已使用 {{ wan(used) }}</div>
            <div class="ring-sub num">已拨付 {{ wan(paid) }}</div>
          </div>
          <div class="ring-unit">圆环口径：已拨付（已使用）/ 资金总额，金额单位万元</div>
        </div>

        <div class="pmc-card explain">
          <div class="panel-title">结余资金与两条拨付线说明</div>
          <ul class="explain-list">
            <li>
              建设总投资 <b>{{ wanText(total) }}</b>{{ totalYiHint }}，拆成两条拨付线：中央专项资金
              <b>{{ wanText(central) }}</b>（占 {{ fmtPercent(ratio(central, total)) }}）、其他资金
              <b>{{ wanText(otherFund) }}</b>（占 {{ fmtPercent(ratio(otherFund, total)) }}，其中地方配套
              {{ wanText(localFund) }} + 单位自筹 {{ wanText(selfFund) }}）；两条线各自的批次金额合计等于各自总额。
            </li>
            <li>
              中央这条线：已拨付 <b>{{ wanText(centralPaid) }}</b>，拨付率
              <b>{{ fmtPercent(centralPaidRate) }}</b>；尚未拨付 <b>{{ wanText(centralPending) }}</b>（占中央资金
              {{ fmtPercent(100 - centralPaidRate) }}）。
            </li>
            <li>
              其他资金这条线：已拨付 <b>{{ wanText(otherPaid) }}</b>，拨付率
              <b>{{ fmtPercent(otherPaidRate) }}</b>（地方配套已拨付 {{ wanText(localPaid) }}、单位自筹已拨付
              {{ wanText(selfPaid) }}）；尚未拨付 <b>{{ wanText(otherPending) }}</b>。
            </li>
            <li>
              两条线合计：已拨付 <b>{{ wanText(paid) }}</b>（占建设总投资
              {{ fmtPercent(totalPaidRate) }}），已使用 <b>{{ wanText(used) }}</b>（使用率
              {{ fmtPercent(usedRate) }}）；结余资金 = 已拨付合计 − 已使用 = <b>{{ wanText(balance) }}</b>，占已拨付资金的
              <b>{{ fmtPercent(100 - usedRate) }}</b>。
            </li>
            <li>
              变更累计净额 <b :class="changeNet >= 0 ? 'up' : 'down'">{{ changeNet >= 0 ? '+' : '' }}{{ wanText(changeNet) }}</b>，
              共 {{ changeRows.length }} 条调增调减记录（已审批 {{ changeApprovedCount }} 条、审批中
              {{ changeRows.length - changeApprovedCount }} 条），均为批复后调整建设内容对应的资金。
            </li>
            <li v-if="overdueBatches.length" class="warn">
              存在 <b>{{ overdueBatches.length }}</b> 个批次已超计划拨付时间仍未到账（涉及
              {{ overdueSources }}；最早 {{ overdueBatches[0].planDate }}），已纳入
              <a @click="$router.push('/funds/warning')">资金预警</a> 跟踪。
            </li>
            <li v-else class="ok">
              两条拨付线的批次拨付进度均符合计划安排，无超期未拨付批次，暂无资金拨付预警。
            </li>
          </ul>
        </div>
      </div>

      <!-- 批次拨付台账：按资金来源分组展示，占满上方固定区以下的剩余高度，表体内部滚动（不足 3 行时按实际高度） -->
      <div :ref="setBatchCard" class="pmc-card block table-card">
        <div class="panel-title">
          批次拨付台账
          <span class="panel-desc">
            金额单位：万元 · 按资金来源分组（组末小计为该来源已拨付 / 已使用合计）；各来源批次金额合计等于该来源资金总额
          </span>
        </div>
        <div class="table-wrap">
          <a-table
            :columns="batchColumns"
            :data-source="batchRows"
            :pagination="false"
            row-key="id"
            size="middle"
            :row-class-name="rowClass"
            :scroll="{ ...tableScroll, x: 1120 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'batch'">
                <span :class="record.kind === 'subtotal' ? 'subtotal-text' : 'num'">{{ record.batchText }}</span>
              </template>
              <template v-else-if="column.key === 'source'">
                <a-tag :color="record.sourceColor">
                  {{ record.kind === 'subtotal' ? `${record.source} 小计` : record.source }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'planDate'">
                <span class="num">{{ record.planDate }}</span>
              </template>
              <template v-else-if="column.key === 'payDate'">
                <span v-if="record.payDate" class="num">{{ record.payDate }}</span>
                <span v-else-if="record.kind === 'subtotal'" class="muted">{{ record.paySummary }}</span>
                <span v-else class="muted">尚未拨付</span>
              </template>
              <template v-else-if="column.key === 'amount'">
                <span class="num">{{ record.amountText }}</span>
              </template>
              <template v-else-if="column.key === 'used'">
                <span class="num">{{ record.usedText }}</span>
              </template>
              <template v-else-if="column.key === 'usedRate'">
                <span v-if="record.showRate" class="rate">
                  <a-progress :percent="Number(record.usedRate.toFixed(1))" size="small" />
                  <span class="num">{{ record.usedRateText }}</span>
                </span>
                <span v-else class="muted">—</span>
              </template>
              <template v-else-if="column.key === 'state'">
                <StatusTag v-if="record.kind === 'batch'" :status="record.stateStatus" :text="record.stateText" />
                <span v-else :class="record.stateClass">{{ record.stateText }}</span>
              </template>
            </template>
          </a-table>
        </div>
      </div>

      <!-- 变更调增调减记录：自然高度，不参与剩余高度分配 -->
      <div class="pmc-card block fixed-block">
        <div class="panel-title">
          变更调增 / 调减记录
          <span class="panel-desc">
            累计净额
            <b :class="changeNet >= 0 ? 'up' : 'down'">
              {{ changeNet >= 0 ? '+' : '' }}{{ wanText(changeNet) }}
            </b>
          </span>
        </div>
        <a-table
          :columns="changeColumns"
          :data-source="changeRows"
          :pagination="false"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'date'">
              <span class="num">{{ record.date }}</span>
            </template>
            <template v-else-if="column.key === 'amount'">
              <span class="num" :class="record.up ? 'up' : 'down'">{{ record.amountText }}</span>
            </template>
            <template v-else-if="column.key === 'approved'">
              <a-tag :color="record.approved ? 'green' : 'orange'">
                {{ record.approved ? '已审批' : '审批中' }}
              </a-tag>
            </template>
          </template>
        </a-table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 单项目资金台账（需求模块 3）：项目信息头 + 两条拨付线金额卡 + 批次拨付分组台账 + 变更调增调减 + 结余说明 + 台账导出
// 口径：中央专项资金与「其他资金」（地方配套 + 单位自筹）分两条拨付线统计，合计为两者之和（= 建设总投资口径）
// 金额一律「万元 + 千分位」（建设总投资 ≥ 1 亿元时补亿元提示）；批次台账按资金来源分组，组末小计行为该来源
// 已拨付 / 已使用合计，仅用于分组阅读，不参与批次统计与导出。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  OTHER_SOURCES,
  RISK_LABEL,
  TODAY,
  findProject,
  paidAmount,
  paidAmountOf,
  usedAmount,
  usedAmountOf,
} from '@/mock'
import type { FundBatch, FundSource, RiskLevel, SubProject, TaskStatus } from '@/mock/types'
import { exportExcel } from '@/utils/export'
import { fmtPercent, ratio } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'
import { wan, wanText, yiText } from './money'

const user = useUserStore()
const route = useRoute()

const project = computed(() => findProject(String(route.params.id ?? '')))
/** 正常分支专用：项目不存在时由 404 分支兜底渲染，不会读取该值 */
const info = computed(() => project.value as SubProject)

/** 资金来源展示顺序：中央专项（拨付线一）在前，其后为其他资金的细分来源（拨付线二） */
const SOURCE_ORDER: FundSource[] = ['中央专项', ...OTHER_SOURCES]

/** 资金来源标签配色（Ant Design Vue Tag 预设色） */
const SOURCE_COLOR: Record<FundSource, string> = {
  中央专项: 'blue',
  地方配套: 'geekblue',
  单位自筹: 'purple',
}

// ---------------- 两条拨付线的金额口径 ----------------

const total = computed(() => info.value.totalInvestment)
const central = computed(() => info.value.centralFund)
/** 其他资金总额 = 建设总投资 − 中央专项资金（与 mock 数据层其他资金来源批次合计一致） */
const otherFund = computed(() => total.value - central.value)

/** 某来源的批次金额合计（中央专项合计 = 中央专项资金；其他资金合计 = 建设总投资 − 中央专项资金） */
function sourceTotalOf(p: SubProject, source: FundSource): number {
  return p.fundPlan.filter((b) => b.source === source).reduce((s, b) => s + b.amount, 0)
}

/** 其他资金的两个细分来源总额 */
const localFund = computed(() => sourceTotalOf(info.value, '地方配套'))
const selfFund = computed(() => sourceTotalOf(info.value, '单位自筹'))

// 拨付线一：中央专项资金
const centralPaid = computed(() => paidAmountOf(info.value, ['中央专项']))
const centralPending = computed(() => central.value - centralPaid.value)
const centralPaidRate = computed(() => ratio(centralPaid.value, central.value))

// 拨付线二：其他资金（地方配套 + 单位自筹）
const localPaid = computed(() => paidAmountOf(info.value, ['地方配套']))
const selfPaid = computed(() => paidAmountOf(info.value, ['单位自筹']))
const otherPaid = computed(() => localPaid.value + selfPaid.value)
const otherPending = computed(() => otherFund.value - otherPaid.value)
const otherPaidRate = computed(() => ratio(otherPaid.value, otherFund.value))
const localPaidRate = computed(() => ratio(localPaid.value, localFund.value))
const selfPaidRate = computed(() => ratio(selfPaid.value, selfFund.value))

// 两条线合计（已拨付/已使用取全量口径，等于中央 + 其他之和）
const paid = computed(() => paidAmount(info.value))
const used = computed(() => usedAmount(info.value))
const balance = computed(() => paid.value - used.value)
const totalPaidRate = computed(() => ratio(paid.value, total.value))
const usedRate = computed(() => ratio(used.value, paid.value))

/** 建设总投资达到 1 亿元时补充亿元口径提示（不足 1 亿元返回空串，避免 0.xx 亿元的别扭显示） */
const totalYiHint = computed(() => (total.value >= 1_0000_0000 ? `（约 ${yiText(total.value)}）` : ''))

/** 金额（元）→ 万元数值：导出 Excel 用真实数字列 */
function wanValue(yuan: number): number {
  return Number((yuan / 1_0000).toFixed(2))
}

// ---------------- 批次拨付台账（按资金来源分组 + 组末小计） ----------------

/** 批次台账行：批次行 / 该资金来源小计行（小计行仅用于分组阅读，不参与批次统计与导出） */
interface BatchRow {
  kind: 'batch' | 'subtotal'
  id: string
  source: FundSource
  /** 来源标签配色：模板直读预计算值，避免在 slot 中调用类型化函数 */
  sourceColor: string
  batchText: string
  planDate: string
  /** 已拨付时的实际拨付时间；未拨付为空串 */
  payDate: string
  /** 小计行「实际拨付时间」列文本（如 2/4 批已到账） */
  paySummary: string
  amountText: string
  usedText: string
  usedRate: number
  usedRateText: string
  showRate: boolean
  /** 批次行的五色状态；小计行无状态，为 null */
  stateStatus: TaskStatus | null
  stateText: string
  /** 小计行状态文本配色类（批次行为空串） */
  stateClass: string
}

/** 批次状态：按期拨付 / 逾期拨付 / 逾期未拨付 / 未到计划时间 */
function stateOf(b: FundBatch): { stateStatus: TaskStatus; stateText: string } {
  if (b.payDate) {
    return b.payDate > b.planDate
      ? { stateStatus: 'warn', stateText: '逾期拨付' }
      : { stateStatus: 'done', stateText: '按期拨付' }
  }
  return b.planDate < TODAY
    ? { stateStatus: 'overdue', stateText: '逾期未拨付' }
    : { stateStatus: 'not-started', stateText: '未到计划时间' }
}

/** 批次行：金额/使用额均为万元（千分位），未拨付批次的使用额与使用率以「—」呈现 */
function batchRowOf(p: SubProject, b: FundBatch): BatchRow {
  const arrived = !!b.payDate
  const rate = ratio(b.used, b.amount)
  const state = stateOf(b)
  return {
    kind: 'batch',
    id: `${p.id}-B${b.batch}`,
    source: b.source,
    sourceColor: SOURCE_COLOR[b.source],
    batchText: `第 ${b.batch} 批`,
    planDate: b.planDate,
    payDate: b.payDate ?? '',
    paySummary: '',
    amountText: wan(b.amount),
    usedText: arrived ? wan(b.used) : '—',
    usedRate: rate,
    usedRateText: fmtPercent(rate),
    showRate: arrived,
    stateStatus: state.stateStatus,
    stateText: state.stateText,
    stateClass: '',
  }
}

/**
 * 某来源小计行：金额列统一取该来源「已拨付 / 已使用」合计（列头口径见卡片说明），
 * 使用率分母为已拨付，保证行内数字与比例自洽。
 */
function subtotalRowOf(p: SubProject, source: FundSource, group: FundBatch[]): BatchRow {
  const sourcePaid = paidAmountOf(p, [source])
  const sourceUsed = usedAmountOf(p, [source])
  const arrived = group.filter((b) => b.payDate).length
  const late = group.filter((b) => !b.payDate && b.planDate < TODAY).length
  return {
    kind: 'subtotal',
    id: `${p.id}-${source}-subtotal`,
    source,
    sourceColor: SOURCE_COLOR[source],
    batchText: '小计',
    planDate: '—',
    payDate: '',
    paySummary: `${arrived}/${group.length} 批已到账`,
    amountText: wan(sourcePaid),
    usedText: wan(sourceUsed),
    usedRate: ratio(sourceUsed, sourcePaid),
    usedRateText: fmtPercent(ratio(sourceUsed, sourcePaid)),
    showRate: true,
    stateStatus: null,
    stateText: late ? `逾期 ${late} 个批次` : '无逾期',
    stateClass: late ? 'warn' : 'muted',
  }
}

/** 台账行：中央专项 → 地方配套 → 单位自筹 依次成组展示，每组末尾附一行来源小计 */
const batchRows = computed<BatchRow[]>(() => {
  const p = info.value
  const rows: BatchRow[] = []
  for (const source of SOURCE_ORDER) {
    const group = p.fundPlan.filter((b) => b.source === source)
    if (!group.length) continue
    for (const b of group) rows.push(batchRowOf(p, b))
    rows.push(subtotalRowOf(p, source, group))
  }
  return rows
})

/** 小计行浅色底 + 加粗：仅用于分组阅读（表格数据统计与导出均不含小计行） */
function rowClass(record: BatchRow): string {
  return record.kind === 'subtotal' ? 'row-subtotal' : ''
}

const batchCount = computed(() => info.value.fundPlan.length)
const paidBatchCount = computed(() => info.value.fundPlan.filter((b) => b.payDate).length)

/** 按来源统计批次到账进度（项目信息头展示中央 / 其他两条线的到账情况） */
function batchStatOf(sources: FundSource[]): { arrived: number; total: number } {
  const list = info.value.fundPlan.filter((b) => sources.includes(b.source))
  return { arrived: list.filter((b) => b.payDate).length, total: list.length }
}

const centralBatch = computed(() => batchStatOf(['中央专项']))
const otherBatch = computed(() => batchStatOf(OTHER_SOURCES))

/** 逾期未拨付批次（计划拨付时间已过但仍未到账）：按计划拨付时间升序，说明段的「最早」取排序后的首条 */
const overdueBatches = computed(() =>
  info.value.fundPlan
    .filter((b) => !b.payDate && b.planDate < TODAY)
    .sort((a, b) => (a.planDate < b.planDate ? -1 : 1)),
)
/** 逾期批次涉及的资金来源（如「中央专项、地方配套」） */
const overdueSources = computed(() => [...new Set(overdueBatches.value.map((b) => b.source))].join('、'))

// ---------------- 变更记录 ----------------

interface ChangeRow {
  id: string
  date: string
  reason: string
  amount: number
  approved: boolean
  amountText: string
  up: boolean
}

const changeRows = computed<ChangeRow[]>(() =>
  info.value.changes.map((c) => ({
    id: c.id,
    date: c.date,
    reason: c.reason,
    amount: c.amount,
    approved: c.approved,
    amountText: c.amount > 0 ? `+${wan(c.amount)}` : wan(c.amount),
    up: c.amount > 0,
  })),
)

const changeNet = computed(() => changeRows.value.reduce((s, c) => s + c.amount, 0))

/** 变更审批情况：说明段区分「已审批 / 审批中」，与变更表的审批状态保持一致 */
const changeApprovedCount = computed(() => changeRows.value.filter((c) => c.approved).length)

function riskColor(level: RiskLevel): string {
  return level === 'high' ? 'red' : level === 'mid' ? 'orange' : 'green'
}

// ---------------- 表头 ----------------

const batchColumns = [
  { title: '批次', key: 'batch', width: 90 },
  { title: '资金来源', key: 'source', width: 120 },
  { title: '计划拨付时间', key: 'planDate', width: 128 },
  { title: '实际拨付时间', key: 'payDate', width: 132 },
  { title: '拨付金额（万元）', key: 'amount', width: 150, align: 'right' as const },
  { title: '实际使用（万元）', key: 'used', width: 150, align: 'right' as const },
  { title: '使用率（对拨付）', key: 'usedRate', width: 190 },
  { title: '是否逾期', key: 'state', width: 150 },
]

const changeColumns = [
  { title: '变更编号', key: 'id', width: 110 },
  { title: '变更时间', key: 'date', width: 130 },
  { title: '变更内容', key: 'reason' },
  { title: '金额（万元）', key: 'amount', width: 170, align: 'right' as const },
  { title: '是否已审批', key: 'approved', width: 130 },
]

/** 批次拨付台账自适应高度：表体内部滚动，数据不足时至少留 3 行（middle 行高约 48px） */
const { wrapRef: batchCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素；卡片内还有标题行，测量基准取表格容器 */
function setBatchCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.table-wrap') ?? root) : null
  batchCardRef.value = host instanceof HTMLElement ? host : null
}

// ---------------- 导出 ----------------

/** 导出该台账：项目信息 / 批次拨付（按来源分组） / 变更记录 / 资金汇总四个工作表（金额单位为万元） */
function exportLedger() {
  const p = info.value
  // 导出批次明细：按来源分组排序，不含页面上的小计行
  const batchList = SOURCE_ORDER.flatMap((s) => p.fundPlan.filter((b) => b.source === s))
  exportExcel(`${p.id}-资金台账`, [
    {
      name: '项目信息',
      header: ['字段', '内容'],
      rows: [
        ['项目编号', p.id],
        ['项目名称', p.name],
        ['牵头处室', p.leadDept],
        ['采购人 / 建设单位', p.owner],
        ['监理单位', p.supervisor],
        ['当前阶段', p.phase],
        ['风险等级', `${RISK_LABEL[p.riskLevel]}风险`],
        ['计划开工', p.planStart],
        ['计划验收', p.planAccept],
        ['建设总投资（万元）', wanValue(p.totalInvestment)],
        ['中央专项资金（万元）', wanValue(p.centralFund)],
        ['其他资金（万元）', wanValue(otherFund.value)],
        [
          '资金来源构成',
          `中央专项资金 ${wanValue(central.value)} 万元；其他资金 ${wanValue(otherFund.value)} 万元（地方配套 ${wanValue(localFund.value)} + 单位自筹 ${wanValue(selfFund.value)}）`,
        ],
        [
          '资金批次',
          `${batchCount.value} 个批次（已到账 ${paidBatchCount.value} 个；中央 ${centralBatch.value.arrived}/${centralBatch.value.total}、其他 ${otherBatch.value.arrived}/${otherBatch.value.total}）`,
        ],
        ['归档材料', `${p.docCount} 份`],
        ['建设内容', p.content],
      ],
      colWidth: [18, 76],
    },
    {
      name: '批次拨付台账',
      header: [
        '批次',
        '资金来源',
        '计划拨付时间',
        '实际拨付时间',
        '拨付金额（万元）',
        '实际使用（万元）',
        '使用率（%）',
        '批次状态',
      ],
      rows: batchList.map((b) => [
        `第 ${b.batch} 批`,
        b.source,
        b.planDate,
        b.payDate ?? '尚未拨付',
        wanValue(b.amount),
        b.payDate ? wanValue(b.used) : '—',
        b.payDate ? Number(ratio(b.used, b.amount).toFixed(1)) : '—',
        stateOf(b).stateText,
      ]),
      colWidth: [10, 12, 16, 16, 18, 18, 12, 16],
    },
    {
      name: '变更调增调减',
      header: ['变更编号', '变更时间', '变更内容', '金额（万元）', '是否已审批'],
      rows: changeRows.value.map((c) => [c.id, c.date, c.reason, wanValue(c.amount), c.approved ? '已审批' : '审批中']),
      colWidth: [12, 16, 44, 16, 14],
    },
    {
      name: '资金汇总',
      header: ['指标', '金额（万元）', '口径说明'],
      rows: [
        ['建设总投资', wanValue(p.totalInvestment), '项目批复总投资 = 中央专项资金 + 其他资金'],
        [
          '中央专项资金',
          wanValue(central.value),
          `占建设总投资 ${fmtPercent(ratio(central.value, total.value))}；中央专项批次金额合计与之一致`,
        ],
        [
          '其他资金',
          wanValue(otherFund.value),
          `建设总投资 − 中央专项资金；地方配套 ${wanValue(localFund.value)} + 单位自筹 ${wanValue(selfFund.value)}`,
        ],
        [
          '中央专项资金已拨付',
          wanValue(centralPaid.value),
          `中央资金拨付率 ${fmtPercent(centralPaidRate.value)}；尚未拨付 ${wanValue(centralPending.value)}`,
        ],
        [
          '其他资金已拨付',
          wanValue(otherPaid.value),
          `其他资金拨付率 ${fmtPercent(otherPaidRate.value)}（地方配套 ${wanValue(localPaid.value)}、单位自筹 ${wanValue(selfPaid.value)}）；尚未拨付 ${wanValue(otherPending.value)}`,
        ],
        ['两条线合计已拨付', wanValue(paid.value), `占建设总投资 ${fmtPercent(totalPaidRate.value)}`],
        ['已使用', wanValue(used.value), `使用率 ${fmtPercent(usedRate.value)}（对已拨付）`],
        ['结余', wanValue(balance.value), `已拨付 − 已使用，占已拨付 ${fmtPercent(100 - usedRate.value)}`],
        ['变更净额', wanValue(changeNet.value), `${changeRows.value.length} 条变更记录累计净额`],
      ],
      colWidth: [20, 16, 52],
    },
  ])
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头固定：不参与剩余高度分配
.page-head {
  flex: none;
}

// 项目不存在时的 404 结果页：自然高度
.page-404 {
  flex: none;
}

.info-card {
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 16px 28px;
  margin-bottom: 12px;
  padding: 16px;
}

.info-main {
  min-width: 0;

  .info-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .info-content {
    margin-top: 10px;
    font-size: 13px;
    color: @text-2;
    line-height: 1.7;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
  align-content: start;

  .info-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;

    .k {
      color: @text-3;
      flex: none;
    }

    .v {
      color: @text-1;
      font-variant-numeric: tabular-nums;
      word-break: break-all;
    }
  }
}

// 两条拨付线金额卡：中央专项资金 / 其他资金（地方配套 + 单位自筹）/ 两条线合计
.line-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.line-card {
  padding: 14px 16px;

  .line-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .line-title {
      font-size: 14px;
      font-weight: 600;
      color: @text-1;
    }

    .line-unit {
      margin-left: auto;
      font-size: 12px;
      color: @text-3;
    }
  }

  // 该拨付线的总额（卡片主指标）
  .line-main {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 6px;

    .v {
      font-size: 22px;
      font-weight: 600;
      color: @text-1;
      font-variant-numeric: tabular-nums;
    }

    .unit {
      font-size: 12px;
      color: @text-3;
    }
  }

  // 已拨付 / 拨付率 / 尚未拨付 三项指标
  .line-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px 12px;
    margin-top: 8px;

    .m {
      min-width: 0;

      .k {
        display: block;
        font-size: 12px;
        color: @text-3;
      }

      .v {
        display: block;
        margin-top: 2px;
        font-size: 14px;
        color: @text-1;
        font-variant-numeric: tabular-nums;

        &.strong {
          color: @primary;
          font-weight: 600;
        }
      }
    }
  }

  // 其他资金的细分来源（地方配套 / 单位自筹）
  .line-split {
    margin-top: 8px;
    font-size: 12px;
    color: @text-2;
    line-height: 1.9;

    .k {
      color: @text-3;
      margin-right: 6px;
    }

    .v {
      color: @text-1;
      font-variant-numeric: tabular-nums;
    }
  }

  .line-foot {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed @border-color;
    font-size: 12px;
    color: @text-3;
  }
}

.panel-row {
  flex: none;
  display: grid;
  grid-template-columns: 460px minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.ring-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
  padding: 16px 12px;

  .ring-item {
    text-align: center;
  }

  .ring-label {
    margin-top: 6px;
    font-size: 13px;
    color: @text-2;
  }

  .ring-sub {
    margin-top: 2px;
    font-size: 12px;
    color: @text-3;
    font-variant-numeric: tabular-nums;
  }

  .ring-unit {
    flex: 0 0 100%;
    margin-top: 4px;
    text-align: center;
    font-size: 12px;
    color: @text-3;
  }
}

.explain {
  padding: 14px 16px;

  .explain-list {
    margin: 6px 0 0;
    padding-left: 18px;
    font-size: 13px;
    color: @text-2;
    line-height: 2;

    b {
      color: @text-1;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    .up {
      color: @status-warn;
    }

    .down {
      color: @status-done;
    }

    .warn {
      color: @status-overdue;
    }

    .ok {
      color: @status-done;
    }
  }
}

.block {
  margin-bottom: 12px;
  padding: 14px 16px 4px;
}

// 批次拨付台账（主表）：占满上方固定区以下的剩余高度，表体在卡片内部滚动。
// 注意用 flex-shrink: 0（写作 flex: 1 0 auto）——空间充足时长满剩余高度，
// 空间不足时保持内容高度而不被压扁；否则卡片会被压到只剩内边距，表格从卡片里溢出。
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

// 非主表分区（变更调增 / 调减记录等）：保持自然高度，不参与剩余高度分配
.fixed-block {
  flex: none;
}

// 表格容器：卡片内标题行以下的剩余空间全部给它；
// 最少 192px（表头 47 + 3 行 × 48，本表无分页），空间不足时撑开卡片、由页面整体滚动
.table-wrap {
  flex: 1;
  min-height: 192px;
  display: flex;
  flex-direction: column;
}

// 分区标题行固定：不参与卡片内的剩余高度分配
.panel-title {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 15px;
  font-weight: 600;
  color: @text-1;

  .panel-desc {
    font-size: 12px;
    font-weight: 400;
    color: @text-3;
  }
}

// 来源小计行：浅色底 + 加粗，仅用于按来源分组阅读
:deep(.ant-table-tbody tr.row-subtotal > td) {
  background: @primary-bg;
  font-weight: 600;
}

// 悬停时保持分组底纹（加深一档），避免小计行 hover 后被默认灰底抹掉辨识度
:deep(.ant-table-tbody tr.row-subtotal:hover > td) {
  background: @primary-border;
}

.subtotal-text {
  color: @primary;
  font-weight: 600;
}

.warn {
  color: @status-warn;
}

.num {
  font-variant-numeric: tabular-nums;

  &.up {
    color: @status-warn;
  }

  &.down {
    color: @status-done;
  }
}

.rate {
  display: flex;
  align-items: center;
  gap: 8px;

  :deep(.ant-progress) {
    flex: 1;
    min-width: 60px;
    margin-bottom: 0;
  }
}

.muted {
  color: @text-3;
}
</style>
