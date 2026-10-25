import { calculateSalaryCase, type Answer, type SalaryCaseInput } from "./tax";
import { numericBlockers, type AnyRuleBundle } from "./rules";

// Finite, user-declared health-premium scenarios only. Nothing here chooses products, funds or amounts.
// A ranking is produced only when the numeric rules are fully trusted AND the baseline is complete.
// Winners are reported within the evaluated subset; unknown or unsupported candidates are never called infeasible.

export interface HealthScenario {
  id: string;
  label: string;
  /** Extra premium on top of the baseline health premium, satang, nonnegative. */
  additionalHealthSatang: number;
  /** Feasibility facts the user declared. "unknown" stays unknown. */
  eligible: Answer;
}

export type ScenarioRow =
  | { id: string; status: "complete"; savingSatang: number }
  | { id: string; status: "infeasible"; reason: string }
  | { id: string; status: "unknown"; reason: string };

export type ScenarioOutcome =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "ranked";
      baselineTaxBeforeRoundingSatang: number;
      rows: ScenarioRow[];
      evaluatedCount: number;
      notEvaluatedCount: number;
      winnerIds: string[];
    };

export function compareHealthScenarios(
  bundle: AnyRuleBundle | null,
  base: SalaryCaseInput,
  scenarios: readonly HealthScenario[],
  budgetSatang: number | null,
): ScenarioOutcome {
  const blockers = numericBlockers(bundle);
  if (blockers.length > 0) return { status: "blocked", reasons: blockers };
  const baseline = calculateSalaryCase(bundle, base);
  if (baseline.status !== "intermediate") return { status: "blocked", reasons: ["ฐานคำนวณยังไม่ครบหรือยังไม่รองรับ"] };
  const baseTax = BigInt(baseline.taxBeforeRoundingSatang);

  const rows: ScenarioRow[] = scenarios.map((s): ScenarioRow => {
    if (!Number.isSafeInteger(s.additionalHealthSatang) || s.additionalHealthSatang < 0) {
      return { id: s.id, status: "unknown", reason: "จำนวนเงินเพิ่มไม่ถูกต้อง" };
    }
    if (s.eligible === "no") return { id: s.id, status: "infeasible", reason: "ไม่เข้าเงื่อนไขที่ผู้ใช้ระบุ" };
    if (s.eligible === "unknown") return { id: s.id, status: "unknown", reason: "ยังไม่ทราบว่าเข้าเงื่อนไขหรือไม่" };
    if (budgetSatang !== null && s.additionalHealthSatang > budgetSatang) {
      return { id: s.id, status: "infeasible", reason: "เกินงบที่ผู้ใช้ระบุ" };
    }
    const candidate = calculateSalaryCase(bundle, {
      ...base,
      healthPremiumSatang: (base.healthPremiumSatang ?? 0) + s.additionalHealthSatang,
    });
    if (candidate.status !== "intermediate") return { id: s.id, status: "unknown", reason: "ยังประเมินไม่ได้" };
    const saving = baseTax - BigInt(candidate.taxBeforeRoundingSatang);
    // Invariant from the plan: a deduction saving is never negative and never exceeds the baseline tax.
    if (saving < 0n || saving > baseTax) return { id: s.id, status: "unknown", reason: "ผลคำนวณไม่ผ่านการตรวจความสมเหตุสมผล" };
    return { id: s.id, status: "complete", savingSatang: Number(saving) };
  });

  const complete = rows.filter((r): r is Extract<ScenarioRow, { status: "complete" }> => r.status === "complete");
  const best = complete.reduce((m, r) => (r.savingSatang > m ? r.savingSatang : m), -1);
  const winnerIds = complete.length > 0 ? complete.filter((r) => r.savingSatang === best).map((r) => r.id) : [];
  return {
    status: "ranked",
    baselineTaxBeforeRoundingSatang: Number(baseTax),
    rows,
    evaluatedCount: complete.length,
    notEvaluatedCount: rows.length - complete.length - rows.filter((r) => r.status === "infeasible").length,
    winnerIds,
  };
}
