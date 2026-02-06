import geopandas as gpd
from pathlib import Path

# -----------------------------------
# Paramètres
# -----------------------------------
# Longueur minimale (en mètres) pour considérer qu'une rue appartient à un quartier
THRESHOLD_M = 5.0

# -----------------------------------
# Chemins
# -----------------------------------
BASE_DIR = Path(__file__).resolve().parent

# Fichier de rues EN ENTRÉE :
#   - si tu utilises un fichier fusionné avec les piétonnes,
#     mets ici par exemple "marseille_rues_plus_pietonnes.geojson"
streets_path = BASE_DIR / "data" / "marseille_rues_tmp.geojson"

# Polygones de quartiers
quartiers_path = BASE_DIR / "data" / "marseille_quartiers_111.geojson"

# Fichier de sortie utilisé par le jeu
output_path = BASE_DIR / "data" / "marseille_rues_enrichi.geojson"

print("Chargement des rues…")
rues = gpd.read_file(streets_path)

print("Chargement des quartiers…")
quartiers = gpd.read_file(quartiers_path)

print("CRS rues :", rues.crs)
print("CRS quartiers :", quartiers.crs)

# -----------------------------------
# Harmonisation des CRS
# -----------------------------------
if rues.crs is None:
  rues = rues.set_crs("EPSG:4326")

if quartiers.crs is None:
  quartiers = quartiers.set_crs("EPSG:4326")

if rues.crs != quartiers.crs:
  print("Reprojection des quartiers vers", rues.crs)
  quartiers = quartiers.to_crs(rues.crs)

# -----------------------------------
# Filtrage : on ne garde que les lignes (rues)
# -----------------------------------
print("Filtrage : on garde uniquement les LineString / MultiLineString…")
rues_lines = rues[rues.geometry.type.isin(["LineString", "MultiLineString"])].copy()
print("Nombre de géométries de rues conservées :", len(rues_lines))

# -----------------------------------
# Passage dans un CRS métrique pour mesurer en mètres
# (Lambert-93, adapté à la France)
# -----------------------------------
TARGET_CRS = "EPSG:2154"

print("Reprojection des rues et quartiers en", TARGET_CRS, "pour calculer les longueurs…")
rues_m = rues_lines.to_crs(TARGET_CRS)
quartiers_m = quartiers.to_crs(TARGET_CRS)

# -----------------------------------
# Intersection rues × quartiers
# -----------------------------------
print("Intersection rues × quartiers…")
quartiers_sub = quartiers_m[["nom_qua", "geometry"]].copy()

inter = gpd.overlay(
  rues_m,
  quartiers_sub,
  how="intersection"
)

print("Nombre de segments issus de l'intersection :", len(inter))

# -----------------------------------
# Calcul des longueurs et filtrage > THRESHOLD_M
# -----------------------------------
print("Calcul des longueurs en mètres…")
inter["long_m"] = inter.geometry.length

print(f"Filtrage des segments avec longueur >= {THRESHOLD_M} m…")
inter = inter[inter["long_m"] >= THRESHOLD_M].copy()
print("Nombre de segments après filtrage :", len(inter))

# À ce stade :
#  - chaque ligne = une portion de rue dans un quartier donné,
#  - une même rue peut apparaître plusieurs fois (dans plusieurs quartiers),
#    si elle a > THRESHOLD_M dans chacun.

# -----------------------------------
# Préparation des attributs
#  - renommer nom_qua -> quartier
#  - nettoyer les colonnes techniques
# -----------------------------------
if "nom_qua" in inter.columns:
  inter = inter.rename(columns={"nom_qua": "quartier"})

# On supprime les colonnes techniques d'overlay si présentes
cols_to_drop = [c for c in inter.columns if c.startswith("index_")] + ["long_m"]
inter = inter.drop(columns=cols_to_drop, errors="ignore")

# -----------------------------------
# Reprojection finale en WGS84 pour Leaflet (EPSG:4326)
# -----------------------------------
print("Reprojection en EPSG:4326 pour export GeoJSON…")
inter_out = inter.to_crs("EPSG:4326")

# -----------------------------------
# Export
# -----------------------------------
print("Enregistrement du fichier enrichi :", output_path)
inter_out.to_file(output_path, driver="GeoJSON")

print("Terminé.")
cols_to_show = [c for c in ["name", "quartier"] if c in inter_out.columns]
print("Aperçu :")
print(inter_out[cols_to_show].head())
