@echo off
chcp 65001 >nul
title Mood Bin LAN Server
cd /d "%~dp0"
node server.js
pause
