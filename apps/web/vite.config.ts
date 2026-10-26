import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In development the API runs as a separate process.
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
