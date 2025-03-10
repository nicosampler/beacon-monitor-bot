-- Check the size of the tables
SELECT 
    table_name,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size,
    pg_size_pretty(pg_relation_size(quote_ident(table_name))) as table_size,
    pg_size_pretty(pg_total_relation_size(quote_ident(table_name)) - pg_relation_size(quote_ident(table_name))) as index_size
FROM 
    (SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public') AS all_tables
ORDER BY 
    pg_total_relation_size(quote_ident(table_name)) DESC;
    
-- Check the indexes on a table
SELECT
    tablename,
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    schemaname = 'public'
    AND tablename = 'Committee'
ORDER BY
    indexname;
   
-- Reindex the Committee table 
REINDEX TABLE "Committee";

-- Reindex the primary key index of the Committee table 
REINDEX INDEX "Committee_pkey";
   
-- Vacuum a table
VACUUM "Committee";