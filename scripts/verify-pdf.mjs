import {readFile,writeFile} from "node:fs/promises";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {createCanvas} from "@napi-rs/canvas";
const path="test-results/artifacts/annual-thai.pdf";
const bytes=new Uint8Array(await readFile(path));const loading=getDocument({data:bytes,useSystemFonts:true});const doc=await loading.promise;
let all="";for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const text=await page.getTextContent();all+=text.items.map(item=>item.str??"").join("")+"\n";}
for(const expected of ["2569","NexTHTax","ภาษี","สมมติ"]){if(!all.includes(expected))throw new Error("Thai PDF text missing: "+expected);}
const page=await doc.getPage(1);const viewport=page.getViewport({scale:1.3});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,viewport}).promise;await writeFile("test-results/artifacts/annual-pdf-rendered.png",canvas.toBuffer("image/png"));await writeFile("test-results/artifacts/annual-pdf-text.txt",all);console.log(`Thai PDF verified: ${doc.numPages} pages, embedded Thai text found; first page rasterized.`);await loading.destroy();
