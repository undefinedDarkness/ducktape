import { fileServer, getRandomInt, log } from "./util.ts";
import { ConnInfo, Options, Payload } from "./types.ts";
import DebuggerConn from "./debuggerconn.ts";
// Possibly expose Target.exposeDevToolsProtocol

const apiSource = `

    window["🦆"] = {
      outbox: [],
      callbacks: {},
      nId: 0,
      callFn(name, params) {
        const tkn = this.nId++;
        this.outbox.push({ tkn: tkn, fn: name, msg: params, kind: 1 })
        window["🦆💬"]("recv");
        return new Promise((res) => {
          window["🦆"].callbacks[tkn.toString()] = res;
        })
      },
      send(msg) {
        const tkn = this.nId++;
        this.outbox.push({ tkn: tkn, msg: msg, kind: 0 });
        window["🦆💬"]("recv");
        return new Promise((res) => {
          window["🦆"].callbacks[tkn.toString()] = res;
        });
      },
      recv(data) {
        const tkn = data.tkn;
        const resp = data.msg;
        window["🦆"].callbacks[tkn.toString()](resp);
        delete window["🦆"].callbacks[tkn.toString()];
      },
    };
    window['🦆💬']('ready')
    document.addEventListener("DOMContentLoaded", () => {
        if (Object.hasOwn(window, "on-🦆")) {
            window["on-🦆"]()
        }
      });
    alert('🦆 API ENABLED ' + JSON.stringify(window['🦆'], null, 2));
  
`;

export default class DuckTape {
  browserCommand!: Deno.Command;
  CDP!: DebuggerConn;
  browserProcess!: Deno.ChildProcess;
  dataDir!: string;
  opts: Options;
  browser = "edge";

  static log = log;
  static fileServer = fileServer;

  start = 0;

  static async create(opts: Options) {
    const dt = new DuckTape(opts);
    await dt.init();
    return dt;
  }

  constructor(options: Options) {
    this.opts = options;
  }

  async init() {
    this.dataDir = await Deno.makeTempDir();
    const debuggerPort = getRandomInt(10_000, 60_000);
    this.browserCommand = new Deno.Command("cmd.exe", {
      args: [
        `/c`,
        `start /MIN /w msedge.exe --user-data-dir=${this.dataDir} --new-window --app=${this.opts.url} --remote-debugging-port=${debuggerPort}`,
      ],
    });
    this.browserProcess = this.browserCommand.spawn();
    this.prepTime = performance.now();
    DuckTape.log(`Browser remote debugging opened on ${debuggerPort}`);
    console.time("browserConnection");
    this.CDP = await DebuggerConn.create(
      debuggerPort,
      this.#runWork.bind(this),
      this.#recvEvent.bind(this) as (g: object) => Promise<void>,
    );
    this.opts.exposeAPI ? await this.registerAPI() : 0;
  }
  // apiReady = false;
  // Recieve last message in client's outbox
  async #runWork() {
    if (!this.apiReady) {
      console.error(`Called, but API is not ready?`);
      return;
    }
    const lastWork = await this.CDP.evaluateResult(
      `window['🦆'].outbox.pop()`,
      this.sessionId,
    ) as Payload | undefined;
    if (lastWork == undefined) {
      return;
    }
    const reply = (resp: any) => {
      console.info(resp)
      this.CDP.evaluateResult(`window["🦆"].recv(${
          JSON.stringify({ tkn: lastWork.tkn, msg: resp })
        })`, this.sessionId);
    };

    console.info(lastWork);

    if (lastWork == undefined) {
      return;
    }

    if (lastWork.kind == 1) {
      DuckTape.log(`Calling fn: ${lastWork.fn} with params: ${lastWork.msg}`);
      if (Object.hasOwn(this.exposedFn, lastWork.fn!)) {
        console.info(this.exposedFn[lastWork.fn!](lastWork.msg));
        this.exposedFn[lastWork.fn!](lastWork.msg).then(reply);
      }
      return;
    }

    reply(await this.opts.messageCB(lastWork.msg))
  }

  prepTime = 0;
  async waitForUserExit() {
    await this.browserProcess.output();
  }
  exposedFn: Record<string, (a: any) => Promise<any>> = {};
  registerFn(name: string, fn: (a: any) => Promise<any>) {
    this.exposedFn[name] = fn;
  }

  // Wait for browser exit & perform cleanup operations
  async cleanup() {
    await this.waitForUserExit();
    DuckTape.log(`Cleaning up`);
    await Deno.remove(this.dataDir, { recursive: true });
  }
  apiReady = false;
  eventCallbacks: Record<string, Function> = {
    ["Runtime.bindingCalled"]: (
      p: { name: string; payload: string; executionContextId: number },
    ) => {
      if (p.payload == "recv") {
        this.#runWork();
      } else if (p.payload == "ready") {
        DuckTape.log(`API is ready (confired from client)`);
        this.apiReady = true;
        // this.timeWhenConfirmed = performance.now();
        this.CDP.send("Browser.setWindowBounds", {
          windowId: this.windowId,
          bounds: {
            state: "maximized",
          },
        });
      }
    },
  };
  #recvEvent(msg: { method: string; params: object }) {
    if (!this.eventCallbacks[msg.method]) {
      return;
    }
    DuckTape.log(
      `Calling callback for event: ${msg.method.toString()}: ${
        JSON.stringify(msg, null, 2)
      }`,
    );
    this.eventCallbacks[msg.method](msg.params);
  }

  windowId: number = 0;
  sessionId: string = "";
  // Hook into browser & register handlers
  async registerAPI() {
    const conn = this.CDP;
    // (async () => {
    const resp = (await conn.send("Target.getTargets")) as {
      targetInfos: { targetId: string; type: string }[];
    };
    // console.info(resp);
    const target = resp.targetInfos.filter((t) => t.type == "page")[0];
    this.sessionId = (await conn.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    }) as { sessionId: string }).sessionId;
    //   console.info(this.sessionId);

    this.windowId =
      (await conn.send("Browser.getWindowForTarget", {}, this.sessionId) as {
        windowId: number;
      }).windowId;
    await conn.send("Page.enable", {}, this.sessionId);
    await conn.send("Runtime.addBinding", {
      name: "🦆💬",
    }, this.sessionId);
    await conn.send("Page.addScriptToEvaluateOnNewDocument", {
      source: apiSource,
    }, this.sessionId);
    await conn.send("Runtime.enable", {}, this.sessionId);
    // await conn.send("Runtime.evaluate", {
    // expression: apiSource,
    // });
    // })();
  }
}
