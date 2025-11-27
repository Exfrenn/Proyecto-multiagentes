from threading import current_thread
from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
from trafficBase.model import CityModel
from trafficBase.agent import Car, Road, Traffic_Light, Obstacle, Destination, Sidewalk, PedestrianWalk

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
            city_model = CityModel(N=noa)
            currentStep = 0
        except Exception as e:
            print(e)
            return jsonify({"message": "Error initializing model", "error": str(e)}), 500
    elif request.method == 'GET':
        city_model = CityModel(N=noa)
        currentStep = 0

        # Return a message to Unity saying that the model was created successfully
        return jsonify({"message":"Parameters recieved, model initiated."})

# This route will be used to get the positions of the agents
#@app.route('/getAgents', methods=['GET'])
#def getAgents():
    #global randomModel

    #if request.method == 'GET':
        ## Get the positions of the agents and return them to Unity in JSON format.
        ## Note that the positions are sent as a list of dictionaries, where each dictionary has the id and position of an agent.
        ## The y coordinate is set to 1, since the agents are in a 3D world. The z coordinate corresponds to the row (y coordinate) of the grid in mesa.
        #agentPositions = [{"id": str(a.unique_id), "x": x, "y":1, "z":z} for a, (x, z) in randomModel.grid.coord_iter() if isinstance(a, RandomAgent)]

        #return jsonify({'positions':agentPositions})

## This route will be used to get the positions of the obstacles
#@app.route('/getObstacles', methods=['GET'])
#def getObstacles():
    #global randomModel

    #if request.method == 'GET':
        ## Get the positions of the obstacles and return them to Unity in JSON format.
        ## Same as before, the positions are sent as a list of dictionaries, where each dictionary has the id and position of an obstacle.
        #carPositions = [{"id": str(a.unique_id), "x": x, "y":1, "z":z} for a, (x, z) in randomModel.grid.coord_iter() if isinstance(a, ObstacleAgent)]

        #return jsonify({'positions':carPositions})

## This route will be used to update the model
#@app.route('/update', methods=['GET'])
#def updateModel():
    #global currentStep, randomModel
    #if request.method == 'GET':
        ## Update the model and return a message to Unity saying that the model was updated successfully
        #randomModel.step()
        #currentStep += 1
        #return jsonify({'message':f'Model updated to step {currentStep}.', 'currentStep':currentStep})

if __name__ == "__main__":
    app.run(host="localhost", port=8585, debug=True)