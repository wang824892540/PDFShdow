// 自动更新下载进度弹窗实现
// 通过预加载脚本暴露的 electronAPI 访问 IPC 功能

// 创建下载进度弹窗元素
function createDownloadProgressModal() {
  const modal = document.createElement('div');
  modal.id = 'downloadProgressModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>正在下载更新</h3>
        <button id="minimizeDownloadBtn" class="modal-minimize-btn" title="最小化到后台下载">&#8211;</button>
      </div>
      <div class="modal-body">
        <div class="progress-container">
          <div class="progress-bar" id="downloadProgressBar"></div>
          <span id="downloadProgressText">0%</span>
        </div>
        <div class="download-details">
          <div>速度: <span id="downloadSpeed">0 KB/s</span></div>
          <div>已下载: <span id="downloadedSize">0 MB</span></div>
          <div>总大小: <span id="totalSize">0 MB</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 最小化按钮事件
  document.getElementById('minimizeDownloadBtn').addEventListener('click', () => {
    modal.style.display = 'none';
    window.electronAPI.send('minimize-download-window');
  });
}

// 初始化下载进度监听
function initDownloadProgressListener() {
  // 监听主进程发送的下载进度
  window.electronAPI.on('download-progress', (progress) => {
    updateDownloadProgress(progress);
  });

  // 监听下载完成事件
  window.electronAPI.on('download-complete', () => {
    const modal = document.getElementById('downloadProgressModal');
    if (modal) modal.remove();
  });

  // 监听下载错误事件
  window.electronAPI.on('download-error', (error) => {
    showToast(`下载失败: ${error}`, 'error');
    const modal = document.getElementById('downloadProgressModal');
    if (modal) modal.remove();
  });
}

// 更新下载进度显示
function updateDownloadProgress(progress) {
  const progressBar = document.getElementById('downloadProgressBar');
  const progressText = document.getElementById('downloadProgressText');
  const downloadSpeed = document.getElementById('downloadSpeed');
  const downloadedSize = document.getElementById('downloadedSize');
  const totalSize = document.getElementById('totalSize');

  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }
  if (progressText) {
    progressText.textContent = `${Math.round(progress.percent)}%`;
  }
  if (downloadSpeed) {
    downloadSpeed.textContent = `${(progress.bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  if (downloadedSize) {
    downloadedSize.textContent = `${(progress.transferred / 1048576).toFixed(1)} MB`;
  }
  if (totalSize) {
    totalSize.textContent = `${(progress.total / 1048576).toFixed(1)} MB`;
  }
}

// 显示下载进度弹窗
function showDownloadProgressModal() {
  const modal = document.getElementById('downloadProgressModal');
  if (!modal) {
    createDownloadProgressModal();
  } else {
    modal.style.display = 'block';
  }
}

// 初始化检查更新按钮事件
function initUpdateCheckButton() {
  const updateCheckBtn = document.getElementById('updateCheckBtn');
  if (updateCheckBtn) {
    updateCheckBtn.addEventListener('click', () => {
      window.electronAPI.send('check-for-updates');
    });
  }
}

// 监听主进程的下载开始事件
window.electronAPI.on('download-started', () => {
  showDownloadProgressModal();
});

// 初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
  console.log("Renderer process loaded");
  initUpdateCheckButton();
  initDownloadProgressListener();
});