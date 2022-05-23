// import * as wasm from "../bees-engine/bees/pkg/gt_engine.js";
import * as Comlink from "comlink";

const run = async () => {
  const w = new Worker("dist/wasm-worker.js", { type: "module" });

  const obj = Comlink.wrap(w);
  const thread = await obj.init();
  console.log(await obj.fen());
  console.log("hi");
};
run();

///await wasm.initThreadPool(navigator.hardwareConcurrency);
