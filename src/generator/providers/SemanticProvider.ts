import fs from "fs";
import path from "path";

/**
 * Semantic data provider with curated datasets for high-quality synthetic data.
 * Replaces generic Lorem Ipsum with meaningful, context-aware content.
 */
export class SemanticProvider {
	private static datasets: Map<string, string[]> = new Map();
	private static datasetsDir = path.join(__dirname, "../datasets");

	private static loadDataset(name: string): string[] {
		if (this.datasets.has(name)) return this.datasets.get(name)!;

		try {
			const filePath = path.join(this.datasetsDir, `${name}.json`);
			if (fs.existsSync(filePath)) {
				const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
				this.datasets.set(name, data);
				return data;
			}
		} catch (err) {
			// Silently fail and return fallback if file doesn't exist
		}

		return [];
	}

	public static pickRandom(datasetName: string, random: () => number, fallback: string[]): string {
		let data = this.loadDataset(datasetName);
		if (data.length === 0) data = fallback;
		return data[Math.floor(random() * data.length)];
	}

	private static firstNames = [
		"James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David", "Elizabeth",
		"William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen",
		"Daniel", "Nancy", "Paul", "Lisa", "Mark", "Betty", "Donald", "Margaret", "George", "Sandra",
		"Kenneth", "Ashley", "Steven", "Dorothy", "Edward", "Kimberly", "Brian", "Emily", "Ronald", "Donna"
	];

	private static lastNames = [
		"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
		"Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
		"Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"
	];

	// Real email providers — not company names
	private static emailDomains = [
		"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com",
		"icloud.com", "fastmail.com", "mail.com", "zoho.com", "aol.com",
		"example.com", "test.dev", "ymail.com", "live.com"
	];

