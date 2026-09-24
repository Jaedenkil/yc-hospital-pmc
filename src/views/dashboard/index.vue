<template>
  <div class="pmc-page">
    <!-- KPI 总览 -->
    <div class="kpi-row">
      <div v-for="k in kpis" :key="k.label" class="kpi pmc-card">
        <div class="kpi-label">{{ k.label }}</div>
        <div class="kpi-value pmc-metric">
          {{ k.value }}<span class="unit">{{ k.unit }}</span>
        </div>
        <div class="kpi-sub">{{ k.sub }}</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
      <div class="pmc-card panel">
        <div class="panel-title">各阶段项目数量分布</div>
        <div ref="phaseEl" class="chart"></div>
      </div>
      <div class="pmc-card panel">
        <div class="panel-title">子任务状态分布（五色标记）</div>
        <div ref="statusEl" class="chart"></div>
      </div>
      <div class="pmc-card panel">
        <div class="panel-title">资金拨付进度（中央专项 / 其他资金）</div>
        <div ref="fundEl" class="chart"></div>
      </div>
    </div>

    <!-- 重点提示 -->
    <div class="pmc-card panel">
      <div class="panel-title">
        重点项目推进情况
        <a class="more" @click="$router.push('/projects')">查看全部 →</a>
      </div>
      <a-table :columns="columns" :data-source="topProjects" :pagination="false" size="middle" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a @click="$router.push(`/projects/${record.id}`)">{{ record.name }}</a>
            <div class="sub">{{ record.id }} · {{ record.owner }}</div>
          </template>
          <template v-else-if="column.key === 'phase'">
            <a-tag color="blue">{{ record.phase }}</a-tag>
          </template>
          <template v-else-if="column.key === 'progress'">
            <a-progress :percent="record.progress" :stroke-color="record.progressColor" size="small" />
          </template>
          <template v-else-if="column.key === 'risk'">
            <a-tag :color="riskColor(record.riskLevel)">{{ RISK_LABEL[record.riskLevel] }}风险</a-tag>
          </template>
          <template v-else-if="column.key === 'delay'">
            <span v-if="record.delayCount" class="warn-text">{{ record.delayCount }} 项滞后</span>
            <span v-else class="ok-text">正常</span>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import { RISK_LABEL, TASK_STATUS_LABEL } from '@/mock/types'
import type { SubProject, TaskStatus } from '@/mock/types'
import { allProjects, fundSummary, phaseStats, projectProgress, taskStatusStats } from '@/mock'
import { ratio, toYi } from '@/utils/format'

const projects = allProjects()
const summary = fundSummary()
const phases = phaseStats()
const statusStat = taskStatusStats()

