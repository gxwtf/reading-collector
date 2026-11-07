#!/usr/bin/env python3
"""清洗书名、补齐书籍元数据（作者/简介/出版社/ISBN/页数/封面）。

- 书名优先用 EPUB/PDF 内嵌的 dc:title，其次用数据库里的
- 清洗掉 (Z-Library)、-1790050600299、读客/出品 之类的噪音
- 封面从 EPUB 里抽第一张 cover 图，转成 jpg 存到 covers/<id>.jpg
"""
import html
import io
import os
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import psycopg
from PIL import Image

BOOKS_DIR = Path(os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books"))
COVERS = BOOKS_DIR / "covers"
DB = os.environ["DATABASE_URL"]

NOISE = [
    r"\(z-?library[^)]*\)",
    r"\[z-?library[^\]]*\]",
    r"（z-?library[^）]*）",
    r"-\d{10,}$",
    r"（读客[^）]*）",
    r"\(读客[^)]*\)",
    r"（[^）]*(出品|磨铁|博集|果麦|湛庐|中信出版|赠|套装)[^）]*）",
    r"\([^)]*(Penguin|Vintage|HarperCollins)[^)]*\)",
    r"\s*\((Z-Library|Z-lib|1lib\.sk|z-lib\.sk)[^)]*\)",
]
# 丛书/出版社/系列信息：出现在书名尾部时去掉
SERIES_RE = re.compile(
    r"\s*[\(（\[【][^\)）\]】]*(丛书|书系|系列|全集|文集|名著名译|中华书局|商务印书馆|人民文学|上海译文|译林|出版|版)[^\)）\]】]*[\)）\]】]\s*$"
)
# 书名尾部的作者括号：[美]贝克尔 / （俄）托尔斯泰
AUTHOR_IN_TITLE_RE = re.compile(r"\s*[\(（][^\(（]{1,30}[\)）]\s*$")
NOISE_RE = [re.compile(p, re.I) for p in NOISE]


def clean_title(title: str) -> str:
    t = html.unescape(title or "").strip()
    for rx in NOISE_RE:
        t = rx.sub("", t)
    t = re.sub(r"[\(（]\s*[\)）]", "", t)
    t = SERIES_RE.sub("", t)
    t = re.sub(r"\s*-{2,}.*$", "", t)
    # 尾部括号里像人名的（含国别标记）也去掉
    tail = AUTHOR_IN_TITLE_RE.search(t)
    if tail and re.search(r"[\[【（(][^\]】）)]*(美|英|俄|法|德|日|澳|加|意|古|希腊|著|编|译)", tail.group(0)):
        t = t[: tail.start()]
    t = re.sub(r"\s{2,}", " ", t).strip(" -_·")
    return t or (title or "").strip()


AUTHOR_JUNK = re.compile(r"(ePUBw\.COM|z-?lib|z-library|www\.[\w.]+|\.(com|net|org|cn)\b)", re.I)


def clean_author(author: str) -> str:
    a = html.unescape(author or "")
    a = AUTHOR_JUNK.sub("", a)
    a = re.sub(r"[，,]\s*(著|编著|主编|译|编)\s*$", "", a)
    a = re.sub(r"\s*(著|编著|主编)$", "", a)
    parts = [p.strip() for p in re.split(r"[,，;；/]", a) if p.strip()]
    return "、".join(parts[:3])


def epub_meta(path: Path):
    meta = {}
    cover_bytes = None
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            opf_name = None
            if "META-INF/container.xml" in names:
                root = ET.fromstring(z.read("META-INF/container.xml"))
                for el in root.iter():
                    if el.tag.endswith("rootfile"):
                        opf_name = el.get("full-path")
                        break
            if not opf_name:
                opf_name = next((n for n in names if n.endswith(".opf")), None)
            if not opf_name:
                return meta, None

            opf = ET.fromstring(z.read(opf_name))
            base = os.path.dirname(opf_name)

            def text(tag):
                for el in opf.iter():
                    if el.tag.endswith(tag) and (el.text or "").strip():
                        return el.text.strip()
                return None

            d = lambda t: text("}%s" % t) or text(t)  # noqa: E731
            meta["title"] = d("title")
            meta["author"] = d("creator")
            meta["description"] = d("description")
            meta["publisher"] = d("publisher")
            meta["published"] = d("date")
            meta["language"] = d("language")
            ident = d("identifier") or ""
            m = re.search(r"97[89][\d-]{10,}", ident)
            if m:
                meta["isbn"] = m.group(0).replace("-", "")
            elif ident:
                meta["isbn"] = ident

            # 封面：manifest 里 properties="cover-image" 的 item
            cover_href = None
            manifest = {}
            for el in opf.iter():
                if el.tag.endswith("item") and el.get("href"):
                    manifest[el.get("id")] = el.get("href")
                    if "cover-image" in (el.get("properties") or ""):
                        cover_href = el.get("href")
            if not cover_href:
                for el in opf.iter():
                    if el.tag.endswith("meta") and (el.get("name") or "").lower() == "cover":
                        cover_href = manifest.get(el.get("content"))
            if not cover_href:
                cover_href = next((h for h in manifest.values() if re.search(r"cover\.(jpe?g|png)$", h, re.I)), None)

            if cover_href:
                cover_name = os.path.normpath(os.path.join(base, cover_href)).lstrip("./")
                try:
                    cover_bytes = z.read(cover_name)
                except KeyError:
                    cover_bytes = None
    except Exception as e:  # noqa: BLE001
        print(f"  ! epub parse failed: {e}", file=sys.stderr)
    return meta, cover_bytes


def pdf_meta(path: Path):
    from pypdf import PdfReader

    meta = {}
    try:
        r = PdfReader(str(path))
        info = r.metadata or {}
        meta["title"] = info.get("/Title")
        meta["author"] = info.get("/Author")
        meta["publisher"] = info.get("/Producer")
        meta["description"] = info.get("/Subject")
        meta["pageCount"] = len(r.pages)
    except Exception as e:  # noqa: BLE001
        print(f"  ! pdf parse failed: {e}", file=sys.stderr)
    return meta


FONT_CANDIDATES = [
    "/home/gxwtf/.fonts/simsun.ttf",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
]


def make_placeholder(book_id: int, title: str, author: str) -> str:
    """没有封面的书（PDF/扫描件）生成一张纯色卡片，避免列表里一片空白。"""
    from PIL import ImageDraw, ImageFont

    W, H = 600, 900
    im = Image.new("RGB", (W, H), (250, 247, 242))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 12], fill=(163, 31, 36))

    font = None
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, 46)
                small = ImageFont.truetype(path, 28)
                break
            except OSError:
                font = None
    if font is None:
        font = ImageFont.load_default()
        small = font

    text = title or f"Book {book_id}"
    # 按宽度折行
    lines, cur = [], ""
    for ch in text:
        if d.textlength(cur + ch, font=font) > W - 96:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    lines.append(cur)
    lines = lines[:8]

    y = 240
    for line in lines:
        d.text((48, y), line, font=font, fill=(32, 30, 28))
        y += 62
    if author:
        d.text((48, y + 24), author, font=small, fill=(120, 112, 104))
    d.text((48, H - 72), "阅读收集", font=small, fill=(163, 31, 36))

    COVERS.mkdir(parents=True, exist_ok=True)
    name = f"{book_id}.jpg"
    im.save(COVERS / name, "JPEG", quality=84)
    return name


