"""docs/*.md 를 인쇄용 HTML로 바꾸고 Edge(헤드리스)로 PDF를 만든다.

사용: python tools/build_docs.py
"""
import pathlib
import subprocess

import markdown

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

CSS = """
@page { size: A4; margin: 16mm 15mm; }
body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; font-size: 10.2pt; line-height: 1.6; color: #1b1f1d; }
h1 { font-size: 20pt; color: #0f5c4d; margin: 0 0 4pt; letter-spacing: -0.02em; }
h2 { font-size: 14pt; color: #0f5c4d; border-bottom: 2px solid #0f5c4d; padding-bottom: 3pt; margin-top: 18pt; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9.4pt; page-break-inside: avoid; }
th, td { border: 1px solid #b9c4bf; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { background: #e6f1ed; }
code { font-family: Consolas, monospace; background: #f1f4f3; padding: 0 3px; border-radius: 3px; font-size: 9pt; }
pre { background: #f6f8f7; border: 1px solid #dfe5e2; border-radius: 6px; padding: 8pt; font-size: 8.4pt; line-height: 1.45;
      white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
blockquote { margin: 8pt 0; padding: 6pt 10pt; background: #fff6ec; border-left: 4px solid #c2410c; }
hr { border: 0; border-top: 1px solid #dfe5e2; margin: 14pt 0; }
.screens { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6pt; margin: 8pt 0 10pt; page-break-inside: avoid; }
.screens figure { margin: 0; text-align: center; }
.screens img { width: 100%; border: 1px solid #cfd8d4; border-radius: 6px; }
.screens figcaption { font-size: 8pt; margin-top: 2pt; }
.footnote { font-size: 8.4pt; color: #444; }
.footnote ol { padding-left: 16pt; }
a { color: #0f5c4d; word-break: break-all; }
"""


def build(md_name, title):
    src = DOCS / md_name
    body = markdown.markdown(src.read_text(encoding="utf-8"), extensions=["tables", "fenced_code", "footnotes"])
    html = DOCS / (src.stem + ".html")
    html.write_text(f"<!doctype html><html lang='ko'><head><meta charset='utf-8'><title>{title}</title>"
                    f"<style>{CSS}</style></head><body>{body}</body></html>", encoding="utf-8")
    pdf = DOCS / (src.stem + ".pdf")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf}", html.as_uri()], check=True, capture_output=True, timeout=120)
    print("만듦:", pdf.name, pdf.stat().st_size, "bytes")


if __name__ == "__main__":
    build("기획서.md", "받을권리 서비스 기획안")
    build("API명세서.md", "받을권리 API 명세서")
