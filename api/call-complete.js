module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    call_id,
    metadata,
    summary,
    transcripts,
    recording_url,
    call_length,
    completed,
    inbound,
  } = req.body || {};

  const leadId  = metadata?.leadId;
  const name    = metadata?.name;
  const phone   = metadata?.phone;
  const service = metadata?.service;

  console.log('Call complete webhook:', { call_id, leadId, completed, call_length });

  // ── Try to extract booked slot from transcript ─────────────
  let bookedTime = null;
  if (transcripts && Array.isArray(transcripts)) {
    const fullText = transcripts.map(t => t.text || '').join(' ').toLowerCase();
    // Look for phrases like "booked for Monday", "scheduled for Tuesday", etc.
    const slotMatch = fullText.match(/(?:booked|scheduled|confirmed|locked in) (?:you )?(?:for|at) ([^.!?]{5,60})/i);
    if (slotMatch) bookedTime = slotMatch[1].trim();
  }

  // ── 1. Update lead in Supabase with call outcome ──────────
  if (leadId && process.env.SUPABASE_URL) {
    const patch = {
      status: completed ? (bookedTime ? 'booked' : 'call_completed') : 'call_missed',
      ai_response: summary || null,
    };
    if (bookedTime) patch.booking_time = bookedTime;

    try {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.error('Supabase update error:', err);
    }
  }

  // ── 2. Email summary to owner ─────────────────────────────
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL && summary) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Lowcountry Air <leads@resend.dev>',
          to: process.env.NOTIFY_EMAIL,
          subject: `📞 Call Summary: ${name || phone} — ${service || 'HVAC Service'}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#101c2e;padding:24px;border-radius:12px 12px 0 0">
                <h2 style="color:#fe6a2a;margin:0;font-size:20px;text-transform:uppercase;letter-spacing:.05em">Call Summary — Madison</h2>
                <p style="color:#79849b;margin:4px 0 0;font-size:13px">Lowcountry Air · ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
              </div>
              <div style="background:#f9f9ff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e7eeff">
                <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
                  <tr><td style="padding:8px 0;color:#45474c;width:140px">Customer</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${name || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Phone</td><td style="padding:8px 0;font-weight:700"><a href="tel:${phone}" style="color:#a83900">${phone || '—'}</a></td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Service</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${service || '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Call Duration</td><td style="padding:8px 0;font-weight:700;color:#101c2e">${call_length ? Math.round(call_length) + ' seconds' : '—'}</td></tr>
                  <tr><td style="padding:8px 0;color:#45474c">Status</td><td style="padding:8px 0;font-weight:700;color:${completed ? '#16a34a' : '#dc2626'}">${completed ? '✅ Completed' : '❌ Missed / No Answer'}</td></tr>
                  ${bookedTime ? `<tr><td style="padding:8px 0;color:#45474c">Booked For</td><td style="padding:8px 0;font-weight:700;color:#0ea5e9">📅 ${bookedTime}</td></tr>` : ''}
                </table>

                <div style="background:#fff;border:1px solid #e7eeff;border-radius:10px;padding:16px;margin-bottom:20px">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#45474c">AI Call Summary</p>
                  <p style="margin:0;font-size:14px;color:#101c2e;line-height:1.6">${summary}</p>
                </div>

                ${recording_url ? `<a href="${recording_url}" style="display:inline-block;margin-bottom:16px;background:#101c2e;color:#fff;padding:10px 20px;border-radius:8px;font-weight:700;font-size:12px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em">▶ Listen to Recording</a>` : ''}

                <a href="tel:${phone}" style="display:inline-block;background:linear-gradient(135deg,#a83900,#fe6a2a);color:#fff;padding:12px 28px;border-radius:10px;font-weight:900;font-size:13px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em">Call ${name || 'Customer'} Back</a>
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error('Resend error:', err);
    }
  }

  return res.status(200).json({ received: true });
};
