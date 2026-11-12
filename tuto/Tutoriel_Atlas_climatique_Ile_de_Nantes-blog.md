# **1\. À quoi sert l’application**

L’Atlas climatique de l’Île de Nantes est une application cartographique 3D qui aide à **comprendre le microclimat d’un quartier** en phase d’esquisse : course du soleil, ombres portées, ensoleillement, écoulement du vent entre les bâtiments et confort thermique des espaces publics.

Elle fonctionne dans votre navigateur, à partir de données ouvertes :

* **bâtiments 3D** d’OpenStreetMap (emprises et hauteurs) lus dans le fond de carte ;

* **végétation** d’OpenStreetMap (arbres isolés, alignements, boisements, parcs) ;

* **fichier météo EPW** de votre choix (année type horaire : température, humidité, vent, rayonnement).

Les calculs portent sur un **secteur circulaire de 100 à 250 m de rayon** que vous placez où vous voulez. Les résultats sont des **aides à la conception**, qualitatives et comparatives : ils permettent de repérer les tendances (zones à l’ombre, couloirs venteux, places surchauffées) et de comparer des situations, pas de produire un calcul réglementaire.

| Fonction | Ce qu’elle montre |
| :---- | :---- |
| Secteur d’étude | Zone circulaire centrée sur des coordonnées GPS, rayon 100 à 250 m |
| Fichier EPW | Synthèse du climat : températures, rayonnement, rose des vents, degrés-jours |
| Sunpath | Course du soleil en dôme 3D ou diagramme au sol, à toute date et heure |
| Ombres portées | Ombres au sol à l’heure choisie, en direct |
| Soleil du jour | Heures de soleil direct au sol sur une journée |
| Végétation | Arbres et espaces verts d’OpenStreetMap, couverture végétale et canopée |
| Simulation du vent | Accélérations et zones calmes à hauteur de piéton pour une direction donnée |
| Confort thermique | Carte de l’indice UTCI (ressenti) à 0,5 m de résolution pour une heure |
| Exports | JSON, CSV horaire et GeoJSON pour Grasshopper / Ladybug, Python ou tableur |
| Recherche intelligente | Assistant IA avec recherche web (clé Gemini nécessaire) |

# **2\. Démarrer l’application**

1. Installez une fois pour toutes **Node.js** (version LTS) depuis nodejs.org.

2. Dans le dossier de l’application, double-cliquez sur **lancer-application.bat**. Au premier lancement, les modules nécessaires sont installés automatiquement (quelques minutes).

3. Le navigateur s’ouvre sur **http\://localhost:3000**. Gardez la fenêtre noire ouverte pendant l’utilisation : c’est le serveur local.

4. Après une mise à jour de l’application, rechargez la page avec **Ctrl \+ F5**.

Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur « Informations complémentaires » puis « Exécuter quand même », ou lancez debloquer-windows.bat (voir le guide GUIDE\_UTILISATION\_LOCALE.md).

## **L’écran principal**

![Écran principal : carte 3D, secteur d’étude (cercle) et commandes][image1]

*Écran principal : carte 3D, secteur d’étude (cercle) et commandes*

* **En haut à gauche** : titre et bouton **Recherche intelligente**.

* **En haut au centre** : la **barre du secteur** (centre GPS, rayon, déplacement).

* **En haut à droite** : fond de carte, **Recentrer**, **Heatmap** (qualité de l’air), **Végétation**, **Étude** (ouvre le panneau d’étude climatique) et **3D** (bâtiments en relief).

* **En bas à gauche** : météo et qualité de l’air en temps réel (Open-Meteo, Copernicus).

* Navigation : clic gauche glissé pour déplacer, clic droit glissé (ou Ctrl \+ glisser) pour tourner et incliner, molette pour zoomer.

# **3\. Définir le secteur d’étude**

![Barre du secteur : centre GPS, rayon et outils][image2]

*Barre du secteur : centre GPS, rayon et outils*

1. Saisissez le centre en **latitude, longitude** (par exemple 47.2058, \-1.5530) puis cliquez sur **Aller**. La virgule ou le point décimal sont acceptés.

2. Ou cliquez sur **Déplacer**, puis sur la carte à l’endroit voulu.

3. Réglez le **rayon** de 100 à 250 m avec le curseur.

4. **Cadrer** recentre la caméra sur le secteur. La liste **Secteurs** propose des emplacements préréglés sur l’île.

Changer de secteur efface les résultats de vent, de confort et d’ombres, qui ne correspondent plus à la zone : il suffit de les relancer.

