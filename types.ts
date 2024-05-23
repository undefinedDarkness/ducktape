export interface ConnInfo {
    Browser: string,
    ["Protocol-Version"]: string,
    ["User-Agent"]: string,
    ["V8-Version"]: string,
    ["WebKit-Version"]: string,
    webSocketDebuggerUrl: string
}

export enum PayloadKind {
    Message = 0,
    FnCall = 1
}

export type Payload = { tkn: number, msg: unknown, fn?: string, kind: PayloadKind }

export interface Options {
    url: string,
    exposeAPI: boolean,
    messageCB: (x: any) => Promise<unknown>
}