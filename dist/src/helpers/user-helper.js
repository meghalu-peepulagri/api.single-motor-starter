export function userFilters(query) {
    const whereQueryData = {
        columns: ["status", "user_type"],
        relations: ["!=", "!="],
        values: ["ARCHIVED", "ADMIN"],
        or: []
    };
    if (query.search_string?.trim()) {
        const search = query.search_string.trim();
        whereQueryData.or.push({
            columns: ["full_name", "email", "phone"],
            relations: ["contains", "contains", "contains"],
            values: [search, search, search],
        });
    }
    if (query.status) {
        whereQueryData.columns.push("status");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.status);
    }
    return whereQueryData;
}
