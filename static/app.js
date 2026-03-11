// STATE
var state = {
  sysType: [], firepump: false, tests: false, asbuilts: false,
  testFiles: [], asbuiltFiles: [], pdfB64: "", status: "idle"
};

function readFileAsB64(file) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result.split(",")[1]); };
    r.onerror = function() { reject(new Error("File read failed")); };
    r.readAsDataURL(file);
  });
}

function fmtDate(d) {
  if (!d) return "";
  var parts = d.split("-");
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(parts[1], 10) - 1] + " " + parseInt(parts[2], 10) + ", " + parts[0];
}

// COVER DATE
var coverDateInput   = document.getElementById("inp-cover-date");
var coverDateDisplay = document.getElementById("cover-date-display");
(function() {
  var today = new Date();
  coverDateInput.value = today.toISOString().split("T")[0];
  coverDateDisplay.textContent = fmtDate(coverDateInput.value);
}());
coverDateInput.addEventListener("change", function() {
  coverDateDisplay.textContent = fmtDate(coverDateInput.value);
});

// SYSTEM TYPE BUTTONS
document.querySelectorAll(".sys-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    var sys = btn.dataset.sys;
    var idx = state.sysType.indexOf(sys);
    if (idx === -1) { state.sysType.push(sys); btn.classList.add("active"); }
    else { state.sysType.splice(idx, 1); btn.classList.remove("active"); }
    updateGenerateBtn();
  });
});

// TOGGLE SWITCHES
function setupToggle(rowId, switchId, key, panelId) {
  var row   = document.getElementById(rowId);
  var sw    = document.getElementById(switchId);
  var panel = panelId ? document.getElementById(panelId) : null;
  row.addEventListener("click", function() {
    state[key] = !state[key];
    sw.classList.toggle("on", state[key]);
    if (panel) panel.classList.toggle("open", state[key]);
  });
}
setupToggle("toggle-firepump", "sw-firepump", "firepump", null);
setupToggle("toggle-tests",    "sw-tests",    "tests",    "panel-tests");
setupToggle("toggle-asbuilts", "sw-asbuilts", "asbuilts", "panel-asbuilts");

// FILE UPLOADS
function setupDropZone(dzId, fileInputId, listId, stateKey) {
  var dz    = document.getElementById(dzId);
  var input = document.getElementById(fileInputId);
  var list  = document.getElementById(listId);
  dz.addEventListener("click", function() { input.click(); });
  dz.addEventListener("dragover", function(e) { e.preventDefault(); dz.classList.add("dragging"); });
  dz.addEventListener("dragleave", function() { dz.classList.remove("dragging"); });
  dz.addEventListener("drop", function(e) {
    e.preventDefault(); dz.classList.remove("dragging");
    addFiles(Array.from(e.dataTransfer.files), stateKey, list);
  });
  input.addEventListener("change", function() {
    addFiles(Array.from(input.files), stateKey, list);
    input.value = "";
  });
}

function addFiles(files, stateKey, listEl) {
  files.forEach(function(f) {
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      state[stateKey].push(f);
      renderFileList(stateKey, listEl);
    }
  });
}

function renderFileList(stateKey, listEl) {
  listEl.innerHTML = "";
  state[stateKey].forEach(function(f, i) {
    var item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = '<span class="fi-icon">&#128196;</span>' +
      '<span class="fi-name">' + f.name + '</span>' +
      '<button class="fi-remove" data-i="' + i + '">&times;</button>';
    listEl.appendChild(item);
  });
  listEl.querySelectorAll(".fi-remove").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state[stateKey].splice(parseInt(btn.dataset.i, 10), 1);
      renderFileList(stateKey, listEl);
    });
  });
}

setupDropZone("dz-tests",    "file-tests",    "list-tests",    "testFiles");
setupDropZone("dz-asbuilts", "file-asbuilts", "list-asbuilts", "asbuiltFiles");

// GENERATE BUTTON
var projectInput = document.getElementById("inp-project");
var generateBtn  = document.getElementById("generate-btn");

function updateGenerateBtn() {
  generateBtn.disabled = !(projectInput.value.trim() && state.sysType.length > 0);
}
projectInput.addEventListener("input", updateGenerateBtn);

