-- Name: SalesCommissionTier; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SalesCommissionTier" (
    id bigint NOT NULL,
    "salesMonthlyTargetId" bigint NOT NULL,
    "minAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "maxAmount" numeric(14,2),
    "ratePercent" numeric(8,4) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "SalesCommissionTier_min_lte_max" CHECK ((("maxAmount" IS NULL) OR ("maxAmount" >= "minAmount")))
);

-- Name: SalesCommissionTier_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."SalesCommissionTier" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionTier_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
