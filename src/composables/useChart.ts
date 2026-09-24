// ============================================================
// ECharts 生命周期管理：挂载初始化 / 配置响应更新 / 自适应 / 卸载销毁
// 解决大屏切换分辨率后图表错位、路由切走后实例泄漏两个常见问题
// ============================================================

import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue'
import echarts, { type ChartInstance, type ChartOption } from '@/utils/echarts'

export interface UseChartOptions {
  /** 初始化后的额外处理（例如绑定 click 事件） */
  onInit?: (chart: ChartInstance) => void
}

export function useChart(
  el: Ref<HTMLElement | null | undefined>,
  option: Ref<ChartOption> | (() => ChartOption),
  options: UseChartOptions = {},
) {
  const chart = shallowRef<ChartInstance | null>(null)

  function readOption(): ChartOption {
    return typeof option === 'function' ? option() : option.value
  }

  /** 渲染（首次初始化实例，之后增量更新配置） */
  function render() {
    if (!el.value) return
    if (!chart.value) {
      chart.value = echarts.init(el.value)
      options.onInit?.(chart.value)
    }
    chart.value.setOption(readOption(), true)
  }

  function resize() {
    chart.value?.resize()
  }

  onMounted(() => {
    render()
    window.addEventListener('resize', resize)
  })

  // 配置变化时重绘（deep 监听，页面切换筛选条件后图表同步刷新）
  watch(readOption, () => render(), { deep: true })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize)
    chart.value?.dispose()
    chart.value = null
  })

  return { chart, render, resize }
}