// SHOW STATE (closeout)
function showState(s) {
  state.status = s;
  document.getElementById("idle-state").style.display       = s === "idle"       ? "flex"  : "none";
  document.getElementById("generating-state").style.display = s === "generating" ? "flex"  : "none";
  document.getElementById("done-state").style.display       = s === "done"       ? "block" : "none";
  document.getElementById("error-state").style.display      = s === "error"      ? "block" : "none";
}
document.getElementById("idle-state").style.display = "block";

// GENERATE CLOSEOUT
generateBtn.addEventListener("click", async function() {
  generateBtn.disabled = true;
  showState("generating");
  try {
    var testB64s    = await Promise.all(state.testFiles.map(readFileAsB64));
    var asbuiltB64s = await Promise.all(state.asbuiltFiles.map(readFileAsB64));
    var extraItems  = [];
    if (state.tests) {
      if (state.testFiles.length > 0) state.testFiles.forEach(function(f) { extraItems.push(f.name.replace(/\.pdf$/i, "")); });
      else extraItems.push("Test Papers");
    }
    if (state.asbuilts) {
      if (state.asbuiltFiles.length > 0) state.asbuiltFiles.forEach(function(f) { extraItems.push(f.name.replace(/\.pdf$/i, "")); });
      else extraItems.push("As-Builts");
    }
    var payload = {
      data: {
        project:     projectInput.value.trim(),
        to:          document.getElementById("inp-to").value.trim(),
        attn:        document.getElementById("inp-attn").value.trim(),
        date:        fmtDate(coverDateInput.value),
        subst_date:  fmtDate(document.getElementById("inp-subst").value),
        name:        document.getElementById("inp-name").value.trim(),
        email:       document.getElementById("inp-email").value.trim(),
        system_type: state.sysType.join(","),
        fire_pump:   state.firepump
      },
      extraItems: extraItems, testB64s: testB64s, asbuiltB64s: asbuiltB64s
    };
    var resp   = await fetch("/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    state.pdfB64 = parsed.pdf;
    var docs = ["Cover Sheet","O&M Manual","Maintenance Chart","Summary of Minimum","NFPA 25 Guidelines"];
    if (state.firepump) docs.push("Fire Pump Testing");
    docs.push("One Year Warranty");
    extraItems.forEach(function(x) { docs.push(x); });
    document.getElementById("done-title").textContent = projectInput.value.trim() + " - Closeout Ready";
    document.getElementById("done-meta").textContent  = parsed.pages + " pages - " + docs.length + " documents";
    var docList = document.getElementById("doc-list");
    docList.innerHTML = "";
    docs.forEach(function(d, i) {
      var el = document.createElement("div");
      el.className = "doc-item";
      el.innerHTML = '<div class="doc-num">' + (i + 1) + '</div><span>' + d + '</span>';
      docList.appendChild(el);
    });
    showState("done");
  } catch (err) {
    document.getElementById("error-msg").textContent = err.message || "Unknown error";
    showState("error");
    generateBtn.disabled = false;
  }
});

document.getElementById("dl-btn").addEventListener("click", function() {
  var a = document.createElement("a");
  a.href = "data:application/pdf;base64," + state.pdfB64;
  var name = projectInput.value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || "Closeout";
  a.download = name + "_Closeout_Package.pdf";
  a.click();
});

function resetAll() {
  state.sysType = []; state.firepump = false; state.tests = false; state.asbuilts = false;
  state.testFiles = []; state.asbuiltFiles = []; state.pdfB64 = ""; state.status = "idle";
  ["inp-project","inp-to","inp-attn","inp-subst","inp-name","inp-email"].forEach(function(id) {
    document.getElementById(id).value = "";
  });
  document.querySelectorAll(".sys-btn").forEach(function(b) { b.classList.remove("active"); });
  ["firepump","tests","asbuilts"].forEach(function(k) { document.getElementById("sw-" + k).classList.remove("on"); });
  document.getElementById("panel-tests").classList.remove("open");
  document.getElementById("panel-asbuilts").classList.remove("open");
  document.getElementById("list-tests").innerHTML    = "";
  document.getElementById("list-asbuilts").innerHTML = "";
  updateGenerateBtn();
  showState("idle");
}
document.getElementById("reset-btn").addEventListener("click", resetAll);
document.getElementById("retry-btn").addEventListener("click", function() { showState("idle"); generateBtn.disabled = false; });

// TAB SWITCHING
document.querySelectorAll(".tab-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-section").forEach(function(s) { s.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "placard") {
      renderPlacardPreview(placardState.placardStyle);
    }
  });
});

