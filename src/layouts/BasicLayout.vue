<template>
  <a-layout class="app">
    <a-layout-sider class="app-sider" :width="220" theme="dark" :collapsed="collapsed" :collapsible="true" @collapse="collapsed = !collapsed">
      <div class="brand">
        <div class="brand-mark">盐</div>
        <div v-show="!collapsed" class="brand-text">
          <div class="t1">示范项目管控平台</div>
          <div class="t2">盐城市公立医院改革 · 信息化</div>
        </div>
      </div>

      <a-menu
        v-model:selectedKeys="selectedKeys"
        theme="dark"
        mode="inline"
        :openKeys="openKeys"
        @openChange="onOpenChange"
        @click="onMenuClick"
      >
        <a-menu-item v-if="canSee('/')" key="/"><template #icon><DashboardOutlined /></template>数据驾驶舱</a-menu-item>
        <a-sub-menu v-if="canSee('/projects')" key="g-project">
          <template #icon><ProjectOutlined /></template>
          <template #title>项目管理</template>
          <a-menu-item key="/projects">项目台账</a-menu-item>
          <a-menu-item v-if="canSee('/progress')" key="/progress">进度总览</a-menu-item>
        </a-sub-menu>
        <a-sub-menu v-if="canSee('/statistics')" key="g-stat">
          <template #icon><PieChartOutlined /></template>
          <template #title>统计分析</template>
          <a-menu-item key="/statistics">项目数量统计</a-menu-item>
          <a-menu-item v-if="canSee('/statistics/dept')" key="/statistics/dept">按牵头处室统计</a-menu-item>
        </a-sub-menu>
        <a-sub-menu v-if="canSee('/funds')" key="g-fund">
          <template #icon><AccountBookOutlined /></template>
          <template #title>资金监管</template>
          <a-menu-item key="/funds">资金总览</a-menu-item>
          <a-menu-item v-if="canSee('/funds/warning')" key="/funds/warning">资金预警</a-menu-item>
        </a-sub-menu>
        <a-menu-item v-if="canSee('/reports')" key="/reports"><template #icon><FileTextOutlined /></template>报表中心</a-menu-item>
        <a-menu-item v-if="canSee('/docs')" key="/docs"><template #icon><FolderOutlined /></template>文档归档</a-menu-item>
        <a-sub-menu v-if="canSee('/supervision')" key="g-sup">
          <template #icon><SafetyCertificateOutlined /></template>
          <template #title>监理业务</template>
          <a-menu-item key="/supervision">监理台账</a-menu-item>
          <a-menu-item v-if="canSee('/supervision/changes')" key="/supervision/changes">变更签证</a-menu-item>
          <a-menu-item v-if="canSee('/supervision/issues')" key="/supervision/issues">问题台账</a-menu-item>
        </a-sub-menu>
        <a-sub-menu v-if="canSee('/audit')" key="g-audit">
          <template #icon><AuditOutlined /></template>
          <template #title>审计与测评</template>
          <a-menu-item key="/audit">跟踪审计简报</a-menu-item>
          <a-menu-item v-if="canSee('/audit/testing')" key="/audit/testing">软件测评任务</a-menu-item>
          <a-menu-item v-if="canSee('/audit/meetings')" key="/audit/meetings">评审会议</a-menu-item>
        </a-sub-menu>
        <a-sub-menu v-if="canSee('/system/users')" key="g-sys">
          <template #icon><SettingOutlined /></template>
          <template #title>系统管理</template>
          <a-menu-item key="/system/users">用户与角色</a-menu-item>
          <a-menu-item v-if="canSee('/system/logs')" key="/system/logs">操作日志</a-menu-item>
        </a-sub-menu>
      </a-menu>

      <div v-show="!collapsed" class="sider-foot">
        <div class="foot-line">当前角色 · {{ user.roleName }}</div>
        <div class="foot-line dim">{{ roleDuty }}</div>
      </div>
    </a-layout-sider>

    <a-layout class="app-body">
      <a-layout-header class="app-header">
        <div class="crumb">
          <a-breadcrumb>
            <a-breadcrumb-item>示范项目管控平台</a-breadcrumb-item>
            <a-breadcrumb-item>{{ currentTitle }}</a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-tag color="blue" class="demo-tag">演示环境 · 数据为模拟数据</a-tag>
          <a-dropdown>
            <div class="user">
              <a-avatar size="small" class="avatar">{{ user.name.slice(0, 1) }}</a-avatar>
              <span class="user-meta">
                <span class="user-name">
                  {{ user.name }}
                  <span class="user-role">{{ user.roleName }}</span>
                </span>
                <span class="user-org">{{ user.org }}</span>
              </span>
              <DownOutlined />
            </div>
            <template #overlay>
              <a-menu @click="onUserMenuClick">
                <AMenuItemGroup title="切换演示角色（查看不同权限视角）">
                  <a-menu-item v-for="a in demoAccounts" :key="`role:${a.role}`">
                    <SwapOutlined class="mi-icon" />{{ a.roleName }}（{{ a.name }}）
                  </a-menu-item>
                </AMenuItemGroup>
                <AMenuDivider />
                <a-menu-item key="logout"><LogoutOutlined class="mi-icon" />退出登录</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <a-layout-content class="app-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
