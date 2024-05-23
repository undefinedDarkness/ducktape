import DuckTape from "../ducktape.ts";
import { isValidHttpUrl } from "../util.ts";
import { dirname, fromFileUrl } from "https://deno.land/std@0.215.0/path/mod.ts";

// Start the file server
const [dt_srv_port, dt_srv] = DuckTape.fileServer(dirname(fromFileUrl(import.meta.url)));

// Determine the URL to use
const url = (() => {
  if (Deno.args.length >= 1 && isValidHttpUrl(Deno.args[0])) {
    return Deno.args[0];
  } else {
    return `http://localhost:${dt_srv_port}`;
  }
})();


// Create a DuckTape instance
const dt: DuckTape = await DuckTape.create({
  exposeAPI: true,
  url: url,
  messageCB: async (p: string) => {
    if (p == "systeminfo") {
      return {
        "browser": dt.browser,
        "sys-v8-version": Deno.version.v8,
        "sys-deno-version": Deno.version.deno,
        "browser-v8-version": dt.CDP.connInfo?.["V8-Version"],
        "browser-webkit-version": dt.CDP.connInfo
          ?.["WebKit-Version"].split(" ")[0],
      };
    }
  },
});

// Clean up and shut down the server
await dt.cleanup();
await dt_srv.shutdown();
