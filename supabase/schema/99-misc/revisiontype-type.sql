-- Name: RevisionType; Type: TYPE; Schema: public; Owner: -

--

CREATE TYPE public."RevisionType" AS ENUM (
    'commercial_technical',
    'commercial_commercial',
    'third_party',
    'technical_reviewer'
);
