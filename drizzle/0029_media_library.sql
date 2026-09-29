CREATE TYPE "public"."media_access" AS ENUM('public', 'learners');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('upload', 'external_embed');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_transcript_status" AS ENUM('none', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'video';--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'processing' NOT NULL,
	"error" text,
	"title" text NOT NULL,
	"locale" text,
	"access" "media_access" DEFAULT 'learners' NOT NULL,
	"file_id" uuid,
	"source_id" uuid,
	"embed" jsonb,
	"hls_run" text,
	"hls_bytes" bigint DEFAULT 0 NOT NULL,
	"renditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_sec" double precision,
	"width" integer,
	"height" integer,
	"chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript_status" "media_transcript_status" DEFAULT 'none' NOT NULL,
	"transcript_error" text,
	"transcript" jsonb,
	"captions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "media_assets_tenant_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"watched_sec" double precision DEFAULT 0 NOT NULL,
	"duration_sec" double precision,
	"percent" integer DEFAULT 0 NOT NULL,
	"position_sec" double precision,
	"first_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"threshold_reached_at" timestamp with time zone,
	CONSTRAINT "watch_progress_viewer" UNIQUE("tenant_id","asset_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "watch_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "media_storage_quota_bytes" bigint;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "segments" jsonb;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_file_fk" FOREIGN KEY ("tenant_id","file_id") REFERENCES "public"."files"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_created_idx" ON "media_assets" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "watch_progress_user_idx" ON "watch_progress" USING btree ("tenant_id","user_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_media_storage_quota" CHECK ("tenants"."media_storage_quota_bytes" >= -1);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "media_assets" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "watch_progress" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);