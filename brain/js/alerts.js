// ARIA BRAIN · alerts.js
// Sonido, vibración y notificaciones del navegador para alarmas y recordatorios.

let ctx = null;
let ringTimer = null;

function audio() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    return ctx;
}

// Los navegadores exigen un toque o tecla antes de permitir sonido.
export function unlockAudio() { try { audio(); } catch (_) { /* sin audio */ } }

function tone(freq, start, dur, vol = 0.18, type = "sine") {
    const a = audio();
    if (!a) return;
    const osc = a.createOscillator(), gain = a.createGain();
    osc.type = type; osc.frequency.value = freq;
    const t0 = a.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
}

// Campanita suave para recordatorios.
export function chime() {
    try { [659.25, 783.99, 987.77].forEach((f, i) => tone(f, i * 0.18, 0.5, 0.16)); } catch (_) { /* sin audio */ }
    try { navigator.vibrate?.([200, 100, 200]); } catch (_) { /* sin vibración */ }
}

// Alarma que suena hasta que se detiene.
export function startRinging() {
    stopRinging();
    const beep = () => {
        try { [0, 0.22, 0.44].forEach(s => tone(988, s, 0.14, 0.2, "square")); } catch (_) { /* sin audio */ }
        try { navigator.vibrate?.([300, 150, 300]); } catch (_) { /* sin vibración */ }
    };
    beep();
    ringTimer = setInterval(beep, 1600);
}

export function stopRinging() {
    clearInterval(ringTimer);
    ringTimer = null;
    try { navigator.vibrate?.(0); } catch (_) { /* sin vibración */ }
}

export function notificationsState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
}

export async function requestNotifications() {
    if (!("Notification" in window)) return "unsupported";
    try { return await Notification.requestPermission(); } catch (_) { return "denied"; }
}

export function notify(title, body) {
    try {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body, tag: "aria-" + title, requireInteraction: true });
        }
    } catch (_) { /* algunos celulares exigen service worker */ }
}
