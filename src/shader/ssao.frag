#version 300 es

precision highp float;

uniform sampler2D u_depthTexture;
uniform sampler2D u_normalTexture;
uniform sampler2D u_noiseTexture;
uniform mat4 u_inversProjectionMatrix;

out float outOcclusion;

float bias = 0.5;
float maxKernelRadius = 120.;
float near = 80.;
float far = 150.;
float scale = 1.;

#define SIN45 0.707107

vec3 reconstructPosition(vec2 uv, float depth) {
    float x = uv.x * 2. - 1.;   // = x / w
    float y = uv.y * 2. - 1.;   // = y / w
    vec4 projectedPosition = vec4(x, y, depth, 1.);
    vec4 pos = u_inversProjectionMatrix * projectedPosition;
    return pos.xyz / pos.w;
}

float getOcclusion(vec3 origin, vec3 normal, vec2 position, float radius) {
    float occluderDepth = texture(u_depthTexture, position).x;
    vec3 occluderPosition = reconstructPosition(position, occluderDepth);
    vec3 dir = occluderPosition - origin;
    float inRange = smoothstep(0., 1., 5. / length(dir));
    float intensity = max(dot(normal, normalize(dir)) - bias, 0.) * inRange;
    float attenuation = (radius * .2) / length(dir);

    return attenuation * intensity;
}

void main() {
    vec2 texelSize = 1. / (vec2(textureSize(u_depthTexture, 0)) * scale);
    vec2 p = gl_FragCoord.xy * texelSize;
    float depth = texture(u_depthTexture, p).x;
    vec3 normal = normalize(texture(u_normalTexture, p).xyz);
    vec3 position = reconstructPosition(p, depth);
    vec2 noise = normalize(texture(u_noiseTexture, p).xy);

    float linearDepth = (-position.z - near) / (far - near);
    float kernelRadius = maxKernelRadius * (1.0 - linearDepth);

    const int KERNEL_SIZE = 4;
    vec2 kernel[KERNEL_SIZE];
    kernel[0] = vec2(1., 0.);
    kernel[1] = vec2(.0, 1.);
    kernel[2] = vec2(-1., 0.);
    kernel[3] = vec2(.0, -1.);

    for(int i=0; i<KERNEL_SIZE; ++i) {
        vec2 p1 = reflect(kernel[i], noise);
        vec2 p2 = vec2(p1.x * SIN45 - p1.y * SIN45, p1.x * SIN45 + p1.y * SIN45);

        p1 *= kernelRadius * texelSize;
        p2 *= kernelRadius * texelSize;

        outOcclusion += getOcclusion(position, normal, p + p1, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p2 * 0.75, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p1 * 0.5, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p2 * 0.25, kernelRadius);
    }

    outOcclusion = 1. - clamp(outOcclusion / (float(KERNEL_SIZE) * 4.), 0., 1.);
}