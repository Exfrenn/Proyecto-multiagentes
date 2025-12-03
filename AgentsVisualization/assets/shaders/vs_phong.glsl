#version 300 es
in vec4 a_position;
in vec3 a_normal;
in vec4 a_color;

// Scene uniforms
uniform vec3 u_lightWorldPosition;
uniform vec3 u_viewWorldPosition;

// Model uniforms
uniform mat4 u_world;
uniform mat4 u_worldInverseTransform;
uniform mat4 u_worldViewProjection;

// Transformed normals
out vec3 v_normal;
out vec3 v_surfaceWorldPosition;
out vec3 v_surfaceToView;
out vec4 v_color;

void main() {
    // Transform the position of the vertices
    gl_Position = u_worldViewProjection * a_position;

    //v_normal = u_world * vec4(a_normal.xyz, 0);
    v_normal = mat3(u_worldInverseTransform) * a_normal;

    // Get world position of the surface
    vec3 surfaceWorldPosition = (u_world * a_position).xyz;
    v_surfaceWorldPosition = surfaceWorldPosition;

    // Direction from the surface to the view
    v_surfaceToView = u_viewWorldPosition - surfaceWorldPosition;
    
    // Pass vertex color to fragment shader
    v_color = a_color;
}