// PLACARD STATE
var placardState = {
  calcFile: null, pdfB64: "", status: "idle", placardStyle: "v1"
};

// SVG V1
function svgV1() {
  var R = "#C0272D";
  var s = '<svg viewBox="0 0 220 300" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">';
  s += '<rect width="220" height="300" fill="' + R + '" rx="4"/>';
  s += '<rect x="5" y="5" width="210" height="290" fill="none" stroke="white" stroke-width="2" rx="3"/>';
  s += '<text x="110" y="28" fill="white" font-size="11" font-weight="bold" text-anchor="middle">HYDRAULIC SYSTEM</text>';
  s += '<line x1="28" y1="32" x2="192" y2="32" stroke="white" stroke-width="1"/>';
  s += '<text x="110" y="46" fill="white" font-size="7.5" text-anchor="middle">This building is protected</text>';
  s += '<text x="110" y="56" fill="white" font-size="7.5" text-anchor="middle">by a Hydraulically Designed</text>';
  s += '<text x="110" y="66" fill="white" font-size="7.5" text-anchor="middle">Automatic Sprinkler System.</text>';
  s += '<text x="14" y="84" fill="white" font-size="7" font-weight="bold">Date Installed</text>';
  s += '<rect x="82" y="74" width="34" height="12" fill="white" rx="1"/>';
  s += '<rect x="119" y="74" width="26" height="12" fill="white" rx="1"/>';
  s += '<rect x="148" y="74" width="34" height="12" fill="white" rx="1"/>';
  s += '<text x="99" y="91" fill="white" font-size="5" text-anchor="middle">MONTH</text>';
  s += '<text x="132" y="91" fill="white" font-size="5" text-anchor="middle">DAY</text>';
  s += '<text x="165" y="91" fill="white" font-size="5" text-anchor="middle">YEAR</text>';
  s += '<text x="14" y="106" fill="white" font-size="7" font-weight="bold">Location</text>';
  s += '<rect x="55" y="96" width="145" height="12" fill="white" rx="1"/>';
  s += '<text x="14" y="122" fill="white" font-size="7" font-weight="bold">No. of Sprinklers</text>';
  s += '<rect x="90" y="112" width="110" height="12" fill="white" rx="1"/>';
  s += '<text x="14" y="140" fill="white" font-size="8" font-weight="bold">Basis of Design</text>';
  s += '<text x="20" y="155" fill="white" font-size="7">1. Density</text>';
  s += '<rect x="68" y="145" width="100" height="12" fill="white" rx="1"/>';
  s += '<text x="172" y="154" fill="white" font-size="5">GPM/SQ.FT.</text>';
  s += '<text x="20" y="172" fill="white" font-size="7">2. Designed area of discharge</text>';
  s += '<rect x="128" y="162" width="42" height="12" fill="white" rx="1"/>';
  s += '<text x="174" y="171" fill="white" font-size="5">SQ.FT.</text>';
  s += '<text x="14" y="190" fill="white" font-size="8" font-weight="bold">System Design</text>';
  s += '<text x="20" y="205" fill="white" font-size="7">1. Water flow rate</text>';
  s += '<rect x="108" y="195" width="52" height="12" fill="white" rx="1"/>';
  s += '<text x="164" y="204" fill="white" font-size="5">GPM</text>';
  s += '<text x="20" y="220" fill="white" font-size="7">2. Residual pressure at the</text>';
  s += '<text x="20" y="229" fill="white" font-size="7">    base of the riser</text>';
  s += '<rect x="108" y="218" width="52" height="12" fill="white" rx="1"/>';
  s += '<text x="164" y="227" fill="white" font-size="5">PSI</text>';
  s += '<text x="14" y="248" fill="white" font-size="8" font-weight="bold">Installed by</text>';
  s += '<rect x="14" y="254" width="192" height="32" fill="white" rx="2"/>';
  s += '<text x="110" y="274" fill="' + R + '" font-size="11" font-weight="bold" text-anchor="middle">MULTICRAFT FIRE</text>';
  s += '</svg>';
  return s;
}

