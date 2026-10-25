import { CATEGORIES, categoryLabel, subcategoryLabel } from "./documents";
import { annualRuleSchema, NUMERIC_COMPONENTS, type AnnualRuleBundle } from "./rules";
import { formatSatang } from "./money";

export const SIMULATION_WARNING = "โหมดจำลอง: กฎยังไม่ตรวจรับ—ห้ามใช้ยื่นภาษี";
export const SIMULATION_VERSION = "2026-simulation-1";

/** Background, not legal certification. These links are static; imported text cannot add trusted hosts. */
export const SIMULATION_SOURCES = [
  { title: "กรมสรรพากร: สรุปค่าลดหย่อนฉบับปี 2567 (อ้างอิงเก่า ไม่ใช่การตรวจรับปี 2569)", url: "https://www.rd.go.th/fileadmin/download/tax_deductions_update30072567.pdf" },
  { title: "กรมสรรพากร: คำแนะนำปี 2568 และช่วงซื้อ ThaiESG 2567–2569", url: "https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins91_241268.pdf" },
  { title: "กรมสรรพากร: ตารางขั้นภาษีตั้งแต่ปี 2560", url: "https://www.rd.go.th/fileadmin/user_upload/borkor/tax121260.pdf" },
  { title: "รัฐบาล 1111: ข่าวร่างเพดาน ม.33 (ใช้ตั้งสมมติฐาน ไม่ใช่หลักฐานรับรองสิทธิภาษี)", url: "https://www.1111.go.th/Home/Newsdetails/C16D5995C48940EC8C825C72223EE9F4" },
  { title: "กรมสรรพากร: แนวทางภาษีสิ้นปีและเศษบาท", url: "https://www.rd.go.th/1778.html" },
] as const;

const assumptionsReason = "ใช้เป็นสมมติฐานจำลองเท่านั้น ยังไม่ตรวจรับความครบถ้วนและการใช้สิทธิปี 2569";
const definition = (
  category: AnnualRuleBundle["annual"]["deductions"][number]["category"],
  subcategory: AnnualRuleBundle["annual"]["deductions"][number]["subcategory"],
  capBaht: number,
  group: AnnualRuleBundle["annual"]["deductions"][number]["group"],
  priority: number,
  percentOfIncome: number | null = null,
) => ({ category, subcategory, capSatang: capBaht * 100, group, priority, percentOfIncome, multiplier: 1, status: "partial", sourceIds: ["background"], reason: assumptionsReason });

// A dedicated explicit table, not a fallback or a trusted catalog entry. Never import synthetic test fixtures here.
const table = annualRuleSchema.parse({
  schemaVersion: 3, taxYear: 2026, version: SIMULATION_VERSION, reviewedAt: "2026-10-25", officialReviewed: false,
  sources: [{ id: "background", title: "อ้างอิงพื้นฐานการลดหย่อน (ไม่รับรองเพดานปี 2569)", url: SIMULATION_SOURCES[0].url,
    publication: "สรุปกรมสรรพากรปี 2567 ใช้ประกอบสมมติฐานเท่านั้น", effectiveFrom: "2024-01-01", fetchedAt: "2026-10-25", quote: "ผู้มีเงินได้ 60,000 บาท" },
    { id: "instructions", title: SIMULATION_SOURCES[1].title, url: SIMULATION_SOURCES[1].url,
      publication: "คำแนะนำปี 2568 ประกอบสมมติฐาน ไม่ใช่การตรวจรับปี 2569", effectiveFrom: "2025-01-01", fetchedAt: "2026-10-25", quote: "ค่าซื้อหน่วยลงทุนในกองทุนรวมไทยเพื่อความยั่งยืน" },
    { id: "brackets", title: SIMULATION_SOURCES[2].title, url: SIMULATION_SOURCES[2].url,
      publication: "ตารางพื้นฐานตั้งแต่ปี 2560 ประกอบสมมติฐาน", effectiveFrom: "2017-01-01", fetchedAt: "2026-10-25", quote: "บัญชีอัตราภาษีเงินได้บุคคลธรรมดา" },
    { id: "settlement", title: SIMULATION_SOURCES[4].title, url: SIMULATION_SOURCES[4].url,
      publication: "แนวทางพื้นฐาน ไม่ยืนยันความแม่นยำการชำระหรือขอคืนปี 2569", effectiveFrom: "2016-05-17", fetchedAt: "2026-10-25", quote: "เศษของบาทจากการคำนวณภาษีให้ยกเว้น" }],
  coverage: Object.fromEntries(CATEGORIES.map((c) => [c.id, { status: "partial", reason: assumptionsReason }])),
  calculation: {
    engineVersion: 1,
    components: Object.fromEntries(NUMERIC_COMPONENTS.map((id) => [id, { status: "partial", sourceIds: [id === "progressive_brackets" ? "brackets" : id === "salary_expense" ? "instructions" : ["rounding", "withholding_settlement"].includes(id) ? "settlement" : "background"], reason: assumptionsReason }])),
    brackets: [
      { upToSatang: 15000000, ratePercent: 0 }, { upToSatang: 30000000, ratePercent: 5 },
      { upToSatang: 50000000, ratePercent: 10 }, { upToSatang: 75000000, ratePercent: 15 },
      { upToSatang: 100000000, ratePercent: 20 }, { upToSatang: 200000000, ratePercent: 25 },
      { upToSatang: 500000000, ratePercent: 30 }, { upToSatang: null, ratePercent: 35 },
    ],
    personalAllowanceSatang: 6000000, salaryExpenseRatePercent: 50, salaryExpenseCapSatang: 10000000,
    socialSecurityRatePercent: 5, socialSecurityCapSatang: 1050000,
    healthInsuranceCapSatang: 2500000, combinedLifeHealthCapSatang: 10000000, roundingVerified: false,
  },
  annual: {
    rounding: "floor-tax-baht-before-withholding", settlementSourceIds: ["settlement"],
    lifeHealthCapSatang: 10000000, retirementCapSatang: 50000000, esgCapSatang: 30000000,
    // Donation cases are deliberately absent: these bounds do not enable them.
    specialDonationPercent: 0, generalDonationPercent: 0,
    deductions: [
      definition("deduction_insurance", "insurance_life", 100000, "life_health", 1),
      definition("deduction_insurance", "insurance_health", 25000, "life_health", 2),
      { ...definition("deduction_social_security", null, 10500, "none", 3), reason: "สมมติ ม.33 เต็มปี 875 × 12 = 10,500 บาท จากข่าวร่างเพดาน ไม่รองรับ ม.39/40 หรือกรณีลดอัตรา ไม่ได้รับรองสิทธิภาษี" },
      definition("deduction_retirement", "fund_rmf", 500000, "retirement", 4, 30),
      { ...definition("deduction_retirement", "fund_thai_esg", 300000, "esg", 5, 30), sourceIds: ["instructions"] },
    ],
  },
  notes: "ตารางจำลองปี 2569 แบบเลือกเปิดเอง ไม่ใช่กฎที่ตรวจรับ อ้างอิงเก่าและสมมติฐานอาจไม่ตรงสิทธิจริง ไม่ใช้ยื่นภาษี",
});

