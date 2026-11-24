/**
 * 外交关系、阵营、宣战、全球紧张度与国家投降结算引擎
 */

export function areAtWar(nationA, nationB, state) {
  if (!nationA || !nationB || nationA === nationB) return false;
  return state.wars.some(
    (w) =>
      (w.a === nationA && w.b === nationB) ||
      (w.a === nationB && w.b === nationA)
  );
}

export function areAllies(nationA, nationB, state) {
  if (!nationA || !nationB || nationA === nationB) return false;
  const n1 = state.nations[nationA];
  const n2 = state.nations[nationB];
  return Boolean(n1 && n2 && n1.faction && n1.faction === n2.faction);
}

export function declareWar(attackerId, defenderId, state) {
  const atk = state.nations[attackerId];
  const def = state.nations[defenderId];
  if (!atk || !def || attackerId === defenderId) {
    return { ok: false, reason: '无效宣战目标' };
  }
  if (atk.capitulated || def.capitulated) {
    return { ok: false, reason: '已投降国家无法宣战' };
  }
  if (areAllies(attackerId, defenderId, state)) {
    return { ok: false, reason: '无法向同阵营盟友宣战' };
  }
  if (areAtWar(attackerId, defenderId, state)) {
    return { ok: false, reason: '双方已处于交战状态' };
  }

  state.wars.push({
    a: attackerId,
    b: defenderId,
    startDate: state.formatDate(),
  });

  state.worldTension = Math.min(100, state.worldTension + 12);
  state.addLog(`⚔️ ${atk.name}向${def.name}正式宣战！全球紧张度升至 ${Math.round(state.worldTension)}%。`, 'war');

  // 触发阵营自动参战（高紧张度或同盟防御条约）
  for (const ally of Object.values(state.nations)) {
    if (ally.capitulated) continue;
    if (ally.id !== defenderId && ally.faction === def.faction && !areAtWar(attackerId, ally.id, state)) {
      state.wars.push({ a: attackerId, b: ally.id, startDate: state.formatDate() });
      state.addLog(`🛡️ ${ally.shortName}履行${def.faction}同盟义务，对${atk.shortName}宣战！`, 'war');
    }
    if (ally.id !== attackerId && ally.faction === atk.faction && !areAtWar(ally.id, defenderId, state)) {
      state.wars.push({ a: ally.id, b: defenderId, startDate: state.formatDate() });
      state.addLog(`🔥 ${ally.shortName}响应${atk.faction}盟友号召，加入对${def.shortName}的战争！`, 'war');
    }
  }

  return { ok: true };
}

/**
 * 计算国家投降进度（基于原始核心领土胜利点 VP 失守比例）
 */
export function computeSurrenderProgress(nationId, state) {
  let totalCoreVp = 0;
  let lostCoreVp = 0;

  for (const prov of Object.values(state.provinces)) {
    if (prov.coreOwner === nationId) {
      totalCoreVp += prov.vp;
      if (prov.owner !== nationId) {
        lostCoreVp += prov.vp;
      }
    }
  }

  if (totalCoreVp === 0) return 1.0;
  return Number((lostCoreVp / totalCoreVp).toFixed(3));
}

/**
 * 检查交战国是否达到投降阈值（核心胜利点失守 >= 75% 或丧失全部省份）
 */
export function checkCapitulations(state, conqueringNationId) {
  for (const nation of Object.values(state.nations)) {
    if (nation.capitulated) continue;
    const ownedCount = Object.values(state.provinces).filter((p) => p.owner === nation.id).length;
    const surrender = computeSurrenderProgress(nation.id, state);
    nation.surrenderProgress = surrender;

    if (ownedCount === 0 || surrender >= 0.75) {
      nation.capitulated = true;
      // 剩余领土移交给占领国
      const winnerId = conqueringNationId || findPrimaryEnemy(nation.id, state);
      if (winnerId) {
        for (const prov of Object.values(state.provinces)) {
          if (prov.owner === nation.id) {
            prov.owner = winnerId;
          }
        }
      }
      // 解散其残余部队
      for (const [divId, div] of Object.entries(state.divisions)) {
        if (div.owner === nation.id) {
          delete state.divisions[divId];
        }
      }
      // 清理与该国相关的战斗
      state.battles = state.battles.filter(
        (b) => b.attackerNation !== nation.id && b.defenderNation !== nation.id
      );

      state.addLog(`🏳️ ${nation.name}已宣布投降！剩余领土由${state.nations[winnerId]?.shortName || '敌军'}接管。`, 'war');
    }
  }
}

function findPrimaryEnemy(nationId, state) {
  const war = state.wars.find((w) => w.a === nationId || w.b === nationId);
  if (!war) return null;
  return war.a === nationId ? war.b : war.a;
}
