@echo off
cd /d "%~dp0"
title Atlas 3D - Ile de Nantes

echo ========================================================
echo        ATLAS 3D ILE DE NANTES - LANCEMENT LOCAL
echo ========================================================
echo.
echo Dossier : %CD%
echo.

echo [1/3] Verification de Node.js...
node -v
if errorlevel 1 (
    echo [ERREUR] Node.js est introuvable.
    echo Installez Node.js LTS depuis https://nodejs.org
    pause
    exit /b 1
)

echo.
echo [2/3] Verification des librairies et binaires Windows...
if not exist "node_modules\.bin\tsx.cmd" (
    echo  -- Installation des modules Windows : npm install
    echo  -- Veuillez patienter quelques instants...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo.
        echo [ERREUR] npm install a echoue. Verifiez votre connexion Internet.
        pause
        exit /b 1
    )
    echo  -- Modules installes avec succes.
) else (
    echo  -- Modules et binaires tsx prets.
)

if not exist ".env" (
    echo PORT=3000> .env
)

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo [ATTENTION] Le port 3000 est deja utilise : l application tourne peut-etre deja.
    echo Ouverture de http://localhost:3000 dans le navigateur.
    start "" http://localhost:3000
    pause
    exit /b 0
)

echo.
echo [3/3] Demarrage du serveur local...
echo Le navigateur s ouvrira automatiquement des que le serveur est pret.

rem Ouvre le navigateur seulement quand le port 3000 repond
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "$t=0; while(-not (Test-NetConnection localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue) -and $t -lt 60){Start-Sleep 1; $t++}; Start-Process 'http://localhost:3000'"

echo.
echo ========================================================
echo  Serveur en cours d execution : http://localhost:3000
echo  Pour arreter le serveur : fermez cette fenetre ou Ctrl + C
echo ========================================================
echo.

call npm run dev

echo.
echo [INFO] Le serveur s est arrete.
echo Si une erreur est affichee ci-dessus, essayez : npm install
pause
