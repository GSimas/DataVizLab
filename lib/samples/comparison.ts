import { P, MONTHS, cat, datasetOf, flag, int, money, num, pct, rng, round, text, view, type DatasetBuilder, type ViewBuilder } from "./core";

/* Comparison, composition and finance: rankings, groups, parts of a whole, bridges and funnels. */

export const datasets: Record<string, DatasetBuilder> = {
  energy: (l) => {
    const districts = ["Centro", "Lagoa", "Trindade", "Ribeirão", "Ingleses", "Campeche"];
    const sources = [P(l, "Solar", "Solar"), P(l, "Eólica", "Wind"), P(l, "Biogás", "Biogas")];
    const mwh = [[184, 238, 71], [142, 121, 196], [214, 286, 64], [171, 93, 126], [229, 262, 88], [248, 134, 207]];
    return datasetOf("energia-comunitaria.csv", P(l, "Energia comunitária", "Community energy"),
      P(l, "Geração de energia renovável em seis bairros, por fonte: solar, eólica e biogás.", "Renewable generation in six districts, by source: solar, wind and biogas."),
      [cat("district", P(l, "Bairro", "District"), districts), cat("source", P(l, "Fonte", "Source"), sources), num("mwh", P(l, "Geracao_MWh", "Generation_MWh")), num("kw", P(l, "Capacidade_kW", "Capacity_kW")), num("co2", P(l, "Impacto_tCO2", "Impact_tCO2"))],
      districts.flatMap((district, i) => sources.map((source, j) => [district, source, mwh[i][j], round(mwh[i][j] * 0.66), round(mwh[i][j] * 0.1715, 1)])));
  },

  courses: (l) => datasetOf("matriculas-por-curso.csv", P(l, "Matrículas por curso", "Enrollments by program"),
    P(l, "Um instituto fictício com dez cursos de graduação: quantos estudantes cada um tem hoje.", "A fictional institute with ten undergraduate programs: how many students each one has today."),
    [text("course", P(l, "Curso", "Program")), int("enrolled", P(l, "Matriculas", "Enrollments"))],
    [[P(l, "Engenharia de Software", "Software Engineering"), 1240], [P(l, "Administração", "Business Administration"), 1105], [P(l, "Enfermagem", "Nursing"), 968], [P(l, "Direito", "Law"), 902], [P(l, "Ciência de Dados", "Data Science"), 871], [P(l, "Psicologia", "Psychology"), 803], [P(l, "Arquitetura e Urbanismo", "Architecture and Urban Planning"), 690], [P(l, "Design Gráfico", "Graphic Design"), 574], [P(l, "Educação Física", "Physical Education"), 512], [P(l, "Biblioteconomia e Gestão da Informação", "Library and Information Management"), 218]]),

  revenue: (l) => datasetOf("receita-mensal.csv", P(l, "Receita mensal", "Monthly revenue"),
    P(l, "Uma loja online fictícia: a receita de cada mês do ano, com pico nas vendas de fim de ano.", "A fictional online shop: revenue for each month of the year, peaking with year-end sales."),
    [cat("month", P(l, "Mês", "Month"), MONTHS[l]), money("revenue", P(l, "Receita", "Revenue"), l === "pt" ? "BRL" : "USD")],
    [118400, 121900, 134200, 129800, 141500, 152300, 148900, 157600, 163400, 171200, 189800, 214500].map((value, i) => [MONTHS[l][i], value])),

  service: (l) => datasetOf("satisfacao-servicos.csv", P(l, "Satisfação com serviços públicos", "Satisfaction with public services"),
    P(l, "Pesquisa fictícia com moradores: nota média de 0 a 10 para doze serviços da cidade.", "Fictional resident survey: average score from 0 to 10 for twelve city services."),
    [text("service", P(l, "Servico", "Service")), num("score", P(l, "Nota_media", "Average_score"))],
    [[P(l, "Parques e praças", "Parks and squares"), 8.1], [P(l, "Coleta de lixo", "Garbage collection"), 7.9], [P(l, "Educação infantil", "Early childhood education"), 7.6], [P(l, "Iluminação pública", "Street lighting"), 7.2], [P(l, "Limpeza urbana", "Street cleaning"), 7.0], [P(l, "Atendimento 156", "Citizen hotline"), 6.6], [P(l, "Saúde (UBS)", "Primary health care"), 6.4], [P(l, "Transporte coletivo", "Public transport"), 5.8], [P(l, "Ciclovias", "Bike lanes"), 5.5], [P(l, "Segurança", "Public safety"), 5.1], [P(l, "Pavimentação", "Road paving"), 4.9], [P(l, "Drenagem", "Drainage"), 4.3]]),

  schools: (l) => {
    const before = P(l, "Antes do programa", "Before the program");
    const after = P(l, "Depois do programa", "After the program");
    const data: Array<[string, number, number]> = [["EMEF Vila Nova", 4.2, 5.9], ["Escola do Campo Ipê", 3.9, 5.5], ["Colégio Alvorada", 4.8, 6.2], ["Escola Municipal Aurora", 5.1, 6.4], ["Escola Estadual Pinheiros", 5.9, 6.5], ["EMEF Beira-Mar", 5.5, 6.1], ["Colégio Horizonte", 6.0, 6.7], ["CEI Girassol", 6.3, 6.8]];
    return datasetOf("desempenho-das-escolas.csv", P(l, "Desempenho das escolas", "School performance"),
      P(l, "Oito escolas fictícias avaliadas antes e depois de um programa de reforço escolar.", "Eight fictional schools assessed before and after a tutoring program."),
      [text("school", P(l, "Escola", "School")), cat("phase", P(l, "Momento", "Moment"), [before, after]), num("score", P(l, "Nota_media", "Average_score"))],
      data.flatMap(([school, a, b]) => [[school, before, a], [school, after, b]]));
  },

  kpis: (l) => datasetOf("indicadores-e-metas.csv", P(l, "Indicadores e metas", "KPIs and targets"),
    P(l, "Seis indicadores de uma empresa fictícia, todos numa escala de 0 a 10, cada um com sua meta.", "Six KPIs of a fictional company on a 0–10 scale, each with its target."),
    [text("kpi", P(l, "Indicador", "Indicator")), num("actual", P(l, "Realizado", "Actual")), num("target", P(l, "Meta", "Target"))],
    [[P(l, "Satisfação do cliente", "Customer satisfaction"), 8.1, 8.5], [P(l, "Qualidade do produto", "Product quality"), 9.0, 8.8], [P(l, "Prazo de entrega", "Delivery time"), 7.4, 8.0], [P(l, "Segurança da informação", "Information security"), 9.4, 9.5], [P(l, "Atendimento", "Support"), 6.8, 7.5], [P(l, "Eficiência de custos", "Cost efficiency"), 8.2, 8.0]]),

  temps: (l) => {
    const low = P(l, "Mínima", "Low");
    const high = P(l, "Máxima", "High");
    const data: Array<[string, number, number]> = [["Porto Alegre", 9, 19], ["Curitiba", 7, 18], ["Florianópolis", 12, 21], ["São Paulo", 12, 22], ["Brasília", 12, 27], ["Rio de Janeiro", 18, 26], ["Salvador", 21, 27], ["Manaus", 23, 31]];
    return datasetOf("amplitude-termica.csv", P(l, "Amplitude térmica em julho", "July temperature range"),
      P(l, "Temperaturas mínima e máxima médias de julho em oito capitais (valores fictícios).", "Average July low and high temperatures in eight cities (fictional values)."),
      [cat("city", P(l, "Cidade", "City")), cat("stat", P(l, "Medida", "Measure"), [low, high]), num("temp", P(l, "Temperatura_C", "Temperature_C"))],
      data.flatMap(([city, a, b]) => [[city, low, a], [city, high, b]]));
  },

  returns: (l) => datasetOf("devolucoes.csv", P(l, "Devoluções de pedidos", "Order returns"),
    P(l, "Motivos de devolução numa loja online fictícia: poucas causas concentram a maior parte dos casos.", "Return reasons at a fictional online shop: a few causes account for most cases."),
    [text("cause", P(l, "Motivo", "Reason")), int("count", P(l, "Ocorrencias", "Occurrences"))],
    [[P(l, "Produto danificado", "Damaged product"), 412], [P(l, "Atraso na entrega", "Late delivery"), 268], [P(l, "Item diferente do pedido", "Wrong item"), 147], [P(l, "Tamanho inadequado", "Wrong size"), 96], [P(l, "Arrependimento", "Changed mind"), 61], [P(l, "Defeito de fabricação", "Manufacturing defect"), 38], [P(l, "Embalagem violada", "Tampered packaging"), 22], [P(l, "Outros", "Other"), 14]]),

  approval: (l) => {
    const clients = P(l, "Clientes", "Customers");
    const others = P(l, "Não clientes", "Non-customers");
    const data: Array<[string, number, number]> = [[P(l, "Atendimento", "Support"), 82, 61], [P(l, "Preço", "Price"), 64, 72], [P(l, "Prazo de entrega", "Delivery time"), 71, 58], [P(l, "Qualidade do produto", "Product quality"), 88, 70], [P(l, "Embalagem", "Packaging"), 76, 66], [P(l, "Pós-venda", "After-sales"), 69, 49], [P(l, "Facilidade de compra", "Ease of purchase"), 85, 63]];
    return datasetOf("aprovacao-por-area.csv", P(l, "Aprovação por área", "Approval by area"),
      P(l, "Pesquisa fictícia: percentual que avalia positivamente cada área, entre clientes e quem nunca comprou.", "Fictional survey: share rating each area positively, among customers and people who never bought."),
      [text("area", P(l, "Area", "Area")), cat("group", P(l, "Grupo", "Group"), [clients, others]), pct("rate", P(l, "Aprovacao_pct", "Approval_pct"))],
      data.flatMap(([area, a, b]) => [[area, clients, a], [area, others, b]]));
  },

  rain: (l) => datasetOf("chuva-mensal.csv", P(l, "Chuva ao longo do ano", "Rainfall through the year"),
    P(l, "Precipitação mensal de uma cidade litorânea fictícia: um ciclo anual com verão chuvoso.", "Monthly rainfall in a fictional coastal city: an annual cycle with a rainy summer."),
    [cat("month", P(l, "Mês", "Month"), MONTHS[l]), num("mm", P(l, "Precipitacao_mm", "Rainfall_mm"))],
    [260, 240, 210, 130, 110, 90, 95, 100, 150, 160, 170, 210].map((value, i) => [MONTHS[l][i], value])),

  mobility: (l) => {
    const modes = [P(l, "Carro", "Car"), P(l, "Ônibus", "Bus"), P(l, "Moto", "Motorbike"), P(l, "Bicicleta", "Bicycle"), P(l, "A pé", "Walking")];
    const trips: Array<[string, number[]]> = [["Curitiba", [620, 540, 90, 45, 210]], ["Recife", [480, 610, 130, 22, 260]], ["Goiânia", [710, 330, 160, 30, 150]], ["Belém", [340, 520, 110, 18, 280]], ["Campinas", [690, 380, 100, 50, 160]]];
    return datasetOf("viagens-por-modal.csv", P(l, "Viagens diárias por modal", "Daily trips by mode"),
      P(l, "Cinco cidades fictícias e o número de viagens diárias em cada meio de transporte.", "Five fictional cities and their daily trips by transport mode."),
      [cat("city", P(l, "Cidade", "City")), cat("mode", P(l, "Modal", "Mode"), modes), int("trips", P(l, "Viagens_mil", "Trips_thousands"))],
      trips.flatMap(([city, values]) => modes.map((mode, i) => [city, mode, values[i]])));
  },

  commute: (l) => datasetOf("deslocamento-ao-trabalho.csv", P(l, "Deslocamento ao trabalho", "Commuting to work"),
    P(l, "Como cem trabalhadores fictícios de uma cidade média chegam ao emprego.", "How one hundred fictional workers in a mid-sized city get to their jobs."),
    [text("mode", P(l, "Modal", "Mode")), int("people", P(l, "Pessoas_a_cada_100", "People_per_100"))],
    [[P(l, "Ônibus", "Bus"), 34], [P(l, "Carro", "Car"), 27], [P(l, "A pé", "Walking"), 18], [P(l, "Moto", "Motorbike"), 9], [P(l, "Bicicleta", "Bicycle"), 7], [P(l, "Outros", "Other"), 5]]),

  budgetShare: (l) => datasetOf("orcamento-por-area.csv", P(l, "Orçamento por área", "Budget by area"),
    P(l, "Como uma prefeitura fictícia divide o orçamento anual entre cinco áreas.", "How a fictional city hall splits its annual budget across five areas."),
    [text("area", P(l, "Area", "Area")), pct("share", P(l, "Percentual", "Share"))],
    [[P(l, "Saúde", "Health"), 31], [P(l, "Educação", "Education"), 27], [P(l, "Infraestrutura", "Infrastructure"), 16], [P(l, "Assistência social", "Social assistance"), 14], [P(l, "Segurança", "Public safety"), 12]]),

  market: (l) => {
    const segments = [P(l, "Smartphones", "Smartphones"), P(l, "Notebooks", "Laptops"), P(l, "Tablets", "Tablets"), P(l, "Vestíveis", "Wearables")];
    const brands = ["Nimbus", "Órbita", "Vertex", "Zeta"];
    const revenue = [[420, 310, 180, 90], [260, 190, 140, 60], [120, 95, 70, 25], [60, 85, 30, 45]];
    return datasetOf("participacao-de-mercado.csv", P(l, "Mercado de eletrônicos", "Electronics market"),
      P(l, "Receita de quatro marcas fictícias em quatro segmentos: o tamanho do segmento e a fatia de cada marca.", "Revenue of four fictional brands across four segments: segment size and each brand's share."),
      [cat("segment", P(l, "Segmento", "Segment"), segments), cat("brand", P(l, "Marca", "Brand"), brands), num("revenue", P(l, "Receita_milhoes", "Revenue_millions"))],
      segments.flatMap((segment, i) => brands.map((brand, j) => [segment, brand, revenue[i][j]])));
  },

  channels: (l) => {
    const groups: Array<[boolean, boolean, boolean, number]> = [[true, false, false, 14], [false, true, false, 9], [false, false, true, 8], [true, true, false, 7], [true, false, true, 5], [false, true, true, 6], [true, true, true, 11]];
    const rows = groups.flatMap(([store, app, site, count]) => Array.from({ length: count }, () => [store, app, site]));
    const rand = rng(11);
    const order = rows.map((row) => ({ row, k: rand() })).sort((a, b) => a.k - b.k).map((item) => item.row);
    return datasetOf("clientes-por-canal.csv", P(l, "Clientes por canal de compra", "Customers by purchase channel"),
      P(l, "Sessenta clientes fictícios e os canais em que já compraram: loja física, aplicativo e site.", "Sixty fictional customers and the channels they have bought through: store, app and website."),
      [text("customer", P(l, "Cliente", "Customer")), flag("store", P(l, "Loja_fisica", "Store")), flag("app", "App"), flag("site", "Site")],
      order.map((row, i) => [`C-${String(i + 1).padStart(3, "0")}`, ...row]));
  },

  skills: (l) => {
    const rand = rng(23);
    const names = ["SQL", "Python", "R", "Excel", "Power BI"];
    const chance = [0.78, 0.62, 0.22, 0.85, 0.42];
    const rows = Array.from({ length: 48 }, (_, i) => {
      const has = chance.map((p) => rand() < p);
      if (has[2] && rand() < 0.7) has[1] = true;
      if (!has.some(Boolean)) has[3] = true;
      return [`${P(l, "Candidato", "Candidate")} ${String(i + 1).padStart(2, "0")}`, ...has];
    });
    return datasetOf("habilidades-dos-candidatos.csv", P(l, "Habilidades dos candidatos", "Candidate skills"),
      P(l, "Quarenta e oito candidatos fictícios a uma vaga de análise de dados e as ferramentas que dominam.", "Forty-eight fictional applicants for a data analyst role and the tools they know."),
      [text("candidate", P(l, "Candidato", "Candidate")), ...names.map((name) => flag(name.toLowerCase().replace(/\s/g, ""), name.replace(/\s/g, "_")))],
      rows);
  },

  bridge: (l) => {
    const total = P(l, "Total", "Total");
    const change = P(l, "Variação", "Change");
    return datasetOf("resultado-anual.csv", P(l, "Resultado anual", "Annual result"),
      P(l, "Da receita bruta ao lucro líquido de uma empresa fictícia: o que soma e o que subtrai no caminho.", "From gross revenue to net profit of a fictional company: what adds and what subtracts along the way."),
      [text("step", P(l, "Etapa", "Step")), money("value", P(l, "Valor", "Amount"), l === "pt" ? "BRL" : "USD"), cat("kind", P(l, "Tipo", "Type"), [total, change])],
      [[P(l, "Receita bruta", "Gross revenue"), 4850000, total], [P(l, "Impostos", "Taxes"), -620000, change], [P(l, "Custo dos serviços", "Cost of services"), -1930000, change], [P(l, "Despesas comerciais", "Sales expenses"), -740000, change], [P(l, "Despesas administrativas", "Administrative expenses"), -510000, change], [P(l, "Receitas financeiras", "Financial income"), 85000, change], [P(l, "Lucro líquido", "Net profit"), 1135000, total]]);
  },

  hiring: (l) => datasetOf("funil-de-contratacao.csv", P(l, "Funil de contratação", "Hiring funnel"),
    P(l, "O processo seletivo de uma empresa fictícia, da candidatura à contratação, com quem fica em cada etapa.", "A fictional company's hiring process, from application to hire, with how many remain at each stage."),
    [text("stage", P(l, "Etapa", "Stage")), int("candidates", P(l, "Candidatos", "Candidates"))],
    [[P(l, "Candidaturas", "Applications"), 1240], [P(l, "Triagem de currículos", "Résumé screening"), 610], [P(l, "Entrevista com RH", "HR interview"), 302], [P(l, "Entrevista técnica", "Technical interview"), 148], [P(l, "Proposta enviada", "Offer sent"), 61], [P(l, "Contratações", "Hires"), 47]]),
};

