from mesa.discrete_space import CellAgent, FixedAgent
from enum import Enum

# ============================================
# JERARQUÍA DE ESTADOS (2 NIVELES)
# ============================================

class MainState(Enum):
    """Estados principales del agente Car (Nivel 1)"""
    ACTIVE = "active"      # El carro está activo y navegando
    ARRIVED = "arrived"    # El carro llegó a su destino (estado final)

class NavigatingState(Enum):
    """Sub-estados de navegación cuando el carro está ACTIVE (Nivel 2)"""
    MOVING = "moving"                      # Moviéndose normalmente
    WAITING_TRAFFIC_LIGHT = "waiting"      # Esperando en semáforo
    AVOIDING_COLLISION = "avoiding"        # Evitando colisión con otro carro
    BLOCKED = "blocked"                    # Bloqueado, no puede avanzar
    PLANNING_ROUTE = "planning"            # Planificando/recalculando ruta

class Car(CellAgent):
    """
    Agente inteligente que representa un carro.
    Usa una máquina de estados JERÁRQUICA para tomar decisiones.
    Objetivo: Llegar a su destino asignado.
    """
    def __init__(self, model, cell, destination=None):
        """
        Crea un nuevo agente Car inteligente.
        Args:
            model: Referencia al modelo
            cell: Posición inicial del agente
            destination: Celda de destino (agente Destination) asignada al carro
        """
        super().__init__(model)
        self.cell = cell
        self.destination = destination      # Destino asignado desde el inicio
        
        # Estados jerárquicos
        self.main_state = MainState.ACTIVE  # Estado principal (nivel 1)
        self.navigating_state = NavigatingState.MOVING  # Sub-estado (nivel 2)
        
        # Orientación visual del carro (dirección hacia donde "mira")
        self.orientation = "Up"  # Dirección inicial por defecto
        
        self.steps_taken = 0                # Contador de pasos
        self.waiting_time = 0               # Tiempo esperando (para semáforos/colisiones)
        
        # Pathfinding
        self.path = []                      # Lista de posiciones (x, y) del camino
        self.path_index = 0                 # Índice actual en el path
        
        # Calcular path inicial si hay destino
        if self.destination:
            self._calculate_path()
        
    # ============================================
    # MÉTODOS DE GESTIÓN DE ESTADOS
    # ============================================
    
    def is_active(self):
        """Verifica si el carro está en estado ACTIVE"""
        return self.main_state == MainState.ACTIVE
    
    def is_arrived(self):
        """Verifica si el carro llegó a su destino"""
        return self.main_state == MainState.ARRIVED
    
    def is_moving(self):
        """Verifica si el carro está moviéndose"""
        return self.is_active() and self.navigating_state == NavigatingState.MOVING
    
    def is_waiting(self):
        """Verifica si el carro está esperando (semáforo o colisión)"""
        return self.is_active() and self.navigating_state in [
            NavigatingState.WAITING_TRAFFIC_LIGHT,
            NavigatingState.AVOIDING_COLLISION
        ]
    
    def transition_to_arrived(self):
        """Transición al estado final ARRIVED"""
        self.main_state = MainState.ARRIVED
        self.navigating_state = None  # No hay sub-estado cuando está ARRIVED
        print(f"🏁 Carro llegó a destino en {self.cell.coordinate}")
        self.model.carsarrived += 1
        self.model.carsinmap -= 1
        self.remove()  # Auto-eliminación para liberar espacio
    
    def transition_navigating_state(self, new_state):
        """
        Transición a un nuevo sub-estado de navegación.
        Solo válido si el estado principal es ACTIVE.
        """
        if self.is_active():
            self.navigating_state = new_state
            if new_state in [NavigatingState.WAITING_TRAFFIC_LIGHT, 
                           NavigatingState.AVOIDING_COLLISION,
                           NavigatingState.BLOCKED]:
                self.waiting_time += 1
            else:
                self.waiting_time = 0
    
    def get_current_state_description(self):
        """Retorna una descripción legible del estado actual"""
        if self.is_arrived():
            return f"ARRIVED at destination"
        else:
            return f"ACTIVE → {self.navigating_state.value}"
    
    def _calculate_path(self):
        """
        Calcula path usando A* permitiendo giros y cambios de carril inteligentes.
        """
        if not self.destination:
            return
        
        import heapq
        
        start = self.cell.coordinate
        goal = self.destination.cell.coordinate
        
        # A* básico
        open_set = [(0, start)]
        came_from = {}
        g_score = {start: 0}
        
        # Mapa de direcciones a deltas (dx, dy)
        direction_deltas = {
            "Right": (1, 0),
            "Left": (-1, 0),
            "Up": (0, 1),
            "Down": (0, -1)
        }
        
        # Mapa de opuestos para evitar ir en contraflujo
        opposites = {
            "Right": "Left",
            "Left": "Right",
            "Up": "Down",
            "Down": "Up"
        }
        
        while open_set:
            _, current = heapq.heappop(open_set)
            
            if current == goal:
                # Reconstruir path
                self.path = []
                while current in came_from:
                    self.path.append(current)
                    current = came_from[current]
                self.path.reverse()
                self.path_index = 0
                return
            
            # Obtener celda actual y su dirección
            current_cell = self.model.grid[current]
            current_road = next((a for a in current_cell.agents if isinstance(a, Road)), None)
            
            # Determinar vecinos candidatos (Frente, Izquierda, Derecha)
            # No permitimos "Atrás" (U-turn)
            candidates = []
            if current_road:
                # Vectores de movimiento
                forward = direction_deltas.get(current_road.direction, (0,0))
                
                if current_road.direction in ["Right", "Left"]:
                    sides = [(0, 1), (0, -1)] # Up, Down
                else:
                    sides = [(1, 0), (-1, 0)] # Right, Left
                
                # Agregar Frente
                candidates.append(forward)
                # Agregar Lados (Giros/Cambios de carril)
                candidates.extend(sides)
            else:
                # Si no hay carretera definida, probar todo
                candidates = [(0,1), (0,-1), (1,0), (-1,0)]

            # Evaluar candidatos
            for dx, dy in candidates:
                neighbor = (current[0] + dx, current[1] + dy)
                
                # 1. Verificar límites
                if not (0 <= neighbor[0] < self.model.grid.dimensions[0] and
                        0 <= neighbor[1] < self.model.grid.dimensions[1]):
                    continue
                
                # 2. Verificar contenido
                neighbor_cell = self.model.grid[neighbor]
                neighbor_road = next((a for a in neighbor_cell.agents if isinstance(a, Road)), None)
                is_dest = any(isinstance(a, Destination) for a in neighbor_cell.agents)
                
                if not (neighbor_road or is_dest):
                    continue
                
                # 3. VALIDACIÓN DE SENTIDO (Crucial)
                # Si es una carretera, verificar que no entremos en sentido contrario
                if neighbor_road:
                    # Determinar la dirección de MI movimiento
                    move_direction = None
                    if dx == 1: move_direction = "Right"
                    elif dx == -1: move_direction = "Left"
                    elif dy == 1: move_direction = "Up"
                    elif dy == -1: move_direction = "Down"
                    
                    # Si la carretera vecina va en dirección OPUESTA a mi movimiento, es inválido
                    # Ej: Me muevo a la Derecha (Right) y la calle es Izquierda (<) -> CHOQUE
                    if neighbor_road.direction == opposites.get(move_direction):
                        continue
                
                # Si pasa todas las pruebas, es un vecino válido
                tentative_g = g_score[current] + 1
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score = tentative_g + abs(neighbor[0]-goal[0]) + abs(neighbor[1]-goal[1])
                    heapq.heappush(open_set, (f_score, neighbor))
        
    def perceive_environment(self):
        """
        Percibe el entorno del carro.
        Returns:
            dict con información del entorno: {
                'road': agente Road en la celda actual,
                'traffic_light': agente Traffic_Light en la SIGUIENTE celda,
                'cars_ahead': lista de carros en la siguiente celda,
                'next_cell': siguiente celda según la dirección de la carretera
            }
        """
        perception = {
            'road': None,
            'traffic_light': None,
            'cars_ahead': [],
            'next_cell': None
        }
        
        # Percibir carretera en la celda actual
        for agent in self.cell.agents:
            if isinstance(agent, Road):
                perception['road'] = agent
                break
        
        # NUEVO: Usar path si existe
        if self.path and self.path_index < len(self.path):
            next_pos = self.path[self.path_index]
            perception['next_cell'] = self.model.grid[next_pos]
        elif perception['road']:
            # Fallback: usar dirección de la carretera si no hay path
            next_pos = self._calculate_next_position(perception['road'].direction)
            if next_pos:
                perception['next_cell'] = self.model.grid[next_pos]
        
        # Percibir agentes en la SIGUIENTE celda
        if perception['next_cell']:
            for agent in perception['next_cell'].agents:
                if isinstance(agent, Car):
                    perception['cars_ahead'].append(agent)
                elif isinstance(agent, Traffic_Light):
                    # Detectar semáforo en la siguiente celda
                    perception['traffic_light'] = agent
        
        return perception
    
    def _calculate_next_position(self, direction):
        """
        Calcula la siguiente posición según la dirección.
        Args:
            direction: Dirección de movimiento ("Up", "Down", "Left", "Right")
        Returns:
            Tupla (x, y) con la siguiente posición, o None si está fuera del grid
        """
        current_pos = self.cell.coordinate
        next_pos = None
        
        if direction == "Up":
            next_pos = (current_pos[0], current_pos[1] + 1)
        elif direction == "Down":
            next_pos = (current_pos[0], current_pos[1] - 1)
        elif direction == "Right":
            next_pos = (current_pos[0] + 1, current_pos[1])
        elif direction == "Left":
            next_pos = (current_pos[0] - 1, current_pos[1])
        
        # Verificar límites del grid
        if next_pos:
            if (next_pos[0] < 0 or next_pos[0] >= self.model.grid.dimensions[0] or
                next_pos[1] < 0 or next_pos[1] >= self.model.grid.dimensions[1]):
                return None
        
        return next_pos
    
    def _get_alternative_directions(self, current_direction):
        """
        Obtiene direcciones alternativas para cambio de carril.
        Args:
            current_direction: Dirección actual ("Up", "Down", "Left", "Right")
        Returns:
            Lista de direcciones alternativas perpendiculares a la actual
        """
        alternatives = {
            "Up": ["Left", "Right"],
            "Down": ["Left", "Right"],
            "Left": ["Up", "Down"],
            "Right": ["Up", "Down"]
        }
        return alternatives.get(current_direction, [])
    
    def _try_lane_change(self, perception):
        """
        Intenta cambiar de carril aleatoriamente.
        Returns:
            Celda alternativa si el cambio es posible, None si no
        """
        if perception['road'] is None:
            return None
        
        # Obtener direcciones alternativas
        alternatives = self._get_alternative_directions(perception['road'].direction)
        
        # Mezclar aleatoriamente
        self.model.random.shuffle(alternatives)
        
        # Intentar cada dirección alternativa
        for alt_direction in alternatives:
            alt_pos = self._calculate_next_position(alt_direction)
            if alt_pos:
                alt_cell = self.model.grid[alt_pos]
                # Verificar que haya carretera y no haya carros
                if self._has_road(alt_cell):
                    # Verificar que no haya carros en esa celda
                    has_car = False
                    for agent in alt_cell.agents:
                        if isinstance(agent, Car):
                            has_car = True
                            break
                    if not has_car:
                        return alt_cell
        
        return None
    
    def _has_road(self, cell):
        """
        Verifica si una celda tiene un agente Road.
        Args:
            cell: Celda a verificar
        Returns:
            True si hay carretera, False en caso contrario
        """
        for agent in cell.agents:
            if isinstance(agent, Road):
                return True
        return False
    
    def _is_at_destination(self):
        """
        Verifica si el carro llegó a su destino.
        Returns:
            True si está en el destino, False en caso contrario
        """
        if self.destination is None:
            return False
        
        for agent in self.cell.agents:
            if isinstance(agent, Destination) and agent == self.destination:
                return True
        return False
    
    def decide_action(self, perception):
        """
        Decide la acción a tomar basándose en la JERARQUÍA DE ESTADOS y la percepción.
        
        Jerarquía de decisión:
        1. Nivel Principal: ¿ACTIVE o ARRIVED?
        2. Nivel Navegación: ¿MOVING, WAITING, AVOIDING, BLOCKED?
        
        Args:
            perception: Diccionario con información del entorno
        Returns:
            Acción a ejecutar: 'move', 'wait', o 'stop'
        """
        # ============================================
        # NIVEL 1: VERIFICAR ESTADO PRINCIPAL
        # ============================================
        
        # Prioridad 1: Verificar si llegó al destino
        if self._is_at_destination():
            self.transition_to_arrived()
            return 'stop'
        
        # Si ya llegó, no hacer nada
        if self.is_arrived():
            return 'stop'
        
        # ============================================
        # NIVEL 2: ESTADO ACTIVE - EVALUAR SUB-ESTADOS
        # ============================================
        
        # Prioridad 2: Verificar que esté en una carretera
        if perception['road'] is None:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        # Prioridad 3: Verificar que haya una siguiente celda válida
        if perception['next_cell'] is None:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        # Prioridad 4: Verificar que la siguiente celda tenga carretera O sea mi destino
        is_my_destination = False
        if self.destination and perception['next_cell']:
            for agent in perception['next_cell'].agents:
                if agent == self.destination:
                    is_my_destination = True
                    break
        
        if not self._has_road(perception['next_cell']) and not is_my_destination:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        # Prioridad 5: Respetar semáforos
        # Si hay semáforo en la siguiente celda, verificar su estado
        if perception['traffic_light'] is not None:
            # Semáforo en ROJO (False) → Esperar
            if perception['traffic_light'].state == False:
                self.transition_navigating_state(NavigatingState.WAITING_TRAFFIC_LIGHT)
                return 'wait'
            # Semáforo en VERDE (True) → Continuar verificando otras condiciones
            # (no retornar aquí, seguir con las demás verificaciones)
        
        # Prioridad 6: Evitar colisiones - verificar si hay carros adelante
        if len(perception['cars_ahead']) > 0:
            self.transition_navigating_state(NavigatingState.AVOIDING_COLLISION)
            return 'wait'
        
        # ============================================
        # DECISIÓN FINAL: TODO ESTÁ DESPEJADO
        # ============================================
        
        # Si llegamos aquí:
        # - Hay carretera válida
        # - No hay semáforo O el semáforo está en verde
        # - No hay carros adelante
        # → PUEDE MOVERSE
        
        # DESACTIVADO: Cambio aleatorio de carril
        # Causa problemas cuando el carro cambia a una celda sin dirección correcta
        # TODO: Implementar cambio de carril inteligente con pathfinding
        # if self.model.random.random() < 0.2:  # 20% de probabilidad
        #     alt_cell = self._try_lane_change(perception)
        #     if alt_cell is not None:
        #         # Cambio de carril exitoso
        #         perception['next_cell'] = alt_cell
        
        self.transition_navigating_state(NavigatingState.MOVING)
        return 'move'
    
    
    def execute_action(self, action, perception):
        """
        Ejecuta la acción decidida.
        Args:
            action: Acción a ejecutar ('move', 'wait', 'stop')
            perception: Diccionario con información del entorno
        """
        if action == 'move':
            # Calcular orientación antes de moverse
            next_cell = perception['next_cell']
            current_pos = self.cell.coordinate
            next_pos = next_cell.coordinate
            
            dx = next_pos[0] - current_pos[0]
            dy = next_pos[1] - current_pos[1]
            
            # Actualizar orientación según dirección de movimiento
            if dx == 1:
                self.orientation = "Right"
            elif dx == -1:
                self.orientation = "Left"
            elif dy == 1:
                self.orientation = "Up"
            elif dy == -1:
                self.orientation = "Down"
            
            # Moverse a la siguiente celda
            self.cell = next_cell
            self.steps_taken += 1
            
            # NUEVO: Avanzar en el path
            if self.path and self.path_index < len(self.path):
                self.path_index += 1
                
        elif action == 'wait':
            # El carro espera en su posición actual
            pass
        elif action == 'stop':
            # El carro ha llegado a su destino
            pass
            
    def step(self):
        """ 
        Paso de ejecución del agente.
        Sigue el ciclo: Percibir -> Decidir -> Actuar
        """
        # 1. Percibir el entorno
        perception = self.perceive_environment()
        
        # 2. Decidir acción basándose en el estado y la percepción
        action = self.decide_action(perception)
        
        # 3. Ejecutar la acción
        self.execute_action(action, perception)

