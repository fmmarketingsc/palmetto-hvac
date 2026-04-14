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

  // ── 1. Generate AI confirmation message ───────────────────
  const systemPrompt = `You are writing a warm, personalized confirmation message for Lowcountry Air, a top-rated HVAC company in Charleston, SC. Based on the service request details, write exactly 2 sentences: first acknowledge their specific issue and location warmly, then tell them what happens next (a technician will call within 15 minutes to confirm). Be specific, genuine, and professional. No generic lines.`;

  const userContent = `Customer: ${name}, Phone: ${phone}, Email: ${email || 'not provided'}, Service: ${service || 'General inquiry'}, Address: ${address || 'not provided'}, System type: ${systemType || 'not specified'}, Message: "${message || 'no message'}". Write the personalized confirmation now.`;

  let confirmationMessage = `Thanks ${name}! We've received your service request and a technician will call you at ${phone} within 15 minutes to confirm your appointment.`;
  let savedId = null;

  try {
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://palmetto-hvac.vercel.app',
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

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      const aiText = data.choices?.[0]?.message?.content;
      if (aiText) confirmationMessage = aiText;
    }
  } catch (err) {
    console.error('AI error:', err);
  }

  // ── 2. Save lead to Supabase ──────────────────────────────
  try {
    const sbRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/leads`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          name,
          phone,
          email:       email       || null,
          service:     service     || null,
          address:     address     || null,
          system_type: systemType  || null,
          message:     message     || null,
          ai_response: confirmationMessage,
          status:      'new',
        }),
      }
    );

    if (sbRes.ok) {
      const rows = await sbRes.json();
      savedId = rows?.[0]?.id || null;
    } else {
      const err = await sbRes.text();
      console.error('Supabase insert error:', err);
    }
  } catch (err) {
    console.error('Supabase error:', err);
  }

  // ── 3. Send email notification via Resend (when configured) ──
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Lowcountry Air Leads <leads@resend.dev>',
          to: process.env.NOTIFY_EMAIL,
          subject: `🔥 New Lead: ${name} — ${service || 'General Inquiry'}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#101c2e;padding:24px;border-radius:12px 12px 0 0">
                <h2 style="color:#fe6a2a;margin:0;font-size:20px;text-transform:uppercase;letter-spacing:.05em">New Service Request</h2>
                <p style="color:#79849b;margin:4px 0 0;font-size:13px">Lowcountry Air — ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
              </div>
              <div style="background:#f9f9ff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e7eeff">
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr><td style="padding:8px 0;color:#45474c;width:120px">Name</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${name}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Phone</td><td style="padding:8px 0;font-weight:700;color:#101c2e"><a href="tel:${phone}" style="color:#a83900">${phone}</a></td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Email</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${email || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Service</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${service || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Address</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${address || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">System</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${systemType || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c;vertical-align:top">Message</td><td style="padding:8px 0;color:#101c2e">${message || '—'}</td></tr>
                </table>
                <div style="margin-top:20px;padding:16px;background:#fff8f5;border-left:4px solid #fe6a2a;border-radius:4px">
                  <p style="margin:0;font-size:12px;color:#45474c;font-style:italic">AI sent to customer: "${confirmationMessage}"</p>
                </div>
                <a href="tel:${phone}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#a83900,#fe6a2a);color:#fff;padding:12px 28px;border-radius:10px;font-weight:900;font-size:13px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em">Call ${name} Now</a>
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error('Resend error:', err);
    }
  }

  return res.status(200).json({
    success: true,
    message: confirmationMessage,
    leadId: savedId,
    submittedAt: new Date().toISOString(),
  });
};
