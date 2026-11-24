/**
 * 百战天虫 3D - Three.js r128 3D 渲染与粒子特效引擎
 * 依赖全局 THREE (Three.js r128)。
 */

import { WORLD_CONFIG, MAP_THEMES, WEAPONS, TURN_PHASE } from '../core/constants.js';
import { aimToDirection, sampleTrajectory } from '../core/physics.js';

export class Renderer3D {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.cameraMode = 'follow'; // 'follow' | 'tactical'
    this.tacticalYaw = 0.6;
    this.tacticalPitch = 0.72;
    this.tacticalDist = 66;
    this.cameraShake = 0;
    this.camPos = new THREE.Vector3(0, 24, 42);
    this.camLook = new THREE.Vector3(0, 4, 0);
    this.time = 0;

    this.wormMeshes = new Map();
    this.projMeshes = new Map();
    this.crateMeshes = new Map();
    this.particles = [];
    this.tracers = [];

    this.initScene();
    this.buildTerrainMesh();
    this.buildWaterMesh();
    this.buildAimHelpers();
    this.syncWorms();
    this.bindEngineEvents();
  }

  initScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.5, 320);

    // 灯光系统：半球天光 + 方向主光 + 补光
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.05);
    this.sunLight.position.set(42, 62, 34);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 160;
    const d = 52;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // 装饰云朵群
    this.cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.78 });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Group();
      const ang = (i / 10) * Math.PI * 2;
      const rad = 52 + (i % 3) * 14;
      c.position.set(Math.cos(ang) * rad, 28 + (i % 4) * 4, Math.sin(ang) * rad);
      for (let k = 0; k < 3; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.6 + k * 0.5, 8, 8), cloudMat);
        puff.position.set((k - 1) * 2.5, (k % 2) * 0.8, 0);
        puff.scale.set(1.4, 0.75, 1.0);
        c.add(puff);
      }
      this.cloudGroup.add(c);
    }
    this.scene.add(this.cloudGroup);

    this.applyThemeColors();
    this.resize();
  }

  applyThemeColors() {
    const theme = MAP_THEMES[this.engine.themeId] || MAP_THEMES.tropical;
    this.scene.background = new THREE.Color(theme.skyTop);
    this.scene.fog = new THREE.FogExp2(theme.fogColor, 0.0052);
    if (this.waterMat) {
      this.waterMat.color.setHex(theme.waterColor);
      this.waterMat.opacity = theme.waterOpacity;
      this.waterMat.emissive.setHex(theme.id === 'volcano' ? 0x7c2d12 : 0x000000);
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(320, parent ? parent.clientWidth : window.innerWidth);
    const height = Math.max(240, parent ? parent.clientHeight : window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /** 构建可动态更新的 3D 地形网格 */
  buildTerrainMesh() {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
    }

    const t = this.engine.terrain;
    const gs = t.gridSize;
    const vertCount = gs * gs;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];

    for (let gz = 0; gz < gs; gz++) {
      for (let gx = 0; gx < gs; gx++) {
        const idx = gz * gs + gx;
        positions[idx * 3] = t.gridToWorld(gx);
        positions[idx * 3 + 1] = t.heights[idx];
        positions[idx * 3 + 2] = t.gridToWorld(gz);
      }
    }

    for (let gz = 0; gz < gs - 1; gz++) {
      for (let gx = 0; gx < gs - 1; gx++) {
        const a = gz * gs + gx;
        const b = a + 1;
        const c = a + gs;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: false,
    });

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.scene.add(this.terrainMesh);
    this.updateTerrainGeometry();
  }

  /** 当地形被炸毁或重新生成时，实时刷新顶点高度、颜色与法线 */
  updateTerrainGeometry() {
    const t = this.engine.terrain;
    const gs = t.gridSize;
    const posAttr = this.terrainMesh.geometry.attributes.position;
    const colAttr = this.terrainMesh.geometry.attributes.color;

    for (let gz = 0; gz < gs; gz++) {
      for (let gx = 0; gx < gs; gx++) {
        const idx = gz * gs + gx;
        posAttr.setY(idx, t.heights[idx]);
        const [r, g, b] = t.getVertexColor(gx, gz);
        colAttr.setXYZ(idx, r, g, b);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.terrainMesh.geometry.computeVertexNormals();
    this.terrainMesh.geometry.computeBoundingSphere();
    this.terrainMesh.geometry.computeBoundingBox();
    t.dirty = false;
  }

  buildWaterMesh() {
    const geo = new THREE.PlaneGeometry(340, 340, 36, 36);
    geo.rotateX(-Math.PI / 2);
    const theme = MAP_THEMES[this.engine.themeId] || MAP_THEMES.tropical;
    this.waterMat = new THREE.MeshPhongMaterial({
      color: theme.waterColor,
      transparent: true,
      opacity: theme.waterOpacity,
      shininess: 90,
      specular: 0x93c5fd,
      emissive: theme.id === 'volcano' ? 0x7c2d12 : 0x000000,
    });
    this.waterMesh = new THREE.Mesh(geo, this.waterMat);
    this.waterMesh.position.y = this.engine.waterLevel;
    this.scene.add(this.waterMesh);
  }

  /** 3D 瞄准准星与抛物线预览点 */
  buildAimHelpers() {
    this.aimGroup = new THREE.Group();
    const dotGeo = new THREE.SphereGeometry(0.16, 8, 8);
    this.aimDots = [];
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: Math.max(0.18, 1 - i / 22),
      });
      const dot = new THREE.Mesh(dotGeo, mat);
      this.aimDots.push(dot);
      this.aimGroup.add(dot);
    }

    // 3D 准星环
    const ringGeo = new THREE.RingGeometry(0.32, 0.48, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, side: THREE.DoubleSide });
    this.reticleMesh = new THREE.Mesh(ringGeo, ringMat);
    this.aimGroup.add(this.reticleMesh);

    this.scene.add(this.aimGroup);

    // 当前行动虫子头顶的旋转金色指示箭头
    const arrowGeo = new THREE.ConeGeometry(0.42, 0.9, 6);
    arrowGeo.rotateX(Math.PI);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      roughness: 0.3,
    });
    this.activeIndicator = new THREE.Mesh(arrowGeo, arrowMat);
    this.scene.add(this.activeIndicator);
  }

  /** 创建一只卡通 3D 虫子模型 */
  createWormMesh(worm) {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfda4af, roughness: 0.55 });
    const teamColor = this.engine.teams[worm.teamId].colorNum;
    const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.4 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    // 尾部与下身段
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), skinMat);
    tail.position.set(0, 0.42, -0.42);
    tail.castShadow = true;
    group.add(tail);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 14), skinMat);
    body.position.set(0, 0.72, 0);
    body.scale.set(0.92, 1.25, 0.95);
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 14), skinMat);
    head.position.set(0, 1.48, 0.08);
    head.castShadow = true;
    group.add(head);

    // 队伍头盔/头带
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      teamMat
    );
    helmet.position.set(0, 1.54, 0.06);
    helmet.castShadow = true;
    group.add(helmet);

    // 卡通大眼睛
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), whiteMat);
    eyeL.position.set(-0.17, 1.54, 0.46);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.17;
    group.add(eyeL, eyeR);

    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), pupilMat);
    pupilL.position.set(-0.17, 1.54, 0.59);
    const pupilR = pupilL.clone();
    pupilR.position.x = 0.17;
    group.add(pupilL, pupilR);

    // 武器挂载节点（随仰角俯仰）
    const weaponPivot = new THREE.Group();
    weaponPivot.position.set(0.42, 1.05, 0.15);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 1.35, 10),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.4 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.4;
    weaponPivot.add(barrel);
    group.add(weaponPivot);

    group.userData = { weaponPivot, body, head };
    return group;
  }

  syncWorms() {
    for (const mesh of this.wormMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.wormMeshes.clear();

    for (const worm of this.engine.worms) {
      const mesh = this.createWormMesh(worm);
      mesh.position.set(worm.x, worm.y, worm.z);
      this.scene.add(mesh);
      this.wormMeshes.set(worm.id, mesh);
    }
  }

  bindEngineEvents() {
    this.engine.on('match_reset', () => {
      this.applyThemeColors();
      this.updateTerrainGeometry();
      this.syncWorms();
      this.clearDynamicMeshes();
    });

    this.engine.on('explosion', (ev) => {
      if (this.engine.terrain.dirty) {
        this.updateTerrainGeometry();
      }
      this.spawnExplosionFX(ev.x, ev.y, ev.z, ev.radius);
      this.cameraShake = Math.min(1.8, 0.55 + ev.radius * 0.16);
    });

    this.engine.on('splash', (ev) => {
      this.spawnSplashFX(ev.x, ev.y, ev.z);
    });

    this.engine.on('drown', (ev) => {
      this.spawnSplashFX(ev.x, ev.y, ev.z, 1.6);
    });

    this.engine.on('shotgun_tracer', (ev) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ev.from.x, ev.from.y, ev.from.z),
        new THREE.Vector3(ev.to.x, ev.to.y, ev.to.z),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 1 });
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);
      this.tracers.push({ mesh: line, life: 0.28, maxLife: 0.28 });
    });
  }

  clearDynamicMeshes() {
    for (const m of this.projMeshes.values()) this.scene.remove(m);
    this.projMeshes.clear();
    for (const m of this.crateMeshes.values()) this.scene.remove(m);
    this.crateMeshes.clear();
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles = [];
  }

  spawnExplosionFX(x, y, z, radius) {
    // 中心膨胀火球
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.45, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.92 })
    );
    fireball.position.set(x, y + 0.3, z);
    this.scene.add(fireball);
    this.particles.push({
      mesh: fireball,
      vx: 0,
      vy: 0.5,
      vz: 0,
      life: 0.42,
      maxLife: 0.42,
      grow: 3.4,
      gravity: 0,
    });

    // 飞溅碎石、火星与烟雾粒子
    const count = Math.min(34, Math.floor(14 + radius * 3.5));
    const colors = [0xfef08a, 0xf97316, 0xef4444, 0x475569, 0x1e293b];
    for (let i = 0; i < count; i++) {
      const col = colors[i % colors.length];
      const isSmoke = i % 3 === 0;
      const geo = new THREE.SphereGeometry(isSmoke ? 0.45 : 0.22, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + 0.3, z);
      this.scene.add(mesh);

      const ang = Math.random() * Math.PI * 2;
      const spd = (isSmoke ? 2.5 : 6.0) + Math.random() * radius * 1.9;
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: 3.5 + Math.random() * radius * 1.6,
        vz: Math.sin(ang) * spd,
        life: 0.55 + Math.random() * 0.65,
        maxLife: 1.2,
        grow: isSmoke ? 1.8 : 0,
        gravity: isSmoke ? -2.2 : 16.0,
      });
    }
  }

  spawnSplashFX(x, y, z, scale = 1.0) {
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22 * scale, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.9 })
      );
      mesh.position.set(x, y + 0.2, z);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const spd = (2 + Math.random() * 4) * scale;
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: (5 + Math.random() * 5) * scale,
        vz: Math.sin(ang) * spd,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        grow: 0.4,
        gravity: 14.0,
      });
    }
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'follow' ? 'tactical' : 'follow';
    return this.cameraMode;
  }

  orbitTacticalCamera(dx, dy) {
    this.tacticalYaw -= dx * 0.008;
    this.tacticalPitch = Math.max(0.22, Math.min(1.38, this.tacticalPitch + dy * 0.006));
  }

  zoomTacticalCamera(delta) {
    this.tacticalDist = Math.max(26, Math.min(105, this.tacticalDist + delta * 0.05));
  }

  /** 将 3D 世界坐标投影到 2D 屏幕坐标（用于虫子头顶血条） */
  projectToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
      visible: v.z < 1.0,
    };
  }

  update(dt) {
    this.time += dt;

    // 1. 地形若被炸毁则即时更新网格
    if (this.engine.terrain.dirty) {
      this.updateTerrainGeometry();
    }

    // 2. 海平面高度与缓慢波浪动画
    this.waterMesh.position.y = this.engine.waterLevel + Math.sin(this.time * 1.6) * 0.12;
    this.cloudGroup.rotation.y += dt * 0.015;

    // 3. 同步所有虫子位置与姿态
    for (const worm of this.engine.worms) {
      const mesh = this.wormMeshes.get(worm.id);
      if (!mesh) continue;
      mesh.visible = worm.alive;
      if (!worm.alive) continue;

      const bob = worm.grounded ? Math.abs(Math.sin(worm.walkCycle)) * 0.14 : 0;
      mesh.position.set(worm.x, worm.y + bob, worm.z);
      mesh.rotation.y = worm.yaw;
      if (mesh.userData.weaponPivot) {
        mesh.userData.weaponPivot.rotation.x = -worm.pitch;
      }
    }

    // 4. 当前虫子头顶指示箭头与瞄准辅助线
    const activeWorm = this.engine.getActiveWorm();
    const showAim =
      activeWorm &&
      activeWorm.alive &&
      !this.engine.getActiveTeam().isAI &&
      (this.engine.phase === TURN_PHASE.AIM || this.engine.phase === TURN_PHASE.CHARGING);

    if (activeWorm && activeWorm.alive) {
      this.activeIndicator.visible = true;
      this.activeIndicator.position.set(
        activeWorm.x,
        activeWorm.y + 3.0 + Math.sin(this.time * 5.2) * 0.25,
        activeWorm.z
      );
      this.activeIndicator.rotation.y = this.time * 2.5;
    } else {
      this.activeIndicator.visible = false;
    }

    this.aimGroup.visible = !!showAim;
    if (showAim) {
      const weapon = WEAPONS[this.engine.selectedWeaponId];
      const dir = aimToDirection(activeWorm.yaw, activeWorm.pitch);
      const origin = {
        x: activeWorm.x + dir.x * 1.15,
        y: activeWorm.y + WORLD_CONFIG.WORM_HEIGHT * 0.68 + dir.y * 0.8,
        z: activeWorm.z + dir.z * 1.15,
      };
      this.reticleMesh.position.set(origin.x + dir.x * 3.8, origin.y + dir.y * 3.8, origin.z + dir.z * 3.8);
      this.reticleMesh.lookAt(this.camera.position);

      const previewPower = this.engine.phase === TURN_PHASE.CHARGING ? this.engine.chargePower : 0.65;
      if (weapon.type === 'projectile' || weapon.type === 'cluster') {
        const spd = weapon.minSpeed + (weapon.maxSpeed - weapon.minSpeed) * previewPower;
        const pts = sampleTrajectory(
          origin,
          { x: dir.x * spd, y: dir.y * spd, z: dir.z * spd },
          this.engine.wind,
          weapon.windFactor,
          this.aimDots.length,
          0.075
        );
        this.aimDots.forEach((dot, i) => {
          dot.visible = true;
          dot.position.set(pts[i].x, pts[i].y, pts[i].z);
          dot.material.color.setHex(this.engine.phase === TURN_PHASE.CHARGING ? 0xf97316 : 0xfef08a);
        });
      } else if (weapon.type === 'hitscan' || weapon.type === 'airstrike') {
        const dist = weapon.type === 'hitscan' ? 24 : weapon.minRange + (weapon.maxRange - weapon.minRange) * previewPower;
        this.aimDots.forEach((dot, i) => {
          const t = (i + 1) / this.aimDots.length;
          dot.visible = true;
          if (weapon.type === 'hitscan') {
            dot.position.set(origin.x + dir.x * dist * t, origin.y + dir.y * dist * t, origin.z + dir.z * dist * t);
          } else {
            const tx = activeWorm.x + Math.sin(activeWorm.yaw) * dist * t;
            const tz = activeWorm.z + Math.cos(activeWorm.yaw) * dist * t;
            dot.position.set(tx, this.engine.terrain.getHeightAt(tx, tz) + 0.6, tz);
          }
          dot.material.color.setHex(0xef4444);
        });
      } else {
        this.aimDots.forEach((d) => (d.visible = false));
      }
    }

    // 5. 同步飞行弹丸
    const activeProjIds = new Set();
    for (const p of this.engine.projectiles) {
      activeProjIds.add(p.id);
      let mesh = this.projMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 1.15, 10, 10),
          new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.4 })
        );
        this.scene.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);

      // 弹丸尾烟
      if (Math.random() < 0.65) {
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 5, 5),
          new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.65 })
        );
        smoke.position.set(p.x, p.y, p.z);
        this.scene.add(smoke);
        this.particles.push({ mesh: smoke, vx: 0, vy: 0.6, vz: 0, life: 0.35, maxLife: 0.35, grow: 1.5, gravity: 0 });
      }
    }
    for (const [id, mesh] of this.projMeshes.entries()) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        this.projMeshes.delete(id);
      }
    }

    // 6. 同步空投补给箱
    const activeCrateIds = new Set();
    for (const c of this.engine.crates) {
      activeCrateIds.add(c.id);
      let group = this.crateMeshes.get(c.id);
      if (!group) {
        group = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: c.kind === 'health' ? 0xf8fafc : 0xb45309, roughness: 0.6 })
        );
        box.castShadow = true;
        group.add(box);

        // 十字标志或军火条纹
        const badge = new THREE.Mesh(
          new THREE.BoxGeometry(1.14, 0.3, 0.3),
          new THREE.MeshBasicMaterial({ color: c.kind === 'health' ? 0xef4444 : 0xfacc15 })
        );
        group.add(badge);

        const chute = new THREE.Mesh(
          new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        );
        chute.position.y = 2.0;
        group.userData = { chute };
        group.add(chute);

        this.scene.add(group);
        this.crateMeshes.set(c.id, group);
      }
      group.position.set(c.x, c.y, c.z);
      group.rotation.y += dt * 1.1;
      if (group.userData.chute) {
        group.userData.chute.visible = !c.grounded;
      }
    }
    for (const [id, group] of this.crateMeshes.entries()) {
      if (!activeCrateIds.has(id)) {
        this.scene.remove(group);
        this.crateMeshes.delete(id);
      }
    }

    // 7. 更新粒子与射线残影
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.grow > 0) {
        const s = 1 + p.grow * dt;
        p.mesh.scale.multiplyScalar(s);
      }
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        this.tracers.splice(i, 1);
      } else {
        tr.mesh.material.opacity = tr.life / tr.maxLife;
      }
    }

    // 8. 相机平滑追踪
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const targetPos = new THREE.Vector3();
    const targetLook = new THREE.Vector3();

    if (this.engine.projectiles.length > 0 && this.cameraMode === 'follow') {
      const p = this.engine.projectiles[0];
      targetLook.set(p.x, p.y, p.z);
      targetPos.set(p.x - p.vx * 0.45, Math.max(p.y + 8, 12), p.z - p.vz * 0.45 + 12);
    } else if (this.cameraMode === 'tactical') {
      const x = Math.sin(this.tacticalYaw) * Math.cos(this.tacticalPitch) * this.tacticalDist;
      const y = Math.sin(this.tacticalPitch) * this.tacticalDist + 4;
      const z = Math.cos(this.tacticalYaw) * Math.cos(this.tacticalPitch) * this.tacticalDist;
      targetPos.set(x, y, z);
      targetLook.set(0, 4, 0);
    } else {
      const w = this.engine.getActiveWorm();
      if (w && w.alive) {
        const backDist = 11.5;
        const heightOffset = 5.4 - Math.sin(w.pitch) * 2.2;
        targetPos.set(
          w.x - Math.sin(w.yaw) * backDist,
          Math.max(this.engine.waterLevel + 2.5, w.y + heightOffset),
          w.z - Math.cos(w.yaw) * backDist
        );
        targetLook.set(
          w.x + Math.sin(w.yaw) * 7.5,
          w.y + 1.8 + Math.sin(w.pitch) * 5.0,
          w.z + Math.cos(w.yaw) * 7.5
        );
      } else {
        targetPos.set(0, 32, 48);
        targetLook.set(0, 3, 0);
      }
    }

    const lerpRate = Math.min(1, dt * 6.5);
    this.camPos.lerp(targetPos, lerpRate);
    this.camLook.lerp(targetLook, lerpRate);

    // 爆炸震屏效果
    let sx = 0, sy = 0, sz = 0;
    if (this.cameraShake > 0.01) {
      sx = (Math.random() - 0.5) * this.cameraShake;
      sy = (Math.random() - 0.5) * this.cameraShake;
      sz = (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.6);
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);
    this.camera.lookAt(this.camLook);
  }
}
