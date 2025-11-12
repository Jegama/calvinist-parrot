-- CreateTable
CREATE TABLE "store" (
    "namespace_path" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "store_pkey" PRIMARY KEY ("namespace_path","key")
);

-- CreateTable
CREATE TABLE "store_migrations" (
    "v" INTEGER NOT NULL,

    CONSTRAINT "store_migrations_pkey" PRIMARY KEY ("v")
);

-- CreateIndex
CREATE INDEX "idx_store_namespace_path" ON "store"("namespace_path");

-- CreateIndex
CREATE INDEX "idx_store_value_gin" ON "store" USING GIN ("value");
