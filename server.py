import os, base64
from io import BytesIO
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor
from pypdf import PdfWriter, PdfReader

BASE_DIR = Path(__file__).parent
TMPL_DIR = BASE_DIR / "templates"

app = Flask(__name__)

@app.route("/")
def index():
    return send_from_directory(str(BASE_DIR), "index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(str(BASE_DIR / "static"), filename)

@app.route("/generate", methods=["POST"])
def generate():
    try:
        body         = request.get_json(force=True)
        data         = body.get("data", {})
        extra_items  = body.get("extraItems", [])
        test_b64s    = body.get("testB64s", [])
        asbuilt_b64s = body.get("asbuiltB64s", [])

        sys_type_raw = data.get("system_type", "wet").lower()
        sys_types    = [s.strip() for s in sys_type_raw.split(",")]
        fire_pump    = data.get("fire_pump", False)
        subst_date   = data.get("subst_date") or data.get("date", "")
        project_name = data.get("project", "")

        cover_overlay = make_cover_overlay(data, extra_items)
        filled_cover  = overlay_pdf(TMPL_DIR / "Closeout_Cover_sheet.pdf", cover_overlay, 0)

        seen_om = set()
        om = []
        intro = TMPL_DIR / "2_-_SECTION_1_Intoduction_closeout.pdf"
        om.append(intro); seen_om.add(str(intro))

        for st in sys_types:
            if "standpipe" in st:
                p = TMPL_DIR / "3_-_DRY_standpipe_-_OP.pdf"
            elif "dry" in st or "pre" in st or "deluge" in st:
                p = TMPL_DIR / "3_-_DRY-OP.pdf"
            else:
                p = TMPL_DIR / "3_-_WET-OP.pdf"
            if str(p) not in seen_om:
                om.append(p); seen_om.add(str(p))

        static_docs = [
            TMPL_DIR / "4_-_maintenancechart.pdf",
            TMPL_DIR / "5_-_summaryofminimum.pdf",
            TMPL_DIR / "NFPA25_Guidelines.pdf",
        ]
        if fire_pump:
            static_docs.append(TMPL_DIR / "Fire_Pump_Testing.pdf")

        warranty_overlay = make_warranty_overlay(subst_date, project_name, data.get("name", ""))
        warranty_stamped = overlay_pdf(TMPL_DIR / "CLOSEOUTS_WARRANTY.pdf", warranty_overlay, 1)

        writer = PdfWriter()
        for src in [BytesIO(filled_cover)] + [open(p, "rb") for p in om + static_docs]:
            for page in PdfReader(src).pages:
                writer.add_page(page)
        for page in PdfReader(BytesIO(warranty_stamped)).pages:
            writer.add_page(page)
        for b64 in test_b64s:
            for page in PdfReader(BytesIO(base64.b64decode(b64))).pages:
                writer.add_page(page)
        for b64 in asbuilt_b64s:
            for page in PdfReader(BytesIO(base64.b64decode(b64))).pages:
                writer.add_page(page)

        out = BytesIO()
        writer.write(out)
        out.seek(0)
        pdf_bytes = out.read()

        return jsonify({
            "pdf":   base64.b64encode(pdf_bytes).decode(),
            "pages": len(PdfReader(BytesIO(pdf_bytes)).pages),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def make_cover_overlay(data, extra_items):
    buf    = BytesIO()
    page_h = 841.89
    c      = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top

    # Text fields
    c.setFont("Helvetica", 10)
    c.drawString(71,  y(133),   data.get("to",      ""))
    c.drawString(312, y(133),   data.get("date",     ""))
    c.drawString(76,  y(199),   data.get("attn",     ""))
    c.drawString(325, y(197),   data.get("project",  ""))

    # White out Jason Grubb and replace with user name
    name = data.get("name", "Jason Grubb")
    c.setFillColorRGB(1, 1, 1)
    c.rect(318, y(667), 180, 22, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 16)
    c.drawString(321, y(664), name)

    # White out email and replace
    email = data.get("email", "jason@multicraftfire.com")
    c.setFillColorRGB(1, 1, 1)
    c.rect(200, y(548), 250, 14, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 9)
    c.drawString(206, y(545), email)

    # X for Closeout Documents checkbox — label at x=424.2 top=219.7, checkbox is just left of label
    c.setFont("Helvetica-Bold", 9)
    c.drawString(414, y(227), "x")

    # X for For Your Use checkbox — label at x=167.7 top=578.3, checkbox just left
    c.drawString(143, y(585), "x")

    # Extra items in description table
    row_tops = [310, 331, 352, 373, 394]
    c.setFont("Helvetica", 10)
    for i, item in enumerate(extra_items[:5]):
        c.drawString(148, y(row_tops[i]), item)

    c.save(); buf.seek(0)
    return buf.read()


def make_warranty_overlay(subst_date, project_name="", signer_name="", page_h=792.0):
    buf = BytesIO()
    c   = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top

    # White out xx/xx/xx and stamp substantial completion date
    c.setFillColorRGB(1, 1, 1)
    c.rect(88, y(572), 130, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 12)
    c.drawString(90, y(569), subst_date)

    # White out blank after "for the" and stamp project name
    c.setFillColorRGB(1, 1, 1)
    c.rect(270, y(253), 220, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Times-Bold", 12)
    c.drawString(275, y(250), project_name + ".")

    # White out existing signature and write user name as signature
    if signer_name:
        c.setFillColorRGB(1, 1, 1)
        c.rect(88, y(490), 280, 22, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica-Oblique", 16)
        c.drawString(90, y(487), signer_name)

    c.save(); buf.seek(0)
    return buf.read()


def overlay_pdf(base_path, overlay_bytes, page_index=0):
    base_r = PdfReader(str(base_path))
    ovr_r  = PdfReader(BytesIO(overlay_bytes))
    writer = PdfWriter()
    for i, page in enumerate(base_r.pages):
        if i == page_index:
            page.merge_page(ovr_r.pages[0])
        writer.add_page(page)
    out = BytesIO(); writer.write(out); out.seek(0)
    return out.read()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
