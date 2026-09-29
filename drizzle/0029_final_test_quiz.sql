ALTER TABLE "course_tests" ADD COLUMN "pool_size" integer;--> statement-breakpoint
ALTER TABLE "course_tests" ADD COLUMN "shuffle_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_tests" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course_tests" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "served" jsonb;