@echo off
cd /d "%~dp0"
title Diagnostic Systeme - Atlas 3D
color 0E

echo ========================================================
echo        DIAGNOSTIC SYSTEME - ATLAS 3D ILE DE NANTES
echo ========================================================
echo.

set LOGFILE=rapport-diagnostic.txt

echo RAPPORT DIAGNOSTIC ATLAS 3D > "%LOGFILE%"
echo Date : %DATE% %TIME% >> "%LOGFILE%"
echo Dossier : %CD% >> "%LOGFILE%"
echo. >> "%LOGFILE%"

echo [1] Dossier de travail : %CD%
echo.

echo [2] Systeme :
ver
ver >> "%LOGFILE%"
echo.

echo [3] Node.js :
node -v
node -v >> "%LOGFILE%"
echo.

echo [4] npm :
npm -v
npm -v >> "%LOGFILE%"
echo.

echo [5] Fichiers cles :
if exist "package.json" echo [OK] package.json present
if exist "package.json" echo [OK] package.json >> "%LOGFILE%"
if exist "server.ts" echo [OK] server.ts present
if exist "server.ts" echo [OK] server.ts >> "%LOGFILE%"
if exist "node_modules\" echo [OK] node_modules present
if exist "node_modules\" echo [OK] node_modules >> "%LOGFILE%"
if exist "public\maplibre-gl-worker.mjs" echo [OK] maplibre worker present
if exist "public\maplibre-gl-worker.mjs" echo [OK] maplibre worker >> "%LOGFILE%"
echo.

echo [6] Test execution Node :
node -e "console.log('Execution Node OK')"
echo.

echo [7] Port 3000 :
netstat -ano | findstr :3000
if %errorlevel% neq 0 (
    echo [LIBRE] Le port 3000 est disponible.
    echo Port 3000 : LIBRE >> "%LOGFILE%"
) else (
    echo [OCCUPE] Le port 3000 est deja utilise.
    echo Port 3000 : OCCUPE >> "%LOGFILE%"
)
echo.

echo ========================================================
echo Diagnostic termine.
echo ========================================================
echo.
pause
