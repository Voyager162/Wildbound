// Menu controls are DOM-backed while world effects use Phaser. A document-level listener keeps
// their feedback consistent across the main menu, pause settings, inventory, crafting, and any
// future menu without teaching every individual button about audio.
class MenuClickAudio {
  private context: AudioContext | null = null;
  private noiseState = 0x5f3759df;

  install(): void {
    document.addEventListener('click', this.handleClick, true);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!event.isTrusted || !(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
      return;
    }
    this.play();
  };

  private play(): void {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
    }
    const context = this.context;
    // This method runs from a trusted button click, satisfying Chromium's audio-activation
    // policy without a separate permission prompt or a background audio context.
    void context.resume().catch(() => undefined);

    const duration = 0.026;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let smoothedNoise = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const whiteNoise = this.nextNoiseSample();
      smoothedNoise += (whiteNoise - smoothedNoise) * 0.36;
      const elapsed = index / context.sampleRate;
      const attack = Math.min(1, elapsed / 0.0007);
      const decay = Math.exp(-elapsed * 185);
      samples[index] = (whiteNoise * 0.62 + smoothedNoise * 0.38) * attack * decay;
    }

    const startTime = context.currentTime + 0.004;
    const source = context.createBufferSource();
    const lowPass = context.createBiquadFilter();
    const highPass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(3600, startTime);
    lowPass.Q.setValueAtTime(0.65, startTime);
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(150, startTime);
    highPass.Q.setValueAtTime(0.55, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.032, startTime + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(lowPass).connect(highPass).connect(gain).connect(context.destination);
    source.addEventListener('ended', () => {
      source.disconnect();
      lowPass.disconnect();
      highPass.disconnect();
      gain.disconnect();
    }, { once: true });
    source.start(startTime);
    source.stop(startTime + duration);
  }

  private nextNoiseSample(): number {
    let state = this.noiseState;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.noiseState = state;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  }
}

let installed = false;

export const installMenuClickAudio = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  new MenuClickAudio().install();
};
