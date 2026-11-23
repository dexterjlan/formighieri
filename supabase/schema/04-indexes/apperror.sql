-- Name: AppError_createdAt_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AppError_createdAt_idx" ON public."AppError" USING btree ("createdAt" DESC);

-- Name: AppError_source_idx; Type: INDEX; Schema: public; Owner: -

--

CREATE INDEX "AppError_source_idx" ON public."AppError" USING btree (source);
