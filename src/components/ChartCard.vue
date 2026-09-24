<template>
  <div class="chart-card pmc-card">
    <div class="head">
      <div class="ttl">
        {{ title }}
        <span v-if="desc" class="desc">{{ desc }}</span>
      </div>
      <div class="extra">
        <slot name="extra" />
      </div>
    </div>
    <div ref="el" class="body" :style="{ height }"></div>
  </div>
</template>

<script setup lang="ts">
// 图表容器：统一高度、标题栏与生命周期管理（ECharts 实例随组件销毁）
import { ref } from 'vue'
import { useChart } from '@/composables/useChart'
import type { ChartOption } from '@/utils/echarts'

const props = withDefaults(
  defineProps<{
    title: string
    /** 标题右侧说明（口径、单位等） */
    desc?: string
    /** ECharts 配置 */
    option: ChartOption
    /** 图表区高度 */
    height?: string
  }>(),
  { height: '260px' },
)

const el = ref<HTMLDivElement | null>(null)
useChart(el, () => props.option)
</script>

<style scoped lang="less">
@import '../styles/variables.less';

.chart-card {
  padding: 14px 16px 10px;

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;

    .ttl {
      font-size: 15px;
      font-weight: 600;
      color: @text-1;

      .desc {
        margin-left: 8px;
        font-size: 12px;
        font-weight: 400;
        color: @text-3;
      }
    }

    .extra {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .body {
    width: 100%;
  }
}
</style>
