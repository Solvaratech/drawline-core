import { SemanticProvider } from "../providers/SemanticProvider";
import { StatsUtils } from "../utils/StatsUtils";

/**
 * Inference result containing a generation function and metadata.
 */
export interface InferenceResult {
	generator: (random: () => number, context?: InferenceContext) => any;
	meta: {
		ruleName: string;
		score: number;
		isFallback: boolean;
	};
}

export interface InferenceContext {
	fieldName: string;
	collectionName: string;
	schemaType?: string;
}

type InferenceRule = {
	name: string;
	tokens: string[];
	negativeTokens?: string[];
	score: number;
	generator: (random: () => number, context?: InferenceContext) => any;
};

/**
 * FieldInferenceEngine without external dependencies like Faker.
 * Uses SemanticProvider for realistic strings and StatsUtils for numeric distributions.
 */
export class FieldInferenceEngine {
	private rules: InferenceRule[] = [];
	private cache: Map<string, InferenceResult> = new Map();

	constructor() {
		this.initializeRules();
	}

	private initializeRules() {
		// ID Rules
		this.addRule('id_numeric', ['id'], 2, (r) => Math.floor(r() * 1000000));
		
		// Personal Information
		this.addRule('email', ['email'], 10, (r) => SemanticProvider.email(r));
		this.addRule('full_name', ['name'], 5, (r, ctx) => SemanticProvider.fullName(r, ctx), ['user', 'login', 'first', 'last']);
		this.addRule('first_name', ['first', 'name'], 8, (r, ctx) => SemanticProvider.fullName(r, ctx).split(' ')[0]);
		this.addRule('last_name', ['last', 'name'], 8, (r, ctx) => SemanticProvider.fullName(r, ctx).split(' ')[1]);
		
		// Career / Professional
		this.addRule('job_title', ['job'], 10, (r) => SemanticProvider.getJobTitle(r));
		this.addRule('occupation', ['occupation'], 10, (r) => SemanticProvider.getJobTitle(r));
		this.addRule('designation', ['designation'], 10, (r) => SemanticProvider.getJobTitle(r));

		// Address / Location
		this.addRule('city', ['city'], 10, (r) => SemanticProvider.city(r));
		this.addRule('address', ['address'], 10, (r) => SemanticProvider.getAddress(r));
		this.addRule('country', ['country'], 10, (r) => SemanticProvider.getCountry(r)); 
		this.addRule('state', ['state'], 10, (r, ctx) => SemanticProvider.getState(r, ctx));
		this.addRule('province', ['province'], 10, (r, ctx) => SemanticProvider.getState(r, ctx));
		
		// Company / Business
		this.addRule('company', ['company'], 10, (r) => SemanticProvider.company(r));
		this.addRule('brand', ['brand'], 10, (r) => SemanticProvider.company(r));
		
		// Financial
		this.addRule('bank', ['bank'], 10, (r, ctx) => SemanticProvider.getBank(r, ctx));
		this.addRule('currency', ['currency'], 10, (r) => SemanticProvider.getCurrency(r));
		this.addRule('amount', ['amount'], 8, (r) => Math.round(StatsUtils.normal(r, 1000, 500) * 100) / 100);

		// Tech
		this.addRule('programming_language', ['language'], 10, (r) => SemanticProvider.getProgrammingLanguage(r));
		this.addRule('tech_stack', ['stack'], 10, (r) => SemanticProvider.getProgrammingLanguage(r));

		// Education
		this.addRule('university', ['university', 'college'], 10, (r) => SemanticProvider.getUniversity(r));
		this.addRule('school', ['school'], 10, (r) => SemanticProvider.getUniversity(r));

		// Logistics
		this.addRule('carrier', ['carrier', 'shipper'], 10, (r) => SemanticProvider.getLogisticsCarrier(r));
		this.addRule('tracking_number', ['tracking'], 10, (r) => "TRK" + Math.floor(r() * 1e12));

		// Automotive
		this.addRule('car_make', ['make', 'car', 'brand'], 10, (r) => SemanticProvider.getCarMake(r));
		this.addRule('vehicle', ['vehicle'], 10, (r) => SemanticProvider.getCarMake(r));

		// Media
		this.addRule('genre', ['genre'], 10, (r) => SemanticProvider.getGenre(r));
		this.addRule('category', ['category'], 5, (r) => SemanticProvider.getGenre(r), ['product', 'company']);

		// Security / IT
		this.addRule('user_agent', ['user_agent', 'ua'], 10, (r) => SemanticProvider.getUserAgent(r));
		this.addRule('ip_address', ['ip'], 10, (r) => `${Math.floor(r()*255)}.${Math.floor(r()*255)}.${Math.floor(r()*255)}.${Math.floor(r()*255)}`);

		// Commerce
		this.addRule('payment_method', ['payment', 'method'], 10, (r) => SemanticProvider.getPaymentMethod(r));
		this.addRule('transaction_type', ['transaction'], 10, (r) => SemanticProvider.pickRandom("commerce_payment_methods", r, ["Sale", "Refund"]));

		// Environment
		this.addRule('weather', ['weather', 'condition'], 10, (r) => SemanticProvider.getWeather(r));
		this.addRule('energy_source', ['energy', 'source'], 10, (r) => SemanticProvider.getEnergySource(r));
		this.addRule('fuel', ['fuel'], 10, (r) => SemanticProvider.getEnergySource(r));

		// Devices / Tech
		this.addRule('device_type', ['device'], 10, (r) => SemanticProvider.getDeviceType(r));
		this.addRule('platform', ['platform'], 5, (r) => SemanticProvider.getDeviceType(r), ['company', 'social']);

		// Fashion / Retail
		this.addRule('clothing_type', ['clothing', 'apparel'], 10, (r) => SemanticProvider.getClothingType(r));
		this.addRule('size', ['size'], 10, (r) => SemanticProvider.pickRandom("fashion_clothing_types", r, ["S", "M", "L", "XL"]));

		// Aviation / Travel
		this.addRule('airline', ['airline', 'carrier'], 10, (r) => SemanticProvider.getAirline(r));
		this.addRule('flight_number', ['flight'], 10, (r) => "FL" + Math.floor(r() * 9000 + 1000));

		// HR
		this.addRule('employment_type', ['employment', 'contract'], 10, (r) => SemanticProvider.getEmploymentType(r));
		this.addRule('work_arrangement', ['work'], 10, (r) => SemanticProvider.getEmploymentType(r));
		this.addRule('department', ['department'], 10, (r) => SemanticProvider.getDepartment(r));

		// Healthcare
		this.addRule('medical_specialty', ['specialty'], 10, (r) => SemanticProvider.getMedicalSpecialty(r));
		
		// Real Estate
		this.addRule('property_type', ['property', 'building'], 10, (r) => SemanticProvider.getPropertyType(r));
		this.addRule('amenities', ['amenity'], 10, (r) => SemanticProvider.pickRandom("real_estate_property_types", r, ["Gym", "Pool"]));

		// Food
		this.addRule('cuisine', ['cuisine'], 10, (r) => SemanticProvider.getCuisine(r));
		this.addRule('food_type', ['food'], 10, (r) => SemanticProvider.getCuisine(r));

		// Telecom
		this.addRule('isp', ['isp', 'provider'], 10, (r) => SemanticProvider.getISP(r));
		this.addRule('network', ['network'], 10, (r) => SemanticProvider.pickRandom("telecom_isps", r, ["5G", "Fiber"]));

		// Government
		this.addRule('ministry', ['ministry', 'govt'], 10, (r) => SemanticProvider.getMinistry(r));
		this.addRule('authority', ['authority'], 10, (r) => SemanticProvider.getMinistry(r));

		// Science / Nature
		this.addRule('planet', ['planet', 'star'], 10, (r) => SemanticProvider.getPlanet(r));
		this.addRule('element', ['element', 'chemical'], 10, (r) => SemanticProvider.getElement(r));
		this.addRule('organ', ['organ', 'anatomy'], 10, (r) => SemanticProvider.getOrgan(r));
		this.addRule('animal', ['animal', 'pet'], 10, (r) => SemanticProvider.getAnimal(r));
		this.addRule('plant', ['plant', 'flower'], 10, (r) => SemanticProvider.getPlant(r));

		// Science / Nature
		this.addRule('planet', ['planet', 'star'], 10, (r) => SemanticProvider.getPlanet(r));
		this.addRule('element', ['element', 'chemical'], 10, (r) => SemanticProvider.getElement(r));
		this.addRule('organ', ['organ', 'anatomy'], 10, (r) => SemanticProvider.getOrgan(r));
		this.addRule('animal', ['animal', 'pet'], 10, (r) => SemanticProvider.getAnimal(r));
		this.addRule('plant', ['plant', 'flower'], 10, (r) => SemanticProvider.getPlant(r));

		// Tech / Protocols
		this.addRule('protocol', ['protocol'], 10, (r) => SemanticProvider.getProtocol(r));
		this.addRule('resolution', ['resolution', 'display'], 10, (r) => SemanticProvider.getResolution(r));

		// Logistics / Units
		this.addRule('unit', ['unit', 'measure'], 10, (r) => SemanticProvider.getUnit(r));
		this.addRule('weight_unit', ['weight'], 10, (r) => SemanticProvider.getUnit(r));

		// Financial / Legal
		this.addRule('tax_type', ['tax'], 10, (r) => SemanticProvider.getTaxType(r));
		this.addRule('case_status', ['case', 'status'], 10, (r) => SemanticProvider.getCaseStatus(r));
		this.addRule('iso_code', ['iso', 'code'], 10, (r) => SemanticProvider.getISOCode(r));

		// Social / Content
		this.addRule('social_platform', ['platform'], 10, (r) => SemanticProvider.getSocialPlatform(r));
		this.addRule('sentiment', ['sentiment', 'mood'], 10, (r) => SemanticProvider.getSentiment(r));

		// Healthcare / Aviation
		this.addRule('vital_type', ['vital', 'measurement'], 10, (r) => SemanticProvider.getVitalType(r));
		this.addRule('flight_status', ['flight', 'status'], 10, (r) => SemanticProvider.getFlightStatus(r));

		// Music / Tools
		this.addRule('instrument', ['instrument', 'music'], 10, (r) => SemanticProvider.getInstrument(r));
		this.addRule('tool', ['tool', 'equipment'], 10, (r) => SemanticProvider.getTool(r));

		// Agriculture
		this.addRule('crop', ['crop', 'produce'], 10, (r) => SemanticProvider.getCrop(r));

		// Tech / Infrastructure
		this.addRule('cloud_provider', ['cloud', 'provider'], 10, (r) => SemanticProvider.getCloudProvider(r));
		this.addRule('database', ['database', 'db'], 10, (r) => SemanticProvider.getDatabase(r));
		this.addRule('timezone', ['timezone', 'tz'], 10, (r) => SemanticProvider.getTimezone(r));

		// Status / Logic
		this.addRule('status', ['status'], 10, (r, ctx) => SemanticProvider.getStatus(r, ctx));
		this.addRule('interaction', ['interaction', 'action'], 10, (r) => SemanticProvider.getInteraction(r));

		// Sports / Entertainment
		this.addRule('sport', ['sport', 'game'], 10, (r) => SemanticProvider.getSport(r));
		this.addRule('gaming_platform', ['gaming', 'platform'], 10, (r) => SemanticProvider.getGamingPlatform(r));

		// Education / Professional
		this.addRule('subject', ['subject', 'course'], 10, (r) => SemanticProvider.getSubject(r));
		this.addRule('certification', ['certification', 'certificate'], 10, (r) => SemanticProvider.getCertification(r));

		// Hospitality / Travel
		this.addRule('amenity', ['amenity'], 10, (r) => SemanticProvider.getAmenity(r));
		this.addRule('id_type', ['id_type', 'identity'], 10, (r, ctx) => SemanticProvider.getIDType(r, ctx));

		// Finance
		this.addRule('investment_type', ['investment', 'asset'], 10, (r) => SemanticProvider.getInvestmentType(r));
		this.addRule('portfolio', ['portfolio'], 5, (r) => SemanticProvider.getInvestmentType(r));

		// Marketing / Media
		this.addRule('marketing_channel', ['channel', 'marketing'], 10, (r) => SemanticProvider.getMarketingChannel(r));
		this.addRule('source', ['source'], 5, (r) => SemanticProvider.getMarketingChannel(r), ['user', 'lead']);

		// Manufacturing / Industry
		this.addRule('material', ['material', 'raw'], 10, (r) => SemanticProvider.getMaterial(r));
		this.addRule('legal_document', ['legal', 'document', 'agreement'], 10, (r) => SemanticProvider.getLegalDocument(r));

		// Social
		this.addRule('hashtag', ['hashtag'], 10, (r) => SemanticProvider.getHashtag(r));
		this.addRule('tags', ['tags'], 5, (r) => SemanticProvider.getHashtag(r));

		// E-commerce
		this.addRule('product_name', ['product'], 10, (r) => SemanticProvider.getProductName(r));
		this.addRule('price', ['price'], 10, (r) => Math.round(StatsUtils.normal(r, 49.99, 20) * 100) / 100);
		this.addRule('sku', ['sku'], 10, (r) => "SKU-" + Math.floor(r() * 100000).toString(36).toUpperCase());

		// Indian Context Specific (Synthetic Patterns)
		this.addRule('pan_card', ['pan'], 12, (r) => {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
			const prefix = Array.from({length: 5}, () => chars[Math.floor(r() * 26)]).join("");
			const suffix = chars[Math.floor(r() * 26)];
			return prefix + (Math.floor(r() * 9000) + 1000) + suffix;
		});
		this.addRule('aadhaar', ['aadhaar'], 12, (r) => {
			return Array.from({length: 3}, () => Math.floor(r() * 9000) + 1000).join(" ");
		});

		// Content (The "Realistic" Part)
		this.addRule('genre', ['genre'], 10, (r) => SemanticProvider.getGenre(r));
		this.addRule('year', ['year'], 10, (r) => SemanticProvider.getYear(r));
		this.addRule('release_year', ['release', 'year'], 12, (r) => SemanticProvider.getYear(r, 1950, 2024));
		
		this.addRule('title', ['title'], 10, (r, ctx) => SemanticProvider.title(r, ctx?.collectionName));
		this.addRule('subject', ['subject'], 10, (r, ctx) => SemanticProvider.title(r, ctx?.collectionName));
		this.addRule('content', ['content'], 10, (r) => SemanticProvider.content(r, "medium"));
		this.addRule('body', ['body'], 10, (r) => SemanticProvider.content(r, "long"));
		this.addRule('description', ['description'], 8, (r) => SemanticProvider.content(r, "short"));
		this.addRule('bio', ['bio'], 10, (r) => SemanticProvider.content(r, "short"));

		// Numeric Statistics (The "Math" Part)
		this.addRule('age', ['age'], 15, (r) => Math.round(StatsUtils.normal(r, 32, 12)));
		this.addRule('score', ['score'], 10, (r) => Math.round(StatsUtils.normal(r, 75, 15)));
		this.addRule('rating', ['rating'], 10, (r) => StatsUtils.clamp(StatsUtils.normal(r, 4.2, 0.8), 1, 5));
		this.addRule('views', ['view'], 10, (r) => Math.floor(StatsUtils.zipf(r, 10000, 1.1)));
		this.addRule('likes', ['like'], 10, (r) => Math.floor(StatsUtils.zipf(r, 5000, 1.2)));

		// Metadata
		this.addRule('created_at', ['created'], 10, (r) => new Date(Date.now() - r() * 10000000000).toISOString());
	}

