BEGIN;

-- The sermon worker may update evaluation status without access to analytics.
-- Only the existing completion trigger needs to invoke this function.
CREATE OR REPLACE FUNCTION public.record_engagement_sermon_ready() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
    INSERT INTO public."AnalyticsEngagementEvent" (feature, step, channel, "flowId")
    SELECT feature, 'report_ready', channel, "flowId" FROM public."AnalyticsEngagementEvent"
    WHERE feature = 'sermon' AND step = 'submitted' AND channel IN ('web', 'public_api') AND "flowId" = NEW.id
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_engagement_sermon_ready() FROM PUBLIC;

COMMIT;
