import {
  DEFAULT_WORLD_NAME,
  MAX_WORLD_NAME_LENGTH,
  MAX_WORLD_SEED_LENGTH,
  isWorldSummary,
  isWorldSummaryList,
  type WorldMode,
  type WorldSelection,
  type WorldSummary
} from '../save/WorldLibrary';
import { MenuBackdrop } from './MenuBackdrop';

interface MainMenuOverlayOptions {
  readonly onWorldSelected: (selection: WorldSelection) => void;
}

const SEED_WORDS = [
  'amber', 'ash', 'bramble', 'cedar', 'cinder', 'dawn', 'ember', 'fern', 'glade', 'hollow',
  'ivy', 'juniper', 'lumen', 'moss', 'north', 'oak', 'ripple', 'solstice', 'thistle', 'wild'
] as const;

// A blank seed keeps the one-click discovery flow. This is intentionally not exposed as a
// separate control: leaving the seed field blank is the single way to request a fresh world.
const createSeed = (): string => {
  const randomWord = (): string => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
  const suffix = Math.floor(Math.random() * 0x1_0000).toString(16).padStart(4, '0');
  return `${randomWord()}-${randomWord()}-${suffix}`;
};

const worldLabel = (world: WorldSummary): string => world.name;

// This DOM overlay is intentionally independent from the adventure UI. It lives only while the
// menu scene is active, so none of its animations or canvas work touch the streamed world.
export class MainMenuOverlay {
  private readonly element: HTMLDivElement;
  private readonly backdrop: MenuBackdrop;
  private readonly stage: HTMLDivElement;
  private worlds: readonly WorldSummary[] = [];
  private isCreating = false;
  private isDeleting = false;
  private isRenaming = false;

  constructor(parent: HTMLElement, private readonly options: MainMenuOverlayOptions) {
    this.element = document.createElement('div');
    this.element.className = 'main-menu-overlay';
    this.element.setAttribute('aria-label', 'Wildbound main menu');
    parent.append(this.element);
    this.backdrop = new MenuBackdrop(this.element);
    this.stage = document.createElement('div');
    this.stage.className = 'main-menu-stage';
    this.element.append(this.stage);
    void this.loadWorlds();
  }

  destroy(): void {
    this.backdrop.destroy();
    this.element.remove();
  }

  private async loadWorlds(): Promise<void> {
    this.renderLoading();
    try {
      const result = await window.wildboundWorlds?.list();
      this.worlds = isWorldSummaryList(result) ? [...result].sort((first, second) => first.ordinal - second.ordinal) : [];
      this.renderWorldList();
    } catch (error) {
      console.warn('Wildbound could not load its local world library.', error);
      this.renderWorldList('Your local world library could not be opened.');
    }
  }

  private renderLoading(): void {
    this.stage.replaceChildren(this.createBrand(), this.createMessage('Opening world library…'));
  }

  private renderWorldList(errorMessage = ''): void {
    this.isCreating = false;
    this.stage.replaceChildren();
    const brand = this.createBrand();
    const panel = document.createElement('section');
    panel.className = 'main-menu-panel main-menu-panel--worlds';
    panel.setAttribute('aria-label', 'World selection');

    const heading = document.createElement('div');
    heading.className = 'main-menu-panel__heading';
    const title = document.createElement('h1');
    title.textContent = this.worlds.length > 0 ? 'Choose your world' : 'Begin your journey';
    heading.append(title);
    if (this.worlds.length === 0) {
      const subtitle = document.createElement('p');
      subtitle.textContent = 'Create your first procedural world to step into the wilds.';
      heading.append(subtitle);
    }
    panel.append(heading);

    if (this.worlds.length > 0) {
      const worldList = document.createElement('div');
      worldList.className = 'world-list';
      worldList.setAttribute('aria-label', 'Saved worlds');
      worldList.append(...this.worlds.map((world) => this.createWorldCard(world)));
      panel.append(worldList);
    }

    if (errorMessage) {
      panel.append(this.createMessage(errorMessage, true));
    }

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'menu-button menu-button--primary menu-button--create';
    createButton.textContent = 'Create new world';
    createButton.addEventListener('click', () => this.renderCreateWorld());
    panel.append(createButton);
    this.stage.append(brand, panel);
  }