# **4\. Charger un fichier météo EPW**

Cliquez sur **Étude** (en haut à droite) pour ouvrir le panneau d’étude climatique, puis glissez un fichier **.epw** dans le cadre, ou cliquez sur **Choisir un fichier**.

![Fichier EPW chargé : station, coordonnées et distance à la zone][image3]

*Fichier EPW chargé : station, coordonnées et distance à la zone*

* Fichiers gratuits : **climate.onebuilding.org** (fichiers TMYx récents) ou EnergyPlus Weather. Pour Nantes : FRA\_PL\_Nantes.Atlantique.AP.072220\_TMYx.

* Le panneau indique la **distance entre la station et la zone** ; au-delà de 50 km, un avertissement s’affiche.

* **Centrer le secteur sur la station EPW** déplace le secteur sur la station si besoin.

* Le fichier reste dans votre navigateur ; il faut le recharger après un rechargement de la page.

## **Synthèse du climat**

![Synthèse : chiffres clés, températures, rayonnement et rose des vents][image4]

*Synthèse : chiffres clés, températures, rayonnement et rose des vents*

La synthèse donne les températures moyenne, minimale et maximale, le rayonnement annuel (global, direct, diffus), le vent moyen et dominant, l’humidité, le nombre d’heures au-dessus de 30 °C et les degrés-jours de chauffage (base 18 °C) et de rafraîchissement (base 24 °C). Les graphiques montrent les températures et le rayonnement mois par mois.

# **5\. Course du soleil (sunpath)**

La section **Sunpath** du panneau d’étude dessine la course du soleil centrée sur la zone.

![Dôme 3D : courbes du 21 de chaque mois, analemmes horaires et soleil][image5]

*Dôme 3D : courbes du 21 de chaque mois, analemmes horaires et soleil*

* **Dôme 3D** : dôme céleste de même rayon que le secteur. Les courbes du 21 de chaque mois vont du bleu (hiver) à l’orange (été) ; les analemmes relient les mêmes heures au fil de l’année ; le soleil est une sphère avec son rayon et sa projection au sol.

* **Au sol 2D** : diagramme stéréographique posé au sol, l’horizon étant le cercle du secteur.

* **Date** : curseur sur les 365 jours, avec les raccourcis **Équinoxe** (21 mars), **Solstice été** (21 juin) et **Solstice hiver** (21 décembre).

* **Heure** : par pas de 15 min, en **heure légale d’hiver** (sans heure d’été), comme les fichiers EPW.

* L’élévation, l’azimut (0° \= nord, 90° \= est) et les heures de lever et de coucher s’affichent.

* **Éclairer les bâtiments 3D selon le soleil** oriente la lumière de la carte comme le soleil.

* **Colorer par le rayonnement EPW** colore les points horaires selon le rayonnement global, direct ou diffus du fichier.

* **Vue 3D du dôme** et **Vue du dessus** cadrent la caméra.

![Diagramme au sol (2D), vue du dessus][image6]

*Diagramme au sol (2D), vue du dessus*

# **6\. Ombres portées et ensoleillement**

Sous l’éclairage, le bloc **Ombres portées au sol** propose trois choix : **Aucune**, **À cette heure** et **Soleil du jour**. Les bâtiments (y compris les passages couverts et porte-à-faux) et, si le calque Végétation est actif, les arbres (ombre filtrée, feuillage d’avril à octobre) sont pris en compte.

## **Ombres à l’heure choisie**

![Ombres au sol le 21 juin à 17 h 30 : elles suivent le curseur d’heure en direct][image7]

*Ombres au sol le 21 juin à 17 h 30 : elles suivent le curseur d’heure en direct*

Les ombres sont recalculées à chaque mouvement des curseurs de date et d’heure (une fraction de seconde). Le panneau indique la part du sol libre au soleil. Au survol, une infobulle précise « Au soleil », « À l’ombre » ou le pourcentage de soleil qui passe à travers les arbres.

## **Heures de soleil du jour**

**Soleil du jour** calcule, pour la date choisie, le nombre d’heures de **soleil direct au sol** en chaque point, par pas de 10 minutes et **par ciel clair**. Comptez environ 5 secondes. La carte va du bleu nuit (jamais de soleil) au jaune (soleil toute la journée). Le panneau donne la moyenne et la part du sol à moins de 2 h, 2 à 4 h, 4 à 6 h et 6 h et plus.

![Heures de soleil le 21 décembre : les pieds de façades nord ne voient pas le soleil][image8]

