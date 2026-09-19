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
      this.filter.connect(this.gain);
      this.gain.connect(this.ctx.destination);

      this.carrier.start();
      this.sub.start();
      this.shimmer.start();

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

  tuneToState(hz, phaelingState) {
    if (!this._ready) return;
    // Skip if identical (avoid jitter on repeated SSE events)
    if (this._currentState === phaelingState && this._currentHz === hz) return;
    this._currentState = phaelingState;
    this._currentHz    = hz;

    const now   = this.ctx.currentTime;
    const glide = 1.8;
    const cfg   = _STATE_AUDIO_CONFIG[phaelingState] || _STATE_AUDIO_CONFIG[5];

    // Glide carrier and sub to new frequencies
    this.carrier.frequency.setTargetAtTime(hz,       now, glide);
    this.sub.frequency.setTargetAtTime(    hz / 2,   now, glide);
    this.shimmer.frequency.setTargetAtTime(hz * 2,   now, glide);

    // Swap waveforms
    this.carrier.type = cfg.carrierType;
    this.sub.type     = cfg.subType;

    // Glide filter
    this.filter.frequency.setTargetAtTime(cfg.filterHz, now, glide * 0.7);
    this.filter.Q.setTargetAtTime(cfg.filterQ,           now, glide * 0.5);

    // State 1 gets shimmer; all others fade it out
    const shimTarget = phaelingState === 1 ? 0.025 : 0;
    this.shimmerGain.gain.setTargetAtTime(shimTarget, now, glide);

    // Update CSS synesthetic variables for visual pulse sync
    const pulsePeriodMs = Math.round(Math.max(1200, Math.min(8000, 432000 / hz)));
    const auraColor = { 1:'#E0B0FF', 2:'#8B0000', 3:'#00C9A7', 4:'#708090', 5:'#1F4E79' }[phaelingState] || '#1F4E79';
    document.documentElement.style.setProperty('--fae-hz-pulse',    `${pulsePeriodMs}ms`);
    document.documentElement.style.setProperty('--fae-aura-color',  auraColor);
    document.documentElement.style.setProperty('--fae-phaeling',    String(phaelingState));
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
