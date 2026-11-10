// ARIA HOLOGRAM · expressions.js
// Expresiones faciales con los blend shapes que EXISTEN en el VRM.
//
// Honestidad sobre lo que hace cada una:
//   neutral, happy, sad, surprised, angry → presets estándar de VRM ("native").
//   thinking (pensativa) y confused (confundida) → VRM no tiene preset propio; se aproximan
//   combinando presets existentes ("approximate"). Si faltan esos presets, se informa y no se simula.
//   Parpadeo → preset "blink". Boca al hablar → preset "aa" con movimiento aproximado:
//   NO es sincronización labial real.

import { clamp, damp } from './config.js';

const ALIASES = {
  neutral: 'neutral', neutra: 'neutral',
  happy: 'happy', feliz: 'happy',
  sad: 'sad', triste: 'sad',
  surprised: 'surprised', sorprendida: 'surprised',
  thinking: 'thinking', pensativa: 'thinking',
  confused: 'confused', confundida: 'confused',
  angry: 'angry', enfadada: 'angry', enojada: 'angry',
};

// parts: { presetVRM: peso }
const DEFINITIONS = {
  neutral:   { parts: {}, approximate: false },
  happy:     { parts: { happy: 1 }, approximate: false },
  sad:       { parts: { sad: 1 }, approximate: false },
  surprised: { parts: { surprised: 1 }, approximate: false },
  angry:     { parts: { angry: 1 }, approximate: false },
  thinking:  { parts: { relaxed: 0.25, sad: 0.25 }, approximate: true },
  confused:  { parts: { surprised: 0.3, sad: 0.3 }, approximate: true },
};

const BLINK = 'blink';
const MOUTH = 'aa';

export class ExpressionController {
  constructor(vrm) {
    this.manager = vrm.expressionManager || null;
    this.available = new Set();

    const emotionNames = new Set();
    for (const def of Object.values(DEFINITIONS)) {
      for (const name of Object.keys(def.parts)) emotionNames.add(name);
    }
    for (const name of [...emotionNames, BLINK, MOUTH]) {
      if (this.manager && this.manager.getExpression(name)) this.available.add(name);
    }
    this.emotionNames = [...emotionNames].filter((n) => this.available.has(n));

    this.current = {};
    this.target = {};
    for (const n of this.emotionNames) { this.current[n] = 0; this.target[n] = 0; }

    this.active = 'neutral';
    this.time = 0;

    // Parpadeo
    this.blinkT = -1;
    this.nextBlink = 2 + Math.random() * 3;

    // Boca
    this.speaking = false;
    this.mouth = 0;
    this.pulse = 0;
  }

  _statusOf(def) {
    const needed = Object.keys(def.parts);
    if (needed.length === 0) return { status: 'native', missing: [] };
    const missing = needed.filter((n) => !this.available.has(n));
    if (missing.length === needed.length) return { status: 'unavailable', missing };
    if (missing.length > 0) return { status: 'partial', missing };
    return { status: def.approximate ? 'approximate' : 'native', missing: [] };
  }

  getCapabilities() {
    const expressions = {};
    for (const [name, def] of Object.entries(DEFINITIONS)) expressions[name] = this._statusOf(def);
    return { expressions, blink: this.available.has(BLINK), mouth: this.available.has(MOUTH) };
  }

  // Devuelve { ok, ... }. No cambia nada si la expresión no puede mostrarse.
  set(rawName, intensity = 1) {
    const name = ALIASES[String(rawName).toLowerCase()];
    if (!name) return { ok: false, reason: `Expresión desconocida: "${rawName}".` };

    const def = DEFINITIONS[name];
    const info = this._statusOf(def);
    if (info.status === 'unavailable') {
      return { ok: false, reason: `Este VRM no tiene los blend shapes para "${name}" (faltan: ${info.missing.join(', ')}).` };
    }

    const k = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1, 0, 1);
    for (const n of this.emotionNames) this.target[n] = 0;
    for (const [n, w] of Object.entries(def.parts)) {
      if (this.available.has(n)) this.target[n] = w * k;
    }
    this.active = name;
    return { ok: true, name, status: info.status };
  }

  setSpeaking(on) { this.speaking = Boolean(on); }
  pulseMouth() { this.pulse = 1; } // refuerzo cuando el navegador avisa de una palabra nueva

  update(dt) {
    if (!this.manager) return;
    this.time += dt;

    // La emoción nunca queda "congelada": respira con una variación muy pequeña.
    const life = 1 + 0.06 * Math.sin(this.time * 0.8) + 0.04 * Math.sin(this.time * 1.9 + 1);
    for (const n of this.emotionNames) {
      this.current[n] = damp(this.current[n], this.target[n], 8, dt);
      const alive = this.target[n] > 0.05 ? life : 1;
      this.manager.setValue(n, clamp(this.current[n] * alive, 0, 1));
    }
    // Con sorpresa los ojos van más abiertos: parpadea menos.
    const blinkScale = this.active === 'surprised' ? 0.5 : 1;
    if (this.available.has(BLINK)) this.manager.setValue(BLINK, this._blinkValue(dt) * blinkScale);
    if (this.available.has(MOUTH)) this.manager.setValue(MOUTH, this._mouthValue(dt));
  }

  _blinkValue(dt) {
    if (this.blinkT < 0) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) this.blinkT = 0;
      return 0;
    }
    this.blinkT += dt;
    const p = this.blinkT / 0.16;
    if (p >= 1) {
      this.blinkT = -1;
      this.nextBlink = Math.random() < 0.12 ? 0.18 : 2.2 + Math.random() * 3.8; // a veces parpadeo doble
      return 0;
    }
    return p < 0.5 ? p * 2 : (1 - p) * 2;
  }

  _mouthValue(dt) {
    this.pulse = damp(this.pulse, 0, 6, dt);
    let target = 0;
    if (this.speaking) {
      const wobble = 0.5 + 0.25 * Math.sin(this.time * 11) + 0.25 * Math.sin(this.time * 6.7 + 1.3);
      target = clamp(0.1 + wobble * 0.45 + this.pulse * 0.35, 0, 0.85);
    }
    this.mouth = damp(this.mouth, target, 24, dt);
    return this.mouth;
  }
}
