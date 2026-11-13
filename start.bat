@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 Azure 语音合成工作台： http://127.0.0.1:8899
echo 关闭本窗口即停止服务
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8899'"
node src/server.ts
pause
