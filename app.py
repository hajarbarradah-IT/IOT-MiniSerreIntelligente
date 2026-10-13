"""
Mini Serre — Dashboard IoT (Mode Manuel + Automatique simple)
Compatible n'importe quelle plante — sans modèle IA
"""

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import serial
import serial.tools.list_ports
import threading
import time
import json
import random
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'serre_simple_2024'
socketio = SocketIO(app, cors_allowed_origins="*")

# ─── Configuration Arduino ────────────────────────────────────────────
# Évite le "None" et mets le vrai port de ton Arduino
ARDUINO_PORT = 'COM5'  # <--- Beddel 'COM3' b l'port dialek l'7aqiqi !
BAUD_RATE = 9600
arduino = None
arduino_connected = False

# ─── État global de la serre ──────────────────────────────────────────
serre_state = {
    "soil": 971,
    "light": 987,
    "temperature": 29.0,
    "humidity": 55.0,
    "pump": False,
    "cover": False,
    "fan": False,
    "lamp": False,
    "auto_mode": False,
    "thresholds": {
        "soil_min": 400,
        "soil_max": 700,
        "temp_max": 30.0,
        "temp_min": 15.0,
        "light_min": 600,
    },
    "timestamp": datetime.now().isoformat(),
    "arduino_status": "disconnected",
}

history = {"soil": [], "light": [], "temperature": [], "humidity": [], "timestamps": []}
activity_log = []

# ─── Détection Arduino ─────────────────────────────────────────────────
def find_arduino_port():
    ports = serial.tools.list_ports.comports()
    for p in ports:
        if any(k in p.description for k in ['Arduino', 'CH340', 'USB Serial', 'ttyUSB', 'ttyACM', 'com', 'COM']):
            return p.device
    if ports:
        return ports[0].device
    return None

def connect_arduino():
    global arduino, arduino_connected, ARDUINO_PORT
    try:
        port = ARDUINO_PORT or find_arduino_port()
        if port:
            if arduino and arduino.is_open:
                arduino.close()
            arduino = serial.Serial(port, BAUD_RATE, timeout=1)
            time.sleep(2) # Attente auto-reset
            arduino_connected = True
            serre_state["arduino_status"] = f"connected:{port}"
            print(f"✅ Arduino connecté sur {port}")
            add_log(f"✅ Arduino connecté sur {port}", "system")
            return True
    except Exception as e:
        print(f"⚠️ Arduino non disponible ({e}) → Mode simulation activé")
    
    arduino_connected = False
    serre_state["arduino_status"] = "simulation"
    add_log("⚠️ Mode simulation activé (Arduino introuvable)", "system")
    return False

# ─── Simulation réaliste (sans Arduino) ───────────────────────────────
_sim = {"soil": 971, "temp": 29.0, "hum": 55.0, "light": 987}

def simulate_data():
    if serre_state["pump"]:
        _sim["soil"] = min(900, _sim["soil"] + random.uniform(15, 30))
    else:
        _sim["soil"] = max(150, _sim["soil"] - random.uniform(1, 4))

    if serre_state["cover"] or serre_state["fan"]:
        _sim["temp"] = max(12, _sim["temp"] - random.uniform(0.1, 0.4))
    else:
        _sim["temp"] = min(40, _sim["temp"] + random.uniform(0.1, 0.3))

    if serre_state["lamp"]:
        _sim["temp"] = min(40, _sim["temp"] + random.uniform(0.0, 0.05))

    _sim["hum"] = max(20, min(95, _sim["hum"] + random.uniform(-1, 1)))
    _sim["light"] = max(0, min(1023, _sim["light"] + random.uniform(-40, 40)))

    return int(_sim["soil"]), int(_sim["light"]), round(_sim["temp"], 1), round(_sim["hum"], 1)

