'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';
import { loadObj } from '../libs/obj_loader.js';

// Functions and arrays for the communication with the API
import {
    agents, obstacles, initAgentsModel,
    update, getAgents, getObstacles, getRoads,
    roads, getDestinations, destinations, getTrafficLights, trafficLights,
    getSidewalks, sidewalks, getPedestrianWalks, pedestrianWalks,
    setSpawnInterval, setPedestriansEnabled, resetSimulation as apiResetSimulation, simulationSettings,
    pedestrians, getPedestrians
} from '../libs/api_connection.js';

// Define the shader code, using GLSL 3.00
import vsGLSL from '../assets/shaders/vs_color.glsl?raw';
import fsGLSL from '../assets/shaders/fs_color.glsl?raw';

const scene = new Scene3D();

// Global variables
let colorProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;

// UI Settings
const settings = {
    spawnRate: 10,  // Lower = faster spawning (spawn interval)
    pedestriansEnabled: true,
    seed: 42,
    rotationSpeed: { x: 0, y: 0, z: 0 },
    
    // Action functions for buttons
    resetSimulation: async function() {
        console.log("Resetting simulation...");
        const success = await apiResetSimulation(settings.seed);
        if (success) {
            // Clear the scene objects (keep only static elements like roads)
            scene.objects = scene.objects.filter(obj => {
                // Keep roads, obstacles, sidewalks, etc. (non-agent objects)
                return !agents.includes(obj) && !pedestrians.includes(obj);
            });
            
            // Reload static elements and agents
            await getObstacles();
            await getRoads();
            await getDestinations();
            await getSidewalks();
            await getPedestrianWalks();
            await getTrafficLights();
            await getAgents();
            await getPedestrians();
            
            // Re-setup objects
            setupObjects(scene, gl, colorProgramInfo);
            console.log("Simulation reset complete!");
        }
    },
    
    togglePedestrians: async function() {
        settings.pedestriansEnabled = !settings.pedestriansEnabled;
        await setPedestriansEnabled(settings.pedestriansEnabled);
        console.log(`Pedestrians ${settings.pedestriansEnabled ? 'enabled' : 'disabled'}`);
    }
};

// Store geometry for pedestrians
const pedestrianGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Store geometry for dynamic agents
const agentGeometry = {
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


    const carArrays = await loadModel('../assets/models/car-2024-301.obj');
    const carModel = createBufferAndVAO(gl, colorProgramInfo, carArrays);

    // Guardar para uso posterior
    agentGeometry.arrays = carModel.arrays;
    agentGeometry.bufferInfo = carModel.bufferInfo;
    agentGeometry.vao = carModel.vao;

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
    await getPedestrians();



    // Initialize the scene
    setupScene();

    // Position the objects in the scene
    setupObjects(scene, gl, colorProgramInfo);

    // Prepare the user interface
    setupUI();

    // Fisrt call to the drawing loop
    drawScene();
}

function setupScene() {
    let camera = new Camera3D(0,
        10,             // Distance to target
        4,              // Azimut
        0.8,              // Elevation
        [0, 0, 10],
        [0, 0, 0]);
    // These values are empyrical.
    // Maybe find a better way to determine them
    camera.panOffset = [0, 8, 0];
    scene.setCamera(camera);
    scene.camera.setupControls();
}

function setupObjects(scene, gl, programInfo) {
    // Create VAOs for the different shapes
    const baseCube = new Object3D(-1);
    baseCube.prepareVAO(gl, programInfo);


    // Helper function to create colored cube
    function createColoredCube(color) {
        const cube = new Object3D(-1);
        cube.prepareVAO(gl, programInfo);

        const numVertices = cube.arrays.a_color.data.length / 4;
        for (let i = 0; i < numVertices; i++) {
            const offset = i * 4;
            cube.arrays.a_color.data[offset + 0] = color[0];
            cube.arrays.a_color.data[offset + 1] = color[1];
            cube.arrays.a_color.data[offset + 2] = color[2];
            cube.arrays.a_color.data[offset + 3] = color[3];
        }

        cube.bufferInfo = twgl.createBufferInfoFromArrays(gl, cube.arrays);
        cube.vao = twgl.createVAOFromBufferInfo(gl, programInfo, cube.bufferInfo);
        return cube;
    }

    // AGENTS (cars) - Magenta
    for (const agent of agents) {
        agent.arrays = agentGeometry.arrays;
        agent.bufferInfo = agentGeometry.bufferInfo;
        agent.vao = agentGeometry.vao;
        agent.scale = { x: 0.2, y: 0.2, z: 0.2 };
        scene.addObject(agent);
    }

    // OBSTACLES (buildings) - Gray
    const obstacleCube = createColoredCube([0.8, 0.8, 0.8, 1.0]);
    for (const agent of obstacles) {
        agent.arrays = obstacleCube.arrays;
        agent.bufferInfo = obstacleCube.bufferInfo;
        agent.vao = obstacleCube.vao;
        agent.scale = { x: 0.5, y: 5, z: 0.5 };
        scene.addObject(agent);
    }

    // ROADS - Dark gray
    const roadCube = createColoredCube([0.2, 0.2, 0.2, 1.0]);
    for (const road of roads) {
        road.arrays = roadCube.arrays;
        road.bufferInfo = roadCube.bufferInfo;
        road.vao = roadCube.vao;
        road.scale = { x: 1.0, y: 0.05, z: 1.0 };
        scene.addObject(road);
    }

    // SIDEWALKS - Light gray
    const sidewalkCube = createColoredCube([0.6, 0.6, 0.6, 1.0]);
    for (const sidewalk of sidewalks) {
        sidewalk.arrays = sidewalkCube.arrays;
        sidewalk.bufferInfo = sidewalkCube.bufferInfo;
        sidewalk.vao = sidewalkCube.vao;
        sidewalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        scene.addObject(sidewalk);
    }

    // SIDEWALKS - Light gray
    const pedestrianWalkCube = createColoredCube([1.0, 1.0, 0.0, 1.0]);
    for (const pedestrianWalk of pedestrianWalks) {
        pedestrianWalk.arrays = pedestrianWalkCube.arrays;
        pedestrianWalk.bufferInfo = pedestrianWalkCube.bufferInfo;
        pedestrianWalk.vao = pedestrianWalkCube.vao;
        pedestrianWalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        scene.addObject(pedestrianWalk);
    }

    // DESTINATIONS - Green
    const destinationCube = createColoredCube([0.0, 1.0, 0.0, 1.0]);
    for (const destination of destinations) {
        destination.arrays = destinationCube.arrays;
        destination.bufferInfo = destinationCube.bufferInfo;
        destination.vao = destinationCube.vao;
        destination.scale = { x: 0.5, y: 0.08, z: 0.5 };
        scene.addObject(destination);
    }

    // PEDESTRIANS - Blue cubes
    const pedestrianCube = createColoredCube([0.2, 0.4, 1.0, 1.0]);
    pedestrianGeometry.arrays = pedestrianCube.arrays;
    pedestrianGeometry.bufferInfo = pedestrianCube.bufferInfo;
    pedestrianGeometry.vao = pedestrianCube.vao;
    
    for (const ped of pedestrians) {
        ped.arrays = pedestrianCube.arrays;
        ped.bufferInfo = pedestrianCube.bufferInfo;
        ped.vao = pedestrianCube.vao;
        ped.scale = { x: 0.15, y: 0.3, z: 0.15 };
        scene.addObject(ped);
    }
}