export const views: Record<string, ViewBuilder> = {
  "grouped-bar": (l) => view(l, "energy", { x: "district", y: "mwh", s: "source" }, ["Geração comunitária por bairro", "Community generation by district"], ["MWh por fonte", "MWh by source"]),
  "stacked-bar": (l) => view(l, "energy", { x: "district", y: "mwh", s: "source" }, ["Composição da geração por bairro", "Generation mix by district"], ["MWh empilhados por fonte", "MWh stacked by source"]),
  bar: (l) => view(l, "courses", { x: "course", y: "enrolled" }, ["Matrículas por curso", "Enrollments by program"], ["estudantes ativos", "active students"]),
  column: (l) => view(l, "revenue", { x: "month", y: "revenue" }, ["Receita mensal", "Monthly revenue"], ["R$ por mês", "US$ per month"]),
  lollipop: (l) => view(l, "service", { x: "service", y: "score" }, ["Satisfação com serviços públicos", "Satisfaction with public services"], ["nota média de 0 a 10", "average score from 0 to 10"]),
  "dot-plot": (l) => view(l, "schools", { x: "school", y: "score", s: "phase" }, ["Nota das escolas antes e depois do programa", "School scores before and after the program"], ["nota média (0–10)", "average score (0–10)"]),
  dumbbell: (l) => view(l, "schools", { x: "school", y: "score", s: "phase" }, ["Ganho de nota por escola", "Score gain by school"], ["antes → depois do programa", "before → after the program"]),
  bullet: (l) => view(l, "kpis", { x: "kpi", y: "actual", size: "target" }, ["Indicadores em relação às metas", "KPIs against targets"], ["nota de 0 a 10; a marca vertical é a meta", "score from 0 to 10; the vertical mark is the target"]),
  span: (l) => view(l, "temps", { x: "city", y: "temp", s: "stat" }, ["Amplitude térmica em julho", "July temperature range"], ["mínima e máxima médias, °C", "average low and high, °C"]),
  pareto: (l) => view(l, "returns", { x: "cause", y: "count" }, ["Motivos de devolução", "Return reasons"], ["ocorrências e % acumulado", "occurrences and cumulative %"]),
  butterfly: (l) => view(l, "approval", { x: "area", y: "rate", s: "group" }, ["Aprovação por área: clientes × não clientes", "Approval by area: customers vs. non-customers"], ["% que avalia positivamente", "% rating positively"]),
  "radial-bar": (l) => view(l, "rain", { x: "month", y: "mm" }, ["Chuva ao longo do ano", "Rainfall through the year"], ["mm por mês", "mm per month"]),
  nightingale: (l) => view(l, "rain", { x: "month", y: "mm" }, ["Rosa de chuvas", "Rainfall rose"], ["área proporcional aos mm de cada mês", "area proportional to each month's mm"], true),
  "normalized-bar": (l) => view(l, "mobility", { x: "city", y: "trips", s: "mode" }, ["Como as cidades se deslocam", "How cities get around"], ["% das viagens diárias por modal", "% of daily trips by mode"]),
  pictogram: (l) => view(l, "commute", { x: "mode", y: "people" }, ["Como chegamos ao trabalho", "How we get to work"], ["a cada 100 trabalhadores", "per 100 workers"], true),
  waffle: (l) => view(l, "commute", { x: "mode", y: "people" }, ["Como chegamos ao trabalho", "How we get to work"], ["cada quadrado é 1 a cada 100 trabalhadores", "each square is 1 in 100 workers"], true),
  pie: (l) => view(l, "budgetShare", { x: "area", y: "share" }, ["Para onde vai o orçamento", "Where the budget goes"], ["% do orçamento municipal", "% of the city budget"], true),
  donut: (l) => view(l, "budgetShare", { x: "area", y: "share" }, ["Para onde vai o orçamento", "Where the budget goes"], ["% do orçamento municipal", "% of the city budget"], true),
  marimekko: (l) => view(l, "market", { x: "segment", y: "revenue", s: "brand" }, ["Mercado de eletrônicos: segmento e marca", "Electronics market: segment and brand"], ["receita em R$ milhões", "revenue in millions"], true),
  venn: (l) => view(l, "channels", { x: "customer" }, ["Onde os clientes compram", "Where customers buy"], ["quantos usam cada canal e suas combinações", "how many use each channel and their overlaps"], true),
  upset: (l) => view(l, "skills", { x: "candidate" }, ["Combinações de habilidades", "Skill combinations"], ["candidatos por combinação de ferramentas", "candidates by tool combination"], true),
  waterfall: (l) => view(l, "bridge", { x: "step", y: "value", s: "kind" }, ["Da receita ao lucro", "From revenue to profit"], ["R$ no ano", "US$ in the year"], true),
  funnel: (l) => view(l, "hiring", { x: "stage", y: "candidates" }, ["Funil de contratação", "Hiring funnel"], ["candidatos por etapa", "candidates per stage"], true),
};
