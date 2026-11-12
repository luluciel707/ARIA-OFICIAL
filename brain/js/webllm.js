// ARIA BRAIN · webllm.js
// Motor generativo que corre 100 % en el navegador (WebGPU), sin servidor.
// El modelo se descarga una vez y queda guardado en la caché del navegador.

import { CONFIG } from "./config.js";

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
        this.state = "off";
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
                initProgressCallback: report => this._set("loading", report.text || "Descargando...", report.progress ?? 0)
            });
            this._set("ready", "IA generativa lista", 1);
        })().catch(error => {
            this.engine = null;
            this._set("error", "No pude cargar la IA generativa");
            console.error("ARIA IA:", error);
            throw error;
        }).finally(() => { this.loading = null; });

        return this.loading;
    }

    disable() {
        try { localStorage.removeItem(FLAG); } catch (_) { /* sin almacenamiento */ }
        try { this.engine?.unload?.(); } catch (_) { /* ya descargado */ }
        this.engine = null;
        this._set("off", "IA generativa apagada", 0);
    }

    // history: [{ role, content }], memories: ["nota", ...], profile: datos editables del usuario.
    async ask(message, history = [], memories = [], profile = {}) {
        if (!this.ready) return null;

        const p = CONFIG.personality;
        const profileContext = [
            profile.preferredName && profile.preferredName !== "amiga" ? `Llamá a la persona ${profile.preferredName}` : "",
            profile.tone ? `Estilo preferido: ${profile.tone}` : "",
            profile.verbosity ? `Extensión preferida: ${profile.verbosity}` : "",
            profile.humor ? `Preferencia de humor: ${profile.humor}` : "",
            Array.isArray(profile.favoriteTopics) && profile.favoriteTopics.length ? `Temas que le interesan: ${profile.favoriteTopics.join(", ")}` : ""
        ].filter(Boolean).join(". ");

        const system = [
            `Sos ARIA, ${p.identity}.`,
            `Tu forma de ser es ${p.tone}: dulce, cercana, ocurrente y un poquito torpe de manera simpática; no actúes como un personaje exagerado.`,
            `Hablás con ${String(p.audience).toLowerCase()} en español rioplatense cotidiano y natural.`,
            "Conversá como una persona amable, no como un manual: respondé directamente, usá frases naturales y variá el ritmo. No empieces cada respuesta con un saludo ni termines siempre ofreciendo más ayuda.",
            "Sé concreta por defecto, pero seguí la extensión y el tono de la conversación. Si piden una explicación, organizala con claridad; si solo quieren charlar, respondé con naturalidad y podés hacer una pregunta genuina para seguir.",
            "Podés hablar de temas variados, ayudar con ideas, contar chistes y jugar. No afirmes que realizaste acciones reales si no tenés una herramienta para hacerlas.",
            "Usá humor amable solo cuando encaje. Si la persona habla de algo triste, urgente o delicado, escuchá y respondé con empatía, sin chistes ni frases hechas.",
            "Si no sabés algo o te falta contexto, decilo con sencillez; no inventes hechos. Diferenciá una opinión de un dato comprobado.",
            "No infantilices a la persona. No hagas diagnósticos ni prescribas medicamentos; para síntomas preocupantes recomendá atención profesional.",
            profileContext ? `Preferencias del usuario: ${profileContext}.` : "",
            memories.length ? `Recuerdos que la persona pidió guardar: ${memories.join("; ")}. Usalos solo cuando sean pertinentes, sin exponerlos innecesariamente.` : ""
        ].filter(Boolean).join(" ");

        const turns = history
            .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
            .map(item => ({ role: item.role, content: item.content }));

        const request = this.engine.chat.completions.create({
            messages: [{ role: "system", content: system }, ...turns, { role: "user", content: message }],
            temperature: 0.78,
            max_tokens: 320,
            stream: false
        });

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("La IA tardó demasiado")), ASK_TIMEOUT_MS));
        const result = await Promise.race([request, timeout]);
        return cleanForSpeech(result?.choices?.[0]?.message?.content || "") || null;
    }
}

export const generativeEngine = new GenerativeEngine();
