import Phaser from 'phaser';
import type { WorldSelection } from '../save/WorldLibrary';
import { mainMenuMusic } from '../audio/MainMenuMusic';
import { MainMenuOverlay } from '../ui/MainMenuOverlay';

export class MainMenuScene extends Phaser.Scene {
  private menuOverlay: MainMenuOverlay | null = null;

  constructor() {
    super('main-menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d1b20');
    void mainMenuMusic.start();
    const gameElement = document.getElementById('game');
    if (!gameElement) {
      throw new Error('Wildbound game container was not found.');
    }

    this.menuOverlay = new MainMenuOverlay(gameElement, {
      onWorldSelected: (selection) => this.startAdventure(selection)
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  private startAdventure(selection: WorldSelection): void {
    this.scene.start('adventure', selection);
  }

  private handleShutdown(): void {
    this.menuOverlay?.destroy();
    this.menuOverlay = null;
  }
}
