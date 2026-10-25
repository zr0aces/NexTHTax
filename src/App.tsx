import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordDraft, ReviewStatus } from "./domain/documents";
import { invalidatesReview, CATEGORY_IDS, categoryLabel, subcategoryLabel, isSubcategoryApplicable, matchesDocumentScope, documentScopeKey, type DocumentScope, type CategoryId } from "./domain/documents";
import { bangkokCalendarYear, bangkokDateString } from "./domain/years";
import { isSupportedTaxYear } from "./domain/years";
import { SCHEMA_VERSION, canStoreSubcategory, type Manifest, type RecordEntry, type Attachment, type PriorManifest } from "./domain/schema";
import { type AnyRuleBundle, bundlePath, isTrustedMatch } from "./domain/rules";
import { catalogEntryFor, fetchBundle, fetchCatalog, loadPinnedBundle } from "./storage/pinnedRules";
import type { Catalog } from "./domain/rules";
import {
  type OpenResult,
  type AddAttachmentResult,
  WorkspaceSession,
  createWorkspace,
  isFileSystemAccessSupported,
  nowIso,
  openWorkspace,
  pickWorkspaceFolder,
} from "./storage/workspace";
import { migrateWorkspaceIntoEmptyFolder } from "./storage/migration";
import { type DirHandleLike, StorageError } from "./storage/fs";
import { WorkspaceScreen } from "./ui/WorkspaceScreen";
import { YearOverview } from "./ui/YearOverview";
import { DocumentCategories } from "./ui/DocumentCategories";
import { DocumentList } from "./ui/DocumentList";
import { TaxWorksheet } from "./ui/TaxWorksheet";
import type { TaxInputs, TaxPlan, TaxScenario } from "./domain/taxInputs";
import { DocumentEditor } from "./ui/DocumentEditor";
import { BackupPanel } from "./ui/BackupPanel";
import { RuleReview } from "./ui/RuleReview";
import { PdfPreview } from "./ui/PdfPreview";
import { ImagePreview } from "./ui/ImagePreview";
import { registerOfflineSupport } from "./offline";
import { downloadBlob } from "./ui/BackupPanel";
import { exportMetadataJson } from "./transfer/json";
import { planCompletionProjection, planReviewReasons } from "./domain/planning";
import { sha256Hex } from "./storage/hash";
import { validateManifest } from "./storage/manifest";
import { ModalDialog } from "./ui/ModalDialog";

type SaveState = "saved" | "saving" | "save-error" | "conflict";
type Tab = "worksheet" | "documents" | "tools";
interface Preview {
  attachment: Attachment;
  bytes: Uint8Array;
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "บันทึกแล้ว (อ่านกลับและตรวจสอบแล้ว)",
  saving: "กำลังบันทึก",
  "save-error": "บันทึกไม่สำเร็จ ข้อมูลล่าสุดยังอยู่ในหน้าจอ",
  conflict: "พบการเปลี่ยนแปลงจากภายนอก ระบบไม่เขียนทับ",
};

const BASE = import.meta.env.BASE_URL;

function errorText(err: unknown): string {
  if (err instanceof StorageError) return err.message;
  if (err instanceof Error) return err.message;
  return "เกิดข้อผิดพลาดที่ไม่คาดคิด";
}