# ─── Logique automatique côté serveur (simulation) ────────────────────
def run_auto_logic_simulation(soil, light, temp, hum):
    if not serre_state["auto_mode"]:
        return
    th = serre_state["thresholds"]
    changed = []

    if soil < th["soil_min"] and not serre_state["pump"]:
        serre_state["pump"] = True
        changed.append("💧 Pompe activée (sol sec)")
    elif soil > th["soil_max"] and serre_state["pump"]:
        serre_state["pump"] = False
        changed.append("💧 Pompe désactivée (sol assez humide)")

    if temp > th["temp_max"]:
        if not serre_state["cover"]:
            serre_state["cover"] = True
            changed.append("🪟 Couvercle ouvert (trop chaud)")
        if not serre_state["fan"]:
            serre_state["fan"] = True
            changed.append("🌀 Ventilateur activé (trop chaud)")
    elif temp < th["temp_min"]:
        if serre_state["cover"]:
            serre_state["cover"] = False
            changed.append("🪟 Couvercle fermé (trop froid)")
        if serre_state["fan"]:
            serre_state["fan"] = False
            changed.append("🌀 Ventilateur désactivé (trop froid)")
    else:
        if serre_state["fan"]:
            serre_state["fan"] = False
            changed.append("🌀 Ventilateur désactivé (température OK)")

    if light > th["light_min"] and not serre_state["lamp"]:
        serre_state["lamp"] = True
        changed.append("💡 Lampe allumée (luminosité élevée détectée)")
    elif light <= th["light_min"] and serre_state["lamp"]:
        serre_state["lamp"] = False
        changed.append("💡 Lampe éteinte (luminosité redescendue)")

    for c in changed:
        add_log(c, "auto")

def add_log(msg, kind="info"):
    activity_log.insert(0, {"msg": msg, "time": datetime.now().strftime('%H:%M:%S'), "kind": kind})
    del activity_log[20:]

# ─── Lecture / boucle principale ──────────────────────────────────────
def read_loop():
    global serre_state, history
    while True:
        try:
            if arduino_connected and arduino:
                if arduino.in_waiting:
                    line = arduino.readline().decode('utf-8', errors='ignore').strip()
                    if line.startswith('{'):
                        data = json.loads(line)
                        serre_state["soil"] = int(data.get("soil", serre_state["soil"]))
                        serre_state["light"] = int(data.get("light", serre_state["light"]))
                        serre_state["temperature"] = float(data.get("temp", serre_state["temperature"]))
                        serre_state["humidity"] = float(data.get("hum", serre_state["humidity"]))
                        serre_state["pump"] = bool(data.get("pump", serre_state["pump"]))
                        serre_state["cover"] = bool(data.get("cover", serre_state["cover"]))
                        serre_state["fan"] = bool(data.get("fan", serre_state["fan"]))
                        serre_state["lamp"] = bool(data.get("lamp", serre_state["lamp"]))
                        serre_state["auto_mode"] = bool(data.get("auto", serre_state["auto_mode"]))
                        if "soilMin" in data: serre_state["thresholds"]["soil_min"] = data["soilMin"]
                        if "soilMax" in data: serre_state["thresholds"]["soil_max"] = data["soilMax"]
                        if "tempMax" in data: serre_state["thresholds"]["temp_max"] = data["tempMax"]
                        if "tempMin" in data: serre_state["thresholds"]["temp_min"] = data["tempMin"]
                        if "lightMin" in data: serre_state["thresholds"]["light_min"] = data["lightMin"]
                        
                        update_history(serre_state["soil"], serre_state["light"], serre_state["temperature"], serre_state["humidity"])
            else:
                soil, light, temp, hum = simulate_data()
                serre_state["soil"] = soil
                serre_state["light"] = light
                serre_state["temperature"] = temp
                serre_state["humidity"] = hum
                update_history(soil, light, temp, hum)
                run_auto_logic_simulation(soil, light, temp, hum)

            serre_state["timestamp"] = datetime.now().isoformat()
            socketio.emit('sensor_update', serre_state)
            socketio.emit('log_update', activity_log[:10])

        except Exception as e:
            print(f"Erreur lecture: {e}")

        time.sleep(1)

def update_history(soil, light, temp, hum):
    now = datetime.now().strftime('%H:%M:%S')
    for k, v in [("soil", soil), ("light", light), ("temperature", temp), ("humidity", hum)]:
        history[k].append(v)
        if len(history[k]) > 50: history[k].pop(0)
    history["timestamps"].append(now)
    if len(history["timestamps"]) > 50: history["timestamps"].pop(0)

