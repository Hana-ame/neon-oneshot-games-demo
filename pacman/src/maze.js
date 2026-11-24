/**
 * 经典 28x31 街机迷宫地图与网格导航工具
 * 字符映射：
 *  '#' = 墙壁 (WALL)
 *  '.' = 普通豆子 (PELLET)
 *  'o' = 能量豆 (POWER)
 *  '-' = 幽灵屋闸门 (GHOST_GATE)
 *  'H' = 幽灵屋内部 (GHOST_HOUSE)
 *  'T' = 穿越隧道 (TUNNEL)
 *  ' ' = 空地 (EMPTY)
 */

import { MAZE_COLS, MAZE_ROWS, TILE } from './constants.js';

export const RAW_MAZE_TEMPLATE = Object.freeze([
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #HHHHHH# ##.######',
  'TTTTTT.   #HHHHHH#   .TTTTTT',
  '######.## #HHHHHH# ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
]);

const CHAR_TO_TILE = Object.freeze({
  '#': TILE.WALL,
  '.': TILE.PELLET,
  o: TILE.POWER,
  '-': TILE.GHOST_GATE,
  H: TILE.GHOST_HOUSE,
  T: TILE.TUNNEL,
  ' ': TILE.EMPTY,
});

export class Maze {
  constructor(template = RAW_MAZE_TEMPLATE) {
    this.template = template;
    this.cols = MAZE_COLS;
    this.rows = MAZE_ROWS;
    this.grid = [];
    this.totalPellets = 0;
    this.remainingPellets = 0;
    this.reset();
  }

  reset() {
    if (this.template.length !== this.rows) {
      throw new Error(`Invalid maze row count: expected ${this.rows}, got ${this.template.length}`);
    }
    this.grid = [];
    this.totalPellets = 0;
    for (let r = 0; r < this.rows; r++) {
      const line = this.template[r];
      if (line.length !== this.cols) {
        throw new Error(`Invalid maze col count at row ${r}: expected ${this.cols}, got ${line.length}`);
      }
      const rowArr = new Array(this.cols);
      for (let c = 0; c < this.cols; c++) {
        const ch = line[c];
        const tile = CHAR_TO_TILE[ch];
        if (tile === undefined) {
          throw new Error(`Unknown maze tile char "${ch}" at (${c}, ${r})`);
        }
        rowArr[c] = tile;
        if (tile === TILE.PELLET || tile === TILE.POWER) {
          this.totalPellets++;
        }
      }
      this.grid.push(rowArr);
    }
    this.remainingPellets = this.totalPellets;
  }

  wrapCol(col) {
    return ((col % this.cols) + this.cols) % this.cols;
  }

  getTile(col, row) {
    if (row < 0 || row >= this.rows) return TILE.WALL;
    const wrappedCol = this.wrapCol(col);
    return this.grid[row][wrappedCol];
  }

  isWall(col, row) {
    return this.getTile(col, row) === TILE.WALL;
  }

  isTunnel(col, row) {
    if (row < 0 || row >= this.rows) return false;
    if (col < 0 || col >= this.cols) return row === 14;
    return this.grid[row][col] === TILE.TUNNEL;
  }

  /**
   * 判断某格是否可通行
   * @param {number} col
   * @param {number} row
   * @param {boolean} canPassGate 幽灵离开/返回幽灵屋时可通过闸门
   */
  isWalkable(col, row, canPassGate = false) {
    if (row < 0 || row >= this.rows) return false;
    const wrappedCol = this.wrapCol(col);
    const t = this.grid[row][wrappedCol];
    if (t === TILE.WALL) return false;
    if (t === TILE.GHOST_GATE || t === TILE.GHOST_HOUSE) {
      return canPassGate;
    }
    return true;
  }

  /**
   * 吃掉指定格子的豆子或能量豆
   * @returns {number} 吃掉的瓦片类型 (TILE.PELLET / TILE.POWER / TILE.EMPTY)
   */
  consumePellet(col, row) {
    if (row < 0 || row >= this.rows) return TILE.EMPTY;
    const wrappedCol = this.wrapCol(col);
    const tile = this.grid[row][wrappedCol];
    if (tile === TILE.PELLET || tile === TILE.POWER) {
      this.grid[row][wrappedCol] = TILE.EMPTY;
      this.remainingPellets = Math.max(0, this.remainingPellets - 1);
      return tile;
    }
    return TILE.EMPTY;
  }

  getConsumedCount() {
    return this.totalPellets - this.remainingPellets;
  }
}
