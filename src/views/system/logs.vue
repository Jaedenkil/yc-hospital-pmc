<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="操作日志"
      desc="记录登录、新增、修改、删除、导出、上传等关键操作；日志留存不少于 3 年，写入后不可修改、不可删除"
      tag="模块 9"
    >
      <a-tag color="blue">留存期 ≥ 3 年 · 只增不删</a-tag>
      <Button v-if="canView" type="primary" ghost @click="onExport">
        <template #icon><DownloadOutlined /></template>
        导出 Excel
      </Button>
    </PageHeader>

    <!-- 日志概览 -->
    <div class="kpi-row">
      <StatCard
        v-for="k in kpis"
        :key="k.label"
        :label="k.label"
        :value="k.value"
        :unit="k.unit"
        :sub="k.sub"
        :accent="k.accent"
      />
    </div>

    <!-- 图表 -->
    <div class="chart-row">
      <ChartCard title="操作类型分布" desc="六类操作日志条数" :option="typeOption" height="240px" />
      <ChartCard title="近 30 日操作趋势" desc="按日志日期统计（含演示基准日）" :option="trendOption" height="240px" />
      <ChartCard title="操作结果构成" desc="成功 / 失败占比" :option="resultOption" height="240px" />
    </div>

    <!-- 筛选区 -->
    <div class="pmc-card panel filter">
      <div class="filter-row">
        <Select
          v-model:value="filter.action"
          :options="actionOptions"
          style="width: 160px"
        />
        <Select
          v-model:value="filter.account"
          :options="accountOptions"
          show-search
          allow-clear
          option-filter-prop="label"
          placeholder="按账号筛选"
          style="width: 220px"
        />
        <Input
          v-model:value="filter.keyword"
          placeholder="关键字：操作内容 / 姓名 / IP"
          allow-clear
          style="width: 260px"
        >
          <template #prefix><SearchOutlined /></template>
        </Input>
        <RangePicker
          :format="'YYYY-MM-DD'"
          :placeholder="['开始日期', '结束日期']"
          @change="onRangeChange"
        />
        <Button @click="resetFilter">重置</Button>
        <span class="spacer"></span>
        <span class="filter-summary">
          命中 <b>{{ filtered.length }}</b> / {{ logs.length }} 条日志
        </span>
      </div>
    </div>

    <!-- 日志表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <div :ref="setTableCard" class="pmc-card panel table-card">
      <!-- 表格容器：留存说明以上的剩余高度全部给它，表体在此内部滚动 -->
      <div class="table-wrap">
        <a-table
          :columns="columns"
          :data-source="filtered"
          :pagination="pagination"
          row-key="id"
          size="middle"
          :scroll="{ ...tableScroll, x: 1240 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'id'">
              <span class="mono">{{ record.id }}</span>
            </template>
            <template v-else-if="column.key === 'time'">
              <span class="mono">{{ record.time }}</span>
            </template>
            <template v-else-if="column.key === 'account'">
              <span class="mono">{{ record.account }}</span>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-tag :color="actionColor(record.action)">{{ record.action }}</a-tag>
            </template>
            <template v-else-if="column.key === 'detail'">
              {{ record.detail }}
            </template>
            <template v-else-if="column.key === 'ip'">
              <span class="mono">{{ record.ip }}</span>
            </template>
            <template v-else-if="column.key === 'result'">
              <a-tag v-if="record.result === '成功'" color="green">成功</a-tag>
              <a-tag v-else color="red">失败</a-tag>
            </template>
          </template>
          <template #emptyText>
            <AEmpty description="暂无符合条件的操作日志，请调整筛选条件" />
          </template>
        </a-table>
      </div>

      <!-- 留存期说明（需求模块 9） -->
      <div class="retain">
        <div class="retain-title">
          <SafetyCertificateOutlined />
          日志留存与审计说明
        </div>
        <ul>
          <li>
            <b>留存期限不少于 3 年：</b>日志自写入之日起完整留存，本期数据留存至 2029-09-20 及以后，
            满足审计调阅与追溯要求。
          </li>
          <li>
            <b>不可删除、不可修改：</b>日志写入后即为只读记录，平台不提供删除与编辑入口，
            任何角色（含平台管理员）均无法删除历史日志。
          </li>
          <li>
            <b>全要素留痕：</b>逐条记录操作时间、操作账号、姓名、来源 IP、操作类型、操作内容与结果；
            失败操作同样入账并标注失败原因（如密码校验失败、账号停用、服务超时）。
          </li>
          <li>
            <b>可导出留档：</b>支持按「操作类型 + 账号 + 关键字 + 时间范围」筛选后导出 Excel（.xlsx），
            供审计取证与纸质留档使用。
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// ============================================================
// 操作日志（需求模块 9）
// 数据来源：allLogs()（300~400 条，按时间倒序），并合并演示期由用户管理页追加的操作记录
// 功能：操作类型 / 账号 / 关键字 / 时间范围 筛选，表格展示，导出 Excel，留存期说明（≥3 年、不可删除）
// 权限：导出按钮按 can('log:view') 显隐（无权限的按钮直接不渲染）
// ============================================================
import { computed, reactive, ref } from 'vue'
import { Button, Empty as AEmpty, Input, RangePicker, Select, message } from 'ant-design-vue'
import { DownloadOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { allLogs, TODAY } from '@/mock'
import type { OperationLog } from '@/mock/types'
import { addDays } from '@/mock/utils'
import { exportExcel } from '@/utils/export'
import type { ChartOption } from '@/utils/echarts'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
/** 是否拥有日志查看权限（导出动作与留档相关） */
const canView = computed(() => user.can('log:view'))

/** 页面数据源：allLogs() 返回 mock 缓存数组，用户管理页的运行期操作会即时出现在这里 */
const logs = allLogs()

/** 六类操作（顺序与筛选下拉一致，与需求模块 9 的操作类型完全对应） */
const ACTIONS: OperationLog['action'][] = ['登录', '新增', '修改', '删除', '导出', '上传']

const actionOptions = [{ value: '', label: '全部操作类型' }, ...ACTIONS.map((a) => ({ value: a, label: a }))]

/** 账号下拉：从日志中归集去重，展示「姓名（账号）」 */
const accountOptions = computed(() => {
  const map = new Map<string, string>()
  for (const l of logs) map.set(l.account, `${l.name}（${l.account}）`)
  return [...map.entries()].map(([value, label]) => ({ value, label }))
})

// ---------------- 概览 KPI ----------------
const successCount = computed(() => logs.filter((l) => l.result === '成功').length)
const failCount = computed(() => logs.filter((l) => l.result === '失败').length)

const kpis = computed(() => [
  { label: '日志总条数', value: String(logs.length), unit: '条', sub: `覆盖 ${new Set(logs.map((l) => l.account)).size} 个账号`, accent: '#1a5fd0' },
  { label: '成功操作', value: String(successCount.value), unit: '条', sub: `占比 ${((successCount.value / logs.length) * 100).toFixed(1)}%`, accent: '#52c41a' },
  { label: '失败操作', value: String(failCount.value), unit: '条', sub: '密码错误 / 超时 / 账号停用等', accent: '#ff4d4f' },
  { label: '留存期', value: '≥ 3', unit: '年', sub: '写入后只读，不可删除', accent: '#1677ff' },
])

// ---------------- 图表 ----------------
const typeOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: 60, right: 36, top: 16, bottom: 24 },
  xAxis: { type: 'value' },
  yAxis: { type: 'category', data: ACTIONS.slice().reverse() },
  series: [
    {
      type: 'bar',
      barWidth: 16,
      itemStyle: { color: '#1677ff', borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right' },
      data: ACTIONS.slice()
        .reverse()
        .map((a) => logs.filter((l) => l.action === a).length),
    },
  ],
}))

