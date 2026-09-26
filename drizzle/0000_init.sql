CREATE TABLE "doctors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"specialty" text,
	CONSTRAINT "doctors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"time" timestamp with time zone DEFAULT now() NOT NULL,
	"visit_id" uuid,
	"doctor_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "open_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"source_visit_id" uuid,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_visit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"dob" date NOT NULL,
	"sex" text NOT NULL,
	"email" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"known_medications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"known_allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"backboard_assistant_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_language_check" CHECK ("patients"."preferred_language" in ('en', 'es'))
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"visit_type" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"processing_step" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"audio_path" text,
	"transcript" jsonb,
	"utterances" jsonb,
	"note" jsonb,
	"audit" jsonb,
	"gaps" jsonb,
	"scores" jsonb,
	"followthrough" jsonb,
	"metrics" jsonb,
	"signoff_overrides" jsonb
);
--> statement-breakpoint
CREATE TABLE "vitals" (
	"time" timestamp with time zone NOT NULL,
	"patient_id" uuid NOT NULL,
	"visit_id" uuid,
	"systolic" integer,
	"diastolic" integer,
	"heart_rate" integer,
	"temp_f" numeric,
	"spo2" integer,
	"weight_lb" numeric
);
--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_items" ADD CONSTRAINT "open_items_source_visit_id_visits_id_fk" FOREIGN KEY ("source_visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_visit_time_idx" ON "events" USING btree ("visit_id","time");--> statement-breakpoint
CREATE INDEX "open_items_patient_idx" ON "open_items" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "visits_patient_idx" ON "visits" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "vitals_patient_time_idx" ON "vitals" USING btree ("patient_id","time");