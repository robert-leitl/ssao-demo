#version 300 es

precision highp float;

uniform sampler2D u_envMap;
uniform vec3 u_color;
uniform float u_frames;

in vec3 v_position;
in vec3 v_normal;
in vec3 v_viewNormal;
in vec2 v_uv;
in vec3 v_surfaceToView;
in vec3 v_viewPosition;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormals;
layout(location = 2) out vec4 outPosition;

#define PI 3.1415926535

void main() {
    vec3 pos = v_position;
    vec3 N = normalize(v_normal);
    vec3 V = normalize(v_surfaceToView);
    vec3 L = normalize(vec3(0., 1., 1.));
    float NdL = dot(N, L);

    // calculate the reflection vector
    float NdV = dot(N, V);
    vec3 R = NdV * N * 2. - V;
    R = normalize(R);

    // calculate the half vector
    vec3 H = normalize(V + N);

    // base color
    vec3 albedo = u_color;

    // ambient ligthing
    float phi   = atan(R.z, R.x);
	float theta = acos(R.y);
    vec2 equiPos = vec2(phi / (2. * PI), theta / PI);
    vec3 ambient = texture(u_envMap, equiPos).rgb;

    // fresnel term
    float fresnel = min(1., pow(1. - NdV, 1.));

    // diffuse shading
    float diffuse = max(0., NdL) * 0.15;

    // specular shading
    float specular = pow(max(0., dot(H, L)), 12.) * 0.9;

    // color
    vec3 color = albedo + ambient * fresnel * .4 + specular * 0.2 + diffuse;

    outColor = vec4(color, 1.);
    //outColor = vec4(N * 0.5 + .5, 1.);

    outNormals = vec4(normalize(v_viewNormal), 0.);
    outPosition = vec4(v_viewPosition, 0.);
}
