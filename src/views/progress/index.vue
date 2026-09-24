<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="项目进度总览"
      :desc="`按立项 / 采购 / 建设 / 验收四阶段分组展示 ${total} 个子项目的推进情况；整体完成度口径：已完成 100%、进行中 / 延期预警 50%、严重滞后 30%、未开始 0%`"
      tag="模块1 · 项目进度"
    >
      <a-button v-if="user.can('report:export')" type="primary" @click="exportProgress">
        导出进度一览
      </a-button>
      <a-button @click="$router.push('/projects')">项目台账</a-button>
    </PageHeader>

    <!-- 各阶段项目数与占比（点击卡片可快速筛选该阶段） -->
    <div class="phase-row">
      <div
        v-for="c in phaseCards"
        :key="c.phase"
        class="phase-cell"
        :class="{ active: c.active }"
        @click="togglePhase(c.phase)"
      >
        <StatCard
          :label="`${c.phase}阶段`"
          :value="String(c.count)"
          unit="个"
          :sub="`占全部项目 ${fmtPercent(c.share)} · 滞后 ${c.delayProjects} 个`"
          :accent="c.accent"
        />
      </div>
    </div>

    <!-- 检索与过滤 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-input
          v-model:value="query.keyword"
          placeholder="搜索项目名称 / 编号 / 牵头处室 / 采购人"
          allow-clear
          style="width: 320px"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-select v-model:value="query.phase" :options="phaseOptions" style="width: 160px" />
        <a-checkbox v-model:checked="query.onlyDelay">只看有滞后</a-checkbox>
        <a-checkbox v-model:checked="query.onlyRisk">只看高风险</a-checkbox>
        <a-button @click="reset">重置</a-button>
        <span class="spacer"></span>
        <span class="filter-summary">
          共筛选出 <b>{{ filtered.length }}</b> 个项目，其中滞后 <b>{{ delayTotal }}</b> 个、高风险
          <b>{{ highRiskTotal }}</b> 个
        </span>
      </div>
    </a-card>

    <!-- 按阶段分组的项目列表：占满页头 / 阶段卡片 / 筛选区以下的剩余高度，内容超出在容器内部滚动 -->
    <div class="group-list pmc-scroll">
      <div v-for="g in groups" :key="g.phase" class="pmc-card group">
        <div class="group-head">
          <span class="group-name">{{ g.phase }}阶段</span>
          <a-tag color="blue">{{ g.rows.length }} 个项目</a-tag>
          <span class="group-meta">
            滞后项目 {{ g.delayProjects }} 个 · 平均完成度 {{ g.avgProgress }}% · 阶段内计划验收
            <span class="num">{{ g.planAcceptRange }}</span>
          </span>
        </div>

        <a-empty v-if="!g.rows.length" description="暂无数据" />
        <a-table
          v-else
          :columns="columns"
          :data-source="g.rows"
          :pagination="false"
          row-key="id"
          size="middle"
          :scroll="{ x: 1240 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a @click="$router.push(`/projects/${record.id}`)">{{ record.name }}</a>
              <div class="sub num">{{ record.id }}</div>
            </template>
            <template v-else-if="column.key === 'dept'">
              <div>{{ record.leadDept }}</div>
              <div class="sub">{{ record.owner }}</div>
            </template>
            <template v-else-if="column.key === 'progress'">
              <ProgressRing :percent="record.progress" :size="64" :stroke-width="6" />
            </template>
            <template v-else-if="column.key === 'node'">
              <div class="node">
                <span class="node-name">{{ record.nodeName }}</span>
                <StatusTag :status="record.nodeStatus" />
              </div>
              <div class="sub">
                负责人 {{ record.nodeOwner }} · 计划完成
                <span class="num">{{ record.nodePlanEnd }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'delay'">
              <span class="num" :class="{ warn: record.delayCount > 0 }">{{ record.delayCount }}</span>
            </template>
            <template v-else-if="column.key === 'risk'">
              <a-tag :color="riskColor(record.riskLevel)">{{ RISK_LABEL[record.riskLevel] }}风险</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a @click="$router.push(`/projects/${record.id}`)">进入详情</a>
            </template>
          </template>
        </a-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 项目进度总览（需求模块 1）：阶段统计 + 关键字搜索 + 阶段 / 状态过滤 + 按阶段分组展示项目推进情况
import { computed, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import { PHASE_ORDER, RISK_LABEL, TASK_STATUS_LABEL } from '@/mock'
import type { Phase, SubProject, TaskStatus } from '@/mock/types'
import { allProjects, phaseStats, projectProgress } from '@/mock'
import { exportExcel } from '@/utils/export'
import { fmtPercent, ratio } from '@/utils/format'
import { currentTask, delayCountOf, groupByPhase } from '@/utils/stats'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
const projects = allProjects()
const phases = phaseStats()
const total = projects.length

const query = reactive({
  keyword: '',
  phase: '' as Phase | '',
  /** 只看有滞后任务的项目 */
  onlyDelay: false,
  /** 只看高风险项目 */
  onlyRisk: false,
})

const phaseOptions = [
  { value: '', label: '全部阶段' },
  ...PHASE_ORDER.map((p) => ({ value: p, label: `${p}阶段` })),
]

/** 阶段卡片强调色（与图表配色口径一致） */
const PHASE_ACCENT: Record<Phase, string> = {
  立项: '#1a5fd0',
  采购: '#1677ff',
  建设: '#faad14',
  验收: '#52c41a',
}

const phaseCards = computed(() =>
  PHASE_ORDER.map((phase) => ({
    phase,
    count: phases[phase],
    share: ratio(phases[phase], total),
    delayProjects: projects.filter((p) => p.phase === phase && delayCountOf(p) > 0).length,
    accent: PHASE_ACCENT[phase],
    active: query.phase === phase,
  })),
)

/** 点击阶段卡片：切换该阶段筛选（再次点击取消） */
function togglePhase(phase: Phase) {
  query.phase = query.phase === phase ? '' : phase
}

function reset() {
  query.keyword = ''
  query.phase = ''
  query.onlyDelay = false
  query.onlyRisk = false
}

const filtered = computed(() =>
  projects.filter((p) => {
    if (query.keyword && !`${p.name}${p.id}${p.leadDept}${p.owner}`.includes(query.keyword)) return false
    if (query.phase && p.phase !== query.phase) return false
    if (query.onlyDelay && delayCountOf(p) === 0) return false
    if (query.onlyRisk && p.riskLevel !== 'high') return false
    return true
  }),
)

const delayTotal = computed(() => filtered.value.filter((p) => delayCountOf(p) > 0).length)
const highRiskTotal = computed(() => filtered.value.filter((p) => p.riskLevel === 'high').length)

/** 表格行：预计算进度、当前节点与滞后任务数，避免在模板里做类型断言 */
interface ProgressRow extends SubProject {
  progress: number
  delayCount: number
  /** 当前节点名称（优先滞后任务，其次进行中任务） */
  nodeName: string
  nodePlanEnd: string
  nodeStatus: TaskStatus
  nodeOwner: string
}

function toRow(p: SubProject): ProgressRow {
  const node = currentTask(p)
  return {
    ...p,
    progress: projectProgress(p),
    delayCount: delayCountOf(p),
    nodeName: node ? node.name : '全部节点已完成',
    nodePlanEnd: node ? node.planEnd : '—',
    nodeStatus: node ? node.status : ('done' as TaskStatus),
    nodeOwner: node ? node.owner : '—',
  }
}

/** 按阶段分组的展示数据（含组内进度与验收时间区间汇总） */
const groups = computed(() =>
  groupByPhase(filtered.value).map((g) => {
    const rows = g.list.map(toRow)
    const acceptDates = g.list.map((p) => p.planAccept).sort()
    return {
      phase: g.phase,
      rows,
      delayProjects: g.list.filter((p) => delayCountOf(p) > 0).length,
      avgProgress: rows.length
        ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length)
        : 0,
      planAcceptRange: acceptDates.length ? `${acceptDates[0]} ~ ${acceptDates[acceptDates.length - 1]}` : '—',
    }
  }),
)

const columns = [
  { title: '项目名称', key: 'name', width: 280, fixed: 'left' as const },
  { title: '牵头处室 / 采购人', key: 'dept', width: 210 },
  { title: '整体进度', key: 'progress', width: 120, align: 'center' as const },
  { title: '当前节点', key: 'node', width: 300 },
  { title: '滞后任务数', key: 'delay', width: 120, align: 'right' as const },
  { title: '风险等级', key: 'risk', width: 110, align: 'center' as const },
  { title: '操作', key: 'action', width: 110, align: 'center' as const },
]

function exportProgress() {
  const rows = groups.value.flatMap((g) =>
    g.rows.map((r) => [
      r.name,
      r.id,
      r.leadDept,
      r.owner,
      r.phase,
      r.progress,
      r.nodeName,
      TASK_STATUS_LABEL[r.nodeStatus],
      r.nodePlanEnd,
      r.delayCount,
      `${RISK_LABEL[r.riskLevel]}风险`,
      r.planStart,
      r.planAccept,
    ]),
  )
  exportExcel('项目进度总览', [
    {
      name: '项目进度',
      header: [
        '项目名称',
        '项目编号',
        '牵头处室',
        '采购人',
        '所在阶段',
        '整体完成度（%）',
        '当前节点',
        '节点状态',
        '计划完成',
        '滞后任务数',
        '风险等级',
        '计划开工',
        '计划验收',
      ],
      rows,
      colWidth: [30, 16, 16, 22, 10, 14, 20, 12, 13, 12, 10, 13, 13],
    },
  ])
  message.success(`已导出 ${rows.length} 个项目的进度一览（随当前筛选条件）`)
}

function riskColor(level: SubProject['riskLevel']): string {
  return level === 'high' ? 'red' : level === 'mid' ? 'orange' : 'green'
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.phase-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
  // 顶部统计卡片行属于固定区：保持自然高度，只让下方分组列表占满剩余高度
  flex: none;
}

// 页头属于固定区：保持自然高度，不参与剩余高度分配
.page-head {
  flex: none;
}

.phase-cell {
  cursor: pointer;
  border-radius: @radius;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 2px 10px rgba(31, 35, 41, 0.12);
  }

  &.active :deep(.pmc-stat) {
    outline: 2px solid @primary-border;
    outline-offset: 1px;
  }
}

