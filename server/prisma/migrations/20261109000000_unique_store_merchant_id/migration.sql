-- One store per merchant: enforce at the database level so concurrent createStore requests cannot both succeed
-- CreateIndex
CREATE UNIQUE INDEX "stores_merchant_id_key" ON "stores"("merchant_id");
