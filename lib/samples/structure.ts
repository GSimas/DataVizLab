import { P, cat, datasetOf, int, num, text, view, type DatasetBuilder, type ViewBuilder } from "./core";

/* Hierarchies and flows: parent–child trees, links with weights, journeys between stages. */

export const datasets: Record<string, DatasetBuilder> = {
  budgetTree: (l) => {
    const tree: Array<[string, Array<[string, number]>]> = [
      [P(l, "Saúde", "Health"), [[P(l, "Atenção básica", "Primary care"), 82], [P(l, "Hospital municipal", "City hospital"), 64], [P(l, "Vigilância sanitária", "Health surveillance"), 12], [P(l, "Farmácia popular", "Public pharmacy"), 18]]],
      [P(l, "Educação", "Education"), [[P(l, "Ensino fundamental", "Elementary school"), 120], [P(l, "Educação infantil", "Early childhood"), 74], [P(l, "Transporte escolar", "School transport"), 26], [P(l, "Alimentação escolar", "School meals"), 31]]],
      [P(l, "Infraestrutura", "Infrastructure"), [[P(l, "Pavimentação", "Road paving"), 58], [P(l, "Drenagem", "Drainage"), 34], [P(l, "Iluminação pública", "Street lighting"), 22], [P(l, "Praças e parques", "Parks and squares"), 14]]],
      [P(l, "Assistência social", "Social assistance"), [["CRAS", 21], [P(l, "Auxílio-aluguel", "Rent support"), 15], [P(l, "Abrigos", "Shelters"), 11]]],
      [P(l, "Cultura", "Culture"), [[P(l, "Teatro municipal", "Municipal theater"), 9], [P(l, "Bibliotecas", "Libraries"), 6], [P(l, "Festivais", "Festivals"), 8]]],
    ];
    return datasetOf("orcamento-municipal.csv", P(l, "Orçamento municipal", "City budget"),
      P(l, "O orçamento de uma prefeitura fictícia em dois níveis: secretarias e, dentro delas, os programas.", "A fictional city budget in two levels: departments and, inside them, their programs."),
      [cat("dept", P(l, "Secretaria", "Department"), tree.map((t) => t[0])), text("program", P(l, "Programa", "Program")), num("amount", P(l, "Valor_milhoes", "Amount_millions"))],
      tree.flatMap(([dept, programs]) => programs.map(([program, amount]) => [dept, program, amount])));
  },

  org: (l) => {
    const root = P(l, "Diretoria Geral", "Executive Board");
    const fin = P(l, "Diretoria Financeira", "Finance Office");
    const ops = P(l, "Diretoria de Operações", "Operations Office");
    const com = P(l, "Diretoria Comercial", "Commercial Office");
    const ppl = P(l, "Diretoria de Pessoas", "People Office");
    return datasetOf("organograma.csv", P(l, "Organograma", "Org chart"),
      P(l, "A estrutura de uma empresa fictícia: quem responde a quem, da diretoria geral às equipes.", "The structure of a fictional company: who reports to whom, from the executive board to the teams."),
      [text("parent", P(l, "Superior", "Reports_to")), text("unit", P(l, "Area", "Unit"))],
      [[root, fin], [root, ops], [root, com], [root, ppl],
        [fin, P(l, "Controladoria", "Controllership")], [fin, P(l, "Tesouraria", "Treasury")],
        [ops, P(l, "Logística", "Logistics")], [ops, P(l, "Produção", "Production")], [ops, P(l, "Qualidade", "Quality")],
        [com, P(l, "Vendas corporativas", "Corporate sales")], [com, P(l, "Vendas no varejo", "Retail sales")], [com, "Marketing"],
        [ppl, P(l, "Recrutamento", "Recruiting")], [ppl, P(l, "Treinamento", "Training")]]);
  },

  clusters: (l) => {
    const all = P(l, "Todos os clientes", "All customers");
    const rec = P(l, "Recorrentes", "Recurring");
    const occ = P(l, "Ocasionais", "Occasional");
    const prem = "Premium";
    const reg = P(l, "Regulares", "Regular");
    const sea = P(l, "Sazonais", "Seasonal");
    return datasetOf("agrupamento-de-clientes.csv", P(l, "Agrupamento de clientes", "Customer clustering"),
      P(l, "Resultado fictício de uma clusterização hierárquica: quais perfis de cliente se unem e a que distância.", "Fictional result of hierarchical clustering: which customer profiles merge and at what distance."),
      [text("parent", P(l, "Grupo", "Group")), text("child", P(l, "Subgrupo", "Subgroup")), num("distance", P(l, "Distancia", "Distance"))],
      [[all, rec, 8.2], [all, occ, 7.9], [rec, prem, 4.1], [rec, reg, 3.6], [occ, sea, 3.2], [occ, P(l, "Novos", "New"), 2.8],
        [prem, P(l, "Premium online", "Premium online"), 1.4], [prem, P(l, "Premium em loja", "Premium in store"), 1.7], [reg, P(l, "Famílias", "Families"), 1.9], [reg, P(l, "Jovens", "Young"), 1.5],
        [sea, P(l, "Fim de ano", "Year-end"), 1.1], [sea, P(l, "Datas promocionais", "Promo dates"), 1.3]]);
  },

  energyFlow: (l) => {
    const source = { hydro: P(l, "Hidrelétrica", "Hydro"), solar: "Solar", wind: P(l, "Eólica", "Wind"), gas: P(l, "Gás natural", "Natural gas") };
    const sector = { home: P(l, "Residências", "Homes"), shops: P(l, "Comércio", "Commerce"), industry: P(l, "Indústria", "Industry") };
    return datasetOf("fluxo-de-energia.csv", P(l, "Fluxo de energia", "Energy flow"),
      P(l, "De onde vem e para onde vai a eletricidade de uma região fictícia, em GWh por ano.", "Where a fictional region's electricity comes from and where it goes, in GWh per year."),
      [cat("from", P(l, "Origem", "Source")), cat("to", P(l, "Destino", "Destination")), int("gwh", P(l, "Energia_GWh", "Energy_GWh"))],
      [[source.hydro, sector.home, 420], [source.hydro, sector.shops, 310], [source.hydro, sector.industry, 640], [source.solar, sector.home, 120], [source.solar, sector.shops, 90], [source.wind, sector.industry, 210], [source.wind, sector.home, 80], [source.gas, sector.industry, 260], [source.gas, sector.shops, 60]]);
  },

  journey: (l) => {
    const entry = { sci: P(l, "Ingresso: Exatas", "Entry: Sciences"), hum: P(l, "Ingresso: Humanas", "Entry: Humanities"), health: P(l, "Ingresso: Saúde", "Entry: Health") };
    const mid = { on: P(l, "Cursando", "Enrolled"), switched: P(l, "Trocou de curso", "Switched program"), paused: P(l, "Trancou", "Paused") };
    const end = { grad: P(l, "Formados", "Graduated"), out: P(l, "Evadidos", "Dropped out") };
    return datasetOf("trajetoria-estudantil.csv", P(l, "Trajetória estudantil", "Student journey"),
      P(l, "Estudantes fictícios de três áreas de ingresso, o que acontece depois de dois anos e como terminam.", "Fictional students from three entry areas, what happens after two years and how they finish."),
      [cat("from", P(l, "Origem", "From")), cat("to", P(l, "Destino", "To")), int("students", P(l, "Estudantes", "Students"))],
      [[entry.sci, mid.on, 210], [entry.sci, mid.switched, 40], [entry.sci, mid.paused, 50], [entry.hum, mid.on, 260], [entry.hum, mid.switched, 55], [entry.hum, mid.paused, 35], [entry.health, mid.on, 190], [entry.health, mid.switched, 20], [entry.health, mid.paused, 30],
        [mid.on, end.grad, 560], [mid.on, end.out, 100], [mid.switched, end.grad, 70], [mid.switched, end.out, 45], [mid.paused, end.grad, 18], [mid.paused, end.out, 97]]);
  },

  migration: (l) => {
    const r = [P(l, "Norte", "North"), P(l, "Nordeste", "Northeast"), P(l, "Sudeste", "Southeast"), P(l, "Sul", "South"), P(l, "Centro-Oeste", "Central-West")];
    const flow = [[0, 42, 58, 12, 36], [31, 0, 210, 34, 88], [24, 96, 0, 72, 91], [9, 14, 66, 0, 45], [18, 27, 74, 21, 0]];
    return datasetOf("migracao-entre-regioes.csv", P(l, "Migração entre regiões", "Migration between regions"),
      P(l, "Quantas pessoas, em milhares, mudaram de uma região para outra num ano, numa federação fictícia.", "How many people, in thousands, moved from one region to another in a year, in a fictional federation."),
      [cat("from", P(l, "Origem", "From"), r), cat("to", P(l, "Destino", "To"), r), int("people", P(l, "Migrantes_mil", "Migrants_thousands"))],
      r.flatMap((from, i) => r.flatMap((to, j) => (i === j ? [] : [[from, to, flow[i][j]]]))));
  },

  collab: (l) => {
    const d = { product: P(l, "Produto", "Product"), eng: P(l, "Engenharia", "Engineering"), design: "Design", data: P(l, "Dados", "Data"), mkt: "Marketing", sales: P(l, "Vendas", "Sales"), support: P(l, "Suporte", "Support"), fin: P(l, "Financeiro", "Finance") };
    return datasetOf("colaboracao-entre-departamentos.csv", P(l, "Colaboração entre departamentos", "Collaboration between departments"),
      P(l, "Quais departamentos de uma empresa fictícia trabalharam juntos em projetos no último ano.", "Which departments of a fictional company worked together on projects last year."),
      [cat("a", P(l, "Departamento_A", "Department_A")), cat("b", P(l, "Departamento_B", "Department_B")), int("projects", P(l, "Projetos_conjuntos", "Joint_projects"))],
      [[d.product, d.eng, 9], [d.product, d.design, 7], [d.product, d.data, 5], [d.product, d.mkt, 4], [d.eng, d.design, 6], [d.eng, d.data, 8], [d.eng, d.support, 3], [d.design, d.mkt, 5], [d.data, d.mkt, 4], [d.data, d.sales, 3], [d.mkt, d.sales, 6], [d.sales, d.support, 4], [d.sales, d.fin, 2], [d.support, d.product, 3], [d.fin, d.data, 2]]);
  },

  coauthors: (l) => datasetOf("coautoria.csv", P(l, "Rede de coautoria", "Co-authorship network"),
    P(l, "Catorze pesquisadores fictícios e quantos artigos escreveram juntos: há grupos coesos e algumas pontes.", "Fourteen fictional researchers and how many papers they wrote together: tight groups and a few bridges."),
    [text("a", P(l, "Pesquisador_A", "Researcher_A")), text("b", P(l, "Pesquisador_B", "Researcher_B")), int("papers", P(l, "Artigos_em_conjunto", "Joint_papers"))],
    [["Ana Lima", "Bruno Costa", 6], ["Ana Lima", "Carla Mendes", 4], ["Ana Lima", "Diego Rocha", 3], ["Bruno Costa", "Carla Mendes", 5], ["Bruno Costa", "Diego Rocha", 2], ["Carla Mendes", "Diego Rocha", 4],
      ["Elisa Prado", "Fábio Nunes", 7], ["Elisa Prado", "Gabriela Reis", 3], ["Elisa Prado", "Hugo Alves", 4], ["Fábio Nunes", "Gabriela Reis", 5], ["Fábio Nunes", "Hugo Alves", 2], ["Gabriela Reis", "Hugo Alves", 3],
      ["Inês Duarte", "João Batista", 5], ["Inês Duarte", "Karina Melo", 4], ["João Batista", "Karina Melo", 3],
      ["Lucas Ferraz", "Marina Sales", 6], ["Lucas Ferraz", "Nuno Barros", 2], ["Marina Sales", "Nuno Barros", 4],
      ["Carla Mendes", "Elisa Prado", 2], ["Diego Rocha", "Inês Duarte", 1], ["Hugo Alves", "Karina Melo", 2], ["Gabriela Reis", "Lucas Ferraz", 1], ["Karina Melo", "Marina Sales", 3], ["Ana Lima", "Nuno Barros", 1]]),

  chapters: (l) => {
    const c = (n: number) => `${P(l, "Cap.", "Ch.")} ${n}`;
    const chain: Array<[number, number, number]> = Array.from({ length: 9 }, (_, i) => [i + 1, i + 2, 4 + ((i * 3) % 5)]);
    const extra: Array<[number, number, number]> = [[1, 4, 2], [2, 6, 3], [1, 9, 1], [3, 8, 2], [4, 10, 3], [5, 9, 2], [2, 10, 1], [6, 10, 4], [1, 7, 2]];
    return datasetOf("referencias-cruzadas.csv", P(l, "Referências cruzadas entre capítulos", "Cross-references between chapters"),
      P(l, "Um livro fictício de dez capítulos: quantas vezes cada capítulo cita outro. A ordem dos capítulos importa.", "A fictional ten-chapter book: how many times each chapter cites another. Chapter order matters."),
      [cat("from", P(l, "Capitulo_origem", "From_chapter"), Array.from({ length: 10 }, (_, i) => c(i + 1))), cat("to", P(l, "Capitulo_citado", "Cited_chapter"), Array.from({ length: 10 }, (_, i) => c(i + 1))), int("cites", P(l, "Citacoes", "Citations"))],
      [...chain, ...extra].map(([a, b, n]) => [c(a), c(b), n]));
  },

  modules: (l) => {
    return datasetOf("dependencias-de-modulos.csv", P(l, "Dependências entre módulos", "Module dependencies"),
      P(l, "Doze módulos de um sistema fictício em três camadas (interface, serviços e dados) e quantas chamadas há entre eles.", "Twelve modules of a fictional system in three layers (interface, services and data) and how many calls go between them."),
      [text("from", P(l, "Modulo_origem", "Source_module")), text("to", P(l, "Modulo_destino", "Target_module")), int("calls", P(l, "Chamadas", "Calls"))],
      [["ui/Login", "svc/Auth", 120], ["ui/Dashboard", "svc/Reports", 80], ["ui/Dashboard", "svc/Notifications", 45], ["ui/Reports", "svc/Reports", 95], ["ui/Settings", "svc/Auth", 30], ["ui/Settings", "svc/Billing", 22],
        ["svc/Auth", "db/Users", 150], ["svc/Auth", "db/Cache", 110], ["svc/Billing", "db/Invoices", 70], ["svc/Billing", "svc/Notifications", 25], ["svc/Reports", "db/Events", 88], ["svc/Reports", "db/Invoices", 40], ["svc/Reports", "db/Cache", 52], ["svc/Notifications", "db/Users", 35], ["svc/Notifications", "db/Events", 28]]);
  },

  supportFlow: (l) => {
    const s = {
      open: P(l, "Abrir chamado", "Open ticket"), sort: P(l, "Classificar", "Triage"), first: P(l, "Resolver no 1º nível", "Solve at level 1"), escalate: P(l, "Escalar ao especialista", "Escalate to specialist"),
      diagnose: P(l, "Diagnosticar", "Diagnose"), fix: P(l, "Corrigir", "Fix"), happy: P(l, "Cliente satisfeito?", "Customer satisfied?"), close: P(l, "Encerrar chamado", "Close ticket"), pending: P(l, "Registrar pendência", "Log pending issue"),
    };
    return datasetOf("fluxo-de-atendimento.csv", P(l, "Fluxo de atendimento", "Support process"),
      P(l, "O caminho de um chamado numa central de suporte fictícia: etapas, decisões e para onde cada uma leva.", "The path of a ticket in a fictional support desk: steps, decisions and where each leads."),
      [text("from", P(l, "De", "From")), text("to", P(l, "Para", "To")), text("condition", P(l, "Condicao", "Condition"))],
      [[s.open, s.sort, ""], [s.sort, s.first, P(l, "Simples", "Simple")], [s.sort, s.escalate, P(l, "Complexo", "Complex")], [s.first, s.happy, ""], [s.escalate, s.diagnose, ""], [s.diagnose, s.fix, ""], [s.fix, s.happy, ""], [s.happy, s.close, P(l, "Sim", "Yes")], [s.happy, s.pending, P(l, "Não", "No")]]);
  },
};

