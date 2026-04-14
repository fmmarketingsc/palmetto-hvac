module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, phone, service, address, systemType, message, leadId } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const task = `You are Madison from Lowcountry Air in Charleston, SC. Keep this call under 2 minutes — the customer is already stressed about their AC or heat.

Be warm, calm, and get to the point fast. Here's all you need to do:

1. Say hi, confirm you're speaking with ${name || 'the customer'}, and mention their request for ${service || 'HVAC service'}.
2. Ask just 2 quick questions:
   - "What's the system doing — or not doing?"
   - "Roughly how old is the unit?"
3. Give a quick honest ballpark estimate based on what they say.
4. Ask if they want to book a tech — if yes, ask what time works.
5. Confirm their address is ${address || 'on file'} and wrap up.

Rules:
- Never read from a script — sound human and natural
- If it's an emergency (no AC, extreme heat, elderly or baby at home) offer same-day immediately
- No upselling, no pressure
- Voicemail if no answer: "Hey ${name?.split(' ')[0] || 'there'}, this is Madison from Lowcountry Air calling about your service request. Give us a call back at (843) 954-3943 whenever you're free."

Customer: ${name}, Phone: ${phone}, System: ${systemType || 'unknown'}, Issue: "${message || service || 'not specified'}"`;

  try {
    const response = await fetch('https://api.bland.ai/v1/calls', {
      method: 'POST',
      headers: {
        'authorization': process.env.BLAND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: phone,
        from: process.env.BLAND_PHONE_NUMBER,
        task,
        voice: 'maya',
        wait_for_greeting: true,
        record: true,
        amd: true,
        interruption_threshold: 150,
        temperature: 0.7,
        max_duration: 4,
        webhook: `https://palmetto-hvac.vercel.app/api/call-complete`,
        metadata: { leadId, name, phone, service },
        request_data: { leadId, name, service },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Bland error:', data);
      return res.status(502).json({ error: 'Failed to initiate call', details: data });
    }

    // Update lead status in Supabase
    if (leadId && process.env.SUPABASE_URL) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'call_initiated' }),
      }).catch(console.error);
    }

    return res.status(200).json({ success: true, callId: data.call_id });
  } catch (err) {
    console.error('Call handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
