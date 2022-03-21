#version 300 es

precision highp float;

uniform sampler2D u_depthTexture;
uniform sampler2D u_normalTexture;

out float outOcclusion;

void main() {
    vec2 p = gl_FragCoord.xy / (vec2(textureSize(u_depthTexture, 0)) * .5);
    float depth = texture(u_depthTexture, p).x;
    vec3 normal = texture(u_normalTexture, p).xyz;
    outOcclusion = depth;
}