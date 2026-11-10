import * as THREE from "three";
import { CONFIG, MESSAGE_TYPES, STATES, clamp } from "./config.js";
import { AvatarScene } from "./avatar.js";
import { ExpressionController } from "./expressions.js";
import { GestureController } from "./gestures.js";
import { VoiceController } from "./voice.js";
import { Communication } from "./communication.js";
import { planPerformance, analyzeUserText } from "./emotion.js";
import { MediaPlayer } from "./media.js";

// ======================================
// ARIA HOLOGRAM · MAIN CONTROLLER
// ======================================

const canvas = document.querySelector("#hologram-canvas");
const connectionHUD = document.querySelector("#hud-connection");
const connectionText = document.querySelector("#connection-text");
const stateText = document.querySelector("#state-text");
const messageHUD = document.querySelector("#hud-message");
const media = new MediaPlayer(document.querySelector("#media-panel"));

const listenButton = document.querySelector("#btn-listen");
const fullscreenButton = document.querySelector("#btn-fullscreen");

if (!canvas || !listenButton || !fullscreenButton) {
    throw new Error("Faltan elementos HTML necesarios para ARIA HOLOGRAM.");
}

const BUILD = "v2-diagnostico";

// Panel de errores: muestra en pantalla el motivo exacto, sin necesidad de abrir la consola.
function showFatal(text) {
    console.error("[ARIA]", text);
    let box = document.getElementById("hud-error");
    if (!box) {
        box = document.createElement("pre");
        box.id = "hud-error";
        box.style.cssText = "position:fixed;left:8px;right:8px;top:8px;z-index:50;margin:0;padding:8px 10px;"
            + "max-height:45vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.4 monospace;"
            + "color:#ffe3e3;background:rgba(110,0,0,.88);border:1px solid #ff6b6b;border-radius:8px;";
        document.body.appendChild(box);
    }
    box.textContent += text + "\n";
}

function describeError(error) {
    const stack = String(error?.stack || "").split("\n").slice(0, 3).join(" | ");
    return `${error?.message || error}${stack ? "  ::  " + stack : ""}`;
}

window.addEventListener("error", (event) => showFatal(`Error: ${event.message} (${event.filename?.split("/").pop()}:${event.lineno})`));
window.addEventListener("unhandledrejection", (event) => showFatal(`Error: ${describeError(event.reason)}`));

let avatar = null;
let expressions = null;
let gestures = null;
let voice = null;
let communication = null;

let lastMessageTimer = null;
let animationStarted = false;
const clock = new THREE.Clock();

// Estado de la actuación (expresiones y gestos sincronizados con lo que dice)
let currentState = STATES.IDLE;
let performanceTimers = [];
let pendingPlan = [];
let restTimer = null;
let thinkingTimer = null;
let happyTimer = null;
let statusTimer = null;

// ======================================
// INTERFAZ
// ======================================

function restingState() {
    return voice?.wantListening ? STATES.LISTENING : STATES.IDLE;
}

function setState(state) {
    const normalized = String(state || STATES.IDLE).toUpperCase();
    currentState = normalized;
    stateText.textContent = normalized;
    document.body.dataset.state = normalized.toLowerCase();

    // Si el cerebro no responde, no se queda pensando para siempre.
    clearTimeout(thinkingTimer);
    if (normalized === STATES.THINKING) {
        thinkingTimer = setTimeout(() => {
            if (currentState === STATES.THINKING) setState(restingState());
        }, CONFIG.thinkingTimeoutMs);
    }

    applyStatePose(normalized);
}

function setConnection(connected) {
    connectionHUD.dataset.status = connected ? "connected" : "disconnected";
    connectionText.textContent = connected ? "CEREBRO CONECTADO" : "ESPERANDO CEREBRO";
}

function showMessage(text, duration = CONFIG.messageDurationMs) {
    messageHUD.textContent = String(text);
    messageHUD.hidden = false;

    clearTimeout(lastMessageTimer);
    lastMessageTimer = setTimeout(() => {
        messageHUD.hidden = true;
    }, duration);
}

