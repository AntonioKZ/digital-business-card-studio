import {createHmac} from 'node:crypto';
import {sql} from './_lib/db.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 if(process.env.VERCEL_ENV!=='preview'||!process.env.TEST_AUTH_SECRET)return res.status(404).json({error:'Collaudo non disponibile'});
 const {email,password}=req.body||{};
 if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>200)return res.status(400).json({error:'Dati non validi'});
 try{
 const rows=await sql("SELECT u.auth_subject FROM app_users u JOIN test_credentials t ON t.user_id=u.id WHERE lower(u.email)=lower($1) AND t.enabled=true AND t.password_hash=crypt($2,t.password_hash) LIMIT 1",[email.trim(),password]);
 if(!rows.length)return res.status(401).json({error:'Credenziali di collaudo non valide'});
 const payload=Buffer.from(JSON.stringify({sub:rows[0].auth_subject,exp:Date.now()+3600000})).toString('base64url');
 const signature=createHmac('sha256',process.env.TEST_AUTH_SECRET).update(payload).digest('base64url');
 return res.json({token:'test.'+payload+'.'+signature,expires_in:3600});
 }catch{return res.status(503).json({error:'Collaudo temporaneamente non disponibile'})}
}