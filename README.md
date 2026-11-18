# Cartas à flora brasileira

O guia continua público. O leitor anônimo consulta apenas o estado da ficha e o texto publicado. O endereço do autor e as cartas em revisão ficam no banco D1.

## Envio e moderação

O visitante escreve a carta na ficha da planta. As submissões ficam pendentes no D1 até a moderação. Cada planta pode ter uma carta publicada. Só o nome e o texto aprovados aparecem na ficha.

Em `/admin`, solicite um link com o seu e-mail autorizado. O link expira em 15 minutos e é de uso único. O titular configurado em `FLORA_ADMIN_EMAIL` pode adicionar administradores, que também podem editar, aprovar e excluir cartas.

## Railway e execução local

O serviço roda com Node.js 24. O Dockerfile compila o Worker compartilhado e o adaptador HTTP o executa com SQLite no volume persistente. Monte o volume em `/data`, mantenha uma réplica e use `/healthz` para verificar o serviço.

| Variável | Uso |
| --- | --- |
| `FLORA_PUBLIC_ORIGIN` | URL HTTPS pública do serviço, sem caminho |
| `FLORA_ADMIN_EMAIL` | Conta autorizada a moderar cartas |
| `FLORA_RATE_KEY` | Segredo aleatório para os limites de envio |
| `FLORA_MIGRATION_JSON` | Importação inicial do Sites com as listas `letter_submissions` e `moderation_credentials`. O SQLite registra a importação em uma transação e ignora repetições. |
| `RESEND_API_KEY` | Chave do Resend com permissão de envio |
| `RESEND_FROM` | Remetente autorizado no Resend, por exemplo `Cartas à Flora <cartas@exemplo.org>` |
| `FLORA_DATA_DIR` | Diretório local opcional do SQLite. O padrão local é `.data`. No Railway o volume determina o caminho. |

Instale Node.js 24, configure as variáveis e rode `npm run build` seguido de `npm start`. Sem `FLORA_PUBLIC_ORIGIN`, o endereço local é `http://localhost:8080`. O Railway fornece a porta e o caminho do volume.

Com as duas variáveis de e-mail configuradas, a ficha envia um link privado de reserva para o caderno. A reserva dura sete dias e o rascunho pode ser salvo nesse período. O envio do texto segue para a fila de moderação. Enquanto as variáveis estiverem ausentes, a ficha aceita o formulário direto.

As migrações SQL em `drizzle` são compartilhadas pelas duas hospedagens.

## Buscar imagens botânicas

`python scripts/sync-plant-images.py --id 786 --id 321` pesquisa números do anexo. Sem IDs, a execução busca até 25 fichas novas ou vencidas. Use `--limit` para escolher o tamanho de um lote. O cache local em `.cache-pranchas.json` guarda candidatas, data e falhas por fonte para retomar o trabalho. Use `--refresh` para refazer uma busca por lote.

O importador procura o nome aceito, a grafia da portaria e sinônimos do Jardim Botânico. Consulta Wikimedia Commons, inclusive material da BHL já catalogado lá, Openverse, iNaturalist e GBIF. Também consulta no GBIF conjuntos específicos do Pl@ntNet e de herbários brasileiros. O Smithsonian é consultado quando há uma chave em `SMITHSONIAN_API_KEY`. A BHL entra por mídias catalogadas no Commons. A API direta da BHL requer uma chave separada.

A seleção prioriza gravuras identificadas no título ou na descrição, seguidas de fotografia e exsicata. Exige página de origem, crédito e licença do item (domínio público, CC0, CC BY ou CC BY-SA). Para fotos de ocorrências, cruza o táxon em vez de usar apenas o nome da busca. A página do guia mostra o crédito e a licença ao lado da imagem.

`dist/pranchas.json` tem a primeira candidata por espécie. O guia carrega a imagem da fonte com ligação à página original. Para atualizar o site, publique o manifesto com a rotina normal de build. O catálogo permanece utilizável enquanto a busca roda. Quando uma fonte falha, o script preserva as imagens já selecionadas.
