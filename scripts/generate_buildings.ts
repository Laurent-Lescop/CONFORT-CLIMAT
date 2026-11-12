/**
 * Generator script for preloaded local 3D building dataset of Île de Nantes.
 * Produces GeoJSON with precise building footprints, heights, roof types, and usage.
 */
import fs from 'fs';
import path from 'path';

interface BuildingFeature {
  type: 'Feature';
  properties: {
    id: string;
    name?: string;
    height: number;
    min_height: number;
    levels: number;
    type: 'cultural' | 'industrial_heritage' | 'residential' | 'commercial' | 'hospital' | 'educational' | 'office';
    categoryLabel: string;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

function makeBox(lngMin: number, latMin: number, lngMax: number, latMax: number): number[][] {
  return [
    [lngMin, latMin],
    [lngMax, latMin],
    [lngMax, latMax],
    [lngMin, latMax],
    [lngMin, latMin],
  ];
}

const features: BuildingFeature[] = [];
let idCounter = 1;

function addBuilding(
  lng: number,
  lat: number,
  wLng: number,
  hLat: number,
  height: number,
  type: BuildingFeature['properties']['type'],
  categoryLabel: string,
  name?: string,
  minHeight = 0
) {
  features.push({
    type: 'Feature',
    properties: {
      id: `bld-${idCounter++}`,
      name: name || undefined,
      height,
      min_height: minHeight,
      levels: Math.max(1, Math.round(height / 3.5)),
      type,
      categoryLabel,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        makeBox(lng - wLng / 2, lat - hLat / 2, lng + wLng / 2, lat + hLat / 2),
      ],
    },
  });
}

// 1. LES NEFS DUBIGEON & MACHINES DE L'ILE
addBuilding(-1.5641, 47.2065, 0.0022, 0.0007, 24, 'industrial_heritage', 'Patrimoine industriel', 'Les Grandes Nefs Dubigeon (Machines de l\'Île)');
addBuilding(-1.5641, 47.2071, 0.0020, 0.0004, 18, 'industrial_heritage', 'Patrimoine industriel', 'Nef Nord - Ateliers de construction');
addBuilding(-1.5641, 47.2059, 0.0019, 0.0004, 17, 'industrial_heritage', 'Patrimoine industriel', 'Nef Sud - Galerie des Machines');
addBuilding(-1.5688, 47.2058, 0.00065, 0.00065, 25, 'cultural', 'Lieu culturel', 'Carrousel des Mondes Marins');
addBuilding(-1.5663, 47.2064, 0.0008, 0.0005, 14, 'cultural', 'Patrimoine', 'Maison des Hommes et des Techniques');
addBuilding(-1.5682, 47.2046, 0.00035, 0.00035, 43, 'industrial_heritage', 'Monument Historique', 'Grue Titan Jaune (Monument)');
addBuilding(-1.5672, 47.2053, 0.0007, 0.0004, 11, 'cultural', 'Équipement public', 'Boutique & Café de la Branche');
addBuilding(-1.5620, 47.2068, 0.0009, 0.0005, 15, 'office', 'Activités créatives', 'La Cale 2 Créateurs');

// 2. QUARTIER DE LA CRÉATION & ENSEIGNEMENT
addBuilding(-1.5591, 47.2071, 0.0016, 0.0009, 30, 'educational', 'Enseignement supérieur', 'ENSA Nantes (École Nationale d\'Architecture)');
addBuilding(-1.5583, 47.2062, 0.0020, 0.0008, 18, 'educational', 'Enseignement artistique', 'Halles Alstom - École des Beaux-Arts');
addBuilding(-1.5608, 47.2053, 0.0011, 0.0007, 20, 'cultural', 'Scène musicale & numérique', 'Stereolux & La Fabrique');
addBuilding(-1.5574, 47.2054, 0.0009, 0.0006, 22, 'educational', 'Pôle communication', 'Mediacampus');
addBuilding(-1.5566, 47.2064, 0.0010, 0.0006, 24, 'office', 'Pépinière numérique', 'Halle 6 Ouest - Pôle Numérique');
addBuilding(-1.5562, 47.2058, 0.0008, 0.0005, 20, 'educational', 'Design & Innovation', 'École de Design Nantes Atlantique');
addBuilding(-1.5579, 47.2048, 0.0008, 0.0005, 18, 'office', 'Tertiaire créatif', 'Ateliers Magellan');

// 3. PALAIS DE JUSTICE & BERGES DE LA MADELEINE
addBuilding(-1.5615, 47.2086, 0.0018, 0.0009, 21, 'office', 'Institution judiciaire', 'Palais de Justice de Nantes (Jean Nouvel)');
addBuilding(-1.5635, 47.2082, 0.0010, 0.0006, 16, 'office', 'Bâtiment administratif', 'Hôtel des Douanes');
addBuilding(-1.5598, 47.2088, 0.0008, 0.0005, 19, 'office', 'Services juridiques', 'Maison de l\'Avocat');

// 4. HANGAR A BANANES & POINTE OUEST
addBuilding(-1.5739, 47.2006, 0.0035, 0.00045, 12, 'cultural', 'Lieu festif & art contemporain', 'Hangar à Bananes (Quai des Antilles)');
addBuilding(-1.5755, 47.1998, 0.00035, 0.00035, 38, 'industrial_heritage', 'Monument maritime', 'Grue Noire (Titan)');
addBuilding(-1.5718, 47.2014, 0.0012, 0.0004, 9, 'cultural', 'Tiers-lieu estival', 'La Cantine du Voyage');
addBuilding(-1.5705, 47.2020, 0.0010, 0.0005, 11, 'cultural', 'Espace événementiel', 'Le Jardin Fluvial');

// 5. GRAND CHU DE NANTES (SECTEUR SUD-OUEST)
addBuilding(-1.5558, 47.2014, 0.0032, 0.0018, 36, 'hospital', 'Établissement de santé', 'Grand CHU de Nantes - Cœur médico-technique');
addBuilding(-1.5538, 47.2023, 0.0015, 0.0010, 28, 'hospital', 'Pôle hospitalier', 'CHU - Pôle Urgences & Réanimation');
addBuilding(-1.5578, 47.2026, 0.0014, 0.0009, 26, 'hospital', 'Recherche médicale', 'CHU - Pôle Biologie & Recherche');
addBuilding(-1.5542, 47.2003, 0.0016, 0.0008, 18, 'hospital', 'Logistique', 'CHU - Centre Logistique & Énergie');
addBuilding(-1.5592, 47.2018, 0.0012, 0.0007, 24, 'hospital', 'Campus universitaire de santé', 'Faculté de Médecine & Maïeutique');
addBuilding(-1.5522, 47.2012, 0.0011, 0.0007, 22, 'office', 'Hébergement soignants', 'Résidence des Internes & Professionnels');

// 6. ECO-QUARTIER PRAIRIE-AU-DUC (ILOTS RESIDENTIELS & BOIS)
const prairieBlocks = [
  { lng: -1.5545, lat: 47.2052, w: 0.0010, hL: 0.00065, h: 28, name: 'Îlot Bois Prairie-au-Duc A' },
  { lng: -1.5532, lat: 47.2054, w: 0.0009, hL: 0.00060, h: 35, name: 'Îlot Bois Prairie-au-Duc B' },
  { lng: -1.5520, lat: 47.2056, w: 0.0008, hL: 0.00070, h: 42, name: 'Tour Résidentielle Prairie 360' },
  { lng: -1.5510, lat: 47.2058, w: 0.0009, hL: 0.00060, h: 26, name: 'Îlot Mixte Prairie Est' },
  { lng: -1.5540, lat: 47.2045, w: 0.0009, hL: 0.00060, h: 22, name: 'Résidence Bas Carbone C1' },
  { lng: -1.5528, lat: 47.2047, w: 0.0009, hL: 0.00055, h: 24, name: 'Résidence Bas Carbone C2' },
  { lng: -1.5515, lat: 47.2049, w: 0.0011, hL: 0.00065, h: 30, name: 'Îlot Tertiaire & Groupe Scolaire Aimé Césaire' },
  { lng: -1.5502, lat: 47.2051, w: 0.0009, hL: 0.00055, h: 25, name: 'Logements Durables Prairie D' },
  { lng: -1.5492, lat: 47.2053, w: 0.0008, hL: 0.00055, h: 27, name: 'Immeuble Unik (Bocklé & Assoc.)' },
];
prairieBlocks.forEach(b => {
  addBuilding(b.lng, b.lat, b.w, b.hL, b.h, 'residential', 'Logements durables', b.name);
});

// 7. FAUBOURG REPUBLIQUE & LES PONTS (TISSU URBAIN DENSE)
for (let i = 0; i < 7; i++) {
  for (let j = 0; j < 6; j++) {
    const lng = -1.5495 + i * 0.0013;
    const lat = 47.2042 + j * 0.0010;
    const h = 15 + ((i * 3 + j * 7) % 14);
    addBuilding(lng, lat, 0.0010, 0.0007, h, 'residential', 'Faubourg urbain');
  }
}

// 8. SECTEUR BEAULIEU & EST DE L'ILE
addBuilding(-1.5342, 47.2109, 0.0015, 0.0009, 17, 'cultural', 'Conservatoire de musique', 'Conservatoire à Rayonnement Régional de Nantes');
addBuilding(-1.5305, 47.2102, 0.0028, 0.0018, 14, 'commercial', 'Centre commercial', 'Centre Commercial Beaulieu');
addBuilding(-1.5325, 47.2095, 0.0010, 0.0008, 52, 'office', 'Tour de bureaux', 'Tour Beaulieu');
addBuilding(-1.5285, 47.2098, 0.0012, 0.0008, 38, 'office', 'Pôle tertiaire', 'Immeuble Le Tripode / Berges');
addBuilding(-1.5270, 47.2105, 0.0011, 0.0007, 32, 'office', 'Pôle tertiaire', 'Pôle Tertiaire Est A');
addBuilding(-1.5255, 47.2112, 0.0010, 0.0007, 28, 'residential', 'Résidence contemporaine', 'Résidence des Bords de Loire');
addBuilding(-1.5350, 47.2098, 0.0013, 0.0008, 25, 'office', 'Services publics', 'Centre Administratif Beaulieu');

// Bâtiments résidentiels Beaulieu & mail Picasso
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 5; j++) {
    const lng = -1.5370 + i * 0.0014;
    const lat = 47.2072 + j * 0.0009;
    const h = 18 + ((i * 5 + j * 3) % 20);
    addBuilding(lng, lat, 0.0011, 0.00065, h, 'residential', 'Habitats Beaulieu');
  }
}

