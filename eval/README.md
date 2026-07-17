# eval/ — RAG 检索质量评测（Ragas 旁挂）

独立于主项目的 Python 评测工具，用 [Ragas](https://docs.ragas.io) 量化 RAG 检索质量（对齐根目录 `metrics.md` 维度②）。**不进 pnpm 依赖**，用自己的 Python venv。

## 为什么旁挂

Ragas 是 Python 生态的 RAG 评测事实标准，内置 context precision/recall、faithfulness 等指标，无需自己实现。评测本就是离线的、与主服务解耦的，故独立成目录。

## 一次性准备

```bash
cd eval
python -m venv .venv
.venv/Scripts/activate        # Windows；macOS/Linux 用 source .venv/bin/activate
pip install -r requirements.txt
```

## 每次评测

1. 主项目先跑起来：根目录 `pnpm dev`
2. 建一个知识库、灌几个文档，拿到它的 `kbId`（知识库详情页或 DB 里查）
3. 编辑 `rag-eval-set.jsonl`：
   - 把 `kbId` 换成真实 id
   - 每行一个 query，写清 `reference`（标准答案）和 `ground_truth_contexts`（该问题应命中的原文片段）
   - 先做 20-30 条，覆盖你灌进去的真实知识
4. 跑评测：
   ```bash
   .venv/Scripts/activate
   python run_eval.py
   ```
5. 把输出的 context_precision / context_recall 填进 `metrics.md` 维度② 实测记录表

## 做 rerank 前后对比（维度 2.2）

- **关 rerank**：在主项目设置面板清空 rerank key（或 `.env.local` 留空 `RERANK_API_KEY`），跑一次
- **开 rerank**：填上 rerank key，重启 `pnpm dev`，再跑一次
- 两次结果对比 = 简历里「引入 rerank 使 Recall 从 X 提升到 Y」的数字来源

## 评判 LLM

Ragas 的 LLM 指标需要一个评判模型。脚本复用主项目 `.env.local` 里的 `OPENAI_API_KEY / OPENAI_BASE_URL / DEFAULT_MODEL`，不用额外配置。
