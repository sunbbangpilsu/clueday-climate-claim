"""Build the three submission PDFs/HTML files and a ready-to-attach ZIP.

Install: python -m pip install -r tools/requirements-docs.txt
Run from the repository: python tools/build_docs.py
The regular/bold Korean TTF paths can be overridden with CLUE_DOC_FONT_REGULAR/BOLD.
"""
from __future__ import annotations

import html
import os
from pathlib import Path
import shutil
import sys
import textwrap
import zipfile

from bs4 import BeautifulSoup, NavigableString, Tag
import markdown
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table,
                               TableStyle, Image, HRFlowable)

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DATE = "2026.10.26"
WIDTH = 180 * mm
GREEN = colors.HexColor("#0f5c4d")
REGULAR = Path(os.environ.get("CLUE_DOC_FONT_REGULAR", r"C:\Windows\Fonts\malgun.ttf"))
BOLD = Path(os.environ.get("CLUE_DOC_FONT_BOLD", r"C:\Windows\Fonts\malgunbd.ttf"))
CSS = """
@page {size:A4; margin:20mm 15mm;}
body {font-family:'Malgun Gothic',sans-serif; color:#17201d; line-height:1.65; max-width:960px; margin:24px auto; padding:0 16px;}
h1,h2,h3 {color:#0f5c4d; line-height:1.4;} h1 {font-size:26px;} h2 {font-size:21px;} h3 {font-size:16px;}
table {border-collapse:collapse; width:100%; margin:12px 0; font-size:14px;} th,td {border:1px solid #d3dfd9; padding:8px; text-align:left; vertical-align:top;} th {background:#e3f1ec;}
a {color:#0f5c4d; overflow-wrap:anywhere;} pre {white-space:pre-wrap; overflow-wrap:anywhere; padding:14px; background:#f3f6f4; border:1px solid #d3dfd9;}
.page-break {break-before:page;} .screen {display:flex; gap:24px; align-items:flex-start; margin-top:16px; break-inside:avoid;}
.screen>img {width:290px; border:1px solid #d3dfd9; border-radius:12px;} .ui-notes {flex:1;} .ui-notes p {margin:6px 0 14px;}.small {font-size:12px;color:#5d6965;}
@media(max-width:640px){.screen{display:block;}.screen>img{max-width:100%;}}
@media print {body{margin:0;padding:0;}.screen>img{width:73mm;}.screen{gap:7mm;}}
"""


def init_fonts():
    if not REGULAR.is_file() or not BOLD.is_file():
        raise FileNotFoundError("Set CLUE_DOC_FONT_REGULAR and CLUE_DOC_FONT_BOLD to Korean TTF files.")
    pdfmetrics.registerFont(TTFont("Clue", str(REGULAR)))
    pdfmetrics.registerFont(TTFont("ClueBold", str(BOLD)))
    pdfmetrics.registerFontFamily("Clue", normal="Clue", bold="ClueBold", italic="Clue", boldItalic="ClueBold")


def style(name, **kw):
    base = dict(fontName="Clue", fontSize=9.5, leading=14.5, spaceAfter=7,
                wordWrap="CJK", alignment=TA_LEFT, textColor=colors.HexColor("#17201d"))
    base.update(kw)
    return ParagraphStyle(name, **base)


STYLES = {
    "body": style("body"), "small": style("small", fontSize=8.2, leading=12),
    "h1": style("h1", fontName="ClueBold", fontSize=20, leading=27, textColor=GREEN, spaceAfter=12, keepWithNext=True),
    "h2": style("h2", fontName="ClueBold", fontSize=14, leading=20, textColor=GREEN, spaceBefore=10, spaceAfter=9, keepWithNext=True),
    "h3": style("h3", fontName="ClueBold", fontSize=10.4, leading=15.4, textColor=GREEN, spaceBefore=7, spaceAfter=5, keepWithNext=True),
    "cell": style("cell", fontSize=8.4, leading=12.7, spaceAfter=0),
    "code": style("code", fontSize=8, leading=11.5, spaceAfter=0),
    "bullet": style("bullet", leftIndent=10, firstLineIndent=0, bulletIndent=0),
}


