import DuckTape from '../ducktape.ts'
import * as path from "https://deno.land/std@0.207.0/path/mod.ts";
import * as os from "https://deno.land/std@0.177.0/node/os.ts";

const [serverPort, server] = DuckTape.fileServer(path.dirname(path.fromFileUrl(import.meta.url)));
let nt: DuckTape;
nt = new DuckTape({
    url: `http://localhost:${serverPort}`,
    exposeAPI: true,
    async messageCB(x: { req: string, payload: any }) {
        if (x.req == "systeminfo") {
            return {
                os: os.platform(),
                arch: os.arch(),
                deno_version: Deno.version.deno,
                num_cpus: os.cpus().length,
                cpu_model: os.cpus()[0].model,
                server_js_engine_version: Deno.version.v8,
                client_js_engine_version: nt.browserDebugConn.connInfo?.["V8-Version"],
                webkit_version: nt.browserDebugConn.connInfo?.["WebKit-Version"],
            }
        }
    }
});
// await nt.browserDebugConn.send('Browser.getVersion', {})
await nt.cleanup();
await server.shutdown();