// ARIA HOLOGRAM · vocaloid.js
// Sintetizador vocal propio de ARIA: texto en español -> audio con timbre "vocaloid".
// - JavaScript puro, sin dependencias, sin internet, sin API keys, sin Python.
// - Fuente glotal + filtros de formantes (tipo Klatt), melodía cuantizada a notas (efecto auto-tune),
//   vibrato en vocales largas, formantes más agudos (timbre juvenil), coro suave y reverb corta.
// - Se puede usar en el navegador o en Node (no toca el DOM).

export const VOCALOID_DEFAULTS = Object.freeze({
  sampleRate: 24000,
  baseHz: 380,        // altura central de la voz (G4 ≈ 392 Hz). Más alto = más agudo.
  speed: 1.0,         // 1 = normal; 1.2 = más rápida; 0.85 = más lenta
  formantShift: 1.14, // >1 timbre más pequeño/brillante, <1 más maduro
  tune: true,         // true = melodía "snap" a notas (efecto auto-tune); false = entonación suave
  vibrato: 1.0,       // 0 lo apaga
  breath: 0.05,       // soplido/aire en la voz
  brightness: 1.0,    // realce de agudos
  chorus: 0.22,       // doblaje suave de voz
  reverb: 0.12,       // brillo de estudio
  gain: 0.9,          // volumen final (0..1)
});

const TWO_PI = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ======================================================================
   1. TEXTO -> FRASES -> FONEMAS (ortografía española, seseo latino)
   ====================================================================== */

const UN = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos'];

function numWords(n) {
  if (n < 30) return UN[n];
  if (n < 100) { const d = Math.floor(n / 10), u = n % 10; return DEC[d] + (u ? ' y ' + UN[u] : ''); }
  if (n === 100) return 'cien';
  if (n < 1000) { const c = Math.floor(n / 100); return CEN[c] + (n % 100 ? ' ' + numWords(n % 100) : ''); }
  if (n < 1000000) {
    const m = Math.floor(n / 1000);
    return (m === 1 ? 'mil' : numWords(m) + ' mil') + (n % 1000 ? ' ' + numWords(n % 1000) : '');
  }
  return String(n).split('').map(d => UN[+d]).join(' ');
}

function normalizeText(text) {
  let t = String(text).toLowerCase().normalize('NFC');
  t = t.replace(/(\d)[.,](\d)/g, '$1 coma $2')
    .replace(/%/g, ' por ciento ')
    .replace(/&/g, ' y ')
    .replace(/\d+/g, m => ' ' + numWords(parseInt(m, 10)) + ' ');
  return t.replace(/[^a-záéíóúüñ.,;:!?…\s]/g, ' ');
}

function parseText(text) {
  const tokens = normalizeText(text).match(/[a-záéíóúüñ]+|[.,;:!?…]+/g) || [];
  const phrases = [];
  let cur = [];
  const flush = end => { if (cur.length) { phrases.push({ words: cur, end }); cur = []; } };
  for (const tk of tokens) {
    if (/^[a-záéíóúüñ]/.test(tk)) cur.push(tk);
    else flush(tk.includes('?') ? 'question' : tk.includes('!') ? 'exclam' : /[.…]/.test(tk) ? 'period' : 'comma');
  }
  flush('period');
  return phrases;
}

const VOWELS = 'aeiouáéíóúü';
const isFront = ch => ch !== '' && 'eiéí'.includes(ch);
const FUNCTION_WORDS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'a', 'en', 'un', 'una', 'me', 'te', 'se',
  'mi', 'tu', 'su', 'lo', 'le', 'por', 'con', 'al', 'o', 'u', 'e', 'es', 'no', 'ni', 'si', 'ya']);