	static fullName(random: () => number, context?: { collectionName?: string; fieldName?: string }): string {
		const isIndian =
			context?.collectionName?.toLowerCase().includes("india") ||
			context?.fieldName?.toLowerCase().includes("india");

		if (isIndian) {
			const first = this.pickRandom("names_indian", random, ["Amit", "Priya", "Rahul", "Sonia"]);
			const last = this.pickRandom("names_indian_surnames", random, ["Sharma", "Verma", "Gupta"]);
			return `${first} ${last}`;
		}

		const first = this.pickRandom("names_global", random, this.firstNames);
		const last = this.pickRandom("names_surnames_global", random, this.lastNames);
		return `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
	}

	static email(random: () => number, name?: string): string {
		const rawBase = name
			? name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "")
			: this.pickRandom("names_global", random, this.firstNames).toLowerCase().replace(/[^a-z]/g, "");

		const base = rawBase || "user";
		const domain = this.element(this.emailDomains, random);

		// ~60% of real emails have a numeric suffix
		const useNum = random() < 0.6;
		const num = Math.floor(random() * 999) + 1;
		return useNum ? `${base}${num}@${domain}` : `${base}@${domain}`;
	}

	static username(random: () => number): string {
		const first = this.pickRandom("names_global", random, this.firstNames).toLowerCase().replace(/[^a-z]/g, "");
		const last = this.element(this.lastNames, random).toLowerCase();
		const separators = ["", "_", ".", ""];
		const sep = this.element(separators, random);
		const num = random() < 0.5 ? Math.floor(random() * 999).toString() : "";
		return `${first}${sep}${last}${num}`;
	}

	static title(random: () => number, context?: string): string {
		const ctx = context?.toLowerCase() || "";

		if (ctx.includes("movie") || ctx.includes("film") || ctx.includes("show")) {
			return this.pickRandom("media_movie_titles", random, ["Interstellar", "Inception", "The Godfather"]);
		}
		if (ctx.includes("post") || ctx.includes("article") || ctx.includes("blog")) {
			const templates = [
				"10 Tips for Better {Topic}",
				"The Future of {Topic}",
				"Why {Topic} is Changing Everything",
				"Understanding {Topic} in 2024",
				"How to Master {Topic}",
				"Top 10 {Topic} Trends",
				"A Deep Dive into {Topic}",
				"The Definitive Guide to {Topic}",
			];
			const topics = ["Productivity", "Technology", "AI", "Remote Work", "Design", "Fitness",
				"Data Management", "System Architecture", "Cloud Infrastructure", "Developer Experience"];
			const template = this.element(templates, random);
			const topic = this.element(topics, random);
			return template.replace("{Topic}", topic);
		}
		if (ctx.includes("product")) {
			return this.pickRandom("ecommerce_product_names", random, ["Wireless Headphones", "Smart Watch", "Leather Wallet"]);
		}

		// Generic title fallback — sensible, not job titles
		const templates = [
			"Introduction to {Topic}",
			"A Guide to {Topic}",
			"Understanding {Topic}",
			"{Topic} Best Practices",
			"Getting Started with {Topic}",
			"An Overview of {Topic}",
			"Exploring {Topic}",
			"{Topic} Fundamentals",
		];
		const topics = [
			"Data Management", "System Design", "Cloud Architecture", "Workflow Automation",
			"Performance Optimization", "Security Practices", "API Design", "Database Schema",
			"Event Sourcing", "Microservices", "Observability", "Infrastructure as Code",
		];
		const template = this.element(templates, random);
		const topic = this.element(topics, random);
		return template.replace("{Topic}", topic);
	}

	static getGenre(random: () => number): string {
		return this.pickRandom("media_genres", random, ["Action", "Sci-Fi", "Drama", "Comedy"]);
	}

	static getYear(random: () => number, start: number = 1970, end: number = 2024): string {
		return Math.floor(random() * (end - start + 1) + start).toString();
	}

	// Expanded, topic-varied content pool (40+ sentences across three registers)
	private static contentSentences = [
		// Technical / data
		"The system processes over ten thousand requests per second with sub-millisecond latency.",
		"Data pipelines are validated at ingestion time to prevent schema drift downstream.",
		"Horizontal scaling reduced p99 response time by 40% under peak load.",
		"The migration ran in a 15-minute window with zero downtime using blue-green deployment.",
		"Indexes on composite keys reduced full-table scan frequency by 90%.",
		"Event sourcing allows the system to replay history and reconstruct any past state.",
		"Circuit breakers prevent cascading failures when dependent services degrade.",
		"The read replica handles analytical queries without impacting the primary write path.",
		"Schema validation at the API boundary catches malformed payloads before they reach storage.",
		"Idempotency keys ensure duplicate requests produce the same result without side effects.",
		// Business / product
		"Customer satisfaction scores improved significantly after the onboarding flow was simplified.",
		"The Q3 campaign exceeded targets by 23% due to improved audience segmentation.",
		"Feature flags allowed the team to roll out the new pricing model incrementally.",
		"Churn reduced by 18% after introducing proactive in-app notifications.",
		"The integration with third-party providers cut manual reconciliation time in half.",
		"A/B testing confirmed that the new checkout flow increases conversion by 12%.",
		"Stakeholder alignment on the product roadmap was achieved in two focused workshops.",
		"The support team resolved 94% of tickets within the first response window.",
		"Revenue attribution modeling revealed that organic search drives 60% of enterprise leads.",
		"Cross-functional collaboration between engineering and design improved delivery velocity.",
		// Observational / analytical
		"Usage data shows that 80% of active users return within 48 hours of first activation.",
		"Retention curves flatten significantly after the user completes their first meaningful action.",
		"The cohort analysis revealed a strong correlation between onboarding depth and 30-day retention.",
		"Log aggregation surfaces error patterns that sampling alone would miss.",
		"Geographic distribution of requests aligns with expected time-zone-driven usage patterns.",
		"Outlier detection flagged three anomalous transaction clusters for manual review.",
		"The feature was adopted by 65% of eligible users within two weeks of release.",
		"Latency spikes correlate with batch job execution windows on the shared cluster.",
		"Write amplification decreased after switching to an LSM-tree-based storage engine.",
		"Query plan analysis identified three full-table scans that index additions resolved.",
		// Contextual / narrative
		"The project started as an internal tool and grew into a customer-facing platform.",
		"Version 2.0 introduced a plugin architecture that reduced core codebase complexity.",
		"The team adopted trunk-based development and eliminated long-lived feature branches.",
		"Documentation was co-authored by engineers and technical writers using a shared template.",
		"Load testing at 5× expected peak validated the infrastructure before the public launch.",
		"The API was versioned from day one to avoid breaking changes for early adopters.",
		"Automated regression tests cover 87% of the critical user journey paths.",
		"The alert threshold was tuned based on six weeks of baseline observation data.",
		"Capacity planning estimates are revised quarterly using actual growth trajectory data.",
		"Post-incident reviews are blameless and focused on systemic improvements.",
	];

	static content(random: () => number, length: "short" | "medium" | "long" = "medium"): string {
		const count = length === "short" ? 2 : length === "medium" ? 4 : 8;
		const pool = [...this.contentSentences];
		const picked: string[] = [];

		// Sample without replacement for variety
		for (let i = 0; i < count && pool.length > 0; i++) {
			const idx = Math.floor(random() * pool.length);
			picked.push(pool.splice(idx, 1)[0]);
		}
		return picked.join(" ");
	}

	static company(random: () => number): string {
		return this.pickRandom("companies", random, ["Acme Corp", "Globex", "Soylent Corp"]);
	}

	static getJobTitle(random: () => number): string {
		return this.pickRandom("job_titles", random, [
			"Software Engineer", "Product Manager", "Data Analyst",
			"DevOps Engineer", "UX Designer", "Solutions Architect"
		]);
	}

	static getProductName(random: () => number): string {
		// Uses the correctly-named dataset (ecommerce_product_names, not products_commerce)
		return this.pickRandom("ecommerce_product_names", random, ["Wireless Headphones", "Smart Watch", "Leather Wallet"]);
	}

	static getProductCategory(random: () => number): string {
		return this.pickRandom("ecommerce_product_categories", random, [
			"Electronics", "Clothing & Apparel", "Home & Kitchen", "Sports & Outdoors",
			"Books", "Beauty & Personal Care", "Toys & Games", "Automotive",
			"Health & Wellness", "Food & Beverages", "Furniture", "Office Supplies",
			"Pet Supplies", "Garden & Outdoors", "Music & Instruments",
		]);
	}

	static getAddress(random: () => number): string {
		const streetNumber = Math.floor(random() * 9899) + 1;
		const street = this.pickRandom("address_street_names", random, [
			"Main Street", "Oak Avenue", "Maple Drive", "Park Road", "Elm Street"
		]);
		const city = this.pickRandom("geography_cities_global", random, [
			"New York City", "London", "Bangalore", "San Francisco", "Tokyo", "Mumbai",
			"Berlin", "Singapore", "Sydney", "Toronto"
		]);
		return `${streetNumber} ${street}, ${city}`;
	}

	static getZipCode(random: () => number, context?: { collectionName?: string }): string {
		const isIndian = context?.collectionName?.toLowerCase().includes("india");
		if (isIndian) {
			// Indian PIN codes: 6 digits, starts 1-9
			return `${Math.floor(random() * 8) + 1}${Math.floor(random() * 99999).toString().padStart(5, "0")}`;
		}
		// US ZIP: 5 digits
		return Math.floor(random() * 89999 + 10000).toString();
	}

	static getCountry(random: () => number): string {
		return this.pickRandom("geography_countries", random, ["United States", "India", "United Kingdom", "Canada"]);
	}

	static getState(random: () => number, context?: { collectionName?: string; fieldName?: string }): string {
		const isIndian =
			context?.collectionName?.toLowerCase().includes("india") ||
			context?.fieldName?.toLowerCase().includes("india");

		if (isIndian) {
			return this.pickRandom("geography_states_india", random, ["Karnataka", "Maharashtra", "Delhi"]);
		}

		return this.pickRandom("geography_states_usa", random, ["California", "Texas", "New York"]);
	}

	static getBank(random: () => number, context?: { collectionName?: string; fieldName?: string }): string {
		const isIndian =
			context?.collectionName?.toLowerCase().includes("india") ||
			context?.fieldName?.toLowerCase().includes("india");

		if (isIndian) {
			return this.pickRandom("financial_banks_india", random, ["SBI", "HDFC Bank", "ICICI Bank"]);
		}

		return this.pickRandom("financial_banks_global", random, ["JP Morgan", "Goldman Sachs", "HSBC"]);
	}

	static getLogisticsCarrier(random: () => number): string {
		return this.pickRandom("logistics_carriers", random, ["FedEx", "DHL", "UPS"]);
	}

	static getUniversity(random: () => number): string {
		return this.pickRandom("education_universities", random, ["Harvard", "Stanford", "Oxford"]);
	}

	static getCarMake(random: () => number): string {
		return this.pickRandom("automotive_makes", random, ["Toyota", "Ford", "Tesla"]);
	}

	static getUserAgent(random: () => number): string {
		return this.pickRandom("security_user_agents", random, ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"]);
	}

	static getPaymentMethod(random: () => number): string {
		return this.pickRandom("commerce_payment_methods", random, ["Credit Card", "PayPal", "UPI"]);
	}

	static getTaxType(random: () => number): string {
		return this.pickRandom("financial_tax_types", random, ["GST", "VAT", "Sales Tax"]);
	}

	static getCaseStatus(random: () => number): string {
		return this.pickRandom("legal_case_statuses", random, ["Open", "Closed", "Pending"]);
	}

	static getUnit(random: () => number): string {
		return this.pickRandom("logistics_units", random, ["kg", "lb", "lt"]);
	}

	static getResolution(random: () => number): string {
		return this.pickRandom("media_resolutions", random, ["1920x1080", "3840x2160"]);
	}

	static getProtocol(random: () => number): string {
		return this.pickRandom("tech_protocols", random, ["HTTP", "HTTPS", "gRPC"]);
	}

	static getSentiment(random: () => number): string {
		return this.pickRandom("commerce_review_sentiment", random, ["Positive", "Negative", "Neutral"]);
	}

	static getSocialPlatform(random: () => number): string {
		return this.pickRandom("social_platforms", random, ["Twitter", "Facebook", "Instagram"]);
	}

	static getVitalType(random: () => number): string {
		return this.pickRandom("healthcare_vital_types", random, ["Heart Rate", "Blood Pressure"]);
	}

	static getISOCode(random: () => number): string {
		return this.pickRandom("geography_iso_codes", random, ["USA", "IND", "GBR"]);
	}

	static getFlightStatus(random: () => number): string {
		return this.pickRandom("aviation_flight_statuses", random, ["Scheduled", "Delayed", "Landed"]);
	}

	static getPlanet(random: () => number): string {
		return this.pickRandom("science_planets", random, ["Earth", "Mars", "Jupiter"]);
	}

	static getInstrument(random: () => number): string {
		return this.pickRandom("music_instruments", random, ["Piano", "Guitar", "Violin"]);
	}

	static getTool(random: () => number): string {
		return this.pickRandom("construction_tools", random, ["Hammer", "Drill", "Saw"]);
	}

	static getCrop(random: () => number): string {
		return this.pickRandom("agriculture_crops", random, ["Wheat", "Rice", "Maize"]);
	}

	static getOrgan(random: () => number): string {
		return this.pickRandom("anatomy_organs", random, ["Heart", "Brain", "Lungs"]);
	}

	static getElement(random: () => number): string {
		return this.pickRandom("science_elements", random, ["Oxygen", "Carbon", "Iron"]);
	}

	static getInteraction(random: () => number): string {
		return this.pickRandom("social_interaction_types", random, ["Like", "Share", "Comment"]);
	}

	static getStatus(random: () => number, context?: { collectionName?: string }): string {
		const ctx = context?.collectionName?.toLowerCase() || "";
		if (ctx.includes("order") || ctx.includes("purchase") || ctx.includes("shipment")) {
			return this.pickRandom("commerce_order_statuses", random, ["Pending", "Shipped", "Delivered"]);
		}
		if (ctx.includes("ticket") || ctx.includes("issue") || ctx.includes("case") || ctx.includes("support")) {
			return this.pickRandom("legal_case_statuses", random, ["Open", "In Progress", "Resolved", "Closed"]);
		}
		if (ctx.includes("flight") || ctx.includes("booking") || ctx.includes("reservation")) {
			return this.pickRandom("aviation_flight_statuses", random, ["Confirmed", "Pending", "Cancelled"]);
		}
		const generic = ["active", "inactive", "pending", "suspended", "archived", "draft", "published"];
		return this.element(generic, random);
	}

	static getCloudProvider(random: () => number): string {
		return this.pickRandom("tech_cloud_providers", random, ["AWS", "Azure", "GCP"]);
	}

	static getDatabase(random: () => number): string {
		return this.pickRandom("tech_databases", random, ["PostgreSQL", "MySQL", "MongoDB"]);
	}

	static getAnimal(random: () => number): string {
		return this.pickRandom("nature_animals", random, ["Lion", "Tiger", "Elephant"]);
	}

	static getPlant(random: () => number): string {
		return this.pickRandom("nature_plants", random, ["Rose", "Oak", "Cactus"]);
	}

	static getTimezone(random: () => number): string {
		return this.pickRandom("geography_timezones", random, ["UTC", "America/New_York", "Asia/Kolkata"]);
	}

	static getSport(random: () => number): string {
		return this.pickRandom("sports_names", random, ["Soccer", "Cricket", "Tennis"]);
	}

	static getSubject(random: () => number): string {
		return this.pickRandom("education_subjects", random, ["Math", "Physics", "History"]);
	}

	static getCertification(random: () => number): string {
		return this.pickRandom("professional_certifications", random, ["PMP", "AWS Solutions Architect", "CFA"]);
	}

	static getAmenity(random: () => number): string {
		return this.pickRandom("hospitality_amenities", random, ["Wi-Fi", "Pool", "Gym"]);
	}

	static getInvestmentType(random: () => number): string {
		return this.pickRandom("finance_investment_types", random, ["Stocks", "Bonds", "Crypto"]);
	}

	static getMarketingChannel(random: () => number): string {
		return this.pickRandom("marketing_channels", random, ["SEO", "SEM", "Social Media"]);
	}

	static getGamingPlatform(random: () => number): string {
		return this.pickRandom("gaming_platforms", random, ["Steam", "Epic Games", "PSN"]);
	}

	static getMaterial(random: () => number): string {
		return this.pickRandom("manufacturing_materials", random, ["Steel", "Plastic", "Glass"]);
	}

	static getLegalDocument(random: () => number): string {
		return this.pickRandom("legal_document_types", random, ["Contract", "NDA", "Will"]);
	}

	static getIDType(random: () => number, context?: { collectionName?: string; fieldName?: string }): string {
		const isIndian =
			context?.collectionName?.toLowerCase().includes("india") ||
			context?.fieldName?.toLowerCase().includes("india");

		if (isIndian) {
			return this.pickRandom("government_id_types_india", random, ["Aadhaar", "PAN"]);
		}

		const globalIds = ["Passport", "National ID", "Driver License", "Social Security"];
		return this.element(globalIds, random);
	}

	static getWeather(random: () => number): string {
		return this.pickRandom("weather_conditions", random, ["Sunny", "Rainy", "Cloudy"]);
	}

	static getDeviceType(random: () => number): string {
		return this.pickRandom("device_types", random, ["Smartphone", "Laptop", "Tablet"]);
	}

	static getClothingType(random: () => number): string {
		return this.pickRandom("fashion_clothing_types", random, ["T-Shirt", "Jeans", "Dress"]);
	}

	static getEnergySource(random: () => number): string {
		return this.pickRandom("environment_energy_sources", random, ["Solar", "Wind", "Nuclear"]);
	}

	static getAirline(random: () => number): string {
		return this.pickRandom("aviation_airlines", random, ["Delta", "Emirates", "Air India"]);
	}

	static getEmploymentType(random: () => number): string {
		return this.pickRandom("hr_employment_types", random, ["Full-time", "Contract"]);
	}

	static getDepartment(random: () => number): string {
		return this.pickRandom("hr_departments", random, ["Engineering", "Sales", "HR"]);
	}

	static getPropertyType(random: () => number): string {
		return this.pickRandom("real_estate_property_types", random, ["Apartment", "House"]);
	}

	static getCuisine(random: () => number): string {
		return this.pickRandom("food_cuisines", random, ["Italian", "Indian", "Chinese"]);
	}

	static getISP(random: () => number): string {
		return this.pickRandom("telecom_isps", random, ["Verizon", "Jio", "Airtel"]);
	}

	static getMinistry(random: () => number): string {
		return this.pickRandom("government_ministries_india", random, ["Ministry of Finance", "Ministry of Education"]);
	}

	static getMedicalSpecialty(random: () => number): string {
		return this.pickRandom("healthcare_specialties", random, ["Cardiology", "Neurology", "Pediatrics"]);
	}

	static getHashtag(random: () => number): string {
		return this.pickRandom("social_hashtags", random, ["#tech", "#innovation", "#data"]);
	}

	static getProgrammingLanguage(random: () => number): string {
		return this.pickRandom("tech_programming_languages", random, ["JavaScript", "Python", "Java"]);
	}

	static getCurrency(random: () => number): string {
		const currencies = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "SGD", "CHF", "CNY"];
		return this.element(currencies, random);
	}

	static city(random: () => number): string {
		return this.pickRandom("geography_cities_global", random, [
			"New York", "San Francisco", "London", "Berlin", "Tokyo", "Singapore",
			"Bangalore", "Mumbai", "Toronto", "Sydney", "Amsterdam", "Dubai",
			"Paris", "Seoul", "Mexico City", "São Paulo", "Chicago", "Austin"
		]);
	}

	// URL helpers
	static url(random: () => number, context?: { collectionName?: string; fieldName?: string }): string {
		const fieldHint = context?.fieldName?.toLowerCase() || "";
		const schemes = ["https://", "https://", "https://", "http://"];
		const scheme = this.element(schemes, random);

		if (fieldHint.includes("avatar") || fieldHint.includes("photo") || fieldHint.includes("thumbnail") || fieldHint.includes("image")) {
			const w = [200, 400, 800][Math.floor(random() * 3)];
			const h = [200, 300, 600][Math.floor(random() * 3)];
			return `https://picsum.photos/${w}/${h}?random=${Math.floor(random() * 10000)}`;
		}
		if (fieldHint.includes("cover") || fieldHint.includes("banner")) {
			return `https://picsum.photos/1200/400?random=${Math.floor(random() * 10000)}`;
		}

