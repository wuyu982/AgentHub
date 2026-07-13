# CLAUDE.md — AgentHub 项目 AI 协作主文档

> 这是 AgentHub 项目的「项目级 AI 协作约定」。任何 AI 协作工具（Claude Code、Cursor、Codex 等）在本项目工作时**必须**先读此文档，再开始任务。
>
> 本文档定**规则**（怎么做、不做什么），`plan.md` 定**路线图**（做什么、分几期）。

---

## 1. 项目背景

**AgentHub** 是一个多 Agent 协同 + RAG 知识增强的本地 AI 工作台。一句话定位：

> 以 IM 群聊范式组织 Agent 协作，内置 RAG 知识库让 Agent 能检索私有知识。

### 核心能力

- IM 范式的会话管理（单聊 / 群聊 / 多会话并行）
- 统一适配器层接入 OpenAI 兼容 / Anthropic / 自建 Agent
- Orchestrator 自动拆任务、@mention 路由、聚合结果
- RAG 知识库（Milvus 向量检索 + 文档 Ingestion Pipeline）
- 产物（代码、网页、文档）内联预览
- 每个会话独立 workspace，Agent 可读写文件、跑命令

### 运行形态

本地运行（`pnpm dev` / `pnpm start`），SQLite 文件数据库 + Milvus 向量库，不依赖任何托管服务。

---

## 2. 技术栈（已锁定）

| 层 | 选型 | 不选什么 / 为什么 |
|---|---|---|
| 前端框架 | Next.js 15+ App Router + React 19 | 不选 Pages Router |
| 语言 | TypeScript（strict 模式） | 不写 `any`，需要时用 `unknown` 再 narrow |
| 样式 | Tailwind CSS 4 + shadcn/ui | 不引入其他 UI 库；shadcn 复制组件到本地 |
| 状态 | Zustand + Immer middleware | 不用 Redux/Recoil/MobX |
| ORM | Drizzle | 不用 Prisma |
| DB | SQLite（`@libsql/client` 驱动） | 不引入 Postgres/MySQL |
| 向量DB | Milvus（开发用 Milvus Lite / Docker） | RAG 知识库向量存储 |
| 流式传输 | SSE（单连接） | 不用 WebSocket |
| AI SDK | `openai`（OpenAI 兼容协议）+ `@anthropic-ai/sdk` | 通过适配器层屏蔽差异 |
| 包管理 | pnpm | 不用 npm/yarn（lockfile 唯一） |

---

## 3. 架构核心原则

### 3.1 五层分层（不要跨层调用）

```
L5  UI 组件层           src/components/**
L4  State + Transport   src/stores/** + SSE 客户端
L3  Application Services  src/server/**（AgentRunner / RAGService / EventBus / ToolExecutor）
L2  Platform Adapters   src/server/adapters/**（OpenAICompatible / Anthropic / Mock）
L1  Persistence         src/db/** + Milvus client + workspace 文件系统
```

**铁律**：
- UI **永远不**直接调 LLM SDK，必须经过 L3
- Adapter **永远不**写 DB，它只负责事件流翻译
- 工具执行（ToolExecutor）属 L3，不是 Adapter 的事

### 3.2 核心实体

`Agent` / `Conversation` / `Message` / `KnowledgeBase` / `Document` / `Chunk` / `Artifact` / `Workspace` / `AgentRun`

修改任一实体的字段时，**必须同步更新 `src/shared/types.ts`**。

### 3.3 统一流式事件

整个系统通过一套 `StreamEvent` 类型粘合：
- L2 Adapter 产生事件
- L3 服务层路由 + 持久化
- L4 SSE 推到前端
- L5 store reducer 应用

**新增 Adapter 或 UI 组件时，事件协议是契约，不可绕开**。

### 3.4 Message = parts 数组，不是字符串

```typescript
message.parts = [
  { type: 'thinking', content: '...' },
  { type: 'tool_use', ... },
  { type: 'text', content: '...' },
  { type: 'artifact_ref', artifactId: '...' },
]
```

