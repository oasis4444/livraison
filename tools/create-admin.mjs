// Génère la requête SQL pour créer (ou réinitialiser) un compte administrateur.
// Usage : node tools/create-admin.mjs 0340000000 "Nom Admin" "MotDePasse"
//   puis : npx wrangler d1 execute alefa-livraison-prod --remote --command "<SQL affiché>"
import { webcrypto as crypto } from 'node:crypto';
const [phoneIn, name = 'Administrateur', password] = process.argv.slice(2);
if (!phoneIn || !password || password.length < 8) { console.error('Usage : node tools/create-admin.mjs <téléphone> "<nom>" "<mot de passe ≥ 8 caractères>"'); process.exit(1); }
let d = phoneIn.replace(/[^\d]/g, ''); if (d.startsWith('261')) d = d.slice(3); if (d.startsWith('0')) d = d.slice(1);
if (!/^3[2-9]\d{7}$/.test(d)) { console.error('Numéro malgache invalide'); process.exit(1); }
const phone = '+261' + d;
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const hash = hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: Number(process.env.PBKDF2_ITER || 10000) }, key, 256));
const q = (s) => `'${s.replace(/'/g, "''")}'`;
console.log(`INSERT INTO users (phone, name, role, pass_hash, pass_salt, status, created_at) VALUES (${q(phone)}, ${q(name)}, 'admin', '${hash}', '${salt}', 'active', ${Date.now()}) ON CONFLICT(phone) DO UPDATE SET role='admin', status='active', pass_hash=excluded.pass_hash, pass_salt=excluded.pass_salt, failed_logins=0, locked_until=NULL;`);
