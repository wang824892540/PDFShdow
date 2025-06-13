# 统一 Toast 通知的详细计划

**目标**：实现一个全面的 toast 通知系统，使得主进程的各类事件（启动、设置操作、文件操作状态等）以及现有的 API 调用结果，都能通过渲染进程的 toast 组件以不同类型（成功、错误、警告、信息）通知用户，同时保留现有的通知功能。

**现有基础**：
*   **渲染进程 (`index.html`)**:
    *   `showToast(message, type, duration)` 函数
    *   `handleAndShowApiError()` 和 `handleAndShowClientError()` 函数
    *   Toast 容器 `<div id="toastContainer">`
*   **样式 (`styles.css`)**:
    *   完善的 toast 容器、基础 toast 及各类型 toast (`.toast-success`, `.toast-error`, `.toast-info`, `.toast-warning`) 样式。
*   **主进程 (`main.js`)**:
    *   通过 `ipcMain.handle` 处理渲染进程请求，并返回包含 `success` 和 `error` 的结果。
    *   使用 Worker Threads 处理耗时任务。
    *   基本的错误日志记录 (`console.error`)。

**计划步骤**：

## 第一阶段：增强渲染进程的 Toast 能力和主进程通信

1.  **创建从主进程到渲染进程的单向通知通道 (Preload & Renderer)**
    *   **`preload.js`**:
        *   暴露一个新的 API 给渲染进程，用于监听来自主进程的 toast 通知。
        ```javascript
        // contextBridge.exposeInMainWorld('electronAPI', {
        //   // ... existing APIs ...
        //   onShowToast: (callback) => ipcRenderer.on('show-toast', (_event, ...args) => callback(...args))
        // });
        ```
    *   **`index.html` (渲染进程的 `<script>` 内)**:
        *   在 `DOMContentLoaded` 中，使用新的 `window.electronAPI.onShowToast` 来监听主进程发来的通知，并调用现有的 `showToast` 函数。
        ```javascript
        // // Inside DOMContentLoaded
        // window.electronAPI.onShowToast((message, type, duration) => {
        //   showToast(message, type, duration);
        // });
        ```

## 第二阶段：在主进程中集成 Toast 通知发送

1.  **创建主进程发送 Toast 的辅助函数 (`main.js`)**
    *   在 `main.js` 中创建一个辅助函数，用于向渲染进程发送 toast 通知。
    ```javascript
    // // At the top of main.js, after mainWindow is declared
    // // let mainWindow;

    // function sendToastToRenderer(message, type = 'info', duration = 3500) {
    //   if (mainWindow && mainWindow.webContents) {
    //     mainWindow.webContents.send('show-toast', message, type, duration);
    //   } else {
    //     console.log(`[Main Process Toast - ${type}]: ${message} (mainWindow not available)`);
    //   }
    // }
    ```

2.  **在主进程的关键事件点调用 `sendToastToRenderer` (`main.js`)**

    *   **应用启动**:
        *   在 `app.whenReady().then(...)` 之后，`createWindow()` 成功创建窗口后。
        ```javascript
        // app.whenReady().then(() => {
        //   getSettingsFilePath();
        //   createWindow();
        //   setTimeout(() => {
        //     sendToastToRenderer('应用程序已成功启动！', 'success', 2500);
        //   }, 1000);
        // });
        ```

    *   **设置操作**:
        *   `ipcMain.handle('get-settings', ...)`:
            *   读取失败但返回空对象时:
                ```javascript
                // // Inside get-settings catch block
                // if (error.code === 'ENOENT') {
                //   sendToastToRenderer('未找到设置文件，将使用默认设置。', 'info');
                //   return {};
                // }
                // sendToastToRenderer(`读取设置失败: ${error.message}`, 'warning');
                // return {};
                ```
        *   `ipcMain.handle('save-settings', ...)`: 倾向于维持渲染进程根据API返回结果处理Toast。

    *   **文件操作 (`open-file`, `process-pdf`, etc.)**:
        *   大部分由渲染进程根据API返回结果处理Toast。
        *   对于 `open-file` 用户取消的情况，渲染进程可以增加相应Toast。

    *   **Worker Threads 错误/退出**:
        *   维持现有逻辑，由渲染进程根据 `resolve` 的具体错误信息来显示 toast。

    *   **主进程未捕获异常 (推荐)**:
        *   在 `main.js` 的顶层添加：
        ```javascript
        // process.on('uncaughtException', (error) => {
        //   console.error('Unhandled Main Process Exception:', error);
        //   sendToastToRenderer(`主进程发生严重错误: ${error.message}`, 'error', 10000);
        // });
        ```

## 第三阶段：审阅和细化

1.  **审阅所有 `ipcMain.handle` 和渲染进程的调用处**: 确保每个操作的各种情况都有相应的 toast 通知。
2.  **审阅 `showToast` 的参数**: 确保 `type` 和 `duration` 的使用一致且合理。
3.  **测试**: 全面测试所有功能和各种场景下的 toast 通知。

**Mermaid 图 (简化流程)**

```mermaid
sequenceDiagram
    participant R as Renderer Process (index.html)
    participant P as Preload Script (preload.js)
    participant M as Main Process (main.js)

    R->>P: Call electronAPI.someFunction(args)
    P->>M: ipcRenderer.invoke('ipc-channel', args)
    M->>M: Process request
    alt Main Process Event
        M->>R: mainWindow.webContents.send('show-toast', message, type)
    end
    M-->>P: Return result {success, data, error}
    P-->>R: Return result
    R->>R: showToast(based on result)

    %% Listener for direct toasts
    M->>R: mainWindow.webContents.send('show-toast', msg, type)
    R->>P: electronAPI.onShowToast (callback)
    P->>R: ipcRenderer.on('show-toast', ...)
    R->>R: callback(msg, type) -> showToast(msg, type)