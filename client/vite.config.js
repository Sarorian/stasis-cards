import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any GitHub Pages sub-path (e.g. /stasis-cards/)
export default defineConfig({
  plugins: [react()],
  base: './',
});
