module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/leads?order=created_at.desc&limit=200`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Supabase fetch error:', err);
      return res.status(502).json({ error: 'Failed to fetch leads' });
    }

    const leads = await response.json();
    return res.status(200).json({ leads });
  } catch (err) {
    console.error('Admin leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