def save_cover(book_id: int, data: bytes) -> str:
    COVERS.mkdir(parents=True, exist_ok=True)
    try:
        im = Image.open(io.BytesIO(data))
        im = im.convert("RGB")
        im.thumbnail((600, 900))
        name = f"{book_id}.jpg"
        im.save(COVERS / name, "JPEG", quality=82)
        return name
    except Exception:  # noqa: BLE001
        return ""


def main():
    with psycopg.connect(DB) as conn:
        rows = conn.execute(
            'select id, title, author, format, "fileName" from "Book" order by id'
        ).fetchall()

        for bid, title, author, fmt, file_name in rows:
            path = BOOKS_DIR / file_name
            if not path.exists():
                continue
            meta, cover = ({}, None)
            if fmt.lower() == "epub":
                meta, cover = epub_meta(path)
                meta["pageCount"] = None
            elif fmt.lower() == "pdf":
                meta = pdf_meta(path)
            else:
                meta = {}

            new_title = clean_title(meta.get("title") or title)
            new_author = clean_author(meta.get("author") or author or "") or None
            if new_author and new_author.lower() in ("unknown", "anonymous"):
                new_author = None

            desc = meta.get("description")
            if desc:
                desc = re.sub(r"<[^>]+>", "", html.unescape(desc)).strip()[:2000] or None

            cover_file = save_cover(bid, cover) if cover else None
            if not cover_file:
                cover_file = make_placeholder(bid, new_title, new_author or "")

            conn.execute(
                '''update "Book" set title=%s, author=%s, description=%s, publisher=%s,
                   published=%s, language=%s, isbn=%s, "pageCount"=coalesce(%s,"pageCount"),
                   "coverFile"=coalesce(%s,"coverFile") where id=%s''',
                (
                    new_title,
                    new_author,
                    desc,
                    (meta.get("publisher") or None),
                    (meta.get("published") or None),
                    (meta.get("language") or None),
                    (meta.get("isbn") or None),
                    meta.get("pageCount"),
                    cover_file or None,
                    bid,
                ),
            )
            print(f"{bid:>3} {new_title[:34]:<36} | {(new_author or '-')[:14]:<15} | {'封面' if cover_file else '无封面'}")
        conn.commit()


if __name__ == "__main__":
    main()
