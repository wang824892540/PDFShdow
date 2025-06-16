# PDF Tool

This is an Electron-based desktop application that provides a set of tools for processing PDF files.

[中文说明](README.zh-CN.md)

## Features

*   **PDF Page Resizing**:
    *   Resizes all pages of a PDF file to a specified width and height.
    *   Maintains the aspect ratio of the original pages and centers them on the new page.

*   **Shein Label Generator**:
    *   Merges two PDF files to generate new label pages.
    *   For each page in the second PDF, a new page is created with the content of the second PDF's page in the top half and the content of the first PDF's first page in the bottom half.
    *   Supports custom output page dimensions in millimeters.

*   **File Operations**:
    *   Open PDF files from your computer.
    *   Show the processed file in the file explorer.
    *   Copy the file path to the clipboard.

*   **User-Friendly Interface**:
    *   Clean and intuitive user interface.
    *   Provides real-time feedback through toast notifications.
    *   Custom window controls (minimize, maximize, close).

*   **Automatic Updates**:
    *   Automatically checks for updates when the application starts.
    *   Notifies the user when a new version is available and provides an option to download and install it.

*   **Settings**:
    *   Saves and loads user settings.

## Tech Stack

*   [Electron](https://www.electronjs.org/)
*   [pdf-lib](https://pdf-lib.js.org/)
*   HTML, CSS, JavaScript

## How to Use

1.  Launch the application.
2.  Use the "Open File" button to select a PDF file.
3.  Select the operation you want to perform (e.g., resize or generate Shein label).
4.  Configure the operation parameters (e.g., new page dimensions).
5.  Click the "Process" button.
6.  Once the processing is complete, you can find the output file in the same directory as the original file.

## Development

To run this application for development:

```bash
npm install
npm start