function g2p(w) {
  const items = [];
  const n = w.length;
  const push = (p, extra) => items.push({ p, ...(extra || {}) });
  for (let i = 0; i < n; i++) {
    const c = w[i], nx = w[i + 1] || '', nn = w[i + 2] || '', pv = w[i - 1] || '';
    switch (c) {
      case 'c': if (nx === 'h') { push('tS'); i++; } else push(isFront(nx) ? 's' : 'k'); break;
      case 'q': push('k'); if (nx === 'u') i++; break;
      case 'g':
        if (nx === 'u' && isFront(nn)) { push('g'); i++; }
        else push(isFront(nx) ? 'x' : 'g');
        break;
      case 'l': if (nx === 'l') { push('y'); i++; } else push('l'); break;
      case 'r':
        if (nx === 'r') { push('rr'); i++; }
        else if (i === 0 || (pv && 'nls'.includes(pv))) push('rr');
        else push('r');
        break;
      case 'z': case 's': push('s'); break;
      case 'j': push('x'); break;
      case 'h': break;
      case 'ñ': push('ny'); break;
      case 'v': case 'b': push('b'); break;
      case 'y': if (i === n - 1) push('i', { vowel: true, acc: false }); else push('y'); break;
      case 'x': push('k'); push('s'); break;
      case 'w': push('u', { vowel: true, acc: false }); break;
      case 'k': case 'p': case 't': case 'd': case 'f': case 'm': case 'n': push(c); break;
      default:
        if (VOWELS.includes(c)) {
          const base = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' }[c] || c;
          push(base, { vowel: true, acc: 'áéíóú'.includes(c) });
        }
    }
  }
  return items;
}

function assignStress(items, word) {
  const weak = x => (x.p === 'i' || x.p === 'u') && !x.acc;
  const joinable = (a, b) => weak(a) || weak(b);
  const nuclei = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i].vowel) continue;
    const grp = [i];
    while (i + 1 < items.length && items[i + 1].vowel && joinable(items[i], items[i + 1])) { grp.push(i + 1); i++; }
    nuclei.push(grp);
  }
  const accIdx = nuclei.findIndex(g => g.some(k => items[k].acc));
  let st = -1;
  if (accIdx >= 0) st = accIdx;
  else if (nuclei.length === 1) st = FUNCTION_WORDS.has(word) ? -1 : 0;
  else if (nuclei.length > 1) st = 'aeiouns'.includes(word[word.length - 1]) ? nuclei.length - 2 : nuclei.length - 1;
  nuclei.forEach((g, idx) => {
    let main = g.find(k => items[k].acc);
    if (main === undefined) main = g.find(k => !'iu'.includes(items[k].p));
    if (main === undefined) main = g[g.length - 1];
    items[main].main = true;
    if (idx === st) items[main].stressed = true;
  });
}

/* ======================================================================
   2. FONEMAS -> SEGMENTOS CON TIEMPOS Y OBJETIVOS ACÚSTICOS
   ====================================================================== */

const VOW = { a: [800, 1300, 2800], e: [500, 2000, 2800], i: [300, 2600, 3300], o: [500, 900, 2750], u: [330, 800, 2650] };

