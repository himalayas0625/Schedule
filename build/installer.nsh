; 安装完成后写入隐私同意标记文件
; main.js 启动时读取此文件，预写入 store，然后删除，从而跳过应用内隐私弹窗
!macro customInstall
  CreateDirectory "$APPDATA\Schedule"
  FileOpen $0 "$APPDATA\Schedule\privacy-installer-accepted.txt" w
  FileWrite $0 "1.1"
  FileClose $0
!macroend
