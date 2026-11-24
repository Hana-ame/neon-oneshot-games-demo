(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./physics'));
  } else {
    root.GTAMissions = factory(root.GTAPhysics);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Physics) {
  'use strict';

  function createMissionCatalog(world) {
    const rc = world.roadCenters;
    const maxIdx = rc.length - 1;
    return [
      {
        id: 'm1_pickup',
        title: '霓虹黑市取货',
        subtitle: '前往日落大道指定接头点取回加密箱，并送回中心安全屋',
        type: 'delivery',
        reward: 1500,
        timeLimit: 75,
        wantedBonus: 1,
        waypoints: [
          { x: rc[maxIdx - 1], y: rc[1], label: '日落大道接头点' },
          { x: rc[3], y: rc[3], label: '中心安全屋' }
        ]
      },
      {
        id: 'm2_race',
        title: '港区极速狂飙',
        subtitle: '驾驶任意载具在限时内依次穿过 4 个港区检查点',
        type: 'checkpoints',
        requireVehicle: true,
        reward: 2500,
        timeLimit: 65,
        wantedBonus: 0,
        waypoints: [
          { x: rc[1], y: rc[maxIdx - 2], label: '检查点 1' },
          { x: rc[1], y: rc[maxIdx - 1], label: '检查点 2' },
          { x: rc[3], y: rc[maxIdx - 1], label: '检查点 3' },
          { x: rc[4], y: rc[maxIdx - 2], label: '终点线' }
        ]
      },
      {
        id: 'm3_heist',
        title: '棕榈湾现金劫案',
        subtitle: '抢夺金库包裹后触发 3 星通缉，将赃款送至工业港区码头',
        type: 'delivery',
        reward: 4000,
        timeLimit: 90,
        wantedBonus: 3,
        waypoints: [
          { x: rc[maxIdx - 1], y: rc[maxIdx - 1], label: '棕榈湾金库' },
          { x: rc[1], y: rc[maxIdx - 1], label: '工业港区接应船' }
        ]
      },
      {
        id: 'm4_evade',
        title: '甩掉热力追捕',
        subtitle: '警方已锁定你的行踪！甩掉所有通缉星级即可完成任务',
        type: 'evade',
        reward: 3500,
        timeLimit: 110,
        initialWanted: 3,
        waypoints: []
      },
      {
        id: 'm5_grand_tour',
        title: '全城霓虹大满贯',
        subtitle: '横跨四大城区，高速打卡全城 4 座地标路口',
        type: 'checkpoints',
        requireVehicle: false,
        reward: 6000,
        timeLimit: 100,
        wantedBonus: 2,
        waypoints: [
          { x: rc[1], y: rc[1], label: '市中心北站' },
          { x: rc[maxIdx - 1], y: rc[1], label: '日落广场' },
          { x: rc[maxIdx - 1], y: rc[maxIdx - 1], label: '棕榈海湾' },
          { x: rc[1], y: rc[maxIdx - 1], label: '港区灯塔' }
        ]
      }
    ];
  }

  class MissionManager {
    constructor(world) {
      this.world = world;
      this.catalog = createMissionCatalog(world);
      this.active = null;
      this.completedIds = new Set();
      this.nextIndex = 0;
    }

    startMission(indexOrId, engine) {
      let template = null;
      if (typeof indexOrId === 'number') {
        template = this.catalog[indexOrId % this.catalog.length];
      } else if (typeof indexOrId === 'string') {
        template = this.catalog.find(m => m.id === indexOrId);
      } else {
        template = this.catalog[this.nextIndex % this.catalog.length];
      }
      if (!template) return null;

      this.active = {
        ...template,
        waypointIndex: 0,
        timeLeft: template.timeLimit,
        status: 'active'
      };

      if (template.initialWanted && engine) {
        engine.addWantedHeat(template.initialWanted * 100, true);
      }
      if (engine) {
        engine.pushBanner('任务开始', `${template.title} — ${template.subtitle}`, '#00f0ff');
        engine.emitSound('missionStart');
      }
      return this.active;
    }

    getCurrentWaypoint() {
      if (!this.active || this.active.status !== 'active') return null;
      if (!this.active.waypoints || this.active.waypoints.length === 0) return null;
      return this.active.waypoints[this.active.waypointIndex] || null;
    }

    update(dt, engine) {
      if (!this.active || this.active.status !== 'active') return;

      this.active.timeLeft -= dt;
      if (this.active.timeLeft <= 0) {
        this.failMission(engine, '任务超时');
        return;
      }

      if (this.active.type === 'evade') {
        if (engine.wantedStars === 0) {
          this.completeMission(engine);
        }
        return;
      }

      const wp = this.getCurrentWaypoint();
      if (!wp) return;

      const pos = engine.getPlayerPosition();
      const hitRadius = engine.player.vehicle ? 62 : 42;
      if (Physics.dist(pos.x, pos.y, wp.x, wp.y) <= hitRadius) {
        if (this.active.requireVehicle && !engine.player.vehicle) {
          engine.pushToast('需要驾驶载具通过检查点！', '#ffaa00');
          return;
        }

        // First waypoint in delivery mission may trigger wanted stars
        if (this.active.waypointIndex === 0 && this.active.wantedBonus > 0) {
          engine.addWantedHeat(this.active.wantedBonus * 100, false);
        }

        this.active.waypointIndex++;
        engine.emitSound('checkpoint');

        if (this.active.waypointIndex >= this.active.waypoints.length) {
          this.completeMission(engine);
        } else {
          const nextWp = this.getCurrentWaypoint();
          engine.pushToast(`已抵达 ${wp.label}！下一目标：${nextWp.label}`, '#39ff14');
        }
      }
    }

    completeMission(engine) {
      if (!this.active) return;
      const finished = this.active;
      finished.status = 'completed';
      this.completedIds.add(finished.id);
      this.nextIndex = (this.catalog.findIndex(m => m.id === finished.id) + 1) % this.catalog.length;
      engine.player.cash += finished.reward;
      engine.stats.missionsCompleted += 1;
      engine.pushBanner('任务完成 +$' + finished.reward, finished.title, '#39ff14');
      engine.emitSound('missionComplete');
      this.active = null;
    }

    failMission(engine, reason) {
      if (!this.active) return;
      const failed = this.active;
      failed.status = 'failed';
      engine.pushBanner('任务失败', `${failed.title} (${reason})`, '#ff2e63');
      engine.emitSound('missionFail');
      this.active = null;
    }

    abandonMission(engine) {
      if (this.active) {
        this.failMission(engine, '已放弃');
      }
    }
  }

  return { MissionManager, createMissionCatalog };
});