// ======================================
// POSTURA Y EXPRESIÓN SEGÚN EL ESTADO
// ======================================

// Vuelve a una cara tranquila (con sonrisa suave) un momento después de terminar de hablar.
function scheduleRest(delay = 1500) {
    clearTimeout(restTimer);
    restTimer = setTimeout(() => {
        if (!expressions || !gestures || voice?.isSpeaking) return;
        const listening = Boolean(voice?.wantListening);
        expressions.set("happy", listening ? 0.2 : 0.1);
        gestures.setMood("neutral");
        gestures.setListening(listening);
    }, delay);
}

function applyStatePose(state) {
    if (!expressions || !gestures) return;
    clearTimeout(happyTimer);

    switch (state) {
        case STATES.THINKING:
            clearTimeout(restTimer);
            gestures.setListening(false);
            expressions.set("thinking", 0.45);
            gestures.setMood("thinking", 0.8);
            gestures.lookAt("up", 2200);
            break;

        case STATES.SPEAKING:
            clearTimeout(restTimer);
            gestures.setListening(false);
            break;

        case STATES.HAPPY:
            clearTimeout(restTimer);
            expressions.set("happy", 0.8);
            gestures.setMood("happy", 1);
            gestures.play("cheer");
            happyTimer = setTimeout(() => {
                if (currentState === STATES.HAPPY) setState(restingState());
            }, CONFIG.happyDurationMs);
            break;

        case STATES.ERROR:
            clearTimeout(restTimer);
            gestures.setListening(false);
            expressions.set("sad", 0.5);
            gestures.setMood("sad", 0.7);
            break;

        default: // IDLE y LISTENING
            scheduleRest();
    }
}

// ======================================
// ACTUACIÓN: EXPRESIONES Y GESTOS POR FRASE
// ======================================

function clearPerformance() {
    performanceTimers.forEach(clearTimeout);
    performanceTimers = [];
}

function applySegment(seg) {
    if (seg.expression && expressions) {
        const result = expressions.set(seg.expression, seg.intensity);
        if (!result.ok) console.debug(result.reason);
    }

    if (gestures) {
        if (seg.mood) gestures.setMood(seg.mood, clamp((seg.intensity ?? 0.5) * 1.4, 0.4, 1));
        if (seg.gesture) {
            const result = gestures.play(seg.gesture);
            if (!result.ok) console.debug(result.reason);
        }
    }
}

// Reparte los cambios de expresión a lo largo de la duración real del audio.
function schedulePerformance(segments, durationMs) {
    clearPerformance();
    if (!segments.length || !Number.isFinite(durationMs) || durationMs <= 0) return;

    for (const seg of segments) {
        const delay = Math.max(0, seg.start * durationMs - 150); // un poco antes de la frase
        performanceTimers.push(setTimeout(() => applySegment(seg), delay));
    }
}

// ======================================
// CONTROL DE MENSAJES
// ======================================

function handleSay(payload = {}) {
    if (typeof payload.text !== "string" || !payload.text.trim()) return;
    if (!voice) return;

    clearTimeout(restTimer);
    clearPerformance();

    // Si el cerebro pide una expresión o un gesto concretos, mandan ellos.
    const lockExpression = Boolean(payload.expression);
    const lockGesture = Boolean(payload.gesture);

    if (payload.expression && expressions) {
        const result = expressions.set(payload.expression);

        if (!result.ok) console.warn(result.reason);
        else gestures?.setMood(result.name, 0.8);
    }

    if (payload.gesture && gestures) {
        const result = gestures.play(payload.gesture);

        if (!result.ok) console.warn(result.reason);
    }

    // El resto se decide solo, frase por frase, según lo que dice.
    const plan = planPerformance(payload.text, { lockExpression, lockGesture });
    if (plan.length) applySegment(plan[0]);
    pendingPlan = plan.slice(1);

    voice.speak(payload.text);
    showMessage(payload.text);
}

