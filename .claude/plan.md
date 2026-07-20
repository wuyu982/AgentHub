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
| Agent | AI 角色（名称/头像/prompt/工具集/modelConfigId 引用模型配置） |
| ModelConfig | 模型配置（adapter/provider/modelId/baseURL/apiKey），Agent 纯引用，恰一条 isDefault |
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

### Phase 1: 项目骨架 + 基础设施 ✅
- [x] 初始化 Next.js + TypeScript + Tailwind + shadcn
- [x] SQLite + Drizzle schema（agents, conversations, messages, agent_runs, app_settings）
- [x] 基础 API 路由结构
- [x] SSE 事件总线（EventBus → stream route）
- [x] Zustand store + StreamEvent reducer 骨架
- [x] 项目配置（.env, eslint, tsconfig）

### Phase 2: 单 Agent 对话（跑通核心链路）✅
- [x] OpenAI 兼容 Adapter（支持 DeepSeek/OpenAI/火山方舟等）
- [x] AgentRunner 基础流程（接收消息 → 调 adapter → 流式返回）
- [x] 消息 parts 模型（text / thinking / tool_use / tool_result）
- [x] 前端 IM 界面（会话列表 + 聊天面板 + 输入框）
- [x] SSE 实时流式渲染（链路始终逐字，观感卡顿的绘制饥饿问题见前端优化梯队三修复）
- [x] Agent 管理（CRUD + 内置 Agent seed）
- [x] 凭证解析（per-agent apiKey/baseURL → app_settings → env，见 CLAUDE.md §5.2）

### Phase 3: 多 Agent + 群聊

**线 1｜群聊路由（基本完成，剩 @autocomplete UI）**
- [x] 群聊模式（建会话挂载多 Agent + agentIds 写入）
- [x] 群聊 history attribution（其他 agent 发言带 [名字] 前缀，跨 agent 上下文可辨识）
- [x] 多 Agent 并发路由（显式 @mention → 并发触发被 @ 的 agent）
- [x] AI 意图路由（群聊无 @ 时按消息意图选出一个 agent 回应；非 Orchestrator，无 tool-loop）
- [x] @mention autocomplete UI（输入 @ 弹候选、显式覆盖 AI 判断）

> 线 1 完成。修复 chat-panel selector 无限渲染、globals.css 补 @theme 语义色映射（Tailwind 4）。

**线 2｜工具调用循环 ✅**
- [x] adapter 传 tools → 吐 tool.call → runner 执行 → 回灌 tool_result 的多轮循环

子任务拆解：
- [x] ① 工具系统骨架 `src/server/tools/`（types/registry/executor/builtin，不碰已锁定契约）
- [x] ② adapter 契约扩展（`AdapterRequest.tools`、`AdapterMessage` 改判别联合承载 tool_calls/tool 结果、新增 `AdapterToolCall`）
- [x] ③ openai-compatible 实现工具流（按 index 拼接 `delta.tool_calls` → 完整后吐 `tool.call`）
- [x] ④ runAgent 循环化（while agentic loop，硬上限 8 轮，交错落 text/tool_use/tool_result parts，返回 finalText）

> 关键决策落地：tool_use/tool_result 复用 `part.start` 通道推前端（不加新事件，前端 reducer 无需改）；
> runAgent 现返回 `Promise<string>`（finalText），为线 3 dispatch 收集子 agent 产出预留；ctx.depth 传 0。

**① 工具系统骨架 — 接口设计（本次落地）**

目录 `src/server/tools/`：`types.ts` / `registry.ts` / `executor.ts` / `builtin/get-current-time.ts`

- `ToolDef`：`{ name, description, parameters(JSONSchema), execute(args: unknown, ctx): Promise<ToolResult> }`
  - `args: unknown`，工具内部自行 zod narrow（LLM 输出是不可信边界）
- `ToolContext`：`{ conversationId, runId, signal, depth }`；`workspace`/`dispatch` 注释预留（Phase 5 / 线 3 接入，加法扩展）
  - `depth` 现在就定，线 2 传 0，供线 3 递归护栏用，省一次契约改动
