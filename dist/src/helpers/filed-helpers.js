export function fieldFilters(query) {
    const whereQueryData = {
        columns: ["status"],
        relations: ["!="],
        values: ["ARCHIVED"],
        or: []
    };
    if (query.search_string?.trim()) {
        const search = query.search_string.trim();
        whereQueryData.or.push({
            columns: ["name"],
            relations: ["contains"],
            values: [search],
        });
    }
    if (query.status) {
        whereQueryData.columns.push("status");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.status);
    }
    if (query.created_by) {
        whereQueryData.columns.push("created_by");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.created_by);
    }
    if (query.location_id) {
        whereQueryData.columns.push("location_id");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.location_id);
    }
    if (query.field_id) {
        whereQueryData.columns.push("id");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.field_id);
    }
    return whereQueryData;
}
