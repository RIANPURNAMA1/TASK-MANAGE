import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

/** Local API used by desktop builds when VITE_API_URL isn't set (CI sets the production URL). */
const DESKTOP_DEFAULT_API = 'http://localhost:4000/api/v1';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The desktop app is served from tauri://localhost, so it needs an absolute API URL.
  define:
    mode === 'desktop'
      ? { 'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? DESKTOP_DEFAULT_API) }
      : {},
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin proxy keeps the refresh cookie first-party and avoids CORS in development.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    // Not shipped inside the desktop installer (NFR-08: < 20 MB).
    sourcemap: mode !== 'desktop',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          editor: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-link', '@tiptap/extension-placeholder'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
}));
