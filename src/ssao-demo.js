import { mat4, quat, vec3 } from 'gl-matrix';
import { OrbitControl } from './orbit-control';
import { RoundedBoxGeometry } from './rounded-box-geometry';

import colorVertShaderSource from './shader/color.vert';
import colorFragShaderSource from './shader/color.frag';
import ssaoVertShaderSource from './shader/ssao.vert';
import ssaoFragShaderSource from './shader/ssao.frag';
import horizontalBlurVertShaderSource from './shader/bilateral-gaussian-blur-horizontal.vert';
import horizontalBlurFragShaderSource from './shader/bilateral-gaussian-blur-horizontal.frag';
import verticalBlurVertShaderSource from './shader/bilateral-gaussian-blur-vertical.vert';
import verticalBlurFragShaderSource from './shader/bilateral-gaussian-blur-vertical.frag';
import compositeVertShaderSource from './shader/composite.vert';
import compositeFragShaderSource from './shader/composite.frag';

export class SSAODemo {
    oninit;

    #time = 0;
    #frames = 0;
    #deltaTime = 0;
    #isDestroyed = false;

    SSAO_SCALE = .5;

    PASS_COMPOSITE = 0;
    PASS_SSAO = 1;
    PASS_COLOR = 2;

    passIndex = this.PASS_COMPOSITE;
    passLabels = [
        'composite',
        'ssao',
        'color'
    ];

    camera = {
        matrix: mat4.create(),
        near: 80,
        far: 150,
        distance: 120,
        orbit: quat.create(),
        position: vec3.create(),
        rotation: vec3.create(),
        up: vec3.fromValues(0, 1, 0)
    };

    ssao = {
        bias: 0.05,
        maxKernelRadius: 50.,
        blurScale: 1.5,
        attenuationScale: 0.16,
        enableBlur: true
    }

    acc = 0;

    constructor(canvas, pane, oninit = null) {
        this.canvas = canvas;
        this.pane = pane;
        this.oninit = oninit;

        this.#init();
    }

    resize() {
        const gl = this.gl;

        this.#resizeCanvasToDisplaySize(gl.canvas);
        
        // When you need to set the viewport to match the size of the canvas's
        // drawingBuffer this will always be correct
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        // resize the framebuffer textures
        this.#resizeTextures(gl);

        this.#updateProjectionMatrix(gl);
    }

