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

        sys_type_raw = data.get("system_type", "wet").lower()
        sys_types    = [s.strip() for s in sys_type_raw.split(",")]
        fire_pump    = data.get("fire_pump", False)
        subst_date   = data.get("subst_date") or data.get("date", "")
        project_name = data.get("project", "")

        cover_overlay = make_cover_overlay(data, extra_items, fire_pump)
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


def make_cover_overlay(data, extra_items, fire_pump=False):
    buf    = BytesIO()
    page_h = 841.89
    c      = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top

    c.setFont("Helvetica", 10)
    c.drawString(71,  y(133), data.get("to",      ""))
    c.drawString(312, y(133), data.get("date",     ""))
    c.drawString(76,  y(199), data.get("attn",     ""))
    c.drawString(325, y(197), data.get("project",  ""))

    name = data.get("name", "")
    c.setFillColorRGB(1, 1, 1)
    c.rect(318, y(667), 200, 22, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 16)
    c.drawString(321, y(664), name)

    email = data.get("email", "")
    c.setFillColorRGB(1, 1, 1)
    c.rect(200, y(548), 260, 14, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 9)
    c.drawString(206, y(545), email)

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(414, y(227), "x")

    c.setFillColorRGB(0, 0, 0)
    c.rect(140, y(584), 8, 8, fill=1, stroke=1)

    filtered_extras = [x for x in extra_items if "Fire Pump" not in x]

    doc_list = ["O&M", "Maintenance Chart", "Summary of Minimum", "NFPA 25"]
    if fire_pump:
        doc_list.append("Fire Pump Testing")
    doc_list.append("One Year Warranty")
    doc_list += filtered_extras

    table_top  = 300.2
    row_height = 21.96
    n_rows     = 10

    c.setFillColorRGB(1, 1, 1)
    for i in range(5):
        row_top = table_top + i * row_height
        c.rect(137, y(row_top + row_height - 1), 350, row_height - 1, fill=1, stroke=0)

    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 10)
    for i, item in enumerate(doc_list[:n_rows]):
        row_top = table_top + i * row_height
        text_y  = row_top + row_height * 0.72
        c.drawString(138.3, y(text_y), item)

    c.save(); buf.seek(0)
    return buf.read()


def make_warranty_overlay(subst_date, project_name="", signer_name="", page_h=792.0):
    buf = BytesIO()
    c   = rl_canvas.Canvas(buf, pagesize=(612, page_h))
    def y(top): return page_h - top

    c.setFillColorRGB(1, 1, 1)
    c.rect(88, y(572), 130, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 12)
    c.drawString(90, y(569), subst_date)

    c.setFillColorRGB(1, 1, 1)
    c.rect(270, y(253), 220, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Times-Bold", 12)
    c.drawString(275, y(250), project_name + ".")

    c.setFillColorRGB(1, 1, 1)
    c.rect(88, 307, 342, 30, fill=1, stroke=0)

    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.2)
    c.line(88.6, y(483.2), 523.4, y(483.2))

    if signer_name:
        c.setFillColorRGB(0, 0, 0)
        c.saveState()
        c.transform(1, 0, 0.25, 1, 0, 0)
        c.setFont("Times-BoldItalic", 20)
        c.drawString(10, y(472), signer_name)
        c.restoreState()

    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1.2)
    c.line(88.6, y(571.1), 523.4, y(571.1))

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


# ─────────────────────────────────────────
#  HYDRAULIC PLACARD
# ─────────────────────────────────────────