function checkForNewCars() {
    // Use the global geometry
    if (!agentGeometry.vao) {
        console.warn("Agent geometry not initialized");
        return;
    }

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

            scene.addObject(agent);
        }
    }
}

function checkForNewPedestrians() {
    // Use the pedestrian geometry
    if (!pedestrianGeometry.vao) {
        console.warn("Pedestrian geometry not initialized");
        return;
    }

    for (const ped of pedestrians) {
        const existsInScene = scene.objects.find(obj => obj.id == ped.id);
        if (!existsInScene) {
            // Copy visual properties from pedestrian geometry
            ped.arrays = pedestrianGeometry.arrays;
            ped.bufferInfo = pedestrianGeometry.bufferInfo;
            ped.vao = pedestrianGeometry.vao;

            // Set appearance - smaller blue cubes for pedestrians
            ped.scale = { x: 0.15, y: 0.3, z: 0.15 };

            scene.addObject(ped);
        }
    }
}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Prepare the vector for translation and scale
    let v3_tra = object.posArray;
    let v3_sca = object.scaArray;

    // Create the individual transform matrices
    const scaMat = M4.scale(v3_sca);
    const rotXMat = M4.rotationX(object.rotRad.x);
    const rotYMat = M4.rotationY(object.rotRad.y);
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

    // Model uniforms
    let objectUniforms = {
        u_transforms: wvpMat
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
    for (let object of scene.objects) {
        drawObject(gl, colorProgramInfo, object, viewProjectionMatrix, fract);
    }

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        checkForNewCars();
        checkForNewPedestrians();
    }

    requestAnimationFrame(drawScene);
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
    gui.title('Controls');
    
    // ========== CAMERA CONTROLS ==========
    const cameraFolder = gui.addFolder('Camera Controls');
    cameraFolder.add(scene.camera, 'distance', 10, 100, 0.1)
        .name('Distance (Zoom)')
        .listen();
    cameraFolder.add(scene.camera, 'azimuth', -Math.PI, Math.PI, 0.01)
        .name('Azimuth (Horizontal)')
        .listen();
    cameraFolder.add(scene.camera, 'elevation', -1.5, 1.5, 0.01)
        .name('Elevation (Vertical)')
        .listen();
    
    const targetFolder = gui.addFolder('Target Position');
    targetFolder.add(scene.camera.target, 'x', -50, 50, 0.1)
        .name('Target X')
        .listen();
    targetFolder.add(scene.camera.target, 'y', -50, 50, 0.1)
        .name('Target Y')
        .listen();
    targetFolder.add(scene.camera.target, 'z', -50, 50, 0.1)
        .name('Target Z')
        .listen();
    
    // ========== SIMULATION CONTROLS ==========
    const simFolder = gui.addFolder('Simulation Controls');
    
    // Spawn rate slider (1 = very fast, 30 = slow)
    simFolder.add(settings, 'spawnRate', 1, 30, 1)
        .name('Spawn Interval')
        .onChange(async (value) => {
            await setSpawnInterval(value);
            console.log(`Spawn interval set to ${value}`);
        });
    
    // Pedestrians toggle
    simFolder.add(settings, 'pedestriansEnabled')
        .name('Pedestrians Enabled')
        .onChange(async (value) => {
            await setPedestriansEnabled(value);
            console.log(`Pedestrians ${value ? 'enabled' : 'disabled'}`);
        });
    
    // Seed input
    simFolder.add(settings, 'seed', 1, 9999, 1)
        .name('Random Seed');
    
    // Reset button
    simFolder.add(settings, 'resetSimulation')
        .name('🔄 Reset Simulation');
    
    simFolder.open();
}

//Load a .obj model from a file path
async function loadModel(path) {
    console.log(`Loading model: ${path}`);
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}: ${response.statusText}`);
        }
        const objText = await response.text();
        const arrays = loadObj(objText);
        console.log(`Loaded ${path}`);
        return arrays;
    } catch (error) {
        console.error(`Error loading ${path}:`, error);
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