    run(time = 0) {+
        this.fpsGraph.begin();

        this.#deltaTime = time - this.#time;
        this.#time = time;
        this.#frames += this.#deltaTime / 16;

        if (this.#isDestroyed) return;

        this.control.update(this.#deltaTime);

        this.#render();

        this.fpsGraph.end();

        requestAnimationFrame((t) => this.run(t));
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        // color/detph/normals pass
        this.#setFramebuffer(gl, this.colorFramebuffer, this.colorFBOWidth, this.colorFBOHeight);
        gl.useProgram(this.colorProgram);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearColor(.97, .97, 0.97, 0.);
        gl.uniformMatrix4fv(this.colorLocations.u_viewMatrix, false, this.colorUniforms.u_viewMatrix);
        gl.uniformMatrix4fv(this.colorLocations.u_projectionMatrix, false, this.colorUniforms.u_projectionMatrix);
        gl.uniform3f(this.colorLocations.u_cameraPosition, this.camera.position[0], this.camera.position[1], this.camera.position[2]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.envMapTexture);
        gl.uniform1i(this.colorLocations.u_envMap, 0);
        //gl.uniform1f(this.colorLocations.u_frames, this.#frames);
        const s1 = (Math.sin(this.#frames * 0.08) * 0.5 + .5) * 0.5;
        const s2 = (Math.cos(this.#frames * 0.06) * 0.5 + .5) * 0.3;
        const s3 = (Math.sin(this.#frames * 0.02) * 0.5 + .5) * 0.4;
        const v = Math.min(Math.abs(this.control.velocity[1]) / 6, 1);
        this.acc += (v - this.acc) / 3;
        this.#renderCube(gl, this.cube1VAO, this.cube1Buffers.numElem, [1., 0.15, 0.15], [0, 0, 0], [25 - s1 * 5, 25 - s2 * 5, 25 - s3 * 5], [0, 1, 0.1], Math.PI / 4);
        this.#renderCube(gl, this.cube2VAO, this.cube2Buffers.numElem, [.95, .8, 0.2], [10 * this.acc, 25 - 1.5, 0], [20, 20 - s1 * 3, 20 - s2 * 2], [0, 1, 0], 0);
        this.#renderCube(gl, this.cube3VAO, this.cube3Buffers.numElem, [.2, .4, 1], [-22 - 5. * this.acc, 2, 10], [18, 18 - s2 * 4, 18 - s1 * 2], [0.1, 1, 0],  3 * Math.PI / 4.5);
        this.#renderCube(gl, this.cube3VAO, this.cube3Buffers.numElem, [.2, .95, .4], [19 + 5 * this.acc, -12, 13], [12 - s1 * 3, 12, 12 - s2 * 1], [0, 1, 0],  0);
        this.#renderCube(gl, this.cube2VAO, this.cube2Buffers.numElem, [.8, 0.8, 0.8], [5 *  this.acc, -20, -15], [15 - s2 * 2, 15, 15 - s1 * 3], [0, 1, 0.3], Math.PI / 3);
        this.#setFramebuffer(gl, null, this.colorFBOWidth, this.colorFBOHeight);

        // ssao pass
        this.#setFramebuffer(gl, this.ssaoFramebuffer, this.ssaoFBOWidth, this.ssaoFBOHeight);
        gl.useProgram(this.ssaoProgram);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.uniform1i(this.ssaoLocations.u_depthTexture, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
        gl.uniform1i(this.ssaoLocations.u_normalTexture, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
        gl.uniform1i(this.ssaoLocations.u_noiseTexture, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
        gl.uniform1i(this.ssaoLocations.u_positionTexture, 3);
        gl.uniform1f(this.ssaoLocations.u_bias, this.ssao.bias);
        gl.uniform1f(this.ssaoLocations.u_maxKernelRadius, this.ssao.maxKernelRadius);
        gl.uniform1f(this.ssaoLocations.u_attentuationScale, this.ssao.attenuationScale);
        gl.uniform1f(this.ssaoLocations.u_scale, this.SSAO_SCALE);
        gl.uniform1f(this.ssaoLocations.u_near, this.camera.near);
        gl.uniform1f(this.ssaoLocations.u_far, this.camera.far);
        //gl.uniform1f(this.ssaoLocations.u_frames, this.#frames);
        //gl.uniformMatrix4fv(this.ssaoLocations.u_inversProjectionMatrix, false, mat4.invert(mat4.create(), this.colorUniforms.u_projectionMatrix));
        gl.drawArrays(gl.TRIANGLES, 0, this.quadBuffers.numElem);
        this.#setFramebuffer(gl, null, this.colorFBOWidth, this.colorFBOHeight);

        // horizontal blur pass
        this.#setFramebuffer(gl, this.horizontalBlurFramebuffer, this.ssaoFBOWidth, this.ssaoFBOHeight);
        gl.useProgram(this.horizontalBlurProgram);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.uniform1i(this.horizontalBlurLocations.u_depthTexture, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.ssaoTexture);
        gl.uniform1i(this.horizontalBlurLocations.u_colorTexture, 1);
        gl.uniform1f(this.horizontalBlurLocations.u_scale, this.ssao.blurScale);
        gl.drawArrays(gl.TRIANGLES, 0, this.quadBuffers.numElem);
        this.#setFramebuffer(gl, null, this.colorFBOWidth, this.colorFBOHeight);

        // vertical blur pass
        this.#setFramebuffer(gl, this.verticalBlurFramebuffer, this.ssaoFBOWidth, this.ssaoFBOHeight);
        gl.useProgram(this.verticalBlurProgram);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.uniform1i(this.verticalBlurLocations.u_depthTexture, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.horizontalBlurTexture);
        gl.uniform1i(this.verticalBlurLocations.u_colorTexture, 1);
        gl.uniform1f(this.verticalBlurLocations.u_scale, this.ssao.blurScale);
        gl.drawArrays(gl.TRIANGLES, 0, this.quadBuffers.numElem);
        this.#setFramebuffer(gl, null, this.colorFBOWidth, this.colorFBOHeight);

        gl.useProgram(this.compositeProgram);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.uniform1i(this.compositeLocations.u_colorTexture, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.ssao.enableBlur ? this.verticalBlurTexture : this.ssaoTexture);
        gl.uniform1i(this.compositeLocations.u_ssaoTexture, 1);
        gl.uniform1i(this.compositeLocations.u_passIndex, this.passIndex);
        gl.drawArrays(gl.TRIANGLES, 0, this.quadBuffers.numElem);
    }

    #renderCube(gl, vao, numElm, color, translation, scale, rotationAxis, angle) {
        const worldMatrix = mat4.create();
        mat4.translate(worldMatrix, worldMatrix, translation);
        mat4.rotate(worldMatrix, worldMatrix, angle, rotationAxis);
        mat4.scale(worldMatrix, worldMatrix, scale);

        const worldInverseTransposeMatrix = mat4.create();
        mat4.invert(worldInverseTransposeMatrix, worldMatrix);
        mat4.transpose(worldInverseTransposeMatrix, worldInverseTransposeMatrix);

        gl.uniformMatrix4fv(this.colorLocations.u_worldMatrix, false, worldMatrix);
        gl.uniformMatrix4fv(this.colorLocations.u_worldInverseTransposeMatrix, false, worldInverseTransposeMatrix);
        gl.uniform3f(this.colorLocations.u_color, color[0], color[1], color[2]);
        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, numElm, gl.UNSIGNED_SHORT, 0);
    }

    destroy() {
        this.#isDestroyed = true;
    }

    #init() {
        this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        if (!gl) {
            throw new Error('No WebGL 2 context!')
        }

        if (!gl.getExtension("EXT_color_buffer_float")) {
            console.error("FLOAT color buffer not available");
            document.body.innerHTML = "This example requires EXT_color_buffer_float which is unavailable on this system."
        }

        ///////////////////////////////////  PROGRAM SETUP

        // setup programs
        this.colorProgram = this.#createProgram(gl, [colorVertShaderSource, colorFragShaderSource], null, { a_position: 0, a_normal: 1, a_uv: 2 });
        this.compositeProgram = this.#createProgram(gl, [compositeVertShaderSource, compositeFragShaderSource], null, { a_position: 0 });
        this.ssaoProgram = this.#createProgram(gl, [ssaoVertShaderSource, ssaoFragShaderSource], null, { a_position: 0 });
        this.horizontalBlurProgram = this.#createProgram(gl, [horizontalBlurVertShaderSource, horizontalBlurFragShaderSource], null, { a_position: 0 });
        this.verticalBlurProgram = this.#createProgram(gl, [verticalBlurVertShaderSource, verticalBlurFragShaderSource], null, { a_position: 0 });

        // find the locations
        this.colorLocations = {
            a_position: gl.getAttribLocation(this.colorProgram, 'a_position'),
            a_normal: gl.getAttribLocation(this.colorProgram, 'a_normal'),
            a_uv: gl.getAttribLocation(this.colorProgram, 'a_uv'),
            u_worldMatrix: gl.getUniformLocation(this.colorProgram, 'u_worldMatrix'),
            u_viewMatrix: gl.getUniformLocation(this.colorProgram, 'u_viewMatrix'),
            u_projectionMatrix: gl.getUniformLocation(this.colorProgram, 'u_projectionMatrix'),
            u_worldInverseTransposeMatrix: gl.getUniformLocation(this.colorProgram, 'u_worldInverseTransposeMatrix'),
            u_cameraPosition: gl.getUniformLocation(this.colorProgram, 'u_cameraPosition'),
            u_envMap: gl.getUniformLocation(this.colorProgram, 'u_envMap'),
            u_color: gl.getUniformLocation(this.colorProgram, 'u_color')
           //u_frames: gl.getUniformLocation(this.colorProgram, 'u_frames')
        };
        this.compositeLocations = {
            a_position: gl.getAttribLocation(this.compositeProgram, 'a_position'),
            u_colorTexture: gl.getUniformLocation(this.compositeProgram, 'u_colorTexture'),
            u_ssaoTexture: gl.getUniformLocation(this.compositeProgram, 'u_ssaoTexture'),
            u_passIndex: gl.getUniformLocation(this.compositeProgram, 'u_passIndex')
        };
        this.ssaoLocations = {
            a_position: gl.getAttribLocation(this.ssaoProgram, 'a_position'),
            u_depthTexture: gl.getUniformLocation(this.ssaoProgram, 'u_depthTexture'),
            u_normalTexture: gl.getUniformLocation(this.ssaoProgram, 'u_normalTexture'),
            u_positionTexture: gl.getUniformLocation(this.ssaoProgram, 'u_positionTexture'),
            u_noiseTexture: gl.getUniformLocation(this.ssaoProgram, 'u_noiseTexture'),
            u_bias: gl.getUniformLocation(this.ssaoProgram, 'u_bias'),
            u_maxKernelRadius: gl.getUniformLocation(this.ssaoProgram, 'u_maxKernelRadius'),
            u_near: gl.getUniformLocation(this.ssaoProgram, 'u_near'),
            u_far: gl.getUniformLocation(this.ssaoProgram, 'u_far'),
            u_scale: gl.getUniformLocation(this.ssaoProgram, 'u_scale'),
            u_attentuationScale: gl.getUniformLocation(this.ssaoProgram, 'u_attentuationScale'),
            //u_frames: gl.getUniformLocation(this.ssaoProgram, 'u_frames')
            //u_inversProjectionMatrix: gl.getUniformLocation(this.ssaoProgram, 'u_inversProjectionMatrix')
        };
        this.horizontalBlurLocations = {
            a_position: gl.getAttribLocation(this.horizontalBlurProgram, 'a_position'),
            u_depthTexture: gl.getUniformLocation(this.horizontalBlurProgram, 'u_depthTexture'),
            u_colorTexture: gl.getUniformLocation(this.horizontalBlurProgram, 'u_colorTexture'),
            u_scale: gl.getUniformLocation(this.horizontalBlurProgram, 'u_scale')
        };
        this.verticalBlurLocations = {
            a_position: gl.getAttribLocation(this.verticalBlurProgram, 'a_position'),
            u_depthTexture: gl.getUniformLocation(this.verticalBlurProgram, 'u_depthTexture'),
            u_colorTexture: gl.getUniformLocation(this.verticalBlurProgram, 'u_colorTexture'),
            u_scale: gl.getUniformLocation(this.verticalBlurProgram, 'u_scale')
        };
        
        // setup uniforms
        this.colorUniforms = {
            u_worldMatrix: mat4.create(),
            u_viewMatrix: mat4.create(),
            u_projectionMatrix: mat4.create(),
            u_worldInverseTransposeMatrix: mat4.create()
        };
        mat4.rotate(this.colorUniforms.u_worldMatrix, this.colorUniforms.u_worldMatrix, -Math.PI / 2, [1, 0, 0]);
        mat4.scale(this.colorUniforms.u_worldMatrix, this.colorUniforms.u_worldMatrix, [4, 4, 4]);
        mat4.translate(this.colorUniforms.u_worldMatrix, this.colorUniforms.u_worldMatrix, [0, 0, 0]);

        /////////////////////////////////// GEOMETRY / MESH SETUP

        // create object VAOs
        this.cube1Geometry = new RoundedBoxGeometry(1, 1, 1, .05, 4);
        this.cube1Buffers = { 
            position: this.#createBuffer(gl, this.cube1Geometry.vertices),
            normal: this.#createBuffer(gl, this.cube1Geometry.normals),
            numElem: this.cube1Geometry.count
        };
        this.cube1VAO = this.#makeVertexArray(gl, [
            [this.cube1Buffers.position, this.colorLocations.a_position, 3],
            [this.cube1Buffers.normal, this.colorLocations.a_normal, 3]
        ], this.cube1Geometry.indices);

        this.cube2Geometry = new RoundedBoxGeometry(1, 1, 1, 0.3, 5);
        this.cube2Buffers = { 
            position: this.#createBuffer(gl, this.cube2Geometry.vertices),
            normal: this.#createBuffer(gl, this.cube2Geometry.normals),
            numElem: this.cube2Geometry.count
        };
        this.cube2VAO = this.#makeVertexArray(gl, [
            [this.cube2Buffers.position, this.colorLocations.a_position, 3],
            [this.cube2Buffers.normal, this.colorLocations.a_normal, 3]
        ], this.cube2Geometry.indices);

        this.cube3Geometry = new RoundedBoxGeometry(2, 1, 1, .5, 12);
        this.cube3Buffers = { 
            position: this.#createBuffer(gl, this.cube3Geometry.vertices),
            normal: this.#createBuffer(gl, this.cube3Geometry.normals),
            numElem: this.cube3Geometry.count
        };
        this.cube3VAO = this.#makeVertexArray(gl, [
            [this.cube3Buffers.position, this.colorLocations.a_position, 3],
            [this.cube3Buffers.normal, this.colorLocations.a_normal, 3]
        ], this.cube3Geometry.indices);

        // create quad VAO
        const quadPositions = [
            -1, -1,
            3, -1,
            -1, 3
        ];
        this.quadBuffers = {
            position: this.#createBuffer(gl, quadPositions),
            numElem: quadPositions.length / 2
        };
        this.quadVAO = this.#makeVertexArray(gl, [[this.quadBuffers.position, this.colorLocations.a_position, 2]]);


        // initial client dimensions
        const clientWidth = gl.canvas.clientWidth;
        const clientHeight = gl.canvas.clientHeight;
         
        /////////////////////////////////// INITIAL DRAW PASS SETUP

        this.colorFBOWidth = clientWidth;
        this.colorFBOHeight = clientHeight;

        // depth texture setup
        this.depthTexture = this.#createAndSetupTexture(gl, gl.NEAREST, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, this.colorFBOWidth, this.colorFBOHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        // color texture setup
        this.colorTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.colorFBOWidth, this.colorFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // normal texture setup
        this.normalTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.colorFBOWidth, this.colorFBOHeight);
        // position texture setup
        this.positionTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.colorFBOWidth, this.colorFBOHeight);

        this.colorFramebuffer = this.#createFramebuffer(gl, [this.colorTexture, this.normalTexture, this.positionTexture], this.depthTexture);

        /////////////////////////////////// SSAO PASS SETUP

        this.ssaoFBOWidth = this.colorFBOWidth * this.SSAO_SCALE;
        this.ssaoFBOHeight = this.colorFBOHeight * this.SSAO_SCALE;

        this.ssaoTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.ssaoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        this.ssaoFramebuffer = this.#createFramebuffer(gl, [this.ssaoTexture]);

        /////////////////////////////////// SSAO BLUR PASSES SETUP

        this.horizontalBlurTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.horizontalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.horizontalBlurFramebuffer = this.#createFramebuffer(gl, [this.horizontalBlurTexture]);

        this.verticalBlurTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.verticalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.verticalBlurFramebuffer = this.#createFramebuffer(gl, [this.verticalBlurTexture]);


        // create noise texture
        const noiseTextureSize = clientWidth * clientHeight;
        const noiseTextureData = new Float32Array(noiseTextureSize * 2);
        for (let i = 0; i < noiseTextureSize; ++i) {
            const ndx = i * 2;
            noiseTextureData[ndx]     = Math.random() * 2.0 - 1.0;
            noiseTextureData[ndx + 1] = Math.random() * 2.0 - 1.0;
        }    
        this.noiseTexture = this.#createAndSetupTexture(gl, gl.NEAREST, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG16F, clientWidth, clientHeight);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, clientWidth, clientHeight, gl.RG, gl.FLOAT, noiseTextureData);
    

        this.resize();

        this.#initEnvMap();
        this.#updateCameraMatrix();
        this.#updateProjectionMatrix(gl);

        this.#initOrbitControls();
        this.#initTweakpane();

        if (this.oninit) this.oninit(this);
    }

