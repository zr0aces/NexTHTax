import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc=workerUrl;
/** Render pixels only. Never run PDF JavaScript, forms, links, or embedded attachments. */
export default function PdfPreview({bytes}:{bytes:Uint8Array}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[error,setError]=useState("");
 const canvas=useRef<HTMLCanvasElement>(null),container=useRef<HTMLDivElement>(null);
 useEffect(()=>{let alive=true;const task=getDocument({data:new Uint8Array(bytes),cMapUrl:new URL("./pdf-resources/cmaps/",document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL("./pdf-resources/standard_fonts/",document.baseURI).href,wasmUrl:new URL("./pdf-resources/wasm/",document.baseURI).href,enableXfa:false,maxImageSize:16_000_000,canvasMaxAreaInBytes:64*1024*1024,useSystemFonts:true,disableAutoFetch:true,disableStream:true,stopAtErrors:true});
 task.promise.then(doc=>{if(alive)setPdf(doc);}).catch(()=>{if(alive)setError("อ่าน PDF ไม่ได้ อาจมีรหัสผ่านหรือไฟล์เสีย ดาวน์โหลดต้นฉบับเพื่อตรวจได้");});
 return()=>{alive=false;void task.destroy();};},[bytes]);
 useEffect(()=>{if(!pdf)return;let canceled=false;let renderTask:{cancel:()=>void}|undefined;
 pdf.getPage(page).then(p=>{if(canceled||!canvas.current)return;const viewport=p.getViewport({scale:1});const width=Math.min(container.current?.clientWidth??640,960);const scale=Math.min(2,width/viewport.width);const scaled=p.getViewport({scale});if(scaled.width*scaled.height>16_000_000||scaled.width>32767||scaled.height>32767)throw new Error("PDF page too large");const target=canvas.current;target.width=scaled.width;target.height=scaled.height;const task=p.render({canvas:target,viewport:scaled});renderTask=task;return task.promise;}).catch(e=>{if(!canceled&&e?.name!=="RenderingCancelledException")setError("แสดงหน้านี้ไม่ได้ กรุณาดาวน์โหลดเอกสารต้นฉบับ");});return()=>{canceled=true;renderTask?.cancel();};},[pdf,page]);
 return <div ref={container} className="pdf-canvas-preview">{error?<p role="alert" className="notice">{error}</p>:<><div className="pdf-controls"><button className="button secondary" disabled={!pdf||page<=1} onClick={()=>setPage(page-1)}>ก่อนหน้า</button><span>{pdf?`หน้า ${page} / ${pdf.numPages}`:"กำลังอ่าน PDF…"}</span><button className="button secondary" disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(page+1)}>ถัดไป</button></div><canvas ref={canvas} aria-label={`ตัวอย่าง PDF หน้า ${page}`} role="img"/></>}</div>;
}
