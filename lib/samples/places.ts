import { addDaysIso } from "../dates";
import { P, cat, clamp, date, datasetOf, gaussian, int, money, num, pct, rng, round, text, view, type Cell, type DatasetBuilder, type ViewBuilder } from "./core";

/* Places, words and markets: coordinates on a map, terms and their links, prices over trading days. */

const moneyCode = (l: "pt" | "en") => (l === "pt" ? "BRL" : "USD");

export const datasets: Record<string, DatasetBuilder> = {
  states: (l) => {
    // name, latitude, longitude of the state's center, population (millions), literacy (%), GDP (billions)
    const rows: Array<[string, number, number, number, number, number]> = [
      ["SP", -22.2, -48.7, 46, 97.5, 2700], ["RJ", -22.3, -42.7, 17.4, 97.2, 950], ["MG", -18.5, -44.6, 21.4, 95.9, 800], ["RS", -29.7, -53.2, 11.4, 97.6, 620], ["SC", -27.3, -50.5, 7.7, 97.9, 430], ["PR", -24.6, -51.6, 11.5, 96.8, 590],
      ["BA", -12.5, -41.7, 14.9, 91.3, 380], ["PE", -8.4, -37.9, 9.7, 91.3, 230], ["CE", -5.2, -39.3, 9.2, 90.7, 200], ["GO", -15.9, -49.8, 7.2, 95.4, 310], ["PA", -3.8, -52, 8.7, 92.7, 220], ["AM", -3.9, -63.9, 4.2, 95.4, 130],
    ];
    return datasetOf("estados.csv", P(l, "Indicadores por estado", "Indicators by state"),
      P(l, "Doze estados de uma federação fictícia, cada um no centro do seu território, com população, alfabetização e PIB.", "Twelve states of a fictional federation, each at the center of its territory, with population, literacy and GDP."),
      [text("state", P(l, "Estado", "State")), num("lat", "Latitude"), num("lon", "Longitude"), num("pop", P(l, "Populacao_milhoes", "Population_millions")), pct("literacy", P(l, "Alfabetizacao_pct", "Literacy_pct")), num("gdp", P(l, "PIB_bilhoes", "GDP_billions"))],
      rows.map((row) => [...row]));
  },

  collectionPoints: (l) => {
    const rand = rng(211);
    const z = gaussian(rand);
    const kinds = [P(l, "Papel", "Paper"), P(l, "Vidro", "Glass"), P(l, "Eletrônicos", "Electronics"), P(l, "Óleo de cozinha", "Cooking oil")];
    const centers: Array<[number, number]> = [[-27.596, -48.549], [-27.603, -48.47], [-27.583, -48.522]];
    return datasetOf("pontos-de-coleta.csv", P(l, "Pontos de coleta seletiva", "Recycling drop-off points"),
      P(l, "Sessenta pontos de coleta espalhados por uma cidade fictícia, de quatro tipos de material, concentrados em três bairros.", "Sixty drop-off points scattered across a fictional city, four material types, clustered in three districts."),
      [text("point", P(l, "Ponto", "Point")), num("lat", "Latitude"), num("lon", "Longitude"), cat("kind", P(l, "Material", "Material"), kinds)],
      Array.from({ length: 60 }, (_, i) => {
        const [lat, lon] = centers[i % centers.length];
        return [`P-${String(i + 1).padStart(2, "0")}`, round(lat + 0.012 * z(), 5), round(lon + 0.014 * z(), 5), kinds[Math.floor(rand() * kinds.length)]];
      }));
  },

  trafficIncidents: (l) => {
    const rand = rng(223);
    const z = gaussian(rand);
    const hotspots: Array<[number, number, number, number]> = [[-23.55, -46.64, 0.012, 130], [-23.59, -46.68, 0.02, 90], [-23.52, -46.58, 0.015, 60]];
    const rows: Cell[][] = hotspots.flatMap(([lat, lon, sd, n]) => Array.from({ length: n }, () => [round(lat + sd * z(), 5), round(lon + sd * z(), 5)] as Cell[]));
    for (let i = 0; i < 40; i++) rows.push([round(-23.62 + rand() * 0.14, 5), round(-46.72 + rand() * 0.18, 5)]);
    return datasetOf("ocorrencias-de-transito.csv", P(l, "Ocorrências de trânsito", "Traffic incidents"),
      P(l, "320 ocorrências registradas numa metrópole fictícia, a maioria concentrada em três cruzamentos críticos.", "320 incidents recorded in a fictional metropolis, most of them concentrated around three critical junctions."),
      [text("id", P(l, "Ocorrencia", "Incident")), num("lat", "Latitude"), num("lon", "Longitude")],
      rows.map((row, i) => [`O-${String(i + 1).padStart(3, "0")}`, ...row]));
  },

  cargoRoutes: (l) => {
    const ports: Record<string, [number, number]> = { Santos: [-46.3, -23.96], Paranaguá: [-48.51, -25.52], "Rio Grande": [-52.1, -32.03], Itajaí: [-48.66, -26.91], Vitória: [-40.34, -20.32], Salvador: [-38.51, -12.97], Suape: [-34.96, -8.39], Pecém: [-38.83, -3.55], Belém: [-48.5, -1.45], Manaus: [-60.02, -3.12] };
    const routes: Array<[string, string, number]> = [["Santos", "Salvador", 820], ["Santos", "Suape", 540], ["Santos", "Pecém", 310], ["Paranaguá", "Santos", 460], ["Rio Grande", "Santos", 390], ["Itajaí", "Santos", 610], ["Vitória", "Santos", 280], ["Salvador", "Suape", 240], ["Suape", "Pecém", 190], ["Pecém", "Belém", 150], ["Belém", "Manaus", 330], ["Santos", "Manaus", 220]];
    return datasetOf("rotas-de-carga.csv", P(l, "Rotas de carga entre portos", "Cargo routes between ports"),
      P(l, "Doze rotas de cabotagem entre dez portos de um país fictício, com o volume transportado em cada uma.", "Twelve coastal shipping routes between ten ports of a fictional country, with the volume moved on each."),
      [cat("from", P(l, "Origem", "Origin")), cat("to", P(l, "Destino", "Destination")), num("lonFrom", P(l, "Lon_origem", "Lon_origin")), num("latFrom", P(l, "Lat_origem", "Lat_origin")), num("lonTo", P(l, "Lon_destino", "Lon_destination")), num("latTo", P(l, "Lat_destino", "Lat_destination")), int("cargo", P(l, "Carga_mil_t", "Cargo_thousand_t"))],
      routes.map(([from, to, cargo]) => [from, to, ports[from][0], ports[from][1], ports[to][0], ports[to][1], cargo]));
  },

  terms: (l) => datasetOf("comentarios-de-clientes.csv", P(l, "Termos nos comentários de clientes", "Terms in customer comments"),
    P(l, "Os termos mais citados em três mil comentários fictícios de uma pesquisa de satisfação.", "The most cited terms in three thousand fictional comments from a satisfaction survey."),
    [text("term", P(l, "Termo", "Term")), int("freq", P(l, "Frequencia", "Frequency"))],
    ([["atendimento", "support", 182], ["entrega", "delivery", 164], ["preço", "price", 141], ["qualidade", "quality", 133], ["prazo", "deadline", 121], ["produto", "product", 118], ["aplicativo", "app", 96], ["suporte", "helpdesk", 92], ["embalagem", "packaging", 71], ["troca", "exchange", 66], ["cadastro", "sign-up", 58], ["pagamento", "payment", 55], ["site", "website", 52], ["frete", "shipping", 49], ["cupom", "coupon", 44], ["rastreio", "tracking", 41], ["estoque", "stock", 38], ["garantia", "warranty", 36], ["desconto", "discount", 33], ["reembolso", "refund", 27], ["variedade", "selection", 24], ["cancelamento", "cancellation", 19]] as Array<[string, string, number]>).map(([pt, en, n]) => [P(l, pt, en), n])),

  phrases: (l) => datasetOf("frases-com-entrega.csv", P(l, "O que se diz depois de “entrega”", "What follows “delivery”"),
    P(l, "Expressões que começam com “entrega” nos comentários fictícios de clientes, e quantas vezes cada uma aparece.", "Phrases starting with “delivery” in the fictional customer comments, and how often each appears."),
    [text("phrase", P(l, "Expressao", "Phrase")), int("freq", P(l, "Frequencia", "Frequency"))],
    ([["entrega rápida", "fast delivery", 98], ["entrega no prazo", "on-time delivery", 74], ["entrega atrasada", "late delivery", 61], ["entrega grátis", "free delivery", 39], ["entrega em casa", "home delivery", 33], ["entrega incompleta", "incomplete delivery", 22], ["entrega danificada", "damaged delivery", 17], ["entrega agendada", "scheduled delivery", 14], ["entrega no vizinho", "delivery to a neighbor", 8]] as Array<[string, string, number]>).map(([pt, en, n]) => [P(l, pt, en), n])),

  cooc: (l) => {
    const pairs: Array<[string, string, string, string, number]> = [
      ["entrega", "delivery", "prazo", "deadline", 88], ["entrega", "delivery", "atraso", "delay", 64], ["entrega", "delivery", "frete", "shipping", 52], ["atendimento", "support", "demora", "wait", 47], ["atendimento", "support", "educado", "polite", 41], ["atendimento", "support", "resolvido", "solved", 39],
      ["preço", "price", "desconto", "discount", 58], ["preço", "price", "cupom", "coupon", 36], ["preço", "price", "qualidade", "quality", 44], ["qualidade", "quality", "produto", "product", 61], ["qualidade", "quality", "embalagem", "packaging", 27], ["produto", "product", "troca", "exchange", 33],
      ["troca", "exchange", "prazo", "deadline", 29], ["troca", "exchange", "reembolso", "refund", 24], ["aplicativo", "app", "cadastro", "sign-up", 31], ["aplicativo", "app", "pagamento", "payment", 28], ["aplicativo", "app", "lento", "slow", 22], ["pagamento", "payment", "cupom", "coupon", 19], ["frete", "shipping", "prazo", "deadline", 35], ["suporte", "helpdesk", "demora", "wait", 26],
    ];
    return datasetOf("coocorrencia-de-termos.csv", P(l, "Coocorrência de termos", "Term co-occurrence"),
      P(l, "Pares de termos que aparecem juntos no mesmo comentário fictício, e quantas vezes isso acontece.", "Pairs of terms that appear together in the same fictional comment, and how often that happens."),
      [text("a", P(l, "Termo_A", "Term_A")), text("b", P(l, "Termo_B", "Term_B")), int("count", P(l, "Coocorrencias", "Co_occurrences"))],
      pairs.map(([apt, aen, bpt, ben, n]) => [P(l, apt, aen), P(l, bpt, ben), n]));
  },

  ideas: (l) => {
    const root = P(l, "Bicicletas compartilhadas", "Bike sharing");
    const themes: Array<[string, string[]]> = [
      [P(l, "Público", "Audience"), [P(l, "Universitários", "College students"), P(l, "Turistas", "Tourists"), P(l, "Trabalhadores do centro", "Downtown workers")]],
      [P(l, "Preço", "Pricing"), [P(l, "Plano diário", "Day pass"), P(l, "Assinatura mensal", "Monthly plan"), P(l, "Primeira viagem grátis", "First ride free")]],
      [P(l, "Tecnologia", "Technology"), [P(l, "Mapa de estações no app", "Station map in the app"), P(l, "Desbloqueio por QR code", "QR-code unlock"), P(l, "Bicicletas elétricas", "E-bikes")]],
      [P(l, "Parcerias", "Partnerships"), [P(l, "Universidades", "Universities"), P(l, "Hotéis", "Hotels"), P(l, "Prefeitura", "City hall")]],
      [P(l, "Comunicação", "Communication"), [P(l, "Influenciadores locais", "Local influencers"), P(l, "Ações em campus", "Campus events"), P(l, "Campanha de lançamento", "Launch campaign")]],
    ];
    return datasetOf("mapa-de-ideias.csv", P(l, "Mapa de ideias", "Idea map"),
      P(l, "Uma sessão de brainstorming fictícia sobre lançar bicicletas compartilhadas: cinco temas e três ideias em cada um.", "A fictional brainstorm about launching bike sharing: five themes and three ideas under each."),
      [text("parent", P(l, "Tema", "Theme")), text("idea", P(l, "Ideia", "Idea"))],
      [...themes.map(([theme]) => [root, theme] as Cell[]), ...themes.flatMap(([theme, list]) => list.map((idea) => [theme, idea] as Cell[]))]);
  },

  stock: (l) => {
    const rand = rng(307);
    const z = gaussian(rand);
    let close = 24;
    let day = 0;
    const rows: Cell[][] = [];
    while (rows.length < 60) {
      const iso = addDaysIso("2024-01-02", day++);
      const weekday = new Date(`${iso}T12:00:00`).getDay();
      if (weekday === 0 || weekday === 6) continue;
      const open = round(close + 0.18 * z(), 2);
      const next = round(clamp(open + 0.05 + 0.55 * z(), 18, 40), 2);
      const high = round(Math.max(open, next) + Math.abs(0.28 * z()) + 0.05, 2);
      const low = round(Math.min(open, next) - Math.abs(0.28 * z()) - 0.05, 2);
      rows.push([iso, open, high, low, next, Math.round(1.2e6 + 0.6e6 * rand() + 4e5 * Math.abs(next - open))]);
      close = next;
    }
    const code = moneyCode(l);
    return datasetOf("acao-acme3.csv", P(l, "Ação ACME3", "ACME3 stock"),
      P(l, "Sessenta pregões de uma ação fictícia: preço de abertura, máxima, mínima e fechamento de cada dia, e o volume.", "Sixty trading days of a fictional stock: each day's open, high, low and close, and the volume."),
      [date("day", P(l, "Data", "Date")), money("open", P(l, "Abertura", "Open"), code), money("high", P(l, "Maxima", "High"), code), money("low", P(l, "Minima", "Low"), code), money("close", P(l, "Fechamento", "Close"), code), int("volume", P(l, "Volume", "Volume"))],
      rows);
  },
};