/** 金额（元）→ 亿元字符串（2 位小数 + 千分位），口径统一来自 fundSummary() */
function yi(yuan: number): string {
  return Number(toYi(yuan)).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 资金 KPI：拨付拆成「中央专项」与「其他资金」两条线，各自单列金额与拨付率；
// 两条线的合计已拨付不单列卡片，放在「资金结余」卡的脚注里（summary.paid）
const kpis = computed(() => [
  { label: '子项目总数', value: String(projects.length), unit: '个', sub: `覆盖 ${new Set(projects.map((p) => p.leadDept)).size} 个牵头处室` },
  { label: '建设总投资', value: yi(summary.total), unit: '亿元', sub: '示范项目批复总投资' },
  { label: '中央专项资金', value: yi(summary.central), unit: '亿元', sub: `占总投资的 ${ratio(summary.central, summary.total).toFixed(1)}%` },
  { label: '其他资金', value: yi(summary.other), unit: '亿元', sub: `地方配套 + 单位自筹，占 ${ratio(summary.other, summary.total).toFixed(1)}%` },
  { label: '中央专项已拨付', value: yi(summary.centralPaid), unit: '亿元', sub: `拨付率 ${summary.paidRate.toFixed(1)}%（对中央专项）· 待拨 ${yi(summary.centralPending)} 亿元` },
  { label: '其他资金已拨付', value: yi(summary.otherPaid), unit: '亿元', sub: `地方配套 ${yi(summary.localPaid)} / 单位自筹 ${yi(summary.selfPaid)} 亿元 · 拨付率 ${summary.otherPaidRate.toFixed(1)}%` },
  { label: '已使用', value: yi(summary.used), unit: '亿元', sub: `使用率 ${summary.usedRate.toFixed(1)}%（对已拨付）· 其中其他资金 ${yi(summary.otherUsed)} 亿元` },
  { label: '资金结余', value: yi(summary.balance), unit: '亿元', sub: `已拨付合计 ${yi(summary.paid)} 亿元中的未使用部分` },
])

/** 重点关注：有滞后任务在前，其次进行中 */
const topProjects = computed(() =>
  [...projects]
    .map((p) => {
      const progress = projectProgress(p)
      return {
        ...p,
        progress,
        progressColor: progressColor(progress),
        delayCount: p.tasks.filter((t) => t.status === 'overdue' || t.status === 'warn').length,
      }
    })
    .sort((a, b) => b.delayCount - a.delayCount || b.progress - a.progress)
    .slice(0, 6),
)

const columns = [
  { title: '项目名称', key: 'name', width: 320 },
  { title: '阶段', key: 'phase', width: 90 },
  { title: '整体进度', key: 'progress', width: 200 },
  { title: '风险等级', key: 'risk', width: 110 },
  { title: '子任务', key: 'delay', width: 110 },
]

function progressColor(p: number): string {
  if (p >= 80) return '#52c41a'
  if (p >= 40) return '#1677ff'
  return '#faad14'
}

function riskColor(level: SubProject['riskLevel']): string {
  return level === 'high' ? 'red' : level === 'mid' ? 'orange' : 'green'
}

// ---------------- ECharts ----------------
const phaseEl = ref<HTMLDivElement | null>(null)
const statusEl = ref<HTMLDivElement | null>(null)
const fundEl = ref<HTMLDivElement | null>(null)
const charts: echarts.ECharts[] = []

function initCharts() {
  if (phaseEl.value) {
    const c = echarts.init(phaseEl.value)
    c.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '68%'],
          center: ['50%', '45%'],
          label: { formatter: '{b}\n{c} 个' },
          data: Object.entries(phases).map(([name, value]) => ({ name, value })),
        },
      ],
      color: ['#722ed1', '#faad14', '#1677ff', '#52c41a'],
    })
    charts.push(c)
  }

  if (statusEl.value) {
    const order: TaskStatus[] = ['done', 'doing', 'warn', 'overdue', 'not-started']
    const c = echarts.init(statusEl.value)
    c.setOption({
      grid: { left: 70, right: 24, top: 16, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: order.map((k) => TASK_STATUS_LABEL[k]) },
      series: [
        {
          type: 'bar',
          barWidth: 16,
          data: order.map((k) => ({
            value: statusStat[k],
            itemStyle: {
              color:
                k === 'done'
                  ? '#52c41a'
                  : k === 'doing'
                    ? '#1677ff'
                    : k === 'warn'
                      ? '#faad14'
                      : k === 'overdue'
                        ? '#ff4d4f'
                        : '#d9d9d9',
              borderRadius: [0, 4, 4, 0],
            },
          })),
          label: { show: true, position: 'right' },
        },
      ],
    })
    charts.push(c)
  }

  if (fundEl.value) {
    // 先把原来「已拨付」的混合口径拆成两条线：
    // 中央专项拨付率 = 中央已拨付 ÷ 中央专项资金；其他资金拨付率 = 其他已拨付 ÷（地方配套 + 单位自筹）
    // 两个比率均直接取自 fundSummary()，此处不做任何累加
    const centralPct = Number(summary.paidRate.toFixed(1))
    const otherPct = Number(summary.otherPaidRate.toFixed(1))
    const c = echarts.init(fundEl.value)
    c.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          radius: '58%',
          center: ['26%', '54%'],
          progress: { show: true, width: 12, itemStyle: { color: '#1677ff' } },
          axisLine: { lineStyle: { width: 12, color: [[1, '#e8eefb']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            fontSize: 18,
            color: '#1a5fd0',
            offsetCenter: [0, '-4%'],
          },
          title: { show: true, offsetCenter: [0, '30%'], fontSize: 12, color: '#86909c' },
          data: [{ value: centralPct, name: '中央专项拨付率' }],
        },
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          radius: '58%',
          center: ['74%', '54%'],
          progress: { show: true, width: 12, itemStyle: { color: '#722ed1' } },
          axisLine: { lineStyle: { width: 12, color: [[1, '#f0e9fb']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          detail: {
            valueAnimation: true,
            formatter: '{value}%',
            fontSize: 18,
            color: '#6d28d9',
            offsetCenter: [0, '-4%'],
          },
          title: { show: true, offsetCenter: [0, '30%'], fontSize: 12, color: '#86909c' },
          data: [{ value: otherPct, name: '其他资金拨付率' }],
        },
      ],
    })
    charts.push(c)
  }
}

function onResize() {
  charts.forEach((c) => c.resize())
}

onMounted(() => {
  initCharts()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  charts.forEach((c) => c.dispose())
})
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.kpi-row {
  display: grid;
  // 8 张卡（含中央专项/其他资金两条拨付线）分两行四列排布
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.kpi {
  padding: 14px 16px;
  border-top: 3px solid @primary;

  &-label {
    font-size: 13px;
    color: @text-3;
  }

  &-value {
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

  &-sub {
    margin-top: 4px;
    font-size: 12px;
    color: @text-3;
  }
}

.chart-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.panel {
  padding: 14px 16px 16px;

  &-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 15px;
    font-weight: 600;
    color: @text-1;

    .more {
      font-size: 13px;
      font-weight: 400;
      color: @primary;
    }
  }
}

.chart {
  height: 240px;
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.warn-text {
  color: @status-overdue;
}

.ok-text {
  color: @status-done;
}
</style>
