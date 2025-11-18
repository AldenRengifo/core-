import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const scene = new THREE.Scene();

/* ===================== 🧍 PLAYER RIG  ===================== */
const playerRig = new THREE.Group();
scene.add(playerRig);

/* ====================== CAMARA ====================== */
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.01,
    1000
);
// Posición inicial de la cámara más alejada de la nave
camera.position.set(0, 8, 25);
playerRig.add(camera);

/* ====================== RENDERER ====================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.xr.enabled = true;

try {
    renderer.xr.setReferenceSpaceType("local-floor");
} catch (e) {
    renderer.xr.setReferenceSpaceType && renderer.xr.setReferenceSpaceType("local");
}
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

/* ====================== VR CAMERA MODE ====================== */
renderer.xr.addEventListener("sessionstart", () => {
    console.log(">> VR START");

    // Asegurarnos de que la nave sea visible
    if (nave) {
        nave.visible = true;
    }

    setTimeout(() => {
        if (nave) {
            // En VR, posicionar todo el playerRig detrás de la nave
            // Esto crea un offset desde la posición de la nave
            const offsetBehind = 12;
            playerRig.position.set(
                nave.position.x,
                nave.position.y + 1.5, // Altura para vista en tercera persona
                nave.position.z + offsetBehind
            );
            
            // La cámara en VR será controlada por el headset
            // pero estará posicionada relativamente al playerRig
            console.log("VR: PlayerRig posicionado detrás de la nave");
        }
    }, 100);
});

renderer.xr.addEventListener("sessionend", () => {
    console.log(">> VR END");
    // Al salir de VR, resetear el playerRig a la posición de la nave
    if (nave) {
        playerRig.position.copy(nave.position);
        camera.position.set(0, 8, 25);
        camera.lookAt(nave.position);
    }
});

/* ====================== SKYBOX ====================== */
const loaderCube = new THREE.CubeTextureLoader();
loaderCube.setPath('skybox/');
let skyboxTexture = null;

try {
    skyboxTexture = loaderCube.load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
    scene.background = skyboxTexture;
} catch(e) {
    console.warn("Skybox no cargado:", e);
}

/* ====================== CONTROLES ====================== */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = false;

/* ====================== VARIABLES DEL JUEGO ====================== */
let nave = null;
let naveBox = new THREE.Box3();
let targetY = 3;
let targetX = 0;
let score = 0;
let bestScore = parseInt(localStorage.getItem("bestScore")) || 0;
let difficultySpeed = 0;
let cameraShakeIntensity = 0;
let respawnStarsNow = false;
let meteoritosActive = false;
let gamePaused = true;
let startTime = Date.now();
let gameTime = 0;
let velocidadBase = 1.2;
let gameOver = false;

// Variables para controles de Xbox
let gamepadConnected = false;
let gamepadIndex = null;
const deadZone = 0.15;

const loaderFbx = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

/* ====================== BIENVENIDA ====================== */
const welcomeMsg = document.createElement("div");
welcomeMsg.style.position = "fixed";
welcomeMsg.style.top = "50%";
welcomeMsg.style.left = "50%";
welcomeMsg.style.transform = "translate(-50%, -50%)";
welcomeMsg.style.color = "#FFFF00";
welcomeMsg.style.fontFamily = "'Courier New', monospace";
welcomeMsg.style.fontSize = "36px";
welcomeMsg.style.fontWeight = "bold";
welcomeMsg.style.textAlign = "center";
welcomeMsg.style.textShadow = "0 0 15px #FFFF00, 0 0 30px #FFFF00";
welcomeMsg.style.letterSpacing = "3px";
welcomeMsg.style.zIndex = "1000";
welcomeMsg.style.backgroundColor = "rgba(0,0,0,0.8)";
welcomeMsg.style.padding = "30px";
welcomeMsg.style.borderRadius = "15px";
welcomeMsg.style.border = "3px solid #FFFF00";
welcomeMsg.innerHTML = "🚀 BIENVENIDO 🚀<br><span style='font-size: 16px; color: #00FFEA;'>El juego comenzará en 5 segundos...</span>";
document.body.appendChild(welcomeMsg);

