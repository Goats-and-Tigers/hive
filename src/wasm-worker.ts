import * as Comlink from "comlink";

import { Board } from "../bees-engine/bees/pkg";

export interface Move {
  from: string;
  to: string;
}
type cmd_type = "REQ" | "RES";

export interface Command {
  type: cmd_type;
  body: string;
  callback?: any;
}
export interface Stream_res {
  _id: string;
  value: any;
}
export interface board_init {
  init: () => void;
  add_move: (from: string, to: string) => void;
  set_tile: (tile: string, pos: string) => void;
  fen: () => Promise<string>;
  board: Board | null;
  proc: Array<Command>;
  stream_cmd: (body: string, receiver: any) => void;
  open_stream: (from: string, receiver: any) => void;
}

const generateRandomString = (length = 6) =>
  Math.random().toString(20).slice(0, length);

const obj: board_init = {
  board: null,
  proc: [],
  async init() {
    const wasm = await import("../bees-engine/bees/pkg/gt_engine.js");
    await wasm.default();
    await wasm.initThreadPool(navigator.hardwareConcurrency);
    this.board = new wasm.Board();
    this.proc = [];
    this.add_move = async (from: string, to: string) => {
      this.board?.add_move(from, to);
    };
    this.fen = async (): Promise<string> => {
      if (this.board) {
        return this.board?.to_fen();
      }
      return "";
    };
    this.proc = new Proxy(this.proc, {
      // @ts-ignore
      set: async (
        _: Array<Command>,
        __: string | symbol,
        value: Command
      ): Promise<boolean> => {
        if (typeof value == "object") {
          let func = value.body.split(" ");
          if (func.length < 3) {
            console.error("[ERROR]: bad stream length");
            return false;
          }
          let ret: Command = { type: "RES", body: "" };
          if (value.type == "REQ") {
            switch (func[0]) {
              case "OPEN": {
                ret.type = "RES";
                if (func[1] == "MOVE") {
                  ret.body = "SEMI JSON NIL";
                  // TODO: send move options in body as string json
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
                  // TODO: send move options in body as string json
                }
                if (value.callback) value.callback(ret);
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

                if (value.callback) value.callback(ret);
                break;
              }
            }
            return false;
          }
        }
        return true;
      },
    });
  },

  async set_tile(tile: string, pos: string) {
    this.board?.add_tile(tile, pos);
  },

  async fen(): Promise<string> {
    if (this.board) {
      return this.board?.to_fen();
    }
    return "";
  },
  open_stream(from: string, receiver: any) {
    // TODO: get possible moves from bees and reply back with move array
    this.proc.push({
      type: "REQ",
      body: `OPEN MOVE ${from}`,
      callback: receiver,
    });
  },
  stream_cmd(body: string, receiver: any) {
    this.proc.push({ type: "REQ", callback: receiver, body });
  },
};

Comlink.expose({
  init: obj.init,
  open_stream: obj.open_stream,
  stream_cmd: obj.stream_cmd,
});
