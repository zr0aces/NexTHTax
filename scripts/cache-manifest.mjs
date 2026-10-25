import { readdir, readFile, writeFile, cp, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+"/"+entry.name;if(entry.isDirectory())out.push(...await walk(path));else if(!entry.name.endsWith(".map")&&entry.name!=="sw.js")out.push(path);}return out;}
await mkdir("dist/licenses",{recursive:true});
for(const [name,file] of Object.entries({"react":"react","react-dom":"react-dom","zod":"zod","fflate":"fflate","lucide-react":"lucide-react","pdfjs-dist":"pdfjs-dist","Kanit-OFL":"@fontsource/kanit"}))await cp(`node_modules/${file}/LICENSE`,`dist/licenses/${name}.txt`);
for(const resource of ["cmaps","standard_fonts","wasm"])await cp(`node_modules/pdfjs-dist/${resource}`,`dist/pdf-resources/${resource}`,{recursive:true});
const files=(await walk("dist")).sort();
const version=createHash("sha256");for(const file of files)version.update(await readFile(file));
const cache="nextthtax-app-"+version.digest("hex").slice(0,16);
const assets=files.map(file=>"./"+file.slice(5));assets.push("./");
await writeFile("dist/sw.js",`const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(assets)};self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("nextthtax-app-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request,{ignoreSearch:false,ignoreVary:true});if(cached)return cached;if(event.request.mode==="navigate"){try{return await fetch(event.request);}catch{return await cache.match("./index.html");}}return fetch(event.request);}));});`);
console.log("Offline application cache:",cache,assets.length,"assets; no runtime/user-data caching.");
