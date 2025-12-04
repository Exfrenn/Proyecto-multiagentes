from mesa import Model
from mesa.experimental.cell_space import OrthogonalMooreGrid
from .agent import *
import json
import os

class CityModel(Model):
    """City traffic simulation model."""

    def _detect_road_direction_from_neighbors(self, column_index, row_index, map_lines, row_content, map_character_dictionary):
        """Detect road direction by checking neighboring road tiles."""
        neighbor_positions = [
            (column_index-1, row_index, "<"),
            (column_index+1, row_index, ">"),
            (column_index, row_index-1, "^"),
            (column_index, row_index+1, "v"),
        ]
        
        for neighbor_column, neighbor_row, expected_road_character in neighbor_positions:
            if 0 <= neighbor_column < len(row_content) and 0 <= neighbor_row < len(map_lines):
                neighbor_character = map_lines[neighbor_row][neighbor_column] if neighbor_column < len(map_lines[neighbor_row]) else None
                if neighbor_character == expected_road_character:
                    return map_character_dictionary[expected_road_character]
        
        return "Left"

    def __init__(self, initial_agents_count, seed=42, spawn_interval=10):
        """Initialize city model."""
        super().__init__(seed=seed)

        
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        traffic_agents_dir = os.path.dirname(current_dir)
        
        city_files_dir = os.path.join(traffic_agents_dir, "city_files")
        
        map_dict_path = os.path.join(city_files_dir, "mapDictionary.json")
        map_character_dictionary = json.load(open(map_dict_path))

        self.num_agents = initial_agents_count
        self.traffic_lights = []
        self.car_destinations = []
        self.pedestrian_destinations = []
        
        self.spawn_interval = spawn_interval
        self.spawn_timer = 0
        self.car_spawn_positions = [
            (0, 0),
            (35, 0),
            (0, 34),
            (35, 34)
        ]
        self.max_cars = 1000
        self.max_pedestrians = 10
        
        # Stop condition: consecutive times all spawns were blocked
        self.consecutive_blocked_spawns = 0
        self.max_blocked_spawns = 3

        map_file_path = os.path.join(city_files_dir, "2025_base.txt")
        with open(map_file_path) as map_file:
            map_lines = map_file.readlines()
            self.width = len(map_lines[0])
            self.height = len(map_lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            for row_index, row_content in enumerate(map_lines):
                for column_index, cell_character in enumerate(row_content):

                    grid_cell = self.grid[(column_index, self.height - row_index - 1)]

                    if cell_character in ["v", "^", ">", "<"]:
                        agent = Road(self, grid_cell, map_character_dictionary[cell_character])

                    elif cell_character in ["S", "s"]:
                        road_direction = self._detect_road_direction_from_neighbors(
                            column_index, row_index, map_lines, row_content, map_character_dictionary
                        )
                        Road(self, grid_cell, road_direction)
                        
                        agent = Traffic_Light(
                            self,
                            grid_cell,
                            False if cell_character == "S" else True,
                            int(map_character_dictionary[cell_character]),
                        )
                        self.traffic_lights.append(agent)

                    elif cell_character == "#":
                        agent = Obstacle(self, grid_cell)

                    elif cell_character == "D":
                        road_direction = self._detect_road_direction_from_neighbors(
                            column_index, row_index, map_lines, row_content, map_character_dictionary
                        )
                        Road(self, grid_cell, road_direction)
                        
                        agent = Destination(self, grid_cell)
                        self.car_destinations.append(agent)

                    elif cell_character == "P":
                        agent = Sidewalk(self, grid_cell)
                        pedestrian_destination = Destination(self, grid_cell)
                        self.pedestrian_destinations.append(pedestrian_destination)

                    elif cell_character == "B":
                        agent = Sidewalk(self, grid_cell)

                    elif cell_character == "C":
                        road_direction = self._detect_road_direction_from_neighbors(
                            column_index, row_index, map_lines, row_content, map_character_dictionary
                        )
                        Road(self, grid_cell, road_direction)
                        
                        agent = PedestrianWalk(self, grid_cell, road_direction)

        self.running = True
        self.pedestrians_enabled = True
        

    def set_spawn_interval(self, interval):
        """Set the spawn interval for cars and pedestrians."""
        self.spawn_interval = max(1, int(interval))
    
    def set_pedestrians_enabled(self, enabled):
        """Enable or disable pedestrian spawning."""
        self.pedestrians_enabled = enabled

    def step(self):
        """Advance model by one step."""
        self.agents.shuffle_do("step")
        
        self.spawn_timer += 1
        
        if self.spawn_timer >= self.spawn_interval:
            self.spawn_timer = 0
            
            active_cars_count = sum(1 for agent in self.agents if isinstance(agent, Car) and agent.is_active())
            active_pedestrians_count = sum(1 for agent in self.agents if isinstance(agent, Pedestrian) and agent.is_active())
            
            # Spawn cars at ALL spawn positions simultaneously
            spawned_any = False
            for car_spawn_position in self.car_spawn_positions:
                if active_cars_count >= self.max_cars:
                    break
                    
                car_spawn_cell = self.grid[car_spawn_position]
                
                cars_at_spawn_location = [agent for agent in car_spawn_cell.agents if isinstance(agent, Car)]
                
                if not cars_at_spawn_location:
                    if self.car_destinations:
                        selected_destination = self.random.choice(self.car_destinations)
                        Car(self, car_spawn_cell, destination=selected_destination)
                        active_cars_count += 1
                        spawned_any = True
                    else:
                        Car(self, car_spawn_cell, destination=None)
                        active_cars_count += 1
                        spawned_any = True
            
            # Check if all spawn points were blocked
            if not spawned_any and active_cars_count < self.max_cars:
                self.consecutive_blocked_spawns += 1
                if self.consecutive_blocked_spawns >= self.max_blocked_spawns:
                    self.running = False
            else:
                self.consecutive_blocked_spawns = 0
                        
            
            # Spawn pedestrians at random destinations, traveling to different destinations
            if self.pedestrians_enabled and active_pedestrians_count < self.max_pedestrians:
                if len(self.pedestrian_destinations) >= 2:
                    # Pick a random destination as spawn point
                    spawn_destination = self.random.choice(self.pedestrian_destinations)
                    spawn_cell = spawn_destination.cell
                    
                    # Check if there's already a pedestrian at this location
                    pedestrians_at_spawn = [agent for agent in spawn_cell.agents if isinstance(agent, Pedestrian)]
                    
                    if not pedestrians_at_spawn:
                        # Pick a different destination as the target
                        available_targets = [d for d in self.pedestrian_destinations if d != spawn_destination]
                        if available_targets:
                            target_destination = self.random.choice(available_targets)
                            Pedestrian(self, spawn_cell, destination=target_destination)