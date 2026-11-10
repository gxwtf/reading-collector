#!/usr/bin/env python3
"""从豆瓣补全 BookOrbit 的书籍元数据（简介/出版社/出版年/页数/ISBN/评分）。

用法：
    python3 enrich-douban.py          # 只打印匹配
    python3 enrich-douban.py --apply  # 写库
"""
import difflib
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

APPLY = "--apply" in sys.argv
PROXY = os.environ.get("HTTPS_PROXY") or "http://127.0.0.1:7890"
COMPOSE_DIR = "/home/gxwtf/bookorbit"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)

OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
)


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://book.douban.com/"})
    with OPENER.open(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def psql(sql: str, tuples: bool = True) -> str:
    cmd = ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "bookorbit", "-d", "bookorbit"]
    cmd += ["-tAc", sql] if tuples else ["-c", sql]
    return subprocess.run(cmd, cwd=COMPOSE_DIR, capture_output=True, text=True).stdout


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]", "", (s or "").lower())


def suggest(title: str):
    url = "https://book.douban.com/j/subject_suggest?" + urllib.parse.urlencode({"q": title, "cat": "1001"})
    try:
        items = json.loads(get(url))
    except Exception:
        return None
    best, score = None, 0.0
    for it in items:
        s = difflib.SequenceMatcher(None, norm(it.get("title")), norm(title)).ratio()
        if s > score:
            best, score = it, s
    if best and score >= 0.5:
        return best
    return None


def subject_info(subject_url: str) -> dict:
    page = get(subject_url)
    info: dict = {}

    # 内容简介（#link-report 里第一个 .intro）
    m = re.search(r'id="link-report".*?<div class="intro">(.*?)</div>', page, re.S)
    if not m:
        m = re.search(r'<div class="intro">(.*?)</div>', page, re.S)
    if m:
        desc = re.sub(r"<[^>]+>", "", m.group(1))
        info["description"] = html.unescape(desc).strip()[:4000]

    # 基本信息
    info_block = re.search(r'<div id="info"[^>]*>(.*?)</div>\s*</div>', page, re.S)
    text = re.sub(r"<[^>]+>", " ", info_block.group(1)) if info_block else ""
    text = html.unescape(re.sub(r"\s+", " ", text))

    def field(label: str):
        mm = re.search(rf"{label}[:：]\s*([^/]+)", text)
        return mm.group(1).strip() if mm else None

    info["publisher"] = field("出版社")
    year = field("出版年")
    if year:
        ym = re.search(r"(\d{4})", year)
        if ym:
            info["published_year"] = int(ym.group(1))
    pages = field("页数")
    if pages:
        pm = re.search(r"(\d+)", pages)
        if pm:
            info["page_count"] = int(pm.group(1))
    isbn = field("ISBN")
    if isbn:
        info["isbn13"] = re.sub(r"[^0-9Xx]", "", isbn)

    rating = re.search(r'class="ll rating_num"[^>]*>([\d.]+)<', page)
    if rating:
        info["rating"] = round(float(rating.group(1)))

    return info


def sqlq(v):
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    rows = psql(
        "select coalesce(json_agg(json_build_object('id',book_id,'title',title,'desc',description,"
        "'pub',publisher,'year',published_year,'pages',page_count,'isbn13',isbn13,'rating',rating)),'[]')::text "
        "from book_metadata;"
    ).strip()
    books = json.loads(rows or "[]")
    print("待处理:", len(books), "| apply =", APPLY)

    updated = 0
    for b in books:
        if b.get("desc") and len(b["desc"]) > 20 and b.get("pub") and b.get("pages"):
            continue
        base = re.sub(r"[（(][^）)]*[）)]", "", b["title"])
        base = re.sub(r"-{2,}.*$", "", base)
        base = re.sub(r"^.*?[·・]\s*", "", base)
        base = re.split(r"[：:]", base)[0].strip()
        hit = suggest(base)
        if not hit:
            print(f"  未匹配 {b['id']} {b['title'][:20]}")
            continue
        try:
            info = subject_info(hit["url"])
        except Exception as e:  # noqa: BLE001
            print("  详情失败", b["id"], e)
            continue
        time.sleep(1)

        print(
            f"  ✓ {b['id']} {b['title'][:16]} ← {hit['title'][:16]} "
            f"简介{len(info.get('description',''))}字 出版社{bool(info.get('publisher'))}"
        )
        if not APPLY:
            continue

        sets = []
        if info.get("description") and not (b.get("desc") and len(b["desc"]) > 20):
            sets.append("description=" + sqlq(info["description"]))
        if info.get("publisher") and not b.get("pub"):
            sets.append("publisher=" + sqlq(info["publisher"][:200]))
        if info.get("published_year") and not b.get("year"):
            sets.append("published_year=" + str(info["published_year"]))
        if info.get("page_count") and not b.get("pages"):
            sets.append("page_count=" + str(info["page_count"]))
        if info.get("isbn13") and not b.get("isbn13"):
            sets.append("isbn13=" + sqlq(info["isbn13"]))
        if info.get("rating") and not b.get("rating"):
            sets.append("rating=" + str(info["rating"]))
        if sets:
            psql(f"update book_metadata set {', '.join(sets)} where book_id={b['id']};", tuples=False)
            updated += 1

    print("更新:", updated)


if __name__ == "__main__":
    main()
