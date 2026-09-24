<template>
  <div class="pmc-page-header">
    <div class="left">
      <h2 class="title">
        {{ title }}
        <span v-if="tag" class="tag">{{ tag }}</span>
      </h2>
      <div v-if="desc" class="desc">{{ desc }}</div>
    </div>
    <div class="right">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面标题区：标题 + 口径说明 + 右侧操作按钮区
defineProps<{
  title: string
  /** 说明文字（口径、数据来源等） */
  desc?: string
  /** 右上角小标签 */
  tag?: string
}>()
</script>

<style scoped lang="less">
@import '../styles/variables.less';

.pmc-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;

  .left {
    min-width: 0;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: @text-1;

    .tag {
      padding: 1px 6px;
      font-size: 12px;
      font-weight: 400;
      color: @primary;
      background: @primary-bg;
      border: 1px solid @primary-border;
      border-radius: 4px;
    }
  }

  .desc {
    margin-top: 4px;
    font-size: 13px;
    color: @text-3;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
}
</style>
