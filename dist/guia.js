const $ = (id) => document.getElementById(id);
const sections = [...document.querySelectorAll('main > section')];
const official = 'https://dados.mma.gov.br/dataset/41a79b71-445f-4a6a-8c70-d46af991292a/resource/c724ad59-cf6d-4cf8-a513-997e927260e2/download/portaria_gm_mma_1783_2026_dou.pdf';
const mmaNews = 'https://www.gov.br/mma/pt-br/noticias/mma-atualiza-lista-nacional-de-plantas-ameacadas-de-extincao';
const jbrj = 'https://doi.org/10.15468/1mtkaw';
const commons = 'https://commons.wikimedia.org/wiki/File:';
const risks = {
  VU: ['Vulnerável', 'vu', 'Risco elevado de extinção na natureza.'],
  EN: ['Em Perigo', 'en', 'Risco muito elevado de extinção na natureza.'],
  CR: ['Criticamente em Perigo', 'cr', 'Risco extremamente elevado de extinção na natureza.'],
  'CR (PE)': ['Criticamente em Perigo (Possivelmente Extinta)', 'pe', 'Qualificador de CR. Indica possibilidade de extinção e a necessidade de novas buscas em campo.']
};
const features = {
  'Paubrasilia echinata': {
    common: 'Pau-brasil', synonyms: 'Caesalpinia echinata', image: '/plate.webp',
    alt: 'Gravura de ramos, flores e frutos do pau-brasil',
    credit: ['Paul Taubert, 1891 · Domínio público', commons + 'Caesalpinia_echinata_Taub95.png'],
    sections: [
      ['Onde vive', 'Árvore nativa da Mata Atlântica, registrada na faixa costeira entre o Rio Grande do Norte e o Rio de Janeiro.'],
      ['O que mudou', 'Na edição de 2026, o pau-brasil passou de Em Perigo para Criticamente em Perigo. A avaliação científica publicada pelo CNCFlora é de 2024.']
    ], links: [['Avaliação do CNCFlora', 'https://cncflora.jbrj.gov.br/en/taxon/602728'], ['Atualização do MMA', mmaNews]]
  },
  'Cryptanthus capitatus': {
    photoReference: ['Ver foto no acervo da FCBS', 'https://www.fcbs.org/cgi-bin/dbman/db.cgi?db=photo&mh=5&photono=6749&uid=default&view_records=View+Records&ww=on']
  },
  'Euterpe edulis': {
    common: 'Juçara', synonyms: 'palmito-juçara', image: '/jucara.webp',
    alt: 'Palmeira juçara com folhas longas e arqueadas',
    credit: ['João de Deus Medeiros · Wikimedia Commons', commons + 'Euterpe_edulis.jpg'],
    license: ['CC BY 2.0 · imagem redimensionada', 'https://creativecommons.org/licenses/by/2.0/'],
    sections: [
      ['Onde vive', 'A juçara é uma palmeira que ocorre na Mata Atlântica e em áreas vizinhas.'],
      ['Por que está ameaçada', 'A extração predatória do palmito ameaça a espécie. A retirada do palmito mata a planta.']
    ], links: [['Ficha da Embrapa', 'https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1146954/1/EmbrapaFlorestas-2022-Documentos372-atualizado.pdf'], ['Avaliação do CNCFlora', 'https://proflora.jbrj.gov.br/html/Euterpe%20edulis_2012.html']]
  },
  'Plinia rogersiana': {
    sections: [['Onde vive', 'Árvore da Mata Atlântica, do mesmo gênero das jabuticabas, com registro no estado de São Paulo.'], ['O que sabemos', 'A lista de 2026 a classifica como Possivelmente Extinta. Novas buscas em campo podem esclarecer se ainda existe na natureza.']],
    links: [['Atualização do MMA', mmaNews]]
  },
  'Symplocos rizzinii': {
    sections: [['Onde vive', 'Árvore da Mata Atlântica com registros na Serra da Mantiqueira.'], ['O que sabemos', 'A lista de 2026 a classifica como Possivelmente Extinta. Novas buscas em campo podem esclarecer se ainda existe na natureza.']],
    links: [['Atualização do MMA', mmaNews]]
  },
  'Philcoxia minensis': {
    sections: [['Que planta é esta?', 'Planta carnívora brasileira incluída na lista nacional de 2026 na categoria Em Perigo.']],
    links: [['Atualização do MMA', mmaNews]]
  },
  'Paepalanthus rupestris': {
    common: 'Sempre-viva',
    sections: [['Que planta é esta?', 'Uma das plantas conhecidas como sempre-vivas. Entrou na lista nacional de 2026 na categoria Em Perigo.']],
    links: [['Atualização do MMA', mmaNews]]
  }
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = (s) => s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[-–—\s]+/g,' ').trim();
const number = new Intl.NumberFormat('pt-BR');
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem('flora26.' + key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem('flora26.' + key, JSON.stringify(value)); return true; }
  catch { return false; }
};
const rowHash = (id) => '#especie/' + id;
const badge = (risk, full = false) => {
  const [label, cls] = risks[risk];
  return '<span class="badge ' + cls + '" title="' + esc(label) + '"><span class="mark-shape" aria-hidden="true"></span>' +
    (full ? esc(risk + ' · ' + label) : '<span aria-label="' + esc(label) + '">' + esc(risk) + '</span>') + '</span>';
};
const anchor = ([name, url]) => '<a href="' + esc(url) + '">' + esc(name) + '</a>';
const commonName = (id, scientific) => features[scientific]?.common || botany[id]?.popular?.[0];
const entry = (item) => {
  const [id, name, family, risk] = item;
  const common = commonName(id, name);
  const written = publishedPlants?.has(id);
  const letter = publishedPlants ? '<span class="index-letter' + (written ? ' has-letter' : '') + '">' +
    (written ? 'Tem carta' : 'Sem carta') + '</span>' : '';
  return '<li><a class="entry" href="' + rowHash(id) + '"><span><strong>' + (common ? esc(common) : '<i>' + esc(name) + '</i>') +
    '</strong>' + (common ? '<small><i>' + esc(name) + '</i></small>' : '') + '</span><span class="family-name">' +
    esc(family) + '</span><span class="index-status">' + badge(risk) + letter + '</span></a></li>';
};

