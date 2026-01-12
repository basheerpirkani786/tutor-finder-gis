const pool = require('./db');

module.exports = async (req, res) => {
  // 1. Handle CORS (Cross-Origin Resource Sharing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { action, username, password } = req.body;
    let { role } = req.body; // Allow role to be modified by logic below

    // Clean inputs
    const cleanUsername = username ? username.trim() : '';
    const cleanPassword = password ? password.trim() : '';
    
    // --- ADMIN SECURITY CONFIGURATION ---
    // The username "admin" will ALWAYS be an Administrator.
    // Everyone else is forced to be a User or Provider.
    const ADMIN_USERNAME = 'admin'; 

    try {
      // --- REGISTER ---
      if (action === 'register') {
        const check = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
        
        if (check.rows.length > 0) {
            return res.status(200).json({ error: 'Username taken' });
        }

        // Auto-assign Admin role if username is 'admin'
        if (cleanUsername.toLowerCase() === ADMIN_USERNAME) {
            role = 'admin';
        } 
        // Prevent hackers from forcing 'admin' role on other names
        else if (role === 'admin') {
            role = 'user';
        }

        const result = await pool.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [cleanUsername, cleanPassword, role]
        );
        return res.status(200).json(result.rows[0]);
      } 
      
      // --- LOGIN ---
      else if (action === 'login') {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND password = $2', [cleanUsername, cleanPassword]);
        
        if (result.rows.length === 0) {
            return res.status(200).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        return res.status(200).json({ id: user.id, username: user.username, role: user.role });
      } 

      // --- RESET PASSWORD (FORGOT PASSWORD) ---
      else if (action === 'reset-password') {
        // 1. Check if user exists
        const check = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
        
        if (check.rows.length === 0) {
            return res.status(200).json({ error: 'User not found' });
        }

        // 2. Update the password
        await pool.query('UPDATE users SET password = $1 WHERE LOWER(username) = LOWER($2)', [cleanPassword, cleanUsername]);
        
        return res.status(200).json({ success: true, message: 'Password updated successfully' });
      }
      
      else {
        return res.status(200).json({ error: 'Invalid action' });
      }

    } catch (error) {
      console.error("SERVER ERROR in auth.js:", error);
      return res.status(500).json({ error: error.message });
    }
  } 
  
  res.status(405).json({ error: 'Method not allowed' });
};
