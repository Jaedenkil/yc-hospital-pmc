<template>
  <div class="pmc-page">
    <PageHeader
      title="文档与资料归档"
      desc="全部子项目按 8 类归档目录归集建设材料，支持按文件名 / 上传人检索、在线预览与材料清单导出"
      tag="模块 5"
    >
      <a-button v-if="user.can('doc:upload')" type="primary" @click="openUpload">
        <template #icon><CloudUploadOutlined /></template>
        上传材料
      </a-button>
      <a-button v-if="user.can('report:export')" @click="exportList">
        <template #icon><DownloadOutlined /></template>
        导出材料清单
      </a-button>
    </PageHeader>

    <div class="doc-layout">
      <!-- 左侧：归档项目选择（含每个项目的归档材料数） -->
      <a-card :bordered="false" class="pmc-card side">
        <div class="side-head">
          <div class="side-title">归档项目（{{ projectList.length }}）</div>
          <a-input v-model:value="projectKeyword" size="small" placeholder="搜索项目名称 / 编号" allow-clear>
            <template #prefix><SearchOutlined /></template>
          </a-input>
        </div>
        <div class="proj-list">
          <div
            v-for="p in projectList"
            :key="p.id"
            class="proj-item"
            :class="{ active: p.id === activeId }"
            @click="activeId = p.id"
          >
            <div class="p-name">{{ p.name }}</div>
            <div class="p-meta">
              <span>{{ p.id }}</span>
              <span class="p-count">{{ countMap[p.id] ?? 0 }} 份</span>
            </div>
          </div>
          <a-empty v-if="!projectList.length" description="暂无匹配项目" />
        </div>
      </a-card>

      <!-- 右侧：该项目 8 类归档目录 -->
      <div class="main">
        <a-card :bordered="false" class="pmc-card toolbar">
          <div class="toolbar-row">
            <a-input v-model:value="query.keyword" placeholder="按文件名 / 上传人检索" allow-clear style="width: 260px">
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <a-select v-model:value="query.type" :options="typeFilterOptions" style="width: 140px" />
            <a-button @click="resetQuery">重置</a-button>
            <span class="spacer"></span>
            <span class="hint">
              当前项目：<b>{{ activeProject?.name }}</b>（{{ activeProject?.id }}）· 归档材料
              <b>{{ projectDocTotal }}</b> 份 · 检索命中 <b>{{ filteredDocs.length }}</b> 份
            </span>
          </div>
        </a-card>

        <a-card :bordered="false" class="pmc-card cat-card">
          <a-collapse :activeKey="activeKeys" :bordered="false" @update:activeKey="onKeysChange">
            <a-collapse-panel v-for="cat in DOC_CATEGORIES" :key="cat" :header="headerOf(cat)">
              <a-table
                :columns="docColumns"
                :data-source="docsOf(cat)"
                :pagination="false"
                row-key="id"
                size="small"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'fileName'">
                    <a class="fname" @click="openPreview(asDoc(record))">{{ record.fileName }}</a>
                  </template>
                  <template v-else-if="column.key === 'fileType'">
                    <span class="ftype">
                      <component :is="iconOf(record.fileType)" class="ftype-icon" :class="record.fileType" />
                      {{ record.fileType.toUpperCase() }}
                    </span>
                  </template>
                  <template v-else-if="column.key === 'sizeKb'">
                    <span class="num">{{ record.sizeKb }}</span>
                  </template>
                  <template v-else-if="column.key === 'action'">
                    <a-space>
                      <a @click="openPreview(asDoc(record))">预览</a>
                      <a @click="downloadOne(asDoc(record))">下载</a>
                    </a-space>
                  </template>
                </template>
              </a-table>
              <a-empty v-if="!docsOf(cat).length" description="该目录下暂无匹配材料" />
            </a-collapse-panel>
          </a-collapse>
        </a-card>
      </div>
    </div>

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
          <a-input v-model:value="uploadForm.fileName" placeholder="如：《XX医院HIS系统升级改造可行性研究报告》" />
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
        提交后材料将归入「{{ activeProject?.name }} › {{ uploadForm.category }}」；演示环境不实际存储文件，登记结果用于归档流程演示。
      </div>
    </AModal>

    <!-- 在线预览 -->
    <AModal v-model:open="previewOpen" title="材料在线预览" :footer="null" :width="780">
      <div v-if="previewDoc" class="preview">
        <div class="pv-name">{{ previewDoc.fileName }}</div>
        <ADescriptions :column="2" size="small" bordered>
          <ADescriptionsItem label="材料编号">{{ previewDoc.id }}</ADescriptionsItem>
          <ADescriptionsItem label="归档分类">{{ previewDoc.category }}</ADescriptionsItem>
          <ADescriptionsItem label="所属项目">{{ projectNameMap.get(previewDoc.projectId) }}</ADescriptionsItem>
          <ADescriptionsItem label="项目编号">{{ previewDoc.projectId }}</ADescriptionsItem>
          <ADescriptionsItem label="上传人">{{ previewDoc.uploader }}</ADescriptionsItem>
          <ADescriptionsItem label="上传时间">{{ previewDoc.uploadTime }}</ADescriptionsItem>
          <ADescriptionsItem label="文件类型">{{ previewDoc.fileType.toUpperCase() }}</ADescriptionsItem>
          <ADescriptionsItem label="文件大小">{{ previewDoc.sizeKb }} KB</ADescriptionsItem>
        </ADescriptions>
        <div class="pv-paper">
          <div class="pv-paper-head">{{ previewDoc.fileName }}</div>
          <div class="pv-paper-sub">盐城市公立医院改革与高质量发展示范项目 · 信息化建设归档材料</div>
          <div v-for="(w, i) in LINE_WIDTHS" :key="i" class="pv-line" :style="{ width: `${w}%` }"></div>
          <div class="pv-paper-foot">
            共 {{ pageCountOf(previewDoc.sizeKb) }} 页 · 预览区按材料版面结构展示，正式文件以归档原件为准
          </div>
        </div>
        <div class="pv-actions">
          <a-button @click="downloadOne(previewDoc)">
            <template #icon><DownloadOutlined /></template>
            下载材料
          </a-button>
          <a-button type="primary" @click="printOne(previewDoc)">
            <template #icon><PrinterOutlined /></template>
            打印 / 导出 PDF
          </a-button>
        </div>
      </div>
    </AModal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  Collapse as ACollapse,
  CollapsePanel as ACollapsePanel,
  Descriptions as ADescriptions,
  DescriptionsItem as ADescriptionsItem,
  Form as AForm,
  FormItem as AFormItem,
  Modal as AModal,
  message,
} from 'ant-design-vue'
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  PrinterOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue'
import { DOC_CATEGORIES, allDocs, allProjects } from '@/mock'
import type { DocCategory, DocItem } from '@/mock/types'
import { useUserStore } from '@/stores/user'
import { exportExcel, printTable } from '@/utils/export'

