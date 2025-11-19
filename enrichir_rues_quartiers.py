import geopandas as gpd
from pathlib import Path

# 1. Chemins
BASE_DIR = Path(__file__).resolve().parent
streets_path = BASE_DIR / "data" / "marseille_rues.geojson"
quartiers_path = BASE_DIR / "data" / "marseille_quartiers_111.geojson"
output_path = BASE_DIR / "data" / "marseille_rues_enrichi.geojson"

print("Chargement des rues...")
streets = gpd.read_file(streets_path)

print("Chargement des quartiers...")
quartiers = gpd.read_file(quartiers_path)

print("CRS rues :", streets.crs)
print("CRS quartiers :", quartiers.crs)

# 2. Harmoniser les systèmes de coordonnées
if streets.crs is None:
    streets = streets.set_crs("EPSG:4326")

if quartiers.crs is None:
    quartiers = quartiers.set_crs("EPSG:4326")

if streets.crs != quartiers.crs:
    print("Reprojection des quartiers vers", streets.crs)
    quartiers = quartiers.to_crs(streets.crs)

print("Colonnes disponibles dans le fichier quartiers :")
print(quartiers.columns)

# Ici, on sait que les colonnes sont :
# ['geo_point_2d', 'depco', 'nom_co', 'nom_qua', 'geometry']
# On ne peut extraire QUE le quartier (nom_qua). Pas d'info d'arrondissement réelle.

nom_quartier_col = "nom_qua"

cols_quartiers = ["geometry", nom_quartier_col]
quartiers_sub = quartiers[cols_quartiers].copy()

# 3. Jointure spatiale rues/quartiers
print("Jointure spatiale rues/quartiers (intersects)...")
streets_enriched = gpd.sjoin(
    streets,
    quartiers_sub,
    how="left",
    predicate="intersects"
)

# 4. Renommer nom_qua -> quartier
streets_enriched = streets_enriched.rename(columns={
    nom_quartier_col: "quartier"
})

# Nettoyage des colonnes techniques index_right éventuelles
streets_enriched = streets_enriched.drop(
    columns=[c for c in streets_enriched.columns if c.startswith("index_")],
    errors="ignore"
)

print("Enregistrement du fichier enrichi :", output_path)
streets_enriched.to_file(output_path, driver="GeoJSON")

print("Terminé. Nombre de rues :", len(streets_enriched))
cols_to_show = [c for c in ["name", "quartier"] if c in streets_enriched.columns]
print(streets_enriched[cols_to_show].head())