function buildSegments(phrases, sc) {
  const segs = [];
  segs.push({ kind: 'pause', dur: 35 });

  phrases.forEach((ph, pi) => {
    const items = [];
    ph.words.forEach(w => {
      const it = g2p(w);
      if (!it.length) return;
      assignStress(it, w);
      it[0].wordStart = true;
      it[it.length - 1].wordEnd = true;
      items.push(...it);
    });
    let lastMain = -1;
    items.forEach((it, k) => { if (it.main) lastMain = k; });
    const first = segs.length;

    items.forEach((it, k) => {
      const prev = items[k - 1] || null;
      const nextV = () => { for (let j = k + 1; j < items.length; j++) if (items[j].vowel) return VOW[items[j].p]; return null; };
      const prevV = () => { for (let j = k - 1; j >= 0; j--) if (items[j].vowel) return VOW[items[j].p]; return null; };
      const base = { phrase: pi };

      if (it.vowel) {
        let dur = it.main ? (it.stressed ? 132 : 90) : 48;
        if (k === lastMain) dur *= ph.end === 'comma' ? 1.35 : 1.6;
        else if (it.main && it.wordEnd) dur *= 1.08;
        segs.push({
          ...base, ph: it.p, kind: 'vowel', dur: dur * sc, F: VOW[it.p],
          amp: it.main ? (it.stressed ? 1 : 0.84) : 0.78,
          main: !!it.main, stressed: !!it.stressed, last: k === lastMain,
        });
        return;
      }

      switch (it.p) {
        case 'p': case 't': case 'k': case 'b': case 'd': case 'g': {
          const voiced = 'bdg'.includes(it.p);
          const labial = it.p === 'p' || it.p === 'b';
          const dental = it.p === 't' || it.p === 'd';
          const nv = nextV();
          const F = labial ? [250, 950, 2100]
            : dental ? [320, 1750, 2750]
              : [300, nv ? clamp(nv[1] * 0.92 + 120, 1100, 2300) : 1700, 2400];
          const fc = labial ? 1300 : dental ? 4300 : 2300;
          const fbw = labial ? 1800 : dental ? 2800 : 1800;
          const stopLike = !voiced ||
            k === 0 || (prev && ['n', 'm', 'ny'].includes(prev.p)) || (it.p === 'd' && prev && prev.p === 'l');
          if (!stopLike) {
            segs.push({ ...base, ph: it.p, kind: 'approx', dur: 52 * sc, F });
          } else if (!voiced) {
            const closure = 52 * sc, burst = 11, asp = 16 * sc;
            segs.push({
              ...base, ph: it.p, kind: 'stop', voiced: false, closure, burst, asp, dur: closure + burst + asp,
              burstAmp: labial ? 0.5 : dental ? 0.8 : 0.7, fc, fbw, F,
            });
          } else {
            const closure = 42 * sc, burst = 8;
            segs.push({
              ...base, ph: it.p, kind: 'stop', voiced: true, closure, burst, asp: 0, dur: closure + burst,
              burstAmp: 0.35, fc, fbw, F,
            });
          }
          break;
        }
        case 'tS': {
          const closure = 50 * sc, burst = 6, fric = 62 * sc;
          segs.push({ ...base, ph: 'tS', kind: 'aff', closure, burst, fric, dur: closure + burst + fric, fc: 3800, fbw: 2500 });
          break;
        }
        case 's': segs.push({ ...base, ph: 's', kind: 'fric', dur: (it.wordEnd ? 88 : 105) * sc, fc: 6800, fbw: 3600, amp: 1.0 }); break;
        case 'f': segs.push({ ...base, ph: 'f', kind: 'fric', dur: 85 * sc, fc: 5200, fbw: 5000, amp: 0.55 }); break;
        case 'x': {
          const F = nextV() || prevV() || VOW.a;
          segs.push({ ...base, ph: 'x', kind: 'fric', dur: 95 * sc, fc: 2800, fbw: 3200, amp: 0.4, ah: 0.5, F });
          break;
        }
        case 'y': segs.push({ ...base, ph: 'y', kind: 'approxfric', dur: 72 * sc, F: [280, 2300, 3000], fc: 3600, fbw: 3500 }); break;
        case 'm': segs.push({ ...base, ph: 'm', kind: 'nasal', dur: 72 * sc, F: [250, 1100, 2200], zero: 1000 }); break;
        case 'n': segs.push({ ...base, ph: 'n', kind: 'nasal', dur: 72 * sc, F: [250, 1500, 2500], zero: 1700 }); break;
        case 'ny': segs.push({ ...base, ph: 'ny', kind: 'nasal', dur: 80 * sc, F: [250, 2100, 2900], zero: 2300 }); break;
        case 'l': segs.push({ ...base, ph: 'l', kind: 'liquid', dur: 62 * sc, F: [380, 1400, 2750] }); break;
        case 'r': segs.push({ ...base, ph: 'r', kind: 'tap', dur: 36 * sc, F: [420, 1400, 2300] }); break;
        case 'rr': segs.push({ ...base, ph: 'rr', kind: 'trill', dur: 105 * sc, F: [420, 1400, 2300] }); break;
        default: break;
      }
    });

    for (let j = first; j < segs.length; j++) segs[j].end = ph.end;
    const pause = ph.end === 'comma' ? 170 : 320;
    segs.push({ kind: 'pause', dur: pause * sc, phraseEnd: true, phrase: pi, end: ph.end });
  });

  segs.push({ kind: 'pause', dur: 90 });
  let t = 0;
  segs.forEach(s => { s.t0 = t; t += s.dur; });
  return { segs, totalMs: t };
}

