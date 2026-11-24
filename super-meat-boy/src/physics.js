import { PHYSICS, TILE, TILE_SIZE } from './constants.js';

/**
 * Create a fresh Meat Boy player state at the level's spawn position.
 */
export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    width: PHYSICS.PLAYER_WIDTH,
    height: PHYSICS.PLAYER_HEIGHT,
    vx: 0,
    vy: 0,
    facing: 1, // 1 right, -1 left
    onGround: false,
    onWall: 0, // -1 touching left wall, 1 touching right wall, 0 none
    lastWallDir: 0,
    coyoteTimer: 0,
    wallCoyoteTimer: 0,
    jumpBufferTimer: 0,
    wallJumpLockTimer: 0,
    jumpHeld: false,
    alive: true,
    reachedGoal: false,
    scaleX: 1,
    scaleY: 1,
    runCycle: 0,
  };
}

export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function circleRectOverlap(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function isSolidTile(world, row, col) {
  if (row < 0 || row >= world.rows || col < 0 || col >= world.cols) {
    return true; // Out-of-bounds walls are solid
  }
  const ch = world.tiles[row][col];
  if (ch === TILE.SOLID || ch === TILE.BOUNCE) {
    return true;
  }
  if (ch === TILE.CRUMBLE) {
    const block = world.crumbleBlocks.find((b) => b.row === row && b.col === col);
    return block ? block.state !== 'gone' : false;
  }
  return false;
}

function moveAlongPath(entity, dt) {
  if (!entity.path || entity.path.length < 2 || entity.speed <= 0) return;
  const target = entity.path[entity.pathIndex];
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);
  const step = entity.speed * dt;
  if (dist <= step || dist === 0) {
    entity.x = target.x;
    entity.y = target.y;
    entity.pathIndex = (entity.pathIndex + 1) % entity.path.length;
  } else {
    entity.x += (dx / dist) * step;
    entity.y += (dy / dist) * step;
  }
}

/**
 * Update dynamic world elements (moving saws, moving platforms, crumbling tiles).
 */
export function stepWorld(world, dt) {
  for (const saw of world.saws) {
    saw.angle += dt * 11;
    moveAlongPath(saw, dt);
  }

  for (const plat of world.platforms) {
    plat.prevX = plat.x;
    plat.prevY = plat.y;
    moveAlongPath(plat, dt);
  }

  for (const block of world.crumbleBlocks) {
    if (block.state === 'shaking') {
      block.timer -= dt;
      if (block.timer <= 0) {
        block.state = 'gone';
        block.timer = PHYSICS.CRUMBLE_RESPAWN;
      }
    } else if (block.state === 'gone') {
      block.timer -= dt;
      if (block.timer <= 0) {
        block.state = 'solid';
        block.timer = 0;
      }
    }
  }
}

/**
 * Advance player physics by one fixed timestep dt.
 * Returns a list of semantic events for audio/VFX:
 *   { type: 'jump' | 'wallJump' | 'land' | 'bounce' | 'splat' | 'death' | 'bandage' | 'goal', ... }
 */