def inline(node):
    if isinstance(node, NavigableString):
        return html.escape(str(node).replace("\n", " "))
    if not isinstance(node, Tag):
        return ""
    inner = "".join(inline(c) for c in node.children)
    if node.name in ("strong", "b"):
        return f"<b>{inner}</b>"
    if node.name in ("em", "i"):
        return f"<i>{inner}</i>"
    if node.name == "br":
        return "<br/>"
    if node.name == "a":
        url = node.get("href", "")
        if url.startswith("https://") or url.startswith("http://"):
            return f'<a href="{html.escape(url, quote=True)}" color="#0f5c4d">{inner}</a>'
        return inner
    if node.name == "code":
        return f'<font color="#0f5c4d">{inner}</font>'
    return inner


def paragraph(tag, kind="body"):
    return Paragraph("".join(inline(c) for c in tag.children), STYLES[kind])


def table_for(tag, width=WIDTH):
    rows = tag.find_all("tr")
    data = [[Paragraph("".join(inline(c) for c in cell.children), STYLES["cell"])
             for cell in row.find_all(["th", "td"], recursive=False)] for row in rows]
    n = max(map(len, data))
    for row in data:
        row.extend([""] * (n - len(row)))
    headings = rows[0].get_text(" ", strip=True)
    if n == 2:
        fractions = [.70, .30] if "시연 금액" in headings else [.28, .72]
    elif n == 3:
        fractions = [.16,.32,.52] if "메서드" in headings else [.30,.25,.45] if "필드" in headings else [.23,.38,.39]
    elif n == 4:
        fractions = [.24,.22,.13,.41]
    else:
        fractions = [1 / n] * n
    table = Table(data, colWidths=[width*x for x in fractions], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,0), colors.HexColor("#e3f1ec")),
        ("VALIGN", (0,0),(-1,-1),"TOP"), ("GRID",(0,0),(-1,-1),.45,colors.HexColor("#cedbd4")),
        ("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),
        ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
    ]))
    return [table, Spacer(1,8)]


