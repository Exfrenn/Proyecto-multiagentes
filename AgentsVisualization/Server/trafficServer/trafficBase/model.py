from mesa import Model
from mesa.experimental.cell_space import OrthogonalMooreGrid
from .agent import *
import json

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

        map_character_dictionary = json.load(open("city_files/mapDictionary.json"))

        self.num_agents = initial_agents_count
        self.traffic_lights = []
        self.car_destinations = []
        self.pedestrian_destinations = []
        
        self.spawn_interval = spawn_interval
        self.spawn_timer = 0
        self.car_spawn_positions = [
            (0, 0),
            (28, 0),
            (0, 28),
            (28, 28)
        ]
        self.pedestrian_spawn_positions = [
            (10, 16)
        ]
        self.max_cars = 10
        self.max_pedestrians = 5

        with open("city_files/2024_modified.txt") as map_file:
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

    def step(self):
        """Advance model by one step."""
        self.agents.shuffle_do("step")
        
        self.spawn_timer += 1
        
        if self.spawn_timer >= self.spawn_interval:
            self.spawn_timer = 0
            
            active_cars_count = sum(1 for agent in self.agents if isinstance(agent, Car) and agent.is_active())
            active_pedestrians_count = sum(1 for agent in self.agents if isinstance(agent, Pedestrian) and agent.is_active())
            
            if active_cars_count < self.max_cars:
                car_spawn_position = self.random.choice(self.car_spawn_positions)
                car_spawn_cell = self.grid[car_spawn_position]
                
                cars_at_spawn_location = [agent for agent in car_spawn_cell.agents if isinstance(agent, Car)]
                
                if not cars_at_spawn_location:
                    if self.car_destinations:
                        selected_destination = self.random.choice(self.car_destinations)
                        Car(self, car_spawn_cell, destination=selected_destination)
                
                    else:
                        Car(self, car_spawn_cell, destination=None)
                        
            
            if active_pedestrians_count < self.max_pedestrians:
                pedestrian_spawn_position = self.random.choice(self.pedestrian_spawn_positions)
                pedestrian_spawn_cell = self.grid[pedestrian_spawn_position]
                
                pedestrians_at_spawn_location = [agent for agent in pedestrian_spawn_cell.agents if isinstance(agent, Pedestrian)]
                
                if not pedestrians_at_spawn_location:
                    if self.pedestrian_destinations:
                        selected_destination = self.random.choice(self.pedestrian_destinations)
                        Pedestrian(self, pedestrian_spawn_cell, destination=selected_destination)
