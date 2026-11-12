@echo off
cd /d "%~dp0"
title Deblocage des fichiers Windows

echo ========================================================
echo        DEBLOCAGE DE SECURITE WINDOWS (SmartScreen)
echo ========================================================
echo.
echo Retrait de la marque de telechargement internet sur les fichiers...
echo.

powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File"

echo.
echo [SUCCES] Tous les fichiers sont debloques.
echo Vous pouvez maintenant lancer : lancer-application.bat
echo.
pause
