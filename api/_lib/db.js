import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:4});
export async function sql(text,values=[]){return (await pool.query(text,values)).rows;}
export async function userFromAuth(subject){const rows=await sql('SELECT id,email,display_name FROM app_users WHERE auth_subject=$1',[subject]);if(!rows[0])throw Object.assign(new Error('Utente non ancora invitato o abilitato'),{status:403});return rows[0];}
export async function requireMember(userId,orgId,admin=false){const rows=await sql('SELECT role FROM memberships WHERE user_id=$1 AND organization_id=$2',[userId,orgId]);if(!rows[0]||(admin&&rows[0].role!=='org_admin')){const elevated=await sql('SELECT 1 FROM platform_admins WHERE user_id=$1',[userId]);if(elevated.length)return 'platform_admin';Object.assign(new Error('Accesso aziendale negato'),{status:403});}return rows[0].role;}
