import { addDaysIso } from "../dates";
import { P, MONTHS, cat, clamp, date, datasetOf, gaussian, int, money, monthStart, num, pct, rng, round, text, view, type Cell, type DatasetBuilder, type ViewBuilder } from "./core";

/* Distributions, relationships and time: the shape of many observations, pairs of measures, and change over time. */

const pad = (n: number, size = 4) => String(n).padStart(size, "0");
const moneyCode = (l: "pt" | "en") => (l === "pt" ? "BRL" : "USD");

export const datasets: Record<string, DatasetBuilder> = {
  supportTime: (l) => {
    const z = gaussian(rng(5));
    return datasetOf("tempo-de-resposta.csv", P(l, "Tempo de resposta do suporte", "Support response time"),
      P(l, "150 chamados de uma central de suporte fictícia e quanto tempo levou a primeira resposta.", "150 tickets of a fictional support desk and how long the first reply took."),
      [text("ticket", P(l, "Chamado", "Ticket")), num("minutes", P(l, "Tempo_min", "Time_min"))],
      Array.from({ length: 150 }, (_, i) => [`T-${pad(i + 1)}`, round(Math.exp(3.4 + 0.55 * z()), 1)]));
  },

  examScores: (l) => {
    const z = gaussian(rng(8));
    return datasetOf("notas-da-prova.csv", P(l, "Notas da prova", "Exam scores"),
      P(l, "Notas de 0 a 100 de 36 estudantes fictícios numa prova de matemática.", "Scores from 0 to 100 of 36 fictional students in a math exam."),
      [text("student", P(l, "Aluno", "Student")), int("score", P(l, "Nota", "Score"))],
      Array.from({ length: 36 }, (_, i) => [`${P(l, "Aluno", "Student")} ${pad(i + 1, 2)}`, Math.round(clamp(71 + 13 * z(), 32, 100))]));
  },

  salaries: (l) => {
    const rand = rng(31);
    const z = gaussian(rand);
    const depts: Array<[string, number, number, number[]]> = [
      [P(l, "Tecnologia", "Technology"), 9800, 2100, [17800]], [P(l, "Comercial", "Sales"), 6300, 1700, [13500]], [P(l, "Financeiro", "Finance"), 7500, 1400, []], [P(l, "Operações", "Operations"), 4400, 800, []], [P(l, "Atendimento", "Support"), 3300, 450, []],
    ];
    return datasetOf("salarios-por-departamento.csv", P(l, "Salários por departamento", "Salaries by department"),
      P(l, "Salários mensais de uma empresa fictícia em cinco departamentos, com alguns casos fora da curva.", "Monthly salaries at a fictional company across five departments, with a few outliers."),
      [cat("dept", P(l, "Departamento", "Department"), depts.map((d) => d[0])), money("salary", P(l, "Salario", "Salary"), moneyCode(l))],
      depts.flatMap(([name, mean, sd, extra]) => [...Array.from({ length: 14 }, () => [name, Math.round((mean + sd * z()) / 50) * 50] as Cell[]), ...extra.map((value) => [name, value] as Cell[])]));
  },

  classScores: (l) => {
    const rand = rng(17);
    const z = gaussian(rand);
    const draw = [
      () => 7 + 0.9 * z(),
      () => (rand() < 0.5 ? 4.6 + 0.8 * z() : 8.6 + 0.6 * z()),
      () => 10 - Math.abs(1.4 * z()),
      () => 6 + 1.9 * z(),
    ];
    const classes = ["A", "B", "C", "D"].map((k) => `${P(l, "Turma", "Class")} ${k}`);
    return datasetOf("notas-por-turma.csv", P(l, "Notas por turma", "Scores by class"),
      P(l, "Notas de 0 a 10 em quatro turmas fictícias que têm médias parecidas, mas formas bem diferentes.", "Scores from 0 to 10 in four fictional classes with similar averages but very different shapes."),
      [cat("class", P(l, "Turma", "Class"), classes), num("score", P(l, "Nota", "Score"))],
      classes.flatMap((name, k) => Array.from({ length: 40 }, () => [name, round(clamp(draw[k](), 0, 10), 1)] as Cell[])));
  },

  dailyTemp: (l) => {
    const z = gaussian(rng(41));
    const means = [28.5, 28.8, 27.4, 24.6, 21.5, 18.9];
    const sds = [2.1, 2.3, 2.5, 3.0, 3.4, 3.6];
    const months = MONTHS[l].slice(0, 6);
    return datasetOf("temperatura-diaria.csv", P(l, "Temperatura diária", "Daily temperature"),
      P(l, "Temperatura máxima de cada dia, de janeiro a junho, numa cidade fictícia: o verão vai dando lugar ao outono.", "Each day's high from January to June in a fictional city: summer gives way to autumn."),
      [cat("month", P(l, "Mês", "Month"), months), num("temp", P(l, "Temp_max_C", "High_temp_C"))],
      months.flatMap((month, k) => Array.from({ length: 30 }, () => [month, round(means[k] + sds[k] * z(), 1)] as Cell[])));
  },

  commuteTime: (l) => {
    const z = gaussian(rng(53));
    const modes: Array<[string, number, number]> = [[P(l, "Ônibus", "Bus"), 48, 12], [P(l, "Bicicleta", "Bicycle"), 32, 8], [P(l, "Carro", "Car"), 38, 16]];
    return datasetOf("tempo-de-percurso.csv", P(l, "Tempo de percurso até o trabalho", "Commute time to work"),
      P(l, "Vinte e cinco trajetos fictícios em cada meio de transporte, em minutos, de casa ao trabalho.", "Twenty-five fictional trips per transport mode, in minutes, from home to work."),
      [cat("mode", P(l, "Modal", "Mode"), modes.map((m) => m[0])), int("minutes", P(l, "Tempo_min", "Time_min"))],
      modes.flatMap(([mode, mean, sd]) => Array.from({ length: 25 }, () => [mode, Math.round(clamp(mean + sd * z(), 8, 110))] as Cell[])));
  },

  pyramid: (l) => {
    const men = P(l, "Homens", "Men");
    const women = P(l, "Mulheres", "Women");
    const ages = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70+"];
    const male = [32, 34, 36, 38, 32, 26, 18, 13];
    const female = [31, 33, 38, 41, 36, 30, 22, 20];
    return datasetOf("estrutura-etaria.csv", P(l, "Estrutura etária", "Age structure"),
      P(l, "População de uma cidade fictícia por faixa etária e sexo, em milhares de pessoas.", "Population of a fictional city by age group and sex, in thousands of people."),
      [cat("age", P(l, "Faixa_etaria", "Age_group"), ages), cat("sex", P(l, "Sexo", "Sex"), [men, women]), int("pop", P(l, "Populacao_mil", "Population_thousands"))],
      ages.flatMap((age, i) => [[age, men, male[i]], [age, women, female[i]]]));
  },

  plants: (l) => {
    const z = gaussian(rng(61));
    const groups: Array<[string, number]> = [[P(l, "Controle", "Control"), 21], [P(l, "Adubo A", "Fertilizer A"), 25.5], [P(l, "Adubo B", "Fertilizer B"), 27], [P(l, "Adubo A + B", "Fertilizer A + B"), 31]];
    return datasetOf("crescimento-de-plantas.csv", P(l, "Crescimento de plantas", "Plant growth"),
      P(l, "Experimento fictício: dez plantas por tratamento e quanto cresceram em quatro semanas.", "Fictional experiment: ten plants per treatment and how much they grew in four weeks."),
      [cat("treatment", P(l, "Tratamento", "Treatment"), groups.map((g) => g[0])), num("growth", P(l, "Crescimento_cm", "Growth_cm"))],
      groups.flatMap(([name, mean]) => Array.from({ length: 10 }, () => [name, round(mean + 3.2 * z(), 1)] as Cell[])));
  },

  study: (l) => {
    const rand = rng(71);
    const z = gaussian(rand);
    const morning = P(l, "Manhã", "Morning");
    const night = P(l, "Noite", "Evening");
    const rows: Cell[][] = Array.from({ length: 46 }, (_, i) => {
      const hours = round(0.5 + rand() * 11.5, 1);
      const shift = i % 2 === 0 ? morning : night;
      const score = clamp(38 + 4.4 * hours + (shift === morning ? 3 : -2) + 5.5 * z(), 20, 100);
      return [`A${pad(i + 1, 2)}`, hours, round(score, 1), shift];
    });
    rows.push(["A47", 11, 41, night], ["A48", 1.5, 88, morning]);
    return datasetOf("horas-de-estudo-e-nota.csv", P(l, "Horas de estudo e nota", "Study hours and score"),
      P(l, "48 estudantes fictícios: quantas horas estudaram por semana e a nota no exame, por turno.", "48 fictional students: weekly study hours and exam score, by shift."),
      [text("student", P(l, "Aluno", "Student")), num("hours", P(l, "Horas_de_estudo", "Study_hours")), num("score", P(l, "Nota", "Score")), cat("shift", P(l, "Turno", "Shift"), [morning, night])],
      rows);
  },

  towns: (l) => {
    const rand = rng(83);
    const z = gaussian(rand);
    const regions = [P(l, "Norte", "North"), P(l, "Nordeste", "Northeast"), P(l, "Sudeste", "Southeast"), P(l, "Sul", "South"), P(l, "Centro-Oeste", "Central-West")];
    const incomeBase = [2400, 2100, 4300, 4600, 3900];
    const names = ["Água Clara", "Boa Vista do Sul", "Campo Belo", "Dois Rios", "Encantado", "Foz do Vale", "Guaporé", "Ipê Alto", "Jaci", "Lagoa Dourada", "Monte Verde", "Nova Aurora", "Ouro Fino", "Pedra Bonita", "Quatro Pontes", "Rio Claro", "Santa Luzia", "Terra Roxa", "União da Serra", "Vale Sereno", "Xangri", "Zabelê"];
    return datasetOf("municipios.csv", P(l, "Renda e expectativa de vida", "Income and life expectancy"),
      P(l, "22 municípios fictícios: renda média, expectativa de vida e população, coloridos por região.", "22 fictional towns: average income, life expectancy and population, colored by region."),
      [text("town", P(l, "Municipio", "Town")), money("income", P(l, "Renda_media", "Average_income"), moneyCode(l)), num("life", P(l, "Expectativa_de_vida", "Life_expectancy")), int("pop", P(l, "Populacao_mil", "Population_thousands")), cat("region", P(l, "Regiao", "Region"), regions)],
      names.map((name, i) => {
        const r = i % regions.length;
        const income = Math.round((incomeBase[r] * (0.6 + rand() * 0.9)) / 10) * 10;
        const life = 64 + 11 * (1 - Math.exp(-income / 3600)) + 0.7 * z();
        return [name, income, round(life, 1), Math.round(8 + Math.exp(rand() * 5.2)), regions[r]];
      }));
  },

  fuel: (l) => {
    const price = [2.75, 2.82, 2.98, 3.55, 3.72, 3.98, 4.3, 4.35, 4.15, 5.65, 6.55, 5.85];
    const use = [39.6, 41.2, 43.0, 41.8, 40.6, 40.1, 39.8, 40.9, 36.4, 37.7, 39.0, 40.5];
    return datasetOf("combustivel-e-consumo.csv", P(l, "Preço e consumo de combustível", "Fuel price and consumption"),
      P(l, "Doze anos de um mercado fictício: o preço da gasolina e o volume consumido, um ponto por ano.", "Twelve years of a fictional market: gasoline price and volume consumed, one point per year."),
      [int("year", P(l, "Ano", "Year")), money("price", P(l, "Preco_por_litro", "Price_per_liter"), moneyCode(l)), num("volume", P(l, "Consumo_bilhoes_L", "Consumption_billion_L"))],
      price.map((value, i) => [2012 + i, value, use[i]]));
  },

  calls: (l) => {
    const rand = rng(97);
    const days = P(l, "Seg,Ter,Qua,Qui,Sex", "Mon,Tue,Wed,Thu,Fri").split(",");
    const hours = Array.from({ length: 11 }, (_, i) => `${pad(8 + i, 2)}h`);
    const shape = [0.35, 0.8, 1, 0.9, 0.55, 0.45, 0.85, 0.95, 0.75, 0.5, 0.3];
    const dayFactor = [1.25, 1.05, 1, 0.95, 0.8];
    return datasetOf("chamados-por-hora.csv", P(l, "Chamados por dia e hora", "Calls by day and hour"),
      P(l, "Uma central de atendimento fictícia: quantos chamados chegam em cada hora de cada dia útil.", "A fictional call center: how many calls arrive in each hour of each working day."),
      [cat("day", P(l, "Dia", "Day"), days), cat("hour", P(l, "Hora", "Hour"), hours), int("calls", P(l, "Chamados", "Calls"))],
      days.flatMap((day, d) => hours.map((hour, h) => [day, hour, Math.round(60 * shape[h] * dayFactor[d] * (0.9 + rand() * 0.2))])));
  },

  corr: (l) => {
    const z = gaussian(rng(101));
    const names = [P(l, "Sono", "Sleep"), P(l, "Atividade física", "Physical activity"), "IMC", P(l, "Pressão arterial", "Blood pressure"), P(l, "Colesterol", "Cholesterol")];
    const sample = Array.from({ length: 300 }, () => {
      const sleep = z();
      const activity = 0.3 * sleep + 0.95 * z();
      const bmi = -0.5 * activity + 0.85 * z();
      const pressure = 0.5 * bmi - 0.2 * sleep + 0.8 * z();
      const chol = 0.4 * bmi + 0.3 * pressure - 0.15 * activity + 0.8 * z();
      return [sleep, activity, bmi, pressure, chol];
    });
    const mean = (k: number) => sample.reduce((s, r) => s + r[k], 0) / sample.length;
    const r = (a: number, b: number) => {
      const ma = mean(a); const mb = mean(b);
      let cov = 0; let va = 0; let vb = 0;
      sample.forEach((row) => { cov += (row[a] - ma) * (row[b] - mb); va += (row[a] - ma) ** 2; vb += (row[b] - mb) ** 2; });
      return round(cov / Math.sqrt(va * vb), 2);
    };
    return datasetOf("correlacao-indicadores.csv", P(l, "Correlação entre indicadores de saúde", "Correlation among health indicators"),
      P(l, "Cinco indicadores medidos em 300 pessoas fictícias e o coeficiente de correlação de cada par.", "Five indicators measured on 300 fictional people and the correlation coefficient of each pair."),
      [cat("a", P(l, "Variavel_A", "Variable_A"), names), cat("b", P(l, "Variavel_B", "Variable_B"), names), num("r", P(l, "Correlacao", "Correlation"))],
      names.flatMap((a, i) => names.map((b, j) => [a, b, i === j ? 1 : r(i, j)])));
  },

  cars: (l) => {
    const small = P(l, "Compacto", "Compact");
    const suv = "SUV";
    const sport = P(l, "Esportivo", "Sports");
    const rows: Array<[string, string, number, number, number, number, number]> = [
      ["Piccolo", small, 75, 14.2, 980, 68000, 13.8], ["Vivo", small, 82, 13.5, 1010, 74000, 12.9], ["Mini Urban", small, 70, 15, 940, 65000, 14.5], ["Lume", small, 90, 12.8, 1080, 82000, 11.7], ["Brisa", small, 78, 13.9, 1000, 71000, 13.2], ["Nino", small, 85, 13.1, 1050, 79000, 12.3],
      ["Terra", suv, 150, 9.8, 1560, 158000, 9.4], ["Serra", suv, 170, 9.2, 1680, 189000, 8.7], ["Cânion", suv, 185, 8.8, 1790, 214000, 8.2], ["Delta X", suv, 140, 10.4, 1490, 149000, 10.1], ["Alpes", suv, 200, 8.4, 1850, 245000, 7.6], ["Vale", suv, 160, 9.6, 1620, 172000, 9],
      ["Raio", sport, 280, 7.2, 1320, 310000, 5.4], ["Fúria", sport, 340, 6.5, 1400, 395000, 4.6], ["Zênite", sport, 410, 5.8, 1480, 520000, 3.9], ["Cometa", sport, 255, 7.6, 1290, 288000, 5.8], ["Turbo S", sport, 365, 6.1, 1450, 455000, 4.2], ["Velox", sport, 300, 6.9, 1350, 340000, 5.1],
    ];
    return datasetOf("carros.csv", P(l, "Perfis de carros", "Car profiles"),
      P(l, "Dezoito modelos fictícios de três categorias, descritos por potência, consumo, peso, preço e aceleração.", "Eighteen fictional models in three categories, described by power, fuel economy, weight, price and acceleration."),
      [text("model", P(l, "Modelo", "Model")), cat("type", P(l, "Categoria", "Category"), [small, suv, sport]), num("power", P(l, "Potencia_cv", "Power_hp")), num("economy", P(l, "Consumo_km_L", "Economy_km_L")), int("weight", P(l, "Peso_kg", "Weight_kg")), money("price", P(l, "Preco", "Price"), moneyCode(l)), num("accel", P(l, "Aceleracao_0_100_s", "Acceleration_0_100_s"))],
      rows.map((row) => [...row]));
  },

  profiles: (l) => datasetOf("perfil-das-cidades.csv", P(l, "Perfil das cidades", "City profiles"),
    P(l, "Quatro cidades fictícias avaliadas de 0 a 100 em seis áreas da vida urbana.", "Four fictional cities scored from 0 to 100 in six areas of urban life."),
    [text("city", P(l, "Cidade", "City")), int("health", P(l, "Saude", "Health")), int("education", P(l, "Educacao", "Education")), int("safety", P(l, "Seguranca", "Safety")), int("mobility", P(l, "Mobilidade", "Mobility")), int("culture", P(l, "Cultura", "Culture")), int("environment", P(l, "Meio_ambiente", "Environment"))],
    [["Aurora", 78, 84, 62, 55, 70, 81], ["Beira-Mar", 66, 70, 74, 68, 82, 59], ["Colinas", 82, 76, 80, 48, 58, 88], ["Delta", 59, 64, 51, 72, 77, 63]]),

  visits: (l) => {
    const rand = rng(107);
    const channels = [P(l, "Orgânico", "Organic"), P(l, "Pago", "Paid"), P(l, "Social", "Social")];
    const rows = Array.from({ length: 18 }, (_, m) => {
      const season = 1 + 0.08 * Math.sin((2 * Math.PI * (m - 2)) / 12);
      const organic = 12000 * 1.03 ** m * season;
      const paid = 8000 * (1 + ([4, 10, 16].includes(m) ? 0.35 : 0)) * (0.97 + rand() * 0.06);
      const social = 3000 * 1.06 ** m * (0.95 + rand() * 0.1);
      return [organic, paid, social].map((value, k) => [monthStart(2023, 1, m), channels[k], Math.round(value / 100) * 100] as Cell[]);
    }).flat();
    return datasetOf("visitas-por-canal.csv", P(l, "Visitas ao site por canal", "Website visits by channel"),
      P(l, "Dezoito meses de um site fictício: visitas mensais vindas de busca orgânica, mídia paga e redes sociais.", "Eighteen months of a fictional website: monthly visits from organic search, paid media and social networks."),
      [date("month", P(l, "Mes", "Month")), cat("channel", P(l, "Canal", "Channel"), channels), int("visits", P(l, "Visitas", "Visits"))],
      rows);
  },

  reservoir: (l) => datasetOf("volume-do-reservatorio.csv", P(l, "Volume do reservatório", "Reservoir volume"),
    P(l, "Dois anos de um reservatório fictício: o volume armazenado sobe na estação chuvosa e cai na seca.", "Two years of a fictional reservoir: stored volume rises in the wet season and falls in the dry one."),
    [date("month", P(l, "Mes", "Month")), int("volume", P(l, "Volume_hm3", "Volume_hm3"))],
    Array.from({ length: 24 }, (_, m) => [monthStart(2022, 1, m), Math.round(610 + 150 * Math.sin((2 * Math.PI * (m - 3)) / 12) - 3.2 * m)])),

  sectorEnergy: (l) => {
    const rand = rng(113);
    const sectors = [P(l, "Residencial", "Residential"), P(l, "Comercial", "Commercial"), P(l, "Industrial", "Industrial")];
    const rows = Array.from({ length: 24 }, (_, m) => {
      const summer = Math.cos((2 * Math.PI * (m - 1)) / 12);
      const values = [310 + 42 * summer + 0.6 * m, 220 + 26 * summer + 1.4 * m, 480 + 8 * rand() * 2 + 0.9 * m];
      return values.map((value, k) => [monthStart(2022, 1, m), sectors[k], Math.round(value)] as Cell[]);
    }).flat();
    return datasetOf("consumo-por-setor.csv", P(l, "Consumo de energia por setor", "Energy use by sector"),
      P(l, "Dois anos de consumo elétrico de uma cidade fictícia, dividido entre residências, comércio e indústria.", "Two years of a fictional city's electricity use, split among homes, commerce and industry."),
      [date("month", P(l, "Mes", "Month")), cat("sector", P(l, "Setor", "Sector"), sectors), int("gwh", P(l, "Consumo_GWh", "Use_GWh"))],
      rows);
  },

  music: (l) => {
    const genres = [P(l, "Pop", "Pop"), "Rock", P(l, "Sertanejo", "Country"), "Funk", P(l, "Eletrônica", "Electronic"), "MPB"];
    const base = [420, 260, 380, 210, 150, 190];
    const amp = [60, 30, 90, 20, 50, 25];
    const phase = [0, 2, 1, 4, 5.2, 3];
    const trend = [0.8, -1.2, 0.5, 4, 1.5, 0.2];
    const rows = Array.from({ length: 24 }, (_, m) => genres.map((genre, k) => [monthStart(2022, 1, m), genre, Math.round(base[k] + amp[k] * Math.sin((2 * Math.PI * m) / 12 + phase[k]) + trend[k] * m)] as Cell[])).flat();
    return datasetOf("reproducoes-por-genero.csv", P(l, "Reproduções por gênero musical", "Plays by music genre"),
      P(l, "Dois anos de um serviço de música fictício: quanto cada gênero foi ouvido em cada mês, em milhares.", "Two years of a fictional music service: how much each genre was played each month, in thousands."),
      [date("month", P(l, "Mes", "Month")), cat("genre", P(l, "Genero", "Genre"), genres), int("plays", P(l, "Reproducoes_mil", "Plays_thousands"))],
      rows);
  },

  unemployment: (l) => {
    const regions: Array<[string, number, number]> = [[P(l, "Norte", "North"), 10.8, 8.1], [P(l, "Nordeste", "Northeast"), 13.9, 10.6], [P(l, "Sudeste", "Southeast"), 11.6, 7.9], [P(l, "Sul", "South"), 7.4, 5.2], [P(l, "Centro-Oeste", "Central-West"), 9.3, 6.4], [P(l, "Grande metrópole", "Metro area"), 12.1, 8.3], [P(l, "Interior", "Countryside"), 8.7, 6.9], [P(l, "Litoral", "Coast"), 9.9, 10.4]];
    return datasetOf("desemprego-por-regiao.csv", P(l, "Desemprego por região", "Unemployment by region"),
      P(l, "Taxa de desemprego em oito regiões fictícias em dois momentos: 2019 e 2023. Quase todas caíram, uma subiu.", "Unemployment rate in eight fictional regions at two moments: 2019 and 2023. Almost all fell, one rose."),
      [cat("year", P(l, "Ano", "Year"), ["2019", "2023"]), cat("region", P(l, "Regiao", "Region")), pct("rate", P(l, "Taxa_desemprego_pct", "Unemployment_rate_pct"))],
      regions.flatMap(([region, a, b]) => [["2019", region, a], ["2023", region, b]]).sort((p, q) => String(p[0]).localeCompare(String(q[0]))));
  },

  activity: (l) => {
    const rand = rng(127);
    return datasetOf("atividade-diaria.csv", P(l, "Contribuições diárias", "Daily contributions"),
      P(l, "Quatro meses de trabalho de uma equipe fictícia de software: quantas contribuições em cada dia.", "Four months of a fictional software team's work: how many contributions each day."),
      [date("day", P(l, "Data", "Date")), int("commits", P(l, "Contribuicoes", "Contributions"))],
      Array.from({ length: 120 }, (_, i) => {
        const day = addDaysIso("2024-01-01", i);
        const weekday = new Date(2024, 0, 1 + i).getDay();
        const weekend = weekday === 0 || weekday === 6;
        const sprint = Math.floor(i / 14) % 2 === 1 ? 1.4 : 1;
        return [day, Math.max(0, Math.round((weekend ? 1 : 7 * sprint) * (0.4 + rand() * 1.2)))];
      }));
  },

  tempHistory: (l) => {
    const z = gaussian(rng(131));
    return datasetOf("temperatura-mensal.csv", P(l, "Temperatura média mensal", "Monthly average temperature"),
      P(l, "Seis anos de temperatura média mensal numa cidade fictícia: o ciclo das estações e um leve aquecimento.", "Six years of monthly average temperature in a fictional city: the seasonal cycle and slight warming."),
      [date("month", P(l, "Mes", "Month")), num("temp", P(l, "Temp_media_C", "Average_temp_C"))],
      Array.from({ length: 72 }, (_, m) => [monthStart(2018, 1, m), round(22.5 + 5.5 * Math.sin((2 * Math.PI * (m - 10)) / 12) + 0.04 * m + 0.6 * z(), 1)]));
  },

  milestones: (l) => {
    const plan = P(l, "Planejamento", "Planning");
    const run = P(l, "Execução", "Execution");
    const ship = P(l, "Entrega", "Delivery");
    return datasetOf("marcos-do-projeto.csv", P(l, "Marcos do projeto", "Project milestones"),
      P(l, "A linha do tempo de um app de mobilidade fictício, do início do planejamento ao balanço do primeiro mês.", "The timeline of a fictional mobility app, from the start of planning to the first-month review."),
      [text("event", P(l, "Marco", "Milestone")), date("day", P(l, "Data", "Date")), cat("phase", P(l, "Fase", "Phase"), [plan, run, ship])],
      [[P(l, "Kickoff do projeto", "Project kickoff"), "2024-01-15", plan], [P(l, "Pesquisa com usuários", "User research"), "2024-02-05", plan], [P(l, "Protótipo aprovado", "Prototype approved"), "2024-03-08", plan], [P(l, "Início do desenvolvimento", "Development starts"), "2024-03-18", run], [P(l, "MVP interno", "Internal MVP"), "2024-05-24", run], [P(l, "Testes beta", "Beta testing"), "2024-06-17", run], [P(l, "Correção de falhas críticas", "Critical bugs fixed"), "2024-07-12", run], [P(l, "Integração de pagamentos", "Payments integrated"), "2024-08-02", run], [P(l, "Campanha de pré-lançamento", "Pre-launch campaign"), "2024-08-26", ship], [P(l, "Publicação nas lojas", "Store release"), "2024-09-16", ship], [P(l, "Lançamento oficial", "Official launch"), "2024-10-01", ship], [P(l, "Balanço de 30 dias", "30-day review"), "2024-10-31", ship]]);
  },

  tasks: (l) => {
    const plan = P(l, "Planejamento", "Planning");
    const run = P(l, "Execução", "Execution");
    const ship = P(l, "Entrega", "Delivery");
    return datasetOf("cronograma-do-projeto.csv", P(l, "Cronograma do projeto", "Project schedule"),
      P(l, "Dez tarefas de um app fictício, cada uma com início e fim, agrupadas por fase, com sobreposições.", "Ten tasks of a fictional app, each with start and end, grouped by phase, with overlaps."),
      [text("task", P(l, "Tarefa", "Task")), date("start", P(l, "Inicio", "Start")), date("end", P(l, "Fim", "End")), cat("phase", P(l, "Fase", "Phase"), [plan, run, ship])],
      [[P(l, "Pesquisa com usuários", "User research"), "2024-02-05", "2024-03-01", plan], [P(l, "Prototipagem", "Prototyping"), "2024-02-26", "2024-03-15", plan], [P(l, "Arquitetura técnica", "Technical architecture"), "2024-03-04", "2024-03-22", plan], [P(l, "Desenvolvimento do back-end", "Back-end development"), "2024-03-18", "2024-06-14", run], [P(l, "Desenvolvimento do app", "App development"), "2024-04-01", "2024-06-28", run], [P(l, "Integração de pagamentos", "Payments integration"), "2024-06-10", "2024-08-02", run], [P(l, "Testes beta", "Beta testing"), "2024-06-17", "2024-07-26", run], [P(l, "Campanha de pré-lançamento", "Pre-launch campaign"), "2024-07-29", "2024-09-13", ship], [P(l, "Publicação nas lojas", "Store release"), "2024-09-02", "2024-09-16", ship], [P(l, "Lançamento", "Launch"), "2024-09-23", "2024-10-01", ship]]);
  },
};

