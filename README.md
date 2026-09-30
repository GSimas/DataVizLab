# DataVizLab

Catálogo bilíngue, recomendador determinístico e estúdio local de visualização de dados. A aplicação ajuda a explorar métodos, escolher uma forma adequada para uma pergunta e gerar visualizações a partir de CSV, TSV, XLS, XLSX ou uma tabela editável — sem enviar os dados brutos para servidores.

## Funcionalidades

- **Meus projetos**: crie, renomeie, duplique, exclua, exporte e importe projetos; cada um reúne um conjunto de dados e várias visualizações;
- 78 métodos documentados em português e inglês, organizados em 10 famílias;
- busca por nome, sinônimo, função e contexto de uso;
- fichas com definição, dados necessários, quando usar e quando evitar;
- recomendador por intenção analítica integrado ao estúdio, com compatibilidade explicada;
- importação local de CSV, TSV, XLS, XLSX, JSON e projetos ZIP;
- colagem de tabelas e editor de células no navegador, com **colunas tipadas**: cada coluna é texto, categoria, inteiro, número, monetário (R$, US$, €, £), percentual, data, horário ou sim/não. Categorias viram uma lista suspensa com opção de criar novas; campos numéricos só aceitam números; datas e horários são validados. Valores fora do formato ficam destacados (com contador na coluna) em vez de serem descartados, e a troca de tipo converte o que for possível. O tipo é inferido ao importar e pode ser alterado no cabeçalho da coluna;
- **exemplos coerentes com cada gráfico**: os 78 gráficos têm um projeto fictício próprio (dispersão recebe duas medidas relacionadas, Sankey recebe fluxos com peso, candlestick recebe preços de abertura, máxima, mínima e fechamento…). “Usar exemplo” carrega o que combina com o gráfico escolhido, e enquanto a tabela ainda é um exemplo intocado, trocar de gráfico troca também o exemplo;
- estúdio baseado em ECharts com mapeamento de campos e múltiplas famílias;
- **mover e aproximar** nos gráficos em que isso ajuda: arraste para mover, roda do mouse (ou pinça) para aproximar e duplo clique para ver o gráfico inteiro. Vale para redes, árvores, treemap, sankey, dispersão e bolhas, séries temporais, Gantt, mapas, empacotamento de círculos, icicle, marimekko, fluxograma e nuvem de palavras. No empacotamento, no icicle e no marimekko o zoom é semântico: o gráfico se redesenha maior, e os rótulos aparecem onde passam a caber;
- **destaque fixo**: clicar numa marca (barra, fatia, ponto, nó…) mantém o destaque dela com o resto esmaecido enquanto o mouse percorre o gráfico; clicar nela de novo, ou numa área vazia, volta ao normal. Nos gráficos em linhas (dumbbell, lollipop, bullet…) a linha inteira fica fixa; no sunburst o clique continua aproximando o ramo;
- **desfazer e refazer** no estúdio (botões no cabeçalho, Ctrl+Z e Ctrl+Y/Ctrl+Shift+Z, ⌘ no Mac): dados, tipos de coluna, campos, tipo de gráfico, títulos e visualizações. Uma sequência rápida de edições, como digitar um valor, é um passo só; trocar de aba não entra no histórico; dentro de um campo de texto o Ctrl+Z continua sendo o do campo;
- **transições** ao mudar dados e parâmetros (campos, categorias, valores, rótulos): as marcas passam do estado anterior ao novo, inclusive nos gráficos desenhados à mão; sankey e mapas de calor fazem uma transição suave de opacidade;
- auditoria de integridade para excesso de categorias, ausências, negativos e uso inadequado de pizza;
- descrição acessível gerada localmente;
- exportação num único botão: SVG vetorial, JPG com fundo, PNG sem fundo ou projeto completo (ZIP com dados, configuração e SVG de cada visualização), com prévia e escolha de cores;
- persistência local em IndexedDB (projetos da versão anterior em `localStorage` são migrados automaticamente);
- identidade visual Scientata (Manrope, Instrument Serif e DM Mono auto-hospedadas) e interface responsiva;
- menu **Configurações** no cabeçalho: idioma PT/EN, tema claro/escuro, alto contraste, movimento reduzido e tamanho do texto (P/M/G), aplicados antes da primeira pintura;
- sistema de motion (transições entre telas via View Transitions, que também suavizam a troca de tema, idioma e tamanho do texto; entrada e saída animadas de modais, menus, dicas e avisos), desligado por completo no modo de movimento reduzido;
- listas de seleção pesquisáveis sempre que há muitas opções, tabela com destaque em cruz (linha × coluna) e fundo animado em todas as telas;
- **Assistente de IA** opcional (botão flutuante): login OpenRouter (OAuth PKCE) ou chave própria (Anthropic, OpenAI, Google Gemini, DeepSeek, Mistral, Groq, xAI); responde sobre os dados dos projetos, dá dicas de visualização e de ciência de dados e propõe ações que só executam após confirmação (com desfazer). Exibe avisos de transparência de IA (ISO/IEC 42001) e de envio de dados ao provedor, com nível de compartilhamento escolhido pelo usuário;
- **tutorial guiado** por todas as telas (oferecido na primeira visita e disponível em Configurações);
- controles próprios no lugar dos nativos: listas de seleção, interruptores, dicas ao passar o mouse, calendário para colunas de data e barras de rolagem;
- nenhum endpoint de upload ou analytics. O assistente de IA, quando usado, fala diretamente do navegador com o provedor escolhido.

