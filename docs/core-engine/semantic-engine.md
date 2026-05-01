# Drawline Semantic Engine

The **Drawline Semantic Engine** is the standout feature of Drawline v0.2.0. It moves beyond generic random strings to provide high-fidelity data curated for specific business domains.

## How it Works

The engine relies on a massive **Semantic Corpus** stored in `src/generator/datasets`. When the generator encounters a field, the Inference Engine analyzes its metadata and selects a dataset from the corpus.

### Key Datasets

We support 60+ domains including:

* **Healthcare**: `healthcare_specialties.json`, `healthcare_vital_types.json`, `medical_diagnosis.json`.
* **Finance**: `financial_banks_india.json`, `financial_tax_types.json`, `finance_investment_types.json`.
* **Aviation**: `aviation_airlines.json`, `aviation_flight_statuses.json`.
* **Logistics**: `logistics_carriers.json`, `logistics_units.json`, `geography_iso_codes.json`.
* **Tech**: `tech_programming_languages.json`, `tech_databases.json`, `tech_cloud_providers.json`.

## Lazy Loading

To maintain a low memory footprint, datasets are **lazy-loaded**. They are only pulled into memory the first time a field requires them, making the engine extremely fast and lightweight.

## Determinism

Every selection from a dataset is driven by the `Xoshiro128` PRNG. This means that if you use the same seed, a "User" in your Postgres database will have the exact same "Aadhaar Number" as the same "User" in your MongoDB export.