let publishedPlants = null;
let all = [];
let byId = new Map();
let botany = {};
let botanyReady = false;
let brazilMap = null;
let illustrations = {};
let rbSheets = {};
let filtered = [];
let marks = new Set(read('marks', []));
let limit = 40;
let catalogScroll = 0;
let active = '';
let readerScope = null;
let requestedDirection = 0;
let loading;
let searchTimer;
let installPrompt;
let touchStart;

function loadCatalog() {
  if (loading) return loading;
  const getJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Dados indisponíveis');
    return response.json();
  };
  loading = Promise.all([getJson('/catalogo.json'), getJson('/botanica.json').catch(() => null), getJson('/mapa-brasil.json').catch(() => null), getJson('/pranchas.json?v=2').catch(() => ({})), getJson('/reflora-rb.json?v=1').catch(() => ({}))])
    .then(([rows, data, map, images, sheets]) => {
      illustrations = images;
      rbSheets = sheets;
      brazilMap = map;
      const collator = new Intl.Collator('pt-BR');
      all = rows.sort((a, b) => collator.compare(a[1], b[1]));
      byId = new Map(all.map((row) => [row[0], row]));
      botany = data?.taxons ?? {};
      botanyReady = Boolean(data);
      if (data) {
        const summary = data.resumo;
        $('botany-source').innerHTML = 'A distribuição, os nomes e o perfil botânico vêm do <a href="' + jbrj +
          '">Flora e Funga do Brasil · JBRJ</a>. Dados selecionados e organizados da edição de ' + esc(data.edicao) +
          ', sob <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. ' +
          number.format(summary.vinculados) + ' registros vinculados por nome e família, com resolução de sinônimos.';
      } else {
        $('distribution-note').textContent = 'Os dados de distribuição estão indisponíveis nesta sessão.';
      }
      all.forEach((row) => {
        const f = features[row[1]];
        const profile = botany[row[0]];
        row.search = normalize([row[1], row[2], f?.common, f?.synonyms, profile?.nome,
          ...(profile?.popular ?? []), ...(profile?.sinonimos ?? [])].filter(Boolean).join(' '));
      });
      const families = [...new Set(all.map((row) => row[2]))].sort(collator.compare);
      for (const family of families) $('family').add(new Option(family, family));
      for (const [id, field] of [['domain','dominios'], ['state','uf']]) {
        const values = [...new Set(Object.values(botany).flatMap((profile) => profile[field] ?? []))].sort(collator.compare);
        for (const value of values) $(id).add(new Option(value, value));
        $(id).disabled = !values.length;
      }
      return all;
    }).catch((err) => { loading = null; throw err; });
  return loading;
}

async function loadPublishedPlants() {
  try {
    const result = await fetch('/api/cartas/publicadas', {cache:'no-store', signal:AbortSignal.timeout(5000)});
    if (!result.ok) return;
    const data = await result.json();
    publishedPlants = new Set(data.ids);
    $('letter-filter').disabled = false;
  } catch {
    // The offline catalog still works without live letter status.
  }
}

function renderCatalog(reset = false) {
  if (reset) limit = 40;
  const terms = normalize($('q').value).split(' ').filter(Boolean);
  const risk = $('risk').value;
  const family = $('family').value;
  const domain = $('domain').value;
  const state = $('state').value;
  const letter = $('letter-filter').value;
  filtered = all.filter((item) => (!risk || item[3] === risk || (risk === 'CR' && item[3] === 'CR (PE)')) &&
    (!letter || !publishedPlants || publishedPlants.has(item[0]) === (letter === 'published')) &&
    (!family || item[2] === family) && (!domain || botany[item[0]]?.dominios?.includes(domain)) &&
    (!state || botany[item[0]]?.uf?.includes(state)) && terms.every((term) => item.search.includes(term)));
  $('count').textContent = filtered.length ? number.format(filtered.length) + (filtered.length === 1 ? ' registro' : ' registros') : 'Nenhum registro encontrado. Tente outro termo ou limpe os filtros.';
  $('results').innerHTML = filtered.slice(0, limit).map(entry).join('');
  $('more').hidden = limit >= filtered.length;
  $('retry').hidden = true;
}

function renderMarks() {
  const items = all.filter((item) => marks.has(item[0]));
  $('marks').innerHTML = items.length ? items.map(entry).join('') : '<li><p>Nenhuma página marcada. Use “Marcar” em uma ficha para guardá-la aqui.</p></li>';
}

