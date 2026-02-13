import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    // Copy public assets to root of dist
    copyPublicDir: true,
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@js': resolve(__dirname, 'src/js'),
      '@scss': resolve(__dirname, 'src/scss'),
      '@images': resolve(__dirname, 'src/images'),
    },
  },
  
  server: {
    port: 3000,
    open: true,
  },
  
  css: {
    preprocessorOptions: {
      scss: {
        includePaths: [resolve(__dirname, 'node_modules')],
      },
    },
  },
});
