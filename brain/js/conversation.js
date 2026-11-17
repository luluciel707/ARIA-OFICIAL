// ARIA BRAIN · conversation.js
// Historial de la charla. Se conserva entre sesiones (últimos mensajes) para poder retomar el hilo.

const KEY = "aria_conversation";

export class ARIAConversation {

    constructor() {
        this.history = [];
        this.maxHistory = 30;
        this._load();
    }

    _load() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || "[]");
            if (Array.isArray(v)) this.history = v.filter(m => m && typeof m.content === "string").slice(-this.maxHistory);
        } catch (_) { this.history = []; }
    }

    _save() {
        try { localStorage.setItem(KEY, JSON.stringify(this.history)); } catch (_) { /* sin almacenamiento */ }
    }

    add(role, content) {
        if (!["user", "assistant", "system"].includes(role)) return false;
        if (typeof content !== "string" || !content.trim()) return false;
        this.history.push({ role, content: content.trim(), timestamp: Date.now() });
        if (this.history.length > this.maxHistory) this.history.shift();
        this._save();
        return true;
    }

    getHistory() { return [...this.history]; }
    getLastMessage() { return this.history.length ? this.history[this.history.length - 1] : null; }
    getRecentMessages(amount = 10) { return this.history.slice(-amount); }
    clear() { this.history = []; this._save(); }
    get length() { return this.history.length; }
}
