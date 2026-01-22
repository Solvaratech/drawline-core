
import { Faker, en } from "@faker-js/faker";

export interface InferenceResult {
	generator: (faker: Faker) => any;
	meta: {
		ruleName: string;
		score: number;
		isFallback: boolean;
	};
}

type InferenceRule = {
	name: string;
	tokens: string[];     // All these tokens must be present (OR logic can be handled by multiple rules)
	negativeTokens?: string[]; // If any of these are present, rule is invalid
	score: number;        // Higher score win
	generator: (faker: Faker) => any;
};

export class FieldInferenceEngine {
	private rules: InferenceRule[] = [];
	private cache: Map<string, InferenceResult> = new Map();
	private faker: Faker;

	constructor() {
		this.faker = new Faker({ locale: [en] });
		this.initializeRules();
	}

	private initializeRules() {
		// ID Rules
		this.addRule('uuid', ['uuid'], 10, f => f.string.uuid());
		this.addRule('guid', ['guid'], 10, f => f.string.uuid());
		this.addRule('id', ['id'], 1, f => f.string.uuid(), ['user', 'account']); // Low score generic ID

		// Personal Information
		this.addRule('email', ['email'], 10, f => f.internet.email());
		this.addRule('first_name', ['first', 'name'], 8, f => f.person.firstName());
		this.addRule('last_name', ['last', 'name'], 8, f => f.person.lastName());
		this.addRule('full_name', ['name'], 5, f => f.person.fullName(), ['user', 'login', 'first', 'last', 'sur', 'nick']);
		this.addRule('username', ['user', 'name'], 8, f => f.internet.username());
		this.addRule('username_simple', ['username'], 10, f => f.internet.username());
		this.addRule('login', ['login'], 8, f => f.internet.username());
		this.addRule('phone', ['phone'], 8, f => f.phone.number());
		this.addRule('mobile', ['mobile'], 8, f => f.phone.number());
		this.addRule('job_title', ['job', 'title'], 8, f => f.person.jobTitle());
		this.addRule('profession', ['profession'], 8, f => f.person.jobTitle());
		this.addRule('bio', ['bio'], 8, f => f.person.bio());
		this.addRule('biography', ['biography'], 8, f => f.person.bio());
		this.addRule('avatar', ['avatar'], 10, f => f.image.avatar());
		this.addRule('profile_pic', ['profile', 'pic'], 9, f => f.image.avatar());
		this.addRule('gender', ['gender'], 10, f => f.person.sex());
		this.addRule('sex', ['sex'], 10, f => f.person.sex());

		// Address / Location
		this.addRule('street_address', ['street'], 8, f => f.location.streetAddress());
		this.addRule('address', ['address'], 6, f => f.location.streetAddress(), ['ip', 'mac', 'email', 'link']);
		this.addRule('city', ['city'], 10, f => f.location.city());
		this.addRule('town', ['town'], 10, f => f.location.city());
		this.addRule('state', ['state'], 8, f => f.location.state());
		this.addRule('province', ['province'], 8, f => f.location.state());
		this.addRule('zip', ['zip'], 8, f => f.location.zipCode());
		this.addRule('postal_code', ['postal'], 8, f => f.location.zipCode());
		this.addRule('country', ['country'], 10, f => f.location.country());
		this.addRule('latitude', ['latitude'], 10, f => String(f.location.latitude()));
		this.addRule('lat', ['lat'], 10, f => String(f.location.latitude()));
		this.addRule('longitude', ['longitude'], 10, f => String(f.location.longitude()));
		this.addRule('lng', ['lng'], 10, f => String(f.location.longitude()));
		this.addRule('lon', ['lon'], 10, f => String(f.location.longitude()));

		// Internet / Web
		this.addRule('url', ['url'], 10, f => f.internet.url());
		this.addRule('website', ['website'], 10, f => f.internet.url());
		this.addRule('link', ['link'], 5, f => f.internet.url());
		this.addRule('ip_address', ['ip', 'address'], 15, f => f.internet.ip());
		this.addRule('ip_exact', ['ip'], 10, f => f.internet.ip(), ['description', 'zip', 'ship', 'trip', 'strip', 'script', 'vip']); // Negative tokens crucial here
		this.addRule('domain', ['domain'], 10, f => f.internet.domainName());
		this.addRule('password', ['password'], 10, f => f.internet.password());
		this.addRule('mac_address', ['mac', 'address'], 10, f => f.internet.mac());

		// Company / Commerce
		this.addRule('company_name', ['company'], 8, f => f.company.name());
		this.addRule('company_simple', ['business'], 8, f => f.company.name());
		this.addRule('department', ['department'], 8, f => f.commerce.department());
		this.addRule('price', ['price'], 8, f => f.commerce.price());
		this.addRule('amount', ['amount'], 6, f => f.commerce.price());
		this.addRule('cost', ['cost'], 6, f => f.commerce.price());
		this.addRule('currency', ['currency'], 10, f => f.finance.currencyCode());
		this.addRule('credit_card', ['credit', 'card'], 10, f => f.finance.creditCardNumber());
		this.addRule('cc_number', ['cc', 'number'], 10, f => f.finance.creditCardNumber());

		// Content
		this.addRule('title', ['title'], 5, f => f.lorem.sentence({ min: 3, max: 8 }), ['job']);
		this.addRule('subject', ['subject'], 5, f => f.lorem.sentence({ min: 3, max: 8 }));
		this.addRule('slug', ['slug'], 10, f => f.lorem.slug());
		this.addRule('description', ['description'], 10, f => f.lorem.paragraph());
		this.addRule('body_text', ['body'], 5, f => f.lorem.paragraph());
		this.addRule('content', ['content'], 5, f => f.lorem.paragraph());
		this.addRule('summary', ['summary'], 8, f => f.lorem.paragraph());
		this.addRule('comment', ['comment'], 8, f => f.lorem.paragraph());
		this.addRule('message', ['message'], 5, f => f.lorem.paragraph());

		// Metadata
		this.addRule('created_at', ['created', 'at'], 10, f => f.date.past().toISOString());
		this.addRule('updated_at', ['updated', 'at'], 10, f => f.date.past().toISOString());

		// Misc
		this.addRule('role', ['role'], 8, f => f.helpers.arrayElement(['user', 'admin', 'editor', 'guest', 'manager']));
		this.addRule('status', ['status'], 8, f => f.helpers.arrayElement(['active', 'inactive', 'pending', 'archived', 'suspended']));

		// TODO - add more rules ( IMPORTANT )
	}

