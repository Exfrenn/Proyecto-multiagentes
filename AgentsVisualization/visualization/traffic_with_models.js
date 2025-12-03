'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';
import { loadObj, loadMtl } from '../libs/obj_loader.js';
import { Light3D } from '../libs/light3d';
import { cubeTextured, skyboxCube } from '../libs/shapes';

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
import vsGLSL from '../assets/shaders/vs_phong.glsl?raw';
import fsGLSL from '../assets/shaders/fs_phong.glsl?raw';
import vsTextureGLSL from '../assets/shaders/vs_phong_textures.glsl?raw';
import fsTextureGLSL from '../assets/shaders/fs_phong_textures.glsl?raw';
import vsSkyboxGLSL from '../assets/shaders/vs_flat_textures.glsl?raw';
import fsSkyboxGLSL from '../assets/shaders/fs_flat_textures.glsl?raw';

const scene = new Scene3D();

// Global variables
let colorProgramInfo = undefined;
let textureProgramInfo = undefined;
let skyboxProgramInfo = undefined;
let gl = undefined;
const duration = 1500; // ms
let elapsed = 0;
let then = 0;


// UI Settings
const settings = {
    spawnRate: 10,  // Lower = faster spawning (spawn interval)
    pedestriansEnabled: true,
    seed: 42,
    rotationSpeed: { x: 0, y: 0, z: 0 },

    // Camera settings
    camera: {
        distance: 27.4,
        azimuth: 1.98,
        elevation: 1.27,
        targetX: 20.0,
        targetY: -3.0,
        targetZ: 10.0
    },

    // Action functions for buttons
    resetSimulation: async function () {
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

    togglePedestrians: async function () {
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

// Store geometry for buildings
const buildingGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

/**
 * Interpolate between two positions using smooth interpolation
 * Formula: P(t) = P₀ + t(P₁ - P₀) with SmoothStep easing
 * @param {Object} prevPos - Previous position {x, y, z}
 * @param {Object} currentPos - Current position {x, y, z}
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {Array} Interpolated position [x, y, z]
 */
function interpolatePosition(prevPos, currentPos, t) {
    if (!prevPos || !currentPos) {
        return [
            currentPos.x + 0.5,
            currentPos.y,
            currentPos.z + 0.5
        ];
    }

    // SmoothStep for natural movement: t * t * (3 - 2 * t)
    const tSmooth = t * t * (3 - 2 * t);

    const x = prevPos.x + tSmooth * (currentPos.x - prevPos.x) + 0.5;
    const y = prevPos.y + tSmooth * (currentPos.y - prevPos.y);
    const z = prevPos.z + tSmooth * (currentPos.z - prevPos.z) + 0.5;

    return [x, y, z];
}

// Main function is async to be able to make the requests
async function main() {
    // Setup the canvas area
    const canvas = document.querySelector('canvas');
    gl = canvas.getContext('webgl2');
    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Prepare the program with the shaders
    // Prepare the program with the shaders
    colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);
    colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);
    textureProgramInfo = twgl.createProgramInfo(gl, [vsTextureGLSL, fsTextureGLSL]);
    skyboxProgramInfo = twgl.createProgramInfo(gl, [vsSkyboxGLSL, fsSkyboxGLSL]);

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
    const numVerticesSL = stoplightArrays.a_position.data.length / 3;
    const colorDataSL = [];
    for (let i = 0; i < numVerticesSL; i++) {
        colorDataSL.push(0.2, 0.2, 0.2, 1.0); // Dark Gray
    }
    stoplightArrays.a_color.data = colorDataSL;

    const stoplightModel = createBufferAndVAO(gl, colorProgramInfo, stoplightArrays);

    trafficLightGeometry.arrays = stoplightModel.arrays;
    trafficLightGeometry.bufferInfo = stoplightModel.bufferInfo;
    trafficLightGeometry.vao = stoplightModel.vao;

    // Load building model
    const buildingArrays = await loadModel('../assets/models/building_1.obj');
    const buildingModel = createBufferAndVAO(gl, colorProgramInfo, buildingArrays);

    buildingGeometry.arrays = buildingModel.arrays;
    buildingGeometry.bufferInfo = buildingModel.bufferInfo;
    buildingGeometry.vao = buildingModel.vao;

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

    // Setup skybox
    const skybox = new Object3D("skybox", [15, 0, 15]); // Center roughly in the middle of the city
    skybox.arrays = skyboxCube(1); // Use generated cube with UVs
    skybox.bufferInfo = twgl.createBufferInfoFromArrays(gl, skybox.arrays);
    skybox.vao = twgl.createVAOFromBufferInfo(gl, skyboxProgramInfo, skybox.bufferInfo);
    skybox.scale = { x: 50, y: 50, z: 50 }; // Large scale
    skybox.texture = twgl.createTexture(gl, {
        src: '../assets/textures/Skyboxes/Cubemap_Sky_08-512x512.png',
        min: gl.LINEAR,
        mag: gl.LINEAR,
        wrap: gl.CLAMP_TO_EDGE
    });
    skybox.programInfo = skyboxProgramInfo;
    scene.addObject(skybox);
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
        agent.isDynamic = true;
        scene.addObject(agent);
    }

    // OBSTACLES (buildings) - Varied solid colors
    const buildingColors = [
        [0.7, 0.6, 0.5, 1.0], // Beige
        [0.6, 0.7, 0.7, 1.0], // Light blue-gray
        [0.8, 0.7, 0.6, 1.0], // Light tan
        [0.5, 0.6, 0.6, 1.0], // Dark blue-gray
    ];

    for (let i = 0; i < obstacles.length; i++) {
        const agent = obstacles[i];
        agent.arrays = buildingGeometry.arrays;
        agent.bufferInfo = buildingGeometry.bufferInfo;
        agent.vao = buildingGeometry.vao;
        agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
        agent.color = buildingColors[i % buildingColors.length];
        scene.addObject(agent);
    }

    // ROADS - Dark gray
    // Load road texture
    const roadTexture = twgl.createTexture(gl, {
        min: gl.NEAREST,
        mag: gl.NEAREST,
        src: '../assets/textures/Road/asphalt.jpg'
    });

    // Load road texture
    const sidewalkTexture = twgl.createTexture(gl, {
        min: gl.NEAREST,
        mag: gl.NEAREST,
        src: '../assets/textures/Road/sidewalk1.jpg'
    });

    // Load road texture
    const pedestrianWalkTexture = twgl.createTexture(gl, {
        min: gl.NEAREST,
        mag: gl.NEAREST,
        src: '../assets/textures/Road/psidewalk.jpg'
    });

    // Load road texture
    const destinationTexture = twgl.createTexture(gl, {
        min: gl.NEAREST,
        mag: gl.NEAREST,
        src: '../assets/textures/Road/destination.jpg'
    });

    // Create textured cube for roads
    const roadCube = new Object3D(-1);
    roadCube.arrays = cubeTextured(1);
    roadCube.bufferInfo = twgl.createBufferInfoFromArrays(gl, roadCube.arrays);
    roadCube.vao = twgl.createVAOFromBufferInfo(gl, textureProgramInfo, roadCube.bufferInfo);

    for (const road of roads) {
        road.arrays = roadCube.arrays;
        road.bufferInfo = roadCube.bufferInfo;
        road.vao = roadCube.vao;
        road.scale = { x: 1.0, y: 0.05, z: 1.0 };
        road.color = [0.2, 0.2, 0.2, 1.0]; // Dark gray
        road.texture = roadTexture;
        road.programInfo = textureProgramInfo; // Use texture program
        scene.addObject(road);
    }

    // SIDEWALKS - Light gray
    for (const sidewalk of sidewalks) {
        sidewalk.arrays = roadCube.arrays;
        sidewalk.bufferInfo = roadCube.bufferInfo;
        sidewalk.vao = roadCube.vao;
        sidewalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        sidewalk.color = [0.8, 0.8, 0.8, 1.0]; // Light gray
        sidewalk.texture = sidewalkTexture;
        sidewalk.programInfo = textureProgramInfo; // Use texture program
        scene.addObject(sidewalk);
    }

    // PEDESTRIAN WALKS - Yellow
    // Helper to check for neighbors
    const pwSet = new Set(pedestrianWalks.map(p => `${p.position.x},${p.position.z}`));

    for (const pedestrianWalk of pedestrianWalks) {
        pedestrianWalk.arrays = roadCube.arrays;
        pedestrianWalk.bufferInfo = roadCube.bufferInfo;
        pedestrianWalk.vao = roadCube.vao;
        pedestrianWalk.scale = { x: 0.5, y: 0.08, z: 0.5 };
        pedestrianWalk.color = [1.0, 1.0, 0.0, 1.0]; // Yellow
        pedestrianWalk.texture = pedestrianWalkTexture;
        pedestrianWalk.programInfo = textureProgramInfo; // Use texture program
        pedestrianWalk.useWorldUV = true;
        pedestrianWalk.uvScale = 1.0;

        // Determine orientation based on neighbors
        const x = pedestrianWalk.position.x;
        const z = pedestrianWalk.position.z;
        // Check horizontal neighbors (East-West)
        const hasHorizontalNeighbor = pwSet.has(`${x + 1},${z}`) || pwSet.has(`${x - 1},${z}`);

        // If it has horizontal neighbors, it's likely an East-West crossing.
        // We want longitudinal stripes (parallel to traffic).
        // Texture has horizontal lines (vary with V).

        if (hasHorizontalNeighbor) {
            // E-W Crossing (Traffic along X). Want lines along X.
            // V should depend on Z (width). uv = xz (v=z).
            pedestrianWalk.rotateUV = false;
        } else {
            // N-S Crossing (Traffic along Z). Want lines along Z.
            // V should depend on X (width). uv = zx (v=x).
            pedestrianWalk.rotateUV = true;
        }

        scene.addObject(pedestrianWalk);
    }

    // DESTINATIONS - Green
    for (const destination of destinations) {
        destination.arrays = roadCube.arrays;
        destination.bufferInfo = roadCube.bufferInfo;
        destination.vao = roadCube.vao;
        destination.scale = { x: 0.5, y: 0.08, z: 0.5 };
        destination.color = [0.0, 1.0, 0.0, 1.0]; // Green
        destination.texture = destinationTexture;
        destination.programInfo = textureProgramInfo; // Use texture program
        destination.useWorldUV = true;
        destination.uvScale = 1.0;
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

    // PEDESTRIANS - Blue cubes
    const baseCubeForPed = new Object3D(-1);
    baseCubeForPed.prepareVAO(gl, programInfo);

    // Add color data for pedestrians (blue)
    const numVerticesPed = baseCubeForPed.arrays.a_position.data.length / 3;
    const colorDataPed = [];
    for (let i = 0; i < numVerticesPed; i++) {
        colorDataPed.push(0.2, 0.4, 1.0, 1.0); // Blue
    }
    baseCubeForPed.arrays.a_color.data = colorDataPed;

    pedestrianGeometry.arrays = baseCubeForPed.arrays;
    pedestrianGeometry.bufferInfo = baseCubeForPed.bufferInfo;
    pedestrianGeometry.vao = baseCubeForPed.vao;

    for (const ped of pedestrians) {
        ped.arrays = pedestrianGeometry.arrays;
        ped.bufferInfo = pedestrianGeometry.bufferInfo;
        ped.vao = pedestrianGeometry.vao;
        ped.scale = { x: 0.15, y: 0.3, z: 0.15 };
        scene.addObject(ped);
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
            agent.scale = { x: 0.1, y: 0.1, z: 0.1 };
            agent.color = [1.0, 0.0, 1.0, 1.0]; // Magenta for cars
            agent.isDynamic = true;
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
            ped.isDynamic = true;
            scene.addObject(ped);
        }
    }
}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Use interpolation for dynamic objects (cars, pedestrians)
    let v3_tra;
    if (object.isDynamic && object.prevPosition) {
        v3_tra = interpolatePosition(object.prevPosition, object.position, fract);
    } else {
        v3_tra = [
            object.posArray[0] + 0.5,
            object.posArray[1],
            object.posArray[2] + 0.5
        ];
    }
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
        u_shininess: 50.0,
        u_emissive: object.emissive || [0, 0, 0, 0]
    };

    // Add texture uniform if object has texture
    if (object.texture) {
        objectUniforms.u_texture = object.texture;
        objectUniforms.u_useWorldUV = object.useWorldUV || false;
        objectUniforms.u_rotateUV = object.rotateUV || false;
        objectUniforms.u_uvScale = object.uvScale || 1.0;
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
    // Scene uniforms
    const light = scene.lights[0];

    // Collect lights
    const lightPositions = [];
    const lightColors = [];
    let numLights = 0;
    const MAX_LIGHTS = 100;

    // 1. Sun Light
    lightPositions.push(...light.posArray);
    lightColors.push(...light.diffuse); // Use diffuse as main color
    numLights++;

    // 2. Traffic Lights
    for (const tl of trafficLights) {
        if (numLights >= MAX_LIGHTS) break;
        const isGreen = (tl.state === true || tl.state === "Green" || tl.state === "green");

        if (isGreen) {
            // Green Bulb Position (Lower)
            lightPositions.push(tl.position.x, tl.position.y + 2.2, tl.position.z);
            lightColors.push(0.0, 0.5, 0.0, 1.0); // Green (Reduced intensity)
        } else {
            // Red Bulb Position (Higher)
            lightPositions.push(tl.position.x, tl.position.y + 2.6, tl.position.z);
            lightColors.push(0.5, 0.0, 0.0, 1.0); // Red (Reduced intensity)
        }
        numLights++;
    }

    // Pad arrays
    while (lightPositions.length < MAX_LIGHTS * 3) lightPositions.push(0, 0, 0);
    while (lightColors.length < MAX_LIGHTS * 4) lightColors.push(0, 0, 0, 0);

    let globalUniforms = {
        u_viewWorldPosition: scene.camera.posArray,
        u_ambientLight: light.ambient,
        u_numLights: numLights,
        u_lightPositions: lightPositions,
        u_lightColors: lightColors
    }
    twgl.setUniforms(colorProgramInfo, globalUniforms);

    for (let object of scene.objects) {
        // Switch program if necessary
        let currentProgramInfo = object.programInfo || colorProgramInfo;
        gl.useProgram(currentProgramInfo.program);
        twgl.setUniforms(currentProgramInfo, globalUniforms);

        // Special handling for skybox
        if (object.id === "skybox") {
            gl.disable(gl.CULL_FACE);
            gl.depthMask(false); // Optional: don't write to depth buffer
        } else {
            gl.enable(gl.CULL_FACE);
            gl.depthMask(true);
        }

        drawObject(gl, currentProgramInfo, object, viewProjectionMatrix, fract);

        // Restore state
        if (object.id === "skybox") {
            gl.enable(gl.CULL_FACE);
            gl.depthMask(true);
        }
    }

    // Draw traffic light bulbs
    drawTrafficLightBulbs(gl, colorProgramInfo, viewProjectionMatrix);

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        updateSceneAgents();
        checkForNewPedestrians();
    }

    requestAnimationFrame(drawScene);
}

