-- -------------------------------------------------------------------
-- ADDITIONAL CASE INFORMATION FIELDS (NO POLICIES)
-- -------------------------------------------------------------------

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS nature_of_claim TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS relief_sought TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS amount_claimed NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS counterclaim TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS cause_of_action TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS registry TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opposing_counsel TEXT;

-- Risk Assessment
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS likelihood_of_success TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS likelihood_of_loss TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'Medium';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- Financial Exposure
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS potential_gain NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS court_filing_fees NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS disbursements NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS expert_witness_costs NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS transport_costs NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS other_litigation_costs NUMERIC DEFAULT 0;

-- Note: Total Estimated Litigation Cost is calculated automatically on the frontend.