	private addRule(name: string, tokens: string[], score: number, generator: (faker: Faker) => any, negativeTokens: string[] = []) {
		this.rules.push({
			name,
			tokens: tokens.map(t => t.toLowerCase()),
			negativeTokens: negativeTokens.map(t => t.toLowerCase()),
			score,
			generator
		});
	}

	/**
	 * Tokenize field name into logical parts
	 * e.g. "firstName" -> ["first", "name"]
	 *      "user_ip_address" -> ["user", "ip", "address"]
	 */
	private tokenize(fieldName: string): string[] {
		// Split by underscore, hyphen, space, dot
		const parts = fieldName.split(/[_\-\.\s]+/);

		const tokens: string[] = [];
		for (const part of parts) {
			const camelParts = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
			for (const t of camelParts) {
				const lower = t.toLowerCase().trim();
				if (lower.length > 0) {
					tokens.push(lower);
				}
			}
		}
		return tokens;
	}

	public getGenerator(fieldName: string, collectionName: string = 'global'): InferenceResult {
		const cacheKey = `${collectionName.toLowerCase()}:${fieldName.toLowerCase()}`;
		if (this.cache.has(cacheKey)) {
			return this.cache.get(cacheKey)!;
		}

		const tokens = this.tokenize(fieldName);
		let bestRule: InferenceRule | null = null;
		let bestScore = -1;

		for (const rule of this.rules) {
			if (rule.negativeTokens && rule.negativeTokens.some(nt => tokens.includes(nt))) {
				continue;
			}

			const hasAllTokens = rule.tokens.every(rt => tokens.includes(rt));
			if (!hasAllTokens) {
				continue;
			}

			let currentScore = rule.score;

			if (rule.tokens.length === tokens.length) {
				currentScore += 5; // Perfect match bonus
			} else {
				const noise = tokens.length - rule.tokens.length;
				currentScore -= (noise * 0.5);
			}

			if (currentScore > bestScore) {
				bestScore = currentScore;
				bestRule = rule;
			}
		}

		let result: InferenceResult;

		if (bestRule) {
			result = {
				generator: bestRule.generator,
				meta: {
					ruleName: bestRule.name,
					score: bestScore,
					isFallback: false
				}
			};
		} else {
			result = {
				generator: (f) => f.lorem.word(),
				meta: {
					ruleName: 'fallback_default',
					score: 0,
					isFallback: true
				}
			};
		}

		this.cache.set(cacheKey, result);
		return result;
	}

	public generate(fieldName: string, collectionName: string = 'global'): any {
		const result = this.getGenerator(fieldName, collectionName);
		return result.generator(this.faker);
	}
}

export const fieldInferenceEngine = new FieldInferenceEngine();