const user = useUserStore()
const projects = allProjects()
const docs = allDocs()

/** 项目编号 → 项目名称 */
const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))

/** 左侧项目检索与当前选中项目 */
const projectKeyword = ref('')
const activeId = ref(projects[0]?.id ?? '')

/** 右侧材料检索（文件名 / 上传人）与文件类型筛选 */
const query = reactive({ keyword: '', type: '' as '' | DocItem['fileType'] })

/** 默认展开「立项」目录（每个项目在该目录下均有材料归档） */
const activeKeys = ref<Array<string | number>>(['立项'])

/** 折叠面板展开项变化：Ant Design 回调参数为 Key | Key[]，统一转为字符串数组 */
function onKeysChange(keys: string | number | Array<string | number>) {
  activeKeys.value = Array.isArray(keys) ? keys.map(String) : [String(keys)]
}

const typeFilterOptions = [
  { value: '', label: '全部类型' },
  { value: 'pdf', label: 'PDF 文档' },
  { value: 'doc', label: 'DOC 文档' },
  { value: 'xls', label: 'XLS 表格' },
  { value: 'img', label: 'IMG 图片' },
]

const fileTypeOptions = [
  { value: 'pdf', label: 'PDF 文档' },
  { value: 'doc', label: 'DOC 文档' },
  { value: 'xls', label: 'XLS 表格' },
  { value: 'img', label: 'IMG 图片' },
]

const categoryOptions = DOC_CATEGORIES.map((c) => ({ value: c, label: c }))

/** 每个项目的归档材料数 */
const countMap = computed(() => {
  const map: Record<string, number> = {}
  for (const d of docs) map[d.projectId] = (map[d.projectId] ?? 0) + 1
  return map
})

const projectList = computed(() =>
  projects.filter((p) => !projectKeyword.value || `${p.name}${p.id}`.includes(projectKeyword.value)),
)

const activeProject = computed(() => projects.find((p) => p.id === activeId.value))

/** 当前项目材料（叠加关键词与类型筛选） */
const filteredDocs = computed(() =>
  docs.filter(
    (d) =>
      d.projectId === activeId.value &&
      (!query.keyword || d.fileName.includes(query.keyword) || d.uploader.includes(query.keyword)) &&
      (!query.type || d.fileType === query.type),
  ),
)

