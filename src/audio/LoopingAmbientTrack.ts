interface LoopingAmbientTrackOptions {
  readonly url: string;
  readonly label: string;
  readonly highPassFrequency: number;
  readonly lowPassFrequency: number;
  readonly pan: number;
  readonly playbackRate: number;
  readonly loopCrossfadeSeconds: number;
}

interface LoopRegion {
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

const LOOP_GAIN_RAMP_SECONDS = 0.72;
// Let the gain release below audibility before stopping decoded sources on cave exit.
const LOOP_STOP_DELAY_MS = 3_600;
const LOOP_ANALYSIS_WINDOW_SECONDS = 0.25;
const LOOP_EDGE_ANALYSIS_LIMIT_SECONDS = 6;
const LOOP_MINIMUM_BODY_SECONDS = 8;

const rootMeanSquare = (samples: Float32Array, startIndex: number, endIndex: number): number => {
  let energy = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / Math.max(1, endIndex - startIndex));
};

// A few supplied ambience recordings have a presentation fade at their file edges. Those fades
// are useful when auditioning a one-shot, but make a cave bed breathe every time it loops. Keep
// the full file unless an edge stays clearly quieter than the recording's central body.
const loopRegionFor = (buffer: AudioBuffer): LoopRegion => {
  const samples = buffer.getChannelData(0);
  const windowSamples = Math.max(1, Math.round(buffer.sampleRate * LOOP_ANALYSIS_WINDOW_SECONDS));
  const levels: number[] = [];
  for (let start = 0; start < samples.length; start += windowSamples) {
    levels.push(rootMeanSquare(samples, start, Math.min(samples.length, start + windowSamples)));
  }
  if (levels.length < 8) {
    return { startSeconds: 0, durationSeconds: buffer.duration };
  }

  const centralLevels = levels.slice(Math.floor(levels.length * 0.2), Math.ceil(levels.length * 0.8)).sort((first, second) => first - second);
  const typicalLevel = centralLevels[Math.floor((centralLevels.length - 1) * 0.6)] ?? 0;
  const quietEdgeThreshold = Math.max(0.0015, typicalLevel * 0.58);
  const maximumTrimWindows = Math.min(
    Math.floor(LOOP_EDGE_ANALYSIS_LIMIT_SECONDS / LOOP_ANALYSIS_WINDOW_SECONDS),
    Math.floor(levels.length * 0.24)
  );
  let leadingQuietWindows = 0;
  while (leadingQuietWindows < maximumTrimWindows && levels[leadingQuietWindows] < quietEdgeThreshold) {
    leadingQuietWindows += 1;
  }
  let trailingQuietWindows = 0;
  while (trailingQuietWindows < maximumTrimWindows && levels[levels.length - 1 - trailingQuietWindows] < quietEdgeThreshold) {
    trailingQuietWindows += 1;
  }

  // A lone quiet window is ordinary cave texture, not a mastering fade. Preserve it so the
  // loop's natural variation stays intact.
  const startSeconds = leadingQuietWindows >= 2 ? leadingQuietWindows * LOOP_ANALYSIS_WINDOW_SECONDS : 0;
  const endSeconds = trailingQuietWindows >= 2
    ? buffer.duration - trailingQuietWindows * LOOP_ANALYSIS_WINDOW_SECONDS
    : buffer.duration;
  if (endSeconds - startSeconds < Math.min(LOOP_MINIMUM_BODY_SECONDS, buffer.duration * 0.55)) {
    return { startSeconds: 0, durationSeconds: buffer.duration };
  }
  return { startSeconds, durationSeconds: endSeconds - startSeconds };
};

// Bake an equal-power tail-to-head overlap into a shorter buffer, then let Web Audio loop that
// buffer natively. This is more reliable than repeatedly scheduling another MP3 source from a
// JavaScript timer: a delayed renderer frame can never leave a long-running cave silent.
const createSeamlessLoopBuffer = (
  context: AudioContext,
  sourceBuffer: AudioBuffer,
  region: LoopRegion,
  requestedCrossfadeSeconds: number
): AudioBuffer => {
  const startSample = Math.max(0, Math.min(sourceBuffer.length - 1, Math.round(region.startSeconds * sourceBuffer.sampleRate)));
  const bodySampleCount = Math.max(1, Math.min(
    sourceBuffer.length - startSample,
    Math.round(region.durationSeconds * sourceBuffer.sampleRate)
  ));
  const crossfadeSamples = Math.min(
    Math.round(requestedCrossfadeSeconds * sourceBuffer.sampleRate),
    Math.max(1, Math.floor(bodySampleCount * 0.18))
  );
  const outputSampleCount = Math.max(1, bodySampleCount - crossfadeSamples);
  const directSampleCount = Math.max(0, bodySampleCount - crossfadeSamples * 2);
  const loopBuffer = context.createBuffer(sourceBuffer.numberOfChannels, outputSampleCount, sourceBuffer.sampleRate);
  for (let channelIndex = 0; channelIndex < sourceBuffer.numberOfChannels; channelIndex += 1) {
    const source = sourceBuffer.getChannelData(channelIndex);
    const output = loopBuffer.getChannelData(channelIndex);
    // The stable loop starts immediately after its incoming head. At the next loop boundary,
    // the baked blend ends at that same position, so the waveform and perceived level continue.
    for (let sampleIndex = 0; sampleIndex < directSampleCount; sampleIndex += 1) {
      output[sampleIndex] = source[startSample + crossfadeSamples + sampleIndex];
    }
    for (let sampleIndex = 0; sampleIndex < crossfadeSamples; sampleIndex += 1) {
      const progress = crossfadeSamples === 1 ? 1 : sampleIndex / (crossfadeSamples - 1);
      const outgoing = source[startSample + bodySampleCount - crossfadeSamples + sampleIndex];
      const incoming = source[startSample + sampleIndex];
      output[directSampleCount + sampleIndex] = outgoing * Math.cos(progress * Math.PI * 0.5)
        + incoming * Math.sin(progress * Math.PI * 0.5);
    }
  }
  return loopBuffer;
};

