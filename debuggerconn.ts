import { assert } from "https://deno.land/std@0.215.0/assert/assert.ts";
import DuckTape from "./ducktape.ts";
import { ConnInfo, Options, Payload } from "./types.ts";

export default class DebuggerConn {
  conn!: WebSocket;
  lastId = 0;
  timeWhenConfirmed = 0;

  // sessionId = "";
  apiReady = false;

  evalWork: () => Promise<void>;
  connInfo: ConnInfo | undefined;
  connectedTime = 0;
  port: number;
  constructor(
    port: number,
    evalWork: () => Promise<void>,
    recv: (s: object) => void,
  ) {
    this.port = port;
    this.evalWork = evalWork;
    this.#recv = recv;
  }

  messageCallbacks: Record<string, (s: unknown) => void> = {};
  #recv: (s: object) => void;
  static async create(
    port: number,
    evalWork: () => Promise<void>,
    recv: (s: object) => void,
  ) {
    const dt = new DebuggerConn(port, evalWork, recv);
    await dt.init();
    return dt;
  }

  async init() {
    console.time("fetchJSON");
    //
    this.connInfo = await fetch(
      `http://localhost:${this.port}/json/version`,
    ).then((req) => {
      console.timeEnd("fetchJSON");
      return req.json();
    });
    // console.timeEnd("fetchConnectionInformation");

    // console.time("connectWebsocket");
    //   console.info(this.connInfo!.webSocketDebuggerUrl);
    // https://stackoverflow.com/questions/74355008/clientwebsocket-connectasync-always-takes-slightly-longer-than-2-seconds
    this.conn = new WebSocket(
      this.connInfo!.webSocketDebuggerUrl.replace("localhost", "127.0.0.1"),
    );

    this.conn.addEventListener("message", (p) => {
      const d = JSON.parse(p.data);

      if (Object.hasOwn(d, "id")) {
        const cb = this.messageCallbacks[d.id];
        if (cb) {
          cb(d.result || d);
        }
      } else if (Object.hasOwn(d, "method")) {
        this.#recv(d);
      }
    });

    await new Promise<void>((res) => {
      this.conn.addEventListener("open", () => {
        this.connectedTime = performance.now();
        DuckTape.log(`Browser debugging connected!`);
        res();
      });
    });
  }

  // Shortcut for Runtime.evaluate
  async evaluateResult(code: string, sessionId: string) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-RemoteObject
    const resp = (await this.send("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
    }, sessionId)) as { result: { type: string; value: any } };
    console.info(resp);
    return resp.result.value;
  }

  // Send and await for a reply
  send(
    method: string,
    params: object = {},
    sessionId: string | undefined = undefined,
  ) {
    
    assert(this.conn.readyState == WebSocket.OPEN, "send() called with closed connection");
    assert(method == "Runtime.evaluate" ? sessionId : true, "no sessionId given for Runtime.evaluate");
    
    const msg = {
      id: this.lastId++,
      method: method,
      params: params,
      sessionId: sessionId == "" ? undefined : sessionId,
    };

    this.conn.send(JSON.stringify(msg))

    return new Promise((res) => {
      this.messageCallbacks[msg.id.toString()] = res;
    });
  }
}
