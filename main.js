import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const scene = new THREE.Scene();

// reducir near para evitar recortes en algunos HMDs VR
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
// ajustes recomendados
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// usar local-floor para que la referencia de altura sea correcta en VR
renderer.xr.enabled = true;
try {
  renderer.xr.setReferenceSpaceType('local-floor');
} catch (e) {
  // algunos entornos no soportan local-floor; caer a 'local'
  renderer.xr.setReferenceSpaceType && renderer.xr.setReferenceSpaceType('local');
}
document.body.appendChild(VRButton.createButton(renderer));

/* =============================================================
   🎮 AJUSTE DE CÁMARA PARA MODO VR (con protecciones)
   ============================================================= */
renderer.xr.addEventListener("sessionstart", () => {
  console.log('>> VR session started');
  // pequeña espera para evitar race condition con carga de modelos / referencia XR
  setTimeout(() => {
    if (typeof nave !== 'undefined' && nave && nave.position) {
      // colocar cámara detrás y por encima de la nave
      camera.position.set(nave.position.x, nave.position.y + 2, nave.position.z + 5);
      camera.lookAt(nave.position);
    } else {
      // fallback seguro si la nave aún no está cargada
      camera.position.set(0, 3, 8);
      camera.lookAt(0, 1, -10);
    }
    camera.updateProjectionMatrix();
  }, 50);
});

renderer.xr.addEventListener("sessionend", () => {
  console.log('>> VR session ended');
  // Volver a vista normal de escritorio
  camera.position.set(0, 10, 90);
  camera.lookAt(0, 1, -10);
  camera.updateProjectionMatrix();
});

// Skybox
const loaderCube = new THREE.CubeTextureLoader();
loaderCube.setPath('skybox/');
let skyboxTexture = null;
try {
  skyboxTexture = loaderCube.load([
      'px.png', 'nx.png',
      'py.png', 'ny.png',
      'pz.png', 'nz.png'
  ]);
  scene.background = skyboxTexture;
} catch (e) {
  console.warn('Skybox no cargado o faltan rutas:', e);
}

// OrbitControls (solo para debugging/desktop)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enablePan = false;
controls.enableZoom = false;

/* VARIABLES DEL JUEGO */
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

const loaderFbx = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

/* BIENVENIDA */
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
welcomeMsg.innerHTML = "🚀 BIENVENIDO 🚀<br><span style='font-size: 16px; color: #00FFEA;'>El juego comenzará en 2 segundos...</span>";
document.body.appendChild(welcomeMsg);

/* GAME OVER */
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
gameOverMsg.innerHTML = "💥 GAME OVER 💥<br><span style='font-size: 16px; color: #FFFFFF;'>Reiniciando...</span>";
document.body.appendChild(gameOverMsg);

/* ESTRELLAS */
const stars = [];
function addStar() {
    const geo = new THREE.SphereGeometry(0.5, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true
    });
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

/* NAVE */
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
    nave.position.set(0, 0, 20);
    nave.rotation.x = Math.PI;
    scene.add(nave);
    naveBox = new THREE.Box3().setFromObject(nave);
    naveCargada = true;
    console.log('🚀 Nave básica creada');
}
crearNaveBasica();

const texturaNave = textureLoader.load("superttt.png", () => {}, () => {});
loaderFbx.load("nave.fbx", (object) => {
    if (nave) scene.remove(nave);
    object.scale.set(0.03, 0.03, -0.03);
    object.position.set(0, 0, 20);
    object.rotation.set(0, Math.PI, 0);
    object.traverse((child) => {
        if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
                map: texturaNave,
                roughness: 0.8,
                metalness: 0.2,
                emissive: 0x111111
            });
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    nave = object;
    scene.add(object);
    naveBox = new THREE.Box3().setFromObject(nave);
    naveCargada = true;
    console.log('✅ Nave FBX agregada');
}, (p) => {
    // progreso opcional
}, (err) => {
    console.warn('No se pudo cargar nave.fbx, se usa nave básica', err);
});

/* METEORITOS */
const obstacles = [];
const meteorTexture = textureLoader.load("meteoro.jpg", () => {}, () => {});

function createFallbackMeteorito() {
    const geo = new THREE.OctahedronGeometry(3, 0);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.9,
        metalness: 0.1
    });
    const meteor = new THREE.Mesh(geo, mat);
    meteor.userData.box = new THREE.Box3();
    meteor.userData.puntosSumados = false;
    return meteor;
}

