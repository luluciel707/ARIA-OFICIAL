import { CONFIG } from "./config.js";
import { ARIAMemory } from "./memory.js";
import { ARIAConversation } from "./conversation.js";
import { reason } from "./reasoning.js";
import { handlePlannerMessage } from "./planner.js";
import { runSkills, extractLookupQuery, wikiLookup } from "./skills.js";
import { recognizeIntent } from "./intentions.js";
import { searchKnowledge } from "./knowledge.js";
import { searchRAG } from "./rag.js";
import { checkHealthSafety } from "./safety.js";
import { generativeEngine } from "./webllm.js";

const LOCAL_HOST = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

class ARIABrain {

    constructor() {
        this.memory = new ARIAMemory();
        this.conversation = new ARIAConversation();
        this.channel = null;
        this.initialized = false;
        this.hologramConnected = false;
        this.localGatewayAvailable = false;
        this.ai = generativeEngine;
        this.reminderTimer = null;
    }

    initialize() {
        if (this.initialized) return;
        if (!("BroadcastChannel" in window)) {
            console.error("Este navegador no admite BroadcastChannel.");
            return;
        }

        const channelName = CONFIG.channelName || CONFIG.channel;
        if (!channelName) {
            console.error("ARIA: falta configurar el canal.");
            return;
        }

        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = event => this.handleMessage(event.data);
        this.initialized = true;
        if (LOCAL_HOST) this.checkLocalGateway();
        if (this.ai.wasEnabled && this.ai.supported) this.ai.enable().catch(() => {});
        this.checkDueReminders();
        this.reminderTimer = window.setInterval(() => this.checkDueReminders(), 30000);
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

    checkDueReminders() {
        for (const task of this.memory.getDueReminders()) {
            const text = `Recordatorio: ${task.title}${task.type === "appointment" ? " (cita)" : ""}.`;
            this.announce(text);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                try { new Notification("ARIA · Recordatorio", { body: task.title, tag: `aria-${task.id}` }); }
                catch (error) { console.info("No se pudo mostrar la notificación del navegador:", error); }
            }
        }
    }

    getRelevantContext(message) {
        const documents = this.memory.getDocuments();
        const documentMatches = searchRAG(message, documents, 3);
        const noteMatches = this.memory.findRelevantContext(message)
            .filter(item => item.source === "nota")
            .map(item => ({ title: item.title, content: item.content, source: item.source }));
        const seen = new Set();
        return [...documentMatches, ...noteMatches]
            .filter(item => {
                const key = `${item.title}|${item.content}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 3)
            .map(item => ({
                title: String(item.title || "Nota personal").slice(0, 100),
                source: item.source || "documento",
                content: String(item.content || "").slice(0, 700)
            }));
    }

    async askGenerative(message) {
        const history = this.conversation.getRecentMessages(8).slice(0, -1);
        const memories = this.memory.recall().slice(-8).map(note => note.content);
        const profile = this.memory.getProfile();
        const context = this.getRelevantContext(message);
        if (this.ai.ready) {
            try {
                const answer = await this.ai.ask(message, history, memories, profile, context);
                if (answer) return answer;
            } catch (error) {
                console.warn("ARIA: falló la IA del navegador.", error.message);
            }
        }
        return this.askLocalModel(message, profile, context);
    }

    announce(text) {
        this.conversation.add("assistant", text);
        this.sendToHologram("SAY", { text });
        window.dispatchEvent(new CustomEvent("aria:response", { detail: text }));
    }

    async askLocalModel(message, profile = this.memory.getProfile(), context = this.getRelevantContext(message)) {
        if (!LOCAL_HOST) return null;
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    history: this.conversation.getRecentMessages(8).slice(0, -1),
                    memories: this.memory.recall().slice(-8).map(note => note.content),
                    profile,
                    context
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
            console.info("ARIA: modelo local no disponible; usando respaldo JS.", error.message);
            return null;
        }
    }

    handleMessage(data) {
        if (!data || typeof data !== "object" || data.source !== "hologram") return;
        const payload = data.payload || {};
        switch (data.type) {
            case "USER_MESSAGE":
                if (typeof payload.text !== "string") return;
                this.processMessage(payload.text).then(response => {
                    if (response) window.dispatchEvent(new CustomEvent("aria:response", { detail: response }));
                });
                break;
            case "HOLOGRAM_READY":
            case "HOLOGRAM_STATUS":
                this.hologramConnected = true;
                this.setState("IDLE");
                break;
        }
    }

    setState(state) {
        this.sendToHologram("STATE", { state: String(state).toUpperCase() });
    }

    sendToHologram(type, payload = {}) {
        if (!this.channel) return;
        this.channel.postMessage({ type, payload, source: "brain", ts: Date.now() });
    }

    async processMessage(message) {
        if (typeof message !== "string") return null;
        message = message.trim();
        if (!message) return null;
        this.conversation.add("user", message);
        this.setState("THINKING");

        try {
            let response = handlePlannerMessage(message, this.memory);
            if (!response) response = await runSkills(message, {
                sendToHologram: (type, payload) => this.sendToHologram(type, payload),
                hologramConnected: this.hologramConnected,
                ai: this.ai,
                announce: text => this.announce(text)
            });
            if (!response) {
                const deterministic = checkHealthSafety(message).urgent
                    || recognizeIntent(message) !== "unknown"
                    || searchKnowledge(message).found;
                if (deterministic) response = await reason(message, this.memory);
            }
            if (!response) response = await this.askGenerative(message);
            if (!response) {
                const query = extractLookupQuery(message);
                if (query) response = await wikiLookup(query);
            }
            if (!response) response = await reason(message, this.memory);
            if (typeof response !== "string" || !response.trim()) throw new Error("El razonamiento no devolvió una respuesta válida.");

            this.conversation.add("assistant", response);
            this.sendToHologram("SAY", { text: response });
            this.setState("IDLE");
            return response;
        } catch (error) {
            console.error("Error en ARIA BRAIN:", error);
            const fallback = "Tuve un pequeño problema procesando ese mensaje. ¿Lo intentamos otra vez?";
            this.setState("ERROR");
            this.sendToHologram("SAY", { text: fallback });
            return fallback;
        }
    }

    getStatus() {
        return {
            name: CONFIG.name,
            version: CONFIG.version,
            initialized: this.initialized,
            memoryEntries: this.memory.recall().length,
            taskEntries: this.memory.getTasks().length,
            conversationMessages: this.conversation.length,
            hologramConnected: this.hologramConnected,
            localGatewayAvailable: this.localGatewayAvailable,
            ai: { supported: this.ai.supported, state: this.ai.state }
        };
    }

    close() {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        if (this.reminderTimer) window.clearInterval(this.reminderTimer);
        this.reminderTimer = null;
        this.hologramConnected = false;
        this.initialized = false;
    }
}

export const ariaBrain = new ARIABrain();
ariaBrain.initialize();
window.ariaBrain = ariaBrain;