*Heures de soleil le 21 décembre : les pieds de façades nord ne voient pas le soleil*

![Le même secteur le 21 juin][image9]

*Le même secteur le 21 juin*

Usage typique : vérifier qu’une cour, une aire de jeux ou un square reçoit au moins 2 h de soleil au solstice d’hiver, ou repérer les zones qu’il faut ombrager en été.

Limites : grille de 1 m ; ombres au sol uniquement (pas sur les toits ni les façades) ; bâtiments situés à plus de 60 m hors du secteur ignorés ; la durée du jour ne compte pas la réfraction atmosphérique (environ 10 minutes de moins que les éphémérides).

# **7\. Végétation OpenStreetMap**

Le bouton **Végétation** (sur la carte ou dans le panneau) charge les arbres isolés, alignements d’arbres, boisements, parcs, pelouses et vergers d’OpenStreetMap, découpés au secteur. Le premier chargement peut prendre jusqu’à une minute (serveur public Overpass) ; le résultat est ensuite gardé 7 jours.

![Calque végétation : houppiers en 3D et statistiques du secteur][image10]

*Calque végétation : houppiers en 3D et statistiques du secteur*

* Le panneau donne la **couverture végétale** et la **canopée arborée** en % du secteur, et le détail par type.

* Seuls les arbres saisis dans OpenStreetMap sont connus : le nombre réel est souvent plus élevé.

* Activez la végétation **avant** de calculer les ombres ou le confort pour que les arbres comptent.

# **8\. Simulation du vent**

La simulation montre comment le vent se répartit entre les bâtiments, **à hauteur de piéton** : accélérations aux angles et dans les rues dans l’axe du vent, zones calmes dans les sillages.

![Rose des vents du fichier EPW : chaque secteur est cliquable][image11]

*Rose des vents du fichier EPW : chaque secteur est cliquable*

1. Dans la **Synthèse du fichier EPW**, cliquez un **secteur de la rose des vents** : la simulation se lance pour cette direction, avec la vitesse moyenne de ce secteur.

2. Ou, dans la section **Simulation du vent**, réglez la direction et la vitesse à la main, puis **Lancer la simulation**.

3. Le calcul prend 20 à 30 secondes. La caméra ne bouge pas si toute la zone est à l’écran.

![Vent d’ouest-sud-ouest : carte du rapport de vitesse et particules animées][image12]

*Vent d’ouest-sud-ouest : carte du rapport de vitesse et particules animées*

| Couleur | Lecture (rapport à la vitesse du vent libre) |
| :---- | :---- |
| Bleu foncé | Zone calme (moins de 0,5 fois le vent libre) : sillages, cours fermées |
| Turquoise / blanc | Vent proche du vent libre (0,5 à 1,2) |
| Jaune / orange | Vent accéléré (1,2 à 1,5) |
| Rouge | Fort : effets de coin, rues canalisées (plus de 1,5) |

Les boutons **Particules** et **Carte de vitesse** affichent ou masquent chaque représentation. Les statistiques donnent l’accélération maximale et les parts de surface par classe. Si vous bougez les curseurs après un calcul, le panneau rappelle la direction du champ affiché et propose de relancer.

Limites : modèle 2D en plan (méthode de Boltzmann sur réseau) ; un bâtiment de plus de 3 m est un obstacle plein, l’air ne passe jamais par-dessus, ce qui renforce les contournements ; pas de végétation ni de relief. Résultat qualitatif, à lire en tendances.

# **9\. Confort thermique (UTCI)**

La carte de confort donne l’indice **UTCI** (température ressentie à l’extérieur) à hauteur de piéton, pour **une heure** du fichier EPW, sur une grille de **0,5 m**.

1. Choisissez la date et l’heure dans la section **Sunpath**, ou cliquez sur **Heure la plus chaude**.

2. Vérifiez la carte de l’heure : température de l’air, humidité, vent de la station, soleil, rayonnement direct et diffus.

3. Choisissez la **finesse** (0,5 m, 1 m ou 2 m) et le **terrain** autour du site (Ville dense par défaut).

4. Activez la **Végétation** pour que les arbres comptent, puis cliquez sur **Calculer la carte de confort** (20 secondes environ, vent compris).

5. Survolez la carte pour lire l’UTCI, la température radiante moyenne (Tmrt), le vent, l’ombre et la part de ciel visible.

![Carte UTCI de l’heure la plus chaude, avec l’infobulle de survol][image13]

