import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import TreeGrowthBadge from "@/components/TreeGrowthBadge";
import { formatTreeGrowth } from "@/lib/engine";

const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "pages/GamePage.tsx"), "utf8");
const cssSrc = readFileSync(resolve(root, "bank.css"), "utf8");
const badgeSrc = readFileSync(
  resolve(root, "components/TreeGrowthBadge.tsx"),
  "utf8",
);

describe("TreeGrowthBadge on play field", () => {
  it("topbar no longer has growth progress row / ?", () => {
    expect(pageSrc).not.toContain("progress-widget");
    expect(pageSrc).not.toContain('onClick={() => setShowTreeInfo(true)}>?</button>');
    expect(pageSrc).not.toContain("growth-label-wrap");
  });

  it("growth badge opens rating; tree click opens stages when not collecting", () => {
    expect(pageSrc).toContain('from "@/components/TreeGrowthBadge"');
    expect(pageSrc).toContain("<TreeGrowthBadge");
    expect(pageSrc).toContain("growthMM={displayGrowthMM}");
    expect(pageSrc).toContain("onClick={() => setShowXpHistory(true)}");
    expect(pageSrc).toContain('data-tree-stages-hit="true"');
    expect(pageSrc).toContain("setShowTreeInfo(true)");
    expect(pageSrc).toContain("showApples || metelkaPendingActive");
    expect(pageSrc).toContain("showTreeInfo");
    expect(pageSrc).toContain("Стадии роста дерева");
    expect(pageSrc).toContain("🏆 Рейтинг");
    expect(pageSrc).toContain('"days" | "xp" | "growth"');
    expect(pageSrc).toContain('tab === "days" ? "Дней"');
    expect(pageSrc).toContain("formatLbLoginDays(p.loginDays)");
    expect(pageSrc).not.toContain("Сессий");
    expect(pageSrc).not.toContain("formatLbSessions");
    // Rating entry removed from bottom nav (growth badge owns it)
    expect(pageSrc).not.toContain("<Trophy");
  });

  it("CSS places badge to the right; timer + мм share one left host (same spot)", () => {
    expect(cssSrc).toContain(".tree-growth-badge-host");
    expect(cssSrc).toMatch(/\.tree-growth-badge-host\s*\{[^}]*left:\s*100%/s);
    expect(cssSrc).toMatch(/\.tree-growth-badge-host\s*\{[^}]*top:\s*42%/s);
    expect(cssSrc).toContain(".tree-growth-badge");
    expect(cssSrc).toContain(".tree-wrapper--hit");
    expect(cssSrc).toMatch(/\.growth-side-host\s*\{[^}]*right:\s*100%/s);
    expect(cssSrc).toMatch(/\.growth-side-host\s*\{[^}]*top:\s*42%/s);
    expect(cssSrc).toMatch(/\.growth-side-host\s*\{[^}]*transform:\s*translateY\(-50%\)/s);
    expect(cssSrc).toMatch(/\.growth-timer-row\s*\{[^}]*padding:\s*1px 6px 2px/s);
    expect(cssSrc).toContain(".growth-mm-accrual");
    expect(pageSrc).toContain('data-growth-side-host="true"');
    expect(pageSrc).toContain('data-growth-timer="true"');
    expect(pageSrc).toContain('data-tree-growth-mm-popup="true"');
    expect(pageSrc).toContain("growth-mm-accrual-label");
    expect(pageSrc).toContain("growth-timer-leaf");
    expect(pageSrc).toMatch(/growth-timer-leaf[\s\S]{0,80}<TreePine/);
    // Same pill class for timer and accrual; no separate positioned accrual host.
    expect(pageSrc).toContain('className="growth-timer-row growth-mm-accrual"');
    expect(pageSrc).not.toContain("tree-growth-badge-popup");
  });

  it("badge renders formatted growth and a11y label for rating", () => {
    expect(badgeSrc).toContain("data-tree-growth-badge");
    expect(badgeSrc).toContain("Рейтинг");
    const mm = 42;
    const html = renderToStaticMarkup(
      createElement(TreeGrowthBadge, {
        growthMM: mm,
        onClick: () => {},
      }),
    );
    expect(html).toContain('data-tree-growth-badge="true"');
    expect(html).toContain(formatTreeGrowth(mm));
    expect(html).toContain(`Рост дерева: ${formatTreeGrowth(mm)}. Рейтинг`);
  });
});
