<template>
  <div class="pmc-stat" :style="{ '--accent': accent }">
    <div class="label">{{ label }}</div>
    <div class="value pmc-metric">
      {{ value }}<span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div v-if="sub" class="sub">{{ sub }}</div>
  </div>
</template>

<script setup lang="ts">
// 关键指标卡（KPI）：驾驶舱 / 资金总览 / 统计看板共用
withDefaults(
  defineProps<{
    label: string
    /** 主数值（已格式化好的字符串） */
    value: string
    /** 单位（紧跟数值，小字） */
    unit?: string
    /** 补充说明（占比、口径等） */
    sub?: string
    /** 顶部强调色 */
    accent?: string
  }>(),
  { accent: '#1a5fd0' },
)
</script>

<style scoped lang="less">
@import '../styles/variables.less';

.pmc-stat {
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
}
</style>