**不要**把多种内容塞进一个 markdown 字符串再用正则解析。

### 3.5 Orchestrator 是特殊 Agent，不是独立服务

Orchestrator 走同一个 `AgentRunner`，只是多了 `dispatch_to_agent` 工具与不同的 system prompt。**不要**为它写独立服务路径。

---

## 4. 代码风格

### 4.1 文件 / 目录命名

- 文件名：`kebab-case.ts`（如 `agent-runner.ts`）
- React 组件文件：`kebab-case.tsx`（如 `chat-panel.tsx`）
- 测试文件：`*.test.ts` 与被测文件同目录
- 不创建 `index.ts` barrel 文件（除非是 shadcn 风格的 `components/ui/`）

### 4.2 命名约定

| 类型 | 风格 | 例 |
|---|---|---|
| 类型 / 接口 | PascalCase | `Conversation`, `StreamEvent` |
| 变量 / 函数 | camelCase | `agentRunner`, `applyEvent` |
| 常量 | UPPER_SNAKE | `MAX_TOKENS`, `HEARTBEAT_INTERVAL` |
| 枚举值（字面量联合） | snake_case 字符串 | `'tool_use'`, `'web_app'` |
| DB 列名 | snake_case | `created_at`, `agent_id` |
| URL 路径 | kebab-case | `/api/conversations/[id]/messages` |

### 4.3 不要做

- ❌ 不写 `// TODO` 不跟进。要么删，要么开 task
- ❌ 不留废代码 / 注释掉的代码块
- ❌ 不为「将来可能用到」加抽象。三处重复才提抽象
- ❌ 不在业务代码里 `console.log`（用专门的 logger，或临时调试用完即删）
- ❌ 不写多段 docstring。每个函数最多 1 行注释，且只解释 **why**
- ❌ 不引入新依赖而不在 commit 中说明理由

### 4.4 必须做

- ✅ 异常要有上下文（不要 `throw new Error('failed')`，写清楚是什么 failed）
- ✅ 跨进程边界的输入（API body、LLM 输出）必须 zod 验证
- ✅ 所有 LLM 调用 **必须**带 AbortSignal（支持中止）
- ✅ 涉及文件系统的工具必须经过 Workspace 沙箱

---

## 5. 安全与沙箱

### 5.1 LLM 输出永远是不可信输入

- LLM 生成的 HTML/JS 在 iframe 渲染时必须 `sandbox="allow-scripts"`（不给 `allow-same-origin`）
- LLM 生成的 SQL / shell 命令必须经过白名单或参数化

### 5.2 API Key 管理

优先级：
1. **per-agent `apiKey`** — Agent 维度单独配置（最高优先级）
2. **`app_settings`** — 用户在设置面板全局填写，存 SQLite
3. **`process.env`** — `.env.local` 兜底

约束：
- **绝不**在代码中硬编码 key
- 缺失 key 时，由 adapter 抛错（不要在启动时拒绝服务）

### 5.3 Workspace 沙箱

所有 `fs_read` / `fs_write` / `bash` 工具调用：
- 路径必须解析后落在 workspace 子树内
- bash 的 cwd 强制为 workspace root

---

## 6. AI 协作规则（核心）

### 6.1 三种工作模式

| 模式 | 何时进入 | 行为 |
|---|---|---|
| **Plan 驱动** | 接到「实现 X」类需求 | 先读 `plan.md` 确认当前阶段，按 phase 顺序推进 |
| **修复驱动** | 接到「修 bug」类需求 | 先定位根因（不是症状），写修复前说明根因 |
| **探索驱动** | 接到「研究 / 设计 X」类需求 | 不写实现代码，输出设计文档 / 更新 plan |

### 6.2 必须停下来问的情形

不要自作主张。遇到以下情形必须停下来问人：

