from mesa import Model
from mesa.experimental.cell_space import OrthogonalMooreGrid
from .agent import *
import json

class CityModel(Model):
    """City traffic simulation model."""

    def __init__(self, N, seed=42, spawn_interval=10):
        """Initialize city model."""
        super().__init__(seed=seed)

        dataDictionary = json.load(open("city_files/mapDictionary.json"))

        self.num_agents = N
        self.traffic_lights = []
        self.destinations = []
        
        self.spawn_interval = spawn_interval
        self.spawn_timer = 0
        self.spawn_positions = [
            (0, 0),
            (28, 0),
            (0, 28),
            (28, 28)
        ]
        self.max_cars = 10

        with open("city_files/2024_modified.txt") as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])
            self.height = len(lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            for r, row in enumerate(lines):
                for c, col in enumerate(row):

                    cell = self.grid[(c, self.height - r - 1)]

                    if col in ["v", "^", ">", "<"]:
                        agent = Road(self, cell, dataDictionary[col])

                    elif col in ["S", "s"]:
                        direction = "Left"
                        
                        neighbors = [
                            (c-1, r, "<"),
                            (c+1, r, ">"),
                            (c, r-1, "^"),
                            (c, r+1, "v"),
                        ]
                        
                        for nc, nr, road_char in neighbors:
                            if 0 <= nc < len(row) and 0 <= nr < len(lines):
                                neighbor_char = lines[nr][nc] if nc < len(lines[nr]) else None
                                if neighbor_char == road_char:
                                    direction = dataDictionary[road_char]
                                    break
                        
                        Road(self, cell, direction)
                        
                        agent = Traffic_Light(
                            self,
                            cell,
                            False if col == "S" else True,
                            int(dataDictionary[col]),
                        )
                        self.traffic_lights.append(agent)

                    elif col == "#":
                        agent = Obstacle(self, cell)

                    elif col == "D":
                        direction = "Left"
                        
                        neighbors = [
                            (c-1, r, "<"),
                            (c+1, r, ">"),
                            (c, r-1, "^"),
                            (c, r+1, "v"),
                        ]
                        
                        for nc, nr, road_char in neighbors:
                            if 0 <= nc < len(row) and 0 <= nr < len(lines):
                                neighbor_char = lines[nr][nc] if nc < len(lines[nr]) else None
                                if neighbor_char == road_char:
                                    direction = dataDictionary[road_char]
                                    break
                        
                        Road(self, cell, direction)
                        
                        agent = Destination(self, cell)
                        self.destinations.append(agent)

                    elif col == "B":
                        agent = Sidewalk(self, cell)

                    elif col == "C":
                        direction = "Left"
                        
                        neighbors = [
                            (c-1, r, "<"),
                            (c+1, r, ">"),
                            (c, r-1, "^"),
                            (c, r+1, "v"),
                        ]
                        
                        for nc, nr, road_char in neighbors:
                            if 0 <= nc < len(row) and 0 <= nr < len(lines):
                                neighbor_char = lines[nr][nc] if nc < len(lines[nr]) else None
                                if neighbor_char == road_char:
                                    direction = dataDictionary[road_char]
                                    break
                        
                        Road(self, cell, direction)
                        
                        agent = PedestrianWalk(self, cell, direction)

        self.running = True

    def step(self):
        """Advance model by one step."""
        self.agents.shuffle_do("step")
        
        self.spawn_timer += 1
        
        if self.spawn_timer >= self.spawn_interval:
            self.spawn_timer = 0
            
            active_cars = sum(1 for agent in self.agents if isinstance(agent, Car) and agent.is_active())
            
            if active_cars < self.max_cars:
                spawn_pos = self.random.choice(self.spawn_positions)
                spawn_cell = self.grid[spawn_pos]
                
                cars_in_cell = [agent for agent in spawn_cell.agents if isinstance(agent, Car)]
                
                if not cars_in_cell:
                    if self.destinations:
                        destination = self.random.choice(self.destinations)
                        Car(self, spawn_cell, destination=destination)
                        print(f"Nuevo carro generado en {spawn_pos} con destino a {destination.cell.coordinate}")
                    else:
                        Car(self, spawn_cell, destination=None)
                        print(f"Nuevo carro generado en {spawn_pos} sin destino")
