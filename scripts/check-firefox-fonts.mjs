// Run after npm run build. Uses an isolated profile/database, never the user's Firefox profile.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const out = resolve("test-results/firefox-fonts");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(join(out, "profile-"));
async function freePort() {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const port = await freePort();
const debugPort = await freePort();
const app = spawn(process.execPath, ["server/index.mjs", "--production"], {
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: join(profile, "data"),
    DISABLE_DESKTOP: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const firefox = spawn(
  process.env.FIREFOX_PATH || "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
  [
    "--headless",
    "--no-remote",
    "--profile",
    profile,
    "--remote-debugging-port",
    String(debugPort),
    "about:blank",
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let errors = "";
for (const child of [app, firefox]) {
  child.on("error", (error) => {
    errors += error.message;
  });
  child.stderr.on("data", (data) => {
    errors += data;
  });
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let id = 0;
const pending = new Map();
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => {
      pending.delete(current);
      reject(new Error(`Timeout: ${method}`));
    }, 30000);
    pending.set(current, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: current, method, params }));
  });
}
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const candidate = new WebSocket(`ws://127.0.0.1:${debugPort}/session`);
      await new Promise((r, j) => {
        candidate.addEventListener("open", r, { once: true });
        candidate.addEventListener("error", j, { once: true });
      });
      ws = candidate;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ws, `Firefox did not start: ${errors}`);
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === "error")
      request.reject(new Error(JSON.stringify(message)));
    else request.resolve(message.result);
  });
  const session = await command("session.new", { capabilities: {} });
  console.log(`Testing Firefox ${session.capabilities.browserVersion}`);
  const { context } = await command("browsingContext.create", { type: "tab" });
  const evaluate = async (expression) => {
    const result = await command("script.evaluate", {
      expression,
      target: { context },
      awaitPromise: true,
    });
    assert.equal(result.type, "success", JSON.stringify(result));
    return result.result.value;
  };
  await command("browsingContext.setViewport", {
    context,
    viewport: { width: 1920, height: 850 },
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await delay(250);
  }
  await command("browsingContext.navigate", {
    context,
    url: `http://127.0.0.1:${port}`,
    wait: "complete",
  });
  await evaluate(`(async () => {
    for(let i=0;i<100;i++) {
      if(document.querySelector('.graph-node')) { await document.fonts.ready; return true; }
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error('Application did not load');
  })()`);
  const fontRequests = new Set();
  for (const [name, width, zoom] of [
    ["desktop", 1920, 1],
    ["90-percent", 1920, 0.9],
    ["mobile", 390, 1],
  ]) {
    await command("browsingContext.setViewport", {
      context,
      viewport: { width, height: 850 },
    });
    // A fresh narrow-screen visit initializes the collapsible panels for mobile.
    if (width === 390) {
      await command("browsingContext.reload", { context, wait: "complete" });
      await evaluate(`(async () => {
        for(let i=0;i<100;i++) {
          if(document.querySelector('.graph-node')) { await document.fonts.ready; return true; }
          await new Promise(r=>setTimeout(r,100));
        }
        throw new Error('Mobile application did not load');
      })()`);
    }
    const metrics = JSON.parse(
      await evaluate(`(async () => {
      document.body.style.zoom = '${zoom}';
      const probe = document.createElement('div');
      probe.style.cssText='position:fixed;left:0;top:0;visibility:hidden;font-size:20px';
      document.body.append(probe);
      const weights=[];
      for(const weight of [400,500,600,700]) {
        const faces=await document.fonts.load(weight+' 20px "Noto Sans SC"', '每一步探索中文标题知识技术图谱');
        probe.style.fontWeight=weight;
        probe.textContent='中文标题知识图谱';
        const chars=[];
        for(let i=0;i<probe.firstChild.length;i++) {
          const r=document.createRange();r.setStart(probe.firstChild,i);r.setEnd(probe.firstChild,i+1);
          const b=r.getBoundingClientRect();chars.push({x:b.x,width:b.width,height:b.height});
        }
        weights.push({weight,loaded:faces.length,chars});
      }
      probe.remove();
      await document.fonts.ready;
      return JSON.stringify({heading:document.querySelector('h1').textContent,
        family:getComputedStyle(document.querySelector('h1')).fontFamily,weights,
        pageWidth:document.documentElement.scrollWidth,
        fonts:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.woff2')).map(r=>r.name),
        textIcons:document.querySelectorAll('text.node-symbol').length,
        vectorIcons:document.querySelectorAll('.node-symbol svg').length});
    })()`),
    );
    assert.match(metrics.heading, /每一步探索/);
    assert.match(metrics.family, /^"?Noto Sans SC/);
    // Firefox reuses decoded faces after reload without a new resource entry.
    for (const url of metrics.fonts) fontRequests.add(url);
    assert(fontRequests.size > 0);
    assert(
      [...fontRequests].every((url) =>
        url.startsWith(`http://127.0.0.1:${port}/`),
      ),
    );
    for (const weight of metrics.weights) {
      assert(
        weight.loaded > 0,
        `No font faces loaded for weight ${weight.weight}`,
      );
      for (const char of weight.chars) {
        assert(char.width >= 19 * zoom && char.width <= 21 * zoom);
        assert(char.height >= 19 * zoom);
      }
    }
    assert.equal(metrics.textIcons, 0);
    assert(metrics.vectorIcons > 0);
    if (width === 390) assert(metrics.pageWidth <= 390);
    await writeFile(
      join(out, `${name}.json`),
      JSON.stringify(metrics, null, 2),
    );
    const screenshot = await command("browsingContext.captureScreenshot", {
      context,
      origin: "viewport",
    });
    await writeFile(
      join(out, `${name}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
    console.log(
      `${name}: local fonts, four weights, glyph widths and vector icons passed`,
    );
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      await command("browser.close");
    } catch {}
    ws.close();
  }
  // Only processes created by this test; never terminate the user's browser/server.
  firefox.kill();
  app.kill();
}
