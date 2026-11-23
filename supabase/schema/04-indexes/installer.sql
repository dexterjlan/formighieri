-- Name: Installer_name_unique_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE UNIQUE INDEX "Installer_name_unique_idx" ON public."Installer" USING btree (lower(TRIM(BOTH FROM name)));