/* ======================================================================
   3. MELODÍA (contorno de tono por frase + cuantización a notas)
   ====================================================================== */

function buildPitchKeys(segs) {
  const keys = [];
  const byPhrase = new Map();
  segs.forEach(s => {
    if (s.kind === 'pause') return;
    const p = byPhrase.get(s.phrase) || { s: s.t0, e: s.t0 + s.dur, end: s.end };
    p.e = s.t0 + s.dur;
    byPhrase.set(s.phrase, p);
  });
  byPhrase.forEach((p, pid) => {
    const mains = segs.filter(s => s.phrase === pid && s.kind === 'vowel' && s.main);
    if (!mains.length) return;
    const span = Math.max(1, p.e - p.s);
    const local = [];
    mains.forEach(s => {
      const tc = s.t0 + s.dur / 2;
      let st = (s.stressed ? 2.0 : -0.4) + (p.end === 'exclam' && s.stressed ? 1.5 : 0);
      st -= 2.8 * ((tc - p.s) / span);
      if (s.last) {
        const tail = p.end === 'question' ? 6 : p.end === 'comma' ? 1.0 : p.end === 'exclam' ? -1 : -2.2;
        local.push([s.t0 + 0.3 * s.dur, st], [s.t0 + 0.95 * s.dur, st + tail]);
      } else {
        local.push([s.t0 + 0.3 * s.dur, st], [s.t0 + 0.7 * s.dur, st]);
      }
    });
    keys.push([p.s, local[0][1]], ...local, [p.e, local[local.length - 1][1]]);
  });
  return keys.sort((a, b) => a[0] - b[0]);
}

const PENTA = [0, 2, 4, 7, 9];
function snapToScale(st) {
  const oct = Math.floor(st / 12);
  const r = st - oct * 12;
  let best = 0, bd = 99;
  for (const d of [...PENTA, 12]) { const dist = Math.abs(r - d); if (dist < bd) { bd = dist; best = d; } }
  return oct * 12 + best;
}

/* ======================================================================
   4. FILTROS
   ====================================================================== */