def send_command(cmd: str):
    global arduino, arduino_connected
    if arduino_connected and arduino:
        try:
            print(f"✈️ Envoi commande: {cmd}")
            arduino.write(f"{cmd}\n".encode('utf-8'))
            arduino.flush()  # <--- Très important pour forcer l'envoi direct !
            return True
        except Exception as e:
            print(f"Erreur envoi commande: {e}")
    return False

# ─── Routes Flask ───────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/state')
def get_state():
    return jsonify(serre_state)

@app.route('/api/history')
def get_history():
    return jsonify(history)

@app.route('/api/log')
def get_log():
    return jsonify(activity_log)

@app.route('/api/control', methods=['POST'])
def control():
    if serre_state["auto_mode"]:
        return jsonify({"status": "error", "message": "Désactivez le mode automatique pour contrôler manuellement"}), 403

    action = request.json.get('action')
    table = {
        'pump_on':     ("pump",   True,  "IRR_ON",      "💧 Pompe activée manuellement"),
        'pump_off':    ("pump",   False, "IRR_OFF",     "💧 Pompe désactivée manuellement"),
        'cover_open':  ("cover",  True,  "COVER_OPEN",  "🪟 Couvercle ouvert manuellement"),
        'cover_close': ("cover",  False, "COVER_CLOSE", "🪟 Couvercle fermé manuellement"),
        'fan_on':      ("fan",    True,  "FAN_ON",      "🌀 Ventilateur activé manuellement"),
        'fan_off':     ("fan",    False, "FAN_OFF",     "🌀 Ventilateur désactivé manuellement"),
        'lamp_on':     ("lamp",   True,  "LAMP_ON",     "💡 Lampe activée manuellement"),
        'lamp_off':    ("lamp",   False, "LAMP_OFF",    "💡 Lampe désactivée manuellement"),
    }
    if action not in table:
        return jsonify({"status": "error", "message": "Action inconnue"}), 400

    key, val, cmd, msg = table[action]
    serre_state[key] = val
    send_command(cmd)
    add_log(msg, "manual")
    socketio.emit('sensor_update', serre_state)
    socketio.emit('log_update', activity_log[:10])
    return jsonify({"status": "ok", "message": msg, "state": serre_state})

@app.route('/api/auto', methods=['POST'])
def toggle_auto():
    enabled = bool(request.json.get('enabled', False))
    serre_state["auto_mode"] = enabled
    send_command(f"SET_AUTO:{1 if enabled else 0}")
    add_log("🤖 Mode automatique activé" if enabled else "🖐️ Mode manuel activé", "system")
    socketio.emit('sensor_update', serre_state)
    socketio.emit('log_update', activity_log[:10])
    return jsonify({"status": "ok", "auto_mode": enabled})

@app.route('/api/thresholds', methods=['POST'])
def update_thresholds():
    data = request.json
    th = serre_state["thresholds"]
    if "soil_min" in data:
        th["soil_min"] = int(data["soil_min"]); send_command(f"SET_SOIL_MIN:{th['soil_min']}")
    if "soil_max" in data:
        th["soil_max"] = int(data["soil_max"]); send_command(f"SET_SOIL_MAX:{th['soil_max']}")
    if "temp_max" in data:
        th["temp_max"] = float(data["temp_max"]); send_command(f"SET_TEMP_MAX:{th['temp_max']}")
    if "temp_min" in data:
        th["temp_min"] = float(data["temp_min"]); send_command(f"SET_TEMP_MIN:{th['temp_min']}")
    if "light_min" in data:
        th["light_min"] = int(data["light_min"]); send_command(f"SET_LIGHT_MIN:{th['light_min']}")
    add_log("⚙️ Seuils mis à jour", "system")
    socketio.emit('sensor_update', serre_state)
    return jsonify({"status": "ok", "thresholds": th})

@socketio.on('connect')
def on_connect():
    emit('sensor_update', serre_state)
    emit('history_update', history)
    emit('log_update', activity_log[:10])

if __name__ == '__main__':
    connect_arduino()
    threading.Thread(target=read_loop, daemon=True).start()
    print("🌿 Dashboard Serre (mode simple) démarré → http://localhost:5000")
    socketio.run(app, debug=False, host='0.0.0.0', port=5000)