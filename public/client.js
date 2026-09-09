const socket = io();

// Настройка Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Голубое небо
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Свет
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(10, 20, 0);
scene.add(directionalLight);

// Земля
const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

// Данные игры
let myId = null;
const players = {};
const items = {};
let grabbedPlayerId = null; // ID игрока, которого мы сейчас держим

// Создание меша игрока
function createPlayerMesh(color) {
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}

// Создание меша предмета
function createItemMesh(type) {
    let geometry;
    if (type === 'cube') geometry = new THREE.BoxGeometry(1, 1, 1);
    else geometry = new THREE.SphereGeometry(0.6, 32, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    return new THREE.Mesh(geometry, material);
}

// --- Сокеты ---
socket.on('init', (data) => {
    myId = data.id;
    // Инициализация игроков
    for (let id in data.players) {
        players[id] = createPlayerMesh(data.players[id].color);
        players[id].position.set(data.players[id].x, data.players[id].y, data.players[id].z);
        scene.add(players[id]);
    }
    // Инициализация предметов
    data.items.forEach(item => {
        items[item.id] = createItemMesh(item.type);
        items[item.id].position.set(item.x, item.y, item.z);
        scene.add(items[item.id]);
    });
    
    // Привязываем камеру к нашему игроку
    camera.position.set(0, 5, 10);
});

socket.on('newPlayer', (data) => {
    players[data.id] = createPlayerMesh(data.player.color);
    players[data.id].position.set(data.player.x, data.player.y, data.player.z);
    scene.add(players[data.id]);
});

socket.on('playerMoved', (data) => {
    if (players[data.id]) {
        players[data.id].position.set(data.x, data.y, data.z);
    }
});

socket.on('itemSpawned', (item) => {
    items[item.id] = createItemMesh(item.type);
    items[item.id].position.set(item.x, item.y, item.z);
    scene.add(items[item.id]);
});

socket.on('playerGrabbed', (data) => {
    if (myId === data.grabberId) {
        grabbedPlayerId = data.targetId;
    }
});

socket.on('playerReleased', (data) => {
    if (players[data.targetId]) {
        players[data.targetId].position.y = data.y;
    }
    if (grabbedPlayerId === data.targetId) {
        grabbedPlayerId = null;
    }
});

socket.on('playerDisconnected', (id) => {
    if (players[id]) {
        scene.remove(players[id]);
        delete players[id];
    }
});

// --- Управление ---
const keys = { w: false, a: false, s: false, d: false };
const speed = 0.15;

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    
    // Логика захвата на клавишу E
    if (key === 'e') {
        if (grabbedPlayerId) {
            // Если уже держим - отпускаем
            socket.emit('release', grabbedPlayerId);
        } else {
            // Ищем ближайшего игрока
            let closestId = null;
            let minDistance = 2.5; // Радиус захвата
            
            for (let id in players) {
                if (id !== myId) {
                    const dist = players[myId].position.distanceTo(players[id].position);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestId = id;
                    }
                }
            }
            if (closestId) {
                socket.emit('grab', closestId);
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

// Спавн предметов (вызывается из HTML)
window.spawnItem = function(type) {
    socket.emit('spawnItem', type);
};

// Полноэкранный режим
document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
            console.log(`Ошибка перехода в полноэкранный режим: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

// Обновление размеров при изменении окна
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Основной цикл игры
function animate() {
    requestAnimationFrame(animate);

    // Движение нашего игрока
    if (myId && players[myId]) {
        let moved = false;
        if (keys.w) { players[myId].position.z -= speed; moved = true; }
        if (keys.s) { players[myId].position.z += speed; moved = true; }
        if (keys.a) { players[myId].position.x -= speed; moved = true; }
        if (keys.d) { players[myId].position.x += speed; moved = true; }

        if (moved) {
            // Отправляем новые координаты на сервер
            socket.emit('move', { 
                x: players[myId].position.x, 
                y: players[myId].position.y, 
                z: players[myId].position.z 
            });
            
            // Камера плавно следует за игроком
            camera.position.x = players[myId].position.x;
            camera.position.z = players[myId].position.z + 10;
            camera.lookAt(players[myId].position);
        }
    }

    renderer.render(scene, camera);
}
animate();
