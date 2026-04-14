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

  // ── 4. Send confirmation email to customer ───────────────
  if (process.env.RESEND_API_KEY && email && savedId) {
    const editUrl = `https://palmetto-hvac.vercel.app/edit?id=${savedId}`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Lowcountry Air <leads@resend.dev>',
          to: email,
          subject: `We got your request, ${name.split(' ')[0]}! ✅`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0b1320;border-radius:16px;overflow:hidden">
              <div style="padding:32px 24px;background:linear-gradient(135deg,#a83900,#fe6a2a);text-align:center">
                <h1 style="margin:0;color:#fff;font-size:22px;font-weight:900;letter-spacing:-.02em">You're on our list, ${name.split(' ')[0]}!</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:14px">Lowcountry Air — Charleston, SC</p>
              </div>
              <div style="padding:28px 24px">
                <p style="color:#c0cce0;font-size:15px;line-height:1.6;margin:0 0 24px">${confirmationMessage}</p>

                <div style="background:#131f30;border:1px solid #1e2d42;border-radius:12px;padding:20px;margin-bottom:24px">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#4b5563">Your Request</p>
                  <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <tr><td style="padding:6px 0;color:#4b5563;width:100px">Name</td><td style="padding:6px 0;color:#c0cce0;font-weight:600">${name}</td></tr>
                    <tr><td style="padding:6px 0;color:#4b5563">Phone</td><td style="padding:6px 0;color:#c0cce0;font-weight:600">${phone}</td></tr>
                    ${service ? `<tr><td style="padding:6px 0;color:#4b5563">Service</td><td style="padding:6px 0;color:#c0cce0;font-weight:600">${service}</td></tr>` : ''}
                    ${address ? `<tr><td style="padding:6px 0;color:#4b5563">Address</td><td style="padding:6px 0;color:#c0cce0;font-weight:600">${address}</td></tr>` : ''}
                    ${systemType ? `<tr><td style="padding:6px 0;color:#4b5563">System</td><td style="padding:6px 0;color:#c0cce0;font-weight:600">${systemType}</td></tr>` : ''}
                    ${message ? `<tr><td style="padding:6px 0;color:#4b5563;vertical-align:top">Issue</td><td style="padding:6px 0;color:#c0cce0">${message}</td></tr>` : ''}
                  </table>
                </div>

                <div style="text-align:center;margin-bottom:24px">
                  <p style="color:#4b5563;font-size:13px;margin:0 0 12px">Something wrong? Fix it before we call.</p>
                  <a href="${editUrl}" style="display:inline-block;background:#131f30;border:2px solid #fe6a2a;color:#fe6a2a;padding:12px 28px;border-radius:10px;font-weight:900;font-size:13px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em">Edit My Request</a>
                </div>

                <p style="color:#2a3550;font-size:12px;text-align:center;margin:0">Questions? Call us at <a href="tel:8439543943" style="color:#fe6a2a">(843) 954-3943</a></p>
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error('Customer email error:', err);
    }
  }

  return res.status(200).json({
    success: true,
    message: confirmationMessage,
    leadId: savedId,
    submittedAt: new Date().toISOString(),
  });
};
