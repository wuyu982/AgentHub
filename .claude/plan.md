# AgentHub 项目规划

## 项目定位

从零构建一个**多 Agent 协同 + RAG 知识增强**的本地 AI 工作台。  
以 IM 群聊范式组织 Agent 协作，内置 RAG 知识库让 Agent 能检索私有知识。

与 bitdance-agenthub 的差异化：
- **RAG 作为一等公民**：知识库管理、文档 ingestion、向量检索内置于平台
- **Milvus 向量引擎**：独立向量服务，支持大规模知识库和高级检索策略
- **更清晰的模块边界**：从零设计，避免历史包袱
- **渐进式架构**：先跑通核心链路，再按需扩展

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端框架 | Next.js 15+ App Router + React 19 | 用最新稳定版 |
| 语言 | TypeScript strict | 全栈统一 |
| 样式 | Tailwind CSS 4 + shadcn/ui | 组件复制到本地 |
| 状态 | Zustand + Immer | 前端状态管理 |
| 业务DB | SQLite + Drizzle + better-sqlite3 | 本地优先，会话/消息/Agent 等 |
| 向量DB | Milvus（开发用 Milvus Lite / Docker） | RAG 知识库向量存储 |
| Embedding | 外部 API（OpenAI / 火山 / 自定义兼容端点） | 文档向量化 |
| 流式传输 | SSE（单连接） | 实时事件推送 |
| AI SDK | openai（OpenAI兼容协议） + @anthropic-ai/sdk | 多 provider 适配 |
| 包管理 | pnpm | 锁定 |

---

## 分层架构

```
L5  UI 组件层        src/components/**
    React + shadcn, 消息渲染, 知识库管理界面

L4  State + Transport   src/stores/**
    Zustand store + SSE 客户端 + StreamEvent reducer

L3  Application Services  src/server/**
    AgentRunner | RAGService | ConversationService | EventBus | ToolExecutor

L2  Platform Adapters    src/server/adapters/**
    OpenAICompatibleAdapter | AnthropicAdapter | MockAdapter

L1  Persistence         src/db/** + Milvus client
    SQLite(业务数据) + Milvus(向量) + workspace 文件系统
```

数据流：
```
用户消息 → API Route → AgentRunner 
  → [RAG检索: query Milvus → 拼context] 
  → 选 Adapter 调 LLM（带检索结果）
  → Adapter 吐 StreamEvent 
  → EventBus → SSE → 前端 store → UI
```

---

## 核心实体

| 实体 | 职责 |
|---|---|
| Agent | AI 角色（名称/头像/prompt/adapter/model/工具集） |
| Conversation | 对话/工作空间（单聊/群聊） |
| Message | 结构化消息（parts 数组，非纯文本） |
| KnowledgeBase | 知识库（名称/描述/embedding配置/关联collection） |
| Document | 知识库文档（文件名/分块策略/状态） |
| Chunk | 文档分块（文本/向量ID/元数据） |
| Artifact | 产物（代码/文档/网页） |
| Workspace | 会话关联的文件沙箱 |
| AgentRun | 一次 Agent 调用的生命周期 |

---

## 实施阶段

### Phase 1: 项目骨架 + 基础设施
- [x] 初始化 Next.js + TypeScript + Tailwind + shadcn
- [ ] SQLite + Drizzle schema（agents, conversations, messages, agent_runs）
- [ ] 基础 API 路由结构
- [ ] SSE 事件总线（EventBus → stream route）
- [ ] Zustand store + StreamEvent reducer 骨架
- [ ] 项目配置（.env, eslint, tsconfig）

### Phase 2: 单 Agent 对话（跑通核心链路）
- [ ] OpenAI 兼容 Adapter（支持 DeepSeek/OpenAI/火山方舟等）
- [ ] AgentRunner 基础流程（接收消息 → 调 adapter → 流式返回）
- [ ] 消息 parts 模型（text / thinking / tool_use / tool_result）
- [ ] 前端 IM 界面（会话列表 + 聊天面板 + 输入框）
- [ ] SSE 实时流式渲染
- [ ] Agent 管理（CRUD + 内置 Agent seed）

