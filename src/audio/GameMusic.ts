import {
  GAME_MUSIC_MINIMUM_SECONDS_BETWEEN_SONGS,
  GAME_MUSIC_PLAY_CHANCE_PERCENT_PER_SECOND,
  GAME_MUSIC_VOLUME
} from './gameMusicConfig';

const GAME_MUSIC_CHANCE_INTERVAL_MS = 1_000;
const minimumGapMs = (): number =>
  Math.max(60, GAME_MUSIC_MINIMUM_SECONDS_BETWEEN_SONGS) * 1_000;

const isTrackUrlList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);

// This player is intentionally independent of Phaser scenes and audio contexts. HTMLMediaElement
// streams large creator-supplied MP3s instead of decoding every track into memory, while an
// already-loaded deck prevents a successful roll from producing an audible loading pause.
class GameMusic {
  private readonly deck = new Audio();
  private trackUrls: readonly string[] = [];
  private queue: string[] = [];
  private preparedTrack: string | null = null;
  private activeTrack: string | null = null;
  private lastPlayedTrack: string | null = null;
  private readonly failedTrackUrls = new Set<string>();
  private chanceTimer: number | null = null;
  private nextEligibleTime = Number.POSITIVE_INFINITY;
  private desired = false;

  constructor() {
    this.deck.preload = 'auto';
    this.deck.volume = GAME_MUSIC_VOLUME;
    this.deck.addEventListener('ended', this.handleEnded);
    this.deck.addEventListener('error', this.handleError);
  }

  async start(): Promise<void> {
    this.stop();
    this.desired = true;
    this.nextEligibleTime = performance.now() + minimumGapMs();
    let result: unknown;
    try {
      result = await window.wildboundMusic?.listGameTracks();
    } catch {
      return;
    }
    if (!this.desired || !isTrackUrlList(result)) {
      return;
    }
    this.trackUrls = [...new Set(result)];
    this.failedTrackUrls.clear();
    this.queue = [];
    this.prepareNextTrack();
    if (this.preparedTrack) {
      this.chanceTimer = window.setInterval(this.rollForTrack, GAME_MUSIC_CHANCE_INTERVAL_MS);
    }
  }

  stop(): void {
    this.desired = false;
    if (this.chanceTimer !== null) {
      window.clearInterval(this.chanceTimer);
      this.chanceTimer = null;
    }
    this.deck.pause();
    this.deck.currentTime = 0;
    this.deck.removeAttribute('src');
    this.deck.load();
    this.deck.volume = GAME_MUSIC_VOLUME;
    this.trackUrls = [];
    this.queue = [];
    this.preparedTrack = null;
    this.activeTrack = null;
    this.lastPlayedTrack = null;
    this.failedTrackUrls.clear();
    this.nextEligibleTime = Number.POSITIVE_INFINITY;
  }

  private readonly rollForTrack = (): void => {
    if (!this.desired
      || !this.deck.paused
      || !this.preparedTrack
      || performance.now() < this.nextEligibleTime) {
      return;
    }
    const chance = Math.max(0, Math.min(100, GAME_MUSIC_PLAY_CHANCE_PERCENT_PER_SECOND));
    if (Math.random() * 100 >= chance) {
      return;
    }
    const track = this.preparedTrack;
    this.preparedTrack = null;
    this.activeTrack = track;
    this.lastPlayedTrack = track;
    this.deck.currentTime = 0;
    this.deck.volume = GAME_MUSIC_VOLUME;
    void this.deck.play().catch(() => {
      if (!this.desired) {
        return;
      }
      // A transient playback rejection should not consume the song or bypass the next roll.
      this.preparedTrack = track;
      this.activeTrack = null;
    });
  };

  private readonly handleEnded = (): void => {
    if (!this.desired) {
      return;
    }
    this.activeTrack = null;
    this.nextEligibleTime = performance.now() + minimumGapMs();
    this.prepareNextTrack();
  };

  private readonly handleError = (): void => {
    if (!this.desired) {
      return;
    }
    const failedTrack = this.activeTrack ?? this.preparedTrack;
    if (failedTrack) {
      this.failedTrackUrls.add(failedTrack);
    }
    this.activeTrack = null;
    this.preparedTrack = null;
    this.prepareNextTrack();
  };

  private prepareNextTrack(): void {
    const track = this.takeNextTrack();
    if (!track) {
      this.deck.removeAttribute('src');
      this.deck.load();
      return;
    }
    this.preparedTrack = track;
    this.deck.src = track;
    this.deck.load();
  }

  private takeNextTrack(): string | null {
    const playableTracks = this.trackUrls.filter((track) => !this.failedTrackUrls.has(track));
    if (playableTracks.length === 0) {
      return null;
    }
    if (this.queue.length === 0) {
      this.queue = [...playableTracks];
      for (let index = this.queue.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [this.queue[index], this.queue[target]] = [this.queue[target], this.queue[index]];
      }
      if (this.queue.length > 1 && this.queue[0] === this.lastPlayedTrack) {
        [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
      }
    }
    return this.queue.shift() ?? null;
  }
}

export const gameMusic = new GameMusic();
