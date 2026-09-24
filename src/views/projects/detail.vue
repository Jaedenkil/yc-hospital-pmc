<template>
  <div class="pmc-page">
    <!-- 项目不存在：404 兜底，给返回台账入口 -->
    <a-result
      v-if="!project"
      status="404"
      title="项目不存在"
      sub-title="未找到该编号对应的子项目，请从项目台账重新进入"
    >
      <template #extra>
        <a-button type="primary" @click="$router.push('/projects')">返回项目台账</a-button>
      </template>
    </a-result>

    <template v-else>
      <PageHeader
        :title="`${info.name} · 项目详情`"
        :desc="`${info.id} · 牵头处室 ${info.leadDept} · 采购人 ${info.owner} · 整体完成度 ${progress}%（口径：子任务完成度加权）`"
        tag="模块1 · 项目进度"
      >
        <a-button v-if="user.can('project:edit')" @click="openEdit">编辑项目</a-button>
        <a-button v-if="user.can('doc:upload')" @click="openUpload">上传材料</a-button>
        <a-button v-if="user.can('report:export')" type="primary" @click="exportDetail">导出</a-button>
        <a-button @click="$router.push('/projects')">返回台账</a-button>
      </PageHeader>

      <!-- 整体完成度 + 基础信息 -->
      <div class="pmc-card overview">
        <div class="ring-box">
          <ProgressRing :percent="progress" :size="140" :stroke-width="11" />
          <div class="ring-label">整体完成度</div>
          <div class="ring-meta">已完成 {{ doneCount }} / {{ info.tasks.length }} 个子任务</div>
          <div class="ring-meta">滞后任务 {{ delayCount }} 项</div>
          <div class="ring-meta">当前节点：{{ currentNode ? currentNode.name : '全部节点已完成' }}</div>
        </div>

        <div class="base">
          <div class="base-grid">
            <div class="cell">
              <span class="k">项目名称</span><span class="v">{{ info.name }}</span>
            </div>
            <div class="cell">
              <span class="k">项目编号</span><span class="v num">{{ info.id }}</span>
            </div>
            <div class="cell">
              <span class="k">牵头处室</span><span class="v">{{ info.leadDept }}</span>
            </div>
            <div class="cell">
              <span class="k">采购人 / 建设单位</span><span class="v">{{ info.owner }}</span>
            </div>
            <div class="cell">
              <span class="k">建设总投资</span>
              <span class="v"><MoneyText :value="info.totalInvestment" unit="wan" bold /></span>
            </div>
            <div class="cell">
              <span class="k">中央专项资金</span>
              <span class="v"><MoneyText :value="info.centralFund" unit="wan" bold /></span>
            </div>
            <div class="cell">
              <span class="k">计划开工</span><span class="v num">{{ info.planStart }}</span>
            </div>
            <div class="cell">
              <span class="k">计划验收</span><span class="v num">{{ info.planAccept }}</span>
            </div>
            <div class="cell">
              <span class="k">监理单位</span><span class="v">{{ info.supervisor }}</span>
            </div>
          </div>

          <div class="base-content">
            <span class="k">建设内容</span>{{ info.content }}
          </div>

          <div class="base-tags">
            <a-tag color="blue">{{ info.phase }}阶段</a-tag>
            <a-tag :color="riskColor(info.riskLevel)">{{ RISK_LABEL[info.riskLevel] }}风险</a-tag>
            <a-tag>第 {{ PHASE_ORDER.indexOf(info.phase) + 1 }} / {{ PHASE_ORDER.length }} 阶段</a-tag>
            <a-tag>{{ info.fundPlan.length }} 个资金批次</a-tag>
            <a-tag>归档材料 {{ projectDocs.length }} 份</a-tag>
          </div>
        </div>
      </div>

      <!-- 资金概览：口径为中央专项资金 -->
      <div class="pmc-card card">
        <div class="card-title">
          资金概览
          <span class="desc">拨付、使用、结余均为中央专项资金口径，各批次金额合计等于中央专项资金</span>
        </div>
        <div class="fund-grid">
          <div class="fund-item">
            <div class="k">合同总投资</div>
            <div class="v"><MoneyText :value="info.totalInvestment" unit="wan" bold /></div>
            <div class="s">批复建设总投资</div>
          </div>
          <div class="fund-item">
            <div class="k">中央资金</div>
            <div class="v"><MoneyText :value="info.centralFund" unit="wan" bold /></div>
            <div class="s">占总投资 {{ fmtPercent(ratio(info.centralFund, info.totalInvestment)) }}</div>
          </div>
          <div class="fund-item">
            <div class="k">已拨付</div>
            <div class="v"><MoneyText :value="paid" unit="wan" bold /></div>
            <div class="s">
              拨付率 {{ fmtPercent(ratio(paid, info.centralFund)) }}（已到账 {{ paidBatchCount }} /
              {{ info.fundPlan.length }} 批次）
            </div>
          </div>
          <div class="fund-item">
            <div class="k">已使用</div>
            <div class="v"><MoneyText :value="used" unit="wan" bold /></div>
            <div class="s">使用率 {{ fmtPercent(ratio(used, paid)) }}（对已拨付）</div>
          </div>
          <div class="fund-item">
            <div class="k">结余</div>
            <div class="v"><MoneyText :value="balance" unit="wan" bold /></div>
            <div class="s">已拨付未使用 · 待拨付 <MoneyText :value="pending" unit="wan" /></div>
          </div>
        </div>
      </div>

      <!-- 四阶段子任务 -->
      <div v-for="g in phaseGroups" :key="g.phase" class="pmc-card card">
        <div class="phase-head">
          <span class="phase-name">{{ g.phase }}阶段</span>
          <StatusTag :status="g.status" />
          <span class="phase-meta">
            子任务 {{ g.done }} / {{ g.list.length }} 已完成 · 滞后 {{ g.delay }} 项 · 阶段计划完成
            <span class="num">{{ g.planEnd }}</span>
            · 阶段实际完成 <span class="num">{{ g.actualEnd ?? '—' }}</span>
          </span>
        </div>
        <a-table
          :columns="taskColumns"
          :data-source="g.list"
          :pagination="false"
          row-key="name"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <div class="task-name">{{ record.name }}</div>
              <div v-if="record.delayReason" class="task-delay">滞后原因：{{ record.delayReason }}</div>
            </template>
            <template v-else-if="column.key === 'planEnd'">
              <span class="num">{{ record.planEnd }}</span>
            </template>
            <template v-else-if="column.key === 'actualEnd'">
              <span v-if="record.actualEnd" class="num">{{ record.actualEnd }}</span>
              <span v-else class="muted">—</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <StatusTag :status="record.status" />
            </template>
            <template v-else-if="column.key === 'owner'">
              <span>{{ record.owner }}</span>
            </template>
            <template v-else-if="column.key === 'attachments'">
              <span class="num">{{ record.attachments }}</span>
            </template>
          </template>
        </a-table>
      </div>

      <!-- 归档材料 -->
      <div class="pmc-card card">
        <div class="card-title">
          归档材料
          <span class="desc">
            共 {{ projectDocs.length }} 份 · 覆盖 {{ docCategoryCount }} 个归档分类 · 列出最近上传
            {{ recentDocs.length }} 份
          </span>
          <a class="more" @click="$router.push('/docs')">材料归档 →</a>
        </div>
        <a-empty v-if="!recentDocs.length" description="暂无数据" />
        <a-table
          v-else
          :columns="docColumns"
          :data-source="recentDocs"
          :pagination="false"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'fileName'">
              <div class="doc-name">{{ record.fileName }}</div>
              <div class="sub">编号 {{ record.id }} · {{ record.fileType.toUpperCase() }}</div>
            </template>
            <template v-else-if="column.key === 'category'">
              <a-tag color="blue">{{ record.category }}</a-tag>
            </template>
            <template v-else-if="column.key === 'uploader'">
              <span>{{ record.uploader }}</span>
            </template>
            <template v-else-if="column.key === 'uploadTime'">
              <span class="num">{{ record.uploadTime }}</span>
            </template>
            <template v-else-if="column.key === 'sizeKb'">
              <span class="num">{{ record.sizeKb }}</span>
            </template>
          </template>
        </a-table>
      </div>

      <!-- 编辑项目（演示：基础信息维护） -->
      <AModal
        v-model:open="editOpen"
        title="编辑项目基础信息"
        ok-text="保存"
        cancel-text="取消"
        :width="640"
        @ok="submitEdit"
      >
        <AForm layout="vertical">
          <AFormItem label="采购人 / 建设单位" required>
            <a-input v-model:value="editForm.owner" />
          </AFormItem>
          <AFormItem label="监理单位" required>
            <a-input v-model:value="editForm.supervisor" />
          </AFormItem>
          <AFormItem label="计划开工（YYYY-MM-DD）" required>
            <a-input v-model:value="editForm.planStart" />
          </AFormItem>
          <AFormItem label="计划验收（YYYY-MM-DD）" required>
            <a-input v-model:value="editForm.planAccept" />
          </AFormItem>
          <AFormItem label="建设内容" required>
            <ATextarea v-model:value="editForm.content" :rows="3" />
          </AFormItem>
        </AForm>
        <div class="dialog-tip">
          保存后本页展示即时更新（项目编号、资金批次与子任务计划时间不随基础信息调整）；演示环境不写入服务端。
        </div>
      </AModal>

      <!-- 上传材料（演示：登记归档流程） -->
      <AModal
        v-model:open="uploadOpen"
        title="上传归档材料"
        ok-text="提交归档"
        cancel-text="取消"
        :width="640"
        @ok="submitUpload"
      >
        <AForm layout="vertical">
          <AFormItem label="材料名称" required>
            <a-input v-model:value="uploadForm.fileName" placeholder="如：XX 系统上线试运行报告.pdf" />
          </AFormItem>
          <AFormItem label="归档分类" required>
            <a-select v-model:value="uploadForm.category" :options="categoryOptions" style="width: 100%" />
          </AFormItem>
          <AFormItem label="文件类型">
            <a-select v-model:value="uploadForm.fileType" :options="fileTypeOptions" style="width: 100%" />
          </AFormItem>
          <AFormItem label="上传人">
            <a-input v-model:value="uploadForm.uploader" />
          </AFormItem>
        </AForm>
        <div class="dialog-tip">
          提交后材料归入「{{ info.name }} › {{ uploadForm.category }}」，登记时间取演示基准日
          {{ TODAY }}；演示环境不实际存储文件，登记结果用于归档流程演示。
        </div>
      </AModal>
    </template>
  </div>
