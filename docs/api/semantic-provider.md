# SemanticProvider API

The `SemanticProvider` is the primary interface for accessing the **Semantic Engine**. It contains static methods for generating high-fidelity strings.

## Methods

### `fullName(random: () => number, context?: InferenceContext)`
Generates a realistic full name. Automatically switches between Indian and Global naming conventions based on the context.

### `email(random: () => number, name?: string)`
Generates a professional email address. If a `name` is provided, it uses it for the mailbox portion.

### `title(random: () => number, context?: string)`
Generates a context-aware title.
- **Movies**: Uses `media_movie_titles.json`.
- **Posts/Articles**: Generates catchphrases like "10 Tips for Better Technology".
- **Products**: Uses `ecommerce_product_names.json`.

### `getGenre(random: () => number)`
Returns a random media genre from `media_genres.json`.

### `getYear(random: () => number, start?: number, end?: number)`
Generates a year within the specified range (default 1970–2024).

### `getAadhaar(random: () => number)`
Generates a valid-looking 12-digit Indian Aadhaar number in `XXXX XXXX XXXX` format.

### `getPAN(random: () => number)`
Generates a valid-looking Indian PAN card number.

### Domain-Specific Getters
The provider includes 40+ methods like `getFlightStatus()`, `getTaxType()`, `getCaseStatus()`, etc., each mapped to their respective JSON dataset.

## Usage Example

```typescript
import { SemanticProvider } from "@solvaratech/drawline-core";

const rng = Math.random;
const movie = SemanticProvider.title(rng, "movies");
const genre = SemanticProvider.getGenre(rng);

console.log(`${movie} is a ${genre} masterpiece.`);
// Output: "Neon Horizon is a Sci-Fi masterpiece."
```
