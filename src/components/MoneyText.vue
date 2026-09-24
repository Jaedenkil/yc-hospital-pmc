<template>
  <span class="pmc-money" :class="{ bold }">{{ text }}</span>
</template>

<script setup lang="ts">
// 金额展示：统一"元 → 亿元 / 万元"换算与等宽数字，避免各页各自格式化
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 金额（元） */
    value: number
    /** 单位策略：auto 自动选亿元/万元；wan 固定万元；yi 固定亿元；yuan 固定元 */
    unit?: 'auto' | 'wan' | 'yi' | 'yuan'
    /** 小数位 */
    digits?: number
    /** 加粗（用于汇总行） */
    bold?: boolean
  }>(),
  { unit: 'auto', digits: 2, bold: false },
)

const text = computed(() => {
  const d = props.digits
  switch (props.unit) {
    case 'wan':
      return `${(props.value / 1_0000).toFixed(d)} 万元`
    case 'yi':
      return `${(props.value / 1_0000_0000).toFixed(d)} 亿元`
    case 'yuan':
      return `${props.value.toFixed(0)} 元`
    default: {
      const abs = Math.abs(props.value)
      if (abs >= 1_0000_0000) return `${(props.value / 1_0000_0000).toFixed(d)} 亿元`
      if (abs >= 1_0000) return `${(props.value / 1_0000).toFixed(d)} 万元`
      return `${props.value} 元`
    }
  }
})
</script>

<style scoped lang="less">
.pmc-money {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  &.bold {
    font-weight: 600;
  }
}
</style>
