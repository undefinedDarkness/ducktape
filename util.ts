import { serveDir } from "https://deno.land/std@0.215.0/http/file_server.ts";

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function isValidHttpUrl(string: string) {
  let url;
  
  try {
    url = new URL(string);
  } catch (_) {
    return false;  
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

export function log(
    msg: string,
    level: "info" | "warning" | "error" | "critical" | "cdp-resp" = "info",
  ) {
    if (level == "cdp-resp") {
      // console.log(`[🌐] Got response: ${msg}`);
    } else {
      console.info(`[🦆]: ${msg}`);
    }
  }

  // File server stub
export function fileServer(fsRoot: string = Deno.cwd()): [number, Deno.HttpServer] {
    const serverPort = getRandomInt(10_000, 60_000);
    log("Starting file server");
    const server = Deno.serve({ port: serverPort }, (req) => {
      return serveDir(req, {
        fsRoot: fsRoot,
      });
    });
    return [serverPort, server];
  }