// MP3 ambience clips rarely begin and end on matching waveform phases. The decoded recording is
// converted into one seamless buffer so Web Audio can keep it alive with a native loop.
export class LoopingAmbientTrack {
  private readonly highPass: BiquadFilterNode;
  private readonly lowPass: BiquadFilterNode;
  private readonly panner: StereoPannerNode;
  private readonly outputGain: GainNode;
  private buffer: AudioBuffer | null = null;
  private loopRegion: LoopRegion | null = null;
  private loopBuffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private loading: Promise<void> | null = null;
  private targetLevel = 0;
  private stopTimer: number | null = null;
  private destroyed = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly options: LoopingAmbientTrackOptions
  ) {
    this.highPass = context.createBiquadFilter();
    this.lowPass = context.createBiquadFilter();
    this.panner = context.createStereoPanner();
    this.outputGain = context.createGain();
    this.highPass.type = 'highpass';
    this.highPass.frequency.value = options.highPassFrequency;
    this.highPass.Q.value = 0.45;
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.value = options.lowPassFrequency;
    this.lowPass.Q.value = 0.5;
    this.panner.pan.value = options.pan;
    this.outputGain.gain.value = 0;
    this.highPass.connect(this.lowPass).connect(this.panner).connect(this.outputGain).connect(destination);
  }

  // Lets a procedural voice remain as a fallback until this optional recording is fully decoded
  // and converted into a native seamless loop.
  get isReady(): boolean {
    return this.loopBuffer !== null;
  }

  preload(): void {
    if (this.destroyed || this.buffer || this.loading) {
      return;
    }
    this.loading = fetch(this.options.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((encoded) => this.context.decodeAudioData(encoded))
      .then((decoded) => {
        if (this.destroyed) {
          return;
        }
        if (decoded.duration < 3) {
          throw new Error('recording is too short to create a seamless ambience loop');
        }
        this.buffer = decoded;
        this.loopRegion = loopRegionFor(decoded);
        this.loopBuffer = createSeamlessLoopBuffer(
          this.context,
          decoded,
          this.loopRegion,
          this.options.loopCrossfadeSeconds
        );
        if (this.targetLevel > 0) {
          this.beginLoop();
        }
      })
      .catch((error: unknown) => {
        // A missing optional recording must never make the cave or the rest of the ambient graph
        // fail. The procedural depth bed remains available as a quiet fallback.
        console.warn(`Wildbound could not load ${this.options.label} ambience.`, error);
      })
      .finally(() => {
        this.loading = null;
      });
  }

  setLevel(level: number): void {
    if (this.destroyed) {
      return;
    }
    const nextLevel = Math.max(0, Math.min(1, level));
    if (Math.abs(nextLevel - this.targetLevel) < 0.0005) {
      return;
    }
    this.targetLevel = nextLevel;
    const now = this.context.currentTime;
    this.outputGain.gain.cancelScheduledValues(now);
    this.outputGain.gain.setTargetAtTime(this.targetLevel, now, LOOP_GAIN_RAMP_SECONDS);
    if (this.targetLevel > 0) {
      this.cancelStopTimer();
      this.preload();
      this.beginLoop();
      return;
    }
    this.scheduleStop();
  }

  destroy(): void {
    this.destroyed = true;
    this.targetLevel = 0;
    this.cancelStopTimer();
    this.stopSource();
    this.highPass.disconnect();
    this.lowPass.disconnect();
    this.panner.disconnect();
    this.outputGain.disconnect();
    this.buffer = null;
    this.loopRegion = null;
    this.loopBuffer = null;
  }

  private beginLoop(): void {
    const loopBuffer = this.loopBuffer;
    if (this.destroyed || this.source || !loopBuffer) {
      return;
    }
    const source = this.context.createBufferSource();
    source.buffer = loopBuffer;
    source.loop = true;
    source.loopEnd = loopBuffer.duration;
    source.playbackRate.value = this.options.playbackRate;
    source.connect(this.highPass);
    this.source = source;
    source.addEventListener('ended', () => {
      source.disconnect();
      if (this.source === source) {
        this.source = null;
      }
    }, { once: true });
    source.start(this.context.currentTime + 0.04);
  }

  private scheduleStop(): void {
    this.cancelStopTimer();
    this.stopTimer = window.setTimeout(() => {
      this.stopTimer = null;
      if (this.targetLevel === 0) {
        this.stopSource();
      }
    }, LOOP_STOP_DELAY_MS);
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (!source) {
      return;
    }
    try {
      source.stop();
    } catch {
      // A source can already be stopped during renderer teardown.
    }
    source.disconnect();
  }

  private cancelStopTimer(): void {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }
}