### Phase 3: 多 Agent + 群聊
- [ ] 群聊模式（多 Agent 加入一个 Conversation）
- [ ] @mention 路由（消息指定 Agent 响应）
- [ ] Orchestrator Agent（拆任务 + 调度子 Agent）
- [ ] dispatch plan 可视化
- [ ] 跨 run 对话历史（context 序列化注入）

### Phase 4: RAG 知识库系统
- [ ] Milvus 客户端封装（连接管理 / collection CRUD）
- [ ] KnowledgeBase + Document + Chunk 实体（SQLite 元数据）
- [ ] 文档 Ingestion Pipeline：
  - 上传文档（PDF/MD/TXT/代码文件）
  - 文本提取 + 分块（支持 fixed-size / recursive / semantic）
  - 调 Embedding API 向量化
  - 写入 Milvus collection
- [ ] RAG 检索工具（`rag_search`）：
  - 接受自然语言 query
  - embedding → Milvus ANN 检索 → rerank
  - 返回 top-k chunks 作为 context
- [ ] Agent 绑定知识库（配置哪些 Agent 可访问哪些 KB）
- [ ] 知识库管理 UI（创建/上传/状态/检索测试）

### Phase 5: 工具系统 + Workspace
- [ ] 工具注册表（ToolDef 接口）
- [ ] 内置工具：fs_read / fs_write / bash / rag_search
- [ ] Workspace 沙箱（sandbox / local 模式）
- [ ] fs_write 审批机制
- [ ] Artifact 产物系统（web_app / document / code_file）

### Phase 6: 打磨 + 桌面版
- [ ] 全局 API Key 设置面板
- [ ] Token 用量统计
- [ ] Electron 桌面打包
- [ ] 深色/浅色主题
- [ ] 全局搜索

---

## 目录结构（目标）

```
AgentHub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── stream/         # SSE endpoint
│   │   │   ├── conversations/  # 会话 CRUD + 消息
│   │   │   ├── agents/         # Agent CRUD
│   │   │   ├── knowledge/      # 知识库管理
│   │   │   └── settings/       # 全局设置
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/             # React UI 组件
│   │   ├── ui/                 # shadcn 基础组件
│   │   ├── chat/               # 聊天相关
│   │   ├── knowledge/          # 知识库管理界面
│   │   ├── agent/              # Agent 管理界面
│   │   └── layout/             # 布局组件
│   ├── stores/                 # Zustand stores
│   │   └── app-store.ts
│   ├── server/                 # 服务层（L3）
│   │   ├── adapters/           # LLM 适配器（L2）
│   │   ├── tools/              # 工具系统
│   │   ├── rag/                # RAG 相关服务
│   │   │   ├── milvus-client.ts
│   │   │   ├── embedding-service.ts
│   │   │   ├── ingestion-service.ts
│   │   │   ├── chunking.ts
│   │   │   └── retrieval-service.ts
│   │   ├── agent-runner.ts
│   │   ├── conversation-service.ts
│   │   └── event-bus.ts
│   ├── db/                     # 持久化（L1）
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── seed.ts
│   └── shared/                 # 跨层共享类型
│       ├── types.ts
│       └── constants.ts
├── electron/                   # Electron 主进程（Phase 6）
├── .env.example
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── tailwind.config.ts
```

---

## 立即执行：Phase 1 详细步骤

1. 初始化 Next.js 项目（`create-next-app` with App Router + TypeScript）
2. 安装核心依赖：
   - `better-sqlite3` + `drizzle-orm` + `drizzle-kit`
   - `zustand` + `immer`
   - `openai`（OpenAI兼容SDK）
   - `@anthropic-ai/sdk`
   - `@zilliz/milvus2-sdk-node`（Milvus Node.js SDK）
   - `zod`（输入校验）
   - `nanoid`（ID生成）
   - shadcn/ui 组件
3. 配置 Tailwind 4 + shadcn
4. 建立 SQLite schema（Phase 1 表：agents, conversations, messages, agent_runs, app_settings）
5. 实现 EventBus + SSE route
6. 搭建 Zustand store 骨架
7. 搭建基础 UI 布局（侧栏 + 主面板）
