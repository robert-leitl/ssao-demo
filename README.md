# WebGL - SSAO

![SSAO Screenshot](https://github.com/robert-leitl/ssao-demo/blob/main/cover.jpg?raw=true)

Rough implementation of a screen space ambient occlusion method inspired by [webgl2examples](https://github.com/tsherif/webgl2examples/blob/master/ssao.html)

[DEMO](https://robert-leitl.github.io/ssao-demo/dist/?debug)

### Features
- Multi-render targets MRT
- Bilateral gaussian blur pass
- Rounded box geometry based on [three-rounded-box](https://github.com/pailhead/three-rounded-box/blob/master/index.js)
- Equirectangular environment map (environement map: HDRi Pack 2 by [zbyg](https://www.deviantart.com/zbyg/art/HDRi-Pack-2-103458406))