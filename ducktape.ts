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
`;

class DebuggerConn {
  conn: Promise<WebSocket>;
  lastId = 0;
  callbacks: Record<string, Function> = {};
  sessionId: string = "";

  constructor(port: number) {
    this.conn = (async () => {
      const connInfo: ConnInfo = await fetch(
        `http://localhost:${port}/json/version`,
      ).then((req) => req.json());
      const conn = new WebSocket(connInfo.webSocketDebuggerUrl);

      conn.addEventListener("message", this.#recv.bind(this));

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
    if (
      Object.hasOwn(msg, "id") &&
      Object.hasOwn(this.callbacks, msg.id.toString())
    ) {
      // DuckTape.log(`Calling callback for ${msg.id.toString()}: ${JSON.stringify(msg, null, 2)}`)
      this.callbacks[msg.id.toString()](msg.result);
      delete this.callbacks[msg.id];
    }
  }

  async send(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
      sessionId: this.sessionId == "" ? undefined : this.sessionId
    };
    console.info(msg)
    const conn = await this.conn;
    conn.send(JSON.stringify(msg));
  }

  sendAndReply(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
      sessionId: this.sessionId == "" ? undefined : this.sessionId
    };
    this.conn.then((conn) => conn.send(JSON.stringify(msg)));
    return new Promise((res) => {
      this.callbacks[msg.id.toString()] = res;
    });
  }

  registerAPI() {
    (async () => {
      const resp = (await this.sendAndReply("Target.getTargets")) as {targetInfos:{targetId: string, type: string}[]};
      console.info(resp.targetInfos.filter(t => t.type == "page"))
      const target = resp.targetInfos.filter(t => t.type == "page")[0]
      
     this.sessionId = (await this.sendAndReply("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true
      }) as { sessionId: string }).sessionId;
      console.info(this.sessionId)

      await this.send("Page.enable");
      await this.send("Page.addScriptToEvaluateOnNewDocument", {
        source: apiSource,
      });
      await this.send("Runtime.enable");
      await this.send("Runtime.evaluate", {
        expression: apiSource,
      });
    })();
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
      console.log(`[🌐] Got response: ${msg}`);
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
    options.exposeAPI ? this.browserDebugConn.registerAPI() : 0;
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
