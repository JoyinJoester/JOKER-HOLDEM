import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// A file-only host for verifying the exact GitHub Pages artifact, including its subpath.
export async function staticSite(prefix = "/JOKER-HOLDEM/") {
  const root = resolve("dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (
        !["GET", "HEAD"].includes(request.method) ||
        !pathname.startsWith(prefix)
      ) {
        response.writeHead(404).end();
        return;
      }
      const file = resolve(root, pathname.slice(prefix.length) || "index.html");
      if (!file.startsWith(root + sep)) {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(file);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".png": "image/png",
      };
      response.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${prefix}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
