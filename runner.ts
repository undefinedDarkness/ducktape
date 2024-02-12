import DuckTape from './ducktape.ts'
import { isValidHttpUrl } from './util.ts'

const [dt_srv_port, dt_srv] = DuckTape.fileServer("demo/")
const url = (() => {
    if (Deno.args.length >= 1 && isValidHttpUrl(Deno.args[0])) {
        return Deno.args[0];
    } else {
        return `http://localhost:${dt_srv_port}`
    }
})()
let dt: DuckTape;
dt = new DuckTape({
    exposeAPI: true,
    url: url,
    messageCB: async (p: string) => {
        if (p == 'systeminfo') {
            return {
                "browser": dt.browser,
                "sys-v8-version": Deno.version.v8,
                "sys-deno-version": Deno.version.deno,
                "browser-v8-version": dt.browserDebugConn.connInfo?.['V8-Version'],
                "browser-webkit-version": dt.browserDebugConn.connInfo?.['WebKit-Version'].split(' ')[0]
            } 
        } else if (p == "perf") {
            return {
                "time-for-connection": (dt.browserDebugConn.timeWhenConfirmed - dt.start).toFixed(2),
                "time-before-launch": (dt.prepTime - dt.start).toFixed(2),
                "time-before-connection": (dt.browserDebugConn.connectedTime - dt.prepTime).toFixed(2)
            }
        }
    },
})

await dt.cleanup()
await dt_srv.shutdown()