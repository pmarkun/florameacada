const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const cookie = '__Host-flora-moderacao';
const sessionSeconds = 8 * 3600;
const textInput = (value) => typeof value === 'string' ? value.trim() : '';
const emailAddress = (value) => textInput(value).toLowerCase();
const validEmail = (value) => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
const hex = (value) => Array.from(new Uint8Array(value), (b) => b.toString(16).padStart(2, '0')).join('');
const random = (length) => hex(crypto.getRandomValues(new Uint8Array(length)));
const digest = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const bytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

function json(body, status = 200, headers = {}) {
  return Response.json(body, {status, headers:{
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers
  }});
}

async function readJson(request, max = 52_000) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let length = 0;
  let output = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); return null; }
    output += decoder.decode(value, {stream:true});
  }
  try { return JSON.parse(output + decoder.decode()); }
  catch { return null; }
}

async function limit(env, kind, value, max, seconds) {
  const until = (Math.floor(now() / seconds) + 1) * seconds;
  const bucket = kind + ':' + until + ':' + await digest((env.FLORA_RATE_KEY || '') + ':' + value);
  const row = await env.DB.prepare(
    'INSERT INTO mail_limits (bucket,window_end,attempts) VALUES (?,?,1) ' +
    'ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 WHERE attempts < ? RETURNING attempts'
  ).bind(bucket, until, max).first();
  return Boolean(row);
}

async function letterState(db, id) {
  const row = await db.prepare(
    'SELECT body, author_name FROM letter_submissions WHERE plant_id = ? AND published_at IS NOT NULL'
  ).bind(id).first();
  return row ? {state:'published', letter:row.body, author:row.author_name} : {state:'available'};
}

function letterFields(data) {
  const name = textInput(data?.name);
  const body = textInput(data?.letter).replace(/\r\n?/g, '\n');
  return name && name.length <= 100 && body && body.length <= 8000 ? {name, body} : null;
}

async function submit(request, env, id) {
  const data = await readJson(request);
  const letter = letterFields(data);
  const email = emailAddress(data?.email);
  if (!letter || !validEmail(email)) {
    return json({error:'Preencha o nome, um e-mail válido e uma carta de até 8.000 caracteres.'}, 400);
  }
  const ip = request.headers.get('CF-Connecting-IP');
  if ((ip && !await limit(env, 'form-ip', ip, 15, 3600)) ||
      !await limit(env, 'form-email', email, 6, 86_400)) {
    return json({error:'Limite de envios atingido. Tente mais tarde.'}, 429);
  }
  await env.DB.prepare('DELETE FROM mail_limits WHERE window_end < ?').bind(now()).run();
  const row = await env.DB.prepare(
    'INSERT INTO letter_submissions (id,plant_id,author_name,author_email,body,created_at) ' +
    'SELECT ?,?,?,?,?,? WHERE NOT EXISTS ' +
    '(SELECT 1 FROM letter_submissions WHERE plant_id = ? AND published_at IS NOT NULL) RETURNING id'
  ).bind(crypto.randomUUID(), id, letter.name, email, letter.body, now(), id).first();
  return row ? json({state:'review', id:row.id}, 201) :
    json({error:'Esta planta já tem uma carta publicada.'}, 409);
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100_000
  }, key, 256);
  return hex(bits);
}

function sameHash(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function passwordMatches(password, stored) {
  if (!stored || !password || password.length > 128) return false;
  const [salt, expected] = stored.split('.');
  return Boolean(salt && expected && sameHash(await passwordHash(password, salt), expected));
}

const ownerSignedIn = (request, email) => Boolean(email &&
  request.headers.get('oai-authenticated-user-id') &&
  emailAddress(request.headers.get('oai-authenticated-user-email')) === email);

function sessionToken(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-flora-moderacao=([0-9a-f]{64})(?:;|$)/)?.[1];
}

function sessionCookie(token, maxAge) {
  return cookie + '=' + token + '; Max-Age=' + maxAge + '; Path=/; Secure; HttpOnly; SameSite=Strict';
}

async function loggedIn(request, env) {
  const token = sessionToken(request);
  return token && env.FLORA_ADMIN_EMAIL && await env.DB.prepare(
    'SELECT email FROM moderation_sessions WHERE token_hash = ? AND expires_at > ? AND email = ?'
  ).bind(await digest(token), now(), env.FLORA_ADMIN_EMAIL).first();
}

