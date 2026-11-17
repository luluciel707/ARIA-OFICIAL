// ARIA BRAIN · core.js
// El cerebro: recibe mensajes, decide qué habilidad responde y se comunica con el holograma.
//
// Orden de decisión:
//   0) urgencias de salud o crisis        3) charla cotidiana y conocimiento propio (reglas + RAG)
//   1) asistente personal (perfil, avisos, notas, cuentas, clima, internet)
//   2) habilidades anteriores (skills.js: música, videos…, si el archivo existe)
//   4) pregunta abierta: IA generativa con memoria + internet, o resumen de internet
//   5) respaldo amable

import { CONFIG } from "./config.js";
import { ARIAMemory } from "./memory.js";
import { ARIAConversation } from "./conversation.js";
import { ARIAProfile } from "./profile.js";
import { ARIAReminders, fmtClock } from "./reminders.js";
import { rag } from "./rag.js";
import { reason } from "./reasoning.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";
import { checkHealthSafety } from "./safety.js";
import { generativeEngine } from "./webllm.js";
import { runAssistantSkills, webAnswer } from "./assistant.js";
import { webSearch, extractLookupQuery, isInfoQuestion, shorten, searchLinks } from "./websearch.js";
import { smalltalk } from "./smalltalk.js";
import { speechText, fmt, pick, daypart } from "./text.js";
import { chime, startRinging, stopRinging, notify } from "./alerts.js";
import { HologramCues, chooseCue } from "./hologram.js";

// Habilidades anteriores (música, videos, etc.). Es opcional: si skills.js no está, se omite.
let legacy = null;
try { legacy = await import("./skills.js"); } catch (_) { legacy = null; }

// El servidor Python/llama.cpp solo existe en la PC local; en GitHub Pages no se consulta.
const LOCAL_HOST = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

class ARIABrain {

    constructor() {
        this.memory = new ARIAMemory();
        this.conversation = new ARIAConversation();
        this.profile = new ARIAProfile();
        this.reminders = new ARIAReminders();
        this.rag = rag;
        this.lastActions = [];           // enlaces/botones que acompañan a la última respuesta
        this.state = {};                 // estado de la charla (nombre pendiente, adivinanza, aviso pendiente…)
        this.channel = null;
        this.initialized = false;
        this.hologramConnected = false;
        this.localGatewayAvailable = false;
        this.greetedHologram = false;
        this.cues = new HologramCues((type, payload) => this.sendToHologram(type, payload));
        this.ai = generativeEngine;
    }

    // =====================================
    // INICIALIZACIÓN
    // =====================================

    initialize() {

        if (this.initialized) return;

        if ("BroadcastChannel" in window) {

            const channelName = CONFIG.channelName || CONFIG.channel;
            if (!channelName) { console.error("ARIA: falta configurar el canal."); return; }

            this.channel = new BroadcastChannel(channelName);
            this.channel.onmessage = (event) => this.handleMessage(event.data);
            console.log("ARIA: canal de comunicación preparado.");

        } else {
            console.error("Este navegador no admite BroadcastChannel.");
            return;
        }

        this.initialized = true;

        // Memoria de largo plazo (RAG) con notas y perfil.
        this.rag.reindex({ memory: this.memory, profile: this.profile });

        // Recordatorios y alarmas.
        this.reminders.addEventListener("fire", (e) => this.onReminderFired(e.detail));
        this.reminders.addEventListener("stop", (e) => {
            if (!e.detail.remaining) stopRinging();
            window.dispatchEvent(new CustomEvent("aria:ring-stop", { detail: e.detail }));
        });
        this.reminders.addEventListener("change", () => window.dispatchEvent(new CustomEvent("aria:reminders-changed")));
        // Se arranca un instante después para que la interfaz alcance a escuchar los avisos atrasados.
        setTimeout(() => this.reminders.start(), 600);

        if (LOCAL_HOST) this.checkLocalGateway();

        if (this.ai.wasEnabled && this.ai.supported) {
            this.ai.enable().catch(() => { /* el estado queda en la interfaz */ });
        }

        console.log(`${CONFIG.name} BRAIN v${CONFIG.version} iniciado.`);
    }