*Carte UTCI de l’heure la plus chaude, avec l’infobulle de survol*

| UTCI (°C) | Catégorie | Ressenti |
| :---- | :---- | :---- |
| plus de 46 | Chaleur extrême | Danger : éviter toute exposition |
| 38 à 46 | Chaleur très forte | Stress thermique très fort |
| 32 à 38 | Chaleur forte | Stress thermique fort |
| 26 à 32 | Chaleur modérée | Inconfort, à ombrager |
| 9 à 26 | Pas de stress | Confortable |
| 0 à 9 | Froid léger | Léger inconfort |
| moins de 0 | Froid modéré à extrême | Stress dû au froid |

## **Ce qui est pris en compte**

* **Rayonnement** : soleil direct (ombres des bâtiments et des arbres), ciel diffus, sol échauffé, infrarouge du ciel (valeur EPW ou estimation EnergyPlus) ; modèle simplifié de type SOLWEIG.

* **Vent** : vent de la station × correction de terrain (profils ASHRAE : Ville dense × 0,45, Périurbain × 0,72, Dégagé × 1\) × rapport local issu de la simulation du vent de cette heure (lancée automatiquement, ou réutilisée si la direction correspond).

* **Air** : température et humidité de l’heure.

Limites : calcul instantané (pas d’inertie thermique), pas de réflexions entre façades ni d’évapotranspiration. À lire en écarts entre lieux (ombre et soleil, abrité et venté) plutôt qu’en valeur absolue.

# **10\. Exports**

La section **Préparer l’exploitation** produit des fichiers pour Grasshopper / Ladybug, Python ou un tableur.

![Section des exports][image14]

*Section des exports*

| Fichier | Contenu |
| :---- | :---- |
| etude-zone.json | Secteur, métadonnées et synthèse EPW, statistiques de végétation |
| epw-horaire-zone.csv | 8 760 lignes : météo horaire \+ azimut et élévation du soleil au centre de la zone |
| vegetation-osm.geojson | Végétation du secteur (arbres en petits polygones avec hauteur et base) |

# **11\. Recherche intelligente**

Le bouton **Recherche intelligente** (en haut à gauche) ouvre un assistant qui répond en français à des questions sur la ville et le climat :

* **Actualité & Web** : recherche sur Internet, réponse avec ses sources (exemples : îlots de chaleur à Nantes, règles du PLUm sur la pleine terre) ;

* **Réflexion urbaine** : analyse approfondie sans recherche (exemple : stratégie d’ombrage d’une place exposée au sud-ouest).

![Fenêtre de la recherche intelligente et suggestions][image15]

*Fenêtre de la recherche intelligente et suggestions*

L’assistant utilise l’IA Gemini de Google et nécessite une clé gratuite : créez-la sur aistudio.google.com, ajoutez la ligne GEMINI\_API\_KEY=votre\_clé au fichier .env du dossier de l’application, puis relancez. Sans clé, il répond « Clé API Gemini non configurée ». Les questions sont envoyées à Google.

# **12\. Conseils et dépannage**

| Situation | Que faire |
| :---- | :---- |
| La page ne s’ouvre pas | Vérifiez que la fenêtre noire de lancer-application.bat est ouverte, puis allez sur http\://localhost:3000 |
| Affichage ancien après une mise à jour | Rechargez avec Ctrl \+ F5 |
| « Aucun bâtiment lu dans les tuiles » | Attendez que les bâtiments 3D s’affichent sur la carte (connexion lente), puis relancez |
| La végétation ne se charge pas | Le serveur public Overpass est saturé : réessayez dans une minute |
| Les arbres ne comptent pas dans le confort | Activez Végétation et attendez la fin du chargement avant de calculer |
| Calcul plus lent que d’habitude | Le navigateur calcule sans Web Worker (message dans la console) : le résultat est identique |
| Résultats effacés | Le secteur, l’heure, le fichier EPW ou le terrain ont changé : relancez le calcul |

## **Conventions**

* Heures : heure légale **standard** du fichier EPW (UTC+1 à Nantes, sans heure d’été) ; une ligne EPW « 14 » couvre 13 h – 14 h ; le soleil est calculé au milieu de l’heure.

* Azimut : depuis le nord, sens horaire (90° \= est). Direction du vent : d’où il vient.

* Méthodes : position du soleil NOAA ; UTCI polynôme officiel (Bröde et al.) ; profils de vent ASHRAE ; vent par méthode de Boltzmann sur réseau D2Q9 avec turbulence de Smagorinsky.