const lifeForms = {
  'Árvore':'uma árvore', 'Arbusto':'um arbusto', 'Subarbusto':'um arbusto pequeno',
  'Erva':'uma erva', 'Liana/volúvel/trepadeira':'uma trepadeira', 'Suculenta':'uma suculenta',
  'Palmeira':'uma palmeira', 'Bambu':'um bambu', 'Folhosa':'uma planta de aspecto folhoso',
  'Trama':'uma planta que cresce em ramos entrelaçados', 'Dracenóide':'uma planta com folhas reunidas no alto',
  'Tufo':'uma planta que cresce em tufos', 'Talosa':'uma planta de corpo achatado',
  'Coxim':'uma planta que cresce em almofadas', 'Tapete':'uma planta que forma tapetes'
};
const growingPlaces = {
  'Terrícola':'no chão', 'Rupícola':'sobre rochas', 'Epífita':'apoiada em outras plantas',
  'Aquática':'na água', 'Corticícola':'sobre a casca de outras plantas', 'Epífila':'sobre folhas de outras plantas'
};
const specialSubstrates = {
  'Hemiepífita':'Passo parte da vida crescendo sobre outra planta.',
  'Hemiparasita':'Retiro parte do que preciso de outra planta.',
  'Parasita':'Dependo de outra planta para obter o que preciso para crescer.'
};
const domainNames = {
  'Mata Atlântica':'a Mata Atlântica', 'Cerrado':'o Cerrado', 'Amazônia':'a Amazônia',
  'Caatinga':'a Caatinga', 'Pampa':'o Pampa', 'Pantanal':'o Pantanal'
};
const familiarVegetation = {
  'Floresta Ombrófila (= Floresta Pluvial)':'florestas úmidas',
  'Floresta Ombrófila Mista':'matas de araucária', 'Campo rupestre':'campos rochosos',
  'Campo de Altitude':'campos de altitude', 'Campo Limpo':'campos abertos',
  'Floresta Ciliar ou Galeria':'matas à beira de rios', 'Restinga':'restingas',
  'Floresta de Terra Firme':'florestas de terra firme', 'Manguezal':'manguezais',
  'Floresta de Várzea':'florestas de várzea', 'Floresta de Igapó':'florestas de igapó',
  'Palmeiral':'palmeirais', 'Vegetação Sobre Afloramentos Rochosos':'áreas de rocha exposta'
};
const naturalList = (items, last = 'e') => {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length <= 1) return unique[0] || '';
  return unique.slice(0,-1).join(', ') + ' ' + last + ' ' + unique.at(-1);
};

const taxonLink = (profile) => 'https://reflora.jbrj.gov.br/reflora/listaBrasil/FichaPublicaTaxonUC/FichaPublicaTaxonUC.do?id=FB' +
  encodeURIComponent(profile.id);
const taxonName = (name) => name ? '<i>' + esc(name) + '</i>' : '';

function scientificFacts(item, profile) {
  const [id, name, family, risk] = item;
  const feature = features[name];
  const list = (values = []) => esc([...new Set(values.filter(Boolean))].join(', '));
  const endemism = {'Endemica':'Endêmica do Brasil','Não endemica':'Também ocorre fora do Brasil'};
  const accepted = profile?.nome;
  const rows = [
    [accepted ? 'Nome aceito no JBRJ' : 'Nome científico na Portaria', taxonName(accepted || name)],
    ['Autoria botânica', profile?.autoria && esc(profile.autoria)],
    ['Nome na Portaria', accepted && normalize(accepted) !== normalize(name) && taxonName(name)],
    ['Família na Portaria', esc(family)],
    ['Categoria de risco no Brasil', esc(risk + ' · ' + risks[risk][0])],
    ['Nomes populares', list([feature?.common, ...(profile?.popular ?? [])])],
    ['Sinônimos', profile?.sinonimos?.map(taxonName).join(', ')],
    ['Hábito', list(profile?.habito)],
    ['Substrato', list(profile?.substrato)],
    ['Domínios fitogeográficos', list(profile?.dominios)],
    ['Tipos de vegetação', list(profile?.vegetacao)],
    ['Ocorrência nativa por UF', list(profile?.uf?.map((code) => brazilMap?.names?.[code] || code))],
    ['Endemismo', list(profile?.endemismo?.map((value) => endemism[value] || value))],
    ['Identificador no JBRJ', profile?.id && anchor(['FB' + profile.id, taxonLink(profile)])],
    ['Registro no anexo', esc(number.format(id))]
  ];
  return '<dl class="botany-facts">' + rows.filter(([,value]) => value).map(([label,value]) =>
    '<dt>' + esc(label) + '</dt><dd>' + value + '</dd>').join('') + '</dl>' +
    (profile ? '' : '<p class="muted">Ficha disponível com os dados da Portaria. O perfil botânico complementar está indisponível.</p>');
}

function botanicalProfile(profile) {
  if (!profile) return botanyReady ? '<p class="muted">Vínculo com a base botânica em revisão.</p>' : '';
  const forms = [...new Set((profile.habito ?? []).map((form) => lifeForms[form]).filter(Boolean))];
  const domains = naturalList((profile.dominios ?? []).map((domain) => domainNames[domain]).filter(Boolean).map((domain) => 'd' + domain));
  const places = naturalList((profile.substrato ?? []).map((value) => growingPlaces[value]),'ou');
  const habitat = profile.vegetacao?.length === 1 ? familiarVegetation[profile.vegetacao[0]] : '';
  const popular = naturalList(profile.popular ?? []);
  const sentences = [
    forms.length === 1 ? 'Sou ' + forms[0] + (domains ? ' ' + domains : '') + '.' : forms.length > 1 ?
      'Posso crescer como ' + naturalList(forms,'ou') + '.' : '',
    domains && forms.length !== 1 ? 'Faço parte da flora ' + domains + '.' : '',
    places ? 'Cresço ' + places + (habitat ? ', em ' + habitat : '') + '.' : habitat ? 'Cresço em ' + habitat + '.' : '',
    ...(profile.substrato ?? []).map((value) => specialSubstrates[value]).filter(Boolean),
    profile.endemismo?.length === 1 && profile.endemismo[0] === 'Endemica' ? 'Na natureza, só ocorro no Brasil.' :
      profile.endemismo?.length === 1 && profile.endemismo[0] === 'Não endemica' ? 'Também ocorro fora do Brasil.' : '',
  ].filter(Boolean);
  return (sentences.length ? '<p class="botany-story">' + esc(sentences.join(' ')) + '</p>' : '') +
    (popular ? '<p class="botany-story botany-aliases">Também me chamam de ' + esc(popular) + '.</p>' : '') +
    (!sentences.length && !popular ? '<p class="muted">Perfil disponível na fonte botânica.</p>' : '') +
    '<p class="botany-source">' + anchor(['Flora e Funga do Brasil · JBRJ', taxonLink(profile)]) + ' · ' +
    anchor(['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/']) + '</p>';
}

