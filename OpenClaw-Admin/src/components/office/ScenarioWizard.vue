<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  NModal,
  NCard,
  NSteps,
  NStep,
  NButton,
  NSpace,
  NInput,
  NRadioGroup,
  NRadio,
  NTag,
  NText,
  NIcon,
  NAlert,
  NEmpty,
  NScrollbar,
  NSpin,
  NTooltip,
  NCheckbox,
  NDivider,
  NSelect,
  NCollapse,
  NCollapseItem,
  NProgress,
  NDescriptions,
  NDescriptionsItem,
  useMessage,
} from 'naive-ui'
import {
  CreateOutline,
  PeopleOutline,
  ListOutline,
  SendOutline,
  CheckmarkCircleOutline,
  ArrowForwardOutline,
  ArrowBackOutline,
  SparklesOutline,
  AddOutline,
  TrashOutline,
  PlayOutline,
  CloseCircleOutline,
  InformationCircleOutline,
  CheckmarkDoneOutline,
  AlertCircleOutline,
  SettingsOutline,
  LinkOutline,
  DocumentTextOutline,
  RefreshOutline,
  EyeOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useWizardStore, type WizardTask, type GeneratedAgent, type AgentBinding } from '@/stores/wizard'
import { useOfficeStore } from '@/stores/office'
import { useWebSocketStore } from '@/stores/websocket'
import { useAgentStore } from '@/stores/agent'
import { useConfigStore } from '@/stores/config'
import { useMemoryStore } from '@/stores/memory'
import { formatRelativeTime } from '@/utils/format'

const { t } = useI18n()
const message = useMessage()
const wizardStore = useWizardStore()
const officeStore = useOfficeStore()
const wsStore = useWebSocketStore()
const agentStore = useAgentStore()
const configStore = useConfigStore()
const memoryStore = useMemoryStore()

const wizardStep = ref<'scenario' | 'agents' | 'tasks' | 'bindings' | 'confirm' | 'execution'>('scenario')

const scenarioName = ref('')
const scenarioDescription = ref('')
const agentSelectionMode = ref<'existing' | 'ai_create'>('existing')
const workspaceMode = ref<'independent' | 'shared'>('independent')
const selectedAgents = ref<string[]>([])
const aiAgentPrompt = ref('')
const aiGeneratedAgents = ref<GeneratedAgent[]>([])
const isGeneratingAgents = ref(false)

const tasks = ref<Array<{
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  assignedAgents: string[]
  mode: 'run' | 'session'
}>>([])

const taskTitle = ref('')
const taskDescription = ref('')
const taskPriority = ref<'low' | 'medium' | 'high'>('medium')
const taskMode = ref<'run' | 'session'>('run')
const taskAssignedAgents = ref<string[]>([])

