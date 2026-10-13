/*
 * ═══════════════════════════════════════════════════════════
 * MINI SERRE — Contrôleur Arduino (OneWire DS18B20 + LCD I2C)
 * Compatible à 100% avec l'application Python/Flask
 * ═══════════════════════════════════════════════════════════
 */

#include <Wire.h> 
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Servo.h> 
#include <ArduinoJson.h> // <--- Pour communiquer avec Python

// Configuration du capteur de température (Pin 4)
OneWire oneWire(4);
DallasTemperature sensors(&oneWire);

// Déclaration de l'écran LCD (Adresse standard 0x27)
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// Déclaration du servo-moteur pour la porte
Servo myservo; 

// Définition des Pins du matériel (Idem à ton code)
const int moisturePin = A0; 
const int ldrPin = A1;      
const int pumpRelay = 2;    // Relais 1 : Pompe à eau
const int lampRelay = 3;    // Relais 2 : Lampe
const int fanRelay = 5;     // Relais 3 : Ventilateur
const int servoPin = 6;     // Signal du Servo-moteur (Porte)

// ── États actionneurs (Pour le mode Manuel / Auto) ───────────────────
bool pumpOn   = false;
bool coverOn  = false;   // false = fermé (0°), true = ouvert (90°)
bool fanOn    = false;
bool lampOn   = false;
bool autoMode = false;   // false = manuel, true = automatique

// ── Dernières valeurs capteurs ──────────────────────────────────────
int   lastSoil  = 0;
int   lastLight = 0;
float lastTemp  = 0.0;

// ── Seuils par défaut (Utilisés si le mode Auto est activé) ──────────
int   soilMin   = 400;   // Ton seuil était à 600 dans ton code
int   soilMax   = 700;   
float tempMax   = 25.0;  // Ta température seuil
float tempMin   = 18.0;  
int   lightMin  = 500;   // Seuil LDR (ajusté pour l'app)

// ── Temporisation envoi JSON ─────────────────────────────────────────
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 1000; // Envoi chaque seconde

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(50); // <--- Très important pour la rapidité !

  // Configuration des relais en SORTIE
  pinMode(pumpRelay, OUTPUT);
  pinMode(lampRelay, OUTPUT);
  pinMode(fanRelay, OUTPUT);
  
  // Éteindre tous les relais au démarrage (HIGH = Éteint)
  digitalWrite(pumpRelay, HIGH);
  digitalWrite(lampRelay, HIGH);
  digitalWrite(fanRelay, HIGH); 
  
  // Attacher le servo-moteur et fermer la porte (0 degré)
  myservo.attach(servoPin); 
  myservo.write(0);         
  
  // Initialisation des capteurs et de l'écran
  sensors.begin();
  lcd.init();         
  lcd.backlight();
  lcd.clear();
  
  lcd.setCursor(0, 0);
  lcd.print("  SERRE CONNECTE ");
  delay(1500);
  lcd.clear();
}

void loop() {
  readSerialCommands(); // 1. Lit les ordres manuels de l'app Python
  readSensors();        // 2. Lit les capteurs

  if (autoMode) {
    runAutoLogic();     // 3. Si Auto activé -> utilise la logique automatique
  } else {
    applyManualStates(); // 4. Si Manuel -> applique ce qu'on clique sur le PC
  }

  // 5. Envoi au PC + Affichage LCD chaque seconde
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    sendDataToFlask();
    updateLCD();
    lastSendTime = millis();
  }
}

void readSensors() {
  lastSoil = analogRead(moisturePin); 
  lastLight = analogRead(ldrPin); 
  
  sensors.requestTemperatures(); 
  float t = sensors.getTempCByIndex(0); 
  if (t > -50.0 && t < 80.0) { // Éviter les valeurs aberrantes au démarrage
    lastTemp = t;
  }
}

