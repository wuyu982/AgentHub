# metrics.md — AgentHub 量化指标作战地图

> 本文档列出 AgentHub 项目所有**可量化、可优化、可写进简历**的指标。
> 用法：从上到下一项一项推进，每项走「埋点 → 测 baseline → 优化 → 再测 → 记录数字」五步。
> 每测完一项，把结果填进该项的「实测记录」表，简历话术就地生成。

---

## 0. 怎么判断一个指标值不值得测

> **能写进简历的指标 = 指标本身 + 你的优化动作 + 前后对比数字。**
>
> 例：❌「系统支持 RAG」 → ✅「引入 rerank + chunk 调优，Recall@5 从 68% 提升到 89%」

挑指标的三条标准：
1. **能被你的动作影响**（不是纯硬件/网络决定的）
2. **有明确的优化手段**（改完能看到数字动）
3. **前后可对比**（baseline → 优化后）

---

## 前置设施（两项，做完才能大规模测）

### P1. Langfuse 自托管可观测性 —— 维度①③④都依赖

**决策**：不手写埋点表，改集成 **Langfuse（自托管）**。业界标准工具，Docker 自托管符合「不依赖托管服务」，TTFT/延迟/调用树开箱即用，简历含金量高于手搓。

**落点**（已完成基建）：
- ✅ 装依赖：`@langfuse/tracing` `@langfuse/otel` `@opentelemetry/{api,sdk-node}`（v5，OTEL 架构）
- ✅ `src/server/tracing/langfuse.ts` —— OTel SDK 初始化，未配 key 则全程 no-op
- ✅ `src/server/tracing/span.ts` —— `withSpan(name, asType, fn)` 安全封装，未启用时零成本透传
- ✅ `.env.example` 加 `LANGFUSE_PUBLIC_KEY / SECRET_KEY / BASE_URL`
- ⏳ Docker 起 Langfuse 栈（需手动启动 Docker Desktop）
- ⏳ 在 agent-runner / retrieval 埋 span

**架构约束**：tracing 只在 L3，不碰 L2 adapter（守「adapter 只做事件翻译」铁律）。

**简历点**："集成 Langfuse 自托管可观测性，基于 OpenTelemetry 建立 LLM 全链路 tracing 与延迟分解"

- [x] 装 SDK + 封装基建  - [ ] Docker 起栈  - [ ] 业务埋点

### P2. RAG 评测集 + Ragas 旁挂 —— 维度②的命脉

**决策**：用 **Ragas**（Python，独立 `eval/` 目录旁挂，不进 pnpm）算 context precision/recall，不自己实现指标。

**落点**（已完成骨架）：
- ✅ `eval/requirements.txt` —— ragas / langchain-openai / requests
- ✅ `eval/rag-eval-set.jsonl` —— 评测集模板（含 2 条样例，待填真实 query）
- ✅ `eval/run_eval.py` —— 跑批：调 search API 拿检索片段 → Ragas 评判 → 输出指标
- ✅ `eval/README.md` —— 建 venv、填评测集、rerank 前后对比步骤
- ⏳ 填真实评测集（20-30 条，需人工标注 reference + ground_truth_contexts）
- ⏳ 跑首轮 baseline

**简历点**："用 Ragas 构建 RAG 检索评测流水线，量化 context precision/recall"

- [x] Ragas 旁挂骨架  - [ ] 填评测集  - [ ] 跑 baseline

---

## 维度① 流式对话性能

> 最容易测、优化手段最清晰、数字最直观。建议第一个做。

### 1.1 TTFT 首字节延迟（Time To First Token）⭐

| 项 | 内容 |
|---|---|
| **定义** | 用户消息发出 → 收到第一个 `text.delta` 的毫秒数 |
| **埋点** | `adapters/openai-compatible.ts:99` 第一个 `delta.content` 到达点；起点在 `agent-runner.ts:127` 进入 `adapter.run` 前记 t0 |
| **测法** | 固定 prompt + 固定 model，跑 20 次取 P50/P90/P95 |
| **优化手段** | ① OpenAI client 复用（现在每次 `new OpenAI`，见 :78）② baseURL 就近 ③ 首包前不做无谓 await ④ 连接预热 |
| **目标** | P50 < 800ms（视 model/网络） |
| **简历话术** | "定位到每次请求重建 HTTP client 是首字节延迟主因，改为连接复用后 TTFT P90 从 ___ms 降到 ___ms" |

**实测记录**

| 阶段 | P50 | P90 | P95 | 优化动作 |
|---|---|---|---|---|
| baseline | | | | — |
| 优化后 | | | | |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 1.2 吞吐 tokens/s（生成速率）

| 项 | 内容 |
|---|---|
| **定义** | (总输出 token 数) / (首 token → done 的秒数) |
| **埋点** | `openai-compatible.ts:93` 循环内累加 delta 长度；`done`(:132) 记结束时间 |
| **测法** | 生成一段长文本（>500 token），算平均速率 |
| **优化手段** | 主要受 model 端限制，你能动的是「不阻塞事件循环」——确认 SSE 推送不卡顿 |
| **目标** | 接近 model 理论速率，无客户端瓶颈 |
| **简历话术** | "端到端流式管线零额外缓冲，客户端不成为吞吐瓶颈" |