// Helper to draw traffic light bulbs
function drawTrafficLightBulbs(gl, programInfo, viewProjectionMatrix) {
    if (!bulbGeometry.vao) return;

    const bulbScale = { x: 0.15, y: 0.15, z: 0.15 };

    for (const tl of trafficLights) {
        const isGreen = (tl.state === true || tl.state === "Green" || tl.state === "green");

        // --- Draw Red Bulb ---
        const redColor = [1.0, 0.0, 0.0, 1.0];
        const redEmissive = isGreen ? [0.1, 0.0, 0.0, 1.0] : [1.0, 0.0, 0.0, 1.0]; // Dim if inactive, Bright if active

        const redBulb = new Object3D("bulb_red", [
            tl.position.x,
            tl.position.y + 2.6, // Higher position
            tl.position.z
        ]);
        redBulb.scale = bulbScale;
        redBulb.color = redColor;
        redBulb.emissive = redEmissive;
        redBulb.arrays = bulbGeometry.arrays;
        redBulb.bufferInfo = bulbGeometry.bufferInfo;
        redBulb.vao = bulbGeometry.vao;

        drawObject(gl, programInfo, redBulb, viewProjectionMatrix, 0);

        // --- Draw Green Bulb ---
        const greenColor = [0.0, 1.0, 0.0, 1.0];
        const greenEmissive = isGreen ? [0.0, 1.0, 0.0, 1.0] : [0.0, 0.1, 0.0, 1.0]; // Bright if active, Dim if inactive

        const greenBulb = new Object3D("bulb_green", [
            tl.position.x,
            tl.position.y + 2.2, // Lower position
            tl.position.z
        ]);
        greenBulb.scale = bulbScale;
        greenBulb.color = greenColor;
        greenBulb.emissive = greenEmissive;
        greenBulb.arrays = bulbGeometry.arrays;
        greenBulb.bufferInfo = bulbGeometry.bufferInfo;
        greenBulb.vao = bulbGeometry.vao;

        drawObject(gl, programInfo, greenBulb, viewProjectionMatrix, 0);
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
    gui.title('Controls');

    // ========== CAMERA CONTROLS ==========
    const cameraFolder = gui.addFolder('Camera Controls');
    cameraFolder.add(scene.camera, 'distance', 10, 100, 0.1)
        .name('Distance (Zoom)')
        .listen()
        .onChange((value) => {
            settings.camera.distance = value;
        });
    cameraFolder.add(scene.camera, 'azimuth', -Math.PI, Math.PI, 0.01)
        .name('Azimuth (Horizontal)')
        .listen()
        .onChange((value) => {
            settings.camera.azimuth = value;
        });
    cameraFolder.add(scene.camera, 'elevation', -1.5, 1.5, 0.01)
        .name('Elevation (Vertical)')
        .listen()
        .onChange((value) => {
            settings.camera.elevation = value;
        });

    const targetFolder = gui.addFolder('Target Position');
    targetFolder.add(scene.camera.target, 'x', -50, 50, 0.1)
        .name('Target X')
        .listen()
        .onChange((value) => {
            settings.camera.targetX = value;
        });
    targetFolder.add(scene.camera.target, 'y', -50, 50, 0.1)
        .name('Target Y')
        .listen()
        .onChange((value) => {
            settings.camera.targetY = value;
        });
    targetFolder.add(scene.camera.target, 'z', -50, 50, 0.1)
        .name('Target Z')
        .listen()
        .onChange((value) => {
            settings.camera.targetZ = value;
        });

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

// Helper function to create a colored cube
function createColoredCube(color) {
    const cube = new Object3D(-1);
    cube.prepareVAO(gl, colorProgramInfo);

    // Add color data
    const numVertices = cube.arrays.a_position.data.length / 3;
    const colorData = [];
    for (let i = 0; i < numVertices; i++) {
        colorData.push(...color); // Spread the RGBA values
    }
    cube.arrays.a_color.data = colorData;

    // Recreate buffers with new color data
    cube.bufferInfo = twgl.createBufferInfoFromArrays(gl, cube.arrays);
    cube.vao = twgl.createVAOFromBufferInfo(gl, colorProgramInfo, cube.bufferInfo);

    return cube;
}



main();