- 需要新增依赖
- 需要修改 `src/shared/types.ts` 里已经定义的接口
- 需要删除 / 重命名已经被多处引用的符号
- 需要修改安全约束
- 看不懂为什么这段代码这么写（先问，不要重构）
- 用户的请求和 plan 冲突

### 6.3 不要做的事

- ❌ 修代码顺手做不相关的「优化」 / 「整理」（每次一件事）
- ❌ 删除看起来「没用」的代码而不验证有没有外部引用
- ❌ 改 `.env.example` 而不通知
- ❌ 引入新的 LLM SDK / 工具 / 框架而不更新本文档
- ❌ 把多个不相关功能的修改混在一起

### 6.4 输出代码时

- **小步**：每次只解决一个 phase / 一个 task。一次 100 行内能解决就别写 500 行
- **可解释**：每段非平凡逻辑能口头讲清楚为什么这么写
- **可测试**：纯函数能单元测，副作用集中在边界
- **遵守现有模式**：别人怎么写的，你也怎么写。不要"我觉得换一种更好"

### 6.5 完成任务的自检清单

提交前自检：

- [ ] `pnpm typecheck` 通过
- [ ] 涉及 types.ts 的修改已同步更新
- [ ] 新增的工具 / 适配器 / 实体在 CLAUDE.md 中能找到对应章节
- [ ] 没有遗留的 `console.log` / `TODO` / 注释代码
- [ ] 涉及流式事件的修改，没破坏现有事件契约
- [ ] 涉及 DB schema 的修改，已运行 `pnpm db:push`

---

## 7. 提交规范

### 7.1 Commit 格式

```
<type>(<scope>): <subject>

<body, 可选>
```

`type` ∈ `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
`scope` 用层名或模块名：`adapter`, `rag`, `ui`, `db`, `store` 等

例：
- `feat(adapter): add OpenAI compatible adapter`
- `fix(store): correct streaming message status update`
- `feat(rag): implement document ingestion pipeline`

### 7.2 一个 commit 一件事

- 不要把多个不相关功能混在一个 commit
- 大功能拆成逻辑完整的小 commit

---

## 8. 常用命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm typecheck    # TypeScript 类型检查
pnpm lint         # ESLint 检查
pnpm db:push      # 推送 schema 变更到 SQLite
pnpm db:generate  # 生成 migration 文件
pnpm db:studio    # 打开 Drizzle Studio（数据库可视化）
pnpm db:seed      # 执行数据库 seed
```

---

## 9. 目录结构

```
AgentHub/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── stream/         # SSE endpoint
│   │   │   ├── conversations/  # 会话 CRUD + 消息
│   │   │   ├── agents/         # Agent CRUD
│   │   │   ├── knowledge/      # 知识库管理（Phase 4）
│   │   │   └── settings/       # 全局设置
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/             # React UI 组件
│   │   ├── ui/                 # shadcn 基础组件
│   │   ├── chat/               # 聊天相关
│   │   ├── knowledge/          # 知识库管理界面
│   │   └── layout/             # 布局组件
│   ├── stores/                 # Zustand stores
│   ├── server/                 # 服务层（L3）
│   │   ├── adapters/           # LLM 适配器（L2）
│   │   ├── tools/              # 工具系统
│   │   ├── rag/                # RAG 相关服务
│   │   ├── agent-runner.ts
│   │   └── event-bus.ts
│   ├── db/                     # 持久化（L1）
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── seed.ts
│   ├── lib/                    # 工具函数
│   └── shared/                 # 跨层共享类型
│       ├── types.ts
│       └── constants.ts
├── data/                       # SQLite 数据文件（gitignore）
├── .env.example
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── pnpm-workspace.yaml
```

---

## 10. 文档维护

- types.ts 与代码冲突时，**以 types.ts 为准**，先改代码适配
- 修改架构原则（§3）或安全约束（§5）必须经过讨论
- 本文档不堆砌历史决策记录，过时内容直接删除
