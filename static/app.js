// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
var state = {
  sysType:    [],
  firepump:   false,
  tests:      false,
  asbuilts:   false,
  testFiles:  [],
  asbuiltFiles: [],
  pdfB64:     "",
  status:     "idle"
};

// ─────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────
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
  return months[parseInt(parts[1])-1] + " " + parseInt(parts[2]) + ", " + parts[0];
}

// ─────────────────────────────────────────
//  COVER DATE
// ─────────────────────────────────────────
var coverDateInput = document.getElementById("inp-cover-date");
var coverDateDisplay = document.getElementById("cover-date-display");
(function(){
  var today = new Date();
  var iso = today.toISOString().split("T")[0];
  coverDateInput.value = iso;
  coverDateDisplay.textContent = fmtDate(iso);
})();
coverDateInput.addEventListener("change", function() {
  coverDateDisplay.textContent = fmtDate(coverDateInput.value);
});

// ─────────────────────────────────────────
//  SYSTEM TYPE BUTTONS
// ─────────────────────────────────────────
document.querySelectorAll(".sys-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    var sys = btn.dataset.sys;
    var idx = state.sysType.indexOf(sys);
    if (idx === -1) {
      state.sysType.push(sys);
      btn.classList.add("active");
    } else {
      state.sysType.splice(idx, 1);
      btn.classList.remove("active");
    }
    updateGenerateBtn();
  });
});

// ─────────────────────────────────────────
//  TOGGLE SWITCHES
// ─────────────────────────────────────────
function setupToggle(rowId, switchId, key, panelId) {
  var row = document.getElementById(rowId);
  var sw  = document.getElementById(switchId);
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

// ─────────────────────────────────────────
//  FILE UPLOADS
// ─────────────────────────────────────────
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
    item.innerHTML = '<span class="fi-icon">📄</span>' +
      '<span class="fi-name">' + f.name + '</span>' +
      '<button class="fi-remove" data-i="' + i + '">✕</button>';
    listEl.appendChild(item);
  });
  listEl.querySelectorAll(".fi-remove").forEach(function(btn) {
    btn.addEventListener("click", function() {
      state[stateKey].splice(parseInt(btn.dataset.i), 1);
      renderFileList(stateKey, listEl);
    });
  });
}

setupDropZone("dz-tests",    "file-tests",    "list-tests",    "testFiles");
setupDropZone("dz-asbuilts", "file-asbuilts", "list-asbuilts", "asbuiltFiles");

// ─────────────────────────────────────────
//  GENERATE BUTTON ENABLE
// ─────────────────────────────────────────
var projectInput = document.getElementById("inp-project");
var generateBtn  = document.getElementById("generate-btn");

function updateGenerateBtn() {
  generateBtn.disabled = !(projectInput.value.trim() && state.sysType.length > 0);
}
projectInput.addEventListener("input", updateGenerateBtn);

// ─────────────────────────────────────────
//  SHOW STATE
// ─────────────────────────────────────────
function showState(s) {
  state.status = s;
  document.getElementById("idle-state").style.display       = s === "idle"       ? "flex"  : "none";
  document.getElementById("generating-state").style.display = s === "generating" ? "flex"  : "none";
  document.getElementById("done-state").style.display       = s === "done"       ? "block" : "none";
  document.getElementById("error-state").style.display      = s === "error"      ? "block" : "none";
}
document.getElementById("idle-state").style.display = "block";

