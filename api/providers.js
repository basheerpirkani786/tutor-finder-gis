const pool = require('./db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Fetch all providers and their reviews
  if (req.method === 'GET') {
    try {
      const providersData = await pool.query('SELECT * FROM providers');
      const providers = providersData.rows;

      // Fetch reviews for each provider (simple n+1 query for now, acceptable for small scale)
      for (let p of providers) {
        const reviewData = await pool.query('SELECT user_name as user, rating, text FROM reviews WHERE provider_id = $1', [p.id]);
        p.userReviews = reviewData.rows;
      }

      res.status(200).json(providers);
    } catch (error) {
      console.error("Fetch Error:", error);
      res.status(500).json({ error: error.message });
    }
  } 
  
  // POST: Add new provider
  else if (req.method === 'POST') {
    const { ownerId, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description } = req.body;
    try {
      const result = await pool.query(
        `INSERT INTO providers (owner_id, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [ownerId, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description]
      );
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error("Create Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // PUT: Update provider
  else if (req.method === 'PUT') {
    const { id, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description } = req.body;
    try {
      let query = `UPDATE providers SET name=$1, qualification=$2, experience=$3, service=$4, fees=$5, timing=$6, phone=$7, address=$8, lat=$9, lng=$10, description=$11`;
      let values = [name, qualification, experience, service, fees, timing, phone, address, lat, lng, description];
      
      // Only update image if a new one is provided
      if(image && image.length > 0) {
        query += `, image=$12 WHERE id=$13`;
        values.push(image, id);
      } else {
        query += ` WHERE id=$12`;
        values.push(id);
      }

      await pool.query(query, values);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Update Error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // DELETE: Remove provider
  else if (req.method === 'DELETE') {
    const { id } = req.body;
    try {
        // Delete related reviews first to satisfy foreign key constraints
        await pool.query('DELETE FROM reviews WHERE provider_id = $1', [id]); 
        await pool.query('DELETE FROM providers WHERE id = $1', [id]);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: error.message });
    }
  } 
  
  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
