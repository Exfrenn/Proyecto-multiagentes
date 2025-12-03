#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_surfaceWorldPosition;
in vec3 v_surfaceToView;
in vec2 v_texCoord;

uniform float u_shininess;

uniform sampler2D u_texture;

uniform vec4 u_ambientLight;

// Lights
#define MAX_LIGHTS 100
uniform int u_numLights;
uniform vec3 u_lightPositions[MAX_LIGHTS];
uniform vec4 u_lightColors[MAX_LIGHTS];

out vec4 outColor;

void main() {
    vec3 normal = normalize(v_normal);
    vec3 surfToViewDirection = normalize(v_surfaceToView);
    vec4 texColor = texture(u_texture, v_texCoord);

    vec3 totalDiffuse = vec3(0.0);
    vec3 totalSpecular = vec3(0.0);

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_numLights) break;

        vec3 lightPos = u_lightPositions[i];
        vec4 lightColor = u_lightColors[i];
        
        vec3 surfaceToLight = lightPos - v_surfaceWorldPosition;
        float distance = length(surfaceToLight);
        vec3 lightDir = normalize(surfaceToLight);

        float attenuation = 1.0 / (1.0 + 0.5 * distance * distance);
        
        // Diffuse
        float diff = max(dot(normal, lightDir), 0.0);
        totalDiffuse += diff * lightColor.rgb * attenuation;

        // Specular
        if (diff > 0.0) {
            vec3 reflectionVector = reflect(-lightDir, normal);
            float spec = pow(max(dot(surfToViewDirection, reflectionVector), 0.0), u_shininess);
            totalSpecular += spec * lightColor.rgb * attenuation;
        }
    }

    vec4 ambient = texColor * u_ambientLight;
    vec4 diffuse = vec4(totalDiffuse, 1.0) * texColor;
    vec4 specular = vec4(totalSpecular, 1.0) * texColor;

    outColor = ambient + diffuse + specular;
    outColor.a = texColor.a;
}
