<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Activity,
  BrainCircuit,
  Database,
  Edit3,
  KeyRound,
  ListChecks,
  LogOut,
  Maximize,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-vue-next'
import { clearAuthSession } from '@/lib/auth'
import AdminBigScreen from '@/components/admin/AdminBigScreen.vue'

const router = useRouter()
const activePanel = ref<'screen' | 'users' | 'roles' | 'profile'>('screen')
const searchQuery = ref('')

const now = ref(new Date())
let clockTimer: number | null = null
onMounted(() => {
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
})
onBeforeUnmount(() => {
  if (clockTimer) window.clearInterval(clockTimer)
})
const pad = (n: number) => String(n).padStart(2, '0')
const timeText = computed(() => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}:${pad(now.value.getSeconds())}`)
const dateText = computed(() => `${now.value.getFullYear()}-${pad(now.value.getMonth() + 1)}-${pad(now.value.getDate())}`)

const rootRef = ref<HTMLElement | null>(null)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else rootRef.value?.requestFullscreen?.()
}

interface UserItem {
  id: number
  name: string
  account: string
  role: string
  status: string
  hours: string
  weak: string
  lastLogin: string
  tone: string
}

const userList = ref<UserItem[]>([
  { id: 1, name: '小明', account: 'xiaoming', role: '用户', status: '学习中', hours: '12.5h', weak: '图搜索', lastLogin: '10分钟前', tone: 'ok' },
  { id: 2, name: '李华', account: 'lihua', role: '用户', status: '待复盘', hours: '8.2h', weak: '指针', lastLogin: '2小时前', tone: 'wait' },
  { id: 3, name: '王芳', account: 'wangfang', role: '用户', status: '已完成', hours: '16.8h', weak: '动态规划', lastLogin: '昨天', tone: 'done' },
  { id: 4, name: '赵强', account: 'zhaoqiang', role: '用户', status: '预警', hours: '4.1h', weak: '递归', lastLogin: '3天前', tone: 'warn' },
  { id: 5, name: '陈老师', account: 'chenlaoshi', role: '管理员', status: '在线', hours: '-', weak: '-', lastLogin: '刚刚', tone: 'ok' },
  { id: 6, name: '刘老师', account: 'liulaoshi', role: '管理员', status: '离线', hours: '-', weak: '-', lastLogin: '1天前', tone: 'off' },
  { id: 7, name: '管理员', account: 'admin', role: '管理员', status: '在线', hours: '-', weak: '-', lastLogin: '当前', tone: 'ok' },
])

const filteredUsers = computed(() => {
  if (!searchQuery.value) return userList.value
  const q = searchQuery.value.toLowerCase()
  return userList.value.filter(u => u.name.includes(q) || u.account.includes(q) || u.role.includes(q))
})

const pageSize = 5
const totalPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / pageSize)))
const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredUsers.value.slice(start, start + pageSize)
})

const roleList = computed(() => {
  const adminCount = userList.value.filter(u => u.role === '管理员').length
  const userCount = userList.value.filter(u => u.role === '用户').length
  return [
    {
      name: '管理员',
      desc: '系统最高权限，可管理所有模块',
      auth: roleAdminPerms.value,
      count: adminCount,
      tone: '#3e9eff',
      icon: ShieldCheck,
    },
    {
      name: '用户',
      desc: '学习者，使用核心学习功能',
      auth: roleUserPerms.value,
      count: userCount,
      tone: '#23d18b',
      icon: BrainCircuit,
    },
  ]
})

const roleAdminPerms = ref(['数据大屏', '用户管理', '角色管理', '系统设置', '数据导出', '日志审计'])
const roleUserPerms = ref(['画像生成', '学习路径', '资源中心', '智能评估', '对话练习'])

const adminKpis = computed(() => {
  const total = userList.value.length
  const online = userList.value.filter(u => u.status === '在线' || u.status === '学习中').length
  const warn = userList.value.filter(u => u.tone === 'warn').length
  return [
    { label: '用户总数', value: String(total), sub: '人', icon: Users, tone: '#3e9eff' },
    { label: '在线用户', value: String(online), sub: '人', icon: Activity, tone: '#23d18b' },
    { label: '今日活跃', value: String(Math.min(total, total - 1)), sub: '人', icon: ListChecks, tone: '#35c7ff' },
    { label: '预警用户', value: String(warn), sub: '人', icon: ShieldCheck, tone: '#ffb648' },
  ]
})

function logout() {
  clearAuthSession()
  window.location.href = '/login'
}

// ---- CRUD Dialogs ----
type DialogMode = 'add' | 'edit' | 'delete' | 'reset-pwd' | 'edit-role' | null
const dialogMode = ref<DialogMode>(null)
const dialogUser = ref<UserItem | null>(null)

// Add / Edit form
const formName = ref('')
const formAccount = ref('')
const formRole = ref('用户')
const formPassword = ref('')

function openAddDialog() {
  dialogMode.value = 'add'
  formName.value = ''
  formAccount.value = ''
  formRole.value = '用户'
  formPassword.value = ''
}

function openEditDialog(user: UserItem) {
  dialogMode.value = 'edit'
  dialogUser.value = user
  formName.value = user.name
  formAccount.value = user.account
  formRole.value = user.role
  formPassword.value = ''
}

function openDeleteDialog(user: UserItem) {
  dialogMode.value = 'delete'
  dialogUser.value = user
}

function openResetPwdDialog(user: UserItem) {
  dialogMode.value = 'reset-pwd'
  dialogUser.value = user
}

function openEditRoleDialog(role: typeof roleList.value[0]) {
  dialogMode.value = 'edit-role'
  formRole.value = role.name
  dialogUser.value = { id: 0, name: role.name, account: '', role: role.name, status: '', hours: '', weak: '', lastLogin: '', tone: '' }
}

function closeDialog() {
  dialogMode.value = null
  dialogUser.value = null
}

function confirmAdd() {
  if (!formName.value || !formAccount.value) {
    alert('请填写姓名和账号')
    return
  }
  if (userList.value.some(u => u.account === formAccount.value)) {
    alert('该账号已存在，请使用其他账号')
    return
  }
  const maxId = userList.value.reduce((m, u) => Math.max(m, u.id), 0)
  userList.value.push({
    id: maxId + 1,
    name: formName.value,
    account: formAccount.value,
    role: formRole.value,
    status: '离线',
    hours: '-',
    weak: '-',
    lastLogin: '从未',
    tone: 'off',
  })
  closeDialog()
}

function confirmEdit() {
  if (!dialogUser.value) return
  const idx = userList.value.findIndex(u => u.id === dialogUser.value!.id)
  if (idx < 0) return
  userList.value[idx] = {
    ...userList.value[idx],
    name: formName.value,
    account: formAccount.value,
    role: formRole.value,
  }
  closeDialog()
}

function confirmDelete() {
  if (!dialogUser.value) return
  userList.value = userList.value.filter(u => u.id !== dialogUser.value!.id)
  closeDialog()
}

function confirmResetPwd() {
  if (!dialogUser.value) return
  alert(`已重置用户 ${dialogUser.value.name} 的密码为默认密码`)
  closeDialog()
}

// Edit role permissions
const editingPermissions = ref<string[]>([])
function openEditRoleDialogWithPerms(role: { name: string; auth: string[] }) {
  dialogMode.value = 'edit-role'
  formRole.value = role.name
  editingPermissions.value = [...role.auth]
  dialogUser.value = { id: 0, name: role.name, account: '', role: role.name, status: '', hours: '', weak: '', lastLogin: '', tone: '' }
}
function togglePermission(perm: string) {
  const idx = editingPermissions.value.indexOf(perm)
  if (idx >= 0) editingPermissions.value.splice(idx, 1)
  else editingPermissions.value.push(perm)
}
const allPermissions = ['数据大屏', '用户管理', '角色管理', '系统设置', '数据导出', '日志审计', '学习数据', '错题报表', '资源审核', '学生画像', '学习路径', '画像生成', '资源中心', '智能评估', '对话练习', '班级学情', '作业管理', '资源查看', '学生反馈']
function confirmEditRole() {
  if (formRole.value === '管理员') {
    roleAdminPerms.value = [...editingPermissions.value]
  } else if (formRole.value === '用户') {
    roleUserPerms.value = [...editingPermissions.value]
  }
  closeDialog()
}

// ---- Profile form ----
const profileForm = ref({
  name: '管理员',
  phone: '138****2026',
  email: 'admin@zhixuexingshu.local',
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const profileSaved = ref(false)

function handleSaveProfile() {
  if (profileForm.value.newPassword && profileForm.value.newPassword !== profileForm.value.confirmPassword) {
    alert('两次输入的新密码不一致')
    return
  }
  profileSaved.value = true
  setTimeout(() => { profileSaved.value = false }, 2000)
}

function handleCancelProfile() {
  profileForm.value = {
    name: '管理员',
    phone: '138****2026',
    email: 'admin@zhixuexingshu.local',
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  }
}

const currentPage = ref(1)
watch(searchQuery, () => { currentPage.value = 1 })
function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}
</script>

<template>
  <main ref="rootRef" class="admin-root" :class="{ 'fullscreen-bigscreen': activePanel === 'screen' }">
    <!-- 数据大屏模式 -->
    <template v-if="activePanel === 'screen'">
      <section class="bigscreen-wrapper">
        <button class="bigscreen-back" @click="activePanel = 'users'">
          <ShieldCheck :size="16" /> 返回管理后台
        </button>
        <AdminBigScreen />
      </section>
    </template>

    <!-- 后台管理模式 -->
    <template v-else>
      <!-- 侧边栏 -->
      <aside class="bs-sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">
            <ShieldCheck :size="24" />
          </div>
          <div class="logo-text">
            <strong>智学星枢</strong>
            <small>管理控制中心</small>
          </div>
        </div>

        <nav class="sidebar-nav">
          <button class="nav-item" @click="activePanel = 'screen'">
            <BrainCircuit :size="18" />
            <span>数据大屏</span>
            <i class="nav-arrow">›</i>
          </button>
          <button class="nav-item" :class="{ active: activePanel === 'users' }" @click="activePanel = 'users'">
            <Users :size="18" />
            <span>用户管理</span>
            <i class="nav-arrow">›</i>
          </button>
          <button class="nav-item" :class="{ active: activePanel === 'roles' }" @click="activePanel = 'roles'">
            <KeyRound :size="18" />
            <span>角色管理</span>
            <i class="nav-arrow">›</i>
          </button>
          <button class="nav-item" :class="{ active: activePanel === 'profile' }" @click="activePanel = 'profile'">
            <Edit3 :size="18" />
            <span>个人信息</span>
            <i class="nav-arrow">›</i>
          </button>
        </nav>

        <div class="sidebar-footer">
          <button class="logout-btn" @click="logout">
            <LogOut :size="16" /> 退出登录
          </button>
        </div>
      </aside>

      <!-- 主内容区 -->
      <section class="bs-content">
        <!-- 顶部标题栏 -->
        <header class="bs-topbar">
          <div class="topbar-left">
            <i class="title-deco left" aria-hidden="true" />
            <div class="title-block">
              <p>智学星枢管理控制中心</p>
              <h1>
                {{ activePanel === 'users' ? '用户管理中心' : activePanel === 'roles' ? '角色权限管理' : '个人信息设置' }}
              </h1>
            </div>
            <i class="title-deco right" aria-hidden="true" />
          </div>
          <div class="topbar-right">
            <div class="clock-block">
              <strong>{{ timeText }}</strong>
              <small>{{ dateText }}</small>
            </div>
            <button class="icon-btn" title="全屏" @click="toggleFullscreen">
              <Maximize :size="15" />
            </button>
            <div class="admin-badge">
              <ShieldCheck :size="14" />
              <span>管理员</span>
            </div>
          </div>
        </header>

        <!-- KPI指标行 -->
        <div class="kpi-row">
          <article v-for="(kpi, i) in adminKpis" :key="kpi.label" class="bs-card kpi-card" :style="{ '--d': `${i * 0.12}s`, '--tone': kpi.tone }">
            <div class="kpi-icon">
              <component :is="kpi.icon" :size="20" />
            </div>
            <div class="kpi-info">
              <span>{{ kpi.label }}</span>
              <strong>{{ kpi.value }}<em>{{ kpi.sub }}</em></strong>
            </div>
            <i class="kpi-glow" aria-hidden="true" />
          </article>
        </div>

        <!-- 用户管理 -->
        <template v-if="activePanel === 'users'">
          <article class="bs-card">
            <div class="card-header">
              <div>
                <h2>用户列表</h2>
                <p>管理系统所有用户账号，支持搜索、编辑、重置密码等操作</p>
              </div>
              <div class="header-actions">
                <div class="search-box">
                  <Search :size="14" />
                  <input v-model="searchQuery" type="text" placeholder="搜索用户名、账号、角色..." />
                </div>
                <button class="primary-btn" @click="openAddDialog">
                  <UserPlus :size="14" /> 新增用户
                </button>
              </div>
            </div>

            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户信息</th>
                    <th>账号</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>学习时长</th>
                    <th>薄弱点</th>
                    <th>最后登录</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="user in pagedUsers" :key="user.id">
                    <td class="mono">{{ String(user.id).padStart(4, '0') }}</td>
                    <td>
                      <div class="user-cell">
                        <div class="user-avatar" :style="{ '--tone': user.tone === 'warn' ? '#ffb648' : user.tone === 'wait' ? '#35c7ff' : user.tone === 'done' ? '#23d18b' : user.tone === 'off' ? '#6684ad' : '#3e9eff' }">
                          {{ user.name.charAt(0) }}
                        </div>
                        <span>{{ user.name }}</span>
                      </div>
                    </td>
                    <td class="mono">{{ user.account }}</td>
                    <td><span class="role-tag" :data-role="user.role">{{ user.role }}</span></td>
                    <td>
                      <span class="status-tag" :class="user.tone">
                        <i class="status-dot" />{{ user.status }}
                      </span>
                    </td>
                    <td class="mono">{{ user.hours }}</td>
                    <td>{{ user.weak }}</td>
                    <td class="mono dim">{{ user.lastLogin }}</td>
                    <td>
                      <div class="action-btns">
                        <button class="table-btn primary" @click="openEditDialog(user)">编辑</button>
                        <button class="table-btn" @click="openResetPwdDialog(user)">重置密码</button>
                        <button class="table-btn danger" @click="openDeleteDialog(user)">删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="table-footer">
              <span>共 <b>{{ filteredUsers.length }}</b> 条记录，第 <b>{{ currentPage }}</b>/<b>{{ totalPages }}</b> 页</span>
              <div class="pagination">
                <button class="page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">‹</button>
                <button v-for="p in totalPages" :key="p" class="page-btn" :class="{ active: currentPage === p }" @click="goToPage(p)">{{ p }}</button>
                <button class="page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">›</button>
              </div>
            </div>
          </article>
        </template>

        <!-- 角色管理 -->
        <template v-if="activePanel === 'roles'">
          <div class="role-grid">
            <article v-for="(role, i) in roleList" :key="role.name" class="bs-card role-detail-card" :style="{ '--d': `${i * 0.12}s`, '--tone': role.tone }">
              <div class="role-head">
                <div class="role-icon">
                  <component :is="role.icon" :size="24" />
                </div>
                <div>
                  <h2>{{ role.name }}</h2>
                  <p>{{ role.desc }}</p>
                </div>
              </div>

              <div class="role-count-block">
                <span>用户数量</span>
                <strong>{{ role.count }}<em>人</em></strong>
              </div>

              <div class="permission-section">
                <h3>权限列表</h3>
                <div class="perm-tags">
                  <span v-for="perm in role.auth" :key="perm" class="perm-tag">{{ perm }}</span>
                </div>
              </div>

              <div class="role-actions">
                <button class="table-btn" style="width:100%" @click="openEditRoleDialogWithPerms(role)">编辑权限</button>
              </div>
              <i class="card-glow" aria-hidden="true" />
            </article>
          </div>
        </template>

        <!-- 个人信息 -->
        <template v-if="activePanel === 'profile'">
          <div class="profile-grid">
            <article class="bs-card profile-left">
              <div class="avatar-section">
                <div class="big-avatar">
                  <ShieldCheck :size="36" />
                </div>
                <h2>{{ profileForm.name }}</h2>
                <p>管理员 · 系统最高权限</p>
                <div class="profile-meta">
                  <div><span>账号</span><b>admin</b></div>
                  <div><span>上次登录</span><b>当前登录</b></div>
                  <div><span>登录IP</span><b class="mono">192.168.1.xxx</b></div>
                </div>
              </div>
            </article>

            <article class="bs-card profile-right">
              <div class="card-header">
                <div>
                  <h2>基本信息设置</h2>
                  <p>修改管理员个人资料与安全设置</p>
                </div>
              </div>

              <div class="profile-form">
                <div class="form-item">
                  <label>姓名</label>
                  <input type="text" v-model="profileForm.name" />
                </div>
                <div class="form-item">
                  <label>账号</label>
                  <input type="text" value="admin" readonly />
                </div>
                <div class="form-item">
                  <label>手机号</label>
                  <input type="text" v-model="profileForm.phone" />
                </div>
                <div class="form-item">
                  <label>邮箱</label>
                  <input type="email" v-model="profileForm.email" />
                </div>
                <div class="form-item full-width">
                  <label>权限组</label>
                  <input type="text" value="管理员" readonly />
                </div>

                <div class="form-divider">安全设置</div>

                <div class="form-item">
                  <label>原密码</label>
                  <input type="password" v-model="profileForm.oldPassword" placeholder="请输入原密码" />
                </div>
                <div class="form-item">
                  <label>新密码</label>
                  <input type="password" v-model="profileForm.newPassword" placeholder="请输入新密码" />
                </div>
                <div class="form-item">
                  <label>确认新密码</label>
                  <input type="password" v-model="profileForm.confirmPassword" placeholder="请再次输入新密码" />
                </div>

                <div v-if="profileSaved" class="save-success full-width">保存成功</div>

                <div class="form-actions full-width">
                  <button class="secondary-btn" @click="handleCancelProfile">取消</button>
                  <button class="primary-btn" @click="handleSaveProfile">保存修改</button>
                </div>
              </div>
            </article>
          </div>
        </template>
      </section>
    </template>

    <!-- CRUD Dialog Overlay -->
    <Teleport to="body">
      <div v-if="dialogMode" class="dialog-overlay" @click.self="closeDialog">
        <div class="dialog-box">
          <!-- Add / Edit User -->
          <template v-if="dialogMode === 'add' || dialogMode === 'edit'">
            <h3 class="dialog-title">{{ dialogMode === 'add' ? '新增用户' : '编辑用户' }}</h3>
            <div class="dialog-form">
              <label class="dialog-field">
                <span>姓名</span>
                <input v-model="formName" type="text" placeholder="请输入姓名" />
              </label>
              <label class="dialog-field">
                <span>账号</span>
                <input v-model="formAccount" type="text" placeholder="请输入账号" :readonly="dialogMode === 'edit'" />
              </label>
              <label class="dialog-field">
                <span>角色</span>
                <select v-model="formRole">
                  <option value="用户">用户</option>
                  <option value="管理员">管理员</option>
                </select>
              </label>
              <label v-if="dialogMode === 'add'" class="dialog-field">
                <span>初始密码</span>
                <input v-model="formPassword" type="password" placeholder="请输入初始密码" />
              </label>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeDialog">取消</button>
              <button class="primary-btn" @click="dialogMode === 'add' ? confirmAdd() : confirmEdit()">确认</button>
            </div>
          </template>

          <!-- Delete User -->
          <template v-if="dialogMode === 'delete'">
            <h3 class="dialog-title">删除用户</h3>
            <p class="dialog-text">确定要删除用户 <b>{{ dialogUser?.name }}</b>（{{ dialogUser?.account }}）吗？此操作不可撤销。</p>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeDialog">取消</button>
              <button class="danger-btn" @click="confirmDelete">确认删除</button>
            </div>
          </template>

          <!-- Reset Password -->
          <template v-if="dialogMode === 'reset-pwd'">
            <h3 class="dialog-title">重置密码</h3>
            <p class="dialog-text">确定要重置用户 <b>{{ dialogUser?.name }}</b>（{{ dialogUser?.account }}）的密码为默认密码吗？</p>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeDialog">取消</button>
              <button class="primary-btn" @click="confirmResetPwd">确认重置</button>
            </div>
          </template>

          <!-- Edit Role Permissions -->
          <template v-if="dialogMode === 'edit-role'">
            <h3 class="dialog-title">编辑角色权限 - {{ formRole }}</h3>
            <div class="dialog-form perm-list">
              <label v-for="perm in allPermissions" :key="perm" class="perm-checkbox">
                <input type="checkbox" :checked="editingPermissions.includes(perm)" @change="togglePermission(perm)" />
                <span>{{ perm }}</span>
              </label>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeDialog">取消</button>
              <button class="primary-btn" @click="confirmEditRole">保存权限</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
/* ========== 基础变量与布局 ========== */
.admin-root {
  --bs-blue: #3e9eff;
  --bs-cyan: #35c7ff;
  --bs-violet: #8f7bff;
  --bs-ok: #23d18b;
  --bs-warn: #ffb648;
  --bs-danger: #ff5f56;
  --bs-ink-1: #eef6ff;
  --bs-ink-2: #a8c4e8;
  --bs-ink-3: #6684ad;
  --bs-line: rgba(62, 158, 255, 0.24);

  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  min-height: 100vh;
  color: var(--bs-ink-1);
  background:
    radial-gradient(1000px 480px at 50% -12%, rgba(46, 123, 255, 0.12), transparent 60%),
    radial-gradient(720px 420px at 8% 108%, rgba(53, 199, 255, 0.06), transparent 55%),
    radial-gradient(720px 420px at 92% 108%, rgba(143, 123, 255, 0.06), transparent 55%),
    linear-gradient(180deg, #050d21 0%, #071431 48%, #081940 100%);
}

.admin-root::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(rgba(62, 158, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(62, 158, 255, 0.03) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 50% 34%, #000 0, transparent 78%);
  content: '';
}

.fullscreen-bigscreen {
  grid-template-columns: 1fr;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

/* ========== 大屏返回 ========== */
.bigscreen-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.bigscreen-back {
  position: absolute;
  top: 16px;
  right: 80px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(62, 158, 255, 0.4);
  border-radius: 8px;
  color: #d5efff;
  font-size: 12px;
  background: rgba(8, 20, 47, 0.8);
  backdrop-filter: blur(8px);
  cursor: pointer;
  transition: all 0.2s ease;
}
.bigscreen-back:hover {
  border-color: var(--bs-cyan);
  background: rgba(62, 158, 255, 0.15);
  box-shadow: 0 0 16px rgba(62, 158, 255, 0.3);
}

/* ========== 侧边栏 ========== */
.bs-sidebar {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  border-right: 1px solid var(--bs-line);
  background: rgba(6, 15, 36, 0.65);
  backdrop-filter: blur(16px);
}

.sidebar-logo {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 8px 6px 24px;
  border-bottom: 1px solid rgba(62, 158, 255, 0.12);
  margin-bottom: 16px;
}
.logo-icon {
  display: grid;
  place-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(62, 158, 255, 0.3), rgba(53, 199, 255, 0.15));
  border: 1px solid rgba(62, 158, 255, 0.5);
  color: #fff;
  box-shadow: 0 0 20px rgba(62, 158, 255, 0.3), inset 0 1px 0 rgba(255,255,255,0.15);
}
.logo-text strong {
  display: block;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #fff;
  text-shadow: 0 0 14px rgba(62, 158, 255, 0.6);
}
.logo-text small {
  display: block;
  margin-top: 2px;
  color: var(--bs-ink-3);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--bs-ink-3);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.22s ease;
}
.nav-item svg {
  flex-shrink: 0;
}
.nav-item span { flex: 1; text-align: left; }
.nav-arrow {
  font-style: normal;
  font-size: 18px;
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
}
.nav-item:hover {
  color: var(--bs-ink-1);
  background: rgba(62, 158, 255, 0.06);
}
.nav-item:hover .nav-arrow {
  opacity: 0.6;
  transform: translateX(0);
}
.nav-item.active {
  color: #fff;
  border-color: rgba(62, 158, 255, 0.45);
  background: linear-gradient(90deg, rgba(62, 158, 255, 0.18), rgba(62, 158, 255, 0.04));
  box-shadow: 0 0 18px rgba(62, 158, 255, 0.18), inset 0 1px 0 rgba(255,255,255,0.08);
}
.nav-item.active svg {
  color: var(--bs-cyan);
  filter: drop-shadow(0 0 6px rgba(53, 199, 255, 0.7));
}
.nav-item.active::before {
  position: absolute;
  left: -14px;
  top: 50%;
  width: 3px;
  height: 20px;
  border-radius: 0 2px 2px 0;
  background: var(--bs-cyan);
  transform: translateY(-50%);
  box-shadow: 0 0 10px var(--bs-cyan);
  content: '';
}
.nav-item.active .nav-arrow {
  opacity: 1;
  color: var(--bs-cyan);
}

.sidebar-footer {
  padding-top: 16px;
  border-top: 1px solid rgba(62, 158, 255, 0.12);
}
.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  border: 1px solid rgba(255, 95, 86, 0.25);
  border-radius: 8px;
  color: #ff9e98;
  background: rgba(255, 95, 86, 0.06);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.logout-btn:hover {
  border-color: rgba(255, 95, 86, 0.5);
  background: rgba(255, 95, 86, 0.14);
  color: #fff;
}

/* ========== 主内容区 ========== */
.bs-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 22px 22px;
  overflow-y: auto;
}

/* ========== 顶栏 ========== */
.bs-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.title-deco {
  width: clamp(40px, 5vw, 80px);
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--bs-blue));
  clip-path: polygon(0 100%, 100% 0, 100% 100%);
}
.title-deco.right { transform: scaleX(-1); }
.title-block p {
  margin: 0 0 3px;
  color: var(--bs-cyan);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22em;
}
.title-block h1 {
  margin: 0;
  font-size: clamp(20px, 1.8vw, 26px);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff;
  text-shadow: 0 0 16px rgba(62, 158, 255, 0.55), 0 0 32px rgba(53, 199, 255, 0.2);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.clock-block {
  text-align: right;
  padding: 6px 14px;
  border-right: 1px solid var(--bs-line);
}
.clock-block strong {
  display: block;
  color: #fff;
  font-family: var(--font-mono, monospace);
  font-size: 18px;
  font-weight: 800;
  text-shadow: 0 0 10px rgba(62, 158, 255, 0.5);
}
.clock-block small {
  display: block;
  color: var(--bs-ink-3);
  font-size: 10px;
}
.icon-btn {
  display: grid;
  place-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--bs-line);
  border-radius: 8px;
  background: rgba(8, 20, 47, 0.6);
  color: var(--bs-ink-2);
  cursor: pointer;
  transition: all 0.2s ease;
}
.icon-btn:hover {
  border-color: var(--bs-cyan);
  color: #fff;
  box-shadow: 0 0 12px rgba(53, 199, 255, 0.3);
}
.admin-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(62, 158, 255, 0.3);
  border-radius: 8px;
  background: rgba(62, 158, 255, 0.08);
  color: var(--bs-ink-1);
  font-size: 12px;
}
.admin-badge svg { color: var(--bs-cyan); }

/* ========== 科技卡片 ========== */
.bs-card {
  position: relative;
  padding: 18px 20px;
  border: 1px solid var(--bs-line);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(62, 158, 255, 0.07), transparent 26%),
    rgba(8, 20, 47, 0.72);
  animation: card-breathe 4.6s ease-in-out var(--d, 0s) infinite;
}
.bs-card::before {
  position: absolute;
  inset: -1px;
  pointer-events: none;
  background:
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) left 0 top 0 / 14px 2px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) left 0 top 0 / 2px 14px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) right 0 top 0 / 14px 2px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) right 0 top 0 / 2px 14px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) left 0 bottom 0 / 14px 2px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) left 0 bottom 0 / 2px 14px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) right 0 bottom 0 / 14px 2px,
    linear-gradient(var(--bs-cyan), var(--bs-cyan)) right 0 bottom 0 / 2px 14px;
  background-repeat: no-repeat;
  border-radius: inherit;
  content: '';
  opacity: 0.55;
}
@keyframes card-breathe {
  0%, 100% { border-color: var(--bs-line); box-shadow: 0 0 0 rgba(62, 158, 255, 0); }
  50% { border-color: rgba(62, 158, 255, 0.22); box-shadow: 0 0 8px rgba(62, 158, 255, 0.06), inset 0 0 4px rgba(62, 158, 255, 0.03); }
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.card-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: #fff;
}
.card-header h2::before {
  display: inline-block;
  width: 3px;
  height: 12px;
  margin-right: 8px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--bs-cyan), var(--bs-blue));
  box-shadow: 0 0 8px rgba(53, 199, 255, 0.7);
  vertical-align: -1px;
  content: '';
}
.card-header p {
  margin: 5px 0 0 11px;
  color: var(--bs-ink-3);
  font-size: 11px;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

/* ========== KPI行 ========== */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.kpi-card {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px 18px;
  overflow: hidden;
}
.kpi-icon {
  position: relative;
  z-index: 1;
  display: grid;
  place-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 50%);
  background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--tone), transparent 55%), rgba(8,20,47,0.9));
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 0 16px color-mix(in srgb, var(--tone), transparent 60%);
}
.kpi-info { position: relative; z-index: 1; }
.kpi-info span {
  display: block;
  color: var(--bs-ink-3);
  font-size: 11px;
}
.kpi-info strong {
  display: block;
  margin-top: 4px;
  color: #fff;
  font-family: var(--font-mono, monospace);
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 0 12px color-mix(in srgb, var(--tone), transparent 50%);
}
.kpi-info em {
  font-style: normal;
  font-size: 11px;
  color: var(--bs-ink-3);
  margin-left: 3px;
}
.kpi-glow {
  position: absolute;
  right: -20px;
  top: -20px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tone), transparent 75%), transparent 70%);
  pointer-events: none;
}

/* ========== 搜索与按钮 ========== */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--bs-line);
  border-radius: 7px;
  background: rgba(6, 15, 36, 0.7);
  transition: all 0.2s ease;
}
.search-box:focus-within {
  border-color: var(--bs-cyan);
  box-shadow: 0 0 12px rgba(53, 199, 255, 0.2);
}
.search-box svg { color: var(--bs-ink-3); flex-shrink: 0; }
.search-box input {
  width: 200px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 12px;
  outline: none;
}
.search-box input::placeholder { color: var(--bs-ink-3); }

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(53, 199, 255, 0.5);
  border-radius: 7px;
  background: linear-gradient(135deg, rgba(62, 158, 255, 0.35), rgba(53, 199, 255, 0.18));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 0 14px rgba(62, 158, 255, 0.2), inset 0 1px 0 rgba(255,255,255,0.15);
}
.primary-btn:hover {
  border-color: var(--bs-cyan);
  box-shadow: 0 0 22px rgba(53, 199, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
  transform: translateY(-1px);
}
.secondary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--bs-line);
  border-radius: 7px;
  background: rgba(8, 20, 47, 0.6);
  color: var(--bs-ink-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.secondary-btn:hover {
  border-color: var(--bs-ink-3);
  color: #fff;
}

/* ========== 数据表格 ========== */
.data-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(62, 158, 255, 0.1);
  border-radius: 6px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.data-table thead tr {
  background: linear-gradient(90deg, rgba(62, 158, 255, 0.12), rgba(53, 199, 255, 0.04));
}
.data-table th {
  padding: 12px 14px;
  text-align: left;
  color: var(--bs-cyan);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--bs-line);
  white-space: nowrap;
}
.data-table td {
  padding: 12px 14px;
  color: var(--bs-ink-2);
  border-bottom: 1px solid rgba(62, 158, 255, 0.08);
  white-space: nowrap;
}
.data-table tbody tr {
  transition: background 0.18s ease;
}
.data-table tbody tr:hover {
  background: rgba(62, 158, 255, 0.06);
}
.mono {
  font-family: var(--font-mono, monospace);
}
.dim { color: var(--bs-ink-3); }

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-avatar {
  display: grid;
  place-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-weight: 800;
  font-size: 13px;
  color: #fff;
  background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--tone), transparent 50%), rgba(8,20,47,0.9));
  border: 1px solid color-mix(in srgb, var(--tone), transparent 50%);
  box-shadow: 0 0 10px color-mix(in srgb, var(--tone), transparent 65%);
  flex-shrink: 0;
}

.role-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}
.role-tag[data-role="管理员"] {
  color: #91dfff;
  background: rgba(62, 158, 255, 0.12);
  border: 1px solid rgba(62, 158, 255, 0.25);
}
.role-tag[data-role="用户"] {
  color: #8cf0c2;
  background: rgba(35, 209, 139, 0.1);
  border: 1px solid rgba(35, 209, 139, 0.25);
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-tag.ok { color: var(--bs-ok); }
.status-tag.ok .status-dot { background: var(--bs-ok); box-shadow: 0 0 8px var(--bs-ok); animation: blink 1.6s ease-in-out infinite alternate; }
.status-tag.wait { color: var(--bs-cyan); }
.status-tag.wait .status-dot { background: var(--bs-cyan); box-shadow: 0 0 8px var(--bs-cyan); }
.status-tag.done { color: var(--bs-ink-2); }
.status-tag.done .status-dot { background: var(--bs-ink-3); }
.status-tag.warn { color: var(--bs-warn); }
.status-tag.warn .status-dot { background: var(--bs-warn); box-shadow: 0 0 8px var(--bs-warn); animation: blink 0.9s ease-in-out infinite alternate; }
.status-tag.off { color: var(--bs-ink-3); }
.status-tag.off .status-dot { background: var(--bs-ink-3); }

@keyframes blink {
  from { opacity: 0.5; } to { opacity: 1; }
}

.action-btns {
  display: flex;
  gap: 6px;
}
.table-btn {
  padding: 5px 10px;
  border: 1px solid var(--bs-line);
  border-radius: 5px;
  background: rgba(8, 20, 47, 0.5);
  color: var(--bs-ink-2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.table-btn:hover {
  border-color: var(--bs-cyan);
  color: #fff;
  background: rgba(62, 158, 255, 0.1);
}
.table-btn.primary {
  border-color: rgba(53, 199, 255, 0.4);
  color: var(--bs-cyan);
  background: rgba(53, 199, 255, 0.08);
}
.table-btn.primary:hover {
  background: rgba(53, 199, 255, 0.2);
  box-shadow: 0 0 10px rgba(53, 199, 255, 0.25);
}
.table-btn.danger {
  border-color: rgba(255, 95, 86, 0.3);
  color: #ff9e98;
  background: rgba(255, 95, 86, 0.06);
}
.table-btn.danger:hover {
  background: rgba(255, 95, 86, 0.15);
  box-shadow: 0 0 10px rgba(255, 95, 86, 0.2);
}

.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(62, 158, 255, 0.08);
  font-size: 11px;
  color: var(--bs-ink-3);
}
.table-footer b {
  color: var(--bs-cyan);
  font-family: var(--font-mono, monospace);
}
.pagination {
  display: flex;
  gap: 4px;
}
.page-btn {
  min-width: 28px;
  height: 28px;
  border: 1px solid var(--bs-line);
  border-radius: 5px;
  background: rgba(8, 20, 47, 0.5);
  color: var(--bs-ink-2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.page-btn:hover:not(:disabled) {
  border-color: var(--bs-cyan);
  color: #fff;
}
.page-btn.active {
  border-color: var(--bs-cyan);
  background: rgba(53, 199, 255, 0.2);
  color: #fff;
  box-shadow: 0 0 10px rgba(53, 199, 255, 0.25);
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ========== 角色管理 ========== */
.role-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.role-detail-card {
  position: relative;
  overflow: hidden;
  padding: 20px 22px;
}
.role-head {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 18px;
}
.role-icon {
  display: grid;
  place-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 45%);
  background: radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--tone), transparent 55%), rgba(8,20,47,0.9));
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 0 18px color-mix(in srgb, var(--tone), transparent 60%);
}
.role-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #fff;
}
.role-head p {
  margin: 4px 0 0;
  color: var(--bs-ink-3);
  font-size: 11px;
}

.role-count-block {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 70%);
  border-radius: 8px;
  background: radial-gradient(circle at 100% 50%, color-mix(in srgb, var(--tone), transparent 88%), transparent 60%), rgba(6, 15, 36, 0.5);
}
.role-count-block span {
  color: var(--bs-ink-3);
  font-size: 11px;
}
.role-count-block strong {
  font-family: var(--font-mono, monospace);
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 14px color-mix(in srgb, var(--tone), transparent 45%);
}
.role-count-block em {
  font-style: normal;
  font-size: 12px;
  color: var(--bs-ink-3);
  margin-left: 3px;
}

.permission-section h3 {
  margin: 0 0 10px;
  color: var(--bs-ink-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.perm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 18px;
}
.perm-tag {
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--tone), transparent 65%);
  border-radius: 4px;
  background: color-mix(in srgb, var(--tone), transparent 88%);
  color: color-mix(in srgb, var(--tone), white 30%);
  font-size: 10.5px;
}
.card-glow {
  position: absolute;
  right: -30px;
  bottom: -30px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--tone), transparent 82%), transparent 70%);
  pointer-events: none;
}

/* ========== 个人信息 ========== */
.profile-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 14px;
}
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 10px 0;
}
.big-avatar {
  display: grid;
  place-content: center;
  width: 90px;
  height: 90px;
  margin-bottom: 14px;
  border-radius: 50%;
  border: 2px solid rgba(62, 158, 255, 0.5);
  background: linear-gradient(135deg, rgba(62, 158, 255, 0.3), rgba(53, 199, 255, 0.1));
  color: #fff;
  box-shadow: 0 0 30px rgba(62, 158, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.2);
}
.avatar-section h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}
.avatar-section > p {
  margin: 5px 0 22px;
  color: var(--bs-cyan);
  font-size: 11px;
}
.profile-meta {
  width: 100%;
  display: grid;
  gap: 10px;
}
.profile-meta > div {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 6px;
  background: rgba(6, 15, 36, 0.5);
  border: 1px solid rgba(62, 158, 255, 0.1);
}
.profile-meta span {
  color: var(--bs-ink-3);
  font-size: 11px;
}
.profile-meta b {
  color: var(--bs-ink-1);
  font-size: 11px;
  font-weight: 600;
}

.profile-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 20px;
}
.form-item {
  display: grid;
  gap: 7px;
}
.form-item.full-width { grid-column: 1 / -1; }
.form-item label {
  color: var(--bs-ink-2);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.form-item input {
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--bs-line);
  border-radius: 7px;
  background: rgba(6, 15, 36, 0.6);
  color: #fff;
  font-size: 12px;
  outline: none;
  transition: all 0.2s ease;
}
.form-item input::placeholder { color: var(--bs-ink-3); }
.form-item input:focus {
  border-color: var(--bs-cyan);
  box-shadow: 0 0 14px rgba(53, 199, 255, 0.22);
}
.form-item input[readonly] {
  opacity: 0.65;
  cursor: not-allowed;
}
.form-divider {
  grid-column: 1 / -1;
  margin: 8px 0 4px;
  padding-top: 14px;
  border-top: 1px solid rgba(62, 158, 255, 0.1);
  color: var(--bs-cyan);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}
.form-actions .primary-btn { height: 38px; padding: 0 24px; }
.form-actions .secondary-btn { min-width: 90px; }

.save-success {
  text-align: center;
  padding: 10px;
  border-radius: 7px;
  background: rgba(35, 209, 139, 0.12);
  border: 1px solid rgba(35, 209, 139, 0.35);
  color: #23d18b;
  font-size: 13px;
  font-weight: 600;
  animation: success-in 300ms ease both;
}
@keyframes success-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ========== 响应式 ========== */
@media (max-width: 1200px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .role-grid { grid-template-columns: 1fr; }
  .profile-grid { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .admin-root { grid-template-columns: 1fr; }
  .bs-sidebar {
    flex-direction: row;
    overflow-x: auto;
    padding: 10px;
    border-right: 0;
    border-bottom: 1px solid var(--bs-line);
  }
  .sidebar-logo { display: none; }
  .sidebar-nav { flex-direction: row; gap: 6px; flex: none; }
  .sidebar-footer { flex: none; margin: 0; padding: 0; border: 0; }
  .nav-item { width: auto; height: 38px; padding: 0 12px; white-space: nowrap; }
  .nav-item.active::before { display: none; }
  .nav-arrow { display: none; }
  .kpi-row, .profile-form { grid-template-columns: 1fr; }
}

/* ========== Dialog Overlay ========== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 15, 0.7);
  backdrop-filter: blur(6px);
  animation: overlay-in 200ms ease both;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-box {
  width: 440px;
  max-width: 92vw;
  max-height: 80vh;
  overflow-y: auto;
  padding: 28px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(10, 20, 48, 0.97), rgba(6, 14, 36, 0.99));
  border: 1px solid rgba(62, 158, 255, 0.3);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(62, 158, 255, 0.1);
  animation: dialog-in 250ms cubic-bezier(0.19, 1, 0.22, 1) both;
}

@keyframes dialog-in {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.dialog-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.dialog-text {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--bs-ink-2);
  line-height: 1.6;
}

.dialog-text b {
  color: #fff;
}

.dialog-form {
  display: grid;
  gap: 14px;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--bs-ink-2);
}

.dialog-field input,
.dialog-field select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(62, 158, 255, 0.2);
  border-radius: 8px;
  background: rgba(0, 20, 60, 0.5);
  color: #f0f6ff;
  font-size: 14px;
  outline: none;
  transition: border-color 200ms ease;
}

.dialog-field input:focus,
.dialog-field select:focus {
  border-color: rgba(62, 158, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(62, 158, 255, 0.1);
}

.dialog-field input[readonly] {
  opacity: 0.6;
  cursor: not-allowed;
}

.dialog-field select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8c4e8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}

.dialog-field select option {
  background: #0a1430;
  color: #f0f6ff;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.danger-btn {
  padding: 8px 20px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #cc3333, #ff4444);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
}

.danger-btn:hover {
  filter: brightness(1.15);
  box-shadow: 0 4px 16px rgba(255, 68, 68, 0.3);
}

.perm-list {
  display: grid !important;
  grid-template-columns: 1fr 1fr;
  gap: 8px !important;
}

.perm-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(62, 158, 255, 0.1);
  background: rgba(0, 20, 60, 0.3);
  cursor: pointer;
  transition: all 200ms ease;
}

.perm-checkbox:hover {
  border-color: rgba(62, 158, 255, 0.25);
  background: rgba(0, 40, 80, 0.4);
}

.perm-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--bs-blue);
  cursor: pointer;
}

.perm-checkbox span {
  font-size: 13px;
  color: var(--bs-ink-1);
}
</style>
