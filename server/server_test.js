const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const http = require('http');
const mysql = require('mysql2/promise');

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

// MySQL Database Connection Pool
const pool = mysql.createPool({
  host: 'localhost', // Change this to your actual host if different
  user: 'u462880284_satta',
  password: 'C&ns9zL62',
  database: 'u462880284_sattabajar',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// API Endpoints
app.get('/api/teams', async (req, res) => {
  try {
    // Get all teams
    const [teams] = await pool.query('SELECT * FROM teams');
    
    // For each team, get its results
    const teamsWithResults = await Promise.all(teams.map(async (team) => {
      const [results] = await pool.query(
        'SELECT date, result FROM results WHERE team_id = ?',
        [team.id]
      );
      
      // Convert results array to object format
      const resultsObj = {};
      results.forEach(row => {
        resultsObj[row.date] = row.result;
      });
      
      return {
        ...team,
        results: resultsObj
      };
    }));
    
    res.json(teamsWithResults);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    const { name, time, results } = req.body;
    
    // Insert team
    const [teamResult] = await pool.query(
      'INSERT INTO teams (name, time) VALUES (?, ?)',
      [name, time]
    );
    
    const teamId = teamResult.insertId;
    
    // Insert results
    if (results && Object.keys(results).length > 0) {
      const resultValues = Object.entries(results).map(([date, result]) => 
        [teamId, date, result]
      );
      
      await pool.query(
        'INSERT INTO results (team_id, date, result) VALUES ?',
        [resultValues]
      );
    }
    
    // Get the newly created team with results
    const [newTeam] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    const [teamResults] = await pool.query('SELECT date, result FROM results WHERE team_id = ?', [teamId]);
    
    const resultsObj = {};
    teamResults.forEach(row => {
      resultsObj[row.date] = row.result;
    });
    
    const createdTeam = {
      ...newTeam[0],
      results: resultsObj
    };
    
    // Emit socket event for real-time update
    const [updatedTeams] = await pool.query('SELECT * FROM teams');
    io.emit('teams-updated', updatedTeams);
    
    res.status(201).json(createdTeam);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

app.put('/api/teams/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, time, results } = req.body;
    
    // Update team info
    if (name || time) {
      const updateFields = [];
      const updateValues = [];
      
      if (name) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }
      
      if (time) {
        updateFields.push('time = ?');
        updateValues.push(time);
      }
      
      updateValues.push(id);
      
      await pool.query(
        `UPDATE teams SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }
    
    // Update results
    if (results && Object.keys(results).length > 0) {
      for (const [date, result] of Object.entries(results)) {
        // Check if result exists for this date
        const [existingResult] = await pool.query(
          'SELECT * FROM results WHERE team_id = ? AND date = ?',
          [id, date]
        );
        
        if (existingResult.length > 0) {
          // Update existing result
          await pool.query(
            'UPDATE results SET result = ? WHERE team_id = ? AND date = ?',
            [result, id, date]
          );
        } else {
          // Insert new result
          await pool.query(
            'INSERT INTO results (team_id, date, result) VALUES (?, ?, ?)',
            [id, date, result]
          );
        }
      }
    }
    
    // Get updated team with results
    const [team] = await pool.query('SELECT * FROM teams WHERE id = ?', [id]);
    const [teamResults] = await pool.query('SELECT date, result FROM results WHERE team_id = ?', [id]);
    
    const resultsObj = {};
    teamResults.forEach(row => {
      resultsObj[row.date] = row.result;
    });
    
    const updatedTeam = {
      ...team[0],
      results: resultsObj
    };
    
    // Emit socket event for real-time update
    const [allTeams] = await pool.query('SELECT * FROM teams');
    io.emit('teams-updated', allTeams);
    
    res.json(updatedTeam);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Delete results first (foreign key constraint)
    await pool.query('DELETE FROM results WHERE team_id = ?', [id]);
    
    // Delete team
    await pool.query('DELETE FROM teams WHERE id = ?', [id]);
    
    // Emit socket event for real-time update
    const [updatedTeams] = await pool.query('SELECT * FROM teams');
    io.emit('teams-updated', updatedTeams);
    
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('A client connected');
  
  socket.on('disconnect', () => {
    console.log('A client disconnected');
  });
});

// Initialize database tables if they don't exist
async function initDatabase() {
  try {
    // Create teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        time VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create results table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        date DATE NOT NULL,
        result VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id),
        UNIQUE KEY team_date (team_id, date)
      )
    `);
    
    console.log('Database tables initialized');
    
    // Seed initial data if tables are empty
    const [existingTeams] = await pool.query('SELECT COUNT(*) as count FROM teams');
    if (existingTeams[0].count === 0) {
      const initialTeams = [
        { name: 'BIKANER SUPER', time: '02:20 AM' },
        { name: 'DESAWAR', time: '05:00 AM' },
        { name: 'FARIDABAD', time: '06:00 PM' },
        { name: 'GHAZIABAD', time: '09:30 PM' },
        { name: 'GALI', time: '11:30 PM' }
      ];
      
      for (const team of initialTeams) {
        const [result] = await pool.query(
          'INSERT INTO teams (name, time) VALUES (?, ?)',
          [team.name, team.time]
        );
        
        const teamId = result.insertId;
        
        // Add sample results for the last two days
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const today = new Date();
        
        const yesterdayFormatted = yesterday.toISOString().split('T')[0];
        const todayFormatted = today.toISOString().split('T')[0];
        
        const sampleResults = [
          [teamId, yesterdayFormatted, Math.floor(Math.random() * 100).toString().padStart(2, '0')],
          [teamId, todayFormatted, team.name === 'GALI' ? 'XX' : Math.floor(Math.random() * 100).toString().padStart(2, '0')]
        ];
        
        await pool.query(
          'INSERT INTO results (team_id, date, result) VALUES ?',
          [sampleResults]
        );
      }
      
      console.log('Initial data seeded');
    }
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initDatabase();
});