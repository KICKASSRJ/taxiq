import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    proxy: {
      '/proxy/amfi': {
        target: 'https://www.amfiindia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/amfi/, ''),
      },
      '/proxy/mfapi': {
        target: 'https://api.mfapi.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/mfapi/, ''),
      },
      '/proxy/treasury': {
        target: 'https://api.fiscaldata.treasury.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/treasury/, ''),
      },
    },
  },
});
