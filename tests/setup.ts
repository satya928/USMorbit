process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://orbit:orbit@localhost:5432/orbit_test";
process.env.STORAGE_DIR = process.env.TEST_STORAGE_DIR ?? "./storage-test";
process.env.AI_API_KEY = "";