export function stepPlayer(player, world, input, dt) {
  const events = [];
  if (!player.alive || player.reachedGoal) return events;

  const wasOnGround = player.onGround;
  const prevVy = player.vy;

  // 1. Update timers
  if (player.coyoteTimer > 0) player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  if (player.wallCoyoteTimer > 0) player.wallCoyoteTimer = Math.max(0, player.wallCoyoteTimer - dt);
  if (player.jumpBufferTimer > 0) player.jumpBufferTimer = Math.max(0, player.jumpBufferTimer - dt);
  if (player.wallJumpLockTimer > 0) player.wallJumpLockTimer = Math.max(0, player.wallJumpLockTimer - dt);

  if (input.jumpPressed) {
    player.jumpBufferTimer = PHYSICS.JUMP_BUFFER_TIME;
  }

  // 2. Carry player if standing on a moving platform
  if (player.onGround) {
    for (const plat of world.platforms) {
      const dx = plat.x - plat.prevX;
      const dy = plat.y - plat.prevY;
      const feetY = player.y + player.height;
      const onPlat =
        player.x + player.width > plat.prevX &&
        player.x < plat.prevX + plat.width &&
        Math.abs(feetY - plat.prevY) <= 3;
      if (onPlat) {
        player.x += dx;
        player.y += dy;
        break;
      }
    }
  }

  // 3. Horizontal movement
  const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const maxSpeed = input.sprint ? PHYSICS.SPRINT_MAX_SPEED : PHYSICS.WALK_MAX_SPEED;
  const accel = player.onGround ? PHYSICS.GROUND_ACCEL : PHYSICS.AIR_ACCEL;
  const decel = player.onGround ? PHYSICS.GROUND_DECEL : PHYSICS.AIR_DECEL;

  if (player.wallJumpLockTimer <= 0) {
    if (moveDir !== 0) {
      player.facing = moveDir;
      const targetVx = moveDir * maxSpeed;
      if (player.vx < targetVx) {
        player.vx = Math.min(targetVx, player.vx + accel * dt);
      } else if (player.vx > targetVx) {
        player.vx = Math.max(targetVx, player.vx - accel * dt);
      }
    } else {
      if (player.vx > 0) {
        player.vx = Math.max(0, player.vx - decel * dt);
      } else if (player.vx < 0) {
        player.vx = Math.min(0, player.vx + decel * dt);
      }
    }
  }

  // 4. Jump & Wall-Jump resolution
  if (player.jumpBufferTimer > 0) {
    if (player.coyoteTimer > 0) {
      // Ground / Coyote jump
      const sprintBonus =
        input.sprint && Math.abs(player.vx) > PHYSICS.WALK_MAX_SPEED * 0.8
          ? PHYSICS.SPRINT_JUMP_BONUS
          : 0;
      player.vy = PHYSICS.JUMP_VELOCITY + sprintBonus;
      player.onGround = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      player.jumpHeld = true;
      player.scaleX = 0.72;
      player.scaleY = 1.32;
      events.push({ type: 'jump', x: player.x + player.width / 2, y: player.y + player.height });
    } else if (player.wallCoyoteTimer > 0 && player.lastWallDir !== 0) {
      // Wall jump away from wall
      const kickVx = input.sprint ? PHYSICS.WALL_JUMP_SPRINT_VX : PHYSICS.WALL_JUMP_VX;
      player.vx = -player.lastWallDir * kickVx;
      player.vy = PHYSICS.WALL_JUMP_VY;
      player.facing = -player.lastWallDir;
      player.wallCoyoteTimer = 0;
      player.jumpBufferTimer = 0;
      player.wallJumpLockTimer = PHYSICS.WALL_JUMP_LOCK_TIME;
      player.jumpHeld = true;
      player.scaleX = 0.75;
      player.scaleY = 1.28;
      events.push({
        type: 'wallJump',
        x: player.lastWallDir > 0 ? player.x + player.width : player.x,
        y: player.y + player.height / 2,
        wallDir: player.lastWallDir,
      });
    }
  }

  // Variable jump height cut
  if (!input.jump && player.jumpHeld && player.vy < -120) {
    player.vy *= PHYSICS.JUMP_CUT_MULTIPLIER;
    player.jumpHeld = false;
  }

  // 5. Gravity & Wall Slide
  const gravMult = player.vy > 0 ? PHYSICS.FALL_GRAVITY_MULTIPLIER : 1.0;
  player.vy += PHYSICS.GRAVITY * gravMult * dt;
  const maxFall =
    player.onWall !== 0 && !player.onGround && player.vy > 0
      ? PHYSICS.WALL_SLIDE_MAX_SPEED
      : PHYSICS.MAX_FALL_SPEED;
  if (player.vy > maxFall) {
    player.vy = maxFall;
  }

  // 6. Horizontal Move & Tile Collision
  player.x += player.vx * dt;
  resolveHorizontalTiles(player, world, events);

  // 7. Vertical Move & Tile / Platform Collision
  player.onGround = false;
  const prevBottom = player.y + player.height;
  player.y += player.vy * dt;
  resolveVerticalTiles(player, world, events);
  resolveMovingPlatforms(player, world, prevBottom, events);

  // 8. Wall contact detection (for wall slide & wall coyote)
  player.onWall = detectWallContact(player, world);
  if (player.onWall !== 0 && !player.onGround) {
    player.lastWallDir = player.onWall;
    player.wallCoyoteTimer = PHYSICS.WALL_COYOTE_TIME;
    if (Math.abs(player.vy) > 25) {
      events.push({
        type: 'splat',
        x: player.onWall > 0 ? player.x + player.width : player.x,
        y: player.y + player.height * 0.5,
        normalX: -player.onWall,
        normalY: 0,
      });
    }
  }

  // 9. Coyote time & landing feedback
  if (player.onGround) {
    player.coyoteTimer = PHYSICS.COYOTE_TIME;
    if (!wasOnGround && prevVy > 110) {
      player.scaleX = 1.32;
      player.scaleY = 0.72;
      events.push({
        type: 'land',
        x: player.x + player.width / 2,
        y: player.y + player.height,
        impact: prevVy,
      });
      events.push({
        type: 'splat',
        x: player.x + player.width / 2,
        y: player.y + player.height,
        normalX: 0,
        normalY: -1,
      });
    } else if (Math.abs(player.vx) > 40) {
      player.runCycle += dt * (Math.abs(player.vx) / 38);
      if (Math.random() < 0.25) {
        events.push({
          type: 'splat',
          x: player.x + player.width / 2,
          y: player.y + player.height,
          normalX: 0,
          normalY: -1,
        });
      }
    }
  }

  // Smooth squash-and-stretch recovery
  player.scaleX += (1 - player.scaleX) * Math.min(1, dt * 15);
  player.scaleY += (1 - player.scaleY) * Math.min(1, dt * 15);

  // 10. Check Hazards (Spikes & Saws)
  if (checkHazardCollision(player, world)) {
    player.alive = false;
    events.push({
      type: 'death',
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
    });
    return events;
  }

  // 11. Check Collectible Bandage
  if (world.bandage && !world.bandage.collected) {
    if (circleRectOverlap(world.bandage.x, world.bandage.y, world.bandage.radius + 4, player)) {
      world.bandage.collected = true;
      events.push({ type: 'bandage', x: world.bandage.x, y: world.bandage.y });
    }
  }

  // 12. Check Goal (Bandage Girl)
  if (aabbOverlap(player, world.goal)) {
    player.reachedGoal = true;
    events.push({
      type: 'goal',
      x: world.goal.x + world.goal.width / 2,
      y: world.goal.y + world.goal.height / 2,
    });
  }

  return events;
}