// Applique les états cliqués sur l'interface Flask f l-mode Manuel
void applyManualStates() {
  digitalWrite(pumpRelay, pumpOn ? LOW : HIGH);
  digitalWrite(lampRelay, lampOn ? LOW : HIGH);
  digitalWrite(fanRelay, fanOn ? LOW : HIGH);
  myservo.write(coverOn ? 90 : 0);
}

// Logique auto quand on coche "Mode Automatique" dans l'application
void runAutoLogic() {
  // Pompe (Humidité du sol)
  if (lastSoil > 600) { // Idem à ton code : si sol sec (valeur élevée = sec)
    digitalWrite(pumpRelay, LOW);
    pumpOn = true;
  } else {
    digitalWrite(pumpRelay, HIGH);
    pumpOn = false;
  }

  // Lampe (Lumière)
  if (lastLight < 2000) { // Idem à ton code
    digitalWrite(lampRelay, LOW);
    lampOn = true;
  } else {
    digitalWrite(lampRelay, HIGH);
    lampOn = false;
  }

  // Ventilateur + Porte (Température)
  if (lastTemp > tempMax) {
    digitalWrite(fanRelay, LOW);
    myservo.write(90);
    fanOn = true;
    coverOn = true;
  } else {
    digitalWrite(fanRelay, HIGH);
    myservo.write(0);
    fanOn = false;
    coverOn = false;
  }
}

void readSerialCommands() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    // Mode Manuel - Commandes reçues de Flask
    if (cmd == "IRR_ON")        { pumpOn = true; }
    else if (cmd == "IRR_OFF")   { pumpOn = false; }
    else if (cmd == "COVER_OPEN")  { coverOn = true; }
    else if (cmd == "COVER_CLOSE") { coverOn = false; }
    else if (cmd == "FAN_ON")   { fanOn = true; }
    else if (cmd == "FAN_OFF")  { fanOn = false; }
    else if (cmd == "LAMP_ON")  { lampOn = true; }
    else if (cmd == "LAMP_OFF") { lampOn = false; }
    
    // Mode Auto Toggle
    else if (cmd == "SET_AUTO:1") { autoMode = true; }
    else if (cmd == "SET_AUTO:0") { autoMode = false; }
    
    // Seuils reçus de l'interface
    else if (cmd.startsWith("SET_SOIL_MIN:")) soilMin = cmd.substring(13).toInt();
    else if (cmd.startsWith("SET_SOIL_MAX:")) soilMax = cmd.substring(13).toInt();
    else if (cmd.startsWith("SET_TEMP_MAX:")) tempMax = cmd.substring(13).toFloat();
    else if (cmd.startsWith("SET_TEMP_MIN:")) tempMin = cmd.substring(13).toFloat();
  }
}

void updateLCD() {
  lcd.clear();
  // Ligne 1 : Température et Sol
  lcd.setCursor(0, 0);
  lcd.print("T:"); lcd.print(lastTemp, 1); lcd.print("C ");
  lcd.print("Sol:"); lcd.print(lastSoil);
  
  // Ligne 2 : Lumière et Mode
  lcd.setCursor(0, 1);
  lcd.print("L:"); lcd.print(lastLight);
  
  lcd.setCursor(12, 1);
  lcd.print(autoMode ? "Auto" : "Manu");
}

void sendDataToFlask() {
  StaticJsonDocument<256> doc;
  doc["soil"]  = lastSoil;
  doc["light"] = lastLight;
  doc["temp"]  = round(lastTemp * 10.0) / 10.0;
  doc["hum"]   = 0.0; // Pas de capteur d'humidité d'air dans ton setup
  doc["pump"]  = pumpOn;
  doc["cover"] = coverOn;
  doc["fan"]   = fanOn;
  doc["lamp"]  = lampOn;
  doc["auto"]  = autoMode;
  doc["soilMin"] = soilMin;
  doc["soilMax"] = soilMax;
  doc["tempMax"] = tempMax;
  doc["tempMin"] = tempMin;

  serializeJson(doc, Serial);
  Serial.println();
}