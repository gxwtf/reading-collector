"""正文段落修复。

部分站点（典型：微信公众号）用 `<section>` 而不是 `<p>` 当段落容器：

    <section style="margin-bottom:24px">第一段</section>
    <section style="margin-bottom:24px">第二段</section>

trafilatura 只把 `<p>` 当段落，遇到这种结构会把所有文字并成一整段——
实测一篇 4495 字的公众号文章抽出来是「4 行、1 个空行、最长行 4402 字」，
在页面上就是一大坨没有分段的墙。

这里在交给 trafilatura 之前把「纯文本型 section」规范化成 `<p>`，
让段落信息活下来。只动 section，不碰其它标签；section 里若已有块级子元素
（嵌套 section / p / div / 图片等）则保持原样，避免把结构搅乱。
"""
from __future__ import annotations

import re

# 视为「块级」的子标签：section 里出现这些说明它是布局容器，不是一段话
_BLOCK_IN_SECTION = re.compile(
    r"<(section|p|div|ul|ol|li|table|figure|blockquote|pre|h[1-6]|img|video|iframe)\b",
    re.I,
)

_OPEN = re.compile(r"<section\b([^>]*)>", re.I)
_CLOSE = re.compile(r"</section\s*>", re.I)


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html).strip()


def _innermost_section_spans(html: str) -> list[tuple[int, int, str, str]]:
    """找出所有「内部没有别的 section」的 section 区间。

    用栈做标签配对，而不是正则直接替换：正则的 `(.*?)` 在嵌套时会把
    开标签错配到内层的闭标签上。这里显式配对，天然支持嵌套。

    返回 [(open_start, close_end, inner_html, attrs)]：
    open_start 指向 `<section` 本身，close_end 指向 `</section>` 之后，
    这样调用方连开闭标签一起替换掉。
    """
    stack: list[tuple[int, int, str]] = []  # (open_start, inner_start, attrs)
    spans: list[tuple[int, int, str, str]] = []

    tokens: list[tuple[int, str, str]] = []  # (位置, "open"/"close", 属性)
    for m in _OPEN.finditer(html):
        tokens.append((m.start(), "open", m.group(1)))
    for m in _CLOSE.finditer(html):
        tokens.append((m.start(), "close", ""))
    tokens.sort(key=lambda t: t[0])

    for pos, kind, attrs in tokens:
        if kind == "open":
            end_of_open = html.index(">", pos) + 1
            stack.append((pos, end_of_open, attrs))
        else:
            if not stack:
                continue
            open_start, inner_start, inner_attrs = stack.pop()
            close_end = html.index(">", pos) + 1
            spans.append((open_start, close_end, html[inner_start:pos], inner_attrs))
    return spans


def convert_sections_to_paragraphs(html: str) -> str:
    """把「只包文本的 section」换成 p，保住段落边界。"""
    if "<section" not in html.lower():
        return html

    # 反复处理，直到没有可替换的（嵌套时内层先变 p，外层就含有块级子元素而保留）
    current = html
    for _ in range(10):
        spans = _innermost_section_spans(current)
        if not spans:
            break

        # 从后往前替换，避免位置偏移
        replacements: list[tuple[int, int, str]] = []
        for start, end, inner, attrs in sorted(spans, key=lambda s: s[0], reverse=True):
            if _BLOCK_IN_SECTION.search(inner):
                continue  # 布局容器
            if not _strip_tags(inner):
                continue  # 空 section
            replacements.append((start, end, f"<p{attrs}>{inner}</p>"))

        if not replacements:
            break
        for start, end, new in replacements:
            current = current[:start] + new + current[end:]
    return current