// Animaciones propias creadas en el editor (editor/index.html). Se guardan en localStorage
// y se disparan por nombre: GESTURE { name: "mi-saludo" } o SAY { gesture: "mi-saludo" }.
function loadCustomAnimations() {
    if (!gestures) return 0;
    try {
        const raw = localStorage.getItem(CONFIG.animationsStorageKey);
        const library = raw ? JSON.parse(raw) : {};
        const count = gestures.setCustomAnimations(library);
        console.log(`Animaciones propias cargadas: ${count}`);
        return count;
    } catch (error) {
        console.warn("No se pudieron leer las animaciones propias:", error);
        return 0;
    }
}

// Avisa a quien escuche (el editor, el cerebro) cómo está el holograma.
function sendStatus() {
    if (!communication || !gestures) return;
    communication.send(MESSAGE_TYPES.HOLOGRAM_STATUS, {
        state: currentState,
        animating: gestures.isAnimating(),
        bones: gestures.getCapabilities().bones,
        animations: gestures.getCustomNames()
    });
}

function registerCommunication() {
    communication.on(MESSAGE_TYPES.SAY, (msg) => {
        handleSay(msg.payload);
    });

    communication.on(MESSAGE_TYPES.EXPRESSION, (msg) => {
        const result = expressions?.set(
            msg.payload.name,
            msg.payload.intensity
        );

        if (result && !result.ok) console.warn(result.reason);
        else if (result) gestures?.setMood(result.name, 0.8);
    });

    communication.on(MESSAGE_TYPES.GESTURE, (msg) => {
        const result = gestures?.play(
            msg.payload.name,
            msg.payload.options || {}
        );

        if (result && !result.ok) console.warn(result.reason);
    });

    communication.on(MESSAGE_TYPES.STATE, (msg) => {
        if (msg.payload.state) setState(msg.payload.state);
    });

    // Pose manual: { bones: { hueso: [x, y, z] } } en grados, o { release: true } para soltarla.
    communication.on(MESSAGE_TYPES.POSE, (msg) => {
        if (!gestures) return;
        const payload = msg.payload;

        if (payload.release || !payload.bones || typeof payload.bones !== "object") {
            gestures.releasePose();
            return;
        }
        gestures.setPose(payload.bones);
    });

    // Animaciones: { action: "play", animation } | { action: "play", name } | "stop" | "reload"
    communication.on(MESSAGE_TYPES.ANIMATION, (msg) => {
        if (!gestures) return;
        const payload = msg.payload;

        switch (payload.action) {
            case "play": {
                clearTimeout(restTimer);
                const result = payload.animation
                    ? gestures.playAnimation(payload.animation, payload.animation.name)
                    : gestures.play(payload.name);

                if (!result.ok) {
                    console.warn(result.reason);
                    showMessage(result.reason, 5000);
                } else if (result.ignored?.length) {
                    console.warn("Huesos que este modelo no tiene:", result.ignored);
                }
                break;
            }
            case "stop":
                gestures.stopAnimation();
                break;
            case "reload":
                loadCustomAnimations();
                break;
            default:
                console.warn("Acción de animación desconocida:", payload.action);
        }
        sendStatus();
    });

    // Música y videos: { action: "play", videoId, title } | { action: "search", query, url } | { action: "stop" }
    communication.on(MESSAGE_TYPES.MEDIA, (msg) => {
        const payload = msg.payload;
        let ok = true;
        if (payload.action === "play") ok = media.play(payload);
        else if (payload.action === "search") ok = media.search(payload);
        else if (payload.action === "stop") media.stop();
        if (!ok) showMessage("No pude abrir el reproductor.", 4000);
    });

    communication.onConnectionChange((connected) => {
        setConnection(connected);

        if (connected) {
            showMessage("Conexión con ARIA BRAIN establecida");
        }
    });
}

// ======================================
// VOZ
// ======================================

