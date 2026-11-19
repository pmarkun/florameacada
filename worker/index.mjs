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

async function letterState(env, id) {
  const db = env.DB;
  const row = await db.prepare(
    'SELECT body, author_name FROM letter_submissions WHERE plant_id = ? AND published_at IS NOT NULL'
  ).bind(id).first();
  if (row) return {state:'published', letter:row.body, author:row.author_name};
  const state = await db.prepare(
    'SELECT EXISTS(SELECT 1 FROM letter_submissions WHERE plant_id=?) AS in_review, ' +
    '(SELECT expires_at FROM writing_reservations WHERE plant_id=? AND expires_at>? ' +
    'AND sent_at IS NOT NULL) AS expires_at'
  ).bind(id, id, now()).first();
  return {state:state.in_review ? 'review' : state.expires_at ? 'reserved' : 'available',
    reservationByEmail:mailEnabled(env),
    ...(!state.in_review && state.expires_at ? {expiresAt:state.expires_at} : {})};
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
    '(SELECT 1 FROM letter_submissions WHERE plant_id = ?) AND NOT EXISTS ' +
    '(SELECT 1 FROM writing_reservations WHERE plant_id = ? AND expires_at > ? AND sent_at IS NOT NULL) RETURNING id'
  ).bind(crypto.randomUUID(), id, letter.name, email, letter.body, now(), id, id, now()).first();
  return row ? json({state:'review', id:row.id}, 201) :
    json({error:'Esta planta já tem uma reserva ou uma carta.'}, 409);
}

const reservationSeconds = 7 * 86_400;
const deliverySeconds = 600;
const mailEnabled = (env) => Boolean(env.RESEND_API_KEY && env.RESEND_FROM && env.FLORA_RATE_KEY);
const writingToken = (env, id) => digest('flora-writing:' + env.FLORA_RATE_KEY + ':' + id);

const riskDescriptions = {
  VU:'Vulnerável',
  EN:'Em perigo',
  CR:'Criticamente em perigo',
  'CR (PE)':'Criticamente em perigo, possivelmente extinta'
};
const writingExpiration = new Intl.DateTimeFormat('pt-BR', {
  dateStyle:'long', timeStyle:'short', timeZone:'America/Sao_Paulo'
});