const projectDocTotal = computed(() => countMap.value[activeId.value] ?? 0)

/** 按归档分类分组（表格数据源） */
const docsByCat = computed(() => {
  const map = new Map<DocCategory, DocItem[]>()
  for (const cat of DOC_CATEGORIES) map.set(cat, filteredDocs.value.filter((d) => d.category === cat))
  return map
})

function docsOf(cat: DocCategory): DocItem[] {
  return docsByCat.value.get(cat) ?? []
}

/** 折叠面板标题：分类名 + 该目录归档数量与体量 */
function headerOf(cat: DocCategory): string {
  const list = docs.filter((d) => d.projectId === activeId.value && d.category === cat)
  const kb = list.reduce((s, d) => s + d.sizeKb, 0)
  return `${cat}（${list.length} 份 · 合计 ${kb} KB）`
}

function resetQuery() {
  query.keyword = ''
  query.type = ''
}

/** 材料预览区模拟版面行的宽度（%） */
const LINE_WIDTHS = [97, 92, 96, 78, 90, 95, 62, 93, 84, 88, 70, 91, 86, 48]

function pageCountOf(sizeKb: number): number {
  if (sizeKb >= 4000) return 48
  if (sizeKb >= 2000) return 32
  if (sizeKb >= 800) return 18
  return 8
}

function iconOf(type: DocItem['fileType']) {
  if (type === 'pdf') return FilePdfOutlined
  if (type === 'doc') return FileWordOutlined
  if (type === 'xls') return FileExcelOutlined
  return FileImageOutlined
}

// ---------------- 上传材料 ----------------
const uploadOpen = ref(false)
const uploadForm = reactive({
  fileName: '',
  category: '立项' as DocCategory,
  fileType: 'pdf' as DocItem['fileType'],
  uploader: user.name,
})

function openUpload() {
  uploadForm.fileName = ''
  uploadForm.category = '立项'
  uploadForm.fileType = 'pdf'
  uploadForm.uploader = user.name
  uploadOpen.value = true
}

function submitUpload() {
  if (!uploadForm.fileName.trim()) {
    message.warning('请填写材料名称')
    return
  }
  uploadOpen.value = false
  message.success(
    `《${uploadForm.fileName}》已登记为「${uploadForm.category}」材料，归档流程演示完成（不实际存储文件）`,
  )
}

/** 表格插槽中的 record 为宽松类型，统一断言为归档材料记录后交给业务函数 */
const asDoc = (r: Record<string, unknown>) => r as unknown as DocItem

// ---------------- 在线预览 ----------------
const previewOpen = ref(false)
const previewDoc = ref<DocItem | null>(null)

function openPreview(doc: DocItem) {
  previewDoc.value = doc
  previewOpen.value = true
}

// ---------------- 下载 / 打印 ----------------
function downloadOne(doc: DocItem) {
  exportExcel(`归档材料-${doc.id}`, [
    {
      name: '材料登记信息',
      header: ['材料编号', '文件名', '归档分类', '所属项目', '项目编号', '上传人', '上传时间', '文件类型', '大小(KB)'],
      rows: [
        [
          doc.id,
          doc.fileName,
          doc.category,
          projectNameMap.get(doc.projectId) ?? '',
          doc.projectId,
          doc.uploader,
          doc.uploadTime,
          doc.fileType.toUpperCase(),
          doc.sizeKb,
        ],
      ],
      colWidth: [12, 54, 12, 34, 16, 12, 12, 10, 10],
    },
    {
      name: '材料卷内目录',
      header: ['序号', '卷内条目', '说明'],
      rows: [
        [1, '正文', '按归档分类要求编制的材料正文及签署页'],
        [2, '附件', '评审意见、批复文件、会议签到等附件扫描件'],
        [3, '电子文件', '与纸质材料一致的电子文件（PDF / DOC / XLS / IMG）'],
      ],
      colWidth: [8, 18, 56],
    },
  ])
  message.success(`《${doc.fileName}》材料包已导出`)
}

function printOne(doc: DocItem) {
  printTable({
    title: doc.fileName,
    subtitle: `${doc.category} · ${projectNameMap.get(doc.projectId) ?? ''}`,
    header: ['材料项', '内容'],
    rows: [
      ['材料编号', doc.id],
      ['归档分类', doc.category],
      ['所属项目', projectNameMap.get(doc.projectId) ?? ''],
      ['上传人', doc.uploader],
      ['上传时间', doc.uploadTime],
      ['文件大小', `${doc.sizeKb} KB`],
    ],
    align: ['center', 'left'],
    footer: '数据来源：盐城市公立医院改革与高质量发展示范项目 · 项目档案台账（演示数据）',
  })
}