def convert(nodes, width=WIDTH):
    result = []
    for tag in nodes:
        if not isinstance(tag, Tag):
            continue
        if "page-break" in tag.get("class", []):
            result.append(PageBreak())
        elif "screen" in tag.get("class", []):
            picture = tag.find("img", recursive=False)
            notes = tag.find("div", class_="ui-notes")
            image = Image(str(DOCS / picture["src"]))
            factor = 73 * mm / image.imageWidth
            image.drawWidth = 73 * mm
            image.drawHeight = image.imageHeight * factor
            row = Table([[image, convert(notes.children, 99*mm)]], colWidths=[79*mm,101*mm], hAlign="LEFT")
            row.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),
                                    ("LEFTPADDING",(0,0),(-1,-1),0),
                                    ("RIGHTPADDING",(0,0),(-1,-1),4),
                                    ("TOPPADDING",(0,0),(-1,-1),0)]))
            result.append(row)
        elif tag.name in ("h1","h2","h3"):
            result.append(paragraph(tag, tag.name))
        elif tag.name == "p":
            result.append(paragraph(tag, "small" if "small" in tag.get("class", []) else "body"))
        elif tag.name == "table":
            result.extend(table_for(tag,width))
        elif tag.name in ("ul","ol"):
            for i, li in enumerate(tag.find_all("li",recursive=False),1):
                result.append(Paragraph("".join(inline(c) for c in li.children), STYLES["bullet"],
                                        bulletText=f"{i}." if tag.name=="ol" else "•"))
        elif tag.name == "pre":
            lines = []
            for line in tag.get_text().splitlines():
                lines.extend(textwrap.wrap(line, width=86, subsequent_indent="    ", replace_whitespace=False,
                                           drop_whitespace=False) or [""])
            body = "<br/>".join(html.escape(line).replace(" ","&#160;") for line in lines)
            block = Table([[Paragraph(body,STYLES["code"])]],colWidths=[width],hAlign="LEFT")
            block.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#f3f6f4")),
                                       ("BOX",(0,0),(-1,-1),.45,colors.HexColor("#cedbd4")),
                                       ("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
            result.extend([block,Spacer(1,8)])
        elif tag.name == "hr":
            result.append(HRFlowable(width="100%",color=colors.HexColor("#cedbd4"),spaceBefore=6,spaceAfter=8))
        else:
            result.extend(convert(tag.children,width))
    return result


def chrome(title):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(GREEN)
        canvas.setFont("ClueBold",8.2)
        canvas.drawString(15*mm,A4[1]-12.8*mm,"CLUE DAY 2026  |  청구리")
        canvas.setFont("Clue",8)
        canvas.drawRightString(A4[0]-15*mm,A4[1]-12.8*mm,title)
        canvas.setStrokeColor(colors.HexColor("#cedbd4"))
        canvas.line(15*mm,15*mm,A4[0]-15*mm,15*mm)
        canvas.setFillColor(colors.HexColor("#5d6965"))
        canvas.drawString(15*mm,10*mm,f"한라봉귤흑돼지 · v0.2 · {DATE}")
        canvas.drawRightString(A4[0]-15*mm,10*mm,str(doc.page))
        canvas.restoreState()
    return draw


def build(name, title):
    source = (DOCS/f"{name}.md").read_text(encoding="utf-8-sig")
    body = markdown.markdown(source,extensions=["tables","fenced_code"])
    (DOCS/f"{name}.html").write_text(
        f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{html.escape(title)}</title>'
        f'<style>{CSS}</style></head><body>{body}</body></html>',encoding="utf-8")
    target = DOCS/f"{name}.pdf"
    doc = SimpleDocTemplate(str(target),pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,
                            topMargin=22*mm,bottomMargin=21*mm,title=title,
                            author="한라봉귤흑돼지",pageCompression=1)
    doc.build(convert(BeautifulSoup(body,"html.parser").children),onFirstPage=chrome(title),onLaterPages=chrome(title))
    reader = PdfReader(target)
    print(f"{name}.pdf: {len(reader.pages)} pages, {target.stat().st_size:,} bytes")
    if name == "UI시안" and len(reader.pages) != 7:
        raise RuntimeError("UI specification must contain an overview and six screen pages.")
    return target


def package(paths):
    folder = ROOT/"output"/"submission"/"2026_CLUEDAY_1차제출_한라봉귤흑돼지"
    folder.mkdir(parents=True,exist_ok=True)
    for path in paths:
        shutil.copy2(path,folder/path.name)
    guide = """2026 CLUE DAY 1차 제출 / 한라봉귤흑돼지 / 팀장 명지훈
기준: 2026.10.26 / 프로그램 v0.2 (cdc97da)

첨부할 파일: 기획서.pdf, API명세서.pdf, UI시안.pdf
UI/UX는 서로 다른 화면 6종과 화면별 동작 설명을 포함합니다.

전체 저장소: https://github.com/sunbbangpilsu/clueday-climate-claim
프론트: https://github.com/sunbbangpilsu/clueday-climate-claim/tree/main/frontend
백엔드: https://github.com/sunbbangpilsu/clueday-climate-claim/tree/main/backend

실행 방법:
1. Python 3.12 환경에서 backend 폴더로 이동
2. python -m pip install -r requirements.txt
3. python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
4. 같은 컴퓨터에서 http://127.0.0.1:8000/ 열기
시연: http://127.0.0.1:8000/?demo=1#result
API 상태: GET http://127.0.0.1:8000/api/health

화면 6개·API 6개, 서버 테스트 33개·화면 상태 테스트 7개를 확인했습니다.
실제 특보·OCR·푸시·기관 대시보드는 개발 예정입니다.
시연의 47만 원은 가정한 조건의 계산이며 실제 지급 확정액이 아닙니다.
요약서는 공식 청구서를 대체하지 않습니다.
"""
    (folder/"제출안내.txt").write_text(guide,encoding="utf-8-sig")
    archive = folder.with_suffix(".zip")
    with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
        for path in [folder / p.name for p in paths] + [folder / "제출안내.txt"]:
            z.write(path,path.name)
    print("Submission ZIP:",archive)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    init_fonts()
    paths = [build("기획서","서비스 기획안"),build("API명세서","API 명세서"),build("UI시안","UI/UX 시안 - 6개 화면")]
    package(paths)
