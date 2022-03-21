
import { mat4, quat, vec3 } from 'gl-matrix';
import { OrbitControl } from './orbit-control';

import colorVertShaderSource from './shader/color.vert';
import colorFragShaderSource from './shader/color.frag';
import { RoundedBoxGeometry } from './rounded-box-geometry';

export class SSAODemo {
    oninit;

    #time = 0;
    #frames = 0;
    #deltaTime = 0;
    #isDestroyed = false;

    camera = {
        matrix: mat4.create(),
        near: 80,
        far: 350,
        distance: 120,
        orbit: quat.create(),
        position: vec3.create(),
        rotation: vec3.create(),
        up: vec3.fromValues(0, 1, 0)
    };

    blur = {
        radius: 7,
        scale: 2
    }

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

    run(time = 0) {
        this.#deltaTime = time - this.#time;
        this.#time = time;
        this.#frames += this.#deltaTime / 16;

        if (this.#isDestroyed) return;

        this.control.update();

        this.#render();

        requestAnimationFrame((t) => this.run(t));
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.clearColor(.97, .97, 0.97, 1.);

        gl.useProgram(this.colorProgram);
        gl.uniformMatrix4fv(this.colorLocations.u_viewMatrix, false, this.colorUniforms.u_viewMatrix);
        gl.uniformMatrix4fv(this.colorLocations.u_projectionMatrix, false, this.colorUniforms.u_projectionMatrix);
        gl.uniform3f(this.colorLocations.u_cameraPosition, this.camera.position[0], this.camera.position[1], this.camera.position[2]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.envMapTexture);
        gl.uniform1i(this.colorLocations.u_envMap, 0);
        //gl.uniform1f(this.colorLocations.u_frames, this.#frames);
        const s1 = (Math.sin(this.#frames * 0.08) * 0.5 + .5) * 0.2;
        const s2 = (Math.cos(this.#frames * 0.06) * 0.5 + .5) * 0.2;
        const s3 = (Math.sin(this.#frames * 0.02) * 0.5 + .5) * 0.2;
        this.#renderCube(gl, this.cube1VAO, this.cube1Buffers.numElem, [1., 0.15, 0.15], [0, 0, 0], [25 - s1 * 5, 25 - s2 * 5, 25 - s3 * 5], [0, 1, 0], Math.PI / 4);
        this.#renderCube(gl, this.cube2VAO, this.cube2Buffers.numElem, [.95, .8, 0.2], [10, 25 - 2.5, 0], [20, 20 - s1 * 3, 20 - s2 * 2], [0, 1, 0], 0);
        this.#renderCube(gl, this.cube3VAO, this.cube3Buffers.numElem, [.2, .4, 1], [-23, 2, 10], [20, 20 - s2 * 4, 20 - s1 * 2], [0, 1, 0],  3 * Math.PI / 4.5);
        this.#renderCube(gl, this.cube3VAO, this.cube3Buffers.numElem, [.2, .95, .4], [20, -12, 13], [12 - s1 * 3, 12, 12 - s2 * 1], [0, 1, 0],  0);
        this.#renderCube(gl, this.cube2VAO, this.cube2Buffers.numElem, [.8, 0.8, 0.8], [0, -20, -15], [15 - s2 * 2, 15, 15 - s1 * 3], [0, 1, 0], Math.PI / 3);

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

        ///////////////////////////////////  PROGRAM SETUP

        // setup programs
        this.colorProgram = this.#createProgram(gl, [colorVertShaderSource, colorFragShaderSource]);

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

        this.drawFramebufferWidth = clientWidth;
        this.drawFramebufferHeight = clientHeight;

        /////////////////////////////////// FIRST BLUR PASS SETUP


        /////////////////////////////////// SECOND BLUR PASS SETUP

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

    #createFramebuffer(gl, colorAttachements) {
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
        gl.drawBuffers(drawBuffers);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    #makeVertexArray(gl, bufLocNumElmPairs, indices) {
        const va = gl.createVertexArray();
        gl.bindVertexArray(va);
        for (const [buffer, loc, numElem] of bufLocNumElmPairs) {
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
        this.drawFramebufferWidth = clientWidth;
        this.drawFramebufferHeight = clientHeight;

        // resize draw/blit textures and buffers
        /*gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT32F, clientWidth, clientHeight);
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.colorRenderbuffer);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, gl.getParameter(gl.MAX_SAMPLES), gl.RGBA8, clientWidth, clientHeight);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.texImage2D(this. gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, clientWidth, clientHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, clientWidth, clientHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // resize blur texture
        gl.bindTexture(gl.TEXTURE_2D, this.hex1VerticalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.drawFramebufferWidth, this.drawFramebufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, this.hex1DiagonalBlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.drawFramebufferWidth, this.drawFramebufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, this.hex2BlurTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.drawFramebufferWidth, this.drawFramebufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);*/
        
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
            const maxFar = 700;

            const cameraFolder = this.pane.addFolder({ title: 'Camera' });
            this.#createTweakpaneSlider(cameraFolder, this.camera, 'near', 'near', 1, maxFar, null, () => this.#updateProjectionMatrix(this.gl));
            this.#createTweakpaneSlider(cameraFolder, this.camera, 'far', 'far', 1, maxFar, null, () => this.#updateProjectionMatrix(this.gl));
            const blurSettings = this.pane.addFolder({ title: 'SSAO Settings' });
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