/** 近 30 日（含演示基准日 TODAY）每日日志条数 */
const trendDays = computed(() => {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) days.push(addDays(TODAY, -i))
  return days
})

const trendOption = computed<ChartOption>(() => {
  const days = trendDays.value
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 24, top: 16, bottom: 28 },
    xAxis: {
      type: 'category',
      data: days.map((d) => d.slice(5)),
      axisLabel: { interval: 4 },
    },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 6,
        itemStyle: { color: '#1a5fd0' },
        areaStyle: { color: 'rgba(26, 95, 208, 0.12)' },
        data: days.map((d) => logs.filter((l) => l.time.startsWith(d)).length),
      },
    ],
  }
})

const resultOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, icon: 'circle' },
  color: ['#52c41a', '#ff4d4f'],
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '44%'],
      label: { formatter: '{b}\n{c} 条' },
      data: [
        { name: '成功', value: successCount.value },
        { name: '失败', value: failCount.value },
      ],
    },
  ],
}))

// ---------------- 筛选 ----------------
const filter = reactive({
  action: '' as '' | OperationLog['action'],
  account: '' as string,
  keyword: '',
})

/** 时间范围（YYYY-MM-DD；留空表示不限） */
const rangeStart = ref('')
const rangeEnd = ref('')

/** 日期区间变化：antd 第二个参数为格式化后的字符串数组 */
function onRangeChange(_dates: unknown, dateStrings: unknown) {
  const arr: unknown[] = Array.isArray(dateStrings) ? dateStrings : []
  rangeStart.value = typeof arr[0] === 'string' ? arr[0] : ''
  rangeEnd.value = typeof arr[1] === 'string' ? arr[1] : ''
}

