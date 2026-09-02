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
  assert.match(html, /<title>果园守卫队｜温暖可爱的中文塔防小游戏<\/title>/);
  assert.match(html, /BUILD 07\.2/);
  assert.match(html, /开始巡园/);
  assert.match(html, /趣味挑战/);
  assert.doesNotMatch(html, /果园伙伴册|果园访客册|BUG BOOK/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the expanded tower-defense systems and social metadata", async () => {
  const [page, layout, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/og-orchard.png", import.meta.url)),
  ]);

  assert.match(page, /const getWavePlan/);
  assert.match(page, /贪吃毛毛虫/);
  assert.match(page, /const activateEmp/);
  assert.match(page, /const SPECIALIZATIONS/);
  assert.match(page, /priority:\s*TargetPriority/);
  assert.match(page, /bestStars/);
  assert.match(page, /const SCREEN_HASH/);
  assert.match(page, /果园伙伴册/);
  assert.match(page, /果园访客册/);
  assert.match(page, /打开完整小虫图鉴/);
  assert.match(page, /const WIDTH = 720/);
  assert.match(page, /const HEIGHT = 900/);
  assert.match(page, /towerQuickPanel/);
  assert.match(page, /padPlantMenu/);
  assert.match(page, /种下哪位伙伴/);
  assert.match(css, /\.waveIntel/);
  assert.match(css, /\.specializationPicker/);
  assert.match(css, /\.battleReport/);
  assert.match(css, /\.portalGrid/);
  assert.match(css, /\.enemyArchiveGrid/);
  assert.match(css, /aspect-ratio:\s*720 \/ 900/);
  assert.match(css, /\.towerQuickPanel/);
  assert.match(layout, /og-orchard\.png/);
  assert.match(layout, /植物伙伴/);
});
