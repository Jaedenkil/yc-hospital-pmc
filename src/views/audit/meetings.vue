<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="评审会议"
      desc="可研评审 / 初步设计与概算评审 / 招标文件评审 / 需求评审 / 验收评审会议的专家意见与整改落实跟踪"
      tag="模块 7"
    >
      <a-button v-if="user.can('report:export')" @click="exportMeetings">
        <template #icon><DownloadOutlined /></template>
        导出会议台账
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 筛选 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-select v-model:value="query.type" :options="typeOptions" style="width: 200px" />
        <a-select
          v-model:value="query.projectId"
          :options="projectOptions"
          style="width: 270px"
          show-search
          option-filter-prop="label"
        />
        <a-input v-model:value="query.keyword" placeholder="搜索会议主题 / 编号" allow-clear style="width: 280px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="resetQuery">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">筛选出 <b>{{ rows.length }}</b> 场评审会议</span>
      </div>
    </a-card>

    <!-- 会议表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1460 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag color="blue">{{ record.typeText }}</a-tag>
          </template>
          <template v-else-if="column.key === 'topic'">
            <span>{{ record.topic }}</span>
            <div class="sub">{{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'project'">
            <div>{{ projectNameMap.get(record.projectId) }}</div>
            <div class="sub">{{ record.projectId }}</div>
          </template>
          <template v-else-if="column.key === 'date'">
            <span class="num">{{ record.date }}</span>
          </template>
          <template v-else-if="column.key === 'expertCount'">
            <span class="num">{{ record.expertCount }}</span> 人
          </template>
          <template v-else-if="column.key === 'opinionCount'">
            <span class="num">{{ record.opinionCount }}</span> 条
          </template>
          <template v-else-if="column.key === 'rectificationCount'">
            <span class="num">{{ record.rectificationCount }}</span> 条
          </template>
          <template v-else-if="column.key === 'action'">
            <a @click="openDetail(asMeeting(record))">查看详情</a>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的评审会议" />
    </a-card>

    <!-- 会议详情 -->
    <AModal v-model:open="detailOpen" title="评审会议详情" :footer="null" :width="860">
      <div v-if="detail">
        <ADescriptions :column="2" size="small" bordered>
          <ADescriptionsItem label="会议编号">{{ detail.meeting.id }}</ADescriptionsItem>
          <ADescriptionsItem label="会议类型">{{ typeOf(detail.meeting) }}</ADescriptionsItem>
          <ADescriptionsItem label="会议主题" :span="2">{{ detail.meeting.topic }}</ADescriptionsItem>
          <ADescriptionsItem label="所属项目" :span="2">
            {{ projectNameMap.get(detail.meeting.projectId) }}（{{ detail.meeting.projectId }}）
          </ADescriptionsItem>
          <ADescriptionsItem label="会议日期">{{ detail.meeting.date }}</ADescriptionsItem>
          <ADescriptionsItem label="参会专家">{{ detail.meeting.expertCount }} 人</ADescriptionsItem>
          <ADescriptionsItem label="专家意见">{{ detail.meeting.opinionCount }} 条</ADescriptionsItem>
          <ADescriptionsItem label="整改清单">{{ detail.meeting.rectificationCount }} 条</ADescriptionsItem>
        </ADescriptions>

        <div class="sec-title">专家意见（{{ detail.opinions.length }} 条）</div>
        <ol class="opinion-list">
          <li v-for="(o, i) in detail.opinions" :key="i">{{ o }}</li>
        </ol>

        <div class="sec-title">整改清单（{{ detail.items.length }} 条）</div>
        <a-table
          :columns="detailColumns"
          :data-source="detail.items"
          :pagination="false"
          row-key="key"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="record.color">{{ record.status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'due'">
              <span class="num">{{ record.due }}</span>
            </template>
          </template>
        </a-table>
      </div>
    </AModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Modal as AModal,
  message,
} from 'ant-design-vue'
import type { TableColumnType } from 'ant-design-vue'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import { TODAY, allMeetings, allProjects } from '@/mock'
import { addDays, daysBetween, seedRandom } from '@/mock/utils'
import type { ReviewMeeting } from '@/mock/types'
import { useUserStore } from '@/stores/user'
import { useTableScroll } from '@/composables/useTableScroll'
import { exportExcel } from '@/utils/export'

const user = useUserStore()
const projects = allProjects()
const meetings = allMeetings()

const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))

const query = reactive({ type: '', projectId: '', keyword: '' })

/** 会议类型（由会议主题推导） */
const MEETING_TYPES = ['可研评审', '初步设计与概算评审', '招标文件评审', '需求评审', '验收评审']

function typeOf(m: ReviewMeeting): string {
  if (m.topic.includes('可行性研究')) return '可研评审'
  if (m.topic.includes('初步设计')) return '初步设计与概算评审'
  if (m.topic.includes('招标文件')) return '招标文件评审'
  if (m.topic.includes('需求规格')) return '需求评审'
  return '验收评审'
}

const typeOptions = [{ value: '', label: '全部会议类型' }, ...MEETING_TYPES.map((t) => ({ value: t, label: t }))]

const projectOptions = [
  { value: '', label: '全部子项目' },
  ...projects
    .filter((p) => meetings.some((m) => m.projectId === p.id))
    .map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` })),
]

const rows = computed(() =>
  meetings
    .filter((m) => {
      if (query.type && typeOf(m) !== query.type) return false
      if (query.projectId && m.projectId !== query.projectId) return false
      if (query.keyword && !`${m.topic}${m.id}`.includes(query.keyword)) return false
      return true
    })
    /** 预计算会议类型，模板直接读取 record.typeText，无需在插槽中调用业务函数 */
    .map((m) => ({ ...m, typeText: typeOf(m) })),
)

/** 全量统计（不受筛选影响） */
const summary = computed(() => {
  const dates = meetings.map((m) => m.date).sort()
  return {
    experts: meetings.reduce((s, m) => s + m.expertCount, 0),
    opinions: meetings.reduce((s, m) => s + m.opinionCount, 0),
    rectifications: meetings.reduce((s, m) => s + m.rectificationCount, 0),
    projects: new Set(meetings.map((m) => m.projectId)).size,
    latest: dates.length ? dates[dates.length - 1] : '—',
  }
})

const statCards = computed(() => [
  { label: '评审会议总数', value: String(meetings.length), unit: '场', sub: `覆盖 ${summary.value.projects} 个子项目`, accent: '#1a5fd0' },
  { label: '参会专家人次', value: String(summary.value.experts), unit: '人次', sub: '每场 3~9 名评审专家', accent: '#1677ff' },
  { label: '专家意见条数', value: String(summary.value.opinions), unit: '条', sub: '含方案论证、概算与需求评审意见', accent: '#722ed1' },
  { label: '整改清单条数', value: String(summary.value.rectifications), unit: '条', sub: '按意见分解到责任方逐条落实', accent: '#faad14' },
  { label: '最近会议日期', value: summary.value.latest, unit: '', sub: '会议材料按场次归档至项目档案', accent: '#52c41a' },
])

const columns: TableColumnType<ReviewMeeting>[] = [
  { title: '会议类型', key: 'type', width: 168 },
  { title: '会议主题', key: 'topic', width: 420 },
  { title: '所属项目', key: 'project', width: 280 },
  { title: '会议日期', key: 'date', width: 116 },
  { title: '专家人数', key: 'expertCount', width: 110, align: 'center' as const },
  { title: '专家意见条数', key: 'opinionCount', width: 132, align: 'center' as const },
  { title: '整改清单条数', key: 'rectificationCount', width: 132, align: 'center' as const },
  { title: '操作', key: 'action', width: 110, fixed: 'right' as const },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 场评审会议`,
}

/** 会议表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
const { wrapRef: tableCardRef, tableScroll } = useTableScroll({ minRows: 3, rowHeight: 48 })

/** 卡片函数式 ref：兼容组件实例与原生元素，取到根 DOM 后交给 useTableScroll 测量 */
function setTableCard(el: unknown) {
  if (!el) {
    tableCardRef.value = null
    return
  }
  if (el instanceof HTMLElement) {
    tableCardRef.value = el
    return
  }
  const root = (el as { $el?: unknown }).$el
  tableCardRef.value = root instanceof HTMLElement ? root : null
}

function resetQuery() {
  query.type = ''
  query.projectId = ''
  query.keyword = ''
}

// ---------------- 会议详情 ----------------
/** 专家意见库（评审会上实际出现的意见主题） */
const OPINIONS = [
  '可研报告应补充与区域卫生规划的衔接说明，明确项目建设必要性',
  '投资估算的取费依据需进一步细化，避免后期概算调整',
  '建设内容应明确与院内现有信息系统的边界及集成方案',
  '建议补充数据安全与个人信息保护专项设计',
  '招标文件技术参数设置应避免指向特定品牌型号',
  '需求规格说明书需明确可量化的验收标准',
  '项目组织架构与人员投入需在实施计划中明确',
  '概算中软件开发工作量的测算依据需进一步说明',
  '应补充与原系统的数据迁移及并行切换方案',
  '明确等级保护测评时间安排与整改责任分工',
  '监理旁站与见证取样计划需进一步细化',
  '影像云调阅的带宽与存储容量需补充测算说明',
  '价格分评分标准设置应符合政府采购相关规定',
  '系统上线后的运维服务范围与响应时限需明确',
  '培训方案应覆盖临床科室与实际操作人员',
  '建议将关键绩效指标纳入验收测试用例',
  '接口联调计划需明确参建各方配合责任',
  '补充试运行期间的问题响应与应急处置流程',
  '合同条款中知识产权归属需进一步明确',
  '明确项目档案归档范围与移交时间要求',
]

/** 整改责任方 */
const RESPONSIBLES = ['建设单位项目办', '承建单位项目部', '监理单位项目监理部']

/** 字符串哈希：以会议编号为种子，保证同一场会议的明细稳定可复现 */
function hashCode(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface RectItem {
  key: string
  seq: number
  text: string
  responsible: string
  due: string
  status: string
  color: string
}

interface MeetingDetail {
  meeting: ReviewMeeting
  opinions: string[]
  items: RectItem[]
}

const detailOpen = ref(false)
const detail = ref<MeetingDetail | null>(null)

/** 表格插槽中的 record 为宽松类型，统一断言为评审会议记录后交给业务函数 */
const asMeeting = (r: Record<string, unknown>) => r as unknown as ReviewMeeting

function openDetail(m: ReviewMeeting) {
  const rand = seedRandom(hashCode(m.id) + 7)
  // 专家意见：从意见库按确定性起点顺序取，条数与会议记录一致
  const start = Math.floor(rand() * OPINIONS.length)
  const opinions = Array.from({ length: m.opinionCount }, (_, i) => OPINIONS[(start + i) % OPINIONS.length])

  // 整改清单：从意见中取需整改条目，补充责任方、计划完成时间与落实情况
  const rectStart = Math.floor(rand() * OPINIONS.length)
  const elapsed = daysBetween(m.date, TODAY)
  const items: RectItem[] = Array.from({ length: m.rectificationCount }, (_, i) => {
    const opinion = OPINIONS[(rectStart + i) % OPINIONS.length]
    const due = addDays(m.date, 15 + Math.floor(rand() * 45))
    const status = elapsed > 90 ? '已落实' : elapsed > 45 ? '落实中' : '待落实'
    const color = status === '已落实' ? 'green' : status === '落实中' ? 'blue' : 'orange'
    return {
      key: `${m.id}-${i + 1}`,
      seq: i + 1,
      text: `${opinion}——按要求落实并反馈`,
      responsible: RESPONSIBLES[Math.floor(rand() * RESPONSIBLES.length)],
      due,
      status,
      color,
    }
  })

  detail.value = { meeting: m, opinions, items }
  detailOpen.value = true
}

const detailColumns: TableColumnType<RectItem>[] = [
  { title: '序号', dataIndex: 'seq', key: 'seq', width: 64, align: 'center' as const },
  { title: '整改事项', dataIndex: 'text', key: 'text' },
  { title: '责任方', dataIndex: 'responsible', key: 'responsible', width: 160 },
  { title: '计划完成', key: 'due', width: 118 },
  { title: '落实情况', key: 'status', width: 106, align: 'center' as const },
]

/** 导出评审会议台账（会议清单 + 意见与整改统计） */
function exportMeetings() {
  exportExcel('评审会议台账', [
    {
      name: '会议清单',
      header: ['会议编号', '会议类型', '会议主题', '所属项目', '项目编号', '会议日期', '专家人数', '专家意见条数', '整改清单条数'],
      rows: rows.value.map((m) => [
        m.id,
        typeOf(m),
        m.topic,
        projectNameMap.get(m.projectId) ?? '',
        m.projectId,
        m.date,
        m.expertCount,
        m.opinionCount,
        m.rectificationCount,
      ]),
      colWidth: [12, 20, 60, 34, 16, 12, 10, 14, 14],
    },
    {
      name: '按项目汇总',
      header: ['项目编号', '项目名称', '会议场次', '专家人次', '专家意见条数', '整改清单条数'],
      rows: projects
        .map((p) => {
          const list = meetings.filter((m) => m.projectId === p.id)
          return [
            p.id,
            p.name,
            list.length,
            list.reduce((s, m) => s + m.expertCount, 0),
            list.reduce((s, m) => s + m.opinionCount, 0),
            list.reduce((s, m) => s + m.rectificationCount, 0),
          ]
        })
        .filter((row) => Number(row[2]) > 0),
      colWidth: [16, 34, 10, 10, 14, 14],
    },
  ])
  message.success(`已导出 ${rows.value.length} 场评审会议记录`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头固定：不参与剩余高度分配
.page-head {
  flex: none;
}

// 顶部统计卡片行固定：高度由内容决定
.stat-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 会议卡片：占满筛选卡片以下的剩余高度，表格超出时在卡片内部滚动（数据不足时至少 3 行 + 分页）
.table-card {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;

  :deep(.ant-card-body) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.filter {
  flex: none;
  margin-bottom: 12px;
  padding: 14px 16px;

  .filter-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .hint {
    font-size: 13px;
    color: @text-3;

    b {
      color: @primary;
    }
  }
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;
}

.sec-title {
  margin: 14px 0 8px;
  padding-left: 8px;
  font-size: 14px;
  font-weight: 600;
  color: @text-1;
  border-left: 3px solid @primary;
}

.opinion-list {
  max-height: 240px;
  margin: 0;
  padding-left: 22px;
  overflow: auto;
  font-size: 13px;
  line-height: 24px;
  color: @text-2;
}
</style>
