import { PHYSICS, isSolidBlock, isLiquidBlock } from '../core/constants.js';
import { clamp, aabbIntersects } from '../core/math.js';

export class PlayerPhysics {
  constructor(spawn = { x: 0.5, y: 36, z: 0.5 }) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.pitch = -0.15;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
    this.sprinting = false;
    this.stepDist = 0;
  }

  getEyePosition() {
    return [this.x, this.y + PHYSICS.EYE_HEIGHT, this.z];
  }

  getAABB(x = this.x, y = this.y, z = this.z) {
    const hw = PHYSICS.PLAYER_WIDTH / 2;
    return [
      [x - hw, y, z - hw],
      [x + hw, y + PHYSICS.PLAYER_HEIGHT, z + hw],
    ];
  }

  intersectsBlock(bx, by, bz) {
    const [pMin, pMax] = this.getAABB();
    return aabbIntersects(pMin, pMax, [bx, by, bz], [bx + 1, by + 1, bz + 1]);
  }

  collidesAt(x, y, z, getBlock) {
    const hw = PHYSICS.PLAYER_WIDTH / 2;
    const eps = 1e-4;
    const minX = Math.floor(x - hw + eps);
    const maxX = Math.floor(x + hw - eps);
    const minY = Math.floor(y + eps);
    const maxY = Math.floor(y + PHYSICS.PLAYER_HEIGHT - eps);
    const minZ = Math.floor(z - hw + eps);
    const maxZ = Math.floor(z + hw - eps);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (isSolidBlock(getBlock(bx, by, bz))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Advances player state by dt seconds.
   * input: { forward, strafe, jump, descend, sprint }
   * Returns { stepped: boolean, jumped: boolean }
   */
  update(dt, input, getBlock) {
    const clampedDt = clamp(dt, 0.001, 0.05);
    const feetBlock = getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    this.inWater = isLiquidBlock(feetBlock);
    this.sprinting = Boolean(input.sprint) && input.forward > 0 && !this.inWater;

    // Horizontal wish direction from yaw (yaw=0 looks along -Z)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwdX = -sinY;
    const fwdZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    let wishX = fwdX * (input.forward || 0) + rightX * (input.strafe || 0);
    let wishZ = fwdZ * (input.forward || 0) + rightZ * (input.strafe || 0);
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const moveSpeed = this.flying
      ? PHYSICS.FLY_SPEED
      : this.inWater
      ? PHYSICS.SWIM_SPEED
      : this.sprinting
      ? PHYSICS.SPRINT_SPEED
      : PHYSICS.WALK_SPEED;

    const accel = this.onGround || this.flying ? 18.0 : 7.5;
    const targetVx = wishX * moveSpeed;
    const targetVz = wishZ * moveSpeed;
    const blend = Math.min(1, accel * clampedDt);
    this.vx += (targetVx - this.vx) * blend;
    this.vz += (targetVz - this.vz) * blend;

    let jumped = false;
    if (this.flying) {
      let targetVy = 0;
      if (input.jump) targetVy += PHYSICS.FLY_SPEED * 0.85;
      if (input.descend) targetVy -= PHYSICS.FLY_SPEED * 0.85;
      this.vy += (targetVy - this.vy) * Math.min(1, 14 * clampedDt);
    } else if (this.inWater) {
      this.vy -= PHYSICS.WATER_GRAVITY * clampedDt;
      if (input.jump) {
        this.vy = Math.min(4.2, this.vy + 16 * clampedDt);
      }
      this.vy = clamp(this.vy, -4.5, 4.5);
    } else {
      if (input.jump && this.onGround) {
        this.vy = PHYSICS.JUMP_VELOCITY;
        this.onGround = false;
        jumped = true;
      }
      this.vy = Math.max(-PHYSICS.TERMINAL_VELOCITY, this.vy - PHYSICS.GRAVITY * clampedDt);
    }

    const prevX = this.x;
    const prevZ = this.z;

    // Axis-separated collision resolution: X -> Z -> Y
    const nextX = this.x + this.vx * clampedDt;
    if (!this.collidesAt(nextX, this.y, this.z, getBlock)) {
      this.x = nextX;
    } else {
      this.vx = 0;
    }

    const nextZ = this.z + this.vz * clampedDt;
    if (!this.collidesAt(this.x, this.y, nextZ, getBlock)) {
      this.z = nextZ;
    } else {
      this.vz = 0;
    }

    const nextY = this.y + this.vy * clampedDt;
    if (!this.collidesAt(this.x, nextY, this.z, getBlock)) {
      this.y = nextY;
      this.onGround = false;
    } else {
      if (this.vy < 0) {
        // Snap cleanly to top of supporting block
        this.y = Math.floor(nextY) + 1;
        this.onGround = true;
        if (this.flying && input.descend) {
          this.flying = false;
        }
      } else if (this.vy > 0) {
        // Hit ceiling
        const headTop = Math.floor(nextY + PHYSICS.PLAYER_HEIGHT);
        this.y = headTop - PHYSICS.PLAYER_HEIGHT - 1e-3;
      }
      this.vy = 0;
    }

    let stepped = false;
    if (this.onGround && !this.flying) {
      const moved = Math.hypot(this.x - prevX, this.z - prevZ);
      this.stepDist += moved;
      if (this.stepDist >= 1.65) {
        this.stepDist = 0;
        stepped = true;
      }
    }

    return { stepped, jumped };
  }

  toState() {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      flying: this.flying,
    };
  }

  loadState(state) {
    if (!state) return;
    if (typeof state.x === 'number') this.x = state.x;
    if (typeof state.y === 'number') this.y = state.y;
    if (typeof state.z === 'number') this.z = state.z;
    if (typeof state.yaw === 'number') this.yaw = state.yaw;
    if (typeof state.pitch === 'number') this.pitch = state.pitch;
    this.flying = Boolean(state.flying);
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }
}
