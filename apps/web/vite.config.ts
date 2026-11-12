import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/documentation-guild/',
  plugins: [react()],
  build: { sourcemap: false },
});
