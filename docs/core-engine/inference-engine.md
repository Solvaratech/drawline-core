# Field Inference Engine

The **Field Inference Engine** is the intelligent routing layer of Drawline. It automatically maps your schema's field names to the appropriate generators in the Semantic Provider.

## How it Works

The engine uses a **Score-Based Tokenization** algorithm:

1. **Tokenization**: A field name like `user_first_name` is broken into tokens: `['user', 'first', 'name']`.
2. **Matching**: The engine iterates through its rule library. Rules with more matching tokens get higher scores.
3. **Negative Filtering**: Some rules have negative tokens (e.g., a "Full Name" rule might have a negative token `first` to avoid matching `first_name`).
4. **Scoring**:
   - Base Rule Score.
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
