import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mkcert from "vite-plugin-mkcert"
import framer from "vite-plugin-framer"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), mkcert(), framer()],
  // The store kit lives one folder up (../framer-kit) so the plugin can install it.
  server: { fs: { allow: [".."] } },
})
