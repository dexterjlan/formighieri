-- Name: SalesCommissionEntry; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SalesCommissionEntry" (
    id bigint NOT NULL,
    "monthCloseId" bigint,
    "salesOrderId" bigint,
    "consultantUserId" bigint NOT NULL,
    "saleDate" date NOT NULL,
    "saleYearMonth" text NOT NULL,
    "referenceYearMonth" text NOT NULL,
    "orderCode" text DEFAULT ''::text NOT NULL,
    "clientName" text DEFAULT ''::text NOT NULL,
    "consultantName" text DEFAULT ''::text NOT NULL,
    "saleValue" numeric(14,2) DEFAULT 0 NOT NULL,
    "commissionAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "ratePercent" numeric(8,4) DEFAULT 0 NOT NULL,
    "installmentNumber" integer DEFAULT 1 NOT NULL,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "clientInstallmentAmount" numeric(14,2) DEFAULT 0 NOT NULL,
    "entryType" text DEFAULT 'consultant'::text NOT NULL,
    CONSTRAINT "SalesCommissionEntry_entryType_check" CHECK (("entryType" = ANY (ARRAY['consultant'::text, 'manager_own'::text, 'manager_team'::text, 'manager_delivery_bonus'::text]))),
    CONSTRAINT "SalesCommissionEntry_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "SalesCommissionEntry_installmentNumber_check" CHECK (("installmentNumber" >= 1)),
    CONSTRAINT "SalesCommissionEntry_referenceYearMonth_format" CHECK (("referenceYearMonth" ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT "SalesCommissionEntry_saleYearMonth_format" CHECK (("saleYearMonth" ~ '^\d{4}-\d{2}$'::text))
);

-- Name: COLUMN "SalesCommissionEntry"."salesOrderId"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionEntry"."salesOrderId" IS 'Opcional: vínculo com pedido do FGP quando existir; import histórico usa só orderCode.';

-- Name: COLUMN "SalesCommissionEntry"."referenceYearMonth"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionEntry"."referenceYearMonth" IS 'Mês de referência da parcela de comissão (Mês Ref na planilha).';

-- Name: COLUMN "SalesCommissionEntry"."commissionAmount"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionEntry"."commissionAmount" IS 'Valor da comissão a pagar ao consultor na parcela.';

-- Name: COLUMN "SalesCommissionEntry"."clientInstallmentAmount"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionEntry"."clientInstallmentAmount" IS 'Valor da parcela de pagamento do cliente.';

-- Name: COLUMN "SalesCommissionEntry"."entryType"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."SalesCommissionEntry"."entryType" IS 'consultant | manager_own | manager_team | manager_delivery_bonus';

-- Name: SalesCommissionEntry_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."SalesCommissionEntry" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."SalesCommissionEntry_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
