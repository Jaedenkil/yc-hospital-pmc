<template>
  <div class="pmc-page">
    <PageHeader
      title="报表中心"
      desc="内置 5 类标准报表，按月 / 季统计周期预览，支持导出 Excel 与打印 / 导出 PDF"
      tag="报表"
    >
      <a-button @click="$router.push('/funds')">资金总览</a-button>
    </PageHeader>

    <!-- 统计周期切换 -->
    <div class="pmc-card period-bar">
      <span class="label">统计周期</span>
      <a-button
        :type="periodType === 'month' ? 'primary' : 'default'"
        @click="periodType = 'month'"
      >
        按月度
      </a-button>
      <a-button
        :type="periodType === 'quarter' ? 'primary' : 'default'"
        @click="periodType = 'quarter'"
      >
        按季度
      </a-button>
      <a-select v-model:value="periodValue" :options="periodOpts" style="width: 190px" />
      <span class="tip">当前周期：{{ period.label }}（{{ period.start }} ~ {{ period.end }}）</span>
    </div>

    <!-- 内置报表卡片 -->
    <div class="report-grid">
      <div v-for="(r, i) in cards" :key="r.key" class="pmc-card report-card">
        <div class="idx">内置报表 {{ i + 1 }}</div>
        <div class="name">{{ r.name }}</div>
        <div class="desc">{{ r.desc }}</div>
        <div class="foot">
          <span class="rows">
            数据行数：<b>{{ r.rowCount }}</b> 行（{{ period.label }}）<i v-if="!r.rowCount" class="zero">本期无数据</i>
          </span>
          <a-button type="primary" ghost size="small" @click="preview(r.key)">预览</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 报表中心（需求模块 4）：月度 / 季度周期切换 + 5 类内置报表卡片（名称 / 口径说明 / 数据行数）
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { parsePeriod, periodOptions } from '@/utils/stats'
import type { PeriodType } from '@/utils/stats'
import { REPORT_DEFS } from './reportDefs'

const router = useRouter()

const periodType = ref('quarter')
const periodValue = ref(periodOptions('quarter', 1)[0].value)

/** 周期类型（收窄为 PeriodType，供 parsePeriod 使用） */
const type = computed<PeriodType>(() => (periodType.value === 'month' ? 'month' : 'quarter'))
const periodOpts = computed(() =>
  periodOptions(type.value).map((p) => ({ value: p.value, label: p.label })),
)
const period = computed(() => parsePeriod(type.value, periodValue.value))

/** 切换月度 / 季度时，周期值重置为该类型的最新一期 */
watch(type, (t) => {
  periodValue.value = periodOptions(t, 1)[0].value
})

/** 报表卡片：数据行数取当前周期的实际明细行数（delay 等周期报表随月 / 季切换同步刷新） */
const cards = computed(() =>
  REPORT_DEFS.map((d) => ({
    key: d.key,
    name: d.name,
    desc: d.desc,
    rowCount: d.rows(period.value).length,
  })),
)

/** 预览：跳转报表详情并带上统计周期参数 */
function preview(key: string) {
  void router.push({
    path: `/reports/${key}`,
    query: { periodType: type.value, period: periodValue.value },
  })
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.period-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 16px;

  .label {
    font-size: 13px;
    color: @text-2;
  }

  .tip {
    font-size: 13px;
    color: @text-3;
  }
}

.report-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.report-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;

  .idx {
    font-size: 12px;
    color: @primary;
  }

  .name {
    margin-top: 6px;
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  .desc {
    margin-top: 6px;
    font-size: 13px;
    color: @text-3;
    line-height: 1.7;
    flex: 1;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px dashed @border-color;

    .rows {
      font-size: 13px;
      color: @text-2;

      b {
        color: @primary;
        font-variant-numeric: tabular-nums;
      }

      .zero {
        margin-left: 6px;
        color: @text-3;
        font-style: normal;
      }
    }
  }
}
</style>
