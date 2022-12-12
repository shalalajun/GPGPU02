import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as dat from 'lil-gui'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import Simulation from './Simulation.js'



// 이번에는 25만 파티클을 움직이는 것에 도전한다.
// 그래서 한 변이 500의 텍스처를 만든다.
// 500 * 500 = 250000

var WIDTH = 500;
var PARTICLES = WIDTH * WIDTH;
// // メモリ負荷確認用
// var stats;
// 기본 세트


// gpgpu를 하기 위해 필요한 객체들
let gpuCompute;
var velocityVariable;
var positionVariable;
var positionUniforms;
var velocityUniforms;
var particleUniforms;
var effectController;
var planeUniforms;
var width = 2048;
var height = 2048;
var size = 128;
var material, shadowMaterial;
let directionalLight, shadowCamera;
let mesh;


let colorPallete = [
    new THREE.Color(0x0d0232),
    new THREE.Color(0xe50061),
    new THREE.Color(0x1cafc0),
    new THREE.Color(0xefcb03)
  ];



/**
 * Loaders
 */
const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()
const cubeTextureLoader = new THREE.CubeTextureLoader()

/**
 * Base
 */
// Debug
const gui = new dat.GUI()
const debugObject = {}

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Update all materials
 */
const updateAllMaterials = () =>
{
    scene.traverse((child) =>
    {
        if(child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
        {
            // child.material.envMap = environmentMap
            child.material.envMapIntensity = debugObject.envMapIntensity
            child.material.needsUpdate = true
            child.castShadow = true
            child.receiveShadow = true
        }
    })
}

/**
 * Environment map
 */
const environmentMap = cubeTextureLoader.load([
    '/textures/environmentMap/px.jpg',
    '/textures/environmentMap/nx.jpg',
    '/textures/environmentMap/py.jpg',
    '/textures/environmentMap/ny.jpg',
    '/textures/environmentMap/pz.jpg',
    '/textures/environmentMap/nz.jpg'
])

environmentMap.encoding = THREE.sRGBEncoding

// scene.background = environmentMap
scene.environment = environmentMap

debugObject.envMapIntensity = 0.4
gui.add(debugObject, 'envMapIntensity').min(0).max(4).step(0.001).onChange(updateAllMaterials)

/**
 * Models
 */
let foxMixer = null





/**
 * Lights
 */
// const directionalLight = new THREE.DirectionalLight('#ffffff', 4)
// directionalLight.castShadow = true
// directionalLight.shadow.camera.far = 15
// directionalLight.shadow.mapSize.set(1024, 1024)
// directionalLight.shadow.normalBias = 0.05
// directionalLight.position.set(3.5, 2, - 1.25)
// scene.add(directionalLight)

// gui.add(directionalLight, 'intensity').min(0).max(10).step(0.001).name('lightIntensity')
// gui.add(directionalLight.position, 'x').min(- 5).max(5).step(0.001).name('lightX')
// gui.add(directionalLight.position, 'y').min(- 5).max(5).step(0.001).name('lightY')
// gui.add(directionalLight.position, 'z').min(- 5).max(5).step(0.001).name('lightZ')

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.01, 10000)
camera.position.set(-0.1, 4.0, 0.1);
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.physicallyCorrectLights = true
renderer.outputEncoding = THREE.sRGBEncoding
renderer.toneMapping = THREE.CineonToneMapping
renderer.toneMappingExposure = 1.75
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setClearColor('#211d20')
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0


/**
 * Simulation
 */


 var sim = new Simulation(renderer, size);

 setLight();
 createObj();
 
 console.log(sim);






