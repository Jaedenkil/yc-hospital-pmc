<template>
  <div class="pmc-page">
    <!-- 未知报表：404 -->
    <a-result
      v-if="!report"
      status="404"
      title="报表不存在"
      sub-title="未找到该报表标识，请从报表中心选择内置报表"
    >
      <template #extra>
        <a-button type="primary" @click="$router.push('/reports')">返回报表中心</a-button>
      </template>
    </a-result>

    <template v-else>
      <PageHeader :title="def.name" :desc="`口径说明：${def.desc}`" tag="报表预览">
        <a-button v-if="user.can('report:export')" type="primary" @click="doExport">导出 Excel</a-button>
        <a-button @click="doPrint">打印 / 导出 PDF</a-button>
        <a-button @click="$router.push('/reports')">返回</a-button>
      </PageHeader>

      <div class="pmc-card report-sheet">
        <!-- 页眉：报表名称 / 统计周期 / 生成时间 -->
        <div class="sheet-head">
          <div class="t">{{ def.name }}</div>
          <div class="meta">
            <span>统计周期：{{ period.label }}（{{ period.start }} ~ {{ period.end }}）</span>
            <span>生成时间：{{ genTime }}</span>
            <span>数据行数：{{ rows.length }} 行（明细行，不含本期汇总 / 合计行）</span>
          </div>
        </div>

        <!-- 报表主体：表头 + 数据行 + 合计行 -->
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th v-for="(h, i) in def.header" :key="i" :style="{ textAlign: def.align[i] }">
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- 本期汇总行（如 delay 报表的「本期应完成 / 本期新增」，随月 / 季切换变化） -->
              <tr v-if="summaryRow" class="summary-row">
                <td v-for="(c, ci) in summaryRow" :key="ci" :style="{ textAlign: def.align[ci] }" class="cell">
                  {{ c }}
                </td>
              </tr>
              <!-- 数据行为空时给出口径提示，避免出现空白表格 -->
              <tr v-if="!rows.length">
                <td :colspan="def.header.length" class="empty-cell">{{ emptyText }}</td>
              </tr>
              <tr v-for="(r, ri) in rows" :key="ri">
                <td v-for="(c, ci) in r" :key="ci" :style="{ textAlign: def.align[ci] }" class="cell">
                  {{ c }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td v-for="(c, ci) in totalRow" :key="ci" :style="{ textAlign: def.align[ci] }" class="cell">
                  {{ c }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- 页脚：数据来源 -->
        <div class="sheet-foot">
          <span>{{ def.source }}</span>
          <span>盐城市公立医院改革与高质量发展示范项目 · 信息化全流程项目管控平台</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// 报表预览（需求模块 4）：按 :key 渲染对应报表的标准表格，支持导出 Excel 与打印 / 导出 PDF
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { parsePeriod, periodOptions } from '@/utils/stats'
import type { PeriodType } from '@/utils/stats'
import { exportExcel, printTable } from '@/utils/export'
import { useUserStore } from '@/stores/user'
import { findReport } from './reportDefs'
import type { Cell, ReportDef } from './reportDefs'

const user = useUserStore()
const route = useRoute()

const key = computed(() => String(route.params.key ?? ''))
const report = computed(() => findReport(key.value))
/** 正常分支专用：报表不存在时由 404 分支兜底渲染，不会读取该值 */
const def = computed(() => report.value as ReportDef)

const type = computed<PeriodType>(() => (route.query.periodType === 'month' ? 'month' : 'quarter'))
const value = computed(() => String(route.query.period ?? '') || periodOptions(type.value, 1)[0].value)
const period = computed(() => parsePeriod(type.value, value.value))

const rows = computed(() => def.value.rows(period.value))
const totalRow = computed(() => def.value.total(period.value))
/** 报表级汇总行（如 delay 报表的「本期应完成 / 本期新增」），报表未声明时为空 */
const summaryRow = computed(() => def.value.summary?.(period.value))
/** 空周期提示文案（数据行为空时表格内提示，可按统计周期给出口径数字，报表可自定义） */
const emptyText = computed(() => def.value.emptyText?.(period.value) ?? '本期无数据')

/**
 * 数据区行（本期汇总行 + 明细行 + 空周期提示行）：
 * 屏上表格、导出 Excel、打印三处共用同一份数据，保证三处完全一致
 */
const bodyRows = computed<Cell[][]>(() => {
  const out: Cell[][] = []
  if (summaryRow.value) out.push(summaryRow.value)
  if (rows.value.length) {
    out.push(...rows.value)
  } else {
    out.push([emptyText.value, ...def.value.header.slice(1).map(() => '')])
  }
  return out
})

/** 报表生成时间（页面打开时刻） */
const now = new Date()
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
const genTime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`

/** 导出 Excel：表头 + 数据行（含本期汇总行 / 空周期提示行）+ 合计行 */
function doExport() {
  exportExcel(`${def.value.name}-${period.value.value}`, [
    {
      name: '报表数据',
      header: def.value.header,
      rows: [...bodyRows.value, totalRow.value],
      colWidth: def.value.header.map(() => 18),
    },
  ])
}

/** 打印 / 导出 PDF：列数较多的报表用横向排版 */
function doPrint() {
  printTable({
    title: def.value.name,
    subtitle: `统计周期：${period.value.label} · 生成时间：${genTime}`,
    header: def.value.header,
    rows: [...bodyRows.value, totalRow.value],
    align: def.value.align,
    footer: def.value.source,
    landscape: def.value.landscape,
  })
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.report-sheet {
  padding: 16px 18px 14px;
}

.sheet-head {
  text-align: center;

  .t {
    font-size: 18px;
    font-weight: 600;
    color: @text-1;
    letter-spacing: 1px;
  }

  .meta {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 24px;
    margin-top: 8px;
    font-size: 12px;
    color: @text-3;
    font-variant-numeric: tabular-nums;
  }
}

.table-wrap {
  margin-top: 14px;
  overflow-x: auto;
}

.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 6px 8px;
    border: 1px solid @border-color;
    vertical-align: top;
  }

  th {
    font-weight: 600;
    color: @text-1;
    background: @primary-bg;
    white-space: nowrap;
  }

  tbody tr:nth-child(even) td {
    background: @bg-page;
  }

  tbody tr.summary-row td {
    background: @primary-bg;
    font-weight: 600;
  }

  tbody td.empty-cell {
    padding: 16px 8px;
    text-align: center;
    color: @text-3;
  }

  tfoot td {
    font-weight: 600;
    background: @primary-bg;
  }
}

.cell {
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.sheet-foot {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  font-size: 12px;
  color: @text-3;
}
</style>
