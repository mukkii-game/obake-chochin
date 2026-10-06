import { defineConfig } from 'vite';

// base './' : Pages でも itch.io でも同じ dist が動く(相対パス)
export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
  },
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
