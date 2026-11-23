-- Name: ThirdPartyProject ThirdPartyProject_log_designer_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "ThirdPartyProject_log_designer_change_insert" AFTER INSERT ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('thirdParty');

-- Name: ThirdPartyProject ThirdPartyProject_log_designer_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "ThirdPartyProject_log_designer_change_update" AFTER UPDATE OF "designerId" ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_related_designer_change('thirdParty');

-- Name: ThirdPartyProject ThirdPartyProject_log_status_change_insert; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "ThirdPartyProject_log_status_change_insert" AFTER INSERT ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_third_party_project_status_change();

-- Name: ThirdPartyProject ThirdPartyProject_log_status_change_update; Type: TRIGGER; Schema: public; Owner: -

--

CREATE TRIGGER "ThirdPartyProject_log_status_change_update" AFTER UPDATE OF status ON public."ThirdPartyProject" FOR EACH ROW EXECUTE FUNCTION public.log_third_party_project_status_change();
