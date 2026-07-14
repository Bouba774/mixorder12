/**
 * Chromagram extraction — audio → 12-D pitch class vector.
 *
 * Pipeline:
 *   1. Decode the audio file via WebAudio (OfflineAudioContext).
 *   2. Downsample to mono at ~11025 Hz.
 *   3. Slide a Hann-windowed FFT (2048 samples, 50% hop) across the signal.
 *   4. Map each bin to its nearest pitch class and accumulate magnitude.
 *   5. Normalize the 12-D vector.
 *
 * This is the standard front-end used by all real key detectors (Essentia,
 * LibKeyFinder, MIRtoolbox). The downstream engines correlate this vector
 * with tonal profiles to guess the key.
 */

import FFTLib from "fft.js";

const TARGET_SR = 11025;
const FFT_SIZE = 2048;
const HOP = 1024;
/** Ignore energy below A0 / above C8 — clean fundamentals only. */
const MIN_FREQ = 27.5;
const MAX_FREQ = 4186;

/** Cheap linear resampler — accurate enough for chroma at 11 kHz. */
function resampleLinear(input: Float32Array, srcSr: number, dstSr: number): Float32Array {
  if (srcSr === dstSr) return input;
  const ratio = srcSr / dstSr;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const t = x - i0;
    out[i] = input[i0] * (1 - t) + (input[i0 + 1] ?? input[i0]) * t;
  }
  return out;
}

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const l = buffer.getChannelData(0);
  const r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = 0.5 * (l[i] + r[i]);
  return out;
}

/** Precomputed Hann window. */
const hann = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  return w;
})();

/** Precomputed bin → pitch class map (based on TARGET_SR + FFT_SIZE). */
const binPitchClass = (() => {
  const map = new Int16Array(FFT_SIZE / 2);
  for (let k = 0; k < map.length; k++) {
    const freq = (k * TARGET_SR) / FFT_SIZE;
    if (freq < MIN_FREQ || freq > MAX_FREQ) { map[k] = -1; continue; }
    // MIDI note number (float); pitch class = round % 12
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    map[k] = pc;
  }
  return map;
})();

/**
 * Fetch the audio file and decode it with WebAudio.
 * We use a short-lived OfflineAudioContext so decoding works even in the
 * Capacitor WebView with autoplay policies.
 */
export async function decodeToMono(url: string, signal?: AbortSignal): Promise<{
  samples: Float32Array;
  sampleRate: number;
}> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext!;
  if (!AC) throw new Error("WebAudio unavailable");
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const mono = toMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, TARGET_SR);
    return { samples: resampled, sampleRate: TARGET_SR };
  } finally {
    try { await ctx.close(); } catch { /* Safari sometimes throws */ }
  }
}

/**
 * Compute a single 12-D chroma vector for the whole track.
 * Yields to the event loop every ~250 windows to keep the UI responsive.
 */
export async function chromagram(
  samples: Float32Array,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const fft = new FFTLib(FFT_SIZE);
  const complex = fft.createComplexArray();
  const frame = new Float32Array(FFT_SIZE);
  const chroma = new Float32Array(12);
  let winCount = 0;

  for (let start = 0; start + FFT_SIZE <= samples.length; start += HOP) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    // Window
    for (let i = 0; i < FFT_SIZE; i++) frame[i] = samples[start + i] * hann[i];

    fft.realTransform(complex, frame);
    // Half-spectrum magnitudes
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      const pc = binPitchClass[k];
      if (pc < 0) continue;
      const re = complex[2 * k];
      const im = complex[2 * k + 1];
      chroma[pc] += Math.sqrt(re * re + im * im);
    }

    winCount++;
    if ((winCount & 0xff) === 0) {
      // Yield periodically so the WebView stays smooth.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // L1-normalize so downstream correlations are scale-invariant.
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;
  return chroma;
}