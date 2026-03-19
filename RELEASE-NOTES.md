# v1.0.5 Release Notes

## 安全修复

本次更新修复了代码审计发现的高危和中危安全问题：

### 🔒 安全修复项

| 修复项 | 风险等级 | 说明 |
|-------|----------|------|
| 移除 HTTP 明文定位 | 🔴 高危 | 移除 `http://ip-api.com` 回退，仅保留 HTTPS 定位服务 |
| 开启渲染沙箱 | 🟡 中危 | `sandbox: false` → `sandbox: true` |
| IPC 参数校验 | 🟡 中危 | 添加 store key allowlist、经纬度、快捷键、透明度校验 |
| 导航拦截 | 🟡 中危 | 添加 `will-navigate` 和 `setWindowOpenHandler` 严格拦截 |

### 🛠 新增工具

- ✅ ESLint 代码检查 (`npm run lint`)
- ✅ Vitest 单元测试 (`npm run test`)
- ✅ 安全修复计划和报告文档

### 📋 遗留项

- `store:getAll` 仍暴露完整数据（建议后续最小化）
- `window:setAlwaysOnTop` 缺少布尔类型校验
- CSP 仍允许 `unsafe-inline`

---

**完整修复报告**: 见 `SECURITY-FIX-REPORT.md`
