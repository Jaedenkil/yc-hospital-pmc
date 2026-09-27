<template>
  <div class="login">
    <!-- 左侧：政务蓝标识区（系统名称 / 标识 / 项目概况） -->
    <section class="hero">
      <div class="hero-inner">
        <div class="brand">
          <div class="brand-logo">示</div>
          <div class="brand-text">
            <div class="brand-t1">示范项目管控平台</div>
            <div class="brand-t2">公立医院改革与高质量发展示范项目</div>
          </div>
        </div>

        <h1 class="hero-title">信息化全流程项目管控平台</h1>
        <p class="hero-desc">
          围绕 {{ projects.length }} 个子项目，贯通「立项 · 采购 · 建设 · 验收」四大阶段，
          实现项目台账、资金拨付、监理整改、跟踪审计与归档材料的一体化在线管控。
        </p>

        <ul class="hero-points">
          <li v-for="p in highlights" :key="p.label">
            <span class="num pmc-metric">{{ p.value }}</span>
            <span class="txt">{{ p.label }}</span>
          </li>
        </ul>

        <div class="hero-foot">
          <span>市卫生健康委员会 · 规划发展与信息化处</span>
          <span class="dot"></span>
          <span>演示环境 · 数据为模拟数据</span>
        </div>
      </div>
    </section>

    <!-- 右侧：登录表单 -->
    <section class="panel">
      <div class="panel-inner">
        <div class="panel-head">
          <h2>用户登录</h2>
          <p>请使用实名账号登录，点击下方演示账号卡片可一键填充账号与密码</p>
        </div>

        <Alert
          v-if="error"
          class="alert"
          type="error"
          show-icon
          closable
          :message="error"
          :description="errorHint"
          @close="error = ''"
        />

        <Form layout="vertical" :model="form" @finish="onSubmit">
          <FormItem label="登录账号" name="account">
            <Input v-model:value="form.account" size="large" placeholder="请输入账号（姓名拼音）" allow-clear>
              <template #prefix><UserOutlined class="prefix" /></template>
            </Input>
          </FormItem>

          <FormItem label="登录密码" name="password">
            <InputPassword v-model:value="form.password" size="large" placeholder="请输入密码">
              <template #prefix><LockOutlined class="prefix" /></template>
            </InputPassword>
          </FormItem>

          <!-- 密码复杂度实时提示 -->
          <div class="pwd-tip">
            <span class="pwd-tip-label">密码要求</span>
            <span v-for="r in pwdRules" :key="r.label" class="pwd-rule" :class="{ ok: r.pass }">
              <CheckCircleFilled v-if="r.pass" />
              <CloseCircleFilled v-else />
              {{ r.label }}
            </span>
          </div>

          <div class="row-between">
            <Checkbox v-model:checked="remember">记住账号</Checkbox>
            <a class="link" @click="onForget">忘记密码？</a>
          </div>

          <Button type="primary" size="large" block html-type="submit" :loading="loading">
            登 录
          </Button>
        </Form>

        <!-- 演示账号卡片：一键填充 -->
        <div class="accounts">
          <div class="accounts-head">
            <span class="accounts-title">演示账号</span>
            <Tag color="blue">统一密码 {{ DEMO_PASSWORD }}</Tag>
          </div>
          <div class="account-grid">
            <button
              v-for="a in accounts"
              :key="a.account"
              type="button"
              class="account-card"
              :class="{ active: form.account === a.account }"
              @click="fill(a)"
            >
              <span class="ac-top">
                <span class="ac-role">{{ a.roleName }}</span>
                <span class="ac-name">{{ a.name }}</span>
              </span>
              <span class="ac-org">{{ a.org }}</span>
              <span class="ac-account pmc-metric">{{ a.account }}</span>
            </button>
          </div>
          <div class="accounts-note">
            账号与人员信息取自平台用户库（模块 8），密码为演示环境统一密码；登录成功后将写入登录态并进入数据驾驶舱。
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// ============================================================
// 登录页（需求模块 8/9 的登录前置）：政务蓝左右分栏
// 左：系统名称与标识、项目概况；右：账号 / 密码表单 + 演示账号一键填充
// 校验：密码 8 位以上且含大小写字母与数字；失败给出异常提醒；成功写入 pinia 并跳首页
// ============================================================
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Alert,
  Button,
  Checkbox,
  Form,
  FormItem,
  Input,
  InputPassword,
  Tag,
  message,
} from 'ant-design-vue'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { allProjects, fundSummary } from '@/mock'
import type { DemoAccount } from '@/stores/user'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, homePath, useUserStore } from '@/stores/user'
import { fmtPercent, toYi } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

