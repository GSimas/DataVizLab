# DataVizLab

Catálogo bilíngue, recomendador determinístico e estúdio local de visualização de dados. A aplicação ajuda a explorar métodos, escolher uma forma adequada para uma pergunta e gerar visualizações a partir de CSV, TSV, XLS, XLSX ou uma tabela editável — sem enviar os dados brutos para servidores.

## Funcionalidades

- 78 métodos documentados em português e inglês, organizados em 10 famílias;
- busca por nome, sinônimo, função e contexto de uso;
- fichas com definição, dados necessários, quando usar e quando evitar;
- recomendador por intenção analítica com compatibilidade explicada;
- importação local de CSV, TSV, XLS, XLSX, JSON e projetos ZIP;
- colagem de tabelas e editor de células no navegador;
- inferência de campos numéricos, categóricos e temporais;
- estúdio baseado em ECharts com mapeamento de campos e múltiplas famílias;
- auditoria de integridade para excesso de categorias, ausências, negativos e uso inadequado de pizza;
- descrição acessível gerada localmente;
- exportação PNG, SVG, ZIP de projeto, CSV e JSON;
- persistência local opcional via `localStorage`;
- modo claro/escuro, redução de movimento e interface responsiva;
- botão PT/EN no cabeçalho;
- nenhum endpoint de upload ou analytics.

## Privacidade

CSV e planilhas são interpretados pelo próprio navegador. A aplicação não possui API de upload. O arquivo original, a tabela normalizada e a configuração do gráfico permanecem no dispositivo do usuário.

Projetos salvos no navegador podem ser apagados ao limpar os dados do site ou usar navegação privada. Para portabilidade, utilize **Projeto ZIP**.

## Requisitos

- Node.js 22.13 ou superior;
- npm 10 ou superior;
- Linux ou WSL com `flock`, `curl` e GNU `timeout` para usar os scripts de build incluídos.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra o endereço informado pelo terminal.

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
  ChartRenderer.tsx    Motor de opções e exportação ECharts
  DataVizLab.tsx       Atlas, recomendador, estúdio e editor
lib/
  catalog.ts           Taxonomia bilíngue com 78 técnicas
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
