export function locationFilters(query, user) {
    console.log('user: ', user);
    const whereQueryData = {
        columns: ["status"],
        relations: ["!="],
        values: ["ARCHIVED"],
        or: []
    };
    if (query.search_string?.trim()) {
        const search = query.search_string.trim();
        whereQueryData.columns.push("name");
        whereQueryData.relations.push("contains");
        whereQueryData.values.push(search);
    }
    if (query.status) {
        whereQueryData.columns.push("status");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.status);
    }
    if (query.location_id) {
        whereQueryData.or.push({
            columns: ["user_id", "created_by"],
            relations: ["=", "="],
            values: [query.location_id, query.location_id],
        });
    }
    if (user?.id) {
        whereQueryData.or.push({
            columns: ["user_id", "created_by"],
            relations: ["=", "="],
            values: [user.id, user.id],
        });
    }
    if (query.field_id) {
        whereQueryData.columns.push("id");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.field_id);
    }
    return whereQueryData;
}
