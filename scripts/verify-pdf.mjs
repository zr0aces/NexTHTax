import {readFile,writeFile} from "node:fs/promises";
import {basename,extname} from "node:path";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {createCanvas} from "@napi-rs/canvas";
// Usage: node scripts/verify-pdf.mjs [pdfPath] [expectedText...]. Defaults keep the original sample check.
const defaultPath="test-results/artifacts/annual-thai.pdf";
const defaultExpected=["2569","NexTHTax","ภาษี","สมมติ"];
const path=process.argv[2]??defaultPath;
const expectedTexts=process.argv.length>3?process.argv.slice(3):defaultExpected;
const stem=path===defaultPath?"annual-pdf":basename(path,extname(path));
const outDir=path===defaultPath?"test-results/artifacts":path.slice(0,path.length-basename(path).length)||".";
const bytes=new Uint8Array(await readFile(path));const loading=getDocument({data:bytes,useSystemFonts:true});const doc=await loading.promise;
let all="";for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const text=await page.getTextContent();all+=text.items.map(item=>item.str??"").join("")+"\n";}
for(const expected of expectedTexts){if(!all.includes(expected))throw new Error("Thai PDF text missing: "+expected);}
const page=await doc.getPage(1);const viewport=page.getViewport({scale:1.3});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,viewport}).promise;await writeFile(`${outDir}/${stem}-rendered.png`,canvas.toBuffer("image/png"));await writeFile(`${outDir}/${stem}-text.txt`,all);console.log(`Thai PDF verified: ${doc.numPages} pages, embedded Thai text found (${expectedTexts.length} expected strings); first page rasterized: ${path}`);await loading.destroy();
