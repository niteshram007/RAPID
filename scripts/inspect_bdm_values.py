from backend.app.postgres import open_database_connection, ensure_postgres_schema

ensure_postgres_schema()
with open_database_connection(require=True) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            select distinct coalesce(trim(bdm),'') as bdm
            from rapid_revenue_records r
            join rapid_revenue_uploads u on u.id=r.upload_id
            where u.is_active=true
            order by 1
            limit 200
            """
        )
        rapid = [row["bdm"] for row in cur.fetchall()]

        cur.execute(
            """
            select distinct coalesce(trim(bdm),'') as bdm
            from financial_records r
            join financial_workbook_uploads u on u.id=r.upload_id
            where u.is_active=true
            order by 1
            limit 200
            """
        )
        fin = [row["bdm"] for row in cur.fetchall()]

print('rapid count', len(rapid))
print('rapid sample', rapid[:80])
print('financial count', len(fin))
print('financial sample', fin[:80])