.filter {
  margin-bottom: 12px;
  padding: 16px;
  flex: none;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;

  .spacer {
    flex: 1;
  }
}

.filter-summary {
  font-size: 13px;
  color: @text-2;

  b {
    color: @primary;
    font-variant-numeric: tabular-nums;
  }
}

.group {
  padding: 14px 16px 16px;
  margin-bottom: 12px;
  // 分组卡片：高度充足时拉伸占满（不留白），内容超出时保持自然高度由外层容器滚动
  flex: 1 0 auto;
}

// 分组列表容器：占满固定区以下的剩余高度，并在内部滚动
// （各阶段分组表无分页、按实际行数展示，不做表体内滚，纵向滚动统一由本容器承担）
.group-list {
  display: flex;
  flex-direction: column;
  // 右侧留出滚动条间隙，避免滚动条紧贴分组卡片阴影
  padding-right: 6px;

  .group:last-child {
    margin-bottom: 0;
  }
}

.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  .group-name {
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  .group-meta {
    font-size: 12px;
    color: @text-3;
  }
}

.node {
  display: flex;
  align-items: center;
  gap: 8px;

  .node-name {
    color: @text-1;
  }
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.warn {
  color: @status-overdue;
}

.num {
  font-variant-numeric: tabular-nums;
}
</style>