</template>

<script setup lang="ts">
// 子项目详情（需求模块 1）：基础信息 + 整体完成度进度环 + 四阶段子任务五色台账 + 资金概览 + 归档材料
import { computed, ref, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Form as AForm,
  FormItem as AFormItem,
  Modal as AModal,
  Textarea as ATextarea,
  message,
} from 'ant-design-vue'
import { DOC_CATEGORIES, PHASE_ORDER, RISK_LABEL, TASK_STATUS_LABEL, TODAY } from '@/mock'
import type { DocCategory, DocItem, Phase, PhaseTask, RiskLevel, SubProject, TaskStatus } from '@/mock/types'
import { allDocs, findProject, paidAmount, projectProgress, usedAmount } from '@/mock'
import { exportExcel } from '@/utils/export'
import { fmtPercent, ratio } from '@/utils/format'
import { currentTask, delayCountOf } from '@/utils/stats'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
const route = useRoute()
const docs = allDocs()

const project = computed(() => findProject(String(route.params.id ?? '')))
/** 本页编辑结果（仅影响本页展示，不改动 mock 缓存） */
const edits = ref<Partial<SubProject>>({})
/** 本页登记的归档材料（新建在最前） */
const localDocs = ref<DocItem[]>([])
/**
 * 正常分支专用数据：项目不存在时由 404 分支兜底渲染，不会读取该值。
 * 在本页编辑过的字段以本地编辑结果为准，其余字段取自项目原始数据。
 */
