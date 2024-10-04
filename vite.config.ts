import { resolve } from 'path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {

    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Duckground',
      fileName: 'duckground',
      formats: ['es']
    },
    rollupOptions: {
      external: ['solid-js', 'duckops']
    }
  }
})
