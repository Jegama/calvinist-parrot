CREATE DATABASE calvinist_parrot_shadow;
CREATE DATABASE calvinist_parrot_test;

\connect calvinist_parrot_dev
CREATE EXTENSION IF NOT EXISTS vector;

\connect calvinist_parrot_shadow
CREATE EXTENSION IF NOT EXISTS vector;

\connect calvinist_parrot_test
CREATE EXTENSION IF NOT EXISTS vector;
