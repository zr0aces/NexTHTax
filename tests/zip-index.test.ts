import { describe, expect, it } from "vitest";
import { searchIndex } from "../src/storage/zip";
import { makeYear } from "../src/domain/workspace";
import { newId, type TaxRecord, type Workspace } from "../src/domain/model";

// Fictional fixtures (สมมติ). The index must show a fixed claim as a claim, never under the paid column.
function rec(categoryId: string, title: string, extra: Partial<TaxRecord>): TaxRecord {
  return {
    id: newId(), categoryId, title, amount: 0, date: "2026-12-31", eligibleAmount: null, provider: "", reference: "", note: "",
    documentStatus: "none", eligibility: "confirmed", checklist: [], attachments: [], facts: {}, ...extra,
  };
}
const workspace = (records: TaxRecord[]): Workspace => {
  const data = makeYear(2569);
  data.records = records;
  return {
    manifest: {schemaVersion: 1, id: "fictional-index", name: "แฟ้มสมมติ", revision: 0, createdAt: "2026-10-25T00:00:00.000Z", updatedAt: "2026-10-25T00:00:00.000Z", years: [2569]},
    years: {"2569": data}, files: new Map(), warnings: [],
  };
};

describe("ดัชนี ZIP แยกสิทธิยอดคงที่จากจ่ายจริง", () => {
  it("แถวสิทธิอยู่ในคอลัมน์ประเภทและยอดตามจำนวน ไม่อยู่ในคอลัมน์จ่ายจริง และรวมยอดจากการคำนวณ", () => {
    const html = searchIndex(workspace([
      rec("child", "บุตร (สมมติ)", {facts: {qualifyingCount: 2}}),
      rec("life", "ประกันชีวิต (สมมติ)", {amount: 500000, date: "2026-05-01"}),
    ]));
    expect(html).toContain("<td>สิทธิประจำปี ไม่ใช่รายจ่าย</td><td>บุตร (สมมติ)</td><td>—</td><td>60,000</td>");
    expect(html).toContain("<td>จ่ายจริงหรือเอกสาร</td><td>ประกันชีวิต (สมมติ)</td><td>5000.00</td><td>—</td>");
    expect(html).toContain("สิทธิยอดคงที่ที่นำมาคำนวณ 120,000 บาท");
    expect(html).not.toContain("<td>2026-12-31</td>");
  });
});