- `ToolResult`：`{ result: unknown, isError: boolean }`；工具失败是正常业务流，不 throw，只有 signal abort 才冒泡
- `JSONSchema`：手写最小结构 `{ type:'object'; properties; required? }`，不引 json-schema-to-ts（YAGNI）
- `registry`：显式集中注册（非 import 即注册，避免 Next.js 热重载重复注册）；`resolveTools` 对未知 name warn 跳过
- `executor.executeTools`：`Promise.all` 并发，结果带 callId 顺序对齐，兜错为 isError，abort 冒泡
- 验证工具 `get_current_time`：无参纯函数，只为跑通「LLM 决定调用 → 执行 → 回灌 → 再生成」闭环

决策：`get_current_time` 作验证工具 / 显式集中注册 / JSONSchema 手写 —— 均已确认。
`ToolSchema`（喂 adapter 的形状）与 `AdapterRequest.tools` 属②的契约变更，届时另行确认。

**线 3｜Orchestrator ✅**
- [x] Orchestrator Agent（dispatch_to_agent 工具 + 拆任务，走同一 AgentRunner）
- [x] dispatch plan 可视化（复用 tool_use / tool_result parts + message-list 渲染工具 part）

> 落地决策（已确认）：
> - 方案 B：子 agent 独立在群里发消息（走自己的 runAgent + message 事件），Orchestrator 用 tool_result 收其产出
> - task 传递用方案 A：dispatchChild 把 task 落库为 user 消息（parentMessageId 指向触发消息，mentionedAgentIds 记目标），可追溯
> - `dispatch_to_agent` execute 内查会话校验 agentId 在会话内；zod 校验入参
> - 两道一级护栏：ctx.dispatch 仅 depth=0 注入；depth>0 时工具集过滤掉 dispatch_to_agent
> - `ToolContext` 加 `DispatchFn`（runner 注入，工具层不依赖 runner）；executor 整个 ctx 透传无需改
> - 前端：message-list.tsx 补 tool_use/tool_result 渲染（details 折叠）；artifact_ref 仍留 Phase 5

### 前端界面优化（穿插进行，纯 L5 表现层，不碰契约）

**梯队一 ✅**
- [x] markdown 渲染（react-markdown + remark-gfm，已装依赖；代码块带复制按钮 + 轻量 prose 样式，不引 typography 插件）
- [x] 消息布局重做：左右气泡（IM 风）+ 每 agent 强调色（agentAccent 哈希色相）+ 圆形头像 + 时间戳 + 工具卡片美化 + 流式光标
- [x] 暗色模式切换（引 next-themes；ThemeProvider + ThemeToggle，globals.css 变量已现成）

**梯队二（进行中）**
- [x] 侧边栏重构为分区布局：品牌区（渐变 logo + 中文副标题「多智能体协作工作台」+ 设置按钮占位）/ 主导航区（对话·智能体·模型·知识库·模型流量监控，选中态竖条高亮）/ 会话列表区（分区标题 + 新建）
  - store 新增 `activeView: 'chat' | 'agents' | 'models' | 'knowledge' | 'monitor'`，右侧主区按视图渲染；选中会话自动切回 chat 视图
  - 新增组件：`sidebar-nav.tsx`、`placeholder-view.tsx`
- [x] 智能体管理界面（`agents` 视图）：列表+详情双栏（仿 knowledge-panel），配置 prompt/模型/工具/知识库；补 `/api/agents/[id]` PUT/DELETE（内置禁删）+ `/api/tools`（工具多选）
- [ ] 设置面板（当前仅占位按钮，无行为）
- [ ] 手动脚手架 shadcn（保护 Tailwind4 CSS-first 样式，不跑 init）+ 替换手写 Dialog/Button/Input
- [ ] sidebar 会话项增强（会话图标/成员头像堆叠）+ 顶部栏（标题+成员+连接状态）
**梯队三（进行中）**：空状态插画、消息进入动画、滚动/流式细节
- [x] 流式渲染性能修复：SSE 逐字更新导致浏览器绘制饥饿（DOM 在更新但画面等流结束才一次性刷新）
  - rAF 合批：SSE 事件先入缓冲，每帧 flush 一次（app-shell.tsx + store 新增 `handleStreamEvents` 批量入口，逻辑抽为纯函数 `applyEvent`）
  - memo 化：抽出 `MessageRow` + `MarkdownContent` 加 `React.memo`，流式期间只重渲染变化的那条，历史消息不再全量重解析 markdown