const info = computed<SubProject>(() => {
  const base = project.value as SubProject
  const patch = edits.value
  return {
    ...base,
    owner: patch.owner ?? base.owner,
    supervisor: patch.supervisor ?? base.supervisor,
    content: patch.content ?? base.content,
    planStart: patch.planStart ?? base.planStart,
    planAccept: patch.planAccept ?? base.planAccept,
  }
})

// ---------------- 进度与关键口径 ----------------

const progress = computed(() => projectProgress(info.value))
const doneCount = computed(() => info.value.tasks.filter((t) => t.status === 'done').length)
const delayCount = computed(() => delayCountOf(info.value))
/** 当前推进节点：优先滞后任务，其次进行中任务 */
const currentNode = computed(() => currentTask(info.value))

const paid = computed(() => paidAmount(info.value))
const used = computed(() => usedAmount(info.value))
const balance = computed(() => paid.value - used.value)
const pending = computed(() => info.value.centralFund - paid.value)
const paidBatchCount = computed(() => info.value.fundPlan.filter((b) => b.payDate).length)

// ---------------- 四阶段分组 ----------------

interface PhaseGroup {
  phase: Phase
  list: PhaseTask[]
  /** 已完成子任务数 */
  done: number
  /** 滞后子任务数（延期预警 + 严重滞后） */
  delay: number
  /** 阶段整体状态：全完成 → done；否则取最严重的一种 */
  status: TaskStatus
  planEnd: string
  /** 阶段实际完成时间（全部完成才有值） */
  actualEnd: string | null
}

