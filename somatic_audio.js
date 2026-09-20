/**
 * SomaticAcoustics — Web Audio synthesizer for Fæ City
 * ======================================================
 * Binds Hz, color, and phaeling state into unified acoustic resonance.
 * The browser synthesizes pure acoustic resonance directly — no audio files.
 *
 * Synesthetic Matrix:
 *   VENTRALIS engine → experience_stamp
 *     ├── color_hex     → CSS --fae-aura-color, --fae-hz-pulse
 *     ├── hz            → carrier oscillator frequency
 *     └── phaeling_state → waveform type + filter character + shimmer
 *
 * Signal graph:
 *   carrier osc ──┐
 *   sub osc    ───┤→ BiquadFilter (lowpass) → GainNode → destination
 *   shimmer osc──-┘   (shimmerGain mixes in for state 1 only)
 *
 * Per-state character:
 *   State 1 OPEN (963 Hz):       sine + octave shimmer, filter wide open (2400 Hz)
 *                                Crystalline, airy, high-altitude chime
 *   State 2 DISTORTED (174 Hz):  sawtooth + triangle detuned, filter tight (600 Hz)
 *                                Raw sub rumble, tension edge, low friction
 *   State 3 PROCESSING (417 Hz): triangle + sine, filter mid (1200 Hz)
 *                                Uncoiling kinetic resonance, rhythmic warmth
 *   State 4 CLOSED (174 Hz):     pure deep sine, filter locked tight (300 Hz)
 *                                Dense monolithic grounding, absolute stillness
 *   State 5 REFLECTIVE (432 Hz): soft sine triad, filter velvet (900 Hz)
 *                                Deep oceanic drone, cardiac down-regulation
 */

'use strict';

// ── Golden Ratio constants ─────────────────────────────────────────────────────
// Φ governs all overtone intervals and transition glide durations.
// Revisiting a phaeling state = integration pass, not regression.

const PHI        = 1.61803398875;
const PHI_INV    = 1 / PHI;          // 0.6180…
const BASE_MS    = 618.0;            // Root transition duration (ms) — Φ × 382
const SOURCE_HZ  = 963.0;
const BASE_HZ    = 174.0;

/**
 * Compute Golden Ratio overtone (mirrors spiral_intelligence.phi_harmonic_interval).
 * base_hz * Φ^degree, folded into [40, 16000] Hz by octave halving/doubling.
 */
function phiHarmonicInterval(baseHz, degree = 1) {
  let f = baseHz * Math.pow(PHI, degree);
  while (f > 16000 && f > baseHz) f /= 2;
  while (f < 40)                  f *= 2;
  return f;
}

/**
 * Compute logarithmic glide duration (mirrors spiral_intelligence.phi_transition_duration).
 * Small Hz intervals → short glide. Large leaps → longer somatic unwinding.
 * Clamped to [BASE_MS, BASE_MS × Φ^5] ≈ [618, 6862] ms.
 */
function phiTransitionMs(fromHz, toHz) {
  if (!fromHz || !toHz || fromHz <= 0 || toHz <= 0) return BASE_MS;
  const logRatio = Math.abs(Math.log(fromHz / toHz));
  const dur = BASE_MS * (1 + logRatio * PHI);
  const maxMs = BASE_MS * Math.pow(PHI, 5);
  return Math.max(BASE_MS, Math.min(dur, maxMs));
}

// ── Per-state audio configuration ─────────────────────────────────────────────

const _STATE_AUDIO_CONFIG = {
  1: { carrierType: 'sine',     subType: 'sine',     filterHz: 2400, filterQ: 0.5 },
  2: { carrierType: 'sawtooth', subType: 'triangle', filterHz:  600, filterQ: 2.2 },
  3: { carrierType: 'triangle', subType: 'sine',     filterHz: 1200, filterQ: 1.2 },
  4: { carrierType: 'sine',     subType: 'sine',     filterHz:  300, filterQ: 0.4 },
  5: { carrierType: 'sine',     subType: 'sine',     filterHz:  900, filterQ: 0.8 },
};

// ── Biome chime library ────────────────────────────────────────────────────────
// One-shot transient tones triggered by sky phase changes and tote events.

