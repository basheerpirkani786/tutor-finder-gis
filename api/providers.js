const pool = require('./db');

export default async function handler(req, res) {
  // GET: Fetch all providers and their reviews
  if (req.method === 'GET') {
    try {
      // Get providers
      const providersData = await pool.query('SELECT * FROM providers');
      const providers = providersData.rows;

      // Get reviews for each provider
      for (let p of providers) {
        const reviewData = await pool.query('SELECT user_name as user, rating, text FROM reviews WHERE provider_id = $1', [p.id]);
        p.userReviews = reviewData.rows; // Attach reviews to provider object
      }

      res.status(200).json(providers);
    } catch (error) {
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
      res.status(500).json({ error: error.message });
    }
  }

  // PUT: Update provider
  else if (req.method === 'PUT') {
    const { id, name, qualification, experience, service, fees, timing, phone, address, lat, lng, image, description } = req.body;
    try {
      // Start with base update
      let query = `UPDATE providers SET name=$1, qualification=$2, experience=$3, service=$4, fees=$5, timing=$6, phone=$7, address=$8, lat=$9, lng=$10, description=$11`;
      let values = [name, qualification, experience, service, fees, timing, phone, address, lat, lng, description];
      
      // Only update image if a new one is provided (Base64 strings are heavy)
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
      res.status(500).json({ error: error.message });
    }
  }

  // DELETE: Remove provider
  else if (req.method === 'DELETE') {
    const { id } = req.body;
    try {
        // Delete reviews first due to foreign key
        await pool.query('DELETE FROM reviews WHERE provider_id = $1', [id]); 
        await pool.query('DELETE FROM providers WHERE id = $1', [id]);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
  }
}