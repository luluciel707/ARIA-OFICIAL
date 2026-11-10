// ARIA HOLOGRAM · gestures.js
// Movimientos procedurales sobre los huesos normalizados del VRM (sin archivos de animación).
//
// Capas, de abajo arriba:
//   1. Pose de reposo (brazos bajados, codos apenas flexionados).
//   2. Respiración, balanceo de peso entre las caderas y micro-movimientos de brazos y manos.
//   3. Postura según el ánimo (alegre, triste, sorprendida, pensativa...), con transición suave.
//   4. Al hablar: cabeceo, énfasis por sílaba y gesticulación con manos y brazos.
//   5. Al escuchar: cabeza ladeada, leve inclinación hacia adelante y asentimientos suaves.
//   6. Mirada: cabeza y ojos que vagan sin quedarse fijos, más movimientos rápidos de ojos.
//   7. Gesto puntual (saludo, asentir, negar, encogerse, pensar...). Si hay uno en curso, se encola.
//   8. Pose manual y animaciones propias (editor de poses): pisan los huesos que controlan y
//      dejan el resto con su movimiento natural. Las rotaciones se dan en GRADOS, relativas al reposo.
//
// Convención de direcciones (desde el punto de vista de quien mira la pantalla):
//   left = izquierda de la pantalla, right = derecha, up = arriba, down = abajo.
//
// Los signos de rotación dependen del modelo:
//   - si en reposo los brazos suben en lugar de bajar: CONFIG.gestures.armSign = -1
//   - si al hablar los brazos van hacia atrás en lugar de adelante: CONFIG.gestures.forwardSign = -1

import * as THREE from 'three';
import { CONFIG, clamp, damp } from './config.js';

const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm',
  'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg',
];

const GESTURE_ALIASES = {
  wave: 'wave', saludar: 'wave', saludo: 'wave',
  nod: 'nod', asentir: 'nod',
  shake: 'shake', negar: 'shake',
  shrug: 'shrug', encogerse: 'shrug', encoger: 'shrug',
  think: 'think', pensar: 'think', pensando: 'think',
  bow: 'bow', reverencia: 'bow', agradecer: 'bow', inclinar: 'bow',
  cheer: 'cheer', celebrar: 'cheer', festejar: 'cheer', emocion: 'cheer',
  tilt: 'tilt', ladear: 'tilt', curiosa: 'tilt',
  look: 'look', mirar: 'look',
};

const DIRECTIONS = {
  left: { yaw: -0.5, pitch: 0 }, izquierda: { yaw: -0.5, pitch: 0 },
  right: { yaw: 0.5, pitch: 0 }, derecha: { yaw: 0.5, pitch: 0 },
  up: { yaw: 0, pitch: -0.3 }, arriba: { yaw: 0, pitch: -0.3 },
  down: { yaw: 0, pitch: 0.3 }, abajo: { yaw: 0, pitch: 0.3 },
  center: { yaw: 0, pitch: 0 }, centro: { yaw: 0, pitch: 0 },
};

const ARM = CONFIG.gestures.armDownAngle;
const ELBOW_REST = 0.14;

// Orientación de los brazos. Los VRM 0.x y 1.0 usan ejes opuestos (miran a -Z y +Z), así que el
// signo se detecta solo al cargar el modelo (ver el constructor). En config.js, armSign y
// forwardSign valen 'auto' por defecto; poné 1 o -1 solo si querés forzarlos a mano.
let SIGN = 1;
let FWD = 1;

const IDLE_POSE = {
  leftUpperArm: [0, 0, 0],
  rightUpperArm: [0, 0, 0],
  leftLowerArm: [0, 0, 0],
  rightLowerArm: [0, 0, 0],
};

function setArmOrientation(sign, forward) {
  SIGN = sign;
  FWD = forward;
  IDLE_POSE.leftUpperArm = [0, 0, -ARM * SIGN];
  IDLE_POSE.rightUpperArm = [0, 0, ARM * SIGN];
  IDLE_POSE.leftLowerArm = [0, -FWD * ELBOW_REST, 0];
  IDLE_POSE.rightLowerArm = [0, FWD * ELBOW_REST, 0];
}
setArmOrientation(1, 1);

