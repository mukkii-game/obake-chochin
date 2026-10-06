import { defineConfig } from 'vite';

// base './' : Pages でも itch.io でも同じ dist が動く(相対パス)
const BUILD_TIME = new Date().toISOString();
const SHA = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';
// 画面の隅に出す BUILD ID。dist/version.json にも同じ値を書き、起動時に照合して古いキャッシュなら読み直す。
const BUILD_ID = `${SHA}-${BUILD_TIME.slice(5, 16).replace(/[-:T]/g, '')}`;

export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __GIT_SHA__: JSON.stringify(SHA),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [{
    name: 'version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, time: BUILD_TIME }) });
    },
  }],
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
