const get = (id) => document.getElementById(id);
const token = location.hash.slice(1);
const form = get('write');
const letter = get('letter');
const author = get('author');
const status = get('writing-status');
const notice = get('notice');
const save = get('save');
const submit = get('submit');
let version;
let savedText = '';
let savedName = '';
let expired = false;
let stopDeadline = () => {};

async function desk(action, values = {}) {
  const response = await fetch('/api/cartas/caderno', {
    method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
    signal:AbortSignal.timeout(10_000), body:JSON.stringify({token, action, ...values})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'O caderno está indisponível.');
  return data;
}

function warnUnsaved(event) {
  event.preventDefault();
  event.returnValue = true;
}
function updateWarning() {
  if (letter.value !== savedText || author.value !== savedName) {
    addEventListener('beforeunload', warnUnsaved);
  } else {
    removeEventListener('beforeunload', warnUnsaved);
  }
}

function submitted(state) {
  stopDeadline();
  get('deadline').hidden = true;
  removeEventListener('beforeunload', warnUnsaved);
  letter.readOnly = true;
  author.readOnly = true;
  save.hidden = submit.hidden = get('hint').hidden = true;
  status.textContent = '';
  const published = state === 'published';
  const title = get('confirmation-title');
  title.textContent = published ? 'Sua carta foi publicada!' : 'Sua carta foi enviada!';
  get('confirmation-message').textContent = published ? 'Ela já pode ser lida no guia.' :
    'Ela foi recebida e está na fila de revisão editorial. Você pode reabrir este caderno pelo link do e-mail para acompanhar.';
  const link = get('confirmation-link');
  link.href = get('back').href;
  if (published) {
    const url = new URL(link.href);
    url.searchParams.set('carta', url.hash.split('/').at(-1));
    link.href = url.href;
    link.textContent = 'Ler sua carta no guia';
  }
  get('confirmation').hidden = false;
  title.focus();
}

async function persist(action) {
  if (expired) return;
  if (action === 'submit' && (!letter.value.trim() || !author.value.trim())) {
    status.textContent = 'Preencha o texto e a assinatura antes de enviar.';
    (letter.value.trim() ? author : letter).focus();
    return;
  }
  save.disabled = submit.disabled = true;
  letter.readOnly = author.readOnly = true;
  status.textContent = action === 'save' ? 'Salvando…' : 'Enviando sua carta para revisão…';
  if (action === 'submit') submit.textContent = 'Enviando…';
  try {
    const data = await desk(action, {name:author.value, letter:letter.value, version});
    if (data.state === 'draft') {
      version = data.version;
      savedText = letter.value;
      savedName = author.value;
      updateWarning();
      status.textContent = 'Rascunho salvo. Volte por este link quando quiser continuar.';
    } else {
      submitted(data.state);
    }
  } catch (error) {
    status.textContent = error.message === 'Failed to fetch' || error.name === 'TimeoutError' ?
      'Não foi possível confirmar. Confira a conexão e tente novamente.' : error.message;
  } finally {
    if (!save.hidden) letter.readOnly = author.readOnly = false;
    save.disabled = submit.disabled = expired;
    submit.textContent = 'Enviar para publicação';
  }
}

async function openDesk() {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    notice.textContent = 'Abra o caderno pelo link que você recebeu por e-mail.';
    return;
  }
  try {
    const data = await desk('open');
    get('plant').textContent = data.plant.name;
    get('back').href = '/#especie/' + data.plant.id;
    get('back').textContent = '← Ficha da planta';
    document.title = 'Caderno para ' + data.plant.name + ' · Cartas à Flora';
    version = data.version;
    savedText = letter.value = data.letter;
    savedName = author.value = data.name;
    notice.hidden = true;
    form.hidden = false;
    if (data.state !== 'draft') {
      submitted(data.state);
    } else {
      stopDeadline = showReservationDeadline(get('deadline'), data.expiresAt, () => {
        expired = true;
        save.disabled = submit.disabled = true;
        status.textContent = 'O prazo terminou. Você ainda pode copiar o texto desta página.';
      });
    }
  } catch (error) {
    notice.textContent = error.message === 'Failed to fetch' || error.name === 'TimeoutError' ?
      'O caderno não carregou. Confira a conexão e atualize a página.' : error.message;
  }
}
form.addEventListener('input', updateWarning);
save.onclick = () => persist('save');
form.onsubmit = (event) => {event.preventDefault(); persist('submit');};
openDesk();
