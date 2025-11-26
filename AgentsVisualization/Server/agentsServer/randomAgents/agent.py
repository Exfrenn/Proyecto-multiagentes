from mesa.discrete_space import CellAgent, FixedAgent
import heapq


MOVING = "MOVING"
WAITING = "WAITING"
ARRIVED = "ARRIVED"


def manhattan(a, b):
    """
    Computes the Manhattan distance between two grid coordinates.
    This heuristic measures how far two positions are on a rectangular grid
    by summing the absolute horizontal and vertical differences. It is used
    by the A* search algorithm to estimate the minimal remaining cost.
    """
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def astar(start, goal, neighbors_fn, heuristic_fn):
    """
    Performs an A* search between two coordinates on a grid.

    This function finds an optimal path from a start cell to a goal cell,
    assuming uniform movement cost. The algorithm expands nodes based on
    the sum of the accumulated cost and a heuristic estimate. It returns
    a list of coordinates representing the route from start to goal.
    """
    frontier = []
    heapq.heappush(frontier, (0, start))

    came_from = {start: None}
    cost_so_far = {start: 0}

    while frontier:
        _, current = heapq.heappop(frontier)

        if current == goal:
            break

        for next_node in neighbors_fn(current):
            new_cost = cost_so_far[current] + 1
            if next_node not in cost_so_far or new_cost < cost_so_far[next_node]:
                cost_so_far[next_node] = new_cost
                priority = new_cost + heuristic_fn(next_node, goal)
                heapq.heappush(frontier, (priority, next_node))
                came_from[next_node] = current

    if goal not in came_from:
        return []

    path = []
    current = goal
    while current != start:
        path.append(current)
        current = came_from[current]
    path.reverse()
    return path



