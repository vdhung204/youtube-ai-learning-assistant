# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(r"C:\Users\vuong\Documents\Codex\2026-08-27\d-a")
WORK = ROOT / "work" / "sds_build"
OUTPUT = ROOT / "outputs" / "SDS_YouTube_Learning_Companion_Standard.docx"
WORK.mkdir(parents=True, exist_ok=True)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = "17365D"
BLUE = "DCE6F1"
PALE = "F3F6FA"
GRAY = "666666"
BORDER = "D9D9D9"
BLACK = "000000"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=BORDER, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = borders.find(qn(f"w:{edge}"))
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_cant_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    if tr_pr.find(qn("w:cantSplit")) is None:
        tr_pr.append(OxmlElement("w:cantSplit"))


def set_col_width(cell, width_cm):
    cell.width = Cm(width_cm)
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:type"), "dxa")
    tc_w.set(qn("w:w"), str(int(width_cm / 2.54 * 1440)))


def set_run_font(run, name="Arial", size=None, bold=None, color=BLACK, italic=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def add_page_number(paragraph):
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)
    set_run_font(run, size=8, color=GRAY)


def add_toc_field(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = ' TOC \\o "1-2" \\h \\z \\u '
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "Mục lục sẽ được cập nhật khi mở tài liệu"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instruction, separate, placeholder, end])
    set_run_font(run, size=10)


def set_image_alt_text(inline_shape, title, description):
    doc_pr = inline_shape._inline.docPr
    doc_pr.set("title", title)
    doc_pr.set("descr", description)


REGULAR_FONT = r"C:\Windows\Fonts\arial.ttf"
BOLD_FONT = r"C:\Windows\Fonts\arialbd.ttf"


def pil_font(size, bold=False):
    return ImageFont.truetype(BOLD_FONT if bold else REGULAR_FONT, size)


def center_text(draw, rect, title, subtitle="", title_size=30, subtitle_size=22):
    x1, y1, x2, y2 = rect
    title_font = pil_font(title_size, bold=True)
    subtitle_font = pil_font(subtitle_size)
    tb = draw.textbbox((0, 0), title, font=title_font)
    tx = x1 + (x2 - x1 - (tb[2] - tb[0])) / 2
    ty = y1 + (y2 - y1) * (0.35 if subtitle else 0.50) - (tb[3] - tb[1]) / 2
    draw.text((tx, ty), title, font=title_font, fill="#000000")
    if subtitle:
        lines = subtitle.split("\n")
        total_h = len(lines) * (subtitle_size + 5)
        sy = y1 + (y2 - y1) * 0.68 - total_h / 2
        for line in lines:
            sb = draw.textbbox((0, 0), line, font=subtitle_font)
            sx = x1 + (x2 - x1 - (sb[2] - sb[0])) / 2
            draw.text((sx, sy), line, font=subtitle_font, fill="#333333")
            sy += subtitle_size + 5


def pil_box(draw, rect, title, subtitle="", fill="#F3F6FA", title_size=30, subtitle_size=22):
    draw.rounded_rectangle(rect, radius=18, fill=fill, outline="#17365D", width=3)
    center_text(draw, rect, title, subtitle, title_size, subtitle_size)


def pil_arrow(draw, start, end, label=None, label_offset=(0, -28)):
    draw.line([start, end], fill="#4A4A4A", width=4)
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    tip = end
    base = (end[0] - ux * 18, end[1] - uy * 18)
    left = (base[0] + px * 9, base[1] + py * 9)
    right = (base[0] - px * 9, base[1] - py * 9)
    draw.polygon([tip, left, right], fill="#4A4A4A")
    if label:
        font = pil_font(20)
        mx = (start[0] + end[0]) / 2 + label_offset[0]
        my = (start[1] + end[1]) / 2 + label_offset[1]
        lb = draw.textbbox((0, 0), label, font=font)
        draw.rectangle((mx - (lb[2] - lb[0]) / 2 - 5, my - 3,
                        mx + (lb[2] - lb[0]) / 2 + 5, my + (lb[3] - lb[1]) + 4), fill="white")
        draw.text((mx - (lb[2] - lb[0]) / 2, my), label, font=font, fill="#333333")


def image_title(draw, text, width):
    font = pil_font(40, bold=True)
    bb = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (bb[2] - bb[0])) / 2, 35), text, font=font, fill="#000000")


def make_architecture_diagram(path):
    width, height = 2000, 1050
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    image_title(draw, "Kiến trúc logic của hệ thống", width)

    pil_box(draw, (80, 190, 430, 380), "YouTube", "Video và player", fill="#FFFFFF")
    pil_box(draw, (610, 150, 1150, 420), "Chrome Extension", "React  TypeScript\nManifest V3")
    pil_box(draw, (1380, 190, 1900, 380), "Google OAuth và Gemini", "Token chỉ gửi tới Google", fill="#EAF2F8")
    pil_arrow(draw, (430, 285), (610, 285), "Video ID và timestamp")
    pil_arrow(draw, (1150, 230), (1380, 230), "OAuth và AI")
    pil_arrow(draw, (1380, 340), (1150, 340), "Kết quả AI", label_offset=(0, 10))

    pil_box(draw, (610, 500, 1150, 710), "FastAPI Backend", "REST API  job worker\nvalidation", fill="#E8EEF7")
    pil_arrow(draw, (880, 420), (880, 500), "HTTPS JSON", label_offset=(90, -12))
    pil_arrow(draw, (800, 500), (800, 420))

    pil_box(draw, (80, 820, 520, 990), "MySQL", "Người dùng  video\nghi chú  kết quả")
    pil_box(draw, (760, 820, 1240, 990), "ChromaDB", "Vector và metadata chunk")
    pil_box(draw, (1480, 820, 1930, 990), "Embedding cục bộ", "Sentence Transformers\nđa ngôn ngữ")
    pil_arrow(draw, (710, 710), (350, 820))
    pil_arrow(draw, (880, 710), (1000, 820))
    pil_arrow(draw, (1080, 710), (1700, 820))
    image.save(path)


def make_oauth_diagram(path):
    width, height = 2100, 850
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    image_title(draw, "Luồng đăng nhập và kiểm tra quyền Gemini", width)
    labels = [
        ("Mở sidebar", "Extension kiểm tra phiên"),
        ("Kiểm tra im lặng", "getAuthToken\ninteractive false"),
        ("Đăng nhập có chủ đích", "Người dùng bấm nút"),
        ("Xác thực Gemini", "Request nhẹ tới Google"),
        ("Sẵn sàng", "Tải dữ liệu video"),
    ]
    xs = [60, 480, 900, 1320, 1740]
    for x, (title, subtitle) in zip(xs, labels):
        pil_box(draw, (x, 260, x + 310, 520), title, subtitle, title_size=27, subtitle_size=20)
    for i in range(len(xs) - 1):
        pil_arrow(draw, (xs[i] + 310, 390), (xs[i + 1], 390))
    note_font = pil_font(25)
    note = "Extension không đọc cookie AI Studio và không lưu access token trong MySQL hoặc log"
    bb = draw.textbbox((0, 0), note, font=note_font)
    draw.text(((width - (bb[2] - bb[0])) / 2, 690), note, font=note_font, fill="#333333")
    image.save(path)


def make_rag_diagram(path):
    width, height = 2300, 850
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    image_title(draw, "Luồng hỏi đáp dựa trên transcript", width)
    labels = [
        ("Câu hỏi", "Extension"),
        ("Embedding", "Backend cục bộ"),
        ("Vector search", "ChromaDB"),
        ("Context", "Chunk và timestamp"),
        ("Gemini", "Gọi bằng OAuth"),
        ("Trả lời", "Citation và timestamp"),
    ]
    xs = [40, 420, 800, 1180, 1560, 1940]
    for x, (title, subtitle) in zip(xs, labels):
        pil_box(draw, (x, 270, x + 300, 515), title, subtitle, title_size=28, subtitle_size=20)
    for i in range(len(xs) - 1):
        pil_arrow(draw, (xs[i] + 300, 392), (xs[i + 1], 392))
    note_font = pil_font(25)
    note = "Context không đủ dữ kiện thì hệ thống trả trạng thái không tìm thấy"
    bb = draw.textbbox((0, 0), note, font=note_font)
    draw.text(((width - (bb[2] - bb[0])) / 2, 690), note, font=note_font, fill="#333333")
    image.save(path)


def make_deployment_diagram(path):
    width, height = 2200, 1050
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    image_title(draw, "Kiến trúc triển khai mục tiêu", width)

    pil_box(draw, (80, 190, 520, 410), "Máy người dùng", "Chrome Stable\nExtension Manifest V3", fill="#FFFFFF")
    pil_box(draw, (750, 150, 1450, 450), "Môi trường ứng dụng", "Reverse proxy HTTPS\nFastAPI API  Job Worker", fill="#E8EEF7")
    pil_box(draw, (1690, 190, 2120, 410), "Google", "OAuth 2.0\nGemini API", fill="#EAF2F8")
    pil_arrow(draw, (520, 285), (750, 285), "HTTPS JSON")
    pil_arrow(draw, (1450, 285), (1690, 285), "OAuth và AI")

    pil_box(draw, (520, 690, 930, 920), "MySQL", "Dữ liệu nghiệp vụ\nbackup định kỳ")
    pil_box(draw, (1090, 690, 1500, 920), "ChromaDB", "Vector và metadata\nvolume bền vững")
    pil_box(draw, (1660, 690, 2070, 920), "Quan sát hệ thống", "Log  metric  health\nkhông chứa credential")
    pil_arrow(draw, (950, 450), (725, 690))
    pil_arrow(draw, (1100, 450), (1295, 690))
    pil_arrow(draw, (1320, 450), (1850, 690))
    image.save(path)


ARCH = WORK / "architecture.png"
OAUTH = WORK / "oauth_flow.png"
RAG = WORK / "rag_flow.png"
DEPLOY = WORK / "deployment.png"
make_architecture_diagram(ARCH)
make_oauth_diagram(OAUTH)
make_rag_diagram(RAG)
make_deployment_diagram(DEPLOY)


doc = Document()
section = doc.sections[0]
section.page_width = Cm(21.0)
section.page_height = Cm(29.7)
section.top_margin = Cm(2.0)
section.bottom_margin = Cm(1.8)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.0)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Arial"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
normal.font.size = Pt(10.5)
normal.font.color.rgb = RGBColor(0, 0, 0)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.08

for style_name, size, before, after in [
    ("Title", 24, 0, 8),
    ("Subtitle", 13, 0, 12),
    ("Heading 1", 16, 14, 7),
    ("Heading 2", 12.5, 11, 5),
    ("Heading 3", 11, 8, 3),
]:
    st = styles[style_name]
    st.font.name = "Arial"
    st._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    st._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    st._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    st.font.size = Pt(size)
    st.font.bold = style_name != "Subtitle"
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.paragraph_format.space_before = Pt(before)
    st.paragraph_format.space_after = Pt(after)
    st.paragraph_format.keep_with_next = True

# Loại bỏ đường kẻ mặc định của Title để trang bìa thuần văn bản, dễ in và phê duyệt.
title_ppr = styles["Title"].element.get_or_add_pPr()
title_border = title_ppr.find(qn("w:pBdr"))
if title_border is not None:
    title_ppr.remove(title_border)

for list_name in ("List Bullet", "List Bullet 2", "List Number", "List Number 2"):
    st = styles[list_name]
    st.font.name = "Arial"
    st._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    st._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    st._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    st.font.size = Pt(10.5)
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.paragraph_format.space_after = Pt(3)

