const deadlineFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle:'long', timeStyle:'short', timeZone:'America/Sao_Paulo'
});

function showReservationDeadline(label, expiresAt, onExpired = () => {}) {
  if (!Number.isFinite(expiresAt)) return () => {};
  const date = new Date(expiresAt * 1000);
  label.dateTime = date.toISOString();
  label.title = 'Até ' + deadlineFormat.format(date) + ' (horário de Brasília)';
  label.hidden = false;

  const unit = (value, singular, plural) => value + ' ' + (value === 1 ? singular : plural);
  let timer;
  function update() {
    if (!label.isConnected) { clearInterval(timer); return; }
    const minutes = Math.ceil((date.getTime() - Date.now()) / 60_000);
    if (minutes < 1) {
      clearInterval(timer);
      label.textContent = 'Prazo da reserva encerrado';
      onExpired();
      return;
    }
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes % 1440 / 60);
    const remainder = minutes % 60;
    const parts = days ? [unit(days, 'dia', 'dias'), hours && unit(hours, 'hora', 'horas')] :
      [hours && unit(hours, 'hora', 'horas'), remainder && unit(remainder, 'minuto', 'minutos')];
    const text = 'Tempo restante para escrever: ' + parts.filter(Boolean).join(' e ');
    if (label.textContent !== text) label.textContent = text;
  }
  timer = setInterval(update, 15_000);
  update();
  return () => clearInterval(timer);
}