class Car(CellAgent):
    """
    Simulated vehicle agent that navigates roads using an A* path.

    The car maintains an internal navigation path toward its destination,
    evaluates traffic lights, pedestrians, and obstacles, and decides when
    to move or wait. Its orientation updates dynamically based on movement,
    and the agent terminates once the destination is reached.
    """

    def __init__(self, model, cell, destination, direction):
        super().__init__(model)
        self.cell = cell
        self.destination = destination
        self.direction = direction
        self.currentState = MOVING
        self.path = []

        self.traffic_light_ahead = None
        self.car_ahead = None
        self.pedestrian_ahead = None
        self.obstacle_ahead = None
        
        self.compute_astar_path()

    def step(self):
        """
        Executes one update cycle of the car's behavior.

        The agent first checks if it has already arrived. If not, it verifies
        whether a valid path exists; if the path is blocked or absent, the car
        enters a waiting state. Otherwise, the agent inspects the environment
        and either moves forward along its planned route or remains stationary
        depending on road conditions.
        """
        if self.currentState == ARRIVED:
            return

        if not self.path:
            self.currentState = WAITING
            return

        self.sense_environment()

        if self.currentState == WAITING:
            return

        self.move()

    def is_turning(self):
        """
        Determines whether the next movement requires a turn.

        From the current orientation and the next cell’s position,
        the method identifies whether the car will turn left, right,
        or continue straight. This information is used during traffic
        light evaluation to apply realistic right-of-way behavior.
        """
        if not self.path:
            return None

        next_pos = self.path[0]
        dx = next_pos[0] - self.cell[0]
        dz = next_pos[1] - self.cell[1]

        if dx == 1:
            intended = "RIGHT"
        elif dx == -1:
            intended = "LEFT"
        elif dz == 1:
            intended = "FORWARD"
        elif dz == -1:
            intended = "BACKWARD"
        else:
            return None

        current = self.direction.upper()

        turn_matrix = {
            "FORWARD":  {"LEFT": "left", "RIGHT": "right", "FORWARD": "straight", "BACKWARD": "straight"},
            "BACKWARD": {"LEFT": "right", "RIGHT": "left",  "FORWARD": "straight", "BACKWARD": "straight"},
            "LEFT":     {"FORWARD": "right", "BACKWARD": "left", "LEFT": "straight", "RIGHT": "straight"},
            "RIGHT":    {"FORWARD": "left",  "BACKWARD": "right", "LEFT": "straight", "RIGHT": "straight"},
        }

        return turn_matrix[current][intended]

    def check_pedestrians_crossing(self, check_pos):
        """
        Evaluates whether pedestrians occupy or are approaching a crossing cell.

        This function inspects the target cell and its adjacent neighbors
        to determine if pedestrians are present or about to enter the space.
        The car uses this information to yield appropriately during turning
        or when proceeding straight through intersections.
        """
        agents = self.model.grid.get_cell_list_contents([check_pos])

        if any(isinstance(a, Pedestrian) for a in agents):
            return True
        
        for nx, nz in self.model.grid.get_neighborhood(check_pos, moore=False, include_center=False):
            nearby_agents = self.model.grid.get_cell_list_contents([(nx, nz)])
            for ped in nearby_agents:
                if isinstance(ped, Pedestrian) and ped.path and len(ped.path) > 0:
                    if ped.path[0] == check_pos:
                        return True
        
        return False

    def sense_environment(self):
        """
        Analyzes the next movement cell and determines whether movement is safe.

        The car inspects its immediate forward cell for traffic lights, other cars,
        pedestrians, and obstacles. Based on right-of-way rules and signal states,
        the car decides whether to move, yield, or remain in a waiting state.
        This provides realistic traffic behavior at intersections.
        """
        self.traffic_light_ahead = None
        self.car_ahead = None
        self.pedestrian_ahead = None
        self.obstacle_ahead = None

        if not self.path:
            self.currentState = WAITING
            return

        next_pos = self.path[0]
        agents = self.model.grid.get_cell_list_contents([next_pos])

        for a in agents:
            if isinstance(a, Traffic_Light):
                self.traffic_light_ahead = a
            elif isinstance(a, Car):
                self.car_ahead = a
            elif isinstance(a, Pedestrian):
                self.pedestrian_ahead = a
            elif isinstance(a, Obstacle):
                self.obstacle_ahead = a

        turn_type = self.is_turning()

        if self.car_ahead or self.obstacle_ahead:
            self.currentState = WAITING
            return

        if self.traffic_light_ahead:
            pedestrians_present = self.check_pedestrians_crossing(next_pos)
            
            if self.traffic_light_ahead.state:
                if turn_type in ["left", "right"]:
                    if pedestrians_present:
                        self.currentState = WAITING
                        return
                elif pedestrians_present:
                    self.currentState = WAITING
                    return
                    
            else:
                if turn_type in ["left", "right"]:
                    if pedestrians_present:
                        self.currentState = WAITING
                        return
                    self.currentState = MOVING
                    return
                else:
                    self.currentState = WAITING
                    return

        if self.pedestrian_ahead:
            self.currentState = WAITING
            return

        if self.check_pedestrians_crossing(next_pos):
            self.currentState = WAITING
            return

        self.currentState = MOVING

    def compute_astar_path(self):
        """
        Calculates an A* path from the car’s current location to its destination.

        The neighbor function restricts movement to valid road segments, enforcing
        directional constraints where applicable. Traffic light cells are treated
        as traversable intersections. The computed route defines the car’s intended
        sequence of movements for subsequent steps.
        """
        grid = self.model.grid

        def neighbors_fn(pos):
            neighs = []
            for nx, nz in grid.get_neighborhood(pos, moore=False, include_center=False):
                agents = grid.get_cell_list_contents([(nx, nz)])

                if any(isinstance(a, Obstacle) for a in agents):
                    continue

                dx = nx - pos[0]
                dz = nz - pos[1]

                road_agent = next((a for a in agents if isinstance(a, Road)), None)
                traffic_light = next((a for a in agents if isinstance(a, Traffic_Light)), None)

                if not (road_agent or traffic_light):
                    continue

                if road_agent:
                    road_dir = road_agent.direction
                    if dx == 1 and road_dir == "Right":
                        neighs.append((nx, nz))
                    elif dx == -1 and road_dir == "Left":
                        neighs.append((nx, nz))
                    elif dz == 1 and road_dir == "Forward":
                        neighs.append((nx, nz))
                    elif dz == -1 and road_dir == "Backward":
                        neighs.append((nx, nz))

                elif traffic_light:
                    neighs.append((nx, nz))

            return neighs

        self.path = astar(
            start=self.cell,
            goal=self.destination.cell,
            neighbors_fn=neighbors_fn,
            heuristic_fn=manhattan
        )

    def move(self):
        """
        Advances the car along the precomputed path by one step.

        This method validates that the next cell remains a road or traffic
        light, updates the car’s orientation based on its movement vector,
        and relocates the agent within the grid. If the car reaches its
        destination, it removes itself from the simulation.
        """
        if not self.path:
            self.currentState = WAITING
            return

        next_cell = self.path.pop(0)

        agents_at_next = self.model.grid.get_cell_list_contents([next_cell])
        if not any(isinstance(a, (Road, Traffic_Light)) for a in agents_at_next):
            self.path.insert(0, next_cell)
            self.currentState = WAITING
            return

        dx = next_cell[0] - self.cell[0]
        dz = next_cell[1] - self.cell[1]

        if dx == 1:
            self.direction = "Right"
        elif dx == -1:
            self.direction = "Left"
        elif dz == 1:
            self.direction = "Forward"
        elif dz == -1:
            self.direction = "Backward"

        self.model.grid.move_agent(self, next_cell)
        self.cell = next_cell

        if self.cell == self.destination.cell:
            self.currentState = ARRIVED
            self.remove()