// Posturas por ánimo. Todos los valores son en radianes salvo energy y sway (multiplicadores).
//   energy: cuánto gesticula al hablar     headPitch: + baja la cabeza, - la sube
//   lean: + inclina el torso hacia adelante   shoulders: + sube los hombros
//   tilt: ladeo de cabeza                   sway: velocidad del balanceo
//   bounce: rebote alegre del torso         armOpen: separa un poco los brazos del cuerpo
const MOODS = {
  neutral:   { energy: 1.0,  headPitch: 0,     lean: 0,     shoulders: 0,     tilt: 0,    sway: 1.0,  bounce: 0,     armOpen: 0 },
  happy:     { energy: 1.35, headPitch: -0.05, lean: -0.02, shoulders: 0.03,  tilt: 0.04, sway: 1.35, bounce: 0.012, armOpen: 0.07 },
  sad:       { energy: 0.5,  headPitch: 0.14,  lean: 0.06,  shoulders: -0.05, tilt: 0.03, sway: 0.6,  bounce: 0,     armOpen: -0.03 },
  surprised: { energy: 1.15, headPitch: -0.06, lean: -0.06, shoulders: 0.07,  tilt: 0,    sway: 1.0,  bounce: 0,     armOpen: 0.16 },
  angry:     { energy: 1.25, headPitch: 0.04,  lean: 0.04,  shoulders: 0.04,  tilt: 0,    sway: 0.9,  bounce: 0,     armOpen: 0.04 },
  thinking:  { energy: 0.7,  headPitch: 0.02,  lean: 0.015, shoulders: 0,     tilt: 0.1,  sway: 0.8,  bounce: 0,     armOpen: 0 },
  confused:  { energy: 0.85, headPitch: -0.02, lean: 0,     shoulders: 0.02,  tilt: 0.13, sway: 0.9,  bounce: 0,     armOpen: 0.05 },
  concerned: { energy: 0.7,  headPitch: 0.05,  lean: 0.035, shoulders: 0,     tilt: 0.08, sway: 0.8,  bounce: 0,     armOpen: 0 },
};

const smooth = (x) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const RAD = Math.PI / 180;
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)));
const toRad = (v) => v.map((n) => clamp(Number(n) * RAD, -2 * Math.PI, 2 * Math.PI));

// Valor de un hueso en el instante c de una animación. Devuelve { v, w } o null si no lo controla.
// Antes del primer keyframe y después del último hay un fundido de `fade` segundos (w: 0 → 1 → 0).
function sampleTrack(track, c, fade, ease) {
  const first = track[0];
  const last = track[track.length - 1];
  if (c < first.t - fade || c > last.t + fade) return null;
  if (c < first.t) return { v: first.v, w: smooth((c - (first.t - fade)) / fade) };
  if (c > last.t) return { v: last.v, w: smooth(1 - (c - last.t) / fade) };
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (c >= a.t && c <= b.t) {
      const span = b.t - a.t;
      let p = span > 0 ? (c - a.t) / span : 1;
      if (ease !== 'linear') p = smooth(p);
      return { v: [a.v[0] + (b.v[0] - a.v[0]) * p, a.v[1] + (b.v[1] - a.v[1]) * p, a.v[2] + (b.v[2] - a.v[2]) * p], w: 1 };
    }
  }
  return { v: last.v, w: 1 };
}

const merge = (...parts) => {
  const out = {};
  for (const part of parts) {
    for (const [bone, [x, y, z]] of Object.entries(part)) {
      const o = out[bone] || (out[bone] = [0, 0, 0]);
      o[0] += x; o[1] += y; o[2] += z;
    }
  }
  return out;
};

// Offsets para un brazo entero. side: 'left' | 'right'.
//   lift: separa el brazo del cuerpo   forward: lo lleva hacia adelante
//   elbow: flexiona el codo hacia adelante   wrist: mueve la mano
function arm(side, { lift = 0, forward = 0, elbow = 0, wrist = 0 } = {}) {
  const s = side === 'right' ? 1 : -1;
  return {
    [`${side}UpperArm`]: [-FWD * forward, 0, -s * SIGN * lift],
    [`${side}LowerArm`]: [0, s * FWD * elbow, 0],
    [`${side}Hand`]: [0.5 * wrist, 0, -s * 0.4 * wrist],
  };
}

