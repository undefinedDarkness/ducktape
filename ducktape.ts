import { getRandomInt } from "./util.ts";
import { ConnInfo, Options, Payload } from "./types.ts";
import { serveDir } from "https://deno.land/std@0.215.0/http/file_server.ts";

// Possibly expose Target.exposeDevToolsProtocol

const apiSource = `
window["🦆"] = {
  outbox: [],
  callbacks: {},
  nId: 0,
  send (msg) {
    const tkn = (this.nId++)
    this.outbox.push({ tkn: tkn, msg: msg })
    window["🦆💬"]("recv")
    return new Promise((res) => {
      window["🦆"].callbacks[tkn.toString()] = res
    })
  },
  recv(data) {
    const tkn = data.tkn
    const resp = data.msg
    window["🦆"].callbacks[tkn.toString()](resp)
    delete window["🦆"].callbacks[tkn.toString()]
  }
};
alert('🦆 API ENABLED')
window['🦆'].send('hello').then(res => alert(res))
`;

class DebuggerConn {
  conn: Promise<WebSocket>;
  lastId = 0;
  callbacks: Record<string, Function> = {
    ["Runtime.bindingCalled"]: (p: { name: string, payload: string, executionContextId: number }) => {
      if (p.payload == "recv") {
        this.evalWork()
      }
    }
  };
  sessionId: string = "";
  apiReady: boolean = false;

  evalWork: () => Promise<void>;
  constructor(port: number, evalWork: () => Promise<void>) {
    this.evalWork = evalWork;
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
    } else if (
      Object.hasOwn(msg, "method") &&
      Object.hasOwn(this.callbacks, msg.method)
    ) {
      DuckTape.log(`Calling callback for ${msg.method.toString()}: ${JSON.stringify(msg, null, 2)}`)
      this.callbacks[msg.method](msg.params);
    }
  }

  async send(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
      sessionId: this.sessionId == "" ? undefined : this.sessionId,
    };
    console.info(msg);
    const conn = await this.conn;
    if (conn.readyState == WebSocket.OPEN) {
      // TODO: Implement queueing if connection is not open
      conn.send(JSON.stringify(msg));
    }
  }

  async evaluateResult(code: string) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-RemoteObject
    return ((await this.sendAndReply("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
    })) as { result: { type: string; value: any } }).result.value;
  }

  sendAndReply(method: string, params: object = {}) {
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
      sessionId: this.sessionId == "" ? undefined : this.sessionId,
    };
    this.conn.then((conn) => {
      conn.readyState == WebSocket.OPEN ? conn.send(JSON.stringify(msg)) : 0;
    });
    return new Promise((res) => {
      this.callbacks[msg.id.toString()] = res;
    });
  }

  registerAPI() {
    (async () => {
      const resp = (await this.sendAndReply("Target.getTargets")) as {
        targetInfos: { targetId: string; type: string }[];
      };
      console.info(resp.targetInfos.filter((t) => t.type == "page"));
      const target = resp.targetInfos.filter((t) => t.type == "page")[0];

      this.sessionId = (await this.sendAndReply("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      }) as { sessionId: string }).sessionId;
      console.info(this.sessionId);

      // await this.send("Page.enable");
      await this.send("Runtime.addBinding", {
        name: "🦆💬"
      })
      await this.send("Page.addScriptToEvaluateOnNewDocument", {
        source: apiSource,
      });
      await this.send("Runtime.enable");
      await this.send("Runtime.evaluate", {
        expression: apiSource,
      });
      this.apiReady = true;
    })();
  }
}

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
    this.browserDebugConn = new DebuggerConn(debuggerPort, this.#runWork.bind(this));
    options.exposeAPI ? this.browserDebugConn.registerAPI() : 0;
  }

  async #runWork() {
    if (!this.browserDebugConn.apiReady) {
      return;
    }
    const lastWork = await this.browserDebugConn.evaluateResult(
      `window['🦆'].outbox.pop()`,
    ) as Payload | undefined;

    console.info(lastWork);

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

  messageCheckId = 0;
  async waitForUserExit() {
    // this.messageCheckId = setInterval(async () => {
    //   this.#runWork()
    // }, 1000);

    await this.browserCommand.output();
  }

  async cleanup() {
    await this.waitForUserExit();
    DuckTape.log(`Cleaning up`);
    clearInterval(this.messageCheckId);
    await Deno.remove(this.dataDir, { recursive: true });
  }
}