    async checkLocalGateway() {
        try {
            const response = await fetch("/api/status", { cache: "no-store" });
            if (!response.ok) throw new Error("Gateway no disponible");
            const status = await response.json();
            this.localGatewayAvailable = Boolean(status.ok);
            return status;
        } catch (_) {
            this.localGatewayAvailable = false;
            return null;
        }
    }

    // Saludo inicial según la hora y lo que ARIA sabe de la persona.
    getGreeting() {
        const name = this.profile.displayName;
        if (!this.profile.known) {
            this.state.awaitingName = true;
            return "¡Hola! Soy ARIA, tu asistente personal. 💜 Me encantaría conocerte: ¿cómo te llamás?";
        }
        const part = daypart();
        let out = fmt(part === "morning" ? "¡Buen día, {n}! ☀️" : part === "afternoon" ? "¡Buenas tardes, {n}! 🌸" : "¡Buenas noches, {n}! 🌙", name);
        if (this.profile.isBirthdayToday()) out += " 🎂 ¡¡Feliz cumpleaños!! Hoy es tu día.";
        const end = new Date(); end.setHours(23, 59, 59, 999);
        const k = this.reminders.list().filter(r => r.at <= end.getTime() && r.kind !== "timer").length;
        out += k ? ` Hoy tenés ${k} ${k === 1 ? "recordatorio" : "recordatorios"}. ¿Qué hacemos?` : " ¿Qué hacemos hoy?";
        return out;
    }

    // =====================================
    // AVISOS (recordatorios, alarmas, temporizadores)
    // =====================================

    onReminderFired({ item, late, agoMs }) {
        const n = this.profile.displayName;
        let text;
        if (item.kind === "alarm") {
            text = late ? `⏰ ${fmt("{n}, mientras no estabas sonó tu alarma de las", n)} ${fmtClock(item.at)}.`
                : fmt(pick(["⏰ ¡{n}, suena tu alarma!", "⏰ ¡Arriba, {n}! Es la hora de tu alarma."]), n);
        } else if (item.kind === "timer") {
            text = late ? "⏳ Mientras no estabas terminó tu temporizador." : fmt("⏳ ¡{n}, terminó el temporizador!", n);
            if (item.text && item.text !== "Temporizador") text += ` (${item.text})`;
        } else {
            const mins = Math.round(agoMs / 6e4);
            text = late && mins > 1
                ? fmt(`🔔 {n}, se te pasó un recordatorio hace ${mins >= 120 ? Math.round(mins / 60) + " horas" : mins + " minutos"}: «${item.text}».`, n)
                : fmt(pick([`🔔 ¡{n}, es hora! «${item.text}».`, `🔔 ¡Ey, {n}! Te aviso: «${item.text}». 💜`, `🔔 ¡Recordatorio, {n}! «${item.text}».`]), n);
        }
        if (item.kind === "reminder" || late) chime(); else startRinging();
        notify(item.kind === "alarm" ? "⏰ Alarma" : item.kind === "timer" ? "⏳ Temporizador" : "🔔 Recordatorio", text.replace(/^\S+\s/, ""));
        this.cues.play(item.kind === "reminder" ? "reminder" : "alarm", text);
        this.announce(text);
        window.dispatchEvent(new CustomEvent("aria:ring", { detail: { item, text } }));
    }

    // Avisos que no son respuesta a un mensaje.
    announce(text, actions = []) {
        this.conversation.add("assistant", text);
        this.sendToHologram("SAY", { text: speechText(text) });
        window.dispatchEvent(new CustomEvent("aria:response", { detail: text }));
        if (actions.length) window.dispatchEvent(new CustomEvent("aria:action", { detail: actions }));
    }

