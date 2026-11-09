import { validateName, validateEmail, validatePassword, validateConfig, mapAuthError } from '../src/auth/validation'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`
const t: [string, boolean][] = [
  ['nama ok', validateName('Ale_01') === null], ['nama pendek ditolak', validateName('ab') !== null], ['nama spasi ditolak', validateName('a b c') !== null],
  ['nama panjang ditolak', validateName('a'.repeat(17)) !== null], ['nama simbol ditolak', validateName('al<e>') !== null],
  ['email ok', validateEmail('a@b.co') === null], ['email salah', validateEmail('a@b') !== null],
  ['pw pendek', validatePassword('1234567') !== null], ['pw ok', validatePassword('12345678') === null], ['pw 73', validatePassword('a'.repeat(73)) !== null],
  ['url salah', validateConfig('http://x.supabase.co', jwt('anon')) !== null], ['url ok + anon', validateConfig('https://abc.supabase.co', jwt('anon')) === null],
  ['service_role ditolak', (validateConfig('https://abc.supabase.co', jwt('service_role')) ?? '').includes('RAHASIA')],
  ['sb_secret ditolak', validateConfig('https://abc.supabase.co', 'sb_secret_x') !== null], ['publishable ok', validateConfig('https://abc.supabase.co', 'sb_publishable_x') === null],
  ['key sampah', validateConfig('https://abc.supabase.co', 'abc') !== null],
  ['err login', mapAuthError('Invalid login credentials').includes('salah')], ['err rate', mapAuthError('email rate limit exceeded').includes('Terlalu')]
]
const bad = t.filter(([, ok]) => !ok).map(([n]) => n)
console.log(bad.length ? 'GAGAL: ' + bad.join(', ') : `LULUS ${t.length}/${t.length}`)
