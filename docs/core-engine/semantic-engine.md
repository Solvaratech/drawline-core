# Drawline Semantic Engine

The **Drawline Semantic Engine** is the standout feature of Drawline. It moves beyond generic random strings to provide high-fidelity data curated for specific business domains and locales.

## How it Works

The engine relies on a massive **Semantic Corpus** stored in `src/generator/datasets`. This corpus is a collection of structured JSON files containing real-world data points (names, cities, job titles, product categories, etc.).

When the generator encounters a field, the process follows this flow:
1.  **Context Analysis**: The engine checks the field name and its parent collection name.
2.  **Dataset Selection**: Based on tokens (e.g., "india", "doctor", "bank"), it selects the most relevant dataset.
3.  **Deterministic Pick**: It uses the seeded PRNG to select a value from the dataset.

## Semantic Intelligence: Context Awareness

The engine is "smart" about the data it picks. It doesn't just pick a random name; it looks for context.

### Example: Locale Awareness
If your collection is named `india_users` or a field is named `india_state`, the engine automatically pivots to the Indian datasets:
- **Names**: Amit, Priya, Rahul...
- **Surnames**: Sharma, Verma, Gupta...
- **States**: Karnataka, Maharashtra, Delhi...
- **Banks**: SBI, HDFC, ICICI...

### Example: Domain Sensitivity
If a field name contains `movie`, the engine pulls from `media_movie_titles.json`. If it contains `carrier`, it uses `logistics_carriers.json`.

## The Corpus: 60+ Industry Datasets

We support a wide range of domains including:

-   **Healthcare**: `healthcare_specialties`, `healthcare_vital_types`, `medical_diagnosis`.
-   **Finance**: `financial_banks_india`, `financial_tax_types`, `finance_investment_types`.
-   **Aviation**: `aviation_airlines`, `aviation_flight_statuses`.
-   **Logistics**: `logistics_carriers`, `logistics_units`, `geography_iso_codes`.
-   **Tech**: `tech_programming_languages`, `tech_databases`, `tech_cloud_providers`.
-   **E-commerce**: `ecommerce_product_names`, `commerce_payment_methods`, `commerce_review_sentiment`.

## Engineering for Scale

### Lazy Loading
To maintain a low memory footprint, datasets are **lazy-loaded**. They are only pulled into memory the first time a field requires them. This means the engine starts instantly and only consumes RAM proportional to the variety of data being generated, not the size of the entire corpus.

### Determinism
Every selection from a dataset is driven by the `Xoshiro128` PRNG. This means that if you use the same seed, a "User" in your Postgres database will have the exact same name and attributes as the same "User" in your MongoDB export.

## Customizing the Corpus
While Drawline comes with a rich default corpus, it is designed to be extensible. Developers can contribute new datasets to the `src/generator/datasets` directory to support even more niche domains.
