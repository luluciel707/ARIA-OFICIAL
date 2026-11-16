// ARIA BRAIN · rag.js
// RAG local (Recuperación + Generación): busca en la memoria de ARIA con BM25,
// sin servidor, sin claves y sin descargar modelos de embeddings (liviano para PCs modestas).
//
// Fuentes que indexa:
//   kb      → base de conocimiento incorporada (kb-data.js)
//   doc     → documentos que la persona agrega (se guardan en localStorage)
//   nota    → notas de "recordá que ..."
//   perfil  → datos del perfil de usuario

import { CONFIG } from "./config.js";
import { KB } from "./kb-data.js";
import { tokens, uid } from "./text.js";

const KEY = "aria_rag_docs";
const K1 = 1.4, B = 0.75;

function chunkText(text, maxWords = 70) {
    const sentences = String(text).replace(/\r/g, "").split(/(?<=[.!?…])\s+|\n{2,}|\n(?=\s*[-*•\d])/).map(s => s.trim()).filter(Boolean);
    const out = [];
    let cur = [];
    let words = 0;
    for (const s of sentences) {
        const w = s.split(/\s+/).length;
        if (words + w > maxWords && cur.length) { out.push(cur.join(" ")); cur = []; words = 0; }
        cur.push(s); words += w;
    }
    if (cur.length) out.push(cur.join(" "));
    return out;
}

class ARIARag {

    constructor() {
        this.user = this._load();       // [{id,title,text,ts}]
        this.runtime = [];              // notas + perfil (se reconstruye)
        this._index = null;
    }

    _load() {
        try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; }
        catch (_) { return []; }
    }

    _save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.user)); return true; }
        catch (_) { return false; }
    }

    // ---------- documentos de la persona ----------
    addDocument(title, text) {
        text = String(text ?? "").trim();
        title = String(title ?? "").trim() || "Documento sin título";
        if (text.length < 20) return { ok: false, reason: "Ese texto es muy corto para guardarlo." };
        const used = this.user.reduce((n, d) => n + d.text.length, 0);
        if (used + text.length > CONFIG.rag.maxUserChars) {
            return { ok: false, reason: "Ya no hay lugar para más documentos. Podés borrar alguno para hacer espacio." };
        }
        const doc = { id: uid(), title: title.slice(0, 80), text, ts: Date.now() };
        this.user.push(doc);
        if (!this._save()) { this.user.pop(); return { ok: false, reason: "No pude guardar el documento en el navegador." }; }
        this._index = null;
        return { ok: true, id: doc.id, chunks: chunkText(text).length };
    }

    removeDocument(id) {
        const before = this.user.length;
        this.user = this.user.filter(d => d.id !== id);
        this._index = null;
        this._save();
        return this.user.length < before;
    }

    listDocuments() {
        return this.user.map(d => ({ id: d.id, title: d.title, chars: d.text.length, ts: d.ts }));
    }

    // ---------- memoria viva (notas y perfil) ----------
    reindex({ memory, profile } = {}) {
        this.runtime = [];
        if (memory) for (const n of memory.recall()) this.runtime.push({ source: "nota", title: "Nota", text: n.content });
        if (profile) for (const f of profile.facts()) this.runtime.push({ source: "perfil", title: "Perfil", text: f });
        this._index = null;
    }

    // ---------- índice BM25 ----------
    _build() {
        const entries = [];
        for (const e of KB) entries.push({ source: "kb", title: e.title, cat: e.cat, text: e.text, extra: `${e.title} ${e.title} ${e.keywords}` });
        for (const d of this.user) for (const c of chunkText(d.text)) entries.push({ source: "doc", title: d.title, text: c, extra: d.title });
        for (const r of this.runtime) entries.push({ ...r, extra: "" });

        const df = new Map();
        let total = 0;
        for (const e of entries) {
            const tf = new Map();
            for (const t of tokens(`${e.text} ${e.extra}`)) tf.set(t, (tf.get(t) || 0) + 1);
            e.tf = tf;
            e.len = Math.max(1, [...tf.values()].reduce((a, b) => a + b, 0));
            total += e.len;
            for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
        }
        this._index = { entries, df, avg: total / Math.max(1, entries.length) };
    }

    // Devuelve [{text,title,source,score,coverage,matched}]
    search(query, { k = 4, sources = null, minCoverage = 0 } = {}) {
        if (!this._index) this._build();
        const q = [...new Set(tokens(query))];
        if (!q.length) return [];
        const { entries, df, avg } = this._index;
        const N = entries.length;
        const results = [];
        for (const e of entries) {
            if (sources && !sources.includes(e.source)) continue;
            let score = 0, matched = 0;
            for (const t of q) {
                const f = e.tf.get(t);
                if (!f) continue;
                matched++;
                const n = df.get(t) || 0;
                const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
                score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * e.len / avg));
            }
            if (!matched) continue;
            const coverage = matched / q.length;
            if (coverage < minCoverage) continue;
            results.push({ text: e.text, title: e.title, source: e.source, cat: e.cat, score, coverage, matched });
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, k);
    }
}

export const rag = new ARIARag();