function resetObstacle(obj) {
    if (!naveCargada) return;
    obj.position.set(
        (Math.random() - 0.5) * 150,
        (Math.random() - 0.5) * 100,
        nave.position.z - 200 - Math.random() * 100
    );
    const velocidadActual = velocidadBase + difficultySpeed;
    obj.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        velocidadActual
    );
    obj.userData.puntosSumados = false;
}

function addObstacle(path) {
    loaderFbx.load(path, (obj) => {
        obj.scale.set(0.08, 0.08, 0.08);
        obj.userData.box = new THREE.Box3();
        obj.userData.puntosSumados = false;
        obj.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    map: meteorTexture,
                    roughness: 0.9,
                    metalness: 0.1
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        resetObstacle(obj);
        scene.add(obj);
        obstacles.push(obj);
    }, null, () => {
        const meteor = createFallbackMeteorito();
        resetObstacle(meteor);
        scene.add(meteor);
        obstacles.push(meteor);
    });
}

for (let i = 0; i < 6; i++) addObstacle("meteorito.fbx");

/* ILUMINACIÓN */
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 10, 20);
dirLight.castShadow = true;
scene.add(dirLight);

const pointLight = new THREE.PointLight(0x00aaff, 0.8, 50);
pointLight.position.set(0, 0, 15);
scene.add(pointLight);

const naveLight = new THREE.PointLight(0x00ff88, 0.3, 20);
naveLight.position.set(0, 0, 25);
scene.add(naveLight);

/* CÁMARA */
camera.position.set(0, 10, 90);

/* CONTROLES MOUSE / TOUCH */
window.addEventListener("mousemove", (e) => {
    if (gamePaused || !naveCargada) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    targetX = nx * 30;
    targetY = ny * 20;
});

window.addEventListener("touchmove", (e) => {
    if (gamePaused || !naveCargada) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    targetX = nx * 30;
    targetY = ny * 20;
});

/* DIFICULTAD */
function actualizarDificultad() {
    if (!gamePaused) {
        gameTime = (Date.now() - startTime) / 1000;
        if (gameTime > 15 && Math.floor(gameTime) % 15 === 0) {
            if (velocidadBase < 4.0) {
                velocidadBase += 0.3;
                difficultySpeed += 0.1;
                console.log('🚀 Aumentando velocidad', velocidadBase);
            }
        }
    }
}

/* GAME OVER */
function triggerGameOver() {
    if (gamePaused) return;
    gamePaused = true;
    gameOverMsg.style.display = "block";
    cameraShakeIntensity = 8;
    if (naveCargada && nave) {
        crearExplosion(nave.position);
        nave.visible = false;
    }
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("bestScore", bestScore.toString());
    }
    setTimeout(() => {
        location.reload();
    }, 2000);
}

/* PARTÍCULAS DE PUNTOS */
function spawnFloatingPoints(amount, x, y) {
    const pointDiv = document.createElement("div");
    pointDiv.style.position = "fixed";
    pointDiv.style.left = `${x}px`;
    pointDiv.style.top = `${y}px`;
    pointDiv.style.color = "#00FFEA";
    pointDiv.style.fontFamily = "'Courier New', monospace";
    pointDiv.style.fontSize = "18px";
    pointDiv.style.fontWeight = "bold";
    pointDiv.style.textShadow = "0 0 8px #00FFF6";
    pointDiv.style.pointerEvents = "none";
    pointDiv.style.zIndex = "1000";
    pointDiv.innerHTML = `+${amount}`;
    document.body.appendChild(pointDiv);

    let opacity = 1;
    let offsetY = 0;

    const floatAnim = setInterval(() => {
        offsetY -= 2;
        opacity -= 0.02;
        pointDiv.style.top = `${y + offsetY}px`;
        pointDiv.style.opacity = opacity;
        if (opacity <= 0) {
            clearInterval(floatAnim);
            pointDiv.remove();
        }
    }, 16);
}

/* EXPLOSIONES */
const explosiones = [];
function crearExplosion(pos) {
    const cantidad = 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(cantidad * 3);
    const velocities = [];
    const colors = new Float32Array(cantidad * 3);

    for (let i = 0; i < cantidad; i++) {
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        const speed = 1 + Math.random() * 2;
        velocities.push(
            (Math.random() - 0.5) * speed,
            (Math.random() - 0.5) * speed,
            (Math.random() - 0.5) * speed
        );
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = Math.random() * 0.5;
        colors[i * 3 + 2] = 0.0;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 3,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 1,
        vertexColors: true,
        sizeAttenuation: true
    });

    const pts = new THREE.Points(geometry, material);
    pts.userData.vel = velocities;
    pts.userData.life = 1.2;
    pts.userData.maxLife = 1.2;
    scene.add(pts);
    explosiones.push(pts);
}

