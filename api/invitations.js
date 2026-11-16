import {createHash,randomBytes} from 'node:crypto';
import {getIdentity,fail} from './_lib/auth.js';
import {requireMember,sql,transaction,userFromAuth} from './_lib/db.js';
import {deliverMail,queueMail,studioOrigin} from './_lib/mail.js';

const hash = token => createHash('sha256').update(token).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const problem = (status,message) => Object.assign(new Error(message),{status});

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control','no-store');
  try {
    const subject = await getIdentity(req);
    const {action,organization_id,email,token,mail_id} = req.body || {};
    if (action === 'accept') {
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw problem(400,'Invito non valido');
      const card = await transaction(async client => {
        const {rows:[invite]} = await client.query(
          'SELECT *,expires_at>now() AS active FROM employee_invitations WHERE token_hash=$1 FOR UPDATE',[hash(token)]
        );
        if (!invite?.active) throw problem(410,'Invito scaduto o non valido');
        const {rows:[identity]} = await client.query(
          'SELECT lower(email) AS email,name FROM neon_auth."user" WHERE id::text=$1',[subject]
        );
        if (identity?.email !== invite.email) throw problem(403,'Accedi con l’indirizzo a cui è stato inviato l’invito');
        const {rows:[user]} = await client.query(
          'INSERT INTO app_users(auth_subject,email,display_name) VALUES($1,$2,$3) ON CONFLICT(auth_subject) DO UPDATE SET auth_subject=EXCLUDED.auth_subject RETURNING id',
          [subject,identity.email,identity.name || '']
        );
        if (invite.accepted_by) {
          if (invite.accepted_by !== user.id) throw problem(410,'Invito già utilizzato');
          return {id:invite.card_id,organization_id:invite.organization_id};
        }
        const {rows:[org]} = await client.query(
          'SELECT name,branding FROM organizations WHERE id=$1 FOR UPDATE',[invite.organization_id]
        );
        await client.query(
          "INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
          [invite.organization_id,user.id]
        );
        const {rows:[existing]} = await client.query(
          'SELECT id,organization_id FROM cards WHERE organization_id=$1 AND owner_id=$2 ORDER BY created_at LIMIT 1',
          [invite.organization_id,user.id]
        );
        let card = existing;
        if (!card) {
          const {rows:[template]} = await client.query(
            'SELECT id,layout FROM card_templates WHERE organization_id=$1 AND is_default ORDER BY created_at LIMIT 1',[invite.organization_id]
          );
          const branding = org.branding || {};
          const data = {
            company:org.name, name:identity.name || '', email:identity.email,
            website:branding.website || '', address:branding.address || '', cardurl:'',
            primary:branding.primary || '#102b53', accent:branding.accent || '#147ea4', logoData:branding.logoData || '',
            ...template?.layout?.data
          };
          const slugBase = identity.email.split('@')[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
          const slug = (slugBase || 'profilo') + '-' + randomBytes(6).toString('hex');
          const result = await client.query(
            'INSERT INTO cards(organization_id,template_id,owner_id,slug,data) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id',
            [invite.organization_id,template?.id || null,user.id,slug,JSON.stringify(data)]
          );
          card = result.rows[0];
        }
        await client.query('UPDATE employee_invitations SET accepted_by=$1,card_id=$2 WHERE id=$3',[user.id,card.id,invite.id]);
        return card;
      });
      return res.json({card});
    }

    const user = await userFromAuth(subject);
    if (typeof organization_id !== 'string' || !uuid.test(organization_id)) throw problem(400,'Azienda non valida');
    await requireMember(user.id,organization_id,true);
    if (action === 'list') {
      const invitations = await sql(`
        SELECT i.email,i.expires_at,i.accepted_by IS NOT NULL AS accepted,
          i.expires_at<=now() AS expired,
          EXISTS (
            SELECT 1 FROM studio_mail m
            WHERE m.organization_id=i.organization_id AND m.recipient=i.email
              AND m.subject='Invito a compilare il biglietto digitale' AND m.sent_at IS NOT NULL
              AND encode(sha256(convert_to(substring(m.body from '#invito=([A-Za-z0-9_-]{43})'),'UTF8')),'hex')=i.token_hash
          ) AS sent
        FROM employee_invitations i
        WHERE i.organization_id=$1
        ORDER BY i.expires_at DESC, i.id
        LIMIT 100`,[organization_id]);
      return res.json({invitations});
    }
    if (action === 'queue') {
      const pending = await sql('SELECT id,recipient,subject FROM studio_mail WHERE organization_id=$1 AND sent_at IS NULL ORDER BY created_at LIMIT 100',[organization_id]);
      return res.json({pending});
    }
    if (action === 'retry') {
      if (typeof mail_id !== 'string' || !uuid.test(mail_id)) throw problem(400,'Email non valida');
      const [item] = await sql('SELECT id FROM studio_mail WHERE id=$1 AND organization_id=$2',[mail_id,organization_id]);
      if (!item) throw problem(404,'Email non trovata');
      return res.json({sent:await deliverMail(item.id)});
    }
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (action !== 'invite' || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw problem(400,'Email non valida');
    if (address.endsWith('.example')) throw problem(400,'Indirizzo di esempio');
    const secret = randomBytes(32).toString('base64url');
    const link = studioOrigin + '/admin.html#invito=' + secret;
    const id = await transaction(async client => {
      const {rows:[org]} = await client.query('SELECT name FROM organizations WHERE id=$1',[organization_id]);
      if (!org) throw problem(404,'Azienda non trovata');
      await client.query('INSERT INTO employee_invitations(organization_id,email,token_hash) VALUES($1,$2,$3)',
        [organization_id,address,hash(secret)]);
      return queueMail(client,organization_id,address,'Invito a compilare il biglietto digitale',
        'Sei stato invitato a compilare il biglietto digitale per ' + org.name + '. Accedi o registrati con questo indirizzo. Il link scade tra 7 giorni.\n\n' + link);
    });
    return res.status(201).json({link,sent:await deliverMail(id)});
  } catch (error) {
    if (error.code==='23505') return res.status(409).json({error:'L’indirizzo è già associato a un altro profilo. Contatta l’amministratore.'});
    return fail(res,error);
  }
}