function initializeVoice() {
    voice = new VoiceController({
        onListeningChange(wanted) {
            listenButton.textContent = wanted
                ? (CONFIG.wakeWord?.enabled ? "Escuchar: ON (di «Aria»)" : "Escuchar: ON")
                : "Escuchar: OFF";

            listenButton.setAttribute("aria-pressed", String(wanted));
            gestures?.setListening(wanted && !voice?.isSpeaking);

            if (wanted) setState(STATES.LISTENING);
            else setState(STATES.IDLE);
        },

        onTranscript(text) {
            if (!communication) return;

            showMessage(`Tú: ${text}`);
            communication.send(MESSAGE_TYPES.USER_MESSAGE, { text });
            setState(STATES.THINKING);

            // Mientras piensa, refleja un poco lo que sintió en lo que le dijeron.
            const reaction = analyzeUserText(text);
            if (reaction && expressions) {
                expressions.set(reaction.expression, reaction.intensity);
                gestures?.setMood(reaction.mood, 0.7);
            }
        },

        // Dijo solo "Aria": responde y queda atenta a la orden.
        onWake() {
            gestures?.setListening(true);
            handleSay({ text: CONFIG.wakeWord?.greeting || "¿Sí? Te escucho." });
        },

        onSpeakStart() {
            expressions?.setSpeaking(true);
            gestures?.setSpeaking(true);
            setState(STATES.SPEAKING);
        },

        // Llega cuando el audio ya está listo y se conoce su duración real.
        onSpeakPlan({ durationMs }) {
            schedulePerformance(pendingPlan, durationMs);
            pendingPlan = [];
        },

        onBoundary() {
            expressions?.pulseMouth();
            gestures?.beat();
        },

        onSpeakEnd() {
            clearPerformance();
            pendingPlan = [];
            expressions?.setSpeaking(false);
            gestures?.setSpeaking(false);
            setState(restingState());
        },

        onInfo(message) {
            showMessage(message, 4000);
        },

        onStatus(message) {
            showMessage(message, 6000);
        },

        onError(message) {
            console.warn("[ARIA VOICE]", message);
            showMessage(message, 7000);
        }
    });

    const capabilities = voice.getCapabilities();
    console.log("Capacidades de voz:", capabilities);

    if (!capabilities.recognition) {
        listenButton.disabled = true;
        listenButton.textContent = "Micrófono no disponible";
    }
}

// ======================================
// INICIALIZACIÓN
// ======================================

function applyRestPose(vrm, armSign) {
    const humanoid = vrm?.humanoid;
    const angle = CONFIG.gestures.armDownAngle * armSign;
    const set = (name, z) => humanoid?.getNormalizedBoneNode?.(name)?.rotation.set(0, 0, z);
    set("leftUpperArm", -angle);
    set("rightUpperArm", angle);
    vrm.update?.(0);
}

// Ejecuta un paso que no es vital: si falla, muestra el motivo exacto y ARIA sigue funcionando.
function safeStep(name, fn) {
    try {
        return fn();
    } catch (error) {
        showFatal(`Falló ${name}: ${describeError(error)}`);
        return null;
    }
}

