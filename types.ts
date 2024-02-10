export interface ConnInfo {
    Browser: string,
    ["Protocol-Version"]: string,
    ["User-Agent"]: string,
    ["V8-Version"]: string,
    ["WebKit-Version"]: string,
    webSocketDebuggerUrl: string
}

export interface Options {
    url: string,
    exposeAPI: boolean
}