- [x] 推理模型思考流：openai-compatible adapter 消费 `reasoning_content`（AdapterEvent 增 `thinking.*` 三件套 → runner 转 thinking part），前端「思考中…」进行时展开、结束自动折叠；thinking part 只流式展示不落库

### Phase 4: RAG 知识库系统

> 设计已定稿（2026-07-16 讨论）。以下为动手前的契约与决策，实施仍按子任务小步推进。

**核心决策（已确认）**
1. 检索 = 工具式 `rag_search`（LLM 决定何时查），非自动前置注入
2. Agent 绑定 KB：`agent.knowledgeBaseIds` 决定可查范围；安全边界在 runner 收口
3. Milvus 完整版（Docker），不用 Lite
4. 一个 KB = 一个 Milvus collection（隔离干净、删库简单）
5. 分块先做**固定分块**（fixed-size），其余策略留接口；size/overlap 动手时细聊

**检索安全模型（关键）**
- runner 把 `agent.knowledgeBaseIds` 注入 `ToolContext`，`rag_search` 只在这些库检索 —— LLM 无法越权（§5「LLM 输出不可信」）
- `rag_search(query, kbHint?)`：LLM 只能传自然语言 query + 可选 hint
- hint 匹配 = **档 1 关键词包含**（hint 与 KB name/description 子串匹配）；命中则缩小范围，匹配不到 fallback 查全部绑定库。不上 embedding 选库（过度设计）
- 多库查询：各库 top-k → 合并按相似度全局 top-k → 回灌。召回效果后续实测再调

**数据流**
```
写入侧：上传 → 文本提取 → 固定分块 → Embedding API → 写 Milvus collection
        （Document 落 SQLite；Chunk 落 SQLite 元数据 + vectorId）
读取侧：rag_search(query, kbHint?) → embedding(query) → hint 过滤绑定库
        → 各库 Milvus ANN top-k → 合并全局 top-k → tool_result 回灌 LLM
```

**新增实体（SQLite 元数据；向量存 Milvus）**
- `KnowledgeBase`：id / name / description / embeddingModel / collectionName / createdAt
- `Document`：id / knowledgeBaseId / filename / mimeType / status(pending|processing|ready|failed) / chunkCount / createdAt
- `Chunk`：id / documentId / knowledgeBaseId / content / chunkIndex / vectorId(Milvus 主键) / createdAt

**契约变更（改前逐一贴字段确认，§6.2）**
- `types.ts` + `schema.ts`：`AgentRecord.knowledgeBaseIds: string[]`（新增，默认 `[]`）
- `tools/types.ts`：`ToolContext` 加 `knowledgeBaseIds?: string[]`（runner 注入，加法扩展）
- 新增 3 实体的 schema 表 + `types.ts` Record 类型

**新增服务（L3，`src/server/rag/`）**
- `milvus-client.ts`：连接管理 + collection CRUD（建/删/查）
- `embedding-service.ts`：调 Embedding API（凭证走 §5.2 优先级：per-agent 暂不涉及 → app_settings → env）
- `chunking.ts`：固定分块（先一种，留策略接口）
- `ingestion-service.ts`：文本提取 → 分块 → embedding → 写 Milvus + SQLite
- `retrieval-service.ts`：query embedding → hint 过滤 → 多库检索 → 合并 top-k
- `builtin/rag-search.ts`：`ToolDef`，走现有 executor，产出 tool_result（前端无需改）

**子任务顺序（小步）** —— 全部完成（代码层，端到端验证待 Docker 起服务）
- [x] ① schema + types：3 实体 + `AgentRecord.knowledgeBaseIds` + `ToolContext` 扩展
- [x] ② Milvus 客户端封装（连接单例 + collection CRUD + 向量增删查，HNSW+COSINE）
- [x] ③ embedding-service（`embedText`/`embedBatch`/`probeDimension`，凭证走 app_settings>env）
- [x] ④ chunking 固定分块（size 500 / overlap 50 / 软切边界；纯函数已单测）
- [x] ⑤ ingestion pipeline（Tika 提取 → 分块 → 向量化 → 先 Milvus 后 SQLite 双写）
- [x] ⑥ retrieval-service + `rag_search`：两阶段（每库召回 20 → rerank 取 8，可降级）
- [x] ⑦ runner 注入 `knowledgeBaseIds` 到 ToolContext（安全边界闭环）
- [x] ⑧ 知识库管理 UI（侧边栏「知识库」导航项；建/删库 + 上传 + 状态 + 检索测试）+ API routes

