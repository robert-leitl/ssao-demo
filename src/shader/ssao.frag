#version 300 es

precision highp float;

uniform sampler2D u_depthTexture;
uniform sampler2D u_normalTexture;
uniform sampler2D u_positionTexture;
uniform sampler2D u_noiseTexture;
uniform mat4 u_inversProjectionMatrix;
uniform float u_bias;
uniform float u_attentuationScale;
uniform float u_maxKernelRadius;
uniform float u_near;
uniform float u_far;
uniform float u_scale;

out float outOcclusion;

#define SIN45 0.707107

// reconstructs the view space position given the screen space coordinates
// along with the depth
vec3 reconstructPosition(vec2 uv, float depth) {
    float x = uv.x * 2. - 1.;   // = x / w
    float y = uv.y * 2. - 1.;   // = y / w
    float z = depth * 2. - 1.;
    vec4 projectedPosition = vec4(x, y, z, 1.);
    vec4 pos = u_inversProjectionMatrix * projectedPosition;
    return pos.xyz / pos.w;
}

// reads the view space position from the buffer
vec3 getViewPosition(vec2 uv) {
    return texture(u_positionTexture, uv).xyz;
}

float getOcclusion(vec3 origin, vec3 normal, vec2 position, float radius) {
    float occluderDepth = texture(u_depthTexture, position).x;
    //vec3 occluderPosition = reconstructPosition(position, occluderDepth);
    vec3 occluderPosition = getViewPosition(position);
    vec3 dir = occluderPosition - origin;
    float inRange = smoothstep(0., 1., (radius * u_attentuationScale) / length(dir));
    float intensity = max(dot(normal, normalize(dir)) - u_bias, 0.);
    float attenuation = ((radius * u_attentuationScale) / length(dir)) * inRange;

    return intensity * attenuation;
}

void main() {
    vec2 texelSize = 1. / (vec2(textureSize(u_depthTexture, 0)) * u_scale);
    vec2 p = gl_FragCoord.xy * texelSize;
    float depth = texture(u_depthTexture, p).x;
    vec3 normal = normalize(texture(u_normalTexture, p).xyz);
    //vec3 position = reconstructPosition(p, depth);
    vec3 position = getViewPosition(p);
    vec2 n1 = normalize(texture(u_noiseTexture, p).xy);
    vec2 n2 = abs(normalize(texture(u_noiseTexture, p * 2.).xy)) * 0.7 + 0.3;
    vec2 n3 = abs(normalize(texture(u_noiseTexture, p * 3.).xy)) * 0.7 + 0.3;

    float liu_nearDepth = (-position.z - u_near) / (u_far - u_near);
    float kernelRadius = u_maxKernelRadius * (1.0 - liu_nearDepth);

    const int KERNEL_SIZE = 4;
    vec2 kernel[KERNEL_SIZE];
    kernel[0] = vec2(1., 0.);
    kernel[1] = vec2(.0, 1.);
    kernel[2] = vec2(-1., 0.);
    kernel[3] = vec2(.0, -1.);

    for(int i=0; i<KERNEL_SIZE; ++i) {
        vec2 p1 = reflect(kernel[i], n1);
        vec2 p2 = vec2(p1.x * SIN45 - p1.y * SIN45, p1.x * SIN45 + p1.y * SIN45);

        p1 *= kernelRadius * texelSize;
        p2 *= kernelRadius * texelSize;

        outOcclusion += getOcclusion(position, normal, p + p1 * n3.y, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p2 * n2.x, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p1 * n2.y, kernelRadius);
        outOcclusion += getOcclusion(position, normal, p + p2 * n3.x, kernelRadius);
    }

    outOcclusion = 1. - clamp(outOcclusion / (float(KERNEL_SIZE) * 4.), 0., 1.);
}