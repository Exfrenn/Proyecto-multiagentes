from mesa import Model
from mesa.discrete_space import OrthogonalMooreGrid
from .agent import *
import json


class CityModel(Model):
    """
    Creates a model based on a city map.

    Args:
        N: Number of agents in the simulation
        seed: Random seed for the model
    """

    def __init__(self, N, seed=42, spawn_interval=10):

        super().__init__(seed=seed)

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        import os
        current_dir = os.path.dirname(os.path.abspath(__file__))
        map_dict_path = os.path.join(current_dir, "..", "city_files", "mapDictionary.json")
        dataDictionary = json.load(open(map_dict_path))

        self.num_agents = N
        self.traffic_lights = []
        self.destinations = []  # Lista de destinos disponibles
        
        # Sistema de spawning de carros
        self.spawn_interval = spawn_interval  # Intervalo de steps entre spawns
        self.spawn_timer = 0  # Contador de steps
        self.spawn_corners = [(0, 0), (0, 29), (29, 0), (29, 29)]  # Esquinas donde spawner carros
        self.max_cars = 10  # Número máximo de carros simultáneos

        # Load the map file. The map file is a text file where each character represents an agent.
        map_file_path = os.path.join(current_dir, "..", "city_files", "2024_modified.txt")
        with open(map_file_path) as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])
            self.height = len(lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row):

                    cell = self.grid[(c, self.height - r - 1)] # invertir el mapa (ahora 0,0 esta en extremo inferior derecho)

                    if col in ["v", "^", ">", "<"]:
                        agent = Road(self, cell, dataDictionary[col])

                    elif col in ["S", "s"]:
                        # Detectar la dirección del semáforo mirando las celdas vecinas
                        # Buscar carreteras alrededor para determinar la dirección
                        direction = "Left"  # Dirección por defecto
                        
                        # Verificar vecinos para detectar la dirección
                        neighbors = [
                            (c-1, r, "<"),  # Izquierda
                            (c+1, r, ">"),  # Derecha
                            (c, r-1, "^"),  # Arriba
                            (c, r+1, "v"),  # Abajo
                        ]
                        
                        for nc, nr, road_char in neighbors:
                            if 0 <= nc < len(row) and 0 <= nr < len(lines):
                                neighbor_char = lines[nr][nc] if nc < len(lines[nr]) else None
                                if neighbor_char == road_char:
                                    direction = dataDictionary[road_char]
                                    break
                        
                        # Crear PRIMERO la carretera con la dirección detectada
                        Road(self, cell, direction)
                        
                        # Luego crear el semáforo en la misma celda
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
                        agent = Destination(self, cell)
                        self.destinations.append(agent)  # Guardar destinos

                    elif col == "B":
                        agent = Sidewalk(self, cell)

                    elif col == "C":
                        # PedestrianWalk: Detectar dirección igual que los semáforos
                        direction = "Left"  # Dirección por defecto
                        
                        # Verificar vecinos para detectar la dirección
                        neighbors = [
                            (c-1, r, "<"),  # Izquierda
                            (c+1, r, ">"),  # Derecha
                            (c, r-1, "^"),  # Arriba
                            (c, r+1, "v"),  # Abajo
                        ]
                        
                        for nc, nr, road_char in neighbors:
                            if 0 <= nc < len(row) and 0 <= nr < len(lines):
                                neighbor_char = lines[nr][nc] if nc < len(lines[nr]) else None
                                if neighbor_char == road_char:
                                    direction = dataDictionary[road_char]
                                    break
                        
                        # Crear Road con la dirección detectada
                        Road(self, cell, direction)
                        
                        # Crear PedestrianWalk
                        agent = PedestrianWalk(self, cell, direction)


        self.running = True


    def step(self):
        """Advance the model by one step."""
        # Ejecutar el step de todos los agentes
        self.agents.shuffle_do("step")
        
        # Sistema de spawning de carros
        self.spawn_timer += 1
        
        # Verificar si es momento de generar un nuevo carro
        if self.spawn_timer >= self.spawn_interval:
            self.spawn_timer = 0  # Reiniciar el timer
            
            # Contar carros activos (no llegados a destino)
            active_cars = sum(1 for agent in self.agents if isinstance(agent, Car) and agent.is_active())
            
            # Solo generar si no hemos alcanzado el máximo
            if active_cars < self.max_cars:
                # Seleccionar una esquina aleatoria
                spawn_corner = self.random.choice(self.spawn_corners)
                spawn_cell = self.grid[spawn_corner]
                
                # Verificar que la celda no esté ocupada por otro carro
                cars_in_cell = [agent for agent in spawn_cell.agents if isinstance(agent, Car)]
                
                if not cars_in_cell:
                    # Asignar un destino aleatorio
                    if self.destinations:
                        destination = self.random.choice(self.destinations)
                        Car(self, spawn_cell, destination=destination)
                        print(f"🚗 Nuevo carro generado en {spawn_corner} con destino a {destination.cell.coordinate}")
                    else:
                        Car(self, spawn_cell, destination=None)
                        print(f"🚗 Nuevo carro generado en {spawn_corner} sin destino")