/* ====================== CONTADOR REGRESIVO ====================== */
const countdownMsg = document.createElement("div");
countdownMsg.style.position = "fixed";
countdownMsg.style.top = "60%";
countdownMsg.style.left = "50%";
countdownMsg.style.transform = "translate(-50%, -50%)";
countdownMsg.style.color = "#00FFEA";
countdownMsg.style.fontFamily = "'Courier New', monospace";
countdownMsg.style.fontSize = "48px";
countdownMsg.style.fontWeight = "bold";
countdownMsg.style.textAlign = "center";
countdownMsg.style.textShadow = "0 0 15px #00FFEA, 0 0 30px #00FFEA";
countdownMsg.style.letterSpacing = "3px";
countdownMsg.style.zIndex = "1000";
countdownMsg.style.display = "none";
document.body.appendChild(countdownMsg);

/* ====================== GAME OVER ====================== */
const gameOverMsg = document.createElement("div");
gameOverMsg.style.position = "fixed";
gameOverMsg.style.top = "50%";
gameOverMsg.style.left = "50%";
gameOverMsg.style.transform = "translate(-50%, -50%)";
gameOverMsg.style.color = "#FF0055";
gameOverMsg.style.fontFamily = "'Courier New', monospace";
gameOverMsg.style.fontSize = "36px";
gameOverMsg.style.fontWeight = "bold";
gameOverMsg.style.textAlign = "center";
gameOverMsg.style.textShadow = "0 0 15px #FF0055, 0 0 30px #FF0055";
gameOverMsg.style.letterSpacing = "3px";
gameOverMsg.style.display = "none";
gameOverMsg.style.zIndex = "1000";
gameOverMsg.style.backgroundColor = "rgba(0,0,0,0.9)";
gameOverMsg.style.padding = "30px";
gameOverMsg.style.borderRadius = "15px";
gameOverMsg.style.border = "3px solid #FF0055";
gameOverMsg.innerHTML = "💥 GAME OVER 💥<br><span style='font-size: 16px; color: #FFFFFF;'>Pulsa R o Botón A para reiniciar</span>";
document.body.appendChild(gameOverMsg);

/* ====================== ESTRELLAS ====================== */
const stars = [];
function addStar() {
    const geo = new THREE.SphereGeometry(0.5, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const star = new THREE.Mesh(geo, mat);
    star.position.set(
        THREE.MathUtils.randFloatSpread(800),
        THREE.MathUtils.randFloatSpread(800),
        THREE.MathUtils.randFloatSpread(1500) - 500
    );
    star.userData.twinkleSpeed = THREE.MathUtils.randFloat(0.001, 0.008);
    star.userData.initialScale = THREE.MathUtils.randFloat(0.2, 1.0);
    star.scale.setScalar(star.userData.initialScale);
    scene.add(star);
    stars.push(star);
}
for (let i = 0; i < 300; i++) addStar();

/* ====================== NAVE ====================== */
let naveCargada = false;

function crearNaveBasica() {
    const geo = new THREE.ConeGeometry(2, 6, 8);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x00FF00,
        roughness: 0.7,
        metalness: 0.3,
        emissive: 0x003300
    });
    nave = new THREE.Mesh(geo, mat);
    nave.position.set(0,0,20);
    nave.rotation.x = Math.PI;
    scene.add(nave);
    naveBox = new THREE.Box3().setFromObject(nave);
    naveCargada = true;
}
crearNaveBasica();

const texturaNave = textureLoader.load("superttt.png");
loaderFbx.load("nave.fbx", (object)=>{
    if(nave) scene.remove(nave);
    object.scale.set(0.03,0.03,-0.03);
    object.position.set(0,0,20);
    object.rotation.set(0,Math.PI,0);
    object.traverse(c=>{
        if(c.isMesh){
            c.material = new THREE.MeshStandardMaterial({
                map: texturaNave,
                roughness: 0.8,
                metalness: 0.2,
                emissive: 0x111111
            });
            c.castShadow = true;
            c.receiveShadow = true;
        }
    });
    nave = object;
    scene.add(object);
    naveBox = new THREE.Box3().setFromObject(nave);
    naveCargada = true;
});

/* ====================== METEORITOS ====================== */
const obstacles = [];
const meteorTexture = textureLoader.load("meteoro.jpg");

function createFallbackMeteorito(){
    const geo = new THREE.OctahedronGeometry(3,0);
    const mat = new THREE.MeshStandardMaterial({
        color:0x666666,
        roughness:0.9,
        metalness:0.1
    });
    const meteor = new THREE.Mesh(geo,mat);
    meteor.userData.box = new THREE.Box3();
    meteor.userData.puntosSumados=false;
    return meteor;
}

