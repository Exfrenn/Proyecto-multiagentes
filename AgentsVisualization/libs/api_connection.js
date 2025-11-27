/*
 * Functions to connect to an external API to get the coordinates of agents
 *
 * Gilberto Echeverria
 * 2025-11-08
 */


'use strict';

import { Object3D } from './object3d.js';

// Define the agent server URI
const agent_server_uri = "http://localhost:8585/";

// Initialize arrays to store agents and obstacles
const agents = [];
const pedestrians = [];
const obstacles = [];
const trafficLights = [];
const roads = [];
const destinations = [];
const sidewalks = [];
const pedestrianWalks = [];

// Define the data object
const initData = {
    NAgents: 20,
    width: 30,
    height: 30
};


/* FUNCTIONS FOR THE INTERACTION WITH THE MESA SERVER */

/*
 * Initializes the agents model by sending a POST request to the agent server.
 */
async function initAgentsModel() {
    try {
        // Send a POST request to the agent server to initialize the model
        let response = await fetch(agent_server_uri + "init", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(initData)
        });

        // Check if the response was successful
        if (response.ok) {
            // Parse the response as JSON and log the message
            let result = await response.json();
            console.log(result.message);
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }

    } catch (error) {
        // Log any errors that occur during the request
        console.log(error);
    }
}

/*
 * Retrieves the current positions of all agents from the agent server.
 */
async function getAgents() {
    try {
        // Send a GET request to the agent server to retrieve the agent positions
        let response = await fetch(agent_server_uri + "getAgents");

        // Check if the response was successful
        if (response.ok) {
            // Parse the response as JSON
            let result = await response.json();

            // Check if the agents array is empty
            if (agents.length == 0) {
                // Create new agents and add them to the agents array
                for (const agent of result.agentpos) {
                    const newAgent = new Object3D(agent.id, [agent.x, agent.y, agent.z]);
                    // Store the initial position
                    newAgent['oldPosArray'] = newAgent.posArray;
                    agents.push(newAgent);
                }
            } else {
                // Update the positions of existing agents
                for (const agent of result.agentpos) {
                    const current_agent = agents.find((object3d) => object3d.id == agent.id);

                    // Check if the agent exists in the agents array
                    if (current_agent != undefined) {
                        // Update the agent's position
                        current_agent.oldPosArray = current_agent.posArray;
                        current_agent.position = { x: agent.x, y: agent.y, z: agent.z };
                    } else {
                        // NEW AGENT: Create and add to the array
                        // console.log(`🆕 New agent detected: ${agent.id}`);
                        const newAgent = new Object3D(agent.id, [agent.x, agent.y, agent.z]);
                        newAgent['oldPosArray'] = newAgent.posArray;
                        agents.push(newAgent);
                    }
                }
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }

    } catch (error) {
        // Log any errors that occur during the request
        console.log(error);
    }
}

/*
 * Retrieves the current positions of all obstacles from the agent server.
 */
async function getObstacles() {
    try {
        // Send a GET request to the agent server to retrieve the obstacle positions
        let response = await fetch(agent_server_uri + "getObstacles");

        // Check if the response was successful
        if (response.ok) {
            // Parse the response as JSON
            let result = await response.json();

            // Create new obstacles and add them to the obstacles array
            for (const obstacle of result.obstaclepos) {
                const newObstacle = new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z]);
                obstacles.push(newObstacle);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }

    } catch (error) {
        // Log any errors that occur during the request
        console.log(error);
    }
}

async function getTrafficLights() {
    try {
        let response = await fetch(agent_server_uri + "getTrafficLights");
        if (response.ok) {
            let result = await response.json();
            for (const tf of result.TrafficLightpos) {
                const newTF = new Object3D(tf.id, [tf.x, tf.y, tf.z]);
                trafficLights.push(newTF);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getRoads() {
    try {
        let response = await fetch(agent_server_uri + "getRoads");
        if (response.ok) {
            let result = await response.json();
            for (const road of result.Roadpos) {
                const newRoad = new Object3D(road.id, [road.x, road.y, road.z]);
                roads.push(newRoad);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getDestinations() {
    try {
        let response = await fetch(agent_server_uri + "getDestinations");
        if (response.ok) {
            let result = await response.json();
            for (const dest of result.Destinationpos) {
                const newDest = new Object3D(dest.id, [dest.x, dest.y, dest.z]);
                destinations.push(newDest);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getSidewalks() {
    try {
        let response = await fetch(agent_server_uri + "getSidewalks");
        if (response.ok) {
            let result = await response.json();
            for (const sw of result.Sidewalkpos) {
                const newSW = new Object3D(sw.id, [sw.x, sw.y, sw.z]);
                sidewalks.push(newSW);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getPedestrianWalks() {
    try {
        let response = await fetch(agent_server_uri + "getPedestrianWalks");
        if (response.ok) {
            let result = await response.json();
            for (const pw of result.PedestrianWalkpos) {
                const newPW = new Object3D(pw.id, [pw.x, pw.y, pw.z]);
                pedestrianWalks.push(newPW);
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }
    } catch (error) {
        console.log(error);
    }
}

async function getPedestrians() {
    try {
        // Call the correct endpoint
        let response = await fetch(agent_server_uri + "getPedestrians");

        if (response.ok) {
            let result = await response.json();

            // result MUST contain: result.Pedestrianpos
            const pedList = result.Pedestrianpos;

            if (pedestrians.length === 0) {
                // First time → create Object3D for all pedestrians
                for (const ped of pedList) {
                    const newPed = new Object3D(ped.id, [ped.x, ped.y, ped.z]);
                    newPed.oldPosArray = newPed.posArray;
                    pedestrians.push(newPed);
                }
            } else {
                // Update positions or add new pedestrian
                for (const ped of pedList) {
                    let currentPed = pedestrians.find((p) => p.id == ped.id);

                    if (currentPed) {
                        // Update existing pedestrian
                        currentPed.oldPosArray = currentPed.posArray;
                        currentPed.position = { x: ped.x, y: ped.y, z: ped.z };
                    } else {
                        // Add new pedestrian dynamically
                        const newPed = new Object3D(ped.id, [ped.x, ped.y, ped.z]);
                        newPed.oldPosArray = newPed.posArray;
                        pedestrians.push(newPed);
                    }
                }
            }
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }

    } catch (error) {
        console.log(error);
    }
}


/*
 * Updates the agent positions by sending a request to the agent server.
 */
async function update() {
    try {
        // Send a request to the agent server to update the agent positions
        let response = await fetch(agent_server_uri + "update");

        // Check if the response was successful
        if (response.ok) {
            // Retrieve the updated agent positions
            await getAgents();
            // Retrieve the updated pedestrian positions
            await getPedestrians();
            // Log a message indicating that the agents have been updated
            //console.log("Updated agents");
        } else {
            let result = await response.json();
            console.log("Error:", result.message, result.error);
        }

    } catch (error) {
        // Log any errors that occur during the request
        console.log(error);
    }
}

export { agents, pedestrians, obstacles, trafficLights, roads, destinations, sidewalks, pedestrianWalks, initAgentsModel, update, getAgents, getObstacles, getTrafficLights, getRoads, getDestinations, getSidewalks, getPedestrianWalks, getPedestrians };