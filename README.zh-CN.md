# PDF 窗口 (PDFShdow)

[English](README.md)

这是一款基于 Electron 的多功能桌面应用程序，旨在提供一套强大而易用的 PDF 处理工具集。应用利用工作线程来处理耗时任务，确保用户界面始终保持流畅响应。

## ✨ 主要功能

### 核心 PDF 处理

1.  **PDF 页面尺寸调整**
    *   将 PDF 文件的所有页面统一调整为用户指定的宽度和高度。
    *   在调整尺寸时，能自动保持原始页面的宽高比，并将内容在新的页面尺寸上居中，防止图像或文字变形。

2.  **Shein 标签生成器 (二合一合并)**
    *   一个为特定电商场景（如 Shein）设计的定制工具。
    *   它能合并两个 PDF 文件：将第二个 PDF 的每一页作为新页面的上半部分，并将第一个 PDF 的第一页内容置于新页面的下半部分。
    *   支持以毫米 (mm) 为单位自定义最终输出页面的尺寸。

3.  **多文件合并 (三合一合并)**
    *   将三个独立的 PDF 文件按顺序合并成一个单一的 PDF 文档。

4.  **PDF 转图片 (JPG 压缩包)**
    *   将一个 PDF 文档的每一页都转换成一张 JPG 图片。
    *   所有生成的图片将被打包到一个 ZIP 压缩文件中，方便分发和使用。

### 辅助与工具

*   **文件操作**:
    *   从本地计算机安全地打开 PDF 文件和选择输出目录。
    *   处理完成后，可以直接在文件浏览器中定位生成的文件。
    *   **复制文件到剪贴板**: 一个非常方便的功能，可以直接将生成的文件本身复制到系统剪贴板中，而不仅仅是文件路径。
    *   一键打开应用的官方网站。

*   **用户友好的界面**:
    *   简洁直观的用户界面，包含自定义的窗口控件（最小化、最大化、关闭）。
    *   通过即时通知（Toast）为用户的操作提供实时反馈（如成功、失败、处理中）。

*   **自动更新**:
    *   应用启动时会自动检查更新。
    *   当有新版本可用时，会通知用户，并提供下载和安装的选项，确保用户能及时使用到最新的功能和修复。

*   **设置持久化**:
    *   应用会保存用户的设置（如输出目录等），方便下次使用时自动加载，无需重复配置。

## 🛠️ 技术栈

*   **框架**: [Electron](https://www.electronjs.org/)
*   **PDF 处理**: [pdf-lib](https://pdf-lib.js.org/)
*   **压缩文件**: [jszip](https://stuk.github.io/jszip/)
*   **核心语言**: HTML, CSS, JavaScript (ES6+)
*   **并发模型**: Node.js Worker Threads

## 🚀 如何使用

1.  启动应用程序。
2.  通过界面上的按钮选择一个或多个 PDF 文件。
3.  根据您的需求选择要执行的操作（例如，调整尺寸、合并文件或转为图片）。
4.  为所选操作配置必要的参数（例如，新的页面尺寸、输出文件名等）。
5.  点击“处理”按钮启动任务。
6.  处理完成后，您可以在指定的输出目录中找到生成的文件。

## 💻 开发

要克隆并在本地运行此应用程序进行开发：

```bash
# 克隆仓库
git clone https://github.com/your-username/pdfshdow.git

# 进入项目目录
cd pdfshdow

# 安装依赖 (推荐使用 yarn)
yarn install

# 启动应用
yarn start