const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const items = [];

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Спавн игрока в случайном месте
    players[socket.id] = {
        x: Math.random() * 10 - 5,
        y: 1,
        z: Math.random() * 10 - 5,
        facingX: 0,
        facingZ: -1,
        color: Math.random() * 0xffffff,
        grabbed: null // ID игрока, которого мы держим
    };

    socket.emit('init', { id: socket.id, players, items });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            
            // Сохраняем направление, куда смотрит игрок (для броска)
            if (data.facingX !== 0 || data.facingZ !== 0) {
                players[socket.id].facingX = data.facingX;
                players[socket.id].facingZ = data.facingZ;
            }

            // Если игрок кого-то держит, тащим его за собой (чуть впереди)
            const grabbedId = players[socket.id].grabbed;
            if (grabbedId && players[grabbedId]) {
                players[grabbedId].x = data.x + (players[socket.id].facingX * 1.5); 
                players[grabbedId].z = data.z + (players[socket.id].facingZ * 1.5);
                io.emit('playerMoved', { id: grabbedId, player: players[grabbedId] });
            }

            socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
        }
    });

    socket.on('spawnItem', (itemType) => {
        const p = players[socket.id];
        const item = {
            id: Math.random().toString(36).substr(2, 9),
            type: itemType,
            x: p.x + p.facingX * 3, // Спавним перед собой
            y: 1,
            z: p.z + p.facingZ * 3
        };
        items.push(item);
        io.emit('itemSpawned', item);
    });

    socket.on('toggleGrab', () => {
        const player = players[socket.id];
        if (!player) return;

        if (player.grabbed) {
            // Если уже держим — просто отпускаем на месте
            player.grabbed = null;
        } else {
            // Ищем ближайшего игрока для захвата
            let closestId = null;
            let minDist = 3.5; // Радиус захвата

            for (let id in players) {
                if (id === socket.id) continue;
                const p = players[id];
                const dist = Math.sqrt((p.x - player.x)**2 + (p.z - player.z)**2);
                if (dist < minDist) {
                    minDist = dist;
                    closestId = id;
                }
            }

            if (closestId) {
                player.grabbed = closestId;
            }
        }
    });

    socket.on('throw', () => {
        const player = players[socket.id];
        if (!player) return;

        const grabbedId = player.grabbed;
        if (grabbedId && players[grabbedId]) {
            // Откидываем захваченного игрока в ту сторону, куда смотрим
            const throwForce = 6; // Сила броска (дальность)
            players[grabbedId].x += player.facingX * throwForce;
            players[grabbedId].z += player.facingZ * throwForce;
            
            // Сообщаем всем новые координаты отброшенного
            io.emit('playerMoved', { id: grabbedId, player: players[grabbedId] });
        }
        // В любом случае отпускаем
        player.grabbed = null;
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        
        // Если отключившегося кто-то держал, нужно его отпустить
        for(let id in players) {
            if(players[id].grabbed === socket.id) {
                players[id].grabbed = null;
            }
        }
        
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
      
