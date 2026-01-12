const pool = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { action, username, password, role } = req.body;

    try {
      if (action === 'register') {
        const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        // CHANGE: Return 200 with error message instead of 400 to avoid console error
        if (check.rows.length > 0) {
            return res.status(200).json({ error: 'Username taken' });
        }

        const result = await pool.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [username, password, role]
        );
        return res.status(200).json(result.rows[0]);
      } 
      
      else if (action === 'login') {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        
        // CHANGE: Return 200 with error message instead of 401 to avoid console error
        if (result.rows.length === 0) {
            return res.status(200).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        return res.status(200).json({ id: user.id, username: user.username, role: user.role });
      } else {
        return res.status(200).json({ error: 'Invalid action' });
      }

    } catch (error) {
      console.error("SERVER ERROR in auth.js:", error);
      // Keep 500 for actual server crashes
      return res.status(500).json({ error: error.message });
    }
  } 
  
  res.status(405).json({ error: 'Method not allowed' });
};
