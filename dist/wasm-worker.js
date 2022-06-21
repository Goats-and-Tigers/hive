import * as Comlink from "comlink";
const generateRandomString = (length = 6) => Math.random().toString(20).slice(0, length);
const obj = {
  board: null,
  proc: [],
  async init() {
    const wasm = await import("../bees-engine/bees/pkg/gt_engine.js");
    await wasm.default();
    await wasm.initThreadPool(navigator.hardwareConcurrency);
    this.board = new wasm.Board();
    this.proc = [];
    this.add_move = async (from, to) => {
      this.board?.add_move(from, to);
    };
    this.fen = async () => {
      if (this.board) {
        return this.board?.to_fen();
      }
      return "";
    };
    this.proc = new Proxy(this.proc, {
      set: async (_, __, value) => {
        if (typeof value == "object") {
          let func = value.body.split(" ");
          if (func.length < 3) {
            console.error("[ERROR]: bad stream length");
            return false;
          }
          let ret = { type: "RES", body: "" };
          if (value.type == "REQ") {
            switch (func[0]) {
              case "OPEN": {
                ret.type = "RES";
                if (func[1] == "MOVE") {
                  ret.body = "SEMI JSON NIL";
                }
                if (func[1] == "GAME") {
                  ret.body = "SEMI STR START";
                  this.board?.add_tile("G", "a1");
                  this.board?.add_tile("H", "a2");
                  this.board?.add_tile("T", "a3");
                  this.board?.add_tile("B", "a4");
                  this.board?.add_tile("L", "a5");
                  this.board?.add_tile("M", "a6");
                  this.board?.add_tile("R", "a7");
                  this.board?.add_tile("S", "a8");
                }
                if (value.callback)
                  value.callback(ret);
                break;
              }
              case "COMP": {
                ret.type = "RES";
                if (func[1] == "MOVE") {
                  await this.board.add_move(func[2], func[3]);
                  await this.board?.proc_moves();
                  ret.body = "CLOSE STR " + func[2] + "-" + func[3];
                }
                if (func[1] == "FEN") {
                  const fen_str = await this.fen();
                  ret.body = "CLOSE STR " + fen_str;
                }
                if (value.callback)
                  value.callback(ret);
                break;
              }
            }
            return false;
          }
        }
        return true;
      }
    });
  },
  async set_tile(tile, pos) {
    this.board?.add_tile(tile, pos);
  },
  async fen() {
    if (this.board) {
      return this.board?.to_fen();
    }
    return "";
  },
  open_stream(from, receiver) {
    this.proc.push({
      type: "REQ",
      body: `OPEN MOVE ${from}`,
      callback: receiver
    });
  },
  stream_cmd(body, receiver) {
    this.proc.push({ type: "REQ", callback: receiver, body });
  }
};
Comlink.expose({
  init: obj.init,
  open_stream: obj.open_stream,
  stream_cmd: obj.stream_cmd
});