    // =====================================
    // MODELO LOCAL OPCIONAL (servidor Python)
    // =====================================

    async askLocalModel(message) {
        if (!LOCAL_HOST) return null;
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    history: this.conversation.getRecentMessages(8).slice(0, -1),
                    memories: this.memory.recall().slice(-12).map(note => note.content)
                })
            });
            if (!response.ok) return null;
            const result = await response.json();
            if (result.available && typeof result.answer === "string" && result.answer.trim()) {
                this.localGatewayAvailable = true;
                return result.answer.trim();
            }
            return null;
        } catch (error) {
            this.localGatewayAvailable = false;
            return null;
        }
    }

    // =====================================
    // RECEPCIÓN DE MENSAJES DEL HOLOGRAMA
    // =====================================

    handleMessage(data) {

        if (!data || typeof data !== "object") return;
        if (data.source !== "hologram") return;

        this.markHologram();
        const payload = data.payload || {};

        switch (data.type) {
            case "USER_MESSAGE": {
                if (typeof payload.text !== "string" || !payload.text.trim()) return;
                // La interfaz muestra lo que se dijo por voz en el holograma.
                window.dispatchEvent(new CustomEvent("aria:user", { detail: payload.text.trim() }));
                this.processMessage(payload.text).then(response => {
                    if (!response) return;
                    window.dispatchEvent(new CustomEvent("aria:response", { detail: response }));
                    if (this.lastActions.length) window.dispatchEvent(new CustomEvent("aria:action", { detail: this.lastActions }));
                });
                break;
            }
            case "HOLOGRAM_READY": {
                this.setState("IDLE");
                this.greetOnConnect();
                break;
            }
            case "HOLOGRAM_STATUS":
                this.setState("IDLE");
                break;
        }
    }

    markHologram() {
        const was = this.hologramConnected;
        this.hologramConnected = true;
        if (!was) window.dispatchEvent(new CustomEvent("aria:hologram", { detail: { connected: true } }));
    }

    // Al conectarse el holograma, ARIA saluda (una vez por sesión del cerebro).
    greetOnConnect() {
        if (this.greetedHologram || CONFIG.hologram?.greetOnConnect === false) return;
        this.greetedHologram = true;
        this.cues.play("greet");
        this.sendToHologram("SAY", { text: speechText(this.getGreeting()) });
    }

    // =====================================
    // ESTADOS
    // =====================================

    setState(state) { this.sendToHologram("STATE", { state: String(state).toUpperCase() }); }

    sendToHologram(type, payload = {}) {
        if (!this.channel) return;
        this.channel.postMessage({ type, payload, source: "brain", ts: Date.now() });
    }

    // =====================================
    // PREGUNTAS ABIERTAS: IA generativa + memoria + internet
    // =====================================

    async answerOpen(message) {
        const info = isInfoQuestion(message);
        const query = extractLookupQuery(message) || message.replace(/[?¿!¡]/g, "").trim();

        const retrieved = this.rag.search(message, { k: 3, sources: ["doc", "nota", "perfil", "kb"], minCoverage: 0.5 });
        const own = retrieved.find(r => (r.source === "doc" || r.source === "nota") && r.matched >= 2 && r.coverage >= 0.5);
        const useWeb = info && !own;   // si la respuesta está en las notas o documentos propios, no hace falta internet
        const web = useWeb ? await webSearch(query) : null;

        if (this.ai.ready) {
            try {
                const answer = await this.ai.ask(message, this.conversation.getRecentMessages(8).slice(0, -1), {
                    profile: this.profile.summary(),
                    retrieved: retrieved.map(r => r.text),
                    web: web?.ok ? web.results.slice(0, 2).map(r => `${r.source}: ${shorten(r.extract, 350)}`) : []
                });
                if (answer) {
                    const first = web?.ok ? web.results[0] : null;
                    return { text: answer, actions: first?.url ? [{ label: `Fuente: ${first.source}`, url: first.url }] : [] };
                }
            } catch (error) {
                console.warn("ARIA: falló la IA del navegador.", error.message);
            }
        }

        const local = await this.askLocalModel(message);
        if (local) return local;

        if (own) {
            const t = own.text.length > 260 ? own.text.slice(0, 260) + "…" : own.text;
            return fmt(pick(["Mirá lo que tengo anotado, {n}: " + t, "Acá lo encontré, {n}: " + t, "Según lo que me contaste, {n}: " + t]), this.profile.displayName);
        }
        if (info) return webAnswer(query, this);   // usa la búsqueda ya hecha (queda en caché)
        return null;
    }

    // =====================================
    // PROCESAMIENTO DE MENSAJES
    // =====================================

    async processMessage(message) {

        if (typeof message !== "string") return null;
        message = message.trim();
        if (!message) return null;

        this.conversation.add("user", message);
        this.setState("THINKING");
        this.lastActions = [];
        const remindersBefore = this.reminders.list().length;
        const intent = recognizeIntent(message);

        let actions = [];
        const take = (r) => {
            if (!r) return null;
            if (typeof r === "object") { actions = r.actions || []; return r.text; }
            return r;
        };

        try {

            // 0) Urgencias
            const safety = checkHealthSafety(message);
            let response = safety.urgent ? safety.message : null;

            // 1) Asistente personal
            if (!response) response = take(await runAssistantSkills(message, this));

            // 2) Habilidades anteriores (música, videos…)
            if (!response && legacy?.runSkills) {
                response = await legacy.runSkills(message, {
                    sendToHologram: (type, payload) => this.sendToHologram(type, payload),
                    hologramConnected: this.hologramConnected,
                    ai: this.ai,
                    announce: (text) => this.announce(text)
                });
            }

            // 3) Charla cotidiana y conocimiento propio
            if (!response && (recognizeIntent(message) !== "unknown" || searchKnowledge(message).found)) {
                response = await reason(message, this.memory, this);
            }

            // 4) Pregunta abierta
            if (!response) response = take(await this.answerOpen(message));

            // 5) Respaldo amable
            if (!response) response = await reason(message, this.memory, this);

            if (typeof response !== "string" || !response.trim()) throw new Error("Sin respuesta válida.");

            this.conversation.add("assistant", response);
            this.cues.play(chooseCue({
                safetyKind: safety.kind, intent,
                createdReminder: this.reminders.list().length > remindersBefore,
                hasActions: actions.length > 0, kb: searchKnowledge(message).found
            }), response);
            this.sendToHologram("SAY", { text: speechText(response) });
            this.lastActions = actions;
            this.setState("IDLE");
            return response;

        } catch (error) {

            console.error("Error en ARIA BRAIN:", error);
            const fallback = "Tuve un pequeño problema procesando eso. ¿Lo intentamos otra vez? 🙈";
            this.setState("ERROR");
            this.cues.play("sad", fallback);
            this.sendToHologram("SAY", { text: speechText(fallback) });
            return fallback;
        }
    }

    // =====================================
    // ESTADO DEL SISTEMA
    // =====================================

    getStatus() {
        return {
            name: CONFIG.name,
            version: CONFIG.version,
            initialized: this.initialized,
            memoryEntries: this.memory.recall().length,
            conversationMessages: this.conversation.length,
            hologramConnected: this.hologramConnected,
            localGatewayAvailable: this.localGatewayAvailable,
            profileKnown: this.profile.known,
            reminders: this.reminders.list().length,
            documents: this.rag.listDocuments().length,
            legacySkills: Boolean(legacy),
            ai: { supported: this.ai.supported, state: this.ai.state }
        };
    }

    close() {
        if (this.channel) { this.channel.close(); this.channel = null; }
        this.reminders.stop();
        this.hologramConnected = false;
        this.initialized = false;
    }
}

export const ariaBrain = new ARIABrain();

ariaBrain.initialize();

window.ariaBrain = ariaBrain;
