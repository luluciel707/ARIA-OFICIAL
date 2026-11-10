// ARIA BRAIN · webllm.js
// Motor generativo que corre 100 % en el navegador (WebGPU), sin servidor.
// Reemplaza al servidor local llama.cpp cuando ARIA está publicada en GitHub Pages.
//
// El modelo se descarga una sola vez (unos 300 MB) y queda guardado en el navegador.
// Es opcional: si no se activa, ARIA usa su conocimiento propio y Wikipedia.

import { CONFIG } from "./config.js";

// Versión fija de la biblioteca (nunca "latest"), cargada desde jsDelivr.
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.63/+esm";
const FLAG = "aria_ai_enabled";
const ASK_TIMEOUT_MS = 90000;

function cleanForSpeech(text) {
    return String(text)
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[*_`#>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

class GenerativeEngine extends EventTarget {

    constructor() {
        super();
        this.engine = null;
        this.state = "off";      // off | loading | ready | error
        this.text = "IA generativa apagada";
        this.progress = 0;
        this.loading = null;
    }

    get supported() {
        return typeof navigator !== "undefined" && "gpu" in navigator;
    }

    get ready() {
        return this.state === "ready" && Boolean(this.engine);
    }

    get wasEnabled() {
        try { return localStorage.getItem(FLAG) === "1"; } catch (_) { return false; }
    }

    _set(state, text, progress) {
        this.state = state;
        if (typeof text === "string") this.text = text;
        if (typeof progress === "number") this.progress = progress;
        this.dispatchEvent(new CustomEvent("status", {
            detail: { state: this.state, text: this.text, progress: this.progress }
        }));
    }

    // Descarga (la primera vez) y carga el modelo. Devuelve una promesa.
    enable() {
        if (this.ready) return Promise.resolve();
        if (this.loading) return this.loading;

        if (!this.supported) {
            this._set("error", "Este navegador no tiene WebGPU");
            return Promise.reject(new Error("WebGPU no disponible"));
        }

        try { localStorage.setItem(FLAG, "1"); } catch (_) { /* sin almacenamiento */ }

        this.loading = (async () => {
            this._set("loading", "Preparando la IA generativa...", 0);
            const webllm = await import(WEBLLM_URL);
            this.engine = await webllm.CreateMLCEngine(CONFIG.ai.modelId, {
                initProgressCallback: (report) => {
                    this._set("loading", report.text || "Descargando...", report.progress ?? 0);
                }
            });
            this._set("ready", "IA generativa lista", 1);
        })().catch((error) => {
            this.engine = null;
            this._set("error", "No pude cargar la IA generativa");
            console.error("ARIA IA:", error);
            throw error;
        }).finally(() => {
            this.loading = null;
        });

        return this.loading;
    }

    disable() {
        try { localStorage.removeItem(FLAG); } catch (_) { /* sin almacenamiento */ }
        try { this.engine?.unload?.(); } catch (_) { /* ya descargado */ }
        this.engine = null;
        this._set("off", "IA generativa apagada", 0);
    }

    // history: [{ role, content }], memories: ["nota", ...]
    async ask(message, history = [], memories = []) {
        if (!this.ready) return null;

        const p = CONFIG.personality;
        const system = [
            `Sos ${CONFIG.name}, ${String(p.identity).toLowerCase()}.`,
            `Tono: ${p.tone}. Hablás con ${String(p.audience).toLowerCase()}.`,
            "Respondé siempre en español rioplatense claro y cotidiano, en 2 o 3 oraciones cortas, sin listas ni formato especial.",
            "No hagas diagnósticos, no recetes medicamentos y no reemplaces a profesionales de la salud. Ante síntomas preocupantes, recomendá consultar a un profesional.",
            "Si no sabés algo, decilo con honestidad; no inventes datos.",
            memories.length ? `Cosas que la persona te pidió recordar: ${memories.join("; ")}.` : ""
        ].filter(Boolean).join(" ");

        const turns = history
            .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
            .map(item => ({ role: item.role, content: item.content }));

        const request = this.engine.chat.completions.create({
            messages: [{ role: "system", content: system }, ...turns, { role: "user", content: message }],
            temperature: 0.6,
            max_tokens: 220,
            stream: false
        });

        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("La IA tardó demasiado")), ASK_TIMEOUT_MS));

        const result = await Promise.race([request, timeout]);
        const answer = cleanForSpeech(result?.choices?.[0]?.message?.content || "");
        return answer || null;
    }
}

export const generativeEngine = new GenerativeEngine();
