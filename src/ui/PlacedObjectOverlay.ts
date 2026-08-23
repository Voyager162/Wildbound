import {
  PLACEABLE_DEFINITIONS,
  isPlaceableId,
  WAYPOINT_LABEL_MAX_LENGTH
} from '../crafting/placeableConfig';
import { POTION_DEFINITIONS, isPotionId, type PotionId } from '../crafting/potionConfig';
import { furnaceRecipeForOutput } from '../crafting/furnaceConfig';
import { TOOL_DEFINITIONS, isToolId } from '../crafting/toolConfig';
import { HOTBAR_SLOT_COUNT, type InventoryItem, type InventorySlot } from '../player/Inventory';
import { resourceLabel } from '../world/resources';
import type { PlacedObject } from '../world/SessionWorldState';

type UtilitySlotKind = 'inventory' | 'storage' | 'ingredient' | 'output' | 'fuel' | 'ore' | 'furnace-output';

interface UtilitySlotLocation {
  readonly kind: UtilitySlotKind;
  readonly index?: number;
}

interface PlacedObjectOverlayCallbacks {
  readonly getObject: (id: string) => PlacedObject | null;
  readonly getPlayerSlots: () => ReadonlyArray<InventorySlot | null>;
  readonly movePlayerInventorySlot: (sourceIndex: number, destinationIndex: number) => boolean;
  readonly movePlayerInventoryAmount: (sourceIndex: number, destinationIndex: number, amount: number) => boolean;
  readonly movePlayerSlotToStorage: (objectId: string, slotIndex: number, amount?: number) => boolean;
  readonly moveStorageSlotToPlayer: (objectId: string, slotIndex: number, destinationIndex: number, amount?: number) => boolean;
  readonly movePlayerSlotToBrewing: (objectId: string, slotIndex: number, ingredientIndex: number) => boolean;
  readonly moveBrewingIngredientToPlayer: (objectId: string, ingredientIndex: number, destinationIndex: number) => boolean;
  readonly collectBrewingOutput: (objectId: string, destinationIndex: number) => boolean;
  readonly tryStartBrewing: (objectId: string) => PotionId | null;
  readonly brewingOutput: (objectId: string) => PotionId | null;
  readonly movePlayerSlotToFurnace: (objectId: string, slotIndex: number, slot: 'fuel' | 'ore', amount?: number) => boolean;
  readonly moveFurnaceItemToPlayer: (objectId: string, slot: 'fuel' | 'ore', destinationIndex: number, amount?: number) => boolean;
  readonly collectFurnaceOutput: (objectId: string, destinationIndex: number, amount?: number) => boolean;
  readonly furnaceOutput: (objectId: string) => InventorySlot | null;
  readonly furnaceItemAvailableToTake: (objectId: string, slot: 'fuel' | 'ore') => InventorySlot | null;
  readonly onRest: (object: PlacedObject) => void;
  readonly setWaypointLabel: (objectId: string, label: string) => boolean;
  readonly onChanged: () => void;
  readonly onClose: () => void;
}

// A utility is a focused interaction screen, not a second crafting shortcut. The compact player
// inventory below it deliberately mirrors the normal hotbar + 5x5 layout so transfers feel
// consistent, while utility-only slots accept items only through a real drag operation.
export class PlacedObjectOverlay {
  private readonly element: HTMLDivElement;
  private readonly panel: HTMLElement;
  private objectId: string | null = null;
  private dragging: UtilitySlotLocation | null = null;
  private dragSource: HTMLElement | null = null;
  private dragCursor: HTMLDivElement | null = null;
  private activePointerId: number | null = null;
  private draggingAmount = 0;
  private isSplitDrag = false;
  private dragGrabOffsetX = 0;
  private dragGrabOffsetY = 0;
  private lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
  private brewProgressFill: HTMLDivElement | null = null;
  private renderedFurnaceOutputSignature = '';

