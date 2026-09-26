import { config } from "dotenv";

// Next.js loads .env.local automatically; standalone scripts need it explicitly.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