@app.route("/placard", methods=["POST"])
def placard():
    try:
        body     = request.get_json(force=True)
        calc_b64 = body.get("calcB64", "")
        if not calc_b64:
            return jsonify({"error": "No calc PDF provided"}), 400

        calc_bytes = base64.b64decode(calc_b64)
        data = extract_placard_data(calc_bytes)

        overrides = body.get("overrides", {})
        for k, v in overrides.items():
            if v:
                data[k] = v

        pdf = generate_placard(data)

        return jsonify({
            "pdf":  base64.b64encode(pdf).decode(),
            "data": data,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def extract_placard_data(pdf_bytes):
    import re
    import pdfplumber
    data = {}
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        lines = pdf.pages[0].extract_text().split('\n')

    for i, line in enumerate(lines):
        if line.startswith('Job Name:') and i+1 < len(lines):
            data['job_name'] = lines[i+1].split('  ')[0].strip()
        if line.startswith('Address 1') and i+1 < len(lines):
            data['location'] = lines[i+1].strip()
        m = re.match(r'([\d.]+)gpm/ft.*?(\d+)ft²\s*\(Actual', line)
        if m:
            data['density'] = m.group(1)
            data['area']    = m.group(2)
        if i > 0 and 'Coverage Per Sprinkler' in lines[i-1]:
            parts = line.split()
            if len(parts) >= 2:
                data['num_sprinklers'] = parts[1]
        if i > 0 and 'System Pressure Demand' in lines[i-1]:
            parts = line.split()
            if len(parts) >= 2:
                data['pressure']  = parts[0]
                data['flow_rate'] = parts[1]
        m = re.search(r'(\d+)/(\d+)/(\d{4})', line)
        if m and 'year' not in data:
            data['month'] = m.group(1).zfill(2)
            data['day']   = m.group(2).zfill(2)
            data['year']  = m.group(3)

    return data


def generate_placard(data):
    from reportlab.lib.colors import HexColor, white
    from reportlab.lib.units import inch

    RED = HexColor('#C0272D')
    buf = BytesIO()
    W, H = 5.5*inch, 7.5*inch
    c = rl_canvas.Canvas(buf, pagesize=(W, H))

    c.setFillColor(RED)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    c.setStrokeColor(white)
    c.setLineWidth(3)
    c.rect(0.18*inch, 0.18*inch, W-0.36*inch, H-0.36*inch, fill=0, stroke=1)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(W/2, H-0.65*inch, "HYDRAULIC SYSTEM")
    tw = c.stringWidth("HYDRAULIC SYSTEM", "Helvetica-Bold", 22)
    c.setLineWidth(1.5)
    c.line(W/2-tw/2, H-0.72*inch, W/2+tw/2, H-0.72*inch)

    c.setFont("Helvetica", 11)
    c.drawCentredString(W/2, H-0.95*inch,  "This building is protected")
    c.drawCentredString(W/2, H-1.12*inch, "by a Hydraulically Designed")
    c.drawCentredString(W/2, H-1.29*inch, "Automatic Sprinkler System.")

    def box(x, y, w, h, text="", fsize=11, align="center"):
        c.setFillColor(white)
        c.rect(x, y, w, h, fill=1, stroke=0)
        if text:
            c.setFillColor(RED)
            c.setFont("Helvetica", fsize)
            if align == "center":
                c.drawCentredString(x+w/2, y+h*0.28, str(text))
            else:
                c.drawString(x+0.06*inch, y+h*0.28, str(text))

    def lbl(x, y, text, size=12):
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", size)
        c.drawString(x, y, text)

    # Date Installed
    lbl(0.3*inch, H-1.63*inch, "Date Installed")
    bx, by, bh = 2.1*inch, H-1.78*inch, 0.28*inch
    box(bx,             by, 0.95*inch, bh, data.get('month',''))
    box(bx+1.0*inch,    by, 0.72*inch, bh, data.get('day',''))
    box(bx+1.77*inch,   by, 0.95*inch, bh, data.get('year',''))
    c.setFillColor(white); c.setFont("Helvetica", 7)
    c.drawCentredString(bx+0.475*inch,          by-0.11*inch, "MONTH")
    c.drawCentredString(bx+1.0*inch+0.36*inch,  by-0.11*inch, "DAY")
    c.drawCentredString(bx+1.77*inch+0.475*inch, by-0.11*inch, "YEAR")

    # Location
    lbl(0.3*inch, H-2.17*inch, "Location")
    box(1.5*inch, H-2.32*inch, 3.72*inch, 0.28*inch, data.get('location',''), fsize=8, align="left")

    # No. of Sprinklers
    lbl(0.3*inch, H-2.67*inch, "No. of Sprinklers")
    box(2.45*inch, H-2.82*inch, 2.77*inch, 0.28*inch, data.get('num_sprinklers',''))

    # Basis of Design
    lbl(0.3*inch, H-3.22*inch, "Basis of Design", size=14)
    c.setFillColor(white); c.setFont("Helvetica", 11)
    c.drawString(0.5*inch, H-3.57*inch, "1. Density")
    box(1.75*inch, H-3.72*inch, 2.55*inch, 0.28*inch, data.get('density',''))
    c.setFillColor(white); c.setFont("Helvetica", 8)
    c.drawString(4.35*inch, H-3.63*inch, "GPM/SQ.FT.")

    c.setFillColor(white); c.setFont("Helvetica", 11)
    c.drawString(0.5*inch, H-4.05*inch, "2. Designed area of discharge")
    box(3.25*inch, H-4.20*inch, 1.05*inch, 0.28*inch, data.get('area',''))
    c.setFillColor(white); c.setFont("Helvetica", 8)
    c.drawString(4.35*inch, H-4.11*inch, "SQ.FT.")

    # System Design
    lbl(0.3*inch, H-4.60*inch, "System Design", size=14)
    c.setFillColor(white); c.setFont("Helvetica", 11)
    c.drawString(0.5*inch, H-4.93*inch, "1. Water flow rate")
    box(2.75*inch, H-5.08*inch, 1.3*inch, 0.28*inch, data.get('flow_rate',''))
    c.setFillColor(white); c.setFont("Helvetica", 8)
    c.drawString(4.10*inch, H-4.99*inch, "GPM")

    c.setFillColor(white); c.setFont("Helvetica", 11)
    c.drawString(0.5*inch, H-5.38*inch, "2. Residual pressure at the")
    c.drawString(0.5*inch, H-5.56*inch, "    base of the riser")
    box(2.75*inch, H-5.60*inch, 1.3*inch, 0.28*inch, data.get('pressure',''))
    c.setFillColor(white); c.setFont("Helvetica", 8)
    c.drawString(4.10*inch, H-5.51*inch, "PSI")

    # Installed by
    lbl(0.3*inch, H-6.05*inch, "Installed by", size=14)
    box(0.3*inch, H-6.82*inch, 4.9*inch, 0.58*inch, "", fsize=16, align="center")
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(0.3*inch + 4.9*inch/2, H-6.82*inch + 0.58*inch*0.28, "MULTICRAFT FIRE")

    c.save()
    buf.seek(0)
    return buf.read()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)


