# 🌱 Mini Serre — Mode Manuel & Automatique

Application simple, sans IA, compatible n'importe quelle plante.

## Démarrage rapide

```bash
pip install -r requirements.txt
python app.py
# Ouvrir http://localhost:5000
```

## Matériel

- Capteur d'humidité du sol (A0)
- DHT11 — température + humidité air (Digital 2)
- Pompe + relais (Digital 8)
- Servo couvercle (Digital 9)
- Ventilateur + relais (Digital 10)
- Battery Holder Case (alimentation pompe/ventilateur)

## Documentation complète

Voir `Guide_App_Serre_Simple.docx` pour le guide détaillé d'installation, de câblage et d'utilisation.

## 📱 Installer comme app mobile (PWA)

Ce dashboard est maintenant une **PWA** (Progressive Web App) : pas de store, pas de build natif, juste une icône sur l'écran d'accueil.

1. Lance le serveur sur ton PC : `python app.py`
2. Note l'adresse IP locale du PC (ex. `192.168.1.42`) — même réseau Wi-Fi que le téléphone
3. Sur le téléphone, ouvre `http://192.168.1.42:5000` dans le navigateur
4. **Android (Chrome)** : menu ⋮ → "Ajouter à l'écran d'accueil" (ou bannière "Installer" automatique)
5. **iPhone (Safari)** : bouton Partager → "Sur l'écran d'accueil"

L'app s'ouvre alors en plein écran, sans barre d'adresse, avec sa propre icône — comme une vraie app installée, mais toujours connectée à ton serveur Flask local. Rien n'est publié ni distribué : usage local pour la démo/soutenance du projet.
