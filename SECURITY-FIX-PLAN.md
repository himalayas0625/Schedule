# 安全审计问题修复计划

## ✅ 修复状态

| 优先级 | 问题 | 状态 | 完成时间 |
|--------|------|------|----------|
| 🔴 高 | HTTP 明文定位接口 | ✅ 已完成 | 2026-03-12 |
| 🟡 中 | 沙箱关闭 | ✅ 已完成 | 2026-03-12 |
| 🟡 中 | IPC 参数校验缺失 | ✅ 已完成 | 2026-03-12 |
| 🟡 中 | 缺少导航拦截 | ✅ 已完成 | 2026-03-12 |
| 🟢 低 | CSP 内联样式 | ⏸️ 可选 | - |

---

## 背景

根据代码审计报告，需要修复以下安全问题：

---

## 第一阶段：高优先级修复（✅ 已完成）

### 1.1 移除 HTTP 明文定位回退

**文件**: `src/main/main.js`

**问题代码** (第 38-44 行):
```js
ipcMain.handle('weather:locate', async () => {
  try {
    const d = await httpGet('https://ipapi.co/json/');
    // ...
  } catch { /* fallback to ip-api */ }
  try {
    const d = await httpGet('http://ip-api.com/json/?lang=zh-CN&fields=status,city,lat,lon');
    // ...  ← 明文 HTTP，存在 MITM 风险
  } catch { /* both location APIs failed */ }
  return { ok: false, error: 'location failed' };
});
```

**修复方案**:
```js
ipcMain.handle('weather:locate', async () => {
  // 仅使用 HTTPS 服务
  try {
    const d = await httpGet('https://ipapi.co/json/');
    if (d.latitude && !d.error) {
      return { ok: true, city: d.city || '', lat: d.latitude, lon: d.longitude };
    }
  } catch { /* ipapi failed */ }

  return { ok: false, error: 'location failed' };
});
```

**修改内容**:
- 移除 `http://ip-api.com` HTTP 回退
- 保留 `https://ipapi.co` 作为主服务

---

## 第二阶段：中优先级修复（✅ 已完成）

### 2.1 开启沙箱

**文件**: `src/main/windowManager.js`

```js
// 修改前
webPreferences: {
  preload: path.join(__dirname, '../preload/preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false  // ← 关闭
}

// 修改后
webPreferences: {
  preload: path.join(__dirname, '../preload/preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true   // ← 开启
}
```

**注意**: `sandbox: true` 与当前架构兼容：
- `contextIsolation: true` ✓
- `nodeIntegration: false` ✓
- preload 仅使用 `contextBridge` 暴露 API ✓
- `electron-store` 在主进程运行 ✓

### 2.2 IPC 参数校验（完整覆盖）

**文件**: `src/main/main.js`

**新增校验工具（显式 allowlist）**:
```js
// ── IPC 参数校验（显式 allowlist）──────────────────────────────────────────────
const ALLOWED_STORE_KEYS = [
  // settings
  'settings.alwaysOnTop',
  'settings.opacity',
  'settings.startOfWeek',
  'settings.theme',
  'settings.backgroundBlur',
  'settings.shortcut',
  'settings.launchAtLogin',
  'settings.windowBounds',
  'settings.customQuotes',
  // weeks（动态校验）
  // 'weeks.YYYY-Wnn' 格式
];

function isValidStoreKey(key) {
  if (typeof key !== 'string') return false;
  // 显式 allowlist
  if (ALLOWED_STORE_KEYS.includes(key)) return true;
  // weeks 键格式：YYYY-Wnn（如 2024-W01）
  if (/^weeks\.(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key)) return true;
  return false;
}

const validate = {
  opacity: (val) => typeof val === 'number' && Number.isFinite(val) && val >= 0.2 && val <= 1,
  shortcut: (val) => {
    if (typeof val !== 'string') return false;
    // 允许格式: Alt+Space, Ctrl+Shift+A, CommandOrControl+T
    const validPattern = /^(Alt|Ctrl|Shift|CommandOrControl|Super)(\+(Alt|Ctrl|Shift|CommandOrControl|Super|[A-Z0-9]))*$/i;
    return validPattern.test(val);
  },
  // 经纬度校验
  latitude: (val) => typeof val === 'number' && Number.isFinite(val) && val >= -90 && val <= 90,
  longitude: (val) => typeof val === 'number' && Number.isFinite(val) && val >= -180 && val <= 180
};
```

**修改所有 IPC handlers**:

