import { describe, expect, it } from "vitest";
import { detectSchemaVersion, manifestSchema, SCHEMA_VERSION } from "../../src/domain/schema";

const ID = "11111111-2222-4333-8444-555555555555";
const ATT = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const valid = () => ({
  schemaVersion: SCHEMA_VERSION,
  workspaceId: ID,
  revision: 1,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
  taxpayer: { displayName: "ผู้ทดสอบ" },
  years: {},
  records: [],
  attachments: {},
});

describe("manifestSchema", () => {
  it("accepts an empty workspace", () => {
    expect(manifestSchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects uppercase UUIDs and unknown fields", () => {
    expect(manifestSchema.safeParse({ ...valid(), workspaceId: ATT.toUpperCase() }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
  });
  it("rejects attachment paths outside the generated namespace", () => {
    const m = {
      ...valid(),
      attachments: {
        [ATT]: { id: ATT, displayName: "x", path: "../data.json", mediaType: "application/pdf", byteSize: 1, sha256: "a".repeat(64) },
      },
    };
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("rejects records that reference missing attachments", () => {
    const m = {
      ...valid(),
      records: [
        {
          id: ID, taxYear: 2026, category: "other", date: "2026-01-01", title: "t", issuer: "", notes: "",
          evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-document",
          attachmentIds: [ATT], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
        },
      ],
    };
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("detects newer schema versions before full validation", () => {
    expect(detectSchemaVersion({ schemaVersion: 2 })).toBe(2);
    expect(detectSchemaVersion({})).toBeNull();
  });
});