// SVG V2
function svgV2() {
  var R = "#C0272D";
  var s = '<svg viewBox="0 0 220 300" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">';
  s += '<rect width="220" height="300" fill="' + R + '" rx="4"/>';
  s += '<rect x="5" y="5" width="210" height="290" fill="none" stroke="white" stroke-width="2" rx="3"/>';
  s += '<text x="110" y="22" fill="white" font-size="8.5" font-weight="bold" text-anchor="middle">Hydraulically Calculated System</text>';
  s += '<text x="13" y="35" fill="white" font-size="5.5">This system as shown on</text>';
  s += '<rect x="90" y="27" width="115" height="9" fill="white" rx="1"/>';
  s += '<text x="92" y="35" fill="' + R + '" font-size="5.5" font-weight="bold">Multicraft Fire</text>';
  s += '<text x="13" y="47" fill="white" font-size="5.5">company print no</text>';
  s += '<rect x="66" y="39" width="48" height="9" fill="white" rx="1"/>';
  s += '<text x="118" y="47" fill="white" font-size="5.5">dated</text>';
  s += '<rect x="137" y="39" width="68" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="59" fill="white" font-size="5.5">for</text>';
  s += '<rect x="21" y="51" width="184" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="71" fill="white" font-size="5.5">at</text>';
  s += '<rect x="18" y="63" width="187" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="83" fill="white" font-size="5.5">contract no</text>';
  s += '<rect x="56" y="75" width="149" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="96" fill="white" font-size="5.5">is designed to discharge at a rate of</text>';
  s += '<rect x="155" y="88" width="40" height="9" fill="white" rx="1"/>';
  s += '<text x="198" y="96" fill="white" font-size="5.5">gpm</text>';
  s += '<text x="13" y="107" fill="white" font-size="5">(L/min) per sq ft (m2) over a maximum area of</text>';
  s += '<rect x="13" y="111" width="78" height="9" fill="white" rx="1"/>';
  s += '<text x="95" y="119" fill="white" font-size="5.5">sq ft (m2) when supplied</text>';
  s += '<text x="13" y="131" fill="white" font-size="5.5">with water at the rate of</text>';
  s += '<rect x="101" y="123" width="54" height="9" fill="white" rx="1"/>';
  s += '<text x="159" y="131" fill="white" font-size="5.5">gpm (L/min)</text>';
  s += '<text x="13" y="142" fill="white" font-size="5.5">at</text>';
  s += '<rect x="18" y="134" width="54" height="9" fill="white" rx="1"/>';
  s += '<text x="76" y="142" fill="white" font-size="5.5">psi at base of riser.</text>';
  s += '<text x="13" y="154" fill="white" font-size="5.5">Hose stream allowance of</text>';
  s += '<rect x="101" y="146" width="54" height="9" fill="white" rx="1"/>';
  s += '<text x="159" y="154" fill="white" font-size="5.5">gpm (L/min)</text>';
  s += '<text x="13" y="165" fill="white" font-size="5.5">is included in the above.</text>';
  s += '<text x="13" y="179" fill="white" font-size="5.5">Occupancy classification</text>';
  s += '<rect x="101" y="171" width="104" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="192" fill="white" font-size="5.5">Commodity classification</text>';
  s += '<rect x="101" y="184" width="104" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="205" fill="white" font-size="5.5">Maximum storage height</text>';
  s += '<rect x="101" y="197" width="104" height="9" fill="white" rx="1"/>';
  s += '<text x="13" y="222" fill="white" font-size="5.5">Installed by:</text>';
  s += '<rect x="13" y="226" width="194" height="28" fill="white" rx="2"/>';
  s += '<text x="110" y="244" fill="' + R + '" font-size="10" font-weight="bold" text-anchor="middle">MULTICRAFT FIRE</text>';
  s += '</svg>';
  return s;
}

// RENDER PREVIEW
function renderPlacardPreview(style) {
  var wrap  = document.getElementById("placard-svg-wrap");
  var badge = document.getElementById("placard-preview-badge");
  if (!wrap || !badge) return;
  wrap.style.opacity = "0";
  setTimeout(function() {
    wrap.innerHTML = style === "v2" ? svgV2() : svgV1();
    badge.textContent = style === "v2" ? "Calculated System Template" : "Standard Template";
    wrap.style.opacity = "1";
  }, 150);
}

