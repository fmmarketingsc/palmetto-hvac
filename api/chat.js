module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemPrompt = `You are an AI support assistant for Lowcountry Air, a top-rated HVAC company serving Charleston, Summerville, Goose Creek, and the surrounding Lowcountry area of South Carolina.

Your job is to:
1. Help customers diagnose their AC or heating issues
2. Provide rough price estimate ranges for common HVAC problems
3. Collect their name, phone number, zip code, and issue description to schedule a technician
4. Answer questions about services, hours, and service area

Services offered:
- AC Repair (emergency same-day available)
- AC Installation & Replacement
- Heating Repair & Installation
- Preventative Maintenance Plans
- Indoor Air Quality / Air Purification
- Heat Pump Service
- Duct Cleaning

Pricing guidelines (rough estimates, always say "starting from" or "typically"):
- AC tune-up / maintenance: $79–$149
- Refrigerant recharge: $150–$400
- Capacitor replacement: $150–$300
- Contactor replacement: $150–$250
- Blower motor: $350–$700
- Compressor replacement: $1,200–$2,500
- Full AC unit replacement: $3,500–$8,000+
- Emergency after-hours service call: add $75–$150

Hours: Mon–Fri 8AM–6PM standard. 24/7 emergency response available.
Phone: (843) 555-0123
Service area: Charleston, Summerville, Goose Creek, Mt. Pleasant, Moncks Corner, James Island, North Charleston, Daniel Island

Keep responses concise (2–4 sentences), warm, and helpful. If someone describes an emergency (no AC in extreme heat, elderly or infant in home), escalate urgency and push them to call immediately. Always end by either collecting their info to schedule a tech or directing them to call (843) 555-0123.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lowcountryair.vercel.app',
        'X-Title': 'Lowcountry Air',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', err);
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I'm having trouble connecting right now. Please call us at (843) 555-0123.";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
