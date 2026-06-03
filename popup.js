const FREE_LIMIT = 15;
const PRO_PERMALINK = "prompt-stash-pro"; // Gumroad product permalink (enable license keys on it)

// storage: chrome.storage.local in the extension, localStorage fallback when opened as a plain page (for testing)
const store = {
  async get(keys) {
    if (typeof chrome !== "undefined" && chrome.storage?.local)
      return new Promise((r) => chrome.storage.local.get(keys, r));
    const o = {};
    for (const k of [].concat(keys)) { const v = localStorage.getItem("ps_" + k); if (v != null) o[k] = JSON.parse(v); }
    return o;
  },
  async set(obj) {
    if (typeof chrome !== "undefined" && chrome.storage?.local)
      return new Promise((r) => chrome.storage.local.set(obj, r));
    for (const k in obj) localStorage.setItem("ps_" + k, JSON.stringify(obj[k]));
  },
};

let prompts = [];
let pro = false;
let editingId = null;

const $ = (id) => document.getElementById(id);
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1300); }

async function load() {
  const d = await store.get(["prompts", "pro"]);
  prompts = d.prompts || [];
  pro = !!d.pro;
  applyPro();
  render();
}
function applyPro() {
  document.querySelectorAll(".pro-field").forEach((e) => (e.style.display = pro ? "" : "none"));
  $("proLink").style.display = pro ? "none" : "";
}

function render() {
  const q = $("search").value.trim().toLowerCase();
  const list = $("list");
  const shown = prompts.filter((p) => !q || (p.title + " " + p.body + " " + (p.folder || "")).toLowerCase().includes(q));
  list.innerHTML = "";
  if (!shown.length) {
    list.innerHTML = `<div class="empty">${prompts.length ? "No matches." : "No prompts yet. Click ＋ to add your first one."}</div>`;
  }
  for (const p of shown) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="t"><span>${esc(p.title)}</span>${p.folder ? `<span class="folder">${esc(p.folder)}</span>` : ""}</div>
      <div class="p">${esc(p.body)}</div>
      <div class="row">
        <button class="mini copy">Copy</button>
        <button class="mini edit">Edit</button>
        <button class="mini del">Delete</button>
      </div>`;
    el.querySelector(".copy").onclick = (e) => { e.stopPropagation(); copy(p.body); };
    el.onclick = () => copy(p.body);
    el.querySelector(".edit").onclick = (e) => { e.stopPropagation(); openForm(p); };
    el.querySelector(".del").onclick = (e) => { e.stopPropagation(); del(p.id); };
    list.appendChild(el);
  }
  $("count").textContent = pro ? `${prompts.length} prompts · Pro` : `${prompts.length}/${FREE_LIMIT} prompts (free)`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function copy(text) { try { await navigator.clipboard.writeText(text); toast("Copied!"); } catch { toast("Copy failed"); } }

function openForm(p) {
  editingId = p ? p.id : null;
  $("fTitle").value = p ? p.title : "";
  $("fBody").value = p ? p.body : "";
  $("fFolder").value = p ? (p.folder || "") : "";
  $("form").classList.remove("hidden");
  $("fTitle").focus();
}
function closeForm() { $("form").classList.add("hidden"); editingId = null; }

async function savePrompt() {
  const title = $("fTitle").value.trim();
  const body = $("fBody").value.trim();
  const folder = pro ? $("fFolder").value.trim() : "";
  if (!title || !body) { toast("Title and text required"); return; }
  if (!editingId && !pro && prompts.length >= FREE_LIMIT) {
    if (confirm(`Free version holds ${FREE_LIMIT} prompts. Unlock unlimited with Pro?`)) window.open("https://alphaletgo.gumroad.com/l/" + PRO_PERMALINK, "_blank");
    return;
  }
  if (editingId) {
    const p = prompts.find((x) => x.id === editingId);
    Object.assign(p, { title, body, folder });
  } else {
    prompts.unshift({ id: Date.now(), title, body, folder });
  }
  await store.set({ prompts });
  closeForm(); render();
}
async function del(id) { prompts = prompts.filter((p) => p.id !== id); await store.set({ prompts }); render(); }

async function activate() {
  const key = $("licenseKey").value.trim();
  if (!key) return;
  $("settingsMsg").textContent = "Checking…";
  try {
    const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `product_permalink=${encodeURIComponent(PRO_PERMALINK)}&license_key=${encodeURIComponent(key)}`,
    });
    const data = await res.json();
    if (data.success) {
      pro = true; await store.set({ pro: true, license: key }); applyPro(); render();
      $("settingsMsg").textContent = "✓ Pro activated. Thank you!";
      $("proTools").classList.remove("hidden");
    } else {
      $("settingsMsg").textContent = "Invalid license key.";
    }
  } catch {
    $("settingsMsg").textContent = "Could not verify (check connection).";
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prompt-stash.json"; a.click();
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = async () => {
    try {
      const arr = JSON.parse(String(r.result));
      if (Array.isArray(arr)) { prompts = arr.concat(prompts); await store.set({ prompts }); render(); toast("Imported"); }
    } catch { toast("Bad file"); }
  };
  r.readAsText(file);
}

// wire up
$("addBtn").onclick = () => openForm(null);
$("saveBtn").onclick = savePrompt;
$("cancelBtn").onclick = closeForm;
$("search").oninput = render;
$("settingsLink").onclick = (e) => { e.preventDefault(); $("settings").classList.toggle("hidden"); $("proTools").classList.toggle("hidden", !pro); };
$("closeSettings").onclick = () => $("settings").classList.add("hidden");
$("activateBtn").onclick = activate;
$("exportBtn").onclick = exportJSON;
$("importFile").onchange = (e) => e.target.files[0] && importJSON(e.target.files[0]);
load();
