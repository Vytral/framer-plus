import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import framer from "vite-plugin-framer"
import mkcert from "vite-plugin-mkcert"

export default defineConfig({
  plugins: [
    react(),
    mkcert({ hosts: ["localhost", "127.0.0.1", "::1"] }),
    framer(),
  ],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
})