function resolveHorizontalTiles(player, world, events) {
  const topRow = Math.floor((player.y + 1) / TILE_SIZE);
  const bottomRow = Math.floor((player.y + player.height - 1) / TILE_SIZE);

  if (player.vx > 0) {
    const rightCol = Math.floor((player.x + player.width) / TILE_SIZE);
    for (let r = topRow; r <= bottomRow; r++) {
      if (isSolidTile(world, r, rightCol)) {
        player.x = rightCol * TILE_SIZE - player.width;
        player.vx = 0;
        events.push({
          type: 'splat',
          x: player.x + player.width,
          y: player.y + player.height / 2,
          normalX: -1,
          normalY: 0,
        });
        break;
      }
    }
  } else if (player.vx < 0) {
    const leftCol = Math.floor(player.x / TILE_SIZE);
    for (let r = topRow; r <= bottomRow; r++) {
      if (isSolidTile(world, r, leftCol)) {
        player.x = (leftCol + 1) * TILE_SIZE;
        player.vx = 0;
        events.push({
          type: 'splat',
          x: player.x,
          y: player.y + player.height / 2,
          normalX: 1,
          normalY: 0,
        });
        break;
      }
    }
  }
}

function resolveVerticalTiles(player, world, events) {
  const leftCol = Math.floor((player.x + 1) / TILE_SIZE);
  const rightCol = Math.floor((player.x + player.width - 1) / TILE_SIZE);

  if (player.vy >= 0) {
    const bottomRow = Math.floor((player.y + player.height) / TILE_SIZE);
    for (let c = leftCol; c <= rightCol; c++) {
      if (isSolidTile(world, bottomRow, c)) {
        player.y = bottomRow * TILE_SIZE - player.height;
        const ch = world.tiles[bottomRow]?.[c];
        if (ch === TILE.BOUNCE) {
          player.vy = PHYSICS.BOUNCE_VELOCITY;
          player.onGround = false;
          player.jumpHeld = false;
          player.scaleX = 0.68;
          player.scaleY = 1.4;
          events.push({
            type: 'bounce',
            x: player.x + player.width / 2,
            y: bottomRow * TILE_SIZE,
          });
          return;
        }
        if (ch === TILE.CRUMBLE) {
          const block = world.crumbleBlocks.find(
            (b) => b.row === bottomRow && b.col === c && b.state === 'solid'
          );
          if (block) {
            block.state = 'shaking';
            block.timer = PHYSICS.CRUMBLE_DELAY;
          }
        }
        player.vy = 0;
        player.onGround = true;
        break;
      }
    }
  } else if (player.vy < 0) {
    const topRow = Math.floor(player.y / TILE_SIZE);
    for (let c = leftCol; c <= rightCol; c++) {
      if (isSolidTile(world, topRow, c)) {
        player.y = (topRow + 1) * TILE_SIZE;
        player.vy = 0;
        events.push({
          type: 'splat',
          x: player.x + player.width / 2,
          y: player.y,
          normalX: 0,
          normalY: 1,
        });
        break;
      }
    }
  }
}

