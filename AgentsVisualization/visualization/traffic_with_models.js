'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';
import { loadObj } from '../libs/obj_loader.js';
import { Light3D } from '../libs/light3d';

// Functions and arrays for the communication with the API
import {
    agents, obstacles, initAgentsModel,
    update, getAgents, getObstacles, getRoads,
    roads, getDestinations, destinations, getTrafficLights, trafficLights,
    getSidewalks, sidewalks, getPedestrianWalks, pedestrianWalks
} from '../libs/api_connection.js';

// Define the shader code, using GLSL 3.00
import vsGLSL from '../assets/shaders/vs_phong.glsl?raw';
import fsGLSL from '../assets/shaders/fs_phong.glsl?raw';

const scene = new Scene3D();

// Global variables
let colorProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;

const settings = {
    rotationSpeed: {
        x: 0,
        y: 0,
        z: 0
    },
    camera: {
        distance: 27.4,
        azimuth: 1.98,
        elevation: 1.27,
        targetX: 20.0,
        targetY: -3.0,
        targetZ: 10.0
    }
};

// Store geometry for dynamic agents
const agentGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Store geometry for traffic lights
const trafficLightGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Store geometry for the bulb
const bulbGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Main function is async to be able to make the requests
async function main() {
    // Setup the canvas area
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Prepare the program with the shaders
    colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

    // Initialize bulb geometry (simple cube)
    const bulbObject = new Object3D("bulb_geom");
    bulbObject.prepareVAO(gl, colorProgramInfo);
    bulbGeometry.arrays = bulbObject.arrays;
    bulbGeometry.bufferInfo = bulbObject.bufferInfo;
    bulbGeometry.vao = bulbObject.vao;

    // Load car model
    const carArrays = await loadModel('../assets/models/car-2024-301.obj');

    // Add color data to the model (magenta for cars)
    const numVertices = carArrays.a_position.data.length / 3;
    const colorData = [];
    for (let i = 0; i < numVertices; i++) {
        colorData.push(1.0, 0.0, 1.0, 1.0); // RGBA - Magenta
    }
    carArrays.a_color.data = colorData;

    const carModel = createBufferAndVAO(gl, colorProgramInfo, carArrays);

    // Guardar para uso posterior
    agentGeometry.arrays = carModel.arrays;
    agentGeometry.bufferInfo = carModel.bufferInfo;
    agentGeometry.vao = carModel.vao;

    // Load traffic light model
    const stoplightArrays = await loadModel('../assets/models/stoplight_1.obj');

    // Add color data to the stoplight model (gray/dark for now)
    const numStoplightVertices = stoplightArrays.a_position.data.length / 3;
    const stoplightColorData = [];
    for (let i = 0; i < numStoplightVertices; i++) {
        stoplightColorData.push(0.3, 0.3, 0.3, 1.0); // RGBA - Dark gray
    }
    stoplightArrays.a_color.data = stoplightColorData;

    const stoplightModel = createBufferAndVAO(gl, colorProgramInfo, stoplightArrays);

    // Guardar geometría del semáforo
    trafficLightGeometry.arrays = stoplightModel.arrays;
    trafficLightGeometry.bufferInfo = stoplightModel.bufferInfo;
    trafficLightGeometry.vao = stoplightModel.vao;

    // Initialize the agents model
    await initAgentsModel();

    // Get the agents and obstacles
    await getAgents();
    await getObstacles();
    await getRoads();
    await getDestinations();
    await getSidewalks();
    await getPedestrianWalks();
    await getTrafficLights();

    // Assign orientations to traffic lights to create opposing pairs
    assignTrafficLightOrientations();



    // Initialize the scene
    setupScene();

    // Position the objects in the scene
    setupObjects(scene, gl, colorProgramInfo);

    // Prepare the user interface
    setupUI();

    // Fisrt call to the drawing loop
    drawScene();
}

// Assign orientations to traffic lights to create opposing pairs
function assignTrafficLightOrientations() {
    const processed = new Set();

    for (let i = 0; i < trafficLights.length; i++) {
        if (processed.has(i)) continue;

        const tl = trafficLights[i];
        let foundPair = false;

        // Look for nearby traffic light to form a pair
        for (let j = i + 1; j < trafficLights.length; j++) {
            if (processed.has(j)) continue;

            const other = trafficLights[j];
            const dx = Math.abs(tl.position.x - other.position.x);
            const dz = Math.abs(tl.position.z - other.position.z);

            // If close and aligned on same axis, they're a pair
            if ((dx <= 3 && dz === 0) || (dz <= 3 && dx === 0)) {
                if (dx > dz) {
                    // Horizontal pair
                    if (tl.position.x < other.position.x) {
                        tl.orientation = "Right";
                        other.orientation = "Left";
                    } else {
                        tl.orientation = "Left";
                        other.orientation = "Right";
                    }
                } else {
                    // Vertical pair
                    if (tl.position.z < other.position.z) {
                        tl.orientation = "Up";
                        other.orientation = "Down";
                    } else {
                        tl.orientation = "Down";
                        other.orientation = "Up";
                    }
                }
                processed.add(i);
                processed.add(j);
                foundPair = true;
                break;
            }
        }

        // Default if no pair found
        if (!foundPair) {
            tl.orientation = "Left";
            processed.add(i);
        }
    }
}