function resetObstacle(obj){
    if(!naveCargada)return;
    obj.position.set(
        (Math.random()-0.5)*150,
        (Math.random()-0.5)*100,
        nave.position.z-200-Math.random()*100
    );
    const velocidadActual = velocidadBase + difficultySpeed;
    obj.userData.velocity = new THREE.Vector3(
        (Math.random()-0.5)*0.4,
        (Math.random()-0.5)*0.4,
        velocidadActual
    );
    obj.userData.puntosSumados=false;
}

function addObstacle(path){
    loaderFbx.load(path,(obj)=>{
        obj.scale.set(0.08,0.08,0.08);
        obj.userData.box=new THREE.Box3();
        obj.userData.puntosSumados=false;
        obj.traverse(c=>{
            if(c.isMesh){
                c.material=new THREE.MeshStandardMaterial({
                    map:meteorTexture,
                    roughness:0.9,
                    metalness:0.1
                });
                c.castShadow=true;
                c.receiveShadow=true;
            }
        });
        resetObstacle(obj);
        scene.add(obj);
        obstacles.push(obj);
    },null,()=>{
        const meteor=createFallbackMeteorito();
        resetObstacle(meteor);
        scene.add(meteor);
        obstacles.push(meteor);
    });
}
for(let i=0;i<6;i++) addObstacle("meteorito.fbx");

/* ====================== LUCES ====================== */
scene.add(new THREE.AmbientLight(0xffffff,0.8));
const dirLight=new THREE.DirectionalLight(0xffffff,1);
dirLight.position.set(10,10,20);
dirLight.castShadow=true;
scene.add(dirLight);

const pointLight=new THREE.PointLight(0x00aaff,0.8,50);
pointLight.position.set(0,0,15);
scene.add(pointLight);

const naveLight=new THREE.PointLight(0x00ff88,0.3,20);
naveLight.position.set(0,0,25);
scene.add(naveLight);

/* ====================== CONTROLES XBOX ====================== */
function updateGamepadState() {
    if (!gamepadConnected || gamepadIndex === null) return;
    
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (!gamepad) return;

    // Analógicos izquierdos (ejes 0 y 1) para movimiento
    const leftStickX = Math.abs(gamepad.axes[0]) > deadZone ? gamepad.axes[0] : 0;
    const leftStickY = Math.abs(gamepad.axes[1]) > deadZone ? gamepad.axes[1] : 0;

    // Aplicar movimiento con el stick izquierdo
    if (!gamePaused && !gameOver && naveCargada) {
        targetX = leftStickX * 30;
        targetY = -leftStickY * 20; // Invertir Y para que sea intuitivo
    }

    // Botón A (índice 0) para reiniciar
    if (gamepad.buttons[0].pressed) {
        if (gameOver) {
            reiniciarJuego();
        }
    }

    // Botón B (índice 1) como alternativa para reiniciar
    if (gamepad.buttons[1].pressed) {
        if (gameOver) {
            reiniciarJuego();
        }
    }

    // Botón Start (índice 9) para pausar/reanudar
    if (gamepad.buttons[9].pressed) {
        if (!buttonCooldown) {
            gamePaused = !gamePaused;
            buttonCooldown = true;
            setTimeout(() => { buttonCooldown = false; }, 300);
        }
    }
}

let buttonCooldown = false;

// Detectar conexión/desconexión de gamepad
window.addEventListener("gamepadconnected", (e) => {
    console.log("🎮 Gamepad conectado:", e.gamepad.id);
    gamepadConnected = true;
    gamepadIndex = e.gamepad.index;
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("🎮 Gamepad desconectado:", e.gamepad.id);
    gamepadConnected = false;
    gamepadIndex = null;
});

/* ====================== MOVIMIENTO MOUSE ====================== */
window.addEventListener("mousemove",(e)=>{
    if(gamePaused||!naveCargada||gameOver)return;
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((e.clientX-rect.left)/rect.width)*2-1;
    const ny=-((e.clientY-rect.top)/rect.height)*2+1;
    targetX=nx*30;
    targetY=ny*20;
});

/* ====================== TOUCH ====================== */
window.addEventListener("touchmove",(e)=>{
    if(gamePaused||!naveCargada||gameOver)return;
    e.preventDefault();
    const t=e.touches[0];
    const rect=renderer.domElement.getBoundingClientRect();
    const nx=((t.clientX-rect.left)/rect.width)*2-1;
    const ny=-((t.clientY-rect.top)/rect.height)*2+1;
    targetX=nx*30;
    targetY=ny*20;
});