/** 演示账号（5 类角色，账号与人员信息取自 allUsers()） */
const accounts: DemoAccount[] = DEMO_ACCOUNTS

/** 左侧项目概况数据（与驾驶舱、资金总览同一口径） */
const projects = allProjects()
const summary = fundSummary()
const highlights = computed(() => [
  { label: '纳入管控的子项目（个）', value: String(projects.length) },
  { label: '中央专项资金（亿元）', value: toYi(summary.central) },
  { label: '中央资金已拨付', value: fmtPercent(summary.paidRate) },
  { label: '操作日志留存（年）', value: '≥ 3' },
])

const form = reactive({ account: '', password: '' })
const remember = ref(false)
const loading = ref(false)
/** 登录异常提醒（账号不存在 / 已停用 / 密码错误） */
const error = ref('')

/** 记住账号：仅保存账号，不保存密码 */
const REMEMBER_KEY = 'pmc-remember-account'

onMounted(() => {
  try {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      form.account = saved
      remember.value = true
    }
  } catch {
    // 隐私模式下 localStorage 不可读：忽略，不影响登录
  }
})

/** 密码复杂度四条规则（实时提示） */
const pwdRules = computed(() => [
  { label: '8 位以上', pass: form.password.length >= 8 },
  { label: '含大写字母', pass: /[A-Z]/.test(form.password) },
  { label: '含小写字母', pass: /[a-z]/.test(form.password) },
  { label: '含数字', pass: /\d/.test(form.password) },
])

const pwdStrong = computed(() => pwdRules.value.every((r) => r.pass))

/** 异常提醒的补充说明：区分格式问题与账号问题 */
const errorHint = computed(() =>
  error.value.includes('密码')
    ? `演示环境统一密码为 ${DEMO_PASSWORD}；连续多次失败将提示账号安全风险，请联系平台管理员。`
    : '可用下方任一演示账号登录，账号为人员姓名拼音，密码统一为 Demo@2026。',
)

/** 一键填充演示账号（账号 + 统一密码） */
function fill(a: DemoAccount) {
  form.account = a.account
  form.password = DEMO_PASSWORD
  error.value = ''
  message.info(`已填充「${a.roleName} · ${a.name}」演示账号`)
}

/** 忘记密码：演示环境由平台管理员重置 */
function onForget() {
  message.warning('演示环境不支持自助找回，请联系平台管理员在「用户与角色」中重置密码')
}

function saveRemember() {
  try {
    if (remember.value) localStorage.setItem(REMEMBER_KEY, form.account)
    else localStorage.removeItem(REMEMBER_KEY)
  } catch {
    // 同上：不可写时忽略
  }
}

/** 提交登录：格式与复杂度校验 → 调用 store 登录 → 成功跳转首页 */
async function onSubmit() {
  error.value = ''
  const acc = form.account.trim()
  if (!acc) {
    error.value = '请输入登录账号'
    return
  }
  if (!/^[A-Za-z][A-Za-z0-9]{3,}$/.test(acc)) {
    error.value = '账号格式不正确：演示账号为姓名拼音（如 shenwenbo），仅含字母与数字'
    return
  }
  if (!form.password) {
    error.value = '请输入登录密码'
    return
  }
  if (!pwdStrong.value) {
    error.value = '密码不符合复杂度要求：需 8 位以上，且同时包含大写字母、小写字母与数字'
    return
  }

  loading.value = true
  // 模拟统一身份认证耗时，演示登录按钮的加载态
  await new Promise((resolve) => setTimeout(resolve, 360))
  const res = user.login(acc, form.password)
  loading.value = false

  if (!res.ok) {
    error.value = res.message
    return
  }
  saveRemember()
  message.success(res.message)
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : homePath(user.role)
  void router.replace(redirect)
}
</script>

