#!/usr/bin/env python3
"""阅读收集 · 抓取/转写 worker

循环向站点领取任务（POST /api/worker/jobs/<id> 回填结果），
站点只负责建任务与展示，重活都在这里跑。

用法：
  python3 worker.py                # 常驻轮询
  python3 worker.py --once         # 只处理一条（调试用）
  python3 worker.py --dry-run      # 只领取不回填（检查连通性）
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import traceback

import httpx

from config import (
    API_KEY,
    BASE_URL,
    IDLE_MAX_INTERVAL,
    POLL_INTERVAL,
    TASK_TIMEOUT,
    WORKER_NAME,
)
from fetcher import FetchError, fetch_article
from transcriber import TranscribeError, transcribe
from ai_summary import ai_summary

HEADERS = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def claim(client: httpx.Client) -> dict | None:
    try:
        r = client.get(f"{BASE_URL}/api/worker/jobs", params={"worker": WORKER_NAME}, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.json().get("job")
    except httpx.HTTPError as exc:
        log(f"领取任务失败：{exc}")
        return None


def report(client: httpx.Client, job_id: int, payload: dict) -> bool:
    try:
        r = client.post(f"{BASE_URL}/api/worker/jobs/{job_id}", json=payload, headers=HEADERS, timeout=60)
        r.raise_for_status()
        return True
    except httpx.HTTPError as exc:
        log(f"回填结果失败（job {job_id}）：{exc}")
        return False


def handle(client: httpx.Client, job: dict) -> None:
    job_id = job["id"]
    url = job["url"]
    kind = job.get("kind", "fetch")
    log(f"领取 job {job_id} · {kind} · {url}")

    try:
        if kind == "transcribe":
            result = transcribe(url)
            entry = {
                "summary": ai_summary(result.get("text") or "", "video", result.get("segments")),
                "title": result["title"] or url,
                "site": result.get("site") or "音视频",
                "author": result["author"],
                "coverImage": result["coverImage"],
                "durationSec": result["durationSec"],
                "kind": result["kind"],
                "wordCount": len(result["text"]),
            }
            payload = {
                "status": "done",
                "entry": entry,
                "transcript": {
                    "locale": result["locale"],
                    "backend": result["backend"],
                    "model": result["model"],
                    "text": result["text"],
                    "segments": result["segments"],
                },
            }
        else:
            article = fetch_article(url)
            article["summary"] = ai_summary(article.get("contentMd") or "", "article")
            payload = {"status": "done", "entry": article}

        if report(client, job_id, payload):
            log(f"job {job_id} 完成")
    except (FetchError, TranscribeError) as exc:
        log(f"job {job_id} 失败：{exc}")
        report(client, job_id, {"status": "failed", "error": str(exc)})
    except Exception as exc:  # noqa: BLE001 - worker 不能因为单条任务挂掉
        log(f"job {job_id} 异常：{exc}")
        traceback.print_exc()
        report(client, job_id, {"status": "failed", "error": f"worker 异常：{exc}"[:2000]})


def main() -> None:
    ap = argparse.ArgumentParser(description="阅读收集 worker")
    ap.add_argument("--once", action="store_true", help="只处理一条")
    ap.add_argument("--dry-run", action="store_true", help="只领取不回填")
    args = ap.parse_args()

    if not API_KEY:
        print("✗ 缺少 INTERNAL_API_KEY，无法与站点通信", file=sys.stderr)
        sys.exit(1)

    log(f"worker 启动：{WORKER_NAME} → {BASE_URL}")
    idle = POLL_INTERVAL

    with httpx.Client(follow_redirects=True) as client:
        while True:
            job = claim(client)
            if not job:
                if args.once:
                    log("没有待处理任务")
                    return
                time.sleep(idle)
                idle = min(idle * 1.5, IDLE_MAX_INTERVAL)
                continue

            idle = POLL_INTERVAL
            if args.dry_run:
                log(f"dry-run 领到 job {json.dumps(job, ensure_ascii=False)}")
                return

            started = time.time()
            handle(client, job)
            log(f"job {job['id']} 用时 {time.time() - started:.1f}s")

            if args.once:
                return


if __name__ == "__main__":
    main()
