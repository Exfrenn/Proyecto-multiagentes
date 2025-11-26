# 🚗 Arquitectura del Agente Car Inteligente (v2.0)
## Con Jerarquía de Estados

## 📋 Descripción General

El agente `Car` es un **agente inteligente basado en máquina de estados JERÁRQUICA** que simula el comportamiento de un vehículo autónomo en un entorno urbano. Su objetivo principal es **llegar a su destino asignado** mientras navega por las calles respetando las reglas de tráfico.

---

## 🧠 Arquitectura: Ciclo Percibir-Decidir-Actuar

El agente sigue el paradigma clásico de agentes inteligentes:

```
┌─────────────┐
│  PERCIBIR   │ ← Observa el entorno (carreteras, semáforos, carros)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   DECIDIR   │ ← Toma decisiones basadas en JERARQUÍA DE ESTADOS
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   ACTUAR    │ ← Ejecuta la acción decidida (move/wait/stop)
└─────────────┘
```

---

## 🌳 Jerarquía de Estados (2 Niveles)

### **Nivel 1: Estados Principales (MainState)**

```
┌─────────────────────────────────────────────────────┐
│                    ACTIVE                           │
│  (El carro está activo y navegando)                 │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │    Nivel 2: Sub-estados de Navegación   │       │
│  │    (NavigatingState)                    │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   ARRIVED                           │
│  (Estado final: llegó al destino)                   │
└─────────────────────────────────────────────────────┘
```

### **Nivel 2: Sub-estados de Navegación (NavigatingState)**

Solo válidos cuando `MainState == ACTIVE`:

```
ACTIVE
  │
  ├── MOVING 🚗
  │   └─ Moviéndose normalmente hacia el destino
  │
  ├── WAITING_TRAFFIC_LIGHT 🚦
  │   └─ Esperando que el semáforo cambie a verde
  │
  ├── AVOIDING_COLLISION 🚙
  │   └─ Esperando que el carro adelante se mueva
  │
  ├── BLOCKED 🚧
  │   └─ Bloqueado (sin carretera o fuera del grid)
  │
  └── PLANNING_ROUTE 🗺️
      └─ Planificando/recalculando ruta (futuro)
```

---

## 🎯 Diagrama de Transiciones de Estados

### Nivel 1: Estados Principales

```
┌─────────┐
│  START  │
└────┬────┘
     │
     ▼
┌─────────┐
│ ACTIVE  │──────────────┐
└────┬────┘              │
     │                   │
     │ Llegó al destino  │
     │                   │
     ▼                   │
┌──────────┐             │
│ ARRIVED  │◄────────────┘
└──────────┘
 (FINAL)
```

### Nivel 2: Sub-estados de Navegación (dentro de ACTIVE)

```
                    ┌──────────────────┐
                    │     MOVING       │◄──── Estado por defecto
                    └────┬─────────────┘
                         │
        ┌────────────────┼────────────────┬──────────────┐
        │                │                │              │
        ▼                ▼                ▼              ▼
┌───────────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────┐
│WAITING_TRAFFIC│  │AVOIDING_ │  │   BLOCKED   │  │PLANNING_ │
│    _LIGHT     │  │COLLISION │  │             │  │  ROUTE   │
└───────┬───────┘  └─────┬────┘  └──────┬──────┘  └────┬─────┘
        │                │               │              │
        │                │               │              │
        └────────────────┴───────────────┴──────────────┘
                         │
                         ▼
                  Cuando se despeja
                  el obstáculo
                         │
                         ▼
                    ┌─────────┐
                    │ MOVING  │
                    └─────────┘
```

---

## 🔍 Percepción del Entorno

El método `perceive_environment()` permite al agente observar:

```python
{
    'road': Road,                    # Agente Road en la celda actual
    'traffic_light': Traffic_Light,  # Semáforo en la celda (si existe)
    'cars_ahead': [Car, ...],        # Lista de carros en la siguiente celda
    'next_cell': Cell                # Siguiente celda según dirección
}
```

### Capacidades de Percepción:
- ✅ Detecta si está en una carretera
- ✅ Identifica la dirección de la carretera
- ✅ Percibe semáforos en su celda
- ✅ Detecta otros carros adelante (evita colisiones)
- ✅ Calcula la siguiente celda válida

