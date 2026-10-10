require('dotenv').config();

const express = require('express');
const http = require('http');
const escape = require('escape-html');
const { Server } = require('socket.io');
const { isNumber, size, values, entries, keys } = require('lodash');

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://tenbinn.vercel.app';

const allowedOrigins = (CORS_ORIGIN === 'https://tenbinn.vercel.app')
  ? true
  : CORS_ORIGIN.split(',').map((origin) => origin.trim());

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins === true || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 2000,
  pingTimeout: 2000,
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    status: 'healthy',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

const gameStates = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  ROUND_RESULT: 'round_result',
  GAME_OVER: 'game_over',
};

const Game = {
  state: gameStates.WAITING,
  round: 0,
  players: {},
  roundTime: 30,
  timer: null,
  total: 0,
  alive: [],
  pickLeft: 0,
};

function defaultScore() {
  return 5;
}

function updateAlivePlayers() {
  const players = [];
  for (const id of Object.keys(Game.players)) {
    if (Game.players[id].score <= 0) {
      eliminate(id);
    } else if (Game.players[id].alive) {
      players.push(id);
    }
  }
  Game.alive = players;
}

function eliminate(id) {
  if (!Game.players[id]) return;
  Game.players[id].alive = false;
  io.to(id).emit('death');
}

function socketToPicked() {
  updateAlivePlayers();
  const obj = {};
  for (const [id, player] of Object.entries(Game.players)) {
    if (player.alive) {
      obj[id] = player.picked;
    }
  }
  return obj;
}

function resetStates() {
  for (const playerId of Object.keys(Game.players)) {
    Game.players[playerId].score = defaultScore();
    Game.players[playerId].alive = true;
    Game.players[playerId].submitted = false;
    Game.players[playerId].picked = null;
    Game.players[playerId].isPicked = false;
  }
  io.emit('player_list', Game.players);
}

