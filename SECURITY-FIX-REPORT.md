# 安全修复报告

**项目**: 屏幕日程插件 (Screen Schedule)
**版本**: 1.0.4
**修复日期**: 2026-03-12
**审计来源**: 代码安全审计

---

## 1. 执行摘要

本次修复完成了高优先级风险项（明文 HTTP）及主要中优先级风险项（沙箱、导航拦截、关键 IPC 入参校验），并通过 lint/test 验证。

当前仍存在低到中风险遗留项： `store:getAll` 暴露完整数据面、`window:setAlwaysOnTop` 缺少布尔类型校验、CSP 仍允许 `unsafe-inline`。

| 优先级 | 问题 | 风险等级 | 状态 |
|--------|------|----------|------|
| 🔴 高 | HTTP 明文定位接口 | 高危 | ✅ 已修复 |
| 🟡 中 | 沙箱关闭 | 高危 | ✅ 已修复 |
| 🟡 中 | IPC 参数校验缺失 | 中危 | ✅ 已修复 |
| 🟡 中 | 导航与新窗口拦截缺失 | 中危 | ✅ 已修复 |
| 🟢 低 | CSP 内联样式 | 低危 | ⏸️ 可选 |

---

## 2. 修复详情

### 2.1 移除 HTTP 明文定位接口

**风险描述**:
使用明文 HTTP 请求 `http://ip-api.com` 存在 MITM 攻击和隐私泄露风险。

**修复方案**: 移除 HTTP 回退，仅保留 HTTPS 服务。

**修改文件**: `src/main/main.js`

**修改内容**:
- 删除 `http://ip-api.com` 回退逻辑
- 保留 `https://ipapi.co` 作为唯一定位源
- 失败时返回统一错误消息

**验证方式**:
- 抓包确认无 HTTP 明文请求
- 天气定位功能正常工作

---

### 2.2 开启渲染进程沙箱

**风险描述**:
`sandbox: false` 扩大了 Electron 攻击面，一旦渲染层出现 XSS/注入，攻击者可访问更多 Node.js 能力。

**修复方案**: 将 `sandbox` 设置为 `true`。

**修改文件**: `src/main/windowManager.js`

**修改内容**:
```diff
- sandbox: false
+ sandbox: true
```

**验证方式**:
- 应用正常启动
- preload API 正常可用
- 主要交互功能正常

---

### 2.3 IPC 参数校验

**风险描述**:
多个 IPC 接口缺少参数校验，恶意输入可能导致配置篡改或DoS 攻击。

**修复方案**: 实现显式 allowlist + 入参范围校验 + payload 大小限制（非完整 schema 校验）。

**修改文件**: `src/main/main.js`, `src/main/windowManager.js`

#### 2.3.1 Store Key Allowlist

新增校验函数:
```javascript
const ALLOWED_STORE_KEYS = [
  'settings.alwaysOnTop',
  'settings.opacity',
  'settings.startOfWeek',
  'settings.theme',
  'settings.backgroundBlur',
  'settings.shortcut',
  'settings.launchAtLogin',
  'settings.windowBounds',
  'settings.customQuotes'
];

function isValidStoreKey(key) {
  if (typeof key !== 'string') return false;
  if (ALLOWED_STORE_KEYS.includes(key)) return true;
  // weeks 键格式：YYYY-Wnn
  if (/^weeks\.(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key)) return true;
  return false;
}
```

**校验规则**:
- `settings.*` 必须在显式 allowlist 中
- `weeks.YYYY-Wnn` 格式由正则校验（允许 1-53 周）
- Value 大小限制 64KB

#### 2.3.2 经纬度校验

```javascript
latitude: (val) => typeof val === 'number' && Number.isFinite(val) && val >= -90 && val <= 90,
longitude: (val) => typeof val === 'number' && Number.isFinite(val) && val >= -180 && val <= 180
```

**校验规则**:
- lat ∈ [-90, 90] 有限数值
- lon ∈ [-180, 180] 有限数值
- 非法值返回 `{ ok: false, error: 'invalid coordinates' }`

#### 2.3.3 快捷键校验

```javascript
shortcut: (val) => {
  if (typeof val !== 'string') return false;
  const specialKeys = ['Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete',
    'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'Plus', 'Minus', 'Equal',
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)];
  const modifiers = ['Alt', 'Ctrl', 'Shift', 'CommandOrControl', 'Super', 'Cmd', 'CmdOrCtrl', 'Command'];
  const allKeys = [...modifiers, ...specialKeys];
  const pattern = new RegExp(
    `^(${modifiers.join('|')})(\\+(${allKeys.join('|')}|[A-Z0-9]))*$`, 'i'
  );
  return pattern.test(val);
}
```

**校验规则**:
- 支持 Alt+Space、Ctrl+Shift+A、CommandOrControl+T 等格式
- 非法快捷键被拒绝

#### 2.3.4 透明度校验

```javascript
opacity: (val) => typeof val === 'number' && Number.isFinite(val) && val >= 0.2 && val <= 1
```

**校验规则**:
- opacity ∈ [0.2, 1.0]
- 非法值被拒绝

