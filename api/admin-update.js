module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).end();

  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id is required' });

  const { status, notes } = req.body || {};
  const patch = {};
  if (status !== undefined) patch.status = status;
  if (notes  !== undefined) patch.notes  = notes;

  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: 'nothing to update' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('Supabase PATCH error:', errText);

      // If notes column missing, retry with just status
      if (notes !== undefined && status !== undefined && errText.includes('notes')) {
        const r2 = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        });
        if (r2.ok) return res.status(200).json({ success: true, warning: 'notes column not set up yet' });
      }

      return res.status(502).json({ error: 'Database update failed', details: errText });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Admin update error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
