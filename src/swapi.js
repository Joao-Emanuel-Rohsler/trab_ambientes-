const http = require("http");
const https = require("https");

const URL_BASE_API = "https://swapi.dev/api/";
const QUANTIDADE_NAVES = 3;
const POPULACAO_LIMITE = 1000000000;
const DIAMETRO_LIMITE = 10000;
const LIMITE_VEICULOS = 4;
const CODIGO_SUCESSO = 200;
const CODIGO_NAO_ENCONTRADO = 404;
const PORTA_PADRAO = 3000;
const INDEX_NAO_ENCONTRADO = -1;
const ARGUMENTO_EXTRA = 1;
const elementosIgnorados= 2;
const HTTP_ERRO = 400;

let modoDepuracao = true;
let tempoLimite = 5000;
let contadorErros = 0;
let contadorRequisicoes = 0;
let tamanhoDados = 0;
let ultimoId = 1;
const cache = {};

function criarRequisicao(endpoint, resolve, reject) {
    let dados = "";

    const req = https.get(`${URL_BASE_API}${endpoint}`, { rejectUnauthorized: false }, (res) => {
        if (res.statusCode >= HTTP_ERRO) {
            contadorErros++;
            return reject(new Error(`Request failed with status code ${res.statusCode}`));
        }

        res.on("data", (chunk) => dados += chunk);
        res.on("end", () => {
            try {
                const json = JSON.parse(dados);
                cache[endpoint] = json;
                if (modoDepuracao) logCache(endpoint);
                resolve(json);
            } catch (erro) {
                contadorErros++;
                reject(erro);
            }
        });
    });

    req.on("error", (e) => {
        contadorErros++;
        reject(e);
    });

    req.setTimeout(tempoLimite, () => {
        req.abort();
        contadorErros++;
        reject(new Error(`Request timeout for ${endpoint}`));
    });
}

function logCache(endpoint) {
    console.log(`Successfully fetched data for ${endpoint}`);
    console.log(`Cache size: ${Object.keys(cache).length}`);
}

async function buscarDados(endpoint) {
    if (cache[endpoint]) {
        if (modoDepuracao) console.log("Using cached data for", endpoint);
        return cache[endpoint];
    }

    return new Promise((resolve, reject) => {
        criarRequisicao(endpoint, resolve, reject);
    });
}

function exibirCampo(label, valor) {
    if (valor) console.log(`${label}: ${valor}`);
}

function mostrarDetalhes(item, tipo, indice = null) {
    const titulo = indice !== null ? `${tipo} ${indice + 1}` : `Featured ${tipo}`;
    console.log(`\n${titulo}:`);

    exibirCampo("Name", item.name);
    exibirCampo("Model", item.model);
    exibirCampo("Manufacturer", item.manufacturer);
    exibirCampo("Cost", item.cost_in_credits !== "unknown" ? `${item.cost_in_credits} credits` : "unknown");
    exibirCampo("Length", item.length);
    exibirCampo("Crew Required", item.crew);
    exibirCampo("Passengers", item.passengers);
    exibirCampo("Speed", item.max_atmosphering_speed);
    exibirCampo("Hyperdrive Rating", item.hyperdrive_rating);
    exibirCampo("Pilots", item.pilots?.length);
}

function exibirPlaneta(planeta) {
    if (
        planeta.population !== "unknown" &&
        planeta.diameter !== "unknown" &&
        parseInt(planeta.population) > POPULACAO_LIMITE &&
        parseInt(planeta.diameter) > DIAMETRO_LIMITE
    ) {
        console.log(`${planeta.name} - Pop: ${planeta.population}`);
        console.log(`   Diameter: ${planeta.diameter} - Climate: ${planeta.climate}`);
        if (planeta.films?.length) {
            console.log(`   Appeaprs in ${planeta.films.length} films`);
        }
    }
}

