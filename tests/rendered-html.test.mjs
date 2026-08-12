import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Chinese game lobby", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>霓虹防线｜中文塔防小游戏<\/title>/);
  assert.match(html, /BUILD 04\.0/);
  assert.match(html, /开始战役/);
  assert.match(html, /特殊模式/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the expanded tower-defense systems and social metadata", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/og-v4.png", import.meta.url)),
  ]);

  assert.match(page, /const getWavePlan/);
  assert.match(page, /主宰母舰/);
  assert.match(page, /const activateEmp/);
  assert.match(page, /const SPECIALIZATIONS/);
  assert.match(page, /priority:\s*TargetPriority/);
  assert.match(page, /bestStars/);
  assert.match(css, /\.waveIntel/);
  assert.match(css, /\.specializationPicker/);
  assert.match(css, /\.battleReport/);
  assert.match(layout, /og-v4\.png/);
  assert.match(layout, /炮塔专精/);
});
