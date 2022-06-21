// import * as wasm from "../bees-engine/bees/pkg/gt_engine.js";
import * as Comlink from "comlink";

import { Interface } from "./wasm-worker";

const run = async () => {
  const w = new Worker("dist/wasm-worker.js", { type: "module" });

  //@ts-ignore
  const obj = Comlink.wrap(w) as Interface;
  await obj.init();
  await obj.stream_cmd(
    "OPEN GAME END",
    Comlink.proxy((res: any) => {
      console.log(res);
    })
  );
  await obj.stream_cmd(
    "COMP MOVE a1 b1",
    Comlink.proxy((hi: any) => {
      console.log(hi);
      return;
    })
  );
  await obj.stream_cmd(
    "COMP FEN END",
    Comlink.proxy((hi) => {
      console.log(hi);
    })
  );
};
run();

/// await wasm.initThreadPool(navigator.hardwareConcurrency);
