import { BLOCK, BLOCK_DEFS, PHYSICS, RENDER_RADIUS } from './core/constants.js';
import { clamp, getLookDirection } from './core/math.js';
import { World } from './world/world.js';
import { raycastVoxel } from './world/raycast.js';
import { PlayerPhysics } from './player/physics.js';
import { Inventory, GAME_MODE } from './player/inventory.js';
import { createTextureAtlasCanvas, buildBlockIcons } from './engine/textures.js';
import { VoxelRenderer } from './engine/renderer.js';
import { SoundEngine } from './engine/audio.js';

const SAVE_KEY = 'voxelcraft_web_save_v1';

class VoxelCraftApp {
  constructor() {
    this.canvas = document.getElementById('gl-canvas');
    this.atlasCanvas = createTextureAtlasCanvas();
    this.icons = buildBlockIcons(this.atlasCanvas);
    this.renderer = new VoxelRenderer(this.canvas, this.atlasCanvas);
    this.sound = new SoundEngine();

    this.world = new World(2026);
    this.spawn = this.world.getSpawnPoint();
    this.player = new PlayerPhysics(this.spawn);
    this.inventory = new Inventory(GAME_MODE.CREATIVE);

    this.renderRadius = RENDER_RADIUS;
    this.timeOfDay = 0.44;
    this.autoCycle = true;
    this.paused = true;
    this.debugOpen = false;
    this.inventoryOpen = false;

    this.keys = new Set();
    this.touchMove = { forward: 0, strafe: 0, jump: false };
    this.dragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.dragMoved = false;
    this.lastSpaceTime = 0;

    this.targetHit = null;
    this.lastFrameTime = performance.now();
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.currentFps = 60;
    this.rafId = null;
    this.toastTimer = null;

    this.bindUI();
    this.bindControls();
    this.renderHotbar();
    this.renderCatalog();
    this.syncSettingsUI();
    this.handleResize();

    // Render initial world frame immediately behind the start modal
    this.world.ensureChunksAround(this.player.x, this.player.z, this.renderRadius);
    this.renderer.render(this.world, this.player, null, {
      renderRadius: this.renderRadius,
      timeOfDay: this.timeOfDay,
    });

    this.startLoop();
  }

  showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  bindUI() {
    const menuOverlay = document.getElementById('menu-overlay');
    const invOverlay = document.getElementById('inventory-overlay');

    document.getElementById('btn-play').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.playClick();
      this.paused = false;
      this.inventoryOpen = false;
      menuOverlay.classList.add('hidden');
      invOverlay.classList.add('hidden');
      this.tryPointerLock();
    });

    document.getElementById('btn-menu').addEventListener('click', () => {
      this.sound.playClick();
      this.openMenu();
    });

    document.getElementById('btn-debug').addEventListener('click', () => {
      this.sound.playClick();
      this.toggleDebug();
    });

    document.getElementById('btn-inventory').addEventListener('click', () => {
      this.sound.playClick();
      this.toggleInventory();
    });

    document.getElementById('btn-close-inv').addEventListener('click', () => {
      this.sound.playClick();
      this.toggleInventory(false);
    });

    document.getElementById('btn-fly').addEventListener('click', () => {
      this.sound.playClick();
      this.toggleFly();
    });

    document.getElementById('btn-mute').addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      document.getElementById('btn-mute').textContent = muted ? '🔇 静音' : '🔊 音效';
      this.showToast(muted ? '音效已关闭' : '音效已开启');
    });

    document.getElementById('select-mode').addEventListener('change', (e) => {
      this.inventory.setMode(e.target.value);
      if (this.inventory.mode === GAME_MODE.SURVIVAL && this.player.flying) {
        this.player.flying = false;
      }
      this.syncSettingsUI();
      this.renderHotbar();
      this.showToast(
        this.inventory.mode === GAME_MODE.CREATIVE ? '已切换到创造模式' : '已切换到生存模式'
      );
    });

    document.getElementById('range-radius').addEventListener('input', (e) => {
      this.renderRadius = Number(e.target.value);
      document.getElementById('val-radius').textContent = String(this.renderRadius);
      this.world.ensureChunksAround(this.player.x, this.player.z, this.renderRadius);
    });

    document.getElementById('range-time').addEventListener('input', (e) => {
      this.timeOfDay = Number(e.target.value);
      this.updateTimeBadge();
    });

    document.getElementById('check-cycle').addEventListener('change', (e) => {
      this.autoCycle = e.target.checked;
    });

    document.getElementById('btn-new-world').addEventListener('click', () => {
      this.sound.playClick();
      const seedStr = document.getElementById('input-seed').value.trim() || String(Date.now() % 100000);
      document.getElementById('input-seed').value = seedStr;
      this.resetWorld(seedStr);
      this.showToast(`已生成新世界 (种子: ${this.world.seed})`);
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      this.sound.playClick();
      this.saveWorld();
    });

    document.getElementById('btn-load').addEventListener('click', () => {
      this.sound.playClick();
      this.loadWorld();
    });

    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.sound.playClick();
      this.spawn = this.world.getSpawnPoint();
      this.player.loadState({ ...this.spawn, yaw: 0, pitch: -0.15, flying: false });
      this.showToast('已返回出生点');
    });
  }

  bindControls() {
    window.addEventListener('resize', () => this.handleResize());

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;

      if (e.code === 'F3') {
        e.preventDefault();
        this.toggleDebug();
        return;
      }
      if (e.code === 'KeyE') {
        e.preventDefault();
        if (!this.paused || this.inventoryOpen) this.toggleInventory();
        return;
      }
      if (e.code === 'Escape') {
        if (this.inventoryOpen) {
          this.toggleInventory(false);
        } else if (!this.paused) {
          this.openMenu();
        }
        return;
      }
      if (e.code === 'KeyM') {
        const muted = this.sound.toggleMute();
        document.getElementById('btn-mute').textContent = muted ? '🔇 静音' : '🔊 音效';
        return;
      }

      if (this.paused) return;

      if (e.code === 'KeyF') {
        this.toggleFly();
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpaceTime < 280 && this.inventory.mode === GAME_MODE.CREATIVE) {
          this.toggleFly();
        }
        this.lastSpaceTime = now;
      }

      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.replace('Digit', ''));
        if (n >= 1 && n <= 9) {
          this.inventory.selectSlot(n - 1);
          this.sound.playClick();
          this.renderHotbar();
        }
      }

      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('wheel', (e) => {
      if (this.paused) return;
      this.inventory.cycleSlot(e.deltaY > 0 ? 1 : -1);
      this.renderHotbar();
    }, { passive: true });

    // Pointer lock & fallback drag look
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      this.sound.unlock();
      if (document.pointerLockElement === this.canvas) {
        if (e.button === 0) this.breakTargetBlock();
        if (e.button === 2) this.placeSelectedBlock();
        return;
      }
      this.dragging = true;
      this.dragMoved = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      if (document.pointerLockElement === this.canvas) {
        this.rotateCamera(e.movementX, e.movementY);
      } else if (this.dragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.dragMoved = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.rotateCamera(dx, dy);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.dragging && !this.dragMoved && !this.paused && document.pointerLockElement !== this.canvas) {
        if (e.button === 0) this.breakTargetBlock();
        if (e.button === 2) this.placeSelectedBlock();
      }
      this.dragging = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch camera look on canvas
    let lastTouch = null;
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.paused) return;
      this.sound.unlock();
      if (e.touches.length === 1) {
        lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.paused || !lastTouch || e.touches.length !== 1) return;
      const t = e.touches[0];
      this.rotateCamera((t.clientX - lastTouch.x) * 1.4, (t.clientY - lastTouch.y) * 1.4);
      lastTouch = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => {
      lastTouch = null;
    }, { passive: true });

    // On-screen D-pad & action buttons
    const bindHold = (el, onDown, onUp) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.sound.unlock();
        onDown();
      });
      const release = () => onUp();
      el.addEventListener('pointerup', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('pointercancel', release);
    };

    document.querySelectorAll('[data-move]').forEach((btn) => {
      const dir = btn.getAttribute('data-move');
      bindHold(
        btn,
        () => {
          if (dir === 'forward') this.touchMove.forward = 1;
          if (dir === 'back') this.touchMove.forward = -1;
          if (dir === 'left') this.touchMove.strafe = -1;
          if (dir === 'right') this.touchMove.strafe = 1;
        },
        () => {
          if (dir === 'forward' || dir === 'back') this.touchMove.forward = 0;
          if (dir === 'left' || dir === 'right') this.touchMove.strafe = 0;
        }
      );
    });

    bindHold(
      document.getElementById('touch-jump'),
      () => { this.touchMove.jump = true; },
      () => { this.touchMove.jump = false; }
    );

    document.getElementById('touch-break').addEventListener('click', () => {
      if (!this.paused) this.breakTargetBlock();
    });

    document.getElementById('touch-place').addEventListener('click', () => {
      if (!this.paused) this.placeSelectedBlock();
    });
  }

  tryPointerLock() {
    try {
      if (this.canvas.requestPointerLock) {
        const res = this.canvas.requestPointerLock();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    } catch (_) {
      // Fallback drag look remains active
    }
  }

  rotateCamera(dx, dy) {
    const sens = 0.0028;
    this.player.yaw -= dx * sens;
    this.player.pitch = clamp(this.player.pitch - dy * sens, -1.52, 1.52);
  }

  openMenu() {
    this.paused = true;
    this.inventoryOpen = false;
    this.keys.clear();
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
    document.getElementById('inventory-overlay').classList.add('hidden');
    document.getElementById('menu-overlay').classList.remove('hidden');
  }

  toggleDebug() {
    this.debugOpen = !this.debugOpen;
    document.getElementById('debug-panel').classList.toggle('hidden', !this.debugOpen);
  }

  toggleInventory(force) {
    this.inventoryOpen = typeof force === 'boolean' ? force : !this.inventoryOpen;
    this.paused = this.inventoryOpen;
    if (this.inventoryOpen) {
      this.keys.clear();
      if (document.pointerLockElement && document.exitPointerLock) {
        document.exitPointerLock();
      }
      document.getElementById('menu-overlay').classList.add('hidden');
    }
    document.getElementById('inventory-overlay').classList.toggle('hidden', !this.inventoryOpen);
  }

  toggleFly() {
    if (this.inventory.mode === GAME_MODE.SURVIVAL) {
      this.showToast('生存模式下无法飞行（可在菜单切换为创造模式）');
      return;
    }
    this.player.flying = !this.player.flying;
    this.player.vy = 0;
    this.syncSettingsUI();
    this.showToast(this.player.flying ? '飞行模式：开启' : '飞行模式：关闭');
  }

  breakTargetBlock() {
    if (!this.targetHit) return;
    const { x, y, z, blockId } = this.targetHit;
    const def = BLOCK_DEFS[blockId];
    if (!def || !def.breakable) {
      this.showToast('基岩无法破坏');
      return;
    }
    if (this.world.setBlock(x, y, z, BLOCK.AIR, true)) {
      this.inventory.collectBlock(blockId);
      this.sound.playBreak();
      this.renderHotbar();
    }
  }

  placeSelectedBlock() {
    if (!this.targetHit) return;
    const blockId = this.inventory.getSelectedBlockId();
    if (blockId === BLOCK.AIR) {
      this.showToast('当前快捷栏为空');
      return;
    }
    const [px, py, pz] = this.targetHit.placePos;
    if (this.player.intersectsBlock(px, py, pz)) {
      return; // Avoid trapping player inside block
    }
    if (this.world.setBlock(px, py, pz, blockId, true)) {
      this.inventory.consumeSelected();
      this.sound.playPlace();
      this.renderHotbar();
    }
  }

  resetWorld(seed) {
    this.renderer.clearChunkBuffers();
    this.world = new World(seed);
    this.spawn = this.world.getSpawnPoint();
    this.player = new PlayerPhysics(this.spawn);
    this.world.ensureChunksAround(this.player.x, this.player.z, this.renderRadius);
  }

  saveWorld() {
    try {
      const payload = this.world.serialize(this.player.toState(), this.timeOfDay);
      localStorage.setItem(SAVE_KEY, payload);
      this.showToast(`世界已保存（已记录 ${this.world.edits.size} 处方块修改）`);
    } catch (_) {
      this.showToast('保存失败：当前环境限制本地存储');
    }
  }

  loadWorld() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        this.showToast('未找到本地存档');
        return;
      }
      const restored = World.deserialize(raw);
      this.renderer.clearChunkBuffers();
      this.world = restored.world;
      this.timeOfDay = restored.timeOfDay;
      this.world.ensureChunksAround(
        restored.player ? restored.player.x : 0,
        restored.player ? restored.player.z : 0,
        this.renderRadius
      );
      if (restored.player) {
        this.player.loadState(restored.player);
      }
      document.getElementById('input-seed').value = String(this.world.seed);
      this.syncSettingsUI();
      this.showToast(`存档已加载（种子: ${this.world.seed}）`);
    } catch (_) {
      this.showToast('读取存档失败');
    }
  }

  syncSettingsUI() {
    const modeText = this.inventory.mode === GAME_MODE.CREATIVE ? '创造模式' : '生存模式';
    document.getElementById('mode-badge').textContent = modeText;
    document.getElementById('btn-fly').textContent = `F 飞行: ${this.player.flying ? '开' : '关'}`;
    document.getElementById('select-mode').value = this.inventory.mode;
    document.getElementById('range-radius').value = String(this.renderRadius);
    document.getElementById('val-radius').textContent = String(this.renderRadius);
    document.getElementById('range-time').value = String(this.timeOfDay.toFixed(2));
    this.updateTimeBadge();
  }

  updateTimeBadge() {
    const totalMins = Math.floor(this.timeOfDay * 24 * 60) % (24 * 60);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');
    const phase =
      this.timeOfDay < 0.22 || this.timeOfDay > 0.8
        ? '夜晚'
        : this.timeOfDay < 0.3
        ? '黎明'
        : this.timeOfDay > 0.7
        ? '黄昏'
        : '白天';
    document.getElementById('time-badge').textContent = `${phase} ${hh}:${mm}`;
    document.getElementById('val-time').textContent = `${phase} ${hh}:${mm}`;
  }

  renderHotbar() {
    const bar = document.getElementById('hotbar');
    bar.innerHTML = '';
    this.inventory.slots.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `hotbar-slot${idx === this.inventory.selectedSlot ? ' active' : ''}`;
      const def = BLOCK_DEFS[slot.blockId];
      btn.title = def ? def.name : '空';

      const keySpan = document.createElement('span');
      keySpan.className = 'slot-key';
      keySpan.textContent = String(idx + 1);
      btn.appendChild(keySpan);

      if (slot.blockId !== BLOCK.AIR && this.icons[slot.blockId]) {
        const img = document.createElement('img');
        img.src = this.icons[slot.blockId];
        img.alt = def ? def.name : '';
        btn.appendChild(img);
      }

      if (this.inventory.mode === GAME_MODE.SURVIVAL && slot.blockId !== BLOCK.AIR) {
        const cnt = document.createElement('span');
        cnt.className = 'slot-count';
        cnt.textContent = String(slot.count);
        btn.appendChild(cnt);
      }

      btn.addEventListener('click', () => {
        this.inventory.selectSlot(idx);
        this.sound.playClick();
        this.renderHotbar();
      });
      bar.appendChild(btn);
    });

    const cur = this.inventory.getSelectedSlot();
    const curDef = cur && BLOCK_DEFS[cur.blockId];
    document.getElementById('block-label').textContent =
      cur && cur.blockId !== BLOCK.AIR && curDef ? curDef.name : '空手';
  }

  renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = '';
    for (const def of this.inventory.getCatalog()) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'catalog-item';
      const img = document.createElement('img');
      img.src = this.icons[def.id];
      img.alt = def.name;
      const label = document.createElement('span');
      label.textContent = def.name;
      item.appendChild(img);
      item.appendChild(label);
      item.addEventListener('click', () => {
        this.inventory.setSlotBlock(this.inventory.selectedSlot, def.id, 64);
        this.sound.playClick();
        this.renderHotbar();
        this.toggleInventory(false);
        this.showToast(`已装备：${def.name}`);
      });
      grid.appendChild(item);
    }
  }

  handleResize() {
    this.renderer.resize();
    this.renderer.render(this.world, this.player, this.targetHit, {
      renderRadius: this.renderRadius,
      timeOfDay: this.timeOfDay,
    });
  }

  startLoop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;

      this.fpsAccum += dt;
      this.fpsFrames += 1;
      if (this.fpsAccum >= 0.4) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      if (!this.paused) {
        if (this.autoCycle) {
          this.timeOfDay = (this.timeOfDay + dt * 0.0045) % 1;
          this.updateTimeBadge();
        }

        const forward =
          (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
          (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) +
          this.touchMove.forward;
        const strafe =
          (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
          (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) +
          this.touchMove.strafe;

        const input = {
          forward: clamp(forward, -1, 1),
          strafe: clamp(strafe, -1, 1),
          jump: this.keys.has('Space') || this.touchMove.jump,
          descend: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
          sprint: this.keys.has('ShiftLeft') || this.keys.has('ControlLeft'),
        };

        const evt = this.player.update(dt, input, (wx, wy, wz) => this.world.getBlock(wx, wy, wz));
        if (evt.jumped) this.sound.playJump();
        if (evt.stepped) this.sound.playStep();

        this.world.ensureChunksAround(this.player.x, this.player.z, this.renderRadius);

        const eye = this.player.getEyePosition();
        const dir = getLookDirection(this.player.yaw, this.player.pitch);
        this.targetHit = raycastVoxel(eye, dir, PHYSICS.REACH_DISTANCE, (wx, wy, wz) =>
          this.world.getBlock(wx, wy, wz)
        );
      }

      this.renderer.render(this.world, this.player, this.targetHit, {
        renderRadius: this.renderRadius,
        timeOfDay: this.timeOfDay,
      });

      if (this.debugOpen) {
        const [cx, cz] = this.world.worldToChunkCoords(this.player.x, this.player.z);
        const biome = this.world.generator.getBiome(Math.floor(this.player.x), Math.floor(this.player.z));
        document.getElementById('dbg-fps').textContent =
          `FPS: ${this.currentFps} | DrawCalls: ${this.renderer.stats.drawCalls} | Tris: ${this.renderer.stats.triangles} | Chunks: ${this.renderer.stats.chunksRendered}`;
        document.getElementById('dbg-pos').textContent =
          `XYZ: ${this.player.x.toFixed(1)} / ${this.player.y.toFixed(1)} / ${this.player.z.toFixed(1)} | ${this.player.flying ? 'FLY' : this.player.inWater ? 'WATER' : 'WALK'}`;
        document.getElementById('dbg-chunk').textContent =
          `Chunk: ${cx}, ${cz} | Biome: ${biome} | Seed: ${this.world.seed}`;
        document.getElementById('dbg-target').textContent = this.targetHit
          ? `Target: ${BLOCK_DEFS[this.targetHit.blockId]?.name || this.targetHit.blockId} (${this.targetHit.x}, ${this.targetHit.y}, ${this.targetHit.z})`
          : 'Target: None';
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

window.addEventListener('load', () => {
  try {
    window.__voxelApp = new VoxelCraftApp();
  } catch (err) {
    const root = document.getElementById('game-root');
    if (root) {
      root.innerHTML = `<div style="padding:32px;color:#fff;font-family:sans-serif;"><h2>WebGL 初始化失败</h2><p>${String(err.message || err)}</p></div>`;
    }
  }
});
