/**
 * build-datasets.mjs
 *
 * Dataset builder for drawline-core.
 * Strategy:
 *   Tier 1 — Live internet fetches (public-domain / open-license APIs)
 *   Tier 2 — Embedded real-world lists (industries with no clean free API)
 *   Tier 3 — Fix quality regressions in existing files
 *
 * Usage:  node scripts/build-datasets.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASETS  = path.join(__dirname, "../src/generator/datasets");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function write(name, data) {
  const sorted = [...new Set(data)].filter(Boolean).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  fs.writeFileSync(path.join(DATASETS, `${name}.json`), JSON.stringify(sorted, null, 2));
  console.log(`  ✓ ${name}.json  (${sorted.length} entries)`);
  return sorted;
}

async function fetchJSON(url, opts = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000), ...opts });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`  ⚠ fetch failed for ${url}: ${e.message}`);
    return null;
  }
}

function titleCase(s) {
  return s
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — Live fetches
// ─────────────────────────────────────────────────────────────────────────────
async function fetchCountries() {
  console.log("\n[Tier 1] Fetching countries from REST Countries API…");
  const data = await fetchJSON("https://restcountries.com/v3.1/all?fields=name,capital,cca2,region");
  if (!data) return;

  const countries = data.map(c => c.name?.common).filter(Boolean).sort();
  write("geography_countries", countries);
  liveFetched.add("geography_countries");

  const capitals = data
    .flatMap(c => c.capital ?? [])
    .filter(Boolean)
    .map(c => titleCase(c));
  write("geography_capitals", capitals);
  liveFetched.add("geography_capitals");

  const regions = [...new Set(data.map(c => c.region).filter(Boolean))];
  console.log(`  ✓ geography_regions detected: ${regions.join(", ")}`);
}

// Track which files were successfully written by live fetches so Tier 2/3
// doesn't overwrite them with the smaller embedded fallback.
const liveFetched = new Set();

async function fetchCities() {
  console.log("\n[Tier 1] Fetching world cities from CountriesNow API…");
  const data = await fetchJSON("https://countriesnow.space/api/v0.1/countries");
  if (!data?.data) {
    console.log("  ⚠ API unavailable — embedded fallback will be used");
    return; // writeEmbedded() will handle it
  }
  const cities = data.data
    .flatMap(c => c.cities ?? [])
    .map(c => titleCase(c))
    .filter(c => c.length > 2);
  write("geography_cities_global", cities);
  liveFetched.add("geography_cities_global");
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — Embedded real-world lists
// ─────────────────────────────────────────────────────────────────────────────
const EMBEDDED = {

  // ── Names ──────────────────────────────────────────────────────────────────
  firstNames: [
    // US/English
    "Emma","Liam","Olivia","Noah","Ava","Oliver","Isabella","Elijah","Sophia","James",
    "Charlotte","Asher","Amelia","Lucas","Mia","Leo","Harper","Henry","Evelyn","Theodore",
    "Camila","William","Luna","Mateo","Aria","Jack","Aurora","Sebastian","Scarlett","Aiden",
    "Penelope","Owen","Layla","Samuel","Riley","Daniel","Zoey","Jackson","Lily","Benjamin",
    "Nora","Levi","Eleanor","Mason","Hannah","Ethan","Lillian","Logan","Addison","Hudson",
    "Aubrey","Alexander","Ellie","Jayden","Stella","Caleb","Natalie","Luke","Zoe","Isaiah",
    "Leah","Lincoln","Hazel","Joshua","Violet","Julian","Savannah","Andrew","Brooklyn","Ezra",
    "Bella","Christopher","Claire","Josiah","Skylar","Christian","Victoria","Jordan","Lucy",
    "Ezekiel","Paisley","Robert","Everly","Charles","Anna","Thomas","Maya","Michael","Chloe",
    "Elias","Naomi","Ryan","Elena","Adrian","Alice","Jaxon","Sophie","Wyatt","Piper",
    "Hunter","Madelyn","Connor","Grace","Nathan","Laila","Adam","Aaliyah","Ian","Eliana",
    "Greyson","Aubree","Brayden","Serenity","Dominic","Cali","Luca","Kylie","Cameron","Peyton",
    "Tyler","Genesis","Jason","Jasmine","Jeremiah","Autumn","Nicholas","Emilia","Landon","Isabelle",
    "Dylan","Valentina","Jonathan","Ruby","Evan","Kennedy","Gabriel","Madeline","Gavin","Jade",
    "Marcus","Clara","Miles","Brianna","Aaron","Vivian","Blake","Alexis","Kevin","Mila",
    "Cooper","Lydia","Jesse","Reagan","Simon","Kyrie","Chase","Arabella","Zachary","Julia",
    "Austin","Melanie","Amir","Josephine","Easton","Molly","Declan","Willow","Theo","Caroline",
    "Jace","Fiona","Carter","Esme","Nolan","Audrey","Grant","Gianna","Ellis","Cecelia",
    "Archer","Delaney","Reid","Margot","Cole","Destiny","Ryder","Adriana","Sawyer","Mariana",
    "Xavier","Bianca","Spencer","Paige","Brody","Veronica","Roman","Alessia","Felix","Sienna",
    "Harrison","Amber","Seth","Selena","Brandon","Brielle","Kyle","Rosalie","Jaylen","Camille",
    "Preston","Kayla","Max","Summer","Tucker","Anastasia","Troy","Gabriella","Shane","Hailey",
    "Gage","Shelby","Beau","Morgan","Damon","Natasha","Phoenix","Freya","Jett","Iris",
    "Knox","Nina","Lachlan","Maeve","Blaine","Olive","Rhys","Angus","Rosa","Brennan",
    "Drew","Rachel","Colt","Sarah","Heath","Diana","Jasper","Fatima","Arlo","Zahra",
    "Bodhi","Riya","Orion","Aisha","River","Zara","Atlas","Noor","Remy","Finn",
    "Ollie","Hugo","Aya","Amara","Lena","Milo","Nadia","Nico","Alicia","Rafael",
    "Sofia","Marco","Carmen","Diego","Valentina","Pablo","Lucia","Ricardo","Gabriela","Andres",
    "Isabel","Luis","Ana","Carlos","Maria","Fernando","Rosa","Alejandro","Elena","Miguel",
    "Adriana","Eduardo","Daniela","Jorge","Paola","Roberto","Martina","Mario","Pedro","Andrea",
    "Juan","Alejandra","Victor","Monica","Sergio","Fernanda","Javier","Patricia","Felipe","Renata",
    "Nicolas","Valeria","Tomas","Catalina","Santiago","Rodrigo","Claudia","Lorenzo","Natalia",
    // Nordic
    "Henrik","Astrid","Lars","Ingrid","Erik","Sigrid","Bjorn","Maja","Sven","Elsa",
    "Nils","Lotta","Per","Britta","Mattias","Hanna","Johan","Karin","Andreas","Annika",
    "Mikael","Jonas","Sara","Tobias","Johanna","Carl","Lisa","Peter","Ida","Stefan",
    // German
    "Klaus","Monika","Lukas","Petra","Markus","Sabine","Wolfgang","Heike","Christoph","Nicole",
    "Georg","Stefanie","Dieter","Claudia","Manfred","Ulrike","Werner","Silke","Günter","Renate",
    "Holger","Kerstin","Bernd","Christine","Dirk","Frank","Marcel","Tobias","Florian","Katrin",
    // Indian
    "Arjun","Priya","Rohit","Sneha","Vikram","Anjali","Aditya","Pooja","Rahul","Deepa",
    "Amit","Nisha","Sanjay","Kavita","Rajesh","Swati","Suresh","Pallavi","Vijay","Meena",
    "Manoj","Rekha","Ramesh","Sunita","Gopal","Geeta","Kishore","Seema","Prakash","Uma",
    "Kiran","Lata","Ravi","Asha","Ajay","Usha","Arun","Madhu","Pankaj","Dinesh",
    "Hemant","Pushpa","Vivek","Shobha","Nilesh","Rani","Tushar","Sachin","Shyam","Sudha",
    "Mohan","Siddharth","Gaurav","Neha","Vinay","Divya","Anand","Shilpa","Krishna","Lakshmi",
    "Sunil","Sundar","Pavan","Kavya","Harish","Smita","Nikhil","Tanvi","Yash","Richa",
    // East Asian
    "Wei","Fang","Lin","Xiao","Yong","Jing","Ming","Ling","Hui","Hong",
    "Yan","Lei","Qing","Chao","Jun","Ying","Chen","Hao","Peng","Xin",
    "Ryo","Yuki","Hana","Kenji","Naomi","Takeshi","Ayaka","Hiroshi","Sakura","Kazuki",
    "Miyu","Sora","Daiki","Rin","Haruto","Yui","Sota","Mei","Ren","Aoi",
    "Ji-hoon","Soo-yeon","Min-jun","Ye-jin","Hyun-woo","Ji-yeon","Sung-min","Da-eun","Tae-yang","Ha-eun",
  ],

  lastNames: [
    // US/English
    "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
    "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
    "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
    "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
    "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
    "Turner","Phillips","Evans","Diaz","Parker","Cruz","Edwards","Collins","Stewart","Morris",
    "Morales","Murphy","Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper","Peterson","Bailey",
    "Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson","Watson","Brooks",
    "Chavez","Wood","James","Bennett","Gray","Mendoza","Ruiz","Hughes","Price","Alvarez",
    "Castillo","Sanders","Patel","Myers","Long","Ross","Foster","Jimenez","Powell","Jenkins",
    "Perry","Russell","Sullivan","Bell","Coleman","Butler","Henderson","Barnes","Gonzales","Fisher",
    "Vasquez","Simmons","Romero","Jordan","Patterson","Alexander","Hamilton","Graham","Reynolds","Griffin",
    "Wallace","Moreno","West","Cole","Hayes","Bryant","Herrera","Gibson","Ellis","Tran",
    "Medina","Aguilar","Stevens","Murray","Ford","Castro","Marshall","Owens","Harrison","Fernandez",
    "Woods","Washington","Kennedy","Wells","Shaw","Porter","Daniels","Burns","Hicks","Spencer",
    "Hawkins","Crawford","Norris","Warren","Dixon","Palmer","Wagner","Woods","Barker","Coleman",
    // German
    "Fischer","Weber","Schmidt","Meyer","Schulz","Becker","Hoffmann","Schäfer","Koch","Richter",
    "Bauer","Klein","Wolf","Braun","Hofmann","Neumann","Schwarz","Zimmermann","Krüger","Hartmann",
    "Lange","Werner","Schmitt","Krause","Meier","Lehmann","Müller","Schneider","König","Lang",
    // Austrian
    "Gruber","Huber","Mayer","Reiter","Berger","Maier","Wimmer","Egger","Fuchs","Winkler",
    "Moser","Auer","Brunner","Wallner","Weiss","Leitner","Baumgartner","Böhm","Steiner",
    // French
    "Dupont","Martin","Bernard","Dubois","Thomas","Robert","Richard","Petit","Durand","Leroy",
    "Moreau","Simon","Michel","Lefebvre","Mercier","Blanc","Guerin","Henry","Roussel","Nicolas",
    "Girard","Bonnet","François","Rousseau","Vincent","Fournier","Morel","Aubert","Clément",
    // Canadian French
    "Tremblay","Roy","Gagnon","Côté","Bouchard","Gauthier","Morin","Lavoie","Fortin","Gagné",
    "Ouellet","Pelletier","Bergeron","Leblanc","Martel","Simard","Bélanger","Lacroix","Poirier",
    // Portuguese/Brazilian
    "da Silva","dos Santos","de Oliveira","Alves","Ferreira","Rodrigues","Gomes","Martins","Lima",
    "Carvalho","Ribeiro","Araújo","Lopes","Pereira","Sousa","Costa","Monteiro","Cardoso","Melo",
    "Ramos","Barros","Pinto","Tavares","Vieira","Nunes","Correia","Marques","Fonseca","Teixeira",
    // Korean
    "Park","Kim","Lee","Choi","Jung","Kang","Cho","Yoon","Lim","Han",
    "Oh","Shin","Yang","Hong","Ko","Jeon","Bae","Cha","Jang","Son",
    // Japanese
    "Tanaka","Sato","Suzuki","Watanabe","Yamamoto","Nakamura","Kobayashi","Ito","Kato","Yoshida",
    "Yamada","Sasaki","Yamaguchi","Matsumoto","Inoue","Kimura","Hayashi","Shimizu","Mori","Abe",
    "Ikeda","Hashimoto","Yamashita","Ishikawa","Nakajima","Maeda","Fujita","Ogawa","Saito",
    // Chinese
    "Chen","Wang","Li","Zhang","Liu","Yang","Huang","Zhao","Wu","Zhou",
    "Sun","Xu","Ma","Zhu","Hu","Lin","Guo","He","Luo","Zheng",
    // Indian
    "Patel","Shah","Mehta","Sharma","Verma","Gupta","Singh","Kumar","Mishra","Yadav",
    "Pandey","Tiwari","Shukla","Srivastava","Chaudhary","Maurya","Rao","Nair","Pillai","Menon",
    "Iyer","Krishnan","Bose","Chatterjee","Banerjee","Ghosh","Sen","Chakraborty","Das","Roy",
    "Dey","Mukherjee","Reddy","Naidu","Prasad","Raju","Varma","Ahuja","Kapoor","Malhotra",
    "Khanna","Arora","Bhatia","Sethi","Mehra","Chopra","Kaur",
    // Arabic/Middle Eastern
    "Hassan","Ibrahim","Abdullah","Mohammed","Omar","Ahmad","Malik","Khan","Hussain","Siddiqui",
    "Qureshi","Ansari","Sheikh","Shaikh","Mirza","Khalid","Rahimi","Karimi","Ahmadi","Hosseini",
  ],

  // ── Geography ──────────────────────────────────────────────────────────────
  cities: [
    // USA
    "New York City","Los Angeles","Chicago","Houston","Phoenix","Philadelphia","San Antonio",
    "San Diego","Dallas","San Jose","Austin","Jacksonville","San Francisco","Columbus","Indianapolis",
    "Fort Worth","Charlotte","Seattle","Denver","Nashville","El Paso","Washington DC","Boston",
    "Las Vegas","Portland","Memphis","Louisville","Baltimore","Milwaukee","Albuquerque","Tucson",
    "Fresno","Sacramento","Mesa","Atlanta","Omaha","Colorado Springs","Raleigh","Miami",
    "Minneapolis","New Orleans","Cleveland","Tampa","Orlando","Pittsburgh","Cincinnati","Aurora",
    "Anaheim","Honolulu","Lexington","St. Louis","Stockton","Madison","Durham","Lubbock",
    "Baton Rouge","Irvine","Scottsdale","Reno","Spokane","Des Moines","Salt Lake City",
    "Tallahassee","Providence","Fort Lauderdale","Grand Rapids","Yonkers","Birmingham","Rochester",
    "Buffalo","Richmond","Glendale","Hialeah","Garland","Chesapeake","Norfolk","Chandler",
    // UK
    "London","Manchester","Birmingham","Leeds","Glasgow","Liverpool","Bristol","Sheffield",
    "Edinburgh","Cardiff","Belfast","Leicester","Coventry","Bradford","Nottingham","Newcastle",
    // France
    "Paris","Lyon","Marseille","Toulouse","Nice","Nantes","Strasbourg","Montpellier",
    "Bordeaux","Rennes","Reims","Toulon","Grenoble","Dijon","Angers","Nîmes",
    // Germany
    "Berlin","Hamburg","Munich","Cologne","Frankfurt","Stuttgart","Düsseldorf","Leipzig",
    "Dortmund","Essen","Dresden","Bremen","Hannover","Nuremberg","Duisburg","Bochum",
    // Spain
    "Madrid","Barcelona","Valencia","Seville","Zaragoza","Málaga","Murcia","Palma",
    "Las Palmas","Bilbao","Alicante","Córdoba","Valladolid","Vigo","Granada",
    // Italy
    "Rome","Milan","Naples","Turin","Palermo","Genoa","Bologna","Florence","Bari","Venice",
    // Russia
    "Moscow","Saint Petersburg","Novosibirsk","Yekaterinburg","Kazan","Nizhny Novgorod",
    "Chelyabinsk","Omsk","Samara","Rostov-on-Don","Ufa","Krasnoyarsk","Perm","Volgograd",
    // China
    "Beijing","Shanghai","Guangzhou","Shenzhen","Tianjin","Wuhan","Chengdu","Nanjing",
    "Chongqing","Hangzhou","Suzhou","Dongguan","Xi'an","Shenyang","Harbin","Qingdao",
    "Jinan","Changsha","Zhengzhou","Dalian","Hefei","Kunming","Fuzhou","Xiamen","Nanning",
    // Japan
    "Tokyo","Osaka","Yokohama","Nagoya","Sapporo","Kobe","Kyoto","Fukuoka",
    "Kawasaki","Saitama","Hiroshima","Sendai","Kitakyushu","Chiba","Sagamihara",
    // India
    "Mumbai","Delhi","Bangalore","Hyderabad","Chennai","Kolkata","Ahmedabad","Pune",
    "Surat","Jaipur","Lucknow","Kanpur","Nagpur","Indore","Thane","Bhopal",
    "Visakhapatnam","Patna","Vadodara","Coimbatore","Agra","Nashik","Ranchi","Faridabad",
    "Meerut","Rajkot","Kalyan","Vasai-Virar","Varanasi","Srinagar","Aurangabad","Dhanbad",
    // Australia
    "Sydney","Melbourne","Brisbane","Perth","Adelaide","Gold Coast","Canberra","Newcastle","Wollongong",
    // Canada
    "Toronto","Montreal","Vancouver","Calgary","Edmonton","Ottawa","Winnipeg","Quebec City","Hamilton",
    // Brazil
    "São Paulo","Rio de Janeiro","Brasília","Salvador","Fortaleza","Belo Horizonte",
    "Manaus","Curitiba","Recife","Porto Alegre","Belém","Goiânia","Guarulhos","Campinas",
    // Mexico
    "Mexico City","Guadalajara","Monterrey","Puebla","Toluca","Tijuana","León","Juárez","Mérida",
    // LATAM
    "Buenos Aires","Córdoba","Rosario","Mendoza","Santiago","Valparaíso","Concepción",
    "Bogotá","Medellín","Cali","Barranquilla","Lima","Arequipa","Trujillo",
    // Africa & Middle East
    "Cairo","Alexandria","Giza","Lagos","Kano","Ibadan","Abuja","Nairobi","Dar es Salaam",
    "Johannesburg","Cape Town","Durban","Pretoria","Casablanca","Tunis",
    "Istanbul","Ankara","Izmir","Riyadh","Jeddah","Dubai","Abu Dhabi","Tehran","Baghdad",
    // South & Southeast Asia
    "Dhaka","Karachi","Lahore","Colombo","Kathmandu","Yangon","Bangkok","Jakarta","Manila",
    "Ho Chi Minh City","Hanoi","Kuala Lumpur","Singapore","Taipei","Hong Kong",
    // Europe (remaining)
    "Vienna","Brussels","Amsterdam","Rotterdam","Copenhagen","Stockholm","Oslo","Helsinki",
    "Zurich","Geneva","Lisbon","Porto","Dublin","Warsaw","Kraków","Prague","Budapest",
    "Bucharest","Sofia","Athens","Belgrade","Zagreb","Bratislava","Vilnius","Riga","Tallinn",
    "Kyiv","Kharkiv","Tbilisi","Yerevan","Baku","Almaty","Tashkent",
  ],

  streets: [
    "Main Street","Oak Avenue","Maple Drive","Cedar Lane","Pine Road","Elm Street",
    "Washington Boulevard","Lincoln Avenue","Jefferson Street","Park Road","Lake Drive",
    "River Road","Forest Avenue","Hill Street","Valley Drive","Spring Lane",
    "Sunset Boulevard","Highland Avenue","Meadow Lane","Willow Avenue","Cherry Lane",
    "Birch Street","Ash Road","Walnut Avenue","Chestnut Street","Poplar Drive",
    "Hickory Lane","Magnolia Avenue","Sycamore Street","Cypress Drive","Laurel Lane",
    "Dogwood Road","Mulberry Street","Locust Avenue","Hawthorn Drive","Juniper Lane",
    "Spruce Street","Hemlock Road","Beech Avenue","Acacia Drive","Alder Lane",
    "Aspen Court","Bay Avenue","Bayberry Lane","Beacon Street","Birchwood Lane",
    "Blossom Court","Blue Ridge Road","Boulder Drive","Brentwood Avenue","Briarwood Lane",
    "Bridge Street","Brookside Lane","Canyon Road","Cardinal Lane","Carriage Drive",
    "Centennial Boulevard","Church Street","Cliffside Drive","Colonial Drive","Country Club Road",
    "Creekside Lane","Crescent Drive","Crestview Avenue","Crystal Lake Road","Deer Run Road",
    "Eagle Ridge Road","Eastgate Drive","Edgewood Lane","Embassy Drive","Evergreen Terrace",
    "Fairfield Road","Fairview Avenue","Fall Creek Road","Ferndale Drive","First Street",
    "Floral Avenue","Fountain Drive","Fox Run Road","Franklin Street","Front Street",
    "Garden Avenue","Glen Road","Glenbrook Drive","Glendale Avenue","Golden Gate Avenue",
    "Golf Course Road","Grandview Drive","Grant Avenue","Green Meadow Road","Greenfield Lane",
    "Greenleaf Avenue","Greenview Drive","Greenwood Avenue","Grove Street","Hamilton Street",
    "Hampton Road","Harbor Drive","Harrison Street","Haven Road","Heather Lane",
    "Heritage Road","Highland Drive","Hillcrest Avenue","Hillside Drive","Holly Lane",
    "Homestead Road","Horizon Drive","Independence Avenue","Industrial Boulevard","Ivywood Lane",
    "Kensington Drive","Keystone Road","Lake Shore Drive","Lakeland Drive","Lakeview Road",
    "Lakewood Drive","Lancaster Road","Lavender Lane","Lawn Avenue","Liberty Street",
    "Lighthouse Road","Lincoln Boulevard","Linden Street","Longview Drive","Lookout Road",
    "Maplewood Drive","Market Street","Meadow Brook Road","Meadowlark Lane","Mill Road",
    "Millbrook Lane","Mission Boulevard","Monterey Avenue","Morning Glory Lane","Mountain View Drive",
    "North Shore Drive","Oak Hollow Drive","Oak Ridge Road","Oakdale Avenue","Oakwood Drive",
    "Orchard Avenue","Orchard Lane","Overlook Drive","Pacific Avenue","Palm Drive",
    "Paradise Road","Park Avenue","Park Lane","Parkside Drive","Parkview Avenue",
    "Peach Tree Lane","Pearl Street","Pinecrest Avenue","Pinehurst Drive","Pioneer Road",
    "Poplar Lane","Prairie View Road","Primrose Lane","Redwood Drive","Ridge Road",
    "Ridgewood Avenue","Riverside Drive","Rock Creek Road","Rolling Hills Road","Rose Lane",
    "Rosewood Avenue","Royal Drive","Rustic Lane","Sage Drive","Second Street",
    "Sherwood Drive","Shore Drive","Shoreline Drive","Silver Lake Road","Silverwood Lane",
    "Skyline Drive","Spring Creek Road","Spring Garden Road","Springfield Drive",
    "State Street","Stonewall Drive","Strawberry Lane","Summerfield Drive","Sunflower Lane",
    "Sunrise Drive","Surrey Lane","Sycamore Lane","Tanglewood Drive","Terrace Drive",
    "Third Street","Timber Lane","Timberline Drive","Tower Road","Town Center Drive",
    "Trailwood Drive","Trinity Road","Tulip Lane","Turtle Creek Road","Twin Oaks Road",
    "University Avenue","Valley View Road","Vine Street","Vineyard Lane","Violet Lane",
    "Vista Drive","Walden Road","Westgate Drive","Westridge Road","Westview Drive",
    "White Oak Lane","Wildflower Lane","Wildwood Drive","Willow Creek Road","Willowbrook Lane",
    "Wilshire Boulevard","Windmill Road","Windswept Lane","Woodland Drive","Wren Lane",
    "Yellowstone Road","Zephyr Drive","Ashford Road","Belmont Avenue","Brooksdale Court",
    "Cambridge Street","Dartmouth Avenue","Exeter Road","Fairmont Drive","Georgetown Pike",
    "Harvard Street","Ivy Lane","Jasmine Court","Kilburn Road","Lexington Avenue",
    "Manchester Drive","Newport Road","Oxford Street","Plymouth Road","Queensbury Drive",
    "Rockingham Road","Somerset Lane","Thornwood Drive","Upland Road","Vermont Avenue",
    "Warwick Road","Exeter Street","Yorktown Road","Zimmerman Road",
  ],

  // ── Companies ──────────────────────────────────────────────────────────────
  companies: [
    // Tech – Hardware / Chips
    "Apple","Microsoft","Google","Amazon","Meta","Tesla","Nvidia","Intel","AMD","Qualcomm",
    "Broadcom","TSMC","Texas Instruments","Applied Materials","Micron Technology",
    "Western Digital","Seagate","Kingston Technology","Logitech","Razer","Corsair",
    "Samsung Electronics","SK Hynix","Sony","Panasonic","LG","Toshiba","Fujitsu",
    "Hitachi","NEC","Canon","Ricoh","Xerox","Zebra Technologies",
    // Tech – Enterprise
    "IBM","Oracle","SAP","Cisco","HPE","HP Inc","Dell Technologies","Lenovo","ASUS","Acer",
    // Tech – Cloud & SaaS
    "Salesforce","Adobe","Workday","ServiceNow","Snowflake","Databricks","Palantir",
    "Twilio","Zendesk","HubSpot","Freshworks","Zoho","Pipedrive","Monday.com","Asana",
    "ClickUp","Notion","Airtable","Miro","Figma","Canva","Webflow","Wix","Squarespace",
    "Shopify","BigCommerce","Mailchimp","Constant Contact","Campaign Monitor",
    // Tech – Security
    "Palo Alto Networks","CrowdStrike","SentinelOne","Okta","Ping Identity","CyberArk",
    "Fortinet","Check Point","Zscaler","Rapid7","Tenable","Qualys","Cloudflare","Akamai","Fastly",
    // Tech – Developer & DevOps
    "GitHub","GitLab","Atlassian","JFrog","HashiCorp","Docker","Red Hat","SUSE","Canonical",
    "Netlify","Vercel","Render","PlanetScale","Neon","Supabase","Heroku",
    // Tech – AI & Data
    "OpenAI","Anthropic","Cohere","Mistral","Hugging Face","Scale AI","Weights & Biases",
    "Grafana Labs","Elastic","Splunk","Sumo Logic","Datadog","New Relic","Dynatrace","PagerDuty",
    // Fintech
    "Stripe","Square","PayPal","Adyen","Klarna","Affirm","Coinbase","Robinhood","Revolut",
    "Monzo","Wise","Chime","Plaid","Marqeta","Toast","Brex","Ramp","Nubank","SumUp",
    // Banking
    "JPMorgan Chase","Bank of America","Wells Fargo","Citigroup","Goldman Sachs","Morgan Stanley",
    "Barclays","HSBC","Deutsche Bank","BNP Paribas","Credit Agricole","UBS","Société Générale",
    "Lloyds Banking Group","Natwest Group","Standard Chartered","ING Group","ABN AMRO",
    "Unicredit","Intesa Sanpaolo","BBVA","Santander","CaixaBank","Royal Bank of Canada",
    "TD Bank","Scotiabank","BMO","CIBC","Westpac","ANZ","Commonwealth Bank","Macquarie",
    "Mitsubishi UFJ Financial","Sumitomo Mitsui","Mizuho Financial","ICBC",
    "China Construction Bank","Bank of China","Agricultural Bank of China",
    // Insurance
    "Berkshire Hathaway","AXA","Ping An Insurance","Allianz","Munich Re","Zurich Insurance",
    "MetLife","Prudential","Sun Life","Manulife","Aflac","Cigna","Humana","Elevance Health",
    // Healthcare – Pharma
    "Johnson & Johnson","Pfizer","Roche","Novartis","Merck","AstraZeneca","GSK","Sanofi",
    "Bayer","AbbVie","Bristol Myers Squibb","Eli Lilly","Amgen","Biogen","Regeneron",
    "Moderna","BioNTech","Genentech","Gilead Sciences","Vertex Pharmaceuticals",
    // Healthcare – Devices & Services
    "Illumina","Thermo Fisher Scientific","Abbott","Becton Dickinson","Medtronic",
    "Boston Scientific","Stryker","Zimmer Biomet","Edwards Lifesciences","Danaher",
    "Intuitive Surgical","ResMed","Baxter International","Cardinal Health","McKesson",
    "UnitedHealth Group","CVS Health","Kaiser Permanente","Humana",
    // Retail
    "Walmart","Target","Costco","Kroger","Home Depot","Lowe's","Best Buy","Walgreens",
    "CVS Health","Dollar General","Dollar Tree","Aldi","Lidl","Carrefour","Tesco",
    "Sainsbury's","Asda","Marks & Spencer","Boots","Ahold Delhaize","Metro AG",
    "Woolworths","Coles","Amazon",
    // Fashion & Luxury
    "LVMH","Kering","Richemont","Hermès","Chanel","Burberry","Moncler","Prada","Ferragamo",
    "Tapestry","PVH Corp","VF Corporation","Hanesbrands","Nike","Adidas","Puma",
    "Under Armour","Lululemon","Zara","H&M","Uniqlo","Primark","ASOS","Shein",
    "Ralph Lauren","Calvin Klein","Tommy Hilfiger","Levi Strauss","Gap","Banana Republic",
    "Abercrombie & Fitch","Urban Outfitters","Reformation","Allbirds","On Running",
    // Automotive
    "Toyota","Volkswagen","Stellantis","Mercedes-Benz","BMW","General Motors","Ford",
    "Hyundai","Honda","Nissan","Renault","Volvo","Geely","BYD","NIO","Rivian","Lucid Motors",
    "Ferrari","Porsche","Audi","Lamborghini","Aston Martin","Lotus","Polestar",
    // Energy
    "ExxonMobil","Shell","BP","TotalEnergies","Chevron","ConocoPhillips","Equinor",
    "Repsol","ENI","Saudi Aramco","ADNOC","Petrobras","NextEra Energy","Duke Energy",
    "Southern Company","Dominion Energy","Exelon","Enel","E.ON","RWE","Vattenfall",
    "Iberdrola","Orsted","Vestas","Siemens Gamesa",
    // Telecom
    "AT&T","Verizon","T-Mobile","Comcast","Charter","Deutsche Telekom","Vodafone","Orange",
    "Telefonica","BT Group","Sky","Virgin Media","Swisscom","KPN","Proximus","Telstra",
    "Singtel","NTT","SoftBank","KDDI","SK Telecom","China Mobile","Bharti Airtel","Reliance Jio",
    // Media & Entertainment
    "Disney","Netflix","Warner Bros. Discovery","Paramount","NBCUniversal","Sony Pictures",
    "Spotify","Apple Music","YouTube","SiriusXM","iHeartMedia","Audacy",
    "Penguin Random House","Simon & Schuster","HarperCollins","Hachette","Condé Nast","Hearst",
    "The New York Times","Washington Post","The Wall Street Journal","The Guardian",
    "Bloomberg","Reuters","Associated Press","BBC","CNN","Fox News","MSNBC",
    // Food & Beverage
    "Nestlé","PepsiCo","Coca-Cola","Unilever","Danone","Kraft Heinz","General Mills",
    "Kellogg's","Campbell Soup","ConAgra Brands","Mars","Ferrero","Mondelēz","Tyson Foods",
    "JBS","Cargill","AB InBev","Heineken","Diageo","Pernod Ricard","Constellation Brands",
    "McDonald's","Starbucks","Yum Brands","Restaurant Brands","Chipotle","Domino's",
    "Shake Shack","Sweetgreen","Instacart","DoorDash","Uber Eats",
    // Logistics
    "DHL","FedEx","UPS","Maersk","MSC","CMA CGM","Hapag-Lloyd","XPO Logistics",
    "C.H. Robinson","J.B. Hunt","Werner Enterprises","Knight-Swift","Echo Global Logistics",
    // Aerospace & Defense
    "Lockheed Martin","Boeing","Raytheon Technologies","Northrop Grumman","General Dynamics",
    "L3Harris","BAE Systems","Thales","Airbus","SpaceX","Blue Origin","Rocket Lab",
    // Industrial
    "Honeywell","3M","Caterpillar","Deere & Company","Illinois Tool Works","Parker Hannifin",
    "Emerson Electric","Eaton","Rockwell Automation","Siemens","ABB","Schneider Electric",
    "Danfoss","Bosch","Mitsubishi Electric","GE","Danaher","Roper Technologies",
    // Consulting & Services
    "Accenture","McKinsey","Deloitte","PwC","KPMG","EY","Bain","Boston Consulting Group",
    "Oliver Wyman","Roland Berger","Infosys","TCS","Wipro","HCL Technologies",
    "Tech Mahindra","Cognizant","Capgemini","Atos","Gartner","Forrester","IDC",
  ],

  // ── Movies ─────────────────────────────────────────────────────────────────
  movieTitles: [
    "The Shawshank Redemption","The Godfather","The Dark Knight","Pulp Fiction",
    "Schindler's List","12 Angry Men","The Lord of the Rings: The Return of the King",
    "The Good the Bad and the Ugly","Forrest Gump","Fight Club","Inception",
    "The Lord of the Rings: The Fellowship of the Ring",
    "Star Wars: Episode V - The Empire Strikes Back",
    "The Silence of the Lambs","Goodfellas","Interstellar","Saving Private Ryan",
    "The Matrix","Parasite","The Green Mile","City of God",
    "Terminator 2: Judgment Day","Back to the Future","Spirited Away",
    "Avengers: Endgame","The Pianist","Gladiator","Leon: The Professional",
    "American History X","One Flew Over the Cuckoo's Nest","Whiplash",
    "Grave of the Fireflies","The Departed","The Prestige","Casablanca",
    "Memento","Cinema Paradiso","Apocalypse Now","The Lion King","Alien",
    "Rear Window","Raiders of the Lost Ark","WALL-E","Sunset Boulevard",
    "Paths of Glory","Django Unchained","Princess Mononoke","The Shining",
    "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
    "Oldboy","Coco","Toy Story","Lawrence of Arabia","Full Metal Jacket",
    "The Dark Knight Rises","Joker",
    "Eternal Sunshine of the Spotless Mind","A Beautiful Mind","Jurassic Park",
    "Good Will Hunting","Spider-Man: Into the Spider-Verse","Your Name",
    "Howl's Moving Castle","2001: A Space Odyssey","Citizen Kane",
    "North by Northwest","Vertigo","Psycho","Bicycle Thieves","M",
    "Grand Illusion","The 400 Blows","Seven Samurai","Tokyo Story","Rashomon",
    "Ikiru","High Noon","Some Like It Hot","All About Eve","Amadeus",
    "Braveheart","Life is Beautiful","The Truman Show","American Beauty",
    "No Country for Old Men","There Will Be Blood","The Social Network",
    "Mad Max: Fury Road","Moonlight","Get Out","Arrival","Dunkirk",
    "Hereditary","Midsommar","Us","1917","Tenet","Soul","Nomadland",
    "The Father","Promising Young Woman",
    "Everything Everywhere All at Once","Tár","All Quiet on the Western Front",
    "Triangle of Sadness","Aftersun","The Banshees of Inisherin","The Fabelmans",
    "Glass Onion","Decision to Leave","Past Lives","Saltburn","Oppenheimer",
    "Barbie","Poor Things","Anatomy of a Fall","The Zone of Interest",
    "American Fiction","Killers of the Flower Moon","Ferrari","Napoleon",
    "Godzilla Minus One","Society of the Snow","Perfect Days","Monster",
    "Mission: Impossible - Dead Reckoning","John Wick: Chapter 4",
    "Guardians of the Galaxy Vol. 3","Spider-Man: No Way Home",
    "Black Panther: Wakanda Forever","Doctor Strange in the Multiverse of Madness",
    "Shang-Chi and the Legend of the Ten Rings","Black Widow",
    "Thor: Love and Thunder","Ant-Man and the Wasp: Quantumania",
    "Indiana Jones and the Dial of Destiny",
    "Star Wars: Episode IV - A New Hope",
    "Star Wars: Episode VI - Return of the Jedi",
    "Star Wars: The Force Awakens","Rogue One: A Star Wars Story",
    "The Avengers","Captain America: The First Avenger","Iron Man",
    "Thor","Black Panther","Doctor Strange","Ant-Man",
    "Avengers: Infinity War","Captain Marvel","Shazam!",
    "Wonder Woman","Aquaman","Justice League",
    "The Batman","Joker: Folie à Deux",
    "Dune","Dune: Part Two","Blade Runner 2049",
    "The Martian","Gravity","Interstellar","Ad Astra",
    "Avatar","Avatar: The Way of Water","Titanic",
    "Jurassic World","Jurassic World Dominion",
    "Fast & Furious 7","The Fast and the Furious",
    "Mission: Impossible - Fallout","Mission: Impossible - Ghost Protocol",
    "Top Gun: Maverick","A Quiet Place","A Quiet Place Part II",
    "It","It Chapter Two","Doctor Sleep",
    "Us","Nope","Get Out",
    "The Witch","Hereditary","Midsommar","The Black Phone",
    "Knives Out","Glass Onion","Parasite","The Menu",
    "Everything Everywhere All at Once","Swiss Army Man","The One I Love",
    "La La Land","Whiplash","First Man","Damien Chazelle",
    "Marriage Story","The Irishman","Once Upon a Time in Hollywood",
    "Roma","Alfonso Cuarón","Bong Joon-ho","The Lobster",
    "The Favourite","Yorgos Lanthimos",
    "Portrait of a Lady on Fire","Burning","Drive My Car",
    "In the Mood for Love","Happy Together","Chungking Express",
    "Shoplifters","Nobody Knows","Still Walking","Like Father Like Son",
    "Crouching Tiger Hidden Dragon","Hero","House of Flying Daggers",
    "Pan's Labyrinth","The Orphanage","Volver","Talk to Her","All About My Mother",
    "A Separation","The Salesman","About Elly","Capernaum","Wild Tales",
    "Elite Squad","City of God","Carandiru","Central Station",
  ],

  // ── Products ───────────────────────────────────────────────────────────────
  products: [
    // Electronics
    "iPhone 16 Pro","Samsung Galaxy S25 Ultra","Google Pixel 9 Pro","OnePlus 13",
    "Sony Xperia 1 VI","Xiaomi 15 Pro","Nothing Phone (3)",
    "MacBook Pro 14-inch M4 Pro","MacBook Air 15-inch M3",
    "Dell XPS 15 OLED","HP Spectre x360 14","Lenovo ThinkPad X1 Carbon",
    "ASUS ZenBook 14 OLED","Razer Blade 15","Microsoft Surface Pro 10",
    "iPad Pro 13-inch M4","Samsung Galaxy Tab S10 Ultra","Amazon Fire HD 10",
    "Apple Watch Ultra 2","Samsung Galaxy Watch 7","Garmin Forerunner 965",
    "Fitbit Charge 6","Oura Ring Gen 3","WHOOP 4.0",
    "AirPods Pro 2nd Generation","Sony WH-1000XM6","Bose QuietComfort 45",
    "Jabra Evolve2 85","Sennheiser Momentum 4","Beats Studio Pro",
    "Sony WF-1000XM5","Samsung Galaxy Buds3 Pro",
    "Sony PlayStation 5 Pro","Xbox Series X","Nintendo Switch 2",
    "Samsung 65-inch QLED 8K TV","LG OLED evo C4 65-inch",
    "Sony Bravia XR A95L 55-inch","TCL QM851G 75-inch",
    "Amazon Echo Show 15","Google Nest Hub Max","Apple HomePod 2nd Gen",
    "Sonos Era 300","Bose SoundBar 900","Samsung HW-Q990D Soundbar",
    "Kindle Scribe","Kindle Paperwhite Signature Edition",
    "Logitech MX Master 3S","Razer DeathAdder V3 Pro",
    "Apple Magic Keyboard","Logitech G915 TKL","Keychron Q1 Pro",
    "Ring Video Doorbell Pro 2","Arlo Essential Outdoor Security Camera",
    "Google Nest Cam","Eufy SoloCam S340","SimpliSafe Home Security Kit",
    "Philips Hue Starter Kit","Govee Smart LED Strip Lights",
    "Amazon Smart Plug","TP-Link Kasa Smart Plug","Wyze Plug",
    "Roborock S8 Pro Ultra","iRobot Roomba j9+","Ecovacs Deebot X2 Omni",
    "Dyson V15 Detect Absolute","Shark IQ Robot Self-Empty XL",
    "Netgear Orbi 960","Eero Max 7","TP-Link Deco XE75",
    // Home & Kitchen
    "KitchenAid Artisan Series 5-Qt Stand Mixer","Vitamix 5200 Blender",
    "Ninja Foodi 8-qt 9-in-1 Deluxe XL Pressure Cooker",
    "Instant Pot Duo 7-in-1 Electric Pressure Cooker",
    "Breville Smart Oven Air Fryer Pro","Cuisinart Air Fryer Toaster Oven",
    "Nespresso Vertuo Pop","Keurig K-Supreme Plus Smart",
    "Breville Barista Express Impress","De'Longhi Stilosa Espresso Machine",
    "Vitamix Explorian Blender","NutriBullet Pro 900 Series",
    "Cuisinart 14-Cup Food Processor","Hamilton Beach Professional Juicer",
    "Zwilling J.A. Henckels Pro Chef's Knife","Wüsthof Classic 8-Inch Chef's Knife",
    "Global G-2 8-inch Chef's Knife","MAC Mighty MTH-80 Chef's Knife",
    "Le Creuset 5.5 Qt Signature Round Dutch Oven",
    "Staub Cast Iron 4-qt Cocotte","Lodge 12-Inch Cast Iron Skillet",
    "All-Clad D5 Brushed 10-Piece Cookware Set","Caraway Nonstick Ceramic Cookware Set",
    "Made In Blue Carbon Steel Skillet","Our Place Always Pan 2.0",
    "Casper Original Foam Mattress","Purple Hybrid Premier 4 Mattress",
    "Tempur-Pedic TEMPUR-ProAdapt Medium Mattress","Sleep Number 360 Smart Bed",
    "Saatva Classic Luxury Firm Mattress","Tuft & Needle Original Foam Mattress",
    "Parachute Classic Percale Sheet Set","Brooklinen Luxe Sateen Core Sheet Set",
    "Coop Home Goods Eden Adjustable Pillow",
    "Dyson Purifier Hot+Cool HP07","Levoit Core 400S Smart Air Purifier",
    "Coway Airmega 400S Smart Air Purifier",
    // Apparel & Footwear
    "Nike Air Max 270","Nike Air Force 1 Low","Nike Pegasus 41",
    "Adidas Ultraboost 22","Adidas Samba OG","Adidas Stan Smith",
    "New Balance 990v6","New Balance 574","New Balance 530",
    "Brooks Ghost 16","HOKA Clifton 9","On Cloudmonster 2",
    "Salomon Speedcross 6 Trail Runner","Merrell Moab 3 Mid Waterproof",
    "Timberland 6-Inch Premium Waterproof Boot",
    "Dr. Martens 1460 Smooth Leather Boot","Birkenstock Arizona Soft Footbed Sandal",
    "Allbirds Tree Runners","Veja Campo Chromefree Leather Sneaker",
    "Golden Goose Hi Star Sneaker",
    "Lululemon Align High-Rise Pant 25-inch","Lululemon Swiftly Tech Long-Sleeve Shirt",
    "Athleta Salutation Stash Pocket II 7/8 Tight",
    "Gymshark Vital Seamless 2.0 Shorts","Gymshark Adapt Animal Seamless Leggings",
    "Patagonia Nano Puff Hoody","Patagonia Better Sweater Fleece Jacket",
    "Arc'teryx Atom AR Hoody","Arc'teryx Beta AR Jacket",
    "The North Face ThermoBall Eco Jacket","The North Face Venture 2 Jacket",
    "Columbia Omni-Heat Infinity Jacket","Carhartt WIP Michigan Chore Coat",
    "Levi's 501 Original Fit Jeans","Levi's 511 Slim Fit Jeans",
    "AG Adriano Goldschmied Tellis Slim Leg Jean",
    "Uniqlo Ultra Light Down Parka","Uniqlo Merino Turtleneck Sweater",
    "Everlane The Italian Cashmere Crewneck Sweater",
    "Quince Mongolian Cashmere Crewneck Sweater",
    "Banana Republic Cozy Brushed Mockneck Sweater",
    "J.Crew Fisherman Cable Knit Crewneck Sweater",
    "Theory Precision Ponte Pull-On Pant",
    "Ralph Lauren Classic Fit Polo Shirt",
    // Sports, Health & Fitness
    "Hydrow Wave Rower","Peloton Bike+ with 24-inch HD Touchscreen",
    "Bowflex SelectTech 552 Adjustable Dumbbells",
    "TRX All-in-One Suspension Training System",
    "Manduka PRO Yoga Mat 6mm","Lululemon The Reversible Mat 5mm",
    "Theragun Prime Percussive Therapy Device","Hyperice Normatec 3 Legs",
    "Garmin Edge 840 Solar Cycling Computer","Wahoo KICKR Smart Trainer",
    "YETI Tundra 45 Cooler","YETI Rambler 30 oz Tumbler",
    "Stanley Quencher H2.0 FlowState Tumbler 40oz",
    "Hydro Flask Wide Mouth Water Bottle 32oz",
    "Nalgene Wide Mouth Water Bottle 32oz",
    "CamelBak Chute Mag Water Bottle","S'well Stainless Steel Water Bottle",
    "Ember Temperature Control Smart Mug 2","Contigo Cortland Chill Water Bottle",
    // Personal Care & Beauty
    "Philips Sonicare DiamondClean Smart Electric Toothbrush",
    "Oral-B iO Series 9 Electric Toothbrush",
    "Waterpik Aquarius Professional Water Flosser",
    "Foreo Luna 4 Smart Facial Cleansing Device","PMD Clean Pro Facial Cleansing Device",
    "Braun Series 9 Pro Electric Shaver","Panasonic Arc5 Electric Razor",
    "Dyson Supersonic Hair Dryer","ghd Platinum+ Hair Straightener",
    "T3 Whirl Trio Interchangeable Wand","BaBylissPRO Titanium Flat Iron",
    "Therabody TheraFace PRO","NuFace Trinity Facial Toning Device",
    "CeraVe Moisturizing Cream","La Roche-Posay Effaclar Cleanser",
    "The Ordinary Hyaluronic Acid 2% + B5","Tatcha The Water Cream",
    "Sunday Riley Good Genes All-In-One Lactic Acid Treatment",
    "Drunk Elephant Protini Polypeptide Moisturizer",
    "Paula's Choice SKIN PERFECTING 2% BHA Liquid Exfoliant",
    "Supergoop Unseen Sunscreen SPF 40","EltaMD UV Clear Broad-Spectrum SPF 46",
    "Neutrogena Hydro Boost Water Gel","Olay Regenerist Micro-Sculpting Cream",
    "Cetaphil Daily Hydrating Lotion","Kiehl's Ultra Facial Cream",
    "Clinique Moisture Surge 100H Auto-Replenishing Hydrator",
  ],

  // ── Tech – Frameworks ──────────────────────────────────────────────────────
  frameworks: [
    // Frontend JS
    "React","Angular","Vue.js","Svelte","Next.js","Nuxt","Remix","SvelteKit",
    "Gatsby","Astro","Qwik","SolidJS","Lit","Alpine.js","HTMX","Preact",
    // Backend JS/TS
    "Express","Fastify","NestJS","Hapi","Koa","Feathers","AdonisJS","Restify",
    // Python
    "Django","Flask","FastAPI","Tornado","Sanic","Starlette","Falcon","Pyramid","Bottle",
    // Ruby
    "Ruby on Rails","Sinatra","Hanami","Padrino",
    // PHP
    "Laravel","Symfony","CodeIgniter","CakePHP","Slim","Lumen","Yii","Zend",
    // Java / JVM
    "Spring Boot","Spring MVC","Micronaut","Quarkus","Helidon","Vert.x",
    "Play Framework","Dropwizard","Grails","Ktor",
    // .NET
    "ASP.NET Core","Blazor","Minimal API","Orleans","MAUI",
    // Go
    "Gin","Echo","Fiber","Chi","Gorilla Mux","Beego","Buffalo","Revel",
    // Rust
    "Actix-web","Axum","Rocket","Tide","Warp","Poem",
    // Mobile
    "Flutter","React Native","Expo","Ionic","Capacitor","Xamarin","Kotlin Multiplatform",
    "SwiftUI","Jetpack Compose","Android Jetpack","UIKit",
    // Other runtimes
    "Deno","Bun","Node.js","Electron","Tauri",
    // Data & ML
    "TensorFlow","PyTorch","Keras","JAX","scikit-learn","XGBoost","LightGBM",
    "Hugging Face Transformers","LangChain","LlamaIndex","Haystack",
    "Apache Spark","Apache Flink","Dask","Ray",
    "Pandas","Polars","NumPy","SciPy","Matplotlib","Seaborn","Plotly",
    // CSS
    "Tailwind CSS","Bootstrap","Bulma","Foundation","Chakra UI","MUI","Ant Design",
    "shadcn/ui","Radix UI","Headless UI","DaisyUI",
  ],

  // ── Tech – Databases (expanded) ────────────────────────────────────────────
  databases: [
    // Relational / SQL
    "PostgreSQL","MySQL","SQLite","MariaDB","Microsoft SQL Server","Oracle Database",
    "IBM Db2","Sybase","Informix","SAP HANA","CockroachDB","TiDB","YugabyteDB",
    "PlanetScale","Neon","SingleStore","VoltDB","Dolt","rqlite","LibSQL",
    // Document
    "MongoDB","Firebase Firestore","Couchbase","CouchDB","RavenDB","MarkLogic",
    "ArangoDB","OrientDB","PouchDB","FaunaDB",
    // Key-Value
    "Redis","Memcached","DynamoDB","Etcd","Consul","ZooKeeper","RocksDB",
    "LevelDB","LMDB","Riak","Aerospike","Dragonfly","KeyDB",
    // Wide-Column
    "Apache Cassandra","ScyllaDB","Apache HBase","Apache Accumulo","Google Bigtable",
    // Search
    "Elasticsearch","OpenSearch","Solr","Meilisearch","Typesense","Algolia","Zinc Search",
    // Graph
    "Neo4j","Amazon Neptune","ArangoDB","JanusGraph","TigerGraph","Dgraph",
    "Memgraph","NebulaGraph","FalkorDB",
    // Time-Series
    "InfluxDB","TimescaleDB","QuestDB","Prometheus","Victoria Metrics","Grafana Mimir",
    "TDengine","OpenTSDB","Druid","Pinot","ClickHouse","Redshift","BigQuery","Snowflake",
    "Azure Synapse Analytics","Databricks","Dremio","Starburst",
    // Vector / AI
    "Pinecone","Weaviate","Qdrant","Milvus","Chroma","PGVector","Redis Vector",
    "OpenSearch Vector","Zilliz","LanceDB","Vald","Marqo",
    // Embedded / Offline
    "SQLite","DuckDB","LevelDB","RocksDB","BerkeleyDB","H2","HSQLDB","Derby",
    "Realm","WatermelonDB","RxDB",
    // Streaming
    "Apache Kafka","Apache Pulsar","NATS","RabbitMQ","ActiveMQ","Amazon Kinesis",
    "Azure Event Hubs","Redpanda","Aiven Kafka",
  ],

  // ── Social platforms (expanded) ────────────────────────────────────────────
  socialPlatforms: [
    "Facebook","Instagram","Twitter / X","TikTok","YouTube","LinkedIn","Pinterest",
    "Snapchat","Reddit","Discord","Telegram","WhatsApp","WeChat","Line","KakaoTalk",
    "Signal","Clubhouse","Threads","Mastodon","Bluesky","Tumblr","Flickr",
    "Vimeo","Twitch","Kick","Rumble","Substack","Medium","Quora","Stack Overflow",
    "GitHub","GitLab","Behance","Dribbble","DeviantArt","500px","VSCO",
    "SoundCloud","Spotify","Bandcamp","Last.fm","Goodreads","Letterboxd",
    "Strava","Untappd","Foursquare / Swarm","TripAdvisor","Yelp","Google Maps",
  ],

  // ── Cloud providers (expanded) ─────────────────────────────────────────────
  cloudProviders: [
    "Amazon Web Services (AWS)","Microsoft Azure","Google Cloud Platform (GCP)",
    "Oracle Cloud Infrastructure","IBM Cloud","Alibaba Cloud","Tencent Cloud",
    "Huawei Cloud","Salesforce Platform","SAP BTP",
    "DigitalOcean","Linode (Akamai Cloud)","Vultr","Hetzner Cloud","OVHcloud",
    "Cloudflare Workers","Vercel","Netlify","Render","Railway","Fly.io",
    "Heroku","PlanetScale","Neon","Supabase","Appwrite","Firebase","Backendless",
    "Fastly","Akamai","Cloudfront","KeyCDN","Bunny CDN","jsDelivr",
    "Snowflake","Databricks","Palantir Foundry","Cloudera","Hortonworks",
  ],

};

// ─────────────────────────────────────────────────────────────────────────────
// TIER 3 — Write all embedded datasets
// ─────────────────────────────────────────────────────────────────────────────
function writeEmbedded() {
  console.log("\n[Tier 2+3] Writing embedded real-world datasets…");

  write("names_global",           EMBEDDED.firstNames);
  write("names_surnames_global",  EMBEDDED.lastNames);
  if (!liveFetched.has("geography_cities_global")) {
    write("geography_cities_global", EMBEDDED.cities);
  }
  write("address_street_names",   EMBEDDED.streets);
  write("companies",              EMBEDDED.companies);
  write("media_movie_titles",     EMBEDDED.movieTitles);
  write("ecommerce_product_names",EMBEDDED.products);
  write("tech_frameworks",        EMBEDDED.frameworks);
  write("tech_databases",         EMBEDDED.databases);
  write("social_platforms",       EMBEDDED.socialPlatforms);
  write("tech_cloud_providers",   EMBEDDED.cloudProviders);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== drawline-core dataset builder ===");
  console.log(`Output dir: ${DATASETS}\n`);

  if (!fs.existsSync(DATASETS)) {
    fs.mkdirSync(DATASETS, { recursive: true });
  }

  // Tier 1 – live fetches (graceful fallback if offline)
  await fetchCountries();
  await fetchCities();

  // Tier 2+3 – embedded lists
  writeEmbedded();

  console.log("\n✅ All datasets written.\n");
}

main().catch(err => { console.error(err); process.exit(1); });
