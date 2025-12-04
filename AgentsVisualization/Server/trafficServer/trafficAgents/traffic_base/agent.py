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
        self.failed_path_attempts = 0
        self.max_failed_attempts = 3
        
        # Randomization for path diversity - each car has different preferences
        self.congestion_weight = model.random.uniform(2.0, 8.0)  # How much to avoid traffic
        self.path_randomness = model.random.uniform(0.0, 3.0)    # Random cost variation
        
        if self.destination is not None:
            success = self.calculate_path_to_destination()
            # If can't find path, try other destinations
            if not success:
                self._try_alternative_destinations()
    
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
    
    
    def heuristic(self, pos1, pos2):
        """Calculate Manhattan distance between two positions."""
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
    def get_movement_cost(self, cell):
        """Calculate cost of moving to a cell based on congestion and randomness."""
        base_cost = 1.0
        
        # Count cars in this cell
        cars_in_cell = sum(1 for agent in cell.agents if isinstance(agent, Car))
        
        # Add congestion penalty
        congestion_cost = cars_in_cell * self.congestion_weight
        
        # Add random variation to create path diversity
        random_cost = self.model.random.uniform(0, self.path_randomness)
        
        return base_cost + congestion_cost + random_cost
    
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
                    # Check if this cell has a Destination that's NOT our destination
                    has_other_destination = False
                    for agent in next_cell.agents:
                        if isinstance(agent, Destination):
                            # Only block if it's NOT our destination
                            if self.destination is None or agent != self.destination:
                                has_other_destination = True
                            break
                    
                    # Skip this cell if it has another car's destination
                    if has_other_destination:
                        continue
                    
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
                return True
            
            current_cell = self.model.grid[current_pos]
            neighbors = self.get_valid_neighbors(current_cell)
            
            for neighbor_pos in neighbors:
                neighbor_cell = self.model.grid[neighbor_pos]
                # Use dynamic movement cost based on congestion and randomness
                move_cost = self.get_movement_cost(neighbor_cell)
                tentative_g_score = g_score[current_pos] + move_cost
                
                if neighbor_pos not in g_score or tentative_g_score < g_score[neighbor_pos]:
                    came_from[neighbor_pos] = current_pos
                    g_score[neighbor_pos] = tentative_g_score
                    f_score[neighbor_pos] = tentative_g_score + self.heuristic(neighbor_pos, goal_pos)
                    
                    if neighbor_pos not in open_set_hash:
                        heapq.heappush(open_set, (f_score[neighbor_pos], counter, neighbor_pos))
                        counter += 1
                        open_set_hash.add(neighbor_pos)
        
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
    
    def _try_alternative_destinations(self):
        """Try to find a path to any reachable destination."""
        if not self.model.car_destinations:
            self.transition_to_arrived()  
            return False
        
        # Shuffle destinations to try them in random order
        destinations_to_try = list(self.model.car_destinations)
        self.model.random.shuffle(destinations_to_try)
        
        for dest in destinations_to_try:
            self.destination = dest
            if self.calculate_path_to_destination():
                return True
        
        # No reachable destination - remove this car
        self.transition_to_arrived()
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
            self.failed_path_attempts = 0
            
        elif action == 'replan':
            success = self.calculate_path_to_destination()
            if not success:
                self.failed_path_attempts += 1
                # Try alternative destinations
                if self.failed_path_attempts >= self.max_failed_attempts:
                    # Remove car if it can't find any path after multiple attempts
                    self.transition_to_arrived()
                else:
                    # Try a different destination
                    if not self._try_alternative_destinations():
                        self.transition_navigating_state(NavigatingState.BLOCKED)
            else:
                self.waiting_time = 0
                self.failed_path_attempts = 0
                
        elif action == 'wait':
            pass
            
        elif action == 'stop':
            pass

    def step(self):
        """Execute agent step: perceive, decide, act."""
        perception = self.perceive_environment()
        action = self.decide_action(perception)
        self.execute_action(action, perception)

