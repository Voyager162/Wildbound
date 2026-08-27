import {
  bindingLabel,
  CONTROL_ACTIONS,
  createDefaultGameSettings,
  normalizeGameSettings,
  type AmbientVolume,
  type ControlAction,
  type ControlBinding,
  type GameSettings
} from '../settings/GameSettings';

type PausePage = 'pause' | 'settings' | 'controls' | 'audio' | 'video-performance' | 'video-quality';

interface PauseMenuOverlayOptions {
  readonly onResume: () => void;
  readonly onReturnToMainMenu: () => void;
  readonly onSettingsChanged: (settings: GameSettings) => void;
}

interface ControlDefinition {
  readonly action: ControlAction;
  readonly label: string;
  readonly description: string;
}

const MOVEMENT_CONTROLS: readonly ControlDefinition[] = [
  { action: 'moveUp', label: 'Move up', description: 'Primary north movement' },
  { action: 'moveDown', label: 'Move down', description: 'Primary south movement' },
  { action: 'moveLeft', label: 'Move left', description: 'Primary west movement' },
  { action: 'moveRight', label: 'Move right', description: 'Primary east movement' },
  { action: 'moveUpAlternate', label: 'Move up (alternate)', description: 'Secondary north movement' },
  { action: 'moveDownAlternate', label: 'Move down (alternate)', description: 'Secondary south movement' },
  { action: 'moveLeftAlternate', label: 'Move left (alternate)', description: 'Secondary west movement' },
  { action: 'moveRightAlternate', label: 'Move right (alternate)', description: 'Secondary east movement' }
];

const ACTION_CONTROLS: readonly ControlDefinition[] = [
  { action: 'harvestAttack', label: 'Harvest / attack', description: 'Hold to harvest a highlighted resource or mine cave ore' },
  { action: 'openInventory', label: 'Open inventory', description: 'Open or close inventory and crafting' },
  { action: 'enterExitCave', label: 'Enter / exit cave', description: 'Use a nearby cave entrance or surface exit' },
  { action: 'pickUpItem', label: 'Pick up item', description: 'Collect a nearby dropped resource' },
  { action: 'pickUpUtility', label: 'Pick up utility', description: 'Pack up a nearby placed utility when it is empty' },
  { action: 'placeUtility', label: 'Place utility', description: 'Place the selected utility at its green placement outline' },
  { action: 'accessUtility', label: 'Access utility', description: 'Open a nearby placed utility' },
  { action: 'consumeTonic', label: 'Consume tonic', description: 'Hold while a tonic is selected to drink it' },
  { action: 'worldMap', label: 'World map', description: 'Open or close the exploration map' },
  { action: 'pauseMenu', label: 'Pause menu', description: 'Open this menu' },
  { action: 'debugOverlay', label: 'Debug information', description: 'Toggle the performance and world diagnostic panel' }
];

const AMBIENT_VOLUME_CHOICES: readonly { readonly value: AmbientVolume; readonly label: string }[] = [
  { value: 0, label: 'Muted' },
  { value: 0.35, label: 'Quiet' },
  { value: 0.55, label: 'Low' },
  { value: 0.72, label: 'Balanced' },
  { value: 0.9, label: 'Full' },
  { value: 1, label: 'Maximum' }
];

