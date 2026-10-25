import { emptyProfile, newId, type RuleSet, type Workspace } from "../domain/model";
export { exportZip, importZip } from "./zip";
export { FolderSession, restoreBackup } from "./folder";
export { addAttachments } from "./documents";
export { hashBytes, assertCarrySources } from "./validation";
export function supportsDirectoryPicker():boolean {
 return typeof window!=="undefined" && window.isSecureContext && typeof (window as unknown as {showDirectoryPicker?:unknown}).showDirectoryPicker==="function" && typeof navigator!=="undefined" && Boolean(navigator.locks);
}
export function createWorkspace(name:string,rules:RuleSet):Workspace {
 const now=new Date().toISOString();
 return {manifest:{schemaVersion:1,id:newId(),name:name.trim()||"แฟ้มภาษีของฉัน",revision:0,createdAt:now,updatedAt:now,years:[rules.taxYear]},years:{[String(rules.taxYear)]:{profile:emptyProfile(),records:[],rules:structuredClone(rules)}},files:new Map(),warnings:[]};
}
