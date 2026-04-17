#!/usr/bin/env python3
"""
genshijin ベンチマーク
通常応答 vs caveman vs genshijin モード応答のトークン使用量を比較する。

使い方:
  pip install -r requirements.txt
  export ANTHROPIC_API_KEY=sk-ant-...
  python run.py [--trials 3] [--model claude-sonnet-4-20250514] [--update-readme]

  # extended thinking実験（思考モデル必須: sonnet-4-5以降 or opus-4-x）
  python run.py --model claude-sonnet-4-5-20250929 --thinking 2000 --trials 2
"""

import argparse
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from anthropic import Anthropic, RateLimitError

SCRIPT_DIR = Path(__file__).parent
PROMPTS_FILE_JA = SCRIPT_DIR / "prompts.json"
PROMPTS_FILE_EN = SCRIPT_DIR / "prompts_en.json"
SKILL_FILE = SCRIPT_DIR.parent / "skills" / "genshijin" / "SKILL.md"
CAVEMAN_SKILL_FILE = SCRIPT_DIR / "caveman_skill.md"
RESULTS_DIR = SCRIPT_DIR / "results"
README_FILE = SCRIPT_DIR.parent / "README.md"
DOCS_DIR = SCRIPT_DIR.parent / "docs"

NORMAL_SYSTEM_JA = "あなたは親切で丁寧なソフトウェアエンジニアリングアシスタントです。日本語で回答してください。"
NORMAL_SYSTEM_EN = "You are a helpful and thorough software engineering assistant. Respond in English."
CAVEMAN_SUFFIX_JA = "\n\n日本語で回答してください。"


def load_skill(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    # frontmatter を除去
    if text.startswith("---"):
        end = text.index("---", 3)
        text = text[end + 3 :].strip()
    return text


API_CALL_INTERVAL = 3  # リクエスト間の待機秒数
MAX_RETRIES = 5


def api_call_with_retry(client, **kwargs):
    """Rate limit対応のリトライ付きAPI呼び出し。"""
    for attempt in range(MAX_RETRIES):
        try:
            return client.messages.create(**kwargs)
        except RateLimitError:
            wait = 2 ** attempt * 10  # 10, 20, 40, 80, 160秒
            print(f"\n    Rate limit hit, waiting {wait}s...", end=" ", flush=True)
            time.sleep(wait)
    return client.messages.create(**kwargs)


def extract_blocks(response) -> tuple[str, str]:
    """レスポンスから thinking部分 と 最終text部分 を分離抽出。"""
    thinking_parts = []
    text_parts = []
    for block in response.content:
        if block.type == "thinking":
            thinking_parts.append(block.thinking)
        elif block.type == "text":
            text_parts.append(block.text)
    return "\n".join(thinking_parts), "\n".join(text_parts)


def split_tokens(total_tokens: int, thinking_text: str, answer_text: str) -> tuple[int, int]:
    """output_tokens を 文字数比で thinking / text に按分。
    Claudeは正確な個別トークン数を返さないため、char比率で近似。"""
    t_chars = len(thinking_text)
    a_chars = len(answer_text)
    total_chars = t_chars + a_chars
    if total_chars == 0:
        return 0, total_tokens
    thinking_tokens = round(total_tokens * t_chars / total_chars)
    text_tokens = total_tokens - thinking_tokens
    return thinking_tokens, text_tokens


def call_mode(client, model, system, prompt, max_tokens, thinking_budget):
    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
    }
    if thinking_budget:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
    return api_call_with_retry(client, **kwargs)


