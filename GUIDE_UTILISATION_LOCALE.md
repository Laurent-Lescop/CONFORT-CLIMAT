# Guide d'Installation & Utilisation Locale — Atlas 3D Île de Nantes

Ce guide vous accompagne pour utiliser l'application sur votre ordinateur personnel, **avec ou sans connexion Internet**.

---

> **Tutoriel et vidéos** : le dossier `tuto` contient le tutoriel illustré (`Tutoriel_Atlas_climatique_Ile_de_Nantes.docx`), deux vidéos de présentation en 16/9 (`Video_1_Soleil_ombres_ensoleillement.mp4`, `Video_2_Vent_et_confort.mp4`) et les captures d'écran (`images`).

## 0. Étude de zone : secteur, végétation, fichier EPW, sunpath

### Secteur d'étude (rayon 250 m)
La barre du haut définit un **secteur circulaire de 250 m de rayon maximum** (réglable de 100 à 250 m). Son centre se donne en **coordonnées GPS** : saisissez `latitude, longitude` (ex. `47.2058, -1.5530`, virgule ou point décimal) puis **Aller**. Le centre peut aussi être déplacé par clic sur la carte (bouton *Déplacer*).

### Calque végétation OpenStreetMap (optionnel)
Bouton **Végétation** en haut à droite. Les arbres, alignements d'arbres, boisements, parcs, pelouses et vergers d'OpenStreetMap sont chargés via l'API Overpass puis découpés au disque du secteur. Les houppiers et boisements sont extrudés en 3D. Le panneau *Étude* donne la couverture végétale et la canopée en %.
- Le serveur public Overpass est parfois lent : comptez **jusqu'à une minute** au premier chargement. Le résultat est gardé en cache (navigateur, 7 jours) : changer le rayon ne relance aucune requête.
- Seuls les arbres saisis dans OSM sont comptés ; le nombre réel d'arbres est généralement plus élevé.

### Fichier EPW et sunpath
Bouton **Étude** : ouvre le panneau d'étude climatique.
1. **Fichier EPW** : glissez un `.epw` (par ex. depuis climate.onebuilding.org). Le panneau affiche la station, sa distance à la zone, et une synthèse (températures, rayonnement, vent, degrés-jours). Le fichier reste dans le navigateur ; il n'est pas conservé après rechargement de la page.
2. **Sunpath** : **dôme céleste 3D** centré sur la zone (rayon = rayon du secteur) dessiné en lignes fines : courbes du 21 de chaque mois colorées selon la saison (bleu = hiver, orange = été), analemmes horaires, soleil représenté par une sphère. Un mode *Au sol 2D* (diagramme stéréographique) reste disponible. Choisissez la date et l'heure (heure légale standard, sans heure d'été) ; le soleil, l'élévation et l'azimut s'affichent. Options : éclairer les bâtiments 3D selon la direction du soleil, colorer le sunpath avec le rayonnement du fichier EPW (global, direct ou diffus). Boutons *Vue 3D du dôme* et *Vue du dessus* pour cadrer.
   - **Ombres portées au sol** (sous l'éclairage, dans la section Sunpath) : *À cette heure* dessine les ombres des bâtiments (y compris passages couverts et porte-à-faux) et des arbres pour la date et l'heure choisies ; elles suivent les curseurs en direct. *Soleil du jour* calcule les heures de soleil direct au sol sur toute la journée (pas de 10 min, ciel clair) : carte de couleurs, moyenne, parts du sol à moins de 2 h, 2–4 h, 4–6 h et 6 h et plus ; quelques secondes de calcul. Survolez la carte pour lire la valeur. Grille de 1 m ; ombres au sol seulement (pas sur les toits ni les façades) ; arbres pris en compte si le calque *Végétation* est actif.
3. **Simulation du vent (2,5D)** : cliquez un **secteur de la rose des vents** (ou réglez direction et vitesse à la main) pour lancer la simulation sur la zone. La caméra ne bouge pas si toute la zone est à l'écran ; sinon elle recule pour la cadrer en gardant son orientation. Si vous bougez les curseurs après un calcul, le panneau indique la direction du champ réellement affiché et propose de relancer. Les bâtiments d'OpenStreetMap sont des obstacles ; un solveur de Boltzmann sur réseau 2D (plan horizontal, hauteur de piéton) calcule l'écoulement dans un Web Worker (environ 20 à 30 s). Résultats : carte du rapport de vitesse U/U∞ sous les bâtiments (bleu = calme, rouge = accélération : angles, rues canalisées), particules animées (accélérées) et statistiques par classe. Les calculs lourds tournent dans un Web Worker ; si le navigateur ne peut pas le démarrer, ils basculent automatiquement sur le thread principal (un peu plus lent, interface toujours utilisable). **Limites** : résultat qualitatif ; les bâtiments sont des obstacles pleins dès 3 m de haut (l'air ne passe jamais par-dessus), ce qui accentue les contournements et les accélérations dans les espaces ouverts ; pas de profil de vent vertical ni de végétation.
4. **Confort thermique (UTCI)** : carte du ressenti thermique à hauteur de piéton pour **une heure** (date et heure réglées dans la section Sunpath ; bouton *Heure la plus chaude*). Grille de **0,5 m** (ou 1 m / 2 m, plus rapide). Entrées : température, humidité, vent et rayonnement de l'heure dans l'EPW, ombres portées des bâtiments (y compris passages couverts et porte-à-faux) et des arbres, arbres isolés et alignements (activez d'abord le calque *Végétation*), part de ciel visible, vent simulé de cette heure (calculé automatiquement, ou réutilisé si déjà fait). Le vent de la station (aérodrome) est ramené au vent qui arrive sur le quartier selon le **terrain** choisi (*Ville dense* par défaut : × 0,45 ; *Périurbain* : × 0,72 ; *Dégagé* : × 1), avec les profils de l'ASHRAE comme dans Ladybug. Le polynôme UTCI est l'officiel (Bröde et al.) ; la température radiante moyenne est un modèle simplifié de type SOLWEIG. Survolez la carte pour lire UTCI, Tmrt, vent, ombre et ciel visible. **Limites** : calcul instantané (pas d'inertie thermique), pas de réflexions entre bâtiments ni d'évapotranspiration ; à lire en écart entre lieux (ombre/soleil, abrité/venté) plus qu'en valeur absolue.
5. **Exports** pour exploiter l'EPW sur la zone :
   - `etude-zone.json` : secteur, métadonnées et synthèse EPW, statistiques de végétation ;
   - `epw-horaire-zone.csv` : 8760 lignes (météo + azimut/élévation du soleil calculés au centre de la zone) ;
   - `vegetation-osm.geojson` : végétation du secteur (arbres en petits polygones avec `height`, `base`).

