const pool = require('./db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { providerId, user, rating, text } = req.body;
    try {
      // 1. Insert the new review
      await pool.query(
        'INSERT INTO reviews (provider_id, user_name, rating, text) VALUES ($1, $2, $3, $4)',
        [providerId, user, rating, text]
      );

      // 2. Calculate new average rating
      const avgResult = await pool.query('SELECT AVG(rating) as average FROM reviews WHERE provider_id = $1', [providerId]);
      const newRating = parseFloat(avgResult.rows[0].average).toFixed(1);

      // 3. Update the provider's main rating field
      await pool.query('UPDATE providers SET rating = $1 WHERE id = $2', [newRating, providerId]);

      res.status(200).json({ success: true, newRating });
    } catch (error) {
      console.error("Review Error:", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
