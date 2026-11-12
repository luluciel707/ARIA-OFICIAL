function normalize(text) {
    return String(text || "").toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
}

function parseDueDate(text) {
    const now = new Date();
    const date = new Date(now);
    let hasDate = false;
    let cleaned = text;

    if (/\bpasado manana\b/.test(cleaned)) {
        date.setDate(date.getDate() + 2);
        cleaned = cleaned.replace(/\bpasado manana\b/, " ");
        hasDate = true;
    } else if (/\bmanana\b/.test(cleaned)) {
        date.setDate(date.getDate() + 1);
        cleaned = cleaned.replace(/\bmanana\b/, " ");
        hasDate = true;
    } else if (/\bhoy\b/.test(cleaned)) {
        cleaned = cleaned.replace(/\bhoy\b/, " ");
        hasDate = true;
    } else {
        const iso = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
        const local = cleaned.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
        if (iso) {
            date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
            cleaned = cleaned.replace(iso[0], " ");
            hasDate = true;
        } else if (local) {
            const year = local[3] ? Number(local[3]) : now.getFullYear();
            date.setFullYear(year, Number(local[2]) - 1, Number(local[1]));
            if (!local[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(year + 1);
            cleaned = cleaned.replace(local[0], " ");
            hasDate = true;
        }
    }

    const time = cleaned.match(/\b(?:a las?\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    let hasTime = false;
    if (time && (/\ba las?\b/.test(cleaned) || time[2] || time[3])) {
        let hours = Number(time[1]);
        const minutes = Number(time[2] || 0);
        if (time[3] === "pm" && hours < 12) hours += 12;
        if (time[3] === "am" && hours === 12) hours = 0;
        if (hours <= 23 && minutes <= 59) {
            date.setHours(hours, minutes, 0, 0);
            cleaned = cleaned.replace(time[0], " ");
            hasTime = true;
        }
    }

    if (hasDate && !hasTime) date.setHours(9, 0, 0, 0);
    if (!hasDate && hasTime) date.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());

    return {
        dueAt: hasDate || hasTime ? date.toISOString() : null,
        titleText: cleaned.replace(/\b(prioridad alta|prioritario|prioritaria|urgente)\b/g, " ").replace(/\s+/g, " ").trim(),
        priority: /\b(prioridad alta|prioritario|prioritaria|urgente)\b/.test(text)
    };
}

function formatDate(value) {
    if (!value) return "sin fecha";
    return new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function findMatchingTask(memory, fragment) {
    const query = normalize(fragment);
    if (!query) return null;
    return memory.getTasks({ includeCompleted: true }).find(task => normalize(task.title).includes(query));
}

export function handlePlannerMessage(message, memory) {
    const text = normalize(message);
    if (!text) return null;

    if (/^(que tengo pendiente|que tareas tengo|mis tareas|mis recordatorios|mi agenda|ver agenda|mostrar tareas|listar tareas|que tengo para hoy)\b/.test(text)) {
        const tasks = memory.getTasks({ includeCompleted: false });
        if (!tasks.length) return "No tenés tareas ni recordatorios pendientes. Podés decirme, por ejemplo, «recordame llamar a Ana mañana a las 10» o «agrega tarea comprar pan».";
        return "Tenés esto pendiente:\n" + tasks.slice(0, 12).map(task => {
            const type = task.type === "appointment" ? "Cita" : task.type === "reminder" ? "Recordatorio" : "Tarea";
            const marker = task.priority ? "❗ " : "• ";
            return `${marker}${type}: ${task.title} (${formatDate(task.dueAt)})`;
        }).join("\n");
    }

    const complete = text.match(/^(?:completa|completar|termin[eé]|marcar(?: como hecha)?|ya hice|listo con)\s+(.+)$/);
    if (complete) {
        const task = findMatchingTask(memory, complete[1].replace(/\b(como hecha|como hecho|como completada|como completado)\b/g, ""));
        if (!task) return "No encontré esa tarea. Decime una parte del título tal como aparece en la agenda.";
        memory.updateTask(task.id, { completed: true });
        return `Listo, marqué «${task.title}» como completada.`;
    }

    const remove = text.match(/^(?:borra|elimina|quita|cancel[aá])\s+(?:la )?(?:tarea|cita|recordatorio)?\s*(.+)$/);
    if (remove) {
        const task = findMatchingTask(memory, remove[1]);
        if (!task) return "No encontré eso en la agenda. Podés decir «mis tareas» para ver los pendientes.";
        memory.removeTask(task.id);
        return `Listo, eliminé «${task.title}» de la agenda.`;
    }

    const create = message.match(/^\s*(?:por favor\s+)?(?:recordame|recu[eé]rdame|no olvidar|anota(?:me)?|agrega(?:r)? tarea|nueva tarea|tengo cita(?: con)?|agenda(?:me)?|agend[aá])\s*:?[\s,]*/i);
    if (!create) return null;

    const originalRest = message.slice(create[0].length).trim();
    const parsed = parseDueDate(normalize(originalRest));
    const title = parsed.titleText
        .replace(/\b(para|el dia|el)\s*$/g, "")
        .replace(/\s+/g, " ").trim();
    if (!title) return "¿Qué querés que anote? Podés decirme también la fecha, por ejemplo: «recordame llamar mañana a las 10».";

    const type = /\btengo cita\b/i.test(message) ? "appointment"
        : /\b(recordame|recu[eé]rdame|no olvidar)\b/i.test(message) ? "reminder" : "task";
    const task = memory.addTask({ title, dueAt: parsed.dueAt, priority: parsed.priority, type });
    if (!task) return "No pude guardar eso en la agenda. Revisá si hay espacio en el almacenamiento del navegador.";

    const category = type === "appointment" ? "la cita" : type === "reminder" ? "el recordatorio" : "la tarea";
    return `Anoté ${category}: «${task.title}»${task.dueAt ? ` para ${formatDate(task.dueAt)}` : " (sin fecha)"}${task.priority ? ". La marqué como prioritaria" : ""}. Los avisos aparecen mientras ARIA esté abierta en esta pestaña.`;
}

export function formatPlannerDate(value) {
    return formatDate(value);
}
