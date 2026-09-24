<template>
  <div class="pmc-page">
    <a-card :bordered="false" class="pmc-card">
      <a-result status="info" :title="title" sub-title="该页面属于第二批交付范围，当前版本已保留入口">
        <template #extra>
          <a-button type="primary" @click="$router.push('/')">返回数据驾驶舱</a-button>
        </template>
      </a-result>
      <div class="hint">
        <a-typography-paragraph type="secondary">
          说明：本页面对应需求原文的「{{ title }}」，规划中的功能将在此实现。第一批交付聚焦招标要求演示的四项能力：
          各阶段建设进度分析、项目数量分类展示、资金明细展示、项目报表。
        </a-typography-paragraph>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => (route.meta.title as string) ?? '功能建设中')
</script>

<style scoped lang="less">
.hint {
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}
</style>
