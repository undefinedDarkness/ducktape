import DuckTape from "./ducktape.ts";
import { ConnInfo, Options, Payload } from "./types.ts";

const apiSource = `

    window["🦆"] = {
      outbox: [],
      callbacks: {},
      nId: 0,
      send(msg) {
        const tkn = this.nId++;
        this.outbox.push({ tkn: tkn, msg: msg });
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
    // alert('🦆 API ENABLED ' + JSON.stringify(window['🦆'], null, 2));
  
`;

export default class DebuggerConn {
  conn: Promise<WebSocket>;
  lastId = 0;
  callbacks: Record<string, Function> = {
    ["Runtime.bindingCalled"]: (
      p: { name: string; payload: string; executionContextId: number },
    ) => {
      if (p.payload == "recv") {
        this.evalWork();
      } else if (p.payload == 'ready') {
        DuckTape.log(`API is ready (confired from client)`)
        this.apiReady = true;
      }
    },
  };
  sessionId: string = "";
  apiReady: boolean = false;

  evalWork: () => Promise<void>;
  connInfo: ConnInfo | undefined;
  constructor(port: number, evalWork: () => Promise<void>) {
    this.evalWork = evalWork;
    this.conn = (async () => {
      console.time("fetchConnectionInformation");
      this.connInfo = await fetch(
        `http://localhost:${port}/json/version`,
      ).then((req) => req.json());
      console.timeEnd("fetchConnectionInformation");

      console.time("connectWebsocket");
    //   console.info(this.connInfo!.webSocketDebuggerUrl);
      // https://stackoverflow.com/questions/74355008/clientwebsocket-connectasync-always-takes-slightly-longer-than-2-seconds
      const conn = new WebSocket(
        this.connInfo!.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'),
      );

      conn.addEventListener("message", this.#recv.bind(this));

      return new Promise((res) => {
        conn.addEventListener("open", () => {
          DuckTape.log(`Browser debugging connected!`);
          console.timeEnd("browserConnection");
          console.timeEnd("connectWebsocket");
          res(conn);
        });
      });
    })();
  }

  #recv(ev: MessageEvent) {
    const msg = JSON.parse(ev.data);
    // console.info(msg);
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
      DuckTape.log(
        `Calling callback for ${msg.method.toString()}: ${
          JSON.stringify(msg, null, 2)
        }`,
      );
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
    const conn = await this.conn;
    if (conn.readyState == WebSocket.OPEN) {
      // TODO: Implement queueing if connection is not open
      conn.send(JSON.stringify(msg));
    }
  }

  // Shortcut for Runtime.evaluate
  async evaluateResult(code: string) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-RemoteObject
    return ((await this.sendAndReply("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
    })) as { result: { type: string; value: any } }).result.value;
  }

  // Send and await for a reply
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

  // Hook into browser & register handlers
  registerAPI() {
    (async () => {
      const resp = (await this.sendAndReply("Target.getTargets")) as {
        targetInfos: { targetId: string; type: string }[];
      };
      //   console.info(resp.targetInfos.filter((t) => t.type == "page"));
      const target = resp.targetInfos.filter((t) => t.type == "page")[0];

      this.sessionId = (await this.sendAndReply("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      }) as { sessionId: string }).sessionId;
      //   console.info(this.sessionId);

      await this.send("Page.enable");
      await this.send("Runtime.addBinding", {
        name: "🦆💬",
      });
      await this.send("Page.addScriptToEvaluateOnNewDocument", {
        source: apiSource,
      });
      await this.send("Runtime.enable");
    //   await this.sendAndReply("Runtime.evaluate", {
        // expression: apiSource,
    //   });
    })();
  }
}