---

## 🧩 Toma de Decisiones con Jerarquía

El método `decide_action()` implementa la lógica de decisión jerárquica:

### **Jerarquía de Prioridades** (de mayor a menor):

```
┌─────────────────────────────────────────────────────┐
│ NIVEL 1: ESTADO PRINCIPAL                          │
├─────────────────────────────────────────────────────┤
│ 1️⃣ ¿Llegué al destino?                              │
│    SÍ → Transición a ARRIVED → stop                │
│    NO → Continuar al Nivel 2                       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ NIVEL 2: SUB-ESTADOS DE NAVEGACIÓN (si ACTIVE)     │
├─────────────────────────────────────────────────────┤
│ 2️⃣ ¿Estoy en una carretera?                         │
│    NO → BLOCKED → wait                             │
│                                                     │
│ 3️⃣ ¿Hay siguiente celda válida?                     │
│    NO → BLOCKED → wait                             │
│                                                     │
│ 4️⃣ ¿La siguiente celda tiene carretera?             │
│    NO → BLOCKED → wait                             │
│                                                     │
│ 5️⃣ ¿Hay carros adelante?                            │
│    SÍ → AVOIDING_COLLISION → wait                  │
│                                                     │
│ 6️⃣ ¿Hay semáforo en rojo?                           │
│    SÍ → WAITING_TRAFFIC_LIGHT → wait (TODO)        │
│                                                     │
│ ✅ Todo despejado → MOVING → move                   │
└─────────────────────────────────────────────────────┘
```

### Acciones Posibles:
- **`move`**: Moverse a la siguiente celda
- **`wait`**: Esperar en la posición actual
- **`stop`**: No hacer nada (estado final ARRIVED)

---

## ⚙️ Métodos de Gestión de Estados

### Métodos de Consulta (Getters):

```python
car.is_active()      # ¿Está en estado ACTIVE?
car.is_arrived()     # ¿Llegó al destino?
car.is_moving()      # ¿Está moviéndose? (ACTIVE + MOVING)
car.is_waiting()     # ¿Está esperando? (ACTIVE + WAITING/AVOIDING)
```

### Métodos de Transición:

```python
car.transition_to_arrived()              # ACTIVE → ARRIVED
car.transition_navigating_state(state)   # Cambiar sub-estado
car.get_current_state_description()      # Descripción legible
```

---

## 📊 Atributos del Agente

```python
class Car(CellAgent):
    # Posición y destino
    self.cell           # Celda actual (posición)
    self.destination    # Destino asignado (agente Destination)
    
    # Estados jerárquicos
    self.main_state         # Estado principal (MainState)
    self.navigating_state   # Sub-estado (NavigatingState)
    
    # Métricas
    self.steps_taken    # Contador de pasos dados
    self.waiting_time   # Tiempo esperando (semáforos/colisiones)
```

---

## 🚀 Funcionalidad Actual (v2.0)

### ✅ Implementado:

#### Jerarquía de Estados:
- [x] **Nivel 1**: MainState (ACTIVE, ARRIVED)
- [x] **Nivel 2**: NavigatingState (MOVING, WAITING, AVOIDING, BLOCKED, PLANNING)
- [x] Métodos de consulta de estados (`is_active()`, `is_moving()`, etc.)
- [x] Métodos de transición entre estados
- [x] Descripción legible del estado actual

#### Percepción y Decisión:
- [x] Percepción del entorno (carreteras, semáforos, carros)
- [x] Decisión jerárquica con prioridades claras
- [x] Detección de llegada al destino
- [x] **Evitar colisiones** con otros carros (NUEVO)
- [x] Detección de bloqueos (sin carretera válida)
- [x] Validación de movimientos (límites del grid)

#### Movimiento:
- [x] Movimiento según dirección de la carretera
- [x] Asignación aleatoria de destinos
- [x] Contador de pasos y tiempo de espera

### 🔜 Por Implementar (TODOs):

