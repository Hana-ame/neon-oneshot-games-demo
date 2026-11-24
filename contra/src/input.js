// 输入控制器：支持键盘、虚拟触控手柄及科乐美秘籍检测

import { KONAMI_SEQUENCE } from './constants.js';

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.virtualState = {
      left: false,
      right: false,
      up: false,
      down: false,
      shoot: false,
      jump: false
    };
    this.justPressed = new Set();
    this.konamiBuffer = [];
    this.konamiTriggered = false;
    this.onKonamiCallback = null;
    this.onPauseCallback = null;
    this.onMuteCallback = null;
    this.onStartCallback = null;
  }

  handleKeyDown(code) {
    if (!this.keys.has(code)) {
      this.justPressed.add(code);
      this.recordKonamiKey(code);

      if (code === 'KeyP' || code === 'Escape') {
        if (this.onPauseCallback) this.onPauseCallback();
      } else if (code === 'KeyM') {
        if (this.onMuteCallback) this.onMuteCallback();
      } else if (code === 'Enter' || code === 'Space') {
        if (this.onStartCallback) this.onStartCallback();
      }
    }
    this.keys.add(code);
  }

  handleKeyUp(code) {
    this.keys.delete(code);
  }

  setVirtualButton(action, pressed) {
    if (Object.prototype.hasOwnProperty.call(this.virtualState, action)) {
      if (pressed && !this.virtualState[action]) {
        this.justPressed.add(`virtual_${action}`);
      }
      this.virtualState[action] = Boolean(pressed);
    }
  }

  recordKonamiKey(code) {
    const prev = this.konamiBuffer[this.konamiBuffer.length - 1];
    const normalized = code === 'KeyW' ? 'ArrowUp'
      : code === 'KeyS' ? 'ArrowDown'
      : code === 'KeyD' ? 'ArrowRight'
      : code === 'KeyA' ? (prev === 'KeyB' ? 'KeyA' : 'ArrowLeft')
      : code;

    this.konamiBuffer.push(normalized);
    if (this.konamiBuffer.length > KONAMI_SEQUENCE.length) {
      this.konamiBuffer.shift();
    }
    if (
      this.konamiBuffer.length === KONAMI_SEQUENCE.length &&
      KONAMI_SEQUENCE.every((k, i) => this.konamiBuffer[i] === k)
    ) {
      this.konamiTriggered = true;
      this.konamiBuffer = [];
      if (this.onKonamiCallback) {
        this.onKonamiCallback();
      }
    }
  }

  getState() {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.virtualState.left;
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.virtualState.right;
    const up = this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.virtualState.up;
    const down = this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.virtualState.down;
    const shoot = this.keys.has('KeyJ') || this.keys.has('KeyZ') || this.virtualState.shoot;
    const jump = this.keys.has('KeyK') || this.keys.has('KeyX') || this.virtualState.jump;
    const jumpPressed =
      this.justPressed.has('KeyK') ||
      this.justPressed.has('KeyX') ||
      this.justPressed.has('virtual_jump');

    return { left, right, up, down, shoot, jump, jumpPressed };
  }

  endFrame() {
    this.justPressed.clear();
  }

  reset() {
    this.keys.clear();
    this.justPressed.clear();
    Object.keys(this.virtualState).forEach((k) => {
      this.virtualState[k] = false;
    });
  }
}
