const MAIN_MENU_MUSIC_VOLUME = 0.28;
const MAIN_MENU_MUSIC_CROSSFADE_MS = 420;
// World-ready is the final handoff from menu music to the living game soundscape. A full-second
// release is long enough to sound intentional, while still leaving the player in a quiet world.
const MAIN_MENU_MUSIC_STOP_FADE_MS = 1_050;

const isTrackUrlList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);

// This player intentionally lives outside Phaser scenes. Selecting a world destroys the menu
// scene before terrain generation begins, so a scene-owned sound would briefly stop during the
// loading overlay. Two HTML audio decks keep the next shuffled MP3 preloaded for a soft handoff.
class MainMenuMusic {
  private readonly decks = [new Audio(), new Audio()];
  private readonly deckTracks: [string | null, string | null] = [null, null];
  private trackUrls: readonly string[] = [];
  private queue: string[] = [];
  private activeDeck: 0 | 1 | null = null;
  private preparedDeck: 0 | 1 | null = null;
  private lastPlayedTrack: string | null = null;
  private readonly failedTrackUrls = new Set<string>();
  private isDesired = false;
  private installed = false;
  private crossfade: { from: 0 | 1; to: 0 | 1; frame: number } | null = null;
  private stopFrame: number | null = null;

  constructor() {
    this.decks.forEach((deck, index) => {
      deck.preload = 'auto';
      deck.volume = MAIN_MENU_MUSIC_VOLUME;
      deck.addEventListener('timeupdate', () => this.maybeCrossfade(index as 0 | 1));
      deck.addEventListener('ended', () => this.handleDeckEnded(index as 0 | 1));
      deck.addEventListener('error', () => this.handleDeckError(index as 0 | 1));
    });
  }

  async start(): Promise<void> {
    this.isDesired = true;
    this.install();
    this.cancelStopFade();
    let result: unknown;
    try {
      result = await window.wildboundMusic?.listMainMenuTracks();
    } catch {
      // A missing or temporarily unavailable local directory should leave the menu functional.
      return;
    }
    if (!this.isDesired || !isTrackUrlList(result)) {
      return;
    }
    this.trackUrls = [...new Set(result)];
    this.failedTrackUrls.clear();
    this.queue = [];
    if (this.activeDeck === null) {
      this.startNextTrack(0);
    } else {
      this.requestPlayback(this.activeDeck);
    }
  }

  // Called once the playable world is on screen, never while the main menu or terrain-loading
  // overlay is still active. The brief release is deliberate: it avoids an audible hard cut.
  stop(): void {
    this.isDesired = false;
    this.cancelCrossfade();
    this.cancelStopFade();
    const startingVolumes = this.decks.map((deck) => deck.volume);
    const startedAt = performance.now();
    const fade = (): void => {
      const progress = Math.min(1, (performance.now() - startedAt) / MAIN_MENU_MUSIC_STOP_FADE_MS);
      this.decks.forEach((deck, index) => {
        deck.volume = startingVolumes[index] * (1 - progress);
      });
      if (progress < 1) {
        this.stopFrame = window.requestAnimationFrame(fade);
        return;
      }
      this.stopFrame = null;
      this.decks.forEach((deck, index) => {
        deck.pause();
        deck.currentTime = 0;
        deck.removeAttribute('src');
        deck.load();
        deck.volume = MAIN_MENU_MUSIC_VOLUME;
        this.deckTracks[index as 0 | 1] = null;
      });
      this.activeDeck = null;
      this.preparedDeck = null;
      this.lastPlayedTrack = null;
      this.queue = [];
    };
    this.stopFrame = window.requestAnimationFrame(fade);
  }

  private install(): void {
    if (this.installed) {
      return;
    }
    this.installed = true;
    // Chromium permits the first media start only from a gesture. Capture this before a world
    // button switches scenes so the same gesture can begin music that survives terrain loading.
    document.addEventListener('pointerdown', this.handleUserActivation, true);
    document.addEventListener('keydown', this.handleUserActivation, true);
  }

  private readonly handleUserActivation = (): void => {
    if (!this.isDesired) {
      return;
    }
    if (this.activeDeck === null) {
      this.startNextTrack(0);
      return;
    }
    this.requestPlayback(this.activeDeck);
  };

  private startNextTrack(deckIndex: 0 | 1): void {
    if (!this.isDesired) {
      return;
    }
    const track = this.takeNextTrack();
    if (!track) {
      return;
    }
    this.loadDeck(deckIndex, track);
    this.activeDeck = deckIndex;
    this.preparedDeck = null;
    this.lastPlayedTrack = track;
    this.requestPlayback(deckIndex);
    this.prepareFollowingTrack();
  }

  private prepareFollowingTrack(): void {
    if (!this.isDesired || this.activeDeck === null || this.preparedDeck !== null) {
      return;
    }
    const track = this.takeNextTrack();
    if (!track) {
      return;
    }
    const deckIndex = this.otherDeck(this.activeDeck);
    this.loadDeck(deckIndex, track);
    this.decks[deckIndex].volume = 0;
    this.preparedDeck = deckIndex;
  }

