import {createRemoteJWKSet,jwtVerify} from 'jose';
const issuer=process.env.NEON_AUTH_URL;
export async function getIdentity(req){const token=(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];if(!token||!issuer)throw Object.assign(new Error('Autenticazione richiesta'),{status:401});const jwks=createRemoteJWKSet(new URL(issuer.replace(/\/$/,'')+'/.well-known/jwks.json'));const {payload}=await jwtVerify(token,jwks,{issuer});if(!payload.sub)throw Object.assign(new Error('Token non valido'),{status:401});return payload.sub;}
export function fail(res,e){return res.status(e.status||500).json({error:e.status?e.message:'Errore interno'});}