**实测记录**：baseline ___ tok/s → 优化后 ___ tok/s

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 1.3 端到端延迟 & 中止响应延迟

| 项 | 内容 |
|---|---|
| **定义** | E2E：发消息→run.end；中止延迟：点停止→流真正停下的 ms |
| **埋点** | E2E 用 `run.start`(:64) 到 `run.end`(:267) 的时间差；中止用 `controller.abort()` 到 `signal.aborted` 生效(:94) |
| **测法** | 中止：生成中途 abort，测多久停 |
| **优化手段** | AbortSignal 是否层层透传（adapter/tool/rerank 都收 signal）——代码里已透传，验证有效性 |
| **目标** | 中止响应 < 200ms |
| **简历话术** | "全链路 AbortSignal 透传（LLM/工具/rerank），用户中止响应 < 200ms，避免 token 浪费" |

**实测记录**：中止延迟 baseline ___ms → 优化后 ___ms

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

## 维度② RAG 检索质量 ⭐⭐（简历故事性最强）

> 依赖前置 P2 评测集。能做一连串对比，每步都有数字，面试官最认。

### 2.1 Recall@k（召回率）

| 项 | 内容 |
|---|---|
| **定义** | top-k 结果中命中的 golden chunk 占全部 golden 的比例，k 取 5/8 |
| **埋点** | `retrieval-service.ts:42 retrieve()` 返回值 vs 评测集 goldenChunkIds |
| **测法** | 跑批脚本遍历评测集，逐条算命中，求均值 |
| **优化手段** | ① chunk size / overlap（`rag/chunking.ts`）② `RECALL_PER_KB`(:16 现 20) ③ embedding model ④ 是否开 rerank |
| **目标** | Recall@5 > 85% |
| **简历话术** | "构建 30 条标注评测集量化检索质量，通过 chunk 策略调优使 Recall@5 从 ___% 提升到 ___%" |

**实测记录**

| 配置 | Recall@5 | Recall@8 | 说明 |
|---|---|---|---|
| baseline（向量分数排序） | | | 不开 rerank |
| + rerank | | | |
| + chunk 调优 | | | size=___ overlap=___ |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 2.2 rerank 前后对比 ⭐（最亮的单点）

| 项 | 内容 |
|---|---|
| **定义** | 同一评测集，关 rerank vs 开 rerank 的 Recall/MRR 差值 |
| **埋点** | `retrieval-service.ts:78` 的 `isRerankAvailable()` 分支就是天然 A/B 开关 |
| **测法** | 跑两遍评测集（一遍强制走 :87 降级路径，一遍走 :80 rerank），对比 |
| **优化手段** | 换 rerank model、调 `FINAL_TOP_K`(:17 现 8) |
| **目标** | rerank 带来 Recall/MRR 明显正提升 |
| **简历话术** | "引入 rerank 两阶段精排（召回 20/库 → 精排 top-8），MRR 从 ___ 提升到 ___" |

**实测记录**：无 rerank Recall@5 ___% / MRR ___ → 有 rerank ___% / ___

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 2.3 MRR / Precision@k

| 项 | 内容 |
|---|---|
| **定义** | MRR：第一个命中的排名倒数均值（衡量「对的排得靠前吗」）；Precision@k：top-k 里相关的占比 |
| **埋点** | 同 2.1，评测脚本里加算 |
| **测法** | 跑批时一并输出 |
| **优化手段** | 同 2.1/2.2 |
| **目标** | MRR > 0.7 |
| **简历话术** | 与 2.1/2.2 合并讲 |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

## 维度③ RAG 入库/检索性能

### 3.1 检索分段延迟（embed / search / rerank）

| 项 | 内容 |
|---|---|
| **定义** | 一次 `retrieve()` 中三段各自耗时 |
| **埋点** | `retrieval-service.ts`：embed(:51)、search(:54-59)、rerank(:80) 各包 `recordSpan` |
| **测法** | 跑评测集时顺带采集，看瓶颈在哪段 |
| **优化手段** | ① 多库召回已并发(:54 Promise.all) ② embedding 是否可缓存 query ③ SQLite 回捞(:65) 是否走 index |
| **目标** | 找出并压缩最慢段 |
| **简历话术** | "对检索链路做延迟分解，定位 ___ 为瓶颈（占 ___%），优化后单次检索 P90 从 ___ms 降到 ___ms" |

**实测记录**

| 段 | 耗时 ms | 占比 |
|---|---|---|
| embed | | |
| search | | |
| sqlite 回捞 | | |
| rerank | | |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 3.2 Ingestion 吞吐（chunk/s）

