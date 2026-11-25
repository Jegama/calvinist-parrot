-- A database that already ran the evaluation branch has different columns
-- after usd. Protect that view while the chat migration installs its version.
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns
               WHERE table_schema = current_schema() AND table_name = 'analytics_priced_provider_attempt'
                 AND column_name = 'billingUnit') THEN
        ALTER VIEW analytics_priced_provider_attempt RENAME TO analytics_previous_evaluation_pricing;
    END IF;
END $$;
