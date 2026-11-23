-- Name: addrlabel_isactive_sortorder_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX addrlabel_isactive_sortorder_idx ON public.addrlabel USING btree ("isActive", "sortOrder", id);

-- Name: addrlabel_name_unique_ci_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX addrlabel_name_unique_ci_idx ON public.addrlabel USING btree (lower(TRIM(BOTH FROM name)));
