import {getIdentity,fail} from './_lib/auth.js';
import {transaction} from './_lib/db.js';
import {deliverMail,queueMail,studioOrigin} from './_lib/mail.js';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 try{
  const subject=await getIdentity(req);
  const {card_id,action,note,revision}=req.body||{};
  if(typeof card_id!=='string'||!['submit','approve','reject','suspend'].includes(action))return res.status(400).json({error:'Azione non valida'});
  const feedback = typeof note === 'string' ? note.trim() : '';
  if (action==='reject' && (!feedback || feedback.length>2000)) return res.status(400).json({error:'Indica le modifiche richieste (massimo 2000 caratteri)'});
  const {card:updated,mailIds}=await transaction(async client => {
  const users=await client.query('SELECT id FROM app_users WHERE auth_subject=$1',[subject]);
  if(!users.rowCount)throw Object.assign(new Error('Utente non abilitato'),{status:403});
  const uid=users.rows[0].id;
  const cards=await client.query('SELECT id,organization_id,owner_id,status,data,revision,slug FROM cards WHERE id=$1 FOR UPDATE',[card_id]);
  if(!cards.rowCount)throw Object.assign(new Error('Card inesistente'),{status:404});
  const card=cards.rows[0];
  const membership=await client.query('SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2',[card.organization_id,uid]);
  const platform=await client.query('SELECT 1 FROM platform_admins WHERE user_id=$1',[uid]);if(!membership.rowCount&&!platform.rowCount)throw Object.assign(new Error('Accesso negato'),{status:403});
  if(action==='submit'&&card.owner_id!==uid)throw Object.assign(new Error('Solo il proprietario può inviare la card'),{status:403});
  if(action!=='submit'&&membership.rows[0]?.role!=='org_admin'&&!platform.rowCount)throw Object.assign(new Error('Solo amministratori aziendali'),{status:403});
  const states={submit:['draft','pending'],approve:['pending','published'],reject:['pending','rejected'],suspend:['published','suspended']};
  const [from,to]=states[action];
  if ((['approve','reject'].includes(action) || revision!==undefined) && revision!==card.revision) throw Object.assign(new Error('La revisione è cambiata. Ricarica la scheda.'),{status:409});
  if (action==='submit' && (!String(card.data.name||'').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(card.data.email||'').trim()))) throw Object.assign(new Error('Salva nome ed email prima di inviare'),{status:400});
  if(card.status!==from && !(action==='submit' && card.status==='rejected'))throw Object.assign(new Error('Stato non compatibile'),{status:409});
  const result=await client.query('UPDATE cards SET status=$1,updated_at=now(),published_data=CASE WHEN $1=\'published\' THEN data ELSE published_data END,published_revision=CASE WHEN $1=\'published\' THEN revision ELSE published_revision END,published_at=CASE WHEN $1=\'published\' THEN now() ELSE published_at END WHERE id=$2 RETURNING id,status',[to,card_id]);
  if(action==='approve'||action==='reject')await client.query('INSERT INTO card_reviews(card_id,reviewer_id,decision,note) VALUES($1,$2,$3,$4)',[card_id,uid,action==='approve'?'approved':'rejected',feedback || null]);
  const mailIds=[];
  const orgId=card.organization_id;
  if (action==='submit') {
    const {rows:recipients}=await client.query(
      "SELECT DISTINCT lower(u.email) AS email FROM app_users u JOIN neon_auth.\"user\" auth ON auth.id::text=u.auth_subject WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=$1 AND m.user_id=u.id AND m.role='org_admin') OR EXISTS (SELECT 1 FROM platform_admins p WHERE p.user_id=u.id)",[orgId]
    );
    const reviewUrl=studioOrigin+'/admin.html?organization_id='+orgId+'&card_id='+card_id;
    for (const {email} of recipients) {
      mailIds.push(await queueMail(client,orgId,email,'Biglietto da approvare', 'È disponibile un biglietto da approvare.\n\n'+reviewUrl));
    }
  }
  if (action==='approve'||action==='reject') {
    const {rows:[recipient]}=await client.query('SELECT u.email,o.slug FROM app_users u CROSS JOIN organizations o WHERE u.id=$1 AND o.id=$2',[card.owner_id,orgId]);
    if (recipient) {
      const link=action==='approve'
        ? studioOrigin+'/card.html?organization='+encodeURIComponent(recipient.slug)+'&slug='+encodeURIComponent(card.slug)
        : studioOrigin+'/admin.html?organization_id='+orgId+'&card_id='+card_id;
      mailIds.push(await queueMail(client,orgId,recipient.email,
        action==='approve'?'Il tuo biglietto è online':'Modifiche richieste al tuo biglietto',
        (action==='approve'?'Il tuo biglietto è stato pubblicato.':feedback)+'\n\n'+link));
    }
  }
  return {card:result.rows[0],mailIds:mailIds.filter(Boolean)};
  });
  const deliveries=await Promise.all(mailIds.map(deliverMail));
  return res.json({card:updated,pending_mail:deliveries.filter(sent=>!sent).length});
 }catch(e){return fail(res,e)}
}
