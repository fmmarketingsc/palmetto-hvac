module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, phone, email, service, address, systemType, message } = req.body || {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  const systemPrompt = `You are writing a warm, personalized confirmation message for Lowcountry Air, a top-rated HVAC company in Charleston, SC. Based on the service request details, write exactly 2 sentences: first acknowledge their specific issue and location warmly, then tell them what happens next (a technician will call within 15 minutes to confirm). Be specific, genuine, and professional. No generic lines.`;

  const userContent = `Customer: ${name}, Phone: ${phone}, Email: ${email || 'not provided'}, Service: ${service || 'General inquiry'}, Address: ${address || 'not provided'}, System type: ${systemType || 'not specified'}, Message: "${message || 'no message'}". Write the personalized confirmation now.`;

  try {
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    let confirmationMessage = `Thanks ${name}! We've received your service request and a technician will call you at ${phone} within 15 minutes to confirm your appointment.`;

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      const aiText = data.choices?.[0]?.message?.content;
      if (aiText) confirmationMessage = aiText;
    }

    return res.status(200).json({
      success: true,
      message: confirmationMessage,
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