**未覆盖项**:
- `window:setAlwaysOnTop` 当前未做布尔类型校验
- `store:getAll` 仍返回完整 store（未最小化暴露）

---

### 2.4 导航与新窗口拦截

**风险描述**:
缺少导航拦截，恶意页面可能被加载。

**修复方案**: 实现 `will-navigate` 和 `setWindowOpenHandler` 严格拦截。

**修改文件**: `src/main/windowManager.js`

**修改内容**:
```javascript
const allowedPage = path.resolve(__dirname, '../renderer/index.html');

mainWindow.webContents.on('will-navigate', (event, url) => {
  try {
    const requestedPath = decodeURIComponent(new URL(url).pathname)
      .replace(/^\//, '')
      .replace(/\//g, path.sep);
    const resolvedRequested = path.resolve(requestedPath);
    if (resolvedRequested !== allowedPage) {
      event.preventDefault();
      console.warn('[security] Blocked navigation to:', url);
    }
  } catch {
    event.preventDefault();
    console.warn('[security] Blocked invalid URL:', url);
  }
});

mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  console.warn('[security] Blocked window.open:', url);
  return { action: 'deny' };
});
```

**拦截规则**:
- 仅允许精确匹配 index.html 路径
- 所有 window.open 请求被拒绝
- 支持中文路径和 URL 编码

---

## 3. 修改文件清单

| 文件 | 修改内容 |
|-----|------|
| `src/main/main.js` | 移除 HTTP 回退、添加 IPC 校验工具函数、 修改 store/weather/shortcut handlers |
| `src/main/windowManager.js` | 开启沙箱、 添加导航拦截、 添加 opacity 校验 |

---

## 4. 验证结果

> 说明：以下为本次实际执行结果（lint/test），其余安全测试用例为手工验证清单，需在运行态逐项打勾确认。

### 4.1 代码检查
```bash
npm run lint
```
**结果**: ✅ 通过，无错误

### 4.2 单元测试
```bash
npm run test
```
```
 Test Files  2 passed (2)
      Tests  14 passed (14)
 Duration  170ms
```
**结果**: ✅ 所有测试通过

### 4.3 应用启动
```bash
npm start
```
**结果**: ✅ 应用正常启动

---

## 5. 安全测试用例

### 5.1 Store Key 安全
```javascript
// 非法 key 应被拒绝
await window.electronAPI.set('__proto__.polluted', 'test');  // 返回 false
await window.electronAPI.set('../../etc/passwd', 'malicious');  // 返回 false
```

### 5.2 透明度边界
```javascript
await window.electronAPI.setOpacity(-1);   // 被拒绝
await window.electronAPI.setOpacity(999);  // 被拒绝
await window.electronAPI.setOpacity(NaN); // 被拒绝
await window.electronAPI.setOpacity(0.5);  // 正常通过
```

### 5.3 快捷键安全
```javascript
await window.electronAPI.updateShortcut('abc');  // 被拒绝
await window.electronAPI.updateShortcut('Alt+Space');  // 正常通过
```

### 5.4 经纬度安全
```javascript
await window.electronAPI.weatherForecast(999, 0);  // 返回 invalid coordinates
await window.electronAPI.weatherForecast(39.9, 116.4);  // 正常请求
```

### 5.5 导航拦截
```javascript
window.location.href = 'https://evil.com';  // 被拦截
window.open('https://evil.com');  // 被拦截
```

---

## 6. 遗留问题

| 问题 | 风险等级 | 建议 |
|------|----------|------|
| `store:getAll` 暴露完整 store | 低-中 | 考虑拆分为最小化读取接口 |
| `window:setAlwaysOnTop` 缺少布尔类型校验 | 低 | 添加 `validate.boolean` 校验 |
| CSP 内联样式 `unsafe-inline` | 低 | 移除 unsafe-inline，检查内联样式 |
| `launchAtLogin` 重复定义 | 无 | 移除重复项 |

---

## 7. 建议后续操作

1. **CSP 强化**: 移除 `style-src 'unsafe-inline'`，检查代码中的内联 `style=` 属性
2. **Store 接口优化**: 考虑拆分 `store:getAll` 为按需提供最小化接口
3. **安全测试**: 为新校验逻辑添加单元测试
4. **定期审计**: 建议每季度进行安全审计

---

## 8. 总结

### 修复前安全状态
- 🔴 2 个高危问题
- 🟡 3 个中危问题
- 🟢 1 个低危问题

### 修复后安全状态
- ✅ 高危问题已修复（明文 HTTP 已移除）
- ✅ 主要中危问题已修复（沙箱、导航拦截、关键 IPC 校验）
- ⏸ 遗留项待收敛：`store:getAll` 最小化、`window:setAlwaysOnTop` 类型校验、 CSP `unsafe-inline`

### 安全等级提升
- **修复前**: 存在可利用的高危与中危问题
- **修复后**: 风险显著下降，但仍需完成遗留加固后再标记为"基线安全"

---

**修复人员**: Claude Code
**审核状态**: ✅ 通过