class Pedestrian(CellAgent):
    """Pedestrian agent."""
    
    def __init__(self, model, cell, destination):
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
        self.is_crossing = False  
        
        if self.destination is not None:
            self.calculate_path_to_destination()
    
    def is_active(self):
        """Check if pedestrian is active."""
        return self.main_state == MainState.ACTIVE
    
    def is_arrived(self):
        """Check if pedestrian arrived at destination."""
        return self.main_state == MainState.ARRIVED
    
    def is_moving(self):
        """Check if pedestrian is moving."""
        return self.is_active() and self.navigating_state == NavigatingState.MOVING
    
    def is_waiting(self):
        """Check if pedestrian is waiting."""
        return self.is_active() and self.navigating_state in [
            NavigatingState.WAITING_TRAFFIC_LIGHT,
            NavigatingState.AVOIDING_COLLISION
        ]
    def transition_to_arrived(self):
        """Transition to arrived state."""
        self.main_state = MainState.ARRIVED
        self.navigating_state = None
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
    
    def heuristic(self, pos1, pos2):
        """Calculate Manhattan distance between two positions."""
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
    def get_valid_neighbors(self, cell):
        """Get valid neighboring cells for pedestrians (sidewalks, pedestrian walks, and traffic lights)."""
        neighbors = []
        current_pos = cell.coordinate
        
        # Check if current cell has sidewalk, pedestrian walk, or traffic light
        has_walkable = False
        for agent in cell.agents:
            if isinstance(agent, (Sidewalk, PedestrianWalk, Traffic_Light)):
                has_walkable = True
                break
        
        if not has_walkable:
            return neighbors
        
        # Pedestrians can move in all 4 directions
        directions = [
            (0, 1),   # Up
            (0, -1),  # Down
            (-1, 0),  # Left
            (1, 0)    # Right
        ]
        
        for dx, dy in directions:
            next_pos = (current_pos[0] + dx, current_pos[1] + dy)
            
        
            if (0 <= next_pos[0] < self.model.grid.dimensions[0] and
                0 <= next_pos[1] < self.model.grid.dimensions[1]):
                
                next_cell = self.model.grid[next_pos]
                

                if self._has_walkable_surface(next_cell):
                    neighbors.append(next_pos)
        
        return neighbors
    
    def calculate_path_to_destination(self):
        """Calculate optimal path using A* algorithm."""
        if self.destination is None:
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
            'sidewalk': None,
            'pedestrian_walk': None,
            'traffic_light': None,
            'pedestrians_ahead': [],
            'cars_ahead': [],
            'next_cell': None
        }
        
        for agent in self.cell.agents:
            if isinstance(agent, Sidewalk):
                perception['sidewalk'] = agent
                break
        
        for agent in self.cell.agents:
            if isinstance(agent, PedestrianWalk):
                perception['pedestrian_walk'] = agent
                break
        for agent in self.cell.agents:
            if isinstance(agent, Traffic_Light):
                perception['traffic_light'] = agent
                break

        next_pos_from_path = self.get_next_position_from_path()
        if next_pos_from_path:
            perception['next_cell'] = self.model.grid[next_pos_from_path]
        elif perception['sidewalk']:
            next_pos = self._calculate_next_position(perception['sidewalk'].direction)
            if next_pos:
                perception['next_cell'] = self.model.grid[next_pos]
        
        if perception['next_cell']:
            for agent in perception['next_cell'].agents:
                if isinstance(agent, Pedestrian):
                    perception['pedestrians_ahead'].append(agent)
                elif isinstance(agent, Car):
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
    
    def _has_walkable_surface(self, cell):
        """Check if cell has sidewalk, pedestrian walk, or traffic light."""
        for agent in cell.agents:
            if isinstance(agent, (Sidewalk, PedestrianWalk, Traffic_Light)):
                return True
        return False
    
    def _is_at_destination(self):
        """Check if pedestrian is at destination."""
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
        
        # Recalculate path if needed
        if (not self.path or self.path_index >= len(self.path) or 
            (self.waiting_time >= self.recalculate_path_threshold)):
            
            self.transition_navigating_state(NavigatingState.PLANNING_ROUTE)
            return 'replan'
        
        # Check if current cell has walkable surface
        if not self._has_walkable_surface(self.cell):
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        # Check if next cell exists
        if perception['next_cell'] is None:
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        
        # Check if next cell has walkable surface
        if not self._has_walkable_surface(perception['next_cell']):
            self.transition_navigating_state(NavigatingState.BLOCKED)
            return 'wait'
        



        current_cell_has_traffic_light = any(isinstance(a, Traffic_Light) for a in self.cell.agents)
        
        if perception['pedestrian_walk'] is not None or current_cell_has_traffic_light:
            self.is_crossing = True 
        elif perception['sidewalk'] is not None:
            self.is_crossing = False  
        

        if not self.is_crossing:
            if perception['traffic_light'] is not None:
                if perception['traffic_light'].state == True:
                    self.transition_navigating_state(NavigatingState.WAITING_TRAFFIC_LIGHT)
                    return 'wait'
      
            if len(perception['cars_ahead']) > 0:
                self.transition_navigating_state(NavigatingState.AVOIDING_COLLISION)
                return 'wait'
        

        if len(perception['pedestrians_ahead']) >= 4:
            self.transition_navigating_state(NavigatingState.AVOIDING_COLLISION)
            return 'wait'
        
        # Move forward
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
            
            # Move to next cell
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