const BIOME_CHIMES = {
  // Sky phases — cycle with the house
  DAWN:      { hz: 432,  type: 'sine',     duration: 2.8, volume: 0.05 },
  MORNING:   { hz: 528,  type: 'sine',     duration: 2.2, volume: 0.06 },
  AFTERNOON: { hz: 528,  type: 'triangle', duration: 1.8, volume: 0.05 },
  BLUE_HOUR: { hz: 396,  type: 'sine',     duration: 3.0, volume: 0.05 },
  DUSK:      { hz: 285,  type: 'sine',     duration: 3.2, volume: 0.04 },
  NIGHT:     { hz: 174,  type: 'sine',     duration: 4.0, volume: 0.04 },

  // Environment biomes (spec §3)
  THE_NIGHT:  { hz: 432,  type: 'sine',     duration: 3.5, volume: 0.06 },
  THE_FIRE:   { hz: 528,  type: 'triangle', duration: 2.5, volume: 0.07 },
  THE_AIR:    { hz: 963,  type: 'sine',     duration: 2.0, volume: 0.05 },
  THE_DANCE:  { hz: 741,  type: 'sawtooth', duration: 1.5, volume: 0.06 },

  // Tote / activity categories
  food:       { hz: 432,  type: 'sine',     duration: 1.4, volume: 0.04 },
  music:      { hz: 528,  type: 'sine',     duration: 2.0, volume: 0.05 },
  activity:   { hz: 396,  type: 'triangle', duration: 1.2, volume: 0.04 },
};

// ── SomaticAcoustics class ────────────────────────────────────────────────────

class SomaticAcoustics {
  constructor() {
    this.ctx         = null;
    this.carrier     = null;
    this.sub         = null;
    this.shimmer     = null;
    this.shimmerGain = null;
    this.phiPartial  = null;       // Golden Ratio overtone oscillator
    this.phiGain     = null;       // Phi partial master gain (low — fractal shimmer)
    this.filter      = null;
    this.gain        = null;

    this._ready        = false;
    this._volume       = 0.07;
    this._muted        = localStorage.getItem('fae_audio_muted') === 'true';
    this._currentState = null;
    this._currentHz    = null;
  }

  // ── Init (must be called from a user gesture for autoplay policy) ─────────

