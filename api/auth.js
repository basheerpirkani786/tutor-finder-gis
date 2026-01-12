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
    
    // FIX: Trim spaces from inputs to prevent " User" vs "User" mismatch
    const cleanUsername = username ? username.trim() : '';
    const cleanPassword = password ? password.trim() : '';

    try {
      if (action === 'register') {
        // FIX: Check lowercase username to prevent "Ali" vs "ali" duplicates
        const check = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
        
        // FIX: Return 200 with error property (fixes red console error)
        if (check.rows.length > 0) return res.status(200).json({ error: 'Username taken' });

        const result = await pool.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [cleanUsername, cleanPassword, role]
        );
        return res.status(200).json(result.rows[0]);
      } 
      
      else if (action === 'login') {
        // FIX: Case insensitive username search for login
        // FIX: Check password against the trimmed input
        const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND password = $2', [cleanUsername, cleanPassword]);
        
        // FIX: Return 200 with error property (fixes red console error)
        if (result.rows.length === 0) return res.status(200).json({ error: 'Invalid credentials' });
        
        const user = result.rows[0];
        return res.status(200).json({ id: user.id, username: user.username, role: user.role });
      } else {
        return res.status(200).json({ error: 'Invalid action' });
      }

    } catch (error) {
      console.error("SERVER ERROR in auth.js:", error);
      return res.status(500).json({ error: error.message });
    }
  } 
  
  res.status(405).json({ error: 'Method not allowed' });
};