/* ====================== REINICIAR JUEGO ====================== */
function reiniciarJuego() {
    gameOver = false;
    gamePaused = false;
    score = 0;
    gameTime = 0;
    velocidadBase = 1.2;
    difficultySpeed = 0;
    cameraShakeIntensity = 0;
    
    // Resetear nave
    if (nave) {
        nave.position.set(0, 0, 20);
        nave.visible = true;
    }
    
    // Resetear meteoritos
    obstacles.forEach(obs => {
        resetObstacle(obs);
    });
    
    // Limpiar explosiones
    explosiones.forEach(exp => {
        scene.remove(exp);
    });
    explosiones.length = 0;
    
    // Resetear playerRig
    playerRig.position.set(0, 0, 0);
    camera.position.set(0, 8, 25);
    
    gameOverMsg.style.display = "none";
    startTime = Date.now();
}

/* ====================== TECLADO ====================== */
window.addEventListener("keydown", (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (gameOver) {
            reiniciarJuego();
        }
    }
    
    // También permitir reinicio con Enter o Espacio
    if (e.key === 'Enter' || e.key === ' ') {
        if (gameOver) {
            reiniciarJuego();
        }
    }
});

/* ====================== DIFICULTAD ====================== */
function actualizarDificultad(){
    if(!gamePaused && !gameOver){
        gameTime=(Date.now()-startTime)/1000;
        if(gameTime>15 && Math.floor(gameTime)%15===0){
            if(velocidadBase<4.0){
                velocidadBase+=0.3;
                difficultySpeed+=0.1;
            }
        }
    }
}

/* ====================== GAME OVER ====================== */
function triggerGameOver(){
    if(gamePaused || gameOver) return;
    gameOver = true;
    gamePaused = true;
    gameOverMsg.style.display = "block";
    cameraShakeIntensity = 8;
    
    if(naveCargada && nave){
        crearExplosion(nave.position);
        nave.visible = false;
    }
    
    if(score > bestScore){
        bestScore = score;
        localStorage.setItem("bestScore", String(bestScore));
    }
}

/* ====================== PARTICULAS ====================== */
function spawnFloatingPoints(amount,x,y){
    const div=document.createElement("div");
    div.style.position="fixed";
    div.style.left=`${x}px`;
    div.style.top=`${y}px`;
    div.style.color="#00FFEA";
    div.style.fontFamily="'Courier New', monospace";
    div.style.fontSize="18px";
    div.style.fontWeight="bold";
    div.style.textShadow="0 0 8px #00FFF6";
    div.style.pointerEvents="none";
    div.style.zIndex="1000";
    div.innerHTML=`+${amount}`;
    document.body.appendChild(div);

    let o=1,yOff=0;
    const anim=setInterval(()=>{
        yOff-=2;
        o-=0.02;
        div.style.top=`${y+yOff}px`;
        div.style.opacity=o;
        if(o<=0){
            clearInterval(anim);
            div.remove();
        }
    },16);
}

/* ====================== EXPLOSION ====================== */
const explosiones=[];
function crearExplosion(pos){
    const cant=80;
    const geo=new THREE.BufferGeometry();
    const positions=new Float32Array(cant*3);
    const vel=[];
    const colors=new Float32Array(cant*3);

    for(let i=0;i<cant;i++){
        positions[i*3]=pos.x;
        positions[i*3+1]=pos.y;
        positions[i*3+2]=pos.z;
        const sp=1+Math.random()*2;
        vel.push((Math.random()-0.5)*sp,(Math.random()-0.5)*sp,(Math.random()-0.5)*sp);
        colors[i*3]=1;
        colors[i*3+1]=Math.random()*0.5;
        colors[i*3+2]=0;
    }

    geo.setAttribute("position",new THREE.BufferAttribute(positions,3));
    geo.setAttribute("color",new THREE.BufferAttribute(colors,3));
    const mat=new THREE.PointsMaterial({
        size:3,
        blending:THREE.AdditiveBlending,
        transparent:true,
        opacity:1,
        vertexColors:true,
        sizeAttenuation:true
    });

    const pts=new THREE.Points(geo,mat);
    pts.userData.vel=vel;
    pts.userData.life=1.2;
    pts.userData.maxLife=1.2;
    scene.add(pts);
    explosiones.push(pts);
}

