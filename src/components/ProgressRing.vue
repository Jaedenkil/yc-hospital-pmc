<template>
  <a-progress
    type="circle"
    :percent="percent"
    :size="size"
    :stroke-width="strokeWidth"
    :stroke-color="finalColor"
    :format="formatText"
  />
</template>

<script setup lang="ts">
// 项目整体完成百分比环（列表与详情复用）
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 完成百分比 0~100 */
    percent: number
    /** 直径（px） */
    size?: number
    strokeWidth?: number
    /** 指定颜色；不传则按进度阈值自动取色 */
    color?: string
    /** 环内文案，默认显示百分比 */
    text?: string
  }>(),
  { size: 72, strokeWidth: 8, color: '' },
)

/** 阈值取色：≥80 绿、≥40 蓝、其余黄 */
const finalColor = computed(() => {
  if (props.color) return props.color
  if (props.percent >= 80) return '#52c41a'
  if (props.percent >= 40) return '#1677ff'
  return '#faad14'
})

function formatText() {
  return props.text ?? `${props.percent}%`
}
</script>