class Resonator {
  constructor() { this.a = 1; this.b = 0; this.c = 0; this.y1 = 0; this.y2 = 0; }
  set(f, bw, sr) {
    const c = -Math.exp(-TWO_PI * bw / sr);
    const b = 2 * Math.exp(-Math.PI * bw / sr) * Math.cos(TWO_PI * f / sr);
    this.c = c; this.b = b; this.a = 1 - b - c;
  }
  tick(x) { const y = this.a * x + this.b * this.y1 + this.c * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

class AntiResonator {
  constructor() { this.a = 1; this.b = 0; this.c = 0; this.x1 = 0; this.x2 = 0; }
  set(f, bw, sr) {
    const c = -Math.exp(-TWO_PI * bw / sr);
    const b = 2 * Math.exp(-Math.PI * bw / sr) * Math.cos(TWO_PI * f / sr);
    const a = 1 - b - c;
    this.a = 1 / a; this.b = -b / a; this.c = -c / a;
  }
  tick(x) { const y = this.a * x + this.b * this.x1 + this.c * this.x2; this.x2 = this.x1; this.x1 = x; return y; }
}

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  _set(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; return this;
  }
  bandpass(f, q, sr) {
    const w = TWO_PI * f / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
    return this._set(al, 0, -al, 1 + al, -2 * cs, 1 - al);
  }
  lowpass(f, q, sr) {
    const w = TWO_PI * f / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
    return this._set((1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al);
  }
  highpass(f, q, sr) {
    const w = TWO_PI * f / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
    return this._set((1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al);
  }
  peaking(f, q, db, sr) {
    const A = Math.pow(10, db / 40), w = TWO_PI * f / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
    return this._set(1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A);
  }
  highShelf(f, db, sr) {
    const A = Math.pow(10, db / 40), w = TWO_PI * f / sr, cs = Math.cos(w);
    const al = Math.sin(w) / 2 * Math.sqrt(2), sq = 2 * Math.sqrt(A) * al;
    return this._set(
      A * ((A + 1) + (A - 1) * cs + sq), -2 * A * ((A - 1) + (A + 1) * cs), A * ((A + 1) + (A - 1) * cs - sq),
      (A + 1) - (A - 1) * cs + sq, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - sq);
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

/* ======================================================================
   5. SÍNTESIS
   ====================================================================== */

const FRAME_MS = 2.5;

function shapeAt(s, tl) {
  // Devuelve [voz, fricación, aspiración, fc, fbw]
  switch (s.kind) {
    case 'vowel': return [s.amp, 0, 0, 0, 0];
    case 'approx': return [0.55, 0, 0.06, 0, 0];
    case 'nasal': return [0.68, 0, 0, 0, 0];
    case 'liquid': return [0.8, 0, 0, 0, 0];
    case 'tap': { const u = tl / s.dur; return [u > 0.3 && u < 0.7 ? 0.2 : 0.9, 0, 0, 0, 0]; }
    case 'trill': return [0.3 + 0.6 * Math.max(0, Math.sin(TWO_PI * 26 * tl / 1000)), 0, 0, 0, 0];
    case 'approxfric': return [0.62, 0.14, 0, s.fc, s.fbw];
    case 'fric': {
      const e = Math.min(1, tl / 12, (s.dur - tl) / 18);
      return [0, s.amp * e, (s.ah || 0) * e, s.fc, s.fbw];
    }
    case 'stop': {
      const { closure: c, burst: b, asp: a } = s;
      if (tl < c) return [s.voiced ? 0.28 : 0, 0, 0, s.fc, s.fbw];
      if (tl < c + b) return [s.voiced ? 0.5 : 0, s.burstAmp * (1 - 0.4 * (tl - c) / b), 0, s.fc, s.fbw];
      const r = a > 0 ? 1 - (tl - c - b) / a : 0;
      return [0, 0.15 * r, 0.55 * r, s.fc, s.fbw];
    }
    case 'aff': {
      const { closure: c, burst: b, fric: f } = s;
      if (tl < c) return [0, 0, 0, s.fc, s.fbw];
      if (tl < c + b) return [0, 0.9, 0, s.fc, s.fbw];
      const e = Math.min(1, (s.dur - tl) / 18);
      return [0, 0.8 * e, 0, s.fc, s.fbw];
    }
    default: return [0, 0, 0, 0, 0];
  }
}

function buildTracks(segs, totalMs, o) {
  const nF = Math.ceil(totalMs / FRAME_MS) + 3;
  const mk = () => new Float32Array(nF);
  const T = { nF, F0: mk(), F1: mk(), F2: mk(), F3: mk(), AV: mk(), AF: mk(), AH: mk(), FC: mk(), FBW: mk(), ZR: mk(), NA: mk(), VIB: mk() };

  const fk = [];
  segs.forEach(s => {
    if (s.F) { fk.push([s.t0 + 0.3 * s.dur, ...s.F]); fk.push([s.t0 + 0.7 * s.dur, ...s.F]); }
  });
  const pk = buildPitchKeys(segs);

  let segPtr = 0, fj = 0, pj = 0, lastZ = 1000;
  const frameDt = FRAME_MS / 1000;
  const alphaPitch = 1 - Math.exp(-frameDt / 0.03);
  let stSmooth = 0, init = false;

  for (let k = 0; k < nF; k++) {
    const t = k * FRAME_MS;
    while (segPtr < segs.length && t >= segs[segPtr].t0 + segs[segPtr].dur) segPtr++;
    const s = segs[segPtr];

    // formantes
    if (fk.length) {
      while (fj < fk.length - 1 && t > fk[fj + 1][0]) fj++;
      const A = fk[fj], B = fk[Math.min(fj + 1, fk.length - 1)];
      const u = t <= A[0] ? 0 : t >= B[0] ? 1 : (t - A[0]) / (B[0] - A[0]);
      const src = t < fk[0][0] ? fk[0] : (fj === fk.length - 1 && t > B[0] ? B : null);
      for (let q = 0; q < 3; q++) {
        const v = src ? src[q + 1] : A[q + 1] + (B[q + 1] - A[q + 1]) * u;
        (q === 0 ? T.F1 : q === 1 ? T.F2 : T.F3)[k] = v;
      }
    } else { T.F1[k] = 500; T.F2[k] = 1500; T.F3[k] = 2500; }

    // forma de onda de amplitud
    if (s) {
      const sh = shapeAt(s, t - s.t0);
      T.AV[k] = sh[0]; T.AF[k] = sh[1]; T.AH[k] = sh[2]; T.FC[k] = sh[3] || (k ? T.FC[k - 1] : 4000); T.FBW[k] = sh[4] || (k ? T.FBW[k - 1] : 3000);
      if (s.zero) lastZ = s.zero;
      T.NA[k] = s.kind === 'nasal' ? 1 : 0;
      if (s.kind === 'vowel' && s.main && s.dur > 150 / (o._sc || 1)) {
        const age = t - s.t0;
        T.VIB[k] = clamp((age - 90) / 110, 0, 1) * clamp((s.t0 + s.dur - t) / 40, 0, 1);
      }
    } else { T.FC[k] = 4000; T.FBW[k] = 3000; }
    T.ZR[k] = lastZ;

    // tono
    let st = 0;
    if (pk.length) {
      while (pj < pk.length - 1 && t > pk[pj + 1][0]) pj++;
      const a = pk[pj], b = pk[Math.min(pj + 1, pk.length - 1)];
      if (t <= a[0]) st = a[1];
      else if (t >= b[0]) st = b[1];
      else { const u = (t - a[0]) / (b[0] - a[0]); st = a[1] + (b[1] - a[1]) * (0.5 - 0.5 * Math.cos(Math.PI * u)); }
    }
    const target = o.tune ? snapToScale(st) : st;
    if (!init) { stSmooth = target; init = true; }
    stSmooth += (target - stSmooth) * (o.tune ? alphaPitch : 0.2);
    T.F0[k] = stSmooth;
  }

  // suavizado de envolventes para evitar clics
  const smooth = (arr, a) => { let v = 0; for (let k = 0; k < arr.length; k++) { v += (arr[k] - v) * a; arr[k] = v; } };
  smooth(T.AV, 0.30); smooth(T.AF, 0.70); smooth(T.AH, 0.50); smooth(T.NA, 0.25);
  return T;
}

function synthesizeRaw(T, o, sr) {
  const FRAME = Math.round(sr * FRAME_MS / 1000);
  const N = (T.nF - 3) * FRAME;
  const out = new Float32Array(N);
  const shift = o.formantShift;
  const R = [new Resonator(), new Resonator(), new Resonator(), new Resonator(), new Resonator()];
  const nasalZero = new AntiResonator();
  const fricBP = new Biquad();
  const UPD = 8;

  let seed = 12345;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

  const Tn = 0.12 / clamp(o.brightness, 0.6, 1.6), Tp = 0.40;
  let phase = 0, vibPhase = 0;
  const vibRate = 5.6, vibDepth = 0.28 * o.vibrato;
  let jitter = 0;
  let F1 = 500, F2 = 1500, F3 = 2500, FCv = 4000, FBWv = 3000, ZR = 1000;

  for (let n = 0; n < N; n++) {
    const fi = Math.min(T.nF - 2, (n / FRAME) | 0);
    const fr = n / FRAME - fi;
    const lerp = a => a[fi] + (a[fi + 1] - a[fi]) * fr;

    const av = lerp(T.AV), af = lerp(T.AF), ah = lerp(T.AH), na = lerp(T.NA), vib = lerp(T.VIB);
    if (n % UPD === 0) {
      F1 = lerp(T.F1); F2 = lerp(T.F2); F3 = lerp(T.F3); FCv = lerp(T.FC); FBWv = lerp(T.FBW); ZR = lerp(T.ZR);
      const lim = sr * 0.42;
      R[0].set(clamp(F1 * shift, 150, lim), 70, sr);
      R[1].set(clamp(F2 * shift, 400, lim), 100, sr);
      R[2].set(clamp(F3 * shift, 900, lim), 140, sr);
      R[3].set(clamp(3500 * shift, 2500, lim), 200, sr);
      R[4].set(clamp(4600 * shift, 3500, lim), 250, sr);
      nasalZero.set(ZR * shift, 120, sr);
      fricBP.bandpass(clamp(FCv, 800, sr * 0.45), clamp(FCv / Math.max(500, FBWv), 0.3, 6), sr);
    }

    // tono
    jitter += (noise() * 0.03 - jitter) * 0.002;
    vibPhase += vibRate / sr;
    const st = lerp(T.F0) + vibDepth * vib * Math.sin(TWO_PI * vibPhase) + jitter;
    const f0 = o.baseHz * Math.pow(2, st / 12);

    // fuente glotal (derivada del pulso Rosenberg, independiente de f0)
    phase += f0 / sr;
    if (phase >= 1) phase -= 1;
    let d;
    if (phase < Tp) d = 0.5 * Math.PI / Tp * Math.sin(Math.PI * phase / Tp);
    else if (phase < Tp + Tn) d = -(Math.PI / 2) / Tn * Math.sin(Math.PI / 2 * (phase - Tp) / Tn);
    else d = 0;
    d /= 11;

    let x = av * (d + o.breath * noise() * 0.5) + ah * noise() * 0.15;
    for (let q = 0; q < 5; q++) x = R[q].tick(x);
    if (na > 0.001) x = x * (1 - na) + nasalZero.tick(x) * na; else nasalZero.tick(x);

    const fr0 = fricBP.tick(noise());
    out[n] = x * 0.012 + fr0 * af * 0.03;
  }
  return out;
}

/* ======================================================================
   6. EFECTOS DE POSTPRODUCCIÓN
   ====================================================================== */

function applyChorus(x, sr, mix) {
  if (mix <= 0) return x;
  const y = new Float32Array(x.length);
  const read = (pos) => {
    const i = Math.floor(pos), f = pos - i;
    const a = i >= 0 && i < x.length ? x[i] : 0, b = i + 1 >= 0 && i + 1 < x.length ? x[i + 1] : 0;
    return a + (b - a) * f;
  };
  for (let n = 0; n < x.length; n++) {
    const t = n / sr;
    const d1 = (0.014 + 0.0025 * Math.sin(TWO_PI * 0.7 * t)) * sr;
    const d2 = (0.022 + 0.0020 * Math.sin(TWO_PI * 0.55 * t + 1.3)) * sr;
    y[n] = x[n] + mix * 0.5 * (read(n - d1) + read(n - d2));
  }
  return y;
}

function applyReverb(x, sr, mix) {
  if (mix <= 0) return x;
  const scale = sr / 44100;
  const N = x.length + Math.round(sr * 0.5);
  const inp = new Float32Array(N); inp.set(x);
  const combs = [1116, 1188, 1277, 1356].map(d => ({ buf: new Float32Array(Math.round(d * scale)), i: 0, lp: 0 }));
  const aps = [556, 441].map(d => ({ buf: new Float32Array(Math.round(d * scale)), i: 0 }));
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let wet = 0;
    for (const c of combs) {
      const v = c.buf[c.i];
      c.lp += (v - c.lp) * 0.7;
      c.buf[c.i] = inp[n] + c.lp * 0.80;
      c.i = (c.i + 1) % c.buf.length;
      wet += v;
    }
    wet *= 0.25;
    for (const a of aps) {
      const v = a.buf[a.i];
      const o2 = -wet + v;
      a.buf[a.i] = wet + v * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      wet = o2;
    }
    out[n] = inp[n] * (1 - mix * 0.4) + wet * mix * 0.9;
  }
  return out;
}

function masterChain(raw, sr, o) {
  const hp = new Biquad().highpass(110, 0.707, sr);
  const lp = new Biquad().lowpass(10500, 0.707, sr);
  const pres = new Biquad().peaking(2800, 1.0, 2.0 * o.brightness, sr);
  const air = new Biquad().highShelf(4000, 3.0 * o.brightness, sr);
  let y = new Float32Array(raw.length);
  for (let n = 0; n < raw.length; n++) y[n] = air.tick(pres.tick(lp.tick(hp.tick(raw[n]))));
  y = applyChorus(y, sr, o.chorus);
  y = applyReverb(y, sr, o.reverb);
  let peak = 1e-9;
  for (let n = 0; n < y.length; n++) peak = Math.max(peak, Math.abs(y[n]));
  const g = clamp(o.gain, 0.05, 1) * 0.95 / peak;
  for (let n = 0; n < y.length; n++) y[n] *= g;
  return y;
}

/* ======================================================================
   7. API PÚBLICA
   ====================================================================== */

/**
 * Convierte texto en voz estilo vocaloid.
 * @returns {{samples: Float32Array, sampleRate: number, duration: number, events: number[], envelope: Float32Array}}
 *   events = instantes (s) de cada sílaba, para animar la boca.
 */
export function synthesizeVocaloid(text, options = {}) {
  const o = { ...VOCALOID_DEFAULTS, ...options };
  o.speed = clamp(o.speed, 0.5, 2);
  o.baseHz = clamp(o.baseHz, 120, 800);
  o.formantShift = clamp(o.formantShift, 0.8, 1.6);
  o._sc = 1 / o.speed;
  const sr = o.sampleRate;

  const phrases = parseText(text);
  if (!phrases.length) return { samples: new Float32Array(0), sampleRate: sr, duration: 0, events: [], envelope: new Float32Array(0) };

  const { segs, totalMs } = buildSegments(phrases, 1 / o.speed);
  const tracks = buildTracks(segs, totalMs, o);
  const raw = synthesizeRaw(tracks, o, sr);
  const samples = masterChain(raw, sr, o);

  const events = segs.filter(s => s.kind === 'vowel' && s.main).map(s => s.t0 / 1000);

  const hop = Math.round(sr * 0.01);
  const env = new Float32Array(Math.ceil(samples.length / hop));
  for (let i = 0; i < env.length; i++) {
    let acc = 0, cnt = 0;
    for (let n = i * hop; n < Math.min(samples.length, (i + 1) * hop); n++) { acc += samples[n] * samples[n]; cnt++; }
    env[i] = Math.sqrt(acc / Math.max(1, cnt));
  }
  return { samples, sampleRate: sr, duration: samples.length / sr, events, envelope: env };
}

/** WAV PCM 16-bit mono (para descargar o probar en Node). */
export function toWav(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(clamp(samples[i], -1, 1) * 32767), true);
  return new Uint8Array(buf);
}
