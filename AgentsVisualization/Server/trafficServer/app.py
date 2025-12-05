from trafficAgents.traffic_base.agent import *
from trafficAgents.traffic_base.model import CityModel

from mesa.visualization import SolaraViz, make_space_component, make_plot_component


def agent_portrayal(agent):

    if agent is None:
        return

    portrayal = {
        "color": "white",
        "size": 25,
        "marker": "s",
    }

    if isinstance(agent, Road):
        portrayal["color"] = "#aaa"
    
    if isinstance(agent, Pedestrian):
        portrayal["color"] = "purple"

    if isinstance(agent, Destination):
        portrayal["color"] = "lightgreen"

    if isinstance(agent, Traffic_Light):
        portrayal["color"] = "red" if not agent.state else "green"

    if isinstance(agent, Obstacle):
        portrayal["color"] = "#555"

    if isinstance(agent, Car):
        portrayal["color"] = "blue"

    if isinstance(agent, Sidewalk):
        portrayal["color"] = "#d3d3d3"

    if isinstance(agent, PedestrianWalk):
        portrayal["color"] = "#f5eb5f"

    return portrayal


def post_process(ax):
    ax.set_aspect("equal")


def post_process_lines(ax):
    """Format the line plot"""
    ax.legend(loc="center left", bbox_to_anchor=(1, 0.9))
    ax.set_xlabel("Steps")
    ax.set_ylabel("Count")


model_params = {
    "initial_agents_count": 5,
    "seed": {
        "type": "InputText",
        "value": 42,
        "label": "Random Seed",
    },
    "spawn_interval": {
        "type": "SliderInt",
        "value": 10,
        "label": "Spawn Interval (steps)",
        "min": 1,
        "max": 50,
        "step": 1,
    },
}

model = CityModel(model_params["initial_agents_count"], spawn_interval=model_params["spawn_interval"]["value"])


space_component = make_space_component(
    agent_portrayal, draw_grid=False, post_process=post_process
)

# Componente de gráficas para mostrar estadísticas de tráfico
lineplot_component = make_plot_component(
    {
        "active_cars": "blue",
        "arrived_cars": "green",
        "total_cars": "red",
        "active_pedestrians": "purple",
        "arrived_pedestrians": "orange",
    },
    post_process=post_process_lines,
)

page = SolaraViz(
    model,
    components=[space_component, lineplot_component],
    model_params=model_params,
    name="City Traffic Model",
)