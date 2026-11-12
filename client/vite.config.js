import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Pages are loaded on first visit (src/App.tsx), so the entry stays small.
    // The largest chunk is three.js's core (~720 kB, one module that can't be
    // split), downloaded only by the 3D editor; warn about anything bigger.
    chunkSizeWarningLimit: 800,
  },
})