    #initEnvMap() {
        const gl = this.gl;

        this.envMapTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.envMapTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 100, 500, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        const img = new Image();
        img.src = new URL('./assets/studio024.jpg', import.meta.url);
        img.addEventListener('load', () => {
            gl.bindTexture(gl.TEXTURE_2D, this.envMapTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 100, 500, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
        });
    }

    #createBuffer(gl, data) {
        const buffer = this.gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return buffer;
    }

    #initOrbitControls() {
        this.control = new OrbitControl(this.canvas, this.camera, () => this.#updateCameraMatrix());
    }

    #createFramebuffer(gl, colorAttachements, depthAttachement) {
        const fbo = gl.createFramebuffer();
        const drawBuffers = [];
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        colorAttachements.forEach((texture, ndx) => {
            const attachmentPoint = gl[`COLOR_ATTACHMENT${ndx}`];
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                attachmentPoint,
                gl.TEXTURE_2D, 
                texture,
                0);
            drawBuffers.push(attachmentPoint);
        });
        if (depthAttachement) {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthAttachement, 0);
        }
        gl.drawBuffers(drawBuffers);

        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
            console.error('could not complete render framebuffer setup', gl.checkFramebufferStatus(gl.FRAMEBUFFER))
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    #makeVertexArray(gl, bufLocNumElmPairs, indices) {
        const va = gl.createVertexArray();
        gl.bindVertexArray(va);
        for (const [buffer, loc, numElem] of bufLocNumElmPairs) {
            if(loc == -1) continue;

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(
                loc,      // attribute location
                numElem,        // number of elements
                gl.FLOAT, // type of data
                false,    // normalize
                0,        // stride (0 = auto)
                0,        // offset
            );
        }
        if (indices) {
            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
        }
        gl.bindVertexArray(null);
        return va;
    }

    #createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

        if (success) {
            return shader;
        }

        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    #createProgram(gl, shaderSources, transformFeedbackVaryings, attribLocations) {
        const program = gl.createProgram();

        [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, ndx) => {
            const shader = this.#createShader(gl, type, shaderSources[ndx]);
            gl.attachShader(program, shader);
        });

        if (transformFeedbackVaryings) {
            gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.SEPARATE_ATTRIBS);
        }

        if (attribLocations) {
            for(const attrib in attribLocations) {
                gl.bindAttribLocation(program, attribLocations[attrib], attrib);
            }
        }

        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);

        if (success) {
            return program;
        }

        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }

    #setFramebuffer(gl, fbo, width, height) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); // all draw commands will affect the framebuffer
        gl.viewport(0, 0, width, height);
    }

    #createAndSetupTexture(gl, minFilter, magFilter) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
        return texture;
    }

    #resizeTextures(gl) {
        const clientWidth = gl.canvas.clientWidth;
        const clientHeight = gl.canvas.clientHeight;
        this.colorFBOWidth = clientWidth;
        this.colorFBOHeight = clientHeight;
        this.ssaoFBOWidth = this.colorFBOWidth * this.SSAO_SCALE;
        this.ssaoFBOHeight = this.colorFBOHeight * this.SSAO_SCALE;

        // resize color textures and buffers
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.texImage2D(this. gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, this.colorFBOWidth, this.colorFBOHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.colorFBOWidth, this.colorFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // recreate the normal texture
        this.normalTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.normalTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.colorFBOWidth, this.colorFBOHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.normalTexture, 0);

        // recreate the position texture
        this.positionTexture = this.#createAndSetupTexture(gl, gl.LINEAR, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.colorFBOWidth, this.colorFBOHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.positionTexture, 0);

        // resize ssao texture
        gl.bindTexture(gl.TEXTURE_2D, this.ssaoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // resize blur pass textures
        gl.bindTexture(gl.TEXTURE_2D, this.horizontalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, this.verticalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.ssaoFBOWidth, this.ssaoFBOHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        // reset bindings
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    #updateCameraMatrix() {
        mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
        mat4.invert(this.colorUniforms.u_viewMatrix, this.camera.matrix);
    }

    #updateProjectionMatrix(gl) {
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
        mat4.perspective(this.colorUniforms.u_projectionMatrix, Math.PI / 4, aspect, this.camera.near, this.camera.far);
    }

    #resizeCanvasToDisplaySize(canvas) {
        // Lookup the size the browser is displaying the canvas in CSS pixels.
        const displayWidth  = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;
       
        // Check if the canvas is not the same size.
        const needResize = canvas.width  !== displayWidth ||
                           canvas.height !== displayHeight;
       
        if (needResize) {
          // Make the canvas the same size
          canvas.width  = displayWidth;
          canvas.height = displayHeight;
        }
       
        return needResize;
    }

    #initTweakpane() {
        if (this.pane) {
            const maxFar = 200;

            this.fpsGraph = this.pane.addBlade({
                view: 'fpsgraph',
                label: 'fps',
                lineCount: 1,
                maxValue: 120,
                minValue: 0
            });

            const cameraFolder = this.pane.addFolder({ title: 'Camera' });
            this.#createTweakpaneSlider(cameraFolder, this.camera, 'near', 'near', 1, maxFar, null, () => this.#updateProjectionMatrix(this.gl));
            this.#createTweakpaneSlider(cameraFolder, this.camera, 'far', 'far', 1, maxFar, null, () => this.#updateProjectionMatrix(this.gl));

            const ssaoSettings = this.pane.addFolder({ title: 'SSAO Settings' });
            this.#createTweakpaneSlider(ssaoSettings, this.ssao, 'maxKernelRadius', 'radius', 5, 200);
            this.#createTweakpaneSlider(ssaoSettings, this.ssao, 'attenuationScale', 'attenuation', 0.05, 0.5);
            this.#createTweakpaneSlider(ssaoSettings, this.ssao, 'bias', 'bias', 0.01, 1);
            this.#createTweakpaneSlider(ssaoSettings, this.ssao, 'blurScale', 'blur', 1, 10);
            ssaoSettings.addInput(this.ssao, 'enableBlur');

            const passSettings = this.pane.addFolder({ title: 'Passes' });
            passSettings.addInput(this, 'passIndex', {
                view: 'radiogrid',
                groupName: 'pass',
                size: [1, 3],
                cells: (x, y) => ({
                  title: `${this.passLabels[y]}`,
                  value: y,
                }),
                label: 'pass',
              });
        }
    }

    #createTweakpaneSlider(folder, obj, propName, label, min, max, stepSize = null, callback) {
        const slider = folder.addBlade({
            view: 'slider',
            label,
            min,
            max,
            step: stepSize,
            value: obj[propName],
        });
        slider.on('change', e => {
            obj[propName] = e.value;
            if(callback) callback();
        });
    }
}