// fn(p, t, env) → { hueso: [x, y, z] } que se SUMA a la pose base.
//   p = progreso 0..1, t = segundos desde el inicio, env = envolvente suave 0..1.
const GESTURES = {
  wave: {
    duration: 2.8,
    needs: ['rightUpperArm', 'rightLowerArm'],
    usesArms: true,
    fn: (p, t, env) => ({
      rightUpperArm: [0, 0, -(ARM + 0.65) * SIGN * env],
      rightLowerArm: [0, 0, -SIGN * (1.0 + 0.35 * Math.sin(t * 11)) * env],
      head: [0, 0, 0.05 * env],
    }),
  },
  nod: {
    duration: 1.2,
    needs: ['head'],
    fn: (p) => {
      const v = 0.22 * (0.5 - 0.5 * Math.cos(p * 4 * Math.PI)); // dos cabeceos hacia abajo
      return { head: [v, 0, 0], neck: [v * 0.4, 0, 0] };
    },
  },
  softnod: { // asentimiento discreto para cuando escucha
    duration: 1.0,
    needs: ['head'],
    fn: (p) => {
      const v = 0.09 * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI));
      return { head: [v, 0, 0], neck: [v * 0.4, 0, 0] };
    },
  },
  shake: {
    duration: 1.5,
    needs: ['head'],
    fn: (p, t, env) => {
      const s = Math.sin(p * 4 * Math.PI) * env;
      return { head: [0, 0.38 * s, 0], neck: [0, 0.15 * s, 0] };
    },
  },
  shrug: {
    duration: 1.7,
    needs: ['head'],
    usesArms: true,
    fn: (p, t, env) => {
      const open = { lift: 0.22 * env, forward: 0.12 * env, elbow: 0.7 * env, wrist: 0.4 * env };
      return merge(
        {
          head: [0, 0, 0.1 * env],
          neck: [0, 0, 0.04 * env],
          leftShoulder: [0, 0, SIGN * 0.14 * env],
          rightShoulder: [0, 0, -SIGN * 0.14 * env],
        },
        arm('left', open),
        arm('right', open),
      );
    },
  },
  think: {
    duration: 3.2,
    needs: ['head', 'rightUpperArm', 'rightLowerArm'],
    usesArms: true,
    fn: (p, t, env) => merge(
      { head: [0.04 * env, -0.08 * env, 0.1 * env], neck: [0, -0.03 * env, 0.03 * env] },
      arm('right', { lift: 0.5 * env, forward: 1.0 * env, elbow: 1.7 * env, wrist: 0.2 * env }),
    ),
  },
  bow: {
    duration: 2.0,
    needs: ['spine', 'head'],
    fn: (p, t, env) => ({
      spine: [0.16 * env, 0, 0],
      chest: [0.1 * env, 0, 0],
      head: [0.14 * env, 0, 0],
    }),
  },
  cheer: {
    duration: 2.4,
    needs: ['leftUpperArm', 'rightUpperArm'],
    usesArms: true,
    fn: (p, t, env) => {
      const b = Math.sin(t * 10);
      return merge(
        arm('left', { lift: 0.8 * env, forward: 0.2 * env, elbow: (0.9 + 0.15 * b) * env, wrist: 0.2 * b * env }),
        arm('right', { lift: 0.8 * env, forward: 0.2 * env, elbow: (0.9 + 0.15 * Math.sin(t * 10 + 1)) * env, wrist: 0.2 * b * env }),
        { head: [-0.06 * env, 0, 0], chest: [(-0.03 + 0.01 * b) * env, 0, 0] },
      );
    },
  },
  tilt: {
    duration: 2.2,
    needs: ['head'],
    fn: (p, t, env) => ({
      head: [-0.02 * env, 0, 0.17 * env],
      neck: [0, 0, 0.05 * env],
    }),
  },
};