class Pedestrian(CellAgent):
    """
    Pedestrian agent that navigates sidewalks using A*.

    Pedestrians can move in any of four cardinal directions, restricted to
    sidewalk and traffic-light cells. They respect signal timing and avoid
    entering intersections when the crossing time is insufficient.
    """

    def __init__(self, model, cell, destination):
        super().__init__(model)
        self.cell = cell
        self.destination = destination
        self.path = []
        self.compute_astar_path()

    def step(self):
        """
        Executes a walking step for the pedestrian.

        The agent checks whether the planned next cell is valid, respects
        obstacles and red signals, and moves only when safe. Upon reaching
        its destination, the agent removes itself from the model.
        """
        if not self.path:
            return

        next_cell = self.path[0]
        agents_next = self.model.grid.get_cell_list_contents([next_cell])

        if not any(isinstance(a, (Sidewalk, Traffic_Light)) for a in agents_next):
            return

        if any(isinstance(a, Obstacle) for a in agents_next):
            return

        traffic_light_ahead = next((a for a in agents_next if isinstance(a, Traffic_Light)), None)
        if traffic_light_ahead:
            if traffic_light_ahead.get_seconds_remaining() <= 2:
                current_agents = self.model.grid.get_cell_list_contents([self.cell])
                in_crosswalk = any(isinstance(a, Traffic_Light) for a in current_agents)
                if not in_crosswalk:
                    return

            if not traffic_light_ahead.state:
                return
        #After running it once the .pop is going to remove the next_cell coordinate in the list.
        next_cell = self.path.pop(0)
        self.model.grid.move_agent(self, next_cell)
        self.cell = next_cell

        if self.cell == self.destination.cell:
            self.remove()

    def compute_astar_path(self):
        """
        Generates an A* walking route toward the pedestrian’s destination.

        The navigation graph includes only sidewalks and traffic-light cells.
        Obstacles are excluded from consideration, and movement cost between
        adjacent valid cells is uniform. The result is a step-by-step route.
        """
        grid = self.model.grid

        def neighbors_fn(pos):
            neighs = []
            for nx, nz in grid.get_neighborhood(pos, moore=False, include_center=False):
                agents = grid.get_cell_list_contents([(nx, nz)])

                if any(isinstance(a, Obstacle) for a in agents):
                    continue

                allowed = any(isinstance(a, Sidewalk) for a in agents) or \
                          any(isinstance(a, Traffic_Light) for a in agents)

                if allowed:
                    neighs.append((nx, nz))

            return neighs

        self.path = astar(
            start=self.cell,
            goal=self.destination.cell,
            neighbors_fn=neighbors_fn,
            heuristic_fn=manhattan
        )



class Traffic_Light(FixedAgent):
    """
    Traffic signal controlling vehicle and pedestrian flow.

    The light alternates between red and green after a configurable interval.
    It tracks the remaining time until the next state change and exposes this
    for pedestrians and vehicles to determine safe crossing or movement.
    """

    def __init__(self, model, cell, state=False, timeToChange=10, direction="Forward"):
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange
        self.direction = direction
        self.time_remaining = timeToChange

    def step(self):
        """
        Updates the signal’s timer and toggles its state when appropriate.

        Each model step reduces the remaining time. When the countdown reaches
        zero, the signal switches between red and green, resetting the interval.
        This behavior is essential for consistent crosswalk and intersection flow.
        """
        steps_since_change = self.model.steps % self.timeToChange
        self.time_remaining = self.timeToChange - steps_since_change
        
        if self.model.steps % self.timeToChange == 0:
            self.state = not self.state
            self.time_remaining = self.timeToChange
    
    def get_seconds_remaining(self):
        """
        Returns the number of steps before the next state change.

        This is used by pedestrians and turning vehicles to evaluate whether
        it is safe to begin crossing or passing through an intersection.
        """
        return self.time_remaining



class Destination(FixedAgent):
    """
    Simple marker representing a target position for cars or pedestrians.

    Agents use this location as the final node for their A* navigation.
    """
    def __init__(self, model, cell):
        super().__init__(model)
        self.cell = cell



class Obstacle(FixedAgent):
    """
    Static entity that blocks movement for both cars and pedestrians.

    Obstacles represent non-traversable objects such as barriers,
    construction areas, or physical roadblocks.
    """
    def __init__(self, model, cell):
        super().__init__(model)
        self.cell = cell



class Road(FixedAgent):
    """
    Traversable road segment with a specific directional constraint.

    The direction string determines allowed car movement, simulating
    lane-based travel and one-way or two-way street configurations.
    """
    def __init__(self, model, cell, direction):
        super().__init__(model)
        self.cell = cell
        self.direction = direction



class Sidewalk(FixedAgent):
    """
    Walkable cell used by pedestrians.

    Represents safe walking areas, separate from vehicle roads,
    and contributes to pedestrian navigation graphs.
    """
    def __init__(self, model, cell):
        super().__init__(model)
        self.cell = cell