```js
// IPC - 数据存储（显式 allowlist 校验）
ipcMain.handle('store:get', (_e, key) => {
  if (!isValidStoreKey(key)) {
    console.warn('[security] Invalid store:get key:', key);
    return undefined;
  }
  return store.get(key);
});

ipcMain.handle('store:set', (_e, key, value) => {
  if (!isValidStoreKey(key)) {
    console.warn('[security] Invalid store:set key:', key);
    return false;
  }
  // 限制 value 大小（防止内存炸弹）
  const MAX_VALUE_SIZE = 64 * 1024; // 64KB
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_VALUE_SIZE) {
      console.warn('[security] Value too large for key:', key);
      return false;
    }
  } catch {
    return false;
  }
  store.set(key, value);
  return true;
});

// IPC - 天气预报（添加 lat/lon 校验）
ipcMain.handle('weather:forecast', async (_e, lat, lon) => {
  // 校验经纬度
  if (!validate.latitude(lat) || !validate.longitude(lon)) {
    return { ok: false, error: 'invalid coordinates' };
  }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    const d = await httpGet(url);
    return { ok: true, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// IPC - 运行时修改快捷键（校验）
ipcMain.on('window:updateShortcut', (_e, newShortcut) => {
  if (!validate.shortcut(newShortcut)) {
    console.warn('[security] Invalid shortcut:', newShortcut);
    return;
  }
  store.set('settings.shortcut', newShortcut);
  const win = getMainWindow();
  if (win) registerShortcut(win);
});
```

**文件**: `src/main/windowManager.js`

```js
// IPC - 窗口透明度（校验）
ipcMain.on('window:setOpacity', (_e, value) => {
  if (!validate.opacity(value)) {
    console.warn('[security] Invalid opacity:', value);
    return;
  }
  mainWindow?.setOpacity(value);
  store.set('settings.opacity', value);
});
```

### 2.3 导航与新窗口拦截（严格模式）

**文件**: `src/main/windowManager.js`

**在 `createWindow` 函数中，`mainWindow.loadFile` 之后添加**:
```js
  // ── 安全：严格拦截导航与新窗口 ──────────────────────────────────────────────
  const allowedPage = path.join(__dirname, '../renderer/index.html');

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 仅允许精确匹配当前应用入口页面
    const normalizedUrl = url.replace(/\\/g, '/');
    const normalizedAllowed = 'file:///' + allowedPage.replace(/\\/g, '/');
    if (normalizedUrl !== normalizedAllowed) {
      event.preventDefault();
      console.warn('[security] Blocked navigation to:', url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 拒绝所有 window.open 请求
    console.warn('[security] Blocked window.open:', url);
    return { action: 'deny' };
  });
```

---

## 第三阶段：低优先级修复（可选）

### 3.1 移除 CSP 内联样式

**文件**: `src/renderer/index.html`

```html
<!-- 修改前 -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">

<!-- 修改后 -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self'">
```

**注意**: 需要检查代码中是否有内联 `style=` 属性，如有需移至 CSS 文件。

---

## 修改文件清单

| 文件 | 修改内容 | 阶段 |
|------|----------|------|
| `src/main/main.js` | 移除 HTTP 回退、添加完整 IPC 校验 | 1, 2 |
| `src/main/windowManager.js` | 开启沙箱、添加严格导航拦截、IPC 校验 | 2 |
| `src/renderer/index.html` | CSP 配置 | 3 |

---

## 验证方案

### 功能测试
```bash
npm start
```
- [ ] 天气定位正常显示
- [ ] 天气预报正常获取（测试经纬度校验）
- [ ] 透明度调节正常
- [ ] 快捷键修改正常
- [ ] 数据存储正常

### 安全测试
- [ ] 尝试设置非法 opacity 值（如 -1、999、NaN）应被忽略
- [ ] 尝试设置非法快捷键（如 `abc`、`../../etc/passwd`）应被忽略
- [ ] 尝试非法 store key（如 `../../`、`__proto__`）应被拒绝
- [ ] 尝试非法经纬度（如 lat=999、lon="abc"）应返回错误
- [ ] 尝试 `window.open` 应被拦截（控制台显示警告）
- [ ] 尝试导航到其他本地文件应被拦截

### 回归测试
```bash
npm run lint
npm run test
```

---

## 执行顺序

1. ✅ **第一阶段** - 移除 HTTP 明文定位（5 分钟）
2. ✅ **第二阶段** - 开启沙箱 + IPC 完整校验 + 严格导航拦截（20 分钟）
3. ⏸️ **第三阶段** - CSP（可选，需检查内联样式）
