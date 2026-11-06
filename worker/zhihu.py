"""知乎抓取：解析页面里的 js-initialData，取问题/回答/专栏正文。

知乎对未登录请求返回 403 或跳登录页，必须在 .env 配 ZHIHU_COOKIE
（浏览器登录后复制整条 Cookie）。
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urlparse

import httpx

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

INIT_RE = re.compile(
    r'<script id="js-initialData" type="text/json">(.*?)</script>', re.S
)


class ZhihuError(RuntimeError):
    pass


def html_to_markdown(html: str) -> str:
    """把知乎的富文本 HTML 转成 Markdown（够用即可，不追求全覆盖）。"""
    if not html:
        return ""

    text = html
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.S)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>", "\n\n", text)
    text = re.sub(r"<h([1-3])[^>]*>(.*?)</h\1>", lambda m: "\n" + "#" * int(m.group(1)) + " " + m.group(2) + "\n\n", text, flags=re.S)
    text = re.sub(r"<blockquote[^>]*>(.*?)</blockquote>", lambda m: "\n> " + m.group(1).strip() + "\n\n", text, flags=re.S)
    text = re.sub(r"<li[^>]*>(.*?)</li>", lambda m: "- " + m.group(1).strip() + "\n", text, flags=re.S)
    text = re.sub(r"<b[^>]*>(.*?)</b>|<strong[^>]*>(.*?)</strong>", lambda m: f"**{(m.group(1) or m.group(2) or '').strip()}**", text, flags=re.S)
    text = re.sub(r"<i[^>]*>(.*?)</i>|<em[^>]*>(.*?)</em>", lambda m: f"*{(m.group(1) or m.group(2) or '').strip()}*", text, flags=re.S)
    text = re.sub(r'<img[^>]*src="([^"]+)"[^>]*>', lambda m: f"\n![]({m.group(1)})\n", text)
    text = re.sub(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', lambda m: f"[{re.sub(r'<[^>]+>', '', m.group(2)).strip()}]({m.group(1)})", text, flags=re.S)
    text = re.sub(r"<code[^>]*>(.*?)</code>", lambda m: f"`{m.group(1)}`", text, flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)

    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _ids(url: str) -> dict:
    """从 URL 里取出 question / answer / article 的 id"""
    path = urlparse(url).path
    out: dict[str, str] = {}
    m = re.search(r"/question/(\d+)", path)
    if m:
        out["question"] = m.group(1)
    m = re.search(r"/answer/(\d+)", path)
    if m:
        out["answer"] = m.group(1)
    m = re.search(r"/p/(\d+)", path)
    if m:
        out["article"] = m.group(1)
    return out


def fetch_zhihu(url: str) -> dict:
    cookie = os.environ.get("ZHIHU_COOKIE", "").strip()
    if not cookie:
        raise ZhihuError(
            "知乎需要登录态：请在服务器 .env 配置 ZHIHU_COOKIE（浏览器登录知乎后复制整条 Cookie）"
        )

    headers = {
        "User-Agent": UA,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cookie": cookie,
        "Referer": "https://www.zhihu.com/",
    }
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or None
    with httpx.Client(headers=headers, timeout=30, follow_redirects=True, proxy=proxy) as client:
        resp = client.get(url)

    if "signin" in str(resp.url) and resp.url != url:
        raise ZhihuError("知乎返回登录页：ZHIHU_COOKIE 已失效，请重新复制")
    if resp.status_code in (401, 403):
        raise ZhihuError(f"知乎拒绝访问（{resp.status_code}）：请检查 ZHIHU_COOKIE 是否有效")
    if resp.status_code != 200:
        raise ZhihuError(f"知乎返回 {resp.status_code}")

    m = INIT_RE.search(resp.text)
    if not m:
        raise ZhihuError("页面里没找到 js-initialData，知乎可能改了结构或触发了验证")

    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as exc:
        raise ZhihuError(f"initialData 解析失败：{exc}") from exc

    state = data.get("initialState", {})
    entities = state.get("entities", {})
    ids = _ids(url)

    # 专栏文章
    if ids.get("article"):
        article = (entities.get("articles") or {}).get(ids["article"])
        if not article:
            raise ZhihuError("没解析到专栏正文，可能需要登录")
        body = html_to_markdown(article.get("content") or "")
        return {
            "title": article.get("title") or "知乎专栏",
            "contentMd": body,
            "author": (article.get("author") or {}).get("name"),
            "site": "知乎",
            "excerpt": re.sub(r"\s+", " ", body)[:120],
            "contentHtml": article.get("content"),
        }

    # 问题 / 回答
    question = (entities.get("questions") or {}).get(ids.get("question", ""), {})
    answers = list((entities.get("answers") or {}).values())

    if ids.get("answer"):
        answers = [a for a in answers if str(a.get("id")) == ids["answer"]] or answers

    if not answers:
        raise ZhihuError("没解析到回答内容，可能需要登录或该问题暂无回答")

    answers.sort(key=lambda a: a.get("voteupCount") or 0, reverse=True)
    picked = answers[:3]

    parts = [f"# {question.get('title', '知乎问题')}\n"]
    if question.get("detail"):
        parts.append(html_to_markdown(question["detail"]))
    for i, a in enumerate(picked, 1):
        author = (a.get("author") or {}).get("name") or "匿名用户"
        votes = a.get("voteupCount") or 0
        parts.append(f"\n## 回答 {i}｜{author}（{votes} 赞）\n")
        parts.append(html_to_markdown(a.get("content") or ""))

    body = "\n".join(p for p in parts if p).strip()

    return {
        "title": question.get("title") or "知乎问答",
        "contentMd": body,
        "author": None,
        "site": "知乎",
        "excerpt": re.sub(r"\s+", " ", body)[:120],
        "contentHtml": None,
    }
