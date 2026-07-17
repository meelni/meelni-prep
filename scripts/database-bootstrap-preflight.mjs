const CATALOG_INSPECTION_ERROR =
  "Database preflight could not inspect bootstrap catalog";

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * @param {unknown} catalog
 * @returns {{ status: "ledger_present" } | { status: "ready_for_clean_bootstrap" }}
 */
export function classifyDatabaseBootstrapCatalog(catalog) {
  if (
    !catalog ||
    typeof catalog !== "object" ||
    typeof catalog.migration_ledger_present !== "boolean" ||
    !isNonnegativeInteger(catalog.public_application_relations) ||
    !isNonnegativeInteger(catalog.public_application_objects)
  ) {
    throw new Error(CATALOG_INSPECTION_ERROR);
  }

  if (catalog.migration_ledger_present) {
    return { status: "ledger_present" };
  }

  if (
    catalog.public_application_relations === 0 &&
    catalog.public_application_objects === 0
  ) {
    return { status: "ready_for_clean_bootstrap" };
  }

  throw new Error(
    "Migration ledger is absent but the public application schema is not empty; refusing clean bootstrap"
  );
}

/**
 * Inspect only catalog metadata. The caller owns the read-only transaction.
 *
 * @param {Function} tx
 * @returns {Promise<{ status: "ledger_present" } | { status: "ready_for_clean_bootstrap" }>}
 */
export async function inspectDatabaseBootstrapState(tx) {
  let rows;
  try {
    rows = await tx`
      WITH public_application_relations AS (
        SELECT relation.oid
        FROM pg_class relation
        JOIN pg_namespace namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1
            FROM pg_depend extension_dependency
            WHERE extension_dependency.classid = 'pg_class'::regclass
              AND extension_dependency.objid = relation.oid
              AND extension_dependency.deptype = 'e'
          )
      ), public_application_objects AS (
        SELECT DISTINCT
          namespace_dependency.classid,
          namespace_dependency.objid,
          namespace_dependency.objsubid
        FROM pg_depend namespace_dependency
        JOIN pg_namespace namespace
          ON namespace_dependency.refclassid = 'pg_namespace'::regclass
          AND namespace_dependency.refobjid = namespace.oid
        WHERE namespace.nspname = 'public'
          AND namespace_dependency.deptype = 'n'
          AND namespace_dependency.classid <> 'pg_extension'::regclass
          AND NOT EXISTS (
            SELECT 1
            FROM pg_depend extension_dependency
            WHERE extension_dependency.classid = namespace_dependency.classid
              AND extension_dependency.objid = namespace_dependency.objid
              AND extension_dependency.deptype = 'e'
          )
      )
      SELECT
        to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
          AS migration_ledger_present,
        (SELECT count(*)::int FROM public_application_relations)
          AS public_application_relations,
        (SELECT count(*)::int FROM public_application_objects)
          AS public_application_objects
    `;
  } catch {
    throw new Error(CATALOG_INSPECTION_ERROR);
  }

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(CATALOG_INSPECTION_ERROR);
  }

  return classifyDatabaseBootstrapCatalog(rows[0]);
}
