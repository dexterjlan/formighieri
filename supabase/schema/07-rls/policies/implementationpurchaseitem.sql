-- Name: ImplementationPurchaseItem authenticated_delete_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_delete_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR DELETE TO authenticated USING (true);

-- Name: ImplementationPurchaseItem authenticated_insert_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_insert_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR INSERT TO authenticated WITH CHECK (true);

-- Name: ImplementationPurchaseItem authenticated_select_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_select_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR SELECT TO authenticated USING (true);

-- Name: ImplementationPurchaseItem authenticated_update_ImplantacaoPurchaseItem; Type: POLICY; Schema: public; Owner: -

--

CREATE POLICY "authenticated_update_ImplantacaoPurchaseItem" ON public."ImplementationPurchaseItem" FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