function setupScene() {
    let camera = new Camera3D(0,
        settings.camera.distance,      // Distance to target
        settings.camera.azimuth,       // Azimut
        settings.camera.elevation,     // Elevation
        [0, 0, 10],                    // Initial position
        [settings.camera.targetX, settings.camera.targetY, settings.camera.targetZ]); // Target
    scene.setCamera(camera);
    scene.camera.setupControls();

    // Add a light to the scene
    let light = new Light3D(0, [15, 15, 15],           // Position
        [0.5, 0.5, 0.5, 1.0],   // Ambient
        [1.0, 1.0, 1.0, 1.0],   // Diffuse
        [1.0, 1.0, 1.0, 1.0]);  // Specular
    scene.addLight(light);
}

function setupObjects(scene, gl, programInfo) {
    // Create VAOs for the different shapes
    const baseCube = new Object3D(-1);
    baseCube.prepareVAO(gl, programInfo);

    // AGENTS (cars) - Magenta
    for (const agent of agents) {
        agent.arrays = agentGeometry.arrays;
        agent.bufferInfo = agentGeometry.bufferInfo;
        agent.vao = agentGeometry.vao;
        agent.scale = { x: 0.2, y: 0.2, z: 0.2 };
        agent.color = [1.0, 0.0, 1.0, 1.0]; // Magenta
        agent.isDynamic = true; // Mark as dynamic for updates
        scene.addObject(agent);
    }

    // OBSTACLES (buildings) - Gray
    for (const agent of obstacles) {
        agent.arrays = baseCube.arrays;
        agent.bufferInfo = baseCube.bufferInfo;
        agent.vao = baseCube.vao;
        agent.scale = { x: 0.5, y: 5, z: 0.5 };
        agent.color = [0.6, 0.6, 0.6, 1.0]; // Gray
        scene.addObject(agent);
    }

    // ROADS - Dark gray
    for (const road of roads) {
        road.arrays = baseCube.arrays;
        road.bufferInfo = baseCube.bufferInfo;
        road.vao = baseCube.vao;
        road.scale = { x: 1.0, y: 0.05, z: 1.0 };
        road.color = [0.2, 0.2, 0.2, 1.0]; // Dark gray
        scene.addObject(road);
    }

    // SIDEWALKS - Light gray
    for (const sidewalk of sidewalks) {
        sidewalk.arrays = baseCube.arrays;
        sidewalk.bufferInfo = baseCube.bufferInfo;
        sidewalk.vao = baseCube.vao;
        sidewalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        sidewalk.color = [0.8, 0.8, 0.8, 1.0]; // Light gray
        scene.addObject(sidewalk);
    }

    // PEDESTRIAN WALKS - Yellow
    for (const pedestrianWalk of pedestrianWalks) {
        pedestrianWalk.arrays = baseCube.arrays;
        pedestrianWalk.bufferInfo = baseCube.bufferInfo;
        pedestrianWalk.vao = baseCube.vao;
        pedestrianWalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        pedestrianWalk.color = [1.0, 1.0, 0.0, 1.0]; // Yellow
        scene.addObject(pedestrianWalk);
    }

    // DESTINATIONS - Green
    for (const destination of destinations) {
        destination.arrays = baseCube.arrays;
        destination.bufferInfo = baseCube.bufferInfo;
        destination.vao = baseCube.vao;
        destination.scale = { x: 0.5, y: 0.08, z: 0.5 };
        destination.color = [0.0, 1.0, 0.0, 1.0]; // Green
        scene.addObject(destination);
    }

    // TRAFFIC LIGHTS - 3D Model
    for (const trafficLight of trafficLights) {
        trafficLight.arrays = trafficLightGeometry.arrays;
        trafficLight.bufferInfo = trafficLightGeometry.bufferInfo;
        trafficLight.vao = trafficLightGeometry.vao;
        trafficLight.scale = { x: 0.5, y: 0.5, z: 0.5 };
        // trafficLight.color is already set in the model loader or defaults
        scene.addObject(trafficLight);
    }
}