  constructor(parent: HTMLElement, private readonly callbacks: PlacedObjectOverlayCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'placed-object-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    this.panel = document.createElement('section');
    this.panel.className = 'placed-object-panel';
    this.panel.setAttribute('aria-label', 'Utility controls');
    this.panel.tabIndex = 0;
    this.panel.addEventListener('wheel', this.handlePanelWheel, { passive: false });
    this.element.append(this.panel);
    parent.append(this.element);
  }

  get isOpen(): boolean {
    return this.objectId !== null;
  }

  open(object: PlacedObject): void {
    this.objectId = object.id;
    this.element.classList.add('is-open');
    this.element.setAttribute('aria-hidden', 'false');
    this.panel.scrollTop = 0;
    this.render();
    requestAnimationFrame(() => this.panel.focus({ preventScroll: true }));
  }

  close(): void {
    if (!this.objectId) {
      return;
    }
    this.cancelDrag();
    this.objectId = null;
    this.brewProgressFill = null;
    this.renderedFurnaceOutputSignature = '';
    this.element.classList.remove('is-open');
    this.element.setAttribute('aria-hidden', 'true');
    this.panel.scrollTop = 0;
    this.panel.replaceChildren();
    this.callbacks.onClose();
  }

  refresh(): void {
    if (this.objectId && !this.dragging) {
      this.render();
    }
  }

  update(time: number): void {
    if (!this.objectId || time - this.lastProgressUpdateMs < 200) {
      return;
    }
    this.lastProgressUpdateMs = time;
    const object = this.callbacks.getObject(this.objectId);
    const brewJob = object?.brewing?.job;
    const furnaceJob = object?.furnace?.job;
    if (!brewJob && !furnaceJob) {
      return;
    }
    const now = Date.now();
    const output = brewJob ? this.callbacks.brewingOutput(object!.id) : this.callbacks.furnaceOutput(object!.id);
    // A furnace may keep working while finished bars wait in its output vessel. Re-read its job
    // after the queue advances so the progress line remains live instead of rebuilding the UI
    // every tick simply because a result is ready to collect.
    const activeFurnaceJob = brewJob ? null : this.callbacks.getObject(object!.id)?.furnace?.job;
    const furnaceOutputSignature = brewJob ? null : this.slotSignature(output as InventorySlot | null);
    // A queued furnace can finish one bar and immediately begin the next job. That used to leave
    // the output vessel visually stale until the menu was reopened because the progress row kept
    // updating in place. Rebuild only on an actual output-vessel change, never on each timer tick.
    if (!brewJob && furnaceOutputSignature !== this.renderedFurnaceOutputSignature) {
      this.render();
      return;
    }
    if (output && (brewJob || !activeFurnaceJob)) {
      this.render();
      return;
    }
    const durationMs = brewJob
      ? POTION_DEFINITIONS[brewJob.output].brewDurationMs
      : furnaceRecipeForOutput(activeFurnaceJob!.output)?.durationMs ?? 1;
    const remainingMs = Math.max(0, (brewJob?.finishesAtMs ?? activeFurnaceJob!.finishesAtMs) - now);
    const elapsedMs = Math.max(0, durationMs - remainingMs);
    if (this.brewProgressFill) {
      this.brewProgressFill.style.width = `${Math.min(100, elapsedMs / durationMs * 100).toFixed(2)}%`;
    }
  }

  destroy(): void {
    this.cancelDrag();
    this.objectId = null;
    this.panel.removeEventListener('wheel', this.handlePanelWheel);
    this.element.remove();
  }

