/*
Function to create the vertex and color information for simple shapes
These can be used in multiple examples.

Gilberto Echeverria
2024-09-15
*/

// Create the data for the vertices of a polygon with the shape of the
// letter F. This is useful to view the transformations on the object.
function shapeF() {
    let arrays = {
        a_position: {
            numComponents: 2,
            data: [
                // Letter F
                0, 0,
                0, 200,
                40, 200,
                40, 0,
                40, 40,
                200, 40,
                200, 0,
                40, 120,
                150, 120,
                150, 80,
                40, 80,
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                // Front face
                0, 1, 2,
                2, 3, 0,
                3, 4, 5,
                5, 6, 3,
                7, 8, 9,
                9, 10, 7,
            ]
        }
    };

    return arrays;
}

function diamond(size) {
    let arrays = {
        a_position: {
            numComponents: 2,
            data: [
                // A diamond shape
                size, 0,
                0, size,
                -size, 0,
                0, -size,
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                // Front face
                0, 1, 2,
                2, 3, 0,
            ]
        }
    };

    return arrays;
}

function car2D() {
    let arrays = {
        a_position: {
            numComponents: 2,
            data: [
                -100, -40,
                -40, -40,
                40, -40,
                100, -40,
                100, -20,
                40, 10,
                -40, 10,
                -100, 20,
                -30, 40,
                24, 30,
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                0, 1, 6, 0, 6, 7,    // Car back
                1, 2, 5, 1, 5, 6,    // Car middle
                2, 3, 4, 2, 4, 5,    // Car front
                6, 5, 9, 6, 9, 8     // Car top
            ]
        }
    }

    return arrays;
}


// Create the data for a cube where each face has a different color
function cubeFaceColors(size) {
    let arrays = {
        a_position: {
            numComponents: 3,
            data: [
                // Front Face
                -1.0, -1.0, 1.0,
                1.0, -1.0, 1.0,
                1.0, 1.0, 1.0,
                -1.0, 1.0, 1.0,

                // Back face
                -1.0, -1.0, -1.0,
                -1.0, 1.0, -1.0,
                1.0, 1.0, -1.0,
                1.0, -1.0, -1.0,

                // Top face
                -1.0, 1.0, -1.0,
                -1.0, 1.0, 1.0,
                1.0, 1.0, 1.0,
                1.0, 1.0, -1.0,

                // Bottom face
                -1.0, -1.0, -1.0,
                1.0, -1.0, -1.0,
                1.0, -1.0, 1.0,
                -1.0, -1.0, 1.0,

                // Right face
                1.0, -1.0, -1.0,
                1.0, 1.0, -1.0,
                1.0, 1.0, 1.0,
                1.0, -1.0, 1.0,

                // Left face
                -1.0, -1.0, -1.0,
                -1.0, -1.0, 1.0,
                -1.0, 1.0, 1.0,
                -1.0, 1.0, -1.0
            ].map(e => size * e)
        },
        a_normal: {
            numComponents: 3,
            data: [
                // Front Face
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,

                // Back face
                0, 0, -1,
                0, 0, -1,
                0, 0, -1,
                0, 0, -1,

                // Top face
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,

                // Bottom face
                0, -1, 0,
                0, -1, 0,
                0, -1, 0,
                0, -1, 0,

                // Right face
                1, 0, 0,
                1, 0, 0,
                1, 0, 0,
                1, 0, 0,

                // Left face
                -1, 0, 0,
                -1, 0, 0,
                -1, 0, 0,
                -1, 0, 0,
            ]
        },
        a_color: {
            numComponents: 4,
            data: [
                // Front face
                1, 0, 0, 1, // v_1
                1, 0, 0, 1, // v_1
                1, 0, 0, 1, // v_1
                1, 0, 0, 1, // v_1
                // Back Face
                0, 1, 0, 1, // v_2
                0, 1, 0, 1, // v_2
                0, 1, 0, 1, // v_2
                0, 1, 0, 1, // v_2
                // Top Face
                0, 0, 1, 1, // v_3
                0, 0, 1, 1, // v_3
                0, 0, 1, 1, // v_3
                0, 0, 1, 1, // v_3
                // Bottom Face
                1, 1, 0, 1, // v_4
                1, 1, 0, 1, // v_4
                1, 1, 0, 1, // v_4
                1, 1, 0, 1, // v_4
                // Right Face
                0, 1, 1, 1, // v_5
                0, 1, 1, 1, // v_5
                0, 1, 1, 1, // v_5
                0, 1, 1, 1, // v_5
                // Left Face
                1, 0, 1, 1, // v_6
                1, 0, 1, 1, // v_6
                1, 0, 1, 1, // v_6
                1, 0, 1, 1, // v_6
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                0, 1, 2, 0, 2, 3,    // Front face
                4, 5, 6, 4, 6, 7,    // Back face
                8, 9, 10, 8, 10, 11,  // Top face
                12, 13, 14, 12, 14, 15, // Bottom face
                16, 17, 18, 16, 18, 19, // Right face
                20, 21, 22, 20, 22, 23  // Left face
            ]
        }
    };

    return arrays;
}

