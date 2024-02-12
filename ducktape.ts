import { fileServer, getRandomInt, log } from "./util.ts";
import { ConnInfo, Options, Payload } from "./types.ts";
import DebuggerConn from "./debuggerconn.ts";
// Possibly expose Target.exposeDevToolsProtocol

export default class DuckTape {
  browserCommand: Deno.Command;
  browserDebugConn: DebuggerConn;
  browserProcess: Deno.ChildProcess;
  dataDir: string;
  opts: Options;
  browser = "edge"

  static log = log;
  static fileServer = fileServer;

  start = 0;

  constructor(options: Options) {
    this.start = performance.now();
    this.opts = options;
    this.dataDir = Deno.makeTempDirSync();
    const debuggerPort = getRandomInt(10_000, 60_000);
    this.browserCommand = new Deno.Command("cmd.exe", {
      args: [
        `/c`,
        `start /MIN /w msedge.exe --user-data-dir=${this.dataDir} --new-window --app=${options.url} --remote-debugging-port=${debuggerPort}`,
      ],
    });
    this.browserProcess = this.browserCommand.spawn();
    this.prepTime = performance.now()
    DuckTape.log(`Browser remote debugging opened on ${debuggerPort}`);
    console.time("browserConnection");
    this.browserDebugConn = new DebuggerConn(
      debuggerPort,
      this.#runWork.bind(this),
    );
    options.exposeAPI ? this.browserDebugConn.registerAPI() : 0;
  }

  // Recieve last message in client's outbox
  async #runWork() {
    if (!this.browserDebugConn.apiReady) {
      return;
    }
    const lastWork = await this.browserDebugConn.evaluateResult(
      `window['🦆'].outbox.pop()`,
    ) as Payload | undefined;
    if (lastWork == undefined) {
      return;
    }
    const reply = (resp: any) => {
      this.browserDebugConn.send("Runtime.evaluate", {
        expression: `window["🦆"].recv(${
          JSON.stringify({ tkn: lastWork.tkn, msg: resp })
        })`,
      });
    };

    // console.info(lastWork);

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

    this.opts.messageCB(lastWork.msg).then(reply);
  }

  prepTime = 0
  async waitForUserExit() {
    await this.browserProcess.output()
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
}
