import {getIdentity,fail} from './_lib/auth.js';
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:4});
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 let client;
 try{
  const subject=await getIdentity(req);
  const {card_id,action}=req.body||{};
  if(typeof card_id!=='string'||!['submit','approve','reject','suspend'].includes(action))return res.status(400).json({error:'Azione non valida'});
  client=await pool.connect();await client.query('BEGIN');
  const users=await client.query('SELECT id FROM app_users WHERE auth_subject=$1',[subject]);
  if(!users.rowCount)throw Object.assign(new Error('Utente non abilitato'),{status:403});
  const uid=users.rows[0].id;
  const cards=await client.query('SELECT id,organization_id,owner_id,status,data,revision FROM cards WHERE id=$1 FOR UPDATE',[card_id]);
  if(!cards.rowCount)throw Object.assign(new Error('Card inesistente'),{status:404});
  const card=cards.rows[0];
  const membership=await client.query('SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2',[card.organization_id,uid]);
  const platform=await client.query('SELECT 1 FROM platform_admins WHERE user_id=$1',[uid]);if(!membership.rowCount&&!platform.rowCount)throw Object.assign(new Error('Accesso negato'),{status:403});
  if(action==='submit'&&card.owner_id!==uid)throw Object.assign(new Error('Solo il proprietario può inviare la card'),{status:403});
  if(action!=='submit'&&membership.rows[0]?.role!=='org_admin'&&!platform.rowCount)throw Object.assign(new Error('Solo amministratori aziendali'),{status:403});
  const states={submit:['draft','pending'],approve:['pending','published'],reject:['pending','rejected'],suspend:['published','suspended']};
  const [from,to]=states[action];
  if(card.status!==from)throw Object.assign(new Error('Stato non compatibile'),{status:409});
  const result=await client.query('UPDATE cards SET status=$1,updated_at=now(),published_data=CASE WHEN $1=\'published\' THEN data ELSE published_data END,published_revision=CASE WHEN $1=\'published\' THEN revision ELSE published_revision END,published_at=CASE WHEN $1=\'published\' THEN now() ELSE published_at END WHERE id=$2 RETURNING id,status',[to,card_id]);
  if(action==='approve'||action==='reject')await client.query('INSERT INTO card_reviews(card_id,reviewer_id,decision) VALUES($1,$2,$3)',[card_id,uid,action==='approve'?'approved':'rejected']);
  await client.query('COMMIT');return res.json({card:result.rows[0]});
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return fail(res,e)}finally{client?.release()}
}