<style scoped lang="less">
@import '../../styles/variables.less';

.login {
  display: flex;
  min-height: 100vh;
  background: @bg-page;
}

/* ---------------- 左侧政务蓝标识区 ---------------- */
.hero {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  background: linear-gradient(150deg, @primary-active 0%, @primary 54%, @primary-hover 100%);

  // 背景装饰光斑
  &::before,
  &::after {
    content: '';
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
  }

  &::before {
    width: 460px;
    height: 460px;
    top: -160px;
    right: -140px;
  }

  &::after {
    width: 320px;
    height: 320px;
    bottom: -120px;
    left: -100px;
    background: rgba(255, 255, 255, 0.04);
  }
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 52px 60px 36px;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  font-size: 24px;
  font-weight: 700;
  color: @primary;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
  flex: none;
}

.brand-text {
  .brand-t1 {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.6px;
  }

  .brand-t2 {
    margin-top: 2px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }
}

.hero-title {
  margin: 64px 0 0;
  font-size: 40px;
  font-weight: 700;
  line-height: 1.28;
  letter-spacing: 2px;
}

.hero-desc {
  max-width: 620px;
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.82);
}

.hero-points {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
  max-width: 620px;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;

  li {
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: @radius;

    .num {
      display: block;
      font-size: 24px;
      font-weight: 600;
      line-height: 1.2;
    }

    .txt {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.78);
    }
  }
}

.hero-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 32px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);

  .dot {
    width: 3px;
    height: 3px;
    background: rgba(255, 255, 255, 0.6);
    border-radius: 50%;
  }
}

/* ---------------- 右侧登录表单 ---------------- */
.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 620px;
  flex: none;
  padding: 32px 24px;
  background: @bg-card;
  overflow-y: auto;
}

.panel-inner {
  width: 100%;
  max-width: 470px;
}

.panel-head {
  margin-bottom: 18px;

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: @text-1;
  }

  p {
    margin: 6px 0 0;
    font-size: 13px;
    color: @text-3;
  }
}

.alert {
  margin-bottom: 16px;
}

.prefix {
  color: @text-3;
}

.pwd-tip {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: -4px 0 14px;
  font-size: 12px;
  color: @text-3;

  &-label {
    color: @text-2;
  }

  .pwd-rule {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: @status-overdue;

    &.ok {
      color: @status-done;
    }
  }
}

.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;

  .link {
    font-size: 13px;
    color: @primary;
  }
}

/* ---------------- 演示账号卡片 ---------------- */
.accounts {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px dashed @border-color;
}

.accounts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  .accounts-title {
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }
}

.account-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.account-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  text-align: left;
  background: @bg-card;
  border: 1px solid @border-color;
  border-radius: @radius;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: @primary-border;
    background: @primary-bg;
    box-shadow: 0 2px 8px rgba(26, 95, 208, 0.12);
  }

  &.active {
    border-color: @primary;
    background: @primary-bg;
  }

  .ac-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .ac-role {
    padding: 0 6px;
    font-size: 11px;
    line-height: 18px;
    color: @primary;
    background: @primary-bg;
    border: 1px solid @primary-border;
    border-radius: @radius-sm;
    white-space: nowrap;
  }

  .ac-name {
    font-size: 14px;
    font-weight: 600;
    color: @text-1;
  }

  .ac-org {
    font-size: 11px;
    color: @text-3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ac-account {
    font-size: 12px;
    color: @text-2;
    letter-spacing: 0.3px;
  }
}

.accounts-note {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: @text-3;
}

/* 窄屏（投影 / 笔记本）单列显示，保证表单完整可见 */
@media (max-width: 1440px) {
  .panel {
    width: 520px;
  }

  .hero-title {
    font-size: 34px;
  }
}
</style>
