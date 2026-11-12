#!/usr/bin/env bash
# Atlas Île de Nantes - Script de lancement Mac / Linux

echo "======================================================================="
echo "         ATLAS 3D ÎLE DE NANTES - URBANISME, CLIMAT & IA"
echo "======================================================================="
echo ""
echo "Mode supporté : En ligne (temps réel) et Hors-ligne (données de base)"
echo ""

# Vérification de Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERREUR] Node.js n'est pas installé sur votre ordinateur."
    echo "Installez Node.js LTS depuis : https://nodejs.org"
    exit 1
fi

# Installation des dépendances si premier lancement
if [ ! -d "node_modules" ]; then
    echo "[INSTALLATION] Premier démarrage détecté. Installation des librairies requises..."
    npm install
fi

# Préparation du worker cartographique local
if [ ! -f "public/maplibre-gl-worker.mjs" ]; then
    echo "[CONFIGURATION] Préparation du worker MapLibre..."
    npm run bundle:worker >/dev/null 2>&1
fi

# Fichier .env minimal si manquant
if [ ! -f ".env" ]; then
    echo "PORT=3000" > .env
fi

echo ""
echo "Ouverture du navigateur sur http://localhost:3000 ..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3000" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
    open "http://localhost:3000" >/dev/null 2>&1 &
fi

echo "Démarrage du serveur (Ctrl + C pour quitter)..."
npm run dev
