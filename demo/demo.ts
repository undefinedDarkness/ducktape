import DuckTape from '../ducktape.ts'

const [serverPort, server] = DuckTape.fileServer();
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