export const views: Record<string, ViewBuilder> = {
  choropleth: (l) => view(l, "states", { x: "lon", y: "lat", s: "state", size: "literacy" }, ["Alfabetização por estado", "Literacy by state"], ["% da população alfabetizada; cor = taxa", "% of the population that is literate; color = rate"], true),
  "bubble-map": (l) => view(l, "states", { x: "lon", y: "lat", s: "state", size: "pop" }, ["População por estado", "Population by state"], ["milhões de habitantes; área = população", "millions of people; area = population"], true),
  cartogram: (l) => view(l, "states", { x: "lon", y: "lat", s: "state", size: "gdp" }, ["PIB por estado", "GDP by state"], ["R$ bilhões; a área de cada estado segue o PIB", "billions; each state's area follows its GDP"], true),
  "dot-map": (l) => view(l, "collectionPoints", { x: "lon", y: "lat", s: "kind" }, ["Pontos de coleta seletiva", "Recycling drop-off points"], ["cor = tipo de material", "color = material type"]),
  "hexbin-map": (l) => view(l, "trafficIncidents", { x: "lon", y: "lat" }, ["Onde os acidentes se concentram", "Where crashes concentrate"], ["ocorrências por célula", "incidents per cell"]),
  "flow-map": (l) => view(l, "cargoRoutes", { x: "lonFrom", y: "latFrom", s: "to", size: "cargo" }, ["Rotas de carga entre portos", "Cargo routes between ports"], ["espessura = mil toneladas", "thickness = thousand tonnes"], true),
  "word-cloud": (l) => view(l, "terms", { x: "term", y: "freq" }, ["Do que os clientes falam", "What customers talk about"], ["tamanho = frequência do termo", "size = term frequency"]),
  "term-frequency": (l) => view(l, "terms", { x: "term", y: "freq" }, ["Termos mais citados", "Most cited terms"], ["menções em comentários de clientes", "mentions in customer comments"], true),
  "word-tree": (l) => view(l, "phrases", { x: "phrase", y: "freq" }, ["O que se diz depois de “entrega”", "What follows “delivery”"], ["frequência de cada expressão", "frequency of each phrase"], true),
  cooccurrence: (l) => view(l, "cooc", { x: "a", s: "b", size: "count" }, ["Termos que aparecem juntos", "Terms that appear together"], ["espessura = comentários em que coocorrem", "thickness = comments where they co-occur"]),
  brainstorm: (l) => view(l, "ideas", { x: "parent", s: "idea" }, ["Mapa de ideias: bicicletas compartilhadas", "Idea map: bike sharing"], ["temas e ideias da sessão", "themes and ideas from the session"], true),
  candlestick: (l) => view(l, "stock", { x: "day", y: "close" }, ["ACME3 em 60 pregões", "ACME3 over 60 trading days"], ["velas diárias: abertura, máxima, mínima e fechamento", "daily candles: open, high, low and close"]),
  ohlc: (l) => view(l, "stock", { x: "day", y: "close" }, ["ACME3 em barras OHLC", "ACME3 as OHLC bars"], ["abertura, máxima, mínima e fechamento", "open, high, low and close"]),
  kagi: (l) => view(l, "stock", { x: "day", y: "close" }, ["ACME3 em gráfico Kagi", "ACME3 as a Kagi chart"], ["linha grossa = alta, fina = baixa; muda só em reversões", "thick = rising, thin = falling; turns only on reversals"]),
  "point-figure": (l) => view(l, "stock", { x: "day", y: "close" }, ["ACME3 em ponto e figura", "ACME3 as point & figure"], ["X quando sobe, O quando cai", "X when rising, O when falling"]),
};
