import { getRandomInt } from "./util.ts";
import { ConnInfo, Options, Payload } from "./types.ts";
import { serveDir } from "https://deno.land/std@0.215.0/http/file_server.ts";
import DebuggerConn from "./debuggerconn.ts"
// Possibly expose Target.exposeDevToolsProtocol



export default class DuckTape {
  browserCommand: Deno.Command;
  browserDebugConn: DebuggerConn;
  dataDir: string;
  opts: Options;

  static log(
    msg: string,
    level: "info" | "warning" | "error" | "critical" | "cdp-resp" = "info",
  ) {
    if (level == "cdp-resp") {
      // console.log(`[🌐] Got response: ${msg}`);
    } else {
      console.info(`[🦆]: ${msg}`);
    }
  }

  // File server stub
  static fileServer(fsRoot: string = Deno.cwd()): [number, Deno.HttpServer] {
    const serverPort = getRandomInt(10_000, 60_000);
    DuckTape.log("Starting file server");
    const server = Deno.serve({ port: serverPort }, (req) => {
      return serveDir(req, {
        fsRoot: fsRoot,
      });
    });
    return [serverPort, server];
  }

  constructor(options: Options) {
    this.opts = options;
    this.dataDir = Deno.makeTempDirSync();
    const debuggerPort = getRandomInt(10_000, 60_000);
    this.browserCommand = new Deno.Command("cmd.exe", {
      args: [
        `/c`,
        `start /w msedge.exe --user-data-dir=${this.dataDir} --new-window --app=${options.url} --remote-debugging-port=${debuggerPort}`,
      ],
    });
    DuckTape.log(`Browser remote debugging opened on ${debuggerPort}`);
    console.time('browserConnection')
    this.browserDebugConn = new DebuggerConn(debuggerPort, this.#runWork.bind(this));
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

    // console.info(lastWork);

    if (lastWork == undefined) {
      return;
    }

    this.opts.messageCB(lastWork.msg).then((resp) => {
      this.browserDebugConn.send("Runtime.evaluate", {
        expression: `window["🦆"].recv(${
          JSON.stringify({ tkn: lastWork.tkn, msg: resp })
        })`,
      });
    });
  }

  async waitForUserExit() {
    await this.browserCommand.output();
  }

  // Wait for browser exit & perform cleanup operations
  async cleanup() {
    await this.waitForUserExit();
    DuckTape.log(`Cleaning up`);
    await Deno.remove(this.dataDir, { recursive: true });
  }
}