// TEMPLATE SELECTOR
document.querySelectorAll(".tmpl-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".tmpl-btn").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    placardState.placardStyle = btn.dataset.tmpl;
    applyTemplateFields(btn.dataset.tmpl);
    renderPlacardPreview(btn.dataset.tmpl);
  });
});

function applyTemplateFields(style) {
  var v2Fields        = document.querySelectorAll(".v2-only");
  var fieldSprinklers = document.getElementById("field-sprinklers");
  var fieldDate       = document.getElementById("field-date");
  if (style === "v2") {
    v2Fields.forEach(function(el) { el.classList.add("visible"); });
    if (fieldSprinklers) fieldSprinklers.style.display = "none";
    if (fieldDate)       fieldDate.style.display       = "none";
  } else {
    v2Fields.forEach(function(el) { el.classList.remove("visible"); });
    if (fieldSprinklers) fieldSprinklers.style.display = "";
    if (fieldDate)       fieldDate.style.display       = "";
  }
}

window.addEventListener("load", function() {
  renderPlacardPreview("v1");
});

// CALC FILE UPLOAD
var dzCalc     = document.getElementById("dz-calc");
var fileCalc   = document.getElementById("file-calc");
var placardBtn = document.getElementById("placard-btn");

dzCalc.addEventListener("click", function() { fileCalc.click(); });
dzCalc.addEventListener("dragover", function(e) { e.preventDefault(); dzCalc.classList.add("dragging"); });
dzCalc.addEventListener("dragleave", function() { dzCalc.classList.remove("dragging"); });
dzCalc.addEventListener("drop", function(e) {
  e.preventDefault(); dzCalc.classList.remove("dragging");
  var f = e.dataTransfer.files[0];
  if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) setCalcFile(f);
});
fileCalc.addEventListener("change", function() {
  if (fileCalc.files[0]) setCalcFile(fileCalc.files[0]);
  fileCalc.value = "";
});
document.getElementById("calc-file-remove").addEventListener("click", function() {
  placardState.calcFile = null;
  document.getElementById("calc-file-info").style.display = "none";
  document.getElementById("dz-calc").style.display        = "block";
  placardBtn.disabled = true;
  clearPlacardFields();
});

function setCalcFile(f) {
  placardState.calcFile = f;
  document.getElementById("calc-file-name").textContent   = f.name;
  document.getElementById("calc-file-info").style.display = "flex";
  document.getElementById("dz-calc").style.display        = "none";
  document.getElementById("placard-hint").textContent     = "Fields auto-filled - review and edit if needed.";
  placardBtn.disabled = false;
  autoExtract(f);
}

// AUTO EXTRACT
async function autoExtract(file) {
  try {
    var b64  = await readFileAsB64(file);
    var resp = await fetch("/placard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calcB64: b64, placardStyle: placardState.placardStyle })
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.data) populatePlacardFields(parsed.data);
  } catch (err) {
    document.getElementById("placard-hint").textContent = "Auto-extract failed - please fill in fields manually.";
  }
}

function populatePlacardFields(d) {
  document.getElementById("pl-location").value   = d.location       || "";
  document.getElementById("pl-sprinklers").value = d.num_sprinklers  || "";
  document.getElementById("pl-density").value    = d.density         || "";
  document.getElementById("pl-area").value       = d.area            || "";
  document.getElementById("pl-flow").value       = d.flow_rate       || "";
  document.getElementById("pl-pressure").value   = d.pressure        || "";
  document.getElementById("pl-month").value      = d.month           || "";
  document.getElementById("pl-day").value        = d.day             || "";
  document.getElementById("pl-year").value       = d.year            || "";
  document.getElementById("pl-hose").value       = d.hose_stream     || "";
  document.getElementById("pl-occupancy").value  = d.occupancy       || "";
  document.getElementById("pl-commodity").value  = d.commodity       || "";
  document.getElementById("pl-storage").value    = d.storage_height  || "";
  document.getElementById("pl-printno").value    = d.print_no        || "";
  document.getElementById("pl-contractno").value = d.contract_no     || "";
  document.getElementById("pl-datecalc").value   = d.date_calc       || "";
}

// GENERATE PLACARD
placardBtn.addEventListener("click", generatePlacard);