def run_benchmark(
    client: Anthropic,
    model: str,
    prompts: list[dict],
    trials: int,
    lang: str = "ja",
    thinking_budget: int = 0,
) -> list[dict]:
    genshijin_text = load_skill(SKILL_FILE)
    caveman_text = load_skill(CAVEMAN_SKILL_FILE)
    if lang == "ja":
        normal_system = NORMAL_SYSTEM_JA
        caveman_text += CAVEMAN_SUFFIX_JA
    else:
        normal_system = NORMAL_SYSTEM_EN
    results = []

    # thinking有効時はmax_tokens >= budget+出力余裕 必要
    max_tokens = max(4096, thinking_budget + 4096) if thinking_budget else 4096

    for prompt_data in prompts:
        prompt_id = prompt_data["id"]
        category = prompt_data["category"]
        prompt = prompt_data["prompt"]

        normal_tokens = []
        caveman_tokens = []
        genshijin_tokens = []
        normal_texts = []
        caveman_texts = []
        genshijin_texts = []
        normal_thinking = []
        caveman_thinking = []
        genshijin_thinking = []
        normal_split = []  # [(thinking_tokens, text_tokens), ...]
        caveman_split = []
        genshijin_split = []

        for trial in range(trials):
            print(
                f"  [{trial + 1}/{trials}] {prompt_id}...",
                end=" ",
                flush=True,
            )

            # 通常応答
            resp_normal = call_mode(client, model, normal_system, prompt, max_tokens, thinking_budget)
            n_tokens = resp_normal.usage.output_tokens
            n_think, n_text = extract_blocks(resp_normal)
            normal_tokens.append(n_tokens)
            normal_texts.append(n_text)
            normal_thinking.append(n_think)
            normal_split.append(split_tokens(n_tokens, n_think, n_text))

            time.sleep(API_CALL_INTERVAL)

            # caveman応答
            resp_caveman = call_mode(client, model, caveman_text, prompt, max_tokens, thinking_budget)
            cv_tokens = resp_caveman.usage.output_tokens
            cv_think, cv_text = extract_blocks(resp_caveman)
            caveman_tokens.append(cv_tokens)
            caveman_texts.append(cv_text)
            caveman_thinking.append(cv_think)
            caveman_split.append(split_tokens(cv_tokens, cv_think, cv_text))

            time.sleep(API_CALL_INTERVAL)

            # genshijin応答
            resp_genshijin = call_mode(client, model, genshijin_text, prompt, max_tokens, thinking_budget)
            g_tokens = resp_genshijin.usage.output_tokens
            g_think, g_text = extract_blocks(resp_genshijin)
            genshijin_tokens.append(g_tokens)
            genshijin_texts.append(g_text)
            genshijin_thinking.append(g_think)
            genshijin_split.append(split_tokens(g_tokens, g_think, g_text))

            print(f"通常={n_tokens} caveman={cv_tokens} genshijin={g_tokens}")

        median_normal = int(statistics.median(normal_tokens))
        median_caveman = int(statistics.median(caveman_tokens))
        median_genshijin = int(statistics.median(genshijin_tokens))
        saved_caveman_pct = round((1 - median_caveman / median_normal) * 100)
        saved_genshijin_pct = round((1 - median_genshijin / median_normal) * 100)
        # genshijin vs caveman の改善率
        vs_caveman_pct = round((1 - median_genshijin / median_caveman) * 100) if median_caveman > 0 else 0

        # thinking/text 個別の中央値
        def med_split(splits, idx):
            return int(statistics.median([s[idx] for s in splits])) if splits else 0

        results.append(
            {
                "id": prompt_id,
                "category": category,
                "prompt": prompt,
                "normal_tokens": normal_tokens,
                "caveman_tokens": caveman_tokens,
                "genshijin_tokens": genshijin_tokens,
                "normal_texts": normal_texts,
                "caveman_texts": caveman_texts,
                "genshijin_texts": genshijin_texts,
                "normal_thinking": normal_thinking,
                "caveman_thinking": caveman_thinking,
                "genshijin_thinking": genshijin_thinking,
                "normal_split": normal_split,
                "caveman_split": caveman_split,
                "genshijin_split": genshijin_split,
                "median_normal": median_normal,
                "median_caveman": median_caveman,
                "median_genshijin": median_genshijin,
                "median_normal_think": med_split(normal_split, 0),
                "median_normal_text": med_split(normal_split, 1),
                "median_caveman_think": med_split(caveman_split, 0),
                "median_caveman_text": med_split(caveman_split, 1),
                "median_genshijin_think": med_split(genshijin_split, 0),
                "median_genshijin_text": med_split(genshijin_split, 1),
                "saved_caveman_pct": saved_caveman_pct,
                "saved_genshijin_pct": saved_genshijin_pct,
                "vs_caveman_pct": vs_caveman_pct,
            }
        )

    return results


