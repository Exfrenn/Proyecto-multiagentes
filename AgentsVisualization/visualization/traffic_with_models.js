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
const duration = 1000; // ms
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

// Store geometry for pedestrians (3D models - alternating for animation)
const pedestrianGeometry = {
    model1: {
        arrays: null,
        bufferInfo: null,
        vao: null
    },
    model2: {
        arrays: null,
        bufferInfo: null,
        vao: null
    },
    texture: null // Shared texture for both models
};

// Store geometry for dynamic agents (car body)
const agentGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Store geometry for car wheels
const wheelGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null,
    textureVao: null,  // VAO for texture shader
    texture: null       // Wheel texture
};

// Store geometry for traffic light poles (simple cubes)
const trafficLightGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Grouped traffic lights (pairs share one pole)
let groupedTrafficLights = [];

// Store geometry for the bulb
const bulbGeometry = {
    arrays: null,
    bufferInfo: null,
    vao: null
};

// Store geometry for buildings (multiple models for variety)
const buildingGeometries = [];

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

    // Load car model with its materials
    const carArrays = await loadModel(
        '../assets/models/car-2024-301.obj',
        '../assets/models/car-2024-301.mtl'
    );

    // Log to see if colors were loaded from MTL
    console.log("Car colors loaded (first 20 values):", carArrays.a_color.data.slice(0, 20));

    const carModel = createBufferAndVAO(gl, colorProgramInfo, carArrays);

    // Guardar para uso posterior
    agentGeometry.arrays = carModel.arrays;
    agentGeometry.bufferInfo = carModel.bufferInfo;
    agentGeometry.vao = carModel.vao;

    // Load wheel model
    const wheelArrays = await loadModel('../assets/models/wheel.obj');
    console.log("Wheel model loaded:", wheelArrays);
    console.log("Wheel vertices:", wheelArrays.a_position.data.length / 3);
    console.log("Wheel has texCoords:", wheelArrays.a_texCoord ? "yes" : "no");

    // Add white color for wheels (will be tinted by texture)
    const numVerticesWheel = wheelArrays.a_position.data.length / 3;
    const colorDataWheel = [];
    for (let i = 0; i < numVerticesWheel; i++) {
        colorDataWheel.push(1, 1, 1, 1.0); // White to show texture colors properly
    }
    wheelArrays.a_color = { numComponents: 4, data: colorDataWheel };

    // If wheel model doesn't have texture coordinates, generate simple ones
    if (!wheelArrays.a_texCoord || wheelArrays.a_texCoord.data.length === 0) {
        console.log("Generating texture coordinates for wheel...");
        const texCoordData = [];
        for (let i = 0; i < numVerticesWheel; i++) {
            // Simple cylindrical UV mapping based on position
            const x = wheelArrays.a_position.data[i * 3];
            const y = wheelArrays.a_position.data[i * 3 + 1];
            const z = wheelArrays.a_position.data[i * 3 + 2];
            // Map angle around Y axis to U, and Y position to V
            const u = (Math.atan2(z, x) / (2 * Math.PI)) + 0.5;
            const v = y * 0.5 + 0.5;
            texCoordData.push(u, v);
        }
        wheelArrays.a_texCoord = { numComponents: 2, data: texCoordData };
    }

    // Create VAO for color shader (fallback)
    const wheelModel = createBufferAndVAO(gl, colorProgramInfo, wheelArrays);
    wheelGeometry.arrays = wheelModel.arrays;
    wheelGeometry.bufferInfo = wheelModel.bufferInfo;
    wheelGeometry.vao = wheelModel.vao;
    
    // Create VAO for texture shader
    wheelGeometry.textureVao = twgl.createVAOFromBufferInfo(gl, textureProgramInfo, wheelModel.bufferInfo);
    
    // Load wheel texture (Mazda rim)
    wheelGeometry.texture = twgl.createTexture(gl, {
        min: gl.LINEAR_MIPMAP_LINEAR,
        mag: gl.LINEAR,
        src: '../assets/textures/Wheels/mazda_rim_and_tire_20131008_1042452437.jpg'
    });
    console.log("Wheel texture loaded");
    console.log("Wheel VAO created:", wheelGeometry.vao);

    // Load pedestrian texture (Steve skin)
    pedestrianGeometry.texture = twgl.createTexture(gl, {
        min: gl.NEAREST,  // Use NEAREST for pixel art style (Minecraft)
        mag: gl.NEAREST,
        src: '../assets/textures/steve_diffuse.png'
    });
    console.log("Pedestrian texture loaded");

    // Load pedestrian model 1 (persona1)
    const person1Arrays = await loadModel('../assets/models/AddedModels/persona1.obj');
    console.log("Person model 1 loaded:", person1Arrays);
    console.log("Person 1 vertices:", person1Arrays.a_position.data.length / 3);
    console.log("Person 1 texCoords:", person1Arrays.a_texCoord.data.length / 2);

    // Create VAO with textureProgramInfo for texture support
    const person1Model = createBufferAndVAO(gl, textureProgramInfo, person1Arrays);
    pedestrianGeometry.model1.arrays = person1Model.arrays;
    pedestrianGeometry.model1.bufferInfo = person1Model.bufferInfo;
    pedestrianGeometry.model1.vao = person1Model.vao;
    console.log("Person 1 VAO created:", pedestrianGeometry.model1.vao);

    // Load pedestrian model 2 (persona2)
    const person2Arrays = await loadModel('../assets/models/AddedModels/persona2.obj');
    console.log("Person model 2 loaded:", person2Arrays);
    console.log("Person 2 vertices:", person2Arrays.a_position.data.length / 3);
    console.log("Person 2 texCoords:", person2Arrays.a_texCoord.data.length / 2);

    // Create VAO with textureProgramInfo for texture support
    const person2Model = createBufferAndVAO(gl, textureProgramInfo, person2Arrays);
    pedestrianGeometry.model2.arrays = person2Model.arrays;
    pedestrianGeometry.model2.bufferInfo = person2Model.bufferInfo;
    pedestrianGeometry.model2.vao = person2Model.vao;
    console.log("Person 2 VAO created:", pedestrianGeometry.model2.vao);

    // Create simple pole geometry for traffic lights (just a cube stretched)
    const poleObject = new Object3D("pole_geom");
    poleObject.prepareVAO(gl, colorProgramInfo);

    // Add dark gray color for the pole
    const numVerticesPole = poleObject.arrays.a_position.data.length / 3;
    const colorDataPole = [];
    for (let i = 0; i < numVerticesPole; i++) {
        colorDataPole.push(0.15, 0.15, 0.15, 1.0); // Dark gray
    }
    poleObject.arrays.a_color.data = colorDataPole;
    poleObject.bufferInfo = twgl.createBufferInfoFromArrays(gl, poleObject.arrays);
    poleObject.vao = twgl.createVAOFromBufferInfo(gl, colorProgramInfo, poleObject.bufferInfo);

    trafficLightGeometry.arrays = poleObject.arrays;
    trafficLightGeometry.bufferInfo = poleObject.bufferInfo;
    trafficLightGeometry.vao = poleObject.vao;

    // Load multiple building models for variety
    // Each building has its own scale to normalize sizes
    const buildingFiles = [
        { obj: '../assets/models/building_1.obj', mtl: '../assets/models/building_1.mtl', scale: 0.5 },
        { obj: '../assets/models/building_2.obj', mtl: '../assets/models/building_2.mtl', scale: 0.5 },
        // { obj: '../assets/models/building_04.obj', mtl: '../assets/models/building_04.mtl', scale: 0.3 },
        // { obj: '../assets/models/house.obj', mtl: '../assets/models/house.mtl', scale: 0.4 },
        { obj: '../assets/models/large_buildingE.obj', mtl: '../assets/models/large_buildingE.mtl', scale: 0.8 },
        { obj: '../assets/models/skyscraperE.obj', mtl: '../assets/models/skyscraperE.mtl', scale: 0.8 },
        { obj: '../assets/models/small_buildingB.obj', mtl: '../assets/models/small_buildingB.mtl', scale: 1.25 },
    ];

    for (const building of buildingFiles) {
        const buildingArrays = await loadModel(building.obj, building.mtl);
        const buildingModel = createBufferAndVAO(gl, colorProgramInfo, buildingArrays);
        buildingGeometries.push({
            arrays: buildingModel.arrays,
            bufferInfo: buildingModel.bufferInfo,
            vao: buildingModel.vao,
            scale: building.scale // Store the scale with the geometry
        });
        console.log(`Loaded building: ${building.obj}`);
    }

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

    // Group traffic lights into pairs (one pole per pair)
    groupTrafficLights();



    // Initialize the scene
    setupScene();

    // Position the objects in the scene
    setupObjects(scene, gl, colorProgramInfo);

    // Prepare the user interface
    setupUI();

    // Fisrt call to the drawing loop
    drawScene();
}