	private addRule(name: string, tokens: string[], score: number, generator: (random: () => number, context?: InferenceContext) => any, negativeTokens: string[] = []) {
		this.rules.push({
			name,
			tokens: tokens.map(t => t.toLowerCase()),
			negativeTokens: negativeTokens.map(t => t.toLowerCase()),
			score,
			generator
		});
	}

	private tokenize(fieldName: string): string[] {
		const parts = fieldName.split(/[_\-\.\s]+/);
		const tokens: string[] = [];
		for (const part of parts) {
			const camelParts = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
			for (const t of camelParts) {
				const lower = t.toLowerCase().trim();
				if (lower.length > 0) tokens.push(lower);
			}
		}
		return tokens;
	}

	public getGenerator(fieldName: string, collectionName: string = 'global'): InferenceResult {
		const cacheKey = `${collectionName.toLowerCase()}:${fieldName.toLowerCase()}`;
		if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

		const tokens = this.tokenize(fieldName);
		let bestRule: InferenceRule | null = null;
		let bestScore = -1;

		for (const rule of this.rules) {
			if (rule.negativeTokens && rule.negativeTokens.some(nt => tokens.includes(nt))) continue;
			const hasAllTokens = rule.tokens.every(rt => tokens.includes(rt));
			if (!hasAllTokens) continue;

			let currentScore = rule.score;
			if (rule.tokens.length === tokens.length) currentScore += 5;
			else currentScore -= (tokens.length - rule.tokens.length) * 0.5;

			if (currentScore > bestScore) {
				bestScore = currentScore;
				bestRule = rule;
			}
		}

		const result: InferenceResult = bestRule 
			? { generator: bestRule.generator, meta: { ruleName: bestRule.name, score: bestScore, isFallback: false } }
			: { generator: (r) => "Sample " + fieldName, meta: { ruleName: 'fallback_default', score: 0, isFallback: true } };

		this.cache.set(cacheKey, result);
		return result;
	}

	public generate(fieldName: string, collectionName: string = 'global', random: () => number): any {
		const result = this.getGenerator(fieldName, collectionName);
		return result.generator(random, { fieldName, collectionName });
	}
}

export const fieldInferenceEngine = new FieldInferenceEngine();