async function reserveWriting(request, env, plantId) {
  const data = await readJson(request, 2048);
  const email = emailAddress(data?.email);
  if (!validEmail(email)) return json({error:'Informe um e-mail válido.'}, 400);
  const ip = request.headers.get('CF-Connecting-IP');
  if ((ip && !await limit(env, 'writing-ip', ip, 8, 3600)) ||
      !await limit(env, 'writing-email', email, 5, 86_400)) {
    return json({error:'Limite de reservas atingido. Tente mais tarde.'}, 429);
  }

  const timestamp = now();
  const id = crypto.randomUUID();
  const tokenHash = await digest(await writingToken(env, id));
  await env.DB.prepare('DELETE FROM mail_limits WHERE window_end < ?').bind(timestamp).run();
  await env.DB.prepare(
    'DELETE FROM writing_reservations WHERE expires_at <= ? AND ' +
    'NOT EXISTS (SELECT 1 FROM letter_submissions AS l WHERE l.id = writing_reservations.id)'
  ).bind(timestamp).run();
  const created = await env.DB.prepare(
    'INSERT INTO writing_reservations (plant_id,id,token_hash,email,created_at,expires_at) ' +
    'SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM letter_submissions WHERE plant_id=?) ' +
    'ON CONFLICT(plant_id) DO UPDATE SET id=excluded.id,token_hash=excluded.token_hash,email=excluded.email,' +
    "created_at=excluded.created_at,expires_at=excluded.expires_at,sent_at=NULL,author_name='',body='',version=0 " +
    'WHERE writing_reservations.expires_at <= ? OR ' +
    '(writing_reservations.sent_at IS NULL AND writing_reservations.created_at <= ?) ' +
    'RETURNING id,email,sent_at,expires_at'
  ).bind(plantId, id, tokenHash, email, timestamp, timestamp + reservationSeconds, plantId,
    timestamp, timestamp - deliverySeconds).first();
  const row = created || await env.DB.prepare(
    'SELECT id,email,sent_at,expires_at FROM writing_reservations WHERE plant_id = ? AND email = ? AND expires_at > ? ' +
    'AND NOT EXISTS (SELECT 1 FROM letter_submissions WHERE plant_id = ?)'
  ).bind(plantId, email, timestamp, plantId).first();
  if (!row) return json({error:'Esta planta já tem uma reserva ou uma carta.'}, 409);
  if (row.sent_at) return json({state:'reserved', expiresAt:row.expires_at});
  const plant = plants.get(plantId);
  const link = new URL('/escrever', request.url);
  link.hash = await writingToken(env, row.id);
  const species = new URL('/#especie/' + plantId, request.url);
  const facts = [
    'Nome científico: ' + plant.name,
    plant.popular?.length && 'Nomes populares: ' + plant.popular.join(', '),
    'Família: ' + plant.family,
    'Categoria nacional de ameaça: ' + riskDescriptions[plant.risk] + ' (' + plant.risk + ')',
    plant.habit?.length && 'Forma de vida: ' + plant.habit.join(', '),
    plant.domains?.length && 'Domínios naturais: ' + plant.domains.join(', ')
  ].filter(Boolean);
  const deadline = writingExpiration.format(row.expires_at * 1000);
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method:'POST', signal:AbortSignal.timeout(8000),
      headers:{'Authorization':'Bearer ' + env.RESEND_API_KEY,
        'Content-Type':'application/json', 'Idempotency-Key':'flora/reserva/' + row.id},
      body:JSON.stringify({from:env.RESEND_FROM, to:[email], subject:'Seu caderno para ' + plant.name,
        text:'Seu caderno para escrever a ' + plant.name + ' está aberto.\n\n' +
          'Abra seu caderno: ' + link.href + '\n' +
          'Você tem até ' + deadline + ' (horário de Brasília) para enviar a carta. Guarde este link privado para voltar ao rascunho.\n\n' +
          'Para conhecer sua destinatária\n' + facts.join('\n') + '\n\n' +
          'Veja a ficha da planta no guia: ' + species.href + '\n\n' +
          'Se quiser, comece com “Cara ' + plant.name + '…” e diga a ela o que você gostaria que soubesse. ' +
          'Quando terminar, assine e envie a carta pelo caderno. Ela passa por revisão antes de ser publicada.\n\n' +
          'Cartas à Flora\n\nSe você não pediu este caderno, pode ignorar este e-mail.'})
    });
    if (!result.ok) return json({error:'Não conseguimos confirmar o envio. Tente de novo com o mesmo e-mail.'}, 502);
  } catch {
    return json({error:'Não conseguimos confirmar o envio. Tente de novo com o mesmo e-mail.'}, 502);
  }
  await env.DB.prepare('UPDATE writing_reservations SET sent_at = ? WHERE id = ? AND sent_at IS NULL')
    .bind(now(), row.id).run();
  return json({state:'reserved', expiresAt:row.expires_at}, 201);
}