JUDGE_SYSTEM = """あなたは技術的回答の品質を厳格に評価する審判です。
3つの回答（A/B/C）を、元の質問に対する「技術的正確性」「完全性」で0-10点評価してください。
スタイル（丁寧さ/簡潔さ）は評価対象外。情報量・正確性のみ評価。
必ず以下のJSON形式のみで出力。他の文章は一切出力しない:
{"A":{"accuracy":N,"completeness":N,"reason":"..."},"B":{...},"C":{...}}"""


def judge_answers(client, judge_model: str, prompt: str, answers: dict) -> dict:
    """3モード回答をLLM-as-judgeで採点。answers={'A':text,'B':text,'C':text}"""
    user_msg = (
        f"【質問】\n{prompt}\n\n"
        f"【回答A】\n{answers['A']}\n\n"
        f"【回答B】\n{answers['B']}\n\n"
        f"【回答C】\n{answers['C']}"
    )
    resp = api_call_with_retry(
        client,
        model=judge_model,
        max_tokens=1024,
        system=JUDGE_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    # JSONブロックのみ抽出
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "parse_failed", "raw": text}


def run_judge(client, judge_model: str, results: list[dict]) -> list[dict]:
    """各プロンプトのtrial1回答を採点（盲検化のため順序ランダマイズ）。"""
    import random

    for r in results:
        # trial 0 のみ採点（コスト抑制）
        mapping = [("normal", r["normal_texts"][0]),
                   ("caveman", r["caveman_texts"][0]),
                   ("genshijin", r["genshijin_texts"][0])]
        random.shuffle(mapping)
        labels = ["A", "B", "C"]
        answers = {labels[i]: mapping[i][1] for i in range(3)}
        label_to_mode = {labels[i]: mapping[i][0] for i in range(3)}

        print(f"  judge: {r['id']}...", end=" ", flush=True)
        verdict = judge_answers(client, judge_model, r["prompt"], answers)
        # ラベル→モード名に復号
        scored = {}
        if "error" not in verdict:
            for label, mode in label_to_mode.items():
                scored[mode] = verdict.get(label, {})
            print(
                f"normal={scored.get('normal',{}).get('accuracy','?')}/{scored.get('normal',{}).get('completeness','?')} "
                f"caveman={scored.get('caveman',{}).get('accuracy','?')}/{scored.get('caveman',{}).get('completeness','?')} "
                f"genshijin={scored.get('genshijin',{}).get('accuracy','?')}/{scored.get('genshijin',{}).get('completeness','?')}"
            )
        else:
            scored = verdict
            print("parse失敗")
        r["judge"] = scored
        time.sleep(API_CALL_INTERVAL)

    return results


def print_table(results: list[dict], lang: str = "ja") -> str:
    if lang == "en":
        header = [
            "| Task | Normal | caveman | genshijin | caveman saved | genshijin saved | genshijin vs caveman |",
            "|------|--------|---------|-----------|--------------|----------------|---------------------|",
        ]
        avg_label = "**Average**"
    else:
        header = [
            "| タスク | 通常 | caveman | genshijin | caveman削減 | genshijin削減 | genshijin vs caveman |",
            "|--------|------|---------|-----------|------------|-------------|---------------------|",
        ]
        avg_label = "**平均**"

    lines = list(header)
    total_normal = 0
    total_caveman = 0
    total_genshijin = 0

    for r in results:
        lines.append(
            f"| {r['prompt'][:30]} | {r['median_normal']} | {r['median_caveman']} "
            f"| {r['median_genshijin']} | {r['saved_caveman_pct']}% "
            f"| {r['saved_genshijin_pct']}% | {r['vs_caveman_pct']}% |"
        )
        total_normal += r["median_normal"]
        total_caveman += r["median_caveman"]
        total_genshijin += r["median_genshijin"]

    avg_normal = total_normal // len(results)
    avg_caveman = total_caveman // len(results)
    avg_genshijin = total_genshijin // len(results)
    avg_saved_cv = round((1 - total_caveman / total_normal) * 100)
    avg_saved_gs = round((1 - total_genshijin / total_normal) * 100)
    avg_vs = round((1 - total_genshijin / total_caveman) * 100) if total_caveman > 0 else 0
    lines.append(
        f"| {avg_label} | **{avg_normal}** | **{avg_caveman}** "
        f"| **{avg_genshijin}** | **{avg_saved_cv}%** "
        f"| **{avg_saved_gs}%** | **{avg_vs}%** |"
    )

    table = "\n".join(lines)
    print("\n" + table)
    return table