if "Code Block" not in styles:
    code_style = styles.add_style("Code Block", WD_STYLE_TYPE.PARAGRAPH)
else:
    code_style = styles["Code Block"]
code_style.font.name = "Consolas"
code_style._element.rPr.rFonts.set(qn("w:ascii"), "Consolas")
code_style._element.rPr.rFonts.set(qn("w:hAnsi"), "Consolas")
code_style.font.size = Pt(8.5)
code_style.font.color.rgb = RGBColor(0, 0, 0)
code_style.paragraph_format.left_indent = Cm(0.5)
code_style.paragraph_format.right_indent = Cm(0.3)
code_style.paragraph_format.space_before = Pt(3)
code_style.paragraph_format.space_after = Pt(6)

if "Caption Custom" not in styles:
    cap_style = styles.add_style("Caption Custom", WD_STYLE_TYPE.PARAGRAPH)
else:
    cap_style = styles["Caption Custom"]
cap_style.font.name = "Arial"
cap_style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
cap_style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
cap_style.font.size = Pt(9)
cap_style.font.italic = True
cap_style.font.color.rgb = RGBColor.from_string(GRAY)
cap_style.paragraph_format.space_before = Pt(3)
cap_style.paragraph_format.space_after = Pt(8)

if "TOC Heading Custom" not in styles:
    toc_heading_style = styles.add_style("TOC Heading Custom", WD_STYLE_TYPE.PARAGRAPH)
else:
    toc_heading_style = styles["TOC Heading Custom"]
toc_heading_style.font.name = "Arial"
toc_heading_style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
toc_heading_style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
toc_heading_style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
toc_heading_style.font.size = Pt(16)
toc_heading_style.font.bold = True
toc_heading_style.font.color.rgb = RGBColor(0, 0, 0)
toc_heading_style.paragraph_format.space_before = Pt(14)
toc_heading_style.paragraph_format.space_after = Pt(7)
toc_heading_style.paragraph_format.keep_with_next = True

for toc_style_name, toc_size, toc_indent in [("TOC 1", 10.0, 0.0), ("TOC 2", 9.5, 0.5)]:
    if toc_style_name not in styles:
        toc_style = styles.add_style(toc_style_name, WD_STYLE_TYPE.PARAGRAPH)
    else:
        toc_style = styles[toc_style_name]
    toc_style.font.name = "Arial"
    toc_style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    toc_style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    toc_style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    toc_style.font.size = Pt(toc_size)
    toc_style.font.color.rgb = RGBColor(0, 0, 0)
    toc_style.paragraph_format.left_indent = Cm(toc_indent)
    toc_style.paragraph_format.space_after = Pt(2)


def add_para(text="", bold_lead=None, style=None, align=None, keep=False):
    p = doc.add_paragraph(style=style)
    if bold_lead and text.startswith(bold_lead):
        r1 = p.add_run(bold_lead)
        set_run_font(r1, bold=True)
        r2 = p.add_run(text[len(bold_lead):])
        set_run_font(r2)
    else:
        r = p.add_run(text)
        set_run_font(r)
    if align is not None:
        p.alignment = align
    p.paragraph_format.keep_together = keep
    return p


def add_bullet(text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    r = p.add_run(text)
    set_run_font(r)
    return p


number_counter = 0


def reset_numbering():
    global number_counter
    number_counter = 0


def add_number(text, level=0):
    global number_counter
    number_counter += 1
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.65 + level * 0.6)
    p.paragraph_format.first_line_indent = Cm(-0.65)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{number_counter}.  {text}")
    set_run_font(r)
    return p


def add_heading(text, level=1):
    return doc.add_heading(text, level=level)


def add_table(headers, rows, widths=None, font_size=8.8, repeat=True):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    hdr = table.rows[0]
    set_row_cant_split(hdr)
    if repeat:
        set_repeat_table_header(hdr)
    for i, header in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_shading(cell, NAVY)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if widths:
            set_col_width(cell, widths[i])
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(str(header))
        set_run_font(r, size=font_size, bold=True, color="FFFFFF")
    for ridx, row in enumerate(rows):
        table_row = table.add_row()
        set_row_cant_split(table_row)
        cells = table_row.cells
        for i, value in enumerate(row):
            cell = cells[i]
            if ridx % 2 == 1:
                set_cell_shading(cell, PALE)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if widths:
                set_col_width(cell, widths[i])
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            if i == 0 and len(str(value)) <= 18:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(str(value))
            set_run_font(r, size=font_size)
    set_table_borders(table)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_figure(path, width_cm, caption, alt):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_together = True
    shape = p.add_run().add_picture(str(path), width=Cm(width_cm))
    set_image_alt_text(shape, caption, alt)
    cap = doc.add_paragraph(caption, style="Caption Custom")
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.keep_with_next = False


def add_code(lines):
    p = doc.add_paragraph(style="Code Block")
    r = p.add_run(lines)
    set_run_font(r, name="Consolas", size=8.5)
    p.paragraph_format.keep_together = True
    return p


# Footer
header = section.header
hp = header.paragraphs[0]
hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
hr = hp.add_run("YLC SDD 001   Phiên bản 2 0   Trình phê duyệt")
set_run_font(hr, size=8, color=GRAY)

footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = fp.add_run("YouTube Learning Companion   YLC SDD 001   Phiên bản 2 0   Trang ")
set_run_font(r, size=8, color=GRAY)
add_page_number(fp)


# Cover
p = doc.add_paragraph(style="Title")
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(90)
cover_ppr = p._p.get_or_add_pPr()
cover_border = cover_ppr.find(qn("w:pBdr"))
if cover_border is not None:
    cover_ppr.remove(cover_border)
r = p.add_run("Đặc tả thiết kế phần mềm YouTube Learning Companion")
set_run_font(r, size=24, bold=True)

p = doc.add_paragraph(style="Subtitle")
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Tài liệu thiết kế dùng cho phê duyệt và triển khai")
set_run_font(r, size=13, color=BLACK)

doc.add_paragraph().paragraph_format.space_after = Pt(30)

add_table(
    ["Thuộc tính", "Giá trị"],
    [
        ["Mã tài liệu", "YLC-SDD-001"],
        ["Tên hệ thống", "YouTube Learning Companion"],
        ["Loại tài liệu", "Software Design Description and Specification"],
        ["Cơ sở chuẩn", "IEEE 1016-2009 và ISO/IEC/IEEE 42010:2022"],
        ["Phiên bản", "2.0"],
        ["Ngày ban hành", "05/09/2026"],
        ["Đơn vị lập", "Nhóm dự án YouTube Learning Companion"],
        ["Trạng thái", "Trình phê duyệt"],
        ["Phân loại", "Lưu hành theo phạm vi dự án"],
    ],
    widths=[4.2, 11.2], font_size=9.5
)