async function startSession(db, email) {
  const token = random(32);
  await db.batch([
    db.prepare('DELETE FROM moderation_sessions WHERE expires_at <= ?').bind(now()),
    db.prepare('INSERT INTO moderation_sessions (token_hash,email,expires_at) VALUES (?,?,?)')
      .bind(await digest(token), email, now() + sessionSeconds)
  ]);
  return json({ok:true}, 200, {'Set-Cookie':sessionCookie(token, sessionSeconds)});
}

async function access(request, env, action) {
  const email = env.FLORA_ADMIN_EMAIL;
  if (!email) return json({error:'Moderação indisponível.'}, 503);
  const standalone = Boolean(env.FLORA_STANDALONE);
  const savedPassword = () => env.DB.prepare('SELECT password_hash FROM moderation_credentials WHERE email = ?')
    .bind(email).first();
  if (action === 'session' && request.method === 'GET') {
    const active = Boolean(await loggedIn(request, env));
    const activation = standalone && Boolean(env.FLORA_ADMIN_SETUP_HASH) && !await savedPassword();
    return json({loggedIn:active, standalone, activation,
      canSetPassword:standalone ? active || activation : ownerSignedIn(request, email)});
  }
  if (request.method !== 'POST') return json({error:'Método inválido.'}, 405);
  if (action === 'sair') {
    const token = sessionToken(request);
    if (token) await env.DB.prepare('DELETE FROM moderation_sessions WHERE token_hash = ?')
      .bind(await digest(token)).run();
    return json({ok:true}, 200, {'Set-Cookie':sessionCookie('', 0)});
  }
  const data = await readJson(request, 4096);
  const password = typeof data?.password === 'string' ? data.password : '';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!['senha', 'entrar'].includes(action)) return json({error:'Método inválido.'}, 405);
  if (!await limit(env, 'admin-ip', ip, 12, 900)) return json({error:'Muitas tentativas. Aguarde alguns minutos.'}, 429);
  const saved = await savedPassword();
  if (action === 'senha') {
    if (password.length < 12 || password.length > 128) return json({error:'Use de 12 a 128 caracteres.'}, 400);
    if (standalone) {
      const proof = typeof data?.proof === 'string' ? data.proof : '';
      const authorized = saved ?
        await loggedIn(request, env) && await passwordMatches(proof, saved.password_hash) :
        proof.length <= 128 && Boolean(env.FLORA_ADMIN_SETUP_HASH) &&
          sameHash(await digest(proof.trim()), env.FLORA_ADMIN_SETUP_HASH);
      if (!authorized) return json({error:'Código de ativação ou senha atual inválida.'}, 403);
    } else if (!ownerSignedIn(request, email)) {
      return json({error:'Confirme sua identidade com a conta do ChatGPT.'}, 403);
    }
    const salt = random(16);
    const hash = salt + '.' + await passwordHash(password, salt);
    const update = standalone
      ? saved
        ? env.DB.prepare('UPDATE moderation_credentials SET password_hash = ? WHERE email = ? AND password_hash = ?')
          .bind(hash, email, saved.password_hash)
        : env.DB.prepare('INSERT INTO moderation_credentials (email,password_hash) VALUES (?,?) ON CONFLICT DO NOTHING')
          .bind(email, hash)
      : env.DB.prepare('INSERT INTO moderation_credentials (email,password_hash) VALUES (?,?) ' +
          'ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash').bind(email, hash);
    const result = await update.run();
    if (!result.meta.changes) return json({error:'A senha já foi alterada. Entre novamente.'}, 409);
    await env.DB.prepare('DELETE FROM moderation_sessions WHERE email = ?').bind(email).run();
    return startSession(env.DB, email);
  }
  if (emailAddress(data?.email) !== email ||
      !await passwordMatches(password, saved?.password_hash || env.FLORA_ADMIN_BOOTSTRAP_HASH)) {
    return json({error:'E-mail ou senha inválidos.'}, 401);
  }
  return startSession(env.DB, email);
}

