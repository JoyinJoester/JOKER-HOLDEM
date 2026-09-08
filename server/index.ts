import express from "express";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { installRooms } from "./rooms.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 5178);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT 必须是 1–65535 之间的整数");
const development = process.argv.includes("--dev");
const app = express();
app.disable("x-powered-by");
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 16_384, serveClient: false });
const rooms = installRooms(io);
const lanUrls = () =>
  Object.entries(networkInterfaces())
    .filter(
      ([name]) =>
        !/virtual|vmware|vbox|vethernet|wsl|clash|mihomo|tun\d|tailscale|docker/i.test(
          name,
        ),
    )
    .sort(
      ([a], [b]) =>
        Number(/wi-?fi|wlan|wireless/i.test(b)) -
        Number(/wi-?fi|wlan|wireless/i.test(a)),
    )
    .flatMap(([, interfaces]) =>
      (interfaces ?? [])
        .filter(
          (address) =>
            address.family === "IPv4" &&
            !address.internal &&
            !address.address.startsWith("169.254."),
        )
        .map((address) => `http://${address.address}:${port}`),
    );

app.get("/api/network", (_request, response) => {
  response.json({ urls: lanUrls(), port });
});
app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

if (development) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve(root, "dist"), { index: "index.html" }));
  app.get("*", (_request, response) => {
    response.sendFile(resolve(root, "dist/index.html"));
  });
}

http.on("error", (error) => {
  console.error("启动失败：", error.message);
  process.exitCode = 1;
});
http.listen(port, "0.0.0.0", () => {
  console.log(
    `\n  ♠ 小丑德州 · Joker Hold’em\n\n  本机：http://localhost:${port}`,
  );
  for (const url of lanUrls()) console.log(`  局域网：${url}`);
  console.log("\n  同一局域网内，用浏览器打开地址即可加入。\n");
});
const close = () => {
  rooms.close();
  io.close();
  http.close(() => process.exit(0));
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