async function checkLiveBotany(item, profile, button, output) {
  const endpoints = 'https://servicos.jbrj.gov.br/v2/flora/taxon/';
  button.disabled = true;
  output.textContent = 'Consultando o Jardim Botânico…';
  try {
    const response = await fetch(endpoints + encodeURIComponent(profile.nome), {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Consulta indisponível');
    const candidates = await response.json();
    const record = candidates.find((item) => String(item.taxon?.taxonid) === profile.id);
    if (!record) {
      output.textContent = 'O JBRJ não retornou o mesmo identificador nesta consulta. A edição local segue disponível.';
      return;
    }
    const strings = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const sources = (record.distribuition ?? []).filter((row) =>
      row.countrycode === 'BR' && row.establishmentmeans === 'Nativa');
    const authorship = record.taxon.scientificnameauthorship || profile.autoria || '';
    const fullName = record.taxon.scientificname || profile.nome;
    const updated = {
      ...profile,
      nome: authorship && fullName.endsWith(' ' + authorship) ? fullName.slice(0, -(authorship.length + 1)) : fullName,
      autoria: authorship,
      popular: strings((record.vernacular_name ?? []).filter((row) => row.language_vernacularname === 'PORTUGUES')
        .map((row) => row.vernacularname)),
      sinonimos: strings((record.resource_relationship ?? []).filter((row) =>
        row.relationshipofresource?.startsWith('Tem como sinônimo')).map((row) => row.scientificname)),
      uf: strings(sources.filter((row) => /^BR-[A-Z]{2}$/.test(row.locationid)).map((row) => row.locationid.slice(3))),
      dominios: strings(sources.flatMap((row) => row.occurrenceremarks?.phytogeographicDomain ?? [])),
      endemismo: strings(sources.map((row) => row.occurrenceremarks?.endemism)),
      habito: record.specie_profile?.lifeForm,
      substrato: record.specie_profile?.habitat,
      vegetacao: record.specie_profile?.vegetationType
    };
    if (button.isConnected) {
      $('botany-profile').innerHTML = botanicalProfile(updated);
      $('scientific-facts').innerHTML = scientificFacts(item, updated);
    }
    output.textContent = 'Perfil consultado agora no JBRJ. O risco oficial continua indicado pela Portaria de 2026.';
  } catch {
    output.textContent = 'A consulta ao JBRJ falhou. Você ainda pode ler os dados da edição local.';
  } finally {
    button.disabled = false;
  }
}


function showLetter(section, id, label, data) {
  if (!section.isConnected) return;
  const page = section.closest('.letter-page');
  const title = page.querySelector('#letter-title');
  const published = data.state === 'published';
  page.classList.toggle('letter-page-invite', !published);
  title.textContent = published ? 'Carta para ' + label : 'Cara ' + label + '…';

  if (published) {
    const paragraphs = data.letter.trim().split(/\n[^\S\n]*\n+/);
    const hasGreeting = /^(cara|caro|querida|querido|olá|oi|prezada|prezado)\b[^\n]{0,100}[,!:]$/iu.test(paragraphs[0]);
    const preview = paragraphs.splice(0, hasGreeting ? 2 : 1);
    const fullLink = new URLSearchParams(location.search).get('carta') === String(id);
    const hasMore = paragraphs.length > 0;
    const collapsed = hasMore && !fullLink;
    const byline = data.author ? '<p class="letter-byline">Por ' + esc(data.author) + '</p>' : '';
    section.innerHTML = byline + '<div class="letter-copy' + (collapsed ? ' is-collapsed' : '') + '">' +
      preview.map((paragraph) => '<p>' + esc(paragraph) + '</p>').join('') +
      (hasMore ? '<div id="letter-full"' + (collapsed ? ' hidden' : '') + '>' +
        paragraphs.map((paragraph, index) => (index === 0 ? '<p tabindex="-1">' : '<p>') +
          esc(paragraph) + '</p>').join('') + '</div>' : '') + '</div>' +
      (hasMore ? '<button type="button" class="letter-toggle" aria-expanded="' + String(!collapsed) +
        '" aria-controls="letter-full">' + (collapsed ? 'Ler mais' : 'Ler menos') + '</button>' : '');

    if (hasMore) {
      const copy = section.querySelector('.letter-copy');
      const toggle = section.querySelector('.letter-toggle');
      const rest = section.querySelector('#letter-full');
      toggle.onclick = () => {
        const expanded = rest.hidden;
        rest.hidden = !expanded;
        copy.classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? 'Ler menos' : 'Ler mais';
        if (expanded) {
          rest.firstElementChild.focus({preventScroll:true});
        } else {
          toggle.scrollIntoView({block:'nearest'});
        }
      };
    }
    if (fullLink) page.scrollIntoView({block:'start'});
    return;
  }

  if (data.state === 'review') {
    section.innerHTML = '<p class="letter-note">Já há uma carta em revisão para esta planta.</p>';
    return;
  }
  if (data.state === 'reserved') {
    section.innerHTML = '<p class="letter-note">Esta planta está reservada. Use o link que recebeu por e-mail para escrever.</p>' +
      '<p class="letter-note reservation-deadline"><time hidden></time></p>';
    showReservationDeadline(section.querySelector('time'), data.expiresAt);
    return;
  } else {
    section.innerHTML = '<button type="button" class="button ink-button">Quero escrever uma carta.</button>';
  }
  const opener = section.querySelector('button');
  opener.onclick = () => openLetterForm(section, id, label, opener, data.reservationByEmail);
}

function openLetterForm(section, id, label, opener, reservationByEmail) {
  const dialog = $('adoption-dialog');
  dialog.innerHTML = '<form method="dialog" class="adoption-close"><button type="submit" aria-label="Fechar">×</button></form>' +
    '<h2 id="adoption-title">Uma carta para ' + esc(label) + '</h2>' +
    '<form class="claim-form">' +
    (reservationByEmail ? '' :
      '<label for="letter-name">Seu nome</label><input id="letter-name" name="name" maxlength="100" autocomplete="name" required>') +
    '<label for="letter-email">Seu e-mail</label><input id="letter-email" type="email" name="email" maxlength="254" autocomplete="email" required>' +
    (reservationByEmail ?
      '<p class="form-note">Você recebe por e-mail o link privado do seu caderno e algumas informações sobre a planta. O link fica disponível por sete dias.</p>' :
      '<label for="letter-body">Sua carta</label><textarea id="letter-body" name="letter" rows="7" maxlength="8000" required></textarea>' +
      '<p class="form-note">A carta passa por moderação. Se for publicada, seu nome aparece junto ao texto. Seu e-mail fica privado.</p>') +
    '<button class="button ink-button" type="submit">' + (reservationByEmail ? 'Enviar link do caderno' : 'Enviar carta') + '</button>' +
    '<p class="claim-status" role="status"></p></form>';
  const form = dialog.querySelector('.claim-form');
  const status = form.querySelector('.claim-status');
  dialog.onclose = () => { if (opener.isConnected) opener.focus(); };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button');
    submit.disabled = true;
    status.textContent = reservationByEmail ? 'Solicitando o link…' : 'Enviando sua carta…';
    try {
      const result = await fetch('/api/cartas/' + id, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const response = await result.json();
      if (!result.ok) {
        status.textContent = response.error || 'Não foi possível enviar. Tente novamente.';
        return;
      }
      if (section.isConnected) {
        section.innerHTML = '<p class="letter-invite" role="status" tabindex="-1">' +
          (reservationByEmail ? 'Confira seu e-mail para abrir o caderno.' : 'Sua carta foi enviada para moderação.') + '</p>' +
          (reservationByEmail ? '<p class="letter-note reservation-deadline"><time hidden></time></p>' : '');
        if (reservationByEmail) {
          showReservationDeadline(section.querySelector('time'), response.expiresAt);
        }
      }
      if (form.isConnected && dialog.open) {
        dialog.close();
        section.querySelector('[role="status"]')?.focus();
      }
    } catch {
      status.textContent = 'Não foi possível confirmar o envio. Confira a conexão e tente novamente.';
    } finally {
      submit.disabled = false;
    }
  };
  dialog.showModal();
  (reservationByEmail ? form.elements.email : form.elements.name).focus();
}

function occurrenceMap(profile) {
  const states = profile?.uf?.filter((code) => brazilMap?.paths[code]);
  if (!states?.length) return '';
  const selected = new Set(states);
  const paths = Object.entries(brazilMap.paths).map(([code, path]) =>
    '<path class="' + (selected.has(code) ? 'occurrence-uf selected' : 'occurrence-uf') + '" d="' + esc(path) + '">' +
    (selected.has(code) ? '<title>' + esc(brazilMap.names[code]) + '</title>' : '') + '</path>').join('');
  const description = 'Ocorrência registrada: ' + states.map((code) => brazilMap.names[code]).join(', ');
  return '<figure class="occurrence-map" title="' + esc(description) + '">' +
    '<svg viewBox="0 0 340 340" role="img" aria-label="' + esc(description) + '">' +
    '<defs><pattern id="map-hatching" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">' +
    '<path d="M0 0v4" stroke="#635a39" stroke-opacity=".13" stroke-width="1"/></pattern></defs>' +
    '<path class="brazil-outline" d="' + esc(brazilMap.outline) + '"/><path class="brazil-hatching" d="' + esc(brazilMap.outline) + '"/>' +
    paths + '</svg><figcaption><span aria-hidden="true"></span> Ocorrência registrada</figcaption></figure>';
}

function riskStamp(risk) {
  const [label, tone] = risks[risk];
  return '<a class="risk-stamp ' + tone + '" href="#riscos" aria-label="' + esc(risk + ' · ' + label + ' · Ver legenda') + '">' +
    '<strong>' + esc(risk) + '</strong><span>' + esc(label) + '</span></a>';
}

async function loadLetter(section,id,label) {
  try {
    const response = await fetch('/api/cartas/' + id,{cache:'no-store',signal:AbortSignal.timeout(6500)});
    if (!response.ok) throw new Error('Carta indisponível');
    const data = await response.json();
    if (!section.isConnected) return;
    showLetter(section,id,label,data);
  } catch {
    if (!section.isConnected) return;
    section.innerHTML = '<p class="letter-note">As cartas estão indisponíveis nesta sessão. <button class="quiet" type="button">Tentar novamente</button></p>';
    section.querySelector('button').onclick = () => loadLetter(section,id,label);
  }
}
const plateViewer = $('plate-viewer');
const viewerMedia = $('plate-viewer-media');
const viewerCredit = $('plate-viewer-credit');
let viewerOpener = null;
let viewerWentFullscreen = false;

function addPlateViewer(figure, image, deepZoom) {
  const button = document.createElement('button');
  button.className = 'plate-enlarge';
  button.type = 'button';
  button.setAttribute('aria-label', 'Ampliar imagem');
  button.title = 'Ampliar imagem';
  for (let corner = 0; corner < 4; corner++) button.append(document.createElement('span'));
  button.addEventListener('click', () => openPlateViewer(figure, image, deepZoom, button));
  figure.append(button);
}

async function openPlateViewer(figure, source, deepZoom, opener) {
  viewerOpener = opener;
  viewerWentFullscreen = false;
  const preview = source.cloneNode();
  if (source instanceof HTMLCanvasElement) preview.getContext('2d').drawImage(source, 0, 0);
  preview.hidden = false;
  viewerMedia.replaceChildren(preview);
  const caption = figure.querySelector('figcaption');
  viewerCredit.replaceChildren(...(caption ? [...caption.childNodes].map((node) => node.cloneNode(true)) : []));
  viewerCredit.hidden = !caption;
  plateViewer.showModal();
  plateViewer.requestFullscreen?.().catch(() => {});

  if (deepZoom) {
    const detail = preview.cloneNode();
    detail.hidden = true;
    viewerMedia.append(detail);
    try {
      await drawRefloraPreview(detail, deepZoom[0], true);
      if (detail.isConnected && plateViewer.open) {
        detail.hidden = false;
        preview.remove();
      }
    } catch {
      detail.remove();
    }
  }
}

$('close-plate').onclick = () => plateViewer.close();
viewerMedia.onclick = (event) => { if (event.target === viewerMedia) plateViewer.close(); };
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === plateViewer) {
    if (!plateViewer.open) document.exitFullscreen().catch(() => {});
    else viewerWentFullscreen = true;
  } else if (viewerWentFullscreen && plateViewer.open) {
    plateViewer.close();
  }
});
plateViewer.addEventListener('close', () => {
  if (document.fullscreenElement === plateViewer) document.exitFullscreen().catch(() => {});
  viewerMedia.replaceChildren();
  viewerCredit.replaceChildren();
  if (viewerOpener?.isConnected) viewerOpener.focus();
  viewerOpener = null;
});

