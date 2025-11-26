from mesa.experimental.cell_space import CellAgent, FixedAgent
from enum import Enum
import heapq

class MainState(Enum):
    ACTIVE = "active"
    ARRIVED = "arrived"

class NavigatingState(Enum):
    MOVING = "moving"
    WAITING_TRAFFIC_LIGHT = "waiting"
    AVOIDING_COLLISION = "avoiding"
    BLOCKED = "blocked"
    PLANNING_ROUTE = "planning"

class Car(CellAgent):
    """Intelligent car agent with A* pathfinding and state machine."""
    
    def __init__(self, model, cell, destination=None):
        """Initialize car agent."""
        super().__init__(model)
        self.cell = cell
        self.destination = destination
        self.main_state = MainState.ACTIVE
        self.navigating_state = NavigatingState.MOVING
        self.orientation = "Up"
        self.steps_taken = 0
        self.waiting_time = 0
        self.path = []
        self.path_index = 0
        self.recalculate_path_threshold = 5
        
        if self.destination is not None:
            self.calculate_path_to_destination()
    
    def is_active(self):
        """Check if car is active."""
        return self.main_state == MainState.ACTIVE
    
    def is_arrived(self):
        """Check if car arrived at destination."""
        return self.main_state == MainState.ARRIVED
    
    def is_moving(self):
        """Check if car is moving."""
        return self.is_active() and self.navigating_state == NavigatingState.MOVING
    
    def is_waiting(self):
        """Check if car is waiting."""
        return self.is_active() and self.navigating_state in [
            NavigatingState.WAITING_TRAFFIC_LIGHT,
            NavigatingState.AVOIDING_COLLISION
        ]
    
    def transition_to_arrived(self):
        """Transition to arrived state."""
        self.main_state = MainState.ARRIVED
        self.navigating_state = None
        print(f"🏁 Carro llegó a destino en {self.cell.coordinate}")
        self.remove()
    
    def transition_navigating_state(self, new_state):
        """Transition to new navigation state."""
        if self.is_active():
            self.navigating_state = new_state
            if new_state in [NavigatingState.WAITING_TRAFFIC_LIGHT, 
                           NavigatingState.AVOIDING_COLLISION,
                           NavigatingState.BLOCKED]:
                self.waiting_time += 1
            else:
                self.waiting_time = 0
    
    def get_current_state_description(self):
        """Get current state description."""
        if self.is_arrived():
            return f"ARRIVED at destination"
        else:
            return f"ACTIVE → {self.navigating_state.value}"
    
    def heuristic(self, pos1, pos2):
        """Calculate Manhattan distance between two positions."""
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
    def get_valid_neighbors(self, cell):
        """Get valid neighboring cells respecting one-way roads."""
        neighbors = []
        current_pos = cell.coordinate
        
        road_agent = None
        for agent in cell.agents:
            if isinstance(agent, Road):
                road_agent = agent
                break
        
        if road_agent is None:
            return neighbors
        
        directions = [
            ("Up", (0, 1)),
            ("Down", (0, -1)),
            ("Left", (-1, 0)),
            ("Right", (1, 0))
        ]
        
        opposing_direction = {
            "Up": "Down",
            "Down": "Up",
            "Left": "Right",
            "Right": "Left"
        }
        
        for movement_dir, (dx, dy) in directions:
            next_pos = (current_pos[0] + dx, current_pos[1] + dy)
            
            if (0 <= next_pos[0] < self.model.grid.dimensions[0] and
                0 <= next_pos[1] < self.model.grid.dimensions[1]):
                
                next_cell = self.model.grid[next_pos]
                
                if self._has_road(next_cell):
                    next_road = None
                    for agent in next_cell.agents:
                        if isinstance(agent, Road):
                            next_road = agent
                            break
                    
                    if next_road:
                        forbidden_dir = opposing_direction[movement_dir]
                        
                        if next_road.direction != forbidden_dir:
                            neighbors.append(next_pos)
        
        return neighbors
    
    def calculate_path_to_destination(self):
        """Calculate optimal path using A* algorithm."""
        if self.destination is None:
            print(f"Carro en {self.cell.coordinate}: No hay destino asignado")
            return False
        
        start_pos = self.cell.coordinate
        goal_pos = self.destination.cell.coordinate
        
        counter = 0
        open_set = [(0, counter, start_pos)]
        counter += 1
        
        came_from = {}
        
        g_score = {start_pos: 0}
        f_score = {start_pos: self.heuristic(start_pos, goal_pos)}
        
        open_set_hash = {start_pos}
        
        while open_set:
            current_f, _, current_pos = heapq.heappop(open_set)
            open_set_hash.discard(current_pos)
            
            if current_pos == goal_pos:
                self.path = self._reconstruct_path(came_from, current_pos)
                self.path_index = 0
                print(f"Camino encontrado: {len(self.path)} pasos desde {start_pos} hasta {goal_pos}")
                return True
            
            current_cell = self.model.grid[current_pos]
            neighbors = self.get_valid_neighbors(current_cell)
            
            for neighbor_pos in neighbors:
                tentative_g_score = g_score[current_pos] + 1
                
                if neighbor_pos not in g_score or tentative_g_score < g_score[neighbor_pos]:
                    came_from[neighbor_pos] = current_pos
                    g_score[neighbor_pos] = tentative_g_score
                    f_score[neighbor_pos] = tentative_g_score + self.heuristic(neighbor_pos, goal_pos)
                    
                    if neighbor_pos not in open_set_hash:
                        heapq.heappush(open_set, (f_score[neighbor_pos], counter, neighbor_pos))
                        counter += 1
                        open_set_hash.add(neighbor_pos)
        
        print(f"No hay camino desde {start_pos} hasta {goal_pos}")
        self.path = []
        return False
    
    def _reconstruct_path(self, came_from, current_pos):
        """Reconstruct path from start to destination."""
        path = [current_pos]
        while current_pos in came_from:
            current_pos = came_from[current_pos]
            path.append(current_pos)
        path.reverse()
        
        if path and path[0] == self.cell.coordinate:
            path.pop(0)
        
        return path
    
    def get_next_position_from_path(self):
        """Get next position from calculated path."""
        if not self.path or self.path_index >= len(self.path):
            return None
        return self.path[self.path_index]
    
    def advance_path_index(self):
        """Advance path index after moving."""
        self.path_index += 1
        
    def perceive_environment(self):
        """Perceive environment and return perception dictionary."""
        perception = {
            'road': None,
            'traffic_light': None,
            'cars_ahead': [],
            'next_cell': None
        }
        
        for agent in self.cell.agents:
            if isinstance(agent, Road):
                perception['road'] = agent
                break
        
        next_pos_from_path = self.get_next_position_from_path()
        if next_pos_from_path:
            perception['next_cell'] = self.model.grid[next_pos_from_path]
        elif perception['road']:
            next_pos = self._calculate_next_position(perception['road'].direction)
            if next_pos:
                perception['next_cell'] = self.model.grid[next_pos]
        
        if perception['next_cell']:
            for agent in perception['next_cell'].agents:
                if isinstance(agent, Car):
                    perception['cars_ahead'].append(agent)
                elif isinstance(agent, Traffic_Light):
                    perception['traffic_light'] = agent
        
        return perception
    
    def _calculate_next_position(self, direction):
        """Calculate next position based on direction."""
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
        
        if next_pos:
            if (next_pos[0] < 0 or next_pos[0] >= self.model.grid.dimensions[0] or
                next_pos[1] < 0 or next_pos[1] >= self.model.grid.dimensions[1]):
                return None
        
        return next_pos
    
    def _get_alternative_directions(self, current_direction):
        """Get alternative directions for lane change."""
        alternatives = {
            "Up": ["Left", "Right"],
            "Down": ["Left", "Right"],
            "Left": ["Up", "Down"],
            "Right": ["Up", "Down"]
        }
        return alternatives.get(current_direction, [])
    
    def _try_lane_change(self, perception):
        """Try to change lanes randomly."""
        if perception['road'] is None:
            return None
        
        alternatives = self._get_alternative_directions(perception['road'].direction)
        self.model.random.shuffle(alternatives)
        
        for alt_direction in alternatives:
            alt_pos = self._calculate_next_position(alt_direction)
            if alt_pos:
                alt_cell = self.model.grid[alt_pos]
                if self._has_road(alt_cell):
                    has_car = False
                    for agent in alt_cell.agents:
                        if isinstance(agent, Car):
                            has_car = True
                            break
                    if not has_car:
                        return alt_cell
        
        return None
    
    def _has_road(self, cell):
        """Check if cell has road agent."""
        for agent in cell.agents:
            if isinstance(agent, Road):
                return True
        return False
    
    def _is_at_destination(self):
        """Check if car is at destination."""
        if self.destination is None:
            return False
        
        for agent in self.cell.agents:
            if isinstance(agent, Destination) and agent == self.destination:
                return True
        return False
    
    def decide_action(self, perception):
        """Decide action based on state and perception."""
        if self._is_at_destination():
            self.transition_to_arrived()
            return 'stop'
        
        if self.is_arrived():
            return 'stop'
        
        if (not self.path or self.path_index >= len(self.path) or 
            (self.waiting_time >= self.recalculate_path_threshold)):
            
            if self.waiting_time >= self.recalculate_path_threshold:
                print(f"Carro en {self.cell.coordinate}: Recalculando ruta (bloqueado {self.waiting_time} pasos)")
            
            self.transition_navigating_state(NavigatingState.PLANNING_ROUTE)
            return 'replan'
        
        if perception['road'] is None:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        if perception['next_cell'] is None:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        if not self._has_road(perception['next_cell']):
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        if perception['traffic_light'] is not None:
            if perception['traffic_light'].state == False:
                self.transition_navigating_state(NavigatingState.WAITING_TRAFFIC_LIGHT)
                return 'wait'
        
        if len(perception['cars_ahead']) > 0:
            self.transition_navigating_state(NavigatingState.AVOIDING_COLLISION)
            return 'wait'
        
        self.transition_navigating_state(NavigatingState.MOVING)
        return 'move'
    
    def execute_action(self, action, perception):
        """Execute decided action."""
        if action == 'move':
            next_cell = perception['next_cell']
            current_pos = self.cell.coordinate
            next_pos = next_cell.coordinate
            
            dx = next_pos[0] - current_pos[0]
            dy = next_pos[1] - current_pos[1]
            
            if dx == 1:
                self.orientation = "Right"
            elif dx == -1:
                self.orientation = "Left"
            elif dy == 1:
                self.orientation = "Up"
            elif dy == -1:
                self.orientation = "Down"
            
            self.cell = next_cell
            self.steps_taken += 1
            self.advance_path_index()
            self.waiting_time = 0
            
        elif action == 'replan':
            success = self.calculate_path_to_destination()
            if not success:
                self.transition_navigating_state(NavigatingState.BLOCKED)
            else:
                self.waiting_time = 0
                
        elif action == 'wait':
            pass
            
        elif action == 'stop':
            pass

    def step(self):
        """Execute agent step: perceive, decide, act."""
        perception = self.perceive_environment()
        action = self.decide_action(perception)
        self.execute_action(action, perception)

