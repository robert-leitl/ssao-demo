#version 300 es

precision highp float;

uniform sampler2D u_colorTexture;
uniform sampler2D u_depthTexture;
uniform float u_scale;

out vec4 blurColor;

#pragma glslify: blur = require('./bilateral-gaussian-blur.glsl', tex=texture, texSize=textureSize)

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_colorTexture, 0));

    blur(
        uv,
        vec2(0., 1.),
        u_scale,
        u_colorTexture,
        u_depthTexture,
        blurColor
    );
}