## Privacidade

CSV e planilhas são interpretados pelo próprio navegador. A aplicação não possui API de upload. Se você usar o assistente de IA, suas mensagens e — conforme o nível de compartilhamento escolhido (nenhum, estrutura ou completo) — dados dos projetos são enviados diretamente ao provedor de IA escolhido; chaves de API ficam apenas no navegador. O arquivo original, a tabela normalizada e a configuração do gráfico permanecem no dispositivo do usuário.

Projetos salvos no navegador podem ser apagados ao limpar os dados do site ou usar navegação privada. Para portabilidade, utilize **Projeto ZIP**.

## Requisitos

- Node.js 22.13 ou superior;
- npm 10 ou superior;
- `npm run dev` funciona em Windows, macOS e Linux;
- Linux ou WSL com `flock`, `curl` e GNU `timeout` para usar os scripts de build incluídos.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra o endereço informado pelo terminal. As telas usam rotas por hash: `#/` (início), `#/projetos`, `#/projetos/<id>` (estúdio) e `#/catalogo`.

## Testes

```bash
npm run test:unit
```

Cobre a leitura e a validação dos tipos de coluna, a coerência dos exemplos (cada gráfico tem dados do tipo que exige), a renderização dos 78 gráficos em português e inglês, nos temas claro e escuro, o destaque de hover e se as miniaturas pré-renderizadas estão atualizadas. Usa o `tsx` já presente em `node_modules`.

## Desempenho e acessibilidade

A página inicial carrega só o necessário (cerca de 250 KB gzip). O resto chega sob demanda:

- **Estúdio** (ECharts e editor de tabela): baixa ao abrir um projeto, ou antes, quando a visita se encaminha para ele (hover/foco em links do estúdio, ociosidade na tela de projetos).
- **Assistente de IA** (SDK e ferramentas): na primeira abertura. **Tour**: ao começar.
- **Importação** (papaparse, xlsx, jszip): roda num Web Worker (`lib/import.worker.ts`), que lê o arquivo e tipa as colunas fora da thread principal.
- **Miniaturas do catálogo**: SVGs estáticos em `public/thumbs/`, gerados a partir dos gráficos reais. Depois de mudar um gráfico ou um exemplo, rode `npm run thumbs` (o teste unitário avisa se estiverem desatualizadas).
- O ECharts é importado só com as séries e componentes usados (`components/echarts.ts`); um gráfico novo que use outro tipo precisa ser registrado ali.

Medições (precisam do build de produção rodando, por exemplo `npx next build && npx next start --port 5190`, e de Chrome ou Edge instalado):

```bash
npm run analyze
npm run perf:lab -- --mobile
npm run a11y
node scripts/smoke.mjs
```

`analyze` mostra o tamanho do bundle por chunk; `perf:lab` mede LCP, CLS, TBT, a latência de cada interação (INP) e a memória em um Chrome headless (com `--mobile`, CPU 4× mais lenta e 4G lento); `a11y` roda o axe-core (WCAG 2.1 A/AA) em todas as telas e modais, nos dois temas, e confere o foco visível; `smoke.mjs` testa de ponta a ponta as partes carregadas sob demanda.

## Build de produção

```bash
npm run build
```

O build gera um artefato ESM compatível com Cloudflare Workers/Sites em `dist/`, incluindo os arquivos estáticos do cliente.

## Estrutura principal