### Recherche intelligente
Le bouton **Recherche intelligente** (en haut à gauche) ouvre un assistant qui répond à des questions en langage courant : actualité et documents trouvés sur le web avec leurs sources (mode *Actualité & Web*), ou réflexion plus approfondie sans recherche (mode *Réflexion urbaine*). Il utilise l'IA Gemini de Google et nécessite une clé gratuite : ajoutez la ligne `GEMINI_API_KEY=votre_clé` au fichier `.env` du dossier (clé à créer sur aistudio.google.com), puis relancez l'application. Sans clé, l'assistant répond « Clé API Gemini non configurée ». La palette Atlas (quartiers, lieux, projets, visite démo) a été retirée : l'application est centrée sur l'étude climatique.

Conventions : heures EPW 1 à 24 (fin d'heure), soleil calculé au milieu de l'heure ; azimut depuis le nord, sens horaire (90° = est).

---

## 1. Vérification des Librairies & Dépendances

Toutes les librairies nécessaires au bon fonctionnement de l'application sont déclarées et configurées dans le fichier `package.json` :

- **Moteur Cartographique & 3D** : `maplibre-gl` (avec workers Webpack/esbuild pré-compilés pour exécution locale autonome).
- **Interface Utilisateur & Rendu** : `react`, `react-dom`, `motion`, `lucide-react`, `tailwindcss`.
- **Serveur & Proxy Local** : `express`, `tsx`, `vite`, `dotenv`.
- **Intelligence Artificielle & Climat** : `@google/genai` (Gemini SDK), requêtes asynchrones vers l'API Open-Meteo / Copernicus CAMS avec cache local `localStorage`.

> **Important** : Lors du premier lancement, le script exécute automatiquement `npm install` pour télécharger et installer l'ensemble des modules dans le sous-dossier `node_modules/`. Aucune installation manuelle de bibliothèque supplémentaire n'est requise.

---

## 2. Fonctionnement Hors-ligne vs En Ligne

L'application a été conçue pour s'adapter automatiquement à votre statut réseau :

### A. Mode Hors-ligne (sans connexion Internet)
Lorsque votre ordinateur n'est pas connecté à Internet :
- **Atlas & Patrimoine Insulaire (100% fonctionnel)** : La base de données complète des quartiers, projets d'aménagement, points d'intérêt patrimoniaux, fiches détaillées et carrousels photos est stockée en local dans le projet (`src/data/data.json`).
- **Moteur Cartographique 3D (100% fonctionnel)** : Les contours des quartiers, le positionnement des marqueurs, le cadrage d'analyse sectorielle 2km × 2km et le calculateur de densité bâtie fonctionnent hors-ligne. Le fond de carte s'affiche sur une toile vectorielle sobre adaptée.
- **Heatmap & Climat local (100% fonctionnel)** : La carte thermique de la qualité de l'air se génère à partir des points de modélisation locaux et des valeurs de référence de l'agglomération nantaise (ou des dernières valeurs enregistrées dans le cache local de votre navigateur). La position solaire (élévation et azimut) est calculée localement en temps réel par formule astronomique.
- **Badge d'état** : Un témoin ambre **« Hors-ligne »** apparaît dans les en-têtes des panneaux pour vous informer que les données de référence locales sont actives.

### B. Mode En Ligne (avec connexion Internet)
Dès que votre ordinateur est connecté au réseau :
- **Météo en direct** : Récupération en temps réel de la température, de l'humidité, du vent (vitesse, rafales et direction cardinale), du code météo WMO et de l'indice UV via l'API Open-Meteo.
- **Qualité de l'Air en direct** : Synchronisation avec le modèle atmosphérique européen *Copernicus CAMS* (indices EAQI, PM2.5, PM10, NO2, O3) et mise à jour dynamique de la Heatmap 3D.
- **Tuiles Cartographiques Haute Définition** : Chargement fluide des tuiles raster OpenStreetMap, vectorielles OpenFreeMap ou satellites HD (avec clé Mapbox).
- **Assistant IA & Veille Urbaine** : Interrogation en direct de l'assistant Gemini avec recherche grounded Google Search (si une clé API Gemini est configurée dans votre `.env`).
- **Badge d'état** : Un témoin vert **« En ligne »** clignote doucement, confirmant le flux temps réel.

---

## 3. Pourquoi Windows bloque-t-il le fichier BAT et comment le débloquer ?

### La cause
Lorsque vous téléchargez une archive ZIP ou un fichier `.bat` depuis un navigateur web (Chrome, Edge, Firefox), Windows lui associe automatiquement un marqueur de zone appelé **MOTW** (*Mark of the Web*).
Par précaution, l'antivirus **Windows Defender SmartScreen** affiche alors un écran bleu avec le message :
> *« Windows a protégé votre ordinateur - Microsoft Defender SmartScreen a empêché le démarrage d'une application non reconnue. »*

Il ne s'agit **pas d'un virus**, mais du comportement standard de sécurité de Windows pour tout script `.bat` téléchargé sur Internet.

### Les 3 solutions simples pour le débloquer :

#### Solution 1 : Débloquer directement sur l'écran bleu (1 clic)
1. Sur la fenêtre bleue SmartScreen, cliquez sur le lien : **« Informations complémentaires »** (*More info*).
2. Un bouton apparaît en bas à droite : cliquez sur **« Exécuter quand même »** (*Run anyway*).
3. Le script se lance et Windows ne vous posera plus la question.

#### Solution 2 : Utiliser le script automatique `debloquer-windows.bat`
1. Double-cliquez sur le fichier **`debloquer-windows.bat`** fourni dans le dossier.
2. Ce script applique la commande native PowerShell `Unblock-File` à tous les fichiers du projet en 1 seconde.
3. Vous pouvez ensuite double-cliquer librement sur `lancer-application.bat`.

#### Solution 3 : Lancer directement depuis le terminal (sans passer par un fichier BAT)
Si vous ne souhaitez pas exécuter de fichier `.bat` :
1. Ouvrez le dossier dans l'Explorateur Windows.
2. Cliquez dans la barre d'adresse tout en haut du dossier, tapez **`cmd`** et appuyez sur **Entrée**.
3. Dans la console qui apparaît, tapez :
   ```bash
   npm start
   ```
4. Ouvrez votre navigateur sur **`http://localhost:3000`**.
*(Cette méthode ne déclenche jamais SmartScreen).*

---

## 4. Prérequis unique : Node.js

Pour exécuter l'application sur votre machine (Windows, Mac ou Linux), installez au préalable Node.js :
1. Rendez-vous sur le site officiel : [https://nodejs.org](https://nodejs.org).
2. Téléchargez la version **LTS** (version stable recommandée).
3. Lancez l'installateur en conservant les options par défaut.

---

## 5. Résumé des fichiers de démarrage

| Fichier | Système | Usage |
|---|---|---|
| **`lancer-application.bat`** | Windows | Vérifie Node, installe les dépendances au premier lancement, ouvre le navigateur et démarre l'application (la fenêtre reste ouverte en cas d'erreur). |
| **`lancer_atlas.bat`** | Windows | Raccourci vers `lancer-application.bat`. |
| **`diagnostique.bat`** | Windows | Teste automatiquement votre environnement (Node.js, npm, port 3000, fichiers) et génère `rapport-diagnostic.txt`. |
| **`debloquer-windows.bat`** | Windows | Retire la protection SmartScreen de Windows en un clic. |
| **`lancer-application.sh`** | Mac / Linux | Script bash équivalent pour macOS et distributions Linux. |
