import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 全局测试设置
    globals: true,
    environment: 'node',
    // 测试文件路径模式
    include: ['tests/vitest/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // 设置超时时间
    testTimeout: 10000,
    // 全局设置文件
    setupFiles: ['./tests/vitest/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});