// Create the data for a cube with each vertex in a different color
function cubeVertexColors(size) {
    let arrays = {
        a_position: {
            numComponents: 3,
            data: [
                1, 1, 1, // v_0
                1, -1, 1, // v_1
                -1, -1, 1, // v_2
                -1, 1, 1, // v_3
                1, 1, -1, // v_4
                1, -1, -1, // v_5
                -1, -1, -1, // v_6
                -1, 1, -1, // v_7
            ].map(e => size * e)
        },
        a_color: {
            numComponents: 4,
            data: [
                1, 1, 1, 1, // v_0
                1, 0, 0, 1, // v_1
                0, 1, 0, 1, // v_2
                0, 0, 1, 1, // v_3
                0, 0, 0, 1, // v_4
                1, 1, 0, 1, // v_5
                0, 1, 1, 1, // v_6
                1, 0, 1, 1, // v_7
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                // Front face
                0, 2, 1,
                2, 0, 3,
                // Top face
                0, 5, 4,
                5, 0, 1,
                // Left face
                1, 6, 5,
                6, 1, 2,
                // Right face
                0, 7, 3,
                7, 0, 4,
                // Bottom face
                2, 7, 6,
                7, 2, 3,
                // Back face
                4, 6, 7,
                6, 4, 5,
            ]
        }
    };

    return arrays;
}

// Create the data for a cube with vertex coordinates
function cubeTextured(size) {
    let arrays = {
        a_position: {
            numComponents: 3,
            data: [
                // Front Face
                -1.0, -1.0, 1.0,
                1.0, -1.0, 1.0,
                1.0, 1.0, 1.0,
                -1.0, 1.0, 1.0,

                // Back face
                -1.0, -1.0, -1.0,
                -1.0, 1.0, -1.0,
                1.0, 1.0, -1.0,
                1.0, -1.0, -1.0,

                // Top face
                -1.0, 1.0, -1.0,
                -1.0, 1.0, 1.0,
                1.0, 1.0, 1.0,
                1.0, 1.0, -1.0,

                // Bottom face
                -1.0, -1.0, -1.0,
                1.0, -1.0, -1.0,
                1.0, -1.0, 1.0,
                -1.0, -1.0, 1.0,

                // Right face
                1.0, -1.0, -1.0,
                1.0, 1.0, -1.0,
                1.0, 1.0, 1.0,
                1.0, -1.0, 1.0,

                // Left face
                -1.0, -1.0, -1.0,
                -1.0, -1.0, 1.0,
                -1.0, 1.0, 1.0,
                -1.0, 1.0, -1.0
            ].map(e => size * e)
        },
        a_normal: {
            numComponents: 3,
            data: [
                // Front Face
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,
                0, 0, 1,

                // Back face
                0, 0, -1,
                0, 0, -1,
                0, 0, -1,
                0, 0, -1,

                // Top face
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,
                0, 1, 0,

                // Bottom face
                0, -1, 0,
                0, -1, 0,
                0, -1, 0,
                0, -1, 0,

                // Right face
                1, 0, 0,
                1, 0, 0,
                1, 0, 0,
                1, 0, 0,

                // Left face
                -1, 0, 0,
                -1, 0, 0,
                -1, 0, 0,
                -1, 0, 0,
            ]
        },
        a_texCoord: {
            numComponents: 2,
            data: [
                // Front Face
                0.0, 0.0,
                1.0, 0.0,
                1.0, 1.0,
                0.0, 1.0,

                // Back face
                1.0, 0.0,
                1.0, 1.0,
                0.0, 1.0,
                0.0, 0.0,

                // Top face
                0.0, 1.0,
                0.0, 0.0,
                1.0, 0.0,
                1.0, 1.0,

                // Bottom face
                0.0, 0.0,
                1.0, 0.0,
                1.0, 1.0,
                0.0, 1.0,

                // Right face
                0.0, 1.0,
                1.0, 1.0,
                1.0, 0.0,
                0.0, 0.0,

                // Left face
                0.0, 0.0,
                1.0, 0.0,
                1.0, 1.0,
                0.0, 1.0,
            ]
        },
        indices: {
            numComponents: 3,
            data: [
                0, 1, 2, 0, 2, 3,    // Front face
                4, 5, 6, 4, 6, 7,    // Back face
                8, 9, 10, 8, 10, 11,  // Top face
                12, 13, 14, 12, 14, 15, // Bottom face
                16, 17, 18, 16, 18, 19, // Right face
                20, 21, 22, 20, 22, 23  // Left face
            ]
        }
    };

    return arrays;
}

