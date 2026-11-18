const $ = (id) => document.getElementById(id);
const notice = $('notice');
const date = new Intl.DateTimeFormat('pt-BR', {dateStyle:'medium', timeStyle:'short', timeZone:'America/Sao_Paulo'});
let published = false;
let page = 0;
let queueLoad = 0;
let linkToken = new URLSearchParams(location.hash.slice(1)).get('entrar');
if (!/^[a-f0-9]{64}$/.test(linkToken ?? '')) linkToken = null;

async function api(path, body) {
  const options = body === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  };
  const response = await fetch('/api/moderacao/' + path, {...options, cache:'no-store'});
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error);
    error.status = response.status;
    throw error;
  }
  return data;
}

function renderLetter(letter) {
  const view = $('letter-card').content.cloneNode(true);
  const link = view.querySelector('.plant');
  link.textContent = letter.plantName;
  link.href = '/#especie/' + letter.plant_id;
  view.querySelector('.submitted-email').textContent = letter.author_email;
  const time = view.querySelector('time');
  const created = new Date(letter.created_at * 1000);
  time.dateTime = created.toISOString();
  time.textContent = date.format(created);
  const form = view.querySelector('form');
  form.elements.name.value = letter.author_name;
  form.elements.letter.value = letter.body;
  form.querySelector('[value="publish"]').hidden = Boolean(letter.published_at);
  const status = form.querySelector('[role="status"]');
  async function change(action) {
    const controls = [...form.querySelectorAll('input,textarea,button')];
    const body = action === 'delete' ? {action} : {...Object.fromEntries(new FormData(form)), action};
    controls.forEach((control) => {control.disabled = true;});
    try {
      await api('cartas/' + letter.id, body);
      if (action === 'edit') {
        status.textContent = 'Edição salva.';
      } else {
        notice.textContent = action === 'publish' ? 'Carta publicada.' : 'Carta excluída.';
        await loadQueue();
        notice.focus();
      }
    } catch (error) {
      if (error.status === 401) {
        await refresh();
        notice.textContent = 'Sua sessão expirou. Entre de novo.';
      } else {
        status.textContent = error.message || 'Não foi possível concluir a ação.';
      }
    } finally {
      controls.forEach((control) => {control.disabled = false;});
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    change(event.submitter?.value || 'edit');
  });
  form.querySelector('.delete-letter').onclick = () => {
    if (window.confirm('Excluir esta carta definitivamente?')) change('delete');
  };
  return view;
}

async function loadQueue() {
  const serial = ++queueLoad;
  $('pending').setAttribute('aria-pressed', String(!published));
  $('published').setAttribute('aria-pressed', String(published));
  try {
    const data = await api('cartas?estado=' + (published ? 'publicadas' : 'pendentes') + '&pagina=' + page);
    if (serial !== queueLoad) return;
    if (!data.letters.length && page > 0) {
      page -= 1;
      return loadQueue();
    }
    $('letters').replaceChildren(...data.letters.map(renderLetter));
    if (!data.letters.length) {
      const empty = document.createElement('p');
      empty.textContent = published ? 'Nenhuma carta publicada.' : 'Nenhuma carta aguardando moderação.';
      $('letters').append(empty);
    }
    $('pagination').hidden = !data.more && page === 0;
    $('previous').disabled = page === 0;
    $('next').disabled = !data.more;
  } catch (error) {
    if (serial !== queueLoad) return;
    if (error.status === 401) await refresh();
    notice.textContent = error.message || 'Não foi possível carregar as cartas.';
  }
}

async function loadAdmins() {
  const {admins} = await api('admins');
  $('admin-list').replaceChildren(...admins.map(({email,owner}) => {
    const item = document.createElement('li');
    item.textContent = email + (owner ? ' · Titular' : '');
    return item;
  }));
}

async function refresh() {
  notice.textContent = '';
  const state = await api('session');
  $('login').hidden = state.loggedIn || Boolean(linkToken);
  $('redeem').hidden = state.loggedIn || !linkToken;
  $('admin-access').hidden = !state.canManageAdmins;
  $('queue').hidden = $('logout').hidden = !state.loggedIn;
  if (state.loggedIn) {
    await loadQueue();
  } else {
    queueLoad += 1;
    $('letters').replaceChildren();
    $('admin-list').replaceChildren();
  }
  if (state.canManageAdmins) {
    await loadAdmins().catch(() => { $('admin-status').textContent = 'Não foi possível carregar os administradores.'; });
  }
}

function clearLink() {
  linkToken = null;
  history.replaceState(null, '', location.pathname + location.search);
}

notice.tabIndex = -1;
$('login-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('solicitar-link', Object.fromEntries(new FormData(form)));
    notice.textContent = 'Se o endereço estiver autorizado, você receberá um link válido por 15 minutos.';
  } catch (error) {
    notice.textContent = error.message || 'Não foi possível solicitar o link.';
  } finally {
    notice.focus();
    button.disabled = false;
  }
};
$('redeem-button').onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('confirmar-link', {token:linkToken});
    clearLink();
    await refresh();
  } catch (error) {
    if (error.status === 400 || error.status === 410) {
      clearLink();
      $('login').hidden = false;
      $('redeem').hidden = true;
    }
    notice.textContent = error.message || 'Não foi possível entrar.';
    notice.focus();
  } finally {
    button.disabled = false;
  }
};
$('admin-form').onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = $('admin-status');
  button.disabled = true;
  try {
    await api('admins', Object.fromEntries(new FormData(form)));
    form.reset();
    status.textContent = 'Administrador adicionado.';
    await loadAdmins();
  } catch (error) {
    status.textContent = error.message || 'Não foi possível atualizar os administradores.';
  } finally {
    button.disabled = false;
  }
};
$('logout').onclick = async () => {
  try {
    await api('sair', {});
    if (linkToken) clearLink();
    await refresh();
  } catch (error) {
    notice.textContent = error.message || 'Não foi possível sair.';
  }
};
$('pending').onclick = () => { published = false; page = 0; loadQueue(); };
$('published').onclick = () => { published = true; page = 0; loadQueue(); };
$('previous').onclick = () => { page -= 1; loadQueue(); };
$('next').onclick = () => { page += 1; loadQueue(); };
refresh().catch(() => { notice.textContent = 'A moderação está temporariamente indisponível.'; });
