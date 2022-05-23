(() => {
  var proxyMarker = Symbol("Comlink.proxy");
  var createEndpoint = Symbol("Comlink.endpoint");
  var releaseProxy = Symbol("Comlink.releaseProxy");
  var throwMarker = Symbol("Comlink.thrown");
  var isObject = (val) => typeof val === "object" && val !== null || typeof val === "function";
  var proxyTransferHandler = {
    canHandle: (val) => isObject(val) && val[proxyMarker],
    serialize(obj2) {
      const { port1, port2 } = new MessageChannel();
      expose(obj2, port1);
      return [port2, [port2]];
    },
    deserialize(port) {
      port.start();
      return wrap(port);
    }
  };
  var throwTransferHandler = {
    canHandle: (value) => isObject(value) && throwMarker in value,
    serialize({ value }) {
      let serialized;
      if (value instanceof Error) {
        serialized = {
          isError: true,
          value: {
            message: value.message,
            name: value.name,
            stack: value.stack
          }
        };
      } else {
        serialized = { isError: false, value };
      }
      return [serialized, []];
    },
    deserialize(serialized) {
      if (serialized.isError) {
        throw Object.assign(new Error(serialized.value.message), serialized.value);
      }
      throw serialized.value;
    }
  };
  var transferHandlers = /* @__PURE__ */ new Map([
    ["proxy", proxyTransferHandler],
    ["throw", throwTransferHandler]
  ]);
  function expose(obj2, ep = self) {
    ep.addEventListener("message", function callback(ev) {
      if (!ev || !ev.data) {
        return;
      }
      const { id, type, path } = Object.assign({ path: [] }, ev.data);
      const argumentList = (ev.data.argumentList || []).map(fromWireValue);
      let returnValue;
      try {
        const parent = path.slice(0, -1).reduce((obj3, prop) => obj3[prop], obj2);
        const rawValue = path.reduce((obj3, prop) => obj3[prop], obj2);
        switch (type) {
          case "GET":
            {
              returnValue = rawValue;
            }
            break;
          case "SET":
            {
              parent[path.slice(-1)[0]] = fromWireValue(ev.data.value);
              returnValue = true;
            }
            break;
          case "APPLY":
            {
              returnValue = rawValue.apply(parent, argumentList);
            }
            break;
          case "CONSTRUCT":
            {
              const value = new rawValue(...argumentList);
              returnValue = proxy(value);
            }
            break;
          case "ENDPOINT":
            {
              const { port1, port2 } = new MessageChannel();
              expose(obj2, port2);
              returnValue = transfer(port1, [port1]);
            }
            break;
          case "RELEASE":
            {
              returnValue = void 0;
            }
            break;
          default:
            return;
        }
      } catch (value) {
        returnValue = { value, [throwMarker]: 0 };
      }
      Promise.resolve(returnValue).catch((value) => {
        return { value, [throwMarker]: 0 };
      }).then((returnValue2) => {
        const [wireValue, transferables] = toWireValue(returnValue2);
        ep.postMessage(Object.assign(Object.assign({}, wireValue), { id }), transferables);
        if (type === "RELEASE") {
          ep.removeEventListener("message", callback);
          closeEndPoint(ep);
        }
      });
    });
    if (ep.start) {
      ep.start();
    }
  }
  function isMessagePort(endpoint) {
    return endpoint.constructor.name === "MessagePort";
  }
  function closeEndPoint(endpoint) {
    if (isMessagePort(endpoint))
      endpoint.close();
  }
  function wrap(ep, target) {
    return createProxy(ep, [], target);
  }
  function throwIfProxyReleased(isReleased) {
    if (isReleased) {
      throw new Error("Proxy has been released and is not useable");
    }
  }
  function createProxy(ep, path = [], target = function() {
  }) {
    let isProxyReleased = false;
    const proxy2 = new Proxy(target, {
      get(_target, prop) {
        throwIfProxyReleased(isProxyReleased);
        if (prop === releaseProxy) {
          return () => {
            return requestResponseMessage(ep, {
              type: "RELEASE",
              path: path.map((p) => p.toString())
            }).then(() => {
              closeEndPoint(ep);
              isProxyReleased = true;
            });
          };
        }
        if (prop === "then") {
          if (path.length === 0) {
            return { then: () => proxy2 };
          }
          const r = requestResponseMessage(ep, {
            type: "GET",
            path: path.map((p) => p.toString())
          }).then(fromWireValue);
          return r.then.bind(r);
        }
        return createProxy(ep, [...path, prop]);
      },
      set(_target, prop, rawValue) {
        throwIfProxyReleased(isProxyReleased);
        const [value, transferables] = toWireValue(rawValue);
        return requestResponseMessage(ep, {
          type: "SET",
          path: [...path, prop].map((p) => p.toString()),
          value
        }, transferables).then(fromWireValue);
      },
      apply(_target, _thisArg, rawArgumentList) {
        throwIfProxyReleased(isProxyReleased);
        const last = path[path.length - 1];
        if (last === createEndpoint) {
          return requestResponseMessage(ep, {
            type: "ENDPOINT"
          }).then(fromWireValue);
        }
        if (last === "bind") {
          return createProxy(ep, path.slice(0, -1));
        }
        const [argumentList, transferables] = processArguments(rawArgumentList);
        return requestResponseMessage(ep, {
          type: "APPLY",
          path: path.map((p) => p.toString()),
          argumentList
        }, transferables).then(fromWireValue);
      },
      construct(_target, rawArgumentList) {
        throwIfProxyReleased(isProxyReleased);
        const [argumentList, transferables] = processArguments(rawArgumentList);
        return requestResponseMessage(ep, {
          type: "CONSTRUCT",
          path: path.map((p) => p.toString()),
          argumentList
        }, transferables).then(fromWireValue);
      }
    });
    return proxy2;
  }
  function myFlat(arr) {
    return Array.prototype.concat.apply([], arr);
  }
  function processArguments(argumentList) {
    const processed = argumentList.map(toWireValue);
    return [processed.map((v) => v[0]), myFlat(processed.map((v) => v[1]))];
  }
  var transferCache = /* @__PURE__ */ new WeakMap();
  function transfer(obj2, transfers) {
    transferCache.set(obj2, transfers);
    return obj2;
  }
  function proxy(obj2) {
    return Object.assign(obj2, { [proxyMarker]: true });
  }
  function toWireValue(value) {
    for (const [name, handler] of transferHandlers) {
      if (handler.canHandle(value)) {
        const [serializedValue, transferables] = handler.serialize(value);
        return [
          {
            type: "HANDLER",
            name,
            value: serializedValue
          },
          transferables
        ];
      }
    }
    return [
      {
        type: "RAW",
        value
      },
      transferCache.get(value) || []
    ];
  }
  function fromWireValue(value) {
    switch (value.type) {
      case "HANDLER":
        return transferHandlers.get(value.name).deserialize(value.value);
      case "RAW":
        return value.value;
    }
  }
  function requestResponseMessage(ep, msg, transfers) {
    return new Promise((resolve) => {
      const id = generateUUID();
      ep.addEventListener("message", function l(ev) {
        if (!ev.data || !ev.data.id || ev.data.id !== id) {
          return;
        }
        ep.removeEventListener("message", l);
        resolve(ev.data);
      });
      if (ep.start) {
        ep.start();
      }
      ep.postMessage(Object.assign({ id }, msg), transfers);
    });
  }
  function generateUUID() {
    return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
  }
  var import_meta = {};
  function waitForMsgType(target, type) {
    return new Promise((resolve) => {
      target.addEventListener("message", function onMsg({ data }) {
        if (data == null || data.type !== type)
          return;
        target.removeEventListener("message", onMsg);
        resolve(data);
      });
    });
  }
  waitForMsgType(self, "wasm_bindgen_worker_init").then(async (data) => {
    const pkg = await import(data.mainJS);
    await pkg.default(data.module, data.memory);
    postMessage({ type: "wasm_bindgen_worker_ready" });
    pkg.wbg_rayon_start_worker(data.receiver);
  });
  var _workers;
  async function startWorkers(module, memory, builder) {
    const workerInit = {
      type: "wasm_bindgen_worker_init",
      module,
      memory,
      receiver: builder.receiver(),
      mainJS: builder.mainJS()
    };
    _workers = await Promise.all(Array.from({ length: builder.numThreads() }, async () => {
      let scriptBlob = await fetch(import_meta.url).then((r) => r.blob());
      let url = URL.createObjectURL(scriptBlob);
      const worker = new Worker(url, {
        type: "module"
      });
      worker.postMessage(workerInit);
      await waitForMsgType(worker, "wasm_bindgen_worker_ready");
      URL.revokeObjectURL(url);
      return worker;
    }));
    builder.build();
  }
  var import_meta2 = {};
  var wasm;
  var heap = new Array(32).fill(void 0);
  heap.push(void 0, null, true, false);
  function getObject(idx) {
    return heap[idx];
  }
  var heap_next = heap.length;
  function addHeapObject(obj2) {
    if (heap_next === heap.length)
      heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj2;
    return idx;
  }
  function dropObject(idx) {
    if (idx < 36)
      return;
    heap[idx] = heap_next;
    heap_next = idx;
  }
  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }
  var cachedTextDecoder = new TextDecoder("utf-8", {
    ignoreBOM: true,
    fatal: true
  });
  cachedTextDecoder.decode();
  var cachegetUint8Memory0 = null;
  function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
      cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
  }
  function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().slice(ptr, ptr + len));
  }
  var cachedTextEncoder = new TextEncoder("utf-8");
  var Turn = Object.freeze({
    Nil: 0,
    0: "Nil",
    White: 1,
    1: "White",
    Orange: 2,
    2: "Orange"
  });
  var wbg_rayon_PoolBuilder = class {
    static __wrap(ptr) {
      const obj2 = Object.create(wbg_rayon_PoolBuilder.prototype);
      obj2.ptr = ptr;
      return obj2;
    }
    __destroy_into_raw() {
      const ptr = this.ptr;
      this.ptr = 0;
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_wbg_rayon_poolbuilder_free(ptr);
    }
    mainJS() {
      const ret = wasm.wbg_rayon_poolbuilder_mainJS(this.ptr);
      return takeObject(ret);
    }
    numThreads() {
      const ret = wasm.wbg_rayon_poolbuilder_numThreads(this.ptr);
      return ret >>> 0;
    }
    receiver() {
      const ret = wasm.wbg_rayon_poolbuilder_receiver(this.ptr);
      return ret;
    }
    build() {
      wasm.wbg_rayon_poolbuilder_build(this.ptr);
    }
  };
  async function load(module, imports) {
    if (typeof Response === "function" && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          if (module.headers.get("Content-Type") != "application/wasm") {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module, imports);
      if (instance instanceof WebAssembly.Instance) {
        return { instance, module };
      } else {
        return instance;
      }
    }
  }
  async function init(input, maybe_memory) {
    if (typeof input === "undefined") {
      input = new URL("gt_engine_bg.wasm", import_meta2.url);
    }
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_log_889a3958c2eac16f = function(arg0, arg1) {
      console.log(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
      const ret = getObject(arg0);
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
      takeObject(arg0);
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_module = function() {
      const ret = init.__wbindgen_wasm_module;
      return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_memory = function() {
      const ret = wasm.memory;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_static_accessor_URL_b24f10c24510da94 = function() {
      const ret = import_meta2.url;
      return addHeapObject(ret);
    };
    imports.wbg.__wbg_startWorkers_3e6644f7fc0ac450 = function(arg0, arg1, arg2) {
      const ret = startWorkers(takeObject(arg0), takeObject(arg1), wbg_rayon_PoolBuilder.__wrap(arg2));
      return addHeapObject(ret);
    };
    if (typeof input === "string" || typeof Request === "function" && input instanceof Request || typeof URL === "function" && input instanceof URL) {
      input = fetch(input);
    }
    imports.wbg.memory = maybe_memory || new WebAssembly.Memory({ initial: 18, maximum: 16384, shared: true });
    const { instance, module } = await load(await input, imports);
    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;
    wasm.__wbindgen_start();
    return wasm;
  }
  var gt_engine_default = init;
  var returnable = {
    wasm: null
  };
  var obj = {
    async init() {
      console.log("threads");
      return returnable;
    }
  };
  expose(obj);
})();