function updateSceneAgents() {
    // Use the global geometry
    if (!agentGeometry.vao) {
        console.warn("Agent geometry not initialized");
        return;
    }

    // 1. Add new agents
    for (const agent of agents) {
        const existsInScene = scene.objects.find(obj => obj.id == agent.id);
        if (!existsInScene) {
            // Copy visual properties from global geometry
            agent.arrays = agentGeometry.arrays;
            agent.bufferInfo = agentGeometry.bufferInfo;
            agent.vao = agentGeometry.vao;

            // Set appearance (matching setupObjects)
            agent.scale = { x: 0.2, y: 0.2, z: 0.2 };
            agent.color = [1.0, 0.0, 1.0, 1.0]; // Magenta for cars
            agent.isDynamic = true; // Mark as dynamic

            scene.addObject(agent);
        }
    }

    // 2. Remove dead agents
    // Filter scene.objects to remove dynamic objects that are no longer in the agents list
    scene.objects = scene.objects.filter(obj => {
        if (obj.isDynamic) {
            // Check if this agent ID is still in the global 'agents' list
            const stillActive = agents.some(a => a.id == obj.id);
            return stillActive;
        }
        return true; // Keep static objects
    });
}

// Convert orientation string to rotation angle (in radians)
function getRotationFromOrientation(orientation) {
    // The car model faces EAST by default, we rotate around Y axis
    switch (orientation) {
        case "Up":
            return -Math.PI / 2;         // -90° - rotate left from East to face North
        case "Down":
            return Math.PI / 2;          // 90° - rotate right from East to face South
        case "Left":
            return Math.PI;              // 180° - rotate backwards from East to face West
        case "Right":
            return 0;                    // 0° - already facing East
        default:
            return 0;
    }
}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Prepare the vector for translation and scale
    // Add 0.5 offset to center objects in their grid cell
    let v3_tra = [
        object.posArray[0] + 0.5,
        object.posArray[1],
        object.posArray[2] + 0.5
    ];
    let v3_sca = object.scaArray;

    // Create the individual transform matrices
    const scaMat = M4.scale(v3_sca);
    const rotXMat = M4.rotationX(object.rotRad.x);

    // Apply orientation-based rotation for cars (around Y axis)
    let rotYAngle = object.rotRad.y;
    if (object.orientation) {
        rotYAngle += getRotationFromOrientation(object.orientation);
    }
    const rotYMat = M4.rotationY(rotYAngle);

    const rotZMat = M4.rotationZ(object.rotRad.z);
    const traMat = M4.translation(v3_tra);

    // Create the composite matrix with all transformations
    let transforms = M4.identity();
    transforms = M4.multiply(scaMat, transforms);
    transforms = M4.multiply(rotXMat, transforms);
    transforms = M4.multiply(rotYMat, transforms);
    transforms = M4.multiply(rotZMat, transforms);
    transforms = M4.multiply(traMat, transforms);

    object.matrix = transforms;

    // Apply the projection to the final matrix for the
    // World-View-Projection
    const wvpMat = M4.multiply(viewProjectionMatrix, transforms);

    // The matrix to be used for normal transformations
    const normalMat = M4.transpose(M4.inverse(object.matrix));

    // Model uniforms
    let objectUniforms = {
        u_world: object.matrix,
        u_worldInverseTransform: normalMat,
        u_worldViewProjection: wvpMat,
        u_ambientColor: object.color,
        u_diffuseColor: object.color,
        u_specularColor: [1.0, 1.0, 1.0, 1.0],
        u_shininess: 50.0
    }
    twgl.setUniforms(programInfo, objectUniforms);

    gl.bindVertexArray(object.vao);
    twgl.drawBufferInfo(gl, object.bufferInfo);
}

// Function to do the actual display of the objects
async function drawScene() {
    // Compute time elapsed since last frame
    let now = Date.now();
    let deltaTime = now - then;
    elapsed += deltaTime;
    let fract = Math.min(1.0, elapsed / duration);
    then = now;

    // Clear the canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // tell webgl to cull faces
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    scene.camera.checkKeys();
    //console.log(scene.camera);
    const viewProjectionMatrix = setupViewProjection(gl);

    // Draw the objects
    gl.useProgram(colorProgramInfo.program);

    // Scene uniforms
    const light = scene.lights[0];
    let globalUniforms = {
        u_lightWorldPosition: light.posArray,
        u_viewWorldPosition: scene.camera.posArray,
        u_ambientLight: light.ambient,
        u_diffuseLight: light.diffuse,
        u_specularLight: light.specular
    }
    twgl.setUniforms(colorProgramInfo, globalUniforms);

    for (let object of scene.objects) {
        drawObject(gl, colorProgramInfo, object, viewProjectionMatrix, fract);
    }

    // Draw traffic light bulbs
    drawTrafficLightBulbs(gl, colorProgramInfo, viewProjectionMatrix);

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        updateSceneAgents();
    }

    requestAnimationFrame(drawScene);
}