const phaseGroups = computed<PhaseGroup[]>(() =>
  PHASE_ORDER.map((phase) => {
    const list = info.value.tasks.filter((t) => t.phase === phase)
    const done = list.filter((t) => t.status === 'done').length
    const delay = list.filter((t) => t.status === 'warn' || t.status === 'overdue').length
    const status: TaskStatus =
      list.length > 0 && done === list.length
        ? 'done'
        : list.some((t) => t.status === 'overdue')
          ? 'overdue'
          : list.some((t) => t.status === 'warn')
            ? 'warn'
            : list.some((t) => t.status === 'doing')
              ? 'doing'
              : 'not-started'
    const finished = list
      .map((t) => t.actualEnd)
      .filter((d): d is string => !!d)
      .sort()
    return {
      phase,
      list,
      done,
      delay,
      status,
      planEnd: list.length ? list[list.length - 1].planEnd : '—',
      actualEnd: list.length > 0 && done === list.length ? (finished[finished.length - 1] ?? null) : null,
    }
  }),
)

const taskColumns = [
  { title: '子任务', key: 'name', width: 360 },
  { title: '负责人', key: 'owner', width: 110 },
  { title: '计划完成', key: 'planEnd', width: 130, align: 'center' as const },
  { title: '实际完成', key: 'actualEnd', width: 130, align: 'center' as const },
  { title: '状态', key: 'status', width: 120, align: 'center' as const },
  { title: '附件数', key: 'attachments', width: 100, align: 'right' as const },
]

// ---------------- 归档材料 ----------------

/** 本项目归档材料：本页新登记的在前，其余取自 mock 文档库 */
const projectDocs = computed(() => [
  ...localDocs.value,
  ...docs.filter((d) => d.projectId === info.value.id),
])
/** 最近上传的材料（按上传时间倒序取前 6 份） */
const recentDocs = computed(() =>
  [...projectDocs.value]
    .sort((a, b) => (a.uploadTime < b.uploadTime ? 1 : a.uploadTime > b.uploadTime ? -1 : 0))
    .slice(0, 6),
)
const docCategoryCount = computed(() => new Set(projectDocs.value.map((d) => d.category)).size)

const docColumns = [
  { title: '材料名称', key: 'fileName' },
  { title: '归档分类', key: 'category', width: 150, align: 'center' as const },
  { title: '上传人', key: 'uploader', width: 120 },
  { title: '上传时间', key: 'uploadTime', width: 140, align: 'center' as const },
  { title: '大小(KB)', key: 'sizeKb', width: 110, align: 'right' as const },
]

// ---------------- 编辑项目 ----------------

const editOpen = ref(false)
const editForm = reactive({ owner: '', supervisor: '', planStart: '', planAccept: '', content: '' })
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function openEdit() {
  const p = info.value
  editForm.owner = p.owner
  editForm.supervisor = p.supervisor
  editForm.planStart = p.planStart
  editForm.planAccept = p.planAccept
  editForm.content = p.content
  editOpen.value = true
}