function renderReader(item) {
  const [id, name, family, risk, isNew, review] = item;
  const feature = features[name];
  const pages = readerScope?.pages ?? all;
  let index = pages.findIndex((row) => row[0] === id);
  if (index < 0) { readerScope = null; index = all.findIndex((row) => row[0] === id); }
  const order = readerScope?.pages ?? all;
  const prev = order[index - 1];
  const next = order[index + 1];

  const profile = botany[id];
  const emptyPlate = '<figure class="feature-plate empty-plate" aria-label="Espaço da prancha">' +
    '<figcaption><span>Prancha a ilustrar</span>' +
    (feature?.photoReference ? anchor(feature.photoReference) : '') +
    (profile ? anchor(['Consultar o acervo no Reflora', taxonLink(profile)]) : '') + '</figcaption></figure>';
  const imported = illustrations[id];
  const useImported = imported && (!feature?.image || (imported.kind === 'gravura' && id !== 1705));
  const medium = imported?.kind === 'gravura' ? 'Gravura botânica' :
    imported?.kind === 'herbario' ? 'Exemplar de herbário' : 'Fotografia';
  const importedPlate = useImported ? '<figure class="figure feature-plate"><img alt="' +
    esc(medium + ' de ' + name) + '" src="' + esc(imported.image) + '" referrerpolicy="no-referrer">' +
    '<figcaption><span>' + esc(medium) + ' · ' + esc(imported.source) + '</span><br>' +
    anchor([imported.credit,imported.page]) + ' · ' + anchor([imported.license,imported.license_url]) +
    '</figcaption></figure>' : '';
  const regularPlate = importedPlate || (feature?.image ? '<figure class="figure feature-plate"><img alt="' + esc(feature.alt) + '" src="' + feature.image +
    '"><figcaption>' + anchor(feature.credit) + (feature.license ? '<br>' + anchor(feature.license) : '') + '</figcaption></figure>' : emptyPlate);
  const rb = rbSheets[id];
  const rbCredits = rb ? [['Reflora · Herbário RB · ' + rb[1], refloraImageSource(rb)], ['CC BY 4.0', rbLicense]] : [];
  const useRb = rb && (!feature?.image && (!useImported || imported.kind === 'herbario'));
  const rbPlate = useRb ? '<figure class="figure feature-plate rb-plate"><canvas role="img" hidden aria-label="' +
    esc('Exsicata de ' + name + ', Herbário RB') + '"></canvas><p class="rb-progress">Carregando exemplar de herbário…</p>' +
    '<figcaption>Exemplar de herbário · ' + anchor(rbCredits[0]) + ' · ' + anchor(rbCredits[1]) +
    '</figcaption></figure>' : '';
  const figure = rbPlate || regularPlate;
  const description = feature?.sections?.filter(([title]) => !['Onde vive','O que mudou'].includes(title))
    .map(([title, copy]) => '<h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p>').join('') ?? '';
  const notice = [
    isNew === true ? 'Incluída na lista de 2026 em relação à edição de 2022.' : '',
    isNew === null ? 'O asterisco de inclusão na lista está em conferência.' : '',
    review ? 'A grafia ou família publicada tem divergência entre as transcrições consultadas.' : ''
  ].filter(Boolean).map((note) => '<p class="muted">' + note + '</p>').join('');
  const common = commonName(id, name);
  const label = common || name;
  const back = readerScope?.kind === 'marcadas' ? 'marcadas' : 'indice';
  const map = occurrenceMap(profile);
  const sources = [
    ['Portaria GM/MMA nº 1.783/2026 e anexo oficial', official],
    ...(profile ? [['Ficha do táxon no Flora e Funga do Brasil · JBRJ', taxonLink(profile)],
      ['Base Flora e Funga do Brasil', jbrj]] : [['Consultar Flora e Funga do Brasil · JBRJ', 'https://floradobrasil.jbrj.gov.br/']]),
    ...(feature?.links ?? []),
    ...(feature?.links?.some(([source]) => source.includes('CNCFlora')) ? [] : [['Avaliações e dados de conservação · CNCFlora', 'https://cncflora.jbrj.gov.br/']]),
    ...(map ? [['Malha territorial · IBGE', 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/']] : [])
  ];
  const plateSources = useRb ? rbCredits : useImported ? [[imported.credit,imported.page],[imported.license,imported.license_url]] :
    feature?.image ? [feature.credit, ...(feature.license ? [feature.license] : [])] :
    feature?.photoReference ? [feature.photoReference] : [];
  const notes = '<details class="field-notes"><summary>Informações científicas</summary><div class="notes-body">' +
    '<h3>Ficha científica</h3><div id="scientific-facts">' + scientificFacts(item, profile) + '</div>' + notice +
    description + '<h3>Fontes e links</h3><ul class="science-sources">' +
    sources.map((source) => '<li>' + anchor(source) + '</li>').join('') + '</ul>' +
    (plateSources.length ? '<h3>Créditos da prancha</h3><p class="source-links">' + plateSources.map(anchor).join('') + '</p>' : '') +
    (profile ? '<button class="button outline" id="live-botany" type="button">Consultar dados atuais no JBRJ</button>' +
    '<p class="muted" id="live-botany-status" role="status"></p>' : '') + '</div></details>';

  $('especie').innerHTML =
    '<div class="reader-top"><a href="#' + back + '">← ' + (back === 'marcadas' ? 'Marcadas' : 'Índice') +
    '</a><div class="reader-actions"><button id="mark" class="button outline" aria-pressed="' + marks.has(id) + '">' +
    (marks.has(id) ? 'Marcada' : 'Marcar') + '</button><button id="share" class="button outline">Compartilhar</button></div></div>' +
    '<div class="reader-grid species-spread">' +
    '<header class="letter-heading"><div><p class="overline">CARTAS À FLORA BRASILEIRA</p>' +
    '<h1 tabindex="-1">' + (common ? esc(label) : '<i>' + esc(label) + '</i>') + '</h1>' +
    (common ? '<p class="scientific">' + esc(name) + '</p>' : '') + '</div>' + riskStamp(risk) + '</header>' +
    '<div class="species-reading"><div class="species-botany" id="botany-profile">' + botanicalProfile(profile) + '</div>' +
    '<section class="letter-page" aria-labelledby="letter-title"><span class="letter-ornament" aria-hidden="true">◆</span>' +
    '<h2 id="letter-title">Carta para ' + esc(label) + '</h2><div id="letter-content" aria-live="polite">' +
    '<p class="letter-note">Carregando a carta…</p></div></section>' +
    notes + '</div>' +
    '<div class="species-visual">' + figure + map + '</div></div>' +
    '<nav class="reader-nav" aria-label="Folhear espécies"><button class="button outline" id="prev" ' +
    (prev ? '' : 'disabled') + '>← Anterior</button><span>' + number.format(index + 1) + ' de ' + number.format(order.length) +
    '</span><button class="button outline" id="next" ' + (next ? '' : 'disabled') + '>Próxima →</button></nav>' +
    '<p id="reader-status" class="muted" role="status"></p>';
  function watchImage() {
    const figure = $('especie').querySelector('.feature-plate');
    const image = figure.querySelector('img');
    if (!image) return;
    const ready = () => { if (figure.isConnected) addPlateViewer(figure, image); };
    const failed = () => {
      if (!figure.isConnected || !useImported) return;
      figure.outerHTML = '<figure class="feature-plate empty-plate"><figcaption>' +
        '<span>Imagem indisponível</span>' + anchor(['Ver prancha na fonte',imported.page]) + '</figcaption></figure>';
    };
    if (image.complete) {
      if (image.naturalWidth) ready();
      else failed();
    } else {
      image.addEventListener('load', ready, {once:true});
      image.addEventListener('error', failed, {once:true});
    }
  }
  if (useRb) {
    const rbFigure = $('especie').querySelector('.rb-plate');
    observeRefloraPreview(rbFigure, rb, importedPlate ? () => {
      rbFigure.outerHTML = regularPlate;
      watchImage();
    } : undefined, (canvas) => addPlateViewer(rbFigure, canvas, rb));
  } else {
    watchImage();
  }
  loadLetter($('letter-content'),id,label);
  const liveButton = $('live-botany');
  if (liveButton) liveButton.onclick = () => checkLiveBotany(item, profile, liveButton, $('live-botany-status'));
  if (requestedDirection) {
    $('especie').style.setProperty('--turn', requestedDirection > 0 ? '16px' : '-16px');
    $('especie').classList.remove('turn');
    requestAnimationFrame(() => $('especie').classList.add('turn'));
    requestedDirection = 0;
  }
  document.title = label + ' · Cartas à Flora';
  $('prev').onclick = () => turn(prev, -1);
  $('next').onclick = () => turn(next, 1);
  $('mark').onclick = () => {
    const nextMarks = new Set(marks);
    if (nextMarks.has(id)) nextMarks.delete(id); else nextMarks.add(id);
    if (!write('marks', [...nextMarks])) {
      $('reader-status').textContent = 'O navegador não permitiu guardar a página.';
      return;
    }
    marks = nextMarks;
    $('mark').setAttribute('aria-pressed', marks.has(id));
    $('mark').textContent = marks.has(id) ? 'Marcada' : 'Marcar';
    $('reader-status').textContent = marks.has(id) ? 'Página marcada.' : 'Marcador removido.';
  };
  $('share').onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: label, url: location.href });
      else { await navigator.clipboard.writeText(location.href); $('reader-status').textContent = 'Link copiado.'; }
    } catch (err) {
      if (err.name !== 'AbortError') {
        const field = document.createElement('input');
        field.value = location.href;
        field.readOnly = true;
        field.setAttribute('aria-label', 'Link da ficha');
        $('reader-status').replaceChildren(field);
        field.focus();
        field.select();
      }
    }
  };
}

