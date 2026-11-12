import { CONFIG } from "./config.js";

const DEFAULT_PROFILE = {
    name: "",
    preferredName: "amiga",
    tone: "cálida y cercana",
    verbosity: "normal",
    humor: "ligero",
    favoriteTopics: [],
    aversionTopics: [],
    habits: []
};

function cleanString(value, maxLength = 100) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .filter(item => typeof item === "string")
        .map(item => item.trim().slice(0, 80))
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
        aversionTopics: cleanList(source.aversionTopics),
        habits: cleanList(source.habits)
    };
}

function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ARIAMemory {

    constructor() {
        this.notes = [];
        this.documents = [];
        this.tasks = [];
        this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [], habits: [] };
        this.load();
    }

    load() {
        try {
            const savedNotes = localStorage.getItem(CONFIG.memoryKey);
            const savedProfile = localStorage.getItem("aria_profile");
            const savedDocs = localStorage.getItem("aria_documents");
            const savedTasks = localStorage.getItem("aria_tasks");

            this.notes = savedNotes ? JSON.parse(savedNotes) : [];
            this.documents = savedDocs ? JSON.parse(savedDocs) : [];
            this.tasks = savedTasks ? JSON.parse(savedTasks) : [];
            this.profile = normalizeProfile(savedProfile ? JSON.parse(savedProfile) : {});

            if (!Array.isArray(this.notes)) this.notes = [];
            if (!Array.isArray(this.documents)) this.documents = [];
            if (!Array.isArray(this.tasks)) this.tasks = [];
        } catch (error) {
            console.error("Error cargando memoria:", error);
            this.notes = [];
            this.documents = [];
            this.tasks = [];
            this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [], habits: [] };
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

    saveTasks() {
        try {
            localStorage.setItem("aria_tasks", JSON.stringify(this.tasks));
            return true;
        } catch (error) {
            console.error("Error guardando tareas:", error);
            return false;
        }
    }

    getProfile() {
        return {
            ...this.profile,
            favoriteTopics: [...this.profile.favoriteTopics],
            aversionTopics: [...this.profile.aversionTopics],
            habits: [...this.profile.habits]
        };
    }

    updateProfile(patch = {}) {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
        this.profile = normalizeProfile({ ...this.profile, ...patch });
        return this.saveProfile();
    }

    resetProfile() {
        this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [], habits: [] };
        return this.saveProfile();
    }

    remember(content) {
        if (typeof content !== "string") return false;
        content = content.trim();
        if (!content || content.length > 500) return false;

        this.notes.push({ id: makeId(), content, date: new Date().toISOString() });
        return this.save();
    }

    addDocument(title, content) {
        const safeTitle = String(title || "Documento").trim();
        const safeContent = String(content || "").trim();
        if (!safeContent) return false;

        this.documents.push({
            id: makeId(),
            title: safeTitle || "Documento",
            content: safeContent,
            date: new Date().toISOString()
        });
        return this.saveDocuments();
    }

    addTask({ title, dueAt = null, priority = false, type = "task" } = {}) {
        const safeTitle = cleanString(title, 180);
        if (!safeTitle) return null;
        const validDate = dueAt && Number.isFinite(new Date(dueAt).getTime()) ? new Date(dueAt).toISOString() : null;
        const task = {
            id: makeId(),
            title: safeTitle,
            dueAt: validDate,
            priority: Boolean(priority),
            type: ["task", "reminder", "appointment"].includes(type) ? type : "task",
            completed: false,
            createdAt: new Date().toISOString(),
            notifiedAt: null
        };
        this.tasks.push(task);
        return this.saveTasks() ? { ...task } : null;
    }

    getTasks({ includeCompleted = true } = {}) {
        return this.tasks
            .filter(task => includeCompleted || !task.completed)
            .map(task => ({ ...task }))
            .sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                if (a.priority !== b.priority) return a.priority ? -1 : 1;
                if (!a.dueAt) return 1;
                if (!b.dueAt) return -1;
                return new Date(a.dueAt) - new Date(b.dueAt);
            });
    }

    updateTask(id, patch = {}) {
        const task = this.tasks.find(item => item.id === id);
        if (!task) return false;
        if (typeof patch.title === "string") task.title = cleanString(patch.title, 180) || task.title;
        if (typeof patch.completed === "boolean") task.completed = patch.completed;
        if (typeof patch.priority === "boolean") task.priority = patch.priority;
        if (patch.dueAt === null) task.dueAt = null;
        else if (patch.dueAt && Number.isFinite(new Date(patch.dueAt).getTime())) task.dueAt = new Date(patch.dueAt).toISOString();
        if (patch.notifiedAt === null) task.notifiedAt = null;
        else if (patch.notifiedAt) task.notifiedAt = new Date(patch.notifiedAt).toISOString();
        return this.saveTasks();
    }

    removeTask(id) {
        const count = this.tasks.length;
        this.tasks = this.tasks.filter(task => task.id !== id);
        return this.tasks.length !== count && this.saveTasks();
    }

    getDueReminders(now = new Date()) {
        const due = this.tasks.filter(task =>
            !task.completed && task.dueAt && !task.notifiedAt && new Date(task.dueAt) <= now
        );
        for (const task of due) task.notifiedAt = now.toISOString();
        if (due.length) this.saveTasks();
        return due.map(task => ({ ...task }));
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
        const tokens = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 12);
        const sources = [...this.notes, ...this.documents];
        const scored = sources.map(item => {
            const haystack = (item.content || "").toLowerCase().normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ");
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
        this.tasks = [];
        this.profile = { ...DEFAULT_PROFILE, favoriteTopics: [], aversionTopics: [], habits: [] };
        this.save();
        this.saveDocuments();
        this.saveTasks();
        this.saveProfile();
    }
}
