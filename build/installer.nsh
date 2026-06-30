; 安装完成后写入隐私同意标记文件
; main.js 启动时读取此文件，预写入 store，然后删除，从而跳过应用内隐私弹窗
!macro customInstall
  CreateDirectory "$APPDATA\Schedule"
  FileOpen $0 "$APPDATA\Schedule\privacy-installer-accepted.txt" w
  FileWrite $0 "1.1"
  FileClose $0
!macroend

; 卸载时询问是否同时删除用户数据
!macro customUnInstall
  ; 应用关闭时隐藏到托盘（进程仍在后台），必须先强制终止才能删除 exe
  nsExec::Exec 'taskkill /F /IM "Schedule.exe"'
  Sleep 500

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除您的日程数据？$\r$\n$\r$\n• 选「是」：彻底清除所有日程记录和设置$\r$\n• 选「否」：保留数据，重装后可继续使用" \
    IDNO keep_data
    RMDir /r "$APPDATA\Schedule"
  keep_data:
  ; 清理 NSIS 未追踪的 Electron 运行时残留文件（DLL、bin 等）
  RMDir /r "$INSTDIR"
!macroend
