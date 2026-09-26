# Carryover

> The note is where other scribes stop.

A doctor-facing ambient scribe built at hackUMBC 2026. Every note sentence cites its transcript
source, each problem gets a transparent confidence score, missed checklist items are caught before
sign-off, and the signed note turns into a task list, carry-forward items, and a plain-language
patient summary (English or Spanish).

**Prototype for hackUMBC 2026. Not for clinical use. Synthetic data only.**

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run db:migrate
npm run db:seed
npm run dev
```

Log in as `dr.patel@carryover.demo` / `demo1234`.