// ─────────────────────────────────────────
//  GENERATE
// ─────────────────────────────────────────
generateBtn.addEventListener("click", async function() {
  generateBtn.disabled = true;
  showState("generating");

  try {
    var testB64s    = await Promise.all(state.testFiles.map(readFileAsB64));
    var asbuiltB64s = await Promise.all(state.asbuiltFiles.map(readFileAsB64));

    var extraItems = [];
    if (state.tests) {
      if (state.testFiles.length > 0) {
        state.testFiles.forEach(function(f) { extraItems.push(f.name.replace(/\.pdf$/i,"")); });
      } else {
        extraItems.push("Test Papers");
      }
    }
    if (state.asbuilts) {
      if (state.asbuiltFiles.length > 0) {
        state.asbuiltFiles.forEach(function(f) { extraItems.push(f.name.replace(/\.pdf$/i,"")); });
      } else {
        extraItems.push("As-Builts");
      }
    }

    var coverDateVal = coverDateInput.value;
    var substVal     = document.getElementById("inp-subst").value;

    var payload = {
      data: {
        project:     projectInput.value.trim(),
        to:          document.getElementById("inp-to").value.trim(),
        attn:        document.getElementById("inp-attn").value.trim(),
        date:        fmtDate(coverDateVal),
        subst_date:  fmtDate(substVal),
        name:        document.getElementById("inp-name").value.trim(),
        email:       document.getElementById("inp-email").value.trim(),
        system_type: state.sysType.join(","),
        fire_pump:   state.firepump,
      },
      extraItems:  extraItems,
      testB64s:    testB64s,
      asbuiltB64s: asbuiltB64s,
    };

    var resp = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);

    state.pdfB64 = parsed.pdf;

    // Build doc list
    var docs = ["Cover Sheet", "O&M Manual"];
    docs.push("Maintenance Chart");
    docs.push("Summary of Minimum");
    docs.push("NFPA 25 Guidelines");
    if (state.firepump) docs.push("Fire Pump Testing");
    docs.push("One Year Warranty");
    extraItems.forEach(function(x) { docs.push(x); });

    document.getElementById("done-title").textContent = projectInput.value.trim() + " — Closeout Ready";
    document.getElementById("done-meta").textContent  = parsed.pages + " pages · " + docs.length + " documents";

    var docList = document.getElementById("doc-list");
    docList.innerHTML = "";
    docs.forEach(function(d, i) {
      var el = document.createElement("div");
      el.className = "doc-item";
      el.innerHTML = '<div class="doc-num">' + (i+1) + '</div><span>' + d + '</span>';
      docList.appendChild(el);
    });

    showState("done");
  } catch(err) {
    document.getElementById("error-msg").textContent = err.message || "Unknown error";
    showState("error");
    generateBtn.disabled = false;
  }
});

// ─────────────────────────────────────────
//  DOWNLOAD
// ─────────────────────────────────────────
document.getElementById("dl-btn").addEventListener("click", function() {
  var a = document.createElement("a");
  a.href = "data:application/pdf;base64," + state.pdfB64;
  var name = projectInput.value.trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"") || "Closeout";
  a.download = name + "_Closeout_Package.pdf";
  a.click();
});

// ─────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────
function resetAll() {
  state.sysType = []; state.firepump = false;
  state.tests = false; state.asbuilts = false;
  state.testFiles = []; state.asbuiltFiles = [];
  state.pdfB64 = ""; state.status = "idle";

  document.getElementById("inp-project").value = "";
  document.getElementById("inp-to").value      = "";
  document.getElementById("inp-attn").value    = "";
  document.getElementById("inp-subst").value   = "";
  document.getElementById("inp-name").value    = "";
  document.getElementById("inp-email").value   = "";

  document.querySelectorAll(".sys-btn").forEach(function(b){ b.classList.remove("active"); });
  ["firepump","tests","asbuilts"].forEach(function(k){
    document.getElementById("sw-"+k).classList.remove("on");
  });
  document.getElementById("panel-tests").classList.remove("open");
  document.getElementById("panel-asbuilts").classList.remove("open");
  document.getElementById("list-tests").innerHTML    = "";
  document.getElementById("list-asbuilts").innerHTML = "";

  updateGenerateBtn();
  showState("idle");
}
document.getElementById("reset-btn").addEventListener("click", resetAll);
document.getElementById("retry-btn").addEventListener("click", function(){ showState("idle"); generateBtn.disabled = false; });

// ─────────────────────────────────────────
//  TAB SWITCHING
// ─────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".tab-btn").forEach(function(b){ b.classList.remove("active"); });
    document.querySelectorAll(".tab-section").forEach(function(s){ s.classList.remove("active"); });
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// ─────────────────────────────────────────
//  HYDRAULIC PLACARD
// ─────────────────────────────────────────
var placardState = {
  calcFile: null,
  pdfB64: "",
  status: "idle"
};

var dzCalc     = document.getElementById("dz-calc");
var fileCalc   = document.getElementById("file-calc");
var placardBtn = document.getElementById("placard-btn");