  private maybeCrossfade(deckIndex: 0 | 1): void {
    if (!this.isDesired || this.activeDeck !== deckIndex || this.crossfade || this.preparedDeck === null) {
      return;
    }
    const active = this.decks[deckIndex];
    if (!Number.isFinite(active.duration) || active.duration - active.currentTime > MAIN_MENU_MUSIC_CROSSFADE_MS / 1_000) {
      return;
    }
    const next = this.decks[this.preparedDeck];
    if (next.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      return;
    }
    void this.beginCrossfade(deckIndex, this.preparedDeck);
  }

  private async beginCrossfade(from: 0 | 1, to: 0 | 1): Promise<void> {
    if (!this.isDesired || this.crossfade || this.activeDeck !== from || this.preparedDeck !== to) {
      return;
    }
    const outgoing = this.decks[from];
    const incoming = this.decks[to];
    incoming.currentTime = 0;
    incoming.volume = 0;
    try {
      await incoming.play();
    } catch {
      // If a browser has not received its first gesture yet, the ended handler will retain the
      // prepared deck and retry once activation occurs instead of skipping a song.
      return;
    }
    if (!this.isDesired || this.activeDeck !== from || this.preparedDeck !== to) {
      incoming.pause();
      return;
    }
    const startedAt = performance.now();
    const fade = (): void => {
      const progress = Math.min(1, (performance.now() - startedAt) / MAIN_MENU_MUSIC_CROSSFADE_MS);
      outgoing.volume = MAIN_MENU_MUSIC_VOLUME * (1 - progress);
      incoming.volume = MAIN_MENU_MUSIC_VOLUME * progress;
      if (progress < 1 && this.crossfade) {
        this.crossfade.frame = window.requestAnimationFrame(fade);
        return;
      }
      outgoing.pause();
      outgoing.currentTime = 0;
      outgoing.volume = MAIN_MENU_MUSIC_VOLUME;
      this.activeDeck = to;
      this.preparedDeck = null;
      this.lastPlayedTrack = this.deckTracks[to];
      this.crossfade = null;
      this.prepareFollowingTrack();
    };
    this.crossfade = { from, to, frame: window.requestAnimationFrame(fade) };
  }

  private handleDeckEnded(deckIndex: 0 | 1): void {
    if (!this.isDesired || this.activeDeck !== deckIndex) {
      return;
    }
    if (this.crossfade) {
      const { to } = this.crossfade;
      this.cancelCrossfade();
      this.decks[deckIndex].pause();
      this.decks[deckIndex].currentTime = 0;
      this.decks[deckIndex].volume = MAIN_MENU_MUSIC_VOLUME;
      this.activeDeck = to;
      this.preparedDeck = null;
      this.lastPlayedTrack = this.deckTracks[to];
      this.decks[to].volume = MAIN_MENU_MUSIC_VOLUME;
      this.requestPlayback(to);
      this.prepareFollowingTrack();
      return;
    }
    if (this.preparedDeck !== null) {
      const next = this.preparedDeck;
      this.decks[next].volume = MAIN_MENU_MUSIC_VOLUME;
      this.activeDeck = next;
      this.preparedDeck = null;
      this.lastPlayedTrack = this.deckTracks[next];
      this.requestPlayback(next);
      this.prepareFollowingTrack();
      return;
    }
    this.startNextTrack(this.otherDeck(deckIndex));
  }

  private handleDeckError(deckIndex: 0 | 1): void {
    if (!this.isDesired) {
      return;
    }
    const failedTrack = this.deckTracks[deckIndex];
    if (failedTrack) {
      this.failedTrackUrls.add(failedTrack);
    }
    if (this.preparedDeck === deckIndex) {
      this.preparedDeck = null;
      this.deckTracks[deckIndex] = null;
      this.prepareFollowingTrack();
      return;
    }
    if (this.activeDeck === deckIndex) {
      if (this.preparedDeck !== null) {
        const next = this.preparedDeck;
        this.decks[next].volume = MAIN_MENU_MUSIC_VOLUME;
        this.activeDeck = next;
        this.preparedDeck = null;
        this.lastPlayedTrack = this.deckTracks[next];
        this.requestPlayback(next);
        this.prepareFollowingTrack();
        return;
      }
      this.activeDeck = null;
      this.startNextTrack(this.otherDeck(deckIndex));
    }
  }

  private loadDeck(deckIndex: 0 | 1, track: string): void {
    const deck = this.decks[deckIndex];
    deck.pause();
    deck.currentTime = 0;
    deck.volume = MAIN_MENU_MUSIC_VOLUME;
    deck.src = track;
    deck.load();
    this.deckTracks[deckIndex] = track;
  }

  private requestPlayback(deckIndex: 0 | 1): void {
    void this.decks[deckIndex].play().catch(() => undefined);
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

  private otherDeck(deckIndex: 0 | 1): 0 | 1 {
    return deckIndex === 0 ? 1 : 0;
  }

  private cancelCrossfade(): void {
    if (!this.crossfade) {
      return;
    }
    window.cancelAnimationFrame(this.crossfade.frame);
    this.crossfade = null;
  }

  private cancelStopFade(): void {
    if (this.stopFrame !== null) {
      window.cancelAnimationFrame(this.stopFrame);
      this.stopFrame = null;
    }
  }
}

export const mainMenuMusic = new MainMenuMusic();
