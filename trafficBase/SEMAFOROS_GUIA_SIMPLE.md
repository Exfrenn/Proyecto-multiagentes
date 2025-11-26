# 🚦 Implementación de Semáforos - Guía Simple

## 📋 Resumen

Los carros ahora **respetan los semáforos**. Si un semáforo está en rojo, el carro espera. Si está en verde, puede pasar.

**IMPORTANTE**: El carro detecta el semáforo en la **SIGUIENTE celda** (antes de moverse), no en la celda donde ya está.

---

## 🔴🟢 Cómo Funciona

### **Estado del Semáforo**

```python
traffic_light.state = True   # 🟢 Verde → El carro puede pasar
traffic_light.state = False  # 🔴 Rojo  → El carro debe esperar
```

### **Detección del Semáforo**

```
Celda Actual          Siguiente Celda
┌──────────┐         ┌──────────────┐
│  🚗 Carro │  ────→  │  🚦 Semáforo │
│  Road    │         │  Road        │
└──────────┘         └──────────────┘
     │                      │
     │                      │
     └──── Mira aquí ───────┘
           (percepción)
```

El carro **mira hacia adelante** y detecta el semáforo ANTES de entrar a esa celda.

### **Lógica del Carro**

```python
# En perceive_environment():
# Detecta semáforo en la SIGUIENTE celda
for agent in perception['next_cell'].agents:
    if isinstance(agent, Traffic_Light):
        perception['traffic_light'] = agent

# En decide_action():
if perception['traffic_light'] is not None:
    # Si el semáforo está en rojo (state = False), esperar
    if not perception['traffic_light'].state:
        self.transition_navigating_state(NavigatingState.WAITING_TRAFFIC_LIGHT)
        return 'wait'
    # Si está en verde (state = True), puede continuar
```

---

## 🎯 Comportamiento del Carro

### **Cuando encuentra un semáforo:**

1. **Percibe** si hay un semáforo en su celda actual
2. **Verifica** el estado del semáforo:
   - 🔴 **Rojo** (`state = False`):
     - Cambia a estado `WAITING_TRAFFIC_LIGHT`
     - Ejecuta acción `wait` (se queda en su posición)
     - Incrementa `waiting_time`
   - 🟢 **Verde** (`state = True`):
     - Continúa con las demás verificaciones
     - Si todo está despejado, se mueve

---

## 📊 Jerarquía de Prioridades (Actualizada)

```
1️⃣ ¿Llegué al destino?           → SÍ → ARRIVED → stop
2️⃣ ¿Estoy en carretera?          → NO → BLOCKED → wait
3️⃣ ¿Hay siguiente celda válida?  → NO → BLOCKED → wait
4️⃣ ¿Siguiente tiene carretera?   → NO → BLOCKED → wait
5️⃣ ¿Hay carros adelante?         → SÍ → AVOIDING_COLLISION → wait
6️⃣ ¿Semáforo en rojo? ✨ NUEVO   → SÍ → WAITING_TRAFFIC_LIGHT → wait
7️⃣ Todo despejado                → MOVING → move
```

---

## 🚗 Ejemplo de Ejecución

### **Escenario: Carro se acerca a un semáforo en rojo**

```
Paso 1:
  Posición: (5, 10)
  Estado: ACTIVE → MOVING
  Percepción: Carretera OK, sin semáforo
  Decisión: move
  Resultado: Avanza a (6, 10)

Paso 2:
  Posición: (6, 10)
  Estado: ACTIVE → MOVING
  Percepción: Carretera OK, semáforo en ROJO 🔴
  Decisión: wait
  Resultado: ACTIVE → WAITING_TRAFFIC_LIGHT, waiting_time = 1

Paso 3:
  Posición: (6, 10)  [no se movió]
  Estado: ACTIVE → WAITING_TRAFFIC_LIGHT
  Percepción: Semáforo sigue en ROJO 🔴
  Decisión: wait
  Resultado: Permanece esperando, waiting_time = 2

Paso 4:
  Posición: (6, 10)  [no se movió]
  Estado: ACTIVE → WAITING_TRAFFIC_LIGHT
  Percepción: Semáforo cambió a VERDE 🟢
  Decisión: move
  Resultado: ACTIVE → MOVING, avanza a (7, 10), waiting_time = 0
```

