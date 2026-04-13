module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { systemType, issue, age, brand } = req.body || {};
  if (!issue) {
    return res.status(400).json({ error: 'issue description required' });
  }

  const systemPrompt = `You are an expert HVAC estimator for Lowcountry Air in Charleston, SC. Based on the system info and issue described, provide a concise estimate response in this exact JSON format:
{
  "range": "$X – $Y",
  "mostLikely": "One sentence on the most probable cause",
  "urgency": "low" | "medium" | "high" | "emergency",
  "note": "One short sentence of practical advice"
}

Use realistic 2024 South Carolina market pricing. For emergencies (no cooling in extreme heat, elderly/infant at home), set urgency to "emergency". Always recommend a professional inspection for anything over $300. Return only valid JSON.`;

  const userContent = `System type: ${systemType || 'Central AC'}, Brand: ${brand || 'Unknown'}, Age: ${age || 'Unknown'} years, Issue: ${issue}`;

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 200,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const estimate = JSON.parse(raw);

    return res.status(200).json({ success: true, estimate });
  } catch (err) {
    console.error('Quote handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