/* INICIO */
setTimeout(() => {
    welcomeMsg.style.display = "none";
    meteoritosActive = true;
    startTime = Date.now();
    gamePaused = false;
}, 2000);

/* LOOP PRINCIPAL: usar setAnimationLoop para WebXR */
renderer.setAnimationLoop(() => {
    // calcular delta si lo necesitas (aquí simple)
    if (!gamePaused) {
        actualizarDificultad();

        if (naveCargada && nave) {
            naveLight.position.copy(nave.position);
            naveLight.position.z += 5;
            // mover nave suavemente
            nave.position.x += (targetX - nave.position.x) * 0.1;
            nave.position.y += (targetY - nave.position.y) * 0.1;
            naveBox.setFromObject(nave);
            nave.rotation.z = (targetX - nave.position.x) * 0.02;
            nave.rotation.x = (targetY - nave.position.y) * 0.01;
        }

        // estrellas
        stars.forEach(star => {
            star.position.z += 1.5;
            if (star.material) {
                star.material.opacity = Math.abs(Math.sin(Date.now() * star.userData.twinkleSpeed)) * 0.6 + 0.4;
            }
            if (star.position.z > 300) {
                star.position.z = -600;
                star.position.x = THREE.MathUtils.randFloatSpread(800);
                star.position.y = THREE.MathUtils.randFloatSpread(800);
            }
        });

        // meteoritos
        if (meteoritosActive && naveCargada) {
            obstacles.forEach((obs, index) => {
                obs.rotation.x += 0.015;
                obs.rotation.y += 0.01;
                if (obs.userData && obs.userData.velocity) obs.position.add(obs.userData.velocity);
                if (obs.userData && obs.userData.box) obs.userData.box.setFromObject(obs);

                if (nave && naveBox && obs.userData && obs.userData.box && naveBox.intersectsBox(obs.userData.box)) {
                    triggerGameOver();
                    return;
                }

                if (obs.position.z > nave.position.z + 30 && !obs.userData.puntosSumados) {
                    score += 10;
                    bestScore = Math.max(score, bestScore);
                    obs.userData.puntosSumados = true;
                    spawnFloatingPoints(10, window.innerWidth / 2, window.innerHeight / 2);
                }

                if (obs.position.z > 400 || Math.abs(obs.position.x) > 200 || Math.abs(obs.position.y) > 200) {
                    resetObstacle(obs);
                }
            });
        }

        // explosiones (proteger atributos)
        for (let i = explosiones.length - 1; i >= 0; i--) {
            const expl = explosiones[i];
            const posAttr = expl.geometry.attributes.position;
            const colorAttr = expl.geometry.attributes.color;
            if (!posAttr) continue; // seguridad
            const positions = posAttr.array;

            // usar vel seguro
            const vel = expl.userData.vel || [];
            for (let j = 0; j < positions.length; j += 3) {
                positions[j] += (vel[j] !== undefined ? vel[j] : 0);
                positions[j + 1] += (vel[j + 1] !== undefined ? vel[j + 1] : 0);
                positions[j + 2] += (vel[j + 2] !== undefined ? vel[j + 2] : 0);
                if (vel[j + 1] !== undefined) vel[j + 1] -= 0.02;
            }

            expl.userData.life -= 0.03;
            expl.material.opacity = Math.max(0, expl.userData.life);
            expl.material.size = 3 * (expl.userData.life / expl.userData.maxLife);

            posAttr.needsUpdate = true;
            if (colorAttr) colorAttr.needsUpdate = true;

            if (expl.userData.life <= 0) {
                scene.remove(expl);
                explosiones.splice(i, 1);
            }
        }

        // sacudida de cámara (aplicar con moderación)
        if (cameraShakeIntensity > 0) {
            camera.position.x += (Math.random() - 0.5) * cameraShakeIntensity;
            camera.position.y += (Math.random() - 0.5) * cameraShakeIntensity;
            cameraShakeIntensity *= 0.85;
        }
    }

    renderer.render(scene, camera);
});

/* RESPONSIVE */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
document.body.style.background = '#000';

console.log('🎯 Juego cargado SIN AUDIO y SIN HUD (preparado para VR)');
