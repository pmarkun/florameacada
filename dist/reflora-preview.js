const rbImageBase = 'https://jbrj-public.s3-sa-east-1.amazonaws.com/DZI/rb/';
const rbLicense = 'https://creativecommons.org/licenses/by/4.0/';

function refloraImageSource(entry) {
  return 'https://reflora.jbrj.gov.br/reflora/geral/ExibeFiguraFSIUC/ExibeFiguraFSIUC.do?idFigura=' +
    encodeURIComponent(entry[2]);
}

async function drawRefloraPreview(canvas, path) {
  if (!/^(?:[0-9]+\/)+[0-9]+(?:[-_][0-9]+)?$/.test(path)) throw new Error('Imagem inválida');
  const base = rbImageBase + path;
  const signal = AbortSignal.timeout(16000);
  const response = await fetch(base + '.dzi', {signal});
  if (!response.ok) throw new Error('Imagem indisponível');
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const image = xml.documentElement;
  const size = image.firstElementChild;
  const width = Number(size?.getAttribute('Width'));
  const height = Number(size?.getAttribute('Height'));
  const tile = Number(image.getAttribute('TileSize'));
  const overlap = Number(image.getAttribute('Overlap'));
  const format = image.getAttribute('Format');
  if (image.localName !== 'Image' || size?.localName !== 'Size' ||
      ![width, height, tile, overlap].every(Number.isInteger) ||
      Math.min(width, height) < 1 || Math.max(width, height) > 100_000 ||
      tile < 64 || tile > 1024 || overlap < 0 || overlap > 8 || !['jpg', 'png'].includes(format)) {
    throw new Error('Metadados de imagem inválidos');
  }

  const maxLevel = Math.ceil(Math.log2(Math.max(width, height)));
  let level = Math.min(maxLevel, 9);
  let scale, w, h, cols, rows;
  do {
    scale = 2 ** (level - maxLevel);
    w = Math.ceil(width * scale);
    h = Math.ceil(height * scale);
    cols = Math.ceil(w / tile);
    rows = Math.ceil(h / tile);
    if (cols * rows <= 12) break;
    level -= 1;
  } while (level >= 0);
  if (!canvas.isConnected) return;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tiles = Array.from({length:cols * rows}, (_, index) => [index % cols, Math.floor(index / cols)]);
  for (let start = 0; start < tiles.length && canvas.isConnected; start += 4) {
    await Promise.all(tiles.slice(start, start + 4).map(async ([x, y]) => {
      const uri = base + '_files/' + level + '/' + x + '_' + y + '.' + format;
      const result = await fetch(uri, {signal});
      if (!result.ok) throw new Error('Imagem incompleta');
      const bitmap = await createImageBitmap(await result.blob());
      try { ctx.drawImage(bitmap, x * tile - (x ? overlap : 0), y * tile - (y ? overlap : 0)); }
      finally { bitmap.close(); }
    }));
  }
}

function observeRefloraPreview(figure, entry, fallback) {
  const canvas = figure.querySelector('canvas');
  const notice = figure.querySelector('.rb-progress');
  const load = async () => {
    if (!figure.isConnected) return;
    try {
      await drawRefloraPreview(canvas, entry[0]);
      if (!figure.isConnected) return;
      canvas.hidden = false;
      notice.remove();
    } catch {
      if (!figure.isConnected) return;
      if (fallback) fallback();
      else notice.textContent = 'A prévia do acervo não carregou.';
    }
  };
  if (!('IntersectionObserver' in window)) { load(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (!figure.isConnected || entries.some((item) => item.isIntersecting)) {
      observer.disconnect();
      if (figure.isConnected) load();
    }
  }, {rootMargin:'160px'});
  observer.observe(figure);
}
