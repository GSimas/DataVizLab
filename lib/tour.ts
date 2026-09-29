import type { Bilingual } from "./catalog";

export type TourStep = {
  id: string;
  /** Screen the step lives on; the tour navigates there first. */
  view?: "home" | "projects" | "studio" | "catalog";
  /** CSS selector of the highlighted element; none = centered card. */
  target?: string;
  title: Bilingual;
  body: Bilingual;
};

const bi = (pt: string, en: string): Bilingual => ({ pt, en });

export const TOUR_DONE_KEY = "datavizlab-tour-done";

export const tourSteps: TourStep[] = [
  { id: "welcome", view: "home", title: bi("Bem-vindo ao DataVizLab", "Welcome to DataVizLab"), body: bi("Um passeio rápido por tudo o que o laboratório faz — cerca de 2 minutos. Use as setas ← → ou os botões; Esc encerra a qualquer momento.", "A quick walk through everything the lab does — about 2 minutes. Use ← → or the buttons; Esc ends it at any time.") },
  { id: "nav", view: "home", target: '[data-tour="nav"]', title: bi("Navegação", "Navigation"), body: bi("Três áreas: Início, Meus projetos (onde você trabalha) e Catálogo (a referência de métodos).", "Three areas: Home, My projects (where you work) and Catalog (the method reference).") },
  { id: "settings", view: "home", target: '[data-tour="settings"]', title: bi("Configurações", "Settings"), body: bi("Idioma, tema claro ou escuro, alto contraste, movimento reduzido e tamanho do texto. Tudo fica salvo neste dispositivo — e o tutorial pode ser refeito por aqui.", "Language, light or dark theme, high contrast, reduced motion and text size. Everything is saved on this device — and you can replay this tour from here.") },
  { id: "home-actions", view: "home", target: '[data-tour="home-actions"]', title: bi("Por onde começar", "Where to start"), body: bi("Abra seus projetos para criar visualizações ou explore o catálogo para escolher a forma certa.", "Open your projects to build visualizations, or explore the catalog to pick the right form.") },
  { id: "new-project", view: "projects", target: '[data-tour="new-project"]', title: bi("Criar projetos", "Create projects"), body: bi("Cada projeto reúne um conjunto de dados e várias visualizações. Comece com uma tabela vazia ou com dados de exemplo — ou importe um ZIP exportado antes.", "Each project holds one dataset and several visualizations. Start with an empty table or sample data — or import a previously exported ZIP.") },
  { id: "project-grid", view: "projects", target: '[data-tour="project-grid"]', title: bi("Seus projetos", "Your projects"), body: bi("Clique num card para abrir o estúdio. Os botões no rodapé renomeiam, duplicam, exportam ou excluem o projeto.", "Click a card to open the studio. The footer buttons rename, duplicate, export or delete the project.") },
  { id: "viz-tabs", view: "studio", target: '[data-tour="viz-tabs"]', title: bi("Várias visualizações", "Several visualizations"), body: bi("Cada aba é uma visualização dos mesmos dados. Crie, duplique ou exclua abas para comparar formas lado a lado.", "Each tab is a visualization of the same data. Create, duplicate or delete tabs to compare forms side by side.") },
  { id: "data", view: "studio", target: '[data-tour="data-panel"]', title: bi("01 · Dados", "01 · Data"), body: bi("Abra CSV, TSV, Excel ou JSON, cole uma tabela ou use o exemplo. A leitura acontece no seu navegador: nada é enviado.", "Open CSV, TSV, Excel or JSON, paste a table or use the sample. Files are read in your browser: nothing is uploaded.") },
  { id: "viz", view: "studio", target: '[data-tour="viz-panel"]', title: bi("02 · Tipo e sugestões", "02 · Type and suggestions"), body: bi("Escolha o tipo numa lista pesquisável — digite para filtrar — ou parta da sua intenção (comparar, distribuição, tempo…) e receba sugestões com grau de compatibilidade.", "Pick the type from a searchable list — type to filter — or start from your intent (compare, distribution, time…) and get suggestions with a fit score.") },
  { id: "mapping", view: "studio", target: '[data-tour="mapping-panel"]', title: bi("03 · Mapeamento e apresentação", "03 · Mapping and presentation"), body: bi("Diga qual coluna vai em cada eixo, série e tamanho. Depois ajuste título, subtítulo, rótulos e padrões acessíveis.", "Choose which column goes on each axis, series and size. Then tune title, subtitle, labels and accessible patterns.") },
  { id: "preview", view: "studio", target: '[data-tour="preview"]', title: bi("Prévia e auditoria", "Preview and audit"), body: bi("O gráfico é interativo. Abaixo, o verificador de integridade aponta riscos de leitura, e você copia um texto alternativo pronto.", "The chart is interactive. Below it, the integrity checker flags readability risks, and you can copy ready-made alt text.") },
  { id: "export", view: "studio", target: '[data-tour="export"]', title: bi("Exportar", "Export"), body: bi("Um só botão: SVG vetorial, JPG com fundo, PNG sem fundo ou o projeto inteiro em ZIP — com prévia e escolha de cores.", "One button: vector SVG, JPG with background, transparent PNG or the whole project as a ZIP — with a preview and color choice.") },
  { id: "table", view: "studio", target: '[data-tour="table"]', title: bi("Tabela editável", "Editable table"), body: bi("Clique numa célula para editar. A linha e a coluna sob o cursor se iluminam em cruz, e colunas de datas ganham um calendário.", "Click a cell to edit it. The row and column under the pointer light up as a crosshair, and date columns get a calendar.") },
  { id: "catalog-tools", view: "catalog", target: '[data-tour="catalog-tools"]', title: bi("Buscar no catálogo", "Search the catalog"), body: bi("Procure por nome, sinônimo ou pergunta, e filtre por família: comparação, distribuição, fluxos, geografia…", "Search by name, synonym or question, and filter by family: comparison, distribution, flows, geography…") },
  { id: "catalog-grid", view: "catalog", target: '[data-tour="catalog-grid"]', title: bi("Fichas de métodos", "Method entries"), body: bi("Cada ficha explica quando usar, quando evitar e quais dados são necessários. De lá, “Usar em um projeto” leva o método direto ao estúdio.", "Each entry explains when to use it, when to avoid it and which data it needs. From there, “Use in a project” takes the method straight to the studio.") },
  { id: "assistant", target: '[data-tour="assistant"]', title: bi("Assistente de IA", "AI assistant"), body: bi("Converse sobre seus dados, peça dicas de visualização e de análise, ou peça ações. Ele é uma IA: você escolhe o provedor e quanto dos dados compartilhar, e toda ação exige sua confirmação.", "Talk about your data, ask for visualization and analysis tips, or request actions. It is an AI: you choose the provider and how much data to share, and every action needs your approval.") },
  { id: "done", title: bi("Pronto para começar", "Ready to go"), body: bi("Esse foi o tour. Você pode refazê-lo quando quiser em Configurações → Tutorial guiado.", "That's the tour. You can replay it anytime from Settings → Guided tour.") },
];