/** 导出全部项目的归档材料清单（明细 + 按项目汇总两张表） */
function exportList() {
  exportExcel('项目归档材料清单', [
    {
      name: '材料明细',
      header: ['材料编号', '项目编号', '项目名称', '归档分类', '文件名', '文件类型', '上传人', '上传时间', '大小(KB)'],
      rows: docs.map((d) => [
        d.id,
        d.projectId,
        projectNameMap.get(d.projectId) ?? '',
        d.category,
        d.fileName,
        d.fileType.toUpperCase(),
        d.uploader,
        d.uploadTime,
        d.sizeKb,
      ]),
      colWidth: [12, 16, 34, 14, 54, 10, 12, 12, 10],
    },
    {
      name: '按项目汇总',
      header: ['项目编号', '项目名称', '归档材料数', '覆盖归档目录数'],
      rows: projects.map((p) => [
        p.id,
        p.name,
        countMap.value[p.id] ?? 0,
        new Set(docs.filter((d) => d.projectId === p.id).map((d) => d.category)).size,
      ]),
      colWidth: [16, 34, 12, 16],
    },
  ])
  message.success(`已导出 ${docs.length} 份归档材料的清单`)
}

/** 表格列：文件名 / 类型 / 上传人 / 上传时间 / 大小 / 操作 */
const docColumns = [
  { title: '文件名', key: 'fileName', width: 360 },
  { title: '类型', key: 'fileType', width: 100 },
  { title: '上传人', dataIndex: 'uploader', key: 'uploader', width: 110 },
  { title: '上传时间', dataIndex: 'uploadTime', key: 'uploadTime', width: 120 },
  { title: '大小(KB)', key: 'sizeKb', width: 100, align: 'right' as const },
  { title: '操作', key: 'action', width: 130 },
]
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

// 页面占满内容区高度：下方两栏按剩余空间分配，各自在内部滚动
.pmc-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.doc-layout {
  display: flex;
  flex: 1;
  gap: 12px;
  min-height: 0;
}

.side {
  width: 292px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 12px 8px;

  // a-card 内层容器同样纵向撑满，项目列表才能占满卡片剩余高度
  :deep(.ant-card-body) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .side-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 10px;
    border-bottom: 1px solid @border-split;
  }

  .side-title {
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }

  .proj-list {
    flex: 1;
    min-height: 0;
    margin-top: 8px;
    overflow: auto;
  }

  .proj-item {
    padding: 8px 10px;
    border-radius: @radius-sm;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: background 0.2s;

    &:hover {
      background: @bg-page;
    }

    &.active {
      background: @primary-bg;
      border-left-color: @primary;
    }

    .p-name {
      font-size: 13px;
      color: @text-1;
      line-height: 18px;
    }

    .p-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 12px;
      color: @text-3;
      font-variant-numeric: tabular-nums;

      .p-count {
        color: @primary;
        font-weight: 600;
      }
    }
  }
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.toolbar {
  flex: none;
  margin-bottom: 12px;
  padding: 14px 16px;

  .toolbar-row {
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

.cat-card {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 12px 12px;

  :deep(.ant-collapse-header) {
    font-weight: 600;
    color: @text-1;
  }
}

.fname {
  color: @primary;
}

.ftype {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-variant-numeric: tabular-nums;

  .ftype-icon {
    font-size: 15px;

    &.pdf {
      color: @status-overdue;
    }

    &.doc {
      color: @primary;
    }

    &.xls {
      color: @status-done;
    }

    &.img {
      color: @status-warn;
    }
  }
}

.num {
  font-variant-numeric: tabular-nums;
}

.dialog-tip {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 18px;
  color: @text-2;
  background: @bg-page;
  border-radius: @radius-sm;
}

.preview {
  .pv-name {
    margin-bottom: 10px;
    font-size: 15px;
    font-weight: 600;
    color: @text-1;
  }

  .pv-paper {
    margin: 14px 0;
    padding: 18px 22px;
    background: #fff;
    border: 1px solid @border-color;
    box-shadow: 0 2px 10px rgba(31, 35, 41, 0.08);
    border-radius: @radius-sm;

    .pv-paper-head {
      font-size: 15px;
      font-weight: 600;
      color: @text-1;
      text-align: center;
    }

    .pv-paper-sub {
      margin: 6px 0 16px;
      font-size: 12px;
      color: @text-3;
      text-align: center;
    }

    .pv-line {
      height: 9px;
      margin-bottom: 9px;
      background: @border-split;
      border-radius: 2px;
    }

    .pv-paper-foot {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed @border-color;
      font-size: 12px;
      color: @text-3;
      text-align: center;
    }
  }

  .pv-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
