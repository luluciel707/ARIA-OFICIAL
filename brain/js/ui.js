// ARIA BRAIN · ui.js — interfaz del chat, avisos, perfil y memoria.
import { ariaBrain } from "./core.js";
import { fmtWhen, fmtRepeat } from "./reminders.js";
import { unlockAudio, requestNotifications, notificationsState } from "./alerts.js";

const $ = (id) => document.getElementById(id);
const chat = $("chat"), form = $("messageForm"), input = $("messageInput"), sendButton = $("sendButton");

// ---------- chat ----------
function addMessage(content, type, actions = []) {
    const el = document.createElement("div");
    el.className = `message ${type}`;
    el.textContent = content;
    if (actions.length) {
        const row = document.createElement("div");
        row.className = "actions";
        for (const a of actions) {
            const link = document.createElement("a");
            link.href = a.url; link.target = "_blank"; link.rel = "noopener noreferrer";
            link.textContent = a.label;
            row.appendChild(link);
        }
        el.appendChild(row);
    }
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
}

let lastAria = null;   // las acciones (enlaces) se cuelgan del último mensaje de ARIA
let activeTab = "home";

// Lo que se dice por voz en el holograma también aparece en el chat.
window.addEventListener("aria:user", (e) => { addMessage(e.detail, "user"); });

// Estado de la conexión con el holograma.
function renderHologram() {
    const on = ariaBrain.hologramConnected;
    $("holoStatus").textContent = on ? "HOLOGRAMA CONECTADO" : "ESPERANDO HOLOGRAMA";
    $("holoDot").classList.toggle("off", !on);
}
window.addEventListener("aria:hologram", renderHologram);
window.addEventListener("aria:response", (e) => {
    lastAria = addMessage(e.detail, "aria");
    if (activeTab !== "chat") document.querySelector('.tab[data-tab="chat"]').classList.add("has-new");
    renderStats();
});
window.addEventListener("aria:action", (e) => {
    if (!lastAria) return;
    const row = document.createElement("div");
    row.className = "actions";
    for (const a of e.detail) {
        const link = document.createElement("a");
        link.href = a.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = a.label;
        row.appendChild(link);
    }
    lastAria.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
});

function updateStatus() { $("brainStatus").textContent = ariaBrain.initialized ? "BRAIN ACTIVO" : "ERROR"; }

// Números del inicio y nombre en la cabecera.
function renderStats() {
    $("stReminders").textContent = ariaBrain.reminders.list().length;
    $("stDocs").textContent = ariaBrain.rag.listDocuments().length;
    $("stNotes").textContent = ariaBrain.memory.recall().length;
    $("userName").textContent = ariaBrain.profile.displayName || "Tu perfil";
}
updateStatus();

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockAudio();
    const message = input.value.trim();
    if (!message) return;
    addMessage(message, "user");
    input.value = ""; input.disabled = true; sendButton.disabled = true;
    const typing = addMessage("…", "aria typing");
    try {
        const response = await ariaBrain.processMessage(message);
        typing.remove();
        if (response) lastAria = addMessage(response, "aria", ariaBrain.lastActions);
        renderStats();
    } catch (error) {
        console.error("Error en el chat:", error);
        typing.remove();
        addMessage("Tuve un problema al procesar ese mensaje.", "aria");
    } finally {
        input.disabled = false; sendButton.disabled = false; input.focus();
    }
});

// El saludo inicial se muestra al abrir (no depende de si ARIA conoce o no a la persona).
lastAria = addMessage(ariaBrain.getGreeting(), "aria");

// ---------- IA generativa ----------
const ai = ariaBrain.ai;
function renderAI() {
    const busy = ai.state === "loading";
    $("aiStatus").textContent = "IA generativa: " + (ai.state === "ready" ? "activa" : ai.text.toLowerCase());
    $("aiProgress").hidden = !busy; $("aiProgress").value = ai.progress;
    $("aiButton").disabled = busy || !ai.supported;
    $("aiButton").textContent = ai.state === "ready" ? "Apagar IA generativa" : "Activar IA generativa";
    if (!ai.supported) $("aiStatus").textContent = "IA generativa: tu navegador no tiene WebGPU";
}
ai.addEventListener("status", renderAI);
renderAI();
$("aiButton").addEventListener("click", () => {
    unlockAudio();
    if (ai.state === "ready") { ai.disable(); return; }
    ai.enable().then(() => ariaBrain.announce("Ya estoy lista. Ahora puedo conversar con vos sobre muchos más temas. ✨"))
        .catch(() => addMessage("No pude cargar la IA generativa.", "aria"));
});

// ---------- pestañas ----------
function openTab(name) {
    activeTab = name;
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach(pn => pn.classList.toggle("active", pn.id === "panel-" + name));
    if (name === "chat") { document.querySelector('.tab[data-tab="chat"]').classList.remove("has-new"); chat.scrollTop = chat.scrollHeight; input.focus(); }
    if (name === "profile") fillProfile();
    if (name === "knowledge") renderKnowledge();
    if (name === "reminders") renderReminders();
    if (name === "home") renderStats();
}
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => openTab(btn.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => openTab(btn.dataset.go)));

function li(text, onDelete, label = "Borrar") {
    const el = document.createElement("li");
    const span = document.createElement("span"); span.textContent = text;
    const b = document.createElement("button"); b.type = "button"; b.className = "ghost small"; b.textContent = label;
    b.addEventListener("click", onDelete);
    el.append(span, b);
    return el;
}