const filtered = computed(() =>
  logs.filter((l) => {
    if (filter.action && l.action !== filter.action) return false
    if (filter.account && l.account !== filter.account) return false
    const kw = filter.keyword.trim()
    if (kw && !`${l.detail}${l.name}${l.account}${l.ip}`.includes(kw)) return false
    const day = l.time.slice(0, 10)
    if (rangeStart.value && day < rangeStart.value) return false
    if (rangeEnd.value && day > rangeEnd.value) return false
    return true
  }),
)

function resetFilter() {
  filter.action = ''
  filter.account = ''
  filter.keyword = ''
  rangeStart.value = ''
  rangeEnd.value = ''
}

/** 当前筛选条件的中文描述（导出日志与留档说明用） */
const conditionText = computed(() => {
  const parts: string[] = []
  parts.push(filter.action ? `操作类型=${filter.action}` : '操作类型=全部')
  parts.push(filter.account ? `账号=${filter.account}` : '账号=全部')
  if (filter.keyword.trim()) parts.push(`关键字=${filter.keyword.trim()}`)
  if (rangeStart.value) parts.push(`时间=${rangeStart.value} 至 ${rangeEnd.value}`)
  return parts.join('，')
})

// ---------------- 表格 ----------------
const columns = [
  { title: '日志编号', key: 'id', width: 150, fixed: 'left' as const },
  { title: '操作时间', key: 'time', width: 180 },
  { title: '操作账号', key: 'account', width: 130 },
  { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
  { title: '操作类型', key: 'action', width: 110 },
  { title: '操作内容', key: 'detail', width: 380 },
  { title: '来源 IP', key: 'ip', width: 140 },
  { title: '结果', key: 'result', width: 100 },
]

/** 日志表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素；卡片内还有留存说明，测量基准取表格容器 */
function setTableCard(el: unknown) {
  const root = el instanceof HTMLElement ? el : el ? (el as { $el?: unknown }).$el : null
  const host = root instanceof HTMLElement ? (root.querySelector('.table-wrap') ?? root) : null
  tableCardRef.value = host instanceof HTMLElement ? host : null
}

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条日志`,
}

/** 操作类型标签色（与五色令牌口径一致） */
function actionColor(a: OperationLog['action']): string {
  const map: Record<OperationLog['action'], string> = {
    登录: 'blue',
    新增: 'green',
    修改: 'orange',
    删除: 'red',
    导出: 'purple',
    上传: 'cyan',
  }
  return map[a]
}

// ---------------- 导出 Excel ----------------
function onExport() {
  const list = filtered.value
  exportExcel(`操作日志_${TODAY}`, [
    {
      name: '操作日志',
      header: ['日志编号', '操作时间', '操作账号', '姓名', '操作类型', '操作内容', '来源 IP', '结果'],
      rows: list.map((l) => [l.id, l.time, l.account, l.name, l.action, l.detail, l.ip, l.result]),
      colWidth: [16, 20, 14, 10, 10, 64, 16, 8],
    },
  ])
  message.success(`已导出 ${list.length} 条操作日志（Excel）`)
  appendLog('导出', `导出《操作日志》共 ${list.length} 条（${conditionText.value}）`)
}

// ---------------- 运行期追加日志（导出等操作同样留痕） ----------------
let runSeq = 0

/** 追加一条操作日志到缓存数组，保证本次操作在日志列表中可见 */
function appendLog(action: OperationLog['action'], detail: string) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  runSeq += 1
  logs.unshift({
    id: `LOG-RUN-${Date.now().toString(36)}-${runSeq}`,
    time: `${TODAY} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
    account: user.account || 'shenwenbo',
    name: user.name,
    action,
    detail,
    ip: '10.32.18.36',
    result: '成功',
  })
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头固定：保持自然高度，不参与剩余高度分配
.page-head {
  flex: none;
}

.kpi-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.chart-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.panel {
  padding: 14px 16px 16px;
}

.filter {
  flex: none;
  margin-bottom: 12px;
  padding: 14px 16px;
}

// 日志表格卡片：占满筛选卡片以下的剩余高度，表格在卡片内部滚动
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
}

// 表格容器：留存说明以上的剩余空间全部给它；
// 最少 240px（表头 47 + 3 行 × 48 + 分页 48 的兜底），空间不足时内容超出、由页面整体滚动
.table-wrap {
  flex: 1;
  min-height: 240px;
  display: flex;
  flex-direction: column;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;

  .spacer {
    flex: 1;
  }

  .filter-summary {
    font-size: 13px;
    color: @text-2;

    b {
      color: @primary;
    }
  }
}

.mono {
  font-variant-numeric: tabular-nums;
}

.retain {
  flex: none;
  margin-top: 14px;
  padding: 12px 14px;
  background: @primary-bg;
  border: 1px solid @primary-border;
  border-radius: @radius;

  &-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }

  ul {
    margin: 8px 0 0;
    padding-left: 20px;

    li {
      margin-bottom: 4px;
      font-size: 12px;
      line-height: 1.8;
      color: @text-2;

      b {
        color: @text-1;
      }
    }
  }
}
</style>
