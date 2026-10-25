import { z } from "zod";
export const moneySchema = z.number().int().min(0).max(100_000_000_000);
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const yearSchema = z.number().int().min(2569).max(2700);
export const pathSchema = z.string().max(240).refine(p => /^(years\/[0-9]{4}\/documents\/(insurance|retirement|donations|housing|family|other)\/[a-zA-Z0-9_-]+\.(pdf|jpg|png|webp))$/.test(p), "ตำแหน่งเอกสารไม่ปลอดภัย");
export const ruleSchema = z.object({
 id: idSchema, taxYear: yearSchema, name: z.string().min(1).max(150), description: z.string().max(3000),
 group: z.enum(["family","insurance","retirement","investment","housing","donations","special","income","other"]),
 kind: z.enum(["expense","deduction","exemption","credit","documents"]),
 status: z.enum(["verified","pending","expired"]),
 formula: z.enum(["paid","fixed","salary","pension","donation","esgx-carry"]),
 cap: moneySchema.nullable(), rateBps: z.number().int().min(0).max(10000).nullable(), incomeBase: z.string().max(300),
 sharedCap: z.string().max(100).nullable(), multiplier: z.number().int().min(1).max(2), order: z.number().int().min(0).max(999),
 effectiveFrom: z.string().max(10), effectiveTo: z.string().max(10).nullable(),
 conditions: z.array(z.string().max(1000)).max(20), documents: z.array(z.string().max(200)).max(10),
 sources: z.array(z.string().url().refine(u => u.startsWith("https://"))).max(10), reviewedAt: z.string().max(10), version: z.string().max(50),
}).strict();
export const ruleSetSchema = z.object({schemaVersion:z.literal(1), taxYear:yearSchema, version:z.string().min(1).max(80), status:z.enum(["verified","partial","pending"]), rules:z.array(ruleSchema).max(150), sharedCaps:z.record(z.string(),moneySchema), brackets:z.array(z.object({upTo:moneySchema.nullable(), rateBps:z.number().int().min(0).max(10000)}).strict()).max(12), notes:z.array(z.string().max(1000)).max(30)}).strict();
export const attachmentSchema = z.object({id:idSchema, path:pathSchema, originalName:z.string().min(1).max(200), mime:z.enum(["application/pdf","image/jpeg","image/png","image/webp"]), size:z.number().int().positive().max(20*1024*1024), hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const recordSchema = z.object({
 id:idSchema, categoryId:idSchema, title:z.string().min(1).max(200), amount:moneySchema, date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 eligibleAmount:moneySchema.nullable(), provider:z.string().max(200), reference:z.string().max(200), note:z.string().max(2000),
 documentStatus:z.enum(["none","partial","complete"]), eligibility:z.enum(["unchecked","confirmed","ineligible","pending"]),
 checklist:z.array(z.string().max(200)).max(10), attachments:z.array(attachmentSchema).max(20),
 facts:z.object({qualifyingCount:z.number().int().min(0).max(20).optional(), coBorrowers:z.number().int().min(1).max(20).optional(), insuredType:z.enum(["33","39","40"]).optional(), carrySourceId:idSchema.optional(), carryTransfer:moneySchema.optional(), carryFirstYearUsed:moneySchema.optional(), carryProofConfirmed:z.boolean().optional(), pensionLifeAllocation:moneySchema.optional()}).strict(),
}).strict();
export const profileSchema = z.object({income:moneySchema.nullable(), incomeType:z.enum(["salary","other"]), manualExpense:moneySchema.nullable(), withholding:moneySchema.nullable(), selectedCategories:z.array(idSchema).max(150)}).strict();
export const taxYearDataSchema = z.object({profile:profileSchema, records:z.array(recordSchema).max(5000), rules:ruleSetSchema}).strict();
export const manifestSchema = z.object({schemaVersion:z.literal(1), id:idSchema, name:z.string().min(1).max(120), revision:z.number().int().min(0), createdAt:z.string(), updatedAt:z.string(), years:z.array(yearSchema).min(1).max(100)}).strict();
export type TaxRule = z.infer<typeof ruleSchema>;
export type RuleSet = z.infer<typeof ruleSetSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type TaxRecord = z.infer<typeof recordSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type TaxYearData = z.infer<typeof taxYearDataSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export interface Workspace { manifest: Manifest; years: Record<string,TaxYearData>; files: Map<string,Uint8Array>; warnings: string[]; }
export const newId = () => crypto.randomUUID();
export const emptyProfile = (): Profile => ({income:null, incomeType:"salary", manualExpense:null, withholding:null, selectedCategories:["life","health","rmf","housing","donation"]});
