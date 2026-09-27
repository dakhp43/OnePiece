-- Carryover help assistant: one-time Snowflake setup.
-- Paste into a Snowsight SQL worksheet and click "Run All" (Cmd/Ctrl+Shift+Enter) as ACCOUNTADMIN.
-- The app gets its own least-privilege service user; your own login is not changed.
--
-- Snowflake holds the help articles and a log of every help question; the app searches the articles
-- and reads the insights through the SQL API. Cortex writes the answers when the account allows AI
-- functions (trial accounts need a card on file); otherwise set SNOWFLAKE_CORTEX=off and Gemini writes them.
USE ROLE ACCOUNTADMIN;

-- 1. Allow Cortex to use models hosted outside your home region (only matters when Cortex is allowed).
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

-- 2. Small compute for the SQL API (sleeps after 60 seconds idle).
CREATE WAREHOUSE IF NOT EXISTS CARRYOVER_WH
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

-- 3. The knowledge base and the question log (the app loads the articles with `npm run help:sync`).
CREATE DATABASE IF NOT EXISTS CARRYOVER_HELP;
CREATE SCHEMA IF NOT EXISTS CARRYOVER_HELP.APP;
CREATE TABLE IF NOT EXISTS CARRYOVER_HELP.APP.HELP_ARTICLES (
  ARTICLE_ID STRING NOT NULL,
  TITLE      STRING NOT NULL,
  CONTENT    STRING NOT NULL
);
-- No user names or patient data are stored, only the question text.
CREATE TABLE IF NOT EXISTS CARRYOVER_HELP.APP.HELP_QUESTIONS (
  ASKED_AT    TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  QUESTION    STRING NOT NULL,
  TOP_ARTICLE STRING,
  ANSWERED_BY STRING
);

-- 4. A role with only what the app needs.
CREATE ROLE IF NOT EXISTS CARRYOVER_HELP_ROLE;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE CARRYOVER_HELP_ROLE;
GRANT USAGE ON WAREHOUSE CARRYOVER_WH TO ROLE CARRYOVER_HELP_ROLE;
GRANT USAGE ON DATABASE CARRYOVER_HELP TO ROLE CARRYOVER_HELP_ROLE;
GRANT USAGE ON SCHEMA CARRYOVER_HELP.APP TO ROLE CARRYOVER_HELP_ROLE;
GRANT SELECT, INSERT, DELETE ON TABLE CARRYOVER_HELP.APP.HELP_ARTICLES TO ROLE CARRYOVER_HELP_ROLE;
GRANT SELECT, INSERT ON TABLE CARRYOVER_HELP.APP.HELP_QUESTIONS TO ROLE CARRYOVER_HELP_ROLE;

-- 5. A service user just for the app.
CREATE USER IF NOT EXISTS CARRYOVER_APP
  TYPE = SERVICE
  DEFAULT_ROLE = CARRYOVER_HELP_ROLE
  DEFAULT_WAREHOUSE = CARRYOVER_WH
  COMMENT = 'Carryover web app: help assistant';
GRANT ROLE CARRYOVER_HELP_ROLE TO USER CARRYOVER_APP;

-- Access tokens require a network policy on the user. This one allows any IP (fine for a hackathon demo).
CREATE NETWORK POLICY IF NOT EXISTS CARRYOVER_ALLOW_ALL
  ALLOWED_IP_LIST = ('0.0.0.0/0') COMMENT = 'Demo only: lets the Carryover app token connect from anywhere';
ALTER USER CARRYOVER_APP SET NETWORK_POLICY = CARRYOVER_ALLOW_ALL;

-- 6. The app's token. COPY the TOKEN_SECRET value from the result: Snowflake shows it only once.
--    To make a new one later, first run:
--    ALTER USER CARRYOVER_APP REMOVE PROGRAMMATIC ACCESS TOKEN CARRYOVER_APP_TOKEN;
ALTER USER CARRYOVER_APP ADD PROGRAMMATIC ACCESS TOKEN CARRYOVER_APP_TOKEN
  ROLE_RESTRICTION = 'CARRYOVER_HELP_ROLE'
  DAYS_TO_EXPIRY = 90
  COMMENT = 'Carryover help assistant';

-- 7. Then select just this line and run it: it prints the account URL for SNOWFLAKE_ACCOUNT_URL.
-- SELECT 'https://' || LOWER(REPLACE(CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME(), '_', '-')) || '.snowflakecomputing.com' AS ACCOUNT_URL;

-- OPTIONAL, accounts with AI functions only: search with Cortex Search instead of the SQL query.
-- Run this block, set SNOWFLAKE_CORTEX_SEARCH=true in .env.local, then `npm run help:sync`.
--
-- ALTER TABLE CARRYOVER_HELP.APP.HELP_ARTICLES SET CHANGE_TRACKING = TRUE;
-- CREATE OR REPLACE CORTEX SEARCH SERVICE CARRYOVER_HELP.APP.HELP_SEARCH
--   ON CONTENT WAREHOUSE = CARRYOVER_WH TARGET_LAG = '1 minute'
--   AS SELECT ARTICLE_ID, TITLE, CONTENT FROM CARRYOVER_HELP.APP.HELP_ARTICLES;
-- GRANT USAGE ON CORTEX SEARCH SERVICE CARRYOVER_HELP.APP.HELP_SEARCH TO ROLE CARRYOVER_HELP_ROLE;
