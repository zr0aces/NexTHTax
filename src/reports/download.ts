export function download(bytes:Uint8Array|string, name:string, mime:string) {
 const blob=new Blob([typeof bytes==="string"?bytes:new Uint8Array(bytes).buffer],{type:mime});
 const url=URL.createObjectURL(blob),anchor=document.createElement("a");
 anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export function csvCell(value:unknown):string {
 const str=String(value??"");const safe=/^[\s]*[=+@\-\t\r]/.test(str)?`\u0027${str}`:str;
 return `"${safe.replaceAll("\u0022","\u0022\u0022")}"`;
}
export const makeCsv=(rows:unknown[][])=>"\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
