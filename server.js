const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаем статические файлы из папки public
app.use(express.static('public'));

const players = {};
const items = [];

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);
    
    // Создаем нового игрока со случайным цветом
    players[socket.id] = { 
        x: 0, y: 1, z: 0, 
        color: Math.random() * 0xffffff, 
        grabbedBy: null 
    };

    // Отправляем текущее состояние мира новому игроку
    socket.emit('init', { players, items, id: socket.id });
    
    // Сообщаем всем остальным о новом игроке
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Обработка движения
    socket.on('move', (data) => {
        if (players[socket.id] && !players[socket.id].grabbedBy) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;

            // Если этот игрок кого-то держит, обновляем и позицию захваченного
            for (let id in players) {
                if (players[id].grabbedBy === socket.id) {
                    players[id].x = data.x;
                    players[id].y = data.y + 2; // Держим над головой
                    players[id].z = data.z;
                    io.emit('playerMoved', { id: id, x: players[id].x, y: players[id].y, z: players[id].z });
                }
            }

            // Рассылаем новые координаты всем остальным
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z });
        }
    });

    // Обработка создания предметов
    socket.on('spawnItem', (type) => {
        const item = {
            id: Date.now() + Math.random(),
            type: type,
            x: players[socket.id].x + 2, // Спавним рядом с игроком
            y: 1,
            z: players[socket.id].z
        };
        items.push(item);
        io.emit('itemSpawned', item);
    });

    // Механика захвата другого игрока
    socket.on('grab', (targetId) => {
        if (players[targetId] && !players[targetId].grabbedBy && targetId !== socket.id) {
            players[targetId].grabbedBy = socket.id;
            io.emit('playerGrabbed', { targetId, grabberId: socket.id });
        }
    });

    // Механика отпускания
    socket.on('release', (targetId) => {
        if (players[targetId] && players[targetId].grabbedBy === socket.id) {
            players[targetId].grabbedBy = null;
            // Опускаем на землю
            players[targetId].y = 1; 
            io.emit('playerReleased', { targetId, y: 1 });
        }
    });

    socket.on('disconnect', () => {
        console.log('Игрок отключился:', socket.id);
        delete players[socket.id];
        
        // Освобождаем всех, кого держал отключившийся игрок
        for (let id in players) {
            if (players[id].grabbedBy === socket.id) {
                players[id].grabbedBy = null;
                players[id].y = 1;
                io.emit('playerReleased', { targetId: id, y: 1 });
            }
        }
        
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
