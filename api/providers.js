const pool = require('./db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET: Fetch all providers
    if (req.method === 'GET') {
      const providersData = await pool.query('SELECT * FROM providers');
      const providers = providersData.rows;

      for (let p of providers) {
        const reviewData = await pool.query('SELECT user_name as user, rating, text FROM reviews WHERE provider_id = $1', [p.id]);
        p.userReviews = reviewData.rows;
      }
      return res.status(200).json(providers);
    } 
    
    // POST: Add new provider
    else if (req.method === 'POST') {
      const { ownerId, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description } = req.body;
      
      const result = await pool.query(
        `INSERT INTO providers (owner_id, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [ownerId, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description]
      );
      return res.status(200).json(result.rows[0]);
    }

    // PUT: Update provider
    else if (req.method === 'PUT') {
      const { id, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description } = req.body;
      let query = `UPDATE providers SET name=$1, qualification=$2, experience=$3, service=$4, fees=$5, timing=$6, phone=$7, address=$8, lat=$9, lng=$10, description=$11`;
      let values = [name, qualification, experience, service, fees, timing, phone, address, lat, lng, description];
      
      if(image && image.length > 0) {
        query += `, image=$12 WHERE id=$13`;
        values.push(image, id);
      } else {
        query += ` WHERE id=$12`;
        values.push(id);
      }

      await pool.query(query, values);
      return res.status(200).json({ success: true });
    }

    // DELETE: Remove provider
    else if (req.method === 'DELETE') {
      const { id } = req.body;
      await pool.query('DELETE FROM reviews WHERE provider_id = $1', [id]); 
      await pool.query('DELETE FROM providers WHERE id = $1', [id]);
      return res.status(200).json({ success: true });
    } 
    
    else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error("SERVER ERROR in providers.js:", error);
    return res.status(500).json({ 
        error: "Database operation failed", 
        details: error.message 
    });
  }
};
