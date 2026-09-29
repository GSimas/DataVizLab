# DataVizLab

Catálogo bilíngue, recomendador determinístico e estúdio local de visualização de dados. A aplicação ajuda a explorar métodos, escolher uma forma adequada para uma pergunta e gerar visualizações a partir de CSV, TSV, XLS, XLSX ou uma tabela editável — sem enviar os dados brutos para servidores.

## Funcionalidades

- **Meus projetos**: crie, renomeie, duplique, exclua, exporte e importe projetos; cada um reúne um conjunto de dados e várias visualizações;
- 78 métodos documentados em português e inglês, organizados em 10 famílias;
- busca por nome, sinônimo, função e contexto de uso;
- fichas com definição, dados necessários, quando usar e quando evitar;
- recomendador por intenção analítica integrado ao estúdio, com compatibilidade explicada;
- importação local de CSV, TSV, XLS, XLSX, JSON e projetos ZIP;
- colagem de tabelas e editor de células no navegador;
- inferência de campos numéricos, categóricos e temporais;
- estúdio baseado em ECharts com mapeamento de campos e múltiplas famílias;
- auditoria de integridade para excesso de categorias, ausências, negativos e uso inadequado de pizza;
- descrição acessível gerada localmente;
- exportação num único botão: SVG vetorial, JPG com fundo, PNG sem fundo ou projeto completo (ZIP com dados, configuração e SVG de cada visualização), com prévia e escolha de cores;
- persistência local em IndexedDB (projetos da versão anterior em `localStorage` são migrados automaticamente);
- identidade visual Scientata (Manrope, Instrument Serif e DM Mono auto-hospedadas) e interface responsiva;
- menu **Configurações** no cabeçalho: idioma PT/EN, tema claro/escuro, alto contraste, movimento reduzido e tamanho do texto (P/M/G), aplicados antes da primeira pintura;
- sistema de motion (transições entre telas via View Transitions, entrada e saída animadas de modais, menus, dicas e avisos), desligado por completo no modo de movimento reduzido;
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
  ChartRenderer.tsx    Motor de opções e exportação ECharts (paletas validadas)
lib/
  catalog.ts           Taxonomia bilíngue com 78 técnicas
  data.ts              Leitura de arquivos, inferência de colunas e exportação ZIP
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
