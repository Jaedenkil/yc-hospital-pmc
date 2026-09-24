// ============================================================
// ECharts 按需注册（全站统一入口）
// 只引入项目用到的图表与组件，避免整包引入导致演示文件过大
// ============================================================

import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GaugeChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
])

export default echarts

/** 图表配置类型（页面里给 option 标注用） */
export type ChartOption = echarts.EChartsCoreOption

/** 图表实例类型（取 init 的返回类型，避免与完整包 ECharts 类混淆） */
export type ChartInstance = ReturnType<typeof echarts.init>