---

## 🔧 Cómo Funciona el Semáforo

### **Clase Traffic_Light**

```python
class Traffic_Light(FixedAgent):
    def __init__(self, model, cell, state=False, timeToChange=10):
        self.state = state           # False = rojo, True = verde
        self.timeToChange = timeToChange  # Cada cuántos pasos cambia
    
    def step(self):
        # Cambia de color cada 'timeToChange' pasos
        if self.model.steps % self.timeToChange == 0:
            self.state = not self.state  # Alterna rojo ↔ verde
```

### **Configuración en el Mapa**

```python
# En model.py, al leer el mapa:

elif col in ["S", "s"]:
    agent = Traffic_Light(
        self,
        cell,
        False if col == "S" else True,  # "S" = rojo, "s" = verde
        int(dataDictionary[col]),       # Tiempo de cambio
    )
```

---

## 📝 Notas Importantes

### **Dirección del Semáforo**

Como mencionaste, el semáforo **NO tiene orientación**. El carro simplemente:
1. Detecta si hay un semáforo en su celda actual
2. Verifica el estado (rojo/verde)
3. Sigue la dirección de la **carretera** (Road) en esa celda

**La dirección viene de la carretera, no del semáforo.**

### **Ubicación del Semáforo**

El semáforo está en la **misma celda** que la carretera:
- Celda tiene: `Road` + `Traffic_Light` (ambos agentes)
- El carro verifica ambos cuando está en esa celda

---

## ✅ Implementación Completada

### **Lo que se hizo:**

1. ✅ Activada la lógica de semáforos (líneas 237-243 en agent.py)
2. ✅ Verificación simple: `if not traffic_light.state`
3. ✅ Transición a estado `WAITING_TRAFFIC_LIGHT`
4. ✅ El carro espera hasta que el semáforo cambie a verde

### **Código agregado:**

```python
# Prioridad 6: Respetar semáforos
if perception['traffic_light'] is not None:
    # Si el semáforo está en rojo (state = False), esperar
    if not perception['traffic_light'].state:
        self.transition_navigating_state(NavigatingState.WAITING_TRAFFIC_LIGHT)
        return 'wait'
    # Si está en verde (state = True), puede continuar
```

**Solo 5 líneas de código.** Simple y efectivo.

---

## 🎮 Prueba la Simulación

Tu servidor está corriendo. Ahora deberías ver:

- 🚗 Carros moviéndose normalmente
- 🔴 Carros deteniéndose en semáforos rojos
- 🟢 Carros pasando cuando el semáforo cambia a verde
- ⏱️ `waiting_time` incrementándose mientras esperan

---

## 🔍 Debugging

### **Para verificar que funciona:**

```python
# En cada paso, puedes imprimir:
print(f"Carro en {car.cell.coordinate}")
print(f"Estado: {car.get_current_state_description()}")
print(f"Tiempo esperando: {car.waiting_time}")

# Si hay semáforo:
if perception['traffic_light']:
    color = "🟢 VERDE" if perception['traffic_light'].state else "🔴 ROJO"
    print(f"Semáforo: {color}")
```

---

## 🎯 Próximos Pasos Posibles

- [ ] Implementar pathfinding (A*) para encontrar ruta óptima
- [ ] Agregar prioridades en intersecciones
- [ ] Visualizar el estado del carro en la interfaz
- [ ] Métricas: tiempo total esperando en semáforos

---

## 📚 Resumen

**Antes:** Carros ignoraban semáforos  
**Ahora:** Carros respetan semáforos (rojo = esperar, verde = pasar)  
**Complejidad:** 5 líneas de código  
**Estado usado:** `WAITING_TRAFFIC_LIGHT`  
**Dirección:** Viene de la carretera (Road), no del semáforo  
