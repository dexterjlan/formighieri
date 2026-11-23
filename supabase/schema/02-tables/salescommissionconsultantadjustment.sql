-- Name: SalesCommissionConsultantAdjustment; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SalesCommissionConsultantAdjustment" (
    id bigint NOT NULL,
    "saleYearMonth" text NOT NULL,
    "consultantUserId" bigint NOT NULL,
    "adjustmentPercent" numeric(8,4) NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdByUserId" bigint,
    CONSTRAINT "SalesCommissionConsultantAdjustment_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text))
);

-- Name: SalesCommissionConsultantAdjustment_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."SalesCommissionConsultantAdjustment" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionConsultantAdjustment_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