async function moderate(request, env, url, id) {
  if (!await loggedIn(request, env)) return json({error:'Entre para acessar a moderação.'}, 401);
  if (!id && request.method === 'GET') {
    const published = url.searchParams.get('estado') === 'publicadas';
    const page = Math.max(0, Math.min(1_000_000, Number.parseInt(url.searchParams.get('pagina'), 10) || 0));
    const result = await env.DB.prepare(
      'SELECT id,plant_id,author_name,author_email,body,created_at,published_at FROM letter_submissions ' +
      'WHERE published_at IS ' + (published ? 'NOT NULL' : 'NULL') +
      (published ? ' ORDER BY published_at DESC, id' : ' ORDER BY created_at, id') + ' LIMIT 21 OFFSET ?'
    ).bind(page * 20).all();
    return json({more:result.results.length > 20, letters:result.results.slice(0, 20).map((row) =>
      ({...row, plantName:plantNames.get(row.plant_id)}))});
  }
  if (id && request.method === 'POST') {
    const data = await readJson(request);
    if (data?.action === 'delete') {
      const result = await env.DB.prepare('DELETE FROM letter_submissions WHERE id = ?').bind(id).run();
      return result.meta.changes ? json({ok:true}) : json({error:'Carta não encontrada.'}, 404);
    }
    if (!['edit', 'publish'].includes(data?.action)) return json({error:'Ação inválida.'}, 400);
    const letter = letterFields(data);
    if (!letter) return json({error:'Preencha o nome e o texto da carta.'}, 400);
    const publish = data.action === 'publish';
    const result = await env.DB.prepare(
      'UPDATE letter_submissions SET author_name = ?, body = ?, ' +
      'published_at = COALESCE(published_at, ?) WHERE id = ? AND ' +
      '(? IS NULL OR NOT EXISTS (SELECT 1 FROM letter_submissions AS other ' +
      'WHERE other.plant_id = letter_submissions.plant_id AND other.published_at IS NOT NULL AND other.id <> ?))'
    ).bind(letter.name, letter.body, publish ? now() : null, id, publish ? 1 : null, id).run();
    if (result.meta.changes) return json({ok:true});
    const exists = await env.DB.prepare('SELECT id FROM letter_submissions WHERE id = ?').bind(id).first();
    return exists ? json({error:'Já existe uma carta publicada para esta planta.'}, 409) :
      json({error:'Carta não encontrada.'}, 404);
  }
  return json({error:'Método inválido.'}, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        if (request.method === 'POST' && (request.headers.get('Origin') !== url.origin ||
            request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')) {
          return json({error:'Origem ou formato inválido.'}, 403);
        }
        if (!env.DB) return json({error:'As cartas estão temporariamente indisponíveis.'}, 503);
        if (path === '/api/cartas/resumo') {
          if (request.method !== 'GET') return json({error:'Método inválido.'}, 405);
          const row = await env.DB.prepare(
            'SELECT COUNT(*) AS published, (SELECT plant_id FROM letter_submissions ' +
            'WHERE published_at IS NOT NULL ORDER BY published_at DESC, plant_id LIMIT 1) AS latest ' +
            'FROM letter_submissions WHERE published_at IS NOT NULL'
          ).first();
          return json({published:row.published, waiting:plantNames.size - row.published, latestPlant:row.latest});
        }
        const publicLetter = path.match(/^\/api\/cartas\/(\d{1,4})$/);
        if (publicLetter) {
          const id = Number(publicLetter[1]);
          if (!plantNames.has(id)) return json({error:'Planta não encontrada.'}, 404);
          if (request.method === 'GET') return json(await letterState(env.DB, id));
          if (request.method === 'POST') return await submit(request, env, id);
          return json({error:'Método inválido.'}, 405);
        }
        const auth = path.match(/^\/api\/moderacao\/(session|entrar|senha|sair)$/);
        if (auth) return await access(request, env, auth[1]);
        const admin = path.match(/^\/api\/moderacao\/cartas(?:\/([0-9a-f-]{36}))?$/);
        if (admin) return await moderate(request, env, url, admin[1]);
        return json({error:'Página não encontrada.'}, 404);
      }
      const asset = Object.hasOwn(assets, path) ? assets[path] :
        path === '/' ? assets['/index.html'] :
        path === '/admin' || path === '/admin/' ? assets['/admin.html'] : null;
      if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Página não encontrada.', {status:404});
      return new Response(request.method === 'HEAD' ? null : bytes(asset[1]), {headers:{
        'Content-Type':asset[0], 'Cache-Control':'public, max-age=0, must-revalidate',
        'X-Content-Type-Options':'nosniff',
        ...(asset === assets['/admin.html'] ? {'X-Frame-Options':'DENY'} : {})
      }});
    } catch {
      return json({error:'O serviço está temporariamente indisponível.'}, 503);
    }
  }
};
