#version 300 es

precision highp float;

uniform sampler2D u_colorTexture;
uniform sampler2D u_ssaoTexture;
uniform int u_passIndex;

out vec4 outColor;

const int PASS_COMPOSITE = 0;
const int PASS_SSAO = 1;
const int PASS_COLOR = 2;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_colorTexture, 0));
    vec4 color = texture(u_colorTexture, uv);
    float ssao = texture(u_ssaoTexture, uv).r;

    switch(u_passIndex) {
        case PASS_COLOR:
            outColor = color;
            break;
        case PASS_SSAO:
            outColor = vec4(ssao);
            break;
        default:
            outColor = color * ssao;
    }
}