export class GestureController {
  constructor(vrm) {
    this.vrm = vrm;
    this.humanoid = vrm.humanoid || null;

    this.bones = {};
    for (const name of BONES) {
      const node = this.humanoid && this.humanoid.getNormalizedBoneNode
        ? this.humanoid.getNormalizedBoneNode(name)
        : null;
      if (node) this.bones[name] = node;
    }

    // Hacia qué lado (en los ejes del modelo) está el brazo izquierdo: +X en VRM 1.0, -X en VRM 0.x.
    const elbowX = this.bones.leftLowerArm ? this.bones.leftLowerArm.position.x : 1;
    this.autoSide = elbowX < 0 ? -1 : 1;
    const manual = (v) => (v === 1 || v === -1 ? v : null);
    this.armSign = manual(CONFIG.gestures.armSign) ?? this.autoSide;
    this.forwardSign = manual(CONFIG.gestures.forwardSign) ?? this.autoSide;
    setArmOrientation(this.armSign, this.forwardSign);

    this.motion = clamp(Number(CONFIG.motion?.amount ?? 1), 0, 2);
    this.t = 0;
    this.phase = Math.random() * 100; // para que cada sesión se mueva distinto
    this.active = null;
    this.queue = [];

    // Mirada
    this.lookPos = { yaw: 0, pitch: 0 };
    this.lookGoal = { yaw: 0, pitch: 0 };
    this._lookTimer = null;
    this.tilt = 0;
    this.tiltGoal = 0;
    this.wander = { yaw: 0, pitch: 0 };
    this.wanderGoal = { yaw: 0, pitch: 0 };
    this.wanderScale = 1;
    this.nextWander = 2;
    this.eye = { yaw: 0, pitch: 0 };
    this.eyeGoal = { yaw: 0, pitch: 0 };
    this.nextEye = 1;

    // Ánimo
    this.mood = { ...MOODS.neutral };
    this.moodGoal = { ...MOODS.neutral };

    // Habla
    this.speaking = false;
    this.speakAmt = 0;
    this.beatValue = 0;
    this._syll = 0;
    this.phrases = { left: null, right: null };
    this.nextPhrase = 0.5;
    this.armBlend = 1;

    // Escucha
    this.listening = false;
    this.listenAmt = 0;
    this.nextNod = 5;

    // Pose manual (editor) y animaciones propias
    this.live = {};               // hueso -> { cur, goal, w, wGoal }
    this.anim = null;             // animación en reproducción
    this.custom = new Map();      // nombre -> definición guardada
    this.onAnimationEvent = null; // main.js: ({ type: 'expression' | 'end', ... })

    // Objetivo para los ojos (solo si el VRM tiene lookAt)
    this.eyeTarget = new THREE.Object3D();
    this._tmp = new THREE.Vector3();
    this.hasLookAt = Boolean(vrm.lookAt);
    if (this.hasLookAt) vrm.lookAt.target = this.eyeTarget;
  }

  getCapabilities() {
    const bones = {};
    for (const name of BONES) bones[name] = Boolean(this.bones[name]);
    const gestures = {};
    for (const [name, def] of Object.entries(GESTURES)) {
      if (name === 'softnod') continue; // interno
      gestures[name] = def.needs.every((b) => this.bones[b]);
    }
    gestures.look = Boolean(this.bones.head);
    return { bones, gestures, moods: Object.keys(MOODS), custom: this.getCustomNames(), eyes: this.hasLookAt };
  }

  // Devuelve { ok, ... }. opts: { direction, holdMs } para "look".
  play(rawName, opts = {}) {
    const name = GESTURE_ALIASES[String(rawName).toLowerCase()];
    if (!name) {
      const custom = this.custom.get(this._key(rawName));
      if (custom) return this.playAnimation(custom, this._key(rawName));
      return { ok: false, reason: `Gesto desconocido: "${rawName}".` };
    }
    if (name === 'look') return this.lookAt(opts.direction, opts.holdMs);

    const def = GESTURES[name];
    const missing = def.needs.filter((b) => !this.bones[b]);
    if (missing.length) {
      return { ok: false, reason: `Este VRM no tiene los huesos necesarios para "${name}": ${missing.join(', ')}.` };
    }

    if (this.active) {
      if (this.queue.length >= 3) return { ok: false, reason: 'Cola de gestos llena.' };
      this.queue.push(name);
      return { ok: true, queued: true };
    }
    this.active = this._start(name);
    return { ok: true };
  }

  // holdMs: milisegundos antes de volver al centro. null/0 = mantener hasta nueva orden.
  lookAt(direction, holdMs = 1800) {
    const d = DIRECTIONS[String(direction === undefined ? 'center' : direction).toLowerCase()];
    if (!d) return { ok: false, reason: `Dirección desconocida: "${direction}".` };
    if (!this.bones.head) return { ok: false, reason: 'Este VRM no tiene hueso "head".' };

    this.lookGoal = { yaw: d.yaw, pitch: d.pitch };
    clearTimeout(this._lookTimer);
    if (holdMs && (d.yaw !== 0 || d.pitch !== 0)) {
      this._lookTimer = setTimeout(() => { this.lookGoal = { yaw: 0, pitch: 0 }; }, holdMs);
    }
    return { ok: true };
  }

  setHeadTilt(radians) { this.tiltGoal = radians; }