// Create the data for a skybox cube (inverted faces) with UVs for a cross layout
function skyboxCube(size) {
    let arrays = cubeTextured(size);
    // Invert indices to make faces point inwards
    let indices = arrays.indices.data;
    let newIndices = [];
    for (let i = 0; i < indices.length; i += 3) {
        newIndices.push(indices[i], indices[i + 2], indices[i + 1]);
    }
    arrays.indices.data = newIndices;

    // Invert normals
    let normals = arrays.a_normal.data;
    for (let i = 0; i < normals.length; i++) {
        normals[i] = -normals[i];
    }

    // Update UVs for a standard horizontal cross layout
    // Layout:
    //    L  F  R  B
    //       D
    // U: 0  1  2  3  4  (x 0.25)
    // V: 0  1  2  3     (x 0.333)

    const uStep = 1 / 4;
    const vStep = 1 / 3;

    // Helper to get UVs for a face with specific vertex ordering
    // order: array of 4 indices mapping vertex 0,1,2,3 of the face to BL, BR, TR, TL of the texture
    // 0=BL, 1=BR, 2=TR, 3=TL
    function getFaceUVs(uStart, vStart, order) {
        const coords = [
            uStart * uStep, vStart * vStep,             // 0: BL
            (uStart + 1) * uStep, vStart * vStep,       // 1: BR
            (uStart + 1) * uStep, (vStart + 1) * vStep, // 2: TR
            uStart * uStep, (vStart + 1) * vStep        // 3: TL
        ];

        let result = [];
        for (let idx of order) {
            result.push(coords[idx * 2], coords[idx * 2 + 1]);
        }
        return result;
    }

    let texCoords = [];

    // Front (0-3): BL, BR, TR, TL -> Standard Order [0, 1, 2, 3]
    texCoords.push(...getFaceUVs(1, 1, [0, 1, 2, 3]));

    // Back (4-7): BR, TR, TL, BL -> Order [1, 2, 3, 0]
    texCoords.push(...getFaceUVs(3, 1, [1, 2, 3, 0]));

    // Top (8-11): TL, BL, BR, TR -> Order [3, 0, 1, 2]
    texCoords.push(...getFaceUVs(1, 2, [3, 0, 1, 2]));

    // Bottom (12-15): BL, BR, TR, TL -> Standard Order [0, 1, 2, 3]
    texCoords.push(...getFaceUVs(1, 0, [0, 1, 2, 3]));

    // Right (16-19): BR, TR, TL, BL -> Order [1, 2, 3, 0]
    texCoords.push(...getFaceUVs(2, 1, [1, 2, 3, 0]));

    // Left (20-23): BL, BR, TR, TL -> Standard Order [0, 1, 2, 3]
    texCoords.push(...getFaceUVs(0, 1, [0, 1, 2, 3]));

    arrays.a_texCoord.data = texCoords;

    return arrays;
}

export { shapeF, diamond, cubeFaceColors, cubeVertexColors, cubeTextured, skyboxCube, car2D };
