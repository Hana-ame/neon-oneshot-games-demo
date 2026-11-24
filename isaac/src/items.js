/**
 * 被动道具池与主动道具定义
 */
export const PASSIVE_ITEMS = [
  {
    id: 'sad_onion',
    name: '哭泣洋葱',
    subtitle: '射速大幅提升',
    color: '#e7d5a8',
    accent: '#8cb369',
    pool: ['treasure', 'shop'],
    apply(stats) {
      stats.tearRate = +(stats.tearRate + 1.1).toFixed(2);
    }
  },
  {
    id: 'pentagram',
    name: '五芒星',
    subtitle: '伤害显著提升',
    color: '#c92a2a',
    accent: '#ff8787',
    pool: ['treasure', 'boss'],
    apply(stats) {
      stats.damage = +(stats.damage + 1.5).toFixed(2);
    }
  },
  {
    id: 'inner_eye',
    name: '内眼',
    subtitle: '三重眼泪散射',
    color: '#f8f9fa',
    accent: '#495057',
    pool: ['treasure'],
    apply(stats) {
      stats.shotCount = Math.min(5, stats.shotCount + 2);
      stats.tearRate = Math.max(1.2, +(stats.tearRate * 0.78).toFixed(2));
    }
  },
  {
    id: 'spoon_bender',
    name: '弯勺之力',
    subtitle: '念力追踪泪弹',
    color: '#9c36b5',
    accent: '#e599f7',
    pool: ['treasure'],
    apply(stats) {
      stats.homing = true;
      stats.range += 40;
    }
  },
  {
    id: 'cupids_arrow',
    name: '丘比特之箭',
    subtitle: '穿透敌人的眼泪',
    color: '#f06595',
    accent: '#ffd43b',
    pool: ['treasure'],
    apply(stats) {
      stats.piercing = true;
    }
  },
  {
    id: 'rubber_cement',
    name: '橡皮胶水',
    subtitle: '弹性反弹泪弹',
    color: '#ffe066',
    accent: '#ff922b',
    pool: ['treasure', 'shop'],
    apply(stats) {
      stats.bouncing = true;
      stats.range += 60;
    }
  },
  {
    id: 'wire_coat_hanger',
    name: '铁丝衣架',
    subtitle: '射速与弹速提升',
    color: '#adb5bd',
    accent: '#dee2e6',
    pool: ['treasure', 'boss'],
    apply(stats) {
      stats.tearRate = +(stats.tearRate + 0.85).toFixed(2);
      stats.tearSpeed += 55;
    }
  },
  {
    id: 'meat',
    name: '神秘肉块',
    subtitle: '生命上限 +1 · 伤害提升',
    color: '#d9480f',
    accent: '#ffc9c9',
    pool: ['boss', 'treasure'],
    apply(stats) {
      stats.maxRedHearts += 2;
      stats.redHearts = Math.min(stats.maxRedHearts, stats.redHearts + 2);
      stats.damage = +(stats.damage + 0.6).toFixed(2);
    }
  },
  {
    id: 'soul_relic',
    name: '圣洁遗物',
    subtitle: '获得两颗魂心护盾',
    color: '#4dabf7',
    accent: '#d0ebff',
    pool: ['treasure', 'shop', 'boss'],
    apply(stats) {
      stats.soulHearts += 4;
    }
  },
  {
    id: 'wooden_spoon',
    name: '木勺',
    subtitle: '移动速度大幅提升',
    color: '#b07d4f',
    accent: '#e6ccb2',
    pool: ['boss', 'shop'],
    apply(stats) {
      stats.speed = Math.min(410, stats.speed + 48);
    }
  },
  {
    id: 'crickets_head',
    name: '板球之首',
    subtitle: '伤害倍率 1.5x · 巨型泪弹',
    color: '#e9c46a',
    accent: '#e76f51',
    pool: ['treasure'],
    apply(stats) {
      stats.damage = +(stats.damage + 0.8).toFixed(2);
      stats.damageMultiplier = +(stats.damageMultiplier * 1.5).toFixed(2);
      stats.tearSize = Math.min(18, stats.tearSize + 3);
    }
  },
  {
    id: 'scorpio',
    name: '天蝎剧毒',
    subtitle: '中毒持续伤害泪弹',
    color: '#51cf66',
    accent: '#b2f2bb',
    pool: ['treasure', 'boss'],
    apply(stats) {
      stats.poison = true;
      stats.damage = +(stats.damage + 0.4).toFixed(2);
    }
  }
];

export const ACTIVE_ITEMS = {
  yum_heart: {
    id: 'yum_heart',
    name: '美味的心',
    subtitle: '恢复 1 颗红心',
    maxCharge: 4,
    color: '#ff4d6d',
    canUse(player) {
      return player.stats.redHearts < player.stats.maxRedHearts;
    },
    use(player) {
      const before = player.stats.redHearts;
      player.stats.redHearts = Math.min(player.stats.maxRedHearts, player.stats.redHearts + 2);
      return player.stats.redHearts > before;
    }
  }
};

export function pickItemFromPool(rng, poolName, ownedIds = new Set()) {
  const candidates = PASSIVE_ITEMS.filter(
    (item) => item.pool.includes(poolName) && !ownedIds.has(item.id)
  );
  if (candidates.length > 0) {
    return rng.pick(candidates);
  }
  const fallback = PASSIVE_ITEMS.filter((item) => !ownedIds.has(item.id));
  if (fallback.length > 0) {
    return rng.pick(fallback);
  }
  // All items owned: fallback to Meat! stat boost
  return PASSIVE_ITEMS.find((i) => i.id === 'meat');
}
