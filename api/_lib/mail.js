import {sql} from './db.js';

export const studioOrigin = 'https://mi-bussiness-card.vercel.app';

export async function queueMail(client, organization, recipient, subject, body) {
  if (!recipient || recipient.endsWith('.example')) return null;
  const {rows} = await client.query(
    'INSERT INTO studio_mail(organization_id,recipient,subject,body) VALUES($1,$2,$3,$4) RETURNING id',
    [organization, recipient, subject, body]
  );
  return rows[0].id;
}

export async function deliverMail(id) {
  if (!id || !process.env.RESEND_API_KEY || !process.env.STUDIO_MAIL_FROM) return false;
  try {
    const [mail] = await sql('SELECT recipient,subject,body,sent_at FROM studio_mail WHERE id=$1',[id]);
    if (!mail || mail.sent_at) return Boolean(mail?.sent_at);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'studio/' + id
      },
      body: JSON.stringify({from: process.env.STUDIO_MAIL_FROM, to: [mail.recipient], subject: mail.subject, text: mail.body})
    });
    if (!response.ok) return false;
    await sql('UPDATE studio_mail SET sent_at=now() WHERE id=$1 AND sent_at IS NULL',[id]);
    return true;
  } catch {
    return false;
  }
}
