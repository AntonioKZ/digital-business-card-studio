const base=process.env.NEON_AUTH_URL;
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 const {email,password}=req.body||{};
 if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>1024||!email.includes('@'))return res.status(400).json({error:'Credenziali non valide'});
 if(!base)return res.status(503).json({error:'Autenticazione non configurata'});
 try{
  const login=await fetch(base+'/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://digital-business-card-studio.vercel.app'},body:JSON.stringify({email,password})});
  if(!login.ok)return res.status(401).json({error:'Email o password errate'});
  const cookies=login.headers.getSetCookie?.()||[login.headers.get('set-cookie')].filter(Boolean);
  const cookie=cookies.map(x=>x.split(';')[0]).join('; ');
  if(!cookie)return res.status(502).json({error:'Sessione non restituita dal provider'});
  const tokenResponse=await fetch(base+'/token',{headers:{Cookie:cookie,Origin:'https://digital-business-card-studio.vercel.app'}});
  const result=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||!result.token)return res.status(502).json({error:'Token di sessione non disponibile'});
  res.setHeader('Cache-Control','no-store');return res.json({token:result.token});
 }catch{return res.status(502).json({error:'Servizio autenticazione temporaneamente non disponibile'})}
}