export function App() {
  const [supported] = useState(isFileSystemAccessSupported);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [root, setRoot] = useState<DirHandleLike | null>(null);
  const [setupRoot, setSetupRoot] = useState<DirHandleLike | null>(null);
  const [upgrade, setUpgrade] = useState<{ source: DirHandleLike; manifest: PriorManifest } | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [taxYear, setTaxYear] = useState<number>(() => bangkokCalendarYear());
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const [documentScope, setDocumentScope] = useState<DocumentScope>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [isAddYearOpen, setIsAddYearOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState("");
  const [purgeCandidateId, setPurgeCandidateId] = useState<string | null>(null);
  const [pinConfirmOpen, setPinConfirmOpen] = useState(false);
  const [pinned, setPinned] = useState<{ bundle: AnyRuleBundle; digest: string } | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [updateApply, setUpdateApply] = useState<(() => void) | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  const handleUnsaved = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  // Browser close warning is best effort only. Data loss protection relies on save state and guards.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    registerOfflineSupport({
      onOfflineReady: () => setOfflineReady(true),
      onNeedRefresh: (apply) => setUpdateApply(() => apply),
    });
  }, []);

  useEffect(() => {
    fetchCatalog(BASE)
      .then(setCatalog)
      .catch(() => setCatalogError("ไม่สามารถโหลดรายการกฎได้ (ตรวจการเชื่อมต่อ หรือเปิดแอปออนไลน์อย่างน้อยหนึ่งครั้ง)"));
  }, []);

  useEffect(() => {
    if (!session || !manifest || !root) {
      setPinned(null);
      return;
    }
    let cancelled = false;
    loadPinnedBundle(root, manifest, taxYear)
      .then((loaded) => {
        if (!cancelled) setPinned(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPinned(null);
          setNotice(`โหลดกฎที่ปักไว้ไม่สำเร็จ: ${errorText(err)}`);
        }
      });
    return () => {
      cancelled = true;
    };
    // Reload when the pinned-year data changes; the manifest object changes on every save.
  }, [session, root, manifest, taxYear]);

  const years = useMemo(() => {
    const set = new Set<number>([bangkokCalendarYear(), bangkokCalendarYear() - 1, taxYear, ...extraYears]);
    if (manifest) {
      for (const y of Object.keys(manifest.years)) set.add(Number(y));
      for (const r of manifest.records) set.add(r.taxYear);
    }
    return [...set].sort((a, b) => a - b);
  }, [manifest, taxYear, extraYears]);

  const selected: RecordEntry | null = useMemo(
    () => (manifest && selectedId ? manifest.records.find((r) => r.id === selectedId) ?? null : null),
    [manifest, selectedId],
  );

  const yearRecords = useMemo(() => (manifest ? manifest.records.filter((r) => r.taxYear === taxYear) : []), [manifest, taxYear]);

  /** Blocks navigation away from a dirty editor until the user explicitly discards the draft. */
  const confirmLeave = (): boolean => {
    if (!dirtyRef.current) return true;
    const discard = window.confirm("มีการแก้ไขที่ยังไม่บันทึกหรือข้อมูลที่ไม่ถูกต้อง ต้องการละทิ้งการแก้ไขนี้หรือไม่");
    if (discard) handleUnsaved(false);
    return discard;
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      setNotice(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const attach = (picked: DirHandleLike, result: OpenResult) => {
    session?.close();
    setSession(result.session);
    setRoot(picked);
    setManifest(result.session.manifest);
    setMissing(result.missingAttachments);
    setPending(result.pendingCandidates);
    const existingRecord = result.session.manifest.records.filter((r) => r.trashedAt === null).sort((a, b) => b.taxYear - a.taxYear)[0];
    setDocumentScope(null);
    setListEpoch((n) => n + 1);
    setSelectedId(existingRecord?.id ?? null);
    setSaveState("saved");
    setSetupRoot(null);
    setUpgrade(null);
    setPreview(null);
    setTab("documents");
    setExtraYears([]);
    const yearsWithData = Object.keys(result.session.manifest.years).map(Number).sort((a, b) => b - a);
    const existingWorksheetYear = yearsWithData.find((year) => {
      const saved = result.session.manifest.years[String(year)]!;
      return saved.taxInputs !== null || saved.scenarios.length > 0;
    });
    setTaxYear(existingRecord?.taxYear ?? existingWorksheetYear ?? yearsWithData[0] ?? bangkokCalendarYear());
    const warnings = [];
    if (result.session.readOnly) warnings.push("โฟลเดอร์นี้เปิดแบบอ่านอย่างเดียว เพราะมีหน้าต่างอื่นแก้ไขอยู่");
    if (result.orphanFiles.length > 0) warnings.push(`พบไฟล์ค้าง ${result.orphanFiles.length} ไฟล์ใน attachments/ (ไม่ถูกลบอัตโนมัติ)`);
    if (result.pendingCandidates.length > 0) warnings.push("พบ candidate จากการบันทึกที่ค้างอยู่ ระบบไม่ใช้โดยอัตโนมัติ");
    setNotice(warnings.length > 0 ? warnings.join(" · ") : "เปิดโฟลเดอร์แล้ว");
  };

  const openFolder = () =>
    run(async () => {
      if (!confirmLeave()) return;
      const picked = await pickWorkspaceFolder();
      const result = await openWorkspace(picked);
      if ("needsSetup" in result) {
        setSetupRoot(picked);
        return;
      }
      if ("upgradeRequired" in result) {
        setUpgrade({ source: picked, manifest: result.manifest });
        return;
      }
      attach(picked, result);
    });

  const migrateFolder = () => run(async () => {
    if (!upgrade || !confirmLeave()) return;
    if (!window.confirm("สร้างสำเนาข้อมูลรุ่นใหม่ในโฟลเดอร์ว่างหรือไม่? ต้นฉบับจะไม่เปลี่ยนแปลง ข้อมูลเดิมและต้นฉบับจะถูกเก็บไว้ แอปรุ่นเก่าเปิดสำเนาใหม่ไม่ได้")) return;
    const target = await pickWorkspaceFolder();
    session?.close();
    setSession(null);
    setManifest(null);
    await migrateWorkspaceIntoEmptyFolder(upgrade.source, target, true);
    const opened = await openWorkspace(target);
    if ("needsSetup" in opened || "upgradeRequired" in opened) throw new StorageError("write-failed", "สำเนายังไม่พร้อมเปิด");
    attach(target, opened);
    setNotice("เปิดสำเนารุ่นใหม่แล้ว ต้นฉบับคงเดิม ยังไม่รับรองสิทธิหรือผลคำนวณภาษี");
  });

  const startNewFolder = () =>
    run(async () => {
      if (!confirmLeave()) return;
      setSetupRoot(await pickWorkspaceFolder());
    });

  const submitSetupName = (name: string) =>
    run(async () => {
      if (!setupRoot) return;
      attach(setupRoot, await createWorkspace(setupRoot, name));
    });

  const closeFolder = () => {
    if (!confirmLeave()) return false;
    session?.close();
    setSession(null);
    setRoot(null);
    setManifest(null);
    setPinned(null);
    setSelectedId(null);
    setPreview(null);
    setNotice("ปิดโฟลเดอร์แล้ว");
    return true;
  };

  const requestFeatureUpgrade = () => {
    if (!session || !root) return;
    const stored = session.storedManifest;
    if (stored.schemaVersion !== SCHEMA_VERSION && closeFolder()) setUpgrade({ source: root, manifest: stored });
  };

  /** Commits one mutation. Save state reflects whether the write was read back and accepted. */
  const commit = async (apply: (draft: Manifest) => void): Promise<Manifest> => {
    if (!session) throw new StorageError("read-only", "ยังไม่ได้เปิดโฟลเดอร์");
    setSaveState("saving");
    try {
      const next = await session.mutate(apply);
      setManifest(next);
      setSaveState("saved");
      return next;
    } catch (err) {
      setSaveState(session.hasConflict ? "conflict" : "save-error");
      throw err;
    }
  };

  const saveTaxInputs = async (taxYear: number, taxInputs: TaxInputs): Promise<void> => {
    setBusy(true);
    try {
      await commit((m) => {
        const key = String(taxYear);
        if (!m.years[key]) m.years[key] = { taxYear, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
        m.years[key].taxInputs = taxInputs;
      });
    } finally {
      setBusy(false);
    }
  };

  const verifyPlanEvidence = useCallback(async (recordId: string): Promise<void> => {
    if (!session) throw new StorageError("read-only", "ยังไม่ได้เปิดโฟลเดอร์");
    const record = session.manifest.records.find((r) => r.id === recordId);
    if (!record || record.attachmentIds.length === 0) throw new StorageError("invalid", "ไม่พบไฟล์หลักฐาน");
    for (const id of record.attachmentIds) await session.readAttachment(id);
  }, [session]);

  const savePlan = async (scenario: TaxScenario, plan: TaxPlan, complete: boolean): Promise<void> => {
    if (!session) throw new StorageError("read-only", "ยังไม่ได้เปิดโฟลเดอร์");
    setBusy(true);
    try {
      const candidate = structuredClone(session.manifest);
      const apply = (m: Manifest) => {
        const key = String(taxYear);
        const year = m.years[key] ??= { taxYear, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
        const index = year.scenarios.findIndex((s) => s.id === scenario.id);
        if (index < 0) year.scenarios.push(scenario); else year.scenarios[index] = scenario;
        year.plan = { ...plan, completionDigest: null };
      };
      apply(candidate);
      validateManifest(candidate);
      const projection = planCompletionProjection(candidate, taxYear);
      let digest: string | null = null;
      if (complete) {
        const reasons = planReviewReasons(candidate, taxYear);
        if (reasons.length > 0) throw new StorageError("invalid", reasons.join(" · "));
        await verifyPlanEvidence(plan.evidenceRecordId!);
        digest = await sha256Hex(new TextEncoder().encode(projection));
      }
      await commit((m) => {
        apply(m);
        if (planCompletionProjection(m, taxYear) !== projection) throw new StorageError("conflict", "ข้อมูลเปลี่ยนระหว่างยืนยันแผน โปรดตรวจสอบใหม่");
        m.years[String(taxYear)]!.plan!.completionDigest = digest;
      });
    } finally { setBusy(false); }
  };

  const saveRecord = async (id: string, draft: RecordDraft): Promise<RecordEntry> => {
    const next = await commit((m) => {
      const key = String(draft.taxYear);
      if (!m.years[key]) m.years[key] = { taxYear: draft.taxYear, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      const r = m.records.find((x) => x.id === id);
      if (!r) throw new StorageError("invalid", "ไม่พบรายการ");
      for (const year of Object.values(m.years)) {
        if (year.plan?.evidenceRecordId === id && year.taxYear !== draft.taxYear) {
          year.plan.evidenceRecordId = null;
          year.plan.completionDigest = null;
        }
      }
      let status: ReviewStatus = draft.status;
      if (status === "reviewed" && invalidatesReview(r, draft)) status = "waiting-review";
      Object.assign(r, {
        taxYear: draft.taxYear,
        category: draft.category,
        subcategory: draft.subcategory,
        date: draft.date,
        title: draft.title,
        issuer: draft.issuer,
        notes: draft.notes,
        evidenceAmountSatang: draft.evidenceAmountSatang,
        claimedAmountSatang: draft.claimedAmountSatang,
        withheldAmountSatang: draft.withheldAmountSatang,
        attachmentIds: draft.attachmentIds,
        status,
        updatedAt: nowIso(),
      });
    });
    const saved = next.records.find((x) => x.id === id);
    if (!saved) throw new StorageError("invalid", "ไม่พบรายการหลังบันทึก");
    if (saved.taxYear !== taxYear) {
      setTaxYear(saved.taxYear);
      setDocumentScope(null);
      setListEpoch((n) => n + 1);
    } else if (!matchesDocumentScope(saved, documentScope)) {
      setDocumentScope({ category: saved.category as CategoryId, subcategory: saved.subcategory });
    }
    return saved;
  };

  const addRecord = () =>
    run(async () => {
      if (!confirmLeave()) return;
      const category = documentScope?.category ?? "other";
      const subcategory = documentScope?.subcategory ?? null;
      if (!CATEGORY_IDS.includes(category) || !isSubcategoryApplicable(category, subcategory)) throw new StorageError("invalid", "หมวดหรือประเภทย่อยไม่ถูกต้อง");
      if (!session || !canStoreSubcategory(session.storageSchemaVersion, subcategory)) {
        setNotice("รูปแบบเดิมยังเก็บประเภทนี้ไม่ได้ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน ต้นฉบับจะไม่เปลี่ยน");
        requestFeatureUpgrade();
        return;
      }
      const id = crypto.randomUUID();
      const now = nowIso();
      await commit((m) => {
        const key = String(taxYear);
        if (!m.years[key]) m.years[key] = { taxYear, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
        m.records.push({
          id,
          taxYear,
          category,
          subcategory,
          date: bangkokDateString(),
          title: `รอเอกสาร ${subcategory === null ? categoryLabel(category) : subcategoryLabel(subcategory)}`,
          issuer: "",
          notes: "",
          evidenceAmountSatang: null,
          claimedAmountSatang: null,
          withheldAmountSatang: null,
          status: "waiting-document",
          attachmentIds: [],
          createdAt: now,
          updatedAt: now,
          trashedAt: null,
        });
      });
      setSelectedId(id);
      setPreview(null);
      setListEpoch((n) => n + 1);
    });

  const showDocumentList = () => {
    requestAnimationFrame(() => {
      const list = document.getElementById("document-list");
      list?.scrollIntoView({ block: "start", behavior: "auto" });
      list?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  };

  const selectDocumentScope = (next: DocumentScope) => {
    if (documentScopeKey(next) === documentScopeKey(documentScope)) { showDocumentList(); return; }
    if (selected && !matchesDocumentScope(selected, next)) {
      if (!confirmLeave()) return;
      setSelectedId(null);
      setPreview(null);
    }
    setDocumentScope(next);
    showDocumentList();
  };

  const selectRecord = (id: string) => {
    if (id === selectedId) return;
    if (!confirmLeave()) return;
    setSelectedId(id);
  };

  const changeYear = (year: number) => {
    if (year === taxYear) return;
    if (!confirmLeave()) return;
    setSelectedId(null);
    setPreview(null);
    setDocumentScope(null);
    setListEpoch((n) => n + 1);
    setTaxYear(year);
  };

  const addYear = (raw: string) => {
    const year = Number(raw);
    if (!isSupportedTaxYear(year)) {
      setNotice("ปีภาษีไม่ถูกต้อง");
      return;
    }
    if (!confirmLeave()) return;
    setExtraYears((ys) => [...ys, year]);
    setSelectedId(null);
    setPreview(null);
    setDocumentScope(null);
    setListEpoch((n) => n + 1);
    setTaxYear(year);
  };

  const trashRecord = (id: string) =>
    run(async () => {
      if (selectedId === id && !confirmLeave()) return;
      const now = nowIso();
      await commit((m) => {
        const r = m.records.find((x) => x.id === id);
        if (r) r.trashedAt = now;
      });
      if (selectedId === id) setSelectedId(null);
    });

  const restoreRecord = (id: string) =>
    run(async () => {
      await commit((m) => {
        const r = m.records.find((x) => x.id === id);
        if (r) r.trashedAt = null;
      });
    });

  const requestPurge = (id: string) => {
    setPurgeCandidateId(id);
  };

  const executePurge = (id: string) =>
    run(async () => {
      if (!session) return;
      if (selectedId === id && !confirmLeave()) return;
      setSaveState("saving");
      try {
        const removed = await session.purgeRecord(id);
        setManifest(session.manifest);
        setSaveState("saved");
        setNotice(removed.length > 0 ? `ลบถาวรแล้ว ไฟล์ที่ลบ: ${removed.join(", ")}` : "ลบรายการถาวรแล้ว");
      } catch (err) {
        setManifest(session.manifest);
        setSaveState(session.hasConflict ? "conflict" : "save-error");
        throw err;
      }
      if (selectedId === id) setSelectedId(null);
    });

  const addFile = async (file: File, displayName: string, allowDuplicate: boolean): Promise<AddAttachmentResult> => {
    if (!session) throw new StorageError("read-only", "ยังไม่ได้เปิดโฟลเดอร์");
    setSaveState("saving");
    try {
      const result = await session.addAttachment(file, displayName, allowDuplicate);
      setManifest(session.manifest);
      setSaveState("saved");
      return result;
    } catch (err) {
      setManifest(session.manifest);
      setSaveState(session.hasConflict ? "conflict" : "save-error");
      throw err;
    }
  };

  const linkAttachment = async (record: RecordEntry, attachmentId: string) => {
    await commit((m) => {
      const r = m.records.find((x) => x.id === record.id);
      if (!r || r.attachmentIds.includes(attachmentId)) return;
      r.attachmentIds.push(attachmentId);
      if (r.status === "reviewed") r.status = "waiting-review";
      r.updatedAt = nowIso();
    });
  };

  const unlinkAttachment = async (record: RecordEntry, attachmentId: string) => {
    await commit((m) => {
      const r = m.records.find((x) => x.id === record.id);
      if (!r) return;
      r.attachmentIds = r.attachmentIds.filter((id) => id !== attachmentId);
      if (r.status === "reviewed") r.status = "waiting-review";
      r.updatedAt = nowIso();
    });
  };

  const previewAttachment = (attachmentId: string) =>
    run(async () => {
      if (!session) return;
      setPreview(null);
      const { attachment, bytes } = await session.readAttachment(attachmentId);
      setPreview({ attachment, bytes });
    });

  const checkRules = () =>
    run(async () => {
      setCatalogError(null);
      setCatalog(await fetchCatalog(BASE));
    });

  const requestPinLatest = () => {
    if (!session) return;
    const entry = catalogEntryFor(catalog, taxYear);
    if (!entry) return;
    setPinConfirmOpen(true);
  };

  const executePin = () =>
    run(async () => {
      if (!session) return;
      const entry = catalogEntryFor(catalog, taxYear);
      if (!entry) return;
      const loaded = await fetchBundle(BASE, entry);
      if (loaded.bundle.version !== entry.version) throw new StorageError("invalid", "เวอร์ชันของไฟล์กฎไม่ตรงกับรายการ");
      const next = await session.pinRules(taxYear, entry.version, bundlePath(taxYear, entry.version), loaded.bytes, loaded.digest);
      setManifest(next);
      setSaveState("saved");
      setNotice(`ปักกฎเวอร์ชัน ${entry.version} แล้ว`);
    });

  const applyUpdate = () => {
    if (!updateApply) return;
    if (dirtyRef.current || saveState !== "saved" || busy) {
      setNotice("ยังมีข้อมูลที่ยังไม่บันทึก จะอัปเดตแอปหลังบันทึกเสร็จ");
      return;
    }
    updateApply();
  };

  const onAttachmentsOf = (record: RecordEntry): Attachment[] => (manifest ? record.attachmentIds.flatMap((id) => (manifest.attachments[id] ? [manifest.attachments[id]] : [])) : []);
  const allAttachments: Attachment[] = manifest ? Object.values(manifest.attachments) : [];
  const missingForRecord = (record: RecordEntry): string[] => {
    const names = onAttachmentsOf(record).map((a) => a.displayName);
    return names.filter((n) => missing.includes(n));
  };

  const canExport = saveState === "saved" && !dirty && session !== null && !session.readOnly;

  /** Emergency export of the last VALID committed state. Raw invalid edits are omitted and this is not a full backup. */
  const emergencyExport = () =>
    run(async () => {
      if (!session) return;
      downloadBlob(exportMetadataJson(session.manifest), `nexthtax-EMERGENCY-metadata-${bangkokDateString()}.json`);
      setNotice("ส่งออกข้อมูลฉุกเฉินแล้ว: มีเฉพาะข้อมูลที่บันทึกล่าสุด ไม่รวมไฟล์แนบ ค่าที่กรอกไม่ถูกต้องถูกละไว้ และไม่ใช่ข้อมูลสำรองครบถ้วน");
    });

  const handleTabChange = (nextTab: Tab) => {
    if (nextTab === tab) return;
    if (!confirmLeave()) return;
    setTab(nextTab);
  };

  return (
    <div className="app dossier-app">
      <header className="app-header vault-bar">
        <div className="vault-brand">
          <h1>
            NexTHTax
            <span className="vault-badge">เก็บบนเครื่อง</span>
          </h1>
        </div>

        {session && manifest && root && (
          <div className="vault-meta">
            <div className="folder-chip" title="โฟลเดอร์จัดเก็บข้อมูลบนเครื่อง">
              <span className={`status-dot ${session.readOnly ? "ro" : "rw"}`} />
              <span>{manifest.taxpayer.displayName || root.name || "โฟลเดอร์ภาษี"}</span>
              <span className="sr-only">{session.readOnly ? "อ่านอย่างเดียว" : "แก้ไขได้"}</span>
            </div>

            <div className={`save-state-pill ${saveState}`} role="status" aria-live="polite">
              <span className="dot" />
              <span>{SAVE_LABEL[saveState]} {dirty ? "· มีการแก้ไขที่ยังไม่บันทึก" : ""}</span>
            </div>

            <button type="button" disabled={busy} onClick={closeFolder}>ปิดโฟลเดอร์</button>
          </div>
        )}
      </header>

      {notice && <div role="status" aria-live="polite" className="notice">{notice}</div>}
      {offlineReady && <p className="notice">พร้อมใช้งานออฟไลน์แล้ว (เฉพาะแอปและกฎที่แนบมา ไม่รวมไฟล์ของคุณ)</p>}
      {updateApply && (
        <div role="alert" className="update">
          <p>มีเวอร์ชันแอปใหม่ จะอัปเดตเมื่อบันทึกเสร็จและไม่มีรายการที่ยังไม่ได้บันทึก</p>
          <button type="button" className="btn-primary" onClick={applyUpdate}>อัปเดตแอป</button>
        </div>
      )}

      {upgrade && (
        <section aria-labelledby="upgrade-title" className="entry">
          <h2 id="upgrade-title">สร้างสำเนาสำหรับคุณสมบัติใหม่</h2>
          <p>{upgrade.manifest.taxpayer.displayName} · {upgrade.manifest.records.length} รายการ</p>
          <p>ต้นฉบับและไฟล์กู้คืนจะไม่ถูกแก้ไข สำเนาใช้กับแอปรุ่นใหม่เท่านั้น ข้อมูลจาก schema 1 จะยังไม่ระบุประเภทย่อย ข้อมูลจาก schema 2 คงประเภทเดิม กรุณาเก็บต้นฉบับไว้สำหรับย้อนกลับ</p>
          <button type="button" disabled={busy} onClick={() => void migrateFolder()}>สร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่าง</button>
          <button type="button" disabled={busy} onClick={() => setUpgrade(null)}>ยกเลิกการย้ายข้อมูล</button>
        </section>
      )}
      {!session && !setupRoot && !upgrade && (
        <WorkspaceScreen
          supported={supported}
          setupPending={false}
          onOpen={() => void openFolder()}
          onCreate={() => void startNewFolder()}
          onSubmitName={() => undefined}
          onCancelSetup={() => undefined}
        />
      )}
      {!session && setupRoot && (
        <WorkspaceScreen
          supported={supported}
          setupPending
          onOpen={() => undefined}
          onCreate={() => undefined}
          onSubmitName={(name) => void submitSetupName(name)}
          onCancelSetup={() => setSetupRoot(null)}
        />
      )}

      {session && manifest && root && (
        <main>
          <p className="warning">ข้อมูลทั้งหมดอยู่ในโฟลเดอร์ที่คุณเลือก โปรดสำรอง ZIP เป็นระยะ</p>
          {session.storageSchemaVersion < SCHEMA_VERSION && (
            <section className="notice" aria-label="การแก้ไขข้อมูลรูปแบบเดิม">
              <p>เปิดข้อมูลเดิมแล้ว แก้ไขและบันทึกในรูปแบบเดิม (schema {session.storageSchemaVersion}) ได้โดยไม่ต้องสร้างสำเนา
                {session.storageSchemaVersion === 1 ? " · ประเภทย่อยและใบคำนวณภาษีต้องใช้สำเนารูปแบบใหม่" : session.storageSchemaVersion === 2 ? " · แผนและประเภทกองทุนใหม่ต้องใช้สำเนารูปแบบใหม่" : " · ประเภทกองทุนใหม่ต้องใช้สำเนารูปแบบใหม่"}
              </p>
              <button type="button" disabled={busy || dirty || saveState !== "saved"} onClick={requestFeatureUpgrade}>สร้างสำเนาสำหรับคุณสมบัติใหม่</button>
            </section>
          )}
          {saveState === "save-error" && (
            <div role="alert" className="update">
              <p>บันทึกไม่สำเร็จ ข้อมูลล่าสุดยังอยู่ในหน้าจอ ลองแก้สาเหตุ (สิทธิ์โฟลเดอร์ พื้นที่ดิสก์) แล้วแก้ไขใหม่เพื่อบันทึกอีกครั้ง</p>
              <button type="button" disabled={busy} onClick={() => void emergencyExport()}>ส่งออกข้อมูลฉุกเฉิน (JSON, ไม่ใช่สำรองครบ)</button>
            </div>
          )}
          {session.readOnly && <p className="warning">โหมดอ่านอย่างเดียว การแก้ไขถูกปิดไว้</p>}
          {missing.length > 0 && <p className="warning">ไฟล์แนบที่หายหรือไม่ตรงกับข้อมูล {missing.length} ไฟล์</p>}
          {pending.length > 0 && <p className="warning">มีไฟล์ candidate ค้างจากการบันทึกที่ไม่สมบูรณ์ ({pending.length} ไฟล์)</p>}
          <div className="workspace-toolbar">
            <label>
              ปีภาษี
              <select value={taxYear} disabled={busy} onChange={(e) => changeYear(Number(e.target.value))}>
                {years.map((year) => <option key={year} value={year}>{year} (พ.ศ. {year + 543})</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => setIsAddYearOpen(true)}>เพิ่มปีภาษี</button>
          </div>
          <nav className="tabs" aria-label="เมนูหลัก">
            <button type="button" disabled={busy || session.storageSchemaVersion === 1} aria-pressed={tab === "worksheet"} onClick={() => handleTabChange("worksheet")}>คำนวณและวางแผน</button>
            <button type="button" disabled={busy} aria-pressed={tab === "documents"} onClick={() => handleTabChange("documents")}>เอกสาร</button>
            <button type="button" disabled={busy} aria-pressed={tab === "tools"} onClick={() => handleTabChange("tools")}>เครื่องมือ</button>
          </nav>
          {tab === "worksheet" && (
            <TaxWorksheet
              key={`${manifest.workspaceId}-${taxYear}`}
              manifest={manifest}
              taxYear={taxYear}
              bundle={pinned?.bundle ?? null}
              ruleDigest={pinned?.digest ?? null}
              disabled={session.readOnly || busy}
              planDisabled={session.storageSchemaVersion < 3}
              onUnsavedChange={handleUnsaved}
              onSavePlan={savePlan}
              onVerifyPlanEvidence={verifyPlanEvidence}
              trustedRules={pinned !== null && isTrustedMatch(catalog, pinned.bundle, pinned.digest)}
              onSave={(taxInputs) => saveTaxInputs(taxYear, taxInputs)}
            />
          )}
          {tab === "documents" && (
            <>
              <DocumentCategories records={yearRecords} taxYear={taxYear} scope={documentScope} onSelect={selectDocumentScope} disabled={busy} />
              <details className="task-details">
                <summary>สรุปเอกสารและความคืบหน้าปี {taxYear}</summary>
                <YearOverview manifest={manifest} taxYear={taxYear} pinned={pinned?.bundle ?? null} />
              </details>
                <div className="grid">
                  <DocumentList
                    key={`${manifest.workspaceId}-${taxYear}-${documentScopeKey(documentScope)}-${listEpoch}`}
                    records={yearRecords}
                    scope={documentScope}
                    canEdit={!session.readOnly && !busy}
                    selectedId={selectedId}
                    onSelect={selectRecord}
                    onAdd={() => void addRecord()}
                    onTrash={(id) => void trashRecord(id)}
                    onRestore={(id) => void restoreRecord(id)}
                    onPurge={(id) => requestPurge(id)}
                  />
                  <div className="inspector-container">
                    {selected ? (
                      <div className={`inspector-dock ${preview ? "has-preview" : ""}`}>
                        <DocumentEditor
                          key={selected.id}
                          supportsSubcategories={session.storageSchemaVersion !== 1}
                          canStoreSubcategory={(subcategory) => canStoreSubcategory(session.storageSchemaVersion, subcategory)}
                          onUnsupportedSubcategory={requestFeatureUpgrade}
                          record={selected}
                          attachments={allAttachments}
                          missingNames={missingForRecord(selected)}
                          onSave={(draft) => saveRecord(selected.id, draft)}
                          onUnsavedChange={handleUnsaved}
                          onAddFile={addFile}
                          onLink={(attId) => linkAttachment(selected, attId)}
                          onUnlink={(attId) => unlinkAttachment(selected, attId)}
                          onPreview={(attId) => void previewAttachment(attId)}
                        />
                        {preview && (
                          <section aria-labelledby="preview-title" className="preview-panel slip-viewer">
                            <div className="slip-viewer-header">
                              <h2 id="preview-title" style={{ fontSize: "14px", margin: 0, color: "#fff" }}>
                                ตัวอย่าง: {preview.attachment.displayName}
                              </h2>
                              <button type="button" onClick={() => setPreview(null)}>✕ ปิดตัวอย่าง</button>
                            </div>
                            {preview.attachment.mediaType === "application/pdf" ? (
                              <PdfPreview bytes={preview.bytes} />
                            ) : (
                              <ImagePreview bytes={preview.bytes} mediaType={preview.attachment.mediaType === "image/png" ? "image/png" : "image/jpeg"} />
                            )}
                          </section>
                        )}
                      </div>
                    ) : (
                      <div className="card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--ink-muted)" }}>
                        <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink-dark)" }}>ยังไม่ได้เลือกรายการ</p>
                        <p>เลือกรายการเอกสารจากรายการทางซ้ายเพื่อตรวจสอบ หรือคลิก "+ เพิ่มรายการ" เพื่อเริ่มบันทึก</p>
                      </div>
                    )}
                  </div>
                </div>
            </>
          )}
          {tab === "tools" && (
            <>
            <h2>เครื่องมือ</h2>
            <details className="task-details" open={!pinned}>
            <summary>ตรวจสอบและเลือกกฎภาษีปี {taxYear}</summary>
            <RuleReview
              taxYear={taxYear}
              pinned={pinned}
              catalog={catalog}
              catalogError={catalogError}
              latest={catalogEntryFor(catalog, taxYear)}
              busy={busy}
              onCheck={() => void checkRules()}
              onPinLatest={() => requestPinLatest()}
            />
            </details>
            <details className="task-details" open>
            <summary>สำรองและกู้คืนข้อมูล</summary>
            <BackupPanel
              root={root}
              session={session}
              manifest={manifest}
              taxYear={taxYear}
              canExport={canExport}
              onOpened={(newRoot, result) => attach(newRoot, result)}
              notify={(message) => setNotice(message)}
            />
            </details>
            </>
          )}
        </main>
      )}

      <ModalDialog
        isOpen={isAddYearOpen}
        onClose={() => {
          setIsAddYearOpen(false);
          setNewYearInput("");
        }}
        title="เพิ่มปีภาษีใหม่"
        icon="📅"
        confirmText="เพิ่มปี"
        cancelText="ยกเลิก"
        onConfirm={() => {
          if (newYearInput.trim()) {
            addYear(newYearInput.trim());
            setIsAddYearOpen(false);
            setNewYearInput("");
          }
        }}
      >
        <form
          id="add-year-modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (newYearInput.trim()) {
              addYear(newYearInput.trim());
              setIsAddYearOpen(false);
              setNewYearInput("");
            }
          }}
        >
          <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
            เพิ่มปีภาษี (ค.ศ.)
            <input
              name="newYear"
              type="number"
              min={1990}
              max={2600}
              value={newYearInput}
              onChange={(e) => setNewYearInput(e.target.value)}
              placeholder="เช่น 2026"
              style={{
                display: "block",
                width: "100%",
                marginTop: "8px",
                padding: "10px 12px",
                fontSize: "15px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                boxSizing: "border-box",
              }}
              autoFocus
            />
          </label>
          <p style={{ margin: "6px 0 0", fontSize: "13px", color: "var(--ink-muted)", lineHeight: 1.5 }}>
            ระบุปีภาษี ค.ศ. เช่น 2025, 2026 (ระบบรองรับ ค.ศ. 1990 - 2600 / พ.ศ. 2533 - 3143)
          </p>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={purgeCandidateId !== null}
        onClose={() => setPurgeCandidateId(null)}
        title="ยืนยันการลบรายการถาวร"
        variant="danger"
        icon="⚠️"
        confirmText="ลบรายการถาวร"
        cancelText="ยกเลิก"
        onConfirm={() => {
          if (purgeCandidateId) {
            const id = purgeCandidateId;
            setPurgeCandidateId(null);
            void executePurge(id);
          }
        }}
      >
        <p style={{ margin: "0 0 12px", lineHeight: "1.6" }}>
          คุณต้องการ<strong>ลบรายการนี้ถาวร</strong>หรือไม่?
        </p>
        <p style={{ margin: 0, fontSize: "13.5px", color: "var(--danger-text, #b91c1c)", lineHeight: "1.5" }}>
          ไฟล์แนบที่ไม่มีรายการอื่นอ้างถึงจะถูกลบจากโฟลเดอร์ และสำเนาสำรองเก่าที่อ้างไฟล์นั้นจะถูกลบถาวร ไม่สามารถย้อนกลับได้ หากยังไม่มีข้อมูลสำรองล่าสุด ควรสำรอง ZIP ก่อนดำเนินการ
        </p>
      </ModalDialog>

      <ModalDialog
        isOpen={pinConfirmOpen}
        onClose={() => setPinConfirmOpen(false)}
        title={`ปักหมุดกฎภาษีปี ${taxYear}`}
        variant="warning"
        icon="📌"
        confirmText="ยืนยันการปักกฎ"
        cancelText="ยกเลิก"
        onConfirm={() => {
          setPinConfirmOpen(false);
          void executePin();
        }}
      >
        <p style={{ margin: "0 0 12px", lineHeight: "1.6" }}>
          ยืนยันการปักกฎปี <strong>{taxYear}</strong> เป็นเวอร์ชัน{" "}
          <strong>{catalogEntryFor(catalog, taxYear)?.version}</strong>?
        </p>
        <p style={{ margin: 0, fontSize: "13.5px", color: "var(--ink-muted)", lineHeight: "1.5" }}>
          ยอดที่คุณกรอกไว้จะไม่เปลี่ยน รายการที่ตรวจทานแล้วจะไม่ถูกเปลี่ยนสถานะโดยอัตโนมัติ
        </p>
      </ModalDialog>
    </div>
  );
}