- [ ] **Respetar semáforos** (código comentado, listo para activar)
- [ ] **Algoritmo de pathfinding** (A*, Dijkstra) para encontrar ruta óptima
- [ ] **Manejo de intersecciones** con prioridades
- [ ] **Recalcular ruta** cuando está bloqueado
- [ ] **Estadísticas avanzadas** (tiempo de viaje, eficiencia)
- [ ] **Comunicación entre carros** (V2V)

---

## 🎓 Ventajas de la Jerarquía de Estados

### 1. **Organización Clara** 🗂️
Los estados relacionados están agrupados lógicamente:
- Estados principales: ¿Activo o llegó?
- Sub-estados: ¿Cómo está navegando?

### 2. **Escalabilidad** 📈
Fácil agregar nuevos sub-estados sin afectar la estructura principal:
```python
# Agregar nuevo sub-estado es trivial
class NavigatingState(Enum):
    # ... estados existentes ...
    REVERSING = "reversing"  # Nuevo: retrocediendo
```

### 3. **Prioridades Claras** 🎯
La jerarquía refleja las prioridades de decisión:
1. Primero: ¿Llegué? (nivel principal)
2. Luego: ¿Cómo navego? (nivel secundario)

### 4. **Mantenibilidad** 🔧
Código más limpio y fácil de entender:
```python
if self.is_active() and self.navigating_state == NavigatingState.MOVING:
    # Lógica específica para moverse
```

### 5. **Debugging Facilitado** 🐛
Estado actual es autodescriptivo:
```python
print(car.get_current_state_description())
# Output: "ACTIVE → moving" o "ARRIVED at destination"
```

---

## 🔧 Uso

```python
# Crear un carro con destino asignado
destination = model.destinations[0]
car = Car(model, initial_cell, destination=destination)

# En cada paso de simulación
car.step()  # Percibe → Decide (jerárquicamente) → Actúa

# Consultar estado
if car.is_moving():
    print("El carro se está moviendo")
elif car.is_waiting():
    print(f"El carro está esperando (tiempo: {car.waiting_time})")
elif car.is_arrived():
    print(f"¡Llegó al destino en {car.steps_taken} pasos!")
```

---

## 📈 Ejemplo de Flujo de Estados

```
Paso 1: ACTIVE → MOVING
        ↓ (moviéndose)
        
Paso 2: ACTIVE → MOVING
        ↓ (detecta carro adelante)
        
Paso 3: ACTIVE → AVOIDING_COLLISION
        ↓ (esperando)
        
Paso 4: ACTIVE → AVOIDING_COLLISION
        ↓ (carro se movió)
        
Paso 5: ACTIVE → MOVING
        ↓ (moviéndose)
        
Paso 6: ACTIVE → MOVING
        ↓ (llegó al destino)
        
Paso 7: ARRIVED
        (estado final)
```

---

## 🎯 Próximos Pasos

1. ✅ ~~Implementar jerarquía de estados~~ (COMPLETADO)
2. ⏭️ Activar respeto de semáforos (descomentar código)
3. ⏭️ Implementar algoritmo de pathfinding (A*)
4. ⏭️ Agregar recalculación de ruta cuando está BLOCKED
5. ⏭️ Visualizar estado del agente en la interfaz
6. ⏭️ Métricas de rendimiento y estadísticas

---

## 📝 Notas Técnicas

- **Energía**: Se asume infinita (no hay límite de pasos)
- **Conocimiento**: El carro conoce su destino desde el inicio
- **Percepción**: Local (solo ve su celda y la siguiente)
- **Planificación**: Reactiva (no planifica ruta completa aún)
- **Comunicación**: No hay comunicación entre carros (por ahora)
- **Jerarquía**: 2 niveles (MainState → NavigatingState)

---

## 🏆 Mejoras de v1.0 → v2.0

| Característica | v1.0 | v2.0 |
|----------------|------|------|
| Estados | Planos (3 estados) | Jerárquicos (2 niveles) |
| Evitar colisiones | ❌ | ✅ |
| Tiempo de espera | ❌ | ✅ |
| Métodos de consulta | ❌ | ✅ |
| Prioridades claras | Parcial | ✅ |
| Escalabilidad | Limitada | Alta |
| Descripción de estado | ❌ | ✅ |
