const $ = (id) => document.getElementById(id);
const notice = $('notice');
const date = new Intl.DateTimeFormat('pt-BR', {dateStyle:'medium', timeStyle:'short', timeZone:'America/Sao_Paulo'});
let published = false;
let page = 0;
let queueLoad = 0;
let standalone = false;

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

function bindForm(form, path) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter || form.querySelector('button');
    button.disabled = true;
    try {
      await api(path, Object.fromEntries(new FormData(form)));
      form.reset();
      await refresh();
    } catch (error) {
      notice.textContent = error.message || 'O serviço está indisponível.';
    } finally {
      button.disabled = false;
    }
  });
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

async function refresh() {
  notice.textContent = '';
  const state = await api('session');
  standalone = state.standalone;
  $('login').hidden = state.loggedIn || state.canSetPassword;
  $('sites-signin').hidden = standalone;
  $('password-title').textContent = state.loggedIn ? 'Alterar senha de moderação' : 'Definir senha de moderação';
  $('password-proof').hidden = !standalone;
  $('proof').required = standalone;
  $('proof-label').textContent = state.activation ? 'Código de ativação' : 'Senha atual';
  $('proof').autocomplete = state.activation ? 'off' : 'current-password';
  $('password-setup').hidden = !state.canSetPassword;
  $('password-setup').open = !state.loggedIn && state.canSetPassword;
  $('queue').hidden = $('logout').hidden = !state.loggedIn;
  if (state.loggedIn) {
    await loadQueue();
  } else {
    queueLoad += 1;
    $('letters').replaceChildren();
  }
}

notice.tabIndex = -1;
bindForm($('login-form'), 'entrar');
bindForm($('password-form'), 'senha');
$('logout').onclick = async () => {
  try {
    await api('sair', {});
    if (standalone) await refresh();
    else location.href = '/signout-with-chatgpt?returnTo=%2Fadmin';
  } catch (error) {
    notice.textContent = error.message || 'Não foi possível sair.';
  }
};
$('pending').onclick = () => { published = false; page = 0; loadQueue(); };
$('published').onclick = () => { published = true; page = 0; loadQueue(); };
$('previous').onclick = () => { page -= 1; loadQueue(); };
$('next').onclick = () => { page += 1; loadQueue(); };
refresh().catch(() => { notice.textContent = 'A moderação está temporariamente indisponível.'; });