class Traffic_Light(FixedAgent):
    """
    Traffic light. Where the traffic lights are in the grid.
    """
    def __init__(self, model, cell, state = False, timeToChange = 10):
        """
        Creates a new Traffic light.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            state: Whether the traffic light is green or red
            timeToChange: After how many step should the traffic light change color 
        """
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange
        self.time_remaining = timeToChange  # Tiempo restante hasta el cambio

    def step(self):
        """ 
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        # Calcular tiempo restante
        steps_since_change = self.model.steps % self.timeToChange
        self.time_remaining = self.timeToChange - steps_since_change
        
        # Cambiar estado cuando corresponda
        if self.model.steps % self.timeToChange == 0:
            self.state = not self.state
            self.time_remaining = self.timeToChange
    
    def get_seconds_remaining(self):
        """
        Retorna el número de steps antes del próximo cambio de estado.
        Útil para que los carros tomen decisiones basadas en el tiempo restante.
        """
        return self.time_remaining


class Destination(FixedAgent):
    """
    Destination agent. Where each car should go.
    """
    def __init__(self, model, cell):
        """
        Creates a new destination agent
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Obstacle(FixedAgent):
    """
    Obstacle agent. Just to add obstacles to the grid.
    """
    def __init__(self, model, cell):
        """
        Creates a new obstacle.
        
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Road(FixedAgent):
    """
    Road agent. Determines where the cars can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new road.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction

class Sidewalk(FixedAgent):
    """
    Sidewalk agent. Determines where the pedestrians can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new sidewalk.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction

class PedestrianWalk(FixedAgent):
    """
    PedestrianWalk agent. Determines where the pedestrians can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new PedestrianWalk.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction

