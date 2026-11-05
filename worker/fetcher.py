"""文章正文抓取：httpx 取页面 → trafilatura 抽正文并转 Markdown。

刻意保持无浏览器依赖：需要渲染的站点（部分公众号、SPA）会抽不到正文，
此时抛 FetchError，由上层把任务标记为失败并在页面上提供「重试」。
"""
from __future__ import annotations

import re

import httpx

from config import HTTP_TIMEOUT, USER_AGENT


class FetchError(RuntimeError):
    pass


def _guess_site(url: str, html: str) -> str:
    """优先用 og:site_name，其次用域名。"""
    m = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', html, re.I)
    if m:
        return m.group(1).strip()[:100]
    host = re.sub(r"^www\.", "", httpx.URL(url).host or "")
    known = {
        "mp.weixin.qq.com": "微信公众号",
        "zhuanlan.zhihu.com": "知乎专栏",
        "www.zhihu.com": "知乎",
        "juejin.cn": "掘金",
        "sspai.com": "少数派",
        "36kr.com": "36 氪",
        "nytimes.com": "纽约时报",
        "thepaper.cn": "澎湃新闻",
    }
    return known.get(httpx.URL(url).host or "", host)


def _meta(html: str, prop: str) -> str | None:
    pattern = rf'<meta[^>]+(?:property|name)=["\']{prop}["\'][^>]+content=["\']([^"\']*)'
    m = re.search(pattern, html, re.I)
    return m.group(1).strip() or None if m else None


def fetch_article(url: str) -> dict:
    """返回 {title, site, author, excerpt, contentMd, coverImage, lang, wordCount, publishedAt}"""
    try:
        import trafilatura
    except ImportError as exc:  # pragma: no cover
        raise FetchError("worker 缺少 trafilatura，请先 pip install -r requirements.txt") from exc

    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"},
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise FetchError(f"请求失败：{exc}") from exc

    html = resp.text
    if len(html) < 500:
        raise FetchError("页面内容过少，可能被反爬拦截")

    # trafilatura 2.x 支持 markdown 输出；老版本退回纯文本
    try:
        content = trafilatura.extract(
            html,
            url=url,
            output_format="markdown",
            include_links=True,
            include_images=False,
            include_formatting=True,
        )
    except (TypeError, ValueError):
        content = trafilatura.extract(html, url=url, include_links=True)

    if not content or len(content.strip()) < 120:
        raise FetchError("抽不到正文，可能需要登录或依赖前端渲染")

    meta = trafilatura.extract_metadata(html)
    title = (getattr(meta, "title", None) or _meta(html, "og:title") or "").strip()
    author = (getattr(meta, "author", None) or _meta(html, "author") or "").strip() or None
    published = getattr(meta, "date", None) or _meta(html, "article:published_time")
    lang = (getattr(meta, "language", None) or "").strip() or None

    plain = re.sub(r"[#>*`\[\]()!\-]", "", content)
    word_count = len(re.sub(r"\s+", "", plain))

    excerpt = (getattr(meta, "description", None) or _meta(html, "og:description") or "").strip()
    if not excerpt:
        excerpt = re.sub(r"\s+", " ", plain)[:160]

    return {
        "title": title or url,
        "site": _guess_site(url, html),
        "author": author,
        "lang": lang,
        "excerpt": excerpt[:400] or None,
        "contentMd": content,
        "coverImage": _meta(html, "og:image"),
        "wordCount": word_count,
        "publishedAt": published or None,
        "kind": "article",
    }