function turn(item, direction) {
  if (!item) return;
  requestedDirection = direction;
  location.hash = rowHash(item[0]);
}
function showError(section) {
  if (section === 'indice') {
    $('count').textContent = 'O catálogo não carregou.';
    $('retry').hidden = false;
  } else {
    const panel = $(section === 'especie' ? 'especie' : 'marks');
    panel.innerHTML = '<p role="status">O catálogo não carregou. <button class="button outline" id="reload">Tentar novamente</button></p>';
    $('reload').onclick = route;
  }
}
async function loadHomeTotals() {
  const readLink = $('read-a-letter');
  const findLink = $('find-a-plant');
  const status = $('home-status');
  try {
    const response = await fetch('/api/cartas/resumo', {cache:'no-store', signal:AbortSignal.timeout(6500)});
    if (!response.ok) throw new Error('Contagem indisponível');
    const {published, waiting, latestPlant} = await response.json();
    $('published-total').textContent = number.format(published);
    $('waiting-total').textContent = number.format(waiting);
    $('published-label').textContent = published === 1 ? 'carta publicada' : 'cartas publicadas';
    $('waiting-label').textContent = waiting === 1 ? 'planta sem carta' : 'plantas sem carta';
    readLink.hidden = latestPlant === null;
    if (latestPlant !== null) readLink.href = '/?carta=' + latestPlant + rowHash(latestPlant);
    findLink.classList.toggle('gold', latestPlant === null);
    findLink.classList.toggle('cover-search', latestPlant !== null);
    status.textContent = '';
  } catch {
    status.textContent = 'A contagem de cartas está indisponível agora.';
  }
}

