@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 小丑德州 - Joker Hold'em
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.14 或更新版本，然后重新启动。
  pause
  exit /b 1
)
if not exist "node_modules\tsx" (
  echo 正在安装游戏依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  echo 正在准备游戏...
  call npm run build
  if errorlevel 1 (
    echo 构建失败，请查看上方提示。
    pause
    exit /b 1
  )
)
echo.
echo 启动后，在浏览器打开 http://localhost:5178
echo 局域网朋友请使用下方显示的局域网地址。
echo 游戏期间请保持此窗口开启。按 Ctrl+C 停止服务。
echo.
call npm start
pause
