#!/usr/bin/env python3
"""统一用 ISBN 匹配元数据。

流程：
1. 有 ISBN → 豆瓣 /isbn/<isbn>/ 直达对应版本 → 抓简介/出版社/年份/页数/评分
2. 没 ISBN → 先用标题在豆瓣 suggest 找到书，拿 ISBN 存下来，再走第 1 步
3. 豆瓣与现有内容取「非空优先」，ISBN 匹配的版本信息覆盖标题模糊匹配的结果

用法：python3 enrich_isbn.py [--apply]
"""
import difflib
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
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
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Referer": "https://book.douban.com/"}
    )
    with OPENER.open(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def psql(sql: str, tuples: bool = True) -> str:
    cmd = ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "bookorbit", "-d", "bookorbit"]
    cmd += ["-tAc", sql] if tuples else ["-c", sql]
    return subprocess.run(cmd, cwd=COMPOSE_DIR, capture_output=True, text=True).stdout


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]", "", (s or "").lower())


def sqlq(v):
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def clean_title(t: str) -> str:
    t = re.sub(r"[（(][^）)]*[）)]", "", t)
    t = re.sub(r"-{2,}.*$", "", t)
    t = re.sub(r"^.*?[·・]\s*", "", t)
    t = re.split(r"[：:]", t)[0]
    return t.strip()


def suggest_isbn(title: str) -> str | None:
    url = "https://book.douban.com/j/subject_suggest?" + urllib.parse.urlencode(
        {"q": clean_title(title), "cat": "1001"}
    )
    try:
        items = json.loads(get(url))
    except Exception:
        return None
    best, score = None, 0.0
    for it in items:
        s = difflib.SequenceMatcher(None, norm(it.get("title")), norm(clean_title(title))).ratio()
        if s > score:
            best, score = it, s
    if not best or score < 0.5:
        return None
    # suggest 不返回 ISBN，去详情页拿
    try:
        return subject_isbn(best["url"])
    except Exception:
        return None


def subject_isbn(subject_url: str) -> str | None:
    page = get(subject_url)
    m = re.search(r"ISBN[:：]?\s*</span>\s*([0-9Xx\-]{10,17})", page)
    if not m:
        m = re.search(r"ISBN[:：]\s*([0-9Xx\-]{10,17})", re.sub(r"<[^>]+>", " ", page))
    if not m:
        return None
    return re.sub(r"[^0-9Xx]", "", m.group(1))


def subject_info_by_isbn(isbn: str) -> dict:
    page = get(f"https://book.douban.com/isbn/{isbn}/")
    info: dict = {}
    m = re.search(r'id="link-report".*?<div class="intro">(.*?)</div>', page, re.S) or re.search(
        r'<div class="intro">(.*?)</div>', page, re.S
    )
    if m:
        info["description"] = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()[:4000]

    block = re.search(r'<div id="info"[^>]*>(.*?)</div>\s*</div>', page, re.S)
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", block.group(1)))) if block else ""

    def field(label: str):
        mm = re.search(rf"{label}[:：]\s*([^/]+?)(?:\s*[A-Za-z\u4e00-\u9fff]+[:：]|$)", text)
        return mm.group(1).strip() if mm else None

    pub = field("出版社")
    if pub:
        info["publisher"] = pub[:200]
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
    rating = re.search(r'class="ll rating_num"[^>]*>([\d.]+)<', page)
    if rating:
        info["rating"] = round(float(rating.group(1)))
    info["isbn13"] = isbn
    return info


def main() -> None:
    rows = psql(
        "select coalesce(json_agg(json_build_object('id',book_id,'title',title,'isbn',isbn13,"
        "'desc',description,'pub',publisher,'year',published_year,'pages',page_count,'rating',rating)),'[]')::text "
        "from book_metadata;"
    ).strip()
    books = json.loads(rows or "[]")
    print("待处理:", len(books), "| apply =", APPLY)

    updated = 0
    for b in books:
        isbn = (b.get("isbn") or "").replace("-", "")
        source = "已有 ISBN"
        if not isbn:
            isbn = suggest_isbn(b["title"]) or ""
            source = "标题→ISBN"
        if not isbn:
            print(f"  ✗ {b['id']} {b['title'][:20]} 拿不到 ISBN")
            continue

        try:
            info = subject_info_by_isbn(isbn)
        except urllib.error.HTTPError as e:
            print(f"  ✗ {b['id']} ISBN {isbn} 豆瓣 {e.code}")
            continue
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {b['id']} ISBN {isbn} 失败 {e}")
            continue
        time.sleep(1)

        print(
            f"  ✓ {b['id']} {b['title'][:14]} [{source}] ISBN {isbn} "
            f"← {info.get('publisher','-')[:14]} {info.get('published_year','-')} "
            f"{info.get('page_count','-')}页 简介{len(info.get('description',''))}字"
        )
        if not APPLY:
            continue

        sets = [f"isbn13={sqlq(isbn)}"]
        if info.get("description"):
            sets.append("description=" + sqlq(info["description"]))
        if info.get("publisher"):
            sets.append("publisher=" + sqlq(info["publisher"]))
        if info.get("published_year"):
            sets.append("published_year=" + str(info["published_year"]))
        if info.get("page_count"):
            sets.append("page_count=" + str(info["page_count"]))
        if info.get("rating"):
            sets.append("rating=" + str(info["rating"]))
        psql(f"update book_metadata set {', '.join(sets)} where book_id={b['id']};", tuples=False)
        updated += 1

    print("更新:", updated)


if __name__ == "__main__":
    main()
