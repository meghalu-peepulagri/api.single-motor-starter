export function checkDuplicateMotorTitles(motors) {
    if (!Array.isArray(motors))
        return [];
    const titles = motors.map(m => (m?.name ?? "").toString().toLowerCase());
    const duplicateIndexes = [];
    for (let i = 0; i < titles.length; i++) {
        if (titles.indexOf(titles[i]) !== i) {
            duplicateIndexes.push(i);
        }
    }
    return duplicateIndexes;
}
export function motorFilters(query, user) {
    const whereQueryData = {
        columns: ["status"],
        relations: ["!="],
        values: ["ARCHIVED"],
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
    if (user.id) {
        whereQueryData.columns.push("created_by");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(user.id);
    }
    if (query.location_id) {
        whereQueryData.columns.push("location_id");
        whereQueryData.relations.push("=");
        whereQueryData.values.push(query.location_id);
    }
    return whereQueryData;
}
