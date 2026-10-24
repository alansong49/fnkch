/*
 * 心情回收站 · 局域网服务（零依赖，Node 自带模块）
 * HTTP  :8000  —— 电脑浏览器 / 手机看界面
 * HTTPS :8443  —— 自签证书；手机上语音输入必须走这个地址
 */
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const PAGE = path.join(ROOT, "心情回收站.html");
const HTTP_PORT = 8000, HTTPS_PORT = 8443;
const CERT_DIR = path.join(ROOT, "certs");
const KEY_FILE = path.join(CERT_DIR, "key.pem");
const CERT_FILE = path.join(CERT_DIR, "cert.pem");

function ensureCert() {
  if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) return true;
  try {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", KEY_FILE, "-out", CERT_FILE, "-days", "3650",
      "-subj", "/CN=mood-bin",
    ], { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function handler(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch (e) {
    res.writeHead(400); res.end(); return;
  }
  if (urlPath === "/") urlPath = "/" + path.basename(PAGE);
  if (urlPath === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT) || file === CERT_FILE || file === KEY_FILE) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

function startServer(server, port, tries, cb) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && tries > 0) {
      console.log(`[提示] 端口 ${port} 被占用，改用 ${port + 1}`);
      startServer(server, port + 1, tries - 1, cb);
    } else {
      console.log(`[错误] 服务启动失败：${err.message}`);
    }
  });
  server.listen(port, "0.0.0.0", () => cb(port));
}

function lanIPs() {
  const out = [];
  for (const name of Object.keys(os.networkInterfaces())) {
    for (const ni of os.networkInterfaces()[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function banner(httpPort, httpsPort) {
  const ips = lanIPs();
  const line = "─".repeat(46);
  console.log("\n" + line);
  console.log("  ♻ 心情回收站已启动（Ctrl+C 停止）");
  console.log(line);
  console.log("  本机访问（语音可用）：");
  console.log(`    http://localhost:${httpPort}`);
  if (httpsPort) console.log(`    https://localhost:${httpsPort}  （需信任自签证书）`);
  if (ips.length) {
    console.log("  手机 / 局域网设备：");
    for (const ip of ips) {
      console.log(`    http://${ip}:${httpPort}`);
      if (httpsPort) console.log(`    https://${ip}:${httpsPort}   ← 手机语音输入用这个`);
    }
  }
  console.log(line);
  console.log("  说明：");
  console.log("  · 手机语音输入必须走 https 地址，首次打开时");
  console.log("    浏览器会提示「不安全」→ 点「高级」→「继续前往」");
  console.log("  · 手机打不开的话：允许防火墙弹窗里的 Node.js，");
  console.log("    或以管理员身份运行一次下面这行：");
  console.log(`    netsh advfirewall firewall add rule name="mood-bin" dir=in action=allow protocol=TCP localport=${httpPort},${httpsPort || httpPort}`);
  console.log(line + "\n");
}

const hasCert = ensureCert();

startServer(http.createServer(handler), HTTP_PORT, 10, (hp) => {
  if (!hasCert) {
    console.log("[提示] 未找到 openssl，无法生成 HTTPS 证书，仅提供 HTTP 访问（手机上语音输入将不可用）");
    banner(hp, null);
    return;
  }
  const opts = { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) };
  startServer(https.createServer(opts, handler), HTTPS_PORT, 10, (sp) => banner(hp, sp));
});