  private render(): void {
    const object = this.objectId ? this.callbacks.getObject(this.objectId) : null;
    if (!object) {
      this.close();
      return;
    }
    const definition = PLACEABLE_DEFINITIONS[object.placeable];
    this.brewProgressFill = null;
    this.renderedFurnaceOutputSignature = '';
    const previousScrollTop = this.panel.scrollTop;
    this.panel.replaceChildren();

    const header = document.createElement('header');
    header.className = 'placed-object-panel__header';
    const identity = document.createElement('div');
    identity.className = 'placed-object-panel__identity';
    const icon = this.createItemIcon(object.placeable);
    const copy = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = definition.label;
    copy.append(title);
    identity.append(icon, copy);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'placed-object-panel__close';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    header.append(identity, close);
    this.panel.append(header);

    if (definition.interaction === 'storage') {
      this.renderStorage(object);
    } else if (object.placeable === 'furnace') {
      this.renderFurnace(object);
    } else if (object.placeable === 'brewing station') {
      this.renderBrewingStation(object);
    } else if (definition.interaction !== 'station') {
      this.renderFieldUtility(object);
    }

    this.renderCompactInventory();
    this.panel.scrollTop = previousScrollTop;
  }

  /**
   * The hotbar listens for wheel input globally. Handle a wheel gesture on the utility
   * itself before it reaches that listener, so long utility screens remain scrollable.
   */
  private readonly handlePanelWheel = (event: WheelEvent): void => {
    if (!this.isOpen || this.dragging || this.panel.scrollHeight <= this.panel.clientHeight) {
      return;
    }

    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? this.panel.clientHeight
        : 1;
    const delta = event.deltaY * multiplier;
    if (delta === 0) {
      return;
    }

    const previousScrollTop = this.panel.scrollTop;
    const maximumScrollTop = Math.max(0, this.panel.scrollHeight - this.panel.clientHeight);
    this.panel.scrollTop = Math.max(0, Math.min(maximumScrollTop, previousScrollTop + delta));

    if (this.panel.scrollTop !== previousScrollTop) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private renderFieldUtility(object: PlacedObject): void {
    const action = document.createElement('section');
    action.className = 'placed-object-panel__action';
    const interaction = PLACEABLE_DEFINITIONS[object.placeable].interaction;
    if (interaction === 'rest') {
      const rest = document.createElement('button');
      rest.type = 'button';
      rest.className = 'placed-object-panel__primary';
      rest.textContent = 'Rest until dawn';
      rest.addEventListener('click', () => this.callbacks.onRest(object));
      action.append(rest);
    } else if (interaction === 'waypoint') {
      const label = document.createElement('label');
      label.className = 'waypoint-label-control';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = WAYPOINT_LABEL_MAX_LENGTH;
      input.value = object.waypointLabel ?? 'Waypoint';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Waypoint label');
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'placed-object-panel__primary';
      save.textContent = 'Save';
      save.addEventListener('click', () => {
        this.callbacks.setWaypointLabel(object.id, input.value);
        this.render();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          save.click();
        }
      });
      label.append(input);
      action.append(label, save);
    }
    if (action.hasChildNodes()) {
      this.panel.append(action);
    }
  }

  private renderStorage(object: PlacedObject): void {
    const storage = document.createElement('section');
    storage.className = 'placed-storage';
    storage.append(this.createSectionHeading('Storage'));
    const slots = document.createElement('div');
    slots.className = 'placed-storage__grid';
    (object.storage ?? []).forEach((slot, index) => slots.append(this.createUtilitySlot(slot, { kind: 'storage', index })));
    storage.append(slots);
    this.panel.append(storage);
  }

