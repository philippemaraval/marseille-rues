import geopandas as gpd
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

rues_path = BASE_DIR / "data" / "marseille_rues.geojson"
pietonnes_path = BASE_DIR / "data" / "marseille_rues_pietonnes.geojson"
output_path = BASE_DIR / "data" / "marseille_rues_tmp.geojson"

print("Chargement des rues...")
rues = gpd.read_file(rues_path)

print("Chargement des rues piétonnes...")
pietonnes = gpd.read_file(pietonnes_path)

# Harmoniser CRS
if rues.crs != pietonnes.crs:
    print(f"Reprojection des rues piétonnes vers {rues.crs}")
    pietonnes = pietonnes.to_crs(rues.crs)

# Fusion simple
print("Fusion des datasets...")
merged = gpd.GeoDataFrame(pd.concat([rues, pietonnes], ignore_index=True), crs=rues.crs)

print("Sauvegarde du fichier fusionné :", output_path)
merged.to_file(output_path, driver="GeoJSON")

print("Terminé. Total features :", len(merged))
