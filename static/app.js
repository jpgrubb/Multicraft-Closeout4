var state = {
  sysType:      "wet",
  firePump:     false,
  testPapers:   false,
  testFiles:    [],
  asBuilts:     false,
  asbuiltFiles: [],
  status:       "idle",
  pdfB64:       "",
  pageCount:    0
};

var BASE_DOCS = {
  "wet":           ["Letter of Transmittal","Section 1 — Introduction","Wet Pipe Sprinkler O&M","Maintenance Chart","Summary of Minimum Inspection","NFPA 25 Guidelines","One Year Warranty"],
  "dry":           ["Letter of Transmittal","Section 1 — Introduction","Dry Pipe Sprinkler O&M","Maintenance Chart","Summary of Minimum Inspection","NFPA 25 Guidelines","One Year Warranty"],
  "pre-action":    ["Letter of Transmittal","Section 1 — Introduction","Dry Pipe / Pre-Action O&M","Maintenance Chart","Summary of Minimum Inspection","NFPA 25 Guidelines","One Year Warranty"],
  "dry standpipe": ["Letter of Transmittal","Section 1 — Introduction","Dry Standpipe O&M","Maintenance Chart","Summary of Minimum Inspection","NFPA 25 Guidelines","One Year Warranty"]
};

var SYS_LABELS = {
  "wet":"Wet Pipe", "dry":"Dry Pipe",
  "pre-action":"Pre-Action", "dry standpipe":"Dry Standpipe"
};

function todayStr() {
  var n = new Date();
  return String(n.getMonth()+1).padStart(2,"0")+"/"+String(n.getDate()).padStart(2,"0")+"/"+String(n.getFullYear()).slice(2);
}
function fmtDate(v) {
  if (!v) return todayStr();
  var p = v.split("-");
  return p[1]+"/"+p[2]+"/"+p[0].slice(2);
}
function fmtBytes(b) {
  if (b<1024) return b+" B";
  if (b<1048576) return (b/1024).toFixed(1)+" KB";
  return (b/1048576).toFixed(1)+" MB";
}
function readFileAsB64(file) {
  return new Promise(function(res,rej) {
    var r = new FileReader();
    r.onload = function() { res(r.result.split(",")[1]); };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function allDocs() {
  var docs = (BASE_DOCS[state.sysType] || BASE_DOCS["wet"]).slice();
  if (state.firePump) docs.push("Fire Pump Weekly Testing Checklist");
  if (state.testPapers) {
    if (state.testFiles.length > 0) { state.testFiles.forEach(function(f){ docs.push(f.name); }); }
    else { docs.push("Test Papers"); }
  }
  if (state.asBuilts) {
    if (state.asbuiltFiles.length > 0) { state.asbuiltFiles.forEach(function(f){ docs.push(f.name); }); }
    else { docs.push("As-Built Drawings"); }
  }
  return docs;
}

var COVER_DATE = todayStr();
document.getElementById("cover-date-display").textContent = COVER_DATE;

document.querySelectorAll(".sys-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    document.querySelectorAll(".sys-btn").forEach(function(b){ b.classList.remove("active"); });
    btn.classList.add("active");
    state.sysType = btn.dataset.val;
  });
});

var inpProject = document.getElementById("inp-project");
var genBtn = document.getElementById("generate-btn");
inpProject.addEventListener("input", function() {
  genBtn.disabled = !inpProject.value.trim() || state.status === "generating";
});

function setupToggle(key, toggleId, switchId, panelId, subId, fileListKey) {
  var row   = document.getElementById(toggleId);
  var sw    = document.getElementById(switchId);
  var panel = panelId ? document.getElementById(panelId) : null;
  var subEl = subId   ? document.getElementById(subId)   : null;
  row.addEventListener("click", function() {
    state[key] = !state[key];
    sw.classList.toggle("on", state[key]);
    row.classList.toggle("active", state[key]);
    if (panel) {
      panel.classList.toggle("visible", state[key]);
      row.classList.toggle("square-bottom", state[key]);
    }
    if (!state[key] && fileListKey) {
      state[fileListKey] = [];
      renderFileList(fileListKey === "testFiles" ? "tests" : "asbuilts");
      updateToggleSub(subEl, key, fileListKey);
    }
    if (state[key] && subEl) updateToggleSub(subEl, key, fileListKey);
  });
}
function updateToggleSub(subEl, key, fileListKey) {
  if (!subEl) return;
  var files = state[fileListKey] || [];
  subEl.textContent = (state[key] && files.length > 0)
    ? files.length+" file"+(files.length>1?"s":"")+" uploaded · Added to cover sheet"
    : "Toggle on to include · Upload PDFs optionally · Added to cover sheet";
}

