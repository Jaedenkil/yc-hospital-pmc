import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import BasicLayout from '@/layouts/BasicLayout.vue'
import { homePath, useUserStore } from '@/stores/user'

/**
 * 路由表（对应 DEV-SPEC §5 页面清单）
 * 1. /login 为独立整页布局（不带 BasicLayout），其余页面挂在主布局下；
 * 2. /funds/warning 必须注册在 /funds/:id 之前，否则会被参数路由吞掉；
 * 3. 全局前置守卫：未登录一律跳转 /login，登录后按 redirect 回到原页面。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '用户登录', public: true },
  },
  {
    path: '/',
    component: BasicLayout,
    children: [
      { path: '', name: 'dashboard', component: () => import('@/views/dashboard/index.vue'), meta: { title: '数据驾驶舱' } },
      { path: 'projects', name: 'projects', component: () => import('@/views/projects/index.vue'), meta: { title: '项目台账' } },
      { path: 'projects/:id', name: 'project-detail', component: () => import('@/views/projects/detail.vue'), meta: { title: '项目详情' } },
      { path: 'progress', name: 'progress', component: () => import('@/views/progress/index.vue'), meta: { title: '进度总览' } },
      { path: 'statistics', name: 'statistics', component: () => import('@/views/statistics/index.vue'), meta: { title: '项目数量统计' } },
      { path: 'statistics/dept', name: 'statistics-dept', component: () => import('@/views/statistics/dept.vue'), meta: { title: '按牵头处室统计' } },
      { path: 'funds', name: 'funds', component: () => import('@/views/funds/index.vue'), meta: { title: '资金总览' } },
      // 注意：/funds/warning 必须在 /funds/:id 之前注册
      { path: 'funds/warning', name: 'funds-warning', component: () => import('@/views/funds/warning.vue'), meta: { title: '资金预警' } },
      { path: 'funds/:id', name: 'fund-ledger', component: () => import('@/views/funds/ledger.vue'), meta: { title: '项目资金台账' } },
      { path: 'reports', name: 'reports', component: () => import('@/views/reports/index.vue'), meta: { title: '报表中心' } },
      { path: 'reports/:key', name: 'report-view', component: () => import('@/views/reports/view.vue'), meta: { title: '报表预览' } },
      { path: 'docs', name: 'docs', component: () => import('@/views/docs/index.vue'), meta: { title: '文档与资料归档' } },
      { path: 'supervision', name: 'supervision', component: () => import('@/views/supervision/index.vue'), meta: { title: '监理台账' } },
      { path: 'supervision/changes', name: 'sup-changes', component: () => import('@/views/supervision/changes.vue'), meta: { title: '变更签证' } },
      { path: 'supervision/issues', name: 'sup-issues', component: () => import('@/views/supervision/issues.vue'), meta: { title: '问题台账' } },
      { path: 'audit', name: 'audit', component: () => import('@/views/audit/index.vue'), meta: { title: '跟踪审计简报' } },
      { path: 'audit/testing', name: 'audit-testing', component: () => import('@/views/audit/testing.vue'), meta: { title: '软件测评任务' } },
      { path: 'audit/meetings', name: 'audit-meetings', component: () => import('@/views/audit/meetings.vue'), meta: { title: '评审会议' } },
      { path: 'system/users', name: 'sys-users', component: () => import('@/views/system/users.vue'), meta: { title: '用户与角色' } },
      { path: 'system/logs', name: 'sys-logs', component: () => import('@/views/system/logs.vue'), meta: { title: '操作日志' } },
    ],
  },
  // 未匹配路径统一回到首页（避免演示时出现空白页）
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

/** 路由实例（hash 模式：静态部署与单文件打包都能直接双击打开） */
const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

/**
 * 全局前置守卫：演示环境用 sessionStorage 中的登录态判断（store 已在 main.ts 中先于路由安装）
 * - 未登录访问业务页面 → /login，并把原地址放进 redirect，登录后自动返回；
 * - 已登录再访问 /login → 直接回到该角色的首页。
 */
router.beforeEach((to) => {
  const user = useUserStore()
  if (to.meta.public) {
    return user.logged ? { path: homePath(user.role) } : true
  }
  if (!user.logged) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

router.afterEach((to) => {
  const t = (to.meta.title as string) ?? ''
  document.title = t ? `${t} · 示范项目管控平台` : '公立医院改革示范项目 · 信息化全流程项目管控平台'
})

export default router
