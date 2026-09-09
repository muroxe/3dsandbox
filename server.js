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
        y: 1, // Высота по умолчанию
        z: Math.random() * 10 - 5,
        facingX: 0,
        facingZ: -1,
        color: Math.random() * 0xffffff,
        grabbed: null
    };

    socket.emit('init', { id: socket.id, players, items });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            
            if (data.facingX !== 0 || data.facingZ !== 0) {
                players[socket.id].facingX = data.facingX;
                players[socket.id].facingZ = data.facingZ;
            }

            const grabbedId = players[socket.id].grabbed;
            if (grabbedId && players[grabbedId]) {
                players[grabbedId].x = data.x + (players[socket.id].facingX * 1.5); 
                players[grabbedId].y = data.y; // Поднимаем захваченного вместе с нами
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
            x: p.x + p.facingX * 3,
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
            player.grabbed = null;
        } else {
            let closestId = null;
            let minDist = 3.5;

            for (let id in players) {
                if (id === socket.id) continue;
                const p = players[id];
                // Учитываем дистанцию по всем осям
                const dist = Math.sqrt((p.x - player.x)**2 + (p.y - player.y)**2 + (p.z - player.z)**2);
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
            const throwForce = 6;
            players[grabbedId].x += player.facingX * throwForce;
            players[grabbedId].y += 2; // При броске подкидываем немного вверх
            players[grabbedId].z += player.facingZ * throwForce;
            
            io.emit('playerMoved', { id: grabbedId, player: players[grabbedId] });
        }
        player.grabbed = null;
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        
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
        