function resolveMovingPlatforms(player, world, prevBottom, events) {
  if (player.vy < 0) return;
  for (const plat of world.platforms) {
    const withinX =
      player.x + player.width > plat.x + 1 && player.x < plat.x + plat.width - 1;
    const crossedTop =
      prevBottom <= plat.y + 6 && player.y + player.height >= plat.y;
    if (withinX && crossedTop) {
      player.y = plat.y - player.height;
      player.vy = 0;
      player.onGround = true;
      break;
    }
  }
}

function detectWallContact(player, world) {
  const topRow = Math.floor((player.y + 3) / TILE_SIZE);
  const bottomRow = Math.floor((player.y + player.height - 3) / TILE_SIZE);

  // Check right wall
  const rightCol = Math.floor((player.x + player.width + 1.5) / TILE_SIZE);
  for (let r = topRow; r <= bottomRow; r++) {
    if (isSolidTile(world, r, rightCol)) {
      return 1;
    }
  }

  // Check left wall
  const leftCol = Math.floor((player.x - 1.5) / TILE_SIZE);
  for (let r = topRow; r <= bottomRow; r++) {
    if (isSolidTile(world, r, leftCol)) {
      return -1;
    }
  }

  return 0;
}

export function checkHazardCollision(player, world) {
  // Forgiving inner hitbox for hazards (3px inset)
  const hurtbox = {
    x: player.x + 3,
    y: player.y + 3,
    width: player.width - 6,
    height: player.height - 6,
  };

  // Out of bottom bounds
  if (player.y > world.height + TILE_SIZE) {
    return true;
  }

  // Tile spikes
  const minCol = Math.max(0, Math.floor(hurtbox.x / TILE_SIZE));
  const maxCol = Math.min(world.cols - 1, Math.floor((hurtbox.x + hurtbox.width) / TILE_SIZE));
  const minRow = Math.max(0, Math.floor(hurtbox.y / TILE_SIZE));
  const maxRow = Math.min(world.rows - 1, Math.floor((hurtbox.y + hurtbox.height) / TILE_SIZE));

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const ch = world.tiles[r][c];
      if (
        ch === TILE.SPIKE_UP ||
        ch === TILE.SPIKE_DOWN ||
        ch === TILE.SPIKE_LEFT ||
        ch === TILE.SPIKE_RIGHT
      ) {
        const spikeRect = getSpikeHitbox(ch, r, c);
        if (aabbOverlap(hurtbox, spikeRect)) {
          return true;
        }
      }
    }
  }

  // Moving/Static Sawblades (slightly forgiving radius - 3px)
  for (const saw of world.saws) {
    if (circleRectOverlap(saw.x, saw.y, Math.max(4, saw.radius - 3), hurtbox)) {
      return true;
    }
  }

  return false;
}

function getSpikeHitbox(ch, row, col) {
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  switch (ch) {
    case TILE.SPIKE_UP:
      return { x: x + 4, y: y + 14, width: TILE_SIZE - 8, height: TILE_SIZE - 14 };
    case TILE.SPIKE_DOWN:
      return { x: x + 4, y, width: TILE_SIZE - 8, height: TILE_SIZE - 14 };
    case TILE.SPIKE_LEFT:
      return { x: x + 14, y: y + 4, width: TILE_SIZE - 14, height: TILE_SIZE - 8 };
    case TILE.SPIKE_RIGHT:
      return { x, y: y + 4, width: TILE_SIZE - 14, height: TILE_SIZE - 8 };
    default:
      return { x, y, width: TILE_SIZE, height: TILE_SIZE };
  }
}
