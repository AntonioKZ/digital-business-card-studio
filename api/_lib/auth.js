import {createRemoteJWKSet,jwtVerify} from 'jose';
const base=process.env.NEON_AUTH_URL;
const jwks=base?createRemoteJWKSet(new URL(base.replace(/\/$/,'')+'/.well-known/jwks.json')):null;
export async function getIdentity(req){const token=(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];if(!token||!base||!jwks)throw Object.assign(new Error('Autenticazione richiesta'),{status:401});try{const {payload}=await jwtVerify(token,jwks,{issuer:base});if(!payload.sub)throw Error('Missing sub');return payload.sub}catch{throw Object.assign(new Error('Sessione scaduta o non valida'),{status:401})}}
export function fail(res,e){return res.status(e.status||500).json({error:e.status?e.message:'Errore interno'});}