// ---------- avisos ----------
function renderReminders() {
    const list = $("reminderList");
    list.replaceChildren();
    const items = ariaBrain.reminders.list();
    if (!items.length) { const e = document.createElement("li"); e.className = "empty"; e.textContent = "No hay avisos programados."; list.appendChild(e); }
    for (const r of items) {
        const icon = r.kind === "alarm" ? "⏰" : r.kind === "timer" ? "⏳" : "🔔";
        const text = `${icon} ${fmtWhen(r.at)}${r.kind === "alarm" ? "" : " · " + r.text}${r.repeat ? " (" + fmtRepeat(r.repeat) + ")" : ""}`;
        list.appendChild(li(text, () => ariaBrain.reminders.remove(r.id)));
    }
    const state = notificationsState();
    $("notifyState").textContent = state === "granted" ? "Avisos del navegador: activados ✓" : state === "denied" ? "Bloqueados en el navegador" : state === "unsupported" ? "No disponibles en este navegador" : "";
}
window.addEventListener("aria:reminders-changed", () => { renderReminders(); renderStats(); });
renderReminders();

$("reminderForm").addEventListener("submit", (e) => {
    e.preventDefault();
    unlockAudio();
    const at = new Date($("reminderWhen").value);
    const kind = $("reminderKind").value;
    const text = $("reminderText").value.trim() || (kind === "alarm" ? "Alarma" : "");
    if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) { alert("Elegí una fecha y hora futuras."); return; }
    if (kind === "reminder" && !text) { alert("Escribí qué querés que te recuerde."); return; }
    ariaBrain.reminders.add({ kind, text, at });
    $("reminderText").value = "";
    requestNotifications().then(renderReminders);
});
$("notifyButton").addEventListener("click", () => requestNotifications().then(renderReminders));

// aviso sonando
window.addEventListener("aria:ring", (e) => { $("ringText").textContent = e.detail.text; $("ringBanner").hidden = false; });
window.addEventListener("aria:ring-stop", (e) => { if (!e.detail.remaining) $("ringBanner").hidden = true; });
$("ringStop").addEventListener("click", () => ariaBrain.reminders.stopRinging());
$("ringSnooze").addEventListener("click", () => {
    const item = ariaBrain.reminders.snooze(5);
    if (item) addMessage("Dale, te vuelvo a avisar en 5 minutos. 😉", "aria");
});

// ---------- perfil ----------
const F = { name: "pfName", nickname: "pfNick", birthday: "pfBirthday", age: "pfAge", city: "pfCity", likes: "pfLikes", dislikes: "pfDislikes", notes: "pfNotes" };
function fillProfile() {
    const d = ariaBrain.profile.data;
    for (const [k, id] of Object.entries(F)) $(id).value = Array.isArray(d[k]) ? d[k].join(", ") : d[k];
}
function afterProfileChange() { ariaBrain.rag.reindex({ memory: ariaBrain.memory, profile: ariaBrain.profile }); renderStats(); }
window.addEventListener("aria:profile-changed", () => { fillProfile(); renderStats(); });
$("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fields = {};
    for (const [k, id] of Object.entries(F)) fields[k] = $(id).value;
    ariaBrain.profile.update(fields);
    afterProfileChange();
    $("pfSaved").textContent = "¡Guardado! 💜";
    setTimeout(() => { $("pfSaved").textContent = ""; }, 2500);
});
$("pfReset").addEventListener("click", () => {
    if (!confirm("¿Borrar todo tu perfil?")) return;
    ariaBrain.profile.reset(); afterProfileChange(); fillProfile();
});

// ---------- memoria y documentos ----------
function renderKnowledge() {
    const docs = $("docList"), notes = $("noteList");
    docs.replaceChildren(); notes.replaceChildren();
    const dl = ariaBrain.rag.listDocuments();
    if (!dl.length) { const e = document.createElement("li"); e.className = "empty"; e.textContent = "Todavía no hay documentos."; docs.appendChild(e); }
    for (const d of dl) docs.appendChild(li(`📄 ${d.title} · ${Math.round(d.chars / 100) / 10} mil caracteres`, () => { ariaBrain.rag.removeDocument(d.id); renderKnowledge(); }));
    const nl = ariaBrain.memory.recall();
    if (!nl.length) { const e = document.createElement("li"); e.className = "empty"; e.textContent = "No hay notas todavía."; notes.appendChild(e); }
    for (const n of nl) notes.appendChild(li(n.content, () => { ariaBrain.memory.forget(n.id); afterProfileChange(); renderKnowledge(); }));
    renderStats();
}
function docMessage(text) { $("docMsg").textContent = text; setTimeout(() => { $("docMsg").textContent = ""; }, 4000); }

$("docForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const r = ariaBrain.rag.addDocument($("docTitle").value, $("docText").value);
    if (!r.ok) { docMessage(r.reason); return; }
    $("docTitle").value = ""; $("docText").value = "";
    docMessage("¡Guardado! Ya puedo usarlo. 💜");
    renderKnowledge();
});
$("docFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 400000) { docMessage("Ese archivo es muy grande (máx. 400 KB de texto)."); e.target.value = ""; return; }
    const text = await file.text();
    const r = ariaBrain.rag.addDocument(file.name.replace(/\.[^.]+$/, ""), text);
    docMessage(r.ok ? "¡Archivo guardado! 💜" : r.reason);
    e.target.value = "";
    renderKnowledge();
});

renderStats();
renderHologram();
window.ariaChat = { refresh: updateStatus, addMessage };
