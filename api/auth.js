const pool = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { action, username, password } = req.body;
    let { role } = req.body; // Allow role to be modified
    
    // Trim spaces and handle empty inputs
    const cleanUsername = username ? username.trim() : '';
    const cleanPassword = password ? password.trim() : '';
    
    // SECURITY CONFIGURATION
    // Only this specific username will get Admin privileges automatically.
    // You can change 'admin' to your own name if you prefer (e.g., 'basheer').
    const ADMIN_USERNAME = 'admin'; 

    try {
      if (action === 'register') {
        // 1. Check if username exists (case insensitive)
        const check = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
        
        if (check.rows.length > 0) {
            return res.status(200).json({ error: 'Username taken' });
        }

        // 2. SECRET ADMIN LOGIC
        // If the username matches the specific ADMIN_USERNAME, force role to 'admin'
        if (cleanUsername.toLowerCase() === ADMIN_USERNAME) {
            role = 'admin';
        } 
        // 3. SECURITY: If anyone else tries to set role='admin' without the correct username, force them to 'user'
        else if (role === 'admin') {
            role = 'user';
        }

        // 4. Create the user
        const result = await pool.query(
          'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
          [cleanUsername, cleanPassword, role]
        );
        return res.status(200).json(result.rows[0]);
      } 
      
      else if (action === 'login') {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND password = $2', [cleanUsername, cleanPassword]);
        
        if (result.rows.length === 0) {
            return res.status(200).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        return res.status(200).json({ id: user.id, username: user.username, role: user.role });
      } 

      else if (action === 'reset-password') {
        const check = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
        if (check.rows.length === 0) {
            return res.status(200).json({ error: 'User not found' });
        }

        await pool.query('UPDATE users SET password = $1 WHERE LOWER(username) = LOWER($2)', [cleanPassword, cleanUsername]);
        return res.status(200).json({ success: true });
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
