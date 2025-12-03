/*
 * Script to read a model stored in Wavefront OBJ format
 *
 * Gilberto Echeverria
 * 2025-07-29
 */


'use strict';

// Global variable for all materials loaded
// NOTE: This is a bad idea. When materials have the same names,
// it could cause confusion in the scene.
let materials = {};
let materialInUse = undefined;

/*
 * Extract the elements in a face as encoded in an OBJ file
 * As faces are read, pass the information into the array that will be used
 * to draw the object in WebGL
 */
function parseFace(parts, objData, arrays) {
    // This will produce an array of arrays
    // Each arrays corresponds has the vertices
    // Each vertex is an array with its vertex, texture and normal indices
    let faceVerts = parts.slice(1).map(face => face.split('/'));
    faceVerts.forEach(vert => {
        const vertex = vert != '' ? Number(vert) : undefined
        if (vertex != undefined) {
            // console.log(objData.vertices[vert[0]])

            // First element is the vertex index
            arrays.a_position.data.push(...objData.vertices[vert[0]]);
            // Second element is the texture index
            if (vert.length > 1 && vert[1] != "") {
                const uv = objData.textures[vert[1]];
                // Flip V coordinate (1 - v) because WebGL has different UV origin than Blender
                arrays.a_texCoord.data.push(uv[0], 1.0 - uv[1]);
            }
            // Third element is the normal index
            if (vert.length > 2 && vert[2] != "") {
                arrays.a_normal.data.push(...objData.normals[vert[2]]);
            }

            if (materialInUse && materialInUse['Kd']) {
                arrays.a_color.data.push(...materialInUse['Kd'], 1);
            } else {
                arrays.a_color.data.push(0.4, 0.4, 0.4, 1);
            }
            // This is not really necessary, but just in case
            objData.faces.push({ v: vert[0], t: vert[1], n: vert[2] });
        }
    });
}

/*
 * Read the contents of an OBJ file received as a string
 * Return an object called arrays, with the arrays necessary to build a
 * Vertex Array Object (VAO) for WebGL.
 */
function loadObj(objString) {

    // Initialize a dummy item in the lists as index 0
    // This will make it easier to handle indices starting at 1 as used by OBJ
    let objData = {
        vertices: [[0, 0, 0]],
        normals: [[0, 0, 0]],
        textures: [[0, 0, 0]],
        faces: [],
    };

    // The array with the attributes that will be passed to WebGL
    let arrays = {
        a_position: {
            numComponents: 3,
            data: []
        },
        a_color: {
            numComponents: 4,
            data: []
        },
        a_normal: {
            numComponents: 3,
            data: []
        },
        a_texCoord: {
            numComponents: 2,
            data: []
        }
    };

    let partInfo;
    let lines = objString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'v':
                // Ignore the first part (the keyword),
                // remove any empty elements and convert them into a number
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                objData.vertices.push(partInfo);
                break;
            case 'vn':
                partInfo = parts.slice(1).filter(vn => vn != '').map(Number);
                objData.normals.push(partInfo);
                break;
            case 'vt':
                partInfo = parts.slice(1).filter(f => f != '').map(Number);
                objData.textures.push(partInfo);
                break;
            case 'f':
                parseFace(parts, objData, arrays);
                break;
            case 'usemtl':
                console.log(`Found usemtl: ${parts[1]}, materials available:`, Object.keys(materials));
                if (materials.hasOwnProperty(parts[1])) {
                    materialInUse = materials[parts[1]];
                    console.log(`Using material: ${parts[1]} with Kd:`, materialInUse['Kd']);
                } else {
                    console.warn(`Material not found: ${parts[1]}`);
                }
                break;
        }
    });

    //console.log("ATTRIBUTES:")
    //console.log(arrays);

    //console.log("OBJ DATA:")
    //console.log(objData);

    return arrays;
}

/*
 * Read the contents of an MTL file received as a string
 * Return an object containing all the materials described inside,
 * with their illumination attributes.
 */
function loadMtl(mtlString, clearPrevious = true) {
    // Clear previous materials to avoid conflicts between models
    if (clearPrevious) {
        materials = {};
        materialInUse = undefined;
    }

    let currentMtl = {};

    let partInfo;
    let lines = mtlString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'newmtl':
                // Add a new entry with default Kd (white)
                materials[parts[1]] = {
                    Kd: [0.8, 0.8, 0.8] // Default light gray
                };
                currentMtl = materials[parts[1]];
                break;
            case 'Ns':  // Specular coefficient ("Shininess")
                currentMtl['Ns'] = Number(parts[1]);
                break;
            case 'Kd':  // Diffuse color
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                currentMtl['Kd'] = partInfo;
                break;
            case 'map_Kd':  // Diffuse texture map
                currentMtl['map_Kd'] = parts[1];
                break;
        }
    });

    console.log("Materials loaded:", materials);
    return materials;
}

export { loadObj, loadMtl };
