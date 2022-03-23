#version 300 es

precision highp float;

uniform sampler2D u_colorTexture;
uniform sampler2D u_ssaoTexture;

out vec4 outColor;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_colorTexture, 0));
    vec4 color = texture(u_colorTexture, uv);
    vec4 ssao = texture(u_ssaoTexture, uv);
    outColor = vec4(ssao.r);
    outColor = color * ssao.r;
    //outColor = vec4(ssao.r);
}