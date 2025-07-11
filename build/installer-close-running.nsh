!macro customInit
  ; 关闭所有正在运行的 PDFShdow.exe
  nsExec::ExecToLog 'taskkill /F /IM PDFShdow.exe'
!macroend 