import os, base64
from io import BytesIO
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from reportlab.pdfgen import canvas as rl_canvas
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

        sys_type   = data.get("system_type", "wet").lower()
        fire_pump  = data.get("fire_pump", False)
        subst_date = data.get("subst_date") or data.get("date", "")

        cover_overlay = make_cover_overlay(data, extra_items)
        filled_cover  = overlay_pdf(TMPL_DIR / "Closeout_Cover_sheet.pdf", cover_overlay, 0)

        if "standpipe" in sys_type:
            om = [TMPL_DIR / "2_-_SECTION_1_Intoduction_closeout.pdf",
                  TMPL_DIR / "3_-_DRY_standpipe_-_OP.pdf"]
        elif "dry" in sys_type or "pre" in sys_type or "deluge" in sys_type:
            om = [TMPL_DIR / "2_-_SECTION_1_Intoduction_closeout.pdf",
                  TMPL_DIR / "3_-_DRY-OP.pdf"]
        else:
            om = [TMPL_DIR / "2_-_SECTION_1_Intoduction_closeout.pdf",
                  TMPL_DIR / "3_-_WET-OP.pdf"]

        static = [
            TMPL_DIR / "4_-_maintenancechart.pdf",
            TMPL_DIR / "5_-_summaryofminimum.pdf",
            TMPL_DIR / "NFPA25_Guidelines.pdf",
        ]
        if fire_pump:
            static.append(TMPL_DIR / "Fire_Pump_Testing.pdf")

        warranty_overlay = make_warranty_overlay(subst_date)
        warranty_stamped = overlay_pdf(TMPL_DIR / "CLOSEOUTS_WARRANTY.pdf", warranty_overlay, 1)

        writer = PdfWriter()
        for src in [BytesIO(filled_cover)] + [open(p, "rb") for p in om + static]:
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
    buf = BytesIO()
    page_h = 841.89
    c = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top
    c.setFont("Helvetica", 11)
    c.drawString(70,  y(127.9), data.get("to",     ""))
    c.drawString(320, y(127.9), data.get("date",    ""))
    c.drawString(80,  y(192.7), data.get("attn",    ""))
    c.drawString(335, y(192.7), data.get("project", ""))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(413, y(216.3), "x")
    c.drawString(138, y(578.3), "x")
    row_tops = [416.4, 437.2, 458.0, 478.8, 499.6]
    c.setFont("Helvetica", 10.5)
    for i, item in enumerate(extra_items[:5]):
        c.drawString(138.3, y(row_tops[i]), item)
    c.save(); buf.seek(0)
    return buf.read()


def make_warranty_overlay(subst_date, page_h=792.0):
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top
    c.setFillColorRGB(1, 1, 1)
    c.rect(88, y(562), 120, 14, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 11)
    c.drawString(90, y(559), subst_date)
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
