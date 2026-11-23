-- Name: salesOrders; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."salesOrders" (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "createdById" bigint,
    "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedById" bigint,
    "orderCode" text NOT NULL,
    "clientDeliveryDate" date,
    "consultantUserId" bigint,
    "clientId" bigint,
    "actualDeliveryDate" date,
    "saleDate" date,
    "addrId" bigint,
    "architectId" bigint,
    "paymentMethod" text,
    "installmentCount" integer DEFAULT 1 NOT NULL,
    "commissionConfirmed" boolean DEFAULT false NOT NULL,
    "commissionRatePercent" numeric(8,4),
    "commissionCountsForTier" boolean DEFAULT true NOT NULL,
    "commissionRateOverride" numeric(8,4),
    "wpsQuoteCode" text,
    CONSTRAINT "salesOrders_installmentCount_check" CHECK (("installmentCount" >= 1)),
    CONSTRAINT "salesOrders_paymentMethod_check" CHECK ((("paymentMethod" IS NULL) OR ("paymentMethod" = ANY (ARRAY['cash'::text, 'installment'::text]))))
);

-- Name: COLUMN "salesOrders"."actualDeliveryDate"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."actualDeliveryDate" IS 'Actual order delivery/completion date.';

-- Name: COLUMN "salesOrders"."saleDate"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."saleDate" IS 'Data de venda do pedido';

-- Name: COLUMN "salesOrders"."paymentMethod"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."paymentMethod" IS 'cash = à vista; installment = parcelado.';

-- Name: COLUMN "salesOrders"."installmentCount"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."installmentCount" IS 'Quantidade de parcelas da comissão (1 para à vista).';

-- Name: COLUMN "salesOrders"."commissionConfirmed"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."commissionConfirmed" IS 'Quando true, a venda entra no cálculo de comissão.';

-- Name: COLUMN "salesOrders"."commissionRatePercent"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."commissionRatePercent" IS 'Alíquota de comissão do pedido em percentual (ex.: 4.75 = 4,75%%). Preenchida na importação da planilha; quando definida, prevalece sobre as faixas do mês da venda.';

-- Name: COLUMN "salesOrders"."commissionCountsForTier"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."commissionCountsForTier" IS 'Quando false, a venda não entra na soma do consultor para cálculo da faixa do mês.';

-- Name: COLUMN "salesOrders"."commissionRateOverride"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."commissionRateOverride" IS 'Alíquota específica da venda em percentual (ex.: 4.75). NULL = usa faixa/ajuste do consultor; 0 = sem comissão nesta venda.';

-- Name: COLUMN "salesOrders"."wpsQuoteCode"; Type: COMMENT; Schema: public; Owner: -

--

COMMENT ON COLUMN public."salesOrders"."wpsQuoteCode" IS 'WPS budget/quote code for the sales order.';

-- Name: salesOrders_id_seq; Type: SEQUENCE; Schema: public; Owner: -

--

ALTER TABLE public."salesOrders" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public."salesOrders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