const createMenuButton = (label: string, style: 'primary' | 'secondary' | 'danger' = 'secondary'): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pause-menu-button pause-menu-button--${style}`;
  button.textContent = label;
  return button;
};

// The pause menu is DOM-backed so it can offer native controls and keyboard capture without
// competing with Phaser's world input. It is only interactive while paused.
export class PauseMenuOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private page: PausePage = 'pause';
  private open = false;
  private bindingAction: ControlAction | null = null;
  private settings: GameSettings;

  constructor(parent: HTMLElement, settings: GameSettings, private readonly options: PauseMenuOverlayOptions) {
    this.settings = normalizeGameSettings(settings) ?? createDefaultGameSettings();
    this.element = document.createElement('div');
    this.element.className = 'pause-menu-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('aria-label', 'Paused game menu');

    const backdrop = document.createElement('div');
    backdrop.className = 'pause-menu-overlay__backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    this.panel = document.createElement('div');
    this.panel.className = 'pause-menu-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.element.append(backdrop, this.panel);
    parent.append(this.element);
    this.render();
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    if (!open) {
      this.cancelBinding();
      this.page = 'pause';
      window.removeEventListener('keydown', this.handleMenuKeyDown, true);
    } else {
      window.addEventListener('keydown', this.handleMenuKeyDown, true);
    }
    this.element.classList.toggle('is-open', open);
    this.element.setAttribute('aria-hidden', String(!open));
    if (open) {
      this.render();
      requestAnimationFrame(() => this.panel.querySelector<HTMLElement>('button')?.focus());
    }
  }

  setSettings(settings: GameSettings): void {
    const normalized = normalizeGameSettings(settings);
    if (!normalized) {
      return;
    }
    this.settings = normalized;
    if (this.open) {
      this.render(true);
    }
  }

  handleEscape(): void {
    if (!this.open) {
      return;
    }
    if (this.bindingAction) {
      this.cancelBinding();
      this.render(true);
      return;
    }
    this.goBack();
  }

  destroy(): void {
    this.cancelBinding();
    window.removeEventListener('keydown', this.handleMenuKeyDown, true);
    this.element.remove();
  }

  private render(preserveBodyScroll = false): void {
    // Rebinding redraws the button labels, but it must not send a player back to the top of the
    // long controls list every time they select or finish a binding.
    const previousBody = this.panel.querySelector<HTMLElement>('.pause-menu-body');
    const previousScrollTop = preserveBodyScroll ? previousBody?.scrollTop ?? 0 : 0;
    this.panel.replaceChildren();
    const header = document.createElement('header');
    header.className = 'pause-menu-header';
    const heading = document.createElement('div');
    heading.className = 'pause-menu-heading';
    const eyebrow = document.createElement('span');
    eyebrow.textContent = this.page === 'pause' ? 'Wildbound' : 'Paused · Settings';
    const title = document.createElement('h2');
    title.textContent = this.titleForPage();
    heading.append(eyebrow, title);
    const resume = createMenuButton('Back to game', 'primary');
    resume.classList.add('pause-menu-header__resume');
    resume.addEventListener('click', () => this.options.onResume());
    header.append(heading, resume);

    const body = document.createElement('div');
    body.className = 'pause-menu-body';
    switch (this.page) {
      case 'pause': this.renderPause(body); break;
      case 'settings': this.renderSettings(body); break;
      case 'controls': this.renderControls(body); break;
      case 'audio': this.renderAudio(body); break;
      case 'video-performance': this.renderVideo(body, 'performance'); break;
      case 'video-quality': this.renderVideo(body, 'quality'); break;
    }
    this.panel.append(header, body);
    if (preserveBodyScroll && previousScrollTop > 0) {
      requestAnimationFrame(() => {
        body.scrollTop = previousScrollTop;
      });
    }
  }

  private titleForPage(): string {
    switch (this.page) {
      case 'pause': return 'Game paused';
      case 'settings': return 'Settings';
      case 'controls': return 'Controls';
      case 'audio': return 'Audio options';
      case 'video-performance': return 'Video options';
      case 'video-quality': return 'Video options';
    }
  }

  private renderPause(body: HTMLElement): void {
    const actions = document.createElement('div');
    actions.className = 'pause-menu-actions';
    const resume = createMenuButton('Back to game', 'primary');
    resume.addEventListener('click', () => this.options.onResume());
    const settings = createMenuButton('Settings');
    settings.addEventListener('click', () => this.navigate('settings'));
    const mainMenu = createMenuButton('Return to main menu', 'danger');
    mainMenu.addEventListener('click', () => this.options.onReturnToMainMenu());
    actions.append(resume, settings, mainMenu);
    body.append(actions);
  }

  private renderSettings(body: HTMLElement): void {
    const choices = document.createElement('div');
    choices.className = 'pause-menu-choice-grid';
    choices.append(
      this.createChoice('Controls', () => this.navigate('controls')),
      this.createChoice('Audio options', () => this.navigate('audio')),
      this.createChoice('Video options', () => this.navigate('video-performance'))
    );
    body.append(choices, this.createBackButton());
  }

  private renderControls(body: HTMLElement): void {
    const groups = document.createElement('div');
    groups.className = 'control-settings';
    groups.append(
      this.createControlGroup('Movement', MOVEMENT_CONTROLS),
      this.createControlGroup('Actions', ACTION_CONTROLS)
    );
    const actions = document.createElement('div');
    actions.className = 'pause-menu-footer-actions';
    const reset = createMenuButton('Reset controls');
    reset.addEventListener('click', () => {
      this.updateSettings({ ...createDefaultGameSettings(), video: this.settings.video });
    });
    actions.append(this.createBackButton(), reset);
    body.append(groups, actions);
  }

  private renderAudio(body: HTMLElement): void {
    const settings = document.createElement('div');
    settings.className = 'video-settings-list';
    settings.append(
      this.createToggleSetting(
        'Biome ambience',
        'Blends original birds, wind, foliage, surf, wetlands, and cave ambience around the player.',
        this.settings.audio.biomeAmbienceEnabled,
        (biomeAmbienceEnabled) => this.updateSettings({
          ...this.settings,
          audio: { ...this.settings.audio, biomeAmbienceEnabled }
        })
      ),
      this.createSelectSetting(
        'Ambient volume',
        'Sets the level of the biome soundscape. It is independently smooth-faded when changed.',
        this.settings.audio.ambientVolume,
        AMBIENT_VOLUME_CHOICES,
        (ambientVolume) => this.updateSettings({
          ...this.settings,
          audio: { ...this.settings.audio, ambientVolume }
        })
      )
    );
    body.append(settings, this.createBackButton());
  }

  private renderVideo(body: HTMLElement, tab: 'performance' | 'quality'): void {
    const tabs = document.createElement('div');
    tabs.className = 'video-settings-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.append(
      this.createVideoTab('Performance', 'performance', tab),
      this.createVideoTab('Quality', 'quality', tab)
    );
    const settings = document.createElement('div');
    settings.className = 'video-settings-list';
    if (tab === 'performance') {
      settings.append(
        this.createSelectSetting(
          'Maximum frame rate',
          'Limits rendering cadence to reduce heat and GPU use.',
          this.settings.video.performance.maxFps,
          [
            { value: 30, label: '30 FPS' },
            { value: 60, label: '60 FPS' },
            { value: 120, label: '120 FPS' },
            { value: 0, label: 'Unlimited' }
          ],
          (maxFps) => this.updateSettings({
            ...this.settings,
            video: { ...this.settings.video, performance: { ...this.settings.video.performance, maxFps } }
          })
        ),
        this.createSelectSetting(
          'Terrain generation range',
          'More nearby chunks reduce pop-in but use more CPU and memory.',
          this.settings.video.performance.chunkGenerationRadius,
          [
            { value: 1, label: 'Minimal · 1 chunk' },
            { value: 2, label: 'Compact · 2 chunks' },
            { value: 3, label: 'Balanced · 3 chunks' },
            { value: 4, label: 'Expanded · 4 chunks' }
          ],
          (chunkGenerationRadius) => this.updateSettings({
            ...this.settings,
            video: { ...this.settings.video, performance: { ...this.settings.video.performance, chunkGenerationRadius } }
          })
        ),
        this.createSelectSetting(
          'Terrain streaming pace',
          'Gentle spreads chunk builds further apart; rapid readies terrain sooner with more CPU work.',
          this.settings.video.performance.chunkStreamingPace,
          [
            { value: 'gentle', label: 'Gentle · smoother' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'rapid', label: 'Rapid · faster loading' }
          ],
          (chunkStreamingPace) => this.updatePerformance({ chunkStreamingPace })
        ),
        this.createSelectSetting(
          'Foliage update rate',
          'Reduces how often grass and trees update their wind motion.',
          this.settings.video.performance.foliageUpdateRate,
          [
            { value: 15, label: '15 FPS · lowest load' },
            { value: 30, label: '30 FPS · balanced' },
            { value: 60, label: '60 FPS · smooth' }
          ],
          (foliageUpdateRate) => this.updatePerformance({ foliageUpdateRate })
        ),
        this.createSelectSetting(
          'Ambient effect rate',
          'Controls the refresh rate of drifting leaves, pollen, snow, and sand.',
          this.settings.video.performance.ambientEffectsUpdateRate,
          [
            { value: 15, label: '15 FPS · lowest load' },
            { value: 25, label: '25 FPS · standard' },
            { value: 60, label: '60 FPS · smooth' }
          ],
          (ambientEffectsUpdateRate) => this.updatePerformance({ ambientEffectsUpdateRate })
        ),
        this.createSelectSetting(
          'Water update rate',
          'Reduces the refresh rate of water waves and ripples without removing them.',
          this.settings.video.performance.waterAnimationUpdateRate,
          [
            { value: 15, label: '15 FPS · lowest load' },
            { value: 30, label: '30 FPS · standard' },
            { value: 60, label: '60 FPS · smooth' }
          ],
          (waterAnimationUpdateRate) => this.updatePerformance({ waterAnimationUpdateRate })
        )
      );
    } else {
      settings.append(
        this.createSelectSetting(
          'Particle strength',
          'Controls biome motes such as leaves, pollen, snow, and drifting sand.',
          this.settings.video.quality.particleStrength,
          [
            { value: 0, label: 'Off' },
            { value: 0.5, label: 'Reduced' },
            { value: 1, label: 'Standard' },
            { value: 1.6, label: 'Rich' }
          ],
          (particleStrength) => this.updateSettings({
            ...this.settings,
            video: { ...this.settings.video, quality: { ...this.settings.video.quality, particleStrength } }
          })
        ),
        this.createToggleSetting('Animate grass and trees', 'Enables wind-driven foliage motion.', this.settings.video.quality.animateFoliage, (animateFoliage) => this.updateQuality({ animateFoliage })),
        this.createToggleSetting('Animate water', 'Enables moving water surfaces, foam, and ripples.', this.settings.video.quality.animateWater, (animateWater) => this.updateQuality({ animateWater })),
        this.createToggleSetting('Animate lava', 'Enables the flowing glow on lava pools in deep caves.', this.settings.video.quality.animateLava, (animateLava) => this.updateQuality({ animateLava })),
        this.createToggleSetting('Show ground grass', 'Draws the fine animated grass layer across suitable terrain.', this.settings.video.quality.showGroundGrass, (showGroundGrass) => this.updateQuality({ showGroundGrass })),
        this.createToggleSetting('Show swamp decorations', 'Draws floating lily pads and other moving swamp water details.', this.settings.video.quality.showSwampDecorations, (showSwampDecorations) => this.updateQuality({ showSwampDecorations })),
        this.createToggleSetting('Show night lights', 'Enables ambient glow from fireflies and other night effects.', this.settings.video.quality.showNightLights, (showNightLights) => this.updateQuality({ showNightLights })),
        this.createSelectSetting(
          'Night light detail',
          'Sets the resolution of the soft night-light overlay. Higher detail uses more GPU fill rate.',
          this.settings.video.quality.nightLightResolution,
          [
            { value: 0.35, label: 'Low' },
            { value: 0.5, label: 'Standard' },
            { value: 0.75, label: 'High' },
            { value: 1, label: 'Full resolution' }
          ],
          (nightLightResolution) => this.updateQuality({ nightLightResolution })
        )
      );
    }
    body.append(tabs, settings, this.createBackButton());
  }

  private createChoice(titleText: string, onClick: () => void): HTMLButtonElement {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'pause-menu-choice';
    const title = document.createElement('strong');
    title.textContent = titleText;
    const arrow = document.createElement('i');
    arrow.textContent = '›';
    choice.append(title, arrow);
    choice.addEventListener('click', onClick);
    return choice;
  }

  private createControlGroup(titleText: string, controls: readonly ControlDefinition[]): HTMLElement {
    const group = document.createElement('section');
    group.className = 'control-settings__group';
    const title = document.createElement('h3');
    title.textContent = titleText;
    const list = document.createElement('div');
    list.className = 'control-settings__list';
    list.append(...controls.map((control) => this.createControlRow(control)));
    group.append(title, list);
    return group;
  }

  private createControlRow(control: ControlDefinition): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'control-setting';
    row.classList.toggle('is-listening', this.bindingAction === control.action);
    const copy = document.createElement('div');
    const label = document.createElement('strong');
    label.textContent = control.label;
    copy.append(label);
    const binding = createMenuButton(
      this.bindingAction === control.action ? 'Press a key…' : bindingLabel(this.settings.controls[control.action])
    );
    binding.classList.add('control-setting__binding');
    binding.setAttribute('aria-label', `Change ${control.label}, currently ${bindingLabel(this.settings.controls[control.action])}`);
    binding.addEventListener('click', () => this.startBinding(control.action));
    row.append(copy, binding);
    return row;
  }

  private createVideoTab(label: string, tab: 'performance' | 'quality', selected: 'performance' | 'quality'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'video-settings-tab';
    const isSelected = tab === selected;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(isSelected));
    button.textContent = label;
    button.addEventListener('click', () => this.navigate(tab === 'performance' ? 'video-performance' : 'video-quality'));
    return button;
  }

  private createSelectSetting<Value extends string | number>(
    titleText: string,
    descriptionText: string,
    selected: Value,
    values: readonly { value: Value; label: string }[],
    onChange: (value: Value) => void
  ): HTMLDivElement {
    const row = this.createSettingCopy(titleText, descriptionText);
    const select = document.createElement('select');
    select.className = 'video-setting__select';
    values.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = label;
      option.selected = value === selected;
      select.append(option);
    });
    select.addEventListener('change', () => {
      const selectedValue = values.find(({ value }) => String(value) === select.value)?.value;
      if (selectedValue !== undefined) {
        onChange(selectedValue);
      }
    });
    row.append(select);
    return row;
  }

  private createToggleSetting(
    titleText: string,
    descriptionText: string,
    checked: boolean,
    onChange: (checked: boolean) => void
  ): HTMLDivElement {
    const row = this.createSettingCopy(titleText, descriptionText);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'video-setting__toggle';
    toggle.classList.toggle('is-on', checked);
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(checked));
    toggle.textContent = checked ? 'On' : 'Off';
    toggle.addEventListener('click', () => onChange(!checked));
    row.append(toggle);
    return row;
  }

  private createSettingCopy(titleText: string, descriptionText: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'video-setting';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = titleText;
    const description = document.createElement('span');
    description.textContent = descriptionText;
    copy.append(title, description);
    row.append(copy);
    return row;
  }

  private createBackButton(): HTMLButtonElement {
    const back = createMenuButton('Back');
    back.classList.add('pause-menu-back');
    back.addEventListener('click', () => this.goBack());
    return back;
  }

  private navigate(page: PausePage): void {
    this.cancelBinding();
    this.page = page;
    this.render();
  }

  private goBack(): void {
    this.cancelBinding();
    switch (this.page) {
      case 'pause': this.options.onResume(); return;
      case 'settings': this.page = 'pause'; break;
      case 'controls': this.page = 'settings'; break;
      case 'audio': this.page = 'settings'; break;
      case 'video-performance':
      case 'video-quality': this.page = 'settings'; break;
    }
    this.render();
  }

  private startBinding(action: ControlAction): void {
    this.cancelBinding();
    this.bindingAction = action;
    window.addEventListener('keydown', this.handleBindingKeyDown, true);
    window.addEventListener('pointerdown', this.handleBindingPointerDown, true);
    window.addEventListener('contextmenu', this.handleBindingContextMenu, true);
    this.render(true);
  }

  private cancelBinding(): void {
    this.bindingAction = null;
    window.removeEventListener('keydown', this.handleBindingKeyDown, true);
    window.removeEventListener('pointerdown', this.handleBindingPointerDown, true);
    window.removeEventListener('contextmenu', this.handleBindingContextMenu, true);
  }

  private readonly handleBindingKeyDown = (event: KeyboardEvent): void => {
    if (!this.bindingAction) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      this.cancelBinding();
      this.render(true);
      return;
    }
    this.commitBinding(event.code);
  };

  private readonly handleMenuKeyDown = (event: KeyboardEvent): void => {
    if (!this.open || this.bindingAction || event.code !== this.settings.controls.pauseMenu) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.handleEscape();
  };

  private readonly handleBindingPointerDown = (event: PointerEvent): void => {
    if (!this.bindingAction || event.button < 0 || event.button > 2) {
      return;
    }
    // The binding button is activated by its `click` event, which happens after its initiating
    // pointer-down. Every subsequent click, including one on the controls panel itself, is the
    // requested mouse binding and is captured before it can redraw or navigate the menu.
    event.preventDefault();
    event.stopPropagation();
    this.commitBinding(`Mouse${event.button}`);
  };

  private readonly handleBindingContextMenu = (event: MouseEvent): void => {
    if (this.bindingAction) {
      // Right Mouse is a valid binding; never let its browser menu obscure the confirmation.
      event.preventDefault();
    }
  };

  private commitBinding(binding: ControlBinding): void {
    const action = this.bindingAction;
    if (!action) {
      return;
    }
    this.cancelBinding();
    this.updateSettings({ ...this.settings, controls: { ...this.settings.controls, [action]: binding } });
  }

  private updateQuality(change: Partial<GameSettings['video']['quality']>): void {
    this.updateSettings({
      ...this.settings,
      video: { ...this.settings.video, quality: { ...this.settings.video.quality, ...change } }
    });
  }

  private updatePerformance(change: Partial<GameSettings['video']['performance']>): void {
    this.updateSettings({
      ...this.settings,
      video: { ...this.settings.video, performance: { ...this.settings.video.performance, ...change } }
    });
  }

  private updateSettings(settings: GameSettings): void {
    const normalized = normalizeGameSettings(settings);
    if (!normalized) {
      return;
    }
    this.settings = normalized;
    this.options.onSettingsChanged(normalized);
    this.render(true);
  }

  private controlDefinition(action: ControlAction): ControlDefinition {
    return [...MOVEMENT_CONTROLS, ...ACTION_CONTROLS].find((control) => control.action === action)
      ?? { action, label: CONTROL_ACTIONS.includes(action) ? action : 'Control', description: '' };
  }
}
