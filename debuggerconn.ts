import { assert } from "https://deno.land/std@0.215.0/assert/assert.ts";
import DuckTape from "./ducktape.ts";
import { ConnInfo } from "./types.ts";

export default class DebuggerConn {
  private conn!: WebSocket;
  private lastId = 0;
  connInfo: ConnInfo | undefined;
  private port: number;
  private messageCallbacks: Record<string, (s: unknown) => void> = {};
  private recv: (s: object) => void;

  private constructor(
    port: number,
    recv: (s: object) => void,
  ) {
    this.port = port;
    this.recv = recv;
  }

  static async create(
    port: number,
    recv: (s: object) => void,
  ): Promise<DebuggerConn> {
    const instance = new DebuggerConn(port, recv);
    await instance.init();
    return instance;
  }

  private async init() {
    try {
      this.connInfo = await this.fetchConnectionInfo();
      await this.connectWebSocket();
    } catch (error) {
      console.error("Initialization failed:", error);
      throw error;
    }
  }

  private async fetchConnectionInfo(): Promise<ConnInfo> {
    const response = await fetch(`http://localhost:${this.port}/json/version`);
    return response.json();
  }

  private async connectWebSocket() {
    this.conn = new WebSocket(
      this.connInfo!.webSocketDebuggerUrl.replace("localhost", "127.0.0.1"),
    );

    this.conn.addEventListener("message", (event) => this.handleMessage(event));

    await new Promise<void>((resolve) => {
      this.conn.addEventListener("open", () => {
        DuckTape.log(`Browser debugging connected!`);
        resolve();
      });
    });
  }

  private handleMessage(event: MessageEvent) {
    const data = JSON.parse(event.data);

    if ('id' in data) {
      const callback = this.messageCallbacks[data.id];
      if (callback) {
        callback(data.result || data);
        delete this.messageCallbacks[data.id];
      }
    } else if ('method' in data) {
      this.recv(data);
    }
  }

  async evaluateResult(code: string, sessionId: string): Promise<unknown> {
    const response = await this.send("Runtime.evaluate", {
      expression: code,
      returnByValue: true,
    }, sessionId) as { result: { type: string; value: unknown } };
    
    return response.result.value;
  }

  send(
    method: string,
    params: object = {},
    sessionId: string | undefined = undefined,
  ): Promise<unknown> {
    assert(this.conn.readyState === WebSocket.OPEN, "send() called with closed connection");
    assert(method !== "Runtime.evaluate" || sessionId, "no sessionId given for Runtime.evaluate");

    const msg = {
      id: this.lastId++,
      method,
      params,
      sessionId: sessionId ? sessionId : undefined,
    };

    this.conn.send(JSON.stringify(msg));

    return new Promise((resolve) => {
      this.messageCallbacks[msg.id.toString()] = resolve;
    });
  }
}