def update_readme(table: str, lang: str = "ja") -> None:
    readme = README_FILE.read_text(encoding="utf-8")
    if lang == "en":
        start_marker = "<!-- BENCHMARK_EN_START -->"
        end_marker = "<!-- BENCHMARK_EN_END -->"
    else:
        start_marker = "<!-- BENCHMARK_START -->"
        end_marker = "<!-- BENCHMARK_END -->"

    if start_marker not in readme:
        print(f"README.md にベンチマークマーカー ({start_marker}) が見つかりません。スキップ。")
        return

    before = readme[: readme.index(start_marker) + len(start_marker)]
    after = readme[readme.index(end_marker) :]
    new_readme = f"{before}\n{table}\n{after}"
    README_FILE.write_text(new_readme, encoding="utf-8")
    print("README.md を更新しました。")


def main():
    parser = argparse.ArgumentParser(description="genshijin ベンチマーク")
    parser.add_argument("--trials", type=int, default=3, help="試行回数 (デフォルト: 3)")
    parser.add_argument(
        "--model",
        default="claude-sonnet-4-20250514",
        help="使用モデル (デフォルト: claude-sonnet-4-20250514)",
    )
    parser.add_argument(
        "--update-readme",
        action="store_true",
        help="README.md のベンチマークテーブルを更新",
    )
    parser.add_argument(
        "--update-docs",
        action="store_true",
        help="docs/benchmark.json を更新（GitHub Pages用）",
    )
    parser.add_argument(
        "--lang",
        default="ja",
        choices=["ja", "en"],
        help="ベンチマーク言語 (デフォルト: ja)",
    )
    parser.add_argument(
        "--thinking",
        type=int,
        default=0,
        help="extended thinking 有効化。budget_tokens を指定（例: 2000）。0で無効（デフォルト）",
    )
    parser.add_argument(
        "--judge",
        default="",
        help="LLM-as-judge 採点モデル（例: claude-opus-4-7-20250929）。空なら採点スキップ",
    )
    parser.add_argument(
        "--prompts",
        default="",
        help="カスタムプロンプトJSONファイルパス（指定なければlang既定）",
    )
    args = parser.parse_args()

    client = Anthropic()
    if args.prompts:
        prompts_file = Path(args.prompts)
    else:
        prompts_file = PROMPTS_FILE_EN if args.lang == "en" else PROMPTS_FILE_JA
    prompts = json.loads(prompts_file.read_text(encoding="utf-8"))

    print(f"モデル: {args.model}")
    print(f"言語: {args.lang}")
    print(f"試行回数: {args.trials}")
    print(f"プロンプト数: {len(prompts)}")
    print(f"思考budget: {args.thinking if args.thinking else '無効'}")
    print()

    results = run_benchmark(
        client, args.model, prompts, args.trials, lang=args.lang, thinking_budget=args.thinking
    )
    table = print_table(results, lang=args.lang)

    if args.judge:
        print(f"\n=== LLM-as-judge 採点開始 (model={args.judge}) ===")
        results = run_judge(client, args.judge, results)

    # 結果を保存
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    suffix = f"_think{args.thinking}" if args.thinking else ""
    result_file = RESULTS_DIR / f"benchmark_{args.lang}{suffix}_{timestamp}.json"
    result_file.write_text(
        json.dumps(
            {
                "model": args.model,
                "lang": args.lang,
                "trials": args.trials,
                "thinking_budget": args.thinking,
                "timestamp": timestamp,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n結果を保存: {result_file}")

    if args.update_readme:
        update_readme(table, lang=args.lang)

    if args.update_docs:
        import shutil
        DOCS_DIR.mkdir(parents=True, exist_ok=True)
        docs_file = DOCS_DIR / f"benchmark{'_en' if args.lang == 'en' else ''}.json"
        shutil.copy2(result_file, docs_file)
        print(f"{docs_file.name} を更新しました。")


if __name__ == "__main__":
    main()