const tick = () =>
{

    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime


    sim.velUniforms.timer.value = elapsedTime;
    sim.velUniforms.delta.value = deltaTime;

    sim.gpuCompute.compute();


    material.uniforms.posMap.value = sim.gpuCompute.getCurrentRenderTarget(sim.pos).texture;
    material.uniforms.velMap.value = sim.gpuCompute.getCurrentRenderTarget(sim.vel).texture;

    shadowMaterial.uniforms.posMap.value = sim.gpuCompute.getCurrentRenderTarget(sim.pos).texture;
    shadowMaterial.uniforms.velMap.value = sim.gpuCompute.getCurrentRenderTarget(sim.vel).texture;

    material.uniforms.timer.value = shadowMaterial.uniforms.timer.value = clock;

    mesh.material = shadowMaterial;
    renderer.setClearColor( 0x2e0232 );
    renderer.render( scene, shadowCamera, directionalLight.shadow.map);

    renderer.setClearColor( 0x2e0232 );
    mesh.material = material;
    renderer.render(scene, camera)

    controls.update()

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

function createObj()
{
    var originalG = new THREE.OctahedronGeometry(1, 0);
    var geometry = new THREE.InstancedBufferGeometry();

    var vertices = originalG.attributes.position.clone();
    geometry.setAttribute("position", vertices);

    var normals = originalG.attributes.normal.clone();
    geometry.setAttribute("normal", normals);

    var uvs = originalG.attributes.uv.clone();
    geometry.setAttribute("uv", uvs);


    geometry.maxInstancedCount = sim.size * sim.size;

    var nums = new THREE.InstancedBufferAttribute(new Float32Array(sim.size * sim.size * 1), 1, false, 1);
    var randoms = new THREE.InstancedBufferAttribute(new Float32Array(sim.size * sim.size * 1), 1, false, 1);
    var colors = new THREE.InstancedBufferAttribute(new Float32Array(sim.size * sim.size * 3), 3, false, 1);

    for(var i = 0; i < nums.count; i++)
    {
        var _color = colorPallete[Math.floor(Math.random() * colorPallete.length)];
        nums.setX(i, i);
        randoms.setX(i, Math.random() * 0.5 + 1);
        colors.setXYZ(i, _color.r, _color.g, _color.b);
    }


    geometry.setAttribute("aNum", nums);
    geometry.setAttribute("aRandom", randoms);
    geometry.setAttribute("aColor", colors);


    var scale = {
        x: 2, 
        y: 8,
        z: 2
    }


    material = new THREE.ShaderMaterial( {


        uniforms : 
        {
            posMap: {type:"t", value: sim.gpuCompute.getCurrentRenderTarget(sim.pos).texture },
            velMap: { type: "t", value: sim.gpuCompute.getCurrentRenderTarget(sim.vel).texture },
            size: { type: "f", value: sim.size },
            timer: { type: 'f', value: 0 },
            boxScale: { type: 'v3', value: new THREE.Vector3(scale.x, scale.y, scale.z) },
            meshScale: { type: 'f', value: 0.7 },
            shadowMap: { type: 't', value: directionalLight.shadow.map },
            shadowMapSize: {type: "v2", value: directionalLight.shadow.mapSize},
            shadowBias: {type: "f", value: directionalLight.shadow.bias},
            shadowRadius: {type: "f", value: directionalLight.shadow.radius},
            shadowMatrix: { type: 'm4', value: directionalLight.shadow.matrix},
            lightPosition: { type: 'v3', value: directionalLight.position }
			
        },

        vertexShader : document.getElementById( 'vs-particles' ).textContent,
        fragmentShader: document.getElementById( 'fs-particles-shadow' ).textContent,
		side: THREE.DoubleSide

    })


   mesh = new THREE.Mesh( geometry, material );
   scene.add( mesh );

    shadowMaterial = new THREE.ShaderMaterial( {
        uniforms: {
            posMap: { type: "t", value: sim.gpuCompute.getCurrentRenderTarget(sim.pos).texture },
            velMap: { type: "t", value: sim.gpuCompute.getCurrentRenderTarget(sim.vel).texture },
            size: { type: "f", value: sim.size },

            timer: { type: 'f', value: 0 },
            boxScale: { type: 'v3', value: new THREE.Vector3(scale.x, scale.y, scale.z) },
            meshScale: { type: 'f', value: 0.7 },

            shadowMatrix: { type: 'm4', value: directionalLight.shadow.matrix},
            lightPosition: { type: 'v3', value: directionalLight.position }
        },
        vertexShader: document.getElementById( 'vs-particles' ).textContent,
        fragmentShader: document.getElementById( 'fs-particles-shadow' ).textContent,
      side: THREE.DoubleSide

    } );
}

function setLight()
{
    directionalLight = new THREE.DirectionalLight( 0xFFAA55 );
    directionalLight.position.set(-4, -6, 10);
    directionalLight.castShadow = true;
    shadowCamera = directionalLight.shadow.camera;
    shadowCamera.lookAt( scene.position );

    directionalLight.shadow.matrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
    );

    directionalLight.shadow.matrix.multiply( shadowCamera.projectionMatrix );
    directionalLight.shadow.matrix.multiply( shadowCamera.matrixWorldInverse );


    if(directionalLight.shadow.map === null){
      
        directionalLight.shadow.mapSize.x = 2048;
        directionalLight.shadow.mapSize.y = 2048;
      
        var pars = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat };
        directionalLight.shadow.map = new THREE.WebGLRenderTarget( directionalLight.shadow.mapSize.x,directionalLight.shadow.mapSize.y, pars );
    }

   

}



tick()





    