"""段落规范化的单元测试。

跑：cd worker && python3 -B -m pytest test_paragraphs.py -q
（没装 pytest 就用：python3 -B test_paragraphs.py）
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from paragraphs import convert_sections_to_paragraphs  # noqa: E402


def test_纯文本_section_转成_p():
    html = (
        '<div id="c">'
        '<section style="margin-bottom:24px">第一段</section>'
        '<section style="margin-bottom:24px">第二段</section>'
        "</div>"
    )
    out = convert_sections_to_paragraphs(html)
    assert out.count("<p ") == 2
    assert "<section" not in out
    assert "第一段" in out and "第二段" in out


def test_布局型的_section_原样保留():
    # section 里还有 section / p / img → 是布局容器，不能改成 p
    html = '<section class="wrap"><section>内层文字</section></section>'
    out = convert_sections_to_paragraphs(html)
    assert out.count("<section") >= 1


def test_含图片的_section_不动():
    html = '<section><img src="a.png"></section>'
    out = convert_sections_to_paragraphs(html)
    assert out == html


def test_空_section_不动():
    html = "<section></section>"
    assert convert_sections_to_paragraphs(html) == html


def test_没有_section_时零成本返回():
    html = "<div><p>a</p></div>"
    assert convert_sections_to_paragraphs(html) == html


def test_嵌套的纯文本_section_能从内到外处理():
    html = "<section><section>只有文字</section></section>"
    out = convert_sections_to_paragraphs(html)
    # 内层先变 p，外层就含有块级子元素、保持 section
    assert "<p>只有文字</p>" in out


def test_属性被保留():
    html = '<section class="x" style="color:red">文字</section>'
    out = convert_sections_to_paragraphs(html)
    assert 'class="x"' in out and 'style="color:red"' in out


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failed += 1
                print(f"FAIL {name}: {exc}")
    print(f"\n{'全部通过' if failed == 0 else f'{failed} 项失败'}")
    sys.exit(1 if failed else 0)
