<template>
  <div class="pmc-page pmc-page-fill">
    <PageHeader
      class="page-head"
      title="变更签证"
      desc="汇总全部子项目的设计变更与现场签证，按项目归集变更时间、变更内容、变更造价与审批情况"
      tag="模块 6"
    >
      <a-button v-if="user.can('supervision:edit')" type="primary" @click="openForm">
        <template #icon><PlusOutlined /></template>
        登记变更签证
      </a-button>
      <a-button v-if="user.can('report:export')" @click="exportChanges">
        <template #icon><DownloadOutlined /></template>
        导出 Excel
      </a-button>
    </PageHeader>

    <!-- 顶部统计 -->
    <div class="stat-row">
      <StatCard v-for="s in statCards" :key="s.label" v-bind="s" />
    </div>

    <!-- 筛选 -->
    <a-card :bordered="false" class="pmc-card filter">
      <div class="filter-row">
        <a-select v-model:value="query.projectId" :options="projectOptions" style="width: 250px" show-search option-filter-prop="label" />
        <a-select v-model:value="query.approved" :options="approvedOptions" style="width: 160px" />
        <a-input v-model:value="query.keyword" placeholder="搜索变更内容 / 变更编号" allow-clear style="width: 250px">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-button @click="resetQuery">重置</a-button>
        <span class="spacer"></span>
        <span class="hint">
          共筛选出 <b>{{ rows.length }}</b> 笔变更，涉及 <b>{{ involvedProjects }}</b> 个子项目
        </span>
      </div>
    </a-card>

    <!-- 变更记录表格：占满筛选卡片以下的剩余高度，表体内部滚动（数据不足时至少留 3 行 + 分页） -->
    <a-card :ref="setTableCard" :bordered="false" class="pmc-card table-card">
      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        row-key="id"
        size="middle"
        :scroll="{ ...tableScroll, x: 1320 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'date'">
            <span class="num">{{ record.date }}</span>
          </template>
          <template v-else-if="column.key === 'reason'">
            <span>{{ record.reason }}</span>
          </template>
          <template v-else-if="column.key === 'amount'">
            <span class="amount num" :class="record.amount >= 0 ? 'up' : 'down'">
              {{ record.amount >= 0 ? '调增' : '调减' }} {{ toWan(Math.abs(record.amount)) }} 万元
            </span>
            <div class="sub">占总投资 {{ ratio(Math.abs(record.amount), record.totalInvestment).toFixed(2) }}%</div>
          </template>
          <template v-else-if="column.key === 'approved'">
            <a-tag :color="record.approved ? 'green' : 'orange'">{{ record.approved ? '已审批' : '审批中' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'project'">
            <div>{{ record.projectName }}</div>
            <div class="sub">{{ record.projectId }} · {{ record.owner }}</div>
          </template>
        </template>
      </a-table>
      <a-empty v-if="!rows.length" description="暂无匹配的变更签证记录" />
    </a-card>

    <!-- 登记变更签证 -->
    <AModal
      v-model:open="formOpen"
      title="登记变更签证"
      ok-text="提交登记"
      cancel-text="取消"
      :width="680"
      @ok="submitForm"
    >
      <AForm layout="vertical">
        <AFormItem label="所属项目" required>
          <a-select
            v-model:value="form.projectId"
            :options="projectOptions.slice(1)"
            show-search
            option-filter-prop="label"
            placeholder="请选择变更所属项目"
            style="width: 100%"
          />
        </AFormItem>
        <AFormItem label="变更内容" required>
          <ATextarea
            v-model:value="form.reason"
            :rows="3"
            placeholder="如：需求新增门诊自助结算模块，经评审批准调整建设内容与合同金额"
          />
        </AFormItem>
        <AFormItem label="变更金额" required>
          <div class="amount-row">
            <ARadioGroup v-model:value="form.direction">
              <ARadioButton value="up">调增</ARadioButton>
              <ARadioButton value="down">调减</ARadioButton>
            </ARadioGroup>
            <AInputNumber v-model:value="form.amountWan" :min="0" :precision="2" addon-after="万元" style="width: 220px" />
          </div>
        </AFormItem>
        <AFormItem label="审批材料">
          <AUpload :before-upload="onBeforeUpload" :max-count="3" list-type="text">
            <a-button>
              <template #icon><UploadOutlined /></template>
              选择审批材料
            </a-button>
          </AUpload>
          <div class="upload-tip">可登记变更申请表、设计变更说明、监理审查意见、概算调整批复等材料名称。</div>
        </AFormItem>
      </AForm>
      <div class="dialog-tip">
        变更登记经监理审核、采购人确认后进入审批流程；演示环境不写入台账，登记结果仅用于流程演示。
      </div>
    </AModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  Form as AForm,
  FormItem as AFormItem,
  InputNumber as AInputNumber,
  Modal as AModal,
  RadioButton as ARadioButton,
  RadioGroup as ARadioGroup,
  Textarea as ATextarea,
  Upload as AUpload,
  message,
} from 'ant-design-vue'
import type { TableColumnType } from 'ant-design-vue'
import { DownloadOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { TODAY, allProjects } from '@/mock'
import type { FundChange } from '@/mock/types'
import { useUserStore } from '@/stores/user'
import { exportExcel } from '@/utils/export'
import { ratio, toWan } from '@/utils/format'
import { useTableScroll } from '@/composables/useTableScroll'

const user = useUserStore()
const projects = allProjects()

/** 变更记录行：把各项目的 changes 展开为全项目汇总台账 */
interface ChangeRow extends FundChange {
  projectId: string
  projectName: string
  owner: string
  totalInvestment: number
  supervisor: string
}

const allChanges: ChangeRow[] = projects.flatMap((p) =>
  p.changes.map((c) => ({
    ...c,
    projectId: p.id,
    projectName: p.name,
    owner: p.owner,
    totalInvestment: p.totalInvestment,
    supervisor: p.supervisor,
  })),
)

const query = reactive({
  projectId: '' as string,
  approved: '' as '' | 'yes' | 'no',
  keyword: '',
})

const projectOptions = [
  { value: '', label: '全部子项目' },
  ...projects.map((p) => ({ value: p.id, label: `${p.name}（${p.id}）` })),
]

const approvedOptions = [
  { value: '', label: '全部审批状态' },
  { value: 'yes', label: '已审批' },
  { value: 'no', label: '审批中' },
]

const rows = computed(() =>
  allChanges.filter((c) => {
    if (query.projectId && c.projectId !== query.projectId) return false
    if (query.approved === 'yes' && !c.approved) return false
    if (query.approved === 'no' && c.approved) return false
    if (query.keyword && !`${c.reason}${c.id}`.includes(query.keyword)) return false
    return true
  }),
)

const involvedProjects = computed(() => new Set(rows.value.map((c) => c.projectId)).size)

/** 金额合计（元） */
const sums = computed(() => {
  const up = rows.value.filter((c) => c.amount > 0).reduce((s, c) => s + c.amount, 0)
  const down = rows.value.filter((c) => c.amount < 0).reduce((s, c) => s + c.amount, 0)
  return { up, down, net: up + down, approved: rows.value.filter((c) => c.approved).length }
})

const statCards = computed(() => [
  {
    label: '变更笔数',
    value: String(rows.value.length),
    unit: '笔',
    sub: `已审批 ${sums.value.approved} 笔 · 审批中 ${rows.value.length - sums.value.approved} 笔`,
    accent: '#1a5fd0',
  },
  {
    label: '调增合计',
    value: toWan(sums.value.up),
    unit: '万元',
    sub: '经评审批准后调整合同金额',
    accent: '#52c41a',
  },
  {
    label: '调减合计',
    value: toWan(Math.abs(sums.value.down)),
    unit: '万元',
    sub: '建设内容核减形成的预算压减',
    accent: '#ff4d4f',
  },
  {
    label: '净变动',
    value: `${sums.value.net >= 0 ? '+' : '-'}${toWan(Math.abs(sums.value.net))}`,
    unit: '万元',
    sub: `占建设总投资 ${ratio(Math.abs(sums.value.net), projects.reduce((s, p) => s + p.totalInvestment, 0)).toFixed(2)}%`,
    accent: sums.value.net >= 0 ? '#faad14' : '#1677ff',
  },
  {
    label: '最近变更时间',
    value: rows.value.length ? rows.value.map((c) => c.date).sort().slice(-1)[0] : '—',
    unit: '',
    sub: `基准日 ${TODAY} 前发生的变更均已归集`,
    accent: '#722ed1',
  },
])

const columns: TableColumnType<ChangeRow>[] = [
  { title: '变更时间', key: 'date', width: 120 },
  { title: '变更内容', key: 'reason', width: 380 },
  { title: '变更造价', key: 'amount', width: 200, align: 'right' as const },
  { title: '是否已审批', key: 'approved', width: 120, align: 'center' as const },
  { title: '所属项目', key: 'project', width: 380 },
]

const pagination = {
  pageSize: 10,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 笔变更签证`,
}

/** 表格自适应高度：表体内部滚动，数据不足时至少留 3 行 + 分页（middle 行高约 48px） */
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
  query.projectId = ''
  query.approved = ''
  query.keyword = ''
}

// ---------------- 登记变更签证 ----------------
const formOpen = ref(false)
const form = reactive({
  projectId: projects[0]?.id ?? '',
  reason: '',
  direction: 'up' as 'up' | 'down',
  amountWan: 0 as number | string,
})

function openForm() {
  form.projectId = projects[0]?.id ?? ''
  form.reason = ''
  form.direction = 'up'
  form.amountWan = 0
  formOpen.value = true
}

/** 附件登记：演示环境不实际上传，仅提示材料名称已记录 */
function onBeforeUpload() {
  message.info('演示环境不实际上传文件，审批材料以登记名称形式进入变更档案')
  return false
}

function submitForm() {
  const project = projects.find((p) => p.id === form.projectId)
  if (!project) {
    message.warning('请选择变更所属项目')
    return
  }
  if (!form.reason.trim()) {
    message.warning('请填写变更内容')
    return
  }
  const amount = Number(form.amountWan) || 0
  if (amount <= 0) {
    message.warning('请填写大于 0 的变更金额')
    return
  }
  formOpen.value = false
  const signed = form.direction === 'up' ? amount : -amount
  message.success(
    `变更签证已登记：${project.name} ${signed > 0 ? '调增' : '调减'} ${toWan(Math.abs(signed))} 万元，待监理审核（演示模式，未写入台账）`,
  )
}

/** 导出变更签证台账（Excel 双工作表：变更明细 + 按项目汇总） */
function exportChanges() {
  const byProject = projects
    .map((p) => {
      const list = rows.value.filter((c) => c.projectId === p.id)
      return {
        p,
        count: list.length,
        up: list.filter((c) => c.amount > 0).reduce((s, c) => s + c.amount, 0),
        down: list.filter((c) => c.amount < 0).reduce((s, c) => s + c.amount, 0),
      }
    })
    .filter((r) => r.count > 0)

  exportExcel('变更签证台账', [
    {
      name: '变更明细',
      header: ['变更编号', '变更时间', '所属项目', '项目编号', '变更内容', '变更类型', '变更金额(元)', '是否已审批'],
      rows: rows.value.map((c) => [
        c.id,
        c.date,
        c.projectName,
        c.projectId,
        c.reason,
        c.amount > 0 ? '调增' : '调减',
        Math.abs(c.amount),
        c.approved ? '已审批' : '审批中',
      ]),
      colWidth: [12, 12, 34, 16, 46, 10, 16, 12],
    },
    {
      name: '按项目汇总',
      header: ['项目编号', '项目名称', '变更笔数', '调增合计(元)', '调减合计(元)', '净变动(元)'],
      rows: byProject.map((r) => [
        r.p.id,
        r.p.name,
        r.count,
        r.up,
        Math.abs(r.down),
        r.up + r.down,
      ]),
      colWidth: [16, 34, 10, 16, 16, 16],
    },
  ])
  message.success(`已导出 ${rows.value.length} 笔变更签证记录`)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页头 / 统计卡片行 / 筛选卡片：高度按内容固定，剩余高度全部留给变更记录表格
.page-head {
  flex: none;
}

.stat-row {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

// 变更记录卡片：占满筛选卡片以下的剩余高度，表格在卡片内部滚动
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

.amount {
  font-weight: 600;

  &.up {
    color: @status-done;
  }

  &.down {
    color: @status-overdue;
  }
}

.amount-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.upload-tip {
  margin-top: 6px;
  font-size: 12px;
  color: @text-3;
}

.dialog-tip {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 18px;
  color: @text-2;
  background: @bg-page;
  border-radius: @radius-sm;
}
</style>