function nearest(valuesArr, sum) {
  let minDistance = Infinity;
  for (const value of valuesArr) {
    const distance = Math.abs(value - sum);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  const matches = [];
  const players = [];
  for (const [index, value] of valuesArr.entries()) {
    if (Math.abs(value - sum) === minDistance) {
      matches.push(value);
      players.push(Object.keys(socketToPicked())[index]);
    }
  }

  return [minDistance, matches, players];
}

function calculate(valuesArr) {
  let total = 0;
  for (const value of valuesArr) {
    if (value !== null && value !== undefined) {
      total += Number(value);
    }
  }

  if (!valuesArr.length) return 0;
  const average = (total / valuesArr.length) * 0.8;

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(average);
}

function applyResult(playerIds = [], minus = 1) {
  for (const playerId of Object.keys(socketToPicked())) {
    if (!playerIds.includes(playerId)) {
      if (Game.players[playerId]) {
        Game.players[playerId].score -= minus;
      }
    }
  }
}

function emitResult(sum, valuesList, playersList) {
  io.emit('player_list', Game.players);
  updateAlivePlayers();
  io.emit('player_list', Game.players);

  let playerNames = playersList.map((id) => Game.players[id]?.name || id);
  if (playerNames.length === 0) {
    playerNames = ['No Winner'];
  }

  io.emit('result', {
    sum,
    plr_val: valuesList,
    plr_str: playerNames,
  });
}

function emitNoWinnerResult() {
  applyResult();
  emitResult(null, [], ['No Winner']);
}

function announceWinner() {
  const picked = socketToPicked();
  const winnerId = Object.keys(picked)[0];

  io.emit('start_timer', 5);

  if (!winnerId) {
    io.emit('all_died');
    return;
  }

  const winnerName = Game.players[winnerId]?.name;
  io.emit('winner', winnerName);
}

function twoPlayercalc(valuesArr) {
  const pickedKeys = Object.keys(socketToPicked());
  if (valuesArr.length !== 2) {
    return emitNoWinnerResult();
  }

  const [first, second] = valuesArr;
  if (first === 0 && second === 100) {
    if (Game.players[pickedKeys[0]]) Game.players[pickedKeys[0]].score--;
    return emitResult(null, [100], [pickedKeys[1]]);
  }

  if (first === 100 && second === 0) {
    if (Game.players[pickedKeys[1]]) Game.players[pickedKeys[1]].score--;
    return emitResult(null, [100], [pickedKeys[0]]);
  }

  if (first === second) {
    return emitNoWinnerResult();
  }

  const winnerId = first < second ? pickedKeys[0] : pickedKeys[1];
  const winningValue = first < second ? first : second;

  applyResult([winnerId]);
  emitResult(calculate(valuesArr), [winningValue], [winnerId]);
}

function isDuplicateChoice(nr) {
  const seen = [];
  for (const value of nr[1] || []) {
    if (seen.includes(value)) return true;
    seen.push(value);
  }
  return false;
}

function threePlayercalc(valuesArr) {
  const pickedKeys = Object.keys(socketToPicked());
  const sum = calculate(valuesArr);
  const nr = nearest(valuesArr, sum);
  const double = isDuplicateChoice(nr);

  if (double || !nr[1] || !nr[1].length) {
    emitNoWinnerResult();
    return;
  }

  if (nr[0] === 0) {
    applyResult(nr[2], 2);
  } else {
    applyResult(nr[2]);
  }

  emitResult(sum, nr[1], nr[2]);
}

function fourPlayercalc(valuesArr) {
  const sum = calculate(valuesArr);
  const nr = nearest(valuesArr, sum);
  const double = isDuplicateChoice(nr);

  if (double) {
    emitNoWinnerResult();
    return;
  }

  applyResult(nr[2]);
  emitResult(sum, nr[1], nr[2]);
}

function defaultCalc(valuesArr) {
  const sum = calculate(valuesArr);
  const nr = nearest(valuesArr, sum);
  applyResult(nr[2]);
  emitResult(sum, nr[1], nr[2]);
}

function announceResult() {
  const pickedValues = Object.values(socketToPicked());
  const totalAlive = pickedValues.length;

  if (totalAlive <= 2) {
    return twoPlayercalc(pickedValues);
  }
  if (totalAlive <= 3) {
    return threePlayercalc(pickedValues);
  }
  if (totalAlive <= 4) {
    return fourPlayercalc(pickedValues);
  }

  return defaultCalc(pickedValues);
}

function endPicking() {
  io.emit('end_picking');
  io.emit('stop_timer');
  announceResult();

  setTimeout(() => {
    Game.pickLeft = Game.alive.length;
    Game.round += 1;

    for (const id of Object.keys(Game.players)) {
      Game.players[id].picked = null;
      Game.players[id].isPicked = false;
    }

    io.emit('player_list', Game.players);

    if (Game.alive.length > 1) {
      io.emit('stop_timer');
      startRound(Game.round, Game.roundTime);
    } else {
      gameEnd();
    }
  }, 5000);
}

function startRound(round, time) {
  if (Game.alive.length < 2) {
    return gameEnd();
  }

  Game.round = (round !== undefined) ? round : Game.round + 1;
  Game.state = gameStates.PLAYING;
  updateAlivePlayers();
  io.emit('player_list', Game.players);
  Game.pickLeft = Game.alive.length;
  io.emit('round_start', { round_no: Game.round, timee: time });
  io.emit('start_timer', time);

  Game.timer = setTimeout(() => {
    endPicking();
  }, time * 1000);

  console.log(`started round ${Game.round}`);
  io.emit('notice', `Round ${Game.round} started`);
}

function gameEnd() {
  if (Game.state === gameStates.WAITING) return;

  console.log('game ended');
  Game.round = 0;
  Game.state = gameStates.WAITING;
  io.emit('stop_timer');
  announceWinner();
  clearTimeout(Game.timer);

  setTimeout(() => {
    io.emit('notice', 'Game ended');
    io.emit('game_end');
  }, 5000);

  resetStates();
}

io.on('connection', (socket) => {
  console.log(`user connected ${socket.id}`);

  socket.on('join', (name) => {
    if (!name || !String(name).trim() || Game.players[socket.id]) return;
    if (Object.keys(Game.players).length >= 5) return socket.emit('room_full');
    if (Game.state !== gameStates.WAITING) {
      socket.emit('already_started');
      return;
    }

    socket.username = name.trim();
    const userInfo = {
      id: socket.id,
      name: socket.username,
      score: defaultScore(),
      alive: true,
      isHost: Object.keys(Game.players).length === 0,
      submitted: false,
      picked: null,
    };

    Game.players[socket.id] = userInfo;
    socket.emit('lobby', userInfo);
    io.emit('player_list', Game.players);
    io.emit('notice', `${socket.username} joined!`);

    if (Object.keys(Game.players).length === 1) {
      socket.emit('host');
    }
  });

  socket.on('start', () => {
    if (!Game.players[socket.id]?.isHost) return;
    if (Object.keys(Game.players).length < 2) {
      io.emit('notice', 'insufficient players!');
      return;
    }

    Game.alive = Object.keys(Game.players);
    startRound(Game.round, Game.roundTime);
  });

  socket.on('picked', (num) => {
    const player = Game.players[socket.id];

    if (Game.state !== gameStates.PLAYING) return;
    if (!isNumber(num) || num > 100 || !player || player.picked !== null || !player.alive) return;

    player.picked = num;
    player.isPicked = true;
    Game.pickLeft -= 1;

    io.emit('player_picked', socket.id);
    io.emit('player_list', Game.players);

    if (Game.pickLeft <= 0) {
      clearTimeout(Game.timer);
      endPicking();
    }
  });

  socket.on('pick_time', (value) => {
    if (!Game.players[socket.id]?.isHost) return;
    socket.broadcast.emit('time_picked', value);

    try {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        Game.roundTime = parsed;
      }
    } catch (error) {
      console.error('Invalid pick time:', error);
    }
  });

  socket.on('msg', (msg) => {
    if (!msg || !String(msg).trim()) return;
    const safeMsg = escape(String(msg));
    io.emit('notice', `${socket.username}: ${safeMsg}`);
  });

  socket.on('disconnect', () => {
    const playerName = socket.username || 'Unknown';
    console.log('user disconnected:', socket.id, playerName);
    io.emit('notice', `${playerName} left!`);

    const player = Game.players[socket.id];
    if (player) {
      delete Game.players[socket.id];
    }

    updateAlivePlayers();

    if (Game.alive.length < 2 && Game.state !== gameStates.WAITING) {
      gameEnd();
    }

    const remainingPlayers = Object.keys(Game.players);
    if (remainingPlayers.length > 0 && !Game.players[remainingPlayers[0]].isHost) {
      Game.players[remainingPlayers[0]].isHost = true;
      io.to(remainingPlayers[0]).emit('host');
    }

    io.emit('player_list', Game.players);
  });
});

server.listen(PORT, () => {
  console.log(`server started at http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
