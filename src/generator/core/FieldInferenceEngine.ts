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
		// ─── Identity / Keys ────────────────────────────────────────────────────
		this.addRule("id_numeric", ["id"], 2, (r) => Math.floor(r() * 1000000));
		this.addRule("uuid_field", ["uuid"], 15, (r) => {
			const hex = () => Math.floor(r() * 0x10000).toString(16).padStart(4, "0");
			return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(Math.floor(r() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
		});

		// ─── Personal Information ────────────────────────────────────────────────
		this.addRule("email", ["email"], 15, (r) => SemanticProvider.email(r));
		this.addRule("full_name", ["name"], 5, (r, ctx) => SemanticProvider.fullName(r, ctx), ["user", "login", "first", "last", "middle", "nick"]);
		this.addRule("first_name", ["first", "name"], 10, (r, ctx) => SemanticProvider.fullName(r, ctx).split(" ")[0]);
		this.addRule("last_name", ["last", "name"], 10, (r, ctx) => SemanticProvider.fullName(r, ctx).split(" ")[1] || "Smith");
		this.addRule("middle_name", ["middle", "name"], 10, (r, ctx) => SemanticProvider.fullName(r, ctx).split(" ")[0]);
		this.addRule("username", ["username"], 12, (r) => SemanticProvider.username(r));
		this.addRule("username_handle", ["handle"], 10, (r) => SemanticProvider.username(r), ["file", "door"]);
		this.addRule("nickname", ["nickname", "nick"], 10, (r) => SemanticProvider.username(r));
		this.addRule("login", ["login"], 10, (r) => SemanticProvider.username(r));
		this.addRule("display_name", ["display", "name"], 10, (r, ctx) => SemanticProvider.fullName(r, ctx));

		// ─── Contact ─────────────────────────────────────────────────────────────
		this.addRule("phone", ["phone"], 12, (r) => SemanticProvider.phone(r));
		this.addRule("mobile", ["mobile"], 12, (r) => SemanticProvider.phone(r));
		this.addRule("cell", ["cell"], 10, (r) => SemanticProvider.phone(r), ["battery", "grid"]);
		this.addRule("telephone", ["telephone"], 12, (r) => SemanticProvider.phone(r));
		this.addRule("fax", ["fax"], 10, (r) => SemanticProvider.phone(r));

		// ─── Career / Professional ───────────────────────────────────────────────
		this.addRule("job_title", ["job"], 10, (r) => SemanticProvider.getJobTitle(r));
		this.addRule("occupation", ["occupation"], 10, (r) => SemanticProvider.getJobTitle(r));
		this.addRule("designation", ["designation"], 10, (r) => SemanticProvider.getJobTitle(r));
		this.addRule("position", ["position"], 6, (r) => SemanticProvider.getJobTitle(r), ["lat", "lng", "x", "y", "geo"]);
		this.addRule("role", ["role"], 12, (r) => SemanticProvider.role(r));
		this.addRule("permission", ["permission"], 10, (r) => SemanticProvider.role(r));
		this.addRule("access_level", ["access", "level"], 10, (r) => SemanticProvider.role(r));
		this.addRule("plan_tier", ["plan"], 8, (r) => {
			const plans = ["free", "starter", "pro", "enterprise", "business"];
			return plans[Math.floor(r() * plans.length)];
		}, ["floor", "game"]);
		this.addRule("subscription_tier", ["tier"], 8, (r) => {
			const tiers = ["free", "basic", "standard", "premium", "enterprise"];
			return tiers[Math.floor(r() * tiers.length)];
		});

		// ─── Address / Location ──────────────────────────────────────────────────
		this.addRule("city", ["city"], 12, (r) => SemanticProvider.city(r));
		this.addRule("address", ["address"], 12, (r) => SemanticProvider.getAddress(r));
		this.addRule("country", ["country"], 12, (r) => SemanticProvider.getCountry(r));
		this.addRule("state", ["state"], 10, (r, ctx) => SemanticProvider.getState(r, ctx));
		this.addRule("province", ["province"], 10, (r, ctx) => SemanticProvider.getState(r, ctx));
		this.addRule("region", ["region"], 8, (r, ctx) => SemanticProvider.getState(r, ctx));
		this.addRule("zip", ["zip"], 10, (r, ctx) => SemanticProvider.getZipCode(r, ctx));
		this.addRule("postal", ["postal"], 10, (r, ctx) => SemanticProvider.getZipCode(r, ctx));
		this.addRule("postcode", ["postcode"], 10, (r, ctx) => SemanticProvider.getZipCode(r, ctx));
		this.addRule("pincode", ["pincode"], 10, (r, ctx) => SemanticProvider.getZipCode(r, ctx));
		this.addRule("latitude", ["latitude"], 14, (r) => parseFloat(((r() * 180) - 90).toFixed(6)));
		this.addRule("lat", ["lat"], 12, (r) => parseFloat(((r() * 180) - 90).toFixed(6)), ["platform", "translate"]);
		this.addRule("longitude", ["longitude"], 14, (r) => parseFloat(((r() * 360) - 180).toFixed(6)));
		this.addRule("lng", ["lng"], 12, (r) => parseFloat(((r() * 360) - 180).toFixed(6)));
		this.addRule("lon", ["lon"], 12, (r) => parseFloat(((r() * 360) - 180).toFixed(6)), ["color", "colour"]);
		this.addRule("timezone", ["timezone", "tz"], 10, (r) => SemanticProvider.getTimezone(r));

		// ─── Web / Network ───────────────────────────────────────────────────────
		this.addRule("url", ["url"], 14, (r, ctx) => SemanticProvider.url(r, ctx));
		this.addRule("website", ["website"], 12, (r, ctx) => SemanticProvider.url(r, ctx));
		this.addRule("homepage", ["homepage"], 12, (r, ctx) => SemanticProvider.url(r, ctx));
		this.addRule("link", ["link"], 10, (r, ctx) => SemanticProvider.url(r, ctx), ["unlink", "delink"]);
		this.addRule("webpage", ["webpage"], 12, (r, ctx) => SemanticProvider.url(r, ctx));
		this.addRule("avatar", ["avatar"], 12, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "avatar" }));
		this.addRule("image_url", ["image"], 10, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "image" }), ["processing", "recognition"]);
		this.addRule("photo_url", ["photo"], 10, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "photo" }));
		this.addRule("thumbnail", ["thumbnail"], 12, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "thumbnail" }));
		this.addRule("picture", ["picture"], 10, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "photo" }));
		this.addRule("cover", ["cover"], 8, (r, ctx) => SemanticProvider.url(r, { ...ctx, fieldName: "cover" }), ["discover", "uncover"]);
		this.addRule("ip_address", ["ip"], 12, (r) => `${Math.floor(r()*223)+1}.${Math.floor(r()*254)+1}.${Math.floor(r()*254)+1}.${Math.floor(r()*254)+1}`);
		this.addRule("user_agent", ["user", "agent"], 12, (r) => SemanticProvider.getUserAgent(r));
		this.addRule("user_agent_ua", ["ua"], 10, (r) => SemanticProvider.getUserAgent(r));
		this.addRule("hostname", ["hostname"], 12, (r) => {
			const hosts = ["web-01", "api-server", "db-primary", "cache-node", "worker-3", "gateway", "edge-01"];
			return hosts[Math.floor(r() * hosts.length)] + ".internal";
		});
		this.addRule("host", ["host"], 8, (r) => {
			const hosts = ["web-01", "api-server", "db-primary", "cache-node", "worker-3"];
			return hosts[Math.floor(r() * hosts.length)] + ".internal";
		}, ["hostile"]);
		this.addRule("port", ["port"], 10, (r) => {
			const ports = [80, 443, 8080, 8443, 3000, 5432, 27017, 6379, 9200, 5672];
			return ports[Math.floor(r() * ports.length)];
		});
		this.addRule("protocol", ["protocol"], 10, (r) => SemanticProvider.getProtocol(r));
		this.addRule("mime_type", ["mime"], 12, (r) => SemanticProvider.mimeType(r));
		this.addRule("content_type", ["content", "type"], 10, (r) => SemanticProvider.mimeType(r), ["content", "body", "text"]);
		this.addRule("media_type", ["media", "type"], 10, (r) => SemanticProvider.mimeType(r));

		// ─── Security / Auth ─────────────────────────────────────────────────────
		this.addRule("token", ["token"], 14, (r) => SemanticProvider.token(r, 40));
		this.addRule("api_key", ["api", "key"], 14, (r) => "dk_" + SemanticProvider.token(r, 32));
		this.addRule("secret_key", ["secret"], 14, (r) => SemanticProvider.token(r, 48));
		this.addRule("access_token", ["access", "token"], 14, (r) => SemanticProvider.token(r, 64));
		this.addRule("refresh_token", ["refresh", "token"], 14, (r) => SemanticProvider.token(r, 64));
		this.addRule("auth_token", ["auth", "token"], 14, (r) => SemanticProvider.token(r, 64));
		this.addRule("password", ["password"], 14, (r) => {
			// Return a bcrypt-like hash stub — never plain text
			return "$2b$12$" + SemanticProvider.token(r, 53);
		});
		this.addRule("pwd", ["pwd"], 12, (r) => "$2b$12$" + SemanticProvider.token(r, 53));
		this.addRule("hash", ["hash"], 12, (r) => SemanticProvider.token(r, 64).toLowerCase());
		this.addRule("checksum", ["checksum"], 12, (r) => SemanticProvider.token(r, 32).toLowerCase());
		this.addRule("fingerprint", ["fingerprint"], 12, (r) => SemanticProvider.token(r, 40).toLowerCase());
		this.addRule("signature", ["signature"], 12, (r) => SemanticProvider.token(r, 64));

		// ─── Content / Text ──────────────────────────────────────────────────────
		this.addRule("title", ["title"], 12, (r, ctx) => SemanticProvider.title(r, ctx?.collectionName));
		this.addRule("subject", ["subject"], 10, (r, ctx) => SemanticProvider.title(r, ctx?.collectionName), ["course", "education"]);
		this.addRule("content_body", ["content"], 10, (r) => SemanticProvider.content(r, "medium"));
		this.addRule("body", ["body"], 10, (r) => SemanticProvider.content(r, "long"), ["embodied"]);
		this.addRule("description", ["description"], 10, (r) => SemanticProvider.content(r, "short"));
		this.addRule("bio", ["bio"], 10, (r) => SemanticProvider.content(r, "short"));
		this.addRule("summary", ["summary"], 10, (r) => SemanticProvider.content(r, "short"));
		this.addRule("excerpt", ["excerpt"], 10, (r) => SemanticProvider.content(r, "short"));
		this.addRule("abstract", ["abstract"], 10, (r) => SemanticProvider.content(r, "short"));
		this.addRule("note", ["note"], 8, (r) => SemanticProvider.content(r, "short"), ["notable"]);
		this.addRule("notes", ["notes"], 8, (r) => SemanticProvider.content(r, "short"));
		this.addRule("comment_text", ["comment"], 8, (r) => SemanticProvider.content(r, "short"), ["count", "commented"]);
		this.addRule("remark", ["remark"], 8, (r) => SemanticProvider.content(r, "short"));
		this.addRule("message", ["message"], 10, (r) => SemanticProvider.content(r, "medium"));
		this.addRule("text_field", ["text"], 8, (r) => SemanticProvider.content(r, "medium"), ["context", "subtext"]);
		this.addRule("details", ["details"], 8, (r) => SemanticProvider.content(r, "short"));
		this.addRule("reason", ["reason"], 10, (r) => {
			const reasons = [
				"User requested account deletion",
				"Payment method expired",
				"Subscription plan downgraded",
				"API rate limit exceeded",
				"Scheduled maintenance window",
				"Manual review required",
				"Duplicate record detected",
			];
			return reasons[Math.floor(r() * reasons.length)];
		});
		this.addRule("error_msg", ["error"], 10, (r) => SemanticProvider.errorMessage(r));
		this.addRule("exception", ["exception"], 10, (r) => SemanticProvider.errorMessage(r));
		this.addRule("slug_field", ["slug"], 14, (r) => SemanticProvider.slug(r));
		this.addRule("permalink", ["permalink"], 12, (r) => "/" + SemanticProvider.slug(r));

		// ─── Company / Business ──────────────────────────────────────────────────
		this.addRule("company", ["company"], 12, (r) => SemanticProvider.company(r));
		this.addRule("brand", ["brand"], 10, (r) => SemanticProvider.company(r));
		this.addRule("organization", ["organization"], 10, (r) => SemanticProvider.company(r));
		this.addRule("org", ["org"], 8, (r) => SemanticProvider.company(r));
		this.addRule("vendor", ["vendor"], 10, (r) => SemanticProvider.company(r));
		this.addRule("supplier", ["supplier"], 10, (r) => SemanticProvider.company(r));
		this.addRule("merchant", ["merchant"], 10, (r) => SemanticProvider.company(r));

		// ─── Financial ──────────────────────────────────────────────────────────
		this.addRule("bank", ["bank"], 12, (r, ctx) => SemanticProvider.getBank(r, ctx));
		this.addRule("currency_code", ["currency"], 12, (r) => SemanticProvider.getCurrency(r));
		this.addRule("amount", ["amount"], 10, (r) => Math.round(StatsUtils.normal(r, 1000, 500) * 100) / 100);
		this.addRule("price", ["price"], 12, (r) => Math.round(StatsUtils.normal(r, 49.99, 30) * 100) / 100);
		this.addRule("cost", ["cost"], 10, (r) => Math.round(StatsUtils.normal(r, 250, 100) * 100) / 100);
		this.addRule("balance", ["balance"], 10, (r) => Math.round(StatsUtils.normal(r, 5000, 2000) * 100) / 100);
		this.addRule("salary", ["salary"], 10, (r) => Math.round(StatsUtils.normal(r, 85000, 30000)));
		this.addRule("revenue", ["revenue"], 10, (r) => Math.round(StatsUtils.normal(r, 500000, 200000)));
		this.addRule("discount", ["discount"], 10, (r) => Math.round(r() * 50));
		this.addRule("tax_type", ["tax"], 12, (r) => SemanticProvider.getTaxType(r));
		this.addRule("payment_method", ["payment", "method"], 12, (r) => SemanticProvider.getPaymentMethod(r));
		this.addRule("transaction_type", ["transaction"], 10, (r) => {
			const types = ["Sale", "Refund", "Chargeback", "Transfer", "Withdrawal", "Deposit"];
			return types[Math.floor(r() * types.length)];
		});
		this.addRule("investment_type", ["investment", "asset"], 10, (r) => SemanticProvider.getInvestmentType(r));
		this.addRule("sku", ["sku"], 12, (r) => "SKU-" + Math.floor(r() * 100000).toString(36).toUpperCase());
		this.addRule("order_number", ["order", "number"], 12, (r) => "ORD-" + Math.floor(r() * 1000000).toString().padStart(8, "0"));
		this.addRule("invoice_number", ["invoice"], 12, (r) => "INV-" + Math.floor(r() * 1000000).toString().padStart(7, "0"));
		this.addRule("reference_number", ["reference"], 10, (r) => "REF-" + SemanticProvider.token(r, 10).toUpperCase());
		this.addRule("ticket_number", ["ticket"], 10, (r) => "TKT-" + Math.floor(r() * 99999).toString().padStart(6, "0"), ["movie", "concert", "flight"]);

		// ─── Tech ────────────────────────────────────────────────────────────────
		this.addRule("programming_language", ["language"], 12, (r) => SemanticProvider.getProgrammingLanguage(r));
		this.addRule("tech_stack", ["stack"], 10, (r) => SemanticProvider.getProgrammingLanguage(r));
		this.addRule("cloud_provider", ["cloud", "provider"], 12, (r) => SemanticProvider.getCloudProvider(r));
		this.addRule("database_type", ["database", "db"], 12, (r) => SemanticProvider.getDatabase(r));
		this.addRule("version", ["version"], 12, (r) => SemanticProvider.semver(r));
		this.addRule("semver", ["semver"], 12, (r) => SemanticProvider.semver(r));
		this.addRule("framework", ["framework"], 10, (r) => {
			const frameworks = ["React", "Next.js", "Vue", "Angular", "Express", "FastAPI", "Django", "Spring Boot", "Rails", "Laravel"];
			return frameworks[Math.floor(r() * frameworks.length)];
		});
		this.addRule("resolution", ["resolution", "display"], 10, (r) => SemanticProvider.getResolution(r));
		this.addRule("device_type", ["device"], 12, (r) => SemanticProvider.getDeviceType(r));
		this.addRule("os", ["os"], 10, (r) => {
			const systems = ["Linux", "Windows 11", "macOS 14", "Ubuntu 22.04", "Android 14", "iOS 17"];
			return systems[Math.floor(r() * systems.length)];
		});
		this.addRule("color_hex", ["color"], 12, (r) => SemanticProvider.hexColor(r));
		this.addRule("colour_hex", ["colour"], 12, (r) => SemanticProvider.hexColor(r));
		this.addRule("hex_value", ["hex"], 10, (r) => SemanticProvider.hexColor(r));
		this.addRule("locale_code", ["locale"], 12, (r) => SemanticProvider.locale(r));
		this.addRule("lang_code", ["lang"], 10, (r) => SemanticProvider.locale(r), ["language"]);
		this.addRule("mime_field", ["mime", "type"], 10, (r) => SemanticProvider.mimeType(r));

		// ─── Quantities / Metrics ────────────────────────────────────────────────
		this.addRule("quantity", ["quantity"], 12, (r) => Math.floor(StatsUtils.normal(r, 10, 5)) || 1);
		this.addRule("qty", ["qty"], 12, (r) => Math.floor(StatsUtils.normal(r, 10, 5)) || 1);
		this.addRule("count_field", ["count"], 10, (r) => Math.floor(StatsUtils.zipf(r, 500, 1.3)), ["account", "discount"]);
		this.addRule("total", ["total"], 8, (r) => Math.round(StatsUtils.normal(r, 1500, 800) * 100) / 100, ["subtotal"]);
		this.addRule("age", ["age"], 15, (r) => Math.round(StatsUtils.normal(r, 32, 12)));
		this.addRule("score", ["score"], 12, (r) => Math.round(StatsUtils.normal(r, 75, 15)));
		this.addRule("rating", ["rating"], 12, (r) => Math.round(StatsUtils.clamp(StatsUtils.normal(r, 4.2, 0.8), 1, 5) * 10) / 10);
		this.addRule("views", ["view"], 12, (r) => Math.floor(StatsUtils.zipf(r, 10000, 1.1)));
		this.addRule("likes", ["like"], 10, (r) => Math.floor(StatsUtils.zipf(r, 5000, 1.2)));
		this.addRule("followers", ["followers"], 10, (r) => Math.floor(StatsUtils.zipf(r, 50000, 1.2)));
		this.addRule("percentage", ["percentage"], 12, (r) => Math.round(r() * 100));
		this.addRule("percent", ["percent"], 12, (r) => Math.round(r() * 100));
		this.addRule("ratio", ["ratio"], 12, (r) => Math.round(r() * 100) / 100);
		this.addRule("duration_sec", ["duration"], 10, (r) => Math.floor(StatsUtils.normal(r, 300, 200)));
		this.addRule("seconds_field", ["seconds"], 10, (r) => Math.floor(r() * 3600));
		this.addRule("minutes_field", ["minutes"], 10, (r) => Math.floor(r() * 60));
		this.addRule("hours_field", ["hours"], 10, (r) => Math.floor(r() * 24));
		this.addRule("elapsed", ["elapsed"], 10, (r) => Math.floor(StatsUtils.normal(r, 1200, 600)));
		this.addRule("priority", ["priority"], 12, (r) => SemanticProvider.priority(r));
		this.addRule("order_idx", ["order"], 8, (r) => Math.floor(r() * 1000) + 1, ["order_number", "order_id"]);

		// ─── Timestamps ──────────────────────────────────────────────────────────
		this.addRule("created_at", ["created"], 12, (r) => new Date(Date.now() - r() * 365 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("updated_at", ["updated"], 12, (r) => new Date(Date.now() - r() * 30 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("modified_at", ["modified"], 12, (r) => new Date(Date.now() - r() * 30 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("deleted_at", ["deleted"], 12, (r) => {
			// ~70% null (soft deletes are usually null)
			if (r() < 0.7) return null;
			return new Date(Date.now() - r() * 30 * 24 * 60 * 60 * 1000).toISOString();
		});
		this.addRule("published_at", ["published"], 10, (r) => new Date(Date.now() - r() * 180 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("expires_at", ["expires"], 12, (r) => new Date(Date.now() + r() * 365 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("timestamp_field", ["timestamp"], 10, (r) => new Date(Date.now() - r() * 30 * 24 * 60 * 60 * 1000).toISOString());
		this.addRule("birth_date", ["birth", "date"], 12, (r) => {
			const year = 1950 + Math.floor(r() * 55);
			const month = Math.floor(r() * 12) + 1;
			const day = Math.floor(r() * 28) + 1;
			return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
		});
		this.addRule("dob", ["dob"], 12, (r) => {
			const year = 1950 + Math.floor(r() * 55);
			const month = Math.floor(r() * 12) + 1;
			const day = Math.floor(r() * 28) + 1;
			return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
		});

		// ─── Status / Logic ──────────────────────────────────────────────────────
		this.addRule("status", ["status"], 12, (r, ctx) => SemanticProvider.getStatus(r, ctx));
		this.addRule("is_active", ["active"], 10, (r) => r() > 0.2, ["radioactive", "proactive"]);
		this.addRule("is_verified", ["verified"], 10, (r) => r() > 0.3);
		this.addRule("is_enabled", ["enabled"], 10, (r) => r() > 0.1);
		this.addRule("is_deleted", ["deleted"], 10, (r) => r() < 0.05);
		this.addRule("is_published", ["published"], 8, (r) => r() > 0.3, ["published_at"]);
		this.addRule("is_premium", ["premium"], 10, (r) => r() < 0.25);
		this.addRule("interaction", ["interaction", "action"], 10, (r) => SemanticProvider.getInteraction(r));

		// ─── Education ───────────────────────────────────────────────────────────
		this.addRule("university", ["university", "college"], 12, (r) => SemanticProvider.getUniversity(r));
		this.addRule("school", ["school"], 10, (r) => SemanticProvider.getUniversity(r));
		this.addRule("subject_edu", ["subject", "course"], 12, (r) => SemanticProvider.getSubject(r));
		this.addRule("certification", ["certification", "certificate"], 12, (r) => SemanticProvider.getCertification(r));

		// ─── Logistics ───────────────────────────────────────────────────────────
		this.addRule("carrier", ["carrier", "shipper"], 12, (r) => SemanticProvider.getLogisticsCarrier(r));
		this.addRule("tracking_number", ["tracking"], 12, (r) => "TRK" + SemanticProvider.token(r, 12).toUpperCase());
		this.addRule("unit", ["unit", "measure"], 10, (r) => SemanticProvider.getUnit(r));
		this.addRule("weight_unit", ["weight"], 10, (r) => SemanticProvider.getUnit(r));

		// ─── Automotive ──────────────────────────────────────────────────────────
		this.addRule("car_make", ["make", "car", "vehicle"], 12, (r) => SemanticProvider.getCarMake(r));
		this.addRule("car_model", ["model"], 8, (r) => {
			const models = ["Corolla", "Civic", "Model 3", "Mustang", "Accord", "Camry", "RAV4", "X5", "Tiguan"];
			return models[Math.floor(r() * models.length)];
		}, ["data", "schema", "language"]);

		// ─── Media / Content ─────────────────────────────────────────────────────
		this.addRule("genre", ["genre"], 12, (r) => SemanticProvider.getGenre(r));
		this.addRule("category", ["category"], 8, (r) => SemanticProvider.getGenre(r), ["product", "company"]);
		this.addRule("year", ["year"], 12, (r) => SemanticProvider.getYear(r));
		this.addRule("release_year", ["release", "year"], 14, (r) => SemanticProvider.getYear(r, 1950, 2024));

		// ─── Commerce ────────────────────────────────────────────────────────────
		this.addRule("product_name", ["product"], 12, (r) => SemanticProvider.getProductName(r));

		// ─── HR ──────────────────────────────────────────────────────────────────
		this.addRule("employment_type", ["employment", "contract"], 12, (r) => SemanticProvider.getEmploymentType(r));
		this.addRule("work_arrangement", ["work", "arrangement"], 10, (r) => SemanticProvider.getEmploymentType(r));
		this.addRule("department", ["department"], 12, (r) => SemanticProvider.getDepartment(r));

		// ─── Healthcare ──────────────────────────────────────────────────────────
		this.addRule("medical_specialty", ["specialty"], 12, (r) => SemanticProvider.getMedicalSpecialty(r));
		this.addRule("vital_type", ["vital", "measurement"], 12, (r) => SemanticProvider.getVitalType(r));

		// ─── Real Estate ─────────────────────────────────────────────────────────
		this.addRule("property_type", ["property", "building"], 12, (r) => SemanticProvider.getPropertyType(r));

		// ─── Food ────────────────────────────────────────────────────────────────
		this.addRule("cuisine", ["cuisine", "food"], 12, (r) => SemanticProvider.getCuisine(r));

		// ─── Social ──────────────────────────────────────────────────────────────
		this.addRule("social_platform", ["platform"], 10, (r) => SemanticProvider.getSocialPlatform(r), ["company", "cloud", "game"]);
		this.addRule("sentiment", ["sentiment", "mood"], 12, (r) => SemanticProvider.getSentiment(r));
		this.addRule("hashtag", ["hashtag"], 12, (r) => SemanticProvider.getHashtag(r));
		this.addRule("tags", ["tags"], 8, (r) => SemanticProvider.getHashtag(r));
		this.addRule("followers_count", ["followers"], 12, (r) => Math.floor(StatsUtils.zipf(r, 50000, 1.2)));

		// ─── Government / Legal ──────────────────────────────────────────────────
		this.addRule("ministry", ["ministry", "govt"], 12, (r) => SemanticProvider.getMinistry(r));
		this.addRule("authority", ["authority"], 10, (r) => SemanticProvider.getMinistry(r));
		this.addRule("iso_code", ["iso", "code"], 12, (r) => SemanticProvider.getISOCode(r));
		this.addRule("case_status", ["case", "status"], 12, (r) => SemanticProvider.getCaseStatus(r));
		this.addRule("legal_document", ["legal", "document", "agreement"], 12, (r) => SemanticProvider.getLegalDocument(r));
		this.addRule("id_type", ["id", "type"], 12, (r, ctx) => SemanticProvider.getIDType(r, ctx));

		// ─── Indian-specific ─────────────────────────────────────────────────────
		this.addRule("pan_card", ["pan"], 14, (r) => {
			const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
			const prefix = Array.from({ length: 5 }, () => chars[Math.floor(r() * 26)]).join("");
			const suffix = chars[Math.floor(r() * 26)];
			return prefix + (Math.floor(r() * 9000) + 1000) + suffix;
		});
		this.addRule("aadhaar", ["aadhaar"], 14, (r) => {
			return Array.from({ length: 3 }, () => Math.floor(r() * 9000) + 1000).join(" ");
		});

		// ─── Science / Nature ────────────────────────────────────────────────────
		// Note: each registered only once (duplicate bug fixed)
		this.addRule("planet", ["planet", "star"], 12, (r) => SemanticProvider.getPlanet(r));
		this.addRule("element", ["element", "chemical"], 12, (r) => SemanticProvider.getElement(r));
		this.addRule("organ", ["organ", "anatomy"], 12, (r) => SemanticProvider.getOrgan(r));
		this.addRule("animal", ["animal", "pet"], 12, (r) => SemanticProvider.getAnimal(r));
		this.addRule("plant", ["plant", "flower"], 12, (r) => SemanticProvider.getPlant(r));

		// ─── Environment ─────────────────────────────────────────────────────────
		this.addRule("weather", ["weather", "condition"], 12, (r) => SemanticProvider.getWeather(r));
		this.addRule("energy_source", ["energy", "source"], 12, (r) => SemanticProvider.getEnergySource(r));
		this.addRule("fuel", ["fuel"], 10, (r) => SemanticProvider.getEnergySource(r));
		this.addRule("crop", ["crop", "produce"], 12, (r) => SemanticProvider.getCrop(r));

		// ─── Aviation / Travel ───────────────────────────────────────────────────
		this.addRule("airline", ["airline"], 12, (r) => SemanticProvider.getAirline(r));
		this.addRule("flight_number", ["flight", "number"], 12, (r) => "FL" + Math.floor(r() * 9000 + 1000));
		this.addRule("flight_status", ["flight", "status"], 12, (r) => SemanticProvider.getFlightStatus(r));
		this.addRule("amenity", ["amenity"], 12, (r) => SemanticProvider.getAmenity(r));

		// ─── Music / Sport ───────────────────────────────────────────────────────
		this.addRule("instrument", ["instrument", "music"], 12, (r) => SemanticProvider.getInstrument(r));
		this.addRule("sport", ["sport", "game"], 12, (r) => SemanticProvider.getSport(r));
		this.addRule("gaming_platform", ["gaming", "platform"], 12, (r) => SemanticProvider.getGamingPlatform(r));

		// ─── Industry ────────────────────────────────────────────────────────────
		this.addRule("material", ["material", "raw"], 12, (r) => SemanticProvider.getMaterial(r));
		this.addRule("tool_type", ["tool", "equipment"], 12, (r) => SemanticProvider.getTool(r));
		this.addRule("marketing_channel", ["channel", "marketing"], 12, (r) => SemanticProvider.getMarketingChannel(r));
		this.addRule("source_channel", ["source"], 6, (r) => SemanticProvider.getMarketingChannel(r), ["user", "lead", "data"]);

		// ─── Hospitality ─────────────────────────────────────────────────────────
		this.addRule("clothing_type", ["clothing", "apparel"], 12, (r) => SemanticProvider.getClothingType(r));
		this.addRule("size", ["size"], 10, (r) => {
			const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
			return sizes[Math.floor(r() * sizes.length)];
		});
		this.addRule("isp_name", ["isp", "provider"], 12, (r) => SemanticProvider.getISP(r));
		this.addRule("healthcare_specialty", ["specialty"], 12, (r) => SemanticProvider.getMedicalSpecialty(r));
		this.addRule("tax_rate", ["tax", "rate"], 10, (r) => Math.round(r() * 30 * 100) / 100);
	}

	private addRule(
		name: string,
		tokens: string[],
		score: number,
		generator: (random: () => number, context?: InferenceContext) => any,
		negativeTokens: string[] = [],
	) {
		this.rules.push({
			name,
			tokens: tokens.map((t) => t.toLowerCase()),
			negativeTokens: negativeTokens.map((t) => t.toLowerCase()),
			score,
			generator,
		});
	}

	private tokenize(fieldName: string): string[] {
		const parts = fieldName.split(/[_\-\.\s]+/);
		const tokens: string[] = [];
		for (const part of parts) {
			const camelParts = part.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
			for (const t of camelParts) {
				const lower = t.toLowerCase().trim();
				if (lower.length > 0) tokens.push(lower);
			}
		}
		return tokens;
	}

	/**
	 * Returns a context-specific generator when the collection name implies a strong
	 * domain (e.g. "products", "movies", "employees"). Returns null if no override applies.
	 */
	private resolveByCollectionContext(fieldLower: string, colLower: string): InferenceResult | null {
		const make = (ruleName: string, gen: (r: () => number) => unknown): InferenceResult => ({
			generator: gen as (r: () => number, ctx?: InferenceContext) => unknown,
			meta: { ruleName, score: 20, isFallback: false },
		});

		const isCollection = (...keywords: string[]): boolean =>
			keywords.some(kw =>
				colLower === kw ||
				colLower.startsWith(kw + "_") ||
				colLower.endsWith("_" + kw) ||
				colLower.includes(kw)
			);

		// ── Product / inventory ──────────────────────────────────────────────────
		if (isCollection("product", "products", "item", "items", "inventory", "catalog", "catalogue", "merchandise", "listing", "sku")) {
			if (fieldLower === "name" || fieldLower === "title" || fieldLower === "product_name") {
				return make("ctx_product_name", (r) => SemanticProvider.getProductName(r));
			}
			if (fieldLower === "category" || fieldLower === "category_name" || fieldLower === "product_category") {
				return make("ctx_product_category", (r) => SemanticProvider.getProductCategory(r));
			}
		}

		// ── Movie / film / media ─────────────────────────────────────────────────
		if (isCollection("movie", "movies", "film", "films", "show", "shows", "series", "episode")) {
			if (fieldLower === "name" || fieldLower === "title") {
				return make("ctx_movie_title", (r) => SemanticProvider.title(r, "movies"));
			}
			if (fieldLower === "category" || fieldLower === "genre") {
				return make("ctx_movie_genre", (r) => SemanticProvider.getGenre(r));
			}
		}

		// ── Article / blog / post ────────────────────────────────────────────────
		if (isCollection("article", "articles", "post", "posts", "blog", "news", "story")) {
			if (fieldLower === "name" || fieldLower === "title" || fieldLower === "headline") {
				return make("ctx_article_title", (r) => SemanticProvider.title(r, "posts"));
			}
		}

		// ── Employee / staff / person ────────────────────────────────────────────
		if (isCollection("employee", "employees", "staff", "person", "people", "member", "customer", "user", "users", "account")) {
			if (fieldLower === "name" || fieldLower === "full_name" || fieldLower === "fullname") {
				return make("ctx_person_name", (r) => SemanticProvider.fullName(r, undefined));
			}
		}

		return null;
	}

	public getGenerator(fieldName: string, collectionName: string = "global"): InferenceResult {
		const cacheKey = `${collectionName.toLowerCase()}:${fieldName.toLowerCase()}`;
		if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

		// ── Collection-context overrides ────────────────────────────────────────
		// These run before generic rule matching so that the collection name provides
		// strong semantic context (e.g. "name" on "products" → product name, not person).
		const colLower = collectionName.toLowerCase();
		const fldLower = fieldName.toLowerCase();
		const contextResult = this.resolveByCollectionContext(fldLower, colLower);
		if (contextResult) {
			this.cache.set(cacheKey, contextResult);
			return contextResult;
		}

		const tokens = this.tokenize(fieldName);
		let bestRule: InferenceRule | null = null;
		let bestScore = -1;

		for (const rule of this.rules) {
			if (rule.negativeTokens && rule.negativeTokens.some((nt) => tokens.includes(nt))) continue;
			const hasAllTokens = rule.tokens.every((rt) => tokens.includes(rt));
			if (!hasAllTokens) continue;

			let currentScore = rule.score;
			if (rule.tokens.length === tokens.length) currentScore += 5;
			else currentScore -= (tokens.length - rule.tokens.length) * 0.5;

			if (currentScore > bestScore) {
				bestScore = currentScore;
				bestRule = rule;
			}
		}

		// Smart fallback — infer from field name shape rather than "Sample fieldName"
		const fallbackGenerator = (r: () => number, ctx?: InferenceContext): any => {
			const lower = fieldName.toLowerCase();
			// Timestamp-shaped names
			if (lower.endsWith("_at") || lower.endsWith("at") || lower.includes("time") || lower.includes("date")) {
				return new Date(Date.now() - r() * 365 * 24 * 60 * 60 * 1000).toISOString();
			}
			// ID-shaped names
			if (lower.endsWith("_id") || lower.endsWith("id") || lower.endsWith("_uuid") || lower.endsWith("uuid")) {
				const hex = () => Math.floor(r() * 0x10000).toString(16).padStart(4, "0");
				return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(Math.floor(r() * 4) + 8).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
			}
			// Boolean-shaped names
			if (lower.startsWith("is_") || lower.startsWith("has_") || lower.startsWith("can_") || lower.startsWith("should_")) {
				return r() > 0.3;
			}
			// Count-shaped names
			if (lower.endsWith("_count") || lower.endsWith("_num") || lower.endsWith("_no") || lower.endsWith("_number")) {
				return Math.floor(r() * 1000);
			}
			// URL-shaped names
			if (lower.endsWith("_url") || lower.endsWith("url") || lower.endsWith("_link") || lower.endsWith("_href")) {
				return SemanticProvider.url(r, ctx);
			}
			// Name-shaped
			if (lower.endsWith("_name") || lower.endsWith("name")) {
				return SemanticProvider.fullName(r, ctx);
			}
			// Generic: short alphanumeric — never "Sample X"
			return SemanticProvider.token(r, 12);
		};

		const result: InferenceResult = bestRule
			? { generator: bestRule.generator, meta: { ruleName: bestRule.name, score: bestScore, isFallback: false } }
			: { generator: fallbackGenerator, meta: { ruleName: "fallback_smart", score: 0, isFallback: true } };

		this.cache.set(cacheKey, result);
		return result;
	}

	public generate(fieldName: string, collectionName: string = "global", random: () => number): any {
		const result = this.getGenerator(fieldName, collectionName);
		return result.generator(random, { fieldName, collectionName });
	}
}

export const fieldInferenceEngine = new FieldInferenceEngine();
