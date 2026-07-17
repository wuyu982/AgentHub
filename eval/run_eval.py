"""
RAG 检索质量评测（旁挂，独立于主项目）——用 Ragas 算 context precision / recall。

流程：读评测集 jsonl → 逐条调 AgentHub 的 search API 拿检索片段 →
组装 Ragas 数据集 → LLM 评判 → 输出指标表。对齐 metrics.md 维度②。

前置：
  1. 主项目已 `pnpm dev`（默认 http://localhost:3000）
  2. 评测集 rag-eval-set.jsonl 里 kbId 已替换为真实知识库 id
  3. .env.local 有 OPENAI_API_KEY / OPENAI_BASE_URL / DEFAULT_MODEL（作评判 LLM）

运行：python run_eval.py
"""
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# 从主项目 .env.local 读评判 LLM 凭证（复用对话 LLM，不额外配）
load_dotenv(Path(__file__).parent.parent / ".env.local")

APP_BASE = os.getenv("AGENTHUB_BASE_URL", "http://localhost:3000")
EVAL_SET = Path(__file__).parent / "rag-eval-set.jsonl"


def load_eval_set():
    rows = []
    with open(EVAL_SET, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def search(kb_id: str, query: str, kb_hint: str | None = None):
    """调 AgentHub 检索 API，返回命中片段的 content 列表。"""
    body = {"query": query}
    if kb_hint:
        body["kbHint"] = kb_hint
    resp = requests.post(f"{APP_BASE}/api/knowledge/{kb_id}/search", json=body, timeout=60)
    resp.raise_for_status()
    return [h["content"] for h in resp.json().get("hits", [])]


def build_evaluator_llm():
    """评判 LLM：指向项目同款 OpenAI 兼容端点。"""
    from langchain_openai import ChatOpenAI
    from ragas.llms import LangchainLLMWrapper

    llm = ChatOpenAI(
        model=os.getenv("DEFAULT_MODEL", "deepseek-chat"),
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
        temperature=0,
    )
    return LangchainLLMWrapper(llm)


def main():
    rows = load_eval_set()
    if any(r.get("kbId", "").startswith("REPLACE_WITH") for r in rows):
        print("⚠️  评测集里还有占位 kbId，请先把 rag-eval-set.jsonl 的 kbId 换成真实知识库 id。")
        sys.exit(1)

    from ragas import evaluate
    from ragas.dataset_schema import EvaluationDataset, SingleTurnSample
    from ragas.metrics import LLMContextPrecisionWithReference, LLMContextRecall

    evaluator_llm = build_evaluator_llm()

    samples = []
    for r in rows:
        contexts = search(r["kbId"], r["query"], r.get("kbHint"))
        samples.append(
            SingleTurnSample(
                user_input=r["query"],
                retrieved_contexts=contexts,
                reference=r["reference"],
                reference_contexts=r.get("ground_truth_contexts"),
            )
        )
        print(f"  ✓ 检索完成：{r['query'][:30]}… （命中 {len(contexts)} 片段）")

    dataset = EvaluationDataset(samples=samples)
    result = evaluate(
        dataset=dataset,
        metrics=[
            LLMContextPrecisionWithReference(llm=evaluator_llm),
            LLMContextRecall(llm=evaluator_llm),
        ],
    )

    print("\n=== RAG 检索质量评测结果 ===")
    print(result)
    print("\n把这些数字填进 metrics.md 维度② 的实测记录表。")


if __name__ == "__main__":
    main()