async function writingDesk(request, env) {
  const data = await readJson(request);
  if (!/^[a-f0-9]{64}$/.test(data?.token ?? '') || !['open', 'save', 'submit'].includes(data?.action)) {
    return json({error:'Link do caderno inválido.'}, 400);
  }
  const row = await env.DB.prepare(
    'SELECT r.*, l.published_at, l.id AS submission_id, l.author_name AS submitted_name, l.body AS submitted_body ' +
    'FROM writing_reservations AS r LEFT JOIN letter_submissions AS l ON l.id = r.id WHERE r.token_hash = ?'
  ).bind(await digest(data.token)).first();
  if (!row || (!row.submission_id && row.expires_at <= now())) {
    return json({error:'Este link expirou ou a reserva foi encerrada. Volte ao guia para escolher uma planta.'}, 410);
  }
  const plant = {id:row.plant_id, name:plants.get(row.plant_id)?.name};
  if (row.submission_id) {
    return json({plant, state:row.published_at ? 'published' : 'review',
      name:row.submitted_name, letter:row.submitted_body});
  }
  if (data.action === 'open') {
    return json({plant, state:'draft', name:row.author_name, letter:row.body, version:row.version, expiresAt:row.expires_at});
  }

  const name = textInput(data.name);
  const body = typeof data.letter === 'string' ? data.letter.replace(/\r\n?/g, '\n') : '';
  if (name.length > 100 || body.length > 8000 ||
      (data.action === 'submit' && !letterFields(data))) {
    return json({error:'Use até 100 caracteres no nome e até 8.000 na carta. Preencha os dois para enviar.'}, 400);
  }
  if (data.version !== row.version) {
    return json({error:'O rascunho foi alterado em outra aba. Guarde uma cópia do seu texto antes de atualizar.'}, 409);
  }
  const timestamp = now();
  if (data.action === 'save') {
    const saved = await env.DB.prepare(
      'UPDATE writing_reservations SET author_name=?,body=?,version=version+1 WHERE id=? AND version=? ' +
      'AND expires_at>? AND NOT EXISTS (SELECT 1 FROM letter_submissions WHERE plant_id=?) RETURNING version'
    ).bind(name, body, row.id, row.version, timestamp, row.plant_id).first();
    return saved ? json({state:'draft', version:saved.version}) :
      json({error:'O caderno mudou. Guarde uma cópia do seu texto antes de atualizar.'}, 409);
  }
  const added = await env.DB.prepare(
    'INSERT INTO letter_submissions (id,plant_id,author_name,author_email,body,created_at) ' +
    'SELECT id,plant_id,?,email,?,? FROM writing_reservations WHERE id=? AND version=? AND expires_at>? ' +
    'AND NOT EXISTS (SELECT 1 FROM letter_submissions WHERE plant_id=?) RETURNING id'
  ).bind(name, body.trim(), timestamp, row.id, row.version, timestamp, row.plant_id).first();
  if (added || await env.DB.prepare('SELECT id FROM letter_submissions WHERE id=?').bind(row.id).first()) {
    return json({state:'review'}, added ? 201 : 200);
  }
  return json({error:'O caderno mudou. Guarde uma cópia do seu texto antes de atualizar.'}, 409);
}

const ownerEmail = (env) => emailAddress(env.FLORA_ADMIN_EMAIL);
const sessionDigest = (token) => digest('flora-admin-session:' + token);
const loginDigest = (token) => digest('flora-admin-link:' + token);
const loginSeconds = 15 * 60;

async function isAdmin(env, email) {
  if (!email) return false;
  if (email === ownerEmail(env)) return true;
  const row = await env.DB.prepare('SELECT email FROM moderation_admins WHERE email = ?').bind(email).first();
  return Boolean(row);
}

function sessionToken(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-flora-moderacao=([0-9a-f]{64})(?:;|$)/)?.[1];
}

function sessionCookie(token, maxAge) {
  return cookie + '=' + token + '; Max-Age=' + maxAge + '; Path=/; Secure; HttpOnly; SameSite=Strict';
}

async function loggedIn(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT email FROM moderation_sessions WHERE token_hash = ? AND expires_at > ?'
  ).bind(await sessionDigest(token), now()).first();
  return row && await isAdmin(env, row.email) ? row : null;
}