// Helper to draw traffic light bulbs
function drawTrafficLightBulbs(gl, programInfo, viewProjectionMatrix) {
    if (!bulbGeometry.vao) return;

    // Create a temporary object for the bulb
    // We'll use a small scale for the bulb
    const bulbScale = { x: 0.15, y: 0.15, z: 0.15 };

    for (const tl of trafficLights) {
        // Determine color based on state
        // Assuming state is boolean: true = Green, false = Red
        // Or string: "Green", "Red"
        let color = [1.0, 0.0, 0.0, 1.0]; // Default Red
        let offset = { x: 0, y: 0, z: 0 };

        // Check state (adjust logic based on actual server data)
        // Adjust heights based on your specific traffic light model
        if (tl.state === true || tl.state === "Green" || tl.state === "green") {
            color = [0.0, 1.0, 0.0, 1.0]; // Green
            // Green light position (lower)
            offset = { x: 0, y: 2.2, z: 0 };
        } else {
            color = [1.0, 0.0, 0.0, 1.0]; // Red
            // Red light position (higher)
            offset = { x: 0, y: 2.6, z: 0 };
        }

        // Create the bulb object at the calculated position
        const bulb = new Object3D("bulb", [
            tl.position.x + offset.x,
            tl.position.y + offset.y,
            tl.position.z + offset.z
        ]);

        bulb.scale = bulbScale;
        bulb.color = color;

        // Use bulb geometry
        bulb.arrays = bulbGeometry.arrays;
        bulb.bufferInfo = bulbGeometry.bufferInfo;
        bulb.vao = bulbGeometry.vao;

        drawObject(gl, programInfo, bulb, viewProjectionMatrix, 0);
    }
}

function setupViewProjection(gl) {
    // Field of view of 60 degrees vertically, in radians
    const fov = 60 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

    // Matrices for the world view
    const projectionMatrix = M4.perspective(fov, aspect, 1, 200);

    const cameraPosition = scene.camera.posArray;
    const target = scene.camera.targetArray;
    const up = [0, 1, 0];

    const cameraMatrix = M4.lookAt(cameraPosition, target, up);
    const viewMatrix = M4.inverse(cameraMatrix);
    const viewProjectionMatrix = M4.multiply(projectionMatrix, viewMatrix);

    return viewProjectionMatrix;
}

// Setup a ui.
function setupUI() {
    const gui = new GUI();

    // Settings for the camera
    const camFolder = gui.addFolder('Camera Controls');

    // Distance (Zoom)
    camFolder.add(settings.camera, 'distance', 5, 50)
        .decimals(1)
        .name('Distance (Zoom)')
        .onChange((value) => {
            scene.camera.distance = value;
        });

    // Azimuth (Horizontal rotation)
    camFolder.add(settings.camera, 'azimuth', 0, Math.PI * 2)
        .decimals(2)
        .name('Azimuth (Horizontal)')
        .onChange((value) => {
            scene.camera.azimuth = value;
        });

    // Elevation (Vertical rotation)
    camFolder.add(settings.camera, 'elevation', -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1)
        .decimals(2)
        .name('Elevation (Vertical)')
        .onChange((value) => {
            scene.camera.elevation = value;
        });

    // Target position
    const targetFolder = camFolder.addFolder('Target Position');
    targetFolder.add(settings.camera, 'targetX', -20, 20)
        .decimals(1)
        .name('Target X')
        .onChange((value) => {
            scene.camera.target.x = value;
        });

    targetFolder.add(settings.camera, 'targetY', -10, 10)
        .decimals(1)
        .name('Target Y')
        .onChange((value) => {
            scene.camera.target.y = value;
        });

    targetFolder.add(settings.camera, 'targetZ', -20, 20)
        .decimals(1)
        .name('Target Z')
        .onChange((value) => {
            scene.camera.target.z = value;
        });

    camFolder.open();
}

//Load a .obj model from a file path
async function loadModel(path) {
    console.log(`📦 Loading model: ${path}`);
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.statusText}`);
        }
        const objText = await response.text();
        const arrays = loadObj(objText);
        console.log(`✅ Loaded ${path}`);
        return arrays;
    } catch (error) {
        console.error(`❌ Error loading ${path}:`, error);
        throw error;
    }
}

//Create buffer and VAO from arrays
function createBufferAndVAO(gl, programInfo, arrays) {
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);
    return { arrays, bufferInfo, vao };
}



main();