  private renderFurnace(object: PlacedObject): void {
    const initialFurnace = object.furnace;
    if (!initialFurnace) {
      return;
    }
    const output = this.callbacks.furnaceOutput(object.id);
    // Querying the output also advances a completed batch. Render from that freshly advanced
    // snapshot so the fire, queue counts, and result vessel never disagree for one UI frame.
    const furnace = this.callbacks.getObject(object.id)?.furnace ?? initialFurnace;
    this.renderedFurnaceOutputSignature = this.slotSignature(output);
    const station = document.createElement('section');
    station.className = 'brewing-station furnace-station';
    station.classList.toggle('is-refining', Boolean(furnace.job));
    const heading = document.createElement('div');
    heading.className = 'brewing-station__heading';
    const title = document.createElement('strong');
    title.textContent = 'Coal-fired furnace';
    heading.append(title);
    station.append(heading);

    const vessels = document.createElement('div');
    vessels.className = 'brewing-station__vessels';
    const job = furnace.job;
    ([
      ['Fuel', 'fuel', job ? 'Drag out to cancel the active refinement' : 'Drop up to 10 coal'] as const,
      ['Raw ore', 'ore', job ? 'Drag out to cancel the active refinement' : 'Drop up to 10 raw iron or gold'] as const
    ]).forEach(([labelText, slot, emptyLabel]) => {
      const item = this.callbacks.furnaceItemAvailableToTake(object.id, slot);
      const vessel = document.createElement('div');
      vessel.className = 'brewing-station__vessel';
      const label = document.createElement('span');
      label.textContent = `${labelText}${item ? ` · ${item.amount}/10` : ''}`;
      // Both inputs remain draggable during refining. Pulling either one cancels the active job
      // and restores its reserved coal and ore before moving the selected stack back to inventory.
      vessel.append(label, this.createUtilitySlot(item, { kind: slot }, emptyLabel));
      vessels.append(vessel);
    });
    const outputVessel = document.createElement('div');
    outputVessel.className = 'brewing-station__vessel brewing-station__vessel--output';
    const outputLabel = document.createElement('span');
    outputLabel.textContent = 'Refined';
    outputVessel.append(outputLabel, this.createUtilitySlot(output, { kind: 'furnace-output' }, output ? 'Drag stack into inventory' : job ? 'Refining…' : 'Awaiting materials'));
    vessels.append(outputVessel);
    station.append(vessels);

    const status = document.createElement('div');
    status.className = 'brewing-station__status';
    if (job) {
      const recipe = furnaceRecipeForOutput(job.output);
      const durationMs = recipe?.durationMs ?? 1;
      const elapsed = Math.max(0, durationMs - Math.max(0, job.finishesAtMs - Date.now()));
      const track = document.createElement('div');
      track.className = 'brewing-station__progress';
      const fill = document.createElement('div');
      fill.className = 'brewing-station__progress-fill';
      fill.style.width = `${Math.min(100, elapsed / durationMs * 100).toFixed(2)}%`;
      this.brewProgressFill = fill;
      track.append(fill);
      status.append(track);
    }
    if (status.hasChildNodes()) {
      station.append(status);
    }
    this.panel.append(station);
  }

  private renderBrewingStation(object: PlacedObject): void {
    const brewing = object.brewing;
    if (!brewing) {
      return;
    }
    const station = document.createElement('section');
    station.className = 'brewing-station';
    const heading = document.createElement('div');
    heading.className = 'brewing-station__heading';
    const title = document.createElement('strong');
    title.textContent = 'Experimental brewhouse';
    heading.append(title);
    station.append(heading);

    const vessels = document.createElement('div');
    vessels.className = 'brewing-station__vessels';
    const job = brewing.job;
    const output = this.callbacks.brewingOutput(object.id);
    for (let index = 0; index < 2; index += 1) {
      const vessel = document.createElement('div');
      vessel.className = 'brewing-station__vessel';
      const label = document.createElement('span');
      label.textContent = `Ingredient ${index + 1}`;
      vessel.append(label, this.createUtilitySlot(job ? null : brewing.ingredients[index], { kind: 'ingredient', index }, job ? 'Brewing in progress' : 'Drop a resource here'));
      vessels.append(vessel);
    }
    const outputVessel = document.createElement('div');
    outputVessel.className = 'brewing-station__vessel brewing-station__vessel--output';
    const outputLabel = document.createElement('span');
    outputLabel.textContent = 'Result';
    const outputSlot = output ? { item: output, amount: 1 } as InventorySlot : null;
    outputVessel.append(outputLabel, this.createUtilitySlot(outputSlot, { kind: 'output' }, output ? 'Drag into an inventory slot' : job ? 'Brewing…' : 'Awaiting mixture'));
    vessels.append(outputVessel);
    station.append(vessels);

    const status = document.createElement('div');
    status.className = 'brewing-station__status';
    if (job) {
      const definition = POTION_DEFINITIONS[job.output];
      const elapsed = Math.max(0, definition.brewDurationMs - Math.max(0, job.finishesAtMs - Date.now()));
      const track = document.createElement('div');
      track.className = 'brewing-station__progress';
      const fill = document.createElement('div');
      fill.className = 'brewing-station__progress-fill';
      fill.style.width = `${Math.min(100, elapsed / definition.brewDurationMs * 100).toFixed(2)}%`;
      this.brewProgressFill = fill;
      track.append(fill);
      status.append(track);
    }
    if (status.hasChildNodes()) {
      station.append(status);
    }
    this.panel.append(station);
  }