class Traffic_Light(FixedAgent):
    """Traffic light agent."""
    
    def __init__(self, model, cell, state = False, timeToChange = 10):
        """Initialize traffic light."""
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange
        self.time_remaining = timeToChange

    def step(self):
        """Change traffic light state."""
        steps_since_change = self.model.steps % self.timeToChange
        self.time_remaining = self.timeToChange - steps_since_change
        
        if self.model.steps % self.timeToChange == 0:
            self.state = not self.state
            self.time_remaining = self.timeToChange
    
    def get_seconds_remaining(self):
        """Get remaining steps until next state change."""
        return self.time_remaining

class Destination(FixedAgent):
    """Destination agent."""
    
    def __init__(self, model, cell):
        """Initialize destination."""
        super().__init__(model)
        self.cell = cell

class Obstacle(FixedAgent):
    """Obstacle agent."""
    
    def __init__(self, model, cell):
        """Initialize obstacle."""
        super().__init__(model)
        self.cell = cell

class Road(FixedAgent):
    """Road agent with direction."""
    
    def __init__(self, model, cell, direction= "Left"):
        """Initialize road."""
        super().__init__(model)
        self.cell = cell
        self.direction = direction

class Sidewalk(FixedAgent):
    """Sidewalk agent."""
    
    def __init__(self, model, cell, direction= "Left"):
        """Initialize sidewalk."""
        super().__init__(model)
        self.cell = cell
        self.direction = direction

class PedestrianWalk(FixedAgent):
    """Pedestrian walk agent."""
    
    def __init__(self, model, cell, direction= "Left"):
        """Initialize pedestrian walk."""
        super().__init__(model)
        self.cell = cell
        self.direction = direction