function submitEdit() {
  const owner = editForm.owner.trim()
  const supervisor = editForm.supervisor.trim()
  const content = editForm.content.trim()
  if (!owner || !supervisor || !content) {
    message.warning('采购人、监理单位与建设内容均不能为空')
    return
  }
  if (!DATE_RE.test(editForm.planStart) || !DATE_RE.test(editForm.planAccept)) {
    message.warning('计划开工 / 计划验收需按 YYYY-MM-DD 格式填写')
    return
  }
  if (editForm.planAccept <= editForm.planStart) {
    message.warning('计划验收时间需晚于计划开工时间')
    return
  }
  if (editForm.planStart > TODAY) {
    message.warning(`项目已实施，计划开工时间不得晚于演示基准日 ${TODAY}`)
    return
  }
  if (editForm.planAccept < TODAY) {
    message.warning(`项目尚未验收，计划验收时间不得早于演示基准日 ${TODAY}`)
    return
  }
  edits.value = {
    ...edits.value,
    owner,
    supervisor,
    content,
    planStart: editForm.planStart,
    planAccept: editForm.planAccept,
  }
  editOpen.value = false
  message.success(`${info.value.name}（${info.value.id}）基础信息已更新，本页展示即时生效`)
}

// ---------------- 上传材料（登记归档） ----------------

const uploadOpen = ref(false)
const uploadForm = reactive({
  fileName: '',
  category: '立项' as DocCategory,
  fileType: 'pdf' as DocItem['fileType'],
  uploader: '',
})

const categoryOptions = DOC_CATEGORIES.map((c) => ({ value: c, label: c }))
const fileTypeOptions = [
  { value: 'pdf', label: 'PDF 文档' },
  { value: 'doc', label: 'Word 文档' },
  { value: 'xls', label: 'Excel 表格' },
  { value: 'img', label: '图片' },
]

function openUpload() {
  uploadForm.fileName = ''
  uploadForm.category = '立项'
  uploadForm.fileType = 'pdf'
  uploadForm.uploader = user.name
  uploadOpen.value = true
}

function submitUpload() {
  const fileName = uploadForm.fileName.trim()
  const uploader = uploadForm.uploader.trim()
  if (!fileName) {
    message.warning('请填写材料名称')
    return
  }
  if (!uploader) {
    message.warning('请填写上传人')
    return
  }
  // 文件大小取同分类材料的平均水平，避免演示数据出现离群值
  const sameCategory = docs.filter((d) => d.category === uploadForm.category)
  const sizeKb = sameCategory.length
    ? Math.round(sameCategory.reduce((s, d) => s + d.sizeKb, 0) / sameCategory.length)
    : 1024
  localDocs.value = [
    {
      id: `DOC-N${String(localDocs.value.length + 1).padStart(3, '0')}`,
      projectId: info.value.id,
      category: uploadForm.category,
      fileName,
      fileType: uploadForm.fileType,
      uploader,
      uploadTime: TODAY,
      sizeKb,
    },
    ...localDocs.value,
  ]
  uploadOpen.value = false
  message.success(
    `《${fileName}》已登记为「${uploadForm.category}」材料（上传人 ${uploader}，上传时间 ${TODAY}），归档份数更新为 ${projectDocs.value.length} 份`,
  )
}

// ---------------- 导出 ----------------

/** 金额（元）→ 万元数值：导出 Excel 用真实数字列 */
function wanValue(yuan: number): number {
  return Number((yuan / 1_0000).toFixed(2))
}

function exportDetail() {
  const p = info.value
  exportExcel(`项目详情_${p.id}`, [
    {
      name: '项目基础信息',
      header: ['字段', '内容'],
      rows: [
        ['项目名称', p.name],
        ['项目编号', p.id],
        ['牵头处室', p.leadDept],
        ['采购人 / 建设单位', p.owner],
        ['监理单位', p.supervisor],
        ['建设总投资（万元）', wanValue(p.totalInvestment)],
        ['中央专项资金（万元）', wanValue(p.centralFund)],
        ['计划开工', p.planStart],
        ['计划验收', p.planAccept],
        ['当前阶段', p.phase],
        ['风险等级', `${RISK_LABEL[p.riskLevel]}风险`],
        ['整体完成度（%）', progress.value],
        ['滞后任务数（项）', delayCount.value],
        ['归档材料（份）', projectDocs.value.length],
        ['建设内容', p.content],
      ],
      colWidth: [20, 70],
    },
    {
      name: '四阶段子任务',
      header: ['阶段', '子任务', '负责人', '计划完成', '实际完成', '状态', '滞后原因', '附件数'],
      rows: p.tasks.map((t) => [
        t.phase,
        t.name,
        t.owner,
        t.planEnd,
        t.actualEnd ?? '—',
        TASK_STATUS_LABEL[t.status],
        t.delayReason ?? '',
        t.attachments,
      ]),
      colWidth: [10, 24, 10, 13, 13, 12, 30, 9],
    },
    {
      name: '资金批次',
      header: ['批次', '计划拨付时间', '实际拨付时间', '拨付金额（万元）', '已使用（万元）', '使用率'],
      rows: p.fundPlan.map((b) => [
        `第 ${b.batch} 批`,
        b.planDate,
        b.payDate ?? '未拨付',
        wanValue(b.amount),
        wanValue(b.used),
        b.payDate ? fmtPercent(ratio(b.used, b.amount)) : '—',
      ]),
      colWidth: [9, 15, 15, 17, 16, 10],
    },
    {
      name: '归档材料',
      header: ['材料名称', '归档分类', '上传人', '上传时间', '大小（KB）'],
      rows: projectDocs.value.map((d) => [d.fileName, d.category, d.uploader, d.uploadTime, d.sizeKb]),
      colWidth: [46, 14, 12, 14, 11],
    },
  ])
  message.success(`${p.name}项目详情已导出（含基础信息、四阶段子任务、资金批次、归档材料 4 张工作表）`)
}

/** 项目切换时清空本页编辑与登记结果 */
watch(
  () => route.params.id,
  () => {
    edits.value = {}
    localDocs.value = []
  },
)

function riskColor(level: RiskLevel): string {
  return level === 'high' ? 'red' : level === 'mid' ? 'orange' : 'green'
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.overview {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 20px;
  padding: 18px 20px;
  margin-bottom: 12px;
}

.ring-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 12px;
  text-align: center;
  background: @primary-bg;
  border: 1px solid @primary-border;
  border-radius: @radius;

  .ring-label {
    margin-top: 6px;
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }

  .ring-meta {
    font-size: 12px;
    color: @text-2;
  }
}

.base {
  min-width: 0;
}

.base-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 18px;

  .cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    .k {
      font-size: 12px;
      color: @text-3;
    }

    .v {
      font-size: 14px;
      color: @text-1;
      word-break: break-all;
    }
  }
}

.base-content {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed @border-color;
  font-size: 13px;
  line-height: 1.7;
  color: @text-2;

  .k {
    margin-right: 8px;
    color: @text-3;
  }
}

.base-tags {
  margin-top: 10px;
}

.card {
  padding: 14px 16px 16px;
  margin-bottom: 12px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 15px;
  font-weight: 600;
  color: @text-1;

  .desc {
    font-size: 12px;
    font-weight: 400;
    color: @text-3;
  }

  .more {
    margin-left: auto;
    font-size: 13px;
    font-weight: 400;
    color: @primary;
  }
}

.fund-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.fund-item {
  padding: 12px 14px;
  background: @bg-page;
  border-radius: @radius-sm;

  .k {
    font-size: 12px;
    color: @text-3;
  }

  .v {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
    color: @text-1;
  }

  .s {
    margin-top: 4px;
    font-size: 12px;
    color: @text-3;
  }
}

.phase-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;

  .phase-name {
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  .phase-meta {
    font-size: 12px;
    color: @text-3;
  }
}

.task-name {
  color: @text-1;
}

.task-delay {
  margin-top: 2px;
  font-size: 12px;
  color: @status-overdue;
}

.muted {
  color: @text-3;
}

.num {
  font-variant-numeric: tabular-nums;
}

.doc-name {
  color: @text-1;
}

.sub {
  font-size: 12px;
  color: @text-3;
}

.dialog-tip {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: @text-2;
  background: @primary-bg;
  border-radius: @radius-sm;
}
</style>