async function generatePlacard() {
  placardBtn.disabled = true;
  showPlacardState("generating");
  try {
    var b64 = await readFileAsB64(placardState.calcFile);
    var overrides = {
      location:       document.getElementById("pl-location").value.trim(),
      num_sprinklers: document.getElementById("pl-sprinklers").value.trim(),
      density:        document.getElementById("pl-density").value.trim(),
      area:           document.getElementById("pl-area").value.trim(),
      flow_rate:      document.getElementById("pl-flow").value.trim(),
      pressure:       document.getElementById("pl-pressure").value.trim(),
      month:          document.getElementById("pl-month").value.trim(),
      day:            document.getElementById("pl-day").value.trim(),
      year:           document.getElementById("pl-year").value.trim(),
      hose_stream:    document.getElementById("pl-hose").value.trim(),
      occupancy:      document.getElementById("pl-occupancy").value.trim(),
      commodity:      document.getElementById("pl-commodity").value.trim(),
      storage_height: document.getElementById("pl-storage").value.trim(),
      print_no:       document.getElementById("pl-printno").value.trim(),
      contract_no:    document.getElementById("pl-contractno").value.trim(),
      date_calc:      document.getElementById("pl-datecalc").value.trim()
    };
    var resp = await fetch("/placard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calcB64: b64, overrides: overrides, placardStyle: placardState.placardStyle })
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    placardState.pdfB64 = parsed.pdf;
    showPlacardDone();
  } catch (err) {
    document.getElementById("placard-error-msg").textContent = err.message || "Unknown error";
    showPlacardState("error");
    placardBtn.disabled = false;
  }
}

// PLACARD STATE
function showPlacardDone() {
  var style = placardState.placardStyle === "v2" ? "Calculated System" : "Standard";
  var loc   = document.getElementById("pl-location").value || "";
  document.getElementById("placard-done-title").textContent = "Placard Ready - " + style + " Template";
  document.getElementById("placard-done-meta").textContent  = loc;
  showPlacardState("done");
  placardBtn.disabled = false;
}

function showPlacardState(s) {
  placardState.status = s;
  var preview = document.getElementById("placard-preview-wrap");
  if (preview) preview.style.display = (s === "idle") ? "flex" : "none";
  document.getElementById("placard-idle").style.display       = "none";
  document.getElementById("placard-generating").style.display = s === "generating" ? "flex"  : "none";
  document.getElementById("placard-done").style.display       = s === "done"       ? "block" : "none";
  document.getElementById("placard-error").style.display      = s === "error"      ? "block" : "none";
}

document.getElementById("placard-download-btn").addEventListener("click", function() {
  var a     = document.createElement("a");
  a.href    = "data:application/pdf;base64," + placardState.pdfB64;
  var loc   = document.getElementById("pl-location").value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "") || "Placard";
  var style = placardState.placardStyle === "v2" ? "_Calculated" : "_Standard";
  a.download = loc + "_Hydraulic_Placard" + style + ".pdf";
  a.click();
});

document.getElementById("placard-reset-btn").addEventListener("click", resetPlacard);
document.getElementById("placard-retry-btn").addEventListener("click", function() {
  showPlacardState("idle");
});

function resetPlacard() {
  placardState.calcFile = null;
  placardState.pdfB64   = "";
  document.getElementById("calc-file-info").style.display = "none";
  document.getElementById("dz-calc").style.display        = "block";
  document.getElementById("placard-hint").textContent     = "Upload a calc PDF to auto-fill fields below.";
  var preview = document.getElementById("placard-preview-wrap");
  if (preview) preview.style.display = "flex";
  clearPlacardFields();
  placardBtn.disabled = true;
  placardState.status = "idle";
  document.getElementById("placard-idle").style.display       = "none";
  document.getElementById("placard-generating").style.display = "none";
  document.getElementById("placard-done").style.display       = "none";
  document.getElementById("placard-error").style.display      = "none";
  renderPlacardPreview(placardState.placardStyle);
}

function clearPlacardFields() {
  ["pl-location","pl-sprinklers","pl-density","pl-area","pl-flow","pl-pressure",
   "pl-month","pl-day","pl-year","pl-hose","pl-occupancy","pl-commodity",
   "pl-storage","pl-printno","pl-contractno","pl-datecalc"].forEach(function(id) {
    document.getElementById(id).value = "";
  });
}
