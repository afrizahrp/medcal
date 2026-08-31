// Runs in every test worker BEFORE any test module (and therefore before
// `@medcal/db` constructs the Prisma client). Fail-closed: throws unless
// TEST_DATABASE_URL points at a dedicated test database.
import "./src/testing/register";
