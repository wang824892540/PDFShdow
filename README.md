# PDFShdow

[简体中文](README.zh-CN.md)

A powerful and elegant desktop application built with Electron, designed to provide a comprehensive suite of tools for PDF processing. The application leverages worker threads to handle time-consuming tasks, ensuring the user interface remains smooth and responsive at all times.

## ✨ Key Features

### Core PDF Processing

1.  **PDF Page Resizer**
    *   Resizes all pages of a PDF file to user-specified dimensions while maintaining aspect ratio.
    *   Automatically centers content within new dimensions to prevent distortion.
    *   Supports custom width and height in various units (mm, cm, inches).

2.  **Shein Label Generator (2-in-1 Merge)**
    *   A specialized tool designed for e-commerce scenarios like Shein.
    *   Merges two PDF files: uses each page of the second PDF as the top half of a new page, and places the first page of the first PDF on the bottom half.
    *   Supports custom output page dimensions in millimeters (mm).
    *   Perfect for creating professional product labels and tags.

3.  **Multi-File Merge (3-in-1 Merge)**
    *   Merges three separate PDF files into a single, sequential PDF document.
    *   Maintains original page order and quality.
    *   Ideal for combining multiple documents into one comprehensive file.

4.  **PDF to Images (JPG in ZIP)**
    *   Converts each page of a PDF document into high-quality JPG images.
    *   All generated images are packaged into a single ZIP archive for easy distribution.
    *   Supports custom image quality and resolution settings.

### Advanced Utilities & Tools

*   **Smart File Operations**:
    *   Secure PDF file opening with native file picker integration.
    *   Intelligent output directory selection with path validation.
    *   **Copy File to Clipboard**: Directly copy generated files to system clipboard for instant sharing.
    *   One-click file location in system explorer after processing.
    *   Quick access to application's official website and documentation.

*   **Modern User Interface**:
    *   Clean, intuitive UI with custom window controls (minimize, maximize, close).
    *   Real-time progress feedback with toast notifications.
    *   Responsive design that adapts to different screen sizes.
    *   Dark mode support for better user experience.

*   **Automatic Updates**:
    *   Seamless automatic update checking on application startup.
    *   User-friendly update notifications with download and install options.
    *   Ensures users always have access to the latest features and security patches.

*   **Persistent Settings & Preferences**:
    *   Smart settings persistence including last used output directory.
    *   Automatic configuration loading for streamlined workflow.
    *   User preference memory across application sessions.

## 🛠️ Tech Stack

*   **Framework**: [Electron](https://www.electronjs.org/) v30.0.0
*   **PDF Processing**: [pdf-lib](https://pdf-lib.js.org/) v1.17.1
*   **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) v0.34.2
*   **File Compression**: [jszip](https://stuk.github.io/jszip/) v3.10.1
*   **Drag & Drop**: [SortableJS](https://sortablejs.github.io/Sortable/) v1.15.6
*   **Core Language**: HTML5, CSS3, JavaScript (ES6+)
*   **Concurrency Model**: Node.js Worker Threads
*   **Build System**: Electron Builder v24.6.0
*   **Logging**: Electron Log v5.4.1
*   **Auto Updates**: Electron Updater v6.6.2

## 🚀 How to Use

1.  Launch the application from your desktop or start menu.
2.  Select one or more PDF files using the intuitive file picker interface.
3.  Choose your desired operation from the available tools (resize, merge, or convert).
4.  Configure operation-specific parameters (dimensions, output filename, quality settings).
5.  Click the "Process" button to start the task.
6.  Monitor real-time progress and receive completion notifications.
7.  Access your processed files directly from the application or system explorer.

## 💻 Development

To clone and run this application locally for development:

```bash
# Clone the repository
git clone https://github.com/wang824892540/PDFShdow.git

# Navigate to the project directory
cd pdfshdow

# Install dependencies (yarn is recommended)
yarn install

# Start the application in development mode
yarn start

# Build the application for distribution
yarn build

# Package the application without distribution
yarn package
```

## 📦 Build & Distribution

The application is built using Electron Builder with the following configuration:

- **Windows**: NSIS installer with x64 architecture
- **macOS**: DMG installer (planned)
- **Linux**: AppImage and deb packages (planned)

## 🔧 System Requirements

- **Windows**: Windows 10 or later (x64)
- **macOS**: macOS 10.14 or later (planned)
- **Linux**: Ubuntu 18.04 or later (planned)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 500MB available space

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For support, feature requests, or bug reports, please contact:
- Email: 824892540@qq.com
- Website: https://pdfshdow.cn
- GitHub Issues: [Create an issue](https://github.com/wang824892540/PDFShdow/issues)

---

**Version**: 0.0.8  
**Last Updated**: January 2025