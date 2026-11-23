-- Name: SalesCommissionSale; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SalesCommissionSale" (
    id bigint NOT NULL,
    "salesOrderId" bigint,
    "orderCode" text DEFAULT ''::text NOT NULL,
    "saleDate" date NOT NULL,
    "saleYearMonth" text NOT NULL,
    "consultantUserId" bigint NOT NULL,
    "clientName" text DEFAULT ''::text NOT NULL,
    "saleValue" numeric(14,2) DEFAULT 0 NOT NULL,
    "paymentMethod" text DEFAULT 'cash'::text NOT NULL,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "countsForTier" boolean DEFAULT true NOT NULL,
    "rateOverride" numeric(8,4),
    "importedRatePercent" numeric(8,4),
    "isImported" boolean DEFAULT false NOT NULL,
    source text DEFAULT 'fgp_order'::text NOT NULL,
    "importedAt" timestamp with time zone,
    "importedByUserId" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "countsForManagerCommission" boolean DEFAULT true NOT NULL,
    CONSTRAINT "SalesCommissionSale_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "SalesCommissionSale_paymentMethod_check" CHECK (("paymentMethod" = ANY (ARRAY['cash'::text, 'installment'::text]))),
    CONSTRAINT "SalesCommissionSale_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT "SalesCommissionSale_source_check" CHECK ((source = ANY (ARRAY['fgp_order'::text, 'historical_import'::text])))
);

-- Name: COLUMN "SalesCommissionSale"."salesOrderId"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionSale"."salesOrderId" IS 'Vínculo opcional com pedido FGP; NULL em import histórico sem pedido.';

-- Name: COLUMN "SalesCommissionSale"."rateOverride"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionSale"."rateOverride" IS 'Alíquota específica da venda. NULL = usa faixa/ajuste do consultor.';

-- Name: COLUMN "SalesCommissionSale"."importedRatePercent"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionSale"."importedRatePercent" IS 'Alíquota fixa de import histórico (legado da planilha).';

-- Name: COLUMN "SalesCommissionSale"."isImported"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionSale"."isImported" IS 'Quando true, entra no realizado da meta e no fechamento do mês.';

-- Name: COLUMN "SalesCommissionSale"."countsForManagerCommission"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionSale"."countsForManagerCommission" IS 'When true, sale counts for manager team % and delivery bonus; always counts toward monthly target sum.';

-- Name: SalesCommissionSale_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."SalesCommissionSale" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionSale_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
