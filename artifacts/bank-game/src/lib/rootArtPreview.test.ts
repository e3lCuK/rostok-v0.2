import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import RootEnergySystem from "@/components/v2/RootEnergySystem";
import { buildReadyMaskFromSections } from "@/lib/v2Roots";
import { V2_ROOT_EMPTY_COLOR, V2_ROOT_READY_COLOR } from "@/lib/v2RootColors";

function frame(title: string, subtitle: string, html: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{margin:0;background:#1c1610;font-family:Segoe UI,sans-serif;color:#f5efe6;display:flex;flex-direction:column;align-items:center;padding:24px;gap:12px}
  h1{margin:0;font-size:16px}
  p{margin:0;font-size:12px;opacity:.85}
  .phone{position:relative;width:390px;height:560px;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,#cfe8a8 0%,#b8de74 55%,#9b7048 55%,#9b7048 100%);box-shadow:0 12px 40px rgba(0,0,0,.45)}
  .soil{position:absolute;left:0;right:0;bottom:0;height:100px;background:linear-gradient(180deg,#b88a5a,#9b7048)}
  .wrap{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);overflow:visible;isolation:isolate}
  .canopy{width:72px;height:56px;margin:0 auto -6px;background:#3f8f38;border-radius:50%}
  .tree-trunk{display:block;width:16px;height:48px;margin:0 auto;background:#6b4423;border-radius:3px 3px 2px 2px;position:relative;z-index:1}
  .anchor{position:absolute;left:50%;bottom:-83px;transform:translateX(-100px);transform-origin:100px 4px;width:200px;height:88px;overflow:visible;z-index:6;opacity:1}
</style></head>
<body>
  <h1>${title}</h1>
  <p>${subtitle}</p>
  <div class="phone">
    <div class="soil"></div>
    <div class="wrap game-tree-wrap">
      <div class="canopy"></div>
      <div class="tree-trunk"></div>
      <div class="anchor v2-root-anchor" data-anchor-ready="true">${html}</div>
    </div>
  </div>
</body></html>`;
}

describe("root art live readiness", () => {
  it("SSR markup is 4 majors × 15 sections + chest, writes polish previews", () => {
    const htmlEmpty = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        artMode: true,
        readyMask: "0",
        capital: 100_011,
        generatingProgress: 0.55,
      }),
    );
    const multiMask = buildReadyMaskFromSections([0, 1, 2, 15, 30, 45]);
    const htmlReady = renderToStaticMarkup(
      createElement(RootEnergySystem, {
        artMode: true,
        readyMask: multiMask,
        capital: 100_011,
        generatingProgress: 0.35,
      }),
    );

    expect(htmlEmpty).toContain('viewBox="0 0 200 88"');
    expect(htmlEmpty).toContain(V2_ROOT_EMPTY_COLOR);
    expect(htmlEmpty.match(/data-section-visual="true"/g)?.length).toBe(60);
    expect(htmlReady).toContain(V2_ROOT_READY_COLOR);
    expect(htmlReady.match(/data-section-state="ready"/g)?.length).toBe(6);
    expect(htmlReady.match(/data-root-hit="/g)?.length).toBe(4);

    const outDir = path.resolve(__dirname, "../..");
    writeFileSync(
      path.join(outDir, "root-art-preview.html"),
      frame(
        "Root polish — mask=0 + generating",
        `empty=${V2_ROOT_EMPTY_COLOR} · ready=${V2_ROOT_READY_COLOR} · gap≈28%`,
        htmlEmpty,
      ),
    );
    writeFileSync(
      path.join(outDir, "root-art-preview-ready.html"),
      frame(
        "Root polish — ready on 4 roots",
        `mask bits 0,1,2,15,30,45 · ready=${V2_ROOT_READY_COLOR}`,
        htmlReady,
      ),
    );
  });
});
