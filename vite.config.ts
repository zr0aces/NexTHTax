import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({command})=>({ plugins: [react()], base: "./", define:{__OFFLINE_BUILD__:JSON.stringify(command==="build")}, server: {host: "127.0.0.1"} }));