```text
app/
  globals.css          Design system, temas e responsividade
  layout.tsx           Metadados, SEO e dados estruturados
  page.tsx             Entrada da aplicação
components/
  DataVizLab.tsx       Shell: cabeçalho, rotas por hash, tema, idioma e estado dos projetos
  HomeView.tsx         Tela inicial
  ProjectsView.tsx     Meus projetos (criar, editar, duplicar, excluir, importar)
  StudioView.tsx       Estúdio do projeto: dados, visualizações, recomendador e tabela
  CatalogView.tsx      Catálogo de métodos e fichas
  SettingsMenu.tsx     Configurações (idioma, tema, contraste, movimento, texto)
  Modal.tsx            Modal com foco preso, saída animada e portal
  ExportModal.tsx      Exportação (SVG, JPG, PNG transparente, projeto ZIP) com prévia
  Tour.tsx             Tutorial guiado com holofote
  Ambient.tsx          Fundo animado global
  assistant/           Assistente de IA (painel, loop com confirmação, Markdown)
  ui/                  Select pesquisável, Switch, Segmented, TooltipLayer, DatePicker, posicionamento
  DataTable.tsx        Tabela editável: um editor por tipo de coluna, seletor de tipo no cabeçalho
  ChartRenderer.tsx    Motor de opções e exportação ECharts (paletas validadas)
  chart*.ts            Construtores dos gráficos com lógica própria (boxplot, violino, Gantt, Kagi, Venn…)
  echarts.ts           ECharts com só as séries e componentes usados
  chartNavigation.ts   Mover e aproximar (roam nativo, dataZoom e zoom próprio dos gráficos desenhados à mão)
  MiniViz.tsx          Miniatura de um gráfico (SVG pré-renderizado)
  ErrorBoundary.tsx    Isola falhas (um gráfico, uma tela) com botão de tentar de novo
  lazyView.tsx         Componente carregado sob demanda, com pré-carga e nova tentativa
lib/
  catalog.ts           Taxonomia bilíngue com 78 técnicas
  columns.ts           Tipos de coluna: inferência, leitura, validação, conversão e formatação
  dates.ts             Leitura e formatação de datas (armazenadas como AAAA-MM-DD)
  data.ts              Mapeamentos sugeridos e exportação ZIP
  parse.ts             Leitura de CSV, Excel, JSON e ZIP (usado pelo worker de importação)
  importer.ts          Envia a importação ao worker (com alternativa na thread principal)
  intl.ts              Formatadores Intl compartilhados
  samples/             Projetos fictícios de exemplo, um para cada gráfico
  chartNeeds.ts        Que tipo de campo cada gráfico exige (verificador de integridade)
  projects.ts          Modelo de projeto e persistência em IndexedDB
  prefs.ts             Preferências de exibição e script de aplicação antes da pintura
  motion.ts            Tokens de motion, presença (saída animada) e View Transitions
  export.ts            Renderização fora da tela para exportação
  tour.ts              Passos do tutorial guiado
  ai/                  Provedores, OAuth PKCE, ferramentas do agente e prompt de sistema
  i18n.ts              Textos de interface PT/EN
public/
  favicon.svg
  manifest.webmanifest
  sample-energy.csv
  sw.js                Service worker (páginas pela rede primeiro, arquivos versionados pelo cache)
  thumbs/              Miniaturas geradas por scripts/build-thumbnails.ts
scripts/
  build-thumbnails.ts  Gera as miniaturas do catálogo
  bundle-report.mjs    Relatório do bundle de produção
  perf-lab.mjs         Web Vitals e latência de interação em Chrome headless
  a11y-audit.mjs       Auditoria axe-core (WCAG 2.1 AA) e foco visível
  smoke.mjs            Teste de ponta a ponta do build de produção
```

## Modelos de dados especializados

Algumas visualizações usam contratos próprios:

- Sankey e alluvial: `origem`, `destino`, `peso`;
- redes: `origem`, `destino`, peso opcional;
- mapas de pontos: `longitude`, `latitude`, tamanho opcional;
- candlestick: data, abertura, máxima, mínima e fechamento;
- hierarquias: caminho/categoria e valor;
- heatmap: dimensão X, dimensão Y e valor;
- funil: etapa ordenada e valor.

O atlas documenta técnicas mais amplas do que as opções rápidas do seletor. A arquitetura usa identificadores canônicos, sinônimos e famílias para permitir a adição progressiva de renderizadores especializados sem duplicar conceitos.

## Segurança de arquivos

- macros e scripts de planilhas não são executados;
- o tamanho máximo aceito pela interface é 25 MB;
- a prévia de tabela é limitada para preservar responsividade;
- valores iniciados por `=`, `+`, `-` ou `@` recebem proteção na exportação CSV do projeto;
- textos são tratados como dados e não são inseridos como HTML executável.

## Créditos

Uma aplicação [Scientata](https://scientata.com/).

Referências conceituais: Data Viz Project, The Data Visualisation Catalogue e From Data to Viz. Os textos, exemplos, interface e sistema visual do DataVizLab são originais.
