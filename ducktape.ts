import { getRandomInt } from "./util.ts";
import { ConnInfo, Options } from "./types.ts";
import { serveDir } from "https://deno.land/std@0.215.0/http/file_server.ts";

const apiSource = `
window["🦆"] = {
  outbox: [],
  inbox: [],

  send(msg) {
      this.history.push(msg)
  }
};
alert('🦆 API ENABLED')
`

class DebuggerConn {
  conn: Promise<WebSocket>;
  lastId = 0;
  callbacks: Record<number, Function> = {}

  constructor(port: number) {
    this.conn = (async () => {
      const connInfo: ConnInfo = await fetch(
        `http://localhost:${port}/json/version`,
      ).then((req) => req.json());
      const conn = new WebSocket(connInfo.webSocketDebuggerUrl);

      conn.addEventListener("message", this.#recv);

      return new Promise((res) => {
        conn.addEventListener("open", () => {
          DuckTape.log(`Browser debugging connected!`);
          res(conn);
        });
      });
    })();
  }

  #recv(ev: MessageEvent) {
    const msg = JSON.parse(ev.data);
    DuckTape.log(JSON.stringify(msg, undefined, 2), "cdp-resp");
    if (msg.id in this.callbacks) {
      this.callbacks[msg.id](msg.result);
      delete this.callbacks[msg.id];
    }
  }

  async send(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
    };
    const conn = await this.conn;
    conn.send(JSON.stringify(msg));
  }

  sendAndReply(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
    };
    this.conn.then(conn => conn.send(JSON.stringify(msg)));
    return new Promise(res => {
      this.callbacks[msg.id] = res
    })
  }

  registerAPI() {
    const apiSource =  
    this.send("Page.enable");
    this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: apiSource
    })
    this.send("Runtime.enable");
    this.send("Runtime.evaluate", {
      expression: apiSource
    })
  }
}

export default class DuckTape {
  browserCommand: Deno.Command;
  browserDebugConn: DebuggerConn;
  dataDir: string;

  static log(
    msg: string,
    level: "info" | "warning" | "error" | "critical" | "cdp-resp" = "info",
  ) {
    if (level == "cdp-resp") {
      console.log(`[🌐] Got response: ${msg}`)
    } else {
      console.info(`[🦆]: ${msg}`);
    }
  }

  static fileServer(): [number, Deno.HttpServer] {
    const serverPort = getRandomInt(10_000, 60_000);
    DuckTape.log("Starting file server");
    const server = Deno.serve({ port: serverPort }, (req) => {
      return serveDir(req, {
        fsRoot: Deno.cwd(),
      });
    });
    return [serverPort, server];
  }

  constructor(options: Options) {
    this.dataDir = Deno.makeTempDirSync();
    const debuggerPort = getRandomInt(10_000, 60_000);
    this.browserCommand = new Deno.Command("cmd.exe", {
      args: [
        `/c`,
        `start /w msedge.exe --user-data-dir=${this.dataDir} --new-window --app=${options.url} --remote-debugging-port=${debuggerPort}`,
      ],
    });
    DuckTape.log(`Browser remote debugging opened on ${debuggerPort}`);
    this.browserDebugConn = new DebuggerConn(debuggerPort);
    // options.exposeAPI ? this.browserDebugConn.registerAPI() : 0;
  }

  async waitForUserExit() {
    await this.browserCommand.output();
  }

  async cleanup() {
    await this.waitForUserExit();
    DuckTape.log(`Cleaning up`);
    await Deno.remove(this.dataDir, { recursive: true });
  }
}
