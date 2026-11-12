import { CONFIG } from "./config.js";

const DEFAULT_PROFILE = {
    name: "",
    preferredName: "amiga",
    tone: "cálida y cercana",
    verbosity: "normal",
    humor: "ligero",
    favoriteTopics: [],
    aversionTopics: []
};

function cleanString(value, maxLength = 100) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .filter(item => typeof item === "string")
        .map(item => item.trim().slice(0, 60))
        .filter(Boolean))].slice(0, 20);
}

function normalizeProfile(profile) {
    const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
    return {
        name: cleanString(source.name),
        preferredName: cleanString(source.preferredName, 50) || DEFAULT_PROFILE.preferredName,
        tone: cleanString(source.tone, 80) || DEFAULT_PROFILE.tone,
        verbosity: ["breve", "normal", "detallado"].includes(source.verbosity) ? source.verbosity : DEFAULT_PROFILE.verbosity,
        humor: ["nulo", "ligero", "alto"].includes(source.humor) ? source.humor : DEFAULT_PROFILE.humor,
        favoriteTopics: cleanList(source.favoriteTopics),
        aversionTopics: cleanList(source.aversionTopics)
    };
}

export class ARIAMemory {

    constructor() {
        this.notes = [];
        this.documents = [];
        this.profile = { ...DEFAULT_PROFILE };
        this.load();
    }

    load() {
        try {
            const savedNotes = localStorage.getItem(CONFIG.memoryKey);
            const savedProfile = localStorage.getItem("aria_profile");
            const savedDocs = localStorage.getItem("aria_documents");

            this.notes = savedNotes ? JSON.parse(savedNotes) : [];
            this.documents = savedDocs ? JSON.parse(savedDocs) : [];
            this.profile = normalizeProfile(savedProfile ? JSON.parse(savedProfile) : {});

            if (!Array.isArray(this.notes)) this.notes = [];
            if (!Array.isArray(this.documents)) this.documents = [];
        } catch (error) {
            console.error("Error cargando memoria:", error);
            this.notes = [];
            this.documents = [];
            this.profile = { ...DEFAULT_PROFILE };
        }
    }

    save() {
        try {
            localStorage.setItem(CONFIG.memoryKey, JSON.stringify(this.notes));
            return true;
        } catch (error) {
            console.error("Error guardando memoria:", error);
            return false;
        }
    }

    saveProfile() {
        try {
            this.profile = normalizeProfile(this.profile);
            localStorage.setItem("aria_profile", JSON.stringify(this.profile));
            return true;
        } catch (error) {
            console.error("Error guardando perfil:", error);
            return false;
        }
    }

    saveDocuments() {
        try {
            localStorage.setItem("aria_documents", JSON.stringify(this.documents));
            return true;
        } catch (error) {
            console.error("Error guardando documentos:", error);
            return false;
        }
    }

    getProfile() {
        return { ...this.profile, favoriteTopics: [...this.profile.favoriteTopics], aversionTopics: [...this.profile.aversionTopics] };
    }

    updateProfile(patch = {}) {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
        this.profile = normalizeProfile({ ...this.profile, ...patch });
        return this.saveProfile();
    }

    resetProfile() {
        this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [] };
        return this.saveProfile();
    }

    remember(content) {
        if (typeof content !== "string") return false;
        content = content.trim();
        if (!content || content.length > 500) return false;

        this.notes.push({
            id: crypto.randomUUID(),
            content,
            date: new Date().toISOString()
        });
        return this.save();
    }

    addDocument(title, content) {
        const safeTitle = String(title || "Documento").trim();
        const safeContent = String(content || "").trim();
        if (!safeContent) return false;

        this.documents.push({
            id: crypto.randomUUID(),
            title: safeTitle || "Documento",
            content: safeContent,
            date: new Date().toISOString()
        });
        return this.saveDocuments();
    }

    recall() {
        return [...this.notes];
    }

    getDocuments() {
        return [...this.documents];
    }

    search(query) {
        const normalized = String(query || "").toLowerCase();
        if (!normalized) return [];
        return this.notes.filter(note => note.content.toLowerCase().includes(normalized));
    }

    findRelevantContext(query) {
        const text = String(query || "").toLowerCase();
        if (!text.trim()) return [];

        const tokens = text.normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9 ]/g, " ")
            .split(/\s+/).filter(Boolean).slice(0, 12);
        const sources = [...this.notes, ...this.documents];
        const scored = sources.map(item => {
            const haystack = (item.content || "").toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
            const matches = tokens.filter(token => haystack.includes(token)).length;
            return { item, score: matches + (item.title && haystack.includes(item.title.toLowerCase()) ? 1 : 0) };
        }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

        return scored.map(({ item }) => ({
            title: item.title || "Nota",
            content: String(item.content || "").trim(),
            source: item.title ? "documento" : "nota"
        }));
    }

    forget(id) {
        this.notes = this.notes.filter(note => note.id !== id);
        return this.save();
    }

    clear() {
        this.notes = [];
        this.documents = [];
        this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [] };
        this.save();
        this.saveDocuments();
        this.saveProfile();
    }
}
