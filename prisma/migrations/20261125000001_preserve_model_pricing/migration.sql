BEGIN;
-- Keep the chat migration's token tariff and retry/cache fields available
-- while the evaluation migration installs the service-usage columns.
ALTER VIEW analytics_priced_provider_attempt RENAME TO analytics_priced_model_attempt;
ALTER VIEW IF EXISTS analytics_previous_evaluation_pricing RENAME TO analytics_priced_provider_attempt;
COMMIT;