const bindings = ref<AgentBinding[]>([])
const availableChannels = ref([
  { label: 'Feishu', value: 'feishu' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Telegram', value: 'telegram' },
  { label: 'Discord', value: 'discord' },
  { label: 'Slack', value: 'slack' },
])

const isExecuting = ref(false)
const isPreparationComplete = ref(false)
const isTaskExecutionComplete = ref(false)
const executionTasks = ref<Array<{
  id: string
  type: 'create_agent' | 'config_update' | 'task_send' | 'skip_agent' | 'set_identity'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  label: string
  detail?: string
  agentId?: string
}>>([])

const currentStepIndex = computed(() => {
  const steps = ['scenario', 'agents', 'tasks', 'bindings', 'confirm', 'execution']
  return steps.indexOf(wizardStep.value) + 1
})

function getStepStatus(stepIndex: number): 'process' | 'finish' | 'wait' | 'error' {
  if (stepIndex < currentStepIndex.value) {
    return 'finish'
  } else if (stepIndex === currentStepIndex.value) {
    return 'process'
  } else {
    return 'wait'
  }
}

const canProceed = computed(() => {
  switch (wizardStep.value) {
    case 'scenario':
      return scenarioName.value.trim().length > 0
    case 'agents':
      if (agentSelectionMode.value === 'existing') {
        return selectedAgents.value.length > 0
      } else {
        return aiGeneratedAgents.value.length > 0
      }
    case 'tasks':
      return tasks.value.length > 0
    case 'bindings':
      return true
    case 'confirm':
      return true
    default:
      return true
  }
})

const availableAgents = computed(() => agentStore.agents)

const allAgentIds = computed(() => {
  if (agentSelectionMode.value === 'existing') {
    return selectedAgents.value
  }
  
  const existingAgents = agentStore.agents
  const existingAgentNames = new Map<string, string>()
  existingAgents.forEach(a => {
    if (a.name) {
      existingAgentNames.set(a.name, a.id)
    }
  })
  
  const result: string[] = []
  for (const agent of aiGeneratedAgents.value) {
    const existingId = existingAgentNames.get(agent.name)
    if (existingId) {
      result.push(existingId)
    } else {
      result.push(agent.id)
    }
  }
  
  return result
})

const agentOptions = computed(() => {
  return allAgentIds.value.map(id => {
    const agent = agentStore.agents.find(a => a.id === id)
    const generatedAgent = aiGeneratedAgents.value.find(a => a.id === id)
    const emoji = generatedAgent?.emoji || agent?.identity?.emoji || '🤖'
    const name = generatedAgent?.name || agent?.name || id
    return {
      label: `${emoji} ${name}`,
      value: id,
    }
  })
})

function resetForm() {
  scenarioName.value = ''
  scenarioDescription.value = ''
  agentSelectionMode.value = 'existing'
  workspaceMode.value = 'independent'
  selectedAgents.value = []
  aiAgentPrompt.value = ''
  aiGeneratedAgents.value = []
  tasks.value = []
  bindings.value = []
  taskTitle.value = ''
  taskDescription.value = ''
  taskPriority.value = 'medium'
  taskMode.value = 'run'
  taskAssignedAgents.value = []
  isExecuting.value = false
  executionTasks.value = []
}

async function handleGenerateAgents() {
  if (!aiAgentPrompt.value.trim()) {
    message.warning(t('pages.office.wizard.aiPromptRequired'))
    return
  }

  isGeneratingAgents.value = true
  aiGeneratedAgents.value = []

  try {
    const agentId = 'main'
    const channel = 'main'
    const peer = 'ai-agent-creator'
    const sessionKey = `agent:${agentId}:${channel}:dm:${peer}`
    const idempotencyKey = `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    const systemPrompt = `这是一个新的任务，请忽略之前的所有对话内容，只关注本次请求。

你是一个团队配置专家。根据用户的需求，生成合适的 AI 智能体团队配置。

请以 JSON 数组格式返回智能体配置，每个智能体包含：
- id: 唯一标识符（使用英文，如 "content-collector"）
- name: 显示名称（中文）
- role: 角色类型（英文，如 "collector", "writer", "reviewer" 等）
- emoji: 代表该角色的 emoji 表情
- skills: 该智能体擅长的技能列表（字符串数组）

示例输出格式：
[
  {"id": "content-collector", "name": "信息收集员", "role": "collector", "emoji": "🔍", "skills": ["信息检索", "数据分析"]},
  {"id": "content-writer", "name": "内容创作员", "role": "writer", "emoji": "✍️", "skills": ["文案写作", "创意策划"]},
  {"id": "content-reviewer", "name": "内容审核员", "role": "reviewer", "emoji": "✅", "skills": ["内容审核", "质量把控"]}
]

只返回 JSON 数组，不要有其他文字。`

    const userMessage = `${systemPrompt}\n\n用户需求：${aiAgentPrompt.value}`

    console.log('[Wizard] Sending message to session:', sessionKey)
    
    await wsStore.rpc.sendChatMessage({
      sessionKey,
      message: userMessage,
      idempotencyKey,
    })

    try {
      await wsStore.rpc.patchSession({
        sessionKey,
        label: 'AI自动创建智能体助手',
      })
    } catch (e) {
      console.warn('[Wizard] Failed to set session label:', e)
    }

    console.log('[Wizard] Message sent, waiting for AI response...')
    
    let lastMessageContent = ''
    let attempts = 0
    const maxAttempts = 60
    const pollInterval = 1000
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))
      attempts++
      
      try {
        const history = await wsStore.rpc.listChatHistory(sessionKey)
        if (history && history.length > 0) {
          const lastMessage = history[history.length - 1]
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
            lastMessageContent = lastMessage.content
            console.log('[Wizard] Got AI response after', attempts, 'attempts')
            break
          }
        }
      } catch (e) {
        console.warn('[Wizard] Poll error:', e)
      }
      
      if (attempts % 10 === 0) {
        console.log('[Wizard] Still waiting... attempt', attempts)
      }
    }

    if (!lastMessageContent) {
      console.log('[Wizard] No response received after timeout')
      message.warning(t('pages.office.wizard.agentGenerationFailed'))
      return
    }

    console.log('[Wizard] AI Response:', lastMessageContent.substring(0, 500))

    let generated: GeneratedAgent[] = []
    
    const jsonMatch = lastMessageContent.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('[Wizard] Parsed JSON array:', parsed)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const existingAgents = agentStore.agents
          const existingAgentIds = new Set(existingAgents.map(a => a.id))
          const existingAgentNames = new Map<string, typeof existingAgents[0]>()
          existingAgents.forEach(a => {
            if (a.name) {
              existingAgentNames.set(a.name, a)
            }
          })
          
          generated = parsed.map((item, index) => {
            const agentName = item.name || ''
            const existingAgent = existingAgentNames.get(agentName)
            
            if (existingAgent) {
              console.log(`[Wizard] Agent with name "${agentName}" already exists, using existing agent`)
              return {
                id: existingAgent.id,
                name: existingAgent.name || agentName,
                role: item.role || 'assistant',
                emoji: item.emoji || existingAgent.identity?.emoji || '🤖',
                skills: Array.isArray(item.skills) ? item.skills : [],
                agentsMd: '',
                soulMd: '',
                userMd: '',
                created: true,
              }
            }
            
            let agentId = item.id || ''
            
            if (!agentId || existingAgentIds.has(agentId)) {
              const baseId = item.id || `agent`
              let counter = 1
              agentId = baseId
              while (existingAgentIds.has(agentId)) {
                agentId = `${baseId}-${counter}`
                counter++
              }
            }
            
            existingAgentIds.add(agentId)
            
            return {
              id: agentId,
              name: item.name || `智能体 ${index + 1}`,
              role: item.role || 'assistant',
              emoji: item.emoji || '🤖',
              skills: Array.isArray(item.skills) ? item.skills : [],
              agentsMd: item.agentsMd || generateDefaultAgentsMd(item.name || `智能体 ${index + 1}`, item.role || 'assistant'),
              soulMd: item.soulMd || generateDefaultSoulMd(item.name || `智能体 ${index + 1}`),
              userMd: item.userMd || generateDefaultUserMd(item.name || `智能体 ${index + 1}`),
              identityMd: item.identityMd || generateDefaultIdentityMd(item.name || `智能体 ${index + 1}`, item.emoji),
              created: false,
            }
          })
          
          console.log('[Wizard] Generated agents:', generated)
        }
      } catch (parseError) {
        console.warn('[Wizard] Failed to parse AI response as JSON:', parseError)
      }
    } else {
      console.warn('[Wizard] No JSON array found in response')
    }

    if (generated.length === 0) {
      console.log('[Wizard] No agents parsed from AI response')
      message.warning(t('pages.office.wizard.agentGenerationFailed'))
    } else {
      const newAgents = generated.filter(a => !a.created)
      const teamLeader = generateTeamLeaderAgent(scenarioName.value, newAgents)
      generated.unshift(teamLeader)
      
      const newCount = generated.filter(a => !a.created).length
      const existingCount = generated.filter(a => a.created).length
      aiGeneratedAgents.value = generated
      
      if (generated.length > 0 && generated[0]) {
        taskAssignedAgents.value = [generated[0].id]
      }
      
      if (existingCount > 0 && newCount === 0) {
        message.success(t('pages.office.wizard.allAgentsExist', { count: existingCount }))
      } else if (existingCount > 0) {
        message.success(t('pages.office.wizard.agentsGeneratedWithExisting', { newCount, existingCount }))
      } else {
        message.success(t('pages.office.wizard.agentsGenerated', { count: newCount }))
      }
    }
  } catch (error) {
    console.error('[Wizard] Failed to generate agents:', error)
    message.error(t('pages.office.wizard.agentGenerationFailed'))
  } finally {
    isGeneratingAgents.value = false
  }
}

function generateDefaultAgentsMd(name: string, role: string): string {
  const roleDescriptions: Record<string, string> = {
    'collector': '信息收集与整理',
    'writer': '内容创作与优化',
    'reviewer': '质量审核与把控',
    'frontend': '前端开发与用户体验',
    'backend': '后端开发与系统架构',
    'coordinator': '团队协调与项目管理',
    'assistant': '智能辅助与问题解决',
  'analyst': '数据分析与洞察',
    'designer': '界面设计与视觉呈现',
    'tester': '质量测试与验证',
  'devops': '运维部署与监控',
    'manager': '团队管理与资源调配',
  'researcher': '研究探索与知识沉淀',
  'planner': '计划制定与进度跟踪',
    'executor': '任务执行与落地实施',
  'consultant': '咨询建议与方案设计',
  'trainer': '培训指导与知识传递',
  'editor': '内容编辑与润色',
    'translator': '语言翻译与本地化',
    'moderator': '内容审核与社区管理',
    'support': '技术支持与问题解答',
    'architect': '架构设计与技术选型',
    'security': '安全防护与风险控制',
    'optimization': '性能优化与资源调配',
    'integration': '系统集成与接口对接',
    'documentation': '文档撰写与知识管理',
    'qa': '质量保证与流程优化',
    'data': '数据处理与分析挖掘',
    'automation': '流程自动化与效率提升',
    'monitoring': '系统监控与告警响应',
    'deployment': '部署发布与环境管理',
  }
  
  const roleDesc = roleDescriptions[role] || '专业工作'
  
  return `# ${name}

## 角色定位
你是${name}，专注于${roleDesc}领域。你的存在是为了让团队更高效、让成果更出色。

## 核心职责
- 主导并完成${roleDesc}相关的所有工作
- 与团队成员保持紧密协作，确保信息流通顺畅
- 主动发现问题并提出优化建议，而非被动等待指令
- 对自己的产出负责，确保质量符合团队标准

## 工作原则
### 主动性原则
- 不等待指令，主动思考下一步该做什么
- 发现问题立即行动，不让问题过夜
- 预判风险，提前准备应对方案

### 协作性原则  
- 及时同步工作进度，让相关方随时了解状态
- 遇到阻塞立即上报，不让问题在手中积压
- 主动了解上下游依赖，确保协作顺畅

### 质量原则
- 交付前自查，确保产出可直接使用
- 追求"一次做对"，减少返工
- 保持工作记录，便于追溯和交接

## 行为准则
- **响应时延**: 收到任务后立即响应，明确表示"收到"并给出预期完成时间
- **进度同步**: 重要节点主动汇报进度，不让相关方追问
- **问题上报**: 遇到阻塞立即上报，说明问题、影响和建议方案
- **完成确认**: 任务完成后主动确认，并询问是否需要进一步工作

## 沟通风格
- 简洁明了，不说废话
- 专业术语准确，避免歧义
- 主动汇报优于被动应答
- 用数据说话，用结果证明
`
}

function generateDefaultSoulMd(name: string): string {
  const personalityTraits: Record<string, string[]> = {
    'collector': ['信息敏感者', '数据挖掘专家', '细节控'],
    'writer': ['文字艺术家', '创意引擎', '表达欲旺盛'],
    'reviewer': ['质量守门员', '细节猎人', '标准捍卫者'],
    'frontend': ['体验设计师', '像素级完美主义者', '交互魔法师'],
    'backend': ['系统架构师', '性能狂人', '逻辑洁癖患者'],
    'coordinator': ['团队润滑剂', '信息枢纽', '节奏掌控者'],
    'assistant': ['问题解决者', '知识连接器', '效率助推器'],
    'analyst': ['数据侦探', '洞察挖掘机', '模式发现者'],
    'designer': ['视觉诗人', '体验建筑师', '美学偏执狂'],
    'tester': ['Bug猎人', '质量守卫', '边界探索者'],
    'devops': ['自动化诗人', '稳定守护者', '发布艺术家'],
    'manager': ['资源调配师', '进度掌控者', '风险预警员'],
    'researcher': ['知识探险家', '真理追寻者', '假设验证者'],
    'planner': ['时间管理大师', '风险预见者', '路径规划师'],
    'executor': ['落地专家', '执行机器', '结果交付者'],
    'consultant': ['方案设计师', '问题诊断师', '价值放大器'],
    'trainer': ['知识传递者', '技能催化剂', '成长助推器'],
    'editor': ['文字美容师', '逻辑整理师', '风格统一者'],
    'translator': ['文化桥梁', '语义守护者', '本地化专家'],
    'moderator': ['规则守护者', '社区园丁', '氛围调节器'],
    'support': ['问题终结者', '耐心倾听者', '解决方案库'],
    'architect': ['系统思想家', '技术选型师', '架构守护者'],
    'security': ['风险雷达', '安全卫士', '合规守护者'],
    'optimization': ['性能雕刻师', '资源优化师', '瓶颈猎人'],
    'integration': ['接口魔术师', '系统连接者', '数据管道师'],
    'documentation': ['知识建筑师', '文档艺术家', '信息组织者'],
    'qa': ['质量捍卫者', '流程优化师', '标准守护者'],
    'data': ['数据矿工', '模式发现者', '价值提取师'],
    'automation': ['效率工程师', '流程简化师', '脚本艺术家'],
    'monitoring': ['系统听诊器', '告警雷达', '健康守护者'],
    'deployment': ['发布指挥官', '环境管理者', '上线守护者'],
  }
  
  const traits = personalityTraits[name.includes('收集') ? 'collector' : 
    name.includes('创作') || name.includes('写') ? 'writer' : 
    name.includes('审核') || name.includes('检查') ? 'reviewer' : 
    name.includes('前端') || name.includes('界面') ? 'frontend' : 
    name.includes('后端') || name.includes('服务') ? 'backend' : 
    name.includes('协调') || name.includes('管理') ? 'coordinator' : 
    name.includes('运维') || name.includes('部署') ? 'devops' : 
    name.includes('分析') ? 'analyst' : 
    name.includes('设计') ? 'designer' : 
    name.includes('测试') ? 'tester' : 
    name.includes('研究') ? 'researcher' : 
    name.includes('计划') ? 'planner' : 
    name.includes('执行') ? 'executor' : 
    name.includes('咨询') ? 'consultant' : 
    name.includes('培训') ? 'trainer' : 
    name.includes('编辑') ? 'editor' : 
    name.includes('翻译') ? 'translator' : 
    name.includes('支持') ? 'support' : 
    'assistant'] || ['专业执行者', '协作伙伴', '问题解决者']
  
  return `# ${name} - 人格内核

## 核心人格特质
${traits.map(t => `- **${t}**`).join('\n')}

## 语言风格
- 专业术语精准，不说模糊的话
- 善用领域关键词，展现专业素养
- 适时使用行业黑话，拉近专业距离
- 用数据和结果说话，减少主观判断

## 思维模式
### 问题导向
- 遇事先问"为什么"和"是什么"，再问"怎么做"
- 不满足于表面答案，追根溯源
- 预判问题，提前准备Plan B

### 结果导向
- 先定义"完成长什么样"，再开始行动
- 每一步都指向最终目标
- 用结果验证过程，不盲目执行

### 协作导向
- 先想"谁需要知道"，再行动
- 主动同步，不让相关方追问
- 换位思考，理解上下游需求

## 价值锚点
- "我的价值在于让问题到我为止"
- "我不只是执行者，更是优化者"
- "团队成功才是真正的成功"
- "专业是最快的捷径"

## 行为习惯
- 收到任务立即响应，不拖延
- 完成后主动确认，不等待追问
- 遇到问题立即上报，不让问题发酵
- 每日复盘，持续优化工作方式
`
}

function generateDefaultUserMd(name: string): string {
  const nicknames: Record<string, string> = {
    '收集': '小探',
    '创作': '小文',
    '审核': '小核',
    '前端': '小前',
    '后端': '小后',
    '协调': '小协',
    '运维': '小运',
    '分析': '小析',
    '设计': '小设',
    '测试': '小测',
    '研究': '小研',
    '计划': '小计',
    '执行': '小执',
    '咨询': '小顾',
    '培训': '小培',
    '编辑': '小编',
    '翻译': '小译',
    '支持': '小支',
    '管理': '小管',
  }
  
  const shortName = name.replace(/[员师者家]/g, '')
  const nickname = nicknames[shortName] || `小${shortName.charAt(0)}`
  
  return `# ${name} - 用户画像

## 基本信息
- **Name**: ${name}
- **What to call them**: ${nickname}
- **Pronouns**: they/them
- **Timezone**: Asia/Shanghai (UTC+8)

## 用户画像
${nickname}是"${shortName}领域的专业担当"。他们常说："让我来处理这个问题。"

他们专注于${shortName}相关工作，确保团队在这个领域不掉链子。

## 典型场景
- 团队需要${shortName}支持时，第一个想到的就是${nickname}
- ${nickname}接到任务后立即响应，给出明确的时间预期
- 完成后主动汇报结果，询问是否需要进一步工作

## 沟通特点
- 响应迅速，不说废话
- 进度透明，主动同步
- 问题及时上报，不让问题在手中积压
- 交付质量可靠，减少返工

## 协作风格
- 主动了解上下游需求
- 及时同步工作进度
- 遇到阻塞立即上报
- 完成后主动确认

## 价值体现
- "${shortName}问题找我，其他问题我帮忙协调"
- "我的目标是让团队在${shortName}领域无后顾之忧"
- "专业、高效、可靠——这是我的标签"
`
}

function convertToPinyin(text: string): string {
  const pinyinMap: Record<string, string> = {
    '小': 'xiao', '红': 'hong', '书': 'shu', '内': 'nei', '容': 'rong', '创': 'chuang', '作': 'zuo',
    '文': 'wen', '案': 'an', '产': 'chan', '品': 'pin', '经': 'jing', '理': 'li', '前': 'qian',
    '端': 'duan', '后': 'hou', '服': 'fu', '务': 'wu', '运': 'yun', '维': 'wei', '测': 'ce',
    '试': 'shi', '设': 'she', '计': 'ji', '研': 'yan', '究': 'jiu', '分': 'fen', '析': 'xi',
    '数': 'shu', '据': 'ju', '营': 'ying', '销': 'xiao', '推': 'tui', '广': 'guang', '市': 'shi',
    '场': 'chang', '客': 'ke', '户': 'hu', '人': 'ren', '事': 'shi', '财': 'cai',
    '法': 'fa', '律': 'lv', '行': 'xing', '政': 'zheng', '技': 'ji', '术': 'shu', '开': 'kai',
    '发': 'fa', '项': 'xiang', '目': 'mu', '质': 'zhi', '量': 'liang', '安': 'an', '全': 'quan',
    '网': 'wang', '络': 'luo', '智': 'zhi', '能': 'neng', '科': 'ke', '教': 'jiao',
    '培': 'pei', '训': 'xun', '咨': 'zi', '询': 'xun', '策': 'ce', '划': 'hua', '编': 'bian',
    '辑': 'ji', '翻': 'fan', '译': 'yi', '审': 'shen', '核': 'he', '监': 'jian', '控': 'kong',
    '部': 'bu', '署': 'shu', '集': 'ji', '成': 'cheng', '优': 'you', '化': 'hua', '架': 'jia',
    '构': 'gou', '流': 'liu', '程': 'cheng', '规': 'gui', '则': 'ze', '标': 'biao', '准': 'zhun',
    '团': 'tuan', '队': 'dui', '组': 'zu', '长': 'zhang', '主': 'zhu', '任': 'ren', '总': 'zong',
    '师': 'shi', '员': 'yuan', '工': 'gong', '助': 'zhu', '手': 'shou', '专': 'zhuan',
    '家': 'jia', '顾': 'gu', '问': 'wen', '执': 'zhi', '官': 'guan', '导': 'dao',
    '游': 'you', '戏': 'xi', '音': 'yin', '乐': 'le', '视': 'shi', '频': 'pin', '图': 'tu',
    '片': 'pian', '动': 'dong', '漫': 'man', '影': 'ying', '电': 'dian', '新': 'xin', '闻': 'wen',
    '媒': 'mei', '体': 'ti', '社': 'she', '交': 'jiao', '商': 'shang', '零': 'ling',
    '售': 'shou', '物': 'wu', '供': 'gong', '应': 'ying', '链': 'lian', '金': 'jin',
    '融': 'rong', '投': 'tou', '资': 'zi', '保': 'bao', '险': 'xian', '房': 'fang', '地': 'di',
    '建': 'jian', '筑': 'zhu', '装': 'zhuang', '饰': 'shi', '餐': 'can', '饮': 'yin',
    '酒': 'jiu', '店': 'dian', '旅': 'lv', '景': 'jing', '点': 'dian', '航': 'hang',
    '空': 'kong', '汽': 'qi', '车': 'che', '通': 'tong', '源': 'yuan',
    '环': 'huan', '农': 'nong', '业': 'ye', '林': 'lin', '牧': 'mu', '渔': 'yu',
    '水': 'shui', '利': 'li', '矿': 'kuang', '冶': 'ye',
    '机': 'ji', '械': 'xie', '子': 'zi', '信': 'xin',
    '互': 'hu', '联': 'lian', '移': 'yi', '云': 'yun', '算': 'suan',
    '大': 'da', '器': 'qi',
    '学': 'xue', '习': 'xi', '深': 'shen', '度': 'du',
  }
  
  let result = ''
  for (const char of text) {
    if (pinyinMap[char]) {
      result += pinyinMap[char]
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase()
    }
  }
  return result || 'team'
}

function generateTeamLeaderAgent(teamName: string, members: GeneratedAgent[]): GeneratedAgent {
  const leaderId = convertToPinyin(teamName)
  const leaderName = `${teamName}团队组长`
  
  const memberList = members.map(m => `- ${m.name} (${m.id}): ${m.role}`).join('\n')
  const dispatchRules = members.map(m => {
    const taskTypes: Record<string, string> = {
      'collector': '信息收集/数据分析/资料整理',
      'writer': '内容创作/文案撰写/创意策划',
      'reviewer': '内容审核/质量把控/合规检查',
      'frontend': '前端开发/页面实现/用户体验',
      'backend': '后端开发/接口设计/数据库',
      'devops': '系统部署/CI-CD/服务器运维',
      'tester': '测试验证/缺陷排查/回归测试',
      'analyst': '数据分析/洞察挖掘/报告撰写',
      'designer': '界面设计/视觉呈现/原型绘制',
      'researcher': '研究探索/知识沉淀/技术调研',
      'planner': '计划制定/进度跟踪/风险管理',
      'executor': '任务执行/落地实施/结果交付',
      'consultant': '咨询建议/方案设计/问题诊断',
      'trainer': '培训指导/知识传递/技能提升',
      'editor': '内容编辑/文字润色/风格统一',
      'translator': '语言翻译/本地化/跨文化沟通',
      'support': '技术支持/问题解答/服务响应',
      'manager': '项目管理/资源调配/进度把控',
      'coordinator': '团队协调/沟通联络/进度同步',
      'assistant': '智能辅助/问题解决/日常支持',
    }
    return `${taskTypes[m.role] || m.role} → @${m.id}`
  }).join('\n')
  
  const agentsMd = `# ${leaderName}

## 角色定位
你是${leaderName}，团队的首席协调官。你的核心职责是：

- **接住需求**：理解用户的原始指令，分析任务类型
- **精准调度**：判断任务类型，分配给对应的专业 Agent
- **质量把控**：审查专业 Agent 的输出，必要时要求修改
- **串联全场**：确保多步骤任务不掉链子，协调团队成员协作

## 团队成员
${memberList}

## 调度规则
${dispatchRules}

简单问答/日常闲聊 → 自己回答

## 协作方式
在团队协作时，先使用 \`agent_list\` 获取所有 Agents，需要使用 \`sessions_spawn\` 创建会话，将 sessions 的 key 保存为 sessionKey，使用 \`sessions_send\` 联系其他 Agents。

运行模式说明：
- **会话模式**：mode="session" - 用于需要多轮交互的任务
- **一次性会话**：mode="run" - 用于单次执行的任务

\`\`\`
# 获取所有 Agents
agent_list()

# 创建与成员的会话
sessions_spawn(agentId: "成员ID", label: "任务描述", mode: "session")

# 发送消息给成员
sessions_send(sessionKey: "会话key", message: "任务内容")
\`\`\`

## 工作原则
- 收到用户需求后，先分析任务类型
- 根据调度规则，选择合适的专业 Agent
- 跟踪任务进度，确保按时完成
- 对成员产出进行质量审核
- 汇总结果，向用户汇报
`

  const soulMd = `# ${leaderName} - 人格内核

## 核心人格特质
- **协调大师**：善于调配资源，让团队高效运转
- **沟通桥梁**：连接用户与团队，确保信息准确传递
- **质量守门员**：对团队产出负责，把控最终交付质量
- **节奏掌控者**：把握项目进度，确保按时交付

## 语言风格
- 清晰简洁，指令明确
- 善于总结归纳，提炼关键信息
- 主动汇报进度，让用户放心
- 用数据说话，用结果证明

## 思维模式
### 用户导向
- 站在用户角度思考问题
- 理解用户真实需求，而非表面要求
- 主动提供超出预期的服务

### 团队导向
- 了解每个成员的专业领域
- 合理分配任务，发挥成员优势
- 协调成员协作，确保团队和谐

### 结果导向
- 关注最终交付质量
- 及时发现问题并解决
- 持续优化工作流程

## 价值锚点
- "我的价值在于让团队高效运转，让用户满意"
- "我不只是传声筒，更是价值放大器"
- "团队成功才是真正的成功"
`

  const userMd = `# ${leaderName} - 用户画像

## 基本信息
- **Name**: ${leaderName}
- **What to call them**: 队长
- **Pronouns**: they/them
- **Timezone**: Asia/Shanghai (UTC+8)

## 用户画像
队长是"${teamName}团队的核心协调者"。他们常说："让我来安排这个任务。"

他们专注于团队协调、任务分发和用户沟通，确保团队高效运转。

## 典型场景
- 用户提出需求时，队长负责分析并分配给合适的成员
- 队长跟踪任务进度，确保按时完成
- 队长汇总成员产出，向用户汇报结果

## 沟通特点
- 响应迅速，第一时间确认收到
- 进度透明，主动同步任务状态
- 问题及时上报，不让用户等待
- 交付质量可靠，让用户放心

## 协作风格
- 了解每个成员的专业领域
- 合理分配任务，发挥成员优势
- 协调成员协作，确保团队和谐
- 对最终交付质量负责
`

  const identityMd = `# Who Am I?

Name: ${leaderName}
Creature: AI Coordinator
Vibe: 协调、沟通、组织、把控
Emoji: 👨‍💼

## Notes

This is my identity. I am ${leaderName}, the chief coordinator of ${teamName} team.

I connect users with team members, ensure tasks are properly assigned, and guarantee quality delivery.

My signature: 👨‍💼 ${leaderName}
`

  return {
    id: leaderId,
    name: leaderName,
    role: 'coordinator',
    emoji: '👨‍💼',
    skills: ['任务分发', '团队协调', '进度跟踪', '质量把控'],
    agentsMd,
    soulMd,
    userMd,
    identityMd,
    created: false,
  }
}

function generateDefaultIdentityMd(name: string, emoji?: string): string {
  const creatures: Record<string, string> = {
    '收集': 'AI Assistant',
    '创作': 'AI Assistant',
    '审核': 'AI Assistant',
    '前端': 'AI Coder',
    '后端': 'AI Coder',
    '协调': 'AI Coordinator',
    '运维': 'AI Engineer',
    '分析': 'AI Analyst',
    '设计': 'AI Designer',
    '测试': 'AI Tester',
    '研究': 'AI Researcher',
    '计划': 'AI Planner',
    '执行': 'AI Executor',
    '咨询': 'AI Consultant',
    '培训': 'AI Trainer',
    '编辑': 'AI Editor',
    '翻译': 'AI Translator',
    '支持': 'AI Support',
    '管理': 'AI Manager',
  }
  
  const vibes: Record<string, string> = {
    '收集': '好奇、细致、敏锐',
    '创作': '创意、热情、表达欲强',
    '审核': '严谨、标准、质量导向',
    '前端': '创意、像素级、体验导向',
    '后端': '逻辑、性能、架构导向',
    '协调': '沟通、组织、节奏感',
    '运维': '稳定、自动化、预防导向',
    '分析': '洞察、数据驱动、逻辑清晰',
    '设计': '美学、创意、用户导向',
    '测试': '细致、边界探索、质量导向',
    '研究': '好奇、深度、假设驱动',
    '计划': '前瞻、结构化、风险意识',
    '执行': '高效、落地、结果导向',
    '咨询': '专业、洞察、方案导向',
    '培训': '耐心、清晰、成长导向',
    '编辑': '细致、逻辑、风格导向',
    '翻译': '准确、文化敏感、语义导向',
    '支持': '耐心、解决问题、服务导向',
    '管理': '全局观、资源调配、风险意识',
  }
  
  const shortName = name.replace(/[员师者家]/g, '')
  const creature = creatures[shortName] || 'AI Assistant'
  const vibe = vibes[shortName] || '专业、高效、可靠'
  const agentEmoji = emoji || '🤖'
  
  return `# Who Am I?

Name: ${name}
Creature: ${creature}
Vibe: ${vibe}
Emoji: ${agentEmoji}

## Notes

This is my identity. I am ${name}, focused on delivering excellence in my domain.

I communicate clearly, act proactively, and take ownership of my work.

My signature: ${agentEmoji} ${name}
`
}

function generateFallbackAgents(prompt: string): GeneratedAgent[] {
  const generated: GeneratedAgent[] = []
  const lowerPrompt = prompt.toLowerCase()
  const existingAgentIds = new Set(agentStore.agents.map(a => a.id))
  
  function generateUniqueId(baseId: string): string {
    let agentId = baseId
    let counter = 1
    while (existingAgentIds.has(agentId)) {
      agentId = `${baseId}-${counter}`
      counter++
    }
    existingAgentIds.add(agentId)
    return agentId
  }
  
  if (lowerPrompt.includes('内容') || lowerPrompt.includes('文案') || lowerPrompt.includes('写作') || lowerPrompt.includes('小红书')) {
    generated.push(
      {
        id: generateUniqueId('content-collector'),
        name: '信息收集员',
        role: 'collector',
        emoji: '🔍',
        skills: ['信息检索', '数据分析', '资料整理'],
        agentsMd: generateDefaultAgentsMd('信息收集员', 'collector'),
        soulMd: generateDefaultSoulMd('信息收集员'),
        userMd: generateDefaultUserMd('信息收集员'),
        identityMd: generateDefaultIdentityMd('信息收集员', '🔍'),
        created: false,
      },
      {
        id: generateUniqueId('content-writer'),
        name: '内容创作员',
        role: 'writer',
        emoji: '✍️',
        skills: ['文案写作', '创意策划', '内容优化'],
        agentsMd: generateDefaultAgentsMd('内容创作员', 'writer'),
        soulMd: generateDefaultSoulMd('内容创作员'),
        userMd: generateDefaultUserMd('内容创作员'),
        identityMd: generateDefaultIdentityMd('内容创作员', '✍️'),
        created: false,
      },
      {
        id: generateUniqueId('content-reviewer'),
        name: '内容审核员',
        role: 'reviewer',
        emoji: '✅',
        skills: ['内容审核', '质量把控', '合规检查'],
        agentsMd: generateDefaultAgentsMd('内容审核员', 'reviewer'),
        soulMd: generateDefaultSoulMd('内容审核员'),
        userMd: generateDefaultUserMd('内容审核员'),
        identityMd: generateDefaultIdentityMd('内容审核员', '✅'),
        created: false,
      }
    )
  }
  
  if (lowerPrompt.includes('开发') || lowerPrompt.includes('develop') || lowerPrompt.includes('代码')) {
    generated.push(
      {
        id: generateUniqueId('frontend-dev'),
        name: '前端工程师',
        role: 'frontend',
        emoji: '🎨',
        skills: ['Vue', 'React', 'TypeScript'],
        agentsMd: generateDefaultAgentsMd('前端工程师', 'frontend'),
        soulMd: generateDefaultSoulMd('前端工程师'),
        userMd: generateDefaultUserMd('前端工程师'),
        identityMd: generateDefaultIdentityMd('前端工程师', '🎨'),
        created: false,
      },
      {
        id: generateUniqueId('backend-dev'),
        name: '后端工程师',
        role: 'backend',
        emoji: '⚙️',
        skills: ['Node.js', 'Python', '数据库'],
        agentsMd: generateDefaultAgentsMd('后端工程师', 'backend'),
        soulMd: generateDefaultSoulMd('后端工程师'),
        userMd: generateDefaultUserMd('后端工程师'),
        identityMd: generateDefaultIdentityMd('后端工程师', '⚙️'),
        created: false,
      }
    )
  }
  
  if (lowerPrompt.includes('产品') || lowerPrompt.includes('product')) {
    generated.push({
      id: generateUniqueId('pm'),
      name: '产品经理',
      role: 'pm',
      emoji: '📋',
      skills: ['需求分析', '原型设计'],
      agentsMd: generateDefaultAgentsMd('产品经理', 'pm'),
      soulMd: generateDefaultSoulMd('产品经理'),
      userMd: generateDefaultUserMd('产品经理'),
      identityMd: generateDefaultIdentityMd('产品经理', '📋'),
      created: false,
    })
  }
  
  if (generated.length === 0) {
    generated.push({
      id: generateUniqueId('assistant'),
      name: '助手',
      role: 'assistant',
      emoji: '🤖',
      skills: [],
      agentsMd: generateDefaultAgentsMd('助手', 'assistant'),
      soulMd: generateDefaultSoulMd('助手'),
      userMd: generateDefaultUserMd('助手'),
      identityMd: generateDefaultIdentityMd('助手', '🤖'),
      created: false,
    })
  }
  
  return generated
}

function handleRemoveGeneratedAgent(index: number) {
  aiGeneratedAgents.value.splice(index, 1)
}

function handleAddCustomAgent() {
  aiGeneratedAgents.value.push({
    id: `custom-${Date.now()}`,
    name: `自定义角色 ${aiGeneratedAgents.value.length + 1}`,
    role: 'custom',
    emoji: '👤',
    skills: [],
    agentsMd: '',
    soulMd: '',
    userMd: '',
    created: false,
  })
}

function handleAddTask() {
  if (!taskTitle.value.trim()) {
    message.warning(t('pages.office.wizard.taskTitleRequired'))
    return
  }
  
  if (taskAssignedAgents.value.length === 0) {
    message.warning(t('pages.office.wizard.taskAgentRequired'))
    return
  }
  
  tasks.value.push({
    id: `task-${Date.now()}`,
    title: taskTitle.value.trim(),
    description: taskDescription.value.trim(),
    priority: taskPriority.value,
    assignedAgents: [...taskAssignedAgents.value],
    mode: taskMode.value,
  })
  
  taskTitle.value = ''
  taskDescription.value = ''
  taskPriority.value = 'medium'
  taskMode.value = 'run'
  if (aiGeneratedAgents.value.length > 0 && aiGeneratedAgents.value[0]) {
    taskAssignedAgents.value = [aiGeneratedAgents.value[0].id]
  } else {
    taskAssignedAgents.value = []
  }
}

function handleRemoveTask(index: number) {
  tasks.value.splice(index, 1)
}

function getAgentEmoji(agentId: string): string {
  const generatedAgent = aiGeneratedAgents.value.find(a => a.id === agentId)
  if (generatedAgent?.emoji) {
    return generatedAgent.emoji
  }
  const agent = agentStore.agents.find(a => a.id === agentId)
  return agent?.identity?.emoji || '🤖'
}

function getAgentDisplayName(agentId: string): string {
  const generatedAgent = aiGeneratedAgents.value.find(a => a.id === agentId)
  if (generatedAgent?.name) {
    return generatedAgent.name
  }
  const agent = agentStore.agents.find(a => a.id === agentId)
  return agent?.name || agentId
}

function handleAssignAgent(taskIndex: number, agentId: string) {
  const task = tasks.value[taskIndex]
  if (!task) return
  
  const idx = task.assignedAgents.indexOf(agentId)
  if (idx >= 0) {
    task.assignedAgents.splice(idx, 1)
  } else {
    task.assignedAgents.push(agentId)
  }
}

function handleAddBinding() {
  const agentId = allAgentIds.value[0] || ''
  bindings.value.push({
    agentId,
    channel: 'feishu',
    peerId: '',
    peerKind: 'group',
  })
}

function handleRemoveBinding(index: number) {
  bindings.value.splice(index, 1)
}

async function handleNext() {
  switch (wizardStep.value) {
    case 'scenario':
      const scenario = wizardStore.createScenario({
        name: scenarioName.value.trim(),
        description: scenarioDescription.value.trim(),
        agentSelectionMode: agentSelectionMode.value,
      })
      await wizardStore.saveScenario(scenario)
      wizardStore.setCurrentScenario(scenario)
      wizardStep.value = 'agents'
      break
      
    case 'agents':
      if (wizardStore.currentScenario) {
        if (agentSelectionMode.value === 'ai_create') {
          wizardStore.currentScenario.generatedAgents = [...aiGeneratedAgents.value]
        } else {
          wizardStore.currentScenario.selectedAgents = [...selectedAgents.value]
        }
        await wizardStore.saveScenario(wizardStore.currentScenario)
      }
      wizardStep.value = 'tasks'
      break
      
    case 'tasks':
      if (wizardStore.currentScenario) {
        const wizardTasks: WizardTask[] = []
        for (const t of tasks.value) {
          const wizardTask = wizardStore.createTask({
            scenarioId: wizardStore.currentScenario!.id,
            title: t.title,
            description: t.description,
            assignedAgents: t.assignedAgents,
            priority: t.priority,
            mode: t.mode,
          })
          await wizardStore.saveTask(wizardTask)
          wizardTasks.push(wizardTask)
        }
        wizardStore.currentScenario.tasks = wizardTasks
        await wizardStore.saveScenario(wizardStore.currentScenario)
      }
      
      await configStore.fetchConfig()
      const existingBindings = configStore.config?.bindings || []
      const agentIds = allAgentIds.value
      
      console.log('[Wizard] Agent IDs to bind:', agentIds)
      console.log('[Wizard] Existing bindings from config:', existingBindings)
      
      const existingBindingsMap = new Map<string, typeof existingBindings[0]>()
      for (const b of existingBindings) {
        if (b.agentId) {
          existingBindingsMap.set(b.agentId, b)
        }
      }
      
      bindings.value = agentIds.map((agentId) => {
        const existing = existingBindingsMap.get(agentId)
        if (existing) {
          const channel = existing.match?.channel || 'feishu'
          const accountId = existing.match?.accountId || ''
          const peerId = existing.match?.peer?.id || ''
          const peerKind = existing.match?.peer?.kind || 'group' as const
          
          console.log('[Wizard] Found existing binding for:', agentId, { channel, accountId, peerId, peerKind })
          
          return {
            agentId,
            accountId,
            channel,
            peerId,
            peerKind,
          }
        }
        
        return {
          agentId,
          accountId: agentId,
          channel: 'feishu',
          peerId: '',
          peerKind: 'group' as const,
        }
      })
      
      wizardStep.value = 'bindings'
      break
      
    case 'bindings':
      if (wizardStore.currentScenario) {
        wizardStore.currentScenario.bindings = [...bindings.value]
        await wizardStore.saveScenario(wizardStore.currentScenario)
      }
      wizardStep.value = 'confirm'
      break
      
    case 'confirm':
      startExecution()
      break
      
    default:
      break
  }
}

function handleBack() {
  switch (wizardStep.value) {
    case 'agents':
      wizardStep.value = 'scenario'
      break
    case 'tasks':
      wizardStep.value = 'agents'
      break
    case 'bindings':
      wizardStep.value = 'tasks'
      break
    case 'confirm':
      wizardStep.value = 'bindings'
      break
    case 'execution':
      wizardStep.value = 'confirm'
      break
    default:
      break
  }
}

function startExecution() {
  wizardStep.value = 'execution'
  isPreparationComplete.value = false
  buildPreparationTasks()
  executeNextTask()
}

function buildPreparationTasks() {
  executionTasks.value = []
  
  if (agentSelectionMode.value === 'ai_create') {
    aiGeneratedAgents.value.forEach((agent) => {
      const existingAgent = agentStore.agents.find(
        (a) => a.id === agent.id || a.name === agent.name
      )
      
      if (existingAgent) {
        executionTasks.value.push({
          id: `skip-${agent.id}`,
          type: 'skip_agent',
          status: 'completed',
          label: `跳过创建智能体: ${agent.name}`,
          detail: `智能体已存在 (ID: ${existingAgent.id})`,
          agentId: agent.id,
        })
        agent.created = true
      } else if (!agent.created) {
        executionTasks.value.push({
          id: `create-${agent.id}`,
          type: 'create_agent',
          status: 'pending',
          label: `创建智能体: ${agent.name}`,
          detail: `角色: ${agent.role}`,
          agentId: agent.id,
        })
      }
    })

    const agentsNeedIdentity = aiGeneratedAgents.value.filter(
      (agent) => agent.emoji || agent.name
    )
    if (agentsNeedIdentity.length > 0) {
      executionTasks.value.push({
        id: 'set-identity-batch',
        type: 'set_identity',
        status: 'pending',
        label: '批量设置智能体身份',
        detail: `设置 ${agentsNeedIdentity.length} 个智能体的名称和头像`,
      })
    }
  }
  
  executionTasks.value.push({
    id: 'config-update',
    type: 'config_update',
    status: 'pending',
    label: '更新配置文件',
    detail: '配置 sessions、agentToAgent 和 bindings',
  })
  
  tasks.value.forEach((task) => {
    task.assignedAgents.forEach((agentId) => {
      executionTasks.value.push({
        id: `send-${task.id}-${agentId}`,
        type: 'task_send',
        status: 'pending',
        label: `发送任务: ${task.title}`,
        detail: `目标: ${agentId}`,
        agentId,
      })
    })
  })
}

function startTaskExecution() {
  executeTaskSendTasks()
}

async function handleExecuteAndClose() {
  await executeTaskSendTasks()
  handleClose()
}

async function executeTaskSendTasks() {
  const pendingTaskSend = executionTasks.value.find((t) => t.status === 'pending' && t.type === 'task_send')
  if (!pendingTaskSend) {
    return
  }
  
  isExecuting.value = true
  
  for (const task of executionTasks.value.filter(t => t.type === 'task_send' && t.status === 'pending')) {
    task.status = 'in_progress'
    
    try {
      await executeTaskSend(task.id)
      task.status = 'completed'
    } catch (e: any) {
      task.status = 'failed'
      console.error('[Wizard] Task send failed:', task.id, e?.message || e)
    }
  }
  
  isExecuting.value = false
  isTaskExecutionComplete.value = true
  
  await agentStore.fetchAgents()
  
  if (wizardStore.currentScenario) {
    wizardStore.currentScenario.status = 'completed'
    await wizardStore.saveScenario(wizardStore.currentScenario)
  }
}

async function executeNextTask() {
  const pendingTask = executionTasks.value.find((t) => t.status === 'pending' && t.type !== 'task_send')
  if (!pendingTask) {
    isExecuting.value = false
    isPreparationComplete.value = true
    
    await agentStore.fetchAgents()
    
    if (wizardStore.currentScenario) {
      wizardStore.currentScenario.status = 'confirmed'
      wizardStore.currentScenario.bindings = [...bindings.value]
      wizardStore.currentScenario.generatedAgents = [...aiGeneratedAgents.value]
      wizardStore.currentScenario.selectedAgents = [...selectedAgents.value]
      
      await wizardStore.saveScenario(wizardStore.currentScenario)
      
      console.log('[Wizard] Scenario saved with bindings:', wizardStore.currentScenario.bindings)
      console.log('[Wizard] Scenario saved with agents:', wizardStore.currentScenario.generatedAgents)
    }
    
    return
  }
  
  isExecuting.value = true
  pendingTask.status = 'in_progress'
  
  try {
    switch (pendingTask.type) {
      case 'create_agent':
        await executeCreateAgent(pendingTask.agentId!)
        break
      case 'skip_agent':
        break
      case 'set_identity':
        await executeSetIdentityBatch()
        break
      case 'config_update':
        await executeConfigUpdate()
        break
      case 'task_send':
        await executeTaskSend(pendingTask.id)
        break
    }
    pendingTask.status = 'completed'
  } catch (error) {
    console.error('Task execution failed:', error)
    pendingTask.status = 'failed'
    pendingTask.detail = error instanceof Error ? error.message : String(error)
  }
  
  await new Promise((resolve) => setTimeout(resolve, 300))
  executeNextTask()
}

async function executeCreateAgent(agentId: string) {
  const agent = aiGeneratedAgents.value.find((a) => a.id === agentId)
  if (!agent) throw new Error(`Agent ${agentId} not found`)
  
  const existingAgent = agentStore.agents.find(
    (a) => a.id === agentId || a.name === agent.name
  )
  
  if (existingAgent) {
    console.log(`[Wizard] Agent ${agentId} already exists, skipping creation`)
    agent.created = true
    return
  }
  
  let workspace: string
  if (workspaceMode.value === 'shared' && aiGeneratedAgents.value.length > 0 && aiGeneratedAgents.value[0]) {
    const teamLeader = aiGeneratedAgents.value[0]
    workspace = `~/.openclaw/workspace-${teamLeader.id}`
  } else {
    workspace = `~/.openclaw/workspace-${agent.id}`
  }
  
  await agentStore.addAgent({
    id: agent.id,
    name: agent.name,
    workspace,
  })
  
  if (agent.agentsMd) {
    await wsStore.rpc.setAgentFile(agent.id, 'AGENTS.md', agent.agentsMd)
  }
  if (agent.soulMd) {
    await wsStore.rpc.setAgentFile(agent.id, 'SOUL.md', agent.soulMd)
  }
  if (agent.userMd) {
    await wsStore.rpc.setAgentFile(agent.id, 'USER.md', agent.userMd)
  }
  if (agent.identityMd) {
    await wsStore.rpc.setAgentFile(agent.id, 'IDENTITY.md', agent.identityMd)
  }
  
  agent.created = true
  await agentStore.fetchAgents()
}

async function executeSetIdentityBatch() {
  const agentsNeedIdentity = aiGeneratedAgents.value.filter(
    (agent) => agent.emoji || agent.name
  )
  
  if (agentsNeedIdentity.length === 0) return
  
  const identityParams = agentsNeedIdentity.map((agent) => ({
    agentId: agent.id,
    name: agent.name,
    emoji: agent.emoji,
  }))
  
  console.log('[Wizard] Batch setting identity for agents:', identityParams)
  await agentStore.setAgentsIdentityBatch(identityParams)
}

async function executeConfigUpdate() {
  await configStore.fetchConfig()
  const currentConfig = configStore.config || {}
  
  const agentIds = allAgentIds.value
  
  const existingBindings = currentConfig.bindings || []
  const updatedBindings = [...existingBindings]
  
  for (const binding of bindings.value) {
    const existingIndex = updatedBindings.findIndex(
      (b) => b.agentId === binding.agentId
    )
    
    const newBinding = {
      match: {
        channel: binding.channel,
        accountId: binding.accountId || binding.agentId,
        peer: binding.peerId ? {
          kind: binding.peerKind || 'group',
          id: binding.peerId,
        } : undefined,
      },
      agentId: binding.agentId,
    }
    
    if (existingIndex >= 0) {
      updatedBindings[existingIndex] = newBinding
    } else {
      updatedBindings.push(newBinding)
    }
  }
  
  const existingAgentsList = currentConfig.agents?.list || []
  const updatedAgentsList = [...existingAgentsList]
  
  if (aiGeneratedAgents.value.length > 0 && aiGeneratedAgents.value[0]) {
    const teamLeader = aiGeneratedAgents.value[0]
    const allAgentIdsList = aiGeneratedAgents.value.map(a => a.id)
    
    const existingLeaderIndex = updatedAgentsList.findIndex(a => a.id === teamLeader.id)
    const leaderConfig = {
      id: teamLeader.id,
      name: teamLeader.name,
      subagents: {
        allowAgents: allAgentIdsList,
      },
      tools: {
        deny: ['subagents', 'session_status'],
      },
      identity: {
        name: teamLeader.name,
        emoji: teamLeader.emoji || '👨‍💼',
      },
    }
    
    if (existingLeaderIndex >= 0) {
      updatedAgentsList[existingLeaderIndex] = {
        ...updatedAgentsList[existingLeaderIndex],
        ...leaderConfig,
      }
    } else {
      updatedAgentsList.push(leaderConfig)
    }
    
    console.log('[Wizard] Configuring team leader in config:', teamLeader.id, leaderConfig)
  }
  
  const updatedConfig = {
    ...currentConfig,
    tools: {
      ...currentConfig.tools,
      sessions: {
        visibility: 'all',
      },
      agentToAgent: {
        enabled: true,
        allow: [
          'main',
          ...agentIds.filter((id) => id !== 'main'),
        ],
      },
    },
    bindings: updatedBindings,
    agents: {
      ...currentConfig.agents,
      list: updatedAgentsList,
    },
  }
  
  await configStore.setConfig(updatedConfig)
}

async function executeTaskSend(taskSendId: string) {
  const match = taskSendId.match(/^send-(task-\d+)-(.+)$/)
  if (!match) throw new Error('Invalid task send ID')
  
  const [, taskId, agentId] = match
  const task = tasks.value.find((t) => t.id === taskId)
  if (!task) throw new Error(`Task ${taskId} not found`)
  
  const sessionKey = `agent:${agentId}:main:dm:task-${Date.now()}`
  
  const taskMessage = `任务: ${task.title}\n\n描述: ${task.description}\n\n请开始执行此任务。`
  
  const result = await wsStore.rpc.callAgent({
    sessionKey,
    message: taskMessage,
    idempotencyKey: `task-${taskId}-${Date.now()}`,
  })
  
  console.log('Task sent:', result)
}

function handleClose() {
  resetForm()
  wizardStep.value = 'scenario'
  wizardStore.setCurrentScenario(null)
  officeStore.hideWizard()
}

function getTaskStatusColor(status: string) {
  switch (status) {
    case 'completed': return '#18a058'
    case 'failed': return '#d03050'
    case 'in_progress': return '#2080f0'
    default: return '#909399'
  }
}

function getTaskStatusIcon(status: string) {
  switch (status) {
    case 'completed': return CheckmarkCircleOutline
    case 'failed': return AlertCircleOutline
    case 'in_progress': return RefreshOutline
    default: return InformationCircleOutline
  }
}

watch(
  () => wizardStore.currentScenario,
  (scenario) => {
    if (scenario) {
      scenarioName.value = scenario.name
      scenarioDescription.value = scenario.description
      agentSelectionMode.value = scenario.agentSelectionMode
      selectedAgents.value = scenario.selectedAgents
      aiGeneratedAgents.value = scenario.generatedAgents
    }
  }
)

onMounted(() => {
  wizardStore.initialize()
  agentStore.fetchAgents()
  configStore.fetchConfig()
})
</script>

<template>
  <NModal
    :show="officeStore.wizardVisible"
    :mask-closable="false"
    :close-on-esc="false"
    preset="card"
    :title="t('pages.office.wizard.title')"
    style="width: 900px; max-width: calc(100vw - 32px); max-height: 99vh;"
    @update:show="(v) => !v && handleClose()"
  >
    <div class="wizard-container">
      <NSteps :current="currentStepIndex" :vertical="false" class="wizard-steps">
        <NStep :status="getStepStatus(1)" :title="t('pages.office.wizard.steps.scenario')" :description="t('pages.office.wizard.steps.scenarioDesc')">
          <template #icon><NIcon :component="CreateOutline" /></template>
        </NStep>
        <NStep :status="getStepStatus(2)" :title="t('pages.office.wizard.steps.agents')" :description="t('pages.office.wizard.steps.agentsDesc')">
          <template #icon><NIcon :component="PeopleOutline" /></template>
        </NStep>
        <NStep :status="getStepStatus(3)" :title="t('pages.office.wizard.steps.tasks')" :description="t('pages.office.wizard.steps.tasksDesc')">
          <template #icon><NIcon :component="ListOutline" /></template>
        </NStep>
        <NStep :status="getStepStatus(4)" :title="t('pages.office.wizard.steps.bindings')" :description="t('pages.office.wizard.steps.bindingsDesc')">
          <template #icon><NIcon :component="LinkOutline" /></template>
        </NStep>
        <NStep :status="getStepStatus(5)" :title="t('pages.office.wizard.steps.confirm')" :description="t('pages.office.wizard.steps.confirmDesc')">
          <template #icon><NIcon :component="CheckmarkCircleOutline" /></template>
        </NStep>
        <NStep :status="getStepStatus(6)" :title="t('pages.office.wizard.steps.execution')" :description="t('pages.office.wizard.steps.executionDesc')">
          <template #icon><NIcon :component="PlayOutline" /></template>
        </NStep>
      </NSteps>

      <NScrollbar class="wizard-content">
        <div v-if="wizardStep === 'scenario'" class="wizard-step-panel">
          <NInput
            v-model:value="scenarioName"
            :placeholder="t('pages.office.wizard.scenarioNamePlaceholder')"
            maxlength="100"
            style="margin-bottom: 12px;"
          >
            <template #prefix>
              <NText depth="3">{{ t('pages.office.wizard.scenarioName') }}:</NText>
            </template>
          </NInput>
          <NInput
            v-model:value="scenarioDescription"
            type="textarea"
            :placeholder="t('pages.office.wizard.scenarioDescriptionPlaceholder')"
            :autosize="{ minRows: 3, maxRows: 6 }"
            maxlength="500"
          />
          <NAlert type="info" :bordered="false" style="margin-top: 12px;">
            {{ t('pages.office.wizard.scenarioHint') }}
          </NAlert>
        </div>

        <div v-else-if="wizardStep === 'agents'" class="wizard-step-panel">
          <NRadioGroup v-model:value="agentSelectionMode" style="margin-bottom: 16px;">
            <NSpace>
              <NRadio value="existing">
                <NIcon :component="PeopleOutline" style="margin-right: 4px;" />
                {{ t('pages.office.wizard.selectExisting') }}
              </NRadio>
              <NRadio value="ai_create">
                <NIcon :component="SparklesOutline" style="margin-right: 4px;" />
                {{ t('pages.office.wizard.aiCreateAgents') }}
              </NRadio>
            </NSpace>
          </NRadioGroup>

          <div v-if="agentSelectionMode === 'existing'">
            <NText depth="3" style="display: block; margin-bottom: 12px;">
              {{ t('pages.office.wizard.selectAgentsHint') }}
            </NText>
            <NScrollbar v-if="availableAgents.length > 0" style="max-height: 280px; padding-right: 4px;">
              <div class="agent-selection-grid">
                <div
                  v-for="agent in availableAgents"
                  :key="agent.id"
                  class="agent-selection-card"
                  :class="{ 'is-selected': selectedAgents.includes(agent.id) }"
                  @click="() => {
                    const idx = selectedAgents.indexOf(agent.id)
                    if (idx >= 0) selectedAgents.splice(idx, 1)
                    else selectedAgents.push(agent.id)
                  }"
                >
                  <div class="agent-avatar">
                    <span v-if="agent.identity?.emoji" class="agent-emoji">{{ agent.identity.emoji }}</span>
                    <span v-else class="agent-initial">{{ (agent.name || agent.id).charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="agent-info">
                    <NText strong>{{ agent.name || agent.id }}</NText>
                    <NText depth="3" style="font-size: 12px;">{{ agent.id }}</NText>
                  </div>
                  <div v-if="selectedAgents.includes(agent.id)" class="agent-check">
                    <NIcon :component="CheckmarkCircleOutline" />
                  </div>
                </div>
              </div>
            </NScrollbar>
            <NEmpty v-else :description="t('pages.office.noAgents')" />
          </div>

          <div v-else class="ai-agent-creation">
            <NText depth="3" style="display: block; margin-bottom: 12px;">
              {{ t('pages.office.wizard.aiCreateHint') }}
            </NText>
            
            <div class="workspace-mode-section">
              <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">
                {{ t('pages.office.wizard.workspaceMode') }}
              </NText>
              <NRadioGroup v-model:value="workspaceMode" style="margin-bottom: 12px;">
                <NSpace>
                  <NRadio value="independent">
                    <NTooltip>
                      <template #trigger>
                        <span>{{ t('pages.office.wizard.workspaceIndependent') }}</span>
                      </template>
                      {{ t('pages.office.wizard.workspaceIndependentHint') }}
                    </NTooltip>
                  </NRadio>
                  <NRadio value="shared">
                    <NTooltip>
                      <template #trigger>
                        <span>{{ t('pages.office.wizard.workspaceShared') }}</span>
                      </template>
                      {{ t('pages.office.wizard.workspaceSharedHint') }}
                    </NTooltip>
                  </NRadio>
                </NSpace>
              </NRadioGroup>
            </div>
            
            <div class="ai-prompt-input">
              <NInput
                v-model:value="aiAgentPrompt"
                type="textarea"
                :placeholder="t('pages.office.wizard.aiPromptPlaceholder')"
                :autosize="{ minRows: 2, maxRows: 4 }"
                :disabled="isGeneratingAgents"
              />
              <NButton
                type="primary"
                :loading="isGeneratingAgents"
                :disabled="!aiAgentPrompt.trim()"
                @click="handleGenerateAgents"
              >
                <template #icon><NIcon :component="SparklesOutline" /></template>
                {{ t('pages.office.wizard.generateAgents') }}
              </NButton>
            </div>

            <NAlert
              v-if="isGeneratingAgents"
              type="info"
              :bordered="false"
              style="margin-top: 12px;"
            >
              <template #icon>
                <NSpin size="small" />
              </template>
              {{ t('pages.office.wizard.generatingHint') }}
            </NAlert>

            <div v-if="aiGeneratedAgents.length > 0" class="generated-agents-list">
              <div class="generated-agents-header">
                <NText strong>{{ t('pages.office.wizard.generatedAgents') }} ({{ aiGeneratedAgents.length }})</NText>
                <NButton size="small" quaternary @click="handleAddCustomAgent">
                  <template #icon><NIcon :component="AddOutline" /></template>
                  {{ t('pages.office.wizard.addCustomAgent') }}
                </NButton>
              </div>
              <NScrollbar style="max-height: 280px; padding-right: 4px;">
                <div v-for="(agent, index) in aiGeneratedAgents" :key="agent.id" class="generated-agent-item" :class="{ 'is-team-leader': index === 0 }">
                  <div class="generated-agent-emoji">
                    <span>{{ agent.emoji || '👤' }}</span>
                  </div>
                  <div class="generated-agent-info">
                    <div style="display: flex; align-items: center; gap: 4px;">
                      <NInput
                        v-model:value="agent.name"
                        size="small"
                        style="width: 120px;"
                        :placeholder="t('pages.office.wizard.agentName')"
                      />
                      <NTag v-if="index === 0" type="warning" size="small">
                        {{ t('pages.office.wizard.teamLeader') }}
                      </NTag>
                    </div>
                    <NInput
                      v-model:value="agent.role"
                      size="small"
                      style="width: 100px;"
                      :placeholder="t('pages.office.wizard.agentRole')"
                    />
                    <NTooltip>
                      <template #trigger>
                        <NButton size="small" quaternary>
                          <template #icon><NIcon :component="DocumentTextOutline" /></template>
                        </NButton>
                      </template>
                      {{ t('pages.office.wizard.viewFiles') }}
                    </NTooltip>
                  </div>
                  <NButton v-if="index !== 0" size="small" quaternary type="error" @click="handleRemoveGeneratedAgent(index)">
                    <template #icon><NIcon :component="TrashOutline" /></template>
                  </NButton>
                </div>
              </NScrollbar>
            </div>
          </div>
        </div>

        <div v-else-if="wizardStep === 'tasks'" class="wizard-step-panel">
          <NText depth="3" style="display: block; margin-bottom: 12px;">
            {{ t('pages.office.wizard.addTasksHint') }}
          </NText>

          <div class="task-input-form">
            <NInput
              v-model:value="taskTitle"
              :placeholder="t('pages.office.wizard.taskTitlePlaceholder')"
              style="flex: 1;"
            />
            <NSelect
              v-model:value="taskPriority"
              :options="[
                { label: '低', value: 'low' },
                { label: '中', value: 'medium' },
                { label: '高', value: 'high' },
              ]"
              style="width: 80px;"
            />
            <NButton type="primary" @click="handleAddTask">
              {{ t('pages.office.wizard.addTask') }}
            </NButton>
          </div>

          <NInput
            v-model:value="taskDescription"
            type="textarea"
            :placeholder="t('pages.office.wizard.taskDescriptionPlaceholder')"
            :autosize="{ minRows: 2, maxRows: 4 }"
            style="margin-top: 8px;"
          />

          <div class="task-options">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.office.wizard.taskModeLabel') }}:</NText>
            <NRadioGroup v-model:value="taskMode" size="small">
              <NRadio value="run">{{ t('pages.office.wizard.modeRun') }}</NRadio>
              <NRadio value="session">{{ t('pages.office.wizard.modeSession') }}</NRadio>
            </NRadioGroup>
          </div>

          <div class="task-options" style="margin-top: 8px;">
            <NText depth="3" style="font-size: 12px;">
              <span style="color: #d03050; margin-right: 2px;">*</span>{{ t('pages.office.wizard.assignAgents') }}:
            </NText>
            <NSelect
              v-model:value="taskAssignedAgents"
              multiple
              :options="agentOptions"
              :placeholder="t('pages.office.wizard.selectAgentsPlaceholder')"
              style="flex: 1; max-width: 400px;"
              size="small"
              :status="taskAssignedAgents.length === 0 ? 'warning' : undefined"
            />
            <NText v-if="taskAssignedAgents.length === 0" type="warning" style="font-size: 11px; margin-left: 4px;">
              ({{ t('common.required') }})
            </NText>
          </div>

          <div v-if="tasks.length > 0" class="task-list">
            <NCollapse>
              <NCollapseItem
                v-for="(task, index) in tasks"
                :key="task.id"
                :name="task.id"
              >
                <template #header>
                  <div class="task-item-header">
                    <NTag :type="task.priority === 'high' ? 'error' : task.priority === 'low' ? 'default' : 'info'" size="small">
                      {{ task.priority }}
                    </NTag>
                    <NText strong style="margin-left: 8px;">{{ task.title }}</NText>
                    <NTag v-if="task.mode === 'session'" type="warning" size="small" style="margin-left: 8px;">
                      {{ t('pages.office.wizard.modeSession') }}
                    </NTag>
                    <NButton size="tiny" text type="error" style="margin-left: auto;" @click.stop="handleRemoveTask(index)">
                      {{ t('common.delete') }}
                    </NButton>
                  </div>
                </template>
                <div class="task-item-content">
                  <NText v-if="task.description" depth="3" style="font-size: 12px; display: block; margin-bottom: 8px;">
                    {{ task.description }}
                  </NText>
                  <div class="task-agents-assign">
                    <NText depth="3" style="font-size: 12px; margin-right: 8px;">{{ t('pages.office.wizard.assignAgents') }}:</NText>
                    <div class="agent-chips">
                      <NTooltip
                        v-for="agentId in (agentSelectionMode === 'existing' ? selectedAgents : aiGeneratedAgents.map(a => a.id))"
                        :key="agentId"
                        placement="top"
                      >
                        <template #trigger>
                          <div
                            class="agent-chip"
                            :class="{ 'is-assigned': task.assignedAgents.includes(agentId) }"
                            @click="handleAssignAgent(index, agentId)"
                          >
                            <span>{{ getAgentEmoji(agentId) }}</span>
                          </div>
                        </template>
                        {{ getAgentDisplayName(agentId) }}
                      </NTooltip>
                    </div>
                  </div>
                </div>
              </NCollapseItem>
            </NCollapse>
          </div>
          <NEmpty v-else :description="t('pages.office.wizard.noTasks')" style="margin-top: 16px;" />
        </div>

        <div v-else-if="wizardStep === 'bindings'" class="wizard-step-panel">
          <NText depth="3" style="display: block; margin-bottom: 12px;">
            {{ t('pages.office.wizard.bindingsHint') }}
          </NText>

          <NButton size="small" @click="handleAddBinding" style="margin-bottom: 12px;">
            <template #icon><NIcon :component="AddOutline" /></template>
            {{ t('pages.office.wizard.addBinding') }}
          </NButton>

          <NScrollbar v-if="bindings.length > 0" style="max-height: 280px; padding-right: 4px;">
            <div class="bindings-list">
              <div v-for="(binding, index) in bindings" :key="index" class="binding-item">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 140px;">
                  <span style="font-size: 18px;">{{ getAgentEmoji(binding.agentId) }}</span>
                  <NText style="font-size: 13px;">
                    {{ getAgentDisplayName(binding.agentId) }}
                  </NText>
                </div>
                <NSelect
                  v-model:value="binding.agentId"
                  :options="allAgentIds.map(id => ({ label: id, value: id }))"
                  style="width: 150px;"
                  :placeholder="t('pages.office.wizard.selectAgent')"
                />
                <NSelect
                  v-model:value="binding.channel"
                  :options="availableChannels"
                  style="width: 120px;"
                  :placeholder="t('pages.office.wizard.selectChannel')"
                />
                <NInput
                  v-model:value="binding.peerId"
                  :placeholder="t('pages.office.wizard.peerIdPlaceholder')"
                  style="flex: 1;"
                />
                <NSelect
                  v-model:value="binding.peerKind"
                  :options="[
                    { label: 'Group', value: 'group' },
                    { label: 'Direct', value: 'direct' },
                    { label: 'Channel', value: 'channel' },
                    { label: 'DM', value: 'dm' },
                    { label: 'ACP', value: 'acp' },
                  ]"
                  style="width: 100px;"
                />
                <NButton size="small" quaternary type="error" @click="handleRemoveBinding(index)">
                  <template #icon><NIcon :component="TrashOutline" /></template>
                </NButton>
              </div>
            </div>
          </NScrollbar>
          <NAlert v-else type="info" :bordered="false">
            {{ t('pages.office.wizard.noBindingsHint') }}
          </NAlert>
        </div>

        <div v-else-if="wizardStep === 'confirm'" class="wizard-step-panel wizard-step-confirm">
          <NScrollbar style="max-height: 390px; padding-right: 4px;">
            <NText strong style="font-size: 16px; display: block; margin-bottom: 16px;">
              {{ t('pages.office.wizard.confirmTitle') }}
            </NText>

            <NDescriptions label-placement="left" :column="1" bordered>
              <NDescriptionsItem :label="t('pages.office.wizard.scenarioName')">
                {{ scenarioName }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('pages.office.wizard.scenarioDescription')">
                {{ scenarioDescription || '-' }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('pages.office.wizard.agentMode')">
                {{ agentSelectionMode === 'existing' ? t('pages.office.wizard.selectExisting') : t('pages.office.wizard.aiCreateAgents') }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('pages.office.wizard.agentsCount')">
                {{ agentSelectionMode === 'existing' ? selectedAgents.length : aiGeneratedAgents.length }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('pages.office.wizard.tasksCount')">
                {{ tasks.length }}
              </NDescriptionsItem>
              <NDescriptionsItem :label="t('pages.office.wizard.bindingsCount')">
                {{ bindings.length }}
              </NDescriptionsItem>
            </NDescriptions>

            <NDivider />

            <div class="confirm-agents">
              <NText strong style="display: block; margin-bottom: 8px;">{{ t('pages.office.wizard.agentsList') }}</NText>
              <NSpace wrap>
                <NTag v-for="agentId in (agentSelectionMode === 'existing' ? selectedAgents : aiGeneratedAgents.map(a => a.id))" :key="agentId" type="info">
                  <span style="margin-right: 4px;">{{ getAgentEmoji(agentId) }}</span>
                  {{ getAgentDisplayName(agentId) }}（{{ agentId }}）
                </NTag>
              </NSpace>
            </div>

            <div class="confirm-tasks" style="margin-top: 16px;">
              <NText strong style="display: block; margin-bottom: 8px;">{{ t('pages.office.wizard.tasksList') }}</NText>
              <NCollapse>
                <NCollapseItem
                  v-for="task in tasks"
                  :key="task.id"
                  :name="task.id"
                >
                  <template #header>
                    <div class="confirm-task-header">
                      <NTag :type="task.priority === 'high' ? 'error' : task.priority === 'low' ? 'default' : 'info'" size="small">
                        {{ task.priority }}
                      </NTag>
                      <NText style="margin-left: 8px;">{{ task.title }}</NText>
                      <NTag v-if="task.mode === 'session'" type="warning" size="small" style="margin-left: 8px;">
                        {{ t('pages.office.wizard.modeSession') }}
                      </NTag>
                    </div>
                  </template>
                  <div class="confirm-task-content">
                    <div class="confirm-task-info">
                      <div class="confirm-task-info-item">
                        <NText depth="3" style="font-size: 12px; min-width: 60px;">{{ t('pages.office.wizard.taskTitle') }}:</NText>
                        <NText style="font-size: 13px;">{{ task.title }}</NText>
                      </div>
                      <div v-if="task.description" class="confirm-task-info-item">
                        <NText depth="3" style="font-size: 12px; min-width: 60px;">{{ t('pages.office.wizard.taskDescription') }}:</NText>
                        <NText depth="2" style="font-size: 13px;">{{ task.description }}</NText>
                      </div>
                      <div class="confirm-task-info-item">
                        <NText depth="3" style="font-size: 12px; min-width: 60px;">{{ t('pages.office.wizard.taskPriority') }}:</NText>
                        <NTag :type="task.priority === 'high' ? 'error' : task.priority === 'low' ? 'default' : 'info'" size="small">
                          {{ task.priority === 'high' ? t('pages.office.wizard.priorityHigh') : task.priority === 'low' ? t('pages.office.wizard.priorityLow') : t('pages.office.wizard.priorityMedium') }}
                        </NTag>
                      </div>
                      <div class="confirm-task-info-item">
                        <NText depth="3" style="font-size: 12px; min-width: 60px;">{{ t('pages.office.wizard.taskModeLabel') }}:</NText>
                        <NTag :type="task.mode === 'session' ? 'warning' : 'success'" size="small">
                          {{ task.mode === 'session' ? t('pages.office.wizard.modeSession') : t('pages.office.wizard.modeRun') }}
                        </NTag>
                      </div>
                      <div class="confirm-task-info-item">
                        <NText depth="3" style="font-size: 12px; min-width: 60px;">{{ t('pages.office.wizard.assignAgents') }}:</NText>
                        <NSpace>
                          <NTag v-for="agentId in task.assignedAgents" :key="agentId" size="small">
                            <span style="margin-right: 4px;">{{ getAgentEmoji(agentId) }}</span>
                            {{ getAgentDisplayName(agentId) }}
                          </NTag>
                        </NSpace>
                      </div>
                    </div>
                  </div>
                </NCollapseItem>
              </NCollapse>
            </div>
          </NScrollbar>
        </div>

        <div v-else-if="wizardStep === 'execution'" class="wizard-step-panel wizard-step-execution">
          <div class="execution-header">
            <NSpin v-if="isExecuting" size="small" />
            <NIcon v-else :component="CheckmarkCircleOutline" size="20" style="color: #18a058;" />
            <NText strong style="margin-left: 8px;">
              {{ isExecuting ? t('pages.office.wizard.executing') : t('pages.office.wizard.executionComplete') }}
            </NText>
          </div>

          <NScrollbar style="max-height: 390px; padding-right: 4px;">
            <div class="execution-tasks">
              <div
                v-for="task in executionTasks"
                :key="task.id"
                class="execution-task-item"
                :class="`status-${task.status}`"
              >
                <div class="execution-task-icon" :style="{ color: getTaskStatusColor(task.status) }">
                  <NIcon :component="getTaskStatusIcon(task.status)" />
                </div>
                <div class="execution-task-content">
                  <NText strong style="font-size: 13px;">{{ task.label }}</NText>
                  <NText depth="3" style="font-size: 11px;">{{ task.detail }}</NText>
                </div>
                <NProgress
                  v-if="task.status === 'in_progress'"
                  type="circle"
                  :percentage="50"
                  :show-indicator="false"
                  :stroke-width="16"
                  style="width: 20px; height: 20px;"
                />
              </div>
            </div>
          </NScrollbar>
        </div>
      </NScrollbar>
    </div>

    <template #footer>
      <div class="wizard-footer">
        <NButton v-if="wizardStep !== 'scenario' && wizardStep !== 'execution'" @click="handleBack">
          <template #icon><NIcon :component="ArrowBackOutline" /></template>
          {{ t('pages.office.wizard.previous') }}
        </NButton>
        <div v-else></div>
        <NSpace>
          <NButton v-if="wizardStep !== 'execution'" @click="handleClose">{{ t('common.cancel') }}</NButton>
          <NButton
            v-if="wizardStep !== 'execution'"
            type="primary"
            :disabled="!canProceed"
            @click="handleNext"
          >
            <template #icon><NIcon :component="ArrowForwardOutline" /></template>
            {{ wizardStep === 'confirm' ? t('pages.office.wizard.confirmAndExecute') : t('pages.office.wizard.next') }}
          </NButton>
          <template v-else>
            <NButton 
              :type="isTaskExecutionComplete ? 'default' : 'primary'"
              :disabled="!isPreparationComplete || isExecuting || isTaskExecutionComplete"
              @click="handleExecuteAndClose"
            >
              <template #icon><NIcon :component="PlayOutline" /></template>
              {{ t('pages.office.wizard.executeTasksNow') }}
            </NButton>
            <NButton 
              :type="isTaskExecutionComplete ? 'primary' : 'default'"
              :disabled="!isPreparationComplete || isExecuting"
              @click="handleClose"
            >
              {{ t('pages.office.wizard.done') }}
            </NButton>
          </template>
        </NSpace>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.wizard-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.wizard-steps {
  padding: 0 16px;
}

.wizard-content {
  min-height: 280px;
  max-height: 390px;
}

.wizard-step-panel {
  padding: 16px 0;
}

.agent-selection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  padding-right: 12px;
}

.agent-selection-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.agent-selection-card:hover {
  border-color: var(--primary-color);
  background: rgba(24, 160, 88, 0.05);
}

.agent-selection-card.is-selected {
  border-color: var(--primary-color);
  background: rgba(24, 160, 88, 0.1);
}

.agent-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
}

.agent-emoji {
  font-size: 20px;
}

.agent-initial {
  font-size: 16px;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-info > * {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-check {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--primary-color);
}

.ai-agent-creation {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-mode-section {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.ai-prompt-input {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.generated-agents-list {
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 12px;
}

.generated-agents-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.generated-agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
}

.generated-agent-item.is-team-leader {
  background: linear-gradient(135deg, rgba(250, 173, 20, 0.1) 0%, rgba(250, 173, 20, 0.05) 100%);
  border: 1px solid rgba(250, 173, 20, 0.3);
}

.generated-agent-item:last-child {
  margin-bottom: 0;
}

.generated-agent-emoji {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.generated-agent-info {
  display: flex;
  gap: 8px;
  flex: 1;
}

.task-input-form {
  display: flex;
  gap: 8px;
}

.task-options {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.task-list {
  margin-top: 16px;
}

.task-item-header {
  display: flex;
  align-items: center;
  width: 100%;
}

.task-item-content {
  padding: 8px 0;
}

.task-agents-assign {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.agent-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}

.agent-chip:hover {
  border-color: var(--primary-color);
}

.agent-chip.is-assigned {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.bindings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.binding-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
}

.confirm-task-header {
  display: flex;
  align-items: center;
}

.confirm-task-content {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  margin-top: 4px;
}

.confirm-task-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-task-info-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.wizard-step-execution {
  display: flex;
  flex-direction: column;
}

.execution-header {
  display: flex;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}

.execution-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.execution-task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border-left: 3px solid transparent;
}

.execution-task-item.status-pending {
  border-left-color: #909399;
}

.execution-task-item.status-in_progress {
  border-left-color: #2080f0;
}

.execution-task-item.status-completed {
  border-left-color: #18a058;
}

.execution-task-item.status-failed {
  border-left-color: #d03050;
}

.execution-task-icon {
  flex-shrink: 0;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.execution-task-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wizard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 54px;
}
</style>
