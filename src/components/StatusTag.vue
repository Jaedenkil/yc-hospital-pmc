<template>
  <span class="pmc-st" :style="style">
    <i class="dot" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
// 五色状态标签（全站唯一状态色来源，对应需求原文模块 1 的五色标记）
import { computed } from 'vue'
import { TASK_STATUS_LABEL, type TaskStatus } from '@/mock/types'

const props = defineProps<{
  status: TaskStatus
  /** 覆盖默认文案 */
  text?: string
}>()

/** 主色 / 底色 / 字色（主色与 variables.less 的五色令牌一致） */
const PALETTE: Record<TaskStatus, { main: string; bg: string; fg: string }> = {
  'not-started': { main: '#bfbfbf', bg: '#fafafa', fg: '#8c8c8c' },
  doing: { main: '#1677ff', bg: '#e6f4ff', fg: '#0958d9' },
  done: { main: '#52c41a', bg: '#f6ffed', fg: '#389e0d' },
  warn: { main: '#faad14', bg: '#fffbe6', fg: '#d48806' },
  overdue: { main: '#ff4d4f', bg: '#fff1f0', fg: '#cf1322' },
}

const label = computed(() => props.text ?? TASK_STATUS_LABEL[props.status])

const style = computed(() => {
  const c = PALETTE[props.status]
  return { background: c.bg, color: c.fg, borderColor: c.main, '--dot': c.main }
})
</script>

<style scoped lang="less">
.pmc-st {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 7px;
  height: 22px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  border: 1px solid;
  border-radius: 4px;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--dot);
    flex: none;
  }
}
</style>
