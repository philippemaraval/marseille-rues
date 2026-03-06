import re
import json

streets = """Allée des Anciens Combattants
Allée Léon Gambetta
Allées Turcat-Mery
Autoroute du Littoral
Autoroute du Soleil
Avenue Adrienne Ranc-Sakakini
Avenue Alexandre Dumas
Avenue Alexandre Fleming
Avenue Alfred Blachère
Avenue André Roussin
Avenue André Zénatti
Avenue Arnavon
Avenue Benjamin Delessert
Avenue Camille Pelletan
Avenue César Boy
Avenue Claude Monet
Avenue Clot-Bey
Avenue Colgate
Avenue Corot
Avenue d'Haïfa
Avenue de Bonneveine
Avenue de Château Gombert
Avenue de Corinthe
Avenue de Hambourg
Avenue de la Capelette
Avenue de la Corse
Avenue de la Croix Rouge
Avenue de la Fourragère
Avenue de la Grognarde
Avenue de la Madrague de Montredon
Avenue de la Marche Pour l'Égalité et Contre le Racisme
Avenue de la Pointe Rouge
Avenue de la Timone
Avenue de la Viste
Avenue de Lattre de Tassigny
Avenue de Luminy
Avenue de Mazargues
Avenue de Peypin Nord
Avenue de Saint-Antoine
Avenue de Saint-Barnabé
Avenue de Saint-Jean
Avenue de Saint-Julien
Avenue de Saint-Just
Avenue de Saint-Louis
Avenue de Saint-Menet
Avenue de Toulon
Avenue de Valdonne
Avenue des Butris
Avenue des Caillols
Avenue des Chartreux
Avenue des Chutes Lavie
Avenue des Malloniers
Avenue des Olives
Avenue des Peintres Roux
Avenue des Poilus
Avenue des Roches
Avenue des Trois Lucs
Avenue du 24 Avril 1915
Avenue du Bousquetier
Avenue du Cap Pinède
Avenue du Corps Expéditionnaire Français
Avenue du Docteur Heckel
Avenue du Marché d'Intérêt National
Avenue du Maréchal Foch
Avenue du Prado
Avenue Elléon
Avenue Escadrille Normandie-Niémen
Avenue Fernand Sardou
Avenue Fernandel
Avenue François Chardigny
Avenue François Mignet
Avenue Frédéric Mistral
Avenue Général Leclerc
Avenue Ibrahim Ali
Avenue Jean Lombard
Avenue Jean-Paul Sartre
Avenue Jenny Helia
Avenue Joseph Vidal
Avenue Jules Cantini
Avenue Louis Malosse
Avenue Ludovic Lègre
Avenue Marcel Delprat
Avenue Millie Mathys
Avenue Pasteur
Avenue Paul Gaffarel
Avenue Pierre Chevalier
Avenue Pierre Mendès France
Avenue Prosper Mérimée
Avenue Raimu
Avenue Rampal
Avenue Raoul Follereau
Avenue Rellys
Avenue Robert Schuman
Avenue Roger Salengro
Avenue Salvador Allende
Avenue Vaudoyer
Avenue Viton
Avenue William Booth
Boulevard Alexandre Delabre
Boulevard Ampère
Boulevard Anatole de la Forge
Boulevard Baille
Boulevard Bara
Boulevard Barral
Boulevard Berthier
Boulevard Burel
Boulevard Camille Blanc
Boulevard Camille Flammarion
Boulevard Cassini
Boulevard Catherine Blum
Boulevard Charles Livon
Boulevard Charles Moretti
Boulevard Charles Nédelec
Boulevard Chave
Boulevard d'Athènes
Boulevard Danielle Casanova
Boulevard de Briançon
Boulevard de Dunkerque
Boulevard de la Barasse
Boulevard de la Blancarde
Boulevard de la Cartonnerie
Boulevard de la Comtesse
Boulevard de la Concorde
Boulevard de la Corderie
Boulevard de la Libération - Général de Monsabert
Boulevard de la Liberté
Boulevard de la Maison Blanche
Boulevard de la Millière
Boulevard de la Pomme
Boulevard de la Valbarelle
Boulevard de Montricher
Boulevard de Paris
Boulevard de Plombières
Boulevard de Pont de Vivaux
Boulevard de Saint-Loup
Boulevard de Saint-Marcel
Boulevard de Sainte-Marguerite
Boulevard de Strasbourg
Boulevard des Bassins de Radoub
Boulevard des Dames
Boulevard des Libérateurs
Boulevard du Bosphore
Boulevard du Cabot
Boulevard du Capitaine Gèze
Boulevard du Jardin Zoologique
Boulevard du Maréchal Juin
Boulevard du Redon
Boulevard Dugommier
Boulevard Elie Wiesel
Boulevard Eugène Pierre
Boulevard Ferdinand de Lesseps
Boulevard Fernand Bonnefoy
Boulevard Françoise Duparc
Boulevard Garibaldi
Boulevard Gassendi
Boulevard Gaston Crémieux
Boulevard Gay Lussac
Boulevard Georges Clémenceau
Boulevard Georges Estrangin
Boulevard Gustave Ganay
Boulevard Henri Barnier
Boulevard Jacques Saadé Quai d'Arenc
Boulevard Jacques Saadé Quai de la Joliette
Boulevard Jacques Saadé Quai de la Tourette
Boulevard Jacques Saadé Quai du Lazaret
Boulevard Jean Moulin
Boulevard Jean-Eugène Cabassud
Boulevard Jeanne d'Arc
Boulevard Lavoisier
Boulevard Longchamp
Boulevard Louis Frangin
Boulevard Louis Salvator
Boulevard Louis Villecroze
Boulevard Luce
Boulevard Maurice Bourdet
Boulevard Michelet
Boulevard Mirabeau
Boulevard Mireille Jourdan-Barry
Boulevard Mireille Lauze
Boulevard National
Boulevard Notre-Dame
Boulevard Notre-Dame
Boulevard Oddo
Boulevard Paul Peytral
Boulevard Périer
Boulevard Philippon
Boulevard Pierre Dramard
Boulevard Pierre Ménard
Boulevard Rabatau
Boulevard Rabatau Daniel Matalon
Boulevard Romain Rolland
Boulevard Sakakini
Boulevard Schloesing
Boulevard Tellène
Boulevard Théodore Thurner
Boulevard Urbain Sud
Boulevard Vincent Delpuech
Boulevard Voltaire
Chemin de Château Gombert
Chemin de Gibbes
Chemin de l'Armée d'Afrique
Chemin de la Colline Saint-Joseph
Chemin de la Madrague Ville
Chemin de la Pageotte
Chemin de Morgiou
Chemin de Notre-Dame de Consolation
Chemin de Roland Dorgelès
Chemin de Saint-Antoine à Saint-Joseph
Chemin de Saint-Jérôme
Chemin de Saint-Joseph à Sainte-Marthe
Chemin de Saint-Louis au Rove
Chemin de Sainte-Marthe
Chemin des Amaryllis
Chemin des Goudes
Chemin du Lancier
Chemin du Littoral
Chemin du Merlan à la Rose
Chemin du Roucas Blanc
Chemin du Roy d'Espagne
Chemin du Ruisseau Mirabeau
Chemin du Vallon de l'Auriol
Chemin du Vallon Vert
Chemin Saint-Jean du Désert
Chemin Vicinal de la Millière à Saint-Menet
Corniche du Président John Fitzgerald Kennedy
Cours Belsunce
Cours d'Estienne d'Orves
Cours Franklin Roosevelt
Cours Gouffé
Cours Jean Ballard
Cours Joseph Thierry
Cours Julien
Cours Lieutaud
Cours Pierre Puget
Cours Saint-Louis
Grand Rue
Grand'Rue
L2 Est
L2 Nord
La Canebière
Montée d'Éoures
Montée de Saint-Menet
Place aux Huiles
Place Bougainville
Place Castellane
Place Cazemajou
Place de la Corderie Henri Bergasse
Place de la Joliette
Place de la Major
Place de Pologne
Place de Strasbourg
Place des Marseillaises
Place du Général de Gaulle
Place Général Ferrié
Place Gouffé
Place Henri Dunant
Place Jean Jaurès
Place Jules Guesde
Place Marceau
Place Notre-Dame du Mont
Place Pierre Brossolette
Place Sébastopol
Plage de l'Estaque
Promenade Georges Pompidou
Quai de Rive-Neuve
Quai des Belges
Quai du Port
Rond-point du Prado
Route d'Allauch
Route d'Allauch à Aubagne
Route d'Enco de Botte
Route de la Gineste
Route de la Sablière
Route de la Valentine
Route des Camoins
Route des Quatre Saisons aux Camoins
Route des Trois Lucs à la Valentine
Route du Rove
Route Léon Lachamp
Rue Albert Cohen
Rue Albert Einstein
Rue Alphonse Daudet
Rue Augustin Aubert
Rue Aviateur Le Brix
Rue Berthe Sylva
Rue Berthelot
Rue Caisserie
Rue Capitaine Dessemond
Rue Cargo Rhin Fidelity
Rue Charles Kaddouz
Rue Colbert
Rue Condorcet
Rue d'Aix
Rue d'Endoume
Rue de l'Audience
Rue de la Guadeloupe
Rue de la Maurelle
Rue de la Pointe à Pitre
Rue de la République
Rue de Lodi
Rue de Lyon
Rue de Rome
Rue des Catalans
Rue des Trois Frères Barthélémy
Rue Devilliers
Rue du Bois Sacré
Rue du Cambodge
Rue du Commandant Rolland
Rue du Docteur Gabriel Bertrand
Rue du Docteur Léon Perrin
Rue du Professeur Roger Luccioni
Rue du Vallon de Montebello
Rue Emmanuel Eydoux
Rue Fortuné Chaillan
Rue George
Rue Hrant Dink
Rue Jean Quiellau
Rue Le Chatelier
Rue Léon Bancal
Rue Loubon
Rue Louis Rège
Rue Marius Briata
Rue Méry
Rue Monte Cristo
Rue Nicolas Appert
Rue Paradis
Rue Pierre Béranger
Rue Pierre Doize
Rue Pierre Mouren
Rue Raymond Teisseire
Rue Saint-Cassien
Rue Saint-Jean du Désert
Rue Saint-Pierre
Rue Vauban
Rue Verdillon
Square Stalingrad
Traverse du Pradel
Tunnel de la Joliette
Tunnel de la Major
Tunnel de Saint-Loup
Tunnel du Prado Carénage
Tunnel du Vieux-Port
Tunnel Prado Sud
Viaduc de Storione
Rue Dumont d'Urville
Rue Antoine Pons
Rue de l'Eguier
Boulevard Louis Botinelly
Rue Pierre Dravet
Traverse de la Montre
Rue André Verdilhan
Avenue Louis Régis
Boulevard Sainte-Germaine
Boulevard Gemy
Boulevard Guigou
Avenue Vaudoyer
Avenue de Delphes
Boulevard Amédée Autran
Boulevard Bompard
Place du Quatre Septembre
Boulevard Marius Thomas
Boulevard Gaston Ramon
Boulevard de la Pugette
Avenue Mistral
Avenue de Montredon
Rue du Docteur Zamenhof
Boulevard Laveran
Boulevard Achille Marcel
Avenue Comtesse Lily Pastré
Viaduc d'Arenc
Viaduc de Plombières
Rue D'Anthoine"""

main_streets = [s.lower().strip() for s in streets.split('\n') if s.strip()]
# remove duplicates
main_streets = list(set(main_streets))

with open('data_rules.js', 'r') as f:
    content = f.read()

# Replace MAIN_STREET_NAMES=new Set([...])
pattern = r'MAIN_STREET_NAMES=new Set\(\[.*?\]\)'
# json.dumps gives us double quoted strings
replacement = 'MAIN_STREET_NAMES=new Set([' + ','.join(json.dumps(s) for s in main_streets) + '])'

new_content = re.sub(pattern, replacement, content)

with open('data_rules.js', 'w') as f:
    f.write(new_content)

print("Updated data_rules.js with new main streets!")
