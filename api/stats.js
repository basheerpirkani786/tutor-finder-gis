const pool = require('./db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // --- GET REQUESTS (Fetch Counts or Lists) ---
    if (req.method === 'GET') {
      const { type } = req.query;

      // 1. Fetch List of Users
      if (type === 'users') {
        const result = await pool.query('SELECT id, username, role FROM users ORDER BY id DESC');
        return res.status(200).json(result.rows);
      } 
      
      // 2. Fetch List of Tutors (Providers)
      else if (type === 'providers') {
        const result = await pool.query('SELECT id, name, service FROM providers ORDER BY id DESC');
        return res.status(200).json(result.rows);
      } 
      
      // 3. Fetch Dashboard Counts (Default)
      else {
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const providerCount = await pool.query('SELECT COUNT(*) FROM providers');
        
        return res.status(200).json({
          totalUsers: userCount.rows[0].count,
          totalProviders: providerCount.rows[0].count
        });
      }
    }

    // --- DELETE REQUESTS (Remove User or Tutor) ---
    else if (req.method === 'DELETE') {
      const { type, id } = req.body;

      if (!id) return res.status(400).json({ error: "Missing ID" });

      if (type === 'users') {
        // Delete user (and their providers/reviews due to foreign keys usually, but we handle explicitly)
        // First delete providers owned by this user
        await pool.query('DELETE FROM providers WHERE owner_id = $1', [id]);
        // Then delete the user
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        return res.status(200).json({ success: true });
      } 
      
      else if (type === 'providers') {
        // Delete reviews first
        await pool.query('DELETE FROM reviews WHERE provider_id = $1', [id]);
        // Delete provider
        await pool.query('DELETE FROM providers WHERE id = $1', [id]);
        return res.status(200).json({ success: true });
      } 
      
      else {
        return res.status(400).json({ error: "Invalid Type" });
      }
    }

    else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error("SERVER ERROR in stats.js:", error);
    return res.status(500).json({ error: error.message });
  }
};