async function startSession(db, email) {
  const token = random(32);
  await db.batch([
    db.prepare('DELETE FROM moderation_sessions WHERE expires_at <= ?').bind(now()),
    db.prepare('INSERT INTO moderation_sessions (token_hash,email,expires_at) VALUES (?,?,?)')
      .bind(await sessionDigest(token), email, now() + sessionSeconds)
  ]);
  return json({ok:true}, 200, {'Set-Cookie':sessionCookie(token, sessionSeconds)});
}

async function requestLoginLink(request, env) {
  if (!mailEnabled(env)) return json({error:'O envio de links está temporariamente indisponível.'}, 503);
  const data = await readJson(request, 2048);
  const email = emailAddress(data?.email);
  if (!validEmail(email)) return json({error:'Informe um e-mail válido.'}, 400);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!await limit(env, 'admin-request-ip', ip, 15, 900)) {
    return json({error:'Aguarde alguns minutos antes de solicitar outro link.'}, 429);
  }
  const accepted = {ok:true};
  if (!await limit(env, 'admin-request-email', email, 3, 900) || !await isAdmin(env, email)) {
    return json(accepted);
  }

  const token = random(32);
  const tokenHash = await loginDigest(token);
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM moderation_login_links WHERE expires_at <= ?').bind(timestamp),
    env.DB.prepare('DELETE FROM mail_limits WHERE window_end < ?').bind(timestamp),
    env.DB.prepare('INSERT INTO moderation_login_links (token_hash,email,expires_at) VALUES (?,?,?)')
      .bind(tokenHash, email, timestamp + loginSeconds)
  ]);
  const link = new URL('/admin', request.url);
  link.hash = 'entrar=' + token;
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method:'POST', signal:AbortSignal.timeout(8000),
      headers:{'Authorization':'Bearer ' + env.RESEND_API_KEY, 'Content-Type':'application/json',
        'Idempotency-Key':'flora/admin/' + tokenHash},
      body:JSON.stringify({from:env.RESEND_FROM,to:[email],subject:'Seu link de acesso à moderação · Cartas à Flora',
        text:'Abra o painel de moderação: ' + link.href + '\n\n' +
          'O link expira em 15 minutos e só funciona uma vez. Se você não pediu o link, ignore este e-mail.'})
    });
    if (!result.ok) console.warn('Resend recusou o link de moderação. HTTP ' + result.status);
  } catch {
    console.warn('Resend não confirmou o envio do link de moderação.');
  }
  return json(accepted);
}

async function redeemLoginLink(request, env) {
  const data = await readJson(request, 2048);
  if (typeof data?.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) {
    return json({error:'Link inválido. Solicite um novo acesso.'}, 400);
  }
  const row = await env.DB.prepare(
    'DELETE FROM moderation_login_links WHERE token_hash = ? AND expires_at > ? RETURNING email'
  ).bind(await loginDigest(data.token), now()).first();
  if (!row || !await isAdmin(env, row.email)) {
    return json({error:'Este link expirou ou já foi usado. Solicite um novo acesso.'}, 410);
  }
  return startSession(env.DB, row.email);
}

async function access(request, env, action) {
  if (!ownerEmail(env)) return json({error:'Moderação indisponível.'}, 503);
  if (action === 'session' && request.method === 'GET') {
    const session = await loggedIn(request, env);
    return json({loggedIn:Boolean(session), canManageAdmins:session?.email === ownerEmail(env)});
  }
  if (request.method !== 'POST') return json({error:'Método inválido.'}, 405);
  if (action === 'solicitar-link') return requestLoginLink(request, env);
  if (action === 'confirmar-link') return redeemLoginLink(request, env);
  if (action === 'sair') {
    const token = sessionToken(request);
    if (token) await env.DB.prepare('DELETE FROM moderation_sessions WHERE token_hash = ?')
      .bind(await sessionDigest(token)).run();
    return json({ok:true}, 200, {'Set-Cookie':sessionCookie('', 0)});
  }
  return json({error:'Método inválido.'}, 405);
}

