import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';

/**
 * Ajoute un calque personnalisé à la carte et le remet en place après chaque changement de style
 * (changer de fond de carte supprime les calques ajoutés). Retourne la fonction de retrait.
 */
export function attachCustomLayer(map: MapLibreMap, layer: CustomLayerInterface): () => void {
  const ensure = () => {
    try {
      if (!map.getLayer(layer.id)) map.addLayer(layer);
    } catch (err) {
      console.warn(`Calque ${layer.id} indisponible :`, err);
    }
  };
  if (map.isStyleLoaded()) ensure();
  else map.once('idle', ensure);
  map.on('style.load', ensure);
  return () => {
    map.off('style.load', ensure);
    try {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    } catch {
      // carte déjà détruite
    }
  };
}