async function initializeARIA() {
    setConnection(false);
    setState(STATES.THINKING);
    showMessage(`Inicializando ARIA HOLOGRAM (${BUILD})...`);

    try {
        // 1. Crear escena
        avatar = new AvatarScene(canvas);

        // 2. Cargar modelo VRM
        const model = await avatar.loadVRM(CONFIG.vrmPath, (progress) => {
            showMessage(`Cargando ARIA: ${Math.round(progress * 100)}%`);
        });

        console.log("Avatar cargado:", {
            name: model.name,
            height: model.height
        });

        // 3. Crear controladores del avatar
        expressions = new ExpressionController(model.vrm);
        gestures = new GestureController(model.vrm);

        // Red de seguridad: brazos abajo desde el primer cuadro, pase lo que pase después.
        safeStep("la pose de reposo", () => applyRestPose(model.vrm, gestures.armSign));

        // Datos del modelo en pantalla, para diagnosticar problemas de pose.
        const armBones = gestures.getCapabilities().bones;
        showMessage(
            `Modelo VRM ${model.vrm.meta?.metaVersion ?? "?"} · brazos: ${armBones.leftUpperArm && armBones.rightUpperArm ? "ok" : "NO ENCONTRADOS"} (orientación ${gestures.armSign})`,
            9000
        );

        console.log("Expresiones:", expressions.getCapabilities());
        console.log("Gestos:", gestures.getCapabilities());

        // El bucle de dibujo arranca ya: así ARIA siempre baja los brazos (pose de reposo)
        // y se ve, aunque algo falle más adelante en la voz o en la conexión con el cerebro.
        startAnimation();

        loadCustomAnimations();
        gestures.onAnimationEvent = (event) => {
            if (event.type === "expression") {
                const result = expressions?.set(event.name, event.intensity);
                if (result?.ok) gestures.setMood(result.name, 0.8);
            } else if (event.type === "end") {
                if (event.hadExpressions) scheduleRest(1200);
                sendStatus();
            }
        };

        // 4. Crear sistema de voz
        safeStep("la voz", () => initializeVoice());

        // 5. Crear comunicación con el cerebro
        safeStep("la conexión con el cerebro", () => {
            communication = new Communication();
            registerCommunication();

            const transportInfo = communication.start();
            console.log("Transportes:", transportInfo);

            transportInfo.warnings.forEach((warning) => {
                console.warn(warning);
                showMessage(warning, 7000);
            });
        });

        // 6. Avisar que el holograma está preparado
        safeStep("el aviso al cerebro", () => {
            communication?.send(MESSAGE_TYPES.HOLOGRAM_READY, {
                name: model.name,
                height: model.height,
                expressions: expressions.getCapabilities(),
                gestures: gestures.getCapabilities(),
                voice: voice?.getCapabilities() ?? null
            });
        });

        // 7. Informar capacidades al usuario
        setState(STATES.IDLE);
        showMessage("¡Hola! Soy ARIA. Estoy lista.");
        gestures.play("wave");

        // Latido: el editor (y el cerebro) saben que el holograma está vivo.
        statusTimer = setInterval(sendStatus, CONFIG.statusIntervalMs);
        sendStatus();

    } catch (error) {
        console.error("Error inicializando ARIA:", error);
        setState(STATES.ERROR);
        showFatal(`No pude iniciar: ${describeError(error)}`);
    }
}

// ======================================
// ANIMACIÓN
// ======================================

const reportedLoopErrors = new Set();

// Cada parte del bucle va protegida: si una falla, las demás siguen y el error se muestra una sola vez.
function guard(name, fn) {
    try {
        fn();
    } catch (error) {
        if (reportedLoopErrors.has(name)) return;
        reportedLoopErrors.add(name);
        showFatal(`Falló ${name}: ${describeError(error)}`);
    }
}

function startAnimation() {
    if (animationStarted) return;
    animationStarted = true;

    function animate() {
        requestAnimationFrame(animate);

        const dt = Math.min(clock.getDelta(), 0.05);

        // Los controladores actualizan sus objetivos.
        guard("las expresiones", () => expressions?.update(dt));
        guard("los gestos", () => gestures?.update(dt));

        // AvatarScene actualiza VRM y efectos.
        if (avatar) {
            guard("el avatar (update)", () => avatar.update(dt));
            guard("el avatar (render)", () => avatar.render());
        }
    }

    animate();
}

// ======================================
// BOTONES
// ======================================

listenButton.addEventListener("click", () => {
    if (!voice) {
        showMessage("La voz todavía no está preparada.");
        return;
    }

    const enabled = voice.toggle();

    if (enabled) {
        showMessage(CONFIG.wakeWord?.enabled ? "Estoy atenta. Di «Aria» para hablarme." : "Te estoy escuchando...");
    } else {
        showMessage("Escucha pausada.");
    }
});

fullscreenButton.addEventListener("click", async () => {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        console.warn("Pantalla completa:", error);
        showMessage("No se pudo activar pantalla completa.");
    }
});

// ======================================
// INICIAR
// ======================================

initializeARIA();

// Limpieza al cerrar la página.
window.addEventListener("beforeunload", () => {
    clearPerformance();
    clearTimeout(restTimer);
    clearTimeout(thinkingTimer);
    clearTimeout(happyTimer);
    clearInterval(statusTimer);
    communication?.stop();
    voice?.stop();
    voice?.cancelSpeech();
});
