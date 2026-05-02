# Field Inference Engine

The **Field Inference Engine** is the intelligence layer of Drawline Core. It eliminates the need for manual field mapping by automatically "guessing" the correct semantic generator for any given field based on its name and context.

## How it Works: The Token-Scoring Algorithm

The inference process is not a simple string match. It uses a tokenization and scoring algorithm to find the best possible match among dozens of predefined rules.

### 1. Tokenization
When a field name like `userFirstName` or `shipping_address` is encountered, the engine breaks it down into individual tokens:
- `userFirstName` -> `["user", "first", "name"]`
- `shipping_address` -> `["shipping", "address"]`

The engine handles CamelCase, snake_case, and dot.notation automatically.

### 2. Rule Matching
The engine maintains a registry of **Inference Rules**. Each rule consists of:
- **Tokens**: The list of tokens required for a match.
- **Negative Tokens**: Tokens that, if present, disqualify the match (to avoid false positives).
- **Score**: A base priority for the rule.

### 3. Scoring Heuristics
Rules are scored based on how well they fit the field:
- **Match Density**: If a rule matches all tokens exactly, it gets a bonus.
- **Contextual Boost**: If the parent collection name provides additional context (e.g., a "bank" token in the collection name when matching a "transaction" field), the score is increased.
- **Fallback**: If no specific rules match, a generic generator (e.g., "Sample [fieldName]") is used as a fallback.

## Example Inference Logic

| Field Name | Tokens | Best Match Rule | Generator Used |
| :--- | :--- | :--- | :--- |
| `email` | `["email"]` | `email` | `SemanticProvider.email()` |
| `first_name` | `["first", "name"]` | `first_name` | `SemanticProvider.fullName().split(' ')[0]` |
| `id` | `["id"]` | `id_numeric` | `Math.floor(random() * 1000000)` |
| `user_ip` | `["user", "ip"]` | `ip_address` | `192.168.X.X` style strings |
| `pan_card` | `["pan"]` | `pan_card` | Indian PAN Pattern Generator |

## Special Handlers

### ID Handling
The engine specifically looks for fields ending in `Id` (e.g., `authorId`, `org_id`). If these fields aren't explicitly defined as foreign keys, the inference engine treats them as potential **Heuristic Relationships**, attempting to link them to collections with matching names.

### Statistical Distributions
For numeric fields like `age`, `score`, or `price`, the engine doesn't just pick a random number. It uses `StatsUtils` to generate data following a **Normal (Gaussian) Distribution**, ensuring most values are realistic (e.g., ages centered around 30-40 rather than evenly spread from 0 to 100).

## Extensibility
The inference rules are defined in `src/generator/core/FieldInferenceEngine.ts`. The engine is designed to be easily extended with new regex-like token rules as new datasets are added to the Semantic Provider.
   - Perfect Match Bonus (+5 if tokens match exactly).
   - Noise Penalty (-0.5 for extra irrelevant tokens).
5. **Selection**: The rule with the highest score is selected.

## Custom Rules

You can add your own rules to the engine using the `addRule` method:

```typescript
engine.addRule('my_custom_field', ['token1', 'token2'], 10, (r) => "Custom Data");
```

## Supported Field Types

The engine supports various primitive and complex types:
- **String**: Mapped to semantic datasets.
- **Integer/Float**: Distributed via `StatsUtils` (Normal, Zipfian).
- **Date**: Seeded ISO timestamps.
- **Boolean**: Probabilistic true/false.
- **UUID/ObjectId**: Deterministic hash-based unique identifiers.
