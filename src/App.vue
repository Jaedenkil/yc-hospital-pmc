<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig">
    <router-view />
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN'

// 政务蓝主题令牌（改色只改 styles/variables.less 与这里）
const themeConfig = {
  token: {
    colorPrimary: '#1a5fd0',
    colorInfo: '#1a5fd0',
    borderRadius: 6,
    fontSize: 14,
  },
  components: {
    Table: { headerBg: '#f2f5fa', headerColor: '#1f2329' },
  },
}
</script>