// ============================================================
// 主布局：左侧菜单（按当前角色权限过滤，无权限的菜单不渲染）
//         顶栏（当前登录用户真实姓名 / 角色 / 单位 + 角色切换 + 退出登录）
// 角色可见范围（需求模块 8）：
//   平台管理员 admin        —— 全部菜单
//   采购人管理员 owner-admin —— 全部菜单
//   监理人员 supervisor      —— 除系统管理
//   审计人员 auditor         —— 除监理业务与系统管理
//   普通查看人员 viewer      —— 仅项目台账 / 进度总览 / 统计 / 报表中心
// ============================================================
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MenuDivider as AMenuDivider,
  MenuItemGroup as AMenuItemGroup,
  message,
} from 'ant-design-vue'
import {
  AccountBookOutlined,
  AuditOutlined,
  DashboardOutlined,
  DownOutlined,
  FileTextOutlined,
  FolderOutlined,
  LogoutOutlined,
  PieChartOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons-vue'
import type { RoleCode } from '@/mock/types'
import { DEMO_ACCOUNTS, ROLE_DUTY, ROLE_NAMES, useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

/** 侧边栏折叠态（演示时可收起，给表格更多横向空间） */
const collapsed = ref(false)
const selectedKeys = ref<string[]>([route.path])
/** 默认展开「项目管理」分组 */
const openKeys = ref<string[]>(['g-project'])

const currentTitle = computed(() => (route.meta.title as string) ?? '数据驾驶舱')
const demoAccounts = DEMO_ACCOUNTS
const roleDuty = computed(() => ROLE_DUTY[user.role])

/** 各角色被屏蔽的菜单路径；未列出的角色视为全部菜单可见 */
const MENU_HIDE: Partial<Record<RoleCode, string[]>> = {
  // 普通查看人员：仅保留项目台账、进度总览、统计分析与报表中心
  viewer: [
    '/',
    '/funds',
    '/funds/warning',
    '/docs',
    '/supervision',
    '/supervision/changes',
    '/supervision/issues',
    '/audit',
    '/audit/testing',
    '/audit/meetings',
    '/system/users',
    '/system/logs',
  ],
  // 审计人员：不见监理业务与系统管理
  auditor: [
    '/supervision',
    '/supervision/changes',
    '/supervision/issues',
    '/system/users',
    '/system/logs',
  ],
  // 监理人员：不见系统管理
  supervisor: ['/system/users', '/system/logs'],
}

/** 当前角色是否可见某菜单路径（无权限的菜单直接不渲染） */
function canSee(path: string): boolean {
  const hidden = MENU_HIDE[user.role] ?? []
  return !hidden.includes(path)
}

watch(
  () => route.path,
  (p) => {
    selectedKeys.value = [p]
  },
)

/** 侧边菜单展开项变化（Ant Design 回调参数为 Key[]，统一转字符串） */
function onOpenChange(keys: (string | number)[]) {
  openKeys.value = keys.map(String)
}

/**
 * 侧边菜单点击 → 路由跳转。
 * 菜单项的 key 即目标路由路径（如 /projects）；子菜单标题的 key 以 g- 开头，
 * 只用于展开分组，不触发跳转。重复点击当前页则不重复 push。
 */
function onMenuClick(info: { key: string | number }) {
  const key = String(info.key)
  if (key.startsWith('g-') || key === route.path) return
  void router.push(key)
}

/** 顶栏用户菜单：切换演示角色 / 退出登录 */
function onUserMenuClick(info: { key: string | number }) {
  const key = String(info.key)
  if (key === 'logout') {
    onLogout()
    return
  }
  if (key.startsWith('role:')) applyRole(key.slice(5) as RoleCode)
}

/** 退出登录：清空登录态并回到登录页 */
function onLogout() {
  const who = user.name
  user.logout()
  message.success(`已退出登录（${who}），感谢使用示范项目管控平台`)
  void router.replace('/login')
}

/** 切换演示角色：同步该角色演示账号的姓名与单位，并按新权限刷新菜单 */
function applyRole(code: RoleCode) {
  user.switchRole(code)
  const demo = demoAccounts.find((a) => a.role === code)
  if (demo) {
    user.name = demo.name
    user.org = demo.org
  }
  message.success(`视图已切换为「${ROLE_NAMES[code]}${demo ? ` · ${demo.name}` : ''}」`)
  // 切换后当前页面可能不在新角色的可见范围内，回到该角色的首页
  const next = canSee(route.path) ? route.fullPath : code === 'viewer' ? '/projects' : '/'
  void router.replace(next)
}
</script>

<style scoped lang="less">
@import '../styles/variables.less';

.app {
  height: 100vh;
  overflow: hidden;
}

// 右侧主体（顶栏 + 内容区）：固定视口高度，内部自行滚动
.app-body {
  height: 100vh;
  min-width: 0;
  overflow: hidden;
}

.app-sider {
  background: linear-gradient(180deg, #123a75 0%, #0d2b58 100%);

  :deep(.ant-layout-sider-trigger) {
    background: rgba(255, 255, 255, 0.06);
  }

  :deep(.ant-menu-dark) {
    background: transparent;
  }

  // 菜单项较多时侧栏内部滚动，底部角色说明固定可见
  :deep(.ant-layout-sider-children) {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #2f7cf6, #1a5fd0);
  border-radius: 8px;
  flex: none;
}

.brand-text {
  .t1 {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.5px;
  }

  .t2 {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.55);
    margin-top: 2px;
  }
}

.sider-foot {
  margin-top: auto;
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  .foot-line {
    font-size: 11px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.72);

    &.dim {
      color: rgba(255, 255, 255, 0.45);
    }
  }
}

.app-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  height: @header-h;
  line-height: @header-h;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid @border-color;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.demo-tag {
  margin: 0;
}

.user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 0 6px;
  border-radius: @radius-sm;

  &:hover {
    background: @primary-bg;
  }

  .avatar {
    background: @primary;
    flex: none;
  }

  .user-meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    line-height: 1.25;
  }

  .user-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: @text-1;
    font-weight: 500;

    .user-role {
      padding: 0 6px;
      font-size: 11px;
      font-weight: 400;
      line-height: 18px;
      color: @primary;
      background: @primary-bg;
      border: 1px solid @primary-border;
      border-radius: @radius-sm;
    }
  }

  .user-org {
    font-size: 11px;
    color: @text-3;
  }
}

.mi-icon {
  margin-right: 6px;
}

// 内容区：占满顶栏之下的剩余高度，超出部分在本区内滚动
// （flex:1 + min-height:0 是让内部滚动生效的关键，缺一个都会被内容撑开）
.app-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: @bg-page;
}
</style>