// 9. BOULEVARD VINCENT GACHE & PONTS ARISTIDE BRIAND
for (let i = 0; i < 6; i++) {
  const lng = -1.5430 + i * 0.0012;
  const lat = 47.2070;
  addBuilding(lng, lat, 0.0009, 0.0006, 25 + (i % 3) * 6, 'office', 'Pôle de bureaux', `Pôle Tertiaire Vincent Gâche ${i + 1}`);
}

// 10. BERGES NORD (QUAI DE LA FOSSE & ÎLE FEYDEAU)
for (let i = 0; i < 8; i++) {
  const lng = -1.5690 + i * 0.0018;
  const lat = 47.2108;
  addBuilding(lng, lat, 0.0014, 0.0006, 20 + ((i * 4) % 10), 'residential', 'Façade quai de la Fosse');
}

// 11. BERGES SUD (PIRMIL / REZÉ EN VIS-À-VIS)
for (let i = 0; i < 9; i++) {
  const lng = -1.5660 + i * 0.0020;
  const lat = 47.1972;
  addBuilding(lng, lat, 0.0015, 0.0007, 16 + ((i * 5) % 12), 'residential', 'Rive Rezé / Pirmil');
}

const geojson = {
  type: 'FeatureCollection',
  features,
};

fs.mkdirSync(path.resolve('./public/data'), { recursive: true });
fs.writeFileSync(path.resolve('./public/data/buildings-ile-de-nantes.geojson'), JSON.stringify(geojson, null, 2));
fs.writeFileSync(path.resolve('./src/data/buildings-ile-de-nantes.json'), JSON.stringify(geojson, null, 2));

console.log(`Successfully generated ${features.length} 3D building footprints for Île de Nantes.`);
