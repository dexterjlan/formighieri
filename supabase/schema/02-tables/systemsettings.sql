-- Name: SystemSettings; Type: TABLE; Schema: public; Owner: -

--

CREATE TABLE public."SystemSettings" (
    "settingsKey" text DEFAULT 'default'::text NOT NULL,
    "approvalCcEmails" text DEFAULT ''::text NOT NULL,
    "requestCcEmails" text DEFAULT ''::text NOT NULL,
    "approvalOverdueDays" integer DEFAULT 5 NOT NULL,
    "requestOverdueDays" integer DEFAULT 5 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedById" bigint,
    "expeditionFactoryStreet" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryNumber" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryComplement" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryNeighborhood" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryCity" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryState" text DEFAULT ''::text NOT NULL,
    "expeditionFactoryPostalCode" text DEFAULT ''::text NOT NULL,
    CONSTRAINT "SystemSettings_approvalOverdueDays_check" CHECK (("approvalOverdueDays" > 0)),
    CONSTRAINT "SystemSettings_requestOverdueDays_check" CHECK (("requestOverdueDays" > 0))
);
