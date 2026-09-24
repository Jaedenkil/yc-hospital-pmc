import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 两种打包形态：
//   npm run build        -> 常规静态站点（dist/），用 http 服务或二级目录部署
//   npm run build:single -> 单文件 HTML（dist/index.html 自带全部资源），双击即可演示
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    base: './',
    // 可视化演示：开发与预览服务器监听所有网卡（0.0.0.0），
    // 局域网内其他电脑/手机可用「本机 IP + 端口」直接访问，无需部署。
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
    plugins: [
      vue(),
      Components({
        dts: 'src/components.d.ts',
        resolvers: [AntDesignVueResolver({ importStyle: false })],
      }),
      ...(single ? [viteSingleFile()] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      chunkSizeWarningLimit: 4000,
      // 两种产物分开输出，避免单文件形态覆盖常规静态站点
      outDir: single ? 'dist-single' : 'dist',
    },
  }
})