/* ====================== START CON COUNTDOWN ====================== */
setTimeout(() => {
    welcomeMsg.style.display = "none";
    countdownMsg.style.display = "block";
    
    let countdown = 5;
    countdownMsg.textContent = countdown;
    
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownMsg.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            countdownMsg.style.display = "none";
            meteoritosActive = true;
            startTime = Date.now();
            gamePaused = false;
        }
    }, 1000);
}, 2000);

/* ====================== LOOP ====================== */
renderer.setAnimationLoop(()=>{
    // Actualizar controles de Xbox en cada frame
    updateGamepadState();
    
    if(!gamePaused && !gameOver){
        actualizarDificultad();

        if(naveCargada && nave){
            naveLight.position.copy(nave.position);
            naveLight.position.z+=5;
            nave.position.x += (targetX - nave.position.x)*0.1;
            nave.position.y += (targetY - nave.position.y)*0.1;
            naveBox.setFromObject(nave);
            nave.rotation.z = (targetX - nave.position.x)*0.02;
            nave.rotation.x = (targetY - nave.position.y)*0.01;
            
            // En VR, el playerRig mantiene su offset detrás de la nave
            // En modo normal, el playerRig sigue exactamente a la nave
            if (renderer.xr.isPresenting) {
                // En VR: mantener el offset establecido en sessionstart
                // No hacer nada aquí, el offset ya está establecido
            } else {
                // En modo normal: playerRig sigue exactamente a la nave
                playerRig.position.copy(nave.position);
            }
        }

        stars.forEach(star=>{
            star.position.z+=1.5;
            if(star.material){
                star.material.opacity=Math.abs(Math.sin(Date.now()*star.userData.twinkleSpeed))*0.6+0.4;
            }
            if(star.position.z>300){
                star.position.z=-600;
                star.position.x=THREE.MathUtils.randFloatSpread(800);
                star.position.y=THREE.MathUtils.randFloatSpread(800);
            }
        });

        if(meteoritosActive && naveCargada){
            obstacles.forEach(obs=>{
                obs.rotation.x+=0.015;
                obs.rotation.y+=0.01;
                if(obs.userData && obs.userData.velocity)
                    obs.position.add(obs.userData.velocity);
                if(obs.userData && obs.userData.box)
                    obs.userData.box.setFromObject(obs);

                if(nave && naveBox && obs.userData.box && naveBox.intersectsBox(obs.userData.box) && !gameOver){
                    triggerGameOver();
                    return;
                }

                if(obs.position.z > nave.position.z+30 && !obs.userData.puntosSumados && !gameOver){
                    score+=10;
                    bestScore=Math.max(score,bestScore);
                    obs.userData.puntosSumados=true;
                    spawnFloatingPoints(10, window.innerWidth/2, window.innerHeight/2);
                }

                if(obs.position.z>400 || Math.abs(obs.position.x)>200 || Math.abs(obs.position.y)>200){
                    resetObstacle(obs);
                }
            });
        }

        for(let i=explosiones.length-1;i>=0;i--){
            const e=explosiones[i];
            const arr=e.geometry.attributes.position;
            if(!arr) continue;
            const pos=arr.array;
            const v=e.userData.vel||[];

            for(let j=0;j<pos.length;j+=3){
                pos[j] += v[j] ?? 0;
                pos[j+1] += v[j+1] ?? 0;
                pos[j+2] += v[j+2] ?? 0;
                if(v[j+1]!==undefined) v[j+1] -= 0.02;
            }

            e.userData.life -=0.03;
            e.material.opacity=Math.max(0,e.userData.life);
            e.material.size=3*(e.userData.life/e.userData.maxLife);

            arr.needsUpdate=true;
            if(e.geometry.attributes.color)e.geometry.attributes.color.needsUpdate=true;

            if(e.userData.life<=0){
                scene.remove(e);
                explosiones.splice(i,1);
            }
        }

        if(cameraShakeIntensity>0){
            camera.position.x += (Math.random()-0.5)*cameraShakeIntensity;
            camera.position.y += (Math.random()-0.5)*cameraShakeIntensity;
            cameraShakeIntensity*=0.85;
        }
    }

    renderer.render(scene,camera);
});

/* ====================== RESPONSIVE ====================== */
window.addEventListener("resize",()=>{
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
});

document.body.style.margin='0';
document.body.style.padding='0';
document.body.style.overflow='hidden';
document.body.style.background='#000';

console.log('🎯 Juego cargado VERSION VR CORREGIDA + PLAYERRIG POSITION FIX 🌎');