export const views: Record<string, ViewBuilder> = {
  treemap: (l) => view(l, "budgetTree", { x: "dept", y: "amount", s: "program" }, ["Orçamento municipal por secretaria e programa", "City budget by department and program"], ["R$ milhões; a área é o valor", "millions; area is the amount"]),
  sunburst: (l) => view(l, "budgetTree", { x: "dept", y: "amount", s: "program" }, ["Orçamento municipal em anéis", "City budget in rings"], ["anel interno: secretaria; externo: programa", "inner ring: department; outer: program"]),
  "circle-packing": (l) => view(l, "budgetTree", { x: "dept", y: "amount", s: "program" }, ["Orçamento municipal em círculos", "City budget in circles"], ["cada círculo grande é uma secretaria", "each large circle is a department"]),
  icicle: (l) => view(l, "budgetTree", { x: "dept", y: "amount", s: "program" }, ["Orçamento municipal em camadas", "City budget in layers"], ["secretarias em cima, programas embaixo", "departments on top, programs below"]),
  tree: (l) => view(l, "org", { x: "parent", s: "unit" }, ["Organograma da empresa", "Company org chart"], ["quem responde a quem", "who reports to whom"], true),
  dendrogram: (l) => view(l, "clusters", { x: "parent", s: "child", size: "distance" }, ["Agrupamento de clientes por perfil", "Customers grouped by profile"], ["quanto maior a distância, mais diferentes os grupos", "the larger the distance, the more different the groups"], true),
  sankey: (l) => view(l, "energyFlow", { x: "from", y: "gwh", s: "to" }, ["Da fonte ao consumo: fluxo de energia", "From source to use: energy flow"], ["GWh por ano", "GWh per year"]),
  alluvial: (l) => view(l, "journey", { x: "from", y: "students", s: "to" }, ["Trajetória dos estudantes", "Student journeys"], ["de onde entram, o que acontece e como terminam", "where they enter, what happens and how they end"]),
  chord: (l) => view(l, "migration", { x: "from", y: "people", s: "to", size: "people" }, ["Migração entre regiões", "Migration between regions"], ["milhares de pessoas por ano", "thousands of people per year"]),
  "non-ribbon-chord": (l) => view(l, "collab", { x: "a", s: "b" }, ["Quem trabalha com quem", "Who works with whom"], ["projetos conjuntos entre departamentos", "joint projects between departments"]),
  network: (l) => view(l, "coauthors", { x: "a", s: "b", size: "papers" }, ["Rede de coautoria", "Co-authorship network"], ["a espessura indica artigos em conjunto", "thickness shows joint papers"]),
  arc: (l) => view(l, "chapters", { x: "from", s: "to", size: "cites" }, ["Citações entre capítulos", "Citations between chapters"], ["os capítulos seguem a ordem do livro", "chapters follow the book's order"]),
  "edge-bundling": (l) => view(l, "modules", { x: "from", s: "to", size: "calls" }, ["Dependências entre módulos", "Dependencies between modules"], ["chamadas entre interface, serviços e dados", "calls between interface, services and data"]),
  flowchart: (l) => view(l, "supportFlow", { x: "from", s: "to", size: "condition" }, ["Fluxo de atendimento ao cliente", "Customer support process"], ["etapas e decisões de um chamado", "steps and decisions of a ticket"], true),
};