async function executar() {
    try {
        if (modoDepuracao) console.log("Starting data fetch...");
        contadorRequisicoes++;

        const personagem = await buscarDados(`people/${ultimoId}`);
        tamanhoDados += JSON.stringify(personagem).length;

        console.log("Character:", personagem.name);
        console.log("Height:", personagem.height);
        console.log("Mass:", personagem.mass);
        console.log("Birthday:", personagem.birth_year);
        if (personagem.films?.length) {
            console.log(`Appears in ${personagem.films.length} films`);
        }

        const naves = await buscarDados("starships/?page=1");
        tamanhoDados += JSON.stringify(naves).length;
        console.log("\nTotal Starships:", naves.count);
        naves.results.slice(0, QUANTIDADE_NAVES).forEach((nave, i) => {
            mostrarDetalhes(nave, "Starship", i);
        });

        const planetas = await buscarDados("planets/?page=1");
        tamanhoDados += JSON.stringify(planetas).length;
        console.log("\nLarge populated planets:");
        planetas.results.forEach(exibirPlaneta);

        const filmes = await buscarDados("films/");
        tamanhoDados += JSON.stringify(filmes).length;

        const filmesOrdenados = filmes.results.sort(
            (a, b) => new Date(a.release_date) - new Date(b.release_date)
        );

        console.log("\nStar Wars Films in chronological order:");
        filmesOrdenados.forEach((filme, i) => {
            console.log(`${i + 1}. ${filme.title} (${filme.release_date})`);
            console.log(`   Director: ${filme.director}`);
            console.log(`   Producer: ${filme.producer}`);
            console.log(`   Characters: ${filme.characters.length}`);
            console.log(`   Planets: ${filme.planets.length}`);
        });

        if (ultimoId <= LIMITE_VEICULOS) {
            const veiculo = await buscarDados(`vehicles/${ultimoId}`);
            tamanhoDados += JSON.stringify(veiculo).length;
            mostrarDetalhes(veiculo, "Vehicle");
            ultimoId++;
        }

        if (modoDepuracao) {
            console.log("\nStats:");
            console.log("API Calls:", contadorRequisicoes);
            console.log("Cache Size:", Object.keys(cache).length);
            console.log("Total Data Size:", tamanhoDados, "bytes");
            console.log("Error Count:", contadorErros);
        }

    } catch (e) {
        console.error("Error:", e.message);
        contadorErros++;
    }
}

function configurar() {
    const args = process.argv.slice(elementosIgnorados);
    if (args.includes("--no-debug")) modoDepuracao = false;

    const indexTimeout = args.indexOf("--timeout");
    if (indexTimeout > INDEX_NAO_ENCONTRADO && indexTimeout < args.length - ARGUMENTO_EXTRA) {
        tempoLimite = parseInt(args[indexTimeout + 1]);
    }
}

function iniciarServidor() {
    const servidor = http.createServer((req, res) => {
        if (req.url === "/" || req.url === "/index.html") {
            res.writeHead(CODIGO_SUCESSO, { "Content-Type": "text/html" });
            res.end(gerarHTML());
        } else if (req.url === "/api") {
            executar();
            res.writeHead(CODIGO_SUCESSO, { "Content-Type": "text/plain" });
            res.end("Check server console for results");
        } else if (req.url === "/stats") {
            res.writeHead(CODIGO_SUCESSO, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                api_calls: contadorRequisicoes,
                cache_size: Object.keys(cache).length,
                data_size: tamanhoDados,
                errors: contadorErros,
                debug: modoDepuracao,
                timeout: tempoLimite
            }));
        } else {
            res.writeHead(CODIGO_NAO_ENCONTRADO, { "Content-Type": "text/plain" });
            res.end("Not Found");
        }
    });

    const porta = process.env.PORT || PORTA_PADRAO;
    servidor.listen(porta, () => {
        console.log(`Server running at http://localhost:${porta}/`);
        console.log("Open the URL in your browser and click the button to fetch Star Wars data");
        if (modoDepuracao) {
            console.log("Debug mode: ON");
            console.log("Timeout:", tempoLimite, "ms");
        }
    });
}

function gerarHTML() {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Star Wars API Demo</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                h1 { color: #FFE81F; background-color: #000; padding: 10px; }
                button { background-color: #FFE81F; border: none; padding: 10px 20px; cursor: pointer; }
                .footer { margin-top: 50px; font-size: 12px; color: #666; }
                pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>Star Wars API Demo</h1>
            <p>This page demonstrates fetching data from the Star Wars API.</p>
            <p>Check your console for the API results.</p>
            <button onclick="buscar()">Fetch Star Wars Data</button>
            <div id="results"></div>
            <script>
                function buscar() {
                    document.getElementById('results').innerHTML = '<p>Loading data...</p>';
                    fetch('/api')
                        .then(res => res.text())
                        .then(() => {
                            alert('API request made! Check server console.');
                            document.getElementById('results').innerHTML = '<p>Data fetched! Check server console.</p>';
                        })
                        .catch(err => {
                            document.getElementById('results').innerHTML = '<p>Error: ' + err.message + '</p>';
                        });
                }
            </script>
            <div class="footer">
                <p>API calls: ${contadorRequisicoes} 
                | Cache entries: ${Object.keys(cache).length} 
                | Errors: ${contadorErros}</p>
                <pre>Debug mode: ${modoDepuracao ? "ON" : "OFF"} 
                | Timeout: ${tempoLimite}ms</pre>
            </div>
        </body>
        </html>
    `;
}

configurar();
iniciarServidor();