dzCalc.addEventListener("click", function(){ fileCalc.click(); });
dzCalc.addEventListener("dragover", function(e){ e.preventDefault(); dzCalc.classList.add("dragging"); });
dzCalc.addEventListener("dragleave", function(){ dzCalc.classList.remove("dragging"); });
dzCalc.addEventListener("drop", function(e){
  e.preventDefault(); dzCalc.classList.remove("dragging");
  var f = e.dataTransfer.files[0];
  if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) {
    setCalcFile(f);
  }
});
fileCalc.addEventListener("change", function(){
  if (fileCalc.files[0]) setCalcFile(fileCalc.files[0]);
  fileCalc.value = "";
});

document.getElementById("calc-file-remove").addEventListener("click", function(){
  placardState.calcFile = null;
  document.getElementById("calc-file-info").style.display = "none";
  document.getElementById("dz-calc").style.display = "block";
  placardBtn.disabled = true;
  clearPlacardFields();
});

function setCalcFile(f) {
  placardState.calcFile = f;
  document.getElementById("calc-file-name").textContent = f.name;
  document.getElementById("calc-file-info").style.display = "flex";
  document.getElementById("dz-calc").style.display = "none";
  document.getElementById("placard-hint").textContent = "Fields auto-filled — review and edit if needed.";
  placardBtn.disabled = false;
  autoExtract(f);
}

async function autoExtract(file) {
  try {
    var b64 = await readFileAsB64(file);
    var resp = await fetch("/placard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calcB64: b64 })
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.data) {
      var d = parsed.data;
      document.getElementById("pl-location").value   = d.location       || "";
      document.getElementById("pl-sprinklers").value = d.num_sprinklers  || "";
      document.getElementById("pl-density").value    = d.density         || "";
      document.getElementById("pl-area").value       = d.area            || "";
      document.getElementById("pl-flow").value       = d.flow_rate       || "";
      document.getElementById("pl-pressure").value   = d.pressure        || "";
      document.getElementById("pl-month").value      = d.month           || "";
      document.getElementById("pl-day").value        = d.day             || "";
      document.getElementById("pl-year").value       = d.year            || "";
    }
    if (parsed.pdf) {
      placardState.pdfB64 = parsed.pdf;
      showPlacardDone();
    }
  } catch(err) {
    document.getElementById("placard-hint").textContent = "Auto-extract failed — please fill in fields manually.";
  }
}

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
    };
    var resp = await fetch("/placard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calcB64: b64, overrides: overrides })
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    placardState.pdfB64 = parsed.pdf;
    showPlacardDone();
  } catch(err) {
    document.getElementById("placard-error-msg").textContent = err.message || "Unknown error";
    showPlacardState("error");
    placardBtn.disabled = false;
  }
}

function showPlacardDone() {
  var loc = document.getElementById("pl-location").value || "—";
  document.getElementById("placard-done-title").textContent = "Placard Ready";
  document.getElementById("placard-done-meta").textContent  = loc;
  showPlacardState("done");
  placardBtn.disabled = false;
}

function showPlacardState(s) {
  placardState.status = s;
  document.getElementById("placard-idle").style.display       = s === "idle"       ? "block" : "none";
  document.getElementById("placard-generating").style.display = s === "generating" ? "flex"  : "none";
  document.getElementById("placard-done").style.display       = s === "done"       ? "block" : "none";
  document.getElementById("placard-error").style.display      = s === "error"      ? "block" : "none";
}

document.getElementById("placard-download-btn").addEventListener("click", function(){
  var a = document.createElement("a");
  a.href = "data:application/pdf;base64," + placardState.pdfB64;
  var loc = document.getElementById("pl-location").value.trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"") || "Placard";
  a.download = loc + "_Hydraulic_Placard.pdf";
  a.click();
});

document.getElementById("placard-reset-btn").addEventListener("click", resetPlacard);
document.getElementById("placard-retry-btn").addEventListener("click", function(){ showPlacardState("idle"); });

function resetPlacard() {
  placardState.calcFile = null;
  placardState.pdfB64 = "";
  document.getElementById("calc-file-info").style.display = "none";
  document.getElementById("dz-calc").style.display = "block";
  document.getElementById("placard-hint").textContent = "Upload a calc PDF to auto-fill fields below.";
  clearPlacardFields();
  placardBtn.disabled = true;
  showPlacardState("idle");
}

function clearPlacardFields() {
  ["pl-location","pl-sprinklers","pl-density","pl-area","pl-flow","pl-pressure","pl-month","pl-day","pl-year"]
    .forEach(function(id){ document.getElementById(id).value = ""; });
}