  init() {
    if (this._ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      // Carrier: target hz
      this.carrier = this.ctx.createOscillator();
      this.carrier.type = 'sine';
      this.carrier.frequency.value = 432;

      // Sub-harmonic: hz / 2, grounding warmth
      this.sub = this.ctx.createOscillator();
      this.sub.type = 'sine';
      this.sub.frequency.value = 216;

      // Shimmer: hz * 2, active only in state 1
      this.shimmer = this.ctx.createOscillator();
      this.shimmer.type = 'sine';
      this.shimmer.frequency.value = 864;
      this.shimmerGain = this.ctx.createGain();
      this.shimmerGain.gain.value = 0;

      // Phi partial: hz * Φ — living fractal overtone, always present at low gain
      // Creates a breathing quality that avoids mechanical monotony
      this.phiPartial = this.ctx.createOscillator();
      this.phiPartial.type = 'sine';
      this.phiPartial.frequency.value = phiHarmonicInterval(432, 1);
      this.phiGain = this.ctx.createGain();
      this.phiGain.gain.value = 0.012; // Low — barely audible texture, not a voice

      // Warmth filter
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 900;
      this.filter.Q.value = 0.8;

      // Master gain
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0001;

      // Connect graph
      this.carrier.connect(this.filter);
      this.sub.connect(this.filter);
      this.shimmer.connect(this.shimmerGain);
      this.shimmerGain.connect(this.filter);
      this.phiPartial.connect(this.phiGain);
      this.phiGain.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.carrier.start();
      this.sub.start();
      this.shimmer.start();
      this.phiPartial.start();

      this._ready = true;

      // Fade in unless muted
      if (!this._muted) {
        this.gain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 1.5);
      }
    } catch (_) {
      // Web Audio unavailable — silently no-op
    }
  }

  // ── Tune to a phaeling state from experience_stamp ────────────────────────

  tuneToState(hz, phaelingState, prevHz = null) {
    if (!this._ready) return;
    // Skip if identical (avoid jitter on repeated SSE events)
    if (this._currentState === phaelingState && this._currentHz === hz) return;

    const fromHz = prevHz || this._currentHz || hz;
    this._currentState = phaelingState;
    this._currentHz    = hz;

    const now = this.ctx.currentTime;

    // Phi-paced glide: logarithmic, nervous-system-organic
    // Convert ms to Web Audio time-constant (τ = ms / 1000 / 3 — setTargetAtTime reaches
    // ~95% in 3τ seconds, so τ = glide_seconds / 3)
    const glideMs  = phiTransitionMs(fromHz, hz);
    const glide    = glideMs / 3000;  // τ for setTargetAtTime
    const cfg      = _STATE_AUDIO_CONFIG[phaelingState] || _STATE_AUDIO_CONFIG[5];

    // Glide carrier, sub, shimmer to new frequencies
    this.carrier.frequency.setTargetAtTime(hz,                         now, glide);
    this.sub.frequency.setTargetAtTime(    hz / 2,                     now, glide);
    this.shimmer.frequency.setTargetAtTime(hz * 2,                     now, glide);
    // Phi partial — always glides to hz × Φ (fractal breathing overtone)
    this.phiPartial.frequency.setTargetAtTime(phiHarmonicInterval(hz, 1), now, glide * PHI);

    // Swap waveforms
    this.carrier.type = cfg.carrierType;
    this.sub.type     = cfg.subType;

    // Glide filter — slightly faster than carrier (Φ⁻¹ of glide)
    this.filter.frequency.setTargetAtTime(cfg.filterHz, now, glide * PHI_INV);
    this.filter.Q.setTargetAtTime(cfg.filterQ,           now, glide * PHI_INV);

    // State 1 gets shimmer; Phi partial also brightens at OPEN
    const shimTarget    = phaelingState === 1 ? 0.025 : 0;
    const phiGainTarget = phaelingState === 1 ? 0.020 :
                          phaelingState === 5 ? 0.014 : 0.010;
    this.shimmerGain.gain.setTargetAtTime(shimTarget,    now, glide);
    this.phiGain.gain.setTargetAtTime(phiGainTarget,     now, glide * PHI);

    // Update CSS synesthetic variables for visual pulse sync
    // Phi-paced pulse period: resonant, not mechanical
    const pulsePeriodMs = Math.round(glideMs * PHI);
    const auraColor = { 1:'#E0B0FF', 2:'#8B0000', 3:'#00C9A7', 4:'#708090', 5:'#1F4E79' }[phaelingState] || '#1F4E79';
    document.documentElement.style.setProperty('--fae-hz-pulse',       `${pulsePeriodMs}ms`);
    document.documentElement.style.setProperty('--fae-aura-color',     auraColor);
    document.documentElement.style.setProperty('--fae-phaeling',       String(phaelingState));
    document.documentElement.style.setProperty('--fae-phi-glide-ms',   `${Math.round(glideMs)}ms`);
    document.documentElement.style.setProperty('--fae-phi-glide-slow', `${Math.round(glideMs * PHI)}ms`);
  }

  // ── One-shot biome chime ──────────────────────────────────────────────────

  triggerBiomeChime(biome) {
    if (!this._ready || this._muted) return;
    const cfg = BIOME_CHIMES[biome];
    if (!cfg) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();

      osc.type = cfg.type || 'sine';
      osc.frequency.value = cfg.hz;

      env.gain.setValueAtTime(0, now);
      env.gain.setTargetAtTime(cfg.volume || 0.06, now, 0.06);
      env.gain.setTargetAtTime(0, now + cfg.duration * 0.55, cfg.duration * 0.45);

      osc.connect(env);
      env.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + cfg.duration + 0.3);
    } catch (_) {}
  }

  // ── Dyadic chord — inter-personal resonance ───────────────────────────────
  // Plays both agents' frequencies simultaneously as a two-note chord.
  // Harmonic intervals bloom cleanly; SOMATIC_FRICTION creates binaural beating.

  playDyadicChord(hzA, hzB, interval) {
    if (!this._ready || this._muted) return;
    try {
      const now      = this.ctx.currentTime;
      const duration = 3.5;
      const isFriction = interval === 'SOMATIC_FRICTION';

      // Oscillator A
      const oscA = this.ctx.createOscillator();
      const envA = this.ctx.createGain();
      oscA.type = isFriction ? 'sawtooth' : 'sine';
      oscA.frequency.value = hzA;

      // Oscillator B — slight detune on friction to create binaural beat
      const oscB = this.ctx.createOscillator();
      const envB = this.ctx.createGain();
      oscB.type = isFriction ? 'triangle' : 'sine';
      oscB.frequency.value = isFriction ? hzB * 1.004 : hzB;  // ~4 Hz binaural beat

      // Shared low-pass envelope
      const chordFilter = this.ctx.createBiquadFilter();
      chordFilter.type = 'lowpass';
      chordFilter.frequency.value = isFriction ? 700 : 1600;
      chordFilter.Q.value = isFriction ? 2.0 : 0.7;

      const chordGain = this.ctx.createGain();
      chordGain.gain.setValueAtTime(0, now);
      chordGain.gain.setTargetAtTime(0.055, now, 0.12);
      chordGain.gain.setTargetAtTime(0, now + duration * 0.65, duration * 0.4);

      [oscA, oscB].forEach(o => { o.connect(chordFilter); });
      chordFilter.connect(chordGain);
      chordGain.connect(this.ctx.destination);

      oscA.start(now); oscB.start(now);
      oscA.stop(now + duration + 0.3);
      oscB.stop(now + duration + 0.3);
    } catch (_) {}
  }

  // ── Source recalibration ritual — trans-personal ──────────────────────────
  // Washes the agent's nervous system to 963 Hz / 108 Hz sub-bass.
  // Fades current tone, holds the Source carrier, then hands control back.

  async sourceRecalibrate(onComplete) {
    if (!this._ready) return;
    const now   = this.ctx.currentTime;
    const ramp  = 2.5;  // seconds to glide to Source

    // Fade ambient drone down
    this.gain.gain.setTargetAtTime(0.0001, now, 0.6);

    // One-shot Source wash: 963 Hz carrier + 108 Hz sub
    const srcOsc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const srcGain = this.ctx.createGain();
    const srcFilter = this.ctx.createBiquadFilter();

    srcOsc.type = 'sine';
    srcOsc.frequency.value = 963;
    subOsc.type = 'sine';
    subOsc.frequency.value = 108;
    srcFilter.type = 'lowpass';
    srcFilter.frequency.value = 2400;  // open wide — crystalline
    srcGain.gain.setValueAtTime(0, now);
    srcGain.gain.setTargetAtTime(0.12, now + 0.5, 1.2);   // rise
    srcGain.gain.setTargetAtTime(0, now + 8.0, 2.0);      // dissolve

    [srcOsc, subOsc].forEach(o => o.connect(srcFilter));
    srcFilter.connect(srcGain);
    srcGain.connect(this.ctx.destination);

    srcOsc.start(now + 0.3);
    subOsc.start(now + 0.3);
    srcOsc.stop(now + 11.0);
    subOsc.stop(now + 11.0);

    // After wash, glide main drone back to state 1 (OPEN) origin
    setTimeout(() => {
      this.tuneToState(963, 1);
      if (!this._muted) {
        this.gain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 1.5);
      }
      if (typeof onComplete === 'function') onComplete();
    }, 9500);

    // Visual wash: pulse white/violet on body for the duration
    document.documentElement.style.setProperty('--fae-source-wash', '1');
    setTimeout(() => {
      document.documentElement.style.setProperty('--fae-source-wash', '0');
    }, 10000);
  }

  // ── Mute toggle ───────────────────────────────────────────────────────────

  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem('fae_audio_muted', String(this._muted));
    if (!this._ready) return this._muted;
    const now = this.ctx.currentTime;
    if (this._muted) {
      this.gain.gain.setTargetAtTime(0,             now, 0.3);
    } else {
      this.gain.gain.setTargetAtTime(this._volume,  now, 0.5);
    }
    return this._muted;
  }

  get isMuted() { return this._muted; }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const somatic = new SomaticAcoustics();
