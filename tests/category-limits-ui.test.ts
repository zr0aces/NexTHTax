import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryLimit } from "../src/ui/category-limit";
import { Categories } from "../src/ui/categories";
import { Overview } from "../src/ui/overview";
import { RuleConditions, bundledRulesFile } from "../src/ui/rules-dialogs";
import { makeYear } from "../src/domain/workspace";
import type { RuleSet, TaxRule } from "../src/domain/model";

// All data are fictional (สมมติ); alternative caps test imported snapshots, not Thai law.
function render(id: string, modify?: (rules: RuleSet, rule: TaxRule) => void, year = 2569) {
  const rules = makeYear(year).rules, rule = rules.rules.find(r => r.id === id)!;
  modify?.(rules, rule);
  return renderToStaticMarkup(createElement(CategoryLimit, {rule, rules}));
}

describe("snapshot limit descriptions", () => {
  it("shows per-person caps only for compatible annual family rules", () => {
    expect(render("child")).toContain("30,000 บาท/คนที่เข้าเงื่อนไข");
    expect(render("child", (_, rule) => {rule.rateBps = 500; rule.description = "หลักเกณฑ์นำเข้าสมมติ";})).not.toContain("/คน");
    expect(render("child", (_, rule) => {rule.cap = 4200000;})).toContain("42,000 บาท/คน");
  });
  it("uses the workspace's own cap, percentage base and shared amount", () => {
    const html = render("health", (rules, rule) => {rule.cap = 2000000; rule.description = "หลักเกณฑ์นำเข้าสมมติ"; rule.rateBps = 1200; rule.incomeBase = "ฐานทดสอบสมมติ"; rules.sharedCaps["life-health"] = 8000000;});
    expect(html).toContain("20,000 บาท"); expect(html).toContain("12%");
    expect(html).toContain("ฐานทดสอบสมมติ"); expect(html).toContain("80,000 บาท");
    expect(html).not.toContain("100,000 บาท");
  });
  it("does not invent a fixed shared amount for special donations", () => {
    const html = render("donation-education");
    expect(html).toContain("ยอดหลังคูณตามสิทธิไม่เกิน"); expect(html).toContain("10%");
    expect(html).toContain("ใช้เพดานร่วมตามฐาน"); expect(html).not.toContain("undefined");
  });
  it("describes pension's additional portion rather than capping its whole claim", () => {
    const html = render("pension");
    expect(html).toContain("ส่วนเกษียณเพิ่มเติมไม่เกิน"); expect(html).toContain("200,000 บาท");
    expect(html).toContain("เบี้ยส่วนที่ใช้วงเงินชีวิต"); expect(html).toContain("500,000 บาท");
  });
  it("marks pending references and does not grant future-year amounts", () => {
    const html = render("solar-rooftop");
    expect(html).toContain("รอตรวจสอบ · ยังไม่นำมาคำนวณ");
    expect(html).toContain("วงเงินอ้างอิงเท่านั้น"); expect(html).not.toContain("เพดานตามหลักเกณฑ์");
    const future = render("health", undefined, 2570);
    expect(future).not.toContain("25,000"); expect(future).not.toContain("100,000");
  });
  it("future-year conditions do not inherit prior-year numeric limits", () => {
    const rules = makeYear(2570).rules, rule = rules.rules.find(r => r.id === "rmf")!;
    const html = renderToStaticMarkup(createElement(RuleConditions, {rule, rules, onClose() {}}));
    expect(html).not.toContain("500,000"); expect(html).not.toContain("300,000");
    expect(html).toContain("ไม่ใช้วงเงินหรือเงื่อนไขปีก่อน");
  });
  it("handles documents and expired rules without usable ceilings", () => {
    expect(render("income-doc")).toContain("ไม่เพิ่มยอดลดหย่อน");
    expect(render("ssf-holding")).toContain("สิทธิสิ้นสุดแล้ว");
  });
  it("resolves the public rules URL under root and nested hosting", () => {
    expect(new URL(bundledRulesFile("./"), "https://example.test/").pathname).toBe("/rules/2569.json");
    expect(new URL(bundledRulesFile("./"), "https://example.test/NexTHTax/").pathname).toBe("/NexTHTax/rules/2569.json");
  });
  it("shares the same snapshot ceiling across selection, cards and conditions", () => {
    const data = makeYear(2569), rule = data.rules.rules.find(r => r.id === "health")!;
    rule.cap = 2300000;
    const category = renderToStaticMarkup(createElement(Categories, {data, onClose() {}, onSave() {}, onCustom() {}}));
    const overview = renderToStaticMarkup(createElement(Overview, {data, onProfile() {}, onAdd() {}, onFixed() {}, onCategories() {}, onConditions() {}, onDocuments() {}}));
    const conditions = renderToStaticMarkup(createElement(RuleConditions, {rule, rules: data.rules, onClose() {}}));
    for (const html of [category, overview, conditions]) expect(html).toContain("23,000 บาท");
    expect(overview).toContain("กรอกรายได้เพื่อคำนวณวงเงินตามสัดส่วน");
  });
  it("never shows pending categories as a usable progress or remainder", () => {
    const data = makeYear(2569); data.profile.selectedCategories = ["solar-rooftop"];
    const html = renderToStaticMarkup(createElement(Overview, {data, onProfile() {}, onAdd() {}, onFixed() {}, onCategories() {}, onConditions() {}, onDocuments() {}}));
    expect(html).not.toContain('class="progress"');
    expect(html).not.toContain("วงเงินคงเหลือที่คำนวณได้");
    expect(html).toContain("ยังไม่รวมในยอดสิทธิ");
  });
});