setupToggle("firePump",   "toggle-firepump", "sw-firepump", null,             null,           null);
setupToggle("testPapers", "toggle-tests",    "sw-tests",    "panel-tests",    "sub-tests",    "testFiles");
setupToggle("asBuilts",   "toggle-asbuilts", "sw-asbuilts", "panel-asbuilts", "sub-asbuilts", "asbuiltFiles");

function setupUploadZone(dzId, fileInputId, fileListId, stateKey, subId, toggleKey) {
  var dz    = document.getElementById(dzId);
  var input = document.getElementById(fileInputId);
  var subEl = document.getElementById(subId);
  dz.addEventListener("click", function(){ input.click(); });
  dz.addEventListener("dragover", function(e){ e.preventDefault(); dz.classList.add("dragging"); });
  dz.addEventListener("dragleave", function(){ dz.classList.remove("dragging"); });
  dz.addEventListener("drop", function(e){
    e.preventDefault(); dz.classList.remove("dragging");
    addFiles(e.dataTransfer.files, stateKey, fileListId, subEl, toggleKey);
  });
  input.addEventListener("change", function(){
    addFiles(input.files, stateKey, fileListId, subEl, toggleKey);
    input.value = "";
  });
}
function addFiles(raw, stateKey, listId, subEl, toggleKey) {
  var pdfs = Array.from(raw).filter(function(f){
    return f.type==="application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  });
  if (!pdfs.length) return;
  var seen = new Set(state[stateKey].map(function(f){ return f.name+f.size; }));
  pdfs.forEach(function(f){ if (!seen.has(f.name+f.size)) state[stateKey].push(f); });
  renderFileList(listId);
  updateToggleSub(subEl, toggleKey, stateKey);
}
function renderFileList(key) {
  var isTests   = key === "tests";
  var stateKey  = isTests ? "testFiles" : "asbuiltFiles";
  var listEl    = document.getElementById("list-"+key);
  var subEl     = document.getElementById("sub-"+key);
  var toggleKey = isTests ? "testPapers" : "asBuilts";
  listEl.innerHTML = "";
  state[stateKey].forEach(function(f, i) {
    var div = document.createElement("div");
    div.className = "file-item";
    div.innerHTML =
      '<span class="fi-icon">&#128196;</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div class="fi-name">'+f.name+'</div>'+
        '<div class="fi-size">'+fmtBytes(f.size)+'</div>'+
      '</div>'+
      '<button class="fi-remove" data-idx="'+i+'">&#x2715;</button>';
    div.querySelector(".fi-remove").addEventListener("click", function(e){
      e.stopPropagation();
      state[stateKey].splice(i, 1);
      renderFileList(key);
      updateToggleSub(subEl, toggleKey, stateKey);
    });
    listEl.appendChild(div);
  });
}

setupUploadZone("dz-tests",    "file-tests",    "tests",    "testFiles",    "sub-tests",    "testPapers");
setupUploadZone("dz-asbuilts", "file-asbuilts", "asbuilts", "asbuiltFiles", "sub-asbuilts", "asBuilts");

function showState(s) {
  state.status = s;
  document.getElementById("idle-state").style.display       = s==="idle"       ? "block" : "none";
  document.getElementById("generating-state").style.display = s==="generating" ? "flex"  : "none";
  document.getElementById("done-state").style.display       = s==="done"       ? "block" : "none";
  document.getElementById("error-state").style.display      = s==="error"      ? "block" : "none";
  genBtn.disabled = s === "generating" || !inpProject.value.trim();
}
showState("idle");

genBtn.addEventListener("click", generate);

async function generate() {
  var project = inpProject.value.trim();
  if (!project) return;
  showState("generating");

  var substRaw = document.getElementById("inp-subst").value;
  var payload = {
    project: project,
    to:      document.getElementById("inp-to").value.trim(),
    attn:    document.getElementById("inp-attn").value.trim(),
    date:        COVER_DATE,
    subst_date:  substRaw ? fmtDate(substRaw) : COVER_DATE,
    system_type: state.sysType,
    fire_pump:   state.firePump,
    test_papers: state.testPapers,
    as_builts:   state.asBuilts
  };

  var testB64s    = await Promise.all(state.testFiles.map(readFileAsB64));
  var asbuiltB64s = await Promise.all(state.asbuiltFiles.map(readFileAsB64));
  var extraItems  = [];
  if (state.firePump)   extraItems.push("Fire Pump Testing");
  if (state.testPapers) extraItems.push("Test Papers");
  if (state.asBuilts)   extraItems.push("As-Built Drawings");

  try {
    var resp = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: payload, extraItems: extraItems, testB64s: testB64s, asbuiltB64s: asbuiltB64s })
    });
    var parsed = await resp.json();
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.pdf) {
      state.pdfB64    = parsed.pdf;
      state.pageCount = parsed.pages;
      renderDoneState(project);
      showState("done");
    } else {
      throw new Error("No PDF data returned");
    }
  } catch(err) {
    document.getElementById("error-msg").textContent = err.message || "Unknown error";
    showState("error");
  }
}