  private renderCompactInventory(): void {
    const inventory = document.createElement('section');
    inventory.className = 'utility-inventory';
    inventory.append(this.createSectionHeading('Inventory'));
    const hotbar = document.createElement('div');
    hotbar.className = 'utility-inventory__hotbar';
    const pack = document.createElement('div');
    pack.className = 'utility-inventory__grid';
    this.callbacks.getPlayerSlots().forEach((slot, index) => {
      const element = this.createUtilitySlot(slot, { kind: 'inventory', index });
      (index < HOTBAR_SLOT_COUNT ? hotbar : pack).append(element);
    });
    inventory.append(pack, hotbar);
    this.panel.append(inventory);
  }

  private createSectionHeading(title: string): HTMLElement {
    const heading = document.createElement('div');
    heading.className = 'placed-storage__heading';
    const label = document.createElement('strong');
    label.textContent = title;
    heading.append(label);
    return heading;
  }

  private createUtilitySlot(
    slot: InventorySlot | null,
    location: UtilitySlotLocation,
    emptyLabel = 'Empty slot',
    canDragOut = true
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'utility-slot';
    button.dataset.utilitySlot = location.kind;
    if (location.index !== undefined) {
      button.dataset.utilitySlotIndex = String(location.index);
    }
    button.setAttribute('aria-label', slot ? `${this.itemLabel(slot.item)}, ${slot.amount}` : emptyLabel);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    if (slot) {
      const item = document.createElement('span');
      item.className = 'utility-slot__item';
      item.append(this.createItemIcon(slot.item));
      if (!isToolId(slot.item)) {
        const amount = document.createElement('span');
        amount.className = 'utility-slot__amount';
        amount.textContent = String(slot.amount);
        item.append(amount);
      }
      button.append(item);
      if (canDragOut) {
        button.addEventListener('pointerdown', (event) => this.startDrag(event, button, location, slot));
      }
    } else {
      button.classList.add('is-empty');
      const placeholder = document.createElement('span');
      placeholder.className = 'utility-slot__empty-label';
      placeholder.textContent = location.kind === 'ingredient' ? 'Ingredient'
        : location.kind === 'output' ? 'Result'
          : location.kind === 'fuel' ? 'Fuel'
            : location.kind === 'ore' ? 'Ore'
              : location.kind === 'furnace-output' ? 'Refined' : '';
      button.append(placeholder);
    }
    return button;
  }

