import DuckTape from '../ducktape.ts'

const [serverPort, server] = DuckTape.fileServer();
const nt = new DuckTape({
    url: `http://localhost:${serverPort}`,
    exposeAPI: true
});
await nt.browserDebugConn.send('Browser.getVersion', {})
await nt.cleanup();
await server.shutdown();