export const views: Record<string, ViewBuilder> = {
  histogram: (l) => view(l, "supportTime", { x: "ticket", y: "minutes" }, ["Tempo de primeira resposta do suporte", "Support first response time"], ["minutos por chamado · 150 chamados", "minutes per ticket · 150 tickets"]),
  density: (l) => view(l, "supportTime", { x: "ticket", y: "minutes" }, ["Como o tempo de resposta se distribui", "How response time is distributed"], ["minutos por chamado · 150 chamados", "minutes per ticket · 150 tickets"]),
  "stem-leaf": (l) => view(l, "examScores", { x: "student", y: "score" }, ["Notas da prova de matemática", "Math exam scores"], ["36 estudantes · nota de 0 a 100", "36 students · score from 0 to 100"]),
  boxplot: (l) => view(l, "salaries", { x: "dept", y: "salary" }, ["Salários por departamento", "Salaries by department"], ["salário mensal", "monthly salary"]),
  violin: (l) => view(l, "classScores", { x: "class", y: "score" }, ["Notas por turma", "Scores by class"], ["distribuição das notas de 0 a 10", "score distribution from 0 to 10"]),
  ridgeline: (l) => view(l, "dailyTemp", { x: "month", y: "temp" }, ["Temperaturas máximas, mês a mês", "Daily highs, month by month"], ["°C · 30 dias por mês", "°C · 30 days per month"]),
  beeswarm: (l) => view(l, "commuteTime", { x: "mode", y: "minutes" }, ["Tempo de percurso até o trabalho", "Commute time to work"], ["cada ponto é uma viagem · minutos", "each dot is a trip · minutes"]),
  strip: (l) => view(l, "commuteTime", { x: "mode", y: "minutes" }, ["Cada viagem, por meio de transporte", "Every trip, by transport mode"], ["minutos de casa ao trabalho", "minutes from home to work"]),
  "population-pyramid": (l) => view(l, "pyramid", { x: "age", y: "pop", s: "sex" }, ["Estrutura etária", "Age structure"], ["milhares de pessoas por faixa etária", "thousands of people by age group"]),
  "error-bars": (l) => view(l, "plants", { x: "treatment", y: "growth" }, ["Crescimento das plantas por tratamento", "Plant growth by treatment"], ["média e intervalo de confiança de 95%, cm", "mean and 95% confidence interval, cm"]),
  scatter: (l) => view(l, "study", { x: "hours", y: "score", s: "shift" }, ["Horas de estudo × nota", "Study hours × score"], ["cada ponto é um estudante", "each dot is a student"]),
  bubble: (l) => view(l, "towns", { x: "income", y: "life", s: "region", size: "pop" }, ["Renda × expectativa de vida", "Income × life expectancy"], ["tamanho = população; cor = região", "size = population; color = region"]),
  "connected-scatter": (l) => view(l, "fuel", { x: "price", y: "volume" }, ["Preço da gasolina × consumo, ano a ano", "Gasoline price × consumption, year by year"], ["a linha segue a ordem dos anos", "the line follows the order of the years"], true),
  heatmap: (l) => view(l, "calls", { x: "hour", y: "calls", s: "day" }, ["Chamados por dia e hora", "Calls by day and hour"], ["quanto mais escuro, mais chamados", "the darker, the more calls"]),
  correlogram: (l) => view(l, "corr", { x: "a", y: "r", s: "b" }, ["Correlação entre indicadores de saúde", "Correlation among health indicators"], ["coeficiente de Pearson, de −1 a 1", "Pearson coefficient, from −1 to 1"], true),
  parallel: (l) => view(l, "cars", { x: "model", y: "power", s: "type" }, ["Perfis de carros em coordenadas paralelas", "Car profiles in parallel coordinates"], ["cada linha é um modelo; cor = categoria", "each line is a model; color = category"]),
  radar: (l) => view(l, "profiles", { x: "city" }, ["Perfil das cidades", "City profiles"], ["notas de 0 a 100 em seis áreas", "scores from 0 to 100 in six areas"]),
  slope: (l) => view(l, "unemployment", { x: "year", y: "rate", s: "region" }, ["Desemprego por região, 2019 → 2023", "Unemployment by region, 2019 → 2023"], ["taxa de desemprego, %", "unemployment rate, %"]),
  line: (l) => view(l, "visits", { x: "month", y: "visits", s: "channel" }, ["Visitas ao site por canal", "Website visits by channel"], ["visitas por mês", "visits per month"]),
  area: (l) => view(l, "reservoir", { x: "month", y: "volume" }, ["Volume do reservatório", "Reservoir volume"], ["hm³ armazenados por mês", "stored hm³ per month"]),
  "stacked-area": (l) => view(l, "sectorEnergy", { x: "month", y: "gwh", s: "sector" }, ["Consumo de energia por setor", "Energy use by sector"], ["GWh por mês", "GWh per month"]),
  streamgraph: (l) => view(l, "music", { x: "month", y: "plays", s: "genre" }, ["Gêneros musicais ao longo do tempo", "Music genres over time"], ["milhares de reproduções por mês", "thousands of plays per month"]),
  calendar: (l) => view(l, "activity", { x: "day", y: "commits" }, ["Contribuições da equipe, dia a dia", "Team contributions, day by day"], ["janeiro a abril de 2024", "January to April 2024"]),
  spiral: (l) => view(l, "tempHistory", { x: "month", y: "temp" }, ["Seis anos de temperatura, em espiral", "Six years of temperature, in a spiral"], ["°C médios por mês; cada volta é um ano", "average °C per month; each turn is a year"]),
  timeline: (l) => view(l, "milestones", { x: "event", y: "day", s: "phase" }, ["Marcos do projeto", "Project milestones"], ["de janeiro a outubro de 2024", "from January to October 2024"], true),
  gantt: (l) => view(l, "tasks", { x: "task", y: "start", s: "phase", size: "end" }, ["Cronograma do projeto", "Project schedule"], ["início e fim de cada tarefa", "start and end of each task"]),
};
