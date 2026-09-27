ALTER TYPE "public"."notification_kind" ADD VALUE 'team_invite';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'review_waiting';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_review_waiting_idx" ON "notifications" USING btree ("tenant_id","user_id") WHERE "status" = 'pending' and "payload" ? 'submissionIds';