SELECT 
    u.username,
    COUNT(v.id) as validator_count
FROM "User" u
LEFT JOIN "_UserToValidator" uv ON u.id = uv."A"
LEFT JOIN "Validator" v ON v.id = uv."B" --AND v.status = 2
where u."hasBlockedBot" = true
GROUP BY u.id, u.username
ORDER BY validator_count DESC;