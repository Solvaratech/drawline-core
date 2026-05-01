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
		"William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen"
	];

	private static lastNames = [
		"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"
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
		const last = this.pickRandom("names_global", random, this.lastNames);
		const res = `${first.charAt(0).toUpperCase() + first.slice(1)} ${last.charAt(0).toUpperCase() + last.slice(1)}`;
		return res;
	}

	static email(random: () => number, name?: string): string {
		const base = name ? name.toLowerCase().replace(/\s/g, ".") : this.pickRandom("names_global", random, ["user"]).toLowerCase();
		const domain = this.pickRandom("companies", random, ["gmail", "yahoo", "outlook"]).toLowerCase().replace(/[^a-z]/g, "");
		const suffixes = ["com", "io", "net", "org", "ai", "co.in"];
		const suffix = suffixes[Math.floor(random() * suffixes.length)];
		return `${base}${Math.floor(random() * 99)}@${domain}.${suffix}`;
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
			];
			const topics = ["Productivity", "Technology", "AI", "Remote Work", "Design", "Fitness", "Global Economy"];
			const template = templates[Math.floor(random() * templates.length)];
			const topic = topics[Math.floor(random() * topics.length)];
			return template.replace("{Topic}", topic);
		}
		if (ctx.includes("product")) {
			return this.pickRandom("ecommerce_product_names", random, ["Wireless Headphones", "Smart Watch", "Leather Wallet"]);
		}

		const catchPhrases = [
			"Adaptive secondary generation",
			"Focused multi-tasking initiative",
			"Synergistic content distribution",
			"Seamless user experience transformation",
			"Advanced predictive analytics engine",
		];
		return this.pickRandom("job_titles", random, catchPhrases);
	}

	static getGenre(random: () => number): string {
		return this.pickRandom("media_genres", random, ["Action", "Sci-Fi", "Drama", "Comedy"]);
	}

	static getYear(random: () => number, start: number = 1970, end: number = 2024): string {
		return Math.floor(random() * (end - start + 1) + start).toString();
	}

	static content(random: () => number, length: "short" | "medium" | "long" = "medium"): string {
		const postSentences = [
			"It’s no secret that the industry is changing rapidly.",
			"Most people think it's about speed, but it's actually about consistency.",
			"The data suggests a strong correlation between these two factors.",
			"We found that implementing this simple change improved performance by 40%.",
			"The landscape is evolving, and we must evolve with it.",
		];
		const count = length === "short" ? 2 : length === "medium" ? 5 : 12;
		const sentences = [];
		for (let i = 0; i < count; i++) {
			sentences.push(this.element(postSentences, random));
		}
		return sentences.join(" ");
	}

	static company(random: () => number): string {
		return this.pickRandom("companies", random, ["Acme Corp", "Globex", "Soylent Corp"]);
	}

	static getJobTitle(random: () => number): string {
		const catchPhrases = [
			"Adaptive secondary generation",
			"Focused multi-tasking initiative",
			"Synergistic content distribution",
		];
		return this.pickRandom("job_titles", random, catchPhrases);
	}

	static getProductName(random: () => number): string {
		const productNames = this.loadDataset("products_commerce");
		if (productNames.length > 0) {
			return productNames[Math.floor(random() * productNames.length)];
		}

		const adjectives = ["Smart", "Wireless", "Premium", "Eco", "Ultra"];
		const categories = ["Watch", "Headphones", "Phone", "Camera", "Laptop"];
		const adj = adjectives[Math.floor(random() * adjectives.length)];
		const cat = categories[Math.floor(random() * categories.length)];
		return `${adj} ${cat} ${Math.floor(random() * 900) + 100}`;
	}

	static getAddress(random: () => number): string {
		const streets = ["Park Avenue", "Main Street", "Broadway", "MG Road", "Sunset Blvd"];
		const cities = ["New York", "London", "Bangalore", "San Francisco", "Tokyo", "Mumbai"];
		const street = streets[Math.floor(random() * streets.length)];
		const city = cities[Math.floor(random() * cities.length)];
		return `${Math.floor(random() * 999) + 1} ${street}, ${city}`;
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
		const isCommerce = context?.collectionName?.toLowerCase().includes("order") || context?.collectionName?.toLowerCase().includes("purchase");
		if (isCommerce) {
			return this.pickRandom("commerce_order_statuses", random, ["Pending", "Shipped", "Delivered"]);
		}
		const generic = ["Active", "Inactive", "Pending", "Suspended"];
		return generic[Math.floor(random() * generic.length)];
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
		return this.pickRandom("geography_timezones", random, ["UTC", "PST", "IST"]);
	}

	static getSport(random: () => number): string {
		return this.pickRandom("sports_names", random, ["Soccer", "Cricket", "Tennis"]);
	}

	static getSubject(random: () => number): string {
		return this.pickRandom("education_subjects", random, ["Math", "Physics", "History"]);
	}

	static getCertification(random: () => number): string {
		return this.pickRandom("professional_certifications", random, ["PMP", "AWS Architect", "CFA"]);
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
		return globalIds[Math.floor(random() * globalIds.length)];
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
		return this.pickRandom("social_hashtags", random, ["#tech", "#love", "#happy"]);
	}

	static getProgrammingLanguage(random: () => number): string {
		return this.pickRandom("tech_programming_languages", random, ["JavaScript", "Python", "Java"]);
	}

	static getCurrency(random: () => number): string {
		const currencies = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "SGD", "CHF", "CNY"];
		return currencies[Math.floor(random() * currencies.length)];
	}

	static city(random: () => number): string {
		const cities = ["New York", "San Francisco", "London", "Berlin", "Tokyo", "Singapore", "Bangalore", "Mumbai"];
		return this.element(cities, random);
	}

	private static element<T>(array: T[], random: () => number): T {
		return array[Math.floor(random() * array.length)];
	}
}