  // Cambia la postura de fondo. name: neutral, happy, sad, surprised, angry, thinking, confused, concerned.
  setMood(name, intensity = 1) {
    const base = MOODS.neutral;
    const target = MOODS[name] || base;
    const k = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1, 0, 1);
    for (const key of Object.keys(base)) this.moodGoal[key] = base[key] + (target[key] - base[key]) * k;
  }

  setSpeaking(on) {
    this.speaking = Boolean(on);
    if (this.speaking) {
      this._syll = 0;
      this.nextPhrase = 0.3 + Math.random() * 0.5;
    }
  }

  // Se llama en cada sílaba: de vez en cuando marca un énfasis con cabeza y torso.
  beat(strength = 1) {
    if (!this.speaking) return;
    this._syll++;
    if (this._syll % 3 === 0) this.beatValue = Math.min(1.2, this.beatValue + 0.6 * strength);
  }

  setListening(on) {
    this.listening = Boolean(on);
    if (this.listening) this.nextNod = 3 + Math.random() * 3;
  }

  // ---------------------------------------------------------------------------
  // Pose manual y animaciones propias (las usa el editor de poses)
  // ---------------------------------------------------------------------------

  _key(name) { return String(name).trim().toLowerCase(); }

  // bones: { hueso: [x, y, z] } en GRADOS, relativos a la pose de reposo (0 = reposo).
  // Los huesos que aparecen quedan controlados; los demás siguen con su movimiento natural.
  setPose(bones = {}, { degrees = true } = {}) {
    const wanted = new Set();
    for (const [bone, v] of Object.entries(bones || {})) {
      if (!this.bones[bone] || !isVec3(v)) continue;
      const goal = degrees ? toRad(v) : v.map(Number);
      const st = this.live[bone];
      if (st) { st.goal = goal; st.wGoal = 1; } else this.live[bone] = { cur: goal.slice(), goal, w: 0, wGoal: 1 };
      wanted.add(bone);
    }
    for (const [bone, st] of Object.entries(this.live)) if (!wanted.has(bone)) st.wGoal = 0;
    return { ok: true, controlled: [...wanted] };
  }

  releasePose() {
    for (const st of Object.values(this.live)) st.wGoal = 0;
  }

  // library: { nombre: definición }. Reemplaza las animaciones propias registradas.
  setCustomAnimations(library = {}) {
    this.custom.clear();
    for (const [name, def] of Object.entries(library || {})) {
      if (def && Array.isArray(def.keyframes)) this.custom.set(this._key(name), def);
    }
    return this.custom.size;
  }

  getCustomNames() { return [...this.custom.keys()]; }

  isAnimating() { return Boolean(this.anim); }

  // def: { loop, ease: 'smooth'|'linear', fade, speed, keyframes: [{ t, pose: {hueso:[x,y,z]}, expression: {name, intensity} }] }
  // Las rotaciones van en grados y t en segundos.
  playAnimation(def, name = 'animación') {
    const compiled = this._compile(def);
    if (!compiled.ok) return compiled;
    this.anim = { ...compiled.value, name, clock: -compiled.value.fade, nextEvent: 0, master: 1, stopping: false };
    return { ok: true, name, duration: compiled.value.duration, ignored: compiled.value.ignored };
  }

  stopAnimation() {
    if (this.anim) this.anim.stopping = true; // se apaga con un fundido corto
  }

  _compile(def) {
    if (!def || typeof def !== 'object' || !Array.isArray(def.keyframes) || !def.keyframes.length) {
      return { ok: false, reason: 'La animación no tiene keyframes.' };
    }
    const frames = def.keyframes.slice(0, 200)
      .map((f) => ({ t: Number(f?.t), pose: f?.pose && typeof f.pose === 'object' ? f.pose : {}, expression: f?.expression }))
      .filter((f) => Number.isFinite(f.t) && f.t >= 0 && f.t <= 600)
      .sort((a, b) => a.t - b.t);
    if (!frames.length) return { ok: false, reason: 'Los keyframes no tienen tiempos válidos.' };

    const tracks = {};
    const ignored = new Set();
    for (const f of frames) {
      for (const [bone, v] of Object.entries(f.pose)) {
        if (!this.bones[bone]) { ignored.add(bone); continue; }
        if (!isVec3(v)) continue;
        (tracks[bone] || (tracks[bone] = [])).push({ t: f.t, v: toRad(v) });
      }
    }
    const events = frames
      .filter((f) => f.expression && typeof f.expression.name === 'string')
      .map((f) => ({ t: f.t, name: f.expression.name, intensity: Number(f.expression.intensity ?? 1) }));

    return {
      ok: true,
      value: {
        tracks,
        events,
        duration: Math.max(0.1, frames[frames.length - 1].t),
        fade: clamp(Number(def.fade ?? 0.35), 0.05, 2),
        loop: Boolean(def.loop),
        speed: clamp(Number(def.speed ?? 1), 0.1, 4),
        ease: def.ease === 'linear' ? 'linear' : 'smooth',
        ignored: [...ignored],
      },
    };
  }

  _advanceAnimation(dt) {
    const a = this.anim;
    if (!a) return;
    if (a.stopping) {
      a.master = damp(a.master, 0, 8, dt);
      if (a.master < 0.01) this._endAnimation();
      return;
    }
    a.clock += dt * a.speed;
    while (a.nextEvent < a.events.length && a.events[a.nextEvent].t <= a.clock) {
      const ev = a.events[a.nextEvent++];
      this.onAnimationEvent?.({ type: 'expression', name: ev.name, intensity: ev.intensity });
    }
    if (a.clock >= a.duration) {
      if (a.loop) { a.clock -= a.duration; a.nextEvent = 0; }
      else if (a.clock > a.duration + a.fade) this._endAnimation();
    }
  }

  _endAnimation() {
    const a = this.anim;
    this.anim = null;
    if (a) this.onAnimationEvent?.({ type: 'end', name: a.name, hadExpressions: a.events.length > 0 });
  }

  // Une la pose manual en vivo y la animación: { hueso: { v: [x,y,z], w: 0..1 } }. La animación manda.
  _collectOverrides(dt) {
    const over = {};
    for (const [bone, st] of Object.entries(this.live)) {
      for (let i = 0; i < 3; i++) st.cur[i] = damp(st.cur[i], st.goal[i], 18, dt);
      st.w = damp(st.w, st.wGoal, 8, dt);
      if (st.wGoal === 0 && st.w < 0.002) { delete this.live[bone]; continue; }
      over[bone] = { v: st.cur, w: st.w };
    }
    const a = this.anim;
    if (a) {
      for (const [bone, track] of Object.entries(a.tracks)) {
        const s = sampleTrack(track, a.clock, a.fade, a.ease);
        if (s) over[bone] = { v: s.v, w: s.w * a.master };
      }
    }
    return over;
  }

  _start(name) { return { name, def: GESTURES[name], elapsed: 0 }; }

  _startPhrase() {
    const energy = clamp(this.mood.energy, 0.3, 1.6) * this.motion;
    const roll = Math.random();
    let sides;
    if (roll < 0.45) sides = ['right'];
    else if (roll < 0.65) sides = ['left'];
    else if (roll < 0.65 + 0.2 * energy) sides = ['left', 'right'];
    else sides = []; // a veces descansa las manos

    const dur = 1.0 + Math.random() * 1.2;
    for (const side of sides) {
      if (this.phrases[side]) continue;
      this.phrases[side] = {
        elapsed: 0,
        dur,
        lift: (0.18 + Math.random() * 0.3) * energy,
        forward: (0.25 + Math.random() * 0.35) * energy,
        elbow: (0.6 + Math.random() * 0.6) * Math.min(energy, 1.2),
        wrist: 0.2 + Math.random() * 0.3,
        seed: Math.random() * 10,
      };
    }
    this.nextPhrase = dur * 0.8 + 0.4 + Math.random() * (1.8 / Math.max(energy, 0.4));
  }

  update(dt) {
    this.t += dt;
    const t = this.t + this.phase;
    const A = this.motion;
    const mood = this.mood;

    // Transiciones suaves de ánimo, habla, escucha y brazos
    for (const key of Object.keys(mood)) mood[key] = damp(mood[key], this.moodGoal[key], 2.5, dt);
    this.speakAmt = damp(this.speakAmt, this.speaking ? 1 : 0, 4, dt);
    this.listenAmt = damp(this.listenAmt, this.listening && !this.speaking ? 1 : 0, 3, dt);
    this.beatValue = damp(this.beatValue, 0, 7, dt);
    const armBusy = Boolean(this.active && this.active.def.usesArms);
    this.armBlend = damp(this.armBlend, armBusy ? 0 : 1, 6, dt);

    const acc = {};
    const add = (bone, x, y, z) => {
      const a = acc[bone] || (acc[bone] = [0, 0, 0]);
      a[0] += x; a[1] += y; a[2] += z;
    };
    const addAll = (offsets) => {
      for (const [bone, [x, y, z]] of Object.entries(offsets)) add(bone, x, y, z);
    };

    // 1. Pose de reposo
    addAll(IDLE_POSE);

    // 2. Respiración
    const breath = Math.sin((t * 2 * Math.PI) / 4.2);
    add('chest', 0.012 * breath, 0, 0);
    add('upperChest', 0.008 * breath, 0, 0);
    add('spine', 0.006 * breath, 0, 0);
    add('leftShoulder', 0, 0, SIGN * 0.012 * breath);
    add('rightShoulder', 0, 0, -SIGN * 0.012 * breath);

    // 2b. Balanceo de peso (suma de ondas lentas que no se repiten) con las piernas compensando
    const sw = mood.sway;
    const shift = 0.6 * Math.sin(t * 0.31 * sw) + 0.4 * Math.sin(t * 0.173 * sw + 1.7);
    const turn = Math.sin(t * 0.23 * sw + 0.5);
    const hipsZ = 0.028 * shift * A;
    const hipsY = 0.025 * turn * A;
    add('hips', 0, hipsY, hipsZ);
    add('leftUpperLeg', 0, -hipsY, -hipsZ); // los pies quedan apoyados
    add('rightUpperLeg', 0, -hipsY, -hipsZ);
    add('spine', 0, -hipsY * 0.5, -hipsZ * 0.6);
    add('chest', 0, -hipsY * 0.3, -hipsZ * 0.3);

    // 2c. Brazos y manos nunca quedan del todo quietos
    const drift = 0.012 * Math.sin(t * 0.7 + 1) * A;
    add('leftUpperArm', 0.02 * Math.sin(t * 0.53) * A, 0, drift);
    add('rightUpperArm', 0.02 * Math.sin(t * 0.47 + 1.3) * A, 0, -drift);
    add('leftLowerArm', 0, -0.012 * breath * A, 0);
    add('rightLowerArm', 0, 0.012 * breath * A, 0);
    add('leftHand', 0.04 * Math.sin(t * 0.9) * A, 0, 0.03 * Math.sin(t * 0.6 + 0.8) * A);
    add('rightHand', 0.04 * Math.sin(t * 0.8 + 2) * A, 0, -0.03 * Math.sin(t * 0.55 + 1.5) * A);

    // 3. Postura según el ánimo
    add('spine', mood.lean * 0.5, 0, 0);
    add('chest', mood.lean * 0.5 + mood.bounce * Math.sin(t * 3.2), 0, 0);
    add('leftShoulder', 0, 0, SIGN * mood.shoulders);
    add('rightShoulder', 0, 0, -SIGN * mood.shoulders);
    if (mood.armOpen) {
      addAll(arm('left', { lift: mood.armOpen }));
      addAll(arm('right', { lift: mood.armOpen }));
    }

    // 4. Al hablar: gesticulación con manos
    this.phrases.left = this._advancePhrase(this.phrases.left, dt);
    this.phrases.right = this._advancePhrase(this.phrases.right, dt);
    if (this.speaking && this.armBlend > 0.5 && A > 0) {
      this.nextPhrase -= dt;
      if (this.nextPhrase <= 0) this._startPhrase();
    }
    for (const side of ['left', 'right']) {
      const ph = this.phrases[side];
      if (!ph) continue;
      const p = ph.elapsed / ph.dur;
      const env = smooth(Math.min(p / 0.3, (1 - p) / 0.35, 1)) * this.armBlend;
      const wob = Math.sin(t * 6 + ph.seed);
      addAll(arm(side, {
        lift: ph.lift * env,
        forward: ph.forward * env,
        elbow: ph.elbow * env * (1 + 0.12 * wob),
        wrist: ph.wrist * env * wob,
      }));
    }

    // 5. Al escuchar: asentimientos suaves de vez en cuando
    if (this.listenAmt > 0.5 && !this.active) {
      this.nextNod -= dt;
      if (this.nextNod <= 0) {
        this.active = this._start('softnod');
        this.nextNod = 4 + Math.random() * 5;
      }
    }

    // 6. Mirada: dirección pedida + deriva natural + ojos
    this.lookPos.yaw = damp(this.lookPos.yaw, this.lookGoal.yaw, 5, dt);
    this.lookPos.pitch = damp(this.lookPos.pitch, this.lookGoal.pitch, 5, dt);
    this.tilt = damp(this.tilt, this.tiltGoal, 4, dt);

    this.nextWander -= dt;
    if (this.nextWander <= 0) {
      const calm = this.speaking ? 0.5 : 1;
      this.wanderGoal = Math.random() < 0.5
        ? { yaw: 0, pitch: 0 }
        : { yaw: (Math.random() - 0.5) * 0.45 * calm, pitch: (Math.random() - 0.5) * 0.2 * calm };
      this.nextWander = 1.8 + Math.random() * 4.2;
    }
    const lookActive = Math.abs(this.lookGoal.yaw) + Math.abs(this.lookGoal.pitch) > 0.01;
    this.wanderScale = damp(this.wanderScale, lookActive ? 0.15 : 1, 4, dt);
    this.wander.yaw = damp(this.wander.yaw, this.wanderGoal.yaw, 2.2, dt);
    this.wander.pitch = damp(this.wander.pitch, this.wanderGoal.pitch, 2.2, dt);

    this.nextEye -= dt;
    if (this.nextEye <= 0) {
      this.eyeGoal = { yaw: (Math.random() - 0.5) * 0.25, pitch: (Math.random() - 0.5) * 0.12 };
      this.nextEye = 0.5 + Math.random() * 2.2;
    }
    this.eye.yaw = damp(this.eye.yaw, this.eyeGoal.yaw, 16, dt);
    this.eye.pitch = damp(this.eye.pitch, this.eyeGoal.pitch, 16, dt);

    const yaw = this.lookPos.yaw + this.wander.yaw * this.wanderScale;
    const pitch = this.lookPos.pitch + this.wander.pitch * this.wanderScale;

    // Cabeza: movimiento base + ánimo + habla + escucha
    const sp = this.speakAmt * A;
    let headX = 0.02 * Math.sin(t * 0.51 + 2) + mood.headPitch + this.listenAmt * 0.02;
    let headY = 0.035 * Math.sin(t * 0.37) + 0.015 * Math.sin(t * 0.93 + 1);
    let headZ = 0.01 * Math.sin(t * 0.29) + this.tilt + mood.tilt + this.listenAmt * 0.07 - hipsZ * 0.4;
    headX += sp * (0.02 * Math.sin(t * 2.3) + 0.015 * Math.sin(t * 3.9 + 1)) + this.beatValue * 0.05 * A;
    headY += sp * 0.03 * Math.sin(t * 1.7);
    headZ += sp * 0.02 * Math.sin(t * 1.3);

    add('head', headX + pitch * 0.6, headY + yaw * 0.6, headZ);
    add('neck', pitch * 0.4 + this.beatValue * 0.02 * A, yaw * 0.4, 0);
    add('chest', this.beatValue * 0.012 * A, 0, 0);
    add('spine', this.listenAmt * 0.02, 0, 0);

    // 7. Gesto puntual
    if (this.active) {
      const g = this.active;
      g.elapsed += dt;
      const p = g.elapsed / g.def.duration;
      if (p >= 1) {
        const next = this.queue.shift();
        this.active = next ? this._start(next) : null;
      } else {
        const ramp = Math.min(p / 0.18, (1 - p) / 0.18, 1);
        const env = ramp * ramp * (3 - 2 * ramp);
        addAll(g.def.fn(p, g.elapsed, env));
      }
    }

    // 8. Pose manual y animaciones propias: pisan los huesos que controlan (0 = pose de reposo)
    this._advanceAnimation(dt);
    const over = this._collectOverrides(dt);

    // Aplicar a los huesos normalizados (vrm.update los traslada al esqueleto real)
    for (const [name, node] of Object.entries(this.bones)) {
      const a = acc[name] || [0, 0, 0];
      const o = over[name];
      if (o && o.w > 0.001) {
        const rest = IDLE_POSE[name] || [0, 0, 0];
        for (let i = 0; i < 3; i++) a[i] += (rest[i] + o.v[i] - a[i]) * o.w;
      }
      node.rotation.set(a[0], a[1], a[2]);
    }

    // Ojos: siguen hacia donde mira la cabeza, con pequeños saltos propios
    if (this.hasLookAt && this.bones.head) {
      this.bones.head.getWorldPosition(this._tmp);
      const eyeYaw = yaw + this.eye.yaw;
      const eyePitch = pitch + this.eye.pitch;
      this.eyeTarget.position.set(
        this._tmp.x + Math.sin(eyeYaw) * 1.5,
        this._tmp.y - Math.sin(eyePitch) * 1.5,
        this._tmp.z + Math.cos(eyeYaw) * 1.5,
      );
    }
  }

  _advancePhrase(ph, dt) {
    if (!ph) return null;
    ph.elapsed += dt;
    return ph.elapsed >= ph.dur ? null : ph;
  }
}