**已定实现细节**
- 文本提取：Apache Tika Server（Docker，`latest-full` 全格式），Node 侧 fetch 调 REST，零 npm 依赖
- rerank：独立 API（Jina/Cohere 兼容格式，默认硅基流动 bge-reranker-v2-m3），未配置自动降级为向量分数排序
- 每 KB 一个 Milvus collection；维度建库时探测 embedding 模型确定；上传同步 ingestion（大文件异步化留后续）

**待端到端验证（需起 Docker：Milvus + Tika）**：建库/上传/检索全链路、rerank 实际召回效果、UI 交互

### Phase 5: 工具系统 + Workspace

> 分增量小步推进，每步先讨论方案再落地。工具注册表/rag_search 在 Phase 3/4 已就位。

**增量 1｜Workspace 沙箱 + fs 读写 ✅**
- [x] Workspace 沙箱：`tools/workspace.ts`，`data/workspaces/{conversationId}`，**不落 DB**（会话:沙箱 1:1，属性全可从 id 推导，YAGNI）
- [x] `resolveInWorkspace` 越界校验（`path.resolve`+`path.relative`，拒 `../`/绝对路径/盘符/UNC）+ node:test 单测
- [x] `fs_read`（256KB 上限截断）/ `fs_write`（覆盖写 + 自动建父目录）
- [x] `ToolContext.workspaceRoot`（加法扩展），runner 注入

**增量 2｜Artifact 产物系统 + 内联预览 ✅**
- [x] `artifacts` 表 + `ArtifactRecord`（type: web_app/code_file/document；content 存 DB 快照，非文件路径）
- [x] `create_artifact` 工具：落库返回 artifactId 标记；runner 识别后补插 `artifact_ref` part（§3.4 一等 part），`ToolContext.messageId` 供归属
- [x] `GET /api/artifacts/[id]` + 前端 `ArtifactCard`（组件内 fetch 不进 store）
- [x] web_app 走 iframe `sandbox="allow-scripts"`（不给 allow-same-origin，§5.1 铁律）；code/document 复用 `MarkdownContent`

> 待浏览器端验证：产物卡片渲染、iframe 预览效果、三类型分渲染、加载态。

**增量 3｜bash 工具（待做）**
- [ ] bash 工具：cwd 强制 workspace root + 命令白名单（§5.3），Windows shell 差异处理
- [ ] fs_write / bash 审批机制（human-in-the-loop：写前发 SSE 事件、暂停 tool-loop 等确认）——独立增量，同时覆盖 fs_write 与 bash

**已定关键决策**
- Workspace 不落 DB（增量 1）；Artifact 落 DB（元数据是真需求，与 workspace 相反）
- fs_write 审批推迟到增量 3，与 bash 一起做（沙箱约束已保证写不出边界，会话内影响可控）
- Artifact 来源用显式 `create_artifact` 工具（契合工具范式），非文件目录约定/文本解析（后者违 §3.4）

### Phase 6: 打磨 + 桌面版
- [x] 模型配置独立实体（`ModelConfig`）：抽离 Agent 内嵌的模型字段为独立实体，Agent 纯引用 `modelConfigId`；左侧「模型」栏 CRUD（列表+详情），Agent 只需下拉选择
  - 凭证解析改走 ModelConfig：`resolveCredentials(modelConfigId)` → 指定/默认/env 三级兜底（见 CLAUDE.md §5.2）
  - key 脱敏：所有面向前端的 API 经 `toModelConfigView` 只回 `hasApiKey`，明文绝不出服务端；PUT 留空视作不修改
- [ ] 全局 API Key 设置面板（app_settings 全局兜底，齿轮入口）
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