  private startDrag(
    event: PointerEvent,
    source: HTMLElement,
    location: UtilitySlotLocation,
    slot: InventorySlot
  ): void {
    if ((event.button !== 0 && event.button !== 2) || this.activePointerId !== null) {
      return;
    }
    if (event.button === 2 && (slot.amount <= 1 || isToolId(slot.item))) {
      return;
    }
    const item = source.querySelector<HTMLElement>('.utility-slot__item');
    if (!item) {
      return;
    }
    event.preventDefault();
    const rect = item.getBoundingClientRect();
    this.dragging = location;
    this.dragSource = source;
    this.activePointerId = event.pointerId;
    this.draggingAmount = event.button === 2 ? 1 : slot.amount;
    this.isSplitDrag = event.button === 2;
    this.dragGrabOffsetX = event.clientX - rect.left;
    this.dragGrabOffsetY = event.clientY - rect.top;
    source.setPointerCapture(event.pointerId);
    source.classList.add('is-dragging');
    const cursor = document.createElement('div');
    cursor.className = 'utility-drag-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    const itemClone = item.cloneNode(true) as HTMLElement;
    const amountLabel = itemClone.querySelector<HTMLElement>('.utility-slot__amount');
    if (amountLabel) {
      amountLabel.textContent = String(this.draggingAmount);
    }
    cursor.append(itemClone);
    this.element.append(cursor);
    this.dragCursor = cursor;
    document.body.classList.add('is-item-dragging');
    this.positionDragCursor(event.clientX, event.clientY);
    document.addEventListener('pointermove', this.handlePointerMove, true);
    document.addEventListener('pointerup', this.handlePointerUp, true);
    document.addEventListener('pointercancel', this.handlePointerCancel, true);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) {
      this.positionDragCursor(event.clientX, event.clientY);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId || !this.dragging || !this.objectId) {
      return;
    }
    const source = this.dragging;
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-utility-slot]');
    const target = targetElement ? this.locationFromElement(targetElement) : null;
    const changed = target ? this.transfer(source, target) : false;
    this.cancelDrag();
    if (changed && source.kind === 'inventory' && target?.kind === 'ingredient') {
      this.callbacks.tryStartBrewing(this.objectId);
    }
    if (changed) {
      this.callbacks.onChanged();
      this.render();
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.activePointerId) {
      this.cancelDrag();
      this.render();
    }
  };

  private transfer(source: UtilitySlotLocation, target: UtilitySlotLocation): boolean {
    if (!this.objectId || (source.kind === target.kind && source.index === target.index)) {
      return false;
    }
    if (source.kind === 'inventory') {
      if (target.kind === 'inventory' && source.index !== undefined && target.index !== undefined) {
        return this.isSplitDrag
          ? this.callbacks.movePlayerInventoryAmount(source.index, target.index, this.draggingAmount)
          : this.callbacks.movePlayerInventorySlot(source.index, target.index);
      }
      if (target.kind === 'storage' && source.index !== undefined) {
        return this.callbacks.movePlayerSlotToStorage(
          this.objectId,
          source.index,
          this.isSplitDrag ? this.draggingAmount : undefined
        );
      }
      if (target.kind === 'ingredient' && source.index !== undefined && target.index !== undefined) {
        return this.callbacks.movePlayerSlotToBrewing(this.objectId, source.index, target.index);
      }
      if ((target.kind === 'fuel' || target.kind === 'ore') && source.index !== undefined) {
        return this.callbacks.movePlayerSlotToFurnace(
          this.objectId,
          source.index,
          target.kind,
          this.isSplitDrag ? this.draggingAmount : undefined
        );
      }
      return false;
    }
    if (source.kind === 'storage' && target.kind === 'inventory' && source.index !== undefined && target.index !== undefined) {
      return this.callbacks.moveStorageSlotToPlayer(
        this.objectId,
        source.index,
        target.index,
        this.isSplitDrag ? this.draggingAmount : undefined
      );
    }
    if (source.kind === 'ingredient' && target.kind === 'inventory' && source.index !== undefined && target.index !== undefined) {
      return this.callbacks.moveBrewingIngredientToPlayer(this.objectId, source.index, target.index);
    }
    if (source.kind === 'output' && target.kind === 'inventory' && target.index !== undefined) {
      return this.callbacks.collectBrewingOutput(this.objectId, target.index);
    }
    if ((source.kind === 'fuel' || source.kind === 'ore') && target.kind === 'inventory' && target.index !== undefined) {
      return this.callbacks.moveFurnaceItemToPlayer(
        this.objectId,
        source.kind,
        target.index,
        this.isSplitDrag ? this.draggingAmount : undefined
      );
    }
    if (source.kind === 'furnace-output' && target.kind === 'inventory' && target.index !== undefined) {
      return this.callbacks.collectFurnaceOutput(
        this.objectId,
        target.index,
        this.isSplitDrag ? this.draggingAmount : undefined
      );
    }
    return false;
  }

  private locationFromElement(element: HTMLElement): UtilitySlotLocation | null {
    const kind = element.dataset.utilitySlot;
    if (kind !== 'inventory' && kind !== 'storage' && kind !== 'ingredient' && kind !== 'output'
      && kind !== 'fuel' && kind !== 'ore' && kind !== 'furnace-output') {
      return null;
    }
    const rawIndex = element.dataset.utilitySlotIndex;
    const index = rawIndex === undefined ? undefined : Number(rawIndex);
    return index === undefined || Number.isInteger(index) ? { kind, index } : null;
  }

  private cancelDrag(): void {
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    document.removeEventListener('pointerup', this.handlePointerUp, true);
    document.removeEventListener('pointercancel', this.handlePointerCancel, true);
    if (this.dragSource && this.activePointerId !== null && this.dragSource.hasPointerCapture(this.activePointerId)) {
      this.dragSource.releasePointerCapture(this.activePointerId);
    }
    this.dragSource?.classList.remove('is-dragging');
    this.dragCursor?.remove();
    document.body.classList.remove('is-item-dragging');
    this.dragging = null;
    this.dragSource = null;
    this.dragCursor = null;
    this.activePointerId = null;
    this.draggingAmount = 0;
    this.isSplitDrag = false;
    this.dragGrabOffsetX = 0;
    this.dragGrabOffsetY = 0;
  }

  private positionDragCursor(clientX: number, clientY: number): void {
    if (this.dragCursor) {
      this.dragCursor.style.transform = `translate3d(${Math.round(clientX - 24)}px, ${Math.round(clientY - 24)}px, 0)`;
    }
  }

  private slotSignature(slot: InventorySlot | null): string {
    return slot ? `${slot.item}:${slot.amount}` : '';
  }

  private itemLabel(item: InventoryItem): string {
    if (isToolId(item)) return TOOL_DEFINITIONS[item].label;
    if (isPlaceableId(item)) return PLACEABLE_DEFINITIONS[item].label;
    if (isPotionId(item)) return POTION_DEFINITIONS[item].label;
    return resourceLabel(item);
  }

  private createItemIcon(item: InventoryItem): HTMLSpanElement {
    const icon = document.createElement('span');
    if (isToolId(item)) {
      const tool = TOOL_DEFINITIONS[item];
      icon.className = `tool-icon tool-icon--${tool.kind} tool-icon--${tool.headMaterial}`;
    } else if (isPlaceableId(item)) {
      icon.className = `placeable-icon placeable-icon--${item.replaceAll(' ', '-')}`;
    } else if (isPotionId(item)) {
      icon.className = `potion-icon potion-icon--${item.replaceAll(' ', '-')}`;
    } else {
      icon.className = `resource-icon resource-icon--${item.replaceAll(' ', '-')}`;
    }
    icon.setAttribute('aria-hidden', 'true');
    if (isPotionId(item)) {
      const label = document.createElement('span');
      label.className = 'potion-icon__label';
      label.textContent = POTION_DEFINITIONS[item].shortLabel;
      icon.append(label);
    }
    const detail = document.createElement('span');
    detail.className = 'resource-icon__detail';
    icon.append(detail);
    return icon;
  }
}