async function manageAdmins(request, env) {
  const session = await loggedIn(request, env);
  if (!session || session.email !== ownerEmail(env)) return json({error:'Acesso restrito ao titular.'}, 403);
  if (request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT email FROM moderation_admins ORDER BY added_at, email').all();
    return json({admins:[{email:session.email, owner:true}, ...results.map(({email}) => ({email, owner:false}))]});
  }
  if (request.method !== 'POST') return json({error:'Método inválido.'}, 405);
  const data = await readJson(request, 2048);
  const email = emailAddress(data?.email);
  if (!validEmail(email)) return json({error:'Informe um e-mail válido.'}, 400);
  if (email === session.email) return json({error:'Esse endereço já é o titular do painel.'}, 409);
  const row = await env.DB.prepare(
    'INSERT INTO moderation_admins (email,added_at) VALUES (?,?) ON CONFLICT DO NOTHING RETURNING email'
  ).bind(email, now()).first();
  return row ? json({ok:true}, 201) : json({error:'Esse endereço já tem acesso ao painel.'}, 409);
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
      ({...row, plantName:plants.get(row.plant_id)?.name}))});
  }
  if (id && request.method === 'POST') {
    const data = await readJson(request);
    if (data?.action === 'delete') {
      const [result] = await env.DB.batch([
        env.DB.prepare('DELETE FROM letter_submissions WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM writing_reservations WHERE id = ?').bind(id)
      ]);
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
          return json({published:row.published, waiting:plants.size - row.published, latestPlant:row.latest});
        }
        if (path === '/api/cartas/publicadas' && request.method === 'GET') {
          const {results} = await env.DB.prepare(
            'SELECT plant_id FROM letter_submissions WHERE published_at IS NOT NULL ORDER BY plant_id'
          ).all();
          return json({ids:results.map((row) => row.plant_id)});
        }
        if (path === '/api/cartas/caderno' && request.method === 'POST') return await writingDesk(request, env);
        const publicLetter = path.match(/^\/api\/cartas\/(\d{1,4})$/);
        if (publicLetter) {
          const id = Number(publicLetter[1]);
          if (!plants.has(id)) return json({error:'Planta não encontrada.'}, 404);
          if (request.method === 'GET') return json(await letterState(env, id));
          if (request.method === 'POST') {
            return mailEnabled(env) ? await reserveWriting(request, env, id) : await submit(request, env, id);
          }
          return json({error:'Método inválido.'}, 405);
        }
        const auth = path.match(/^\/api\/moderacao\/(session|solicitar-link|confirmar-link|sair)$/);
        if (auth) return await access(request, env, auth[1]);
        if (path === '/api/moderacao/admins') return await manageAdmins(request, env);
        const admin = path.match(/^\/api\/moderacao\/cartas(?:\/([0-9a-f-]{36}))?$/);
        if (admin) return await moderate(request, env, url, admin[1]);
        return json({error:'Página não encontrada.'}, 404);
      }
      const asset = Object.hasOwn(assets, path) ? assets[path] :
        path === '/' ? assets['/index.html'] :
        path === '/escrever' || path === '/escrever/' ? assets['/caderno.html'] :
        path === '/admin' || path === '/admin/' ? assets['/admin.html'] : null;
      if (!asset || !['GET','HEAD'].includes(request.method)) return new Response('Página não encontrada.', {status:404});
      return new Response(request.method === 'HEAD' ? null : bytes(asset[1]), {headers:{
        'Content-Type':asset[0], 'Cache-Control':'public, max-age=0, must-revalidate',
        'X-Content-Type-Options':'nosniff',
        ...(asset === assets['/caderno.html'] ? {
          'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
          'Content-Security-Policy':"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        } : {}),
        ...(asset === assets['/admin.html'] ? {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer',
          'X-Frame-Options':'DENY',
          'Content-Security-Policy':"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"} : {})
      }});
    } catch {
      return json({error:'O serviço está temporariamente indisponível.'}, 503);
    }
  }
};
