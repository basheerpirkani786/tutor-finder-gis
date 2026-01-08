const pool = require('./db');

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { action, username, password, role } = req.body;

    try {
      if (action === 'register') {
        // Check if user exists
        const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (check.rows.length > 0) return res.status(400).json({ error: 'Username taken' });

        // Insert new user
        const result = await pool.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [username, password, role]
        );
        return res.status(200).json(result.rows[0]);
      } 
      
      else if (action === 'login') {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = result.rows[0];
        return res.status(200).json({ id: user.id, username: user.username, role: user.role });
      }

    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  res.status(405).json({ error: 'Method not allowed' });
}