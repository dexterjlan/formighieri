-- Name: ExternalAssemblyInspection id; Type: DEFAULT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ExternalAssemblyInspection" ALTER COLUMN id SET DEFAULT nextval('public."ExternalAssemblyInspection_id_seq"'::regclass);