  private renderCreateWorld(errorMessage = '', initialMode: WorldMode = 'survival'): void {
    this.isCreating = false;
    this.stage.replaceChildren();
    const brand = this.createBrand();
    const panel = document.createElement('section');
    panel.className = 'main-menu-panel main-menu-panel--create';
    panel.setAttribute('aria-label', 'Create a world');
    const heading = document.createElement('div');
    heading.className = 'main-menu-panel__heading';
    const title = document.createElement('h1');
    title.textContent = 'Create a world';
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Name your world and optionally choose a seed to make a place that will always regenerate exactly the same way.';
    heading.append(title, subtitle);

    const form = document.createElement('form');
    form.className = 'world-create-form';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'world-seed-label';
    nameLabel.htmlFor = 'world-name';
    nameLabel.textContent = 'World name';
    const nameInput = document.createElement('input');
    nameInput.id = 'world-name';
    nameInput.className = 'world-seed-input';
    nameInput.type = 'text';
    nameInput.maxLength = MAX_WORLD_NAME_LENGTH;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;
    nameInput.placeholder = DEFAULT_WORLD_NAME;
    const label = document.createElement('label');
    label.className = 'world-seed-label';
    label.htmlFor = 'world-seed';
    label.textContent = 'World seed';
    const input = document.createElement('input');
    input.id = 'world-seed';
    input.className = 'world-seed-input';
    input.type = 'text';
    input.maxLength = MAX_WORLD_SEED_LENGTH;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Leave blank for a new discovery';
    input.setAttribute('aria-describedby', 'world-seed-help');
    const help = document.createElement('p');
    help.id = 'world-seed-help';
    help.className = 'world-seed-help';
    help.textContent = 'The same seed creates the same terrain, landmarks, caves, and resources.';
    const modePicker = document.createElement('fieldset');
    modePicker.className = 'world-mode-picker';
    const modeLegend = document.createElement('legend');
    modeLegend.textContent = 'Game mode';
    const modeHelp = document.createElement('p');
    modeHelp.className = 'world-mode-picker__help';
    modeHelp.textContent = 'Survival keeps normal progression. Creative opens the full item catalogue in your inventory.';
    const modeOptions = document.createElement('div');
    modeOptions.className = 'world-mode-picker__options';
    let selectedMode = initialMode;
    const modeButtons = new Map<WorldMode, HTMLButtonElement>();
    const updateModeButtons = (): void => {
      modeButtons.forEach((button, mode) => {
        const selected = mode === selectedMode;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };
    ([
      ['survival', 'Survival', 'Gather, craft, and progress through the wilderness.'],
      ['creative', 'Creative', 'Use the inventory catalogue to take any available item.']
    ] as const).forEach(([mode, label, description]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `world-mode-option world-mode-option--${mode}`;
      option.setAttribute('aria-pressed', 'false');
      const title = document.createElement('strong');
      title.textContent = label;
      const detail = document.createElement('small');
      detail.textContent = description;
      option.append(title, detail);
      option.addEventListener('click', () => {
        selectedMode = mode;
        updateModeButtons();
      });
      modeButtons.set(mode, option);
      modeOptions.append(option);
    });
    updateModeButtons();
    modePicker.append(modeLegend, modeHelp, modeOptions);
    const actions = document.createElement('div');
    actions.className = 'menu-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'menu-button menu-button--secondary';
    back.textContent = 'Back';
    back.addEventListener('click', () => this.renderWorldList());
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'menu-button menu-button--primary';
    submit.textContent = 'Create world';
    actions.append(back, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createWorld(input.value, nameInput.value, selectedMode, submit);
    });

    form.append(nameLabel, nameInput, label, input, help, modePicker, actions);
    panel.append(heading, form);
    if (errorMessage) {
      panel.append(this.createMessage(errorMessage, true));
    }
    this.stage.append(brand, panel);
    requestAnimationFrame(() => nameInput.focus());
  }

  private createWorld(inputSeed: string, inputName: string, mode: WorldMode, submit: HTMLButtonElement): Promise<void> {
    if (this.isCreating) {
      return Promise.resolve();
    }
    const seed = inputSeed.trim() || createSeed();
    const name = inputName.trim() || DEFAULT_WORLD_NAME;
    if (seed.length > MAX_WORLD_SEED_LENGTH) {
      this.renderCreateWorld(`Seeds can be at most ${MAX_WORLD_SEED_LENGTH} characters.`, mode);
      return Promise.resolve();
    }
    if (name.length > MAX_WORLD_NAME_LENGTH) {
      this.renderCreateWorld(`World names can be at most ${MAX_WORLD_NAME_LENGTH} characters.`, mode);
      return Promise.resolve();
    }
    const api = window.wildboundWorlds;
    if (!api) {
      this.renderCreateWorld('Local world storage is unavailable in this session.', mode);
      return Promise.resolve();
    }

    this.isCreating = true;
    submit.disabled = true;
    submit.textContent = 'Creating…';
    return api.create(seed, name, mode)
      .then((created) => {
        if (!isWorldSummary(created)) {
          throw new Error('The new world record was invalid.');
        }
        this.options.onWorldSelected({ id: created.id, seed: created.seed, mode: created.mode });
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not create a world.', error);
        this.renderCreateWorld('This world could not be created. Please try another seed.', mode);
      })
      .finally(() => {
        this.isCreating = false;
      });
  }

  private createWorldCard(world: WorldSummary): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'world-card-row';
    const enterButton = document.createElement('button');
    enterButton.type = 'button';
    enterButton.className = 'world-card';
    enterButton.setAttribute('aria-label', `Enter ${worldLabel(world)}, ${world.mode} mode, seed ${world.seed}`);
    const badge = document.createElement('span');
    badge.className = 'world-card__badge';
    badge.textContent = String(world.ordinal).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'world-card__copy';
    const label = document.createElement('strong');
    label.textContent = worldLabel(world);
    const seed = document.createElement('small');
    seed.textContent = `Seed · ${world.seed} · ${world.mode === 'creative' ? 'Creative' : 'Survival'}`;
    copy.append(label, seed);
    const arrow = document.createElement('span');
    arrow.className = 'world-card__arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    enterButton.append(badge, copy, arrow);
    enterButton.addEventListener('click', () => this.options.onWorldSelected({ id: world.id, seed: world.seed, mode: world.mode }));

    const actions = document.createElement('div');
    actions.className = 'world-card-actions';
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.className = 'world-rename-button';
    renameButton.setAttribute('aria-label', `Rename ${worldLabel(world)}`);
    renameButton.title = `Rename ${worldLabel(world)}`;
    renameButton.append(this.createRenameIcon());
    renameButton.addEventListener('click', () => this.renderRenameWorld(world));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'world-delete-button';
    deleteButton.setAttribute('aria-label', `Delete ${worldLabel(world)}`);
    deleteButton.title = `Delete ${worldLabel(world)}`;
    deleteButton.append(this.createDeleteIcon());
    deleteButton.addEventListener('click', () => this.renderDeleteConfirmation(world));
    actions.append(renameButton, deleteButton);
    row.append(enterButton, actions);
    return row;
  }

