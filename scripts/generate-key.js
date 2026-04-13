#!/usr/bin/env node
/**
 * License Key 生成工具（开发者专用，不会被打包进安装包）
 * 用法: node scripts/generate-key.js [数量，默认 1]
 * 示例: node scripts/generate-key.js 10
 */
const { generateKey } = require('../src/main/license');

const count = Math.max(1, parseInt(process.argv[2]) || 1);
for (let i = 0; i < count; i++) {
  console.log(generateKey());
}