// Group traffic lights into pairs - one pole per pair
function groupTrafficLights() {
    groupedTrafficLights = [];
    const processed = new Set();

    for (let i = 0; i < trafficLights.length; i++) {
        if (processed.has(i)) continue;

        const tl = trafficLights[i];
        let group = {
            position: { x: tl.position.x, y: tl.position.y, z: tl.position.z },
            lights: [tl]
        };

        // Look for adjacent traffic light to form a pair
        for (let j = i + 1; j < trafficLights.length; j++) {
            if (processed.has(j)) continue;

            const other = trafficLights[j];
            const dx = Math.abs(tl.position.x - other.position.x);
            const dz = Math.abs(tl.position.z - other.position.z);

            // If adjacent (within 1 cell), group them
            if ((dx <= 1 && dz === 0) || (dz <= 1 && dx === 0)) {
                // Position the pole between both lights
                group.position.x = (tl.position.x + other.position.x) / 2;
                group.position.z = (tl.position.z + other.position.z) / 2;
                group.lights.push(other);
                processed.add(j);
                break;
            }
        }

        processed.add(i);
        groupedTrafficLights.push(group);
    }

    console.log(`Grouped ${trafficLights.length} traffic lights into ${groupedTrafficLights.length} poles`);
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

    // AGENTS (cars) - Use colors from MTL file
    for (const agent of agents) {
        agent.arrays = agentGeometry.arrays;
        agent.bufferInfo = agentGeometry.bufferInfo;
        agent.vao = agentGeometry.vao;
        agent.scale = { x: 0.2, y: 0.2, z: 0.2 };
        agent.color = [1.0, 1.0, 1.0, 1.0]; // White - let vertex colors from MTL show through
        agent.isDynamic = true;
        scene.addObject(agent);
    }

    // OBSTACLES (buildings) - Use different building models for variety
    for (let i = 0; i < obstacles.length; i++) {
        const agent = obstacles[i];
        
        // Select a random building model based on position (deterministic randomness)
        const buildingIndex = (agent.position.x + agent.position.z) % buildingGeometries.length;
        const geometry = buildingGeometries[Math.floor(Math.abs(buildingIndex))];
        
        agent.arrays = geometry.arrays;
        agent.bufferInfo = geometry.bufferInfo;
        agent.vao = geometry.vao;
        
        // Use the specific scale for this building type
        const s = geometry.scale || 0.5;
        agent.scale = { x: s, y: s, z: s };
        agent.color = [1.0, 1.0, 1.0, 1.0]; // White to show MTL colors
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
        src: '../assets/textures/Road/dest1.jpg'
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


    // TRAFFIC LIGHTS - Simple poles for grouped lights
    for (let i = 0; i < groupedTrafficLights.length; i++) {
        const group = groupedTrafficLights[i];
        const pole = new Object3D(`traffic_pole_${i}`, [
            group.position.x + 0.9,
            group.position.y,
            group.position.z + 0.9
        ]);
        pole.arrays = trafficLightGeometry.arrays;
        pole.bufferInfo = trafficLightGeometry.bufferInfo;
        pole.vao = trafficLightGeometry.vao;
        pole.scale = { x: 0.04, y: 0.8, z: 0.04 }; // Thinner, shorter pole
        pole.color = [0.15, 0.15, 0.15, 1.0];
        scene.addObject(pole);
    }

    // PEDESTRIANS - Using 3D models (persona1.obj and persona2.obj alternating)
    // pedestrianGeometry is already loaded with both 3D models in main()
    for (const ped of pedestrians) {
        // Start with model 1
        ped.arrays = pedestrianGeometry.model1.arrays;
        ped.bufferInfo = pedestrianGeometry.model1.bufferInfo;
        ped.vao = pedestrianGeometry.model1.vao;
        ped.scale = { x: 1, y: 1, z: 1 }; // Smaller scale (reduced from 0.12)
        ped.yOffset = 0.5; // Offset to make base touch the ground (adjusted for model's Y range)
        ped.isPedestrian = true; // Mark as pedestrian for easier identification
        ped.isDynamic = true;
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
            agent.prevOrientation = agent.orientation; // Track previous orientation for wheel steering
            agent.wheelSteerAngle = 0; // Current steering angle for front wheels
            agent.targetSteerAngle = 0; // Target steering angle
            agent.wheelRotation = 0; // Rotation of wheels around their axle (rolling)
            agent.lastPosition = { x: agent.position.x, y: agent.position.y, z: agent.position.z };
            scene.addObject(agent);
        } else {
            // Check if orientation changed and update steering
            const newOrientation = agent.orientation;
            if (existsInScene.prevOrientation && existsInScene.prevOrientation !== newOrientation) {
                // Calculate steering direction based on turn
                const turnAngle = calculateTurnAngle(existsInScene.prevOrientation, newOrientation);
                existsInScene.targetSteerAngle = turnAngle;
                // Keep track of when we started turning (to hold the turn for a bit)
                existsInScene.turnStartTime = Date.now();
            } else if (existsInScene.prevOrientation === newOrientation) {
                // Same orientation - check if enough time passed to return wheels to center
                const timeSinceTurn = Date.now() - (existsInScene.turnStartTime || 0);
                if (timeSinceTurn > 300) { // Hold turn for 300ms before centering
                    existsInScene.targetSteerAngle = 0;
                }
            }
            // Update the orientation tracking
            existsInScene.prevOrientation = newOrientation;
            // Sync orientation to scene object (important!)
            existsInScene.orientation = newOrientation;
            
            // Update wheel rotation - add one full step worth of rotation
            const wheelRadius = 0.08;
            const cellSize = 1.0;
            const rotationPerStep = cellSize / wheelRadius;
            if (existsInScene.wheelRotation === undefined) existsInScene.wheelRotation = 0;
            existsInScene.wheelRotation += rotationPerStep;
            // Keep within bounds
            existsInScene.wheelRotation = existsInScene.wheelRotation % (2 * Math.PI * 10);
        }
    }

    // 2. Remove dead agents (cars)
    // Filter scene.objects to remove dynamic objects that are no longer in the agents list
    scene.objects = scene.objects.filter(obj => {
        if (obj.isDynamic && !obj.isPedestrian) {
            // Check if this car agent ID is still in the global 'agents' list
            const stillActive = agents.some(a => a.id == obj.id);
            return stillActive;
        }
        return true; // Keep static objects and pedestrians (handled separately)
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

// Calculate the turn angle for front wheels based on orientation change
function calculateTurnAngle(prevOrientation, newOrientation) {
    // Map orientations to compass directions (0=Right/East, 1=Up/North, 2=Left/West, 3=Down/South)
    const orientationToDir = {
        "Right": 0,
        "Up": 1,
        "Left": 2,
        "Down": 3
    };
    
    const prevDir = orientationToDir[prevOrientation] ?? 0;
    const newDir = orientationToDir[newOrientation] ?? 0;
    
    // Calculate difference (-3 to 3)
    let diff = newDir - prevDir;
    
    // Normalize to -2 to 2 range (shortest turn)
    if (diff > 2) diff -= 4;
    if (diff < -2) diff += 4;
    
    // Return steering angle: positive = turning left, negative = turning right
    // Max steering angle is ~30 degrees (PI/6)
    const maxSteerAngle = Math.PI / 6;
    
    if (diff === 1 || diff === -3) {
        return maxSteerAngle;  // Turning left
    } else if (diff === -1 || diff === 3) {
        return -maxSteerAngle; // Turning right
    }
    
    return 0; // Going straight or U-turn
}

function checkForNewPedestrians() {
    // Use the pedestrian geometry
    if (!pedestrianGeometry.model1.vao || !pedestrianGeometry.model2.vao) {
        console.warn("Pedestrian geometry not initialized");
        return;
    }

    // 1. Add new pedestrians
    for (const ped of pedestrians) {
        const existsInScene = scene.objects.find(obj => obj.id == ped.id);
        if (!existsInScene) {
            // Copy visual properties from pedestrian geometry (start with model1)
            ped.arrays = pedestrianGeometry.model1.arrays;
            ped.bufferInfo = pedestrianGeometry.model1.bufferInfo;
            ped.vao = pedestrianGeometry.model1.vao;

            // Set appearance - using person model for pedestrians with texture
            ped.scale = { x: 0.05, y: 0.05, z: 0.05 }; // Reasonable pedestrian size
            ped.yOffset = 0.5; // Offset to make base touch the ground (adjusted for model's Y range)
            ped.isPedestrian = true; // Mark as pedestrian
            ped.isDynamic = true;
            
            // Use texture shader and texture for pedestrians
            ped.programInfo = textureProgramInfo;
            ped.texture = pedestrianGeometry.texture;
            ped.color = [1.0, 1.0, 1.0, 1.0]; // White to show texture colors properly
            
            scene.addObject(ped);
        }
    }

    // 2. Remove dead pedestrians
    // Filter scene.objects to remove pedestrians that are no longer in the pedestrians list
    scene.objects = scene.objects.filter(obj => {
        if (obj.isPedestrian) {
            // Check if this pedestrian ID is still in the global 'pedestrians' list
            const stillActive = pedestrians.some(p => p.id == obj.id);
            if (!stillActive) {
                console.log(`Removing inactive pedestrian: ${obj.id}`);
            }
            return stillActive;
        }
        return true; // Keep non-pedestrian objects
    });
}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
    // Alternate between pedestrian models for animation
    if (object.isPedestrian) {
        // This is a pedestrian - alternate models based on time
        const animationSpeed = 300; // ms per frame
        const currentFrame = Math.floor(Date.now() / animationSpeed) % 2;

        if (currentFrame === 0) {
            object.arrays = pedestrianGeometry.model1.arrays;
            object.bufferInfo = pedestrianGeometry.model1.bufferInfo;
            object.vao = pedestrianGeometry.model1.vao;
        } else {
            object.arrays = pedestrianGeometry.model2.arrays;
            object.bufferInfo = pedestrianGeometry.model2.bufferInfo;
            object.vao = pedestrianGeometry.model2.vao;
        }
    }

    // Use interpolation for dynamic objects (cars, pedestrians)
    let v3_tra;
    if (object.isDynamic && object.prevPosition) {
        v3_tra = interpolatePosition(object.prevPosition, object.position, fract);
        // Apply Y offset for pedestrians to touch ground
        if (object.yOffset !== undefined) {
            v3_tra[1] += object.yOffset;
        }
    } else {
        v3_tra = [
            object.posArray[0] + 0.5,
            object.posArray[1] + (object.yOffset || 0),
            object.posArray[2] + 0.5
        ];
    }
    let v3_sca = object.scaArray;
    
    // Debug: Log pedestrian scale
    if (object.isPedestrian && !object._scaleLogged) {
        console.log(`Pedestrian ${object.id} scale:`, object.scale, "scaArray:", v3_sca);
        object._scaleLogged = true;
    }

    // Create the individual transform matrices
    const scaMat = M4.scale(v3_sca);
    const rotXMat = M4.rotationX(object.rotRad.x);

    // Apply orientation-based rotation for cars and pedestrians (around Y axis)
    let rotYAngle = object.rotRad.y;
    if (object.orientation) {
        // Both use the same base rotation
        rotYAngle += getRotationFromOrientation(object.orientation);

        // Pedestrians need an additional offset because their model faces a different direction
        if (object.isPedestrian) {
            rotYAngle += Math.PI / 2; // +90° offset for pedestrian model (was -90°, adding 180° total)
        }
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

    // 2. Traffic Lights (grouped)
    for (const group of groupedTrafficLights) {
        if (numLights >= MAX_LIGHTS) break;
        // Check if any light in the group is green
        const isGreen = group.lights.some(tl =>
            tl.state === true || tl.state === "Green" || tl.state === "green"
        );

        const lightX = group.position.x + 0.9;
        const lightZ = group.position.z + 0.9;

        if (isGreen) {
            lightPositions.push(lightX, group.position.y + 0.75, lightZ);
            lightColors.push(0.0, 0.5, 0.0, 1.0);
        } else {
            lightPositions.push(lightX, group.position.y + 0.9, lightZ);
            lightColors.push(0.5, 0.0, 0.0, 1.0);
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

    // Draw traffic light bulbs - ensure we use the color program
    gl.useProgram(colorProgramInfo.program);
    twgl.setUniforms(colorProgramInfo, globalUniforms);
    drawTrafficLightBulbs(gl, colorProgramInfo, viewProjectionMatrix);

    // Draw car wheels with texture
    drawCarWheels(gl, textureProgramInfo, viewProjectionMatrix, fract, globalUniforms);

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
        elapsed = 0;
        await update();
        updateSceneAgents();
        checkForNewPedestrians();
    }

    requestAnimationFrame(drawScene);
}

// Helper to draw traffic light bulbs (one pair per grouped pole)
function drawTrafficLightBulbs(gl, programInfo, viewProjectionMatrix) {
    if (!bulbGeometry.vao) return;

    const bulbScale = { x: 0.12, y: 0.12, z: 0.12 }; // Larger bulbs for visibility

    for (const group of groupedTrafficLights) {
        // Check if any light in the group is green
        const isGreen = group.lights.some(tl =>
            tl.state === true || tl.state === "Green" || tl.state === "green"
        );

        const baseX = group.position.x + 0.9;
        const baseY = group.position.y;
        const baseZ = group.position.z + 0.9;

        // --- Red Bulb (top) ---
        const redEmissive = isGreen ? [0.15, 0.0, 0.0, 1.0] : [1.0, 0.0, 0.0, 1.0];
        const redBulb = new Object3D("bulb_red", [baseX, baseY + 0.9, baseZ]);
        redBulb.scale = bulbScale;
        redBulb.color = [1.0, 0.0, 0.0, 1.0];
        redBulb.emissive = redEmissive;
        redBulb.arrays = bulbGeometry.arrays;
        redBulb.bufferInfo = bulbGeometry.bufferInfo;
        redBulb.vao = bulbGeometry.vao;
        drawObject(gl, programInfo, redBulb, viewProjectionMatrix, 0);

        // --- Green Bulb (bottom) ---
        const greenEmissive = isGreen ? [0.0, 1.0, 0.0, 1.0] : [0.0, 0.15, 0.0, 1.0];
        const greenBulb = new Object3D("bulb_green", [baseX, baseY + 0.75, baseZ]);
        greenBulb.scale = bulbScale;
        greenBulb.color = [0.0, 1.0, 0.0, 1.0];
        greenBulb.emissive = greenEmissive;
        greenBulb.arrays = bulbGeometry.arrays;
        greenBulb.bufferInfo = bulbGeometry.bufferInfo;
        greenBulb.vao = bulbGeometry.vao;
        drawObject(gl, programInfo, greenBulb, viewProjectionMatrix, 0);
    }
}

// Helper to draw car wheels with texture
function drawCarWheels(gl, programInfo, viewProjectionMatrix, fract, globalUniforms) {
    if (!wheelGeometry.vao || !wheelGeometry.textureVao) {
        return;
    }

    const wheelScale = [0.08, 0.08, 0.08]; // Escala de las ruedas
    const steerLerpSpeed = 0.15; // Speed at which wheels turn (0-1, higher = faster)
    
    // Use texture program for wheels
    gl.useProgram(programInfo.program);
    twgl.setUniforms(programInfo, globalUniforms);

    // Use scene.objects and identify cars by their vao (same as agentGeometry)
    for (const obj of scene.objects) {
        // Only draw wheels for cars (objects using agentGeometry VAO)
        if (!obj.isDynamic || !obj.position) continue;
        if (obj.vao !== agentGeometry.vao) continue;

        // Get car rotation
        const carRotY = getRotationFromOrientation(obj.orientation);

        // Initialize steering properties if not present
        if (obj.wheelSteerAngle === undefined) obj.wheelSteerAngle = 0;
        if (obj.targetSteerAngle === undefined) obj.targetSteerAngle = 0;
        if (obj.wheelRotation === undefined) obj.wheelRotation = 0;

        // Smoothly interpolate wheel steering angle towards target
        obj.wheelSteerAngle += (obj.targetSteerAngle - obj.wheelSteerAngle) * steerLerpSpeed;
        // Snap to zero if very close (avoid floating point drift)
        if (Math.abs(obj.wheelSteerAngle) < 0.01 && obj.targetSteerAngle === 0) {
            obj.wheelSteerAngle = 0;
        }
        const wheelSteer = obj.wheelSteerAngle;

        // Calculate wheel rolling - base rotation plus interpolated fraction
        const wheelRadius = 0.08;
        const cellSize = 1.0;
        const rotationPerStep = cellSize / wheelRadius;
        // Smooth rolling: base rotation + fraction of current step
        const wheelRoll = obj.wheelRotation + (rotationPerStep * fract);

        // Interpolate car position
        let carPos;
        if (obj.prevPosition) {
            carPos = interpolatePosition(obj.prevPosition, obj.position, fract);
        } else {
            carPos = [obj.position.x + 0.5, obj.position.y, obj.position.z + 0.5];
        }

        // Wheel offsets in car's local space (car faces +X when rotation=0)
        // isFront indicates if this is a front wheel (should steer)
        const offsets = [
            { lx: 0.28, ly: 0.08, lz: -0.22, isFront: true },  // Front left
            { lx: 0.28, ly: 0.08, lz: 0.22, isFront: true },   // Front right
            { lx: -0.25, ly: 0.08, lz: -0.22, isFront: false }, // Back left
            { lx: -0.25, ly: 0.08, lz: 0.22, isFront: false },  // Back right
        ];

        for (const off of offsets) {
            // For front wheels, add steering rotation
            const steerAngle = off.isFront ? wheelSteer : 0;

            // Build transformation matrix step by step:
            // The wheel is a cylinder with axis along Y.
            // We need to:
            // 1. Make it roll (rotate around Z - this spins the wheel forward/backward)
            // 2. Tilt it to be vertical (rotate around Z by 90°)
            // 3. Turn the rim to face outward (rotate around X by 90°)
            // 4. Apply steering (rotate around Y)
            // 5. Position relative to car
            // 6. Apply car orientation
            // 7. Move to world position
            
            let mat = M4.translation(carPos);                           // 7. World position
            mat = M4.multiply(mat, M4.rotationY(carRotY));              // 6. Car orientation
            mat = M4.multiply(mat, M4.translation([off.lx, off.ly, off.lz])); // 5. Local offset
            mat = M4.multiply(mat, M4.rotationY(steerAngle));           // 4. Steering
            mat = M4.multiply(mat, M4.rotationX(Math.PI / 2));          // 3. Tilt rim to face outward (Z-axis)
            mat = M4.multiply(mat, M4.rotationZ(Math.PI / 2));          // 2. Stand wheel upright
            mat = M4.multiply(mat, M4.rotationX(wheelRoll));            // 1. Roll the wheel (spin forward)
            mat = M4.multiply(mat, M4.scale(wheelScale));               // 0. Scale

            // Calculate matrices for shader
            const wvpMat = M4.multiply(viewProjectionMatrix, mat);
            const normalMat = M4.transpose(M4.inverse(mat));

            // Set uniforms for textured wheel
            const wheelUniforms = {
                u_world: mat,
                u_worldInverseTransform: normalMat,
                u_worldViewProjection: wvpMat,
                u_ambientColor: [0.3, 0.3, 0.3, 1.0],
                u_diffuseColor: [1.0, 1.0, 1.0, 1.0],  // White to show texture properly
                u_specularColor: [0.5, 0.5, 0.5, 1.0],
                u_shininess: 50.0,
                u_emissive: [0, 0, 0, 0],
                u_texture: wheelGeometry.texture
            };

            twgl.setUniforms(programInfo, wheelUniforms);
            gl.bindVertexArray(wheelGeometry.textureVao);
            twgl.drawBufferInfo(gl, wheelGeometry.bufferInfo);
        }
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

//Load a .obj model from a file path, optionally loading MTL first
async function loadModel(objPath, mtlPath = null) {
    console.log(`Loading model: ${objPath}`);
    try {
        // If MTL path provided, load materials first
        if (mtlPath) {
            console.log(`Loading materials: ${mtlPath}`);
            const mtlResponse = await fetch(mtlPath);
            if (mtlResponse.ok) {
                const mtlText = await mtlResponse.text();
                loadMtl(mtlText);
                console.log(`Loaded materials from ${mtlPath}`);
            } else {
                console.warn(`Could not load MTL: ${mtlPath}`);
            }
        }
        
        // Now load the OBJ
        const response = await fetch(objPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${objPath}: ${response.statusText}`);
        }
        const objText = await response.text();
        const arrays = loadObj(objText);
        console.log(`Loaded ${objPath}`);
        return arrays;
    } catch (error) {
        console.error(`Error loading ${objPath}:`, error);
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
