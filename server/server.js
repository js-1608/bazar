// server.js - Backend API for data storage and retrieval
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

app.use(cors());
app.use(bodyParser.json());

// In-memory database (replace with a real database in production)
let teamsData = [
  { id: 1, name: 'BIKANER SUPER', time: '02:20 AM', results: { '2025-03-11': '04', '2025-03-12': '1' } },
  { id: 2, name: 'DESAWAR', time: '05:00 AM', results: { '2025-03-11': '79', '2025-03-12': '55' } },
  { id: 3, name: 'FARIDABAD', time: '06:00 PM', results: { '2025-03-11': '78', '2025-03-12': '98' } },
  { id: 4, name: 'GHAZIABAD', time: '09:30 PM', results: { '2025-03-11': '19', '2025-03-12': '23' } },
  { id: 5, name: 'GALI', time: '11:30 PM', results: { '2025-03-11': '72', '2025-03-12': 'XX' } },
];

// API Endpoints
app.get('/api/teams', (req, res) => {
  res.json(teamsData);
});

app.post('/api/teams', (req, res) => {
  const newTeam = {
    id: Date.now(), // Simple ID generation
    ...req.body
  };
  teamsData.push(newTeam);
  
  // Emit socket event for real-time update
  io.emit('teams-updated', teamsData);
  
  res.status(201).json(newTeam);
});

app.put('/api/teams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  teamsData = teamsData.map(team => 
    team.id === id ? { ...team, ...req.body } : team
  );
  
  // Emit socket event for real-time update
  io.emit('teams-updated', teamsData);
  
  res.json(teamsData.find(team => team.id === id));
});

app.delete('/api/teams/:id', (req, res) => {
  const id = parseInt(req.params.id);
  teamsData = teamsData.filter(team => team.id !== id);
  
  // Emit socket event for real-time update
  io.emit('teams-updated', teamsData);
  
  res.status(204).end();
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('A client connected');
  
  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
