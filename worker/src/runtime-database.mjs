// Validate the connection as pg will consume it, before opening a connection.
export function rejectConnectionOverrides(url) {
 if([...url.searchParams.keys()].some(key=>!['sslmode','sslrootcert','channel_binding'].includes(key)))
  throw Error('Database connection overrides are not permitted');
}
export async function verifyRuntimeIdentity(client,expectedRole) {
 const row=(await client.query("SELECT current_database() AS database_name,current_user AS runtime_role,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,EXISTS(SELECT 1 FROM pg_roles privileged WHERE privileged.oid<>r.oid AND (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolreplication OR privileged.rolname='neon_superuser') AND pg_has_role(r.oid,privileged.oid,'MEMBER')) AS privileged_membership FROM pg_roles r WHERE r.rolname=current_user")).rows[0];
 if(row?.database_name!=='neondb'||row?.runtime_role!==expectedRole||
  ['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','privileged_membership'].some(flag=>row[flag]!==false))
  throw Error('Restricted Kota database identity check failed');
}