function renderDoneState(project) {
  document.getElementById("done-title").textContent = project + " — Closeout Ready";
  document.getElementById("done-meta").textContent  =
    allDocs().length + " documents · " + SYS_LABELS[state.sysType] +
    " System · " + state.pageCount + " pages · " + COVER_DATE;
  var list = document.getElementById("doc-list");
  list.innerHTML = "";
  allDocs().forEach(function(label, i) {
    var div = document.createElement("div");
    div.className = "doc-item";
    div.innerHTML =
      '<div class="doc-num">'+(i+1)+'</div>'+
      '<span class="doc-name">'+label+'</span>'+
      '<span class="doc-check">&#10003;</span>';
    list.appendChild(div);
  });
}

document.getElementById("download-btn").addEventListener("click", function() {
  var a = document.createElement("a");
  a.href = "data:application/pdf;base64," + state.pdfB64;
  var safe  = inpProject.value.trim().replace(/\s+/g,"_");
  var today = new Date().toISOString().slice(0,10).replace(/-/g,"");
  a.download = safe + "_Closeout_" + today + ".pdf";
  a.click();
});

document.getElementById("reset-btn").addEventListener("click", resetAll);
document.getElementById("retry-btn").addEventListener("click", function(){ showState("idle"); });

function resetAll() {
  inpProject.value = "";
  document.getElementById("inp-to").value    = "";
  document.getElementById("inp-attn").value  = "";
  document.getElementById("inp-subst").value = "";
  document.querySelectorAll(".sys-btn").forEach(function(b){ b.classList.remove("active"); });
  document.querySelector('.sys-btn[data-val="wet"]').classList.add("active");
  state.sysType = "wet";
  ["firepump","tests","asbuilts"].forEach(function(key) {
    var stKey = key==="firepump" ? "firePump" : key==="tests" ? "testPapers" : "asBuilts";
    state[stKey] = false;
    document.getElementById("sw-"+key).classList.remove("on");
    document.getElementById("toggle-"+key).classList.remove("active","square-bottom");
  });
  state.testFiles = []; state.asbuiltFiles = [];
  document.getElementById("panel-tests").classList.remove("visible");
  document.getElementById("panel-asbuilts").classList.remove("visible");
  renderFileList("tests"); renderFileList("asbuilts");
  document.getElementById("sub-tests").textContent    = "Toggle on to include · Upload PDFs optionally · Added to cover sheet";
  document.getElementById("sub-asbuilts").textContent = "Toggle on to include · Upload PDFs optionally · Added to cover sheet";
  state.pdfB64 = ""; state.pageCount = 0;
  genBtn.disabled = true;
  showState("idle");
}
