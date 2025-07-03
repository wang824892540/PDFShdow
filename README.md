# PDFShdow

[简体中文](README.zh-CN.md)

This is a multi-functional desktop application built with Electron, designed to provide a powerful and user-friendly suite of tools for processing PDF files. The application leverages worker threads to handle time-consuming tasks, ensuring the user interface remains smooth and responsive at all times.

## ✨ Key Features

### Core PDF Processing

1.  **PDF Page Resizer**
    *   Resizes all pages of a PDF file to a user-specified width and height.
    *   Automatically maintains the aspect ratio of the original pages and centers the content within the new dimensions to prevent distortion.

2.  **Shein Label Generator (2-in-1 Merge)**
    *   A custom tool designed for specific e-commerce scenarios like Shein.
    *   It merges two PDF files: using each page of the second PDF as the top half of a new page, and placing the first page of the first PDF on the bottom half.
    *   Supports custom output page dimensions in millimeters (mm).

3.  **Multi-File Merge (3-in-1 Merge)**
    *   Merges three separate PDF files into a single, sequential PDF document.

4.  **PDF to Images (JPG in ZIP)**
    *   Converts each page of a PDF document into a JPG image.
    *   All generated images are then packaged into a single ZIP archive for easy distribution and use.

### Utilities & Tools

*   **File Operations**:
    *   Securely open PDF files and select output directories from the local machine.
    *   Directly locate the generated file in the file explorer after processing.
    *   **Copy File to Clipboard**: A convenient feature that copies the generated file itself to the system clipboard, not just the file path.
    *   One-click access to the application's official website.

*   **User-Friendly Interface**:
    *   A clean and intuitive UI with custom window controls (minimize, maximize, close).
    *   Provides real-time feedback for user actions (e.g., success, failure, processing) via toast notifications.

*   **Automatic Updates**:
    *   The application automatically checks for updates on startup.
    *   When a new version is available, it notifies the user and provides options to download and install, ensuring users have access to the latest features and fixes.

*   **Persistent Settings**:
    *   The application saves user settings (like the last used output directory), which are automatically loaded on the next launch for a smoother workflow.

## 🛠️ Tech Stack

*   **Framework**: [Electron](https://www.electronjs.org/)
*   **PDF Processing**: [pdf-lib](https://pdf-lib.js.org/)
*   **File Compression**: [jszip](https://stuk.github.io/jszip/)
*   **Core Language**: HTML, CSS, JavaScript (ES6+)
*   **Concurrency Model**: Node.js Worker Threads

## 🚀 How to Use

1.  Launch the application.
2.  Select one or more PDF files using the buttons on the interface.
3.  Choose the desired operation (e.g., resize, merge, or convert to images).
4.  Configure the necessary parameters for the chosen operation (e.g., new page dimensions, output filename).
5.  Click the "Process" button to start the task.
6.  Once processing is complete, you can find the output file in the specified directory.

## 💻 Development

To clone and run this application locally for development:

```bash
# Clone the repository
git clone https://github.com/your-username/pdfshdow.git

# Navigate to the project directory
cd pdfshdow

# Install dependencies (yarn is recommended)
yarn install

# Start the application
yarn start