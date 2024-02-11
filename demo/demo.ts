import DuckTape from '../ducktape.ts'
import * as path from "https://deno.land/std@0.207.0/path/mod.ts";

const [serverPort, server] = DuckTape.fileServer(path.dirname(path.fromFileUrl(import.meta.url)));
const nt = new DuckTape({
    url: `http://localhost:${serverPort}`,
    exposeAPI: true,
    async messageCB(x: object) {
        console.info(x)
        return 'hello from server';
    }
});
// await nt.browserDebugConn.send('Browser.getVersion', {})
await nt.cleanup();
await server.shutdown();