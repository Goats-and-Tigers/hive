import * as Comlink from "comlink";
const run = async () => {
  const w = new Worker("dist/wasm-worker.js", { type: "module" });
  const obj = Comlink.wrap(w);
  await obj.init();
  await obj.stream_cmd("OPEN GAME END", Comlink.proxy((res) => {
    console.log(res);
  }));
  await obj.stream_cmd("COMP MOVE a1 b1", Comlink.proxy((hi) => {
    console.log(hi);
    return;
  }));
  await obj.stream_cmd("COMP FEN END", Comlink.proxy((hi) => {
    console.log(hi);
  }));
};
run();
