import { BLOCK, BLOCK_DEFS, HOTBAR_DEFAULTS, PLACEABLE_BLOCKS } from '../core/constants.js';

export const GAME_MODE = {
  CREATIVE: 'creative',
  SURVIVAL: 'survival',
};

export class Inventory {
  constructor(mode = GAME_MODE.CREATIVE) {
    this.mode = mode;
    this.selectedSlot = 0;
    this.slots = HOTBAR_DEFAULTS.map((blockId) => ({
      blockId,
      count: 64,
    }));
  }

  setMode(mode) {
    if (mode === GAME_MODE.CREATIVE || mode === GAME_MODE.SURVIVAL) {
      this.mode = mode;
    }
  }

  selectSlot(index) {
    const len = this.slots.length;
    this.selectedSlot = ((index % len) + len) % len;
    return this.slots[this.selectedSlot];
  }

  cycleSlot(delta) {
    return this.selectSlot(this.selectedSlot + delta);
  }

  getSelectedSlot() {
    return this.slots[this.selectedSlot];
  }

  getSelectedBlockId() {
    const slot = this.slots[this.selectedSlot];
    if (!slot || slot.blockId === BLOCK.AIR) return BLOCK.AIR;
    if (this.mode === GAME_MODE.SURVIVAL && slot.count <= 0) return BLOCK.AIR;
    return slot.blockId;
  }

  setSlotBlock(slotIndex, blockId, count = 64) {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return false;
    if (!BLOCK_DEFS[blockId]) return false;
    this.slots[slotIndex] = { blockId, count };
    return true;
  }

  consumeSelected() {
    const slot = this.slots[this.selectedSlot];
    if (!slot || slot.blockId === BLOCK.AIR) return false;
    if (this.mode === GAME_MODE.CREATIVE) return true;
    if (slot.count <= 0) return false;
    slot.count -= 1;
    if (slot.count === 0) {
      slot.blockId = BLOCK.AIR;
    }
    return true;
  }

  collectBlock(blockId) {
    if (blockId === BLOCK.AIR || blockId === BLOCK.WATER || blockId === BLOCK.BEDROCK) {
      return false;
    }
    // Stone drops cobblestone in survival
    const dropId =
      this.mode === GAME_MODE.SURVIVAL && blockId === BLOCK.STONE
        ? BLOCK.COBBLESTONE
        : blockId;

    if (this.mode === GAME_MODE.CREATIVE) return true;

    // Stack onto existing slot
    for (const slot of this.slots) {
      if (slot.blockId === dropId && slot.count < 64) {
        slot.count += 1;
        return true;
      }
    }
    // Or put in first empty slot
    for (const slot of this.slots) {
      if (slot.blockId === BLOCK.AIR || slot.count === 0) {
        slot.blockId = dropId;
        slot.count = 1;
        return true;
      }
    }
    return false;
  }

  getCatalog() {
    return PLACEABLE_BLOCKS.map((id) => BLOCK_DEFS[id]);
  }
}