function routeKey() { return location.hash.slice(1) || 'capa'; }
async function route() {
  const key = routeKey();
  const [part, idText] = key.split('/');
  if (part === 'conteudo') return;
  if ($('adoption-dialog').open) $('adoption-dialog').close();
  if (plateViewer.open) plateViewer.close();
  const section = sections.some((item) => item.id === part) ? part : 'capa';
  sections.forEach((item) => item.hidden = item.id !== section);
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === section) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  document.title = 'Cartas à Flora · Plantas ameaçadas do Brasil';
  const previous = active;
  active = section;
  if (section !== 'especie' && section !== 'indice' && section !== 'marcadas') readerScope = null;
  if (section === 'especie') $('especie').innerHTML = '<p role="status">Abrindo ficha…</p>';
  if (section === 'indice' && !all.length) $('count').textContent = 'Carregando catálogo…';
  if (['indice', 'especie', 'marcadas'].includes(section)) {
    try { await loadCatalog(); }
    catch { if (routeKey() === key) showError(section); return; }
    if (routeKey() !== key) return;
    if (section === 'indice' || section === 'marcadas') {
      const render = section === 'indice' ? renderCatalog : renderMarks;
      render();
      loadPublishedPlants().then(() => { if (routeKey() === key) render(); });
    }
    if (section === 'especie') {
      const item = byId.get(Number(idText));
      if (item) renderReader(item);
      else $('especie').innerHTML = '<h1>Ficha não encontrada</h1><a href="#indice">Abrir o índice →</a>';
    }
  }
  if (section === 'sobre') loadCatalog().catch(() => {});
  if (section === 'capa') loadHomeTotals();
  const heading = $(section).querySelector('h1');
  if (heading && previous) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  scrollTo(0, section === 'indice' && previous === 'especie' ? catalogScroll : 0);
}

