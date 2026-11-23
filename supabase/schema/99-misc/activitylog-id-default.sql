-- Name: ActivityLog id; Type: DEFAULT; Schema: public; Owner: -

--

ALTER TABLE ONLY public."ActivityLog" ALTER COLUMN id SET DEFAULT nextval('public."ActivityLog_id_seq"'::regclass);
