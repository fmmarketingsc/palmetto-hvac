module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const CAL_API_KEY   = process.env.CAL_API_KEY;
  const EVENT_TYPE_ID = process.env.CAL_EVENT_TYPE_ID;

  if (!CAL_API_KEY || !EVENT_TYPE_ID) {
    return res.status(503).json({ error: 'Scheduling not configured' });
  }

  // Fetch slots for today + next 3 days
  const now  = new Date();
  const end  = new Date(now);
  end.setDate(end.getDate() + 3);

  const startTime = now.toISOString();
  const endTime   = end.toISOString();

  try {
    const url = `https://api.cal.com/v2/slots/available?eventTypeId=${EVENT_TYPE_ID}&start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}&timeZone=America/New_York`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CAL_API_KEY}`,
        'cal-api-version': '2024-09-04',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Cal.com slots error:', err);
      return res.status(502).json({ error: 'Could not fetch availability' });
    }

    const data = await response.json();
    // v2 response: { status: 'success', data: { slots: { "2025-01-15": [{time:"..."},...] } } }
    const slots = data?.data?.slots || {};

    // Flatten into a readable list (up to 6 slots) for voice
    const readable = [];
    for (const [, times] of Object.entries(slots)) {
      for (const slot of times) {
        if (readable.length >= 6) break;
        const d   = new Date(slot.time);
        const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
        const t   = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
        readable.push({ iso: slot.time, display: `${day} at ${t}` });
      }
      if (readable.length >= 6) break;
    }

    return res.status(200).json({ slots: readable });
  } catch (err) {
    console.error('Availability handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
