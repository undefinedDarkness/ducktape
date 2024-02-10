export interface ConnInfo {
    Browser: string,
    ["Protocol-Version"]: string,
    ["User-Agent"]: string,
    ["V8-Version"]: string,
    ["WebKit-Version"]: string,
    webSocketDebuggerUrl: string
}

export type Payload = { tkn: number, msg: any }

export interface Options {
    url: string,
    exposeAPI: boolean,
    messageCB: (x: any) => Promise<any>
}