| 项 | 内容 |
|---|---|
| **定义** | 灌一个文档：(chunk 数) / (总耗时秒) |
| **埋点** | `rag/ingestion-service.ts` 全流程计时（extract→chunk→embed→写 Milvus+SQLite） |
| **测法** | 灌一个固定大文档（如 100 页 PDF），测总耗时 |
| **优化手段** | ① embedding 批量并发（最大杠杆）② 写库批量化 |
| **目标** | 批量并发相比串行明显提速 |
| **简历话术** | "将 embedding 由串行改为批量并发，文档入库吞吐提升 ___×" |

**实测记录**：串行 ___ chunk/s → 并发 ___ chunk/s（___× 提速）

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

## 维度④ 多 Agent 编排（项目最独特的部分）

### 4.1 @mention / AI 意图路由准确率

| 项 | 内容 |
|---|---|
| **定义** | 无 @ 时 `routeToAgent` 选中的 agent == 人工期望 agent 的比例 |
| **埋点** | `agent-router.ts:16 routeToAgent` 返回值 vs 标注期望 |
| **测法** | 标注一批 `{消息, 期望agentId}`（20-30 条），跑批算准确率 |
| **优化手段** | ① 优化 `ROUTER_SYSTEM_PROMPT`(:11) ② roster 里 description 写清职责 ③ 兜底策略(:46 现返回第一个) |
| **目标** | 准确率 > 90% |
| **简历话术** | "标注 30 条群聊消息评测 AI 路由，通过 prompt + 职责描述优化，路由准确率从 ___% 提升到 ___%" |

**实测记录**：baseline ___% → 优化后 ___%

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 4.2 并发 vs 串行加速比

| 项 | 内容 |
|---|---|
| **定义** | 多 agent 同时被 @ 时，并发执行相比串行的墙钟加速比 |
| **埋点** | 多 `runAgent` 调用的调度处（消息 API / stream 路由），记总墙钟时间 |
| **测法** | 同一批 N 个 agent，测串行总时 vs 并发总时 |
| **优化手段** | 确认多 agent 走 `Promise.all` 而非 for-await 串行 |
| **目标** | N-agent 并发接近 N× 上限（受最慢 agent 限制） |
| **简历话术** | "群聊多 Agent 并发调度，4-agent 场景相比串行加速 ___×" |

**实测记录**：串行 ___s → 并发 ___s（___× 加速）

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

### 4.3 工具调用循环收敛率

| 项 | 内容 |
|---|---|
| **定义** | agent 在 `MAX_TOOL_ROUNDS`(agent-runner.ts:15 现 8) 内正常收敛（非撞上限）的比例；及平均轮数 |
| **埋点** | `agent-runner.ts:123` loop 记实际 round 数、是否撞 :123 上限 |
| **测法** | 跑一批带工具的任务，统计 |
| **优化手段** | prompt 引导减少无谓工具调用；上限调参 |
| **目标** | 收敛率 > 95%，平均轮数低 |
| **简历话术** | "agentic tool-loop 平均 ___ 轮收敛，撞上限率 < ___%，无死循环烧 token" |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

## 维度⑤ 系统健壮性（可选，锦上添花）

### 5.1 SSE 断线恢复

| 项 | 内容 |
|---|---|
| **定义** | 断开 SSE 连接到前端自动重连恢复的时间 |
| **埋点** | `app/api/stream/route.ts` + 前端 SSE 客户端 |
| **测法** | 手动断网/杀连接，测恢复时间 |
| **优化手段** | 重连退避、断点续传（lastEventId） |
| **目标** | 恢复 < 1s |
| **简历话术** | "SSE 断连自动重连，恢复时间 < 1s，流式消息不丢" |

- [ ] baseline  - [ ] 优化  - [ ] 记录

---

## 推进顺序建议

| 顺序 | 做什么 | 依赖 | 产出的简历句 |
|---|---|---|---|
| 1 | **P1 埋点层** | — | 可观测性基建 |
| 2 | **1.1 TTFT** | P1 | 首字节延迟优化（最快见数字） |
| 3 | **P2 评测集** | — | 评测集建设 |
| 4 | **2.1 + 2.2 Recall/rerank** | P2 | RAG 质量优化（最亮） |
| 5 | **3.1 检索延迟分解** | P1+P2 | 性能瓶颈定位 |
| 6 | **4.1 路由准确率** | — | 多 Agent 路由 |
| 7 | 其余按需 | | |

---

## 简历成品预览（填完数字后长这样）

> **AgentHub · 多 Agent 协同 + RAG 本地工作台**（个人项目）
> - 自建 LLM 调用可观测性埋点层，通过 HTTP 连接复用将流式首字节延迟 P90 从 __ms 降至 __ms
> - 构建 30 条标注评测集量化 RAG 检索质量，引入两阶段 rerank 精排使 Recall@5 从 __% 提升至 __%、MRR 从 __ 提升至 __
> - 对检索链路做延迟分解定位瓶颈，将文档入库 embedding 由串行改批量并发，吞吐提升 __×
> - 实现群聊多 Agent 并发调度与 AI 意图路由，4-agent 并发相比串行加速 __×，路由准确率 __%
> - 全链路 AbortSignal 透传，用户中止响应 < 200ms
