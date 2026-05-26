export function getPaginationData(page, pageSize, totalRecords) {
    const limit = pageSize ? +pageSize : 10;
    const totalPages = Math.ceil(totalRecords / limit);
    return {
        total_records: Number(totalRecords),
        total_pages: totalPages,
        page_size: limit,
        current_page: page,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
    };
}
export function getPaginationOffParams(query) {
    const page = +query.page || 1;
    const pageSize = +query.page_size || 10;
    const offset = (page - 1) * pageSize;
    return { page, pageSize, offset };
}
