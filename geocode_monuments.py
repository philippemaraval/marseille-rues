import json
import time
from geopy.geocoders import Nominatim

# Liste brute des monuments (noms affichés dans le jeu)
MONUMENTS = [
    "Notre-Dame de la Garde",
    "Cathédrale de la Major",
    "Abbaye Saint-Victor",
    "Palais Longchamp",
    "Mucem",
    "Palais du Pharo",
    "Fort Saint-Jean",
    "Fort Saint-Nicolas",
    "Château d’If",
    "Vieille Charité",
    "Hôtel de Ville",
    "Ombrière du Vieux-Port",
    "Fort d’Entrecasteaux",
    "Gare Saint-Charles",
    "Palais de la Bourse",
    "Bibliothèque de l’Alcazar",
    "Préfecture des Bouches-du-Rhône",
    "Palais de Justice",
    "Théâtre de la Criée",
    "Théâtre du Gymnase",
    "Musée Cantini",
    "Musée d’Histoire de Marseille",
    "Musée des Beaux-Arts",
    "Cité Radieuse",
    "Arc de Triomphe de la Porte d’Aix",
    "Obélisque de Mazargues",
    "Bastide de la Magalone",
    "Basilique du Sacré-Cœur",
    "Chapelle des Bernardines - Lycée Thiers",
    "Château Borély",
    "Château de la Buzine",
    "Consigne sanitaire",
    "Église des Chartreux de Marseille",
    "Fontaine Cantini",
    "Hôpital Caroline",
    "Hôtel de Cabre",
    "Maison Diamantée",
    "Marégraphe",
    "Monument aux Mobiles des Bouches-du-Rhone",
    "Porte de l’Orient - Monument aux Morts de l’Armée d’Orient et des terres lointaines",
    "Palais des Arts",
    "Pavillon de partage des eaux des Chutes-Lavie",
    "Phare du Planier",
    "Statue de Monseigneur de Belsunce",
    "Villa La Palestine",
    "Mosquée de l’Arsenal des Galères",
    "Halle Puget",
    "Immeuble des Docks de la Joliette",
    "Statue de David",
    "Fontaine Estrangin",
    "Fontaine des Danaïdes",
]

def main():
    geolocator = Nominatim(user_agent="marseille_rues_monuments")
    features = []

    for name in MONUMENTS:
        query = f"{name}, Marseille, France"
        print(f"Géocodage : {query} ...", end=" ")

        try:
            loc = geolocator.geocode(query, timeout=10)
        except Exception as e:
            print(f"ERREUR ({e})")
            time.sleep(1)
            continue

        if loc is None:
            print("AUCUN RÉSULTAT")
            # On peut tenter une version sans accents
            time.sleep(1)
            continue

        lat = loc.latitude
        lon = loc.longitude
        print(f"OK ({lat:.6f}, {lon:.6f})")

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                # GeoJSON = [lon, lat]
                "coordinates": [lon, lat],
            },
            "properties": {
                "name": name
            },
        }
        features.append(feature)

        # Petite pause pour ne pas spammer Nominatim
        time.sleep(1)

    fc = {
        "type": "FeatureCollection",
        "features": features,
    }

    # Chemin de sortie : data/marseille_monuments.geojson
    out_path = "data/marseille_monuments.geojson"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)

    print(f"\nÉcrit {len(features)} monuments dans {out_path}")

if __name__ == "__main__":
    main()