doc.add_paragraph().paragraph_format.space_after = Pt(20)
p = add_para(
    "Tài liệu xác định thiết kế được đề nghị phê duyệt cho Chrome Extension hỗ trợ học tập trên YouTube. "
    "Nội dung bao gồm kiến trúc, giao diện, dữ liệu, bảo mật, truy vết yêu cầu và phương án kiểm chứng. "
    "Mọi thay đổi làm ảnh hưởng ranh giới kiến trúc hoặc tiêu chí nghiệm thu phải được quản lý theo quy trình tại mục 18.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

doc.add_page_break()

# Document control and summary
add_heading("Kiểm soát tài liệu", 1)
add_table(
    ["Phiên bản", "Ngày", "Nội dung", "Trạng thái"],
    [
        ["1.0", "05/09/2026", "Baseline thiết kế phục vụ triển khai nội bộ", "Đã thay thế"],
        ["2.0", "05/09/2026", "Chuẩn hóa stakeholder, viewpoint, quyết định kiến trúc, truy vết và phê duyệt", "Trình phê duyệt"],
    ],
    widths=[2.2, 2.8, 8.2, 2.4], font_size=8.8
)

add_heading("Phê duyệt tài liệu", 1)
add_table(
    ["Vai trò", "Họ và tên", "Xác nhận", "Ngày"],
    [
        ["Người lập", "", "", ""],
        ["Chủ trì kỹ thuật", "", "", ""],
        ["Đại diện QA và bảo mật", "", "", ""],
        ["Người phê duyệt", "", "", ""],
    ],
    widths=[4.2, 4.6, 4.0, 2.8], font_size=8.8
)

add_heading("Phạm vi phát hành", 2)
add_para(
    "Tài liệu được phát hành cho người phê duyệt, chủ trì dự án và bốn thành viên triển khai. "
    "Bản có trạng thái Trình phê duyệt chưa phải lệnh triển khai. Sau khi ký duyệt, phiên bản được gắn trạng thái Đã phê duyệt và trở thành baseline kiểm soát thay đổi.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("Tuyên bố áp dụng chuẩn", 2)
add_para(
    "Tài liệu áp dụng có điều chỉnh các nguyên tắc về nội dung mô tả thiết kế của IEEE 1016-2009 và các khái niệm stakeholder, concern, viewpoint, view, correspondence và rationale của ISO/IEC/IEEE 42010:2022. "
    "Mức áp dụng và các điều chỉnh theo phạm vi dự án được đối chiếu tại mục 18. Tài liệu không tuyên bố được ISO hoặc IEEE chứng nhận.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

doc.add_page_break()

add_heading("Tóm tắt điều hành", 1)
add_para(
    "YouTube Learning Companion bổ sung một sidebar trên trang YouTube để người dùng tóm tắt video, "
    "xem chapter, tìm kiếm transcript, hỏi đáp với nội dung video, lưu ghi chú và tạo công cụ ôn tập. "
    "Sản phẩm giữ YouTube làm môi trường sử dụng chính và không thay thế nền tảng xem video.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)
add_para(
    "Thiết kế kỹ thuật sử dụng React và TypeScript cho Chrome Extension Manifest V3, FastAPI cho backend, "
    "MySQL cho dữ liệu nghiệp vụ, ChromaDB cho vector search và Sentence Transformers cục bộ cho embedding. "
    "Gemini là dịch vụ sinh nội dung duy nhất. Extension lấy OAuth token bằng Chrome Identity API và gọi "
    "Gemini trực tiếp; backend không lưu hoặc ghi log token này.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)
add_para(
    "Trước khi triển khai đầy đủ các chức năng AI, nhóm phải hoàn thành ba thử nghiệm bắt buộc: lấy transcript "
    "có timestamp, điều khiển YouTube Player và xác nhận cơ chế OAuth cùng quota Gemini trên nhiều tài khoản. "
    "Nếu một thử nghiệm không đạt, kiến trúc liên quan phải được cập nhật qua quyết định thiết kế có review.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("Các quyết định cần phê duyệt", 2)
add_table(
    ["Mã", "Quyết định", "Đề xuất", "Điều kiện"],
    [
        ["D01", "Phạm vi MVP", "OAuth, Video ID, timestamp, transcript, summary, chapter, search, Ask Video và bookmark", "Quiz, flashcard và history triển khai sau MVP"],
        ["D02", "Xác thực Gemini", "Google OAuth qua chrome.identity", "Không đọc cookie AI Studio và không nhúng API key"],
        ["D03", "Vector search", "Sentence Transformers cục bộ và ChromaDB", "Chốt model sau benchmark tiếng Việt và tiếng Anh"],
        ["D04", "Xử lý nền", "Worker đọc processing_jobs từ MySQL", "Đủ cho MVP; đánh giá queue chuyên dụng khi tăng tải"],
        ["D05", "Bảo quản token", "Token Gemini chỉ tồn tại trong Chrome token cache", "Backend không nhận và không lưu token Gemini"],
    ],
    widths=[1.2, 3.2, 6.3, 4.9], font_size=8.2
)

doc.add_paragraph("Mục lục nội dung", style="TOC Heading Custom")
toc_paragraph = doc.add_paragraph()
add_toc_field(toc_paragraph)

doc.add_page_break()

# 1
add_heading("1 Mục đích và phạm vi", 1)
add_heading("1 1 Mục đích", 2)
add_para(
    "SDS này mô tả cấu trúc phần mềm, trách nhiệm của từng thành phần, mô hình dữ liệu, hợp đồng API, "
    "luồng AI, kiểm soát bảo mật và tiêu chí kiểm thử của YouTube Learning Companion. Nhóm phát triển dùng "
    "tài liệu làm baseline triển khai; quản lý dùng tài liệu để xem xét phạm vi, rủi ro và điều kiện nghiệm thu.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("1 2 Phạm vi trong phiên bản đầu", 2)
for item in [
    "Nhận diện video YouTube hiện tại và theo dõi thay đổi khi trang điều hướng theo kiểu SPA.",
    "Hiển thị sidebar, đọc thời gian hiện tại và chuyển player đến timestamp được chọn.",
    "Thu thập, làm sạch, chia chunk và lập chỉ mục transcript.",
    "Tạo summary, chapter, concept, tìm kiếm ngữ nghĩa và Ask Video kèm timestamp.",
    "Lưu bookmark và các dữ liệu học tập được đưa vào phạm vi sprint đã phê duyệt.",
    "Đăng nhập Google bằng OAuth và sử dụng Gemini mà không nhúng API key trong extension.",
]:
    add_bullet(item)

add_heading("1 3 Phạm vi ngoài phiên bản đầu", 2)
for item in [
    "Tổng hợp kiến thức từ nhiều video và phân tích điểm kiến thức còn yếu.",
    "Đề xuất video tự động, mạng xã hội, thanh toán và ứng dụng mobile.",
    "Thay thế YouTube bằng một nền tảng học tập độc lập.",
    "Đảm bảo xử lý được video không có transcript hoặc video bị giới hạn quyền truy cập.",
]:
    add_bullet(item)

add_heading("1 4 Thuật ngữ", 2)
add_table(
    ["Thuật ngữ", "Định nghĩa"],
    [
        ["SDD SDS", "Software Design Description and Specification, tài liệu mô tả và đặc tả thiết kế phần mềm"],
        ["MVP", "Phiên bản nhỏ nhất có thể trình diễn và nghiệm thu luồng chính"],
        ["Transcript", "Nội dung lời nói của video kèm mốc thời gian"],
        ["Chunk", "Đoạn transcript được chia nhỏ để lập chỉ mục và truy xuất"],
        ["Embedding", "Vector biểu diễn ngữ nghĩa của chunk hoặc câu hỏi"],
        ["RAG", "Luồng truy xuất các chunk liên quan trước khi yêu cầu mô hình tạo câu trả lời"],
        ["Citation", "Tham chiếu từ câu trả lời tới đoạn transcript và timestamp"],
        ["OAuth token", "Thông tin ủy quyền ngắn hạn do Google cấp cho extension"],
        ["Stakeholder", "Cá nhân hoặc nhóm có lợi ích, trách nhiệm hoặc quyền quyết định đối với hệ thống"],
        ["Concern", "Mối quan tâm cần được kiến trúc giải quyết hoặc chứng minh"],
        ["Viewpoint", "Quy ước xác định mục đích, đối tượng và mô hình dùng để lập một architecture view"],
    ],
    widths=[3.4, 12.2], font_size=8.8
)

add_heading("1 5 Đối tượng sử dụng tài liệu", 2)
add_table(
    ["Đối tượng", "Mục đích sử dụng", "Phần cần xem"],
    [
        ["Người phê duyệt", "Phê duyệt phạm vi, rủi ro, nguồn lực và điều kiện nghiệm thu", "Tóm tắt điều hành, mục 3, 4, 14, 15 và 18"],
        ["Chủ trì kỹ thuật", "Kiểm soát ranh giới kiến trúc và quyết định thiết kế", "Mục 4 đến 13"],
        ["Nhóm phát triển", "Triển khai module theo interface và schema thống nhất", "Mục 5 đến 12 và 16"],
        ["QA và bảo mật", "Lập kế hoạch xác minh, kiểm thử và chấp nhận", "Mục 10, 12, 14 và ma trận truy vết"],
    ],
    widths=[3.4, 7.0, 5.2], font_size=8.2
)

# 2
add_heading("2 Mục tiêu thiết kế và ràng buộc", 1)
add_heading("2 1 Mục tiêu thiết kế", 2)
for item in [
    "Kết quả AI phải có thể kiểm chứng bằng transcript và timestamp.",
    "Extension phải chịu được việc người dùng chuyển video mà YouTube không reload toàn bộ trang.",
    "Backend phải xử lý idempotent để một video không tạo nhiều job trùng lặp.",
    "Token Gemini không đi qua backend và không xuất hiện trong dữ liệu lưu trữ hoặc log.",
    "Các module phải giao tiếp qua schema ổn định để bốn thành viên có thể phát triển song song.",
    "MVP phải chạy được trên môi trường demo với quy trình cài đặt có thể lặp lại.",
]:
    add_bullet(item)

add_heading("2 2 Ràng buộc", 2)
add_table(
    ["Nhóm", "Ràng buộc thiết kế"],
    [
        ["Nền tảng", "Chrome Extension Manifest V3 hoạt động trên trang YouTube"],
        ["AI", "Chỉ sử dụng Gemini cho sinh nội dung; không dùng key của OpenAI, Claude hoặc provider khác"],
        ["Xác thực", "Sử dụng Google OAuth; không đọc hoặc tái sử dụng cookie AI Studio"],
        ["Backend", "Python, FastAPI và REST API"],
        ["Dữ liệu", "MySQL lưu dữ liệu nghiệp vụ; ChromaDB lưu vector và metadata liên quan"],
        ["Bảo mật", "Không lưu password, cookie hoặc Gemini access token"],
        ["Phạm vi", "Ưu tiên luồng MVP trước các chức năng quiz, flashcard và learning history"],
    ],
    widths=[3.0, 12.6], font_size=8.7
)

add_heading("2 3 Giả định", 2)
for item in [
    "Người dùng sử dụng Chrome và chủ động mở extension trên trang video YouTube.",
    "Video có transcript hợp lệ thì mới được đưa vào pipeline AI.",
    "Mỗi video được định danh bằng YouTube Video ID và có thể được nhiều người dùng tham chiếu.",
    "Môi trường triển khai backend hỗ trợ HTTPS, MySQL và lưu trữ bền vững cho ChromaDB.",
    "Mô hình embedding đa ngôn ngữ được chọn sau khi benchmark bộ dữ liệu tiếng Việt và tiếng Anh.",
]:
    add_bullet(item)

add_heading("2 4 Cơ sở chuẩn và phương pháp điều chỉnh", 2)
add_table(
    ["Tài liệu chuẩn", "Nội dung áp dụng", "Cách áp dụng cho dự án"],
    [
        ["IEEE 1016-2009", "Nội dung và tổ chức của Software Design Description; IEEE hiện xếp trạng thái Inactive Reserved", "Dùng làm hướng dẫn nội dung design view, interface, dữ liệu, hành vi, quyết định và rationale"],
        ["ISO/IEC/IEEE 42010:2022", "Stakeholder, concern, viewpoint, view, correspondence và architecture rationale", "Xác định rõ đối tượng, mối quan tâm, các view và quan hệ giữa view tại mục 4"],
        ["ISO/IEC 25010:2023", "Mô hình chất lượng sản phẩm", "Dùng làm cơ sở nhóm các yêu cầu phi chức năng và mục tiêu kiểm chứng"],
    ],
    widths=[4.0, 5.6, 6.0], font_size=8.0
)
add_para(
    "Việc điều chỉnh loại bỏ các view không tạo giá trị kiểm soát cho MVP, nhưng không loại bỏ thông tin cần thiết để người phê duyệt đánh giá kiến trúc. "
    "Mọi điểm chưa chốt được ghi thành quyết định mở có chủ trì và hạn chốt tại mục 15.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

# 3 requirements
add_heading("3 Yêu cầu hệ thống", 1)
add_heading("3 1 Yêu cầu chức năng", 2)
fr_rows = [
    ["FR01", "Đăng nhập Google", "Extension kiểm tra token im lặng và chỉ mở OAuth sau thao tác của người dùng", "MVP"],
    ["FR02", "Nhận diện video", "Lấy Video ID, tiêu đề và phát hiện thay đổi video", "MVP"],
    ["FR03", "Điều khiển thời gian", "Đọc timestamp hiện tại và seek đến timestamp được chọn", "MVP"],
    ["FR04", "Thu thập transcript", "Lấy transcript, ngôn ngữ và timestamp nguồn", "MVP"],
    ["FR05", "Xử lý transcript", "Làm sạch, gộp segment, chia chunk và lưu metadata", "MVP"],
    ["FR06", "Tạo summary", "Sinh tóm tắt bám sát transcript", "MVP"],
    ["FR07", "Tạo chapter", "Sinh chapter theo thứ tự và kèm timestamp", "MVP"],
    ["FR08", "Nhận diện concept", "Tạo danh sách khái niệm và timestamp nguồn", "Sau MVP"],
    ["FR09", "Tìm kiếm", "Tìm kiếm từ khóa và ngữ nghĩa trong transcript", "MVP"],
    ["FR10", "Ask Video", "Trả lời dựa trên context truy xuất và kèm citation", "MVP"],
    ["FR11", "Bookmark", "Lưu đoạn quan trọng tại timestamp hiện tại", "MVP"],
    ["FR12", "Notes", "Tạo, sửa, xóa và xem ghi chú theo video", "Sau MVP"],
    ["FR13", "Quiz", "Sinh câu hỏi, đáp án, giải thích và timestamp", "Sau MVP"],
    ["FR14", "Flashcard", "Sinh và lưu thẻ hỏi đáp từ transcript", "Sau MVP"],
    ["FR15", "Learning History", "Theo dõi video, quiz và hoạt động học tập", "Sau MVP"],
    ["FR16", "Xử lý trạng thái", "Hiển thị loading, retry, empty state và lỗi có hướng dẫn", "MVP"],
]
add_table(["Mã", "Chức năng", "Yêu cầu", "Ưu tiên"], fr_rows, widths=[1.3, 3.2, 8.6, 2.5], font_size=7.8)

add_heading("3 2 Yêu cầu phi chức năng", 2)
nfr_rows = [
    ["NFR01", "Bảo mật", "Không lưu Gemini token, cookie hoặc password; mọi kết nối backend dùng HTTPS"],
    ["NFR02", "Quyền tối thiểu", "Manifest chỉ khai báo permission và host permission cần cho chức năng"],
    ["NFR03", "Hiệu năng giao diện", "Thao tác mở sidebar và seek phản hồi trong khoảng một giây trên máy kiểm thử"],
    ["NFR04", "Hiệu năng dữ liệu", "Kết quả đã cache trả về trong mục tiêu hai giây ở môi trường demo"],
    ["NFR05", "Hiệu năng search", "Semantic search có mục tiêu phản hồi dưới ba giây với video đã lập chỉ mục"],
    ["NFR06", "Tin cậy", "Job có trạng thái rõ ràng, timeout và retry có giới hạn"],
    ["NFR07", "Tính đúng AI", "Câu trả lời ngoài transcript phải được từ chối hoặc đánh dấu không đủ dữ kiện"],
    ["NFR08", "Khả năng bảo trì", "Module tách theo trách nhiệm; schema và prompt được version hóa"],
    ["NFR09", "Khả năng kiểm thử", "Luồng MVP có unit, integration và end to end test"],
    ["NFR10", "Khả năng truy cập", "Sidebar dùng được bằng bàn phím và có nhãn cho điều khiển"],
    ["NFR11", "Quan sát hệ thống", "Log có request ID và job ID nhưng loại bỏ credential"],
    ["NFR12", "Tương thích", "Hỗ trợ Chrome Stable trên môi trường được nhóm công bố"],
]
add_table(["Mã", "Thuộc tính", "Mục tiêu kiểm chứng"], nfr_rows, widths=[1.4, 3.3, 10.9], font_size=8.0)

# 4 architecture
add_heading("4 Kiến trúc tổng thể", 1)
add_para(
    "Kiến trúc chia hệ thống thành ba vùng trách nhiệm. Chrome Extension quản lý giao diện, YouTube Player, "
    "Google OAuth và các request Gemini. FastAPI quản lý transcript, dữ liệu nghiệp vụ, job và search. "
    "MySQL cùng ChromaDB cung cấp lưu trữ bền vững cho dữ liệu quan hệ và vector.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)
add_figure(ARCH, 16.2, "Hình 1 Kiến trúc logic của YouTube Learning Companion",
           "YouTube kết nối với Chrome Extension. Extension kết nối Google OAuth và Gemini, đồng thời gọi FastAPI. FastAPI sử dụng MySQL, ChromaDB và mô hình embedding cục bộ.")

add_heading("4 1 Stakeholder và concern", 2)
add_table(
    ["Stakeholder", "Concern cần giải quyết", "Bằng chứng thiết kế"],
    [
        ["Người phê duyệt", "Phạm vi, chi phí vận hành, rủi ro và khả năng nghiệm thu", "Mục 3, 14, 15 và 18"],
        ["Người học", "Đăng nhập rõ ràng, phản hồi đúng video, timestamp chính xác và dữ liệu riêng tư", "Mục 5, 10, 11 và 12"],
        ["Frontend", "Ranh giới extension, trạng thái sidebar, YouTube Adapter và OAuth", "Mục 5 và hợp đồng API mục 9"],
        ["Backend", "Idempotency, dữ liệu, job, session, lỗi và vận hành", "Mục 6, 8, 9, 12 và 13"],
        ["AI và RAG", "Chất lượng transcript, retrieval, grounded answer và schema đầu ra", "Mục 7 và tiêu chí AI mục 14"],
        ["QA và bảo mật", "Truy vết, quyền tối thiểu, token leakage và kiểm thử đầu cuối", "Mục 10, 14 và ma trận truy vết"],
    ],
    widths=[3.0, 7.0, 5.6], font_size=8.0
)

add_heading("4 2 Architecture viewpoint", 2)
add_table(
    ["Mã và viewpoint", "Concern chính", "Stakeholder", "Model kind và vị trí"],
    [
        ["VP01 Context", "Ranh giới hệ thống và phụ thuộc bên ngoài", "Người phê duyệt và toàn nhóm", "Component context bằng hộp và luồng có nhãn tại Hình 1"],
        ["VP02 Logical", "Phân rã trách nhiệm và kiểm soát coupling", "Nhóm kỹ thuật", "Component và module view tại mục 4 3, 5, 6 và 7"],
        ["VP03 Information", "Thực thể, khóa, version và nguồn dữ liệu chính", "Backend, AI và QA", "Entity và state table tại mục 8"],
        ["VP04 Interface", "Hợp đồng liên thành phần và quyền truy cập", "Frontend, Backend và QA", "Message table và REST resource table tại mục 5 3 và 9"],
        ["VP05 Behavior", "Trạng thái, trình tự và điều kiện lỗi", "Toàn nhóm", "State model và numbered flow tại mục 5 2, 6 2, 11 và 12"],
        ["VP06 Deployment", "Node chạy, kết nối, storage và vận hành", "Backend, QA và quản lý", "Deployment diagram và control table tại mục 13"],
        ["VP07 Verification", "Truy vết và bằng chứng nghiệm thu", "QA và người phê duyệt", "Test strategy và traceability matrix tại mục 14"],
    ],
    widths=[2.7, 4.3, 3.6, 5.0], font_size=7.4
)

add_heading("4 3 Trách nhiệm thành phần", 2)
add_table(
    ["Thành phần", "Trách nhiệm", "Không chịu trách nhiệm"],
    [
        ["Chrome Extension", "UI, Video ID, timestamp, OAuth, gọi Gemini, trình bày citation", "Không lưu dữ liệu quan hệ hoặc chạy vector search"],
        ["FastAPI", "API, validation, job, transcript, dữ liệu, context retrieval", "Không lưu hoặc ghi log Gemini token"],
        ["MySQL", "Người dùng, video, transcript metadata, artifacts, notes, bookmark và job", "Không lưu vector dung lượng lớn"],
        ["ChromaDB", "Vector chunk và metadata tối thiểu để truy xuất", "Không làm nguồn dữ liệu nghiệp vụ chính"],
        ["Embedding cục bộ", "Tạo vector cho chunk và câu hỏi", "Không sinh summary hoặc câu trả lời"],
        ["Gemini", "Sinh summary, chapter, concept, quiz, flashcard và câu trả lời", "Không được coi là nguồn dữ liệu ngoài transcript"],
    ],
    widths=[3.0, 7.3, 5.3], font_size=8.1
)

add_heading("4 4 Cấu trúc kho mã nguồn", 2)
add_code(
    "youtube-learning-companion/\n"
    "|-- apps/extension/\n"
    "|   |-- src/background/\n"
    "|   |-- src/content/\n"
    "|   |-- src/components/\n"
    "|   |-- src/services/\n"
    "|   `-- src/stores/\n"
    "|-- services/api/\n"
    "|   |-- app/api/\n"
    "|   |-- app/models/\n"
    "|   |-- app/schemas/\n"
    "|   |-- app/services/\n"
    "|   `-- app/jobs/\n"
    "|-- packages/shared-types/\n"
    "|-- docs/\n"
    "`-- infra/"
)

add_heading("4 5 Correspondence giữa các view", 2)
add_table(
    ["Quan hệ", "Quy tắc correspondence", "Kiểm tra"],
    [
        ["Yêu cầu đến thành phần", "Mỗi yêu cầu MVP phải có ít nhất một thành phần chịu trách nhiệm", "Ma trận mục 14 4"],
        ["Thành phần đến interface", "Mọi giao tiếp qua ranh giới process phải có message hoặc REST contract", "Mục 5 3 và 9"],
        ["Dữ liệu đến hành vi", "Mỗi trạng thái job phải xuất hiện trong vòng đời job và error handling", "Mục 6 2, 8 3 và 12"],
        ["Bảo mật đến triển khai", "Token và secret phải tuân thủ ranh giới lưu trữ trong mọi môi trường", "Mục 10 và 13"],
        ["Thiết kế đến kiểm thử", "Mỗi quyết định có rủi ro cao phải có test hoặc control gate", "Mục 14, 15 và 16"],
    ],
    widths=[3.6, 8.0, 4.0], font_size=8.0
)

add_heading("4 6 Quyết định kiến trúc và rationale", 2)
add_table(
    ["Mã", "Quyết định", "Rationale", "Hệ quả và trạng thái"],
    [
        ["ADR01", "Gemini chỉ được gọi từ extension bằng Google OAuth", "Không phân phối API key và giữ token ngoài backend", "Extension chịu quota và vòng đời token; Trình phê duyệt"],
        ["ADR02", "Không đọc cookie Google AI Studio", "Cookie không phải interface xác thực ổn định hoặc phù hợp quyền tối thiểu", "Manifest không khai báo cookies permission; Bắt buộc"],
        ["ADR03", "FastAPI cung cấp context thay vì gọi Gemini", "Tách dữ liệu và retrieval khỏi quyền sử dụng Gemini của người dùng", "Backend không nhận Gemini access token; Trình phê duyệt"],
        ["ADR04", "MySQL là nguồn dữ liệu nghiệp vụ chính", "Cần transaction, ownership và truy vấn quản trị", "ChromaDB chỉ giữ vector và metadata tối thiểu; Trình phê duyệt"],
        ["ADR05", "Embedding chạy cục bộ ở backend", "Cho phép lập chỉ mục nền và không phụ thuộc token Gemini", "Cần benchmark model và tài nguyên; Quyết định mở O03"],
        ["ADR06", "processing_jobs trong MySQL cho MVP", "Giảm thành phần vận hành khi lưu lượng còn thấp", "Đánh giá queue chuyên dụng khi backlog vượt ngưỡng; Trình phê duyệt"],
    ],
    widths=[1.4, 4.5, 5.5, 4.2], font_size=7.7
)

# 5 extension
add_heading("5 Thiết kế Chrome Extension", 1)
add_heading("5 1 Thành phần nội bộ", 2)
add_table(
    ["Module", "Chức năng chính", "Đầu vào và đầu ra"],
    [
        ["Content Script", "Theo dõi trang YouTube và cầu nối tới player", "DOM và URL vào; Video ID và timestamp ra"],
        ["YouTube Adapter", "Chuẩn hóa phát hiện video, play state và seek", "Player state vào; sự kiện chuẩn hóa ra"],
        ["Background Service Worker", "OAuth, network request, message routing", "Message vào; token hoặc response ra"],
        ["Sidebar App", "Hiển thị summary, chapter, search, Ask Video và dữ liệu học tập", "State và API data vào; thao tác người dùng ra"],
        ["Auth Service", "Quản lý state và vòng đời OAuth", "User action vào; auth state ra"],
        ["Gemini Client", "Gửi prompt và validate response cơ bản", "Context và token vào; JSON artifact ra"],
        ["API Client", "Gọi FastAPI và chuẩn hóa lỗi", "Request typed vào; response typed ra"],
    ],
    widths=[3.4, 7.1, 5.1], font_size=8.2
)

add_heading("5 2 State của sidebar", 2)
add_code(
    "BOOTSTRAPPING -> CHECKING_AUTH -> NEED_GOOGLE_LOGIN\n"
    "                              -> AUTHORIZING\n"
    "                              -> CHECKING_GEMINI_ACCESS\n"
    "                              -> READY\n"
    "READY -> VIDEO_LOADING -> VIDEO_READY | VIDEO_UNSUPPORTED | VIDEO_FAILED\n"
    "READY -> TOKEN_EXPIRED | QUOTA_EXCEEDED | API_UNAVAILABLE"
)
add_para(
    "Mỗi lần YouTube chuyển video, extension phải hủy request hoặc poll của video cũ, xóa state phụ thuộc video, "
    "đọc Video ID mới và nạp lại trạng thái xử lý. Cơ chế này ngăn sidebar hiển thị nhầm summary hoặc citation "
    "của video trước.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("5 3 Message contract", 2)
add_table(
    ["Message", "Nguồn", "Đích", "Nội dung"],
    [
        ["VIDEO_CHANGED", "Content Script", "Sidebar", "videoId, title, url"],
        ["PLAYER_TIME_UPDATED", "Content Script", "Sidebar", "currentTime"],
        ["SEEK_TO", "Sidebar", "Content Script", "targetTime"],
        ["AUTH_CHECK", "Sidebar", "Service Worker", "interactive false"],
        ["AUTH_START", "Sidebar", "Service Worker", "interactive true sau user gesture"],
        ["GEMINI_REQUEST", "Sidebar", "Service Worker", "operation, context, schemaVersion"],
        ["AUTH_LOGOUT", "Sidebar", "Service Worker", "xóa token cache và state phiên"],
    ],
    widths=[3.3, 3.0, 3.0, 6.3], font_size=8.0
)

# 6 backend
add_heading("6 Thiết kế Backend", 1)
add_heading("6 1 Các lớp", 2)
add_table(
    ["Lớp", "Trách nhiệm"],
    [
        ["API Router", "Nhận request, xác thực session ứng dụng, gọi service và trả HTTP response"],
        ["Schema", "Validate request và response; tách schema API khỏi ORM model"],
        ["Service", "Thực hiện use case như analyze video, search, notes và bookmark"],
        ["Repository", "Đọc và ghi MySQL; không chứa business logic"],
        ["Job Worker", "Claim job, xử lý transcript, chunk, embedding và cập nhật trạng thái"],
        ["Vector Adapter", "Ghi và truy vấn ChromaDB bằng chunk_id"],
        ["Error Mapper", "Chuyển lỗi domain thành HTTP status và error code ổn định"],
    ],
    widths=[4.0, 11.6], font_size=8.7
)

add_heading("6 2 Vòng đời job", 2)
reset_numbering()
add_number("POST videos analyze kiểm tra video và job hiện có.")
add_number("Nếu artifact còn hợp lệ, backend trả trạng thái completed và dữ liệu cache.")
add_number("Nếu chưa có, backend tạo một processing job với khóa chống trùng theo video và phiên bản pipeline.")
add_number("Worker claim job bằng thao tác nguyên tử và chuyển trạng thái sang processing transcript.")
add_number("Worker thu thập transcript, chuẩn hóa, chia chunk, tạo embedding và ghi vector.")
add_number("Backend cập nhật completed khi index sẵn sàng hoặc failed cùng mã lỗi có thể hành động.")

add_heading("6 3 Idempotency và versioning", 2)
add_para(
    "Khóa logic của một lần xử lý gồm video ID, transcript language và pipeline version. Request lặp lại với cùng "
    "khóa phải trả job đang chạy hoặc artifact hiện có. Khi thuật toán chunking, model embedding hoặc prompt schema "
    "thay đổi, nhóm tăng phiên bản tương ứng để tạo artifact mới mà không ghi đè dữ liệu cũ ngoài kiểm soát.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("6 4 Quy ước lỗi API", 2)
add_code(
    '{\n'
    '  "error": {\n'
    '    "code": "TRANSCRIPT_NOT_AVAILABLE",\n'
    '    "message": "Video không có transcript phù hợp.",\n'
    '    "retryable": false,\n'
    '    "request_id": "req_01H..."\n'
    '  }\n'
    '}'
)

# 7 AI
add_heading("7 Thiết kế AI và RAG", 1)
add_heading("7 1 Pipeline transcript", 2)
add_para(
    "Transcript processor giữ nguyên thứ tự và timestamp nguồn. Pipeline loại bỏ khoảng trắng, chuẩn hóa ký tự, "
    "gộp segment quá ngắn trong một khoảng thời gian liên tục và chia chunk có overlap. Mỗi chunk lưu start time, "
    "end time, position, language và pipeline version.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)
add_code(
    "Raw transcript -> Normalize -> Merge short segments -> Chunk with overlap\n"
    "               -> Attach timestamps -> Embed -> Store vector and metadata"
)

add_heading("7 2 Thiết kế embedding và vector search", 2)
add_para(
    "MVP dùng Sentence Transformers đa ngôn ngữ chạy trong backend và lưu vector tại ChromaDB. Cách này không "
    "cần gửi OAuth token cho backend, đồng thời cho phép worker lập chỉ mục khi extension không mở. Model cuối cùng "
    "được chọn bằng benchmark tiếng Việt và tiếng Anh; thay đổi model phải tăng embedding version.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("7 3 Luồng Ask Video", 2)
add_figure(RAG, 16.2, "Hình 2 Luồng Ask Video dựa trên transcript",
           "Câu hỏi được backend embedding và tìm trong ChromaDB. Context có timestamp được trả về extension, sau đó extension gọi Gemini bằng OAuth và hiển thị câu trả lời cùng citation.")
add_para(
    "Backend chỉ trả các chunk liên quan. Extension xây prompt có giới hạn, gọi Gemini trực tiếp và validate response. "
    "Nếu điểm truy xuất thấp hoặc Gemini không thể dẫn nguồn hợp lệ, UI hiển thị trạng thái không tìm thấy nội dung "
    "thay vì đưa ra câu trả lời suy đoán.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("7 4 Schema đầu ra AI", 2)
add_table(
    ["Artifact", "Trường bắt buộc", "Kiểm tra"],
    [
        ["Summary", "summary, key_points, language, schema_version", "Không rỗng và không chứa citation ngoài transcript"],
        ["Chapter", "title, summary, start_time, end_time", "Có thứ tự, không vượt duration và không chồng chéo bất hợp lý"],
        ["Concept", "name, explanation, timestamps", "Timestamp tồn tại trong transcript"],
        ["Ask answer", "answer, citations, grounded", "Mỗi citation tham chiếu chunk và timestamp hợp lệ"],
        ["Quiz", "question, options, correct_answer, explanation, timestamp", "Single choice chỉ có một đáp án đúng"],
        ["Flashcard", "front, back, timestamp", "Không trùng nội dung trong cùng video"],
    ],
    widths=[2.8, 6.4, 6.4], font_size=8.0
)

add_heading("7 5 Prompt safety", 2)
for item in [
    "System instruction yêu cầu mô hình chỉ sử dụng context được cung cấp.",
    "Transcript được đánh dấu là dữ liệu không tin cậy và không được phép thay đổi instruction.",
    "Prompt giới hạn số chunk, tổng kích thước context và định dạng JSON đầu ra.",
    "Response phải được validate theo schema trước khi hiển thị hoặc lưu.",
    "Nội dung không đủ căn cứ phải trả về grounded false hoặc trạng thái không tìm thấy.",
]:
    add_bullet(item)

# 8 data
add_heading("8 Thiết kế dữ liệu", 1)
add_heading("8 1 Mô hình thực thể", 2)
entity_rows = [
    ["users", "id, google_sub, email, created_at", "Chủ sở hữu notes, bookmarks và history"],
    ["videos", "id, youtube_video_id, title, duration, status", "Nguồn chung cho transcript và artifact"],
    ["transcripts", "id, video_id, language, source, version", "Một video có thể có nhiều ngôn ngữ hoặc phiên bản"],
    ["transcript_chunks", "id, transcript_id, text, start_time, end_time, position", "Metadata chuẩn; vector lưu tại ChromaDB"],
    ["chapters", "id, video_id, title, summary, start_time, end_time, version", "Kết quả AI đã validate"],
    ["concepts", "id, video_id, name, explanation, timestamps", "Khái niệm và nguồn kiểm chứng"],
    ["processing_jobs", "id, video_id, pipeline_version, status, error_code", "Theo dõi và chống job trùng"],
    ["notes", "id, user_id, video_id, timestamp, content", "Ghi chú riêng của người dùng"],
    ["bookmarks", "id, user_id, video_id, timestamp, label", "Đánh dấu đoạn quan trọng"],
    ["quizzes", "id, user_id, video_id, schema_version", "Nhóm câu hỏi được sinh"],
    ["quiz_questions", "id, quiz_id, question, options, answer, explanation", "Nội dung câu hỏi và kết quả"],
    ["flashcards", "id, user_id, video_id, front, back, timestamp", "Thẻ ôn tập"],
    ["learning_history", "id, user_id, video_id, action, occurred_at", "Dòng sự kiện học tập"],
]
add_table(["Thực thể", "Trường chính", "Vai trò và quan hệ"], entity_rows, widths=[3.1, 6.8, 5.7], font_size=7.6)

add_heading("8 2 Quy tắc dữ liệu", 2)
for item in [
    "youtube_video_id là duy nhất trong bảng videos.",
    "position của chunk là duy nhất trong phạm vi một transcript version.",
    "start_time không âm và end_time phải lớn hơn hoặc bằng start_time.",
    "Mỗi vector lưu chunk_id, embedding_version và video_id để kiểm tra chéo.",
    "Xóa dữ liệu người dùng phải xử lý notes, bookmarks, quizzes, flashcards và history theo chính sách đã phê duyệt.",
    "Không lưu OAuth token, Google password hoặc cookie trong bất kỳ bảng nào.",
]:
    add_bullet(item)

add_heading("8 3 Trạng thái job", 2)
add_table(
    ["Trạng thái", "Ý nghĩa", "Chuyển tiếp hợp lệ"],
    [
        ["pending", "Job đã tạo và chờ worker", "processing_transcript hoặc failed"],
        ["processing_transcript", "Đang lấy và chuẩn hóa transcript", "generating_embeddings hoặc failed"],
        ["generating_embeddings", "Đang tạo và lưu vector", "completed hoặc failed"],
        ["completed", "Index đã sẵn sàng", "Không chuyển tiếp; tạo job version mới nếu cần"],
        ["failed", "Job dừng với error_code", "pending khi retry hợp lệ"],
    ],
    widths=[3.4, 6.2, 6.0], font_size=8.3
)

# 9 API
add_heading("9 Thiết kế API", 1)
add_heading("9 1 Nguyên tắc", 2)
for item in [
    "API dùng JSON và đường dẫn có tiền tố phiên bản, ví dụ api v1.",
    "Backend session xác định người dùng; Gemini access token không gửi vào FastAPI.",
    "Mọi response lỗi dùng error code ổn định và request ID.",
    "Các endpoint tạo dữ liệu phải validate ownership và giới hạn kích thước input.",
    "Schema dùng chung được phát hành trong packages shared types hoặc sinh từ OpenAPI.",
]:
    add_bullet(item)

add_heading("9 2 Danh sách endpoint", 2)
api_rows = [
    ["POST", "/api/v1/auth/google/exchange", "Đổi Google ID token thành session ứng dụng; không nhận Gemini token", "Public"],
    ["POST", "/api/v1/auth/logout", "Thu hồi session ứng dụng", "User"],
    ["POST", "/api/v1/videos/analyze", "Tạo hoặc lấy job xử lý video", "User"],
    ["GET", "/api/v1/videos/{id}/status", "Đọc trạng thái job và progress", "User"],
    ["GET", "/api/v1/videos/{id}/summary", "Đọc summary đã lưu", "User"],
    ["GET", "/api/v1/videos/{id}/chapters", "Đọc chapter", "User"],
    ["GET", "/api/v1/videos/{id}/concepts", "Đọc concept", "User"],
    ["GET", "/api/v1/videos/{id}/context", "Lấy context cho một AI operation", "User"],
    ["POST", "/api/v1/videos/{id}/artifacts", "Lưu artifact AI đã validate", "User"],
    ["POST", "/api/v1/videos/{id}/search", "Tìm kiếm keyword và vector", "User"],
    ["POST", "/api/v1/videos/{id}/ask/context", "Truy xuất chunk cho Ask Video", "User"],
    ["GET POST", "/api/v1/videos/{id}/bookmarks", "Đọc hoặc tạo bookmark", "Owner"],
    ["DELETE", "/api/v1/bookmarks/{id}", "Xóa bookmark", "Owner"],
    ["GET POST", "/api/v1/videos/{id}/notes", "Đọc hoặc tạo note", "Owner"],
    ["PUT DELETE", "/api/v1/notes/{id}", "Sửa hoặc xóa note", "Owner"],
    ["POST", "/api/v1/videos/{id}/quiz", "Lưu quiz đã sinh", "Owner"],
    ["POST", "/api/v1/videos/{id}/flashcards", "Lưu flashcard đã sinh", "Owner"],
    ["GET", "/api/v1/learning-history", "Đọc lịch sử học tập", "Owner"],
]
add_table(["Phương thức", "Đường dẫn", "Mục đích", "Quyền"], api_rows, widths=[2.0, 5.8, 6.0, 1.8], font_size=7.2)

add_heading("9 3 Ví dụ Ask Video context", 2)
add_code(
    '{\n'
    '  "question": "JWT được giải thích ở phần nào?",\n'
    '  "top_k": 5,\n'
    '  "language": "vi"\n'
    '}\n\n'
    '{\n'
    '  "video_id": "internal_uuid",\n'
    '  "chunks": [\n'
    '    {"chunk_id": "c12", "text": "...", "start_time": 320, "end_time": 356, "score": 0.84}\n'
    '  ],\n'
    '  "retrieval_version": "1"\n'
    '}'
)

# 10 auth security
add_heading("10 Xác thực và bảo mật", 1)
add_heading("10 1 Luồng Google OAuth", 2)
add_figure(OAUTH, 16.2, "Hình 3 Luồng đăng nhập và kiểm tra quyền Gemini",
           "Extension kiểm tra OAuth token không tương tác. Nếu cần, người dùng chủ động bấm đăng nhập. Sau khi Google cấp quyền, extension kiểm tra Gemini rồi chuyển sang trạng thái sẵn sàng.")
add_para(
    "Extension gọi chrome.identity.getAuthToken với interactive false khi mở sidebar. Khi cần đăng nhập hoặc cấp "
    "quyền, UI giải thích mục đích và chỉ gọi interactive true sau thao tác của người dùng. Token lỗi được xóa khỏi "
    "Chrome token cache trước khi xin token mới.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("10 2 Tách danh tính ứng dụng và quyền Gemini", 2)
add_para(
    "Danh tính dùng cho dữ liệu người dùng và quyền gọi Gemini là hai mối quan tâm riêng. Backend chỉ nhận Google "
    "ID token trong luồng đăng nhập ứng dụng, xác minh issuer, audience và thời hạn, sau đó phát hành session của hệ "
    "thống. Gemini access token chỉ được extension gửi tới endpoint chính thức của Google.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("10 3 Kiểm soát bảo mật", 2)
security_rows = [
    ["Token", "Không lưu Gemini token trong localStorage, MySQL hoặc log; xóa cache khi logout hoặc 401"],
    ["Cookie", "Không khai báo cookies permission và không đọc cookie AI Studio"],
    ["Transport", "FastAPI chỉ phục vụ HTTPS trong môi trường dùng chung"],
    ["CORS", "Chỉ cho phép extension ID và origin quản trị đã cấu hình"],
    ["Authorization", "Notes, bookmark, quiz, flashcard và history kiểm tra ownership"],
    ["Input", "Giới hạn kích thước câu hỏi, note và transcript; validate kiểu và phạm vi timestamp"],
    ["Logging", "Mask Authorization header, token, email khi không cần và nội dung nhạy cảm"],
    ["Prompt injection", "Coi transcript là dữ liệu không tin cậy và không cho phép thay đổi instruction"],
    ["Secrets", "Secret backend đặt trong secret manager hoặc biến môi trường, không commit vào Git"],
]
add_table(["Vùng", "Kiểm soát"], security_rows, widths=[3.1, 12.5], font_size=8.3)

add_heading("10 4 Quyền extension", 2)
add_para(
    "Manifest chỉ yêu cầu identity, storage, sidePanel hoặc scripting tùy cách cài sidebar, cùng host "
    "permission giới hạn cho youtube.com, backend của dự án và generativelanguage.googleapis.com. Mọi quyền bổ sung "
    "phải có lý do, người review và test quyền tối thiểu.",
    align=WD_ALIGN_PARAGRAPH.LEFT
)

add_heading("10 5 Mô hình đe dọa và biện pháp kiểm soát", 2)
add_table(
    ["Mã", "Đe dọa", "Ranh giới ảnh hưởng", "Kiểm soát và bằng chứng"],
    [
        ["TH01", "Giả mạo phiên người dùng", "Extension đến Backend", "Xác minh Google ID token, issuer, audience, expiry và ký session. SEC-01, SEC-02"],
        ["TH02", "Lộ Gemini access token", "Extension đến Google", "Chrome token cache, không localStorage, không backend, mask log và xóa token lỗi. SEC-03, SEC-04"],
        ["TH03", "Đọc cookie AI Studio", "Extension đến Chrome profile", "Không khai báo cookies permission và không gọi Cookies API. SEC-05"],
        ["TH04", "Truy cập dữ liệu người dùng khác", "Backend đến MySQL", "Ownership check ở service và repository cho mọi resource cá nhân. SEC-06, SEC-07"],
        ["TH05", "Prompt injection từ transcript", "Transcript đến Gemini", "Phân tách instruction và dữ liệu, giới hạn context, validate schema và citation. EVAL-06, SEC-08"],
        ["TH06", "Lạm dụng tài nguyên", "Extension đến API và worker", "Input limit, rate limit, timeout, retry có giới hạn và idempotency. SEC-09, OPS-03"],
        ["TH07", "Rò rỉ secret triển khai", "CI và môi trường chạy", "Secret manager hoặc biến môi trường, secret scan và quyền tối thiểu. SEC-10"],
        ["TH08", "Can thiệp dữ liệu hoặc artifact", "API đến storage", "Validation, transaction, versioning và audit log không chứa nội dung nhạy cảm. SEC-11, DATA-04"],
    ],
    widths=[1.2, 3.6, 3.5, 7.3], font_size=7.3
)

# 11 flows
add_heading("11 Luồng xử lý chính", 1)
add_heading("11 1 Phân tích video", 2)
reset_numbering()
add_number("Content Script phát hiện Video ID và thông báo cho sidebar.")
add_number("Sidebar gọi videos analyze. Backend trả artifact cache hoặc job ID.")
add_number("Worker lấy transcript, chuẩn hóa, chia chunk, tạo embedding và ghi vector.")
add_number("Sidebar poll trạng thái cho đến khi index hoàn thành hoặc job thất bại.")
add_number("Sidebar lấy context cần thiết, gọi Gemini trực tiếp và validate JSON trả về.")
add_number("Extension hiển thị artifact và có thể lưu bản đã validate qua artifacts endpoint.")

add_heading("11 2 Tìm kiếm và chuyển timestamp", 2)
reset_numbering()
add_number("Người dùng nhập từ khóa hoặc câu hỏi ngắn.")
add_number("Backend thực hiện keyword search và vector search, sau đó hợp nhất kết quả.")
add_number("API trả chunk, score và timestamp.")
add_number("Sidebar hiển thị kết quả; click timestamp gửi SEEK_TO cho Content Script.")
add_number("YouTube Adapter điều khiển player và trả state mới cho sidebar.")

add_heading("11 3 Ask Video", 2)
reset_numbering()
add_number("Sidebar gửi câu hỏi tới ask context endpoint.")
add_number("Backend embedding câu hỏi và truy xuất top k chunk có score đạt ngưỡng.")
add_number("Nếu không có context đủ tốt, backend trả found false.")
add_number("Nếu có context, extension xây prompt và gọi Gemini bằng OAuth token.")
add_number("Extension validate citation, hiển thị câu trả lời và cho phép nhảy đến timestamp.")

add_heading("11 4 Notes và bookmark", 2)
reset_numbering()
add_number("Sidebar lấy timestamp hiện tại từ YouTube Adapter.")
add_number("Người dùng nhập label hoặc note và xác nhận lưu.")
add_number("Backend kiểm tra session, quyền sở hữu, video và phạm vi timestamp.")
add_number("MySQL lưu dữ liệu; API trả bản ghi đã tạo để sidebar cập nhật ngay.")

# 12 errors
add_heading("12 Xử lý lỗi và trạng thái", 1)
error_rows = [
    ["AUTH_REQUIRED", "401", "Chưa có session ứng dụng", "Hiện màn hình đăng nhập"],
    ["GEMINI_AUTH_REQUIRED", "401 phía Google", "Token Gemini thiếu hoặc hết hạn", "Xóa token cache và yêu cầu đăng nhập lại"],
    ["GEMINI_PERMISSION_DENIED", "403", "Tài khoản hoặc project thiếu quyền", "Hiện hướng dẫn hoàn tất thiết lập"],
    ["QUOTA_EXCEEDED", "429", "Hết quota Gemini", "Thông báo và cho phép thử lại sau"],
    ["TRANSCRIPT_NOT_AVAILABLE", "422", "Video không có transcript phù hợp", "Dừng pipeline AI"],
    ["VIDEO_UNSUPPORTED", "422", "Video riêng tư, giới hạn hoặc loại chưa hỗ trợ", "Hiện lý do cụ thể"],
    ["JOB_ALREADY_RUNNING", "200 hoặc 409", "Video đang được xử lý", "Tiếp tục theo dõi job hiện có"],
    ["AI_RESPONSE_INVALID", "502", "Gemini trả JSON sai schema", "Retry có giới hạn hoặc yêu cầu tạo lại"],
    ["VECTOR_STORE_UNAVAILABLE", "503", "ChromaDB không phản hồi", "Ghi lỗi và cho phép retry"],
    ["API_UNAVAILABLE", "503", "Backend hoặc Gemini gián đoạn", "Giữ state và hiển thị retry"],
]
add_table(["Mã lỗi", "HTTP", "Điều kiện", "Hành vi UI"], error_rows, widths=[3.8, 1.5, 5.3, 5.0], font_size=7.8)

# 13 deployment
add_heading("13 Triển khai và vận hành", 1)
add_heading("13 1 Topology triển khai", 2)
for item in [
    "Chrome Extension được đóng gói riêng và cài bằng Developer Mode trong giai đoạn phát triển.",
    "FastAPI chạy sau reverse proxy HTTPS.",
    "Worker chạy thành process riêng và dùng cùng codebase với API.",
    "MySQL sử dụng volume bền vững và backup định kỳ theo môi trường.",
    "ChromaDB sử dụng volume bền vững; vector được tạo lại từ transcript khi cần.",
]:
    add_bullet(item)

add_figure(
    DEPLOY,
    16.2,
    "Hình 4 Kiến trúc triển khai mục tiêu",
    "Chrome Extension trên máy người dùng gọi môi trường ứng dụng qua HTTPS và gọi Google OAuth cùng Gemini. Môi trường ứng dụng gồm reverse proxy, FastAPI và worker, sử dụng MySQL, ChromaDB và hệ thống quan sát.",
)

add_heading("13 2 Cấu hình môi trường", 2)
add_table(
    ["Biến", "Mục đích", "Bảo mật"],
    [
        ["APP_ENV", "development, test hoặc production", "Không bí mật"],
        ["DATABASE_URL", "Kết nối MySQL", "Secret backend"],
        ["CHROMA_PATH", "Vị trí vector store", "Không chứa token"],
        ["EMBEDDING_MODEL", "Tên và phiên bản model embedding", "Không bí mật"],
        ["ALLOWED_EXTENSION_IDS", "Danh sách extension được phép gọi API", "Cấu hình backend"],
        ["SESSION_SIGNING_KEY", "Ký session ứng dụng", "Secret backend"],
        ["LOG_LEVEL", "Mức log theo môi trường", "Không bí mật"],
    ],
    widths=[4.0, 7.4, 4.2], font_size=8.3
)

add_heading("13 3 Quan sát hệ thống", 2)
for item in [
    "Mỗi request có request ID; mỗi job có job ID dùng xuyên suốt log.",
    "Theo dõi số job pending, running, completed và failed.",
    "Theo dõi thời gian lấy transcript, chunking, embedding, search và AI request.",
    "Theo dõi tỷ lệ lỗi theo error code mà không ghi token hoặc nội dung nhạy cảm.",
    "Health endpoint kiểm tra API; readiness kiểm tra MySQL và ChromaDB.",
]:
    add_bullet(item)

add_heading("13 4 Kiểm soát triển khai và khôi phục", 2)
add_table(
    ["Kiểm soát", "Yêu cầu", "Bằng chứng trước phát hành"],
    [
        ["Tách môi trường", "Development, test và production dùng cấu hình, secret và dữ liệu tách biệt", "Biên bản kiểm tra cấu hình"],
        ["Migration", "Schema MySQL có version, script up và phương án rollback đã thử trên bản sao dữ liệu", "Log migration và kết quả rollback test"],
        ["Backup", "Backup MySQL theo lịch và kiểm tra khả năng restore; ChromaDB có thể rebuild từ transcript", "Biên bản restore và thời gian khôi phục"],
        ["Release", "Extension, API và worker cùng một release tag tương thích schema", "Release manifest và checksum build"],
        ["Rollback", "Có thể quay lại extension và backend trước đó khi không thay đổi dữ liệu không tương thích", "Runbook rollback được QA xác nhận"],
        ["Secret", "Secret chỉ được cấp cho process cần thiết và không xuất hiện trong image hoặc log", "Kết quả secret scan và log review"],
    ],
    widths=[3.0, 7.5, 5.1], font_size=7.9
)

# 14 testing
add_heading("14 Kiểm thử và nghiệm thu", 1)
add_heading("14 1 Chiến lược kiểm thử", 2)
test_rows = [
    ["Unit", "Video ID parser, timestamp, transcript cleaning, chunking, schema validation, error mapping", "Mỗi PR"],
    ["Integration", "Extension và YouTube, OAuth và Gemini, FastAPI và MySQL, FastAPI và ChromaDB", "Mỗi sprint"],
    ["End to end", "Đăng nhập, phân tích, summary, chapter, search, Ask Video và bookmark", "Trước demo và release"],
    ["Security", "Permission, token leakage, ownership, CORS, input limits và log masking", "Sprint 1 và Sprint 6"],
    ["AI evaluation", "Groundedness, citation, timestamp, câu hỏi ngoài video, tiếng Việt và tiếng Anh", "Sprint 3 đến Sprint 6"],
    ["Regression", "Luồng MVP và các lỗi đã đóng", "Trước merge release"],
]
add_table(["Loại", "Phạm vi", "Thời điểm"], test_rows, widths=[3.0, 9.7, 2.9], font_size=8.2)

add_heading("14 2 Bộ dữ liệu kiểm thử", 2)
for item in [
    "Từ 10 đến 15 video gồm tiếng Việt, tiếng Anh, video ngắn, video dài, subtitle tự động và subtitle do tác giả cung cấp.",
    "Có video không transcript, video riêng tư hoặc bị giới hạn để kiểm tra lỗi.",
    "Mỗi video có câu hỏi dễ, trung bình, khó, câu hỏi cần timestamp và câu hỏi không có trong video.",
    "Expected result ghi rõ chunk hoặc khoảng timestamp dùng để đánh giá.",
]:
    add_bullet(item)

add_heading("14 3 Điều kiện nghiệm thu MVP", 2)
accept_rows = [
    ["Đăng nhập", "Người đã cấp quyền đi thẳng vào sidebar; người chưa cấp quyền chỉ thấy OAuth sau khi bấm nút"],
    ["Video", "Extension nhận đúng Video ID sau khi mở, reload và chuyển video"],
    ["Timestamp", "Click chapter, search result hoặc citation đưa player đến đúng vị trí"],
    ["Transcript", "Giữ đúng thứ tự và timestamp; video không transcript dừng pipeline có thông báo"],
    ["Search", "Trả chunk liên quan kèm score và timestamp trên bộ test đã thống nhất"],
    ["Ask Video", "Trả lời có citation hợp lệ và từ chối câu hỏi không có căn cứ"],
    ["Backend", "Không tạo job trùng; job lỗi có error code và retry theo chính sách"],
    ["Bảo mật", "Không phát hiện API key, Gemini token hoặc cookie trong source, build, database và log"],
    ["Release", "Không còn lỗi Critical hoặc High; hạn chế còn lại được ghi trong báo cáo"],
]
add_table(["Hạng mục", "Điều kiện đạt"], accept_rows, widths=[3.3, 12.3], font_size=8.3)

doc.add_page_break()
add_heading("14 4 Ma trận truy vết yêu cầu", 2)
trace_rows = [
    ["FR01", "Auth Service, Background Service Worker, mục 10", "AUTH_CHECK, AUTH_START, auth exchange", "TC-AUTH-01 đến TC-AUTH-05"],
    ["FR02", "Content Script và YouTube Adapter", "VIDEO_CHANGED", "TC-VIDEO-01 đến TC-VIDEO-04"],
    ["FR03", "Sidebar và YouTube Adapter", "PLAYER_TIME_UPDATED, SEEK_TO", "TC-TIME-01 đến TC-TIME-04"],
    ["FR04", "Transcript service và Job Worker", "videos analyze, processing_jobs", "TC-TR-01 đến TC-TR-05"],
    ["FR05", "Transcript processor và Vector Adapter", "transcript_chunks, ChromaDB", "TC-CHUNK-01 đến TC-CHUNK-06"],
    ["FR06 FR07", "Gemini Client và artifact validator", "context, artifacts, chapters", "TC-AI-01 đến TC-AI-08"],
    ["FR09", "Search service và Vector Adapter", "videos id search", "TC-SEARCH-01 đến TC-SEARCH-06"],
    ["FR10", "Ask context service, Gemini Client và citation validator", "videos id ask context", "TC-ASK-01 đến TC-ASK-08"],
    ["FR11", "Bookmark service và repository", "bookmarks endpoints", "TC-BOOK-01 đến TC-BOOK-04"],
    ["FR16", "Error Mapper và sidebar state machine", "error code mục 12", "TC-ERR-01 đến TC-ERR-10"],
    ["NFR01 NFR02", "Security boundary và manifest", "OAuth, CORS, permission, secret", "SEC-01 đến SEC-10"],
    ["NFR03 NFR04 NFR05", "UI, cache và search pipeline", "Metric latency p95", "PERF-01 đến PERF-06"],
    ["NFR06 NFR11", "Job lifecycle và observability", "job state, request ID, health", "OPS-01 đến OPS-07"],
    ["NFR07", "RAG threshold và response validator", "grounded, citations", "EVAL-01 đến EVAL-10"],
    ["NFR08 NFR09 NFR12", "Module boundary, shared schema và CI", "release build và regression suite", "REL-01 đến REL-06"],
]
add_table(
    ["Yêu cầu", "Thành phần thiết kế", "Interface hoặc dữ liệu", "Bằng chứng xác minh"],
    trace_rows,
    widths=[2.0, 5.1, 4.3, 4.2],
    font_size=7.4,
)

add_heading("14 5 Hồ sơ bằng chứng nghiệm thu", 2)
for item in [
    "Test plan và test report có phiên bản, môi trường, dữ liệu đầu vào, expected result và actual result.",
    "Ma trận truy vết được cập nhật để không còn yêu cầu MVP thiếu test hoặc thành phần chịu trách nhiệm.",
    "Báo cáo security test xác nhận không có Critical hoặc High chưa được chấp thuận ngoại lệ.",
    "Báo cáo AI evaluation nêu bộ dữ liệu, metric, ngưỡng đạt, lỗi còn lại và ví dụ citation.",
    "Release manifest ghi version của extension, API, database schema, embedding và prompt schema.",
    "Biên bản nghiệm thu ghi quyết định chấp nhận, chấp nhận có điều kiện hoặc từ chối phát hành.",
]:
    add_bullet(item)

# 15 risks
add_heading("15 Rủi ro và quyết định mở", 1)
add_heading("15 1 Rủi ro", 2)
risk_rows = [
    ["R01", "Không lấy được transcript ổn định", "Cao", "Prototype Sprint 1; hỗ trợ video có transcript; dừng AI khi thiếu dữ liệu"],
    ["R02", "OAuth hoặc quota Gemini không hoạt động như giả định", "Cao", "Test nhiều tài khoản và project trước khi xây chức năng AI"],
    ["R03", "YouTube thay đổi DOM hoặc player", "Cao", "Tách YouTube Adapter và có regression test"],
    ["R04", "Gemini bịa nội dung hoặc timestamp", "Cao", "RAG có threshold, schema validation và grounded false"],
    ["R05", "Service worker bị dừng khi AI request dài", "Trung bình", "Giới hạn request; kiểm thử thực tế; đánh giá kiến trúc server side nếu cần"],
    ["R06", "Video dài gây chậm", "Trung bình", "Chunking, cache, batch embedding và progress state"],
    ["R07", "ChromaDB hoặc model embedding khó triển khai", "Trung bình", "Đóng gói container và chuẩn bị quy trình rebuild index"],
    ["R08", "Rò rỉ token hoặc dữ liệu người dùng", "Cao", "Quyền tối thiểu, không lưu token, log masking và security test"],
    ["R09", "Phạm vi vượt khả năng 12 tuần", "Cao", "Khóa MVP; chuyển quiz, flashcard và history sang sau MVP"],
    ["R10", "Rủi ro điều khoản khi lấy transcript", "Cao", "Review phương án transcript trước triển khai và chỉ xử lý theo thao tác người dùng"],
]
add_table(["Mã", "Rủi ro", "Mức", "Giảm thiểu"], risk_rows, widths=[1.2, 5.2, 2.0, 7.2], font_size=7.7)

add_heading("15 2 Quyết định mở", 2)
open_rows = [
    ["O01", "Cách lấy transcript hợp lệ và ổn định", "AI/RAG và Backend", "Cuối Sprint 1"],
    ["O02", "Quota Gemini thuộc project nào khi extension dùng OAuth", "Frontend và QA", "Cuối Sprint 1"],
    ["O03", "Model embedding đa ngôn ngữ", "AI/RAG", "Đầu Sprint 3"],
    ["O04", "Chính sách lưu và hết hạn transcript", "Backend và quản lý", "Trước Sprint 3"],
    ["O05", "Cách phát hành extension cho người dùng ngoài nhóm", "Frontend và quản lý", "Trước Sprint 6"],
]
add_table(["Mã", "Quyết định", "Chủ trì", "Hạn chốt"], open_rows, widths=[1.2, 7.6, 4.2, 2.6], font_size=8.1)

# 16 roles
add_heading("16 Phân công và kế hoạch bàn giao", 1)
add_heading("16 1 Trách nhiệm chính", 2)
role_rows = [
    ["Thành viên 1", "Extension Frontend", "React, Manifest V3, sidebar, YouTube Adapter, OAuth UI và Gemini client", "Bản extension load được và test UI"],
    ["Thành viên 2", "Backend", "FastAPI, REST API, MySQL, job worker, cache, session và deployment", "API, migration, OpenAPI và môi trường chạy"],
    ["Thành viên 3", "AI và RAG", "Transcript, chunking, embedding, ChromaDB, search, prompt và evaluation", "Pipeline AI, schema và báo cáo đánh giá"],
    ["Thành viên 4", "QA và Integration", "Test plan, OAuth/security test, end to end, tài liệu, slide và demo", "Test report và gói bàn giao"],
]
add_table(["Người", "Vai trò", "Trách nhiệm", "Đầu ra"], role_rows, widths=[2.5, 2.8, 7.0, 3.3], font_size=7.8)

add_heading("16 2 Ma trận phối hợp", 2)
coord_rows = [
    ["Sidebar và YouTube", "Thành viên 1", "Thành viên 4"],
    ["Google OAuth phía extension", "Thành viên 1", "Thành viên 4"],
    ["Session và REST API", "Thành viên 2", "Thành viên 1 và 4"],
    ["MySQL và job worker", "Thành viên 2", "Thành viên 3 và 4"],
    ["Transcript và embedding", "Thành viên 3", "Thành viên 2"],
    ["Prompt và RAG", "Thành viên 3", "Thành viên 1 và 4"],
    ["Integration và release", "Thành viên 4", "Cả nhóm"],
]
add_table(["Hạng mục", "Chủ trì", "Phối hợp"], coord_rows, widths=[6.0, 4.4, 5.2], font_size=8.5)

add_heading("16 3 Mốc bàn giao", 2)
milestone_rows = [
    ["Tuần 2", "OAuth, gọi Gemini, Video ID, timestamp và transcript prototype", "Quyết định go hoặc no go"],
    ["Tuần 4", "Extension và backend kết nối end to end", "Demo luồng cơ bản"],
    ["Tuần 6", "Transcript index, summary và chapter", "Demo phân tích video"],
    ["Tuần 8", "Search và Ask Video có citation", "MVP hoàn thành"],
    ["Tuần 10", "Notes, quiz, flashcard và history theo phạm vi", "Feature complete"],
    ["Tuần 12", "Regression, security review, báo cáo và demo", "Release candidate"],
]
add_table(["Mốc", "Đầu ra", "Cổng kiểm soát"], milestone_rows, widths=[2.2, 8.5, 4.9], font_size=8.4)

# 17 references
add_heading("17 Tài liệu tham khảo", 1)
add_para("Tài liệu dự án", bold_lead="Tài liệu dự án")
for item in [
    "Tài liệu ý tưởng và yêu cầu YouTube Learning Companion.",
    "Kế hoạch dự án YouTube Learning Companion ngày 27/08/2026.",
    "Phân công và hướng dẫn công việc chi tiết ngày 28/08/2026.",
]:
    add_bullet(item)

add_para("Tài liệu kỹ thuật chính thức", bold_lead="Tài liệu kỹ thuật chính thức")
refs = [
    "IEEE 1016-2009  Software Design Descriptions  trạng thái Inactive Reserved  https://standards.ieee.org/ieee/1016/4502/",
    "ISO/IEC/IEEE 42010:2022  Architecture description  https://www.iso.org/standard/74393.html",
    "ISO/IEC 25010:2023  Product quality model  https://www.iso.org/standard/78176.html",
    "Gemini API OAuth  https://ai.google.dev/gemini-api/docs/oauth",
    "Chrome Identity API  https://developer.chrome.com/docs/extensions/reference/api/identity",
    "OAuth cho Chrome Extension  https://developer.chrome.com/docs/extensions/how-to/integrate/oauth",
    "Chrome Cookies API  https://developer.chrome.com/docs/extensions/reference/api/cookies",
    "Chrome Extension permissions  https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions",
]
for item in refs:
    add_bullet(item)

add_heading("18 Đối chiếu chuẩn và quản lý thay đổi", 1)
add_heading("18 1 Ma trận đối chiếu nội dung chuẩn", 2)
add_table(
    ["Khái niệm hoặc nội dung", "Nguồn tham chiếu", "Vị trí trong tài liệu", "Mức áp dụng"],
    [
        ["Đối tượng của thiết kế và phạm vi", "IEEE 1016 và ISO 42010", "Mục 1 và Hình 1", "Đầy đủ theo phạm vi dự án"],
        ["Stakeholder và concern", "ISO 42010", "Mục 1 5 và 4 1", "Đầy đủ"],
        ["Architecture viewpoint và view", "ISO 42010", "Mục 4 2 và các mục 4 đến 14", "Điều chỉnh theo MVP"],
        ["Model kind và ký hiệu", "ISO 42010", "Sơ đồ logic, OAuth, RAG, deployment và các bảng trạng thái", "Ký hiệu dự án có nhãn trực tiếp"],
        ["Design element và responsibility", "IEEE 1016", "Mục 4 3, 5, 6 và 7", "Đầy đủ"],
        ["Interface và interaction", "IEEE 1016", "Mục 5 3, 9 và 11", "Đầy đủ cho interface liên thành phần"],
        ["Information view", "IEEE 1016 và ISO 42010", "Mục 8", "Logic data model; physical DDL thuộc đầu ra triển khai"],
        ["State và behavior", "IEEE 1016", "Mục 5 2, 6 2, 8 3, 11 và 12", "Đầy đủ cho luồng MVP"],
        ["Design rationale và quyết định", "IEEE 1016 và ISO 42010", "Mục 4 6 và 15 2", "Đầy đủ; quyết định mở có hạn chốt"],
        ["Correspondence và consistency", "ISO 42010", "Mục 4 5 và 14 4", "Đầy đủ"],
        ["Quality requirements", "ISO 25010", "Mục 3 2 và 14", "Điều chỉnh theo chất lượng cần kiểm chứng"],
        ["Verification và traceability", "IEEE 1016", "Mục 14", "Đầy đủ cho yêu cầu MVP"],
    ],
    widths=[4.0, 3.3, 5.3, 3.0], font_size=7.3
)

add_heading("18 2 Quy tắc điều chỉnh", 2)
for item in [
    "Tài liệu sử dụng ký hiệu hộp và mũi tên có nhãn thay cho một Architecture Description Language riêng vì quy mô dự án không yêu cầu công cụ mô hình chuyên dụng.",
    "Class diagram, physical database DDL và đặc tả hàm nội bộ được quản lý trong repository khi module bước vào triển khai chi tiết; các artefact đó phải giữ liên kết tới mã yêu cầu và ADR tương ứng.",
    "View hoặc tài liệu con chỉ được loại bỏ khi chủ trì kỹ thuật xác nhận không ảnh hưởng concern, traceability hoặc khả năng nghiệm thu.",
    "Nếu yêu cầu của đơn vị phê duyệt hoặc biểu mẫu tổ chức khác với cấu trúc này, nhóm phải lập bảng mapping và giữ nguyên mã yêu cầu, ADR và test case.",
]:
    add_bullet(item)

add_heading("18 3 Quy trình quản lý thay đổi", 2)
reset_numbering()
for item in [
    "Người đề xuất tạo change request, mô tả lý do, phạm vi, mức ưu tiên và ngày cần quyết định.",
    "Chủ trì kỹ thuật đánh giá ảnh hưởng đến requirement, architecture view, interface, dữ liệu, bảo mật, test và tiến độ.",
    "Chủ trì các module liên quan cập nhật ADR, schema, ma trận truy vết và kế hoạch kiểm thử trước khi phê duyệt.",
    "Người phê duyệt chấp nhận, chấp nhận có điều kiện hoặc từ chối thay đổi; quyết định được ghi cùng ngày và người chịu trách nhiệm.",
    "Sau khi chấp nhận, nhóm tăng phiên bản tài liệu, cập nhật lịch sử sửa đổi và phát hành lại baseline cho đúng danh sách nhận.",
]:
    add_number(item)

add_heading("18 4 Điều kiện phê duyệt baseline", 2)
add_table(
    ["Điều kiện", "Tiêu chí", "Kết quả phê duyệt"],
    [
        ["Phạm vi", "MVP và nội dung sau MVP được phân biệt, có chủ trì và mốc bàn giao", "Đạt hoặc nêu điều kiện"],
        ["Kiến trúc", "Stakeholder, concern, view, interface, dữ liệu và rationale không mâu thuẫn", "Đạt hoặc yêu cầu sửa"],
        ["Khả thi", "Ba prototype Sprint 1 xác nhận OAuth, transcript và YouTube integration", "Bắt buộc trước khóa thiết kế"],
        ["Bảo mật", "Không dùng API key provider, không đọc cookie AI Studio và không lưu Gemini token", "Bắt buộc"],
        ["Truy vết", "Mọi yêu cầu MVP có thành phần, interface hoặc dữ liệu và test case", "Bắt buộc"],
        ["Rủi ro", "Rủi ro cao có giảm thiểu, chủ trì và quyết định chấp nhận", "Bắt buộc"],
        ["Ký duyệt", "Người lập, chủ trì kỹ thuật, QA và người phê duyệt hoàn tất xác nhận", "Baseline có hiệu lực"],
    ],
    widths=[3.0, 9.5, 3.1], font_size=7.9
)

add_heading("Đề nghị phê duyệt", 1)
add_para(
    "Nhóm đề nghị phê duyệt tài liệu này làm baseline thiết kế có điều kiện cho YouTube Learning Companion. "
    "Điều kiện khóa kiến trúc là hoàn thành ba prototype Sprint 1 về Google OAuth và Gemini, transcript có timestamp, cùng YouTube Video ID và player control. "
    "Sau khi người có thẩm quyền ký duyệt và các điều kiện được ghi nhận, nhóm sử dụng phiên bản 2.0 để kiểm soát triển khai, truy vết và nghiệm thu.",
    align=WD_ALIGN_PARAGRAPH.JUSTIFY
)

add_heading("Quyết định của người phê duyệt", 2)
add_table(
    ["Phương án", "Đánh dấu", "Điều kiện hoặc ý kiến"],
    [
        ["Phê duyệt baseline phiên bản 2.0", "", ""],
        ["Phê duyệt có điều kiện", "", ""],
        ["Yêu cầu chỉnh sửa và trình lại", "", ""],
    ],
    widths=[6.0, 2.2, 7.4], font_size=8.8
)
add_table(
    ["Người phê duyệt", "Chức vụ", "Chữ ký", "Ngày"],
    [["", "", "", ""]],
    widths=[4.5, 4.0, 4.2, 2.9], font_size=8.8
)


# Core properties
doc.core_properties.title = "Đặc tả thiết kế phần mềm YouTube Learning Companion"
doc.core_properties.subject = "Software Design Description and Specification aligned to IEEE 1016 and ISO IEC IEEE 42010"
doc.core_properties.author = "Nhóm dự án YouTube Learning Companion"
doc.core_properties.keywords = "SDS, Chrome Extension, YouTube, Gemini, OAuth, RAG, FastAPI"
doc.core_properties.comments = "YLC-SDD-001 phiên bản 2.0 trình phê duyệt"

settings = doc.settings.element
update_fields = settings.find(qn("w:updateFields"))
if update_fields is None:
    update_fields = OxmlElement("w:updateFields")
    settings.append(update_fields)
update_fields.set(qn("w:val"), "true")


# Prevent widows for normal paragraphs and keep captions with figures where practical.
for paragraph in doc.paragraphs:
    p_pr = paragraph._p.get_or_add_pPr()
    if p_pr.find(qn("w:widowControl")) is None:
        widow = OxmlElement("w:widowControl")
        p_pr.append(widow)


doc.save(OUTPUT)
print(OUTPUT)
