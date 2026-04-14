module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, phone, service, slotTime, leadId } = req.body || {};
  if (!name || !slotTime) {
    return res.status(400).json({ error: 'name and slotTime are required' });
  }

  const CAL_API_KEY   = process.env.CAL_API_KEY;
  const EVENT_TYPE_ID = process.env.CAL_EVENT_TYPE_ID;

  if (!CAL_API_KEY || !EVENT_TYPE_ID) {
    return res.status(503).json({ error: 'Scheduling not configured' });
  }

  try {
    const response = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CAL_API_KEY}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2024-08-13',
      },
      body: JSON.stringify({
        eventTypeId: parseInt(EVENT_TYPE_ID, 10),
        start: slotTime,
        attendee: {
          name,
          email: email || 'noemail@lowcountryair.com',
          timeZone: 'America/New_York',
          language: 'en',
        },
        meetingUrl: phone || '',
        metadata: { leadId, service, phone },
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status === 'error') {
      console.error('Cal.com booking error:', data);
      return res.status(502).json({ error: 'Booking failed', details: data });
    }

    const booking = data?.data || data;

    // Update lead in Supabase with booking info
    if (leadId && process.env.SUPABASE_URL) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'booked',
          booking_time: slotTime,
          booking_id: booking.uid || booking.id?.toString() || null,
        }),
      }).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      bookingId: booking.uid || booking.id,
      start: booking.start || slotTime,
    });
  } catch (err) {
    console.error('Book handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
