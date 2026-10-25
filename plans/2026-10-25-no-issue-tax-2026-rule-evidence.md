# 2026 annual calculation: official-source evidence and release gate

Reviewed by the implementation agent: 25 Oct 2026. **Not a complete legal review. No production rule or catalog trust flag changed.**

## Findings

- [Revenue Department: annual tax payable](https://www.rd.go.th/1778.html), page updated 17 May 2016, accessed 25 Oct 2026. Describes salary-only treatment without the alternative minimum-income method and exemption of fractional baht of calculated tax. This supports investigating tax-before-withholding rounding, but is not alone sufficient to certify 2026 settlement/refund precision and all deduction intermediates.
- [Revenue Department: RMF/LTF FAQ](https://www.rd.go.th/60059.html), accessed 25 Oct 2026. The page explicitly concerns tax year 2560. Its historic rates must NOT be reused as 2569 law. Product names do not prove current eligibility.
- [Revenue Department: deduction FAQ](https://www.rd.go.th/62777.html), accessed 25 Oct 2026. Useful background on personal/deduction conditions; spans multiple older tax years. It does not establish a fully applicable 2026 table.

## Not established in this task

Complete, current applicability and source-backed caps/conditions for all 2026 social-security, insurance, retirement, ThaiESG/ThaiESGX and donation cases; ThaiESGX new-money versus prior LTF carry-forward classification and prior use; annuity base-life versus retirement allocation; e-Donation recipient/benefit/overlap; exact intermediate monetary precision and final withholding/refund settlement across boundary cases.

The production catalog still ships 2026 coverage-only/unreviewed rules. The new UI therefore saves explicit selections and confirmations but blocks numeric annual tax/payable/refund totals. It does not substitute 2025 rules. Missing/ambiguous subtype rules also block the complete result, even with a numeric bundle.

## Release gate for numeric results

1. Obtain applicable official texts and 2026 filing instructions; record effective dates, source IDs and precise review rationale for each supported case.
2. Supply an annual rule-schema-3 bundle with complete reviewed base components, deterministic per-type/shared caps, donation stages, rounding and settlement sources. Leave ambiguous products unavailable rather than inventing legal eligibility from category names. Types needing additional persisted facts require a separately reviewed data/UI extension before enabling them.
3. Validate each number/order/precision rule against independent official examples, including boundaries, shared caps and refunds. Synthetic test fixtures exercise algorithms only; their source references are inherited test scaffolding, not evidence for 2026.
4. Only then mark the bundle and exact shipped catalog digest reviewed, with reviewer signoff. Imported self-declared review flags never unlock results.

This remaining legal-data work is intentionally visible, not a completed tax-law certification or an unavailable-network claim.