  private renderRenameWorld(world: WorldSummary): void {
    if (this.isRenaming || this.element.querySelector('.world-dialog-modal')) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'world-dialog-modal world-rename-modal';
    const dialog = document.createElement('section');
    dialog.className = 'world-rename-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'world-rename-title');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'world-rename-dialog__eyebrow';
    eyebrow.textContent = 'World library';
    const title = document.createElement('h2');
    title.id = 'world-rename-title';
    title.textContent = 'Rename world';
    const description = document.createElement('p');
    description.textContent = `Choose a name for the world with seed ${world.seed}.`;
    const form = document.createElement('form');
    form.className = 'world-rename-form';
    const label = document.createElement('label');
    label.htmlFor = 'world-rename-input';
    label.textContent = 'World name';
    const input = document.createElement('input');
    input.id = 'world-rename-input';
    input.className = 'world-seed-input';
    input.type = 'text';
    input.maxLength = MAX_WORLD_NAME_LENGTH;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = world.name;
    const feedback = document.createElement('p');
    feedback.className = 'world-rename-dialog__feedback';
    feedback.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'world-rename-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'menu-button menu-button--secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => modal.remove());
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'menu-button menu-button--primary';
    save.textContent = 'Save name';
    actions.append(cancel, save);
    form.append(label, input, feedback, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.renameWorld(world, input.value, modal, save, cancel, feedback);
    });
    dialog.append(eyebrow, title, description, form);
    modal.append(dialog);
    this.element.append(modal);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private renameWorld(
    world: WorldSummary,
    inputName: string,
    modal: HTMLDivElement,
    save: HTMLButtonElement,
    cancel: HTMLButtonElement,
    feedback: HTMLParagraphElement
  ): Promise<void> {
    if (this.isRenaming) {
      return Promise.resolve();
    }
    const name = inputName.trim() || DEFAULT_WORLD_NAME;
    if (name.length > MAX_WORLD_NAME_LENGTH) {
      feedback.textContent = `World names can be at most ${MAX_WORLD_NAME_LENGTH} characters.`;
      return Promise.resolve();
    }
    const api = window.wildboundWorlds;
    if (!api) {
      feedback.textContent = 'Local world storage is unavailable in this session.';
      return Promise.resolve();
    }

    this.isRenaming = true;
    save.disabled = true;
    cancel.disabled = true;
    save.textContent = 'Saving…';
    return api.rename(world.id, name)
      .then((renamed) => {
        if (!isWorldSummary(renamed)) {
          throw new Error('The renamed world record was invalid.');
        }
        this.worlds = this.worlds.map((candidate) => candidate.id === world.id ? renamed : candidate);
        modal.remove();
        this.renderWorldList();
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not rename a world.', error);
        feedback.textContent = 'This world could not be renamed. Please try again.';
        save.disabled = false;
        cancel.disabled = false;
        save.textContent = 'Save name';
      })
      .finally(() => {
        this.isRenaming = false;
      });
  }

  private renderDeleteConfirmation(world: WorldSummary): void {
    if (this.isDeleting || this.element.querySelector('.world-dialog-modal')) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'world-dialog-modal world-delete-modal';
    const dialog = document.createElement('section');
    dialog.className = 'world-delete-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'world-delete-title');
    dialog.setAttribute('aria-describedby', 'world-delete-description');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'world-delete-dialog__eyebrow';
    eyebrow.textContent = 'Permanent action';
    const title = document.createElement('h2');
    title.id = 'world-delete-title';
    title.textContent = `Delete ${worldLabel(world)}?`;
    const description = document.createElement('p');
    description.id = 'world-delete-description';
    description.textContent = `This permanently removes the world and everything saved in it. Seed: ${world.seed}`;
    const feedback = document.createElement('p');
    feedback.className = 'world-delete-dialog__feedback';
    feedback.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'world-delete-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'menu-button menu-button--secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => modal.remove());
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'menu-button menu-button--danger';
    confirm.textContent = 'Delete world';
    confirm.addEventListener('click', () => {
      void this.deleteWorld(world, modal, confirm, cancel, feedback);
    });
    dialog.append(eyebrow, title, description, feedback, actions);
    actions.append(cancel, confirm);
    modal.append(dialog);
    this.element.append(modal);
    requestAnimationFrame(() => cancel.focus());
  }

  private deleteWorld(
    world: WorldSummary,
    modal: HTMLDivElement,
    confirm: HTMLButtonElement,
    cancel: HTMLButtonElement,
    feedback: HTMLParagraphElement
  ): Promise<void> {
    if (this.isDeleting) {
      return Promise.resolve();
    }
    const api = window.wildboundWorlds;
    if (!api) {
      feedback.textContent = 'Local world storage is unavailable in this session.';
      return Promise.resolve();
    }

    this.isDeleting = true;
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.textContent = 'Deleting…';
    return api.delete(world.id)
      .then(() => {
        this.worlds = this.worlds.filter((candidate) => candidate.id !== world.id);
        modal.remove();
        this.renderWorldList();
      })
      .catch((error: unknown) => {
        console.warn('Wildbound could not delete a world.', error);
        feedback.textContent = 'This world could not be deleted. Please try again.';
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = 'Delete world';
      })
      .finally(() => {
        this.isDeleting = false;
      });
  }

  private createDeleteIcon(): SVGSVGElement {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    icon.setAttribute('class', 'world-delete-button__icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const lid = document.createElementNS(namespace, 'path');
    lid.setAttribute('d', 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5');
    lid.setAttribute('fill', 'none');
    lid.setAttribute('stroke', 'currentColor');
    lid.setAttribute('stroke-width', '2');
    lid.setAttribute('stroke-linecap', 'round');
    lid.setAttribute('stroke-linejoin', 'round');
    icon.append(lid);
    return icon;
  }

  private createRenameIcon(): SVGSVGElement {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    icon.setAttribute('class', 'world-rename-button__icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const pencil = document.createElementNS(namespace, 'path');
    pencil.setAttribute('d', 'm5 16-1 4 4-1L19 8l-3-3L5 16Zm9-11 3 3M4 20h16');
    pencil.setAttribute('fill', 'none');
    pencil.setAttribute('stroke', 'currentColor');
    pencil.setAttribute('stroke-width', '2');
    pencil.setAttribute('stroke-linecap', 'round');
    pencil.setAttribute('stroke-linejoin', 'round');
    icon.append(pencil);
    return icon;
  }

  private createBrand(): HTMLElement {
    const brand = document.createElement('header');
    brand.className = 'wildbound-brand';
    brand.setAttribute('aria-label', 'Wildbound');
    const overline = document.createElement('span');
    overline.className = 'wildbound-brand__overline';
    overline.textContent = 'A procedural adventure';
    const title = document.createElement('div');
    title.className = 'wildbound-brand__title';
    title.innerHTML = '<span>Wild</span><span>bound</span>';
    const underline = document.createElement('span');
    underline.className = 'wildbound-brand__underline';
    underline.textContent = 'Explore the untamed';
    brand.append(overline, title, underline);
    return brand;
  }

  private createMessage(message: string, isError = false): HTMLParagraphElement {
    const element = document.createElement('p');
    element.className = `main-menu-message${isError ? ' is-error' : ''}`;
    element.textContent = message;
    return element;
  }
}
