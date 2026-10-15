const express = require('express')
const http = require('http')
const escape = require('escape-html')
const SocketIo = require('socket.io')
const { isNumber, size, values, entries, keys } = require('lodash')
const app = express()
const server = http.createServer(app)
const io = SocketIo(server, {
    cors: {
        origin: 'https://tenbinn.vercel.app'
    },
    pingInterval: 2000,
    pingTimeout: 2000
})

app.use(express.json())

const game_states = {
    WAITING: "waiting",
    PLAYING: "playing",
    ROUND_RESULT: "round_result",
    GAME_OVER: "game_over"
}


let Game = {
    state: "waiting",
    round: 0,
    players: {},
    roundTime: 30,
    timer: null,
    total: 0,
    alive: [],
    pickLeft: 0
}



io.on("connection", (socket) => {
    function socketToPicked() {
        update_alive_players()
        let obj = {}

        for (const [id, p] of entries(Game.players)) {
            if (p.alive) {
                obj[id] = p.picked
            }
        }
        return obj
    }

    function default_score() {
        return 5
    }


    function update_alive_players() {
        let players = []
        for (const p in Game.players) {
            if (Game.players[p].score <= 0) eliminate(p)
            else if (Game.players[p].alive) {
                players.push(p)
            }
        }
        Game.alive = players
    }

    function eliminate(id) {
        Game.players[id].alive = false
        io.to(id).emit("death")
    }

    function announceWinner() {

        if (!socketToPicked()) {
            io.emit("start_timer", 5)
            return io.emit("all_died")
        }

        let winner_id = keys(socketToPicked())[0]

        let result = Game.players[winner_id]?.name

        console.log("winner is", Game.players[winner_id]?.name)
        io.emit("start_timer", 5)
        // io.emit("player_list", Game.players)
        if (!winner_id) return io.emit("all_died")
        console.log(result)
        io.emit("winner", result)
    }


    function reset_states() {
        for (const player of keys(Game.players)) {
            Game.players[player]["score"] = default_score()
            Game.players[player]["alive"] = true
            Game.players[player]["submitted"] = false
            Game.players[player]["picked"] = null
            Game.players[player]["isPicked"] = false
        }
        io.emit("player_list", Game.players)
    }

    function game_end() {
        if (Game.state !== "waiting") {
            console.log("game ended")
            Game.round = 0
            Game.state = "waiting"
            io.emit("stop_timer")
            announceWinner()
            clearTimeout(Game.timer)
            setTimeout(() => {
                io.emit("notice", "Game ended")
                io.emit("game_end")
            }, 5000);
            reset_states()
        }
    }
    function nearest(values, sum) {
        let nr = 100
        let n = []
        let s = []
        let v = []
        for (const value of values) {
            if (Math.abs(value - sum) < nr) {
                nr = Math.abs(sum - value)
            }
        }
        console.log("nrr=", nr)
        let i = 0
        for (const value of values) {
            if (Math.abs(value - sum) === nr) {
                n.push(value)
                s.push(keys(socketToPicked())[i])
            }
            i++
        }
        v.push(nr)
        v.push(n)
        console.log(n)
        v.push(s)
        console.log(s)
        return v
    }

    function startRound(round, time) {
        if (size(Game.alive) < 2) {
            return game_end()
        }
        Game.round = round || round + 1
        Game.state = "playing"
        update_alive_players()
        io.emit("player_list", Game.players)
        Game.pickLeft = size(Game.alive)
        io.emit("round_start", { round_no: Game.round, timee: time })
        io.emit("start_timer", time)
        Game.timer = setTimeout(() => {
            endPicking()
        }, time * 1000)
        console.log(`started round ${Game.round}`)
        io.emit("notice", `Round ${Game.round} started`)
    }

    function calculate(values) {
        let sum = 0

        for (const value of values) {
            if (value === null) {
                // eliminate( keys(socketToPicked())[values.indexOf(value)])
            }
            else {
                sum += parseInt(value)
            }
        }
        sum = (sum / size(values)) * 0.8

        return new Intl.NumberFormat('en-IN', {
            maximumFractionDigits: 2
        }).format(sum)
    }

    function applyResult(p = [], minus = 1) {
        for (const _ of keys(socketToPicked())) {
            if (!p.includes(_)) Game.players[_].score -= minus
        }
    }

    function emitResult(sum, value, player) {
        io.emit("player_list", Game.players)
        io.emit("start_timer", 5)
        update_alive_players()
        io.emit("player_list", Game.players)
        // if (size(Game.alive) < 2) {
        //     return game_end()
        // }
        let plr_str = `${player[0]}`
        let plr_val = `${value[0] ?? " "}`
        if (size(player) > 1) {
            for (let i = 1; i <= size(player) - 1; i++) {
                plr_str = `${plr_str}, ${player[i]}`
                plr_val = `${plr_val}, ${value[i]}`
            }
        }
        console.log(sum, plr_val, plr_str)
        io.emit("result", { sum, plr_val, plr_str })
    }


    function emitNoWinnerResult() {
        applyResult()
        emitResult(null, [], ["No Winner"])
    }

    function twoPlayercalc(values) {
        let sum = calculate(values)
        if (values[0] == 0 && values[1] == 100) {
            Game.players[keys(socketToPicked())[0]].score--
            return emitResult(null, [100], [Game.players[keys(socketToPicked())[1]].name])
        }
        else if (values[0] === 100 && values[1] === 0) {
            Game.players[keys(socketToPicked())[1]].score--
            return emitResult(null, [100], [Game.players[keys(socketToPicked())[0]].name])
        }
        else if (values[0] === values[1]) {
            return emitNoWinnerResult()
        }
        else {
            let a = Game.players[keys(socketToPicked())[0]]
            let b = Game.players[keys(socketToPicked())[1]]
            if (values[0] < values[1]) {
                applyResult([a.id])
                return emitResult(sum, [values[0]], [a.name])
            }
            else {
                applyResult([b.id])
                return emitResult(sum, [values[1]], [b.name])
            }
            // return values[0] < values[1] ? (applyResult([a.id]) && emitResult(sum, values[0], a.name)) : (applyResult([b.id]) && emitResult(sum, values[1], b.name))
        }
    }

    function isDuplicateChoice(nr) {
        let ind = []
        let double = false
        for (const value of nr[1]) {
            if (ind.includes(value[0])) return double = true
            ind.push(value[0])
        }
        return double
    }

    function threePlayercalc(values) {
        let sum = calculate(values)
        let nr = nearest(values, sum)
        let double = isDuplicateChoice(nr)

        if (double || !nr[1]) {
            emitNoWinnerResult()
            return
        }
        else {
            if (nr[0] == 0) {
                applyResult(nr[2], 2)
            }
            else {
                applyResult(nr[2])
            }
            emitResult(sum, nr[1], nr[2].map(v => Game.players[v].name))
        }
    }

    function fourPlayercalc(values) {
        let sum = calculate(values)
        let nr = nearest(values, sum)
        let double = isDuplicateChoice(nr)

        if (double) {
            emitNoWinnerResult()
            return
        }
        else {

            applyResult(nr[2])
            emitResult(sum, nr[1], nr[2].map(v => Game.players[v].name))
        }
    }

    function defaultcalc(values) {
        let sum = calculate(values)
        let nr = nearest(values, sum)
        applyResult(nr[2])
        emitResult(sum, nr[1], nr[2].map(v => Game.players[v].name))
    }

    function announceResult() {


        if (size(values(socketToPicked())) <= 2) {
            return twoPlayercalc(values(socketToPicked()))
        }
        else if (size(values(socketToPicked())) <= 3) {
            return threePlayercalc(values(socketToPicked()))
        }
        else if (size(values(socketToPicked())) <= 4) {
            return fourPlayercalc()
        }
        else {
            return defaultcalc()
            //     let winner_id = keys(socketToPicked())[ind]

            //     let result = {
            //         sum: sum,
            //         value: v,
            //         player: Game.players[winner_id]
            //     }

            //     for (const p in Game.players) {
            //         if (p !== winner_id) Game.players[p].score--
            //     }


            //     console.log(sum, v, Game.players[winner_id]?.name)
            //     io.emit("player_list", Game.players)
            //     io.emit("start_timer", 5)
            //     update_alive_players()
            //     io.emit("player_list", Game.players)
            //     if (size(Game.alive) < 2) {
            //         return game_end()
            //     }
            //     io.emit("result", result)


            //     let sum = calculate(values(socketToPicked()))
            //     let v = nearest(values(socketToPicked()), sum)
            //     let ind = []

            //     for (const _ of v) {
            //         ind.push(
            //             values(socketToPicked()).indexOf(_)
            //         )
            //     }

        }

    }
    function endPicking() {
        io.emit("end_picking")
        io.emit("stop_timer")
        announceResult()
        setTimeout(() => {
            Game.pickLeft = size(Game.alive)
            Game.round++
            for (const id of keys(Game.players)) {
                Game.players[id]["picked"] = null
                Game.players[id]["isPicked"] = false
            }
            io.emit("player_list", Game.players)
            if (size(Game.alive) > 1) { io.emit("stop_timer"); startRound(Game.round, Game.roundTime) }
            else { game_end() }
        }, 5 * 1000)


    }




    console.log(`user connected ${socket.id}`)

    socket.on("join", (name) => {
        if (!name.trim() || Game.players[socket.id]) return
        if (size(Game.players) >= 5) return socket.io("room_full")
        if (Game.state !== "waiting") {
            socket.emit("already_started")
            return
        }
        socket.username = name;
        const user_info = {
            id: socket.id,
            name: socket.username,
            score: default_score(),
            alive: true,
            isHost: !size(Game.players),
            submitted: false,
            picked: null
        }
        Game.players[socket.id] = user_info
        // console.log(Game.players[socket.id])

        socket.emit("lobby", user_info)
        io.emit("player_list", Game.players)
        console.log(socket.username)
        io.emit("notice", `${socket.username} joined!`)

        if (size(Game.players) === 1) {
            console.log("host detected")
            socket.emit("host")
        }

    })


    socket.on("start", () => {
        if (!Game.players[socket.id]?.isHost) return
        if (size(Game.players) < 2) return io.emit("notice", "insufficient players!")
        Game.alive = keys(Game.players)
        startRound(Game.round, Game.roundTime)
    })

    socket.on("picked", num => {
        if (Game.state !== game_states.PLAYING) return
        if (!isNumber(num) || num > 100 || (Game.players[socket.id] && Game.players[socket.id]["picked"] !== null) || !Game.players[socket.id].alive) return
        Game.players[socket.id]["picked"] = num
        Game.players[socket.id]["isPicked"] = true
        Game.pickLeft--
        io.emit("player_picked", socket.id)
        io.emit("player_list", Game.players)
        socketToPicked()[socket.id] = num
        if (!Game.pickLeft) {
            clearTimeout(Game.timer)
            endPicking()
        }

    })

    socket.on("pick_time", (v) => {
        if (!Game.players[socket.id]?.isHost) return

        socket.broadcast.emit("time_picked", v)
        try {
            Game.roundTime = parseInt(v)
        }
        catch (e) {
            console.log(e)
        }
    })



    socket.on("msg", (msg) => {
        if (!msg.trim()) return
        let msgg = escape(msg)
        io.emit("notice", `${socket.username}: ${msgg}`);
    })


    socket.on('disconnect', () => {

        console.log("user disconnected: ", socket.id, socket.username)
        io.emit("notice", `${socket.username} left!`)
        let ind = keys(Game.players).indexOf(socket.id)
        // console.log(Game.players[socket.id], socket.id)

        delete Game.players[socket.id]

        update_alive_players()

        if (size(Game.alive) < 2 && Game.state !== "waiting") {
            game_end()
        }
        if (ind == 0 && size(Game.players)) {
            Game.players[keys(Game.players)[0]].isHost = true
            io.to(keys(Game.players)[0]).emit("host")
        }

        io.emit("player_list", Game.players)

        if (Game.state === "playing" && Game.players[socket.id] && Game.players[socket.id].alive && Game.players[socket.id]["picked"] === null) {
            Game.pickLeft--
            if (!Game.pickLeft) endPicking()
        }

    });

});

app.get('/', (req, res) => {
    res.send("working")
})

server.listen(3000, () => console.log("server started at http://localhost:3000"))
