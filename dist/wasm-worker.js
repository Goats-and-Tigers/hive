import * as Comlink from "comlink";
const obj = {
  board: {},
  async init() {
    const wasm = await import("../bees-engine/bees/pkg/gt_engine.js");
    await wasm.default();
    await wasm.initThreadPool(navigator.hardwareConcurrency);
    this.board = new wasm.Board();
  },
  async add_move(from, to) {
    this.board.add_move(from, to);
  },
  async set_tile(tile, pos) {
    this.board.add_tile(tile, pos);
  },
  async fen() {
    return this.board.to_fen();
  }
};
Comlink.expose(obj);
