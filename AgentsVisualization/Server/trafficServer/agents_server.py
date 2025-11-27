from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from trafficAgents.traffic_base.model import CityModel
from trafficAgents.traffic_base.agent import Car, Road, Traffic_Light, Obstacle, Destination, Sidewalk, PedestrianWalk, Pedestrian

noa = 10
width = 30
height = 30
city_model = None
currentStep = 0

app = Flask("Traffic Base")
CORS(app, origins = ["http://localhost"])

@app.route('/init', methods = ['GET', 'POST'])
@cross_origin()
def initModel():
    global currentStep, city_model, noa

    if request.method == 'POST':
        try:
            noa = int(request.json['NAgents'])
            city_model = CityModel(initial_agents_count=noa)
            currentStep = 0
        except Exception as e:
            print(e)
            return jsonify({"message": "Error initializing model", "error": str(e)}), 500
    elif request.method == 'GET':
        city_model = CityModel(initial_agents_count=noa)
        currentStep = 0

    print(f"Model parameters: {noa,width,height}")
    
    return jsonify({"message": "Model initialized"}), 200


@app.route('/getAgents', methods = ['GET'])
@cross_origin()
def getAgents():
    global city_model
    try:
        agentCells = city_model.grid.all_cells.select(
            lambda cell: any(isinstance(obj, Car) for obj in cell.agents)
        ).cells 

        agents = [
            (cell.coordinate, agent)
            for cell in agentCells
            for agent in cell.agents
            if isinstance(agent, Car)
        ]

        agentPositions = [
            {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1], "orientation": a.orientation}
            for coordinate, a in agents
        ]

        return jsonify({"agentpos": agentPositions})
    except Exception as e:
        print(e)
        return jsonify({"message": "Error getting agents positions", "error": str(e)}), 500    

@app.route("/getObstacles", methods = ['GET'])
@cross_origin()
def getObstacles():
    global city_model
    
    if request.method == "GET":
        try:
            obstacleCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Obstacle) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in obstacleCells
                for agent in cell.agents
                if isinstance(agent, Obstacle)
            ]

            obstaclePositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1]}
                for (coordinate, a) in agents
            ]

            return jsonify({"obstaclepos": obstaclePositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting obstacles positions", "error": str(e)}), 500

@app.route("/getTrafficLights", methods = ['GET'])
@cross_origin()
def getTrafficLights():
    global city_model
    
    if request.method == "GET":
        try:
            TrafficLightCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Traffic_Light) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in TrafficLightCells
                for agent in cell.agents
                if isinstance(agent, Traffic_Light)
            ]

            TrafficLightPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1], "state": a.state, "time_remaining": a.time_remaining}
                for (coordinate, a) in agents
            ]

            return jsonify({"TrafficLightpos": TrafficLightPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting traffic lights positions", "error": str(e)}), 500


@app.route("/getRoads", methods = ['GET'])
@cross_origin()
def getRoads():
    global city_model
    
    if request.method == "GET":
        try:
            RoadCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Road) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in RoadCells
                for agent in cell.agents
                if isinstance(agent, Road)
            ]

            RoadPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1]}
                for (coordinate, a) in agents
            ]

            return jsonify({"Roadpos": RoadPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting roads positions", "error": str(e)}), 500


@app.route("/getDestinations", methods = ['GET'])
@cross_origin()
def getDestinations():
    global city_model
    
    if request.method == "GET":
        try:
            DestinationCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Destination) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in DestinationCells
                for agent in cell.agents
                if isinstance(agent, Destination)
            ]

            DestinationPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1]}
                for (coordinate, a) in agents
            ]

            return jsonify({"Destinationpos": DestinationPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting destinations positions", "error": str(e)}), 500

@app.route("/getSidewalks", methods = ['GET'])
@cross_origin()
def getSidewalks():
    global city_model
    
    if request.method == "GET":
        try:
            SidewalkCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Sidewalk) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in SidewalkCells
                for agent in cell.agents
                if isinstance(agent, Sidewalk)
            ]

            SidewalkPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1]}
                for (coordinate, a) in agents
            ]

            return jsonify({"Sidewalkpos": SidewalkPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting sidewalks positions", "error": str(e)}), 500

@app.route("/getPedestrianWalks", methods = ['GET'])
@cross_origin()
def getPedestrianWalks():
    global city_model
    
    if request.method == "GET":
        try:
            PedestrianWalkCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, PedestrianWalk) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in PedestrianWalkCells
                for agent in cell.agents
                if isinstance(agent, PedestrianWalk)
            ]

            PedestrianWalkPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1]}
                for (coordinate, a) in agents
            ]

            return jsonify({"PedestrianWalkpos": PedestrianWalkPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting pedestrian walks positions", "error": str(e)}), 500


@app.route("/getPedestrians", methods = ['GET'])
@cross_origin()
def getPedestrians():
    global city_model
    
    if request.method == "GET":
        try:
            PedestrianCells = city_model.grid.all_cells.select(
                lambda cell: any(isinstance(obj, Pedestrian) for obj in cell.agents)
            ).cells

            agents = [
                (cell.coordinate, agent)
                for cell in PedestrianCells
                for agent in cell.agents
                if isinstance(agent, Pedestrian)
            ]

            PedestrianPositions = [
                {"id": str(a.unique_id), "x":coordinate[0], "y":1, "z":coordinate[1], "orientation": a.orientation}
                for (coordinate, a) in agents
            ]

            return jsonify({"Pedestrianpos": PedestrianPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error getting pedestrians positions", "error": str(e)}), 500

@app.route("/update", methods = ["GET"])
@cross_origin()
def updateModel():
    global currentStep, city_model
    
    if request.method == "GET":
        print("--------------------DEBUG----------------------")
        print(city_model)
        try:
            city_model.step()
            currentStep += 1
            
            # Calculate statistics from agents
            active_cars = sum(1 for agent in city_model.agents if isinstance(agent, Car) and agent.is_active())
            arrived_cars = sum(1 for agent in city_model.agents if isinstance(agent, Car) and agent.is_arrived())
            total_cars = sum(1 for agent in city_model.agents if isinstance(agent, Car))
            
            active_pedestrians = sum(1 for agent in city_model.agents if isinstance(agent, Pedestrian) and agent.is_active())
            arrived_pedestrians = sum(1 for agent in city_model.agents if isinstance(agent, Pedestrian) and agent.is_arrived())
            total_pedestrians = sum(1 for agent in city_model.agents if isinstance(agent, Pedestrian))
            
            print("Active cars: ", active_cars)
            print("Arrived cars: ", arrived_cars)
            print("Total cars: ", total_cars)
            print("Active pedestrians: ", active_pedestrians)
            print("Arrived pedestrians: ", arrived_pedestrians)
            print("Total pedestrians: ", total_pedestrians)
            
            return jsonify({
                "message": f"Model updated to step {currentStep}",
                "stats": {
                    "active_cars": active_cars,
                    "arrived_cars": arrived_cars,
                    "total_cars": total_cars,
                    "active_pedestrians": active_pedestrians,
                    "arrived_pedestrians": arrived_pedestrians,
                    "total_pedestrians": total_pedestrians
                }
            })
        except Exception as e:
            print(e)
            return jsonify({"message": "Error updating model", "error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="localhost", port=8585, debug=True)