/** Return a validated copy so callers cannot mutate the engine's bundled assumptions. */
export function simulationTable(): AnnualRuleBundle { return structuredClone(table); }

/** Values rendered from the same table the engine uses; no independently maintained UI cap numbers. */
export function simulationAssumptions(): string[] {
  const c = table.calculation, a = table.annual;
  return [
    `ค่าใช้จ่ายเงินเดือน ${c.salaryExpenseRatePercent}% ไม่เกิน ${formatSatang(c.salaryExpenseCapSatang)} บาท; ส่วนตัว ${formatSatang(c.personalAllowanceSatang)} บาท`,
    ...a.deductions.map((r) => `${r.subcategory === null ? categoryLabel(r.category) : subcategoryLabel(r.subcategory)}: ตามยอดที่ยืนยัน ไม่เกิน ${formatSatang(r.capSatang)} บาท${r.percentOfIncome === null ? "" : ` และ ${r.percentOfIncome}% ของเงินเดือนรวม`}`),
    `ชีวิตและสุขภาพรวมไม่เกิน ${formatSatang(a.lifeHealthCapSatang)} บาท จัดสรรชีวิตก่อนสุขภาพ; กลุ่มเกษียณรวม ${formatSatang(a.retirementCapSatang)} บาท`,
    "ประกันสังคมสมมติ ม.33 เต็มปี 875 บาท × 12 เดือน ไม่รองรับ ม.39/40 หรือมาตรการลดอัตรา; เงินสมทบไม่ใช่สิทธิที่ตรวจรับแล้ว",
    `ขั้นภาษีตามเงินได้สุทธิ: ${c.brackets.map((b, i) => `${i === 0 ? "0" : formatSatang(c.brackets[i - 1]!.upToSatang!)}–${b.upToSatang === null ? "ขึ้นไป" : formatSatang(b.upToSatang)} บาท ${b.ratePercent}%`).join("; ")}`,
    "สมมติคำนวณค่าใช้จ่าย/เพดานเป็นสตางค์โดยตัดเศษต่ำกว่าสตางค์ ตัดเศษบาทของภาษีรวมก่อนหัก ณ ที่จ่าย แล้วแยกจ่ายเพิ่มหรือขอคืน ไม่รับรองวิธีปัดเศษการยื่นจริง",
    "ยังไม่จำลอง ThaiESGX, SSF, LTF, PVD, กบข., กอช., ประกันบำนาญ, บริจาค และสิทธิอื่น ถ้าเลือกใช้จะหยุดผลทั้งปี ไม่ตัดเป็นศูนย์เงียบ ๆ",
    "สมมติว่ารายการที่เลือกเข้าเงื่อนไขทั้งหมด เช่น ระยะถือครองและเงื่อนไขกรมธรรม์ ไม่ตรวจสิทธิเหล่านี้แทนผู้ใช้",
  ];
}
