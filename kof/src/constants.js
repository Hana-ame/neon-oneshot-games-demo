// KOF Web Arcade - Core Constants & Configuration

export const FIXED_FPS = 60;
export const FIXED_DT = 1 / FIXED_FPS;

export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
export const GROUND_Y = 468;
export const STAGE_LEFT = 52;
export const STAGE_RIGHT = STAGE_WIDTH - 52;

export const GRAVITY = 0.88;
export const JUMP_VEL_Y = -17.8;
export const SHORT_HOP_VEL_Y = -13.6;
export const ROUND_TIME_SECONDS = 99;
export const MAX_HP = 1000;
export const MAX_GUARD = 100;
export const MAX_POWER = 300; // 3 full stocks (100 each)
export const POWER_PER_STOCK = 100;
export const TEAM_WIN_HEAL = 260;

export const GAME_MODES = {
  TEAM_3V3: 'team_3v3',
  ARCADE_1V1: 'arcade_1v1',
  VS_2P: 'vs_2p',
  TRAINING: 'training'
};

export const DIFFICULTY = {
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard'
};

export const FIGHTER_STATES = {
  IDLE: 'IDLE',
  WALK_F: 'WALK_F',
  WALK_B: 'WALK_B',
  CROUCH: 'CROUCH',
  JUMP: 'JUMP',
  ROLL_F: 'ROLL_F',
  ROLL_B: 'ROLL_B',
  ATTACK: 'ATTACK',
  HITSTUN: 'HITSTUN',
  BLOCKSTUN: 'BLOCKSTUN',
  KNOCKDOWN: 'KNOCKDOWN',
  WAKEUP: 'WAKEUP',
  GUARD_CRUSH: 'GUARD_CRUSH',
  KO: 'KO',
  VICTORY: 'VICTORY'
};

export const HIT_LEVELS = {
  HIGH: 'HIGH',       // Can be blocked standing or crouching (crouch whiffs some high? In KOF normals hit high/mid)
  MID: 'MID',         // Must be blocked standing (overhead)
  LOW: 'LOW'          // Must be blocked crouching
};

export const MOTION_TYPES = {
  SUPER_QCF2: '236236',
  DP: '623',
  QCF: '236',
  QCB: '214'
};

export const MATCH_PHASES = {
  INTRO: 'INTRO',
  FIGHT: 'FIGHT',
  KO_SLOWMO: 'KO_SLOWMO',
  ROUND_END: 'ROUND_END',
  MATCH_OVER: 'MATCH_OVER'
};

export const STAGES = [
  {
    id: 'tokyo_street',
    name: '东京霓虹街头',
    enName: 'TOKYO NEON STREET',
    skyTop: '#0b1026',
    skyBottom: '#2d1846',
    accent: '#ff2e63',
    floorTop: '#262436',
    floorBottom: '#151320'
  },
  {
    id: 'osaka_dojo',
    name: '大阪落日道场',
    enName: 'OSAKA SUNSET DOJO',
    skyTop: '#2a1215',
    skyBottom: '#b84b27',
    accent: '#ffbe3b',
    floorTop: '#5e3c24',
    floorBottom: '#3a2314'
  },
  {
    id: 'harbor_night',
    name: '神户星夜港口',
    enName: 'KOBE NIGHT HARBOR',
    skyTop: '#071726',
    skyBottom: '#133a5c',
    accent: '#00e5ff',
    floorTop: '#2d3748',
    floorBottom: '#1a202c'
  }
];