		const domains = [
			"example.com", "acme.io", "testapp.dev", "demo.org",
			"app.example.com", "api.testservice.io", "cdn.example.net"
		];
		const paths = [
			"", "/about", "/products", "/users/profile",
			"/api/v1/resources", "/docs/getting-started", "/dashboard"
		];
		const domain = this.element(domains, random);
		const urlPath = this.element(paths, random);
		return `${scheme}${domain}${urlPath}`;
	}

	static slug(random: () => number): string {
		const words = [
			"quick", "lazy", "brown", "fox", "data", "schema", "design", "api",
			"cloud", "node", "event", "stream", "pipeline", "service", "platform",
			"app", "tool", "kit", "hub", "lab", "core", "base", "edge", "layer"
		];
		const w1 = this.element(words, random);
		const w2 = this.element(words, random);
		const num = random() < 0.4 ? `-${Math.floor(random() * 999) + 1}` : "";
		return `${w1}-${w2}${num}`;
	}

	static phone(random: () => number): string {
		// US-style E.164 format
		const area = Math.floor(random() * 800) + 200;
		const exchange = Math.floor(random() * 800) + 200;
		const subscriber = Math.floor(random() * 9000) + 1000;
		return `+1${area}${exchange}${subscriber}`;
	}

	static token(random: () => number, length: number = 32): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		return Array.from({ length }, () => chars[Math.floor(random() * chars.length)]).join("");
	}

	static hexColor(random: () => number): string {
		return "#" + Math.floor(random() * 0xFFFFFF).toString(16).padStart(6, "0");
	}

	static semver(random: () => number): string {
		const major = Math.floor(random() * 5);
		const minor = Math.floor(random() * 20);
		const patch = Math.floor(random() * 50);
		return `${major}.${minor}.${patch}`;
	}

	static mimeType(random: () => number): string {
		const mimes = [
			"application/json", "application/pdf", "image/png", "image/jpeg",
			"text/plain", "text/html", "text/csv", "application/xml",
			"video/mp4", "audio/mpeg", "application/zip", "application/octet-stream"
		];
		return this.element(mimes, random);
	}

	static locale(random: () => number): string {
		const locales = [
			"en-US", "en-GB", "fr-FR", "de-DE", "es-ES", "pt-BR",
			"ja-JP", "zh-CN", "ko-KR", "hi-IN", "ar-SA", "ru-RU", "it-IT"
		];
		return this.element(locales, random);
	}

	static role(random: () => number): string {
		const roles = ["admin", "user", "moderator", "viewer", "editor", "owner", "guest", "superadmin"];
		return this.element(roles, random);
	}

	static priority(random: () => number): string {
		// Weighted: low is most common, critical is rare
		const val = random();
		if (val < 0.4) return "low";
		if (val < 0.75) return "medium";
		if (val < 0.92) return "high";
		return "critical";
	}

	static errorMessage(random: () => number): string {
		const messages = [
			"Connection timed out after 30 seconds",
			"Invalid authentication token",
			"Resource not found",
			"Rate limit exceeded — retry after 60 seconds",
			"Validation failed: required field missing",
			"Upstream service unavailable",
			"Permission denied for this operation",
			"Duplicate entry for unique constraint",
			"Payload too large — maximum size is 1MB",
			"Schema version mismatch",
		];
		return this.element(messages, random);
	}

	private static element<T>(array: T[], random: () => number): T {
		return array[Math.floor(random() * array.length)];
	}
}
