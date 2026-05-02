# SemanticProvider

`SemanticProvider` is the data generation engine that provides high-quality, realistic values. It uses a curated JSON corpus and a seeded PRNG to ensure variety and determinism.

## Key Methods

All methods take a `random: () => number` function (the seeded PRNG) as their first argument.

### Personal Information
- `fullName(random, context?)`: Generates a full name. Context can trigger locale-specific names (e.g., Indian).
- `email(random, name?)`: Generates a realistic email. If a name is provided, the email is derived from it.

### Business & Industry
- `company(random)`: Generates realistic company names.
- `getJobTitle(random)`: Returns professional designations (e.g., "Senior Software Engineer").
- `getDepartment(random)`: Returns corporate departments (e.g., "Engineering", "Sales").

### Geography & Logistics
- `city(random)`: Generates global city names.
- `getAddress(random)`: Returns realistic street addresses.
- `getCountry(random)`: Returns country names.
- `getState(random, context?)`: Returns states/provinces (supports Indian and US contexts).
- `getLogisticsCarrier(random)`: Returns names like FedEx, DHL, etc.

### Financial
- `getBank(random, context?)`: Returns bank names (supports Indian banks).
- `getCurrency(random)`: Returns ISO currency codes (USD, INR, etc.).
- `getPaymentMethod(random)`: Returns "Credit Card", "UPI", "PayPal", etc.

### Technology
- `getProgrammingLanguage(random)`: Returns languages like "JavaScript", "Python", "Go".
- `getCloudProvider(random)`: Returns "AWS", "Azure", "GCP".
- `getDatabase(random)`: Returns "PostgreSQL", "MongoDB", etc.

### Media & Content
- `title(random, context?)`: Generates realistic titles for movies, blog posts, or products based on context.
- `content(random, length?)`: Generates multiple sentences of realistic text. Length can be `short`, `medium`, or `long`.
- `getGenre(random)`: Returns media genres (Action, Sci-Fi, etc.).

## Contextual Logic

Many methods accept a `context` object:
```typescript
interface SemanticContext {
  collectionName?: string;
  fieldName?: string;
}
```

If the context contains keywords like **"india"**, the engine will automatically switch to Indian datasets for names, states, banks, and identity types (PAN, Aadhaar).

## Usage Example

```typescript
import { SemanticProvider } from "@solvaratech/drawline-core";

const rng = Math.random;
const movie = SemanticProvider.title(rng, "movies");
const genre = SemanticProvider.getGenre(rng);

console.log(`${movie} is a ${genre} masterpiece.`);
// Output: "Neon Horizon is a Sci-Fi masterpiece."
```