$('search-form').addEventListener('submit', (e) => { e.preventDefault(); if (all.length) renderCatalog(true); });
$('q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (all.length) renderCatalog(true); }, 100); });
['risk','family','domain','state','letter-filter'].forEach((id) => $(id).addEventListener('change', () => { if (all.length) renderCatalog(true); }));
$('clear').onclick = () => { $('search-form').reset(); if (all.length) renderCatalog(true); $('q').focus(); };
$('more').onclick = () => {
  const firstNew = limit;
  limit += 40;
  renderCatalog();
  $('results').children[firstNew]?.querySelector('a').focus({preventScroll:true});
};
$('retry').onclick = route;
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#especie/"]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (link.closest('#results')) {
    catalogScroll = window.scrollY;
    readerScope = {kind:'indice',pages:filtered.slice()};
  } else if (link.closest('#marks')) readerScope = {kind:'marcadas',pages:all.filter((item) => marks.has(item[0]))};
  else readerScope = null;
});
document.addEventListener('keydown', (e) => {
  if ($('adoption-dialog').open || plateViewer.open || active !== 'especie' || e.altKey || e.metaKey || e.ctrlKey || e.target.matches('input,select,textarea')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    $(e.key === 'ArrowLeft' ? 'prev' : 'next')?.click();
  }
});
$('especie').addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  touchStart = e.touches.length === 1 && touch.clientX > 24 && touch.clientX < innerWidth - 24 ? [touch.clientX,touch.clientY] : null;
}, {passive:true});
$('especie').addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart[0];
  const dy = e.changedTouches[0].clientY - touchStart[1];
  touchStart = null;
  if (Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5) $(dx > 0 ? 'prev' : 'next')?.click();
}, {passive:true});
$('especie').addEventListener('touchcancel', () => { touchStart = null; }, {passive:true});
addEventListener('hashchange', route);
$('legend').innerHTML = Object.entries(risks).map(([code, info]) => '<dt>' + badge(code, true) + '</dt><dd>' + esc(info[2]) + '</dd>').join('');
$('official').href = official;
addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; $('install').hidden = false; });
$('install').onclick = async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  $('install').hidden = true;
  await prompt.prompt();
};
addEventListener('appinstalled', () => { $('install').hidden = true; $('offline').textContent = 'Guia instalado.'; });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('offline').textContent = 'Catálogo disponível para leitura offline.';
  }).catch(() => { $('offline').textContent = 'O modo offline não pôde ser ativado neste navegador.'; });
}
route();
