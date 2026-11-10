// ARIA HOLOGRAM · config.js
// Configuración central, constantes del protocolo y utilidades matemáticas.

export const CONFIG = Object.freeze({
  vrmPath: './aria.vrm',
  channelName: 'aria-hologram',
  // Dónde se guardan las animaciones propias hechas en el editor (el editor y el holograma comparten origen).
  animationsStorageKey: 'aria.animations',
  language: 'es-AR',

  // Voz vocaloid de ARIA (js/vocaloid.js)
   vocaloid: Object.freeze({
    baseHz: 525,
    formantShift: 1.24,
    speed: 0.9,
    tune: true,
    vibrato: 0.4,
    breath: 0.18,
    brightness: 0.65,
    chorus: 0,
    reverb: 0.03,
  }),

  brainTimeoutMs: 9000,
  statusIntervalMs: 3000,
  happyDurationMs: 4000,
  // La IA generativa del navegador puede tardar en contestar.
  thinkingTimeoutMs: 90000,
  messageDurationMs: 5000,

  render: Object.freeze({
    maxPixelRatio: 1.5,
    particleCount: 120,
  }),

  colors: Object.freeze({ violet: 0x9b6bff, cyan: 0x22e6ff }),

  camera: Object.freeze({
    fov: 30,
    margin: 1.12,
    assumedWidthRatio: 0.55,
  }),

  gestures: Object.freeze({
    armDownAngle: 1.2,
    // 'auto' detecta si el modelo es VRM 0.x o 1.0. Poné 1 o -1 solo para forzarlo a mano.
    armSign: 'auto',
    // Si al hablar los brazos van hacia atrás en lugar de hacia adelante, cambialo a -1.
    forwardSign: 'auto',
  }),

  // Cuánto se mueve el cuerpo en general: 0 = casi quieta, 1 = natural, 1.5 = muy expresiva.
  motion: Object.freeze({ amount: 1 }),

  voice: Object.freeze({ rate: 1.0, pitch: 1.0 }),

  // Reconocimiento de voz de respaldo (Vosk, WebAssembly). Se usa cuando el navegador no trae
  // SpeechRecognition (Firefox, Safari) o cuando el servicio de voz de Chrome falla.
  // El modelo se busca primero en este mismo sitio y, si no está, en la demo pública de vosk-browser.
  offlineSTT: Object.freeze({
    enabled: true,
    preferOffline: false,
    scriptUrl: 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js',
    modelUrls: Object.freeze([
      './models/vosk-model-small-es-0.42.tar.gz',
      'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-es-0.42.tar.gz',
    ]),
  }),

  // Preparado para futura conexión Windows ↔ Android. Desactivado por ahora.
  websocket: Object.freeze({ enabled: false, url: 'ws://localhost:8787', reconnectMs: 3000 }),
});

export const MESSAGE_TYPES = Object.freeze({
  SAY: 'SAY',
  EXPRESSION: 'EXPRESSION',
  GESTURE: 'GESTURE',
  STATE: 'STATE',
  POSE: 'POSE',
  ANIMATION: 'ANIMATION',
  MEDIA: 'MEDIA',
  USER_MESSAGE: 'USER_MESSAGE',
  HOLOGRAM_READY: 'HOLOGRAM_READY',
  HOLOGRAM_STATUS: 'HOLOGRAM_STATUS',
});

export const INBOUND_TYPES = Object.freeze([
  MESSAGE_TYPES.SAY,
  MESSAGE_TYPES.EXPRESSION,
  MESSAGE_TYPES.GESTURE,
  MESSAGE_TYPES.STATE,
  MESSAGE_TYPES.POSE,
  MESSAGE_TYPES.ANIMATION,
  MESSAGE_TYPES.MEDIA,
]);

export const OUTBOUND_TYPES = Object.freeze([
  MESSAGE_TYPES.USER_MESSAGE,
  MESSAGE_TYPES.HOLOGRAM_READY,
  MESSAGE_TYPES.HOLOGRAM_STATUS,
]);

export const STATES = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  HAPPY: 'HAPPY',
  ERROR: 'ERROR',
});

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));